"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkCredentials,
  createSessionToken,
  getAuthConfig,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_TTL_S,
} from "./session";

export interface LoginState {
  error?: string;
  username?: string;
}

/* Limite simples de tentativas por IP (memória do processo) */
const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function isSecureRequest(h: Headers) {
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return (h.get("origin") ?? h.get("referer") ?? "").startsWith("https://");
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").slice(0, 100);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!username || !password) return { error: "Informe usuário e senha.", username };

  const h = await headers();
  const ip = clientIp(h);
  const now = Date.now();
  const entry = failures.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    const min = Math.ceil((entry.resetAt - now) / 60_000);
    return { error: `Muitas tentativas. Tente de novo em ${min} min.`, username };
  }

  const config = getAuthConfig();
  if (!(await checkCredentials(username, password, config))) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    current.count++;
    failures.set(ip, current);
    // pequeno atraso para desencorajar tentativa e erro
    await new Promise((r) => setTimeout(r, 600));
    const left = MAX_FAILURES - current.count;
    return {
      error:
        left > 0
          ? `Usuário ou senha incorretos.${left <= 2 ? ` ${left} ${left === 1 ? "tentativa restante" : "tentativas restantes"}.` : ""}`
          : "Muitas tentativas. Tente de novo em 5 min.",
      username,
    };
  }

  failures.delete(ip);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(config.username, config.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureRequest(h),
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
