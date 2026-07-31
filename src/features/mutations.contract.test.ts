import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";

/**
 * Inventário de cobertura das mutations (CRUD) das features.
 *
 * É varredura de fonte, e não render, porque a pergunta aqui não é "esse hook
 * funciona", é "esse hook TEM teste". Cobertura em porcentagem não responde
 * isso: um `api.ts` com 12 hooks e 1 testado pode marcar 80% de linhas, já que
 * as linhas compartilhadas (select base, query keys) contam para todos.
 *
 * A lista abaixo é o placar da Fase 5 do plano de cobertura. Ela só encolhe:
 * ao escrever o teste de um hook, remova o nome daqui no mesmo commit. Se
 * sobrar, o teste reprova dizendo qual saiu da lista sem ser removido, e isso
 * é de propósito: allowlist que ninguém poda vira decoração.
 */

const FEATURES = join(process.cwd(), "src", "features");

/** Mutations ainda sem teste. Só encolhe. Ver docs do plano de cobertura. */
const SEM_TESTE = [
  "addons:useUpsertAddon",
  "addons:useSetLocationAddon",
  "addons:useDeleteAddon",
  "amenities:useSetLocationAmenities",
  "api-keys:useUpdateApiKeyScopes",
  "availability:useSetDateBlocked",
  "bookings:useVoucherPdf",
  "bookings:useChangeBookingVehicle",
  "bookings:useChangeBookingDates",
  "bookings:useChangePaidBookingDates",
  "companies:useSetCompanyTakeRate",
  "coupons:useUpsertCoupon",
  "coupons:useSetCouponActive",
  "coupons:useDeleteCoupon",
  "destinations:useCreateDestination",
  "destinations:useUpdateDestination",
  "destinations:useDeleteDestination",
  "destinations:useCreateDestinationPoint",
  "destinations:useUpdateDestinationPoint",
  "destinations:useDeleteDestinationPoint",
  "discounts:useUpsertDiscount",
  "discounts:useSetDiscountActive",
  "discounts:useDeleteDiscount",
  "faqs:useUpsertFaqCategory",
  "faqs:useDeleteFaqCategory",
  "faqs:useCreateFaq",
  "faqs:useUpdateFaq",
  "faqs:useDeleteFaq",
  "fares:useCreateFareUpgrade",
  "growth:useRedeemReferral",
  "identity:useRequestAttachOtp",
  "identity:useConfirmAttach",
  "legal:usePublishLegalDocument",
  "legal:useAcceptTerms",
  "locations:useCreateLocation",
  "locations:useUpdateLocation",
  "onboarding:useSubmitGo2ParkInterest",
  "onboarding:usePartnerAction",
  "onboarding:useOnboardingData",
  "parking-types:useUpdateLocationParkingType",
  "parking-types:useEnableCompanyParkingType",
  "parking-types:useCreateLocationParkingType",
  "parking-types:useUpdateCompanyParkingType",
  "parking-types:useOperatorSetPricing",
  "parking-types:useSimulatePrice",
  "payouts:useSavePayoutAccountAdmin",
  "payouts:useSavePayoutAccountSelf",
  "payouts:useAcceptContract",
  "payouts:useSyncRecipient",
  "profile:useUpdateProfile",
  "profile:useSignOutEverywhere",
  "reviews:useSubmitReview",
  "reviews:useSetReviewPublished",
  "reviews:useRespondReview",
  "settings:useUpdateAppSettings",
  "team:useSetMemberRole",
  "team:useInviteMember",
  "team:useRemoveMember",
  "users:useUpdateUserRole",
  "users:useLinkUserCompany",
  "users:useUnlinkUserCompany",
  "voucher:useVoucherCheckIn",
];

/** Todo `api.ts` / `*Api.ts` de feature, onde os hooks de dados moram. */
function arquivosDeApi(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return arquivosDeApi(p);
    return /^(api|.*Api)\.ts$/.test(e.name) ? [p] : [];
  });
}

/**
 * Um hook é mutation se `useMutation` aparece entre a assinatura dele e a do
 * próximo export. Delimitar importa: uma janela fixa de caracteres captura o
 * `useMutation` do vizinho e classifica query como mutation.
 */
function mutationsDe(source: string): string[] {
  const marcas = [...source.matchAll(/export (?:async )?function (use[A-Z]\w*)/g)];
  return marcas
    .filter((m, i) => {
      const fim = i + 1 < marcas.length ? marcas[i + 1].index! : source.length;
      return /useMutation\s*[<(]/.test(source.slice(m.index!, fim));
    })
    .map((m) => m[1]);
}

const inventario = arquivosDeApi(FEATURES).flatMap((arquivo) => {
  const source = readFileSync(arquivo, "utf8");
  const hooks = mutationsDe(source);
  if (hooks.length === 0) return [];

  const pasta = dirname(arquivo);
  const testes = readdirSync(pasta)
    .filter((n) => /\.test\.tsx?$/.test(n))
    .map((n) => readFileSync(join(pasta, n), "utf8"))
    .join("\n");

  const dominio = relative(FEATURES, arquivo).split("/")[0];
  return hooks.map((hook) => ({ id: `${dominio}:${hook}`, coberto: testes.includes(hook) }));
});

describe("inventário de mutations", () => {
  it("varre um conjunto de mutations não-vazio", () => {
    // Guarda contra o próprio guard virar vacuidade: se a regex parar de casar
    // (renomearam api.ts, mudou o padrão de export), tudo passaria calado.
    expect(inventario.length).toBeGreaterThan(80);
  });

  it("nenhuma mutation nova entra sem teste", () => {
    const novas = inventario
      .filter((m) => !m.coberto && !SEM_TESTE.includes(m.id))
      .map((m) => m.id);
    expect(novas).toEqual([]);
  });

  it("a allowlist não guarda mutation que já ganhou teste", () => {
    const cobertas = inventario.filter((m) => m.coberto && SEM_TESTE.includes(m.id)).map((m) => m.id);
    expect(cobertas).toEqual([]);
  });

  it("a allowlist não guarda mutation que deixou de existir", () => {
    const ids = new Set(inventario.map((m) => m.id));
    expect(SEM_TESTE.filter((id) => !ids.has(id))).toEqual([]);
  });
});
