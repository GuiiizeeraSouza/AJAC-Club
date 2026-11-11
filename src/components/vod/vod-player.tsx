"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";
import { proxiedStream } from "@/lib/playback";
import {
  episodeCode,
  formatTime,
  readPosition,
  saveWatch,
  writePosition,
} from "@/lib/vod/client";
import type { VodEpisode, VodSource } from "@/lib/vod/types";
import { useVod, type VodPlaying } from "./vod-provider";

interface Attempt {
  sourceIndex: number;
  url: string;
  via: "direto" | "proxy";
}

/** Para cada fonte: direto (quando não há conteúdo misto) e depois via proxy */
function buildAttempts(sources: VodSource[]): Attempt[] {
  const https = typeof window !== "undefined" && window.location.protocol === "https:";
  return sources.flatMap((s, sourceIndex) => {
    const list: Attempt[] = [];
    if (!https || s.url.startsWith("https://")) list.push({ sourceIndex, url: s.url, via: "direto" });
    list.push({ sourceIndex, url: proxiedStream(s.url), via: "proxy" });
    return list;
  });
}

function flatEpisodes(p: Extract<VodPlaying, { kind: "episode" }>): VodEpisode[] {
  return p.seasons.flatMap((s) => s.episodes);
}

export function VodPlayer() {
  const { playing } = useVod();
  if (!playing) return null;
  const key =
    playing.kind === "movie"
      ? `movie:${playing.movie.id}`
      : `ep:${playing.series.id}:${playing.season}:${playing.episode}`;
  return <VodPlayerDialog key={key} playing={playing} videoKey={key} />;
}

