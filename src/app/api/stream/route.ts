import type { NextRequest } from "next/server";
import { GuardError } from "@/lib/net-guard";
import { fetchUpstream } from "@/lib/upstream";
import { requireSession } from "@/lib/auth/guard";

/**
 * Proxy de streams: resolve conteúdo misto (http em página https) e CORS.
 * Playlists HLS são reescritas para que segmentos, chaves e variantes também
 * passem por aqui; demais conteúdos (segmentos .ts, MPEG-TS contínuo) são
 * repassados como stream.
 */

const PLAYLIST_TYPES = /mpegurl|m3u/i;

function proxied(target: string): string {
  return `/api/stream?url=${encodeURIComponent(target)}`;
}

function rewritePlaylist(body: string, base: URL): string {
  const abs = (ref: string) => {
    try {
      return proxied(new URL(ref.trim(), base).toString());
    } catch {
      return ref;
    }
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF ...
        return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${abs(uri)}"`);
      }
      return abs(trimmed);
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const target = request.nextUrl.searchParams.get("url");

  try {
    const range = request.headers.get("range");
    const { res, finalUrl } = await fetchUpstream(target, {
      signal: request.signal,
      headers: range ? { Range: range } : undefined,
    });

    if (!res.ok && res.status !== 206) {
      await res.body?.cancel();
      return new Response(`Upstream respondeu ${res.status}`, { status: 502 });
    }

    const contentType = res.headers.get("content-type") ?? "";
    const looksLikePlaylist =
      PLAYLIST_TYPES.test(contentType) || /\.m3u8?($|\?)/i.test(finalUrl.pathname);

    if (looksLikePlaylist) {
      const text = await res.text();
      if (text.trimStart().startsWith("#EXTM3U")) {
        return new Response(rewritePlaylist(text, finalUrl), {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store",
          },
        });
      }
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": contentType || "text/plain", "Cache-Control": "no-store" },
      });
    }

    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    if (err instanceof GuardError) return new Response(err.message, { status: 400 });
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return new Response("Falha ao acessar a fonte do canal", { status: 502 });
  }
}
