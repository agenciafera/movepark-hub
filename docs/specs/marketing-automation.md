# Automação de marketing (E3.1)

Ferramenta de marketing dentro do `/manager`, no espírito de RD Station, Mautic e LeadLovers, mas
assentada no que o Hub realmente sabe sobre o cliente: a reserva.

Cinco peças, uma base de dados só:

| Peça | Rota | O que responde |
|---|---|---|
| Matriz de perfis | `/manager/marketing` | Quem são os clientes de cada estacionamento e como compram |
| Funil de conversão | `/manager/marketing` (aba) | Onde a reserva se perde |
| Leads (kanban + lista) | `/manager/marketing/leads` | Em que ponto do funil está cada pessoa |
| Segmentos | `/manager/marketing/segmentos` | Recortes salvos da base, que viram público |
| Campanhas | `/manager/marketing/campanhas` | Fluxos de e-mail e WhatsApp disparados para um segmento |

Migrations: `20261027093000_marketing_automation.sql`, `20261027094500_marketing_lock_internal_helpers.sql`,
`20261027100000_marketing_campaign_engine.sql`.
Edge Functions: `marketing-run`, `marketing-unsubscribe`.

**No menu, a área ocupa uma linha só.** As quatro telas ficam dentro do item **Automação**
(`NavItem.children`, em `src/components/shared/nav-items.ts`), que abre e fecha na sidebar. Quatro
entradas soltas empurravam a seção "Conta" para fora da dobra num notebook. O pai não é link: clicar
nele abre a gaveta em vez de navegar, e a gaveta nasce aberta quando a pessoa já está numa das telas
de dentro. No celular o grupo vira uma seção do menu "Mais", com o rótulo do pai como título, então
nenhuma tela fica inalcançável.

---

## 1. Decisões de fundo

### 1.1 O contato de marketing não é identidade (ADR-006)

`auth.users` continua sendo a fonte única da credencial, e o contato operacional do pedido continua
no snapshot da `booking`. `marketing_contact` guarda o que é de CRM: consentimento, dono, etiquetas,
estágio.

As colunas de endereço se chamam **`marketing_email`** e **`marketing_phone`** de propósito. Elas
existem porque um disparador precisa de um endereço para entregar, e escrever nelas **nunca** promove
o identificador a login. Promover continua exigindo OTP, como na tela "Meus logins". É o mesmo
precedente do `unverified_phone_hint` do checkout.

### 1.2 Comportamento é derivado, nunca gravado

Coorte, ticket médio, recorrência e sazonalidade saem de `booking` em tempo de consulta
(`marketing_contact_metrics`). Materializar criaria uma segunda verdade que envelhece calada: no dia
em que a reserva é cancelada, o rótulo "cliente recorrente" continuaria lá.

O custo é recalcular a cada consulta. Na escala atual (dezenas de milhares de reservas) isso é
barato. Quando doer, o caminho é uma materialized view com refresh agendado, **não** colunas
gravadas na tabela de contato.

### 1.3 Segmento é dado, não código

A definição é uma árvore jsonb avaliada por `marketing_eval_definition`, **sem SQL dinâmico**. Um
segmento é escrito na tela pelo time de growth, então a avaliação não pode virar concatenação de
string com valor vindo da UI.

### 1.4 O disparo nasce travado

`app_setting.marketing_dispatch_enabled` nasce `false`. Com ela desligada o motor roda inteiro,
resolve o público, monta cada mensagem e grava em `marketing_message` com status `skipped`, com o
corpo final. Dá para conferir exatamente o que sairia antes de deixar sair.

Ferramenta de disparo em massa que nasce ligada manda e-mail para cliente real no primeiro teste.

---

## 2. Modelo de dados

```
marketing_contact ──< marketing_lead >── marketing_pipeline ──< marketing_pipeline_stage
      │                     └──< marketing_lead_activity
      ├──< marketing_enrollment >── marketing_campaign ──> marketing_segment
      └──< marketing_message
marketing_suppression  (por contact_key + canal, sobrevive a ressincronização)
```

