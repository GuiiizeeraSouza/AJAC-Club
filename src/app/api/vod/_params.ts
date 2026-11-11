import type { NextRequest } from "next/server";
import type { VodSort } from "@/lib/vod/store";

export function listParams(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sort = sp.get("sort");
  return {
    q: sp.get("q")?.trim().slice(0, 100) || undefined,
    page: Math.max(1, Number(sp.get("page")) || 1),
    pageSize: Math.min(120, Math.max(1, Number(sp.get("limit")) || 48)),
    sort: (sort === "recentes" || sort === "az" ? sort : "destaques") as VodSort,
    filter: sp.get("filter")?.slice(0, 60) || undefined,
  };
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
