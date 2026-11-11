/**
 * Indexador das listas VOD (filmes e séries).
 *
 * Cada arquivo M3U (até ~95 MB) é baixado em streaming e processado linha a
 * linha, gerando uma "parte" em disco:
 *   parts/<arquivo>/meta.json      – ETag, contagens e URLs de amostra por servidor
 *   parts/<arquivo>/movies.json    – filmes (já agrupados dentro do arquivo)
 *   parts/<arquivo>/series.json    – resumo das séries
 *   parts/<arquivo>/episodes/bN.json – episódios, em baldes por hash da série
 *
 * Sem dependências do Next: também roda via `npm run vod:index`.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  bucketOf,
  cleanTitle,
  isAdult,
  kindFromUrl,
  labelForGroup,
  movieGenres,
  normKey,
  parseEpisode,
  serverOf,
  seriesPlatform,
} from "./parse";

export const REPO_RAW = "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master";

/** Arquivos do repositório que contêm filmes e/ou séries */
export const VOD_FILES = [
  "Filmes-Series.m3u8",
  "CanaisBR01.m3u8",
  "CanaisBR02.m3u8",
  "CanaisBR04.m3u8",
  "CanaisIPTV.m3u8",
];

export const EPISODE_BUCKETS = 128;
const SAMPLES_PER_SERVER = 6;

export interface PartMovie {
  /** chave de agrupamento (título normalizado) */
  k: string;
  t: string;
  y: number | null;
  p: string | null;
  g: string[];
  /** [url, rótulo] */
  s: [string, string][];
  /** ordem de aparição no arquivo (as listas costumam vir das mais novas) */
  o: number;
}

export interface PartSeries {
  k: string;
  t: string;
  y: number | null;
  p: string | null;
  pf: string;
  /** episódios e temporadas */
  n: number;
  ss: number;
  /** servidores que hospedam os episódios */
  sv: string[];
  o: number;
}

/** [temporada, episódio, url, rótulo] */
export type PartEpisode = [number, number, string, string];

export interface PartMeta {
  file: string;
  etag: string | null;
  builtAt: string;
  movies: number;
  series: number;
  episodes: number;
  skipped: number;
  samples: { server: string; kind: "movie" | "series"; urls: string[] }[];
}

export interface IngestProgress {
  file: string;
  fileIndex: number;
  fileCount: number;
  bytes: number;
  totalBytes: number | null;
}

export function partDir(root: string, file: string) {
  return path.join(root, "parts", file.replace(/\.m3u8?$/i, ""));
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function extinf(line: string) {
  let name = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      name = line.slice(i + 1).trim();
      break;
    }
  }
  let logo: string | null = null;
  let group = "";
  let tvgName = "";
  for (const m of line.matchAll(ATTR_RE)) {
    const key = m[1].toLowerCase();
    if (key === "tvg-logo") logo = m[2].trim() || null;
    else if (key === "group-title") group = m[2].trim();
    else if (key === "tvg-name") tvgName = m[2].trim();
  }
  return { name: name || tvgName, logo, group };
}

/** Lê o corpo da resposta linha a linha, sem guardar o arquivo inteiro na memória */
async function forEachLine(res: Response, onLine: (line: string) => void, onBytes: (n: number) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onBytes(value.byteLength);
    buffer += decoder.decode(value, { stream: true });
    let start = 0;
    let idx: number;
    while ((idx = buffer.indexOf("\n", start)) >= 0) {
      onLine(buffer.slice(start, idx).trim());
      start = idx + 1;
    }
    buffer = buffer.slice(start);
  }
  buffer += decoder.decode();
  if (buffer.trim()) onLine(buffer.trim());
}

function isPoster(url: string) {
  return /w600_and_h900|\/w\d{3}\/|poster/i.test(url) && !/\/w300\//.test(url);
}

