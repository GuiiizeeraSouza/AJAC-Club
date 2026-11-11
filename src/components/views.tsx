"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Clapperboard, Heart, History, MonitorPlay } from "lucide-react";
import { CATEGORIES, CATEGORY_MAP } from "@/lib/categories";
import { favoritesStore, recentsStore } from "@/lib/local-store";
import type { CategoryId, Channel } from "@/lib/types";
import { byPopularity, useCatalog } from "./catalog-provider";
import { ChannelCard } from "./channel-card";
import { ChannelRow } from "./channel-row";
import { CategoryIcon } from "./category-icon";
import { Hero } from "./hero";
import { ContinueWatchingRow, VodRow } from "./vod/vod-browser";

function useChannelList(ids: string[]): Channel[] {
  const { byId } = useCatalog();
  return useMemo(() => ids.map((id) => byId.get(id)).filter((c): c is Channel => !!c), [ids, byId]);
}

function CategoryChips({ active }: { active?: CategoryId }) {
  const { byCategory } = useCatalog();
  return (
    <nav aria-label="Categorias" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {[
        { href: "/filmes", label: "Filmes", icon: <Clapperboard className="size-4" /> },
        { href: "/series", label: "Séries", icon: <MonitorPlay className="size-4" /> },
      ].map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex shrink-0 items-center gap-2 rounded-full bg-gold/15 px-4 py-2 text-sm text-gold ring-1 ring-gold/30 transition hover:bg-gold/25"
        >
          {l.icon}
          {l.label}
        </Link>
      ))}
      {CATEGORIES.filter((c) => byCategory[c.id].length > 0).map((c) => (
        <Link
          key={c.id}
          href={`/categoria/${c.id}`}
          aria-current={active === c.id ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 transition ${
            active === c.id
              ? "bg-gold text-ink ring-gold"
              : "bg-white/[0.05] text-cream/85 ring-line hover:bg-white/[0.1]"
          }`}
        >
          <CategoryIcon id={c.id} className="size-4" />
          {c.label}
        </Link>
      ))}
    </nav>
  );
}

export function HomeView() {
  const { byCategory: alphabetical } = useCatalog();
  const byCategory = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(alphabetical).map(([k, list]) => [k, byPopularity(list)]),
      ) as Record<CategoryId, Channel[]>,
    [alphabetical],
  );
  const recents = useChannelList(recentsStore.useList());
  const favorites = useChannelList(favoritesStore.useList());

  return (
    <div className="fade-in">
      <Hero />
      <div className="mt-8 lg:hidden">
        <CategoryChips />
      </div>
      <ChannelRow
        title="Continue assistindo"
        channels={recents}
        icon={<History className="size-5" />}
      />
      <ChannelRow
        title="Seus favoritos"
        href="/favoritos"
        channels={favorites}
        icon={<Heart className="size-5" />}
      />
      <ContinueWatchingRow />
      {CATEGORIES.map((c, i) => (
        <Fragment key={c.id}>
          <ChannelRow
            title={c.label}
            href={`/categoria/${c.id}`}
            channels={byCategory[c.id]}
            icon={<CategoryIcon id={c.id} className="size-5" />}
          />
          {i === 0 && <VodRow kind="series" title="Séries em destaque" />}
          {i === 1 && <VodRow kind="movie" title="Filmes em destaque" />}
        </Fragment>
      ))}
    </div>
  );
}

function GridHeader({
  title,
  subtitle,
  icon,
  tint,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[2rem] p-6 ring-1 ring-line sm:p-8"
      style={{
        background: `radial-gradient(80% 140% at 100% 0%, ${tint}aa, transparent 65%), radial-gradient(60% 120% at 0% 100%, rgba(212,175,55,0.25), transparent 60%), #15120d`,
      }}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-black/40 text-gold ring-1 ring-white/10">
          {icon}
        </span>
        <div>
          <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-cream/80">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

export function CategoryView({ id }: { id: CategoryId }) {
  const { byCategory } = useCatalog();
  const cat = CATEGORY_MAP[id];
  const channels = byCategory[id];
  const groups = useMemo(
    () => Array.from(new Set(channels.map((c) => c.group).filter(Boolean))).sort(),
    [channels],
  );
  const [group, setGroup] = useState<string | null>(null);
  const visible = group ? channels.filter((c) => c.group === group) : channels;

  return (
    <div className="fade-in flex flex-col gap-6">
      <CategoryChips active={id} />
      <GridHeader
        title={cat.label}
        subtitle={`${channels.length} canais · ${cat.description}`}
        icon={<CategoryIcon id={id} className="size-6" />}
        tint={cat.tint}
      />

      {groups.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {[null, ...groups].map((g) => (
            <button
              key={g ?? "todos"}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                group === g ? "bg-cream text-ink" : "bg-white/[0.05] text-cream/80 hover:bg-white/[0.1]"
              }`}
            >
              {g ?? "Todos"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {visible.map((c) => (
          <ChannelCard key={c.id} channel={c} queue={visible} size="grid" />
        ))}
      </div>
    </div>
  );
}

export function FavoritesView() {
  const favorites = useChannelList(favoritesStore.useList());
  const recents = useChannelList(recentsStore.useList());

  return (
    <div className="fade-in flex flex-col gap-6">
      <GridHeader
        title="Favoritos"
        subtitle="Seus canais salvos neste navegador."
        icon={<Heart className="size-6" />}
        tint="#8a6a1c"
      />
      {favorites.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center">
          <Heart className="mx-auto size-8 text-gold" />
          <p className="mt-3 font-medium">Nenhum favorito ainda</p>
          <p className="mt-1 text-sm text-muted">
            Toque no coração de um canal para encontrá-lo aqui rapidamente.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft"
          >
            Explorar canais
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {favorites.map((c) => (
            <ChannelCard key={c.id} channel={c} queue={favorites} size="grid" />
          ))}
        </div>
      )}
      <ChannelRow title="Assistidos recentemente" channels={recents} icon={<History className="size-5" />} />
    </div>
  );
}
