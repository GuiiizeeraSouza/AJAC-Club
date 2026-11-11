import type { NextRequest } from "next/server";
import { GuardError } from "@/lib/net-guard";
import { fetchUpstream } from "@/lib/upstream";
import { requireSession } from "@/lib/auth/guard";

/** Proxy de logos dos canais (muitas são http e quebrariam em páginas https). */

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  try {
    const { res } = await fetchUpstream(request.nextUrl.searchParams.get("url"), {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      await res.body?.cancel();
      return new Response(null, { status: 404 });
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response(null, { status: 413 });

    return new Response(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (err) {
    // Hosts de logo fora do ar são comuns; o cliente cai no monograma.
    return new Response(null, { status: err instanceof GuardError && err.message !== "Host não encontrado" ? 400 : 404 });
  }
}
