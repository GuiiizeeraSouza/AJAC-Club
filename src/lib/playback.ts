export type AttemptKind = "hls" | "mpegts";

export interface Attempt {
  kind: AttemptKind;
  url: string;
  via: "direto" | "proxy";
}

export function proxiedStream(url: string): string {
  return `/api/stream?url=${encodeURIComponent(url)}`;
}

export function proxiedImage(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("https://") ? url : `/api/img?url=${encodeURIComponent(url)}`;
}

/** Servidores Xtream: /usuario/senha/123.ts também servem /usuario/senha/123.m3u8 */
const XTREAM_TS = /^(https?:\/\/[^/]+\/(?:live\/)?[^/]+\/[^/]+\/\d+)\.ts$/i;

/**
 * Monta a sequência de tentativas para uma fonte. HLS é preferido (mais
 * resiliente no navegador); MPEG-TS contínuo fica como alternativa.
 * Conexão direta só é tentada quando não há bloqueio de conteúdo misto.
 */
export function buildAttempts(sourceUrl: string, pageIsHttps: boolean): Attempt[] {
  const canDirect = (u: string) => !pageIsHttps || u.startsWith("https://");
  const attempts: Attempt[] = [];
  const add = (kind: AttemptKind, url: string) => {
    if (canDirect(url)) attempts.push({ kind, url, via: "direto" });
    attempts.push({ kind, url: proxiedStream(url), via: "proxy" });
  };

  const xtream = sourceUrl.match(XTREAM_TS);
  if (/\.m3u8?(\?|$)/i.test(sourceUrl)) {
    add("hls", sourceUrl);
  } else if (xtream) {
    add("hls", `${xtream[1]}.m3u8`);
    add("mpegts", sourceUrl);
  } else if (/\.ts(\?|$)/i.test(sourceUrl)) {
    add("mpegts", sourceUrl);
  } else {
    add("hls", sourceUrl);
    add("mpegts", sourceUrl);
  }
  return attempts;
}
