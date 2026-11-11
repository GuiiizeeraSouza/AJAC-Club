import type { Metadata } from "next";
import { VodBrowser } from "@/components/vod/vod-browser";

export const metadata: Metadata = {
  title: "Filmes",
  description: "Catálogo de filmes sob demanda do AJACTv.",
};

export default function MoviesPage() {
  return <VodBrowser kind="movie" />;
}
