import { assertEquals } from "jsr:@std/assert";
import { callMarketingAssist, type MarketingAssistCtx } from "./marketing-assist.ts";

const CTX: MarketingAssistCtx = { profile_id: "u-adm", conversa_id: "conv-1", label: "adm@fera.ag (assistente)" };

function banco() {
  const inseridas: Array<Record<string, unknown>> = [];
  return {
    inseridas,
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        inseridas.push({ tabela, ...linha });
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "p-1" }, error: null }) }) };
      },
    }),
  };
}

function chamador(respostas: Record<string, unknown> = {}) {
  const chamadas: Array<{ nome: string; ator: unknown }> = [];
  return {
    chamadas,
    chamar: (_db: unknown, ator: unknown, nome: string) => {
      chamadas.push({ nome, ator });
      return Promise.resolve(respostas[nome] ?? { ok: true });
    },
  };
}

const deps = { alertarDisparoLigado: () => Promise.resolve() };

Deno.test("leitura e gravação rodam com o admin do token como ator", async () => {
  const c = chamador({ marketing_get_rfm: { totals: { customers: 176 } } });
  const r = await callMarketingAssist(banco(), CTX, "marketing_get_rfm", {}, { ...deps, chamar: c.chamar as never });
  assertEquals(r, { totals: { customers: 176 } });
  assertEquals(c.chamadas[0].ator, { kind: "hub_admin", id: "u-adm", label: "adm@fera.ag (assistente)" });
});

Deno.test("executar campanha vira proposta presa ao admin e à conversa, sem executar", async () => {
  const db = banco();
  const c = chamador({
    marketing_get_campaign: { campanha: { name: "Volta", status: "draft", segment_id: null }, problemas: [] },
    marketing_get_dispatch_config: { enabled: false },
  });
  const r = (await callMarketingAssist(db, CTX, "marketing_run_campaign", { campaign_id: "c-1" }, {
    ...deps,
    chamar: c.chamar as never,
  })) as Record<string, unknown>;
  assertEquals(c.chamadas.some((x) => x.nome === "marketing_run_campaign"), false);
  assertEquals(r.status, "proposta");
  assertEquals(r.proposta_id, "p-1");
  assertEquals(db.inseridas[0].tabela, "marketing_assistant_action");
  assertEquals(db.inseridas[0].profile_id, "u-adm");
  assertEquals(db.inseridas[0].conversa_id, "conv-1");
  assertEquals(db.inseridas[0].args, { campaign_id: "c-1" });
});

Deno.test("ligar a chave geral também vira proposta", async () => {
  const db = banco();
  const c = chamador({ marketing_get_dispatch_config: { enabled: false } });
  const r = (await callMarketingAssist(db, CTX, "marketing_set_dispatch_enabled", { enabled: true, reason: "dezembro" }, {
    ...deps,
    chamar: c.chamar as never,
  })) as Record<string, unknown>;
  assertEquals(r.status, "proposta");
  assertEquals(c.chamadas.some((x) => x.nome === "marketing_set_dispatch_enabled"), false);
});
