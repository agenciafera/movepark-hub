# Assistente da Automação (IA dentro de /manager/marketing)

> **Status:** desenho aprovado em 25/11/2026, a implementar. Nada daqui existe ainda.
> **Base:** [marketing-mcp.md](./marketing-mcp.md), que criou o registro de tools de marketing
> (`supabase/functions/_shared/marketing/`), a gravação auditada e o motor compartilhado. Padrões
> reaproveitados: o chat do site ([chatbot.md](./chatbot.md), Edge `chat`, Gemini com function-calling)
> e a bolinha da Mia do operador ([assistente-do-operador.md](./assistente-do-operador.md)).

## 1. O que é

Uma conversa dentro da tela de Automação do Manager. O admin pede "monta uma campanha de volta para
quem sumiu há mais de 90 dias, com cupom de 10%" e o assistente consulta a base, monta o segmento,
mede o público, cria o cupom, escreve a campanha e deixa tudo pronto. Executar a campanha ou ligar
o disparo real fica para o clique do admin.

## 2. Decisões (Kallef, 25/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Onde roda | **Edge no Hub, com Gemini.** O registro de marketing é chamado direto, sem token novo, e a auditoria registra o admin logado. Descartado: agente no beast-bots, que pediria trabalho nos dois repositórios, um token novo para o `/manager` e poria um bot como ator |
| D2 | O que roda sem clique | **Leitura e gravação** (segmento, campanha, cupom, lead, destinatário de ensaio e teto) rodam na hora. **Executar campanha e ligar ou desligar a chave geral** viram cartão de confirmação. Rascunho não sai para cliente e fica na auditoria; disparo é irreversível |
| D3 | Memória | **Só na sessão do navegador.** Sem tabela nova: o que foi gravado já está em `marketing_audit_log` |
| D4 | Modelo | `gemini-2.5-pro`, trocável por `app_setting.marketing_assistant_model`. O volume é interno e pequeno, então vale o modelo melhor para escrever campanha |

## 3. Arquitetura

```
Bolinha (/manager/marketing/*, MarketingAssistantWidget)
  └─ POST /functions/v1/marketing-assistant   (JWT do hub_admin)
       confere: sessão e papel hub_admin
       laço Gemini (function-calling), até 8 rodadas
         ├─ tool de leitura ou gravação → callMarketing(service_role, ator = o admin)
         └─ marketing_run_campaign / marketing_set_dispatch_enabled → NÃO executa:
              vira proposta (cartão) e o modelo recebe "proposta criada, aguardando o admin"
       devolve: resposta, tools usadas, propostas, se houve gravação
  └─ POST marketing-assistant { acao: "confirmar", tool, args }   (clique em Confirmar)
       confere hub_admin de novo e executa a tool de disparo pelo callMarketing
```

**Ator.** A Edge chama `callMarketing` com `{ kind: "hub_admin", id: <id do admin>, label: <e-mail> }`
sobre o cliente `service_role`. A RPC de auditoria aceita esse ator porque quem chama é o servidor
(`marketing_resolve_actor`), e a linha registra o e-mail do admin.

**Confirmação sem estado no servidor.** O cartão leva a tool e os argumentos de volta ao front, e o
clique os reenvia. Não há tabela de propostas: quem confirma é o próprio admin, que já poderia
executar a mesma ação pela tela, então reenviar os argumentos não dá a ele nada que ele já não tenha.
A Edge confere de novo o papel e aceita só as duas tools de disparo nesse caminho.

### Adaptador para o Gemini

O Gemini aceita um subconjunto do JSON Schema. Em `_shared/marketing/gemini.ts`:

- tira `additionalProperties` e `format` de todo nível;
- campo de objeto livre (`definition` do segmento e `canvas` da campanha, que não têm
  `properties`) vira `string` com a instrução "JSON do …", e o adaptador faz `JSON.parse` antes de
  chamar o handler. Texto que não é JSON volta ao modelo como erro, para ele corrigir;
- o resto passa como está.

### Instruções do modelo (no código, `_shared/marketing/assistant-prompt.ts`)

Versionadas e revisadas em PR, como os templates de e-mail (ADR-007). Conteúdo:

1. Papel: assistente de marketing da Movepark, para a equipe interna, em português do Brasil.
2. Segmento: ler `marketing_list_segment_fields` antes de montar; medir com
   `marketing_preview_segment` antes de salvar; dizer quantos casam e quantos dá para alcançar.
3. Campanha: o formato do fluxo (trigger, email, whatsapp, wait, condition, exit), as tags
   (`{{nome}}`, `{{reservas}}`, `{{ticket_medio}}`, `{{total_gasto}}`, `{{dias_sem_comprar}}`,
   `{{carro}}`), salvar e repassar os problemas de prontidão que `marketing_save_campaign` devolver.
4. Copy: voz da Movepark (direta, humana, sem superlativo vazio), **sem travessão**, marca grafada
   "Movepark", texto curto.
