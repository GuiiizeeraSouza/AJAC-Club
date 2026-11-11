/**
 * Sessão de login única (um usuário), sem banco de dados.
 *
 * O cookie guarda `usuario.expiraEm.assinatura`, assinado com HMAC-SHA256
 * usando AUTH_SECRET. Usa Web Crypto, então funciona no proxy e nas rotas.
 */

export const SESSION_COOKIE = "ajactv_session";
export const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 dias

export interface AuthConfig {
  username: string;
  password: string;
  secret: string;
}

export class AuthConfigError extends Error {}

export function getAuthConfig(): AuthConfig {
  const username = process.env.AUTH_USERNAME?.trim();
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!username || !password || !secret || secret.length < 32) {
    throw new AuthConfigError(
      "Login não configurado: defina AUTH_USERNAME, AUTH_PASSWORD e AUTH_SECRET (32+ caracteres) no .env.local",
    );
  }
  return { username, password, secret };
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/** Comparação em tempo constante (para assinaturas de mesmo formato) */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${encodeURIComponent(username)}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySessionToken(token: string | undefined, config: AuthConfig): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  if (decodeURIComponent(user) !== config.username) return false;
  return safeEqual(sig, await hmac(config.secret, `${user}.${expRaw}`));
}

/** Compara credenciais em tempo constante (hash antes para igualar tamanhos) */
export async function checkCredentials(username: string, password: string, config: AuthConfig) {
  const digest = async (s: string) => toBase64Url(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const [u1, u2, p1, p2] = await Promise.all([
    digest(username.trim().toLowerCase()),
    digest(config.username.toLowerCase()),
    digest(password),
    digest(config.password),
  ]);
  // avalia as duas comparações sempre, sem curto-circuito
  const userOk = safeEqual(u1, u2);
  const passOk = safeEqual(p1, p2);
  return userOk && passOk;
}

/** Só aceita redirecionamentos internos (evita open redirect) */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}
