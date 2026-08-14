/**
 * Probe 2 do sandbox do Asaas: a ideia da subconta de custódia da própria Movepark.
 *
 * A proposta em teste: criar uma subconta da Movepark, ligar a Escrow nela, concentrar o dinheiro
 * ali e transferir dali para as subcontas dos parceiros.
 *
 * Uso: bun run scripts/asaas-probe-custodia.ts   (lê ASAAS_SANDBOX_KEY do .env.local)
 *
 * Perguntas:
 *   T1  Dá para criar subconta com o MESMO CNPJ da raiz? Se não der, a conta de custódia exige
 *       outro CNPJ, ou seja, outra pessoa jurídica. Isso deixa de ser decisão técnica.
 *   T2  Subconta transfere para outra subconta da mesma raiz? É o que a ideia exige para o
 *       repasse sair da custódia e chegar no parceiro.
 *   T3  Saldo travado pela Escrow bloqueia a transferência de saída? Se bloquear, a custódia com
 *       Escrow ligada não consegue repassar antes de a garantia ser encerrada.
 */

function keyFromEnvFile(): string {
  try {
    const raw = require("node:fs").readFileSync(".env.local", "utf8") as string;
    const line = raw.split("\n").find((l) => l.startsWith("ASAAS_SANDBOX_KEY="));
    return line ? line.slice("ASAAS_SANDBOX_KEY=".length).trim().replace(/^['"]|['"]$/g, "") : "";
  } catch {
    return "";
  }
}

const KEY = process.env.ASAAS_SANDBOX_KEY || keyFromEnvFile();
const BASE = "https://api-sandbox.asaas.com/v3";
if (!KEY.startsWith("$aact_hmlg_")) {
  console.error("Recusado: chave precisa ser de sandbox ($aact_hmlg_).");
  process.exit(1);
}

const RUN =
  new Date().toISOString().slice(0, 16).replace(/\D/g, "") +
  "x" +
  Math.random().toString(36).slice(2, 6);

type Json = Record<string, unknown>;

async function call(method: string, path: string, body?: unknown, key = KEY) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "mp-probe" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: Json = {};
  try {
    parsed = (await res.json()) as Json;
  } catch { /* corpo vazio */ }
  return { status: res.status, body: parsed };
}

function randomCnpj(): string {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  const digits = [...base, 0, 0, 0, 1];
  const dv = (w: number[]) => {
    const rest = w.reduce((a, x, i) => a + digits[i] * x, 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  digits.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  digits.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return digits.join("");
}

function head(t: string) {
  console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
}

async function novaSubconta(nome: string, cnpj: string) {
  return call("POST", "/accounts", {
    name: `${nome} ${RUN}`,
    email: `probe.${nome.toLowerCase().replace(/\W/g, "")}.${RUN}@movepark.co`,
    cpfCnpj: cnpj,
    companyType: "LIMITED",
    mobilePhone: "11991234567",
    address: "Avenida Paulista",
    addressNumber: "1000",
    province: "Bela Vista",
    postalCode: "01310100",
    incomeValue: 5000,
  });
}

async function main() {
  const me = await call("GET", "/myAccount");
  const cnpjRaiz = (me.body as { cpfCnpj?: string }).cpfCnpj ?? "";
  console.log(`Conta raiz: ${(me.body as { name?: string }).name} | CNPJ ${cnpjRaiz}`);

  // ── T1 ────────────────────────────────────────────────────────────────────
  head("T1 - Subconta de custódia com o MESMO CNPJ da raiz");
  const mesmoCnpj = await novaSubconta("Movepark Custodia", cnpjRaiz);
  console.log(`HTTP ${mesmoCnpj.status}`);
  console.log(JSON.stringify(mesmoCnpj.body, null, 2).slice(0, 800));
  console.log(
    mesmoCnpj.status < 400
      ? "\n>> ACEITOU. Dá para ter uma conta de custódia no mesmo CNPJ."
      : "\n>> RECUSOU. A conta de custódia exigiria outro CNPJ, ou seja, outra pessoa jurídica.",
  );

  // ── T2 ────────────────────────────────────────────────────────────────────
  head("T2 - Transferência entre duas subcontas da mesma raiz");
  const custodia = await novaSubconta("Custodia", randomCnpj());
  const parceiro = await novaSubconta("Parceiro", randomCnpj());
  const custKey = (custodia.body as { apiKey?: string }).apiKey ?? "";
  const custId = (custodia.body as { id?: string }).id ?? "";
  const parcWallet = (parceiro.body as { walletId?: string }).walletId ?? "";
  console.log(`custódia=${custId.slice(0, 8)} parceiro.wallet=${parcWallet.slice(0, 8)}`);

  if (!custKey || !parcWallet) {
    console.log(">> Não deu para montar o par de subcontas; T2 e T3 ficam sem resposta.");
    return;
  }

  // A custódia precisa de saldo. Cobrança nela mesma, sem split, e confirma.
  const cli = await call(
    "POST",
    "/customers",
    { name: `Pagador ${RUN}`, cpfCnpj: "24971563792", email: `p.${RUN}@movepark.co` },
    custKey,
  );
  const pay = await call(
    "POST",
    "/payments",
    {
      customer: (cli.body as { id?: string }).id,
      billingType: "PIX",
      value: 200.0,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `Custodia ${RUN}`,
    },
    custKey,
  );
  const payId = (pay.body as { id?: string }).id ?? "";
  await call("POST", `/sandbox/payment/${payId}/confirm`, undefined, custKey);

  const saldo1 = await call("GET", "/finance/balance", undefined, custKey);
  console.log(`saldo da custódia depois da cobrança: ${JSON.stringify(saldo1.body)}`);

  const t2 = await call(
    "POST",
    "/transfers",
    { value: 50.0, walletId: parcWallet, externalReference: `T2-${RUN}` },
    custKey,
  );
  console.log(`\nPOST /transfers (subconta -> subconta) -> HTTP ${t2.status}`);
  console.log(JSON.stringify(t2.body, null, 2).slice(0, 900));
  console.log(
    t2.status < 400
      ? "\n>> ACEITOU. Custódia consegue repassar direto para o parceiro."
      : "\n>> RECUSOU. O repasse teria que passar pela raiz.",
  );

  // ── T3 ────────────────────────────────────────────────────────────────────
  head("T3 - Escrow ligada trava a saída do dinheiro?");
  const lig = await call("POST", `/accounts/${custId}/escrow`, {
    enabled: true,
    daysToExpire: 7,
    isFeePayer: false,
  });
  console.log(`ligar escrow na custódia -> HTTP ${lig.status} ${JSON.stringify(lig.body)}`);

  // Nova cobrança, agora já sob garantia.
  const pay2 = await call(
    "POST",
    "/payments",
    {
      customer: (cli.body as { id?: string }).id,
      billingType: "PIX",
      value: 300.0,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `Custodia sob garantia ${RUN}`,
    },
    custKey,
  );
  const pay2Id = (pay2.body as { id?: string }).id ?? "";
  await call("POST", `/sandbox/payment/${pay2Id}/confirm`, undefined, custKey);
  const depois = await call("GET", `/payments/${pay2Id}`, undefined, custKey);
  console.log(`escrow da 2a cobrança: ${JSON.stringify((depois.body as Json).escrow)}`);

  const saldo2 = await call("GET", "/finance/balance", undefined, custKey);
  console.log(`saldo da custódia: ${JSON.stringify(saldo2.body)}`);

  // Tenta repassar um valor que só fecha se o dinheiro sob garantia estiver disponível.
  const t3 = await call(
    "POST",
    "/transfers",
    { value: 250.0, walletId: parcWallet, externalReference: `T3-${RUN}` },
    custKey,
  );
  console.log(`\nPOST /transfers de 250 (precisa do dinheiro travado) -> HTTP ${t3.status}`);
  console.log(JSON.stringify(t3.body, null, 2).slice(0, 600));
  console.log(
    t3.status >= 400
      ? "\n>> BLOQUEOU. Com Escrow ligada, a custódia não repassa antes de encerrar a garantia."
      : "\n>> PASSOU. O saldo sob garantia não impediu a saída (conferir o saldo depois).",
  );
}

main().catch((e) => {
  console.error("quebrou:", e);
  process.exit(1);
});
