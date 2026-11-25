# MCP de marketing: a IA monta segmento, campanha e cupom

> **Status:** implementado em 25/11/2026 (migrations `20261207110000_marketing_mcp_base.sql` e
> `20261207120000_marketing_mcp_gravacao.sql`, Edges `mcp` e `marketing-run`). Falta só a chave de
> plataforma com os três escopos, gerada pelo Kallef em `/manager/api-interna`.
> **Plano de implementação:** [`docs/superpowers/plans/2026-11-25-marketing-mcp.md`](../superpowers/plans/2026-11-25-marketing-mcp.md).
> **Base:** [marketing-automation.md](./marketing-automation.md) (E3.1, inclusive o § 11 com as
> correções de 25/11/2026), [marketing-rfm.md](./marketing-rfm.md) (E3.2) e [mcp.md](./mcp.md)
> (superfície `/manager`, § 4). Escopos: [permissions.md](./permissions.md) (ADR-005, escopo de
> plataforma). Doc-as-you-build: ADR-003.

## 1. O que é e para quem

Todo o módulo de Automação do Manager (`/manager/marketing`) vira tools de MCP, para a IA montar o
que hoje se monta na mão: segmento, campanha, cupom, leads e o disparo.

Dois consumidores, um registro só:

1. **Agora:** o MCP do Manager (`mcp.movepark.co/manager`, chave de plataforma `mp_` sem empresa),
   que é o que a equipe usa pelo Claude.
2. **Próximo passo:** um assistente dentro da tela de Automação, no jeito da Mia do operador
   ([assistente-do-operador.md](./assistente-do-operador.md)). Ele usa o mesmo registro de tools por
   um adaptador, como o chat do site já faz com o registro do consumidor
   (`_shared/assistant-tools.ts`). O assistente tem spec própria quando for a vez dele.

## 2. Decisões (Kallef, 25/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Até onde a IA vai sozinha? | **Pode disparar.** Executa campanha de ponta a ponta. O disparo fica num escopo separado do de edição (§ 4) |
| D2 | Quanto dado pessoal a IA vê? | **Dados completos.** Nome, e-mail e telefone saem nas respostas das tools de leitura. Cada resposta vai para o provedor da IA (Anthropic no MCP; Google Gemini no assistente do Manager) |
| D3 | O que entra além de segmento, campanha e análises? | **Cupons da Movepark, leads, configuração do disparo e a chave geral do disparo** |
| D4 | Abordagem | **Registro único no `_shared`, regras e auditoria no banco, motor compartilhado entre tela e IA** (§ 3). A alternativa de gravar direto nas tabelas foi descartada: tela e IA validariam em lugares diferentes, que é o tipo de divergência que deixou a matrícula quebrada por um mês |
| D5 | A tela | Passa a gravar pelas mesmas RPCs da IA, para ligar o disparo pela tela também entrar na auditoria |

**Pendência que esta spec torna real.** O consentimento de e-mail segue como decidido em
25/11/2026 (deixado para depois): `marketing_contact.email_consent` nasce `true` sem origem
registrada, contra a Política de Privacidade v3. Com a chave geral ao alcance da IA, isso deixa de
ser hipotético. Ver `marketing-automation.md` § 10.

## 3. Arquitetura

```
supabase/functions/_shared/marketing/
  tools.ts      MARKETING_TOOLS: nome, descrição, inputSchema e escopo de cada tool
  handlers.ts   callMarketing(db, actor, name, args): executa; recebe o cliente e quem age
  canvas.ts     validação do fluxo de campanha (espelho de src/features/marketing/canvas.logic.ts)
  run.ts        runCampaign(db, campaignId, opts): o núcleo do motor, tirado da Edge marketing-run

supabase/functions/mcp/tools.ts    MANAGER_TOOLS = [...as 4 de hoje, ...MARKETING_TOOLS]
supabase/functions/mcp/index.ts    callManager despacha marketing_* para callMarketing
supabase/functions/marketing-run   vira casca fina: gate de hub_admin + runCampaign
```

**Quem age (`actor`).** No MCP é a chave de plataforma (`api_key_id` e o nome dela). Na tela é o
`hub_admin` logado. O handler recebe o `actor` e repassa às RPCs de gravação, que gravam a auditoria.

