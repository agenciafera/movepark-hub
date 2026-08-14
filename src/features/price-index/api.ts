import { supabase } from "@/lib/supabase";

import type { PriceIndexData } from "./priceIndex.logic";

const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; data: PriceIndexData } | null = null;
let inflight: Promise<PriceIndexData | null> | null = null;

/**
 * Matriz de preços de todos os destinos, direto da RPC `destination_price_index`
 * (o cálculo é do motor no Postgres; aqui só se transporta).
 *
 * Single-flight com cache curto de propósito: no build SSG os loaders de /precos
 * e de cada /precos/<slug> rodam em paralelo, e sem isso eram 7 chamadas
 * simultâneas da mesma RPC, o bastante para esbarrar no statement timeout do
 * papel anon. Uma chamada serve todo mundo; na navegação client-side o TTL de
 * 5 minutos evita refazer a conta a cada troca de página.
 */
export async function fetchPriceIndex(): Promise<PriceIndexData | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data, error } = await supabase.rpc("destination_price_index", {});
        if (error) throw error;
        const parsed = (data as unknown as PriceIndexData) ?? null;
        if (parsed) cached = { at: Date.now(), data: parsed };
        return parsed;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}
