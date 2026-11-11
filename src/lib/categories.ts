import type { CategoryId } from "./types";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  short: string;
  description: string;
  /** Cor de destaque usada nos cards da categoria */
  tint: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: "esportes",
    label: "Esportes",
    short: "Esportes",
    description: "Futebol, lutas, Libertadores, NBA e muito mais ao vivo.",
    tint: "#2f8f4e",
  },
  {
    id: "filmes",
    label: "Filmes & Séries",
    short: "Filmes",
    description: "HBO, Telecine, Cine Sky e os principais canais de cinema.",
    tint: "#8a2f3b",
  },
  {
    id: "noticias",
    label: "Notícias",
    short: "Notícias",
    description: "Jornalismo 24 horas, economia e informação em tempo real.",
    tint: "#2c5a8f",
  },
  {
    id: "infantil",
    label: "Infantil",
    short: "Infantil",
    description: "Desenhos e programação para a criançada.",
    tint: "#c26a1d",
  },
  {
    id: "documentarios",
    label: "Documentários",
    short: "Docs",
    description: "Discovery, History, natureza, ciência e viagens.",
    tint: "#4f6b2a",
  },
  {
    id: "abertos",
    label: "TV Aberta",
    short: "Abertos",
    description: "Globo, SBT, Record, Band, RedeTV e afiliadas.",
    tint: "#6b4a9a",
  },
  {
    id: "variedades",
    label: "Variedades",
    short: "Variedades",
    description: "Novelas, realities, culinária, estilo de vida e entretenimento.",
    tint: "#9a3f7a",
  },
  {
    id: "musica",
    label: "Música",
    short: "Música",
    description: "Clipes, shows e canais musicais.",
    tint: "#1f7a7a",
  },
  {
    id: "religiosos",
    label: "Religiosos",
    short: "Religiosos",
    description: "Programação religiosa e de fé.",
    tint: "#7a6a2a",
  },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryDef>;

export function isCategoryId(value: string): value is CategoryId {
  return value in CATEGORY_MAP;
}
