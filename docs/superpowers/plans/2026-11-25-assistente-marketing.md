# Assistente da Automação: plano de implementação

> **Para quem executa:** execução **na própria conversa** (executing-plans), sem agente em segundo
> plano. Passos com checkbox (`- [ ]`).

**Objetivo:** uma bolinha de IA nas páginas de `/manager/marketing` que monta segmento, campanha,
cupom e lead pelo registro de tools de marketing, e deixa executar campanha e ligar o disparo para
o clique do admin.

**Arquitetura:** Edge `marketing-assistant` com laço de function-calling no Gemini sobre
`MARKETING_TOOLS`, executando por `callMarketing` com o admin como ator. As duas tools de disparo
são interceptadas e viram proposta; o clique em Confirmar chama a Edge de novo. Conversa só no
`sessionStorage`.

**Stack:** Deno (Edge), Gemini `generateContent` v1beta, React + TanStack Query, Vitest + MSW.

**Spec:** [`docs/specs/assistente-marketing.md`](../../specs/assistente-marketing.md).

## Regras globais

- Trabalho direto na `main`; `git status` limpo antes de cada commit.
- Vitest com Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`).
- Edge: `deno test --no-check --allow-env --allow-net --allow-read <arquivo>`; depois, `git checkout deno.lock` se ele mudar sozinho.
- Sem travessão em texto, comentário, doc ou commit. Texto de interface passa pela skill `revisar-texto`.
- **Nenhum teste chama o Gemini de verdade nem executa campanha.** A verificação no vivo não confirma proposta.
- Commits `tipo(escopo): descrição` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/marketing/gemini.ts` | Adaptador das tools de marketing para o Gemini e conversão de argumento JSON |
| `supabase/functions/_shared/marketing/assistant-prompt.ts` | Instruções do modelo (`montarInstrucoes`) |
| `supabase/functions/_shared/marketing/alerta.ts` | `alertarDisparoLigado`, tirado de `mcp/index.ts` para o MCP e o assistente usarem |
| `supabase/functions/marketing-assistant/logic.ts` | Laço do turno (`rodarTurno`), resumo do cartão (`resumirProposta`) e validação da confirmação |
| `supabase/functions/marketing-assistant/index.ts` | Casca: trava de `hub_admin`, chamada ao Gemini, confirmação |
| `src/features/marketing-assistant/marketingAssistant.logic.ts` | Rótulos, página aberta, `sessionStorage` |
| `src/features/marketing-assistant/api.ts` | Hooks de conversa e confirmação |
| `src/features/marketing-assistant/MarketingAssistantWidget.tsx` | A bolinha |
| `src/routes/manager/layout.tsx` | Monta a bolinha (ela mesma só aparece em `/manager/marketing`) |

---

### Tarefa 1: adaptador do Gemini

**Arquivos:** criar `supabase/functions/_shared/marketing/gemini.ts` e `gemini.test.ts`.

**Interfaces:**
- Consome: `MARKETING_TOOLS`, `MarketingToolDef` (tools.ts).
- Produz: `type GeminiDecl = { name: string; description: string; parameters: Record<string, unknown> }`; `toGeminiSchema(schema): Record<string, unknown>`; `marketingGeminiDecls(tools?): GeminiDecl[]`; `camposJson(tool): string[]`; `prepararArgs(nome: string, args: Record<string, unknown>): { ok: true; args: Record<string, unknown> } | { ok: false; erro: string }`.

- [ ] **Passo 1: teste (falha)**

