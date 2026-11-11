"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Channel } from "@/lib/types";
import { ChannelCard } from "./channel-card";

export function ChannelRow({
  title,
  href,
  channels,
  icon,
  limit = 14,
}: {
  title: string;
  href?: string;
  channels: Channel[];
  icon?: React.ReactNode;
  limit?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  if (channels.length === 0) return null;
  const shown = channels.slice(0, limit);

  const scroll = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section className="mt-12" aria-label={title}>
      <div className="mb-5 flex items-center gap-3">
        {icon && <span className="text-gold">{icon}</span>}
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="text-sm text-muted">{channels.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="hidden rounded-full p-2 text-cream/60 transition hover:bg-white/[0.08] hover:text-cream md:block"
            aria-label={`Rolar ${title} para a esquerda`}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="hidden rounded-full p-2 text-cream/60 transition hover:bg-white/[0.08] hover:text-cream md:block"
            aria-label={`Rolar ${title} para a direita`}
          >
            <ChevronRight className="size-5" />
          </button>
          {href && (
            <Link
              href={href}
              className="ml-2 text-[15px] font-medium text-cream transition hover:text-gold"
            >
              Ver todos
            </Link>
          )}
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&>*]:snap-start"
      >
        {shown.map((c, i) => (
          <ChannelCard key={c.id} channel={c} queue={channels} size={i === 0 ? "wide" : "md"} />
        ))}
      </div>
    </section>
  );
}