**O banco continua sendo a regra.**

- As RPCs de leitura do painel passam a aceitar o servidor: o gate vira
  `is_hub_admin() or auth.role() = 'service_role'`. Cliente logado comum continua recebendo `42501`.
  Vale para `marketing_profile_matrix`, `marketing_conversion_funnel`, `marketing_segment_preview`,
  `marketing_segment_contacts`, `marketing_segment_counts`, `marketing_leads`, `marketing_move_lead`,
  `marketing_rfm_overview`, `marketing_rfm_contacts`, `marketing_discoveries`,
  `manager_list_platform_coupons`, `manager_upsert_platform_coupon` e
  `manager_set_platform_coupon_active`.
- As gravações que hoje a tela faz direto na tabela viram RPCs `security definer` com validação e
  auditoria: `marketing_save_segment`, `marketing_delete_segment`, `marketing_save_campaign`,
  `marketing_set_campaign_status` e `marketing_set_dispatch_config`. A tela troca as chamadas em
  `src/features/marketing/api.ts`.
- O catálogo de campos de segmento passa a existir no banco: `marketing_segment_fields()` devolve
  chave, tipo, rótulo, descrição e valores permitidos de cada campo. É ele que a RPC de gravação usa
  para recusar campo desconhecido e que a tool `marketing_list_segment_fields` devolve. O
  `SEGMENT_FIELDS` do front continua para a interface, e um teste de contrato no Vitest compara as
  chaves dele com as da migration (lendo o arquivo SQL como texto, como os contratos de host em
  `src/lib/site.contract.test.ts`).

**Fluxo de campanha: salvar aceita rascunho, executar exige fluxo pronto.** Hoje a tela salva fluxo
incompleto enquanto a pessoa edita, e só o botão de disparo exige fluxo válido. Fica assim:
`marketing_save_campaign` confere só a forma (ids únicos, aresta que aponta para nó existente, tipos
conhecidos) e devolve a lista de problemas de prontidão. Quem recusa fluxo incompleto é o
`runCampaign`, pela validação de `_shared/marketing/canvas.ts`. Como tela e IA executam pelo mesmo
`runCampaign`, a recusa vale para as duas. O `canvas.logic.ts` do front segue espelhado, com os
mesmos casos de teste dos dois lados (padrão de `src/lib/installments.test.ts`).

### Auditoria

Tabela nova `marketing_audit_log`: `id`, `actor_kind` (`hub_admin` ou `api_key`), `actor_id`,
`actor_label`, `action`, `entity`, `entity_id`, `before` (jsonb), `after` (jsonb), `reason`,
`created_at`. RLS de leitura só para `hub_admin`; escrita só pelas RPCs. Toda gravação desta spec e
toda execução de campanha deixam uma linha. O `api_request_log` continua registrando cada chamada
do MCP (quem e com qual escopo), mas ele não guarda o que mudou; a auditoria guarda.

As RPCs de gravação recebem `p_actor` (`{kind, id, label}`) e só o aceitam quando quem chama é o
`service_role`. Com `hub_admin`, o ator é sempre `auth.uid()`, para ninguém se passar por outro pela
tela.

Cupom e lead usam as RPCs que já existiam (`manager_upsert_platform_coupon`,
`manager_set_platform_coupon_active`, `marketing_move_lead`), que não gravam auditoria. Pelo MCP, o
handler grava a linha depois de cada uma; pela tela, essas três seguem sem auditoria.

Toda recusa de negócio das RPCs novas sai em `P0001`, porque é o único código cuja mensagem o MCP
repassa ao cliente (`safeToolError`); com outro código a IA receberia "Parâmetro inválido" e não
saberia o que corrigir.

## 4. Escopos

Três escopos novos em `api_scope`, todos **de plataforma** (`is_platform_scope = true`, fora de
`company_role_scope`) e atribuíveis a chave (`assignable_to_api_key = true`):

