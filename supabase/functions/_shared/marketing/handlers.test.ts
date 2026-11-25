import { assertEquals, assertRejects } from "jsr:@std/assert";
import { callMarketing } from "./handlers.ts";

const ator = { kind: "api_key" as const, id: "k-1", label: "Claude marketing (MCP)" };

type Chamada = { fn: string; args: Record<string, unknown> };

function bancoFalso(respostas: Record<string, unknown> = {}) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      chamadas.push({ fn, args });
      return Promise.resolve({ data: fn in respostas ? respostas[fn] : null, error: null });
    },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return q;
    },
  };
}

const semAviso = { alertarDisparoLigado: () => Promise.resolve() };

Deno.test("get_rfm repassa unidades e janela", async () => {
  const db = bancoFalso({ marketing_rfm_overview: { totals: {} } });
  await callMarketing(db, ator, "marketing_get_rfm", { location_ids: ["l-1"], window_days: 180 }, semAviso);
  assertEquals(db.chamadas[0], {
    fn: "marketing_rfm_overview",
    args: { p_location_ids: ["l-1"], p_window_days: 180 },
  });
});

Deno.test("preview_segment com problema não consulta a base", async () => {
  const db = bancoFalso({ marketing_validate_definition: ['campo desconhecido "x"'] });
  const r = await callMarketing(db, ator, "marketing_preview_segment", {
    definition: { match: "all", rules: [{ field: "x", op: "eq", value: 1 }] },
  }, semAviso) as { problems: string[]; preview: unknown };
  assertEquals(r.problems.length, 1);
  assertEquals(r.preview, null);
  assertEquals(db.chamadas.some((c) => c.fn === "marketing_segment_preview"), false);
});

Deno.test("save_segment manda o ator da chave", async () => {
  const db = bancoFalso({ marketing_save_segment: "s-1" });
  const r = await callMarketing(db, ator, "marketing_save_segment", {
    name: "Voltaram", definition: { match: "all", rules: [] },
  }, semAviso);
  assertEquals(r, { segment_id: "s-1" });
  assertEquals(db.chamadas[0].args.p_actor, { kind: "api_key", id: "k-1", label: "Claude marketing (MCP)" });
});

Deno.test("ligar a chave geral avisa a equipe com quem ligou e o motivo", async () => {
  const avisos: Array<{ actorLabel: string; reason: string }> = [];
  const db = bancoFalso({ marketing_set_dispatch_enabled: { changed: true, enabled: true } });
  await callMarketing(db, ator, "marketing_set_dispatch_enabled", { enabled: true, reason: "campanha de dezembro" }, {
    alertarDisparoLigado: (i) => {
      avisos.push(i);
      return Promise.resolve();
    },
  });
  assertEquals(avisos, [{ actorLabel: "Claude marketing (MCP)", reason: "campanha de dezembro" }]);
});

Deno.test("desligar, ou ligar o que já estava ligado, não avisa", async () => {
  let avisos = 0;
  const deps = { alertarDisparoLigado: () => { avisos += 1; return Promise.resolve(); } };
  await callMarketing(bancoFalso({ marketing_set_dispatch_enabled: { changed: true, enabled: false } }),
    ator, "marketing_set_dispatch_enabled", { enabled: false, reason: "fim" }, deps);
  await callMarketing(bancoFalso({ marketing_set_dispatch_enabled: { changed: false, enabled: true } }),
    ator, "marketing_set_dispatch_enabled", { enabled: true, reason: "de novo" }, deps);
  assertEquals(avisos, 0);
});

Deno.test("run_campaign usa o motor com o ator da chave e o limite", async () => {
  const chamadas: Array<{ id: string; limit?: number; label: string }> = [];
  await callMarketing(bancoFalso(), ator, "marketing_run_campaign", { campaign_id: "c-1", limit: 50 }, {
    ...semAviso,
    run: (_db, id, o) => {
      chamadas.push({ id, limit: o.limit, label: o.actor.label });
      return Promise.resolve({} as never);
    },
  });
  assertEquals(chamadas, [{ id: "c-1", limit: 50, label: "Claude marketing (MCP)" }]);
});

Deno.test("list_contacts sem critério explica o que falta", async () => {
  await assertRejects(
    () => callMarketing(bancoFalso(), ator, "marketing_list_contacts", {}, semAviso),
    Error,
    "Informe segment_id, definition ou rfm_segment.",
  );
});

Deno.test("tool desconhecida é recusada", async () => {
  await assertRejects(() => callMarketing(bancoFalso(), ator, "marketing_nao_existe", {}, semAviso));
});
