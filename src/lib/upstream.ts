import "server-only";
import { assertPublicUrl } from "./net-guard";

/** Identificação própria do proxy — não se passa por navegador */
const UA = "AJACTv/1.0 (proxy)";

/**
 * fetch que segue redirecionamentos manualmente, validando cada salto
 * contra hosts privados. Retorna a resposta final e a URL efetiva.
 */
export async function fetchUpstream(
  rawUrl: string | null,
  init: { signal?: AbortSignal; headers?: Record<string, string> } = {},
  maxRedirects = 5,
): Promise<{ res: Response; finalUrl: URL }> {
  let url = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: init.signal,
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "*/*", ...init.headers },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error("Redirecionamentos demais");
}
