# Fila de publicação do Instagram (E3.6)

> **Status:** desenhado em 21/10/2026, a implementar. Decidido pelo Kallef em conversa; as escolhas
> estão na seção "Decisões".
> **Atividade:** [E3.6 - Instagram derivado do blogpost](https://app.clickup.com/t/86akb7zcx).
> Absorve [Automatizar publicações no Instagram via API da Meta](https://app.clickup.com/t/86akccy01)
> e [Automatizar geração de 4 posts sociais](https://app.clickup.com/t/86ak6q0xd).
> **Relacionadas:** a skill `instagram` (`.claude/skills/instagram/`), a Edge `publish-instagram`,
> o **ADR-009** (promessa de transação) e o rastro do gateway de pagamento
> ([payment-split.md](./payment-split.md)), que é o modelo do rastro daqui.

## O problema

O perfil @moveparkestacionamento está parado desde 26/08/2026. O último post é anterior à skill
`instagram` e promete "vaga garantida" e "cancelar gratuitamente" com asterisco, o que o ADR-009
proíbe. O caminho de publicação real existe desde 08/09 (Edge `publish-instagram`), mas nunca
publicou nada: o token gravado era o do WhatsApp, sem nenhuma permissão de Instagram.

Em 21/10 o caminho foi destravado: usuário do sistema `movepark-instagram` no portfólio Clientes
Agência Fera, com acesso compartilhado à Página Movepark e ao app MoveparkInst, token novo em
`INSTAGRAM_ACCESS_TOKEN` e `INSTAGRAM_USER_ID` = `17841465371053612`. O diagnóstico devolveu
`pode_publicar: true` e um container de teste chegou a `FINISHED` sem publicação.

O que falta é a plataforma: um lugar onde o post espera, alguém aprova, e a publicação acontece
sozinha na hora marcada, com registro do que saiu.

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Quem produz o post (texto, foto, slide) | **O Claude, pela skill `instagram`**, com a foto gerada no Higgsfield pelo MCP, que gasta os créditos da assinatura. A plataforma não gera conteúdo |
| 2 | O que a plataforma faz | **Só o Instagram:** receber o rascunho pronto, guardar, mostrar para aprovação, publicar na hora marcada e registrar o que saiu |
| 3 | Toda publicação passa por aprovação humana | **Sim.** Nada sai sem um `hub_admin` aprovar |
| 4 | Formatos | **Foto única e carrossel.** Reel e story ficam fora |
| 5 | O disparo | **Nasce desligado** (`app_setting.social_dispatch_enabled = false`), no padrão do `marketing_dispatch_enabled` |
| 6 | App Review da Meta | **Não é necessário.** Para app que serve só a negócio próprio, o acesso padrão basta ([doc oficial](https://developers.facebook.com/documentation/instagram-platform/app-review), atualizada em 30/06/2026) |
| 7 | Upload manual de arte no Manager | **Fora desta entrega** |
| 8 | Marcar as fotos de IA para a Meta (`is_ai_generated`) | **Não marcar** (Kallef, 21/10/2026). O parâmetro não é enviado; se a Meta detectar pelo metadado da imagem e rotular sozinha, o rótulo dela vale |

### O que mudou em relação ao texto da E3.6

- **Sai a Edge `social-derive` com Gemini.** O corte e a legenda ficam com a skill, que já tem o
  método, o analisador e o portão anti-IA (`revisar-texto`). Um modelo no servidor escrevendo
  legenda sem revisão traz de volta o preço inventado e a promessa de transação.
- **Sai a camada `SocialGateway` com adapter de terceiro (Ayrshare).** Ela existia para o caso do
  App Review travar, e a decisão 6 tirou esse risco. Se um dia o parceiro publicar na conta dele
  (acesso avançado, com review), a abstração volta como entrega própria.
- **Sai o renderizador de slide no servidor.** O slide continua sendo composto pela skill
  (`slide-template.html` + `render-slide.mjs`). Montar 7 slides numa Edge estoura o limite de CPU
  por chamada, que a documentação do Supabase dá como 0,2 s ou 2 s, dependendo da página.

## Visão geral

```
skill instagram (Claude)                          Manager (hub_admin)
  rascunho .md + JPEGs 1080x1350                    /manager/social
  analisador sem bloqueio                             aprova, recusa, reagenda, corrige legenda
        │                                                     │
        ▼  scripts/enviar-rascunho.mjs                        ▼  RPCs social_post_*
  Edge social-draft ──► social_post (pending_review) ◄────────┘
     confere no servidor        │  aprovado
     sobe para assets-public    ▼
                          pg_cron */15 ──► Edge social-dispatch ──► Graph API (container → publish)
                                                 │
                                                 └──► social_post_event (rastro de cada chamada)
```

## 1. Modelo de dados

### `social_post`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | `gen_random_uuid()` |
| `draft_key` | text, único | `<origem>:<corte>`, ex. `preco-do-estacionamento-no-aeroporto-de-confins:2`. Reenviar o mesmo rascunho atualiza a linha enquanto ela estiver `pending_review`. A `origem` é obrigatória: é o slug do post do blog, o da página de destino, ou `fato-AAAA-MM-DD-<assunto>` na notícia do momento (as três fontes do Passo 1 da skill) |
| `status` | enum `social_post_status` | ver a máquina de estados |
| `kind` | enum `social_post_kind` | `image` ou `carousel`, derivado da quantidade de slides |
| `caption` | text | legenda completa, com as hashtags na última linha |
| `slides` | jsonb | `[{ "url", "path", "alt", "texto" }]` em ordem, de 1 a 10 itens (`check`) |
| `keyphrase` | text | a frase-chave do post de origem |
| `cut_number` | smallint, nulo | 1 a 4, o corte da skill |
| `blog_post_id` | uuid, nulo | FK `blog_post` |
| `destination_id` | uuid, nulo | FK `destination` |
| `cta_url` | text, nulo | link da bio com UTM |
| `price_date` | date, nulo | data de referência de todo R$ do post. Obrigatória quando legenda ou slide citam R$ |
| `scheduled_at` | timestamptz | hora prevista |
| `validation` | jsonb | `{ "blockers": [], "warnings": [] }`, escrito **só** pela Edge |
| `approved_by` / `approved_at` | uuid / timestamptz | |
| `ig_container_id` | text, nulo | gravado assim que o container pai existe; é o que permite a nova tentativa sem publicar duas vezes |
| `ig_media_id` / `ig_permalink` | text, nulo | depois de publicado |
| `published_at` | timestamptz, nulo | |
| `attempts` | smallint | tentativas de publicação |
| `last_error` | text, nulo | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | trigger `set_updated_at`, soft delete |

Não leva trigger `<tabela>_site_rebuild`: nada daqui sai em página pré-renderizada.

### `social_post_event`

O rastro. Mesmo desenho de `payment_gateway_event`: toda chamada à Graph API grava uma linha,
com sucesso ou com erro, e a tela do post mostra todas. **Nunca grava o `access_token`.**

| Coluna | Tipo |
|---|---|
| `id`, `social_post_id` (FK), `created_at` | |
| `kind` | text: `draft_received`, `caption_edited`, `approved`, `rejected`, `rescheduled`, `dry_run`, `container_child`, `container_parent`, `container_status`, `media_publish`, `permalink`, `consulta`, `reconciled`, `overdue`, `failed` |
| `http_status` | integer, nulo |
| `request` / `response` | jsonb, nulo |
| `note` | text, nulo |
| `actor` | uuid, nulo (o `hub_admin` que agiu; nulo quando foi a Edge) |

### Máquina de estados

| De | Para | Quem | Condição |
|---|---|---|---|
| (nada) | `pending_review` | Edge `social-draft` | rascunho recebido |
| `pending_review` | `approved` | `hub_admin` | `validation.blockers` vazio e `scheduled_at` no futuro |
| `pending_review`, `approved`, `overdue`, `failed` | `rejected` | `hub_admin` | com motivo |
| `approved` | `pending_review` | `hub_admin` | corrigiu a legenda |
| `approved` | `overdue` | `social-dispatch` | `scheduled_at` mais de 6 h no passado |
| `approved` | `publishing` | `social-dispatch` | hora chegou e chave ligada |
| `publishing` | `published` | `social-dispatch` | `media_publish` ok, ou reconciliação achou a mídia |
| `publishing` | `failed` | `social-dispatch` | erro da Meta ou da rede |
| `overdue`, `failed` | `approved` | `hub_admin` | reagendou para o futuro (é o "Tentar de novo"). Reagendar `pending_review` ou `approved` só muda a data |

- `pending_review → approved` exige `validation.blockers` vazio e `scheduled_at` no futuro.
- Corrigir a legenda de um post `approved` devolve ele para `pending_review`, porque o texto que
  foi aprovado deixou de existir.
- `published` e `rejected` são finais. Post publicado não se edita pela plataforma: a API da Meta
  não altera legenda ([referência](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media)).

### Acesso

RLS ligada nas duas tabelas. `select` só para `hub_admin`. Nenhum `insert`/`update`/`delete`
direto por cliente: a escrita é da Edge (service role) e das RPCs `SECURITY DEFINER` abaixo,
que conferem `hub_admin`. Revogar de `anon` e `authenticated` **por nome**, porque função nova
no schema `public` nasce executável por eles.

| RPC | Faz |
|---|---|
| `social_post_approve(id)` | confere bloqueios e data, grava `approved_by/at`, evento `approved` |
| `social_post_reject(id, motivo)` | evento `rejected` com o motivo |
| `social_post_reschedule(id, quando)` | aceita `pending_review`, `approved`, `overdue` e `failed`; recusa outro post publicado ou agendado no mesmo dia (fuso de São Paulo); `overdue` e `failed` voltam a `approved` |

Corrigir legenda não é RPC: vai pela Edge `social-draft` (ação `update_caption`, JWT de
`hub_admin`), porque a conferência roda lá.

## 2. Entrada: Edge `social-draft`

`POST /functions/v1/social-draft`, `verify_jwt = false`, duas formas de autenticar:

- **`x-social-draft-key`** (segredo `SOCIAL_DRAFT_KEY`): usada pelo script da skill. Cria e atualiza
  rascunho, e nada mais. Não publica e não aprova.
- **JWT de `hub_admin`**: usada pelo Manager, só para `update_caption`.

### Ação `submit` (multipart)

Campo `post` com o JSON do front matter da skill (o mesmo `.md` do Passo 11), mais um arquivo por
slide, com o nome igual ao `arquivo` do front matter:

```json
{
  "origem": "preco-do-estacionamento-no-aeroporto-de-confins",
  "corte": 2,
  "tipo": "carrossel",
  "destination": "aeroporto-de-confins",
  "keyphrase": "estacionamento no aeroporto de Confins",
  "publicar_em": "2026-10-28T12:00:00-03:00",
  "cta_url": "https://movepark.co/estacionamentos/aeroporto-confins?utm_source=instagram&utm_medium=social&utm_campaign=confins-preco",
  "price_date": "2026-10-21",
  "caption": "…",
  "slides": [{ "arquivo": "preco-estacionamento-aeroporto-confins-01.jpg", "alt": "…", "texto": "…" }]
}
```

A Edge:

1. Confere o payload (lista abaixo). Problema no **arquivo** (não é JPEG, tamanho, proporção) ou no
   **formato do payload** devolve 422 e não grava nada, porque não há post para mostrar. Os demais
   bloqueios (texto) ficam gravados em `validation` e travam a aprovação, para a tela mostrar o
   motivo.
2. Sobe os JPEGs para `assets-public/social/<origem>/<corte>/<hash>/<arquivo>`, sem sobrescrever
   (`upsert: false`). `<corte>` é `0` quando o post não tem corte; `<hash>` são os 8 primeiros
   bytes do SHA-256 do arquivo, em hex; `<arquivo>` segue sendo o nome de busca da skill. Dois
   motivos: o corte separa cortes diferentes, porque a skill nomeia os arquivos pela palavra-chave
   e pelo número do slide e todos os cortes do mesmo blogpost repetem esses nomes; o hash torna o
   objeto **imutável**, porque o bucket serve o que estiver no caminho na hora em que a Meta busca
   a imagem (a query `?v=` é ignorada). Bytes diferentes caem em outro caminho, então a imagem de
   um post aprovado nunca muda, nem por reenvio em corrida nem por quem perde a criação
   concorrente. Caminho já ocupado é o mesmo conteúdo e conta como sucesso (reenvio idêntico é
   idempotente). A URL guardada em `slides[].url` não leva query. Versões antigas de um rascunho
   reenviado ficam órfãs no bucket (sem limpeza automática).
3. Grava a linha conferindo o status **na própria escrita**: se já existe, `update` condicionado a
   `status = 'pending_review'`; se não existe, `insert`, e `draft_key` duplicada (23505) é um envio
   concorrente. Nos dois casos o perdedor recebe 409, e rascunho que saiu de `pending_review` não é
   sobrescrito por reenvio: a linha fica como estava e a imagem enviada, que foi para um caminho
   novo, simplesmente não é usada.
4. Grava `validation` e o evento `draft_received`.

### A conferência no servidor

A skill roda o analisador completo antes de enviar (`analisar-carrossel.mjs`). O servidor repete
**só o que quebra a publicação ou a marca**, porque é o que não pode depender de alguém ter rodado
o script. O código mora em `supabase/functions/_shared/instagram-validate.ts`, com teste.

| Bloqueia | Por quê |
|---|---|
| Arquivo que não é JPEG (bytes mágicos), largura fora de 320 a 1440 px, proporção fora de 4:5 a 1,91:1, acima de 8 MB | A Meta recusa na hora de publicar, e no carrossel isso deixa containers órfãos |
| Legenda vazia ou acima de 2.200 caracteres; mais de 30 hashtags; mais de 20 menções; mais de 10 slides; alt acima de 1.000 | Limites da API. O carrossel aceita 20 pela API desde 2026, mas a skill fixa 10 |
| Travessão `—` ou traço `–` na legenda, no alt ou no texto do slide | Regra de marca do `CLAUDE.md` |
| Promessa de transação: vaga garantida, cancelamento grátis, preço fixo, melhor preço garantido, reserva garantida | ADR-009. A lista é a mesma do recorte arquivado do Diego (`social.logic.ts`, tag `arquivo/resolver-atividade-qhk0pl`) |
| R$ na legenda ou no texto do slide sem `price_date` | Tarifa sem data vira promessa que ninguém retira depois |
| "MovePark", "Move Park" ou "MOVEPARK" | Grafia da marca |

| Avisa | Por quê |
|---|---|
| Hashtags fora de 3 a 5 | Recomendação da skill |
| Frase-chave fora dos primeiros 125 caracteres | É o trecho que aparece antes do "mais" e que o Google mostra |
| Slide sem alt, ou alt repetido | Acessibilidade e indexação |
| `price_date` com mais de 30 dias | Preço envelhecido |

## 3. Publicação: Edge `social-dispatch`

Chamada pelo `pg_cron` a cada 15 minutos. Autenticação com `x-social-dispatch-key`, chave criada
por `gen_random_bytes` no Vault (`social_dispatch_key`) e conferida por `cron_key_matches`, o mesmo
padrão do robô de pesquisa de preço: o valor nunca passa por terminal nem por CLI.

A chamada à Graph API sai da `publish-instagram` para `supabase/functions/_shared/instagram.ts`
(criar container de item e de carrossel, esperar `FINISHED`, `media_publish`, ler `permalink`).
As duas Edges usam o mesmo módulo. A `publish-instagram` continua existindo para `diagnose` e
para a publicação manual com `dryRun`.

### Uma rodada

1. Lê `social_dispatch_enabled`.
2. **Reconciliação primeiro:** post em `publishing` há mais de 15 minutos é tratado como queda no
   meio do caminho (passo 6).
3. Marca como `overdue` todo `approved` com `scheduled_at` mais de 6 horas no passado, com evento
   `overdue`. Isso impede que ligar a chave despeje de uma vez uma fila acumulada.
4. Escolhe **um** `approved` com `scheduled_at <= now()`, o mais antigo. Se já existe post
   `published` no mesmo dia (fuso de São Paulo), não publica: a regra da skill é um por dia.
5. **Chave desligada:** grava um evento `dry_run` ("publicaria agora", com o payload sem token)
   uma vez por post, e não muda o estado.
6. **Chave ligada:** pega o post com `update … set status = 'publishing', attempts = attempts + 1
   where id = … and status = 'approved' and scheduled_at <= now() and deleted_at is null`,
   devolvendo a linha. Se a linha não voltou, outra rodada pegou o post, ou um reagendamento
   empurrou a hora para o futuro entre a leitura e a pega, e esta rodada para aqui. Dali em
   diante a rodada publica a linha que a pega devolveu (legenda, slides e container de agora),
   nunca a lida antes. Toda escrita depois da pega exige o estado em que a rodada deixou o post
   (`status = 'publishing'`), então uma mudança concorrente não é pisada, e o evento que
   acompanha a escrita só é gravado se ela valeu.
   - Se o post já tem `ig_container_id`, consulta o container antes de criar outro:
     - `PUBLISHED`: não publica de novo. Procura a mídia pela legenda nos últimos posts da conta,
       grava `ig_media_id`, `ig_permalink` e `published_at` (o `timestamp` da mídia na Meta, para
       o post contar no dia de São Paulo em que foi ao ar e não no da reconciliação; sem
       timestamp, vale o relógio da rodada) e registra o evento `reconciled`.
     - status que não pôde ser lido: `failed`, sem publicar. O envio antigo pode já estar no ar, e
       seguir adiante o publicaria de novo.
     - qualquer outro status conhecido (`FINISHED`, `EXPIRED`, `ERROR`): cria um container novo.
   - Senão: cria os containers e grava o `ig_container_id` do pai **antes do `media_publish`**.
     Se essa gravação falhar, nada é publicado e o post vai para `failed`. Depois espera
     `FINISHED`, publica, lê o `permalink` e marca `published`.
   - `media_publish` com erro ou tempo esgotado: a Meta às vezes publica e responde erro. A
     rodada lê o container uma vez. Se está `PUBLISHED`, reconcilia como acima (o post está no ar
     e não vira `failed`). Se não, marca `failed` com um texto que termina em "Confira no
     Instagram antes de reagendar."
   - Qualquer outro erro: `failed`, `last_error` e o evento. O `last_error` é o que o Manager
     mostra: prefixo em português pela etapa e a mensagem da Meta, com até 500 caracteres (por
     exemplo, "Falhou ao enviar o slide 1 à Meta: Invalid image url."). A resposta crua da Meta
     fica no evento.
   - Reagendar um post `failed` mantém o `ig_container_id`. É isso que deixa a nova tentativa
     conferir a Meta antes de criar outro envio.

A lógica de decisão (o que sai, um por dia, atraso, reconciliação) fica numa função pura em
`social-dispatch/logic.ts`, testada sem rede.

## 4. Tela `/manager/social`

Rota em `src/routes.tsx` sob `RequireRole roles={["hub_admin"]}`, item **Instagram** no menu do
Manager, ao lado de Blog (`src/components/shared/nav-items.ts`). Dados em
`src/features/social/api.ts`, no padrão de query keys do projeto.

- **Cabeçalho:** estado da chave de disparo ("Publicação automática ligada" ou "desligada"), com o
  botão de ligar e desligar e confirmação. A chave é escrita em `app_setting`.
- **Abas:** Para aprovar (`pending_review` e `overdue`), Agendados (`approved`), Publicados e
  Falhas. A lista ordena por `scheduled_at`.
- **Detalhe do post:**
  - os slides como vão sair, em ordem, com o alt de cada um;
  - a legenda com os primeiros 125 caracteres destacados e a contagem de caracteres;
  - bloqueios e avisos da conferência;
  - origem (post do blog, corte, frase-chave, `price_date`);
  - data e hora editáveis;
  - o rastro completo (`social_post_event`);
  - depois de publicado, o link do post no Instagram.
- **Ações:** Aprovar (travado enquanto houver bloqueio ou data no passado), Recusar (pede motivo),
  Reagendar, Corrigir legenda (reconferida ao salvar) e Tentar de novo (em `failed`).
- A imagem **não** se edita na tela: trocar arte é refazer o post na skill e reenviar.

Toda copy da tela passa pela skill `revisar-texto`. A tela segue o shell do Manager, e não o
contrato `harmonizar-paginas`, que é do consumer.

## 5. A skill

- **`scripts/enviar-rascunho.mjs <rascunho.md>`**: lê o front matter, roda o analisador e aborta se
  houver bloqueio, e manda o multipart para a `social-draft` com a chave de `.env.local`. Se o
  front matter traz só a data em `publicar_em`, assume 12:00 de São Paulo.
- **Passo 11** passa a descrever esse envio como o caminho padrão. A publicação manual pelo app
  continua possível.
- **`references/api-instagram.md`** é corrigido: App Review não é exigido para conta própria, o
  carrossel aceita 20 pela API, a legenda publicada não se edita, a exclusão de mídia existe desde
  dez/2025 e existe o parâmetro `is_ai_generated`, que a Movepark não usa (decisão 8).

## Gates

| # | Gate | Proposta |
|---|---|---|
| G1 | Token com permissões a mais | O token de 21/10 saiu com `instagram_manage_contents` (apaga post), `instagram_manage_messages` e outras. Regenerar só com `instagram_basic`, `instagram_content_publish`, `pages_show_list` e `pages_read_engagement`, colado direto no Supabase. Depende de clique humano no Business Manager |
| G2 | Post de notícia tem prazo (21/10/2026) | A skill passou a produzir a pauta de notícia (`references/noticias.md`), com `tema`, `fonte_nome`, `fonte_url`, `fonte_data` e `validade` no front matter, e o analisador bloqueia publicação depois da `validade`. A fila precisa honrar isso, porque a aprovação pode atrasar o post além do prazo. Hoje a `social-draft` aceita a origem `fato-…` e descarta os campos de fonte e validade, então um post de notícia aprovado tarde sai vencido. Proposta, em migration nova (a `20261130180000` já criou a tabela): `social_post` ganha `source_name`, `source_url`, `source_date` e `valid_until` (nulos fora de notícia, obrigatórios por `check` quando a origem começa com `fato-`), a `social-draft` bloqueia sem eles, a `social-dispatch` não publica com `valid_until` no passado (vira `overdue`, com evento) e a tela mostra fonte e validade na hora de aprovar. Até isso entrar, post de notícia vai pela fila só com `scheduled_at` dentro da validade e aprovação no mesmo dia |

## Testes

| Camada | O quê |
|---|---|
| `deno test` `_shared/instagram-validate.test.ts` | cada bloqueio e cada aviso da tabela da seção 2, incluindo JPEG falso e proporção errada |
| `deno test` `social-dispatch/index.test.ts` | escolhe o mais antigo, um por dia no fuso de São Paulo, atraso acima de 6 h vira `overdue`, `publishing` parado é reconciliado, container `PUBLISHED` nunca publica de novo, chave desligada só grava `dry_run`, pega condicionada ao status e à hora, publicação da linha devolvida pela pega, `media_publish` ambíguo reconciliado pelo container, `published_at` vindo da Meta e uma trava em várias rodadas com uma Meta que guarda estado (um `media_publish` por post) |
| `deno test` `social-draft/index.test.ts` | autenticação pelas duas formas, 409 em rascunho já aprovado e na corrida, caminho com corte e hash sem sobrescrever, escrita condicionada ao status |
| pgTAP `social_post.test.sql` | RLS (só `hub_admin` lê, ninguém escreve direto), transições das RPCs, aprovar com bloqueio recusa, dois posts no mesmo dia recusa, grants revogados de `anon`/`authenticated` |
| Vitest `src/routes/manager/social.test.tsx` | Aprovar travado com bloqueio, legenda com destaque dos 125 caracteres, aba certa por estado |

## Ordem de entrega

1. Migration (tabelas, enums, RPCs, Vault, cron) + `gen:types`. O cron já nasce agendado, porque a
   chave desligada torna a rodada inofensiva.
2. `_shared/instagram.ts` e `_shared/instagram-validate.ts`, com a `publish-instagram` migrada para
   o módulo e os testes atuais dela verdes.
3. Edges `social-draft` e `social-dispatch`, com deploy e `--no-verify-jwt`.
4. Tela `/manager/social`.
5. Script da skill e Passo 11.
6. Primeiro post real: carrossel de Confins com preço reconferido, enviado pelo script, aprovado
   na tela, chave ligada, publicação conferida no perfil.

Antes de concluir: `/security-review` e advisors do Supabase, porque a entrega mexe em migration,
RLS, função `SECURITY DEFINER` e Edge.
