import { assertEquals } from "jsr:@std/assert";
import { argsDaProposta, DISPATCH_TOOLS, proporDisparo, resumirProposta } from "./proposta.ts";

function ferramentas(respostas: Record<string, unknown>) {
  const chamadas: string[] = [];
  return {
    chamadas,
    tool: (nome: string) => {
      chamadas.push(nome);
      return Promise.resolve(respostas[nome] ?? {});
    },
  };
}

const CAMPANHA_OK = {
  marketing_get_campaign: { campanha: { name: "Volta 90 dias", status: "draft", segment_id: "s-1" }, problemas: [] },
  marketing_get_dispatch_config: { enabled: false },
  marketing_list_segments: {
    segmentos: [{ id: "s-1", name: "Sumidos", total: 31, reachable_email: 30, reachable_whatsapp: 0 }],
  },
};

Deno.test("as duas tools de disparo são as únicas que viram proposta", () => {
  assertEquals([...DISPATCH_TOOLS].sort(), ["marketing_run_campaign", "marketing_set_dispatch_enabled"]);
});

Deno.test("resumirProposta monta o cartão da campanha com público, alcance, chave e problemas", async () => {
  const t = ferramentas(CAMPANHA_OK);
  assertEquals(await resumirProposta("marketing_run_campaign", { campaign_id: "c-1" }, t.tool), {
    campanha: "Volta 90 dias",
    status: "draft",
    segmento: "Sumidos",
    publico: 31,
    alcance_email: 30,
    alcance_whatsapp: 0,
    disparo_ligado: false,
    problemas: [],
  });
});

Deno.test("resumirProposta da chave geral mostra o pedido, o motivo e o estado de agora", async () => {
  const t = ferramentas({ marketing_get_dispatch_config: { enabled: false } });
  assertEquals(
    await resumirProposta("marketing_set_dispatch_enabled", { enabled: true, reason: "dezembro" }, t.tool),
    { ligar: true, motivo: "dezembro", disparo_ligado_agora: false },
  );
});

Deno.test("argsDaProposta guarda só o que cada tool aceita", () => {
  assertEquals(argsDaProposta("marketing_run_campaign", { campaign_id: "c-1", limit: 5, extra: "x" }), {
    ok: true,
    args: { campaign_id: "c-1", limit: 5 },
  });
  assertEquals(argsDaProposta("marketing_run_campaign", {}).ok, false);
  assertEquals(argsDaProposta("marketing_set_dispatch_enabled", { enabled: true }).ok, false);
  assertEquals(argsDaProposta("marketing_set_dispatch_enabled", { enabled: false, reason: " pausa " }), {
    ok: true,
    args: { enabled: false, reason: "pausa" },
  });
  assertEquals(argsDaProposta("marketing_save_segment", {}).ok, false);
});

Deno.test("proporDisparo grava a proposta e não chama a tool de disparo", async () => {
  const t = ferramentas(CAMPANHA_OK);
  const gravadas: unknown[] = [];
  const r = await proporDisparo("marketing_run_campaign", { campaign_id: "c-1" }, {
    tool: t.tool,
    gravar: (linha) => {
      gravadas.push(linha);
      return Promise.resolve("p-1");
    },
  });
  assertEquals(t.chamadas.includes("marketing_run_campaign"), false);
  assertEquals(r.status, "proposta");
  assertEquals(r.proposta_id, "p-1");
  assertEquals((gravadas[0] as { status: string }).status, "proposed");
  assertEquals((gravadas[0] as { args: unknown }).args, { campaign_id: "c-1" });
});

Deno.test("campanha com problema vira proposta bloqueada", async () => {
  const t = ferramentas({
    ...CAMPANHA_OK,
    marketing_get_campaign: { campanha: { name: "X", status: "draft", segment_id: null }, problemas: ["Falta o gatilho."] },
  });
  const gravadas: Array<{ status: string }> = [];
  const r = await proporDisparo("marketing_run_campaign", { campaign_id: "c-1" }, {
    tool: t.tool,
    gravar: (linha) => {
      gravadas.push(linha);
      return Promise.resolve("p-2");
    },
  });
  assertEquals(gravadas[0].status, "blocked");
  assertEquals(String(r.aviso).includes("problemas"), true);
});

Deno.test("argumento faltando volta como erro ao agente e não grava nada", async () => {
  let gravou = false;
  const r = await proporDisparo("marketing_set_dispatch_enabled", { enabled: true }, {
    tool: ferramentas({}).tool,
    gravar: () => {
      gravou = true;
      return Promise.resolve("x");
    },
  });
  assertEquals(gravou, false);
  assertEquals(r, { ok: false, erro: "Falta dizer se liga ou desliga, e o motivo." });
});
