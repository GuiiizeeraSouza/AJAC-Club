import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { vodStatus } from "@/lib/vod/store";
import { noStore } from "../_params";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  return Response.json(await vodStatus(), noStore);
}
