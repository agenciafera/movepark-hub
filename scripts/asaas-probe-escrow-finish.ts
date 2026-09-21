/**
 * Probe 4: a liberação manual da garantia funciona, e depois dela dá para estornar?
 *
 * O probe anterior mostrou que valor sob garantia não pode ser estornado (o saldo disponível é
 * zero). O contorno óbvio seria encerrar a garantia antes e estornar depois. Este teste verifica
 * se esse contorno existe de verdade.
 *
 * Uso: bun run scripts/asaas-probe-escrow-finish.ts
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
if (!KEY.startsWith("$aact_hmlg_")) process.exit(1);

const RUN =
  new Date().toISOString().slice(0, 16).replace(/\D/g, "") + "x" +
  Math.random().toString(36).slice(2, 6);

type Json = Record<string, unknown>;

async function call(method: string, path: string, body?: unknown, key = KEY) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "mp-probe" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: Json = {};
  try { parsed = (await res.json()) as Json; } catch { /* sem corpo */ }
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

async function main() {
  const sub = await call("POST", "/accounts", {
    name: `Finish ${RUN}`,
    email: `probe.finish.${RUN}@movepark.co`,
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
  console.log(`subconta ${subId.slice(0, 8)} | key ${subKey ? "ok" : "AUSENTE"}`);

  await call("POST", `/accounts/${subId}/escrow`, {
    enabled: true, daysToExpire: 45, isFeePayer: false,
  });

  const cli = await call("POST", "/customers",
    { name: `Pagador ${RUN}`, cpfCnpj: "24971563792", email: `pg.${RUN}@movepark.co` }, subKey);
  const pay = await call("POST", "/payments", {
    customer: (cli.body as { id?: string }).id,
    billingType: "PIX",
    value: 200.0,
    dueDate: new Date().toISOString().slice(0, 10),
    description: `Reserva ${RUN}`,
  }, subKey);
  const payId = (pay.body as { id?: string }).id ?? "";
  await call("POST", `/sandbox/payment/${payId}/confirm`, undefined, subKey);

  const pago = await call("GET", `/payments/${payId}`, undefined, subKey);
  const esc = (pago.body as { escrow?: { id?: string; status?: string } }).escrow;
  console.log(`escrow: ${JSON.stringify(esc)}`);
  console.log(`saldo travado: ${JSON.stringify((await call("GET", "/finance/balance", undefined, subKey)).body)}`);

  // Listagem de garantias, pelos dois lados, para achar o identificador certo.
  for (const [nome, k] of [["SUBCONTA", subKey], ["RAIZ", KEY]] as const) {
    const l = await call("GET", "/escrow?limit=5", undefined, k);
    console.log(`\nGET /escrow (${nome}) -> HTTP ${l.status}: ${JSON.stringify(l.body).slice(0, 400)}`);
  }

  // Encerrar a garantia, tentando as duas chaves.
  if (esc?.id) {
    for (const [nome, k] of [["SUBCONTA", subKey], ["RAIZ", KEY]] as const) {
      const f = await call("POST", `/escrow/${esc.id}/finish`, undefined, k);
      console.log(`\nPOST /escrow/${esc.id}/finish (${nome}) -> HTTP ${f.status}: ${JSON.stringify(f.body).slice(0, 400)}`);
      if (f.status < 400) break;
    }
    const dep = await call("GET", `/payments/${payId}`, undefined, subKey);
    console.log(`\nescrow depois do finish: ${JSON.stringify((dep.body as Json).escrow)}`);
    const saldo = await call("GET", "/finance/balance", undefined, subKey);
    console.log(`saldo depois do finish: ${JSON.stringify(saldo.body)}`);

    // Com a garantia encerrada, o estorno passa?
    const ref = await call("POST", `/payments/${payId}/refund`,
      { description: "cancelamento apos liberar a garantia" }, subKey);
    console.log(`\nPOST /payments/${payId}/refund -> HTTP ${ref.status}: ${JSON.stringify(ref.body).slice(0, 500)}`);
    console.log(ref.status < 400
      ? "\n>> Contorno EXISTE: encerrar a garantia e estornar em seguida."
      : "\n>> Contorno NÃO existe pela API.");
  }
}

main().catch((e) => { console.error("quebrou:", e); process.exit(1); });
