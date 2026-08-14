// Guarda de paridade das Edge Functions: o repositório tem que dizer a verdade sobre o que
// está no ar.
//
// Uso: node scripts/check-edge-functions.mjs   (bun run lint:edge-functions)
//
// Por que existe. Em 14/08/2026 a varredura comparou as funções publicadas no projeto
// mgaigbezdalbyuqiofcf com as pastas de supabase/functions e achou os dois lados quebrados:
//
//   • `simulate-price` rodava em produção desde jun/2026 e NUNCA esteve no git. Era um segundo
//     motor de preço, público e sem throttle. Ninguém conseguia revisar, testar ou corrigir o
//     que só existe no servidor.
//   • `submit-contact-message` estava no git, com teste, e nunca foi publicada. O formulário de
//     /contato batia num 404 e todo visitante que escreveu levou "não foi possível enviar".
//
// Duas camadas, na mesma ideia do resto do projeto (local leve, CI pesado):
//
//   1. OFFLINE (sempre, sem rede e sem segredo): todo bloco [functions.X] do config.toml tem
//      pasta com index.ts, e toda pasta tem index.ts. Foi este o sintoma visível do
//      `simulate-price` durante dois meses, e ninguém olhou.
//   2. ONLINE (só com SUPABASE_ACCESS_TOKEN): lista as funções ACTIVE pela Management API e
//      compara nos dois sentidos com as pastas do repo. Sem token, avisa e sai 0, e a camada
//      offline continua valendo.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/functions";
const CONFIG = "supabase/config.toml";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "mgaigbezdalbyuqiofcf";

let falhou = false;
const erro = (titulo, linhas, comoResolver) => {
  falhou = true;
  console.error(`❌ ${titulo}`);
  for (const l of linhas) console.error(`   - ${l}`);
  if (comoResolver) console.error(`   → ${comoResolver}`);
};

// ── Pastas do repo (ignora _shared e afins, que não são funções) ─────────────
const pastas = readdirSync(DIR)
  .filter((n) => !n.startsWith("_") && !n.startsWith("."))
  .filter((n) => statSync(join(DIR, n)).isDirectory())
  .sort();

const semEntrypoint = pastas.filter((n) => !existsSync(join(DIR, n, "index.ts")));
if (semEntrypoint.length) {
  erro("Pasta de Edge Function sem index.ts:", semEntrypoint, "crie o entrypoint ou apague a pasta.");
}

// ── Camada 1: config.toml ↔ pastas ──────────────────────────────────────────
const declaradas = [...readFileSync(CONFIG, "utf8").matchAll(/^\[functions\.([^\]]+)\]/gm)]
  .map((m) => m[1])
  .sort();

const declaradasSemPasta = declaradas.filter((n) => !pastas.includes(n));
if (declaradasSemPasta.length) {
  erro(
    "Função declarada no config.toml sem fonte no repositório:",
    declaradasSemPasta,
    "traga o fonte (supabase functions download <slug>, ou a Management API) ou remova o bloco.",
  );
}

if (!falhou) {
  console.log(`✓ ${pastas.length} funções com fonte no repo; ${declaradas.length} blocos do config.toml batem.`);
}

// ── Camada 2: produção ↔ pastas (precisa do token de Management API) ────────
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

const soEmProducao = publicadas.filter((s) => !pastas.includes(s));
if (soEmProducao.length) {
  erro(
    "Em produção e sem fonte no repositório:",
    soEmProducao,
    "recupere o fonte pela Management API (GET /v1/projects/<ref>/functions/<slug>/body) e comite.",
  );
}

const soNoRepo = pastas.filter((s) => !publicadas.includes(s));
if (soNoRepo.length) {
  erro(
    "No repositório e nunca publicada (quem chamar leva 404):",
    soNoRepo,
    "rode: supabase functions deploy <slug>",
  );
}

if (!soEmProducao.length && !soNoRepo.length) {
  console.log(`✓ Paridade com produção: ${publicadas.length} funções ACTIVE, todas com fonte no repo.`);
}

process.exit(falhou ? 1 : 0);