**`contact_key`** é o identificador normalizado e determinístico: e-mail em minúsculo quando existe,
senão telefone só com dígitos, senão `uid:<profile_id>`. É por ele que a reserva anônima e a reserva
logada da mesma pessoa colapsam em um contato só (`marketing_contact_key`).

Todas as tabelas são RLS de `hub_admin` e têm `grant` revogado de `anon`.

---

## 3. Coortes e estágios

Classificação em `marketing_contact_metrics`. **A ordem dos ramos é a regra**, porque um contato
casaria com vários:

| Coorte | Regra | Por que nessa ordem |
|---|---|---|
| `lead` | 0 compras | |
| `inativo` | sem comprar há mais de 365 dias | Vence "recorrente": quem sumiu não é público de retenção |
| `campeao` | 4+ compras e última há no máximo 180 dias | |
| `sazonal_ferias` | 2+ compras e 70% delas em janeiro, julho ou dezembro | |
| `em_risco` | 2+ compras e passou do **dobro da própria cadência** | Vence "recorrente": é o único acionável |
| `recorrente` | 2+ compras | |
| `primeira_compra` | 1 compra | |

**Janela de férias = janeiro, julho e dezembro.** É escolha, não fato: carnaval anda no calendário e
ficou de fora.

**Estágio de growth (AARRR):** `aquisicao` (não comprou), `ativacao` (primeira compra), `retencao`
(comprando), `reativacao` (comprou e sumiu).

**Candidato a assinante:** 3+ compras no último ano, **ou** cadência média de até 45 dias com 2+
compras. É o público de mensalista (E-mensalista).

---

## 4. Funil de conversão

Os degraus são só o que os dados sustentam: **reserva criada → paga → check-in → concluída**.

Não existe degrau de "visitas" porque o Hub não grava evento de sessão, e inventar um número de topo
faria toda a taxa abaixo dele virar ficção. O clique de saída para o site do parceiro
(`external_exit_click`) aparece como número próprio, à parte: é outra jornada, e essa reserva não
nasce no Hub.

Cada taxa é sobre o **degrau anterior**, não sobre o topo, porque o que interessa é onde a pessoa
desiste. A perda aparece escrita entre uma faixa e outra, que é onde ela acontece.

**Desenho (trapézios empilhados, `funnel.logic.ts`).** A aresta de baixo de cada faixa é a aresta de
cima da seguinte, então os trapézios se encaixam e o funil afunila a partir do dado, sem
estreitamento decorativo. A largura segue o volume numa **escala de raiz quadrada**, não linear: com
um funil real (236 → 53 → 31 → 24) a escala linear joga os três últimos degraus entre 10% e 22% de
largura, onde o rótulo não cabe, e um piso simples fazia os três saírem iguais, o que escondia
justamente a queda. A raiz preserva a ordem e comprime a cauda. Em troca, **o número exato e o
percentual são escritos em toda faixa** e a legenda avisa que a largura é indicativa, então a
leitura precisa nunca depende de medir no olho.

Cor: rampa ordinal de uma cor só (tokens `--funnel-*` no `index.css`, claro e escuro com passos
próprios), validada pelo `validate_palette` do skill `dataviz` em modo `--ordinal`. O `-fg` é a cor
do rótulo dentro da faixa, porque o passo mais claro não aceita texto branco. O texto fica em uma
camada separada do `clip-path`: dentro do elemento recortado, o rótulo do último degrau era cortado
no meio.

"Cliente novo x recorrente" ranqueia sobre o histórico inteiro e só depois recorta a janela: quem
comprou pela primeira vez em 2024 e voltou agora conta como recorrente.

---

## 5. Segmentação

Definição:

