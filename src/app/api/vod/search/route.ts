import type { NextRequest } from "next/server";
import { searchVod } from "@/lib/vod/store";
import { listParams, noStore } from "../_params";
import { requireSession } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const { q } = listParams(request);
  if (!q) return Response.json({ movies: [], series: [], moviesTotal: 0, seriesTotal: 0 }, noStore);
  return Response.json(await searchVod(q, 12), noStore);
}
