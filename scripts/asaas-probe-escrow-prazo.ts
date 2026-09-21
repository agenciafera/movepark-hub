/**
 * Probe 3: prazo máximo da Conta Escrow e estorno de valor sob garantia.
 *
 * Uso: bun run scripts/asaas-probe-escrow-prazo.ts
 *
 *   T1  Qual o teto de `daysToExpire`? A doc não diz. Importa porque a janela de risco de uma
 *       reserva vai até o check-in, que pode estar a meses de distância.
 *   T2  Dá para estornar a cobrança enquanto o valor está sob garantia? Se der, a Escrow cobre o
 *       cancelamento e volta a ser candidata; se não der, ela não serve para reserva antecipada.
 *   T3  A liberação manual (`/escrow/{id}/finish`) solta também a comissão que veio por split
 *       para a raiz, ou só a perna do parceiro?
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
  } catch { /* sem corpo */ }
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

async function main() {
  const me = await call("GET", "/myAccount");
  const wallets = await call("GET", "/wallets");
  const rootWallet = ((wallets.body as { data?: { id?: string }[] }).data ?? [])[0]?.id ?? "";
  console.log(`raiz: ${(me.body as { name?: string }).name} | wallet ${rootWallet.slice(0, 8)}`);

  const sub = await call("POST", "/accounts", {
    name: `Parceiro Prazo ${RUN}`,
    email: `probe.prazo.${RUN}@movepark.co`,
    cpfCnpj: randomCnpj(),
    companyType: "LIMITED",
    mobilePhone: "11991234567",
    address: "Avenida Paulista",
    addressNumber: "1000",
    province: "Bela Vista",
    postalCode: "01310100",
    incomeValue: 5000,
  });
  const subId = (sub.body as { id?: string }).id ?? "";
  const subKey = (sub.body as { apiKey?: string }).apiKey ?? "";
  if (!subId || !subKey) {
    console.error("Não criou a subconta:", JSON.stringify(sub.body).slice(0, 400));
    process.exit(1);
  }

  // ── T1: teto do daysToExpire ──────────────────────────────────────────────
  head("T1 - Teto de daysToExpire");
  for (const dias of [30, 60, 90, 180, 365, 730, 3650, 9999]) {
    const r = await call("POST", `/accounts/${subId}/escrow`, {
      enabled: true,
      daysToExpire: dias,
      isFeePayer: false,
    });
    const detalhe =
      r.status < 400
        ? "aceito"
        : JSON.stringify((r.body as { errors?: unknown }).errors ?? r.body).slice(0, 160);
    console.log(`daysToExpire=${String(dias).padStart(4)} -> HTTP ${r.status} ${detalhe}`);
  }

  // Deixa num valor alto e válido para o resto do teste.
  await call("POST", `/accounts/${subId}/escrow`, {
    enabled: true,
    daysToExpire: 90,
    isFeePayer: false,
  });

  // ── T2: estorno com o valor sob garantia ──────────────────────────────────
  head("T2 - Estornar cobrança cujo valor está sob garantia");
  const cli = await call(
    "POST",
    "/customers",
    { name: `Pagador ${RUN}`, cpfCnpj: "24971563792", email: `pg.${RUN}@movepark.co` },
    subKey,
  );
  const pay = await call(
    "POST",
    "/payments",
    {
      customer: (cli.body as { id?: string }).id,
      billingType: "PIX",
      value: 200.0,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `Reserva antecipada ${RUN}`,
      split: [{ walletId: rootWallet, percentualValue: 15 }],
    },
    subKey,
  );
  const payId = (pay.body as { id?: string }).id ?? "";
  await call("POST", `/sandbox/payment/${payId}/confirm`, undefined, subKey);

  const pago = await call("GET", `/payments/${payId}`, undefined, subKey);
  console.log(`escrow depois de pago: ${JSON.stringify((pago.body as Json).escrow)}`);
  const saldoAntes = await call("GET", "/finance/balance", undefined, subKey);
  console.log(`saldo da subconta (deve estar travado): ${JSON.stringify(saldoAntes.body)}`);

  const refund = await call(
    "POST",
    `/payments/${payId}/refund`,
    { description: "cliente cancelou a reserva" },
    subKey,
  );
  console.log(`\nPOST /payments/${payId}/refund -> HTTP ${refund.status}`);
  console.log(JSON.stringify(refund.body, null, 2).slice(0, 1200));
  console.log(
    refund.status < 400
      ? "\n>> ESTORNOU. A Escrow cobre o cancelamento: o dinheiro estava travado e voltou."
      : "\n>> RECUSOU. Valor sob garantia não pode ser estornado por API.",
  );

  const depois = await call("GET", `/payments/${payId}`, undefined, subKey);
  console.log(`\nescrow depois do estorno: ${JSON.stringify((depois.body as Json).escrow)}`);
  console.log(`refunds: ${JSON.stringify((depois.body as Json).refunds)}`);

  // ── T3: a liberação manual solta a comissão da raiz? ──────────────────────
  head("T3 - Liberação manual solta também a comissão da raiz?");
  const pay2 = await call(
    "POST",
    "/payments",
    {
      customer: (cli.body as { id?: string }).id,
      billingType: "PIX",
      value: 200.0,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `Reserva concluida ${RUN}`,
      split: [{ walletId: rootWallet, percentualValue: 15 }],
    },
    subKey,
  );
  const pay2Id = (pay2.body as { id?: string }).id ?? "";
  await call("POST", `/sandbox/payment/${pay2Id}/confirm`, undefined, subKey);

  const raizAntes = await call("GET", "/finance/balance");
  const p2 = await call("GET", `/payments/${pay2Id}`, undefined, subKey);
  const esc = (p2.body as { escrow?: { id?: string } }).escrow;
  console.log(`escrow id: ${esc?.id ?? "(sem escrow)"} | saldo raiz antes: ${JSON.stringify(raizAntes.body)}`);

  if (esc?.id) {
    const fin = await call("POST", `/escrow/${esc.id}/finish`, undefined, subKey);
    console.log(`POST /escrow/${esc.id}/finish -> HTTP ${fin.status}`);
    console.log(JSON.stringify(fin.body, null, 2).slice(0, 600));

    const subDepois = await call("GET", "/finance/balance", undefined, subKey);
    const raizDepois = await call("GET", "/finance/balance");
    console.log(`\nsaldo subconta depois: ${JSON.stringify(subDepois.body)}`);
    console.log(`saldo raiz depois:     ${JSON.stringify(raizDepois.body)}`);
    console.log(
      "\n>> Se o saldo da raiz subiu os ~30 da comissão, o finish solta as duas pernas.",
    );
  }
}

main().catch((e) => {
  console.error("quebrou:", e);
  process.exit(1);
});