```json
{ "match": "all", "rules": [
  { "field": "bookings_count", "op": "gte", "value": 2 },
  { "match": "any", "rules": [
    { "field": "cohort", "op": "eq", "value": "em_risco" },
    { "field": "subscription_candidate", "op": "is_true" }
  ]}
]}
```

Operadores: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, `in`, `not_in`, `contains`, `is_true`,
`is_false`, `is_empty`, `is_present`.

Campos disponíveis: ver `marketing_contact_doc` (SQL) e `SEGMENT_FIELDS`
(`src/features/marketing/segmentBuilder.logic.ts`).

> **Campo novo entra nos DOIS lados.** O banco é quem decide de verdade; o front usa o catálogo para
> montar a UI, validar e escrever o resumo em português. Um campo só no front salva um segmento que
> não casa com ninguém.

A prévia separa **quem casa** de **quem dá para alcançar** por canal. Um segmento de 4 mil pessoas em
que só 30 aceitam WhatsApp é uma campanha que parecia grande e não era.

---

## 6. Leads

Pipeline com colunas (`marketing_pipeline_stage`) e duas visões do mesmo conjunto: kanban e lista.

- **Kanban**: arrastar e soltar nativo do HTML5, sem biblioteca. O CI roda `--frozen-lockfile` no
  Linux, então uma dependência a mais por um recurso de uma tela só é risco de build sem
  contrapartida (CLAUDE.md).
- **Lista**: colunas escolhidas pelo usuário, gravadas em `marketing_pipeline.column_prefs`, então a
  escolha vale para o time e não só para um navegador.
- Mover é por RPC (`marketing_move_lead`), e não update direto, para a ordenação, o fechamento do
  lead e o registro na timeline acontecerem na mesma transação.

`resolveColumns` defende contra preferência velha: chave desconhecida é descartada, coluna travada
entra sempre, e preferência vazia cai no padrão (senão a tabela apareceria sem coluna nenhuma).

---

## 7. Campanhas

### 7.1 Canvas

```ts
{ nodes: [{ id, type, x, y, data }], edges: [{ from, to, branch? }] }
```

Tipos: `trigger`, `email`, `whatsapp`, `wait`, `condition`, `exit`. Só a condição tem duas saídas
(`yes` / `no`).

O mesmo formato é lido pelo motor (`supabase/functions/marketing-run/engine.ts`). **Tipo de nó novo
entra nos dois lugares.**

Regras que o editor impõe antes de deixar disparar (`validateCanvas`): entrada ligada, pelo menos um
envio, e-mail com assunto e corpo, WhatsApp com template, condição com as duas saídas, espera maior
que zero, nenhum nó solto. Ciclo é recusado na hora de ligar.

Quando uma condição não tem a saída pedida, o fluxo **termina** em vez de cair na outra ponta:
mandar o e-mail do "sim" para quem deu "não" é pior do que não mandar nada.

### 7.2 Execução

`POST /functions/v1/marketing-run { campaignId }`, só `hub_admin`.

1. `marketing_enroll_campaign` matricula o público do segmento, respeitando descadastro, matrícula
   existente (unique `campaign_id + contact_id`) e `send_cap`.
2. `marketing_due_enrollments` traz quem está pronto para avançar, com o documento do contato
   embutido para o nó de condição.
3. O motor caminha pelos nós. **Entrega é um passo por execução**: uma campanha com dois e-mails
   seguidos não dispara os dois na mesma rodada.

### 7.3 As travas, nesta ordem

`decideSend` decide, e a ordem é a mesma da lei antes do produto:

1. **Supressão** (bounce, reclamação, descadastro) vence tudo.
2. **Consentimento** do canal. `whatsapp_consent` nasce `false`: a Meta exige opt-in ativo.
3. **Endereço** no canal.
4. **Chave geral** `marketing_dispatch_enabled`.
5. **Teto do dia** `marketing_daily_send_cap`, somando todas as campanhas.

