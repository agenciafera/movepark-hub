/**
 * Probe do sandbox do Asaas (spike E?.? - avaliação de troca de gateway).
 *
 * Existe para responder, contra a API de verdade, as perguntas que a documentação deixa em aberto
 * e que definem o desenho da integração. Não é código de produção e não roda em CI.
 *
 * Uso:
 *   ASAAS_SANDBOX_KEY='$aact_hmlg_...' bun run scripts/asaas-probe.ts
 *
 * Guarda dura: recusa qualquer chave que não seja de sandbox (`$aact_hmlg_`). O probe cria
 * subconta, cobrança e transferência, então rodar isso com chave viva mexeria em dinheiro real.
 *
 * As perguntas, na ordem em que o probe responde:
 *
 *   Q1  A Conta Escrow retém valor que a subconta recebe VIA SPLIT de uma cobrança criada na
 *       conta raiz? Esta é a pergunta que decide o desenho inteiro. Se sim, a Movepark segue
 *       titular da cobrança (como hoje) e o parceiro fica invisível, atendendo o ADR-004. Se não,
 *       a escrow só serve com a cobrança criada NA subconta, e aí o parceiro vira o titular.
 *   Q2  `POST /v3/payments` aceita expiração do PIX em minutos? Hoje a validade do QR é amarrada
 *       à janela de hold (E0.3.1-a). Sem isso, o QR sobrevive ao hold e volta o bug de dinheiro
 *       capturado sem vaga.
 *   Q3  Transferência raiz -> subconta funciona e é imediata? É o plano B (modelo de custódia).
 *   Q4  Qual a forma real do objeto `escrow` e do `split` na cobrança, para modelar as colunas.
 */

const KEY = process.env.ASAAS_SANDBOX_KEY ?? "";
const BASE = "https://api-sandbox.asaas.com/v3";

if (!KEY) {
  console.error("Falta ASAAS_SANDBOX_KEY no ambiente.");
  process.exit(1);
}
if (!KEY.startsWith("$aact_hmlg_")) {
  console.error(
    "Recusado: a chave não é de sandbox (esperado prefixo $aact_hmlg_).\n" +
      "Este probe cria subconta, cobrança e transferência. Com chave viva, isso é dinheiro real.",
  );
  process.exit(1);
}

// Sufixo estável por execução, para dar para achar o lixo no painel depois.
const RUN = new Date().toISOString().slice(0, 16).replace(/\D/g, "");

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  body?: unknown,
  key: string = KEY,
): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      access_token: key,
      "Content-Type": "application/json",
      // Obrigatório para contas criadas depois de 13/06/2024.
      "User-Agent": "movepark-hub-probe",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: Json = {};
  try {
    parsed = (await res.json()) as Json;
  } catch {
    parsed = {};
  }
  return { status: res.status, body: parsed };
}

function head(n: number, title: string) {
  console.log(`\n${"=".repeat(72)}\n${n}. ${title}\n${"=".repeat(72)}`);
}

function show(label: string, r: { status: number; body: Json }) {
  console.log(`${label} -> HTTP ${r.status}`);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 2500));
}

