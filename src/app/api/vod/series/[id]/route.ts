import type { NextRequest } from "next/server";
import { getSeriesDetail } from "@/lib/vod/store";
import { noStore } from "../../_params";
import { requireSession } from "@/lib/auth/guard";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/vod/series/[id]">) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const detail = await getSeriesDetail(id);
  if (!detail) return Response.json({ error: "Série não encontrada" }, { status: 404, ...noStore });
  return Response.json(detail, noStore);
}
