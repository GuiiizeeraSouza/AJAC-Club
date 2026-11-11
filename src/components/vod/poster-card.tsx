"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { proxiedImage } from "@/lib/playback";

/** Capa 2:3 com degradê de reserva quando a imagem não carrega */
export function Poster({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = proxiedImage(src);
  if (!url || failed === url) {
    return (
      <div
        className={`flex items-end bg-[radial-gradient(120%_80%_at_50%_0%,rgba(212,175,55,0.35),transparent_60%),linear-gradient(160deg,#2a2418,#0f0d0a)] p-3 ${className}`}
      >
        <span className="line-clamp-3 font-display text-lg leading-tight text-cream/90">{title}</span>
      </div>
    );
  }
  return (
    // Capas vêm de vários hosts externos; next/image não agrega aqui.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(url)}
      className={`object-cover ${className}`}
    />
  );
}

export function PosterCard({
  title,
  poster,
  meta,
  badges = [],
  progress,
  onClick,
  size = "grid",
}: {
  title: string;
  poster: string | null;
  meta: string;
  badges?: string[];
  /** 0–1: quanto já foi assistido */
  progress?: number;
  onClick: () => void;
  size?: "grid" | "row";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block text-left focus-visible:outline-none ${
        size === "row" ? "w-36 shrink-0 sm:w-44" : "w-full"
      }`}
      aria-label={`${title} — ${meta}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-panel ring-1 ring-line transition duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-gold/70 group-focus-visible:ring-2 group-focus-visible:ring-gold">
        <Poster src={poster} title={title} className="size-full transition duration-500 group-hover:scale-105" />
        {badges.length > 0 && (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream backdrop-blur"
              >
                {b}
              </span>
            ))}
          </div>
        )}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition duration-300 group-hover:bg-black/35 group-hover:opacity-100"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-gold text-ink shadow-xl">
            <Play className="size-5 fill-current" />
          </span>
        </span>
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-cream">{title}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>
    </button>
  );
}

export function movieBadges(labels: string[]) {
  const set = new Set(labels);
  const out: string[] = [];
  if (set.has("4K")) out.push("4K");
  if (set.has("Legendado") && set.size === 1) out.push("Leg");
  return out;
}
