import type { Metadata } from "next";
import { VodBrowser } from "@/components/vod/vod-browser";

export const metadata: Metadata = {
  title: "Séries",
  description: "Catálogo de séries sob demanda do AJACTv, com temporadas e episódios.",
};

export default function SeriesPage() {
  return <VodBrowser kind="series" />;
}
