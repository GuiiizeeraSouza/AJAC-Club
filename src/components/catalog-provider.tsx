"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CATEGORIES } from "@/lib/categories";
import { recentsStore } from "@/lib/local-store";
import type { Catalog, CategoryId, Channel } from "@/lib/types";

interface PlayerTarget {
  channel: Channel;
  /** Lista usada para zapear (↑/↓) dentro do player */
  queue: Channel[];
}

interface CatalogContextValue {
  catalog: Catalog;
  channels: Channel[];
  byId: Map<string, Channel>;
  byCategory: Record<CategoryId, Channel[]>;
  query: string;
  setQuery: (q: string) => void;
  player: PlayerTarget | null;
  play: (channel: Channel, queue?: Channel[]) => void;
  closePlayer: () => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [player, setPlayer] = useState<PlayerTarget | null>(null);

  const { byId, byCategory } = useMemo(() => {
    const byId = new Map(catalog.channels.map((c) => [c.id, c]));
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, [] as Channel[]])) as Record<
      CategoryId,
      Channel[]
    >;
    for (const ch of catalog.channels) byCategory[ch.category].push(ch);
    for (const c of CATEGORIES) byCategory[c.id] = byName(byCategory[c.id]);
    return { byId, byCategory };
  }, [catalog]);

  const play = useCallback(
    (channel: Channel, queue?: Channel[]) => {
      recentsStore.pushFront(channel.id);
      setPlayer({ channel, queue: queue?.length ? queue : byCategory[channel.category] });
    },
    [byCategory],
  );

  const closePlayer = useCallback(() => setPlayer(null), []);

  const value = useMemo(
    () => ({
      catalog,
      channels: catalog.channels,
      byId,
      byCategory,
      query,
      setQuery,
      player,
      play,
      closePlayer,
    }),
    [catalog, byId, byCategory, query, player, play, closePlayer],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog precisa estar dentro de <CatalogProvider>");
  return ctx;
}

const isForeign = (c: Channel) => /\([A-Z]{2}\)$/.test(c.name);

/** Ordem de destaque: nacionais primeiro, depois os com mais fontes (mais populares) */
export function byPopularity(channels: Channel[]): Channel[] {
  return [...channels].sort(
    (a, b) =>
      Number(isForeign(a)) - Number(isForeign(b)) ||
      b.sources.length - a.sources.length ||
      a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
  );
}

/** Ordem alfabética com canais estrangeiros ao final */
export function byName(channels: Channel[]): Channel[] {
  return [...channels].sort(
    (a, b) =>
      Number(isForeign(a)) - Number(isForeign(b)) ||
      a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }),
  );
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function searchChannels(channels: Channel[], query: string): Channel[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return channels.filter((c) => {
    const hay = normalize(`${c.name} ${c.group}`);
    return terms.every((t) => hay.includes(t));
  });
}
