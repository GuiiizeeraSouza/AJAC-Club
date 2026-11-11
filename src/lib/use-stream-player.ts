"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { buildAttempts, type Attempt } from "./playback";
import type { StreamSource } from "./types";

/* ------------------------------------------------------------------ */
/* Ajustes de buffer / ao vivo                                         */
/* ------------------------------------------------------------------ */

/** Sem avanço do vídeo por este tempo (tocando) = sinal travado → reconecta */
const STALL_RECONNECT_MS = 12_000;
/** Pausado por mais que isto → ao retomar, volta para o ponto ao vivo */
const RESUME_LIVE_AFTER_MS = 3_000;
/** Aba oculta por mais que isto → ao voltar, salta para o ao vivo */
const VISIBLE_LIVE_AFTER_MS = 5_000;
/** Velocidade usada para alcançar o ao vivo quando fica atrasado */
const CATCHUP_RATE = 1.1;
/** Atraso além do limite a partir do qual salta direto para o ao vivo */
const JUMP_TO_LIVE_EXTRA_S = 45;
/** Esperas entre ciclos completos de reconexão (todas as fontes falharam) */
const RECONNECT_BACKOFF_MS = [2_000, 5_000, 10_000];

export type PlayerStatus = "loading" | "playing" | "buffering" | "reconnecting" | "error";

export interface LiveStats {
  /** Segundos de vídeo já carregados à frente do ponto atual */
  buffer: number;
  /** Distância do ponto ao vivo, em segundos (quando conhecida) */
  latency: number | null;
  /** Ficou atrasado em relação ao ao vivo (ex.: após voltar no tempo) */
  behind: boolean;
  /** Reproduzindo um pouco mais rápido para alcançar o ao vivo */
  catchingUp: boolean;
}

export interface PlayerState {
  status: PlayerStatus;
  sourceIndex: number;
  detail: string;
  mutedByPolicy: boolean;
  stats: LiveStats;
  /** Quantas vezes o sinal foi restabelecido automaticamente */
  reconnects: number;
  /** Último quadro congelado na tela durante a reconexão */
  hasSnapshot: boolean;
}

interface Options {
  muted?: boolean;
  autoAdvance?: boolean;
  timeoutMs?: number;
  enabled?: boolean;
  /** Ciclos de reconexão automática antes de exibir erro */
  maxReconnectCycles?: number;
}

interface Session {
  ok: boolean;
  destroy: () => void;
  seekLive: () => void;
  latency: () => number | null;
  /** Atraso aceitável antes de considerar "atrasado" */
  behindThreshold: () => number;
  /** O próprio motor já ajusta a velocidade para seguir o ao vivo */
  engineSyncsLive: boolean;
}

/* ------------------------------------------------------------------ */
/* Utilidades de mídia                                                 */
/* ------------------------------------------------------------------ */

function bufferAhead(video: HTMLVideoElement): number {
  const t = video.currentTime;
  const b = video.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.3 && b.end(i) >= t) return Math.max(0, b.end(i) - t);
  }
  return 0;
}

function bufferedEnd(video: HTMLVideoElement): number | null {
  const b = video.buffered;
  return b.length ? b.end(b.length - 1) : null;
}

function seekNear(video: HTMLVideoElement, end: number | null, margin: number) {
  if (end == null || !Number.isFinite(end)) return;
  const target = Math.max(0, end - margin);
  if (Math.abs(video.currentTime - target) > 1) video.currentTime = target;
}

async function playSafe(video: HTMLVideoElement, onMutedByPolicy: () => void) {
  try {
    await video.play();
  } catch (err) {
    if ((err as DOMException)?.name === "NotAllowedError" && !video.muted) {
      video.muted = true;
      onMutedByPolicy();
      await video.play().catch(() => {});
    }
  }
}

function resetVideo(video: HTMLVideoElement) {
  video.pause();
  video.playbackRate = 1;
  video.removeAttribute("src");
  video.load();
}

