import * as Icons from "@phosphor-icons/react";
import { LUCIDE_TO_PHOSPHOR } from "@/lib/icon-aliases";
import { AccessibilityIcon } from "@/components/shared/AccessibilityIcon";

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Ícones que o projeto desenha por conta própria, sobrepondo o do pacote. A chave é o
 * mesmo nome que o banco guarda em `amenity.icon`, então o override vive aqui e a
 * linha do banco continua valendo (o `pcd` segue com "Accessibility").
 */
const OVERRIDES: Record<string, IconComponent> = {
  Accessibility: AccessibilityIcon,
};

/**
 * Desenho genérico para comodidade sem ícone. É também o sintoma de nome que não
 * resolveu: quatro comodidades ficaram exibindo este brilho no lugar do ícone delas
 * porque o nome do lucide não tinha tradução (ver `AmenityList.logic.test.ts`).
 */
export const FALLBACK_ICON: IconComponent = Icons.Sparkle;

/** Resolve o nome guardado em `amenity.icon` para o componente que a lista desenha. */
export function getAmenityIcon(name: string | null): IconComponent {
  if (!name) return FALLBACK_ICON;
  if (OVERRIDES[name]) return OVERRIDES[name];
  // O banco guarda nome do lucide: traduz antes de procurar no Phosphor.
  const Component = (Icons as unknown as Record<string, IconComponent | undefined>)[
    LUCIDE_TO_PHOSPHOR[name] ?? name
  ];
  return Component ?? FALLBACK_ICON;
}
