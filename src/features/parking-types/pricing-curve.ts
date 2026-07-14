import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Curva de preço de um tipo de vaga: o preço total para cada duração de estadia.
 *
 * O cálculo é sempre da RPC `simulate_price` (o motor no Postgres é a fonte única
 * da verdade). Aqui só perguntamos o preço de cada duração e olhamos o formato da
 * curva. Nunca reimplemente o cálculo em TypeScript.
 */

/** Conjunto canônico de dias usado na simulação em produção. */
export const DAY_BUCKETS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 15, 17, 18, 20, 30, 35];

export type CurveRow = {
  days: number;
  price: number | null;
  oldPrice: number | null;
  error: string | null;
};

/** Ponto em que ficar mais dias sai mais barato: quem fica menos tempo paga mais. */
export type CurveInversion = {
  days: number;
  price: number;
  nextDays: number;
  nextPrice: number;
};

export const pricingCurveKeys = {
  all: ["pricing-simulation"] as const,
  buckets: (company: string, location: string, parkingType: string) =>
    [...pricingCurveKeys.all, "buckets", company, location, parkingType] as const,
};

async function simulateDays(
  company: string,
  location: string,
  parkingType: string,
  days: number,
): Promise<Omit<CurveRow, "days">> {
  const { data, error } = await supabase.rpc("simulate_price", {
    p_company: company,
    p_location: location,
    p_parking_type: parkingType,
    p_days: days,
  });
  if (error) return { price: null, oldPrice: null, error: error.message };
  const r = data as { price?: number; old_price?: number | null; error?: string } | null;
  return {
    price: r?.price ?? null,
    oldPrice: r?.old_price ?? null,
    error: r?.error ?? null,
  };
}

export async function fetchPricingCurve(
  company: string,
  location: string,
  parkingType: string,
): Promise<CurveRow[]> {
  return Promise.all(
    DAY_BUCKETS.map(async (days) => ({
      days,
      ...(await simulateDays(company, location, parkingType, days)),
    })),
  );
}

/**
 * Inversões de faixa: durações em que o total CAI ao aumentar a estadia.
 * Ex.: 6 dias por R$ 179,40 e 7 dias por R$ 125,30 - quem fica menos paga mais.
 * Linhas com erro ou sem preço são ignoradas (não dá para comparar).
 */
export function findCurveInversions(rows: CurveRow[]): CurveInversion[] {
  const points = rows.filter((r): r is CurveRow & { price: number } => r.price !== null);
  const inversions: CurveInversion[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    if (cur.price > next.price) {
      inversions.push({
        days: cur.days,
        price: cur.price,
        nextDays: next.days,
        nextPrice: next.price,
      });
    }
  }
  return inversions;
}

export function usePricingCurve(
  companySlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: pricingCurveKeys.buckets(
      companySlug ?? "",
      locationSlug ?? "",
      parkingTypeCode ?? "",
    ),
    queryFn: () => fetchPricingCurve(companySlug!, locationSlug!, parkingTypeCode!),
    enabled: enabled && !!companySlug && !!locationSlug && !!parkingTypeCode,
    staleTime: 60_000,
  });
}