/* ------------------------------------------------------------------ */
/* Loader de playlist ciente de redirecionamentos                      */
/* ------------------------------------------------------------------ */

type HlsModule = typeof import("hls.js");
type LoaderCtor = HlsModule["default"]["DefaultConfig"]["loader"];

/**
 * Servidores Xtream respondem a playlist com um redirect para uma URL com
 * token de uso único (/auth/123.m3u8?token=…). O hls.js passaria a recarregar
 * a playlist ao vivo por essa URL — que dá 404 na segunda vez — e o buffer
 * secaria. Este loader lembra a URL original e sempre recarrega por ela,
 * obtendo um token novo a cada atualização.
 */
function redirectAwarePlaylistLoader(Base: LoaderCtor): LoaderCtor {
  const aliases = new Map<string, string>();
  return class RedirectAwareLoader extends Base {
    load(...[context, config, callbacks]: Parameters<InstanceType<LoaderCtor>["load"]>) {
      const requested = aliases.get(context.url) ?? context.url;
      context.url = requested;
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, ctx, details) => {
          if (response.url && response.url !== requested) {
            if (aliases.size > 50) aliases.clear();
            aliases.set(response.url, requested);
          }
          callbacks.onSuccess(response, stats, ctx, details);
        },
      });
    }
  };
}

/* ------------------------------------------------------------------ */
/* Uma tentativa (fonte + motor + rota)                                */
/* ------------------------------------------------------------------ */

