import {
  Baby,
  Church,
  Clapperboard,
  Music,
  Newspaper,
  Sparkles,
  Telescope,
  Trophy,
  Tv,
  type LucideProps,
} from "lucide-react";
import type { CategoryId } from "@/lib/types";

const ICONS: Record<CategoryId, React.ComponentType<LucideProps>> = {
  esportes: Trophy,
  filmes: Clapperboard,
  noticias: Newspaper,
  infantil: Baby,
  documentarios: Telescope,
  abertos: Tv,
  variedades: Sparkles,
  musica: Music,
  religiosos: Church,
};

export function CategoryIcon({ id, ...props }: { id: CategoryId } & LucideProps) {
  const Icon = ICONS[id];
  return <Icon {...props} />;
}