/** Baixa e processa um arquivo, gravando sua parte em disco */
export async function buildPart(
  root: string,
  file: string,
  res: Response,
  onBytes: (n: number) => void,
): Promise<PartMeta> {
  const movies = new Map<string, PartMovie>();
  const series = new Map<string, PartSeries & { seasonSet: Set<number> }>();
  const episodes = new Map<string, Map<string, PartEpisode>>();
  const samples = new Map<string, { server: string; kind: "movie" | "series"; urls: string[]; seen: number }>();
  let order = 0;
  let skipped = 0;
  let extras = 0;
  let pending: ReturnType<typeof extinf> | null = null;

  const sample = (server: string, kind: "movie" | "series", url: string) => {
    const key = `${server}|${kind}`;
    let s = samples.get(key);
    if (!s) samples.set(key, (s = { server, kind, urls: [], seen: 0 }));
    s.seen++;
    // amostragem espaçada (1ª, 100ª, 1000ª…) para cobrir partes diferentes do servidor
    if (s.urls.length < SAMPLES_PER_SERVER && (s.seen === 1 || s.seen % 997 === 0)) s.urls.push(url);
  };

  await forEachLine(
    res,
    (line) => {
      if (!line) return;
      if (line.startsWith("#EXTINF")) {
        pending = extinf(line);
        return;
      }
      if (line.startsWith("#") || !pending) return;
      const info: ReturnType<typeof extinf> = pending;
      pending = null;
      if (!/^https?:\/\//i.test(line)) return;

      const kind = kindFromUrl(line);
      if (!kind || isAdult(info.name, info.group)) {
        if (kind) skipped++;
        return;
      }
      const server = serverOf(line);
      order++;

      if (kind === "movie") {
        const c = cleanTitle(info.name);
        const label = c.label ?? labelForGroup(info.group) ?? "Padrão";
        const key = normKey(c.title);
        if (!key) return;
        const mapKey = `${key}:${c.year ?? ""}`;
        let m = movies.get(mapKey);
        if (!m) {
          m = { k: key, t: c.title, y: c.year, p: info.logo, g: [], s: [], o: order };
          movies.set(mapKey, m);
        } else if (!m.p && info.logo) {
          m.p = info.logo;
        }
        for (const g of movieGenres(info.group, c.label)) if (!m.g.includes(g)) m.g.push(g);
        if (!m.s.some(([u]) => u === line)) m.s.push([line, label]);
        sample(server, kind, line);
        return;
      }

      // Série: "Nome S01E02"; sem SxxEyy vira episódio extra (temporada 0)
      const ep = parseEpisode(info.name);
      const c = ep ?? { ...cleanTitle(info.name), season: 0, episode: ++extras };
      const key = normKey(c.title);
      if (!key) return;
      let s = series.get(key);
      if (!s) {
        s = {
          k: key,
          t: c.title,
          y: c.year,
          p: info.logo,
          pf: seriesPlatform(info.group),
          n: 0,
          ss: 0,
          sv: [],
          o: order,
          seasonSet: new Set(),
        };
        series.set(key, s);
      } else if (info.logo && (!s.p || (isPoster(info.logo) && !isPoster(s.p)))) {
        s.p = info.logo;
      }
      if (!s.y && c.year) s.y = c.year;
      if (!s.sv.includes(server)) s.sv.push(server);

      let eps = episodes.get(key);
      if (!eps) episodes.set(key, (eps = new Map()));
      const label = c.label ?? labelForGroup(info.group) ?? "Padrão";
      const epKey = `${c.season}:${c.episode}:${label}`;
      if (!eps.has(epKey)) {
        eps.set(epKey, [c.season, c.episode, line, label]);
        s.seasonSet.add(c.season);
      }
      sample(server, kind, line);
    },
    onBytes,
  );

  // Contagens finais das séries
  let episodeCount = 0;
  for (const [key, s] of series) {
    const eps = episodes.get(key);
    const unique = new Set([...(eps?.values() ?? [])].map(([se, e]) => `${se}:${e}`));
    s.n = unique.size;
    s.ss = [...s.seasonSet].filter((x) => x > 0).length || s.seasonSet.size;
    episodeCount += unique.size;
  }

  // Grava em diretório temporário e troca de uma vez
  const dir = partDir(root, file);
  const tmp = `${dir}.tmp`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(path.join(tmp, "episodes"), { recursive: true });

  await writeFile(path.join(tmp, "movies.json"), JSON.stringify([...movies.values()]));
  await writeFile(
    path.join(tmp, "series.json"),
    JSON.stringify(
      [...series.values()].map((s): PartSeries => ({
        k: s.k,
        t: s.t,
        y: s.y,
        p: s.p,
        pf: s.pf,
        n: s.n,
        ss: s.ss,
        sv: s.sv,
        o: s.o,
      })),
    ),
  );

  const buckets: Record<string, PartEpisode[]>[] = Array.from({ length: EPISODE_BUCKETS }, () => ({}));
  for (const [key, eps] of episodes) {
    buckets[bucketOf(key, EPISODE_BUCKETS)][key] = [...eps.values()];
  }
  await Promise.all(
    buckets.map((b, i) => writeFile(path.join(tmp, "episodes", `b${i}.json`), JSON.stringify(b))),
  );

  const meta: PartMeta = {
    file,
    etag: res.headers.get("etag"),
    builtAt: new Date().toISOString(),
    movies: movies.size,
    series: series.size,
    episodes: episodeCount,
    skipped,
    samples: [...samples.values()].map(({ server, kind, urls }) => ({ server, kind, urls })),
  };
  await writeFile(path.join(tmp, "meta.json"), JSON.stringify(meta));

  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  return meta;
}

export async function readPartMeta(root: string, file: string): Promise<PartMeta | null> {
  try {
    return JSON.parse(await readFile(path.join(partDir(root, file), "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Atualiza as partes: baixa apenas os arquivos cujo ETag mudou.
 * Retorna true se alguma parte foi reconstruída.
 */
export async function refreshParts(
  root: string,
  onProgress: (p: IngestProgress) => void,
  files = VOD_FILES,
): Promise<boolean> {
  let changed = false;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = `${process.env.VOD_REPO_RAW ?? REPO_RAW}/${file}`;
    const current = await readPartMeta(root, file);

    const res = await fetch(url, {
      cache: "no-store",
      headers: current?.etag ? { "If-None-Match": current.etag } : {},
    });
    if (res.status === 304) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status} ao baixar ${file}`);
    }

    const total = Number(res.headers.get("content-length")) || null;
    let bytes = 0;
    onProgress({ file, fileIndex: i, fileCount: files.length, bytes, totalBytes: total });
    let lastReport = 0;
    await buildPart(root, file, res, (n) => {
      bytes += n;
      const now = Date.now();
      if (now - lastReport > 250) {
        lastReport = now;
        onProgress({ file, fileIndex: i, fileCount: files.length, bytes, totalBytes: total });
      }
    });
    changed = true;
  }
  return changed;
}
