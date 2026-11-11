"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useDebounced } from "@/lib/vod/client";
import type { VodMovie, VodSeries } from "@/lib/vod/types";
import { movieBadges, PosterCard } from "./poster-card";
import { useVod } from "./vod-provider";

interface SearchResult {
  movies: VodMovie[];
  moviesTotal: number;
  series: VodSeries[];
  seriesTotal: number;
}

/** Resultados de filmes e séries na busca global */
export function VodSearchResults({ query }: { query: string }) {
  const { playMovie, showSeries } = useVod();
  const q = useDebounced(query.trim(), 350);
  const [result, setResult] = useState<{ q: string; data: SearchResult } | null>(null);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    fetch(`/api/vod/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data: SearchResult) => setResult({ q, data }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [q]);

  if (q.length < 2) return null;
  if (!result || result.q !== q) {
    return (
      <div className="mt-10 flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin text-gold" /> Buscando filmes e séries…
      </div>
    );
  }

  const { movies, moviesTotal, series, seriesTotal } = result.data;
  if (movies.length === 0 && series.length === 0) return null;

  return (
    <div className="mt-10 flex flex-col gap-10">
      {series.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">Séries</h2>
            <span className="text-sm text-muted">{seriesTotal}</span>
            <Link href="/series" className="ml-auto text-sm font-medium hover:text-gold">
              Ver catálogo
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
            {series.map((s) => (
              <PosterCard key={s.id} title={s.title} poster={s.poster} meta={s.platform} onClick={() => showSeries(s)} />
            ))}
          </div>
        </section>
      )}
      {movies.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">Filmes</h2>
            <span className="text-sm text-muted">{moviesTotal}</span>
            <Link href="/filmes" className="ml-auto text-sm font-medium hover:text-gold">
              Ver catálogo
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
            {movies.map((m) => (
              <PosterCard
                key={m.id}
                title={m.title}
                poster={m.poster}
                meta={m.year ? String(m.year) : "Filme"}
                badges={movieBadges(m.sources.map((s) => s.label))}
                onClick={() => playMovie(m)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
