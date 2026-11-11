"use client";

import { Heart, Play } from "lucide-react";
import { CATEGORY_MAP } from "@/lib/categories";
import { favoritesStore } from "@/lib/local-store";
import type { Channel } from "@/lib/types";
import { useCatalog } from "./catalog-provider";
import { ChannelLogo } from "./channel-logo";

export function LiveBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream backdrop-blur ${className}`}
    >
      <span className="live-dot size-1.5 rounded-full bg-live" />
      Ao vivo
    </span>
  );
}

export function ChannelCard({
  channel,
  queue,
  size = "md",
}: {
  channel: Channel;
  queue?: Channel[];
  size?: "md" | "wide" | "grid";
}) {
  const { play } = useCatalog();
  const favorites = favoritesStore.useList();
  const isFav = favorites.includes(channel.id);
  const tint = CATEGORY_MAP[channel.category].tint;

  const sizeClass =
    size === "wide"
      ? "w-[19rem] sm:w-[23rem] shrink-0"
      : size === "md"
        ? "w-[11.5rem] sm:w-[13.5rem] shrink-0"
        : "w-full";

  return (
    <div className={`group relative ${sizeClass}`}>
      <button
        type="button"
        onClick={() => play(channel, queue)}
        className="relative block h-56 w-full overflow-hidden rounded-[1.75rem] text-left ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-2 hover:ring-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:h-64"
        style={{
          background: `radial-gradient(120% 90% at 50% 18%, ${tint}55, transparent 70%), linear-gradient(160deg, #221e16, #100e0b)`,
        }}
        aria-label={`Assistir ${channel.name}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3.5">
          <LiveBadge />
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-8 pb-10 pt-12">
          <ChannelLogo
            name={channel.name}
            logo={channel.logo}
            className="max-h-24 w-full transition duration-300 group-hover:scale-105"
            textClassName="text-4xl"
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-4 pt-10">
          <p className="truncate text-[15px] font-semibold text-cream">{channel.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {channel.sources.length} {channel.sources.length === 1 ? "fonte" : "fontes"} ·{" "}
            {CATEGORY_MAP[channel.category].short}
          </p>
        </div>

        <span
          aria-hidden
          className="absolute bottom-4 right-4 flex size-10 translate-y-2 items-center justify-center rounded-full bg-gold text-ink opacity-0 shadow-lg shadow-black/40 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Play className="size-4 fill-current" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => favoritesStore.toggle(channel.id)}
        aria-pressed={isFav}
        aria-label={isFav ? `Remover ${channel.name} dos favoritos` : `Favoritar ${channel.name}`}
        className={`absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/55 backdrop-blur transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
          isFav ? "text-gold" : "text-cream/70 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        }`}
      >
        <Heart className={`size-4 ${isFav ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}