/** Falha explícita: sem esse passo os seguintes não provam nada. */
function must<T>(value: T | null | undefined, msg: string): T {
  if (value == null || value === "") {
    console.error(`\nABORTADO: ${msg}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  // ── 0. Identidade da conta raiz ───────────────────────────────────────────
  head(0, "Conta raiz: identidade, walletId e saldo");
  const me = await call("GET", "/myAccount");
  show("GET /myAccount", me);
  const rootBalance = await call("GET", "/finance/balance");
  show("GET /finance/balance", rootBalance);

  const rootWallet = (me.body as { walletId?: string }).walletId ?? null;
  console.log(`\n>> walletId da raiz: ${rootWallet ?? "(não veio no /myAccount)"}`);

  // ── 1. Subconta do parceiro ───────────────────────────────────────────────
  head(1, "Criar subconta (o parceiro)");
  const sub = await call("POST", "/accounts", {
    name: `Probe Estacionamento ${RUN}`,
    email: `probe.parceiro.${RUN}@movepark.co`,
    cpfCnpj: "34028316000103", // CNPJ público dos Correios, só para o sandbox aceitar o dígito
    companyType: "LIMITED",
    mobilePhone: "11999999999",
    address: "Avenida Paulista",
    addressNumber: "1000",
    province: "Bela Vista",
    postalCode: "01310100",
    incomeValue: 5000,
  });
  show("POST /accounts", sub);

  const subId = must((sub.body as { id?: string }).id, "subconta não foi criada");
  const subWallet = must((sub.body as { walletId?: string }).walletId, "subconta sem walletId");
  // A apiKey só volta AQUI. Não dá para recuperar depois, só gerar outra.
  const subKey = (sub.body as { apiKey?: string }).apiKey ?? null;
  console.log(`\n>> subconta id=${subId} wallet=${subWallet} apiKey=${subKey ? "(recebida)" : "(NÃO veio)"}`);

  // ── 2. Conta Escrow na subconta ───────────────────────────────────────────
  head(2, "Habilitar Conta Escrow na subconta (chave da RAIZ)");
  const escrowCfg = await call("POST", `/accounts/${subId}/escrow`, {
    enabled: true,
    daysToExpire: 7,
    isFeePayer: false,
  });
  show(`POST /accounts/${subId}/escrow`, escrowCfg);
  if (escrowCfg.status >= 400) {
    console.log(
      "\n>> Erro aqui quase nunca é código. O primeiro pré-requisito da Conta Escrow é a\n" +
        "   funcionalidade estar liberada PARA A CONTA, e sandbox e produção são liberações\n" +
        "   separadas. Se a mensagem falar em indisponibilidade, peça ao gerente do Asaas a\n" +
        "   liberação no sandbox. Sem isso os passos 7 e 8 não provam nada.",
    );
  }

  // ── 3. Cliente pagador (na raiz) ──────────────────────────────────────────
  head(3, "Criar cliente pagador na conta raiz");
  const customer = await call("POST", "/customers", {
    name: `Probe Cliente ${RUN}`,
    cpfCnpj: "24971563792", // CPF de teste do próprio Asaas
    email: `probe.cliente.${RUN}@movepark.co`,
    mobilePhone: "11988888888",
  });
  show("POST /customers", customer);
  const customerId = must((customer.body as { id?: string }).id, "cliente não foi criado");

  // ── 4. Cobrança PIX na RAIZ com split para a subconta ─────────────────────
  // Q2 vai junto: mandamos minutesToExpire para ver se a API aceita ou ignora.
  head(4, "Cobrança PIX na RAIZ, com split para a subconta [Q1 + Q2]");
  const today = new Date().toISOString().slice(0, 10);
  const payment = await call("POST", "/payments", {
    customer: customerId,
    billingType: "PIX",
    value: 100.0,
    dueDate: today,
    description: `Probe reserva ${RUN}`,
    externalReference: `PROBE-${RUN}`,
    // Q2: campo documentado para checkout PIX. Aqui é o teste de se vale em /payments.
    minutesToExpire: 30,
    // 85% para o parceiro; a diferença (comissão da Movepark) fica na raiz automaticamente.
    split: [{ walletId: subWallet, percentualValue: 85 }],
  });
  show("POST /payments", payment);
  const paymentId = must((payment.body as { id?: string }).id, "cobrança não foi criada");

  head(5, "QR Code do PIX [Q2: validade real]");
  const qr = await call("GET", `/payments/${paymentId}/pixQrCode`);
  show(`GET /payments/${paymentId}/pixQrCode`, qr);
  console.log(
    "\n>> Compare expirationDate com agora. Se vier fim do dia (ou +12 meses), " +
      "minutesToExpire foi ignorado e o QR NÃO morre junto com o hold de 30 min.",
  );

  // ── 6. Simular o pagamento ────────────────────────────────────────────────
  head(6, "Confirmar o pagamento (rota exclusiva de sandbox)");
  const confirm = await call("POST", `/sandbox/payment/${paymentId}/confirm`);
  show(`POST /sandbox/payment/${paymentId}/confirm`, confirm);

  // ── 7. A pergunta central ─────────────────────────────────────────────────
  head(7, "Cobrança depois de paga: objetos escrow e split [Q1 + Q4]");
  const after = await call("GET", `/payments/${paymentId}`);
  show(`GET /payments/${paymentId}`, after);
  const escrowObj = (after.body as { escrow?: unknown }).escrow;
  console.log(
    `\n>> escrow na cobrança da RAIZ: ${escrowObj ? JSON.stringify(escrowObj) : "AUSENTE"}`,
  );

  // ── 8. O saldo da subconta é a prova ──────────────────────────────────────
  // Se a escrow reteve o crédito do split, o disponível fica zerado. Se o dinheiro
  // caiu livre, a escrow não cobre split e o desenho tem que mudar.
  head(8, "Saldo da subconta: a prova do Q1");
  if (subKey) {
    const subBalance = await call("GET", "/finance/balance", undefined, subKey);
    show("GET /finance/balance (chave da SUBCONTA)", subBalance);
    const subStatement = await call(
      "GET",
      "/financialTransactions?limit=10",
      undefined,
      subKey,
    );
    show("GET /financialTransactions (chave da SUBCONTA)", subStatement);
    console.log(
      "\n>> Q1 RESPONDIDA:\n" +
        "   saldo disponível ~0  => a escrow RETÉM crédito de split. Desenho A vale: a Movepark\n" +
        "      segue titular da cobrança e o parceiro fica invisível (ADR-004 intacto).\n" +
        "   saldo disponível 85  => a escrow NÃO cobre split. A cobrança teria que nascer NA\n" +
        "      subconta, e o parceiro vira titular. Impacto direto no ADR-004.",
    );
  } else {
    console.log(
      "A subconta não devolveu apiKey, então não dá para ler o saldo dela aqui.\n" +
        "Gere uma chave para a subconta pela raiz e rode o passo 8 de novo.",
    );
  }

  // ── 9. Plano B: transferência raiz -> subconta ────────────────────────────
  head(9, "Transferência raiz -> subconta [Q3: o modelo de custódia]");
  const transfer = await call("POST", "/transfers", { value: 1.0, walletId: subWallet });
  show("POST /transfers", transfer);
  console.log(
    "\n>> 200/OK com status DONE ou PENDING = o modelo de custódia funciona e é a saída\n" +
      "   caso o Q1 volte negativo.",
  );

  head(10, "Resumo");
  console.log(
    [
      `subconta:      ${subId}`,
      `walletId:      ${subWallet}`,
      `apiKey:        ${subKey ? "guardada nesta execução (não é recuperável depois)" : "não veio"}`,
      `cobrança:      ${paymentId}`,
      `externalRef:   PROBE-${RUN}`,
      "",
      "Tudo acima é sandbox e não tem efeito financeiro real.",
    ].join("\n"),
  );
}

main().catch((e) => {
  console.error("\nProbe quebrou:", e);
  process.exit(1);
});
