"use client";

import { useEffect, useRef } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Heart,
  LoaderCircle,
  RefreshCw,
  SkipForward,
  TriangleAlert,
  VolumeX,
  X,
} from "lucide-react";
import { CATEGORY_MAP } from "@/lib/categories";
import { favoritesStore } from "@/lib/local-store";
import { useStreamPlayer, type LiveStats, type PlayerStatus } from "@/lib/use-stream-player";
import type { Channel } from "@/lib/types";
import { useCatalog } from "./catalog-provider";
import { LiveBadge } from "./channel-card";
import { ChannelLogo } from "./channel-logo";

/** Saúde do sinal: quanto vídeo já está carregado à frente e se está no ao vivo */
function LiveHealth({
  stats,
  status,
  reconnects,
}: {
  stats: LiveStats;
  status: PlayerStatus;
  reconnects: number;
}) {
  const TARGET = 30; // mesmo valor de maxBufferLength
  const pct = Math.min(1, stats.buffer / TARGET);
  const tone =
    status === "reconnecting" || status === "error"
      ? "bg-live"
      : stats.buffer < 4
        ? "bg-amber-500"
        : "bg-gold";
  const label =
    status === "reconnecting"
      ? "Reconectando"
      : status === "error"
        ? "Sem sinal"
        : status === "loading"
          ? "Sintonizando"
          : stats.buffer < 4
            ? "Sinal fraco"
            : "Sinal estável";

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-panel/70 px-4 py-3 text-xs ring-1 ring-line">
      <span className="flex items-center gap-2 font-medium text-cream/90">
        <Activity className="size-4 text-gold" />
        {label}
      </span>
      <div className="flex min-w-40 flex-1 items-center gap-3">
        <span className="text-muted">Buffer</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={TARGET} aria-valuenow={Math.round(stats.buffer)} aria-label="Buffer carregado em segundos">
          <div className={`h-full rounded-full transition-[width] duration-700 ${tone}`} style={{ width: `${pct * 100}%` }} />
        </div>
        <span className="w-9 text-right tabular-nums text-cream/85">{Math.round(stats.buffer)}s</span>
      </div>
      {stats.latency != null && (
        <span className="tabular-nums text-muted">
          {stats.catchingUp ? "Alcançando o ao vivo (1,1×)" : stats.behind ? "Atrasado" : "Ao vivo"} ·{" "}
          {Math.round(stats.latency)}s
        </span>
      )}
      {reconnects > 0 && (
        <span className="text-muted">
          {reconnects} {reconnects === 1 ? "reconexão automática" : "reconexões automáticas"}
        </span>
      )}
    </div>
  );
}

export function PlayerOverlay() {
  const { player } = useCatalog();
  if (!player) return null;
  // key: reinicia o player (estado de fontes/tentativas) a cada troca de canal
  return <PlayerDialog key={player.channel.id} channel={player.channel} queue={player.queue} />;
}

