"use client";

import { useState } from "react";
import { proxiedImage } from "@/lib/playback";

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => (/^\d+$/.test(w) ? w : w[0]))
    .join("")
    .toUpperCase();
}

export function ChannelLogo({
  name,
  logo,
  className = "",
  textClassName = "text-xl",
}: {
  name: string;
  logo: string | null;
  className?: string;
  textClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = proxiedImage(logo);

  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden
        className={`flex items-center justify-center font-display tracking-wide text-cream/90 ${textClassName} ${className}`}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    // Logos vêm de dezenas de hosts externos via /api/img; next/image não agrega aqui.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${className}`}
    />
  );
}
