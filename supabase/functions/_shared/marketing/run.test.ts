// O núcleo do motor recusa antes de matricular: campanha inexistente, pausada ou com fluxo que não
// está pronto. O caminho de envio é coberto por engine.test.ts (regras) e pelo pgTAP (matrícula).
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { runCampaign, RunError } from "./run.ts";

const ator = { kind: "api_key" as const, id: "k-1", label: "Claude marketing (MCP)" };

function bancoFalso(campanha: Record<string, unknown> | null) {
  const chamadas: string[] = [];
  const consulta = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "gte", "update", "insert", "order", "limit"]) {
      q[m] = () => q;
    }
    q.maybeSingle = () => Promise.resolve({ data: campanha, error: null });
    q.single = () => Promise.resolve({ data: { id: "m-1" }, error: null });
    return q;
  };
  return {
    chamadas,
    from: (t: string) => {
      chamadas.push(`from:${t}`);
      return consulta();
    },
    rpc: (n: string) => {
      chamadas.push(`rpc:${n}`);
      return Promise.resolve({ data: { enrolled: 0 }, error: null });
    },
  };
}

Deno.test("campanha inexistente devolve 404", async () => {
  const db = bancoFalso(null);
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 404);
});

Deno.test("campanha pausada devolve 409 e não matricula ninguém", async () => {
  const db = bancoFalso({ id: "c-1", status: "paused", canvas: { nodes: [], edges: [] } });
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 409);
  assertEquals(db.chamadas.includes("rpc:marketing_enroll_campaign"), false);
});

Deno.test("fluxo que não está pronto devolve 400 com o problema e não matricula", async () => {
  const db = bancoFalso({
    id: "c-1",
    status: "draft",
    canvas: {
      nodes: [{ id: "trigger", type: "trigger" }, { id: "w", type: "whatsapp", data: {} }],
      edges: [{ from: "trigger", to: "w" }],
    },
  });
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 400);
  assertEquals(e.message.includes("sem template"), true);
  assertEquals(db.chamadas.includes("rpc:marketing_enroll_campaign"), false);
});
