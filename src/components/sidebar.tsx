"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Heart, House, MonitorPlay, RefreshCw } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { useCatalog } from "./catalog-provider";
import { CategoryIcon } from "./category-icon";

function NavItem({
  href,
  label,
  icon,
  count,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3.5 rounded-xl py-2.5 pl-5 pr-3 text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        active ? "text-gold" : "text-cream/75 hover:text-cream"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gold transition ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        className={`flex size-8 items-center justify-center rounded-lg transition ${
          active ? "bg-gold/15" : "bg-white/[0.04] group-hover:bg-white/[0.08]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-muted">{count}</span>}
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { byCategory } = useCatalog();
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
      <NavItem href="/" label="Início" icon={<House className="size-4" />} onNavigate={onNavigate} />
      <NavItem
        href="/favoritos"
        label="Favoritos"
        icon={<Heart className="size-4" />}
        onNavigate={onNavigate}
      />
      <p className="mb-1 mt-6 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">
        Sob demanda
      </p>
      <NavItem
        href="/filmes"
        label="Filmes"
        icon={<Clapperboard className="size-4" />}
        onNavigate={onNavigate}
      />
      <NavItem
        href="/series"
        label="Séries"
        icon={<MonitorPlay className="size-4" />}
        onNavigate={onNavigate}
      />
      <p className="mb-1 mt-6 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">
        Canais ao vivo
      </p>
      {CATEGORIES.filter((c) => byCategory[c.id].length > 0).map((c) => (
        <NavItem
          key={c.id}
          href={`/categoria/${c.id}`}
          label={c.label}
          count={byCategory[c.id].length}
          icon={<CategoryIcon id={c.id} className="size-4" />}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function SidebarFallback() {
  return (
    <div className="flex flex-col gap-2 px-2">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.04]" />
      ))}
    </div>
  );
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`} aria-label="AJACTv — início">
      <Image src="/brand/ajac-wordmark.png" alt="AJAC" width={700} height={197} className="h-7 w-auto" priority />
      <span className="rounded-md bg-gold px-1.5 py-0.5 font-display text-sm leading-none text-ink">TV</span>
    </Link>
  );
}

export function SidebarFooter() {
  const { catalog } = useCatalog();
  const updated = new Date(catalog.updatedAt);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-panel-2/80 p-4 ring-1 ring-line">
      <Image
        src="/brand/ajac-jaguar.png"
        alt=""
        width={1200}
        height={658}
        className="pointer-events-none absolute -right-10 -top-3 w-40 opacity-25"
      />
      <p className="relative text-sm font-medium text-cream">{catalog.channels.length} canais ao vivo</p>
      <p className="relative mt-1 flex items-center gap-1.5 text-xs text-muted">
        <RefreshCw className="size-3" />
        Atualizada às{" "}
        {updated.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        })}
      </p>
      <p className="relative mt-0.5 pl-[18px] text-[11px] text-muted/70">Atualiza sozinha a cada 10 min</p>
    </div>
  );
}
