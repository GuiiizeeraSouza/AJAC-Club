"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/** Intervalo de atualização da lista de canais no navegador */
export const CATALOG_REFRESH_MS = 10 * 60 * 1000;

/**
 * Mantém a lista de canais sempre atual: busca a versão mais nova do servidor
 * periodicamente, ao voltar para a aba e quando a internet volta.
 * A troca é transparente — o player e a navegação continuam onde estavam.
 */
export function CatalogAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(refresh, CATALOG_REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - last > CATALOG_REFRESH_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [router]);

  return null;
}

function subscribeSecond(cb: () => void) {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
}

const nowSecond = () => Math.floor(Date.now() / 1000);

/** Relógio ao vivo (horário de Brasília) */
export function LiveClock({ className = "" }: { className?: string }) {
  const second = useSyncExternalStore(subscribeSecond, nowSecond, () => 0);
  const text =
    second === 0
      ? "--:--:--"
      : new Date(second * 1000).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <time className={`tabular-nums ${className}`} suppressHydrationWarning>
      {text}
    </time>
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
