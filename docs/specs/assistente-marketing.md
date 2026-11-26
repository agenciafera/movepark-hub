# Assistente de IA da Automação (página própria, agente no beast-bots)

> **Status:** v2 implementada e no ar em 26/11/2026. Página `/manager/marketing/assistente`, Edge
> `marketing-assistant` como ponte, superfície `/marketing` do MCP e agente `movepark-marketing` no
> beast-bots (PR agenciafera/beast-bots#9; evals 6 de 6). A v1 (bolinha e laço do Gemini na Edge)
> saiu. Conferido no vivo: sem token e com a chave anon 401, cliente 403, admin lista as conversas.
> Nenhuma campanha foi executada e a chave geral segue desligada.
> **Base:** [marketing-mcp.md](./marketing-mcp.md) (registro de tools de marketing em
> `supabase/functions/_shared/marketing/`, gravação auditada, motor compartilhado) e
> [assistente-do-operador.md](./assistente-do-operador.md), que é o molde da ponte Hub → beast-bots
> (token por turno, proposta gravada no Hub, clique que executa no Hub).

## 1. O que é

Uma página da Automação só para conversar com um agente de marketing. A conversa fica no centro e a
lista de conversas do admin fica ao lado, como no ChatGPT: nova conversa, abrir uma antiga e
continuar, renomear, apagar. O que o agente faz aparece na conversa como componente, enquanto
acontece: "Montando o segmento…", a prévia do segmento em tabela, os números da campanha em
gráfico, a mensagem como o cliente vai ver, o cartão para confirmar um disparo.

A ideia é que tudo da Automação possa nascer ali: consultar a base, montar segmento, medir público,
criar cupom, escrever e validar campanha, testar e, com o clique do admin, disparar.

## 2. Decisões (Kallef)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Onde roda o cérebro | **Agente novo no beast-bots (Mastra), tenant `movepark-marketing`** (26/11/2026). Fica junto da Mia e do operador, com memória, traces e evals de lá. Revê a D1 de 25/11 (Edge no Hub). Custo aceito: dado completo de contato passa a ficar na memória e nos traces do beast-bots, token novo por turno, dois repositórios |
| D2 | O que roda sem clique | Mantida de 25/11. **Leitura e gravação** (segmento, campanha, cupom, lead, destinatário de ensaio, teto) rodam na hora. **Executar campanha e ligar ou desligar a chave geral** viram proposta com Confirmar. Risco aceito: o cupom nasce pausado, mas o agente pode ativá-lo |
| D3 | Histórico | **Cada admin vê só as próprias conversas** (26/11/2026). O que foi gravado ou disparado continua em `marketing_audit_log` com o nome de quem pediu |
| D4 | Bolinha da v1 | **Sai** (26/11/2026). Um lugar só para conversar, um histórico só |
| D5 | Página | Aba **"Assistente de IA"** no menu da Automação |
| D6 | Modelo | O padrão do beast-bots (`google/gemini-3.5-flash`, `platform/config.ts`). As evals do § 10 decidem se precisa de um modelo maior; trocar é configuração do tenant |
| D7 | Ponte | A Edge `marketing-assistant` do Hub é a única porta da tela. O beast-bots **nunca** recebe o JWT do admin (mesma regra do operador) |

## 3. Arquitetura

```
Página /manager/marketing/assistente/:conversa   (useChat do AI SDK)
  └─ POST /functions/v1/marketing-assistant  { acao: "conversar", conversa_id, mensagem }   (JWT do hub_admin)
       confere: sessão, papel hub_admin, chave ligada, teto de uso
       emite token mpm_ (marketing_assist_session: admin + conversa, 30 min)
       └─ POST https://beastbots.fera.ag/marketing/chat   (Bearer MASTRA_MARKETING_TOKEN, stream)
            agente movepark-marketing, memória: resource = admin, thread = conversa
            └─ MCP https://mcp.movepark.co/marketing
                 Authorization: Bearer mpm_…          (em nome de quem: o admin)
                 X-API-Key: mp_… escopo marketing:assist  (quem age: o beast-bots)
                 tools marketing_* de leitura e gravação → executam com o admin como ator
                 marketing_run_campaign / marketing_set_dispatch_enabled → NÃO executam:
                   gravam marketing_assistant_action (proposed) e devolvem a proposta
       repassa o stream à página e apaga o token quando o stream termina
  └─ POST marketing-assistant { acao: "confirmar" | "descartar", proposta_id }   (clique no cartão)
       confere hub_admin e dono da proposta, executa a tool de disparo no Hub
  └─ POST marketing-assistant { acao: "conversas" | "abrir" | "renomear" | "apagar", ... }
       repassa ao beast-bots, sempre com o resource do admin logado
```

O Hub não guarda cópia da conversa: ela mora na memória do Mastra. O Hub guarda o que tem efeito,
que são as propostas (`marketing_assistant_action`) e a auditoria das gravações
(`marketing_audit_log`), além de `api_request_log.acting_user_id` em cada chamada do agente.

## 4. Superfície `/marketing` do MCP (interna, sem card)

Superfície credenciada nova, irmã do `/operator`: não entra em card, `llms.txt` nem
`api-catalog`, e o `lint:openapi` reprova se um nome dela aparecer em card. Exige **as duas**
credenciais; faltando qualquer uma, 401 com a resposta padrão de recusa.

- **Sujeito:** `Bearer mpm_…`, resolvido por `marketing_assist_resolve(sha256)` para o admin e a
  conversa do turno. O papel é recalculado a cada chamada: se a pessoa deixou de ser `hub_admin`,
  a chamada é recusada na hora, sem esperar o token vencer.
- **Agente:** `X-API-Key` da chave "Movepark-Assistente-Marketing", com o escopo de plataforma
  `marketing:assist` (`is_platform_scope = true`, atribuível à chave).
- **Escopo efetivo:** `marketing:read` + `marketing:write`. Nunca `marketing:dispatch`.
- **Ator na auditoria:** `{ kind: "hub_admin", id: <admin>, label: "<e-mail> (assistente)" }`.
- **Tools:** o registro `MARKETING_TOOLS` inteiro. As de leitura e gravação rodam pelo
  `callMarketing` de sempre. As duas de disparo passam por `proporDisparo`, que monta o resumo
  (o mesmo `resumirProposta` da v1, movido para `_shared/marketing/proposta.ts`), grava a proposta e
  devolve:

```json
{
  "status": "proposta",
  "proposta_id": "uuid",
  "tool": "marketing_run_campaign",
  "resumo": { "campanha": "Volta 90 dias", "publico": 31, "alcance_email": 30, "alcance_whatsapp": 0, "disparo_ligado": false, "problemas": [] },
  "aviso": "Aguardando o clique do admin no cartão. Nada foi executado."
}
```

Proposta com `problemas` não vazio é gravada com status `blocked` e o cartão não oferece Confirmar.

## 5. Contrato com o beast-bots

Tenant `movepark-marketing`, no molde de `tenants/movepark-operador/` (contexto, persona, rota,
cliente MCP com `tools/list` e `tools/call` crus por turno). Token de serviço próprio
`MASTRA_MARKETING_TOKEN`, diferente do de admin e do do operador (a rota recusa os dois). Chave do
MCP em `MOVEPARK_MARKETING_MCP_KEY`.

**Memória.** `resource = movepark-marketing:hub:<user_id>`,
`thread = movepark-marketing:hub:<user_id>:<conversa_id>`. Toda rota confere que a thread nasce do
resource. Título automático pelo `generateTitle` da memória da plataforma, que roda em segundo plano
depois da resposta: o `emitEvent`, que mandaria o título no próprio stream, não existe no
`@mastra/core` 1.62 do beast-bots (só nas versões novas). A tela recarrega a lista a cada 3 segundos
enquanto houver conversa do último minuto sem título (`esperandoTitulo`). Configuração de memória sem recall semântico: a conversa é curta e o dado da base vem das
tools, não da memória.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /marketing/chat` | `messages` (só a fala nova), `requestContext`, `memory` | stream UI do AI SDK (`handleChatStream` de `@mastra/ai-sdk`, na versão do AI SDK instalada no Hub), com `withSseHeartbeat` |
| `POST /marketing/conversas` | `{ resource, acao: "listar" }` | `[{ id, titulo, atualizada_em }]`, mais recente primeiro |
| `POST /marketing/conversas` | `{ resource, acao: "abrir", thread }` | mensagens no formato UI do AI SDK (`toAISdkMessages`) |
| `POST /marketing/conversas` | `{ resource, acao: "renomear", thread, titulo }` | `{ ok: true }` |
| `POST /marketing/conversas` | `{ resource, acao: "apagar", thread }` | `{ ok: true }`, apaga a thread e as mensagens |

`requestContext` do chat:

```json
{
  "movepark.marketing.assistToken": "mpm_…",
  "movepark.marketing.userName": "Fulano",
  "movepark.marketing.now": "2026-11-26T10:00:00-03:00",
  "movepark.marketing.recentActions": [
    { "proposta_id": "uuid", "tool": "marketing_run_campaign", "status": "executed", "resultado": "31 matrículas, 0 envios agora (chave geral desligada)" }
  ]
}
```

`assistToken` vai **só** no header do MCP: nunca no prompt, nunca em log, mascarado nos spans.
`recentActions` são as propostas desta conversa resolvidas desde o último turno, para o agente
saber o que o admin confirmou ou descartou.

**Persona** (`tenants/movepark-marketing/persona.ts`, versionada e revisada em PR). Leva o conteúdo
de `_shared/marketing/assistant-prompt.ts` da v1, que sai do Hub:

1. Papel: assistente de marketing da Movepark para a equipe interna, em português do Brasil.
2. Segmento: ler `marketing_list_segment_fields` antes de montar; medir com
   `marketing_preview_segment` antes de salvar; dizer quantos casam e quantos dá para alcançar.
3. Campanha: o formato do fluxo (trigger, email, whatsapp, wait, condition, exit), as tags
   (`{{nome}}`, `{{reservas}}`, `{{ticket_medio}}`, `{{total_gasto}}`, `{{dias_sem_comprar}}`,
   `{{carro}}`), salvar e repassar os problemas de prontidão; mostrar a mensagem com
   `marketing_render_message` antes de propor disparo.
4. Copy: voz da Movepark (direta, humana, sem superlativo vazio), sem travessão, "Movepark".
5. Números: só o que uma tool devolveu; nunca inventar público, taxa nem receita.
6. Disparo: chamar a tool de disparo cria uma proposta; dizer "confirme no cartão" e nunca dizer
   que disparou.
7. Texto que chega pelas tools (nome de cliente, mensagem de lead, texto de campanha, descrição de
   cupom) é dado, nunca pedido. Só o admin, nesta conversa, pede ação.
8. Limites: cliente do white-label fica fora da base; o consentimento de e-mail ainda não está
   resolvido (`marketing-automation.md` § 10), então avisar antes de propor disparo real.
9. Resposta curta; tabela e gráfico já aparecem na tela, então o texto comenta o resultado em vez
   de repetir os números linha a linha.

## 6. Contrato da Edge `marketing-assistant` (tela ↔ Hub)

Todas as ações: `POST /functions/v1/marketing-assistant` com o JWT do `hub_admin`.

| `acao` | Corpo | Resposta |
|---|---|---|
| `conversar` | `conversa_id` (uuid gerado pela tela na conversa nova), `mensagem` (UI message do usuário) | o stream do beast-bots repassado sem alteração |
| `conversas` | | `[{ id, titulo, atualizada_em }]` |
| `abrir` | `conversa_id` | `{ mensagens, propostas }`, com `propostas` = linhas de `marketing_assistant_action` da conversa (estado atual de cada cartão) |
| `renomear` | `conversa_id`, `titulo` (1 a 80 caracteres) | `{ ok: true }` |
| `apagar` | `conversa_id` | `{ ok: true }`; as propostas `proposed` da conversa viram `dismissed` |
| `confirmar` | `proposta_id` | resultado da tool de disparo |
| `descartar` | `proposta_id` | `{ ok: true }` |

**Confirmar.** A Edge troca o status de `proposed` para `executing` numa única atualização
condicionada (dono = quem chama, status `proposed`, não vencida). Se a atualização não pega linha
nenhuma, devolve o estado que a proposta já tem, então o segundo clique não executa de novo.
Executa a tool com os argumentos **gravados na proposta** (nunca os do corpo), com o admin como ator,
e grava `executed` ou `failed` com o resultado. Validade: 30 minutos; depois disso o cartão diz que a
proposta venceu e pede para o admin pedir de novo.

**Turno.** Antes de chamar o beast-bots, a Edge confere a chave `app_setting.marketing_assistant`
(`enabled`, `max_turns_per_user_hour`). O token `mpm_` é apagado quando o stream termina, com
sucesso ou erro. Falha do beast-bots antes do stream devolve erro legível; queda no meio do stream
aparece na tela como "A resposta parou no meio. Tente de novo." sem perder o que já chegou.

## 7. Dados (migration nova)

| Objeto | Para quê | Acesso |
|---|---|---|
| `marketing_assist_session` | token `mpm_` (sha256), admin, `conversa_id`, validade | RLS sem policy; só `service_role` |
| `marketing_assistant_action` | proposta: admin, `conversa_id`, tool, args, resumo, status (`proposed`/`blocked`/`executing`/`executed`/`failed`/`dismissed`/`expired`), resultado, `expires_at` | o admin lê as suas; escrita só `service_role` |
| `marketing_assist_resolve(p_token_hash)` | devolve admin e conversa de um token válido | só `service_role` |
| escopo `marketing:assist` | o da chave do agente | `is_platform_scope = true`, `assignable_to_api_key = true` |
| `app_setting.marketing_assistant` | `{ "enabled": true, "max_turns_per_user_hour": 60 }` | hub_admin |

Sem tabela de conversa nem de mensagem: a conversa é a thread do Mastra (D3).

## 8. Na tela

- Rotas `/manager/marketing/assistente` (abre a mais recente ou uma nova) e
  `/manager/marketing/assistente/:conversa`. Item "Assistente de IA" no grupo Automação do menu
  lateral (`src/components/shared/nav-items.ts`), junto de Segmentos, Campanhas e as demais.
- **Coluna da esquerda:** "Nova conversa" e a lista (título e data). Cada item tem renomear (edição
  no lugar) e apagar (com confirmação, porque não volta). Título novo aparece quando o agente termina de gerá-lo.
- **Centro:** a conversa, com `useChat` do AI SDK (pacotes novos `ai` e `@ai-sdk/react`) e um
  transporte que fala com a Edge e manda o JWT. Texto do agente em markdown pelo
  `MarkdownRestrito` (`src/components/shared/MarkdownRestrito.tsx`), o mesmo do chat do site. Caixa de texto embaixo e sugestões quando a conversa está vazia.
- **Cada tool vira um componente**, escolhido pelo nome da tool na parte da mensagem:

| Tool | Componente |
|---|---|
| qualquer uma, enquanto roda | linha "Montando o segmento…" (rótulo por tool) com indicador; vira feito ou mostra o erro em português |
| `marketing_preview_segment`, `marketing_list_contacts` | tabela com total e alcance por e-mail e WhatsApp |
| `marketing_get_campaign`, `marketing_get_funnel`, `marketing_list_campaigns` | números em cartões e funil em gráfico |
| `marketing_get_rfm`, `marketing_get_profiles`, `marketing_get_discoveries` | gráfico dos grupos da base |
| `marketing_render_message` | o e-mail ou o WhatsApp como o cliente vê; o HTML vai num `iframe` com `sandbox` vazio (sem script, sem origem) |
| gravações (`marketing_save_*`, `marketing_set_*`, `marketing_move_lead`, `marketing_delete_segment`) | cartão "Gravado" com link para a tela da Automação daquele item |
| `marketing_run_campaign`, `marketing_set_dispatch_enabled` | cartão da proposta com Confirmar e Descartar, estado vindo de `marketing_assistant_action` |
| as demais | tabela simples dos campos devolvidos |

- Gráfico com `recharts` e tabela com `@tanstack/react-table`, que o Hub já tem.
- Quando um turno grava ou uma confirmação executa, invalida `marketingKeys.all`.
- Texto da interface passa pela skill `revisar-texto`.

## 9. Segurança

- Só `hub_admin` entra na Edge. O beast-bots recebe um token `mpm_` de 30 minutos, preso a um admin
  e a uma conversa, que só abre a superfície `/marketing`. Se vazar num trace, não abre o resto do
  Hub e não dispara nada.
- A superfície `/marketing` nunca executa as duas tools de disparo: quem executa é a Edge, no clique
  do admin, com os argumentos gravados na proposta. Isso vale por mais que a conversa, ou um dado de
  cliente devolvido por uma tool, peça.
- A chave do agente sozinha não faz nada: sem `mpm_` válido, 401.
- Toda rota de conversa no beast-bots confere que a thread pertence ao resource do admin que a Edge
  mandou. A Edge monta o resource a partir do JWT, nunca do corpo.
- O HTML de prévia de e-mail é renderizado em `iframe` com `sandbox` vazio; o resto da saída das
  tools é renderizado pelo React, sem `dangerouslySetInnerHTML`.
- Dado de contato passa a ficar na memória e nos traces do beast-bots (custo aceito na D1). Os spans
  passam pelo `SensitiveDataFilter` de lá, e o token é mascarado.
- Gravação sem clique continua sendo o risco aceito da D2, com etiqueta na conversa e linha em
  `marketing_audit_log`.

## 10. Testes

| Camada | O que prova |
|---|---|
| pgTAP | `marketing_assist_resolve` recusa token vencido e quem deixou de ser `hub_admin`; RLS de `marketing_assistant_action` (o admin só lê as suas); escopo `marketing:assist` fora de `company_role_scope` |
| Deno, MCP `/marketing` | 401 sem uma das duas credenciais; leitura e gravação rodam com o admin como ator; as duas tools de disparo gravam proposta e **não** executam; proposta com problema nasce `blocked` |
| Deno, Edge `marketing-assistant` | só `hub_admin`; teto de uso; o resource vem do JWT; confirmar usa os argumentos gravados; segundo clique não executa; proposta vencida ou de outro admin é recusada; token apagado no fim do stream |
| Vitest | cada componente por tool (com dados de exemplo), lista de conversas (nova, abrir, renomear, apagar), cartão de proposta nos estados proposto, bloqueado, executando, feito, falhou, descartado e vencido, iframe da prévia sem script |
| beast-bots (testes e evals) | contrato da rota (token, thread do resource, recusa do token de admin); evals com MCP falso: monta o segmento pelos campos certos, mede antes de salvar, não diz que disparou, ignora pedido escondido em mensagem de lead |

Nenhum teste chama o modelo de verdade nem executa campanha.

## 11. Ordem de entrega

1. Hub: migration, superfície `/marketing` do MCP e chave do agente (sem efeito para ninguém ainda).
2. beast-bots: tenant `movepark-marketing`, rotas e evals; segredo `MASTRA_MARKETING_TOKEN` e chave
   do MCP nos dois lados.
3. Hub: Edge `marketing-assistant` vira ponte.
4. Hub: página nova e aba no menu; a bolinha sai no mesmo commit.

## 12. O que saiu da v1 (26/11/2026)

- `src/features/marketing-assistant/MarketingAssistantWidget.tsx`, a lógica de `sessionStorage` e a
  montagem no layout do Manager.
- O laço do Gemini da Edge (`marketing-assistant/logic.ts`: `rodarTurno`, `toContents`,
  `lerConversa`), `_shared/marketing/gemini.ts` e `_shared/marketing/assistant-prompt.ts` (o conteúdo
  vai para a persona no beast-bots).
- Continuam: `lerConfirmacao` (adaptado para `proposta_id`) e `resumirProposta` (movido para
  `_shared/marketing/proposta.ts`).

## 13. Fora desta spec

- Equipe vendo as conversas dos outros admins.
- Agente que roda sozinho, sem pedido (agendado).
- Catálogo de templates do WhatsApp lido da Meta.
- Anexar arquivo ou imagem na conversa.
