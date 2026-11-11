import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchUpstream } from "../upstream";
import {
  EPISODE_BUCKETS,
  partDir,
  readPartMeta,
  refreshParts,
  VOD_FILES,
  type IngestProgress,
  type PartEpisode,
  type PartMeta,
  type PartMovie,
  type PartSeries,
} from "./ingest";
import { bucketOf, serverOf, slug, stripAccents } from "./parse";
import type {
  Facet,
  VodKind,
  VodMovie,
  VodPage,
  VodSeries,
  VodSeriesDetail,
  VodSource,
  VodStatus,
} from "./types";

/* ------------------------------------------------------------------ */
/* Configuração                                                        */
/* ------------------------------------------------------------------ */

const ROOT = process.env.VOD_DATA_DIR ?? path.join(process.cwd(), ".data", "vod");
/** Intervalo para conferir se as listas mudaram (ETag) */
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
/** Intervalo da checagem de saúde dos servidores */
const HEALTH_EVERY_MS = 20 * 60 * 1000;
/** Tempo máximo que uma consulta espera pela 1ª checagem de saúde */
const FIRST_HEALTH_WAIT_MS = 20_000;
export const PAGE_SIZE = 48;

/* ------------------------------------------------------------------ */
/* Estado (em globalThis: compartilhado entre rotas e recargas em dev)  */
/* ------------------------------------------------------------------ */

interface MovieRec extends VodMovie {
  srcServers: string[]; // servidor de cada fonte (mesma ordem de sources)
  order: number;
  search: string;
}

interface SeriesRec extends VodSeries {
  key: string;
  servers: string[];
  order: number;
  search: string;
}

interface MergedIndex {
  movies: MovieRec[];
  series: SeriesRec[];
  seriesById: Map<string, SeriesRec>;
  builtAt: string;
  samples: PartMeta["samples"];
}

interface HealthEntry {
  ok: boolean;
  checkedAt: number;
}

interface VodState {
  index: MergedIndex | null;
  loading: Promise<void> | null;
  refreshing: Promise<void> | null;
  lastRefreshAt: number;
  progress: IngestProgress | null;
  error: string | null;
  health: Map<string, HealthEntry>;
  healthCheckedAt: number;
  healthing: Promise<void> | null;
}

const KEY = Symbol.for("ajactv.vod.state");
const g = globalThis as unknown as { [KEY]?: VodState };
const state: VodState = (g[KEY] ??= {
  index: null,
  loading: null,
  refreshing: null,
  lastRefreshAt: 0,
  progress: null,
  error: null,
  health: new Map(),
  healthCheckedAt: 0,
  healthing: null,
});

const hk = (server: string, kind: VodKind) => `${server}|${kind}`;
const searchText = (s: string) => stripAccents(s).toLowerCase();