`suppressed` e `skipped` são estados diferentes de propósito: `skipped` é trava operacional (dá para
religar e reenviar), `suppressed` é decisão do contato (não se reverte sozinha).

`marketing_test_recipient`, quando preenchido, manda **todo** e-mail para esse endereço em vez do
cliente. É o modo de ensaio com o disparo ligado.

### 7.4 Descadastro

Todo e-mail sai com link de descadastro no rodapé, apontando para `/descadastro?t=<token>`. A página é
pública e sem login: quem clica está no cliente de e-mail, e exigir senha para sair de uma lista vira
denúncia de spam, que é bem pior do que perder o contato.

A Edge `marketing-unsubscribe` é `verify_jwt=false` e aceita **só o token aleatório**
(`unsubscribe_token`), nunca e-mail cru: com e-mail, qualquer um descadastraria qualquer pessoa só
sabendo o endereço. Responde `{ok:true}` mesmo para token desconhecido, para não virar oráculo.

Sair de um canal só **não** carimba `unsubscribed_at`: sair do WhatsApp não é sair da base, e
carimbar faria a matrícula excluir quem ainda aceita e-mail.

---

## 8. Segurança

`marketing_contact_metrics`, `marketing_contact_doc`, `marketing_contact_key`, `marketing_eval_rule` e
`marketing_eval_definition` são **ajudantes internos**: `security definer` sem gate próprio, chamados
de dentro das RPCs do painel.

> O `execute` deles está revogado de `anon` **e de `authenticated`**
> (`20261027094500_marketing_lock_internal_helpers.sql`). O Supabase concede `execute` a
> `authenticated` por privilégio padrão, e sem essa revogação qualquer cliente logado chamaria
> `/rest/v1/rpc/marketing_contact_metrics` e baixaria a base inteira: e-mail, telefone, gasto total e
> modelo do carro de todo mundo. **Não reconceda.**

As RPCs de tela (`marketing_profile_matrix`, `marketing_conversion_funnel`,
`marketing_segment_preview`, `marketing_segment_contacts`, `marketing_leads`, `marketing_move_lead`,
`marketing_sync_contacts`) gateiam com `is_hub_admin()` na primeira linha e recusam com `42501`.

`marketing_enroll_campaign` e `marketing_due_enrollments` são chamadas pelo `service_role` (a Edge),
então não carregam gate de papel, e por isso têm `execute` revogado de `anon` e `authenticated`.

---

## 9. Testes

| Camada | Onde |
|---|---|
| Gramática do segmento | `src/features/marketing/segmentBuilder.logic.test.ts` |
| Canvas (ligar, ciclo, validação) | `src/features/marketing/canvas.logic.test.ts` |
| Colunas da lista | `src/features/marketing/leadColumns.logic.test.ts` |
| Contrato de rede das mutations | `src/features/marketing/api.test.tsx` |
| Motor de campanha | `supabase/functions/marketing-run/engine.test.ts` |
| Descadastro | `supabase/functions/marketing-unsubscribe/logic.test.ts` |
| Navegador | `e2e/windup/manager-marketing*.json`, `e2e/windup/descadastro.json` |

---

## 10. Em aberto

- **Agendamento.** `marketing_campaign.scheduled_at` existe e a Edge aceita ser chamada, mas não há
  cron ligado: hoje a execução é pelo botão. Ligar um `pg_cron` que chame `marketing-run` para
  campanhas `scheduled` é o passo natural.
- **Métrica de abertura e clique.** `marketing_message` grava envio e falha, não engajamento. Pixel e
  link rastreado são decisão à parte (e têm implicação de privacidade).
- **Templates de WhatsApp.** O nó pede o nome do template aprovado na Meta na mão. Um catálogo lido da
  API da Meta evitaria erro de digitação.
- **Lead B2B.** O pipeline hoje é de consumidor. `partner_lead` (captação de estacionamento) segue em
  `/manager/partners`, sem integração com este funil.