```ts
import { assertEquals } from "jsr:@std/assert";
import { camposJson, marketingGeminiDecls, prepararArgs, toGeminiSchema } from "./gemini.ts";
import { MARKETING_TOOLS } from "./tools.ts";

const semChave = (o: unknown, chave: string): boolean =>
  JSON.stringify(o).includes(`"${chave}"`) === false;

Deno.test("toGeminiSchema tira additionalProperties e format em todo nível", () => {
  const s = toGeminiSchema({
    type: "object", additionalProperties: false, required: ["a"],
    properties: { a: { type: "string", format: "date-time" }, b: { type: "array", items: { type: "string" } } },
  });
  assertEquals(semChave(s, "additionalProperties"), true);
  assertEquals(semChave(s, "format"), true);
  assertEquals((s.properties as Record<string, unknown>).b, { type: "array", items: { type: "string" } });
});

Deno.test("objeto livre vira texto JSON", () => {
  const s = toGeminiSchema({
    type: "object", properties: { definition: { type: "object", description: "Árvore do segmento." } },
  });
  const def = (s.properties as Record<string, { type: string; description: string }>).definition;
  assertEquals(def.type, "string");
  assertEquals(def.description.includes("texto JSON"), true);
});

Deno.test("todas as 26 tools viram declaração sem chave que o Gemini recusa", () => {
  const decls = marketingGeminiDecls();
  assertEquals(decls.length, MARKETING_TOOLS.length);
  assertEquals(semChave(decls, "additionalProperties"), true);
  assertEquals(semChave(decls, "format"), true);
});

Deno.test("camposJson acha definition e canvas", () => {
  const save = MARKETING_TOOLS.find((t) => t.name === "marketing_save_campaign")!;
  assertEquals(camposJson(save), ["canvas"]);
  const prev = MARKETING_TOOLS.find((t) => t.name === "marketing_preview_segment")!;
  assertEquals(camposJson(prev), ["definition"]);
});

Deno.test("prepararArgs converte o texto JSON de volta", () => {
  const r = prepararArgs("marketing_preview_segment", { definition: '{"match":"all","rules":[]}', limit: 5 });
  assertEquals(r, { ok: true, args: { definition: { match: "all", rules: [] }, limit: 5 } });
});

Deno.test("prepararArgs aceita objeto que já veio como objeto", () => {
  const r = prepararArgs("marketing_preview_segment", { definition: { match: "all", rules: [] } });
  assertEquals(r.ok, true);
});

Deno.test("prepararArgs devolve erro legível para JSON quebrado", () => {
  const r = prepararArgs("marketing_save_campaign", { name: "x", canvas: "{nodes:" });
  assertEquals(r.ok, false);
  assertEquals(!r.ok && r.erro.startsWith('"canvas" precisa ser JSON válido'), true);
});

Deno.test("prepararArgs recusa tool desconhecida", () => {
  assertEquals(prepararArgs("marketing_nao_existe", {}).ok, false);
});
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/gemini.test.ts` → FAIL (módulo inexistente).

- [ ] **Passo 2: implementar**