/* ------------------------------------------------------------------ */
/* Carga e mescla das partes                                           */
/* ------------------------------------------------------------------ */

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadIndex(): Promise<void> {
  const movies: MovieRec[] = [];
  const byTitle = new Map<string, MovieRec[]>();
  const seriesByKey = new Map<string, SeriesRec>();
  const samples: PartMeta["samples"] = [];
  let builtAt = "";
  let order = 0;
  let found = 0;

  for (const file of VOD_FILES) {
    const dir = partDir(ROOT, file);
    const meta = await readPartMeta(ROOT, file);
    if (!meta) continue;
    found++;
    if (meta.builtAt > builtAt) builtAt = meta.builtAt;
    samples.push(...meta.samples);

    const partMovies = (await readJson<PartMovie[]>(path.join(dir, "movies.json"))) ?? [];
    const base = order;
    for (const pm of partMovies) {
      const sources: VodSource[] = pm.s.map(([url, label]) => ({ url, label }));
      const servers = pm.s.map(([url]) => serverOf(url));
      const candidates = byTitle.get(pm.k) ?? [];
      // Mesmo título: junta se o ano bate ou se um dos lados não tem ano
      const match = candidates.find((c) => c.year === pm.y || c.year === null || pm.y === null);
      if (match) {
        match.year ??= pm.y;
        match.poster ??= pm.p;
        for (const genre of pm.g) if (!match.genres.includes(genre)) match.genres.push(genre);
        sources.forEach((s, i) => {
          if (!match.sources.some((x) => x.url === s.url)) {
            match.sources.push(s);
            match.srcServers.push(servers[i]);
          }
        });
        continue;
      }
      const rec: MovieRec = {
        id: "",
        title: pm.t,
        year: pm.y,
        poster: pm.p,
        genres: [...pm.g],
        sources,
        srcServers: servers,
        order: base + pm.o,
        search: searchText(pm.t),
      };
      movies.push(rec);
      candidates.push(rec);
      byTitle.set(pm.k, candidates);
    }

    const partSeries = (await readJson<PartSeries[]>(path.join(dir, "series.json"))) ?? [];
    for (const ps of partSeries) {
      const cur = seriesByKey.get(ps.k);
      if (cur) {
        cur.year ??= ps.y;
        cur.poster ??= ps.p;
        if (cur.platform === "Outras" && ps.pf !== "Outras") cur.platform = ps.pf;
        cur.episodes = Math.max(cur.episodes, ps.n);
        cur.seasons = Math.max(cur.seasons, ps.ss);
        for (const sv of ps.sv) if (!cur.servers.includes(sv)) cur.servers.push(sv);
        continue;
      }
      seriesByKey.set(ps.k, {
        id: "",
        key: ps.k,
        title: ps.t,
        year: ps.y,
        poster: ps.p,
        platform: ps.pf,
        seasons: ps.ss,
        episodes: ps.n,
        servers: [...ps.sv],
        order: base + ps.o,
        search: searchText(ps.t),
      });
    }
    order = base + Math.max(partMovies.length, partSeries.length) + 1;
  }

  if (found === 0) return;

  // ids estáveis e únicos
  const used = new Set<string>();
  const uniqueId = (title: string, year: number | null) => {
    const baseId = slug(year ? `${title} ${year}` : title);
    let id = baseId;
    for (let n = 2; used.has(id); n++) id = `${baseId}-${n}`;
    used.add(id);
    return id;
  };
  movies.forEach((m) => (m.id = uniqueId(m.title, m.year)));
  used.clear();
  const series = [...seriesByKey.values()];
  series.forEach((s) => (s.id = uniqueId(s.title, null)));

  state.index = {
    movies,
    series,
    seriesById: new Map(series.map((s) => [s.id, s])),
    builtAt,
    samples,
  };
}

async function ensureLoaded() {
  if (!state.index && !state.loading) {
    state.loading = loadIndex().finally(() => (state.loading = null));
  }
  await state.loading;
}

/* ------------------------------------------------------------------ */
/* Atualização em segundo plano                                        */
/* ------------------------------------------------------------------ */

function startRefresh() {
  if (state.refreshing) return state.refreshing;
  state.error = null;
  state.refreshing = (async () => {
    try {
      const changed = await refreshParts(ROOT, (p) => (state.progress = p));
      state.lastRefreshAt = Date.now();
      if (changed || !state.index) {
        await loadIndex();
        state.healthCheckedAt = 0; // novas URLs: checa de novo
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      console.error("[vod] falha ao atualizar o índice:", err);
    } finally {
      state.progress = null;
      state.refreshing = null;
    }
  })();
  return state.refreshing;
}

/* ------------------------------------------------------------------ */
/* Saúde dos servidores                                                */
/* ------------------------------------------------------------------ */

async function probe(url: string): Promise<boolean> {
  try {
    const { res, finalUrl } = await fetchUpstream(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Range: "bytes=0-1023" },
    });
    await res.body?.cancel();
    const type = res.headers.get("content-type") ?? "";
    return (
      (res.status === 200 || res.status === 206) &&
      !/bloquead|blocked|suspend/i.test(finalUrl.href) &&
      /video|octet-stream|matroska|mp4/i.test(type)
    );
  } catch {
    return false;
  }
}

function startHealthCheck() {
  if (state.healthing || !state.index) return state.healthing;
  const samples = state.index.samples;
  state.healthing = (async () => {
    // agrupa as amostras de todas as partes por servidor+tipo
    const byKey = new Map<string, string[]>();
    for (const s of samples) {
      const key = hk(s.server, s.kind);
      byKey.set(key, [...(byKey.get(key) ?? []), ...s.urls]);
    }
    await Promise.all(
      [...byKey].map(async ([key, urls]) => {
        const picks = urls.filter((_, i) => i % Math.ceil(urls.length / 4 || 1) === 0).slice(0, 4);
        const results = await Promise.all(picks.map(probe));
        const okCount = results.filter(Boolean).length;
        state.health.set(key, { ok: okCount >= Math.ceil(picks.length / 2), checkedAt: Date.now() });
      }),
    );
    state.healthCheckedAt = Date.now();
  })().finally(() => (state.healthing = null));
  return state.healthing;
}