async function runAttempt(
  video: HTMLVideoElement,
  attempt: Attempt,
  timeoutMs: number,
  signal: AbortSignal,
  onMutedByPolicy: () => void,
  onFatalAfterStart: (reason: string) => void,
): Promise<Session> {
  let engineDestroy: () => void = () => {};
  let destroyed = false;
  // Idempotente e síncrono: chamado no cleanup antes da próxima tentativa
  // usar o mesmo <video>, evitando que uma tentativa antiga o resete.
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    engineDestroy();
    resetVideo(video);
  };

  const session: Session = {
    ok: false,
    destroy,
    seekLive: () => seekNear(video, bufferedEnd(video), 3),
    latency: () => {
      const end = bufferedEnd(video);
      return end == null ? null : Math.max(0, end - video.currentTime);
    },
    behindThreshold: () => 20,
    engineSyncsLive: false,
  };

  let settle: (ok: boolean) => void = () => {};
  const result = new Promise<boolean>((resolve) => (settle = resolve));
  let started = false;

  const onPlaying = () => {
    started = true;
    settle(true);
  };
  const onAbort = () => {
    destroy();
    settle(false);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  video.addEventListener("playing", onPlaying);
  const timer = window.setTimeout(() => settle(false), timeoutMs);

  const fail = (reason: string) => {
    if (destroyed) return;
    if (started) onFatalAfterStart(reason);
    else settle(false);
  };

  if (attempt.kind === "hls") {
    const { default: Hls } = await import("hls.js");
    if (signal.aborted) {
      // nada foi anexado ao vídeo ainda
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        pLoader: redirectAwarePlaylistLoader(Hls.DefaultConfig.loader) as never,
        enableWorker: true,
        lowLatencyMode: false,
        startPosition: -1,
        // Começa ~3 segmentos atrás do ao vivo (margem de buffer); o alcance
        // gradual quando atrasa é feito pelo monitor do hook, com histerese
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1,
        liveDurationInfinity: true,
        // Buffer à frente estável e histórico curto para não pesar a memória
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        maxBufferHole: 0.5,
        nudgeMaxRetry: 5,
        startFragPrefetch: true,
        // Rede: tolerante a oscilações depois que começou a tocar
        manifestLoadingMaxRetry: 1,
        manifestLoadingTimeOut: 10_000,
        levelLoadingMaxRetry: 4,
        levelLoadingTimeOut: 10_000,
        fragLoadingMaxRetry: 6,
        fragLoadingTimeOut: 20_000,
      });
      let mediaRecoveries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries++;
          if (mediaRecoveries === 2) hls.swapAudioCodec();
          hls.recoverMediaError();
          return;
        }
        fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "Conexão com o sinal perdida." : "Falha na mídia.");
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => void playSafe(video, onMutedByPolicy));
      hls.loadSource(attempt.url);
      hls.attachMedia(video);
      engineDestroy = () => hls.destroy();

      session.seekLive = () => {
        const pos = hls.liveSyncPosition;
        if (pos != null && Number.isFinite(pos)) video.currentTime = pos;
        else seekNear(video, bufferedEnd(video), 3);
      };
      session.latency = () => (Number.isFinite(hls.latency) && hls.latency > 0 ? hls.latency : null);
      session.behindThreshold = () => (hls.targetLatency ?? 30) + 15;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const onError = () => fail("Falha na mídia.");
      video.addEventListener("error", onError);
      video.src = attempt.url;
      void playSafe(video, onMutedByPolicy);
      engineDestroy = () => video.removeEventListener("error", onError);

      const seekableEnd = () => (video.seekable.length ? video.seekable.end(video.seekable.length - 1) : null);
      session.seekLive = () => seekNear(video, seekableEnd(), 6);
      session.latency = () => {
        const end = seekableEnd();
        return end == null ? null : Math.max(0, end - video.currentTime);
      };
      session.behindThreshold = () => 45;
    } else {
      settle(false);
    }
  } else {
    const { default: mpegts } = await import("mpegts.js");
    if (signal.aborted) {
      // nada foi anexado ao vídeo ainda
    } else if (mpegts.getFeatureList().mseLivePlayback) {
      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: true, url: attempt.url },
        {
          enableWorker: true,
          lazyLoad: false,
          // Fila de entrada maior = menos engasgos em redes oscilantes
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 30,
          autoCleanupMinBackwardDuration: 15,
          // Alcança o ao vivo acelerando a reprodução, sem pulos bruscos
          liveSync: true,
          liveSyncMaxLatency: 12,
          liveSyncTargetLatency: 5,
          liveSyncPlaybackRate: 1.15,
          liveBufferLatencyChasing: false,
        },
      );
      player.on(mpegts.Events.ERROR, () => fail("Conexão com o sinal perdida."));
      // Em ao vivo o carregamento nunca deveria "terminar": o servidor fechou a conexão
      player.on(mpegts.Events.LOADING_COMPLETE, () => fail("A fonte encerrou a transmissão."));
      player.attachMediaElement(video);
      player.load();
      void playSafe(video, onMutedByPolicy);
      session.engineSyncsLive = true;
      engineDestroy = () => {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch {
          /* já destruído */
        }
      };
    } else {
      settle(false);
    }
  }

  const ok = await result;
  window.clearTimeout(timer);
  video.removeEventListener("playing", onPlaying);
  signal.removeEventListener("abort", onAbort);
  if (!ok) destroy();
  session.ok = ok && !signal.aborted;
  return session;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const EMPTY_STATS: LiveStats = { buffer: 0, latency: null, behind: false, catchingUp: false };

/**
 * Player de TV ao vivo: tenta cada fonte e forma de acesso até uma tocar,
 * mantém a reprodução perto do ponto ao vivo e se reconecta sozinho quando
 * o sinal trava ou cai, mantendo o último quadro na tela.
 */
