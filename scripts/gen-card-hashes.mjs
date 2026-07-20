// Recalcula os sha256 dos cards MCP em agent-skills/index.json (ADR-003, mcp.md §5/§6).
// O índice agent-skills referencia cada card por URL + sha256; ao mudar um card, o hash precisa
// ser recalculado senão a descoberta externa falha. Uso: node scripts/gen-card-hashes.mjs
// (npm: bun run gen:cards). Sem dependências externas. O CI confere o frescor via lint:openapi.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const INDEX = "public/.well-known/agent-skills/index.json";

// Qualquer "*-card.json" sob .well-known/mcp/ conta. Antes só server/partner eram
// reconhecidos e um card novo era descartado em silêncio, ficando sem verificação de sha256.
export function cardForUrl(url) {
  const m = /\/([a-z0-9-]+-card\.json)(?:[?#].*)?$/.exec(url);
  return m ? `public/.well-known/mcp/${m[1]}` : null;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const index = JSON.parse(readFileSync(INDEX, "utf8"));
  let changed = false;
  for (const skill of index.skills ?? []) {
    const card = cardForUrl(skill.url ?? "");
    if (!card) continue;
    const hash = sha256File(card);
    if (skill.sha256 !== hash) {
      skill.sha256 = hash;
      changed = true;
      console.log(`↻ ${skill.name}: ${hash}`);
    }
  }
  if (changed) {
    writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");
    console.log("✓ agent-skills/index.json atualizado.");
  } else {
    console.log("✓ sha256 dos cards já estavam corretos.");
  }
}

// Executa só quando chamado direto (não no import do teste/lint).
if (import.meta.url === `file://${process.argv[1]}`) main();
