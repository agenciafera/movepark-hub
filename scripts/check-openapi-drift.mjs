// Drift guard (ADR-003, doc-as-you-build): garante que toda rota servida pelo
// gateway (supabase/functions/api/router.ts) tem um path correspondente no
// contrato OpenAPI (public/openapi.yaml). Sem dependências externas.
//
// Uso: node scripts/check-openapi-drift.mjs  (npm: bun run lint:openapi)

import { existsSync, readFileSync } from "node:fs";
import { load as yamlLoad } from "js-yaml";
import { cardForUrl, sha256File } from "./gen-card-hashes.mjs";

const router = readFileSync("supabase/functions/api/router.ts", "utf8");
const openapi = readFileSync("public/openapi.yaml", "utf8");

// O contrato precisa PARSEAR, não só casar por string: chave duplicada e escalar com ": "
// sem aspas passavam batido no regex e quebravam o /docs (que renderiza a partir daqui).
let openapiDoc;
try {
  openapiDoc = yamlLoad(openapi);
} catch (err) {
  console.error("❌ public/openapi.yaml não é YAML válido:");
  console.error("   " + (err.reason ?? err.message));
  if (err.mark) console.error(`   linha ${err.mark.line + 1}, coluna ${err.mark.column + 1}`);
  console.error("\nADR-003: o contrato publicado em api.movepark.co precisa parsear.");
  process.exit(1);
}

const HTTP_VERBS = ["get", "post", "put", "patch", "delete"];

// rotas declaradas: def("GET", "/v1/locations/:id", ...) → "GET /v1/locations/{id}"
const routeOps = new Set(
  [...router.matchAll(/def\(\s*"([A-Z]+)",\s*"([^"]+)"/g)].map(
    (m) => `${m[1].toLowerCase()} ${m[2].replace(/:([A-Za-z_]+)/g, "{$1}")}`,
  ),
);

// operações do OpenAPI, já estruturadas
const openapiOps = new Set(
  Object.entries(openapiDoc?.paths ?? {}).flatMap(([p, item]) =>
    Object.keys(item ?? {})
      .filter((k) => HTTP_VERBS.includes(k))
      .map((verb) => `${verb} ${p}`),
  ),
);

const undocumented = [...routeOps].filter((op) => !openapiOps.has(op));
const unserved = [...openapiOps].filter((op) => !routeOps.has(op));

if (undocumented.length || unserved.length) {
  if (undocumented.length) {
    console.error("❌ Rotas do gateway sem operação no OpenAPI (public/openapi.yaml):");
    for (const op of undocumented) console.error("   - " + op);
  }
  if (unserved.length) {
    console.error("❌ Operações no OpenAPI que o gateway não serve (doc fantasma):");
    for (const op of unserved) console.error("   - " + op);
  }
  console.error("\nADR-003: documente o endpoint no OpenAPI na mesma entrega.");
  process.exit(1);
}

console.log(`✓ OpenAPI em sincronia com o gateway (${routeOps.size} operações).`);

// ── MCP: tools.ts (PUBLIC_TOOLS/PARTNER_TOOLS) ↔ server-card.json/partner-card.json ──
const toolsSrc = readFileSync("supabase/functions/mcp/tools.ts", "utf8");
const toolNames = (s) => [...s.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const cardNames = (path) =>
  new Set((JSON.parse(readFileSync(path, "utf8")).tools ?? []).map((t) => t.name));

// Cada registro `export const X_TOOLS` tem um card. Fatiar por bloco (e não por
// indexOf de um literal) para que um registro novo não seja atribuído em silêncio
// ao grupo vizinho. Registro sem card mapeado é erro: card novo tem que ser declarado.
const CARD_BY_REGISTRY = {
  PUBLIC_TOOLS: { label: "consumidor", card: "public/.well-known/mcp/server-card.json" },
  PARTNER_TOOLS: { label: "parceiro", card: "public/.well-known/mcp/partner-card.json" },
};

const marks = [...toolsSrc.matchAll(/export const ([A-Z][A-Z0-9_]*_TOOLS)\s*:/g)].map((m) => ({
  name: m[1],
  start: m.index,
}));

const unmapped = marks.filter((mk) => !CARD_BY_REGISTRY[mk.name]);
if (unmapped.length) {
  console.error("❌ Registro de tools sem card mapeado em check-openapi-drift.mjs:");
  for (const mk of unmapped) console.error("   - " + mk.name);
  console.error("\nADR-003: declare o card do registro novo (e em gen-card-hashes.mjs).");
  process.exit(1);
}

const checks = marks.map((mk, i) => {
  const { label, card } = CARD_BY_REGISTRY[mk.name];
  const src = toolsSrc.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : undefined);
  return { label, tools: toolNames(src), card: cardNames(card) };
});

