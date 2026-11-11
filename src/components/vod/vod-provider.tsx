"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { VodMovie, VodSeason, VodSeries } from "@/lib/vod/types";

export type VodPlaying =
  | { kind: "movie"; movie: VodMovie }
  | { kind: "episode"; series: VodSeries; seasons: VodSeason[]; season: number; episode: number };

interface VodContextValue {
  playing: VodPlaying | null;
  openSeries: VodSeries | null;
  playMovie: (movie: VodMovie) => void;
  playMovieById: (id: string) => Promise<boolean>;
  playEpisode: (series: VodSeries, seasons: VodSeason[], season: number, episode: number) => void;
  showSeries: (series: VodSeries) => void;
  closeSeries: () => void;
  closePlayer: () => void;
}

const VodContext = createContext<VodContextValue | null>(null);

export function VodProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState<VodPlaying | null>(null);
  const [openSeries, setOpenSeries] = useState<VodSeries | null>(null);

  const playMovie = useCallback((movie: VodMovie) => setPlaying({ kind: "movie", movie }), []);

  const playMovieById = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/vod/movies/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return false;
      setPlaying({ kind: "movie", movie: (await res.json()) as VodMovie });
      return true;
    } catch {
      return false;
    }
  }, []);

  const playEpisode = useCallback(
    (series: VodSeries, seasons: VodSeason[], season: number, episode: number) =>
      setPlaying({ kind: "episode", series, seasons, season, episode }),
    [],
  );

  const value = useMemo(
    () => ({
      playing,
      openSeries,
      playMovie,
      playMovieById,
      playEpisode,
      showSeries: setOpenSeries,
      closeSeries: () => setOpenSeries(null),
      closePlayer: () => setPlaying(null),
    }),
    [playing, openSeries, playMovie, playMovieById, playEpisode],
  );

  return <VodContext.Provider value={value}>{children}</VodContext.Provider>;
}

export function useVod() {
  const ctx = useContext(VodContext);
  if (!ctx) throw new Error("useVod precisa estar dentro de <VodProvider>");
  return ctx;
}
