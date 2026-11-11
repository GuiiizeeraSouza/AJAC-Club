/**
 * Normalização dos nomes das listas VOD (sem dependências de Next/Node,
 * usado tanto pelo servidor quanto pelo script de indexação).
 */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave de comparação: minúsculas, sem acentos e sem pontuação */
export function normKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/&/g, "e").replace(/[^a-z0-9]+/g, "");
}

export function slug(s: string): string {
  return (
    stripAccents(s)
      .toLowerCase()
      .replace(/&/g, " e ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "titulo"
  );
}

const ADULT_RE = /adult|\+18|18\+|xxx|porn|erotic|hentai|sexy/i;
export function isAdult(name: string, group: string): boolean {
  return ADULT_RE.test(group) || /\bxxx\b|porn|hentai/i.test(name);
}

/* ------------------------------------------------------------------ */
/* Títulos                                                             */
/* ------------------------------------------------------------------ */

export interface CleanTitle {
  title: string;
  year: number | null;
  label: string | null;
}

const LABEL_MARKERS: [RegExp, string][] = [
  [/\s*\[(?:L|LEG)\]|\s*\((?:L|LEG|LEGENDADO)\)|\s+-?\s*LEGENDADO\b|\s+LEG\b\.?/gi, "Legendado"],
  [/\s*\[(?:D|DUB)\]|\s*\((?:DUB|DUBLADO)\)|\s+-?\s*DUBLADO\b|\s+DUB\b\.?/gi, "Dublado"],
  [/\s*\[(?:4K|UHD)\]|\s*\((?:4K|UHD)\)|\s+4K\b|\s+UHD\b/gi, "4K"],
  [/\s*\[(?:NACIONAL)\]|\s*\(NACIONAL\)/gi, "Nacional"],
];

export function cleanTitle(raw: string): CleanTitle {
  let title = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  let label: string | null = null;

  for (const [re, name] of LABEL_MARKERS) {
    if (re.test(title)) {
      label ??= name;
      title = title.replace(re, " ");
    }
    re.lastIndex = 0;
  }

  let year: number | null = null;
  title = title.replace(/\s*[([](19\d{2}|20\d{2})[)\]]\s*$/, (_, y: string) => {
    year = Number(y);
    return "";
  });
  // ano no meio, ex.: "Filme (2019) Leg" já removido acima; "Filme - 2019"
  if (year === null) {
    title = title.replace(/\s+-\s+(19\d{2}|20\d{2})\s*$/, (_, y: string) => {
      year = Number(y);
      return "";
    });
  }

  title = title.replace(/\s+/g, " ").replace(/[\s\-–:|]+$/, "").trim();
  return { title: title || raw.trim(), year, label };
}

/* ------------------------------------------------------------------ */
/* Episódios                                                           */
/* ------------------------------------------------------------------ */

export interface EpisodeName extends CleanTitle {
  season: number;
  episode: number;
}

const EPISODE_RE = /^(.*?)[\s._-]*\bS(\d{1,2})\s?E(\d{1,4})\b/i;

export function parseEpisode(raw: string): EpisodeName | null {
  const m = raw.match(EPISODE_RE);
  if (!m) return null;
  const clean = cleanTitle(m[1]);
  // Séries costumam trazer o ano solto no fim: "The Dropout 2022"
  if (clean.year === null) {
    const y = clean.title.match(/^(.{2,}?)\s+(19[5-9]\d|20[0-3]\d)$/);
    if (y) {
      clean.title = y[1];
      clean.year = Number(y[2]);
    }
  }
  return { ...clean, season: Number(m[2]), episode: Number(m[3]) };
}

/* ------------------------------------------------------------------ */
/* Gêneros e plataformas                                               */
/* ------------------------------------------------------------------ */

const GENRE_RULES: [RegExp, string][] = [
  [/lancamento|cinema|\b20(2[4-9])\b/, "Lançamentos"],
  [/dramas? curtos?|shorts?\b/, "Dramas curtos"],
  [/acao|action/, "Ação"],
  [/aventura|adventure/, "Aventura"],
  [/comedia|comedy|comedies/, "Comédia"],
  [/terror|horror/, "Terror"],
  [/suspense|thriller|mystery|misterio/, "Suspense"],
  [/romance|romantic|romantica/, "Romance"],
  [/animacao|animation|anime|desenho/, "Animação"],
  [/infantil|kids|family|familia/, "Família & Infantil"],
  [/ficcao|science fiction|sci-?fi/, "Ficção científica"],
  [/fantasia|fantasy/, "Fantasia"],
  [/crime|policial/, "Crime"],
  [/document/, "Documentários"],
  [/guerra|\bwar\b|military/, "Guerra"],
  [/faroeste|western/, "Faroeste"],
  [/nacional|brasileir/, "Nacionais"],
  [/4k|uhd/, "4K"],
  [/natal|christmas/, "Natal"],
  [/religios|gospel|biblic/, "Religiosos"],
  [/musica|musical|\bshows?\b/, "Música & Shows"],
  [/histori/, "História"],
  [/oscar/, "Oscar"],
  [/marvel|\bdc\b|super ?hero/, "Super-heróis"],
  [/\bdrama\b/, "Drama"],
];

const PLATFORM_RULES: [RegExp, string][] = [
  [/netflix/, "Netflix"],
  [/amazon|prime/, "Prime Video"],
  [/disney/, "Disney+"],
  [/hbo|\bmax\b/, "Max"],
  [/apple/, "Apple TV+"],
  [/paramount/, "Paramount+"],
  [/globoplay|globo/, "Globoplay"],
  [/star ?(\+|plus)/, "Star+"],
  [/discovery/, "Discovery+"],
  [/crunch/, "Crunchyroll"],
  [/funimation/, "Funimation"],
  [/directv/, "DirecTV"],
  [/turca/, "Turcas"],
  [/dorama|coreana|k-?drama/, "Doramas"],
  [/novela/, "Novelas"],
  [/mexican/, "Mexicanas"],
  [/\bsbt\b/, "SBT"],
  [/record/, "Record"],
  [/claro/, "Claro"],
  [/pluto/, "Pluto TV"],
  [/lionsga/, "Lionsgate+"],
  [/\bamc\b/, "AMC"],
  [/\bfox\b/, "FOX"],
  [/\babc\b/, "ABC"],
  [/\bcbs\b/, "CBS"],
  [/\bnbc\b/, "NBC"],
  [/\bbbc\b/, "BBC"],
  [/the cw/, "The CW"],
  [/hulu/, "Hulu"],
  [/showtime/, "Showtime"],
  [/peacock/, "Peacock"],
  [/youtube/, "YouTube"],
  [/brasil paralelo/, "Brasil Paralelo"],
  [/anime|donghua/, "Animes"],
  [/anima|desenho/, "Animadas"],
  [/document/, "Documentários"],
  [/reality|programa/, "Reality shows"],
  [/dramas? curtos?|shorts?\b/, "Dramas curtos"],
  [/legendad/, "Legendadas"],
];

function groupText(group: string): string {
  // "SÉRIES | NETFLIX", "⭐SÉRIES : NETFLIX", "Filmes / HBO Max / DC" → "netflix", "hbo max dc"
  return stripAccents(group)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+&\s/|:-]/gu, " ")
    .replace(/^\s*(canais|filmes?|series?|coletanea|movies?)\s*[|/:-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Agrupamentos que só fazem sentido como "plataforma" de séries */
const SERIES_ONLY_PLATFORMS = new Set([
  "Legendadas",
  "Novelas",
  "Turcas",
  "Doramas",
  "Mexicanas",
  "Animadas",
  "Animes",
  "Reality shows",
]);

export function movieGenres(group: string, label: string | null): string[] {
  const text = groupText(group);
  const out = new Set<string>();
  for (const [re, name] of GENRE_RULES) if (re.test(text)) out.add(name);
  for (const [re, name] of PLATFORM_RULES) {
    if (SERIES_ONLY_PLATFORMS.has(name)) continue;
    if (re.test(text)) out.add(name);
  }
  if (label === "4K") out.add("4K");
  if (out.size === 0 && !/legendad/.test(text)) out.add("Outros");
  return [...out];
}

export function seriesPlatform(group: string): string {
  const text = groupText(group);
  for (const [re, name] of PLATFORM_RULES) if (re.test(text)) return name;
  if (/colet/.test(stripAccents(group).toLowerCase())) return "Coletâneas";
  const cleaned = text.replace(/[|/:]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || /outras|diversas|variad/.test(cleaned)) return "Outras";
  return cleaned.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function labelForGroup(group: string): string | null {
  const t = stripAccents(group).toLowerCase();
  if (/legendad/.test(t)) return "Legendado";
  if (/4k|uhd/.test(t)) return "4K";
  return null;
}

/** Tipo pela URL Xtream: /movie/… ou /series/… */
export function kindFromUrl(url: string): "movie" | "series" | null {
  if (/\/movie\//i.test(url)) return "movie";
  if (/\/series\//i.test(url)) return "series";
  return null;
}

export function serverOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

/** Hash FNV-1a 32 bits → índice de balde */
export function bucketOf(key: string, buckets: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % buckets;
}
