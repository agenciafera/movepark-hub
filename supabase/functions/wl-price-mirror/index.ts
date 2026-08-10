// Edge Function: /wl-price-mirror
// Espelhamento de preço WL→Hub (E0.13): pra cada unidade EXTERNA mapeada, reconstrói a tabela
// do parceiro amostrando a API de cálculo dele e grava em pricing_rule/pricing_tier via RPC
// wl_mirror_apply_pricing. Depois compara os dois motores nas mesmas entradas; divergiu, marca
// a regra como `divergent` e a vitrine cai para "a partir de".
//
// Custo por vaga: ~42 chamadas de amostragem + 5 de verificação, uns 45 segundos. A Edge derruba
// a invocação em 150s, então o job processa as vagas MAIS VELHAS primeiro e para de pegar vaga
// nova quando estoura o orçamento (START_BUDGET_MS), devolvendo `skipped`. O que sobra volta no
// topo da próxima passada. Por isso o cron roda de 3 em 3 horas: a fila inteira gira todo dia.
//
// Grava POR EVENTO: passada que acha o mesmo preço não deixa linha de log, só atualiza o
// carimbo de frescor. Ver a regra e o porquê em supabase/migrations/*_pricing_mirror.sql.
//
// Chamada interna pelo pg_cron (pg_net), header x-wl-deliver-key. verify_jwt = false.
//
// POST /functions/v1/wl-price-mirror   (header: x-wl-deliver-key: <WL_DELIVER_KEY>)
// body opcional: { location_parking_type_id?: uuid }  → limita a uma vaga (útil pra rodar na mão)
// → { ok, processed, changed, divergent, errors }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wlGetCalculationPrice, type WlConfig } from "../_shared/wl/client.ts";
import { sampleWlPriceTable, toHubPricing, type Quote } from "../_shared/wl/price-sampler.ts";
import {
  buildQuoteAnchor,
  pricesDiffer,
  sortByStaleness,
  START_BUDGET_MS,
  verifyDurations,
} from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("WL_DELIVER_KEY");
  if (!expected || req.headers.get("x-wl-deliver-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const onlyId = (body as { location_parking_type_id?: string }).location_parking_type_id ?? null;

  // Só unidade EXTERNA: para a nativa quem manda é a tabela da Movepark, e sobrescrever com a
  // do parceiro apagaria o preço que a gente pratica.
  let q = admin
    .from("location_parking_type")
    .select(
      "id, wl_category_slug, wl_product_slug, " +
        // FK explícita: `pricing_rule` aponta duas vezes para `location_parking_type`
        // (a regra da vaga e o `surcharge_source_id`), e sem nomear a constraint o PostgREST
        // recusa o embed com "more than one relationship was found".
        "pricing_rule:pricing_rule!pricing_rule_location_parking_type_id_fkey(mirror_verified_at), " +
        "company_parking_type:company_parking_type!inner(parking_type:parking_type!inner(code)), " +
        "location:location!inner(slug, checkout_mode, " +
        "company:company!inner(slug, wl_domain, wl_tenant_key, wl_sync_enabled))",
    )
    .eq("is_active", true)
    .eq("location.checkout_mode", "external")
    .not("wl_category_slug", "is", null)
    .not("wl_product_slug", "is", null);
  if (onlyId) q = q.eq("id", onlyId);

  const { data: lpts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let processed = 0;
  let changed = 0;
  let divergent = 0;
  let skipped = 0;
  const errors: { id: string; message: string }[] = [];

  // Mais velha primeiro, e para de pegar vaga nova quando o orçamento de tempo acaba. O que
  // sobrar volta no topo da próxima passada, então a fila roda inteira mesmo sem caber de uma vez.
  const started = Date.now();
  const fila = sortByStaleness(
    lpts ?? [],
    // deno-lint-ignore no-explicit-any
    (r: any) => (r.pricing_rule?.mirror_verified_at as string | null) ?? null,
  );

  for (const lpt of fila) {
    // deno-lint-ignore no-explicit-any
    const row = lpt as any;

    if (Date.now() - started > START_BUDGET_MS) {
      skipped++;
      continue;
    }
    const cfg = row.location?.company as WlConfig | null;
    if (!cfg?.wl_domain || !cfg?.wl_tenant_key) continue;

    const categorySlug = row.wl_category_slug as string;
    const productSlug = row.wl_product_slug as string;
    const anchor = buildQuoteAnchor(new Date());

    const quote = async (days: number, extraMinutes: number): Promise<Quote> => {
      const final = new Date(anchor.getTime() + days * 86_400_000 + extraMinutes * 60_000);
      const r = await wlGetCalculationPrice(cfg, {
        categorySlug,
        productSlug,
        initial: anchor,
        final,
      });
      return { price: r.price, oldPrice: r.oldPrice };
    };

    try {
      const table = await sampleWlPriceTable(quote);
      const { rule, tiers } = toHubPricing(table);

      const { data: applied, error: applyErr } = await admin.rpc("wl_mirror_apply_pricing", {
        p_location_parking_type_id: row.id,
        p_rule: rule,
        p_tiers: tiers,
        p_calls: table.calls,
        p_anomalies: table.anomalies,
        p_minimum_days: table.minimumDays,
      });
      if (applyErr) throw new Error(applyErr.message);
      processed++;
      if ((applied as { changed?: boolean } | null)?.changed) changed++;

      // Verificação diferencial. Comparar os dois motores nas mesmas entradas valida o motor do
      // Hub INTEIRO, não só esta unidade: do outro lado há um motor rodando com dinheiro real
      // há anos, servindo de oráculo.
      const diffs: unknown[] = [];
      for (const days of verifyDurations(table.minimumDays)) {
        const wl = await quote(days, 0);
        const { data: sim } = await admin.rpc("simulate_price", {
          p_company: row.location.company.slug,
          p_location: row.location.slug,
          p_parking_type: row.company_parking_type.parking_type.code,
          p_days: days,
        });
        const hub = Number((sim as { price?: number } | null)?.price ?? NaN);
        if (pricesDiffer(wl.price, hub)) diffs.push({ days, wl: wl.price, hub });
      }
      if (diffs.length > 0) {
        divergent++;
        await admin.rpc("wl_mirror_flag_divergence", {
          p_location_parking_type_id: row.id,
          p_detail: { diffs },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ id: row.id, message });
      // Falha de amostragem é evento: entra no log para não sumir. Sem isso a vaga congela
      // com preço velho e ninguém fica sabendo.
      await admin.from("pricing_mirror_run").insert({
        location_parking_type_id: row.id,
        kind: "error",
        detail: { message },
      });
    }
  }

  // `skipped` vai na resposta de propósito: corte silencioso lê como "cobriu tudo".
  return json({ ok: true, processed, changed, divergent, skipped, errors });
});
