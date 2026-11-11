"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Facet, VodKind, VodMovie, VodPage, VodSeries, VodStatus } from "./types";

/* ------------------------------------------------------------------ */
/* Status do índice                                                    */
/* ------------------------------------------------------------------ */

export function useVodStatus() {
  const [status, setStatus] = useState<VodStatus | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const res = await fetch("/api/vod/status", { cache: "no-store" });
        const json = (await res.json()) as VodStatus;
        if (!alive) return;
        setStatus(json);
        // Enquanto indexa, acompanha de perto; depois, só de vez em quando
        timer = window.setTimeout(load, json.ready && json.state !== "building" ? 60_000 : 2_000);
      } catch {
        if (alive) timer = window.setTimeout(load, 10_000);
      }
    };
    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return status;
}

/* ------------------------------------------------------------------ */
/* Listas paginadas (rolagem infinita)                                 */
/* ------------------------------------------------------------------ */

export type VodSortOption = "destaques" | "recentes" | "az";

interface ListParams {
  q: string;
  filter: string | null;
  sort: VodSortOption;
  limit?: number;
}

interface ListData<T> {
  key: string;
  items: T[];
  total: number;
  facets: Facet[];
  status: VodStatus | null;
  page: number;
  done: boolean;
  error: string | null;
}

async function fetchList<T>(kind: VodKind, params: ListParams, page: number, signal: AbortSignal) {
  const qs = new URLSearchParams({ page: String(page), sort: params.sort });
  if (params.q) qs.set("q", params.q);
  if (params.filter) qs.set("filter", params.filter);
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`/api/vod/${kind === "movie" ? "movies" : "series"}?${qs}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as VodPage<T>;
}

const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

export function useVodList<K extends VodKind>(kind: K, params: ListParams) {
  type Item = K extends "movie" ? VodMovie : VodSeries;
  const key = `${kind}|${params.q}|${params.filter ?? ""}|${params.sort}|${params.limit ?? ""}`;
  const [data, setData] = useState<ListData<Item> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });

  // Primeira página sempre que a busca/filtro/ordem mudar
  useEffect(() => {
    const ctrl = new AbortController();
    fetchList<Item>(kind, paramsRef.current, 1, ctrl.signal)
      .then((json) =>
        setData({
          key,
          items: json.items,
          total: json.total,
          facets: json.facets,
          status: json.status,
          page: 1,
          done: json.items.length >= json.total,
          error: null,
        }),
      )
      .catch((err) => {
        if (isAbort(err)) return;
        setData((d) => ({
          key,
          items: [],
          total: 0,
          facets: d?.facets ?? [],
          status: d?.status ?? null,
          page: 0,
          done: true,
          error: "Não foi possível carregar agora.",
        }));
      });
    return () => ctrl.abort();
  }, [kind, key, retryToken]);

  const current = data && data.key === key ? data : null;

  // Enquanto o índice é criado pela primeira vez, tenta de novo sozinho
  const indexing = !!current?.status && !current.status.ready;
  useEffect(() => {
    if (!indexing) return;
    const t = window.setTimeout(() => setRetryToken((n) => n + 1), 3_000);
    return () => window.clearTimeout(t);
  }, [indexing, current]);

  const loadMore = useCallback(() => {
    if (!current || current.done || loadingMore) return;
    setLoadingMore(true);
    const ctrl = new AbortController();
    fetchList<Item>(kind, paramsRef.current, current.page + 1, ctrl.signal)
      .then((json) =>
        setData((d) => {
          if (!d || d.key !== key) return d;
          const items = [...d.items, ...json.items];
          return {
            ...d,
            items,
            total: json.total,
            page: d.page + 1,
            done: items.length >= json.total || json.items.length === 0,
          };
        }),
      )
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [current, loadingMore, kind, key]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  return {
    items: current?.items ?? [],
    total: current?.total ?? 0,
    facets: current?.facets ?? data?.facets ?? [],
    status: current?.status ?? data?.status ?? null,
    loading: !current || loadingMore,
    error: current?.error ?? null,
    done: current?.done ?? false,
    loadMore,
    retry,
  };
}

/** Debounce simples para campos de busca */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ------------------------------------------------------------------ */
/* Progresso e "continuar assistindo"                                  */
/* ------------------------------------------------------------------ */

export interface WatchEntry {
  kind: VodKind;
  /** id do filme ou da série */
  id: string;
  title: string;
  poster: string | null;
  /** Para séries: episódio em andamento */
  season?: number;
  episode?: number;
  position: number;
  duration: number;
  updatedAt: number;
}

const WATCH_KEY = "ajactv:vod-assistindo";
const listeners = new Set<() => void>();
let cache: WatchEntry[] | null = null;
const EMPTY: WatchEntry[] = [];

function readWatch(): WatchEntry[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function writeWatch(list: WatchEntry[]) {
  cache = list.slice(0, 30);
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento */
  }
  listeners.forEach((l) => l());
}

export function saveWatch(entry: Omit<WatchEntry, "updatedAt">) {
  const list = readWatch().filter((e) => !(e.kind === entry.kind && e.id === entry.id));
  // terminou (ou quase): sai de "continuar assistindo" no caso de filmes
  const finished = entry.duration > 0 && entry.position > entry.duration - 90;
  if (finished && entry.kind === "movie") return writeWatch(list);
  writeWatch([{ ...entry, updatedAt: Date.now() }, ...list]);
}

export function removeWatch(kind: VodKind, id: string) {
  writeWatch(readWatch().filter((e) => !(e.kind === kind && e.id === id)));
}

export function useWatchList() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readWatch,
    () => EMPTY,
  );
}

/** Posição salva por vídeo (filme ou episódio) */
const POS_KEY = "ajactv:vod-posicoes";

export function readPosition(videoKey: string): { t: number; d: number } | null {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<string, { t: number; d: number }>;
    return all[videoKey] ?? null;
  } catch {
    return null;
  }
}

export function writePosition(videoKey: string, t: number, d: number) {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<
      string,
      { t: number; d: number; at?: number }
    >;
    all[videoKey] = { t: Math.round(t), d: Math.round(d), at: Date.now() };
    // mantém só os 300 mais recentes
    const entries = Object.entries(all).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0)).slice(0, 300);
    localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* sem armazenamento */
  }
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function episodeCode(season: number, episode: number) {
  return season === 0 ? `Extra ${episode}` : `T${season} · E${episode}`;
}
