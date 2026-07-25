/**
 * Fixture e helpers da jornada do DONO de estacionamento (roteiro O).
 *
 * O dono aqui é `peu+operador@fera.ag`, owner da company Abbapark (unidade
 * Aeroporto Afonso Pena) em produção. Diferente da fixture Mercy (descartável),
 * esta é uma company de parceiro REAL usada por outros testes de consumidor. Por
 * isso este roteiro:
 *   - só LÊ o banco pelo `admin` (service_role) para conferir efeito;
 *   - o único write é a mudança de preço, feita pela UI do dono e REVERTIDA no
 *     fim pelos helpers de snapshot abaixo, para não deixar a diária alterada
 *     quebrando os specs de consumidor que leem o Abbapark.
 *
 * NUNCA use `cleanupFixture()` daqui: aquele helper é escopado em `%mercy%` e não
 * toca no Abbapark de propósito.
 */
import { admin } from "./supabaseAdmin";

/** Alvos do roteiro, resolvidos por slug/código (nada de id cravado). */
export const ABBAPARK_OWNER = {
  companySlug: "abbapark",
  companyName: "Abbapark",
  locationSlug: "aeroporto-afonso-pena",
  locationName: "Aeroporto Afonso Pena",
  /** Tipo de vaga em que o dono mexe no preço e o consumidor reserva. */
  parkingTypeCode: "uncovered",
  /** Nome como aparece no card de Preços e no editor. */
  parkingTypeName: "Vaga Descoberta",
} as const;

/** Faixa de preço, no shape que `pricing_tier` guarda (sem id). */
export type TierRow = {
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
  is_old_price: boolean;
};

/**
 * Resolve o `pricing_rule.id` do tipo de vaga alvo, indo por slug da company,
 * slug da location e código do tipo. Sem id cravado: se o seed mudar, o teste
 * acompanha.
 */
export async function resolveUncoveredRuleId(): Promise<string> {
  const { data: lpt, error: lptErr } = await admin
    .from("location_parking_type")
    .select(
      "id, location!inner(slug, company!inner(slug)), company_parking_type!inner(parking_type!inner(code))",
    )
    .eq("location.slug", ABBAPARK_OWNER.locationSlug)
    .eq("location.company.slug", ABBAPARK_OWNER.companySlug)
    .eq("company_parking_type.parking_type.code", ABBAPARK_OWNER.parkingTypeCode)
    .single();
  if (lptErr) throw lptErr;

  const { data: rule, error: ruleErr } = await admin
    .from("pricing_rule")
    .select("id")
    .eq("location_parking_type_id", lpt.id)
    .single();
  if (ruleErr) throw ruleErr;
  return rule.id as string;
}

/** Faixas atuais (não-old) da regra, para restaurar no fim. */
export async function snapshotTiers(ruleId: string): Promise<TierRow[]> {
  const { data, error } = await admin
    .from("pricing_tier")
    .select("from_day, to_day, unit_price, total_price, is_old_price")
    .eq("pricing_rule_id", ruleId)
    .eq("is_old_price", false)
    .order("from_day", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    from_day: t.from_day as number,
    to_day: t.to_day as number | null,
    unit_price: t.unit_price === null ? null : Number(t.unit_price),
    total_price: t.total_price === null ? null : Number(t.total_price),
    is_old_price: false,
  }));
}

/**
 * Restaura as faixas ao snapshot.
 *
 * O save do dono (`operator_set_pricing`) apaga as faixas não-old e reinsere com
 * ids novos, então não dá pra restaurar por id: a gente troca o conjunto inteiro
 * pelo snapshot original. Roda pelo `admin`, que ignora RLS.
 */
export async function restoreTiers(ruleId: string, snapshot: TierRow[]): Promise<void> {
  const { error: delErr } = await admin
    .from("pricing_tier")
    .delete()
    .eq("pricing_rule_id", ruleId)
    .eq("is_old_price", false);
  if (delErr) throw delErr;

  if (snapshot.length === 0) return;
  const { error: insErr } = await admin
    .from("pricing_tier")
    .insert(snapshot.map((t) => ({ ...t, pricing_rule_id: ruleId })));
  if (insErr) throw insErr;
}

