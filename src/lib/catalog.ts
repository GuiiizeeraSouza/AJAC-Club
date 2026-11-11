import "server-only";
import { cacheLife } from "next/cache";
import { buildChannels, parseM3U, type M3UEntry } from "./m3u";
import type { Catalog } from "./types";

const REPO_RAW = "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master";

/**
 * Listas de canais ao vivo do repositório Ramys/Iptv-Brasil-2026.
 * Os arquivos maiores (CanaisBR01/02/04, Filmes-Series) contêm sobretudo VOD
 * e têm 60–90 MB, por isso não são carregados aqui.
 * Pode ser sobrescrito com PLAYLIST_URLS (URLs separadas por vírgula).
 */
const DEFAULT_PLAYLISTS = [`${REPO_RAW}/Canais.m3u8`, `${REPO_RAW}/CanaisBR03.m3u8`];

function playlistUrls(): string[] {
  const fromEnv = process.env.PLAYLIST_URLS?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_PLAYLISTS;
}

async function fetchPlaylist(url: string): Promise<M3UEntry[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  return parseM3U(await res.text());
}

export async function getCatalog(): Promise<Catalog> {
  "use cache";
  // Revalida a lista a cada 10 min em segundo plano (sempre servindo a versão em cache)
  cacheLife({ stale: 120, revalidate: 600, expire: 86_400 });

  const urls = playlistUrls();
  const results = await Promise.allSettled(urls.map(fetchPlaylist));

  const entries: M3UEntry[] = [];
  const loaded: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      entries.push(...r.value);
      loaded.push(urls[i].split("/").pop() ?? urls[i]);
    } else {
      console.error("[catalog]", r.reason);
    }
  });

  const channels = buildChannels(entries);
  if (channels.length === 0) {
    // Lança para não guardar um catálogo vazio em cache por horas.
    throw new Error("Não foi possível carregar nenhuma lista de canais.");
  }

  return { channels, updatedAt: new Date().toISOString(), sourceFiles: loaded };
}