5. Números: só citar o que uma tool devolveu; nunca inventar público, taxa nem receita.
6. Disparo: executar campanha e ligar a chave geral dependem do clique do admin; o modelo propõe e
   explica o efeito.
7. Limites conhecidos: cliente do white-label fica fora da base; o consentimento de e-mail ainda não
   está resolvido (`marketing-automation.md` § 10), então avisar antes de propor disparo real.
8. Contexto: a página aberta e, se houver, o id da campanha ou do segmento.

O texto das instruções passa pela skill `revisar-texto` antes de entrar no código.

### Contrato da Edge `marketing-assistant`

`POST /functions/v1/marketing-assistant` com o JWT do `hub_admin`.

Conversa:

```json
{
  "mensagens": [{ "papel": "usuario", "texto": "..." }, { "papel": "assistente", "texto": "..." }],
  "pagina": { "caminho": "/manager/marketing/campanhas/<id>", "campaign_id": "<id>" }
}
```

```json
{
  "resposta": "texto do assistente",
  "ferramentas": [{ "nome": "marketing_save_segment", "ok": true }],
  "propostas": [{ "tool": "marketing_run_campaign", "args": { "campaign_id": "..." }, "resumo": { "campanha": "...", "publico": 31, "alcance_email": 31, "disparo_ligado": false } }],
  "gravou": true
}
```

Confirmação: `{ "acao": "confirmar", "tool": "marketing_run_campaign" | "marketing_set_dispatch_enabled", "args": {...} }` devolve o resultado da tool.

O front manda no máximo as últimas 20 mensagens. Só o texto vai e volta; as chamadas de tool de
cada turno não são reenviadas (o modelo consulta de novo quando precisa).

**Resumo do cartão.** Para `marketing_run_campaign`, a Edge consulta a campanha (`marketing_get_campaign`)
e o segmento dela (`marketing_segment_counts`) e manda nome, público, alcance por canal, se a chave
geral está ligada e os problemas de prontidão (com problema, o cartão mostra e não deixa confirmar).
Para `marketing_set_dispatch_enabled`, manda o estado atual, o pedido e o motivo.

**Erros.** Erro de tool volta ao modelo como resposta da função (`{ "erro": "<mensagem>" }`), para
ele explicar ou corrigir. Falha do Gemini ou estouro das 8 rodadas devolvem uma resposta curta
dizendo que não deu para concluir, sem derrubar a tela.

## 4. Na tela

- `src/features/marketing-assistant/`: `api.ts` (hooks), `MarketingAssistantWidget.tsx` e testes.
- A bolinha aparece em todas as páginas de `/manager/marketing` (montada no layout do Manager quando
  a rota começa por `/manager/marketing`), no padrão visual da Mia do operador.
- Mostra a conversa, as tools usadas em cada turno (rótulo legível, por exemplo "consultou o RFM",
  "salvou o segmento") e os cartões de proposta com Confirmar e Descartar.
- Quando o turno grava ou a confirmação executa, invalida `marketingKeys.all` para a tela recarregar.
- A conversa fica em `sessionStorage` e sobrevive à troca de página dentro da Automação.
- Texto da interface passa pela skill `revisar-texto`.

## 5. Segurança

- Só `hub_admin` entra na Edge; o `service_role` fica dentro dela.
- As duas tools de disparo nunca rodam dentro do laço: o modelo não consegue executar campanha nem
  ligar a chave geral, por mais que a conversa (ou um dado de cliente devolvido por uma tool) peça.
- Dado de cliente que volta das tools (nome, modelo do carro) é texto não confiável dentro do
  contexto do modelo. O pior que ele consegue induzir é uma gravação de rascunho, que fica na
  auditoria e não sai para ninguém sem o clique.
- Cliente do white-label continua fora: o assistente só enxerga o que as tools de marketing leem.

## 6. Testes

| Camada | O que prova |
|---|---|
| Deno `_shared/marketing/gemini.test.ts` | O adaptador tira `additionalProperties` e `format`, troca objeto livre por string, e devolve erro legível para JSON inválido |
| Deno `marketing-assistant/logic.test.ts` | Com um Gemini falso: tool de leitura e de gravação executam pelo `callMarketing` com o admin como ator; as duas de disparo viram proposta e **não** executam; erro de tool volta ao modelo; o laço para em 8 rodadas; a confirmação aceita só as duas tools de disparo |
| Vitest `MarketingAssistantWidget.test.tsx` | Envia a mensagem com a página; mostra o cartão e confirma; invalida a tela depois de gravar; a conversa sobrevive em `sessionStorage` |

Nenhum teste chama o Gemini de verdade nem executa campanha.

## 7. Fora desta spec

- Conversa salva no banco e histórico para a equipe.
- Agente que roda sozinho, sem pedido (agendado).
- Catálogo de templates do WhatsApp lido da Meta.
