# Mia para operadores (assistente de IA no painel do parceiro)

> Decidido em 17/11/2026 com o Kallef. O agente nasce no beast-bots (Mastra), ao lado da Mia, e o
> Hub é a fronteira de confiança: sessão, empresa, papel, limite de uso, ações e conhecimento moram
> aqui. Sessão do lado do beast-bots: "Mia para operadores".

## Para que serve

O funcionário do estacionamento parceiro recebe pergunta de cliente que não sabe responder ("volto
dois dias antes, quero o dinheiro de volta", "dá para mudar a data?", "quando o estorno cai?") e
hoje pergunta para a Movepark. A Mia para operadores responde isso dentro do `/operator`, numa
bolinha no canto da tela: lê a reserva, consulta a base do operador, diz **o que fazer**, entrega
**a mensagem pronta para o cliente** e, quando há ação, **propõe** a ação com o efeito em reais para
o operador confirmar num clique.

## Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| 1 | Agente no beast-bots, tenant próprio `movepark-operador` (não é a Mia) | Mesmo motor, traces e evals da Mia; memória e caixa de entrada separadas das conversas dos clientes |
| 2 | O beast-bots **nunca** recebe o JWT do operador | Ele recebe um **token de assistente** (`mpo_…`) que vale 30 min, uma empresa, só a superfície `/operator`. Se vazar num trace, não abre o resto do Hub |
| 3 | Permissão recalculada a cada chamada pelo papel (`company_role_scope`) | Tirar o acesso de alguém vale na hora, sem esperar o token vencer |
| 4 | Escrita **só por proposta + clique** | O modelo chama `propose_booking_action`; quem executa é a Edge do Hub no clique "Confirmar", pelas mesmas Edges dos botões do painel. O modelo nunca move dinheiro sozinho |
| 5 | Ações cobertas: cancelar (com estorno), alterar datas (pendente ou paga), trocar veículo, check-in, check-out | Escolha do Kallef: "tudo, com confirmação no chat" |
| 6 | Base do operador em tabela própria, vetorizada em tabela própria | O estado "artigo interno aparecendo no chat do site" fica impossível por ausência, não por filtro (mesmo espírito do ADR-010) |
| 7 | A equipe Movepark vê as conversas e a lista de lacunas no Manager; a bolinha avisa que é registrado | Escolha do Kallef: é assim que a base melhora |
| 8 | Teto de uso por usuário/hora e por empresa/dia em `app_setting` | O beast-bots não tem teto de custo próprio |
| 9 | Liberação **por empresa** (`operator_assistant_company`), começando só pela Agência Fera | Pedido do Kallef em 17/11/2026: testar numa empresa antes de abrir para os parceiros |

## Fluxo

```
Bolinha (/operator, OperatorAssistantWidget)
  └─ POST /functions/v1/operator-assistant   (JWT do operador)
       confere: sessão, vínculo com a empresa (ou hub_admin), chave ligada, teto de uso
       grava a fala em operator_assistant_message
       emite token mpo_ (operator_assist_session, 30 min)
       └─ POST https://beastbots.fera.ag/operador/chat   (Bearer MASTRA_OPERATOR_TOKEN)
            agente movepark-operador
            └─ MCP https://mcp.movepark.co/operator
                 Authorization: Bearer mpo_…        (sujeito: o operador naquela empresa)
                 X-API-Key: mp_… escopo operator:assist  (agente: o beast-bots)
       lê as ações propostas no turno → cartões "Confirmar"
  └─ POST operator-assistant { acao: "confirmar" }  → Edge da ação (cancel-booking etc.) com o JWT do operador
```

## Superfície `/operator` do MCP (interna, sem card)

Quarta superfície credenciada, irmã do `/manager`: não entra em card, `llms.txt` nem `api-catalog`,
e o `lint:openapi` reprova se um nome do registro dela aparecer em card. Exige **as duas**
credenciais; faltando qualquer uma, 401 com a resposta padrão de recusa.

**Escopo efetivo** = escopos do papel do usuário na empresa ∪ `operator:assist` (dado pela chave do
agente). `hub_admin` e `owner` recebem todos os escopos de empresa. As tools de leitura de reserva
exigem `bookings:read`; as de conhecimento exigem só `operator:assist`. O handler roda com
`company_id` vindo do token, nunca do argumento nem do modelo.

| Tool | Escopo | O que faz |
|---|---|---|
| `find_booking(query)` | `bookings:read` | Busca por código, placa, nome, e-mail ou telefone (até 10) |
| `get_booking_situation(booking)` | `bookings:read` | Status, tarifa, até quando cancela com estorno, se troca data/placa, pagamentos e estornos, check-in/out, histórico de alterações e **o que dá para fazer agora** (calculado pelas mesmas regras das Edges) |
| `quote_date_change(booking, check_in_at, check_out_at)` | `bookings:read` | Novo total, diferença pela tabela da compra (17/11/2026), se cobra ou estorna parcial, disponibilidade. A proposta guarda a diferença e a Edge recusa se ela mudar até o clique |
| `quote_fare_upgrade(booking, target_tier)` | `bookings:read` | Quanto custa ir para Flex/Superflex e o que libera; desde 26/11/2026 diz que o estacionamento também gera o PIX pela tela |
| `search_operator_knowledge(query, k?)` | `operator:assist` | Busca semântica na base do operador |
| `report_knowledge_gap(question, context?)` | `operator:assist` | Registra pergunta sem resposta para a equipe |
| `propose_booking_action(booking, kind, …)` | conforme `kind` | Cria a proposta (10 min) e devolve o resumo; **não executa** |
| leitura de parceiro já existente | os escopos de sempre | `list_locations`, `get_location`, `list_parking_types`, `get_availability`, `simulate_price`, `list_bookings`, `get_booking`, `list_reviews`, `get_occupancy` |

`kind` e o escopo exigido na proposta **e** de novo no clique: `cancel` → `bookings:cancel`;
`change_dates`, `change_vehicle` → `bookings:write`; `check_in`, `check_out` → `bookings:checkin`.

As escritas de parceiro (cupom, preço, unidade) **não** entram nesta superfície: não passariam pela
confirmação.

## Contrato com o beast-bots

**Rota** `POST /operador/chat`, protegida por `Authorization: Bearer <MASTRA_OPERATOR_TOKEN>` (token
de serviço próprio, não o de admin). Corpo:

```json
{
  "messages": [{ "role": "user", "content": "texto do operador" }],
  "requestContext": {
    "movepark.operator.assistToken": "mpo_…",
    "movepark.operator.companyId": "uuid",
    "movepark.operator.companyName": "Virapark",
    "movepark.operator.userName": "Fulano",
    "movepark.operator.role": "owner | manager | operator | finance | hub_admin",
    "movepark.operator.scopes": ["bookings:read", "…"],
    "movepark.operator.page": "/operator/bookings/MP-ABC123",
    "movepark.operator.bookingCode": "MP-ABC123",
    "movepark.operator.now": "2026-11-17T10:00:00-03:00",
    "movepark.operator.recentActions": [{ "kind": "cancel", "booking_code": "MP-ABC123", "status": "executed", "result": "Estorno de R$ 180,00 solicitado" }]
  },
  "memory": {
    "resource": "movepark-operador:hub:<user_id>",
    "thread": "movepark-operador:hub:<user_id>:<company_id>:<conversation_id>"
  }
}
```

Resposta `200 { "reply": "markdown", "used_tools": ["get_booking_situation", "…"] }`. Só a fala
nova vai em `messages`; o histórico é a memória do Mastra. `assistToken` vai **só** no header do MCP:
nunca no prompt, nunca em log, mascarado nos spans.

**Regras da persona** (o conhecimento de regra mora no Hub, não no prompt):

1. Reserva citada ou aberta na tela (`bookingCode`) → `get_booking_situation` antes de responder.
2. Regra, prazo ou dinheiro → `search_operator_knowledge`. Não afirmar regra que não veio da base
   ou da situação; valor em reais só de `quote_*` ou da situação.
3. Não achou → `report_knowledge_gap` e dizer ao operador que a equipe Movepark vai completar.
4. Resposta em três partes quando couber: o que fazer; mensagem pronta para o cliente; a ação.
5. Ação → `propose_booking_action` e dizer "confirme no cartão abaixo". Nunca dizer que fez.
6. pt-BR, "Movepark", sem travessão.

## Dados (migration `20261204100000_assistente_do_operador.sql`)

| Tabela | Para quê | Acesso |
|---|---|---|
| `operator_assist_session` | token `mpo_` (sha256), usuário, empresa, validade | RLS sem policy; só `service_role` |
| `operator_assistant_action` | proposta: tipo, parâmetros, resumo, efeito em centavos, status (`proposed`/`executing`/`executed`/`failed`/`expired`/`dismissed`), resultado | dono lê as suas; hub_admin lê todas; escrita só `service_role` |
| `operator_assistant_message` | log da conversa (fala, ferramentas usadas, ações), `conversation_id` | dono lê as suas; hub_admin lê todas |
| `operator_assistant_gap` | lacunas: pergunta, contexto, status, artigo que resolveu | hub_admin |
| `operator_playbook_article` | base do operador (título, categoria, corpo em markdown, publicado) | hub_admin escreve; ninguém mais lê direto |
| `operator_knowledge_chunk` | vetores da base (768d, mesma pipeline `knowledge-embed`) | RLS sem policy; busca por RPC `service_role` |

`api_request_log.acting_user_id` registra "agente agindo por fulano". Escopo novo `operator:assist`
(`is_platform_scope = true`, atribuível à chave). Config em `app_setting.operator_assistant`
(`enabled`, `max_messages_per_user_hour`, `max_messages_per_company_day`).

## Liberação por empresa (migration `20261204130000_mia_operador_liberacao_por_empresa.sql`)

A Mia só existe para a empresa que estiver em `operator_assistant_company` (uma linha por
empresa, com quem liberou e quando). Começou só com a **Agência Fera**, em 17/11/2026.

- **Uma regra só:** `operator_assistant_liberado(company_id)` devolve verdadeiro quando a pessoa é
  da empresa (ou é hub_admin), a chave global `app_setting.operator_assistant.enabled` não está
  desligada e a empresa está na lista. A bolinha consulta essa função para aparecer, e a Edge
  `operator-assistant` chama a MESMA função, sob o JWT da pessoa, antes de conversar, de ler o
  histórico e de confirmar uma ação. Descartar proposta continua livre.
- **Ordem das chaves:** a global é o desligamento de emergência e vale sobre a lista. JSON torto em
  `app_setting` vale o padrão (ligada), igual ao `lerConfig` da Edge.
- **hub_admin segue a lista:** impersonando uma empresa não liberada, ele também não vê a bolinha.
  É o que o operador daquela empresa veria.
- **Quem liga:** só hub_admin, pela aba **Empresas** do Manager (RLS `is_hub_admin()` na tabela).
  O parceiro não lê a lista; só pergunta pela própria empresa. Desligar vale na pergunta seguinte;
  a bolinha some quando a pessoa recarrega o painel (a resposta fica 5 minutos em cache).
- O token `mpo_` só nasce depois dessa checagem, então a superfície `/operator` do MCP não precisa
  repetir a regra.

pgTAP em `supabase/tests/operator_assistant_liberacao.test.sql` (12 casos: fora da lista, operador
não se libera nem lê a lista, empresa alheia, hub_admin, chave global, config torta).

## Execução da ação (o clique)

`operator-assistant` `{ acao: "confirmar", action_id }`, com o JWT do operador:

1. A proposta é dele, está `proposed` e não venceu; troca para `executing` num `update … where
   status = 'proposed'` (dois cliques não executam duas vezes).
2. Revalida o escopo do `kind` com `member_has_scope` sob o JWT dele.
3. Chama a Edge do botão equivalente com o JWT dele: `cancel-booking`, `change-booking-dates`
   (pendente) ou `change-booking-dates-paid` (confirmada), `change-booking-vehicle`, e as RPCs de
   check-in/out do painel. Override de staff, estorno, voucher e `booking_modification` ficam
   idênticos ao botão.
4. Grava `executed` ou `failed` com o resultado; o resumo entra em `recentActions` no próximo turno.

## Testes

- `resolver.test.ts`: matriz da superfície `/operator` (só token, só chave, chave sem escopo, token
  vencido, as duas boas).
- `operator.logic.test.ts`: o que dá para fazer agora por status × tarifa × pagamento; escopo por
  `kind`.
- pgTAP: emissão e resolução do token, escopo por papel, isolamento por empresa nas RPCs `assist_*`,
  base do operador fora da `match_knowledge`.
- Vitest: widget (abre, envia, mostra cartão, confirma) e lógica da Edge (teto de uso, transição de
  status da ação).

## Manager

`/manager/mia-operadores` (menu Conta › Mia para operadores), quatro abas:

- **Sem resposta**: as lacunas abertas, com empresa, pessoa e reserva. "Base atualizada" ou
  "Ignorar" fecham a pendência.
- **Conversas**: as conversas de todos os operadores, agrupadas, com as ferramentas que a Mia
  consultou e os erros do agente.
- **Base do operador**: os artigos por categoria. Salvar reenfileira a vetorização pelo gatilho, e a
  Mia passa a usar o texto novo no ciclo seguinte do cron (2 minutos). O formulário recusa
  travessão e texto curto demais.
- **Empresas**: liga e desliga a Mia por empresa, com a data da liberação. As liberadas ficam no
  topo.

## Decisões de conteúdo

- **Básica que quer mudar a data** (Kallef, 17/11/2026, revisto em 26/11/2026): a orientação padrão
  segue sendo o upgrade para a Flex e o próprio cliente alterar as datas. Desde 26/11/2026 o
  estacionamento **não** altera sem cobrar: a troca pela equipe cobra junto o upgrade para o Flex
  (decisão D1 de `docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md`). Com
  diferença positiva, a proposta da Mia já mostra o PIX com as duas partes
  (`upgradeParaTrocarDatas`); sem diferença a cobrar, a Mia manda para o botão Alterar datas da
  tela, que faz o upgrade antes. Só a equipe da Movepark dispensa o upgrade, com motivo.
- **Depois da entrada não há devolução de diárias** (já era a FAQ global; não se reabre).

## Estado (17/11/2026)

Tudo no ar e conferido em produção:

- `/operator` respondendo pelo `mcp.movepark.co` com as duas credenciais; sem a chave, ou com o
  token em outra superfície, 401.
- 24 artigos da base vetorizados em `operator_knowledge_chunk`, zero na tabela pública.
- Turno real pela Edge com o beast-bots (agente `movepark-operador`, PR agenciafera/beast-bots#3):
  11 s, consultou a reserva e a base, respondeu certo.
- Proposta e confirmação numa reserva pendente de teste (MP-749404, Agência Fera): a Mia propôs,
  o clique executou pela `cancel-booking` (histórico com `staff` e motivo), o segundo clique foi
  recusado, os tokens do turno foram apagados e cada chamada ao `/operator` ficou no
  `api_request_log` com a chave do agente e o `acting_user_id`.

Desde 17/11/2026 a Mia está liberada **só para a Agência Fera**; as outras empresas não veem a
bolinha e a Edge recusa com 403.

**Não exercitado ainda com dinheiro de verdade:** cancelamento com estorno e troca de datas paga
pelo cartão. O caminho é o mesmo dos botões do painel, mas o primeiro uso real merece conferência
no rastro do gateway.
