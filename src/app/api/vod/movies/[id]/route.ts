import type { NextRequest } from "next/server";
import { getMovie } from "@/lib/vod/store";
import { noStore } from "../../_params";
import { requireSession } from "@/lib/auth/guard";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/vod/movies/[id]">) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const movie = await getMovie(id);
  if (!movie) return Response.json({ error: "Filme indisponível" }, { status: 404, ...noStore });
  return Response.json(movie, noStore);
}
