"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, TriangleAlert, X } from "lucide-react";
import { episodeCode, readPosition, useWatchList } from "@/lib/vod/client";
import type { VodSeries, VodSeriesDetail } from "@/lib/vod/types";
import { Poster } from "./poster-card";
import { useVod } from "./vod-provider";

export function SeriesDetailModal() {
  const { openSeries } = useVod();
  if (!openSeries) return null;
  return <SeriesDialog key={openSeries.id} series={openSeries} />;
}

function SeriesDialog({ series }: { series: VodSeries }) {
  const { closeSeries, playEpisode, playing } = useVod();
  const [detail, setDetail] = useState<VodSeriesDetail | null>(null);
  const [error, setError] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const watch = useWatchList().find((w) => w.kind === "series" && w.id === series.id);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/vod/series/${encodeURIComponent(series.id)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: VodSeriesDetail) => setDetail(d))
      .catch((e: Error) => e.name !== "AbortError" && setError(true));
    return () => ctrl.abort();
  }, [series.id]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (playing) return; // o player trata o Esc enquanto estiver aberto
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSeries();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSeries, playing]);

  const seasons = detail?.seasonList ?? [];
  const activeSeason = season ?? watch?.season ?? seasons[0]?.season ?? 1;
  const episodes = seasons.find((s) => s.season === activeSeason)?.episodes ?? [];

  const resume =
    watch && detail
      ? detail.seasonList
          .flatMap((s) => s.episodes)
          .find((e) => e.season === watch.season && e.episode === watch.episode)
      : null;
  const first = seasons.find((s) => s.season > 0)?.episodes[0] ?? seasons[0]?.episodes[0];

  const start = (s: number, e: number) => detail && playEpisode(detail, detail.seasonList, s, e);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={series.title}>
      <div className="fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeSeries} />
      <div className="fade-in relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-panel ring-1 ring-line sm:rounded-[2rem]">
        <div className="relative shrink-0 overflow-hidden">
          <Poster src={series.poster} title="" className="absolute inset-0 size-full scale-110 opacity-30 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/60 to-transparent" />
          <button
            ref={closeRef}
            type="button"
            onClick={closeSeries}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-xl bg-black/50 p-2.5 text-cream/85 backdrop-blur transition hover:bg-black/70"
          >
            <X className="size-5" />
          </button>
          <div className="relative flex gap-5 p-5 sm:p-7">
            <Poster
              src={series.poster}
              title={series.title}
              className="aspect-[2/3] w-28 shrink-0 rounded-2xl shadow-2xl ring-1 ring-white/10 sm:w-36"
            />
            <div className="min-w-0 self-end">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">{series.platform}</p>
              <h2 className="mt-1 font-display text-2xl leading-tight tracking-wide sm:text-4xl">{series.title}</h2>
              <p className="mt-2 text-sm text-cream/75">
                {[
                  series.year,
                  `${detail?.seasons ?? series.seasons} ${(detail?.seasons ?? series.seasons) === 1 ? "temporada" : "temporadas"}`,
                  `${detail?.episodes ?? series.episodes} episódios`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {resume ? (
                  <button
                    type="button"
                    onClick={() => start(resume.season, resume.episode)}
                    className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft"
                  >
                    <Play className="size-4 fill-current" /> Continuar {episodeCode(resume.season, resume.episode)}
                  </button>
                ) : (
                  first && (
                    <button
                      type="button"
                      onClick={() => start(first.season, first.episode)}
                      className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft"
                    >
                      <Play className="size-4 fill-current" /> Assistir {episodeCode(first.season, first.episode)}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
          {!detail && !error && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin text-gold" /> Carregando episódios…
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
              <TriangleAlert className="size-6 text-gold" />
              Não foi possível carregar os episódios desta série.
            </div>
          )}
          {detail && seasons.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              Nenhum episódio desta série está disponível nos servidores agora.
            </p>
          )}
          {detail && seasons.length > 0 && (
            <>
              <div className="no-scrollbar sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-panel px-1 py-3">
                {seasons.map((s) => (
                  <button
                    key={s.season}
                    type="button"
                    onClick={() => setSeason(s.season)}
                    aria-pressed={s.season === activeSeason}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                      s.season === activeSeason
                        ? "bg-cream text-ink"
                        : "bg-white/[0.06] text-cream/80 hover:bg-white/[0.12]"
                    }`}
                  >
                    {s.season === 0 ? "Extras" : `Temporada ${s.season}`}
                  </button>
                ))}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {episodes.map((ep) => {
                  const pos = readPosition(`ep:${series.id}:${ep.season}:${ep.episode}`);
                  const pct = pos && pos.d > 0 ? Math.min(1, pos.t / pos.d) : 0;
                  return (
                    <li key={`${ep.season}-${ep.episode}`}>
                      <button
                        type="button"
                        onClick={() => start(ep.season, ep.episode)}
                        className="group flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-3 text-left ring-1 ring-transparent transition hover:bg-white/[0.07] hover:ring-gold/50"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-black/40 font-display text-sm text-gold">
                          {ep.episode}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {ep.season === 0 ? `Extra ${ep.episode}` : `Episódio ${ep.episode}`}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {ep.sources.map((s) => s.label).join(" · ")}
                          </span>
                          {pct > 0 && (
                            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                              <span className="block h-full rounded-full bg-gold" style={{ width: `${pct * 100}%` }} />
                            </span>
                          )}
                        </span>
                        <Play className="size-4 text-cream/50 transition group-hover:text-gold" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
