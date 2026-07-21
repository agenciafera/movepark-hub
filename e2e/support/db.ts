/**
 * Helpers de banco para os specs E2E: leitura de estado e limpeza da fixture.
 *
 * ATENÇÃO: a suíte aponta para o banco de PRODUÇÃO. Todo delete daqui é
 * escopado na fixture Mercy e passa por duas guardas:
 *
 *   1. `assertFixtureScoped()` recusa constantes largas (vazias, '%', curtas).
 *   2. `cleanupFixture()` conta as empresas casadas antes de apagar e aborta
 *      se passar de MAX_FIXTURE_COMPANIES.
 *
 * Nunca troque um filtro por algo mais genérico sem repensar as guardas.
 * Usuários do `auth.users` não são apagados por esta suíte.
 */
import { admin } from "./supabaseAdmin";
import { env } from "./env";
import {
  FIXTURE_COMPANY_NAME,
  FIXTURE_EMAIL,
  FIXTURE_SLUG,
  FIXTURE_SLUG_PATTERN,
  MAX_FIXTURE_COMPANIES,
} from "./fixtures";

/** Barra qualquer alargamento acidental do escopo da fixture. */
export function assertFixtureScoped() {
  const bare = FIXTURE_SLUG_PATTERN.replaceAll("%", "").trim();
  if (bare.length < 4) {
    throw new Error(
      `[e2e] FIXTURE_SLUG_PATTERN "${FIXTURE_SLUG_PATTERN}" é largo demais para rodar delete em produção.`,
    );
  }
  if (!FIXTURE_EMAIL.includes("@") || !FIXTURE_EMAIL.includes("+")) {
    throw new Error(
      `[e2e] FIXTURE_EMAIL "${FIXTURE_EMAIL}" não parece um e-mail de teste com sub-endereço.`,
    );
  }
}

export async function getLead(email = FIXTURE_EMAIL) {
  const { data, error } = await admin
    .from("partner_lead")
    .select("*")
    .eq("contact_email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCompany(slugPattern = FIXTURE_SLUG_PATTERN) {
  const { data, error } = await admin
    .from("company")
    .select("id, name, slug, status, onboarding_status, contract_accepted_at, contract_version")
    .ilike("slug", slugPattern)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOnboarding(email = FIXTURE_EMAIL) {
  const { data, error } = await admin
    .from("company_onboarding")
    .select("*")
    .eq("contact_email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPayoutAccount(companyId: string) {
  const { data, error } = await admin
    .from("company_payout_account")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAppSetting(key: string) {
  const { data, error } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/**
 * Resolve o id do usuário pelo e-mail. A admin API não tem busca por e-mail,
 * então pagina o listUsers. Os usuários de teste já existem no banco, esta
 * função só descobre o id deles.
 */
export async function findUserIdByEmail(email: string): Promise<string> {
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
  }
  throw new Error(`[e2e] Usuário ${email} não encontrado no projeto ${env.supabaseUrl}.`);
}

/**
 * Garante que existe a company da fixture e que o operador de teste está
 * ligado a ela como dono.
 *
 * Por que isso existe: a limpeza da fixture apaga a company, e o vínculo em
 * `profile_company` cai por cascata. Sem recriar o vínculo, o operador entra
 * no app mas fica sem empresa, e as telas de `/operator` não têm o que
 * mostrar. No fluxo real esse vínculo nasce do convite por e-mail, que não dá
 * para automatizar, então aqui ele é semeado direto.
 *
 * Idempotente. Devolve o id da company.
 */
export async function seedFixtureCompany(): Promise<string> {
  assertFixtureScoped();

  const existing = await getCompany();
  let companyId = existing?.id;

  if (!companyId) {
    const { data, error } = await admin
      .from("company")
      .insert({
        name: FIXTURE_COMPANY_NAME,
        slug: FIXTURE_SLUG,
        onboarding_status: "pending_review",
      })
      .select("id")
      .single();
    if (error) throw error;
    companyId = data.id;
  }

  const profileId = await findUserIdByEmail(env.operatorEmail);
  const { error: linkError } = await admin
    .from("profile_company")
    .upsert({ profile_id: profileId, company_id: companyId, role: "owner" });
  if (linkError) throw linkError;

  return companyId;
}

/**
 * Limpa a fixture Mercy na ordem FK-safe do roteiro E1.3.
 * Idempotente: pode rodar com o banco já limpo.
 */
export async function cleanupFixture() {
  assertFixtureScoped();

  const { data: companies, error: listError } = await admin
    .from("company")
    .select("id, slug")
    .ilike("slug", FIXTURE_SLUG_PATTERN);
  if (listError) throw listError;

  const ids = (companies ?? []).map((c) => c.id);
  if (ids.length > MAX_FIXTURE_COMPANIES) {
    throw new Error(
      `[e2e] Limpeza abortada: o padrão "${FIXTURE_SLUG_PATTERN}" casou com ${ids.length} empresas ` +
        `(teto ${MAX_FIXTURE_COMPANIES}). Confira o padrão antes de rodar contra produção.`,
    );
  }

  if (ids.length > 0) {
    const { error } = await admin.from("company_payout_account").delete().in("company_id", ids);
    if (error) throw error;
  }

  const steps = [
    admin.from("company_onboarding").delete().eq("contact_email", FIXTURE_EMAIL),
    ids.length > 0
      ? admin.from("company").delete().in("id", ids)
      : Promise.resolve({ error: null }),
    admin.from("partner_lead").delete().eq("contact_email", FIXTURE_EMAIL),
  ];

  for (const step of steps) {
    const { error } = await step;
    if (error) throw error;
  }

  return { removedCompanies: ids.length };
}
