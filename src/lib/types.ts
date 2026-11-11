export type CategoryId =
  | "esportes"
  | "filmes"
  | "noticias"
  | "infantil"
  | "documentarios"
  | "abertos"
  | "variedades"
  | "musica"
  | "religiosos";

export interface StreamSource {
  /** Rótulo curto de qualidade, ex.: "FHD", "HD 2", "H.265" */
  label: string;
  url: string;
}

export interface Channel {
  /** Identificador estável (slug do nome normalizado) */
  id: string;
  name: string;
  logo: string | null;
  category: CategoryId;
  /** Grupo original da lista M3U, útil como "tag" */
  group: string;
  sources: StreamSource[];
}

export interface Catalog {
  channels: Channel[];
  updatedAt: string;
  sourceFiles: string[];
}
