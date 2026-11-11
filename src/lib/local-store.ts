"use client";

import { useSyncExternalStore } from "react";

/**
 * Pequeno store de listas de ids persistidas em localStorage
 * (favoritos e recentes), sincronizado entre abas.
 */
type Listener = () => void;

const EMPTY: string[] = [];

function createListStore(key: string, max = Infinity) {
  const listeners = new Set<Listener>();
  let cache: string[] | null = null;

  const read = (): string[] => {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      cache = Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
      cache = [];
    }
    return cache!;
  };

  const write = (next: string[]) => {
    cache = next.slice(0, max);
    try {
      localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      /* armazenamento indisponível (modo privado etc.) */
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (l: Listener) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };

  return {
    useList: () => useSyncExternalStore(subscribe, read, () => EMPTY),
    toggle: (id: string) => {
      const list = read();
      write(list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
    },
    pushFront: (id: string) => write([id, ...read().filter((x) => x !== id)]),
  };
}

export const favoritesStore = createListStore("ajactv:favoritos");
export const recentsStore = createListStore("ajactv:recentes", 12);
