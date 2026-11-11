"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Menu, Search, X } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { searchChannels, useCatalog } from "./catalog-provider";
import { ChannelCard } from "./channel-card";
import { CatalogAutoRefresh, LiveClock, useOnline } from "./live-status";
import { PlayerOverlay } from "./player-overlay";
import { SeriesDetailModal } from "./vod/series-detail";
import { VodSearchResults } from "./vod/vod-search";
import { VodPlayer } from "./vod/vod-player";
import { BrandLogo, SidebarFallback, SidebarFooter, SidebarNav } from "./sidebar";

function SearchBox() {
  const { query, setQuery } = useCatalog();
  const inputRef = useRef<HTMLInputElement>(null);

  // Atalho "/" para focar a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(el.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="relative flex w-full max-w-md items-center">
      <Search className="pointer-events-none absolute left-4 size-[18px] text-cream/50" aria-hidden />
      <span className="sr-only">Buscar canais</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        placeholder="Buscar canais…"
        autoComplete="off"
        className="h-11 w-full rounded-xl bg-white/[0.07] pl-11 pr-10 text-sm text-cream outline-none ring-1 ring-white/[0.06] transition placeholder:text-cream/40 focus:bg-white/[0.1] focus:ring-gold/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-3 rounded-md p-1 text-cream/60 hover:text-cream"
          aria-label="Limpar busca"
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd className="absolute right-3 hidden rounded-md border border-white/10 px-1.5 text-[11px] text-cream/40 sm:block">
          /
        </kbd>
      )}
    </label>
  );
}

function SearchResults() {
  const { channels, query } = useCatalog();
  const results = searchChannels(channels, query);
  return (
    <section className="fade-in" aria-live="polite">
      <h1 className="text-xl font-semibold">
        {results.length > 0
          ? `${results.length} ${results.length === 1 ? "canal encontrado" : "canais encontrados"}`
          : "Nenhum canal encontrado"}
        <span className="text-muted"> para “{query.trim()}”</span>
      </h1>
      {results.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nenhum canal ao vivo com esse nome.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {results.map((c) => (
            <ChannelCard key={c.id} channel={c} queue={results} size="grid" />
          ))}
        </div>
      )}
      <VodSearchResults query={query} />
    </section>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-panel p-5 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={!open}
      >
        <div className="flex items-center justify-between">
          <BrandLogo />
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-cream/70" aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        </div>
        <Suspense fallback={<SidebarFallback />}>
          <SidebarNav onNavigate={onClose} />
        </Suspense>
        <SidebarFooter />
      </aside>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { query, catalog } = useCatalog();
  const [drawer, setDrawer] = useState(false);
  const online = useOnline();
  const searching = query.trim().length > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1680px]">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-8 overflow-y-auto px-5 py-8 lg:flex">
        <BrandLogo className="px-3" />
        <Suspense fallback={<SidebarFallback />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto">
          <SidebarFooter />
        </div>
      </aside>

      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink/70 px-4 py-4 backdrop-blur-xl sm:px-6 lg:static lg:bg-transparent lg:px-8 lg:pt-8 lg:backdrop-blur-none">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="rounded-xl bg-white/[0.06] p-2.5 text-cream lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <SearchBox />
          <div className="ml-auto flex items-center gap-4">
            <span
              className="hidden items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-cream/80 md:flex"
              title={online ? "Conectado" : "Sem conexão com a internet"}
            >
              <span className={`size-2 rounded-full ${online ? "live-dot bg-live" : "bg-cream/40"}`} />
              <span className="font-semibold tracking-[0.12em] text-cream">{online ? "AO VIVO" : "OFFLINE"}</span>
              <LiveClock className="text-cream/70" />
              <span className="text-cream/40">·</span>
              {catalog.channels.length} canais
            </span>
            <div className="flex items-center gap-2.5">
              <span className="relative size-10 overflow-hidden rounded-full bg-ink ring-2 ring-gold/70">
                <Image src="/brand/ajac-badge.png" alt="" fill sizes="40px" className="object-contain p-1" />
              </span>
              <span className="hidden text-sm font-medium sm:block">AJAC</span>
              <form action={logout}>
                <button
                  type="submit"
                  title="Sair"
                  aria-label="Sair da conta"
                  className="rounded-xl p-2.5 text-cream/60 transition hover:bg-white/[0.08] hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <LogOut className="size-[18px]" />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-16 sm:px-6 lg:px-8">{searching ? <SearchResults /> : children}</main>

        <footer className="px-4 pb-8 text-xs leading-relaxed text-muted/70 sm:px-6 lg:px-8">
          AJACTv não hospeda nem transmite nenhum conteúdo. Os canais são carregados de listas públicas
          ({catalog.sourceFiles.join(", ")}) do repositório Ramys/Iptv-Brasil-2026 e a disponibilidade de
          cada sinal depende das fontes originais.
        </footer>
      </div>

      <PlayerOverlay />
      <SeriesDetailModal />
      <VodPlayer />
      <CatalogAutoRefresh />
      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-fit rounded-full bg-live px-5 py-2 text-sm font-medium text-white shadow-xl"
        >
          Sem conexão — o sinal volta sozinho quando a internet retornar.
        </div>
      )}
    </div>
  );
}