export function useStreamPlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  sources: StreamSource[],
  {
    muted = false,
    autoAdvance = true,
    timeoutMs = 15_000,
    enabled = true,
    maxReconnectCycles = RECONNECT_BACKOFF_MS.length,
  }: Options = {},
) {
  const [state, setState] = useState<PlayerState>({
    status: "loading",
    sourceIndex: 0,
    detail: "Conectando…",
    mutedByPolicy: false,
    stats: EMPTY_STATS,
    reconnects: 0,
    hasSnapshot: false,
  });
  const [request, setRequest] = useState({ index: 0, token: 0, reconnect: false });
  const sessionRef = useRef<Session | null>(null);
  const snapshotRef = useRef<HTMLCanvasElement>(null);
  const currentSourceRef = useRef(0);
  const failedCyclesRef = useRef(0);
  const statusRef = useRef<PlayerStatus>("loading");
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  /** Congela o último quadro num canvas para a troca de sinal não ficar preta */
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = snapshotRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return false;
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return true;
    } catch {
      return false;
    }
  }, [videoRef]);

  const reconnect = useCallback(
    (reason: string) => {
      const snap = captureFrame();
      setState((s) => ({ ...s, status: "reconnecting", detail: reason, hasSnapshot: snap || s.hasSnapshot }));
      setRequest((r) => ({ index: currentSourceRef.current, token: r.token + 1, reconnect: true }));
    },
    [captureFrame],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled || sources.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();
    const disposers: (() => void)[] = [];
    video.muted = muted;

    /** Acompanha a reprodução depois que o sinal entra no ar */
    const monitor = (session: Session) => {
      let lastTime = video.currentTime;
      let lastProgressAt = performance.now();
      let pausedAt: number | null = null;
      let hiddenAt: number | null = null;

      const tick = window.setInterval(() => {
        const now = performance.now();
        if (video.paused || video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          lastProgressAt = now;
        } else if (now - lastProgressAt > STALL_RECONNECT_MS) {
          window.clearInterval(tick);
          reconnect("O sinal travou — reconectando…");
          return;
        }
        const latency = session.latency();
        const buffer = bufferAhead(video);
        const threshold = session.behindThreshold();

        // Mantém o ao vivo: acelera de leve quando atrasa, volta ao normal perto
        // do ponto ao vivo (histerese) e salta se o atraso ficar grande demais.
        if (!session.engineSyncsLive && latency != null && !video.paused) {
          if (latency > threshold + JUMP_TO_LIVE_EXTRA_S) {
            video.playbackRate = 1;
            session.seekLive();
          } else if (video.playbackRate === 1 && latency > threshold && buffer > 3) {
            video.playbackRate = CATCHUP_RATE;
          } else if (video.playbackRate !== 1 && (latency < threshold - 10 || buffer < 2)) {
            video.playbackRate = 1;
          }
        }

        setState((s) => ({
          ...s,
          stats: {
            buffer,
            latency,
            behind: latency != null && latency > threshold,
            catchingUp: video.playbackRate > 1,
          },
        }));
      }, 1000);

      const onWaiting = () =>
        setState((s) => (s.status === "playing" ? { ...s, status: "buffering", detail: "Carregando buffer…" } : s));
      const onPlaying = () => setState((s) => ({ ...s, status: "playing", detail: "", hasSnapshot: false }));
      const onPause = () => {
        pausedAt = performance.now();
      };
      const onPlay = () => {
        if (pausedAt && performance.now() - pausedAt > RESUME_LIVE_AFTER_MS) session.seekLive();
        pausedAt = null;
      };
      const onVisibility = () => {
        if (document.hidden) {
          hiddenAt = performance.now();
        } else if (hiddenAt && performance.now() - hiddenAt > VISIBLE_LIVE_AFTER_MS) {
          session.seekLive();
          if (video.paused) void video.play().catch(() => {});
          hiddenAt = null;
        }
      };

      video.addEventListener("waiting", onWaiting);
      video.addEventListener("playing", onPlaying);
      video.addEventListener("pause", onPause);
      video.addEventListener("play", onPlay);
      document.addEventListener("visibilitychange", onVisibility);
      disposers.push(() => {
        window.clearInterval(tick);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("play", onPlay);
        document.removeEventListener("visibilitychange", onVisibility);
      });
    };

    const run = async () => {
      const https = window.location.protocol === "https:";
      const total = sources.length;
      // Começa pela fonte pedida (ou a que estava tocando) e percorre as demais
      const order = autoAdvance
        ? Array.from({ length: total }, (_, k) => (request.index + k) % total)
        : [request.index];

      for (const si of order) {
        const attempts = buildAttempts(sources[si].url, https);
        for (const a of attempts) {
          if (cancelled) return;
          setState((s) => ({
            ...s,
            status: request.reconnect ? "reconnecting" : "loading",
            sourceIndex: si,
            stats: EMPTY_STATS,
            detail: `${request.reconnect ? "Reconectando · " : ""}Fonte ${si + 1}/${total} · ${sources[si].label} · ${a.kind.toUpperCase()} ${a.via}`,
          }));

          const session = await runAttempt(
            video,
            a,
            timeoutMs,
            controller.signal,
            () => !cancelled && setState((s) => ({ ...s, mutedByPolicy: true })),
            (reason) => !cancelled && reconnect(reason),
          );
          if (cancelled) return;

          if (session.ok) {
            sessionRef.current = session;
            currentSourceRef.current = si;
            failedCyclesRef.current = 0;
            setState((s) => ({
              ...s,
              status: "playing",
              sourceIndex: si,
              detail: "",
              hasSnapshot: false,
              reconnects: request.reconnect ? s.reconnects + 1 : s.reconnects,
            }));
            monitor(session);
            return;
          }
        }
      }

      if (cancelled) return;
      // Nenhuma fonte respondeu neste ciclo
      const cycle = failedCyclesRef.current++;
      if (request.reconnect && cycle < maxReconnectCycles) {
        const wait = RECONNECT_BACKOFF_MS[Math.min(cycle, RECONNECT_BACKOFF_MS.length - 1)];
        setState((s) => ({
          ...s,
          status: "reconnecting",
          detail: `Sinal instável — nova tentativa em ${Math.round(wait / 1000)}s…`,
        }));
        const t = window.setTimeout(
          () => setRequest((r) => ({ index: currentSourceRef.current, token: r.token + 1, reconnect: true })),
          wait,
        );
        disposers.push(() => window.clearTimeout(t));
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        hasSnapshot: false,
        detail: request.reconnect ? "O sinal caiu e não voltou." : "Nenhuma fonte respondeu agora.",
      }));
    };

    // Internet voltou: reconecta na hora se estiver aguardando
    const onOnline = () => {
      if (statusRef.current === "error" || statusRef.current === "reconnecting") {
        failedCyclesRef.current = 0;
        setRequest((r) => ({ index: currentSourceRef.current, token: r.token + 1, reconnect: true }));
      }
    };
    const onOffline = () =>
      setState((s) => ({ ...s, detail: "Sem conexão com a internet — aguardando a rede voltar…" }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      disposers.forEach((d) => d());
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [videoRef, sources, request, muted, autoAdvance, timeoutMs, enabled, maxReconnectCycles, reconnect]);

  const selectSource = useCallback((index: number) => {
    failedCyclesRef.current = 0;
    setRequest((r) => ({ index, token: r.token + 1, reconnect: false }));
  }, []);

  const retry = useCallback(() => {
    failedCyclesRef.current = 0;
    setRequest((r) => ({ index: currentSourceRef.current, token: r.token + 1, reconnect: false }));
  }, []);

  const nextSource = useCallback(() => {
    failedCyclesRef.current = 0;
    setRequest((r) => ({
      index: (currentSourceRef.current + 1) % Math.max(sources.length, 1),
      token: r.token + 1,
      reconnect: false,
    }));
  }, [sources.length]);

  const goLive = useCallback(() => {
    if (videoRef.current) videoRef.current.playbackRate = 1;
    sessionRef.current?.seekLive();
    void videoRef.current?.play().catch(() => {});
  }, [videoRef]);

  const unmute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      void video.play().catch(() => {});
    }
    setState((s) => ({ ...s, mutedByPolicy: false }));
  }, [videoRef]);

  return { ...state, snapshotRef, selectSource, retry, nextSource, goLive, unmute };
}
