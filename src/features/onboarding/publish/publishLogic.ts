/**
 * Lógica pura do wizard "Publicar" (E1.9), extraída para teste unitário (convenção do projeto:
 * lógica dentro de componente vai para *.logic/*Logic.ts testável).
 */
import type { ParkingType } from "@/types/domain";

export type PublishRow = { selected: boolean; base_price: number | null; capacity: string };

export type PublishParkingItem = {
  parking_type_id: string;
  base_price: number;
  capacity: number;
};

/** Coleta os tipos selecionados no formato aceito por onboarding_set_parking_types. */
export function buildParkingItems(
  catalog: Pick<ParkingType, "id">[],
  rows: Record<string, PublishRow>,
): PublishParkingItem[] {
  return catalog
    .filter((pt) => rows[pt.id]?.selected)
    .map((pt) => ({
      parking_type_id: pt.id,
      base_price: rows[pt.id].base_price ?? 0,
      capacity: Number(rows[pt.id].capacity || 0),
    }));
}

/**
 * Valida o mínimo para publicar (Q-010 / onboarding_publish): ao menos 1 tipo, cada um com
 * capacidade > 0 e preço de balcão > 0. Retorna a mensagem de erro ou null se válido.
 */
export function validateParkingItems(items: PublishParkingItem[]): string | null {
  if (!items.length) return "Selecione ao menos um tipo de vaga.";
  if (items.some((i) => i.capacity <= 0)) return "Informe a capacidade de cada tipo.";
  if (items.some((i) => i.base_price <= 0)) return "Informe o preço de balcão de cada tipo.";
  return null;
}

/** Valida o passo de endereço: nome, endereço e geo (lat/lng) resolvidos. */
export function validateAddress(input: {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}): string | null {
  if (!input.name.trim()) return "Dê um nome para a unidade.";
  if (!input.address.trim()) return "Informe o endereço.";
  if (input.lat == null || input.lng == null) return "Confirme a localização no mapa.";
  return null;
}
