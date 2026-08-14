// Edge Function: /simulate-price
//
// GET /functions/v1/simulate-price?company=<slug>[&location=<slug>][&parking_type=<code>][&stay_days=1,2,7]
// → { data: { date, company, stay_days, locations: { <slug>: { name, parking_types: { <code>: { name, prices } } } } } }
//
// Grade de preços por empresa/unidade/tipo de vaga, para as durações pedidas. Lê a RPC
// `get_pricing_data` com service_role e calcula em `engine.ts`.
//
// PROCEDÊNCIA (14/08/2026). Esta função nunca esteve no git: rodava só em produção desde
// jun/2026, com `verify_jwt = false` declarado no `supabase/config.toml` e sem pasta
// correspondente. O fonte foi recuperado pela Management API e conferido contra produção
// (mesma resposta, byte a byte, nas seis empresas). Fica registrado o que ele é:
//
//  1. É um SEGUNDO motor de preço. O canônico é a função SQL `simulate_price`, com casos golden
//     em `docs/simulacao-precos.md`. O `engine.test.ts` agora bate os dois com os mesmos valores,
//     que é o que faltava para a divergência aparecer em vez de sair publicada.
//  2. É público e sem throttle: qualquer um que saiba um slug de empresa recebe a grade inteira,
//     inclusive o `old_price`.
//
// Ver `docs/specs/pricing-engine.md` para a discussão de aposentar o endpoint.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computePrice, type PricingRow } from "./engine.ts";

const DEFAULT_STAY_DAYS = [1, 2, 3, 5, 7, 10, 15, 20, 30];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const company = url.searchParams.get("company");
  const location = url.searchParams.get("location");
  const parkingType = url.searchParams.get("parking_type");
  const stayDaysRaw = url.searchParams.get("stay_days");

  const stayDays: number[] = stayDaysRaw
    ? stayDaysRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0 && !isNaN(n))
    : DEFAULT_STAY_DAYS;

  if (!company) {
    return new Response(
      JSON.stringify({ error: "Parâmetro obrigatório: company (slug da empresa, ex: aerovalet, aeropark, abbapark, garageinn, nationpark, plenty)" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await supabase.rpc("get_pricing_data", {
    p_company:      company,
    p_location:     location ?? null,
    p_parking_type: parkingType ?? null,
  });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ error: `Empresa não encontrada ou sem regras ativas: ${company}` }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const companyInfo = { name: (rows as PricingRow[])[0].company_name, slug: (rows as PricingRow[])[0].company_slug };

  type PriceEntry = {
    price: number | null;
    old_price: number | null;
    has_discount: boolean;
    unsupported_strategy?: string;
  };
  type ParkingTypeEntry = { name: string; prices: Record<number, PriceEntry> };
  type LocationEntry = { name: string; parking_types: Record<string, ParkingTypeEntry> };
  const locations: Record<string, LocationEntry> = {};

  for (const row of rows as PricingRow[]) {
    if (!locations[row.location_slug]) {
      locations[row.location_slug] = { name: row.location_name, parking_types: {} };
    }

    const prices: Record<number, PriceEntry> = {};
    for (const days of stayDays) {
      const { price, old_price, unsupported_strategy } = computePrice(row, days);
      prices[days] = {
        price,
        old_price,
        has_discount: price !== null && old_price !== null && old_price > price,
        ...(unsupported_strategy ? { unsupported_strategy } : {}),
      };
    }

    locations[row.location_slug].parking_types[row.parking_type_code] = {
      name: row.parking_type_name,
      prices,
    };
  }

  return new Response(
    JSON.stringify({
      data: {
        date: new Date().toISOString().slice(0, 10),
        company: companyInfo,
        stay_days: stayDays,
        locations,
      },
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
