// `purchase` do GA4 pelo servidor (Measurement Protocol), disparado quando o pagamento confirma.
//
// O navegador já manda o `purchase` (src/features/checkout/useCheckoutTracking.ts), mas só
// quando a página do checkout vê a reserva confirmada: quem gera o PIX, fecha a aba e paga
// depois some do GA4. Este módulo fecha o buraco: o webhook de pagamento manda o mesmo evento,
// com o mesmo `transaction_id` (código da reserva), e o GA4 deduplica os dois em até 72h.
//
// Os itens seguem o MESMO schema de `src/lib/analytics-ecommerce.ts` (vaga, adicionais, tarifa
// como item próprio), e `tituloDaUnidade` é espelho de `src/lib/parkingName.ts`, porque Deno
// não importa do front. Mudou lá, muda aqui (docs/specs/analytics-ecommerce.md §3 e §4).
//
// Best-effort por contrato: `sendPurchase` NUNCA lança. Métrica que derruba a confirmação de
// pagamento é pior que métrica faltando (mesmo espírito do ADR-011). Guarda de exatamente-uma-
// vez em `booking.ga_purchase_sent_at` (o webhook pode chegar mais de uma vez); se o envio
// falhar, a guarda é liberada para o próximo evento tentar de novo.
//
// Segredos (Edge): GA4_MEASUREMENT_ID (G-XXXX) e GA4_API_SECRET (Administrador › Fluxos de
// dados › Measurement Protocol). O site alimenta DUAS propriedades (§6 da spec), então os dois
// aceitam lista separada por vírgula, pareada pela posição: `G-A,G-B` com `segredoA,segredoB`.
// Sem os dois, o módulo não faz nada e avisa no log.

export const GA4_MP_URL = "https://www.google-analytics.com/mp/collect";
export const AFFILIATION = "Movepark";
export const CURRENCY = "BRL";
/** O GA4 descarta evento com `timestamp_micros` mais velho que isto; depois disso vai sem carimbo. */
export const TIMESTAMP_WINDOW_MS = 72 * 60 * 60 * 1000;

export type Ga4Target = { measurementId: string; apiSecret: string };
/** Uma propriedade por par; lista vazia = desligado. */
export type Ga4Config = Ga4Target[];

export function ga4ConfigFromEnv(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): Ga4Config | null {
  const split = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const ids = split(get("GA4_MEASUREMENT_ID"));
  const secrets = split(get("GA4_API_SECRET"));
  if (!ids.length || ids.length !== secrets.length) {
    if (ids.length || secrets.length) console.warn("[ga4] GA4_MEASUREMENT_ID e GA4_API_SECRET precisam ter o mesmo número de entradas");
    return null;
  }
  return ids.map((measurementId, i) => ({ measurementId, apiSecret: secrets[i] }));
}

/**
 * O segredo vai na query da URL, e o `fetch` do Deno embute a URL inteira na mensagem de erro de
 * rede (DNS, reset, TLS). Antes de logar ou devolver qualquer erro, o segredo sai da mensagem.
 */
export function redactSecret(message: string): string {
  return message.replace(/api_secret=[^&\s)]*/g, "api_secret=***");
}

function mpUrl(t: Ga4Target): string {
  return `${GA4_MP_URL}?measurement_id=${encodeURIComponent(t.measurementId)}&api_secret=${encodeURIComponent(t.apiSecret)}`;
}

