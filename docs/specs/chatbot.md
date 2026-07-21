# Chatbot / Web chat do Hub — Spec (E3.3)

> Assistente web (uma "bolinha" flutuante) no consumidor do Hub que responde sobre estacionamentos e
> **executa reservas/cancelamentos** em nome do usuário logado. MVP **interno**, só **webchat**
> (sem WhatsApp/n8n). LLM = **Google Gemini** (function-calling). Stateless (sem persistência de
> conversa nesta v1). Reusa as Edges/RPCs de consumidor que já existem — nenhuma regra de negócio nova.

## 1. Arquitetura

```
ChatWidget (React, ConsumerAppShell)  ──POST /functions/v1/chat (apikey + Bearer JWT opcional)──▶
  Edge `chat` (Deno, verify_jwt=false)
     └─ loop de agente (Gemini generateContent, function-calling, teto de 6 rodadas)
          ├─ leitura (anon): search_parking, simulate_price, get_faq, list_companies,
          │    list_locations, get_parking_types, list_destinations, get_destination
          └─ transacionais (repassa o JWT): create_booking, cancel_booking,
               list_my_bookings, get_booking
     ◀── { reply, used_tools }
```

- **LLM:** Gemini API `v1beta` `:generateContent`. Request: `systemInstruction` + `contents` +
  `tools:[{functionDeclarations}]` + `toolConfig.function_calling_config.mode="auto"`. A resposta
  traz `candidates[0].content.parts[].functionCall{name,args}`; cada resultado volta como content
  `role:"user"` com `parts:[{functionResponse:{name,response}}]`. Schemas das tools = subconjunto
  OpenAPI (sem `additionalProperties`).
- **Contexto temporal:** a Edge injeta a data/hora atual (fuso `America/Sao_Paulo`) no system prompt
  a cada turno, e há a tool `current_datetime` — o agente resolve datas relativas ("sexta que vem",
  "amanhã") sozinho, sem pedir a data exata ao usuário.
- **Stateless:** o cliente guarda o histórico e o envia a cada turno (`{ messages:[{role,text}] }`).
  O loop de tool-call roda inteiro no servidor numa request.
- **Auth opcional:** a bolinha aparece para todos. Tools de leitura rodam anônimas; transacionais
  exigem `Authorization: Bearer <JWT>` (a Edge `chat` repassa às Edges `create-booking`/
  `cancel-booking`, que revalidam o dono). Sem login, o agente instrui o usuário a entrar em `/entrar`.

## 2. Tools

| Tool | Tipo | Substrato |
|---|---|---|
| `search_parking` | leitura | Edge `search` |
| `simulate_price` | leitura | RPC `simulate_price` |
| `get_faq` | leitura | Edge `get-faq` |
| `list_companies`/`list_locations`/`get_parking_types` | leitura | selects de catálogo |
| `list_destinations`/`get_destination` | leitura | `destination`(+`destination_point`) |
| `current_datetime` | leitura | data/hora no fuso `America/Sao_Paulo` (resolver datas relativas) |
| `list_my_bookings`/`get_booking`/`get_booking_status` | transacional | MCP `/customer` (RLS do dono) |
| `create_booking`/`cancel_booking` | transacional | MCP `/customer` → Edges `create-booking`/`cancel-booking` |
| `set_booking_customer`/`add_vehicle`/`set_booking_vehicle` | transacional | MCP `/customer` (RLS do dono) |

As tools de leitura vêm do **registro canônico** `supabase/functions/_shared/assistant-tools.ts`
(mesma fonte do MCP consumidor): o `chat` espalha `READ_TOOLS.map(toGeminiDecl)` e roteia por
`callRead`, e o MCP faz `READ_TOOLS.map(toMcpToolDef)` + `callRead`.

**As transacionais executam pelo MCP `/customer`** (`callTxn` em `index.ts`): o bot é um cliente MCP,
repassando o JWT do usuário. Assim o uso real do site valida o MCP de ponta a ponta com sessão de
verdade. Fallback: se o MCP cair no **transporte** (rede/HTTP), as tools que já tinham via direta
(`LEGACY_TXN`: create/cancel/list/get) concluem pela Edge antiga; erro de negócio não faz fallback
(`parseMcpToolResult`). O bot **não** tem `create_checkout_link` (o usuário já está logado no site, o
bot manda ele pro `/checkout/<code>`). O drift guard barra divergência: todo nome transacional do chat
tem que existir em `CUSTOMER_TXN_TOOLS`.

## 3. Configuração (`app_setting`, key/value text)

| Chave | Default | Uso |
|---|---|---|
| `chatbot_enabled` | `true` | liga/desliga a bolinha (a Edge `GET /chat` expõe; o widget some se `false`) |
| `chatbot_model` | `gemini-2.5-flash` | modelo Gemini (trocável por `gemini-2.5-pro`) |
| `chatbot_system_prompt` | (seed) | persona/escopo do atendimento |

Defaults equivalentes no código (`agent.logic.ts`) cobrem o caso de chave ausente. Seeds em
`supabase/migrations/20260716000000_chatbot_settings.sql`. **Segredo:** `GEMINI_API_KEY` (Supabase).
Deploy: `supabase functions deploy chat --no-verify-jwt` (fixado em `config.toml`).

## 4. Front-end

- `src/features/assistant/ChatWidget.tsx` — bolinha + painel, montada em `ConsumerAppShell`.
- `src/features/assistant/api.ts` — `useChatConfig` (GET) + `useSendChat` (POST, repassa o JWT).
- `src/features/assistant/chat.logic.ts` — lógica pura (histórico, `canSend`).

## 5. Testes

Roteiros de conversa para caçar bug à mão (do descobrir ao cancelar, mais os limites conhecidos):
[customer/agent-test-scenarios.md](./customer/agent-test-scenarios.md).

- `deno test` `supabase/functions/chat/agent.logic.test.ts` (tools, parsing, roteamento, gate de
  login, function-calling). Vitest `chat.logic.test.ts` + `ChatWidget.test.tsx` (MSW/mocks).

## 6. Fora de escopo (v2)

Persistência de conversa + observabilidade, streaming (SSE), handoff humano e a aposentadoria do MCP
n8n legado. O canal de **WhatsApp** (reserva por agente, com login por OTP e pagamento via link de
checkout) é tratado à parte em [agent-booking.md](./customer/agent-booking.md), reusando o mesmo
registro de tools desta Edge.