```ts
// Adaptador das tools de marketing para o Gemini (function-calling, v1beta).
//
// O Gemini aceita um subconjunto do JSON Schema: recusa additionalProperties, ignora ou recusa format,
// e não sabe lidar com objeto livre (sem properties), que é o caso da definição de segmento e do
// fluxo de campanha. Esses viram texto JSON no lado do Gemini e são convertidos de volta antes do
// handler. Spec: docs/specs/assistente-marketing.md § 3.

import { MARKETING_TOOLS, type MarketingToolDef } from "./tools.ts";

export type GeminiDecl = { name: string; description: string; parameters: Record<string, unknown> };

function objetoLivre(s: Record<string, unknown>): boolean {
  return s.type === "object" && !s.properties;
}

export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties" || k === "format") continue;
    if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [nome, sub] of Object.entries(v as Record<string, Record<string, unknown>>)) {
        props[nome] = objetoLivre(sub)
          ? {
            type: "string",
            description: `${String(sub.description ?? "")} Envie como texto JSON.`.trim(),
          }
          : toGeminiSchema(sub);
      }
      out.properties = props;
      continue;
    }
    if (k === "items" && v && typeof v === "object") {
      out.items = toGeminiSchema(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function marketingGeminiDecls(tools: MarketingToolDef[] = MARKETING_TOOLS): GeminiDecl[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.inputSchema),
  }));
}

export function camposJson(tool: MarketingToolDef): string[] {
  const props = (tool.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(props).filter(([, s]) => objetoLivre(s)).map(([nome]) => nome);
}

export function prepararArgs(
  nome: string,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; erro: string } {
  const tool = MARKETING_TOOLS.find((t) => t.name === nome);
  if (!tool) return { ok: false, erro: `Tool desconhecida: ${nome}` };
  const saida: Record<string, unknown> = { ...(args ?? {}) };
  for (const campo of camposJson(tool)) {
    const v = saida[campo];
    if (typeof v !== "string") continue;
    try {
      saida[campo] = JSON.parse(v);
    } catch (e) {
      return {
        ok: false,
        erro: `"${campo}" precisa ser JSON válido: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  return { ok: true, args: saida };
}
```

- [ ] **Passo 3:** rodar o teste (PASS, 8) e commit `feat(marketing): adaptador das tools de marketing para o Gemini`.

---

### Tarefa 2: instruções e laço do turno

**Arquivos:** criar `supabase/functions/_shared/marketing/assistant-prompt.ts`, `supabase/functions/marketing-assistant/logic.ts` e `logic.test.ts`.

**Interfaces:**
- Consome: `prepararArgs` (gemini.ts); `MARKETING_TOOLS`; `extractFunctionCalls`, `extractText`, `functionResponseContent`, `GeminiContent` de `../chat/agent.logic.ts`.
- Produz (logic.ts): `DISPATCH_TOOLS`, `MAX_ROUNDS = 8`, `MAX_MENSAGENS = 20`, tipos `Mensagem = { papel: "usuario" | "assistente"; texto: string }`, `Pagina = { caminho?: string; campaign_id?: string; segment_id?: string }`, `Proposta = { tool: string; args: Record<string, unknown>; resumo: Record<string, unknown> }`, `Turno = { resposta: string; ferramentas: Array<{ nome: string; ok: boolean }>; propostas: Proposta[]; gravou: boolean }`; `lerConversa(body): { ok: true; mensagens; pagina } | { ok: false; erro }`; `toContents(mensagens): GeminiContent[]`; `rodarTurno(mensagens, deps): Promise<Turno>` com `deps = { gemini(contents), tool(nome, args), resumir(nome, args) }`; `resumirProposta(nome, args, tool)`; `lerConfirmacao(body): { ok: true; tool; args } | { ok: false; erro }`. (assistant-prompt.ts): `montarInstrucoes(pagina: Pagina, agora: Date): string`.

- [ ] **Passo 1: teste do laço (falha)** com um Gemini falso que devolve, em sequência, os `GeminiContent` de um roteiro:
  - leitura (`marketing_get_rfm`) executa pelo `tool` e o texto final volta como `resposta`;
  - gravação (`marketing_save_segment`) executa e marca `gravou: true`;
  - `marketing_run_campaign` e `marketing_set_dispatch_enabled` **não** chamam `tool`, chamam `resumir` e viram `propostas`;
  - erro do `tool` volta ao modelo como `{ erro }` e marca `ok: false`;
  - JSON quebrado em `definition` não chama `tool` e volta `{ erro }` ao modelo;
  - modelo que nunca para recebe a resposta de limite depois de 8 rodadas;
  - `lerConversa` corta em 20 mensagens e recusa sem mensagem do usuário; `lerConfirmacao` aceita só as duas tools de disparo;
  - `montarInstrucoes` cita a campanha aberta e proíbe travessão;
  - `resumirProposta` monta o cartão da campanha com público, alcance, estado da chave e problemas.

- [ ] **Passo 2: implementar** `assistant-prompt.ts` (texto revisado pela skill `revisar-texto`) e `logic.ts` com as interfaces acima.

- [ ] **Passo 3:** rodar (PASS) e commit `feat(marketing): instruções e laço do assistente da Automação`.

---

### Tarefa 3: Edge `marketing-assistant` e alerta compartilhado

**Arquivos:** criar `supabase/functions/_shared/marketing/alerta.ts` e `supabase/functions/marketing-assistant/index.ts`; modificar `supabase/functions/mcp/index.ts` (importar `alertarDisparoLigado` de `_shared/marketing/alerta.ts` e apagar a cópia local).

**Interfaces:**
- Consome: `rodarTurno`, `lerConversa`, `lerConfirmacao`, `resumirProposta`, `DISPATCH_TOOLS` (logic.ts); `montarInstrucoes`; `marketingGeminiDecls`; `prepararArgs`; `callMarketing`; `alertarDisparoLigado`.
- Produz: `POST /functions/v1/marketing-assistant` conforme a spec § 3 (conversa e confirmação). Modelo: `app_setting.marketing_assistant_model`, padrão `gemini-2.5-pro`. Ator: `{ kind: "hub_admin", id: user.id, label: user.email }`.

- [ ] **Passo 1:** mover `alertarDisparoLigado` para `alerta.ts` e trocar o import no `mcp/index.ts`; rodar `deno test ... supabase/functions/mcp/` (PASS, 205).
- [ ] **Passo 2:** escrever o `index.ts` com a trava de `hub_admin` igual à da `marketing-run`, a chamada ao Gemini igual à da Edge `chat` (com `marketingGeminiDecls`) e os dois caminhos.
- [ ] **Passo 3:** `deno check` (só os erros antigos de diretiva) e `bunx vitest run src/features/edge-coverage.contract.test.ts` (PASS: a pasta tem `logic.test.ts`).
- [ ] **Passo 4:** commit `feat(marketing): Edge do assistente da Automação`.

---

### Tarefa 4: a bolinha

**Arquivos:** criar `src/features/marketing-assistant/{marketingAssistant.logic.ts, marketingAssistant.logic.test.ts, api.ts, MarketingAssistantWidget.tsx, MarketingAssistantWidget.test.tsx}`; modificar `src/routes/manager/layout.tsx`.

**Interfaces:**
- Consome: a Edge (Tarefa 3); `marketingKeys` (`@/features/marketing/api`); `Bubble` (`@/features/assistant/ChatBubble`).
- Produz: `MarketingAssistantWidget` (devolve `null` fora de `/manager/marketing`); `paginaDoCaminho(pathname)`; `rotuloDaFerramenta(nome)`; `carregarConversa()`/`salvarConversa(falas)` com a chave `mp_marketing_assistant_v1`; `useConversar()`, `useConfirmarProposta()`.

- [ ] **Passo 1: testes (falham)**: lógica (página, rótulos, sessionStorage, últimas 20) e componente com MSW (`edge("marketing-assistant", ...)`): envia mensagem com a página; mostra o cartão de execução com público e estado da chave; Confirmar manda `{ acao: "confirmar", tool, args }`; Descartar não chama a Edge; fora de `/manager/marketing` não renderiza.
- [ ] **Passo 2: implementar**, com o texto da interface revisado pela skill `revisar-texto`; montar no `ManagerLayout`.
- [ ] **Passo 3:** `bunx vitest run src/features/marketing-assistant/ src/routes/manager/` (PASS), `bun run typecheck`, `bun run lint`.
- [ ] **Passo 4:** commit `feat(marketing): bolinha do assistente na tela de Automação`.

---

### Tarefa 5: verificação, deploy e specs

- [ ] `bun run test` inteiro (Node 22), `bun run lint:openapi`, `deno test ... supabase/functions/` (marketing, mcp, marketing-assistant).
- [ ] Skill `security-review` sobre o diff.
- [ ] `supabase functions deploy marketing-assistant` e `supabase functions deploy mcp --no-verify-jwt` (por causa do alerta movido).
- [ ] Conferir que a Edge sem JWT devolve 401 e com JWT de cliente devolve 403 (sem chamar o Gemini).
- [ ] Specs: status em `assistente-marketing.md` e linha no `README.md`.
- [ ] Commit, `git pull --rebase`, push e conferir o build do Workers no commit.
