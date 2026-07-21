/**
 * Fixtures e helpers do roteiro C (jornada do consumidor).
 *
 * Ver `docs/testes/roteiro-consumidor-reserva.md`. As unidades daqui são de
 * PARCEIRO REAL em produção: este módulo só LÊ o banco e nunca apaga nada.
 *
 * Por que não existe helper de limpeza: `booking.location_id` é RESTRICT de
 * propósito. Reserva criada pelo roteiro nasceu na unidade de um parceiro de
 * verdade, e apagá-la falsearia o faturamento dele. A limpeza correta é
 * cancelar e estornar pelo produto, pela conta do cliente.
 */
import { expect, type Page } from "@playwright/test";
import { admin } from "./supabaseAdmin";
import { env } from "./env";

export type ConsumerFixture = {
  /** Slug da company (primeiro segmento de /p/:operator/:location/:type). */
  operatorSlug: string;
  /** Nome exibido da company. É o `h3` do card e o `h1` do detalhe. */
  operatorName: string;
  locationSlug: string;
  locationName: string;
  /** Código do destino, que é o valor de `?dest=` na busca (não é o slug). */
  destCode: string;
  /** Códigos de tipo de vaga ativos na unidade. */
  typeCodes: string[];
  /** Nomes de tipo de vaga, como aparecem na tela. */
  typeNames: string[];
  /** A unidade tem a amenidade `covered` marcada? É o eixo do C-02 e do C-04. */
  hasCoveredAmenity: boolean;
};

/**
 * Caso da contradição: três tipos (coberta, descoberta, premium) E a amenidade
 * `covered` na location. É onde o benefício "Coberto" vaza para dentro de um
 * card/página cujo tipo é "Vaga Descoberta".
 */
export const ABBAPARK: ConsumerFixture = {
  operatorSlug: "abbapark",
  operatorName: "Abbapark",
  locationSlug: "aeroporto-afonso-pena",
  locationName: "Aeroporto Afonso Pena",
  destCode: "CWB",
  typeCodes: ["covered", "uncovered", "premium"],
  typeNames: ["Vaga Coberta", "Vaga Descoberta", "Vaga Premium"],
  hasCoveredAmenity: true,
};

/**
 * Caso de controle: mesmos tipos coberta/descoberta, SEM a amenidade `covered`.
 * Se o defeito aparecer aqui também, a causa é o tipo de vaga; se aparecer só no
 * Abbapark, a causa é a amenidade da location vazando pro tipo.
 */
export const MAXI_PARK: ConsumerFixture = {
  operatorSlug: "maxi-park",
  operatorName: "Maxi Park",
  locationSlug: "maxi-park",
  locationName: "Maxi Park",
  destCode: "jardim-paulista",
  typeCodes: ["covered", "uncovered", "valet"],
  typeNames: ["Vaga Coberta", "Vaga Descoberta", "Valet"],
  hasCoveredAmenity: false,
};

/**
 * Caso mais barato. É a unidade dos specs transacionais: toda cobrança gerada
 * pelo roteiro é real, então a diária tem que ser a menor possível.
 */
export const MOTION_PARK: ConsumerFixture = {
  operatorSlug: "motion-park",
  operatorName: "Motion Park",
  locationSlug: "motion-park",
  locationName: "Motion Park",
  destCode: "tiete",
  typeCodes: ["uncovered", "covered"],
  typeNames: ["Vaga Descoberta", "Vaga Coberta"],
  hasCoveredAmenity: false,
};

/** Tipo de vaga usado nos specs transacionais (o mais barato do Motion Park). */
export const CHEAPEST_TYPE_CODE = "uncovered";

