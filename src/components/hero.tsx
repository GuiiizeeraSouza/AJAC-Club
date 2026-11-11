"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Play, Plus } from "lucide-react";
import { CATEGORY_MAP } from "@/lib/categories";
import { useStreamPlayer } from "@/lib/use-stream-player";
import type { Channel } from "@/lib/types";
import { useCatalog } from "./catalog-provider";
import { LiveBadge } from "./channel-card";
import { ChannelLogo } from "./channel-logo";

/** Canais em destaque no banner, por id (os ausentes na lista são ignorados) */
const FEATURED_IDS = [
  "sportv",
  "premiereclubes",
  "espn",
  "hbo",
  "telecinepremium",
  "globonews",
  "discoverychannel",
  "cartoonnetwork",
  "cnnbrasil",
  "multishow",
];

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Prévia ao vivo, sem som, por trás do banner (apenas desktop) */
function LivePreview({ channel, enabled }: { channel: Channel; enabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Chave pelas URLs: a lista se atualiza sozinha e não deve reiniciar a prévia à toa
  const sourceKey = channel.sources
    .slice(0, 2)
    .map((s) => s.url)
    .join("\n");
  const sources = useMemo(
    () => sourceKey.split("\n").map((url, i) => ({ label: `Prévia ${i + 1}`, url })),
    [sourceKey],
  );
  const { status } = useStreamPlayer(videoRef, sources, {
    muted: true,
    autoAdvance: true,
    timeoutMs: 12_000,
    enabled,
    maxReconnectCycles: 1,
  });
  const visible = enabled && (status === "playing" || status === "buffering" || status === "reconnecting");
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-hidden
      tabIndex={-1}
      className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

export function Hero() {
  const { byId, channels, play, player } = useCatalog();
  const featured = useMemo(() => {
    const list = FEATURED_IDS.map((id) => byId.get(id)).filter((c): c is Channel => !!c);
    return list.length >= 3 ? list : channels.slice(0, 6);
  }, [byId, channels]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (paused || reducedMotion || featured.length < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % featured.length), 14_000);
    return () => window.clearInterval(t);
  }, [paused, reducedMotion, featured.length]);

  if (featured.length === 0) return null;
  const current = featured[index % featured.length];
  const side = [1, 2].map((d) => featured[(index + d) % featured.length]);
  const cat = CATEGORY_MAP[current.category];
  const qualities = Array.from(
    new Set(current.sources.map((s) => s.label.split(" · ")[0]).filter((l) => l !== "Auto")),
  );

  return (
    <section
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carrossel"
      aria-label="Canais em destaque"
    >
      <div>
        <div
          className="relative isolate h-[19rem] overflow-hidden rounded-[2rem] ring-1 ring-line sm:h-[23rem] lg:h-[26rem]"
          style={{
            background: `radial-gradient(90% 120% at 85% 60%, ${cat.tint}aa, transparent 60%), linear-gradient(120deg, #1b1710 0%, #0f0d0a 55%, #1d160b 100%)`,
          }}
        >
          <Image
            src="/brand/ajac-jaguar.png"
            alt=""
            width={1200}
            height={658}
            priority
            className="pointer-events-none absolute -bottom-6 -right-10 w-[78%] max-w-[44rem] opacity-90 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] sm:-right-6 sm:w-[62%]"
          />
          <LivePreview key={current.id} channel={current} enabled={isDesktop && !player} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

          <div className="relative flex h-full flex-col p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {[cat.label, ...qualities.slice(0, 3)].map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-black/45 px-4 py-1.5 text-sm text-cream/95 ring-1 ring-white/10 backdrop-blur-md"
                >
                  {t}
                </span>
              ))}
              {qualities.length > 3 && (
                <span className="flex size-8 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/10 backdrop-blur-md">
                  <Plus className="size-4" />
                </span>
              )}
            </div>

            <div key={current.id} className="fade-in mt-auto flex items-end gap-5">
              <div className="min-w-0">
                <ChannelLogo
                  name={current.name}
                  logo={current.logo}
                  className="mb-4 h-16 max-w-[12rem] sm:h-20"
                  textClassName="hidden"
                />
                <h1 className="font-display text-4xl leading-[0.95] tracking-wide text-cream drop-shadow-lg sm:text-6xl">
                  {current.name}
                </h1>
                <div className="mt-4 flex items-center gap-3">
                  <LiveBadge />
                  <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-cream/85 backdrop-blur">
                    {current.sources.length} {current.sources.length === 1 ? "fonte" : "fontes"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => play(current)}
                className="ml-auto hidden shrink-0 items-center gap-2 rounded-2xl bg-gold px-6 py-3.5 font-semibold text-ink shadow-xl shadow-black/40 transition hover:bg-gold-soft sm:flex xl:hidden"
              >
                <Play className="size-4 fill-current" /> Assistir
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Escolher destaque">
          {featured.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={c.name}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-7 bg-gold" : "w-1.5 bg-cream/30 hover:bg-cream/60"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr] xl:grid-cols-1 xl:grid-rows-[auto_1fr]">
        <div
          className="relative overflow-hidden rounded-[1.75rem] p-6 ring-1 ring-line"
          style={{
            background: `radial-gradient(70% 90% at 100% 40%, ${cat.tint}cc, transparent 70%), radial-gradient(80% 120% at 0% 100%, rgba(212,175,55,0.55), transparent 65%), #17140e`,
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">Em destaque</p>
          <h2 className="mt-2 text-2xl font-semibold">{current.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-cream/85">{cat.description}</p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => play(current)}
              className="flex items-center gap-2 rounded-xl bg-black/55 px-5 py-3 text-sm font-medium text-cream ring-1 ring-white/10 backdrop-blur transition hover:bg-black/75"
            >
              <Play className="size-4 fill-current text-gold" /> Assistir agora
            </button>
            <span className="text-xs text-cream/70">{qualities.join(" · ") || "Ao vivo"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {side.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setIndex(featured.indexOf(c))}
              className="group relative flex min-h-36 items-center justify-center overflow-hidden rounded-[1.5rem] p-5 ring-1 ring-line transition hover:ring-gold/60"
              style={{
                background: `radial-gradient(100% 100% at 50% 20%, ${CATEGORY_MAP[c.category].tint}66, transparent 70%), #15120d`,
              }}
              aria-label={`Destacar ${c.name}`}
            >
              <ChannelLogo
                name={c.name}
                logo={c.logo}
                className="max-h-14 w-full transition group-hover:scale-105"
                textClassName="text-2xl"
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-6 text-left text-xs font-medium text-cream/90">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
