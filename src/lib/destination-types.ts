// Registro central dos tipos de destino: ícone (Lucide) + label pt-BR por tipo.
// Fonte única — use aqui ao renderizar qualquer destino (combobox, filtros, cards, SEO).
// Os tipos espelham o CHECK de `destination.type` (ver docs/specs/destinations.md).

import { Plane, Bus, Building2, MapPin, Compass, type LucideIcon } from "@/lib/icons";

export type DestinationType =
  | "airport"
  | "bus_terminal"
  | "city_center"
  | "district"
  | "custom";

export type DestinationTypeMeta = {
  /** Label curto em pt-BR para exibição. */
  label: string;
  /** Ícone representativo do tipo. */
  icon: LucideIcon;
};

export const destinationTypeMeta: Record<DestinationType, DestinationTypeMeta> = {
  airport: { label: "Aeroporto", icon: Plane },
  bus_terminal: { label: "Rodoviária", icon: Bus },
  city_center: { label: "Centro", icon: Building2 },
  district: { label: "Bairro", icon: MapPin },
  custom: { label: "Outro", icon: Compass },
};

/** Ícone do tipo, com fallback (MapPin) para valores fora do enum. */
export function destinationTypeIcon(type: string | null | undefined): LucideIcon {
  return destinationTypeMeta[type as DestinationType]?.icon ?? MapPin;
}

/** Label pt-BR do tipo, com fallback para o próprio code se desconhecido. */
export function destinationTypeLabel(type: string | null | undefined): string {
  return destinationTypeMeta[type as DestinationType]?.label ?? (type ?? "Destino");
}
