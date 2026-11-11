import type { NextRequest } from "next/server";
import { queryMovies } from "@/lib/vod/store";
import { listParams, noStore } from "../_params";
import { requireSession } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const { filter, ...p } = listParams(request);
  return Response.json(await queryMovies({ ...p, genre: filter }), noStore);
}
