// Drift guard (ADR-003, doc-as-you-build): garante que toda rota servida pelo
// gateway (supabase/functions/api/router.ts) tem um path correspondente no
// contrato OpenAPI (public/openapi.yaml). Sem dependências externas.
//
// Uso: node scripts/check-openapi-drift.mjs  (npm: bun run lint:openapi)

import { readFileSync } from "node:fs";

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