function VodPlayerDialog({ playing, videoKey }: { playing: VodPlaying; videoKey: string }) {
  const { closePlayer, playEpisode } = useVod();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const episodes = useMemo(() => (playing.kind === "episode" ? flatEpisodes(playing) : []), [playing]);
  const epIndex =
    playing.kind === "episode"
      ? episodes.findIndex((e) => e.season === playing.season && e.episode === playing.episode)
      : -1;
  const current = playing.kind === "episode" ? episodes[epIndex] : null;
  const next = epIndex >= 0 ? episodes[epIndex + 1] ?? null : null;
  const prev = epIndex > 0 ? episodes[epIndex - 1] : null;

  const sources = useMemo(
    () => (playing.kind === "movie" ? playing.movie.sources : current?.sources ?? []),
    [playing, current],
  );
  const attempts = useMemo(() => buildAttempts(sources), [sources]);
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "playing" | "buffering" | "error">("loading");
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const attempt = attempts[attemptIndex];

  const title = playing.kind === "movie" ? playing.movie.title : playing.series.title;
  const subtitle =
    playing.kind === "movie"
      ? [playing.movie.year, playing.movie.genres.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")
      : `${episodeCode(playing.season, playing.episode)} · ${playing.series.platform}`;

  const goEpisode = useCallback(
    (ep: VodEpisode | null) => {
      if (!ep || playing.kind !== "episode") return;
      playEpisode(playing.series, playing.seasons, ep.season, ep.episode);
    },
    [playing, playEpisode],
  );

  /* ---- progresso ---- */
  const persist = useCallback(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0 || v.currentTime < 5) return;
    writePosition(videoKey, v.currentTime, v.duration);
    saveWatch(
      playing.kind === "movie"
        ? {
            kind: "movie",
            id: playing.movie.id,
            title: playing.movie.title,
            poster: playing.movie.poster,
            position: v.currentTime,
            duration: v.duration,
          }
        : {
            kind: "series",
            id: playing.series.id,
            title: playing.series.title,
            poster: playing.series.poster,
            season: playing.season,
            episode: playing.episode,
            position: v.currentTime,
            duration: v.duration,
          },
    );
  }, [playing, videoKey]);

  useEffect(() => {
    const t = window.setInterval(persist, 5_000);
    return () => {
      window.clearInterval(t);
      persist();
    };
  }, [persist]);

  /* ---- foco, rolagem e teclado ---- */
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

  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape" && !document.fullscreenElement) closePlayer();
      else if (e.key === "ArrowRight") v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
      else if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 10);
      else if (e.key === " " || e.key.toLowerCase() === "k") {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key.toLowerCase() === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void v.requestFullscreen?.();
      } else if (e.key.toLowerCase() === "n" && nextRef.current) {
        goEpisode(nextRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePlayer, goEpisode]);

  /* ---- próximo episódio automático ---- */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      goEpisode(next);
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, next, goEpisode]);

  /* ---- eventos do vídeo ---- */
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const saved = readPosition(videoKey);
    if (saved && saved.t > 30 && saved.t < (v.duration || saved.d) - 60) {
      v.currentTime = saved.t;
      setResumedAt(saved.t);
      window.setTimeout(() => setResumedAt(null), 6_000);
    }
  };

  const onError = () => {
    if (attemptIndex + 1 < attempts.length) {
      setStatus("loading");
      setAttemptIndex((i) => i + 1);
    } else {
      setStatus("error");
    }
  };

  const onEnded = () => {
    persist();
    if (next) setCountdown(8);
  };

  const sourceIndex = attempt?.sourceIndex ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Assistindo ${title}`}
      className="fade-in fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink/[0.97] backdrop-blur-xl"
    >
      <header className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={closePlayer}
          className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-cream/85 transition hover:bg-white/[0.1]"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Voltar</span>
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold leading-tight">{title}</h2>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={closePlayer}
          aria-label="Fechar player"
          className="ml-auto rounded-xl bg-white/[0.06] p-2.5 text-cream/80 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <X className="size-5" />
        </button>
      </header>

      <div
        className={`grid flex-1 gap-6 px-4 pb-8 sm:px-6 lg:px-8 ${
          playing.kind === "episode" ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""
        }`}
      >
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/60 ring-1 ring-line">
            {attempt && (
              <video
                ref={videoRef}
                key={attempt.url}
                src={attempt.url}
                className="size-full bg-black"
                controls
                autoPlay
                playsInline
                preload="auto"
                onLoadedMetadata={onLoadedMetadata}
                onPlaying={() => setStatus("playing")}
                onWaiting={() => setStatus((s) => (s === "playing" ? "buffering" : s))}
                onError={onError}
                onEnded={onEnded}
                onPause={persist}
              />
            )}

            {(status === "loading" || status === "buffering") && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
                <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-cream ring-1 ring-white/10 backdrop-blur">
                  <LoaderCircle className="size-4 animate-spin text-gold" />
                  {status === "buffering"
                    ? "Carregando…"
                    : `Abrindo · ${sources[sourceIndex]?.label ?? ""} · ${attempt?.via ?? ""}`}
                </div>
              </div>
            )}

            {resumedAt !== null && (
              <div className="absolute bottom-16 left-4 z-10 flex items-center gap-3 rounded-2xl bg-black/80 px-4 py-2.5 text-sm ring-1 ring-white/10 backdrop-blur">
                Continuando de {formatTime(resumedAt)}
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = 0;
                    setResumedAt(null);
                  }}
                  className="flex items-center gap-1 font-semibold text-gold hover:text-gold-soft"
                >
                  <RotateCcw className="size-3.5" /> Do início
                </button>
              </div>
            )}

            {countdown !== null && next && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/75 text-center">
                <p className="text-sm text-muted">Próximo episódio</p>
                <p className="text-xl font-semibold">{episodeCode(next.season, next.episode)}</p>
                <p className="text-sm text-cream/80">Começa em {countdown}s</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goEpisode(next)}
                    className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-soft"
                  >
                    <SkipForward className="size-4" /> Assistir agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountdown(null)}
                    className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm hover:bg-white/[0.14]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
                <TriangleAlert className="size-8 text-gold" />
                <div>
                  <p className="font-medium">Não foi possível abrir este vídeo</p>
                  <p className="mt-1 text-sm text-muted">
                    Todas as fontes falharam. O servidor pode estar fora do ar ou o arquivo foi removido da lista.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("loading");
                      setAttemptIndex(0);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-soft"
                  >
                    <RefreshCw className="size-4" /> Tentar de novo
                  </button>
                  {next && (
                    <button
                      type="button"
                      onClick={() => goEpisode(next)}
                      className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2 text-sm hover:bg-white/[0.14]"
                    >
                      <SkipForward className="size-4" /> Próximo episódio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playing.kind === "episode" && (
              <>
                <button
                  type="button"
                  disabled={!prev}
                  onClick={() => goEpisode(prev)}
                  className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium transition hover:bg-white/[0.12] disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" /> Anterior
                </button>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => goEpisode(next)}
                  className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium transition hover:bg-white/[0.12] disabled:opacity-40"
                >
                  Próximo <ChevronRight className="size-4" />
                </button>
                <span className="mx-2 h-4 w-px bg-white/10" />
              </>
            )}
            <span className="mr-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Fontes</span>
            {sources.map((s, i) => (
              <button
                key={s.url}
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setAttemptIndex(attempts.findIndex((a) => a.sourceIndex === i));
                }}
                aria-pressed={i === sourceIndex}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  i === sourceIndex ? "bg-gold text-ink" : "bg-white/[0.06] text-cream/80 hover:bg-white/[0.12]"
                }`}
              >
                {sources.filter((x) => x.label === s.label).length > 1 ? `${s.label} ${i + 1}` : s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Atalhos: <kbd className="rounded border border-white/15 px-1">Espaço</kbd> pausa,{" "}
            <kbd className="rounded border border-white/15 px-1">←</kbd>{" "}
            <kbd className="rounded border border-white/15 px-1">→</kbd> 10s,{" "}
            <kbd className="rounded border border-white/15 px-1">F</kbd> tela cheia
            {playing.kind === "episode" && (
              <>
                , <kbd className="rounded border border-white/15 px-1">N</kbd> próximo episódio
              </>
            )}
            . O progresso é salvo neste navegador.
          </p>
        </div>

        {playing.kind === "episode" && (
          <EpisodeSidebar playing={playing} onPick={goEpisode} />
        )}
      </div>
    </div>
  );
}