function serverOk(server: string, kind: VodKind) {
  return state.health.get(hk(server, kind))?.ok ?? false;
}

/* ------------------------------------------------------------------ */
/* Ponto de entrada: garante índice e saúde atualizados                */
/* ------------------------------------------------------------------ */

async function prepare(): Promise<MergedIndex | null> {
  await ensureLoaded();
  if (!state.index || Date.now() - state.lastRefreshAt > REFRESH_EVERY_MS) void startRefresh();
  if (!state.index) return null;

  if (Date.now() - state.healthCheckedAt > HEALTH_EVERY_MS) {
    const pending = startHealthCheck();
    // Na primeira vez, espera a checagem para não mostrar itens fora do ar
    if (state.healthCheckedAt === 0 && pending) {
      await Promise.race([pending, new Promise((r) => setTimeout(r, FIRST_HEALTH_WAIT_MS))]);
    }
  }
  return state.index;
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

function availableMovie(m: MovieRec): VodMovie | null {
  const sources = m.sources.filter((_, i) => serverOk(m.srcServers[i], "movie"));
  if (sources.length === 0) return null;
  return { id: m.id, title: m.title, year: m.year, poster: m.poster, genres: m.genres, sources };
}

function seriesAvailable(s: SeriesRec) {
  return s.servers.some((sv) => serverOk(sv, "series"));
}

function toSeries(s: SeriesRec): VodSeries {
  const { id, title, year, poster, platform, seasons, episodes } = s;
  return { id, title, year, poster, platform, seasons, episodes };
}

function matchesQuery(text: string, q: string) {
  const terms = searchText(q).split(/\s+/).filter(Boolean);
  return terms.every((t) => text.includes(t));
}

function facetsOf(values: string[][]): Facet[] {
  const counts = new Map<string, number>();
  for (const list of values) for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}

export type VodSort = "destaques" | "recentes" | "az";

function sortBy<T extends { order: number; year: number | null; title: string }>(list: T[], sort: VodSort) {
  if (sort === "az") return list.sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { numeric: true }));
  if (sort === "recentes") return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.order - b.order);
  return list.sort((a, b) => a.order - b.order);
}

export async function queryMovies(opts: {
  q?: string;
  genre?: string;
  sort?: VodSort;
  page?: number;
  pageSize?: number;
}): Promise<VodPage<VodMovie>> {
  const index = await prepare();
  const pageSize = Math.min(opts.pageSize ?? PAGE_SIZE, 120);
  const page = Math.max(1, opts.page ?? 1);
  if (!index) return { items: [], total: 0, page, pageSize, facets: [], status: getStatus() };

  let pool = index.movies.filter((m) => m.srcServers.some((sv) => serverOk(sv, "movie")));
  if (opts.q) pool = pool.filter((m) => matchesQuery(m.search, opts.q!));
  const facets = facetsOf(pool.map((m) => m.genres));
  if (opts.genre) pool = pool.filter((m) => m.genres.includes(opts.genre!));
  sortBy(pool, opts.sort ?? "destaques");

  const items = pool
    .slice((page - 1) * pageSize, page * pageSize)
    .map(availableMovie)
    .filter((m): m is VodMovie => !!m);
  return { items, total: pool.length, page, pageSize, facets, status: getStatus() };
}

export async function querySeries(opts: {
  q?: string;
  platform?: string;
  sort?: VodSort;
  page?: number;
  pageSize?: number;
}): Promise<VodPage<VodSeries>> {
  const index = await prepare();
  const pageSize = Math.min(opts.pageSize ?? PAGE_SIZE, 120);
  const page = Math.max(1, opts.page ?? 1);
  if (!index) return { items: [], total: 0, page, pageSize, facets: [], status: getStatus() };

  let pool = index.series.filter(seriesAvailable);
  if (opts.q) pool = pool.filter((s) => matchesQuery(s.search, opts.q!));
  const facets = facetsOf(pool.map((s) => [s.platform]));
  if (opts.platform) pool = pool.filter((s) => s.platform === opts.platform);
  sortBy(pool, opts.sort ?? "destaques");

  const items = pool.slice((page - 1) * pageSize, page * pageSize).map(toSeries);
  return { items, total: pool.length, page, pageSize, facets, status: getStatus() };
}