/** Preço que o consumidor veria hoje para N diárias (a mesma RPC da busca). */
export async function simulateConsumerPrice(
  days: number,
): Promise<{ price: number | null; old_price: number | null; error: string | null }> {
  const { data, error } = await admin.rpc("simulate_price", {
    p_company: ABBAPARK_OWNER.companySlug,
    p_location: ABBAPARK_OWNER.locationSlug,
    p_parking_type: ABBAPARK_OWNER.parkingTypeCode,
    p_days: days,
  });
  if (error) throw error;
  const r = (data ?? {}) as { price?: number | string; old_price?: number | string; error?: string };
  return {
    price: r.price == null ? null : Number(r.price),
    old_price: r.old_price == null ? null : Number(r.old_price),
    error: r.error ?? null,
  };
}

/** Resolve o `location.id` da unidade do Abbapark por slug (sem id cravado). */
export async function resolveAbbaparkLocationId(): Promise<string> {
  const { data, error } = await admin
    .from("location")
    .select("id, company!inner(slug)")
    .eq("slug", ABBAPARK_OWNER.locationSlug)
    .eq("company.slug", ABBAPARK_OWNER.companySlug)
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Semeia (ou reseta) uma reserva CONFIRMADA de teste no Abbapark, para os specs de
 * operação (check-in por QR, transições no drawer). Feito pelo `admin`
 * (service_role), que passa pelo guard `booking_guard_status_transition` (só cliente
 * é barrado). Upsert por `code` (único): reutiliza a MESMA linha a cada rodada, sem
 * acumular. Reseta o estado para `confirmed`, sem check-in/saída, e reativa (`deleted_at
 * = null`). Código com prefixo `OTEST-` para ser óbvio que é artefato de teste.
 */
export async function upsertConfirmedTestBooking(opts: {
  code: string;
  locationId: string;
  profileId: string;
  checkInAt: string;
  checkOutAt: string;
}): Promise<void> {
  const { error } = await admin.from("booking").upsert(
    {
      code: opts.code,
      location_id: opts.locationId,
      profile_id: opts.profileId,
      check_in_at: opts.checkInAt,
      check_out_at: opts.checkOutAt,
      status: "confirmed",
      checked_in_at: null,
      checked_out_at: null,
      deleted_at: null,
      total_amount: 50,
      customer_name: "Teste Roteiro O",
      customer_first_name: "Teste",
      customer_last_name: "Roteiro O",
    },
    { onConflict: "code" },
  );
  if (error) throw error;
}

/** Status atual de uma reserva pelo código (para asserção). */
export async function getBookingStatusByCode(code: string): Promise<string | null> {
  const { data, error } = await admin
    .from("booking")
    .select("status")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as string) ?? null;
}

/**
 * Aposenta a reserva de teste: marca `deleted_at` (soft), tirando-a das telas ativas.
 * NÃO faz delete de booking (política da suíte + FK RESTRICT). O `upsert` acima
 * reativa a mesma linha na próxima rodada, então não acumula resíduo.
 */
export async function retireTestBooking(code: string): Promise<void> {
  const { error } = await admin
    .from("booking")
    .update({ deleted_at: new Date().toISOString() })
    .eq("code", code)
    .is("deleted_at", null);
  if (error) throw error;
}

/** Snapshot de preço de uma reserva pelo código (para conferir o parking). */
export async function bookingParkingPrice(code: string): Promise<{
  status: string;
  total_amount: number;
  parking_unit_price: number | null;
  parking_subtotal: number | null;
}> {
  const { data, error } = await admin
    .from("booking")
    .select("status, total_amount, price_breakdown")
    .eq("code", code)
    .single();
  if (error) throw error;
  const breakdown = (data.price_breakdown ?? {}) as {
    subtotal?: number;
    line_items?: { kind: string; unit_price?: number; subtotal?: number }[];
  };
  const parking = (breakdown.line_items ?? []).find((li) => li.kind === "parking");
  return {
    status: data.status as string,
    total_amount: Number(data.total_amount),
    parking_unit_price: parking?.unit_price == null ? null : Number(parking.unit_price),
    parking_subtotal: breakdown.subtotal == null ? null : Number(breakdown.subtotal),
  };
}
