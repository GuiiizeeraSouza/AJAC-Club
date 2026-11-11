/** Tipos compartilhados (servidor e cliente) do catálogo sob demanda */

export type VodKind = "movie" | "series";

export interface VodSource {
  url: string;
  /** "Dublado", "Legendado", "4K", "Padrão"… */
  label: string;
}

export interface VodMovie {
  id: string;
  title: string;
  year: number | null;
  poster: string | null;
  genres: string[];
  sources: VodSource[];
}

export interface VodSeries {
  id: string;
  title: string;
  year: number | null;
  poster: string | null;
  platform: string;
  seasons: number;
  episodes: number;
}

export interface VodEpisode {
  season: number;
  episode: number;
  sources: VodSource[];
}

export interface VodSeason {
  season: number;
  episodes: VodEpisode[];
}

export interface VodSeriesDetail extends VodSeries {
  seasonList: VodSeason[];
}

export type VodBuildState = "idle" | "building" | "ready" | "error";

export interface VodStatus {
  state: VodBuildState;
  /** Há um índice utilizável (mesmo que uma atualização esteja em andamento) */
  ready: boolean;
  builtAt: string | null;
  progress: {
    file: string;
    fileIndex: number;
    fileCount: number;
    bytes: number;
    totalBytes: number | null;
  } | null;
  error: string | null;
  counts: {
    movies: number;
    series: number;
    moviesAvailable: number;
    seriesAvailable: number;
  };
  health: {
    checkedAt: string | null;
    checking: boolean;
    servers: { server: string; kind: VodKind; ok: boolean; items: number }[];
  };
}

export interface Facet {
  name: string;
  count: number;
}

export interface VodPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facet[];
  status: VodStatus;
}
