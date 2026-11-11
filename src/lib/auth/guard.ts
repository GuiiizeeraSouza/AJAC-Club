import "server-only";
import type { NextRequest } from "next/server";
import { getAuthConfig, SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Checagem de sessão dentro das rotas de API (além do proxy.ts), para que o
 * proxy de vídeo/imagens nunca fique aberto se o matcher mudar.
 * Retorna uma resposta 401 quando não há sessão válida.
 */
export async function requireSession(request: NextRequest): Promise<Response | null> {
  try {
    const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, getAuthConfig());
    return ok ? null : Response.json({ error: "Não autenticado" }, { status: 401 });
  } catch {
    return Response.json({ error: "Login não configurado" }, { status: 500 });
  }
}
