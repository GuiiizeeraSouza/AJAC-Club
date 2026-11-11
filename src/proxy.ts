import { NextResponse, type NextRequest } from "next/server";
import { AuthConfigError, getAuthConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Exige login em todo o app. Sem sessão válida:
 *  - páginas → redireciona para /login?next=…
 *  - /api/*  → 401 (o proxy de vídeo e as APIs não ficam abertos)
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let config;
  try {
    config = getAuthConfig();
  } catch (err) {
    const message = err instanceof AuthConfigError ? err.message : "Erro de configuração do login";
    return new NextResponse(message, { status: 500 });
  }

  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config);

  if (pathname === "/login") {
    return authed ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Tudo, exceto arquivos estáticos do Next e as imagens da marca (usadas na tela de login)
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico|robots.txt).*)"],
};
