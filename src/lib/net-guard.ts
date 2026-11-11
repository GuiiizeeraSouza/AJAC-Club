import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Proteção contra SSRF para as rotas de proxy: só permite http(s) para hosts
 * públicos. Bloqueia loopback, redes privadas, link-local e metadata de nuvem.
 */
function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export async function assertPublicUrl(raw: string | null): Promise<URL> {
  if (!raw) throw new GuardError("Parâmetro url ausente");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GuardError("Protocolo não suportado");
  }
  if (url.username || url.password) throw new GuardError("Credenciais na URL não são permitidas");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new GuardError("Host não permitido");
  }

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new GuardError("Host não encontrado");
  if (addresses.some(isPrivateAddress)) throw new GuardError("Host não permitido");

  return url;
}

export class GuardError extends Error {}