/** URL do detalhe de uma unidade, opcionalmente com as datas já resolvidas. */
export function listingUrl(
  fixture: ConsumerFixture,
  typeCode: string,
  range?: { from: string; to: string },
): string {
  const base = `/p/${fixture.operatorSlug}/${fixture.locationSlug}/${typeCode}`;
  if (!range) return base;
  return `${base}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

/** URL da busca escopada num destino. */
export function searchUrl(fixture: ConsumerFixture): string {
  return `/search?dest=${encodeURIComponent(fixture.destCode)}`;
}

/**
 * Intervalo de 1 diária começando amanhã.
 *
 * Data de entrada retroativa é bloqueada (commit `4eeae96`), então o roteiro
 * nunca crava data fixa: ele deriva de "hoje" a cada execução.
 */
export function oneNightRange(now = new Date()): { from: string; to: string } {
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return { yyyy, mm, dd };
  };
  const a = day(1);
  const b = day(2);
  return {
    from: `${a.yyyy}-${a.mm}-${a.dd}T08:00:00`,
    to: `${b.yyyy}-${b.mm}-${b.dd}T08:00:00`,
  };
}

/**
 * Intervalo de 1 diária começando daqui a `minutesFromNow`.
 *
 * Serve aos casos da parte 2, onde a JANELA é o objeto do teste: o C-20 precisa
 * de check-in a menos de 24h e o C-21 de check-in daqui a poucos minutos.
 *
 * Diferente do `oneNightRange`, aqui a data vai em ISO com `Z`. O motivo é
 * precisão: uma string ingênua ("2026-07-22T08:00:00") é lida como hora LOCAL,
 * e o fuso do runner Node não é necessariamente o do navegador. Com `Z` os dois
 * concordam no instante exato, que é o que o `fare_cancel_until` vai congelar.
 *
 * ARMADILHA DO SNAPSHOT: `fare_cancel_until` é congelado na criação da reserva.
 * Por isso a janela é montada aqui, no `check_in_at` de origem, e não mexendo no
 * banco depois. Ver "Armadilha central" no roteiro.
 */
export function rangeStartingIn(minutesFromNow: number, now = new Date()) {
  const from = new Date(now.getTime() + minutesFromNow * 60_000);
  const to = new Date(from.getTime() + 24 * 60 * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Rótulos de Tarifa aceitos pelo seletor do `ReservationCard`.
 *
 * "Flex" fica de fora de propósito: o botão é localizado por substring do nome
 * acessível, e "Flex" casaria também com "Superflex". Nenhum caso do roteiro
 * precisa da Flex, então o tipo bloqueia o erro em vez de documentá-lo.
 */
export type FareLabel = "Básica" | "Superflex";

// ---------------------------------------------------------------------------
// Leituras de banco (service_role, ignora RLS). Nenhuma escrita, nenhum delete.
// ---------------------------------------------------------------------------

export async function getBookingByCode(code: string) {
  const { data, error } = await admin
    .from("booking")
    .select(
      `id, code, status, expires_at, total_amount, check_in_at, check_out_at,
       customer_first_name, customer_last_name, customer_email, customer_phone,
       customer_tax_id, vehicle_id, created_at`,
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPaymentByBookingId(bookingId: string) {
  const { data, error } = await admin
    .from("payment")
    .select("id, booking_id, provider, method, status, amount, paid_at, refunded_at, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Estado de Tarifa e voucher da reserva. É o que a parte 2 do roteiro assere:
 * `fare_tier`, `fare_price_cents`, `fare_cancel_until` e `voucher_url`.
 */
export async function getBookingFareByCode(code: string) {
  const { data, error } = await admin
    .from("booking")
    .select(
      `id, code, status, check_in_at, check_out_at, total_amount,
       fare_tier, fare_price_cents, fare_cancel_until, voucher_url`,
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Estados que a Edge `voucher-pdf` aceita (`_shared/voucher/fields.ts:63`).
 * Qualquer outro é 422, que é o que o C-15 prova.
 */
export const VOUCHER_ALLOWED_STATUSES = ["confirmed", "checked_in", "completed"] as const;


/**
 * `pricing_rule.advance_booking_minutes` da unidade: antecedência mínima exigida
 * na criação da reserva (`_create_booking_core`).
 *
 * O C-21 reserva com check-in daqui a poucos minutos. Se a unidade exigir mais
 * antecedência que isso, a reserva nem é criada, e o teste falharia por um
 * motivo que não tem nada a ver com a janela de cancelamento. Por isso o spec lê
 * este valor antes e se pula sozinho, dizendo o porquê.
 */
export async function getAdvanceBookingMinutes(locationParkingTypeId: string): Promise<number> {
  const { data, error } = await admin
    .from("pricing_rule")
    .select("advance_booking_minutes")
    .eq("location_parking_type_id", locationParkingTypeId)
    .maybeSingle();
  if (error) throw error;
  return data?.advance_booking_minutes ?? 0;
}

/** O PDF do voucher existe no bucket privado `vouchers`? O caminho é `<id>.pdf`. */
export async function voucherFileExists(bookingId: string): Promise<boolean> {
  const { data, error } = await admin.storage
    .from("vouchers")
    .list("", { search: `${bookingId}.pdf` });
  if (error) throw error;
  return (data ?? []).some((f) => f.name === `${bookingId}.pdf`);
}

/** Tipos de vaga ativos de uma unidade, do mais barato pro mais caro. */
export async function listActiveParkingTypes(fixture: ConsumerFixture) {
  const { data, error } = await admin
    .from("location_parking_type")
    .select(
      `id, capacity, is_active,
       company_parking_type!inner(base_price, parking_type!inner(code, name)),
       location!inner(slug, company!inner(slug))`,
    )
    .eq("is_active", true)
    .eq("location.slug", fixture.locationSlug)
    .eq("location.company.slug", fixture.operatorSlug);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      capacity: row.capacity as number | null,
      basePrice: Number(row.company_parking_type.base_price),
      code: row.company_parking_type.parking_type.code as string,
      name: row.company_parking_type.parking_type.name as string,
    }))
    .sort((a, b) => a.basePrice - b.basePrice);
}

/**
 * Última reserva confirmada do cliente de teste, com o nome do tipo de vaga.
 * Usado pelo C-11, que lê o resultado do C-10 em vez de gerar outra cobrança.
 *
 * O nome do tipo vem do `booking_item` de `item_type = 'parking'`, que é a mesma
 * origem que a tela usa (`customerApi.ts`).
 */
export async function latestConfirmedBooking(customerEmail: string) {
  const { data, error } = await admin
    .from("booking")
    .select(
      `id, code, status, check_in_at, check_out_at, created_at,
       booking_item(item_type, parking_type(name, code))`,
    )
    .eq("customer_email", customerEmail)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const parkingItem = (data.booking_item ?? []).find((i) => i.item_type === "parking");
  return {
    id: data.id as string,
    code: data.code as string,
    checkInAt: data.check_in_at as string,
    checkOutAt: data.check_out_at as string,
    parkingTypeName: parkingItem?.parking_type?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Passos de navegação compartilhados pelos specs transacionais.
//
// ATENÇÃO: tudo daqui pra baixo ESCREVE em produção. Só é chamado pelo project
// `e2e-consumer-tx`, que fica fora da execução padrão do Playwright.
// ---------------------------------------------------------------------------

/**
 * Cria a reserva pela UI e devolve o código.
 *
 * As datas vão pela query string em vez do calendário: o `ReservationCard` lê
 * `?from=`/`?to=` como estado inicial, então o teste não depende do popover do
 * react-day-picker nem do fuso do runner.
 */
export async function reserveCheapest(page: Page): Promise<string> {
  return reserveWithFare(page, { fare: "Básica", range: oneNightRange() });
}

/**
 * Mesma criação de reserva, com Tarifa e janela escolhidas.
 *
 * A parte 2 do roteiro precisa das duas coisas: o C-21 nasce em Superflex e o
 * C-20 nasce com check-in a menos de 24h. As datas continuam indo pela query
 * string, que o `ReservationCard` lê como estado inicial, então o teste não
 * depende do popover do calendário nem do fuso do runner.
 */
export async function reserveWithFare(
  page: Page,
  opts: { fare: FareLabel; range?: { from: string; to: string } },
): Promise<string> {
  const range = opts.range ?? oneNightRange();
  await page.goto(listingUrl(MOTION_PARK, CHEAPEST_TYPE_CODE, range));

  // A default da UI é a Flex, que soma sobretaxa ao total. A escolha é sempre
  // explícita aqui. O nome acessível do botão traz rótulo + tagline, então a
  // busca é por substring (ver o comentário de `FareLabel`).
  await page.getByRole("button", { name: opts.fare }).click();

  const reserve = page.getByRole("button", { name: "Reservar agora" });
  await expect(reserve).toBeEnabled({ timeout: 30_000 });
  await reserve.click();

  await page.waitForURL(/\/checkout\/[A-Z0-9-]+/i, { timeout: 30_000 });
  const code = new URL(page.url()).pathname.split("/").pop();
  if (!code) throw new Error("[e2e] Não consegui ler o código da reserva na URL do checkout.");
  return code;
}

/**
 * Nome do titular usado no passo 1. É o mesmo que já está no `profiles` do
 * cliente de teste de propósito: o passo 1 sincroniza o perfil, e inventar um
 * nome aqui reescreveria o cadastro dele a cada execução.
 */
export const CUSTOMER_FIRST_NAME = "Pedro";
export const CUSTOMER_LAST_NAME = "Araujo";

/** Passo 1 do checkout: identidade, contato e aceite dos Termos. */
export async function fillIdentityStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Identificação" })).toBeVisible({
    timeout: 30_000,
  });

  await page.locator("#id-first-name").fill(CUSTOMER_FIRST_NAME);
  await page.locator("#id-last-name").fill(CUSTOMER_LAST_NAME);
  // O telefone tem dois controles (país e número). Mirar no errado deixa o
  // número vazio e o passo trava sem mensagem clara.
  await page.locator("#id-phone").fill("11987727182");

  await page.locator("#accept-terms").check();
  await page.getByRole("button", { name: "Continuar" }).first().click();
}

/** Passo 2 do checkout: veículo. O cliente de teste já tem veículos salvos. */
export async function fillVehicleStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Veículo" })).toBeVisible({ timeout: 30_000 });

  // O primeiro veículo já vem selecionado pelo efeito do Step2Vehicle; clicar
  // de novo só torna a escolha explícita no rastro do teste.
  const firstVehicle = page.locator("button[aria-pressed]").first();
  await expect(firstVehicle).toBeVisible({ timeout: 20_000 });
  await firstVehicle.click();

  await page.getByRole("button", { name: "Continuar" }).first().click();
}

/** Leva do zero até o passo 3 (pagamento) sem gerar cobrança. */
export async function reserveUntilPayment(page: Page): Promise<string> {
  const code = await reserveCheapest(page);
  await fillIdentityStep(page);
  await fillVehicleStep(page);
  await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible({ timeout: 30_000 });
  return code;
}

/**
 * Leva a reserva do zero até CONFIRMADA, com Tarifa e janela escolhidas.
 *
 * GERA COBRANÇA REAL NO PAGAR.ME. Na conta atual o PIX liquida sozinho em 1 a 3
 * segundos, e quem confirma a reserva é o webhook, não a `create-pix-charge`.
 * Se travar aqui, o suspeito é a entrega do webhook: comece pelo `get_logs`.
 *
 * Ao voltar, a página está no passo 4 do checkout.
 */
export async function bookAndPay(
  page: Page,
  opts: { fare: FareLabel; range?: { from: string; to: string } },
): Promise<string> {
  const code = await reserveWithFare(page, opts);
  await fillIdentityStep(page);
  await fillVehicleStep(page);
  await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Gerar PIX" }).click();
  await expect(page.getByRole("button", { name: "Copiar código PIX" })).toBeVisible({
    timeout: 45_000,
  });

  // A tela avança sozinha pro passo 4 pelo polling de 2s do checkout.
  await expect(page.getByRole("heading", { name: "Reserva confirmada!" })).toBeVisible({
    timeout: 90_000,
  });
  return code;
}

/**
 * Chama uma Edge Function com o JWT do cliente logado, por fora da UI.
 *
 * Existe por causa do C-20: a ausência do botão na tela pode ser CSS, então ela
 * não prova gate nenhum. A prova é a Edge devolvendo 403. O token sai do
 * localStorage que o próprio app gravou, o mesmo caminho do bypass de auth.
 *
 * A página precisa estar na origem do app para enxergar o localStorage.
 */
export async function callEdgeAsCustomer<T = Record<string, unknown>>(
  page: Page,
  fnName: string,
  body: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ supabaseUrl, anonKey, fnName, body }) => {
      const key = Object.keys(window.localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (!key) throw new Error("[e2e] Sem sessão no localStorage: o storageState não carregou.");
      const token = (JSON.parse(window.localStorage.getItem(key)!) as { access_token?: string })
        .access_token;
      if (!token) throw new Error("[e2e] Sessão sem access_token no localStorage.");

      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { supabaseUrl: env.supabaseUrl, anonKey: env.supabaseAnonKey, fnName, body },
  ) as Promise<{ status: number; body: T }>;
}
