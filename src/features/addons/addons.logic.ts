// Lógica pura dos serviços adicionais (catálogo da empresa + preço por unidade).
// Sem dependência de React/Supabase → testável isoladamente (Vitest).

export type AddonFormValues = {
  name: string;
  description: string;
  base_price: number | null;
  is_active: boolean;
  sort_order: number | null;
};

export type AddonUpsertArgs = {
  p_company_id: string;
  p_id: string | null;
  p_code: string | null;
  p_name: string;
  p_description: string | null;
  p_base_price: number;
  p_is_active: boolean;
  p_sort_order: number;
};

export type LocationAddonArgs = {
  p_add_on_service_id: string;
  p_location_id: string;
  p_is_active: boolean;
  p_price_override: number | null;
};

/** Preço cobrado numa unidade: override quando definido, senão o preço base. */
export function effectiveAddonPrice(
  basePrice: number,
  override: number | null | undefined,
): number {
  return override != null ? override : basePrice;
}

/** Valida o form do catálogo. Retorna a mensagem de erro ou `null` se válido. */
export function validateAddonForm(v: AddonFormValues): string | null {
  if (!v.name.trim()) return "Nome do serviço é obrigatório.";
  if ((v.base_price ?? 0) < 0) return "Preço não pode ser negativo.";
  if ((v.sort_order ?? 0) < 0) return "Ordem não pode ser negativa.";
  return null;
}

/** Monta os argumentos da RPC `operator_upsert_addon` a partir do form. */
export function buildAddonUpsertArgs(
  companyId: string,
  id: string | null,
  v: AddonFormValues,
): AddonUpsertArgs {
  return {
    p_company_id: companyId,
    p_id: id,
    p_code: null,
    p_name: v.name.trim(),
    p_description: v.description.trim() || null,
    p_base_price: v.base_price ?? 0,
    p_is_active: v.is_active,
    p_sort_order: v.sort_order ?? 0,
  };
}

/** Monta os argumentos da RPC `operator_set_location_addon`. */
export function buildLocationAddonArgs(
  addOnServiceId: string,
  locationId: string,
  isActive: boolean,
  priceOverride: number | null,
): LocationAddonArgs {
  return {
    p_add_on_service_id: addOnServiceId,
    p_location_id: locationId,
    p_is_active: isActive,
    // override só faz sentido quando ativo; e 0/negativo vira "sem override"
    p_price_override: isActive && priceOverride != null && priceOverride > 0 ? priceOverride : null,
  };
}

/** Em quantas unidades o serviço está ativo. */
export function activeLocationCount(
  availability: { is_active: boolean }[] | undefined,
): number {
  return (availability ?? []).filter((a) => a.is_active).length;
}
