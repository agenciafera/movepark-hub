import { createHash } from "node:crypto";
import { load as yamlLoad } from "js-yaml";
import { describe, expect, it } from "vitest";
import { API_BASE, HUB_BASE } from "../support/mcp";

// Contrato da Public API e da superfície de descoberta (ADR-003) contra o ambiente vivo.
// Ver docs/specs/public-api.md e docs/specs/mcp.md.
//
// O drift guard (`bun run lint:openapi`) confere o REPO. Esta suíte confere o que está PUBLICADO:
// deploy que não subiu, card dessincronizado do índice e proxy fora do ar não aparecem no lint.

describe("Public API · autenticação", () => {
  it("sem chave devolve 401 com erro estruturado e request_id", async () => {
    const res = await fetch(`${API_BASE}/v1/locations`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; request_id?: string };
    };
    expect(body.error?.code).toBe("unauthorized");
    expect(body.error?.message).toBeTruthy();
    // request_id é o que permite rastrear a chamada no api_request_log
    expect(body.error?.request_id).toBeTruthy();
  });

  it("chave inexistente não autentica", async () => {
    const res = await fetch(`${API_BASE}/v1/locations`, {
      headers: { Authorization: "Bearer mp_live_chave_que_nao_existe" },
    });
    expect(res.status).toBe(401);
  });

  it("não vaza dado de nenhuma empresa antes de autenticar", async () => {
    const res = await fetch(`${API_BASE}/v1/bookings`);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/booking_code|MP-|total_amount/);
  });
});

describe("Descoberta publicada · OpenAPI", () => {
  it("openapi.yaml é servido e é YAML válido com rotas v1", async () => {
    const res = await fetch(`${HUB_BASE}/openapi.yaml`);
    expect(res.status).toBe(200);
    const spec = yamlLoad(await res.text()) as { openapi?: string; paths?: Record<string, unknown> };
    expect(spec.openapi).toBeTruthy();
    const paths = Object.keys(spec.paths ?? {});
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith("/v1/"))).toBe(true);
  });
});

describe("Descoberta publicada · cards MCP e índice agent-skills", () => {
  it("o card do consumidor é servido e anuncia a busca de conhecimento", async () => {
    const res = await fetch(`${HUB_BASE}/.well-known/mcp/server-card.json`);
    expect(res.status).toBe(200);
    const card = (await res.json()) as { tools?: Array<{ name: string }> };
    const names = (card.tools ?? []).map((t) => t.name);
    expect(names).toContain("search_knowledge");
    expect(names).toContain("search_parking");
  });

  // Autoconsistência do que está no ar: o índice referencia cada card por sha256. Num deploy
  // parcial (card novo, índice velho, ou o contrário) a descoberta externa quebra em silêncio,
  // porque o cliente baixa o card e o hash não confere. Aqui isso vira falha visível.
  it("o sha256 declarado no índice bate com o card realmente publicado", async () => {
    const idxRes = await fetch(`${HUB_BASE}/.well-known/agent-skills/index.json`);
    expect(idxRes.status).toBe(200);
    const index = (await idxRes.json()) as {
      skills?: Array<{ name?: string; url?: string; sha256?: string }>;
    };
    const withCard = (index.skills ?? []).filter((s) => /-card\.json(?:[?#].*)?$/.test(s.url ?? ""));
    expect(withCard.length, "o índice deveria referenciar ao menos um card").toBeGreaterThan(0);

    for (const skill of withCard) {
      const cardRes = await fetch(skill.url!);
      expect(cardRes.status, `card ${skill.url} não está no ar`).toBe(200);
      const bytes = new Uint8Array(await cardRes.arrayBuffer());
      const live = createHash("sha256").update(bytes).digest("hex");
      expect(
        live,
        `sha256 do card publicado ${skill.name} não bate com o índice (deploy parcial?)`,
      ).toBe(skill.sha256);
    }
  });
});
