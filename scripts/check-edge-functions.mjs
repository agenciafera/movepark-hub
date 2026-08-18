// Guarda de paridade das Edge Functions: o repositório tem que dizer a verdade sobre o que
// está no ar.
//
// Uso: node scripts/check-edge-functions.mjs   (bun run lint:edge-functions)
//
// Por que existe. Em 14/08/2026 a varredura comparou as funções publicadas no projeto
// mgaigbezdalbyuqiofcf com as pastas de supabase/functions e achou os dois lados quebrados:
//
//   • `simulate-price` rodava em produção desde jun/2026 e NUNCA esteve no git. Era um segundo
//     motor de preço, e escondia 52 divergências contra o motor canônico, incluindo R$ 0,00 em
//     vitrine. Ninguém revisa, testa ou corrige o que só existe no servidor.
//   • `submit-contact-message` estava no git, com teste, e nunca tinha sido publicada. O
//     formulário de /contato batia num 404 e todo visitante que escreveu levou "não foi possível
//     enviar".
//
// E no mesmo dia a checagem cobrou o próprio remendo: publicada a de contato, horas depois o time
// tirou o formulário da página e dropou a tabela, e a função ficou no ar gravando num destino que
// não existia mais. Por isso isto não é mutirão, é checagem contínua: remoção de feature cria
// órfã tão rápido quanto deploy esquecido.
//
// Duas camadas, na mesma ideia do resto do projeto (local leve, CI pesado):
//
//   1. OFFLINE (sempre, sem rede e sem segredo): todo bloco [functions.X] do config.toml tem
//      pasta com index.ts, e toda pasta tem index.ts. Foi este o sintoma visível do
//      `simulate-price` durante dois meses, e ninguém olhou.
//   2. ONLINE (só com SUPABASE_ACCESS_TOKEN): lista as funções ACTIVE pela Management API e
//      compara nos dois sentidos com as pastas do repo. Sem token, avisa e sai 0, e a camada
//      offline continua valendo.
//
// A comparação é pura e mora em `edge-functions-parity.logic.mjs`, testada em
// `src/lib/edgeFunctionsParity.test.ts`. Aqui fica só o I/O.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compararParidade } from "./edge-functions-parity.logic.mjs";

const DIR = "supabase/functions";
const CONFIG = "supabase/config.toml";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "mgaigbezdalbyuqiofcf";

/**
 * Funções que estão no repo e ainda NAO devem estar publicadas, de propósito.
 *
 * Existe para separar esquecimento de decisão. Um guard que acusa pendência conhecida vira ruído,
 * e guard ruidoso deixa de ser lido, que é o mesmo que não existir. Entrar aqui exige o motivo
 * escrito e onde ele mora: quem lê o alarme tem que conseguir julgar sozinho se ainda vale.
 * Só encolhe, e sair daqui é o deploy.
 */
const PENDENTES_DECLARADAS = {
  "google-place-refresh":
    "depende da GOOGLE_PLACES_SERVER_KEY e da URL do deploy hook; ver docs/specs/avaliacoes-google.md",
};

let falhou = false;
const erro = (titulo, linhas, comoResolver) => {
  falhou = true;
  console.error(`❌ ${titulo}`);
  for (const l of linhas) console.error(`   - ${l}`);
  if (comoResolver) console.error(`   → ${comoResolver}`);
};

// ── Leitura do repo ─────────────────────────────────────────────────────────
const pastas = readdirSync(DIR)
  .filter((n) => !n.startsWith("_") && !n.startsWith("."))
  .filter((n) => statSync(join(DIR, n)).isDirectory())
  .sort();

const declaradas = [...readFileSync(CONFIG, "utf8").matchAll(/^\[functions\.([^\]]+)\]/gm)]
  .map((m) => m[1])
  .sort();

const semEntrypoint = pastas.filter((n) => !existsSync(join(DIR, n, "index.ts")));
if (semEntrypoint.length) {
  erro("Pasta de Edge Function sem index.ts:", semEntrypoint, "crie o entrypoint ou apague a pasta.");
}

// ── Camada 1: offline (config.toml ↔ pastas) ────────────────────────────────
const offline = compararParidade({ pastas, declaradas, pendentes: PENDENTES_DECLARADAS });
if (offline.declaradasSemPasta.length) {
  erro(
    "Função declarada no config.toml sem fonte no repositório:",
    offline.declaradasSemPasta,
    "traga o fonte (Management API: GET /v1/projects/<ref>/functions/<slug>/body) ou remova o bloco.",
  );
}
if (!falhou) {
  console.log(
    `✓ ${pastas.length} funções com fonte no repo; ${declaradas.length} blocos do config.toml batem.`,
  );
}

// ── Camada 2: online (produção ↔ pastas) ────────────────────────────────────
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log("⏭️  SUPABASE_ACCESS_TOKEN ausente: paridade com produção não verificada.");
  process.exit(falhou ? 1 : 0);
}

const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!resp.ok) {
  console.error(`❌ Management API respondeu ${resp.status} ao listar as funções.`);
  process.exit(1);
}

const publicadas = (await resp.json())
  .filter((f) => f.status === "ACTIVE")
  .map((f) => f.slug)
  .sort();

const online = compararParidade({
  publicadas,
  pastas,
  declaradas,
  pendentes: PENDENTES_DECLARADAS,
});

if (online.soEmProducao.length) {
  erro(
    "Em produção e sem fonte no repositório:",
    online.soEmProducao,
    "recupere o fonte pela Management API (GET /v1/projects/<ref>/functions/<slug>/body) e comite.",
  );
}
if (online.esquecidas.length) {
  erro(
    "No repositório e nunca publicada (quem chamar leva 404):",
    online.esquecidas,
    "rode: supabase functions deploy <slug>, ou declare a pendência em PENDENTES_DECLARADAS com o motivo.",
  );
}
if (online.pendentesObsoletas.length) {
  erro(
    "Declarada como pendente, mas já está publicada:",
    online.pendentesObsoletas,
    "tire de PENDENTES_DECLARADAS.",
  );
}

// Pendência declarada aparece, mas não reprova: quem lê precisa saber que ela continua de pé.
for (const nome of online.pendentesAtivas) {
  console.log(`•  ${nome}: pendente de propósito (${PENDENTES_DECLARADAS[nome]}).`);
}

if (online.ok) {
  console.log(
    `✓ Paridade com produção: ${publicadas.length} funções ACTIVE, todas com fonte no repo.`,
  );
}

process.exit(falhou ? 1 : 0);