export async function getMovie(id: string): Promise<VodMovie | null> {
  const index = await prepare();
  const rec = index?.movies.find((m) => m.id === id);
  return rec ? availableMovie(rec) : null;
}

export async function getSeriesDetail(id: string): Promise<VodSeriesDetail | null> {
  const index = await prepare();
  const rec = index?.seriesById.get(id);
  if (!rec) return null;

  const bucket = bucketOf(rec.key, EPISODE_BUCKETS);
  // temporada → episódio → fontes
  const seasons = new Map<number, Map<number, VodSource[]>>();
  for (const file of VOD_FILES) {
    const data = await readJson<Record<string, PartEpisode[]>>(
      path.join(partDir(ROOT, file), "episodes", `b${bucket}.json`),
    );
    for (const [season, episode, url, label] of data?.[rec.key] ?? []) {
      if (!serverOk(serverOf(url), "series")) continue;
      let eps = seasons.get(season);
      if (!eps) seasons.set(season, (eps = new Map()));
      const list = eps.get(episode) ?? [];
      if (!list.some((s) => s.url === url)) list.push({ url, label: list.some((s) => s.label === label) ? `${label} ${list.length + 1}` : label });
      eps.set(episode, list);
    }
  }

  const seasonList = [...seasons]
    .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map(([season, eps]) => ({
      season,
      episodes: [...eps]
        .sort(([a], [b]) => a - b)
        .map(([episode, sources]) => ({ season, episode, sources })),
    }));

  return {
    ...toSeries(rec),
    seasons: seasonList.filter((s) => s.season > 0).length || seasonList.length,
    episodes: seasonList.reduce((n, s) => n + s.episodes.length, 0),
    seasonList,
  };
}

export async function searchVod(q: string, limit = 12) {
  const [movies, series] = await Promise.all([
    queryMovies({ q, pageSize: limit }),
    querySeries({ q, pageSize: limit }),
  ]);
  return {
    movies: movies.items,
    moviesTotal: movies.total,
    series: series.items,
    seriesTotal: series.total,
    status: getStatus(),
  };
}

export function getStatus(): VodStatus {
  const index = state.index;
  const servers = new Map<string, { server: string; kind: VodKind; ok: boolean; items: number }>();
  let moviesAvailable = 0;
  let seriesAvailable = 0;

  if (index) {
    for (const m of index.movies) {
      let any = false;
      m.srcServers.forEach((sv) => {
        const key = hk(sv, "movie");
        const ok = serverOk(sv, "movie");
        const e = servers.get(key) ?? { server: sv, kind: "movie" as const, ok, items: 0 };
        e.items++;
        servers.set(key, e);
        any ||= ok;
      });
      if (any) moviesAvailable++;
    }
    for (const s of index.series) {
      let any = false;
      for (const sv of s.servers) {
        const key = hk(sv, "series");
        const ok = serverOk(sv, "series");
        const e = servers.get(key) ?? { server: sv, kind: "series" as const, ok, items: 0 };
        e.items++;
        servers.set(key, e);
        any ||= ok;
      }
      if (any) seriesAvailable++;
    }
  }

  return {
    state: state.refreshing ? "building" : state.error && !index ? "error" : index ? "ready" : "idle",
    ready: !!index,
    builtAt: index?.builtAt ?? null,
    progress: state.progress,
    error: state.error,
    counts: {
      movies: index?.movies.length ?? 0,
      series: index?.series.length ?? 0,
      moviesAvailable,
      seriesAvailable,
    },
    health: {
      checkedAt: state.healthCheckedAt ? new Date(state.healthCheckedAt).toISOString() : null,
      checking: !!state.healthing,
      servers: [...servers.values()].sort((a, b) => b.items - a.items),
    },
  };
}

/** Status sem bloquear: dispara carga/atualização se preciso */
export async function vodStatus(): Promise<VodStatus> {
  await prepare();
  return getStatus();
}