| Escopo | Dá direito a |
|---|---|
| `marketing:read` | Análises, contatos com dados completos, segmentos, campanhas, leads, cupons e configuração do disparo |
| `marketing:write` | Criar e editar segmento, campanha, cupom e lead; trocar destinatário de ensaio e teto diário |
| `marketing:dispatch` | Executar campanha e ligar ou desligar a chave geral do disparo |

O disparo é escopo à parte para uma chave de edição nunca enviar nada sem querer.

A chave nasce no Manager, gerada pelo Kallef em `/manager/api-interna`, com os três escopos. O valor
dela é segredo dele e não passa pela implementação.

## 5. Catálogo de tools

Todas com prefixo `marketing_`, para não colidir com nome de outro registro (ver "Colisão de nome
entre registros" em `mcp.md`).

### Leitura (`marketing:read`)

| Tool | Entrada | Devolve |
|---|---|---|
| `marketing_list_locations` | nada | Unidades com id, nome, empresa e destino. Sem ela a IA não teria como recortar por estacionamento |
| `marketing_get_rfm` | `location_ids?`, `window_days?` | Matriz RFM, totais, segmentos e oportunidades (`marketing_rfm_overview`) |
| `marketing_get_funnel` | `from`, `to`, `location_ids?` | Funil do período, perdas e cliques de saída (`marketing_conversion_funnel`) |
| `marketing_get_discoveries` | `location_ids?`, `window_days?` | As descobertas com estado `achado`/`estavel`/`sem_dados` |
| `marketing_get_profiles` | `location_ids?` | Matriz de perfis por estacionamento |
| `marketing_list_segment_fields` | nada | O catálogo de `marketing_segment_fields()` com os operadores de cada tipo. É o que a IA lê antes de montar segmento |
| `marketing_preview_segment` | `definition`, `location_ids?`, `limit?` | Quem casa, quem dá para alcançar por e-mail e por WhatsApp, e uma amostra |
| `marketing_list_segments` | `location_ids?` | Segmentos com as duas contagens |
| `marketing_list_contacts` | `segment_id` ou `definition` ou `rfm_segment`, `location_ids?`, `limit?` | Contatos com nome, e-mail, telefone e comportamento |
| `marketing_get_contact` | `email` ou `phone` ou `contact_key` | Documento completo do contato, RFM, cartões de lead e mensagens recebidas |
| `marketing_list_campaigns` | nada | Campanhas com status, público e estatística |
| `marketing_get_campaign` | `campaign_id` | Fluxo, segmento, matrículas por status, problemas de prontidão e últimas mensagens |
| `marketing_render_message` | `campaign_id`, `node_id`, `contact_key?` | Assunto e corpo montados para um contato, sem enviar |
| `marketing_list_leads` | `stage_key?`, `location_ids?`, `search?` | Cartões do quadro |
| `marketing_list_coupons` | nada | Cupons da Movepark com uso |
| `marketing_get_dispatch_config` | nada | Chave geral, teto diário, enviados hoje, destinatário de ensaio e remetente |

**Reserva do white-label fica de fora de toda leitura.** O contrato diz que o cliente do
white-label é dado do parceiro ([reservas-wl-no-hub.md](./reservas-wl-no-hub.md) § 3.4). As tools
leem só `marketing_*` e `booking`, e nunca `wl_booking`.

### Gravação (`marketing:write`)

| Tool | Entrada | O que faz |
|---|---|---|
| `marketing_save_segment` | `segment_id?`, `name`, `definition`, `description?`, `location_ids?` | Cria ou edita. Campo ou operador desconhecido é recusado. Segmento de sistema não muda |
| `marketing_delete_segment` | `segment_id` | Soft delete; recusa segmento de sistema e segmento de campanha em andamento |
| `marketing_save_campaign` | `campaign_id?`, `name`, `segment_id`, `location_ids?`, `canvas?`, `send_cap?` | Cria ou edita, sempre como rascunho ou pausada. Devolve os problemas de prontidão |
| `marketing_set_campaign_status` | `campaign_id`, `status` (`draft`, `paused`, `archived`) | `running` e `done` são do motor, não da tool |
| `marketing_move_lead` | `lead_id`, `stage_key` | Move o cartão (desliga a sincronia automática dele, como na tela) |
| `marketing_save_coupon` | os campos de `manager_upsert_platform_coupon` | Cria ou edita cupom da Movepark |
| `marketing_set_coupon_active` | `coupon_id`, `active` | Pausa ou reativa |
| `marketing_set_dispatch_config` | `test_recipient?`, `daily_cap?` | Destinatário de ensaio e teto diário. O remetente não muda por aqui |

### Disparo (`marketing:dispatch`)

| Tool | Entrada | O que faz |
|---|---|---|
| `marketing_run_campaign` | `campaign_id`, `limit?` (padrão 100, até 500) | Uma rodada do motor, igual ao botão da tela. Recusa fluxo com problema de prontidão |
| `marketing_set_dispatch_enabled` | `enabled`, `reason` (obrigatório) | Liga ou desliga a chave geral (`marketing_dispatch_enabled`) |

## 6. Travas que valem também para a IA

- **As do motor, sem exceção:** supressão e descadastro, consentimento por canal (com a ressalva da
  § 2), endereço, chave geral, teto do dia e destinatário de ensaio. A IA usa o mesmo `runCampaign`
  da tela, então não existe caminho de envio que pule alguma delas.
- **Chave geral com motivo:** `marketing_set_dispatch_enabled` exige `reason`, grava na auditoria e,
  quando liga a chave fora da tela, manda e-mail para a lista de
  `app_setting.team_daily_digest_recipients`, dizendo qual chave ligou e o motivo.
- **Remetente só leitura:** `marketing_email_from` aparece em `marketing_get_dispatch_config` e não
  muda pelo MCP.
- **Escopo por tool:** o dispatcher do MCP já trata tool fora de escopo como inexistente (`isToolCallable`).

## 7. Testes

| Camada | O que prova |
|---|---|
| pgTAP (`supabase/tests/marketing_mcp.test.sql`) | Servidor passa e cliente logado comum recebe `42501` em cada RPC; campo e operador desconhecidos recusados; segmento de sistema imutável; segmento em campanha ativa não se apaga; `p_actor_label` ignorado quando quem chama é `hub_admin`; toda gravação e toda troca da chave deixa linha em `marketing_audit_log` com antes e depois |
| Deno (`_shared/marketing/*.test.ts`) | Cada tool declara escopo; nomes únicos em todos os registros do MCP; mesmos casos da validação de fluxo do front; handlers com banco falso; `runCampaign` recusa fluxo com problema |
| Deno (`mcp/dispatcher.test.ts`) | Tool de marketing sem o escopo não aparece em `tools/list` nem executa; `marketing:write` não alcança `marketing_run_campaign` |
| Vitest | Contrato das chaves de `SEGMENT_FIELDS` contra a migration; a tela chamando as RPCs novas (MSW) |
| CI (`lint:openapi`) | Nenhum nome de `MARKETING_TOOLS` em card público; cada escopo novo tem pelo menos uma tool |

**Nenhum teste nem verificação desta entrega executa campanha contra o banco vivo.**

## 8. Entrega

1. Migration: escopos, `marketing_audit_log`, `marketing_segment_fields()`, gates das RPCs de
   leitura e as RPCs de gravação. Aplicada no vivo e registrada no histórico.
2. `_shared/marketing/`, a Edge `marketing-run` como casca fina e o MCP. Deploy de `mcp` (com
   `--no-verify-jwt`) e de `marketing-run`.
3. A tela passa a gravar pelas RPCs.
4. Documentação: `mcp.md` § 4 (tabela do Manager), `marketing-automation.md` (gravação por RPC e
   auditoria), `permissions.md` (escopos de plataforma) e o índice de specs.
5. O Kallef gera a chave em `/manager/api-interna` com os três escopos.

**Nenhuma campanha é executada durante a entrega.** A verificação ponta a ponta no vivo para em
`marketing_render_message` e `marketing_preview_segment`, que não gravam nem enviam.

## 9. Fora desta spec

- O assistente dentro da tela de Automação (próximo passo, spec própria).
- Agendamento por cron, métrica de abertura e clique, catálogo de templates da Meta: seguem em
  aberto em `marketing-automation.md` § 10.
- O consentimento de e-mail, o remetente com Gmail pessoal e o teto do dia em UTC, também em § 10.
