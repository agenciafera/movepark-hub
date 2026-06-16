# MCP — Spec (E0.7 Fase 2)

> Servidor **MCP (Model Context Protocol)** do Movepark, versionado no repo. Duas superfícies:
> **consumidor** (público/anon, descoberta) e **parceiro** (autenticado por chave `mp_`, tenant-scoped
> sobre a [Public API v1](./public-api.md)). Fonte de verdade das tools: `supabase/functions/mcp/tools.ts`
> + os cards em `public/.well-known/mcp/`. **Ao mudar uma tool, atualize tools.ts + o card + esta spec**
> (ADR-003, ver [public-api.md](./public-api.md) §2 e §12).

---

## 1. Visão geral

O MCP é uma **fachada para agentes de IA** sobre as capacidades que já existem (Edge Functions + RPCs).
Substitui o MCP externo de n8n por um servidor **in-repo**, sob o mesmo doc-as-you-build da API.

- **Consumidor** (`https://mcp.movepark.co`): descoberta pública — buscar estacionamento, simular preço,
  FAQ, listar empresas/unidades. Sem auth, todos os tenants (dado de marketing). Substrato: Edge `search`,
  Edge `get-faq`, RPC `simulate_price` (anon), RLS `catalog_read_*`.
- **Parceiro** (`https://mcp.movepark.co/partner`): tools tenant-scoped sobre a API v1, autenticadas por
  **chave de API** (`Authorization: Bearer mp_…`) e **gateadas por escopo**. Reusa `api_key_verify` + as
  RPCs `api_*`. As tools **visíveis** (`tools/list`) dependem dos escopos da chave.

---

## 2. Arquitetura

```
Cliente MCP (Claude, etc.)
   │  POST JSON-RPC 2.0  (Authorization: Bearer mp_…  no caso parceiro)
   ▼
mcp.movepark.co            ← Cloudflare Worker (src/api-worker.ts): roteia por hostname,
   │                          injeta `apikey` (anon) na borda, esconde a URL do Supabase
   ▼
Edge Function `mcp`        ← supabase/functions/mcp/ (Deno, verify_jwt=false)
   │  / ou /public → consumidor (anon);  /partner → parceiro (chave + escopo)
   ▼
Edge `search`/`get-faq` + RPCs `simulate_price` (anon)  |  RPCs `api_*` + `api_key_verify` (service_role)
```

**Transporte:** **Streamable HTTP** stateless — cada `POST` devolve um **JSON único** (sem SSE/sessão
nesta fase; as tools são síncronas). `initialize` não exige sessão. Streaming/notify fica para uma 2.x.

**Módulos** (`supabase/functions/mcp/`): `protocol.ts` (JSON-RPC/MCP, puro), `tools.ts` (registro +
filtro por escopo, puro), `auth.ts` (chave→hash, espelha o gateway), `index.ts` (`Deno.serve`: handshake
+ `tools/list` + `tools/call` + dispatch). Testes puros em `mcp.test.ts`.

---

## 3. Protocolo (JSON-RPC 2.0)

Métodos suportados: `initialize`, `ping`, `tools/list`, `tools/call`, e `notifications/*` (sem resposta).

- `initialize` → `{ protocolVersion, capabilities:{tools:{listChanged:false}}, serverInfo }` (ecoa a
  versão do cliente quando informada; padrão `2025-06-18`).
- `tools/list` → `{ tools: [{ name, description, inputSchema }] }`. **Parceiro:** filtrado pelos escopos
  da chave.
- `tools/call` → `params {name, arguments}` → `{ content: [{ type:"text", text:<json> }], isError? }`.
  - Tool inexistente / fora de escopo / param obrigatório ausente → **erro JSON-RPC** (`-32602`).
  - Erro de execução (regra de negócio) → `result` com `isError:true` (convenção MCP), não erro de protocolo.

---

## 4. Catálogo de tools

### Consumidor (público, sem auth)

| Tool | Substrato |
|---|---|
| `search_parking(dest, from, to, …)` | Edge `search` |
| `simulate_price(company, location?, parking_type?, days?)` | RPC `simulate_price` |
| `get_faq(location_id?, query?, limit?)` | Edge `get-faq` |
| `list_companies(limit?)` | `company` (RLS `catalog_read_company`) |
| `list_locations(limit?)` | `location` |
| `get_parking_types(location_id)` | `location_parking_type` (+ join) |

### Parceiro (chave `mp_` + escopo)

| Tool | Escopo | RPC |
|---|---|---|
| `list_locations` | `locations:read` | `api_list_locations` |
| `get_location` | `locations:read` | `api_get_location` |
| `list_parking_types` | `parking-types:read` | `api_list_parking_types` |
| `get_availability` | `availability:read` | `api_assert_lpt_company` + `availability_batch` |
| `simulate_price` | `pricing:read` | `api_simulate_price` |
| `list_bookings` | `bookings:read` | `api_list_bookings` |
| `get_booking` | `bookings:read` | `api_get_booking` |
| `create_booking` | `bookings:write` | `api_create_booking` |
| `cancel_booking` | `bookings:cancel` | `api_cancel_booking` |
| `check_in_booking` / `check_out_booking` | `bookings:checkin` | `api_checkin_booking` / `api_checkout_booking` |

> Escopos = catálogo `api_scope` (ver [public-api.md](./public-api.md) §7). Tool parceiro nova ⇒ escopo
> existente (ou novo no catálogo) + entrada em `tools.ts` + `partner-card.json`.

---

## 5. Descoberta (`.well-known`)

- `mcp/server-card.json` — card do consumidor (tools + `inputSchema`, `url: https://mcp.movepark.co`).
- `mcp/partner-card.json` — card do parceiro (tools + escopo + nota de auth, `url: …/partner`).
- `agent-skills/index.json` — referencia os dois cards com `sha256` (recalcular ao mudar um card).
- `api-catalog` + `llms.txt` — linkam os dois MCPs.
- `.mcp.json` (config local do Claude Code) — pode apontar `movepark-hub` → `https://mcp.movepark.co`.

---

## 6. Doc-as-you-build (ADR-003) — checklist por tool

1. [ ] `supabase/functions/mcp/tools.ts` — definição (`name`/`description`/`inputSchema`/`scope`) + handler em `index.ts`.
2. [ ] `public/.well-known/mcp/server-card.json` **ou** `partner-card.json` — mesma tool + schema.
3. [ ] (parceiro) escopo no catálogo `api_scope` se for novo.
4. [ ] esta spec (§4) + teste deno (`mcp.test.ts`).
5. [ ] `agent-skills/index.json` — recalcular `sha256` do card alterado.
6. [ ] CI: `bun run lint:openapi` cobre o drift (tools.ts ↔ cards).

---

## 7. Testes & verificação

- **deno** (`supabase/functions/mcp/mcp.test.ts`): protocolo (initialize/list/call), erros JSON-RPC,
  filtro de escopo no parceiro, validação de `required`.
- **e2e** (após deploy, `verify_jwt=false`): `initialize`/`tools/list`/`tools/call` em `mcp.movepark.co`
  (consumidor) e `…/partner` com `Authorization: Bearer mp_test_…` (parceiro) — `tools/list` filtra por
  escopo; sem chave → erro; tool fora de escopo → erro.

## 8. Open points

- [ ] Streaming/SSE + sessão (`Mcp-Session-Id`) — só se alguma tool virar long-running.
- [ ] Aposentar o MCP n8n após o corte (atualizar `.mcp.json`).
- [ ] OAuth para o MCP parceiro (hoje é chave `mp_` no header) — avaliar em E4.1.
