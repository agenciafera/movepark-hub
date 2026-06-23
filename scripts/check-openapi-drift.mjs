// Drift guard (ADR-003, doc-as-you-build): garante que toda rota servida pelo
// gateway (supabase/functions/api/router.ts) tem um path correspondente no
// contrato OpenAPI (public/openapi.yaml). Sem dependências externas.
//
// Uso: node scripts/check-openapi-drift.mjs  (npm: bun run lint:openapi)

import { readFileSync } from "node:fs";
import { cardForUrl, sha256File } from "./gen-card-hashes.mjs";

const router = readFileSync("supabase/functions/api/router.ts", "utf8");
const openapi = readFileSync("public/openapi.yaml", "utf8");

// rotas declaradas: def("GET", "/v1/locations/:id", ...)
const routePaths = [...router.matchAll(/def\(\s*"[A-Z]+",\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .map((p) => p.replace(/:([A-Za-z_]+)/g, "{$1}")); // :id → {id}

// paths do OpenAPI: chaves "  /v1/...:" no topo do bloco paths
const openapiPaths = new Set(
  [...openapi.matchAll(/^\s{2}(\/v1\/[^\s:]+):/gm)].map((m) => m[1]),
);

const missing = [...new Set(routePaths)].filter((p) => !openapiPaths.has(p));

if (missing.length > 0) {
  console.error("❌ Rotas do gateway sem path no OpenAPI (public/openapi.yaml):");
  for (const p of missing) console.error("   - " + p);
  console.error("\nADR-003: documente o endpoint no OpenAPI na mesma entrega.");
  process.exit(1);
}

console.log(`✓ OpenAPI em sincronia com o gateway (${new Set(routePaths).size} rotas).`);

// ── MCP: tools.ts (PUBLIC_TOOLS/PARTNER_TOOLS) ↔ server-card.json/partner-card.json ──
const toolsSrc = readFileSync("supabase/functions/mcp/tools.ts", "utf8");
const splitIdx = toolsSrc.indexOf("PARTNER_TOOLS");
const publicSrc = toolsSrc.slice(0, splitIdx);
const partnerSrc = toolsSrc.slice(splitIdx);
const toolNames = (s) => [...s.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const cardNames = (path) =>
  new Set((JSON.parse(readFileSync(path, "utf8")).tools ?? []).map((t) => t.name));

const checks = [
  { label: "consumidor", tools: toolNames(publicSrc), card: cardNames("public/.well-known/mcp/server-card.json") },
  { label: "parceiro", tools: toolNames(partnerSrc), card: cardNames("public/.well-known/mcp/partner-card.json") },
];

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
const staleHashes = (skillsIndex.skills ?? [])
  .map((s) => ({ name: s.name, card: cardForUrl(s.url ?? ""), have: s.sha256 }))
  .filter((s) => s.card)
  .filter((s) => s.have !== sha256File(s.card));

if (staleHashes.length) {
  console.error("❌ sha256 desatualizado em agent-skills/index.json:");
  for (const s of staleHashes) console.error(`   - ${s.name} (rode: bun run gen:cards)`);
  process.exit(1);
}
console.log("✓ sha256 dos cards em sincronia (agent-skills/index.json).");
