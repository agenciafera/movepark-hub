// Registro central dos tipos de destino: ícone (Phosphor) + label pt-BR por tipo.
// Fonte única — use aqui ao renderizar qualquer destino (combobox, filtros, cards, SEO).
// Os tipos espelham o CHECK de `destination.type` (ver docs/specs/destinations.md).

import { Airplane, Buildings, Bus, Compass, MapPin, type Icon } from "@phosphor-icons/react";

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
  icon: Icon;
};

export const destinationTypeMeta: Record<DestinationType, DestinationTypeMeta> = {
  airport: { label: "Aeroporto", icon: Airplane },
  bus_terminal: { label: "Rodoviária", icon: Bus },
  city_center: { label: "Centro", icon: Buildings },
  district: { label: "Bairro", icon: MapPin },
  custom: { label: "Outro", icon: Compass },
};

/** Ícone do tipo, com fallback (MapPin) para valores fora do enum. */
export function destinationTypeIcon(type: string | null | undefined): Icon {
  return destinationTypeMeta[type as DestinationType]?.icon ?? MapPin;
}

/** Label pt-BR do tipo, com fallback para o próprio code se desconhecido. */
export function destinationTypeLabel(type: string | null | undefined): string {
  return destinationTypeMeta[type as DestinationType]?.label ?? (type ?? "Destino");
}