function PlayerDialog({ channel, queue }: { channel: Channel; queue: Channel[] }) {
  const { play, closePlayer } = useCatalog();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const favorites = favoritesStore.useList();
  const isFav = favorites.includes(channel.id);
  const { snapshotRef, ...p } = useStreamPlayer(videoRef, channel.sources);

  const index = queue.findIndex((c) => c.id === channel.id);
  const zap = (delta: number) => {
    if (queue.length < 2) return;
    const next = queue[(index + delta + queue.length) % queue.length];
    play(next, queue);
  };
  const zapRef = useRef(zap);
  useEffect(() => {
    zapRef.current = zap;
  });

  // Trava a rolagem da página e devolve o foco ao fechar
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
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) closePlayer();
      else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        zapRef.current(-1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        zapRef.current(1);
      } else if (e.key.toLowerCase() === "f" && !(e.target instanceof HTMLInputElement)) {
        const v = videoRef.current;
        if (!v) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void v.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePlayer]);

  const category = CATEGORY_MAP[channel.category];
  const live = p.status === "playing" || p.status === "buffering";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Assistindo ${channel.name}`}
      className="fade-in fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink/[0.97] backdrop-blur-xl"
      style={{
        backgroundImage: `radial-gradient(900px 500px at 15% 0%, ${category.tint}33, transparent 65%)`,
      }}
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
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] p-1.5">
            <ChannelLogo name={channel.name} logo={channel.logo} className="size-full" textClassName="text-xs" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight">{channel.name}</h2>
            <p className="truncate text-xs text-muted">
              {category.label}
              {channel.group && channel.group.toLowerCase() !== category.label.toLowerCase()
                ? ` · ${channel.group}`
                : ""}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => favoritesStore.toggle(channel.id)}
            aria-pressed={isFav}
            aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            className={`rounded-xl bg-white/[0.06] p-2.5 transition hover:bg-white/[0.1] ${isFav ? "text-gold" : "text-cream/80"}`}
          >
            <Heart className={`size-5 ${isFav ? "fill-current" : ""}`} />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={closePlayer}
            aria-label="Fechar player"
            className="rounded-xl bg-white/[0.06] p-2.5 text-cream/80 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/60 ring-1 ring-line">
            <video
              ref={videoRef}
              className="size-full bg-black"
              controls={live}
              playsInline
              autoPlay
            />

            {/* Último quadro congelado enquanto o sinal é restabelecido */}
            <canvas
              ref={snapshotRef}
              aria-hidden
              className={`pointer-events-none absolute inset-0 size-full object-contain transition-opacity duration-300 ${
                p.hasSnapshot && !live ? "opacity-100" : "opacity-0"
              }`}
            />

            {(p.status === "reconnecting" || p.status === "buffering") && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
                <div className="flex max-w-full items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-cream shadow-lg ring-1 ring-white/10 backdrop-blur">
                  <LoaderCircle className="size-4 shrink-0 animate-spin text-gold" />
                  <span className="truncate">
                    {p.status === "buffering" ? "Carregando buffer…" : p.detail || "Reconectando…"}
                  </span>
                </div>
              </div>
            )}

            {p.status === "reconnecting" && !p.hasSnapshot && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <ChannelLogo
                  name={channel.name}
                  logo={channel.logo}
                  className="max-h-20 max-w-48 opacity-80"
                  textClassName="text-5xl"
                />
              </div>
            )}

            {p.status === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70">
                <ChannelLogo
                  name={channel.name}
                  logo={channel.logo}
                  className="max-h-20 max-w-48 opacity-90"
                  textClassName="text-5xl"
                />
                <div className="flex items-center gap-2 text-sm text-cream/85">
                  <LoaderCircle className="size-4 animate-spin text-gold" />
                  Sintonizando…
                </div>
                <p className="px-6 text-center text-xs text-muted">{p.detail}</p>
              </div>
            )}

            {p.status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
                <TriangleAlert className="size-8 text-gold" />
                <div>
                  <p className="font-medium">Não foi possível reproduzir este canal agora</p>
                  <p className="mt-1 text-sm text-muted">
                    {p.detail} As listas são públicas e alguns sinais ficam fora do ar de tempos em tempos.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={p.retry}
                    className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-soft"
                  >
                    <RefreshCw className="size-4" /> Tentar de novo
                  </button>
                  {channel.sources.length > 1 && (
                    <button
                      type="button"
                      onClick={p.nextSource}
                      className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2 text-sm transition hover:bg-white/[0.14]"
                    >
                      <SkipForward className="size-4" /> Outra fonte
                    </button>
                  )}
                  {queue.length > 1 && (
                    <button
                      type="button"
                      onClick={() => zap(1)}
                      className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2 text-sm transition hover:bg-white/[0.14]"
                    >
                      <ChevronDown className="size-4" /> Próximo canal
                    </button>
                  )}
                </div>
              </div>
            )}

            {live && p.mutedByPolicy && (
              <button
                type="button"
                onClick={p.unmute}
                className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-lg"
              >
                <VolumeX className="size-4" /> Ativar som
              </button>
            )}

            {live &&
              (p.stats.behind ? (
                <button
                  type="button"
                  onClick={p.goLive}
                  className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream ring-1 ring-white/15 backdrop-blur transition hover:bg-live"
                >
                  <span className="size-1.5 rounded-full bg-cream/60" />
                  Voltar ao vivo
                </button>
              ) : (
                <LiveBadge className="pointer-events-none absolute right-4 top-4" />
              ))}
          </div>

          <LiveHealth stats={p.stats} status={p.status} reconnects={p.reconnects} />

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Fontes</span>
            {channel.sources.map((s, i) => {
              const active = i === p.sourceIndex;
              return (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => p.selectSource(i)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-gold text-ink"
                      : "bg-white/[0.06] text-cream/80 hover:bg-white/[0.12] hover:text-cream"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Dica: use <kbd className="rounded border border-white/15 px-1">↑</kbd>{" "}
            <kbd className="rounded border border-white/15 px-1">↓</kbd> para trocar de canal e{" "}
            <kbd className="rounded border border-white/15 px-1">F</kbd> para tela cheia.
          </p>
        </div>

        <aside className="flex min-h-0 flex-col rounded-3xl bg-panel/80 ring-1 ring-line lg:max-h-[calc(100dvh-7rem)]">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h3 className="text-sm font-semibold">Próximos canais</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => zap(-1)}
                className="rounded-lg p-1.5 text-cream/70 hover:bg-white/[0.08]"
                aria-label="Canal anterior"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => zap(1)}
                className="rounded-lg p-1.5 text-cream/70 hover:bg-white/[0.08]"
                aria-label="Próximo canal"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto px-2 pb-3 lg:max-h-none">
            {queue.map((c) => {
              const active = c.id === channel.id;
              return (
                <li key={c.id}>
                  <button
                    ref={active ? activeItemRef : undefined}
                    type="button"
                    onClick={() => !active && play(c, queue)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      active ? "bg-gold/15 text-gold" : "text-cream/85 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] p-1">
                      <ChannelLogo name={c.name} logo={c.logo} className="size-full" textClassName="text-[10px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    {active && <span className="live-dot size-2 rounded-full bg-live" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
