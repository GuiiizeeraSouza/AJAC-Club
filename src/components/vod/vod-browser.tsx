"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, LoaderCircle, MonitorPlay, Search, ServerCrash, X } from "lucide-react";
import {
  episodeCode,
  removeWatch,
  useDebounced,
  useVodList,
  useWatchList,
  type VodSortOption,
} from "@/lib/vod/client";
import type { VodKind, VodMovie, VodSeries, VodStatus } from "@/lib/vod/types";
import { movieBadges, PosterCard } from "./poster-card";
import { useVod } from "./vod-provider";

const nf = new Intl.NumberFormat("pt-BR");

/* ------------------------------------------------------------------ */
/* Estados do índice                                                   */
/* ------------------------------------------------------------------ */

export function IndexingNotice({ status }: { status: VodStatus | null }) {
  const p = status?.progress;
  const pct = p?.totalBytes ? Math.min(1, p.bytes / p.totalBytes) : null;
  return (
    <div className="rounded-3xl bg-panel/80 p-6 ring-1 ring-line sm:p-8">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-gold" />
        <p className="font-medium">Preparando o catálogo de filmes e séries…</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Na primeira vez, as listas completas (mais de 300 MB, mais de 1 milhão de entradas) são baixadas e
        organizadas no servidor. Isso leva cerca de um minuto e depois fica salvo.
      </p>
      {p && (
        <div className="mt-5">
          <div className="flex justify-between text-xs text-muted">
            <span>
              Arquivo {p.fileIndex + 1} de {p.fileCount}: {p.file}
            </span>
            <span className="tabular-nums">
              {(p.bytes / 1048576).toFixed(0)}
              {p.totalBytes ? ` / ${(p.totalBytes / 1048576).toFixed(0)}` : ""} MB
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${((p.fileIndex + (pct ?? 0)) / p.fileCount) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UnavailableNotice({ kind, status }: { kind: VodKind; status: VodStatus }) {
  const total = kind === "movie" ? status.counts.movies : status.counts.series;
  const servers = status.health.servers.filter((s) => s.kind === kind);
  const checked = status.health.checkedAt
    ? new Date(status.health.checkedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : null;
  return (
    <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
      <ServerCrash className="mx-auto size-8 text-gold" />
      <p className="mt-3 font-medium">
        Nenhum{kind === "movie" ? " filme" : "a série"} disponível no momento
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
        O catálogo tem {nf.format(total)} {kind === "movie" ? "filmes" : "séries"} indexados, mas os servidores que
        hospedam esses arquivos não estão respondendo
        {checked ? ` (verificado às ${checked})` : ""}. Eles são verificados a cada 20 minutos e os títulos
        aparecem aqui sozinhos quando voltarem.
      </p>
      {servers.length > 0 && (
        <ul className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2 text-xs">
          {servers.map((s) => (
            <li key={s.server} className="rounded-full bg-white/[0.05] px-3 py-1 text-muted">
              <span className={`mr-1.5 inline-block size-1.5 rounded-full ${s.ok ? "bg-emerald-400" : "bg-live"}`} />
              {s.server} · {nf.format(s.items)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página de catálogo                                                  */
/* ------------------------------------------------------------------ */

export function VodBrowser({ kind }: { kind: VodKind }) {
  const { playMovie, showSeries } = useVod();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<VodSortOption>("destaques");
  const [showAllFacets, setShowAllFacets] = useState(false);
  const query = useDebounced(q.trim(), 300);
  const list = useVodList(kind, { q: query, filter, sort });
  const sentinel = useRef<HTMLDivElement>(null);
  const isMovie = kind === "movie";

  // Rolagem infinita
  const { loadMore } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "800px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const status = list.status;
  const available = status ? (isMovie ? status.counts.moviesAvailable : status.counts.seriesAvailable) : 0;
  const facets = showAllFacets ? list.facets : list.facets.slice(0, 14);

  return (
    <div className="fade-in flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-[2rem] p-6 ring-1 ring-line sm:p-8 [background:radial-gradient(80%_140%_at_100%_0%,rgba(138,47,59,0.7),transparent_65%),radial-gradient(60%_120%_at_0%_100%,rgba(212,175,55,0.25),transparent_60%),#15120d]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-black/40 text-gold ring-1 ring-white/10">
            {isMovie ? <Clapperboard className="size-6" /> : <MonitorPlay className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{isMovie ? "Filmes" : "Séries"}</h1>
            <p className="mt-1 text-sm text-cream/80">
              {status?.ready
                ? `${nf.format(available)} disponíveis agora de ${nf.format(isMovie ? status.counts.movies : status.counts.series)} no catálogo`
                : "Catálogo sob demanda"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-4 size-[18px] text-cream/50" aria-hidden />
            <span className="sr-only">Buscar {isMovie ? "filmes" : "séries"}</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isMovie ? "Buscar filmes…" : "Buscar séries…"}
              className="h-11 w-full rounded-xl bg-black/40 pl-11 pr-10 text-sm text-cream outline-none ring-1 ring-white/10 transition placeholder:text-cream/40 focus:ring-gold/60 [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 rounded-md p-1 text-cream/60 hover:text-cream"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as VodSortOption)}
            className="h-11 rounded-xl bg-black/40 px-4 text-sm text-cream outline-none ring-1 ring-white/10 focus:ring-gold/60"
            aria-label="Ordenar"
          >
            <option value="destaques">Destaques</option>
            <option value="recentes">Mais recentes</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      {list.facets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ name: null as string | null, count: 0 }, ...facets].map((f) => (
            <button
              key={f.name ?? "todos"}
              type="button"
              onClick={() => setFilter(f.name)}
              aria-pressed={filter === f.name}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                filter === f.name ? "bg-cream text-ink" : "bg-white/[0.05] text-cream/80 hover:bg-white/[0.1]"
              }`}
            >
              {f.name ?? "Todos"}
              {f.name && <span className="ml-1.5 text-xs opacity-60">{nf.format(f.count)}</span>}
            </button>
          ))}
          {list.facets.length > 14 && (
            <button
              type="button"
              onClick={() => setShowAllFacets((v) => !v)}
              className="rounded-full px-4 py-1.5 text-sm text-gold hover:text-gold-soft"
            >
              {showAllFacets ? "Menos" : `+${list.facets.length - 14}`}
            </button>
          )}
        </div>
      )}

      {status && !status.ready && <IndexingNotice status={status} />}
      {status?.ready && available === 0 && !status.health.checking && <UnavailableNotice kind={kind} status={status} />}

      {status?.ready && list.total === 0 && available > 0 && !list.loading && (
        <p className="py-10 text-center text-sm text-muted">Nada encontrado com esses filtros.</p>
      )}

      {list.items.length > 0 && (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {nf.format(list.total)} {isMovie ? (list.total === 1 ? "filme" : "filmes") : list.total === 1 ? "série" : "séries"}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7">
            {isMovie
              ? (list.items as VodMovie[]).map((m) => (
                  <PosterCard
                    key={m.id}
                    title={m.title}
                    poster={m.poster}
                    meta={[m.year, m.genres.find((g) => g !== "Lançamentos" && g !== "4K")].filter(Boolean).join(" · ") || "Filme"}
                    badges={movieBadges(m.sources.map((s) => s.label))}
                    onClick={() => playMovie(m)}
                  />
                ))
              : (list.items as VodSeries[]).map((s) => (
                  <PosterCard
                    key={s.id}
                    title={s.title}
                    poster={s.poster}
                    meta={`${s.platform} · ${s.seasons} ${s.seasons === 1 ? "temp." : "temps."}`}
                    onClick={() => showSeries(s)}
                  />
                ))}
          </div>
        </>
      )}

      <div ref={sentinel} aria-hidden className="h-1" />
      {list.loading && status?.ready !== false && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin text-gold" /> Carregando…
        </div>
      )}
      {list.error && (
        <div className="flex items-center justify-center gap-3 py-6 text-sm text-muted">
          {list.error}
          <button type="button" onClick={list.retry} className="font-semibold text-gold hover:text-gold-soft">
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fileiras (home)                                                     */
/* ------------------------------------------------------------------ */

function RowShell({
  title,
  href,
  icon,
  children,
}: {
  title: string;
  href?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="mt-12" aria-label={title}>
      <div className="mb-5 flex items-center gap-3">
        <span className="text-gold">{icon}</span>
        <h2 className="text-xl font-semibold">{title}</h2>
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
            <Link href={href} className="ml-2 text-[15px] font-medium text-cream transition hover:text-gold">
              Ver todos
            </Link>
          )}
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&>*]:snap-start"
      >
        {children}
      </div>
    </section>
  );
}

export function VodRow({ kind, title, filter = null }: { kind: VodKind; title: string; filter?: string | null }) {
  const { playMovie, showSeries } = useVod();
  const list = useVodList(kind, { q: "", filter, sort: "destaques", limit: 18 });
  if (list.items.length === 0) return null;
  return (
    <RowShell
      title={title}
      href={kind === "movie" ? "/filmes" : "/series"}
      icon={kind === "movie" ? <Clapperboard className="size-5" /> : <MonitorPlay className="size-5" />}
    >
      {kind === "movie"
        ? (list.items as VodMovie[]).map((m) => (
            <PosterCard
              key={m.id}
              size="row"
              title={m.title}
              poster={m.poster}
              meta={m.year ? String(m.year) : "Filme"}
              badges={movieBadges(m.sources.map((s) => s.label))}
              onClick={() => playMovie(m)}
            />
          ))
        : (list.items as VodSeries[]).map((s) => (
            <PosterCard
              key={s.id}
              size="row"
              title={s.title}
              poster={s.poster}
              meta={s.platform}
              onClick={() => showSeries(s)}
            />
          ))}
    </RowShell>
  );
}

export function ContinueWatchingRow({ kind }: { kind?: VodKind }) {
  const { playMovieById, showSeries } = useVod();
  const all = useWatchList();
  const items = kind ? all.filter((w) => w.kind === kind) : all;
  if (items.length === 0) return null;

  return (
    <RowShell title="Continue assistindo" icon={<MonitorPlay className="size-5" />}>
      {items.map((w) => (
        <PosterCard
          key={`${w.kind}:${w.id}`}
          size="row"
          title={w.title}
          poster={w.poster}
          progress={w.duration ? w.position / w.duration : 0}
          meta={w.kind === "series" && w.season !== undefined ? episodeCode(w.season, w.episode ?? 1) : "Filme"}
          onClick={async () => {
            if (w.kind === "movie") {
              if (!(await playMovieById(w.id))) removeWatch("movie", w.id);
            } else {
              showSeries({
                id: w.id,
                title: w.title,
                poster: w.poster,
                year: null,
                platform: "",
                seasons: 0,
                episodes: 0,
              });
            }
          }}
        />
      ))}
    </RowShell>
  );
}