let mcpDrift = false;
for (const { label, tools, card } of checks) {
  const absent = [...new Set(tools)].filter((t) => !card.has(t));
  if (absent.length) {
    mcpDrift = true;
    console.error(`❌ Tools do MCP (${label}) sem entrada no card:`);
    for (const t of absent) console.error("   - " + t);
  }
}
if (mcpDrift) {
  console.error("\nADR-003: documente a tool no server-card/partner-card na mesma entrega.");
  process.exit(1);
}

const total = checks.reduce((n, c) => n + new Set(c.tools).size, 0);
console.log(`✓ MCP em sincronia (tools.ts ↔ cards): ${total} tools.`);

// ── Escopo órfão (catálogo api_scope ↔ implementação) ────────────────────────
// Espelha `api_scope where assignable_to_api_key = true`. Doc-as-you-build (ADR-003): escopo
// atribuível novo ⇒ entra aqui + ganha rota no gateway OU tool MCP. Os escopos só-internos
// (team:*, finance:*, payouts:*, api-keys:write, webhooks:write) NÃO entram aqui nem podem
// aparecer em router/tools.
const ASSIGNABLE_SCOPES = new Set([
  "addons:read", "addons:write", "availability:read", "bookings:cancel", "bookings:checkin",
  "bookings:read", "bookings:write", "coupons:read", "coupons:write", "discounts:read",
  "discounts:write", "faq:read", "locations:read", "locations:write", "occupancy:read",
  "parking-types:read", "parking-types:write", "pricing:read", "pricing:write", "reviews:read",
  "reviews:write", "wps:write",
]);

const routerScopes = [...router.matchAll(/def\(\s*"[A-Z]+",\s*"[^"]+",\s*\[[^\]]*\],\s*"([^"]+)"/g)].map((m) => m[1]);
const toolScopes = [...toolsSrc.matchAll(/scope:\s*"([^"]+)"/g)].map((m) => m[1]);
const usedScopes = new Set([...routerScopes, ...toolScopes]);

const orphanScopes = [...ASSIGNABLE_SCOPES].filter((s) => !usedScopes.has(s));
const unknownScopes = [...usedScopes].filter((s) => !ASSIGNABLE_SCOPES.has(s));

if (orphanScopes.length || unknownScopes.length) {
  if (orphanScopes.length) {
    console.error("❌ Escopos atribuíveis sem nenhuma rota/tool (escopo órfão):");
    for (const s of orphanScopes) console.error("   - " + s);
  }
  if (unknownScopes.length) {
    console.error("❌ Escopos usados em router/tools fora do catálogo atribuível (typo ou escopo interno vazando):");
    for (const s of unknownScopes) console.error("   - " + s);
  }
  console.error("\nADR-003: todo escopo assignable tem ≥1 endpoint/tool; escopo interno nunca é roteado.");
  process.exit(1);
}
console.log(`✓ Escopos em sincronia (catálogo ↔ rota/tool): ${ASSIGNABLE_SCOPES.size} atribuíveis.`);

// ── Frescor do sha256 dos cards (agent-skills/index.json) ────────────────────
const skillsIndex = JSON.parse(readFileSync("public/.well-known/agent-skills/index.json", "utf8"));
const referenced = (skillsIndex.skills ?? [])
  .map((s) => ({ name: s.name, card: cardForUrl(s.url ?? ""), have: s.sha256 }))
  .filter((s) => s.card);

const missingCards = referenced.filter((s) => !existsSync(s.card));
if (missingCards.length) {
  console.error("❌ agent-skills/index.json referencia card que não existe:");
  for (const s of missingCards) console.error(`   - ${s.name} → ${s.card}`);
  process.exit(1);
}

const staleHashes = referenced.filter((s) => s.have !== sha256File(s.card));

if (staleHashes.length) {
  console.error("❌ sha256 desatualizado em agent-skills/index.json:");
  for (const s of staleHashes) console.error(`   - ${s.name} (rode: bun run gen:cards)`);
  process.exit(1);
}
console.log("✓ sha256 dos cards em sincronia (agent-skills/index.json).");