function EpisodeSidebar({
  playing,
  onPick,
}: {
  playing: Extract<VodPlaying, { kind: "episode" }>;
  onPick: (ep: VodEpisode) => void;
}) {
  const [season, setSeason] = useState(playing.season);
  const activeRef = useRef<HTMLButtonElement>(null);
  const list = playing.seasons.find((s) => s.season === season)?.episodes ?? [];

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <aside className="flex min-h-0 flex-col rounded-3xl bg-panel/80 ring-1 ring-line lg:max-h-[calc(100dvh-7rem)]">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2 pt-4">
        {playing.seasons.map((s) => (
          <button
            key={s.season}
            type="button"
            onClick={() => setSeason(s.season)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              s.season === season ? "bg-cream text-ink" : "bg-white/[0.06] text-cream/80 hover:bg-white/[0.12]"
            }`}
          >
            {s.season === 0 ? "Extras" : `T${s.season}`}
          </button>
        ))}
      </div>
      <ul className="max-h-80 overflow-y-auto px-2 pb-3 lg:max-h-none">
        {list.map((ep) => {
          const active = ep.season === playing.season && ep.episode === playing.episode;
          const pos = readPosition(`ep:${playing.series.id}:${ep.season}:${ep.episode}`);
          return (
            <li key={`${ep.season}-${ep.episode}`}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => !active && onPick(ep)}
                aria-current={active ? "true" : undefined}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  active ? "bg-gold/15 text-gold" : "text-cream/85 hover:bg-white/[0.06]"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {ep.season === 0 ? `Extra ${ep.episode}` : `Episódio ${ep.episode}`}
                  <span className="text-[11px] text-muted">{ep.sources.map((s) => s.label).join(" · ")}</span>
                </span>
                {pos && pos.d > 0 && (
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-gold"
                      style={{ width: `${Math.min(100, (pos.t / pos.d) * 100)}%` }}
                    />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