/** Espelho de `tituloDaUnidade` + `parkingTitle` (src/lib/parkingName.ts). */
export function tituloDaUnidade(
  publicName: string | null | undefined,
  companyName: string | null | undefined,
  locationName: string | null | undefined,
): string {
  const publico = (publicName ?? "").trim();
  if (publico) return publico;
  const company = (companyName ?? "").trim();
  const location = (locationName ?? "").trim();
  if (!company) return location;
  if (!location) return company;
  const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const c = norm(company);
  const l = norm(location);
  if (c === l) return company;
  const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|\\s)${escaped}($|\\s)`).test(l)) return location;
  return `${company} · ${location}`;
}

/** Centavos arredondados: o GA4 soma `price × quantity` e compara com `value`. */
export function money(n: number | string | null | undefined): number {
  return Math.round(Number(n ?? 0) * 100) / 100;
}

export type Ga4Item = {
  item_id: string;
  item_name: string;
  affiliation: string;
  item_brand: string;
  item_category: string;
  item_category2: "estacionamento" | "adicional" | "tarifa";
  item_variant?: string;
  price: number;
  quantity: number;
  stay_days?: number;
  fare_tier?: string;
};

/** O que o select abaixo devolve, já no formato que `buildPurchasePayload` lê. */
export type PurchaseBookingRow = {
  id: string;
  code: string;
  status: string;
  total_amount: number | string;
  currency: string | null;
  fare_tier: string | null;
  profile_id: string | null;
  ga_client_id: string | null;
  ga_session_id: string | null;
  price_breakdown: {
    days?: number;
    coupon?: { code?: string } | null;
    fare?: { tier: string; label: string; amount: number } | null;
  } | null;
  location: {
    slug: string;
    name: string | null;
    public_name: string | null;
    company: { slug: string; name: string | null };
    destination: { code: string | null; name: string | null } | null;
  };
  items: {
    id: string;
    item_type: string;
    quantity: number;
    unit_price: number | string;
    subtotal: number | string;
    add_on_service_id: string | null;
    parking_type: { code: string; name: string | null } | null;
    add_on_service: { name: string | null } | null;
  }[];
  payments: { status: string; kind: string | null; method: string | null; paid_at: string | null; created_at: string }[];
};

export const PURCHASE_BOOKING_SELECT =
  `id, code, status, total_amount, currency, fare_tier, profile_id, ga_client_id, ga_session_id, price_breakdown,
   location:location!inner(slug, name, public_name, company:company!inner(slug, name), destination:destination(code, name)),
   items:booking_item(id, item_type, quantity, unit_price, subtotal, add_on_service_id,
     parking_type:parking_type(code, name), add_on_service:add_on_service(name)),
   payments:payment(status, kind, method, paid_at, created_at)`;

/** Os itens da reserva, iguais aos de `itemsFromBooking` no front: vaga, adicionais e a tarifa paga. */
export function purchaseItems(row: PurchaseBookingRow): Ga4Item[] {
  const loc = row.location;
  const brand = loc.company.name ?? "";
  const name = tituloDaUnidade(loc.public_name, loc.company.name, loc.name);
  const category = loc.destination?.code ?? loc.destination?.name ?? "";
  const days = row.price_breakdown?.days;
  const fare = row.price_breakdown?.fare;
  const items: Ga4Item[] = (row.items ?? []).map((it) => {
    if (it.item_type === "add_on") {
      return {
        item_id: `adicional:${it.add_on_service_id ?? it.id}`,
        item_name: it.add_on_service?.name ?? "Adicional",
        affiliation: AFFILIATION,
        item_brand: brand,
        item_category: category,
        item_category2: "adicional" as const,
        price: money(it.unit_price),
        quantity: it.quantity,
      };
    }
    return {
      item_id: `${loc.company.slug}/${loc.slug}:${it.parking_type?.code ?? "vaga"}`,
      item_name: name,
      affiliation: AFFILIATION,
      item_brand: brand,
      item_category: category,
      item_category2: "estacionamento" as const,
      ...(it.parking_type?.name ? { item_variant: it.parking_type.name } : {}),
      price: money(it.subtotal),
      quantity: 1,
      ...(days ? { stay_days: days } : {}),
      ...(row.fare_tier ? { fare_tier: row.fare_tier } : {}),
    };
  });
  if (fare && Number(fare.amount) > 0) {
    items.push({
      item_id: `tarifa:${fare.tier}`,
      item_name: `Tarifa ${fare.label}`,
      affiliation: AFFILIATION,
      item_brand: brand,
      item_category: category,
      item_category2: "tarifa",
      price: money(fare.amount),
      quantity: 1,
      fare_tier: fare.tier,
    });
  }
  return items;
}

/** O pagamento que confirmou a reserva: o mais recente aprovado, da cobrança da reserva (não de adicional). */
export function paidPayment(payments: PurchaseBookingRow["payments"]) {
  return [...(payments ?? [])]
    .filter((p) => p.status === "paid" && (p.kind ?? "booking") === "booking")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export type Ga4PurchaseBody = {
  client_id: string;
  user_id?: string;
  timestamp_micros?: number;
  non_personalized_ads: boolean;
  events: [{
    name: "purchase";
    params: Record<string, unknown> & { transaction_id: string; value: number; currency: string; items: Ga4Item[] };
  }];
};

export type BuildOptions = {
  /** Nenhuma outra reserva paga antes desta (fica fora de `ecommerce` no front; aqui é parâmetro do evento). */
  newCustomer?: boolean;
  now?: Date;
};

/**
 * O corpo do Measurement Protocol. `client_id` é o cookie capturado na reserva; sem ele vai o
 * id do usuário (e a sessão não casa, o evento entra como usuário novo no GA4). `session_id` e
 * `engagement_time_msec` são o que faz o hit contar na sessão e nos relatórios de usuário ativo.
 */
export function buildPurchasePayload(row: PurchaseBookingRow, opts: BuildOptions = {}): Ga4PurchaseBody {
  const now = opts.now ?? new Date();
  const pay = paidPayment(row.payments);
  const items = purchaseItems(row);
  const coupon = row.price_breakdown?.coupon?.code;
  const params: Ga4PurchaseBody["events"][0]["params"] = {
    transaction_id: row.code,
    value: money(row.total_amount),
    currency: row.currency || CURRENCY,
    tax: 0,
    shipping: 0,
    affiliation: AFFILIATION,
    ...(coupon ? { coupon } : {}),
    ...(pay?.method ? { payment_type: pay.method } : {}),
    ...(row.ga_session_id ? { session_id: row.ga_session_id } : {}),
    engagement_time_msec: 100,
    event_source: "server",
    ...(opts.newCustomer === undefined ? {} : { new_customer: opts.newCustomer }),
    items,
  };
  const body: Ga4PurchaseBody = {
    client_id: row.ga_client_id || row.profile_id || row.id,
    ...(row.profile_id ? { user_id: row.profile_id } : {}),
    non_personalized_ads: false,
    events: [{ name: "purchase", params }],
  };
  const paidAt = pay?.paid_at ? new Date(pay.paid_at).getTime() : NaN;
  if (!Number.isNaN(paidAt) && now.getTime() - paidAt >= 0 && now.getTime() - paidAt <= TIMESTAMP_WINDOW_MS) {
    body.timestamp_micros = paidAt * 1000;
  }
  return body;
}

export type SendPurchaseResult =
  | { outcome: "sent"; body: Ga4PurchaseBody }
  | { outcome: "skipped"; reason: "unconfigured" | "already_sent" | "not_found" }
  | { outcome: "failed"; error: string };

export type SendPurchaseDeps = {
  fetch?: typeof fetch;
  config?: Ga4Config | null;
  now?: Date;
};

const PAID_STATUSES = ["confirmed", "checked_in", "completed"];

/**
 * Manda o `purchase` da reserva ao GA4. Nunca lança: devolve o que aconteceu, para o log de
 * quem chamou. Chamado do ponto de confirmação (webhook e reconciliação), pós-resposta.
 */
// deno-lint-ignore no-explicit-any
export async function sendPurchase(admin: any, bookingId: string, deps: SendPurchaseDeps = {}): Promise<SendPurchaseResult> {
  const config = deps.config === undefined ? ga4ConfigFromEnv() : deps.config;
  if (!config?.length) {
    console.warn("[ga4] GA4_MEASUREMENT_ID/GA4_API_SECRET ausentes: purchase do servidor desligado", bookingId);
    return { outcome: "skipped", reason: "unconfigured" };
  }

  // Reivindica o envio (exatamente-uma-vez). Só reserva confirmada: a RPC de confirmação já
  // rodou quando chegamos aqui, e um `noop` de reentrega não pode mandar de novo.
  let claimed = false;
  try {
    const { data } = await admin
      .from("booking")
      .update({ ga_purchase_sent_at: (deps.now ?? new Date()).toISOString() })
      .eq("id", bookingId)
      .is("ga_purchase_sent_at", null)
      .in("status", PAID_STATUSES)
      .select("id")
      .maybeSingle();
    if (!data) return { outcome: "skipped", reason: "already_sent" };
    claimed = true;

    const { data: row } = await admin
      .from("booking")
      .select(PURCHASE_BOOKING_SELECT)
      .eq("id", bookingId)
      .maybeSingle();
    if (!row) {
      await releaseClaim(admin, bookingId);
      return { outcome: "skipped", reason: "not_found" };
    }

    let newCustomer: boolean | undefined;
    if (row.profile_id) {
      const { count } = await admin
        .from("booking")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", row.profile_id)
        .neq("id", bookingId)
        .in("status", PAID_STATUSES);
      if (typeof count === "number") newCustomer = count === 0;
    }

    const body = buildPurchasePayload(row as PurchaseBookingRow, { newCustomer, now: deps.now });
    const json = JSON.stringify(body);
    // Uma propriedade que recusa libera a guarda: a próxima tentativa manda a todas de novo, e
    // a que já recebeu deduplica pelo `transaction_id`.
    const results = await Promise.all(
      config.map((t) =>
        (deps.fetch ?? fetch)(mpUrl(t), { method: "POST", headers: { "Content-Type": "application/json" }, body: json })
          .then((r) => ({ id: t.measurementId, status: r.status, ok: r.ok }))
      ),
    );
    const recusadas = results.filter((r) => !r.ok);
    if (recusadas.length) {
      await releaseClaim(admin, bookingId);
      const error = recusadas.map((r) => `${r.id}: HTTP ${r.status}`).join("; ");
      console.error("[ga4] purchase recusado:", bookingId, error);
      return { outcome: "failed", error };
    }
    console.log("[ga4] purchase enviado:", row.code, body.client_id === row.ga_client_id ? "sessão do navegador" : "sem cookie (fallback user_id)");
    return { outcome: "sent", body };
  } catch (e) {
    if (claimed) await releaseClaim(admin, bookingId);
    const error = redactSecret(e instanceof Error ? e.message : String(e));
    console.error("[ga4] falha ao enviar purchase:", bookingId, error);
    return { outcome: "failed", error };
  }
}

// deno-lint-ignore no-explicit-any
async function releaseClaim(admin: any, bookingId: string): Promise<void> {
  try {
    await admin.from("booking").update({ ga_purchase_sent_at: null }).eq("id", bookingId);
  } catch (e) {
    console.error("[ga4] não liberou a guarda:", bookingId, e);
  }
}
