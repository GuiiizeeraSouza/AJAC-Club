import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryView } from "@/components/views";
import { CATEGORIES, CATEGORY_MAP, isCategoryId } from "@/lib/categories";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategoryId(slug)) return {};
  const cat = CATEGORY_MAP[slug];
  return { title: cat.label, description: cat.description };
}

export default async function CategoryPage({ params }: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  if (!isCategoryId(slug)) notFound();
  return <CategoryView id={slug} />;
}
