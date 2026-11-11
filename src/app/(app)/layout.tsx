import { AppShell } from "@/components/app-shell";
import { CatalogProvider } from "@/components/catalog-provider";
import { VodProvider } from "@/components/vod/vod-provider";
import { getCatalog } from "@/lib/catalog";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const catalog = await getCatalog();

  return (
    <CatalogProvider catalog={catalog}>
      <VodProvider>
        <AppShell>{children}</AppShell>
      </VodProvider>
    </CatalogProvider>
  );
}
