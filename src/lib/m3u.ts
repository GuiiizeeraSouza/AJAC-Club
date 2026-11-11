import type { CategoryId, Channel, StreamSource } from "./types";

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export interface M3UEntry {
  name: string;
  logo: string | null;
  group: string;
  url: string;
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

/** Extrai o título após a primeira vírgula fora de aspas. */
function extinfTitle(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) return line.slice(i + 1).trim();
  }
  return "";
}

export function parseM3U(text: string): M3UEntry[] {
  const entries: M3UEntry[] = [];
  const lines = text.split(/\r?\n/);
  let pending: Omit<M3UEntry, "url"> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      for (const m of line.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = m[2];
      pending = {
        name: extinfTitle(line) || attrs["tvg-name"] || "",
        logo: attrs["tvg-logo"]?.trim() || null,
        group: attrs["group-title"]?.trim() || "",
      };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pending && /^https?:\/\//i.test(line)) {
      entries.push({ ...pending, url: line });
    }
    pending = null;
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* Normalização de nomes                                               */
/* ------------------------------------------------------------------ */

/** Correções de texto com encoding quebrado presentes nas listas. */
const MOJIBAKE: [RegExp, string][] = [
  [/Ø/g, "é"],
  [/Æ/g, "á"],
];

const QUALITY_RE =
  /\b(H\.?265|HEVC|FHD|UHD|4K|HD|SD)\b|[¹²³⁴⁵⁶⁷⁸⁹]|\[ALT\]|\(ALT\)|\*/gi;

const REGION_PREFIX_RE = /^(US|USA|PT|ES|UK|BR)\s*[:|]\s*/i;

/** Apelidos/erros de digitação → chave canônica */
const KEY_ALIASES: Record<string, string> = {
  CARTOONNETWOORK: "CARTOONNETWORK",
  FOODNETWOORK: "FOODNETWORK",
  TOONSCAST: "TOONCAST",
  JPNEWS: "JOVEMPANNEWS",
  JOVEMPAN: "JOVEMPANNEWS",
  HBOPLUS: "HBO+",
  "DISCOVERYHOME&HEALT": "DISCOVERYHOME&HEALTH",
  "DISCHOME&HEALTH": "DISCOVERYHOME&HEALTH",
  ID: "IDINVESTIGACAODISCOVERY",
  TLC: "DISCOVERYTLC",
  WARNERCHANNEL: "WARNER",
  CANALSONY: "SONY",
  UNIVERSALTV: "UNIVERSALCHANNEL",
  GLOBOPLAYNOVELAS: "NOVELASGLOBOPLAY",
  TIMESEXCLUSIVOCNBC: "CNBC",
};

/** Nomes de exibição oficiais por chave canônica */
const DISPLAY_NAMES: Record<string, string> = {
  SPORTV: "SporTV",
  SPORTV2: "SporTV 2",
  SPORTV3: "SporTV 3",
  SPORTV4: "SporTV 4",
  REDETV: "RedeTV!",
  GLOBONEWS: "GloboNews",
  TOONCAST: "Tooncast",
  JOVEMPANNEWS: "Jovem Pan News",
  CAZETV: "CazéTV",
  DUMDUM: "DumDum",
  CNBC: "CNBC",
  "HBO+": "HBO Plus",
  DISCOVERYHOMEHEALTH: "Discovery Home & Health",
  "DISCOVERYHOME&HEALTH": "Discovery Home & Health",
  IDINVESTIGACAODISCOVERY: "ID - Investigação Discovery",
  DISCOVERYTLC: "Discovery TLC",
  WARNER: "Warner Channel",
  UNIVERSALCHANNEL: "Universal TV",
  NOVELASGLOBOPLAY: "Novelas Globoplay",
};

/** Categoria fixa para canais que as listas classificam de forma imprecisa */
const CATEGORY_OVERRIDES: Record<string, CategoryId> = {
  BIS: "musica",
  TRACEBRASIL: "musica",
  TVRATIMBUM: "infantil",
  UNIVERSALPREMIERE: "filmes",
  CANALDOBOI: "variedades",
};

const ACRONYMS = new Set([
  "HBO", "ESPN", "AXN", "AMC", "TNT", "CNN", "SBT", "BIS", "GNT", "TLC",
  "HGTV", "A&E", "TV", "UOL", "USA", "OFF", "NBA", "NFL", "UFC", "PPV",
  "MTV", "ID", "DAZN", "CNBC", "BM&C", "FX", "TCM", "VH1", "SEC", "ACC",
  "GE", "RIT", "TV+", "HBO+", "HBO2", "SP", "RJ", "RS", "PA", "MG", "BA",
  "PE", "CE", "DF", "GO", "SC", "PR", "ES", "AM", "MS", "MT",
]);
const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function fixText(s: string): string {
  return MOJIBAKE.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

interface ParsedName {
  base: string;
  quality: string;
  region: string | null;
}

export function splitName(rawName: string): ParsedName {
  let name = fixText(rawName).replace(/\s+/g, " ").trim();
  let region: string | null = null;

  const pref = name.match(REGION_PREFIX_RE);
  if (pref) {
    region = pref[1].toUpperCase() === "USA" ? "US" : pref[1].toUpperCase();
    name = name.slice(pref[0].length);
  }

  const qualities: string[] = [];
  const base = name
    .replace(QUALITY_RE, (m) => {
      const q = m.toUpperCase();
      if (q === "H265" || q === "H.265" || q === "HEVC") qualities.push("H.265");
      else if (/^(FHD|UHD|4K|HD|SD)$/.test(q)) qualities.push(q);
      return " ";
    })
    .replace(/\s\.?265(?!\d)/g, () => {
      qualities.push("H.265");
      return " ";
    })
    .replace(/\s+\+\s*/g, "+ ")
    .replace(/\s*[-|]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return { base: base || name, quality: qualities.join(" "), region };
}

export function channelKey(base: string, region: string | null): string {
  const k = stripAccents(base).toUpperCase().replace(/[^A-Z0-9+&]/g, "");
  const aliased = KEY_ALIASES[k] ?? k;
  return region && region !== "BR" ? `${aliased}-${region}` : aliased;
}

export function prettifyName(base: string, key?: string): string {
  if (key && DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  // Já está em caixa mista? mantém.
  if (base !== base.toUpperCase()) return base;
  return base
    .split(" ")
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word;
      if (/^\d/.test(word)) return word;
      if (word === "SPORTV") return "SporTV";
      const lower = word.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function slugify(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/&/g, "-e-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Classificação                                                       */
/* ------------------------------------------------------------------ */

const ADULT_RE =
  /adultos|\+18|18\+|xxx|playboy|sexy ?hot|venus|hustler|penthouse|brazzers|sextreme|private/i;

export function isAdult(entry: { name: string; group: string }) {
  return ADULT_RE.test(entry.group) || ADULT_RE.test(entry.name);
}

/** Classificação pelo group-title (prioridade) */
const GROUP_RULES: [RegExp, CategoryId][] = [
  [/novela|variedade/i, "variedades"],
  [/premiere|espn|sportv|esporte|ppv|libertadores|prime video|campeonato|sports?\b|nfl|nba|ufc|dazn|futebol/i, "esportes"],
  [/not[ií]cia|news|jornal/i, "noticias"],
  [/infant|kids|desenho/i, "infantil"],
  [/discovery|document/i, "documentarios"],
  [/filme|s[ée]rie|hbo|telecine|cine ?sky|cinema|megapix|max/i, "filmes"],
  [/aberto|record|sbt|band|redetv|globo|regionais|capitais|cultura/i, "abertos"],
  [/m[uú]sica|shows?|r[aá]dio/i, "musica"],
  [/religi|gospel|cat[oó]lic|evang/i, "religiosos"],
  [/variedade|novela|24 ?h/i, "variedades"],
];

/** Classificação pelo nome do canal (para listas sem group-title) */
const NAME_RULES: [RegExp, CategoryId][] = [
  [/universal/i, "filmes"],
  [/espn|sportv|premiere|combate|sports?\b|ge ?tv|eurosport|sport ?tv|sporting|network$|big ten|dazn|nfl|nba|ufc/i, "esportes"],
  [/news|cnn|globonews|cnbc|bm&c|accuweather|jornal/i, "noticias"],
  [/cartoon|cartoonito|kids|gloob|r[aá] tim bum|dumdum|tooncast|zoomoo|woohoo|nick|disney jr|baby/i, "infantil"],
  [/discovery|history|animal planet|tlc|\bid\b|science|hgtv|home ?& ?health|travel|modo viagem|nat ?geo|food network/i, "documentarios"],
  [/hbo|telecine|megapix|cinemax|\bamc\b|\baxn\b|sony|universal|warner|space|tnt|paramount|\busa\b|canal brasil|studio|cine ?sky|adult swim|a&e|fx\b|tcm/i, "filmes"],
  [/bis\b|multishow|trace|mtv|vh1|m[uú]sica|music/i, "musica"],
  [/globo|sbt|record|band|redetv|cultura|tv brasil|gazeta/i, "abertos"],
  [/gospel|vida|aparecida|can[cç][aã]o nova|evangel|novo tempo/i, "religiosos"],
];

export function classify(entry: { name: string; group: string }): CategoryId {
  for (const [re, cat] of GROUP_RULES) if (entry.group && re.test(entry.group)) return cat;
  for (const [re, cat] of NAME_RULES) if (re.test(entry.name)) return cat;
  return "variedades";
}

/* ------------------------------------------------------------------ */
/* Agrupamento em canais                                               */
/* ------------------------------------------------------------------ */

function qualityRank(label: string): number {
  let rank = 2;
  if (/FHD|UHD|4K/.test(label)) rank = 0;
  else if (/HD/.test(label)) rank = 1;
  else if (/SD/.test(label)) rank = 3;
  if (/H\.265/.test(label)) rank += 10; // HEVC tem suporte limitado em navegadores
  return rank;
}

function cleanGroup(group: string): string {
  return group
    .replace(/^CANAIS\s*[:|]\s*/i, "")
    .replace(/[^\p{L}\p{N}\s/&+.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildChannels(entries: M3UEntry[]): Channel[] {
  const map = new Map<
    string,
    Channel & { _mixedCase: boolean; _sources: (StreamSource & { rank: number })[] }
  >();

  for (const entry of entries) {
    if (isAdult(entry)) continue;

    const { base, quality, region } = splitName(entry.name);
    if (!base) continue;
    const key = channelKey(base, region);
    const mixedCase = base !== base.toUpperCase();
    const regionLabel = region && region !== "BR" ? ` (${region})` : "";
    const displayName = prettifyName(base, key.replace(/-\w+$/, "")) + regionLabel;

    let ch = map.get(key);
    if (!ch) {
      ch = {
        id: slugify(key),
        name: displayName,
        logo: entry.logo,
        category: CATEGORY_OVERRIDES[key] ?? classify({ name: base, group: entry.group }),
        group: cleanGroup(entry.group),
        sources: [],
        _mixedCase: mixedCase,
        _sources: [],
      };
      map.set(key, ch);
    } else {
      if (!ch.logo && entry.logo) ch.logo = entry.logo;
      if (!ch.group && entry.group) {
        ch.group = cleanGroup(entry.group);
        ch.category = CATEGORY_OVERRIDES[key] ?? classify({ name: base, group: entry.group });
      }
      if (!ch._mixedCase && mixedCase && !DISPLAY_NAMES[key]) {
        ch.name = displayName;
        ch._mixedCase = true;
      }
    }

    if (!ch._sources.some((s) => s.url === entry.url)) {
      const label = quality || "Auto";
      ch._sources.push({ label, url: entry.url, rank: qualityRank(label) });
    }
  }

  const channels: Channel[] = [];
  for (const ch of map.values()) {
    const sorted = ch._sources.sort((a, b) => a.rank - b.rank);
    const seen = new Map<string, number>();
    const sources = sorted.map(({ label, url }) => {
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      return { label: n > 1 ? `${label} · ${n}` : label, url };
    });
    channels.push({
      id: ch.id,
      name: ch.name,
      logo: ch.logo,
      category: ch.category,
      group: ch.group,
      sources,
    });
  }

  // ids únicos (slugs podem colidir após normalização)
  const ids = new Map<string, number>();
  for (const ch of channels) {
    const n = ids.get(ch.id) ?? 0;
    ids.set(ch.id, n + 1);
    if (n > 0) ch.id = `${ch.id}-${n + 1}`;
  }

  return channels.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }),
  );
}
