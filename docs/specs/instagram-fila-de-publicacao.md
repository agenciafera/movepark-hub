# Fila de publicação do Instagram (E3.6)

> **Status:** implementado em 21/10/2026. Decidido pelo Kallef em conversa; as escolhas estão na
> seção "Decisões". Falta o primeiro post real, que depende de um humano aprovar o rascunho em
> `/manager/social` e ligar a publicação automática (`social_dispatch_enabled`).
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
| 4 | Formatos | **Foto única e carrossel no feed, e stories** (ver decisão 10). Reel fica fora. Mantida em 26/10/2026, no Conteúdo 49: os dois reels de Confins saem pelo app, com a fonte e o registro do que foi ao ar em `docs/social/`, e o `enviar-rascunho.mjs` recusa `tipo: reel` com essa orientação. Estender a fila para reel é atividade à parte |
| 5 | O disparo | **Nasce desligado** (`app_setting.social_dispatch_enabled = false`), no padrão do `marketing_dispatch_enabled` |
| 6 | App Review da Meta | **Não é necessário.** Para app que serve só a negócio próprio, o acesso padrão basta ([doc oficial](https://developers.facebook.com/documentation/instagram-platform/app-review), atualizada em 30/06/2026) |
| 7 | Upload manual de arte no Manager | **Fora desta entrega** |
| 8 | Marcar as fotos de IA para a Meta (`is_ai_generated`) | **Não marcar** (Kallef, 21/10/2026). O parâmetro não é enviado; se a Meta detectar pelo metadado da imagem e rotular sozinha, o rótulo dela vale |
| 9 | "Publicar agora", além do agendamento | **Sim** (Kallef, 21/10/2026). O botão funciona **mesmo com `social_dispatch_enabled` desligada**: a chave segura o agendador automático, e "Publicar agora" é um clique humano, post a post, com confirmação. **Ignora a regra de um post por dia**, mas a confirmação avisa quando já saiu post hoje, porque os dois disputam alcance. Continua valendo: só sai post sem bloqueio da conferência, a aprovação vale só para a versão que a pessoa viu, o mesmo post nunca sai duas vezes, tudo fica no rastro e a `social-dispatch` segue sendo o único código que publica |
| 10 | Stories (22/10/2026) | **Sim.** O post de Viracopos saiu no feed e não nos stories, porque a fila nunca publicou story (decisão 4 antiga). Decisões do Kallef: **cada slide vira um story 9:16** (o slide 4:5 inteiro no centro, sobre a própria imagem desfocada, gerado pela skill com `render-story.mjs`), um carrossel de 6 vira 6 stories em sequência; **o padrão de post novo é feed e stories**, e o Manager troca post a post ("Onde sai"); os stories de um post já publicado podem sair depois. A API não aceita sticker de link, `alt_text` nem carrossel em story, então cada story é um envio `STORIES` e um `media_publish`, e o CTA continua sendo o link da bio. Os 6 stories de Viracopos saíram em 22/10 às 13:04 |

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
| `draft_key` | text, único | `<origem>:<corte>`, ex. `preco-do-estacionamento-no-aeroporto-de-confins:2`. Reenviar o mesmo rascunho atualiza a linha enquanto ela estiver `pending_review`, ou `rejected` sem `ig_container_id`. A `origem` é obrigatória: é o slug do post do blog, o da página de destino, ou `fato-AAAA-MM-DD-<assunto>` na notícia do momento (as três fontes do Passo 1 da skill) |
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

**Stories** (migration `20261130240000`), ao lado do feed e com estado próprio:

| Coluna | Tipo | Observação |
|---|---|---|
| `placements` | text[] | onde o post sai: `{feed}`, `{story}` ou `{feed,story}`. Padrão do banco `{feed}`; a `social-draft` grava `{feed,story}` quando o rascunho não diz nada |
| `story_slides` | jsonb | as imagens 9:16, em ordem: `[{url, path}]`. De 1 a 10 quando `story` está nos lugares |
| `story_status` | text | `pending`, `publishing`, `published` ou `failed`; nulo quando o post não vai para stories (`check`) |
| `story_items` | jsonb | por story: `{container_id, media_id, publicado}`. O `container_id` é gravado **antes** do `media_publish` |
| `story_error` | text | o motivo em português quando os stories falham |
| `story_published_at` / `story_claimed_at` | timestamptz | quando saíram / quando uma chamada pegou os stories (para achar chamada que caiu) |

`status` continua sendo o ciclo do post. Com feed nos lugares, ele acompanha o feed, e **falha de
story nunca mexe no feed**. Só com stories, `published` quer dizer que os stories saíram (com
`ig_media_id` do primeiro story e sem `ig_permalink`). A RPC `social_post_set_placements(p_id,
p_placements, p_expected_updated_at)` troca os lugares (hub_admin, versão aberta, só em
`pending_review`, `approved`, `overdue` e `failed`; recusa story sem as imagens 9:16) e devolve
post aprovado para aprovação, porque quem aprovou viu outros lugares. Evento `placements_edited`.

### `social_post_event`

O rastro. Mesmo desenho de `payment_gateway_event`: toda chamada à Graph API grava uma linha,
com sucesso ou com erro, e a tela do post mostra todas. **Nunca grava o `access_token`.**

| Coluna | Tipo |
|---|---|
| `id`, `social_post_id` (FK), `created_at` | |
| `kind` | text: `draft_received`, `caption_edited`, `approved`, `rejected`, `rescheduled`, `dry_run`, `container_child`, `container_parent`, `container_status`, `media_publish`, `permalink`, `consulta`, `reconciled`, `overdue`, `failed`, `publish_now` (o pedido do "Publicar agora", migration `20261130233000`), e os dos stories `story_container`, `story_publish`, `story_published`, `story_failed`, `placements_edited` (migration `20261130240000`) |
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
| `rejected` | `pending_review` | Edge `social-draft` | reenvio do mesmo rascunho pela skill, e só com `ig_container_id` nulo (a Meta nunca recebeu nada dele). É o "recusar e mandar de novo" |
| `approved` | `pending_review` | `hub_admin` | corrigiu a legenda |
| `approved` | `overdue` | `social-dispatch` | `scheduled_at` mais de 6 h no passado |
| `approved` | `publishing` | `social-dispatch` | hora chegou e chave ligada |
| `publishing` | `published` | `social-dispatch` | `media_publish` ok, ou reconciliação achou a mídia |
| `publishing` | `failed` | `social-dispatch` | erro da Meta ou da rede |
| `overdue`, `failed` | `approved` | `hub_admin` | reagendou para o futuro (é o "Tentar de novo"). Reagendar `pending_review` ou `approved` só muda a data |
| `pending_review`, `approved`, `overdue`, `failed` | `approved` com `scheduled_at = now()` | `hub_admin` | "Publicar agora": sem bloqueio e na versão que a pessoa viu, sem exigir data futura e sem o um por dia. Logo em seguida a `social-dispatch` (modo forçado) faz `approved → publishing → published/failed` |

- `pending_review → approved` exige `validation.blockers` vazio e `scheduled_at` no futuro.
- Corrigir a legenda de um post `approved` devolve ele para `pending_review`, porque o texto que
  foi aprovado deixou de existir.
- `published` é final, e `rejected` também para a tela: o único caminho de volta é o reenvio do rascunho pela skill, e só se a Meta nunca recebeu nada dele. Recusado depois de uma tentativa de publicação (`ig_container_id` preenchido) não volta, porque um envio antigo pendurado na Meta arriscaria publicar duas vezes. Post publicado não se edita pela plataforma: a API da Meta
  não altera legenda ([referência](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media)).

### Acesso

RLS ligada nas duas tabelas. `select` só para `hub_admin`. Nenhum `insert`/`update`/`delete`
direto por cliente: a escrita é da Edge (service role) e das RPCs `SECURITY DEFINER` abaixo,
que conferem `hub_admin`. Revogar de `anon` e `authenticated` **por nome**, porque função nova
no schema `public` nasce executável por eles.

| RPC | Faz |
|---|---|
| `social_post_approve(id, updated_at)` | aprova **a versão que a pessoa viu**: se o `updated_at` do post já não é o informado, recusa com "O post mudou desde que você abriu" (legenda corrigida ou rascunho reenviado no meio do caminho). Depois confere bloqueios e data, grava `approved_by/at`, evento `approved`. Migration `20261130230000` |
| `social_post_reject(id, motivo)` | evento `rejected` com o motivo |
| `social_post_reschedule(id, quando)` | aceita `pending_review`, `approved`, `overdue` e `failed`; recusa outro post publicado ou agendado no mesmo dia (fuso de São Paulo); `overdue` e `failed` voltam a `approved` |
| `social_post_publish_now(id, updated_at)` | o pedido do "Publicar agora". Mesma checagem de versão da aprovação ("O post mudou desde que você abriu"), aceita `pending_review`, `approved`, `overdue` e `failed`, recusa bloqueio da conferência e **não** checa `social_post_day_taken` nem data futura. Grava `status = 'approved'`, `scheduled_at = now()`, `last_error = null`; vindo de `pending_review`, `approved_by/at` passam a ser quem pediu e agora, e nos outros estados a aprovação anterior fica (só preenche o que estiver vazio). `ig_container_id` fica, para a Edge consultar a Meta antes de criar outro envio. Evento `publish_now` com `actor` e `request = { status_anterior, de, para }`. **Não publica.** Migration `20261130233000` |

Corrigir legenda não é RPC: vai pela Edge `social-draft` (ação `update_caption`, JWT de
`hub_admin`), porque a conferência roda lá. O corpo leva `expected_updated_at` (obrigatório, 422 sem
ele) e o update só vale se a linha ainda estiver nessa versão; senão, 409 com o mesmo texto da RPC.

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
   `status = 'pending_review'` (ou, para um recusado, a `status = 'rejected'` e `ig_container_id is
   null`); se não existe, `insert`, e `draft_key` duplicada (23505) é um envio concorrente. Nos dois
   casos o perdedor recebe 409, e rascunho que saiu de `pending_review` não é sobrescrito por
   reenvio: a linha fica como estava e a imagem enviada, que foi para um caminho novo, simplesmente
   não é usada. O reenvio de um recusado zera `approved_by/at` e `last_error`, volta a linha para
   `pending_review` e grava `draft_received` com a nota "Reenviado depois de uma recusa". Recusado
   com `ig_container_id` é 409.
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
As duas Edges usam o mesmo módulo. A `publish-instagram` continua existindo **só** para `diagnose`
e para o ensaio (`dryRun`, que valida e diz o que faria). **Publicar de verdade é só da
`social-dispatch`:** `publish-instagram` com `dryRun: false` devolve 403 ("Publicação real só pela
fila (/manager/social).") antes de qualquer chamada à Meta. Aquela rota publicava a legenda e as
imagens que viessem no corpo, sem aprovação, sem o limite de um por dia, sem a conferência da marca
e sem rastro, então deixou de ser um caminho de publicação (revisão final, 21/10/2026).

### Uma rodada

1. Lê `social_dispatch_enabled`.
2. **Reconciliação primeiro:** post em `publishing` há mais de 15 minutos é tratado como queda no
   meio do caminho (passo 6). Vale com a chave ligada ou desligada: o "Publicar agora" publica sem
   a chave, então um post pode parar em `publishing` com ela desligada, e a RPC recusa
   `publishing`. Reconciliar só consulta a Meta e grava o desfecho (`published` ou `failed`, que
   devolve o botão); nunca publica.
3. Marca como `overdue` todo `approved` com `scheduled_at` mais de 6 horas no passado, com evento
   `overdue`. Isso impede que ligar a chave despeje de uma vez uma fila acumulada. A escrita
   repete a regra (`status = 'approved'` e `scheduled_at` anterior a agora menos 6 h), então um
   post que uma pessoa reagendou, ainda aprovado, entre a leitura e a escrita não é marcado.
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
     `FINISHED` (até 30 consultas a cada 2,5 s, cerca de 75 s, o que cobre um carrossel de 10
     slides), publica, lê o `permalink` e marca `published`.
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

### "Publicar agora": o modo forçado (21/10/2026)

O Manager chama a RPC `social_post_publish_now`, que deixa o post `approved` com a hora de agora,
e depois esta Edge pelo navegador (`supabase.functions.invoke`), com o JWT do `hub_admin` e
`{ "post_id": "<uuid>" }`. A Edge responde `OPTIONS` e manda os cabeçalhos CORS em toda resposta.

- **Quando é modo forçado:** `Authorization: Bearer <JWT>` **e** `post_id` no corpo. Sem os dois, o
  pedido segue o caminho do cron, idêntico ao de antes (sem `x-social-dispatch-key` certa, 401).
- **Quem pode:** `admin.auth.getUser(jwt)` (sessão inválida, incluindo a anon key: 401) e
  `profiles.role = 'hub_admin'` (senão 403). `post_id` que não é uuid: 400.
- **O que o modo ignora:** a chave `social_dispatch_enabled` (nem é lida) e o um por dia. Também
  não toca em nenhum outro post: sem reconciliar `publishing` parado e sem marcar atrasados. Isso
  continua sendo trabalho da rodada.
- **O que ele exige:** o post existe (404) e está `approved` com `scheduled_at <= agora`, que é
  como a RPC o deixa. Qualquer outro estado é 409 com o texto em pt-BR ("Este post já está sendo
  publicado.", "Só post aprovado sai na hora (este está …)." etc.).
- **A publicação é a mesma da rodada:** a função `pegarEPublicar` foi extraída da rodada e serve
  aos dois modos. Pega condicionada (`status = 'approved'`, `scheduled_at <= agora`), consulta do
  container antigo antes de criar outro (post `failed` que voltou pela RPC guarda o
  `ig_container_id`), `media_publish` uma vez, reconciliação no erro ambíguo, `permalink`, rastro
  de cada chamada e escritas condicionadas a `publishing`.
- **Resposta:** `{ ok, acao: "publicado" | "reconciliado" | "outra_rodada", post, permalink? }`, ou
  502 `{ ok: false, acao: "falhou", post, erro }`.

Se a chamada à Edge cair no meio (rede), o post fica `approved` com a hora de agora. Com a chave
desligada o agendador não o publica (só grava o `dry_run`), e o botão continua na tela para tentar
de novo. Com a chave ligada, a próxima rodada o pega, a menos que já tenha saído post no dia (aí
ele vira `overdue` depois de 6 horas). Em nenhum caso sai duas vezes: a pega é atômica e o container
é consultado antes. Se a Edge cair depois da pega, o post fica em `publishing` e a rodada seguinte
do cron o reconcilia em até 30 minutos, com a chave desligada também.

### Stories (22/10/2026)

- **Depois do feed, na mesma chamada.** Com `feed` e `story` nos lugares, os stories saem logo
  depois do `publicado` ou `reconciliado` do feed. A resposta ganha `stories: { publicados,
  faltam, erro? }`. Falha de story fica em `story_status = failed` e `story_error`, e o feed
  continua publicado.
- **Um story por vez, nunca dois iguais.** A chamada pega os stories (`story_status` de `pending`
  ou `failed` para `publishing`, condicionado). Para cada imagem: story com `publicado` é pulado;
  envio de antes é consultado (`PUBLISHED` conta como publicado, `FINISHED` é publicado sem criar
  outro, erro ou vencido dá lugar a um novo); envio novo é gravado em `story_items` antes do
  `media_publish`, e sem essa gravação nada é publicado; `media_publish` com erro olha o envio uma
  vez antes de dar por falho.
- **Prazo.** A Edge tem 150 s de relógio. A chamada começa story novo até 100 s do início dela e
  sempre publica pelo menos um; o resto volta para `pending`.
- **Stories que ficaram para trás.** Na rodada sem feed para sair (e só com a chave ligada), sai o
  publicado mais antigo com stories `pending`, ou com `publishing` parado há mais de 15 minutos
  (`proximoComStories`). Resposta `acao: "stories"`. Stories com falha esperam o botão.
- **Só stories.** Post com `{story}`: depois da pega, os stories são a publicação; saíram, o post
  fica `published`; falharam, `failed` com o motivo do story.
- **Publicar agora** em post já publicado com stories `pending` ou `failed`: a RPC os deixa
  `pending` e a Edge publica só eles (`acao: "stories"`), sem tocar no feed.

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
  - abas de prévia ao lado dos slides (**Feed**, **Stories** e **Grade do perfil**), para
    conferir o post como ele aparece no celular antes de aprovar. São **só visuais**: rodam no
    navegador, usam curtidas e comentários fictícios (determinísticos a partir do id) e não vão
    para a Meta nem gravam nada. Quando o post vai para os stories, a aba **Stories** mostra as
    imagens 9:16 que vão sair; senão, monta como ficaria e diz que o post não vai para os
    stories. A grade usa até 5 outros posts da fila (publicados, publicando e
    agendados) em células 3:4 com recorte central, para conferir se o título da capa sobrevive
    ao corte. Código em `src/features/social/previa/`;
  - a legenda com os primeiros 125 caracteres destacados e a contagem de caracteres;
  - bloqueios e avisos da conferência;
  - origem (post do blog, corte, frase-chave, `price_date`);
  - data e hora editáveis;
  - o rastro completo (`social_post_event`), com rótulos que descrevem o pedido à Meta ("Pedido de
    publicação à Meta"), e não o resultado, ao lado do status HTTP;
  - depois de publicado, o link do post no Instagram.
- **Ações:** Aprovar (travado enquanto houver bloqueio ou data no passado), Recusar (pede motivo),
  Reagendar, Corrigir legenda (reconferida ao salvar) e Tentar de novo (em `failed`).
- **Publicar agora** (21/10/2026), ao lado de Reagendar/Tentar de novo, em `pending_review`,
  `approved`, `overdue` e `failed`, e só sem bloqueio da conferência. Pede confirmação
  (`window.confirm`): "Publicar agora no Instagram? O post vai ao ar em seguida na conta
  @moveparkestacionamento.", com " Já saiu um post hoje, e os dois vão disputar alcance." quando
  outro post da fila tem `published_at` no dia de hoje em São Paulo (só aviso, no front). Confirmado,
  `usePublishSocialPostNow` chama a RPC com o `updated_at` do post aberto e depois a
  `social-dispatch` no modo forçado. Enquanto roda, o botão fica travado com "Publicando…" (pode
  levar até um minuto e meio). `publicado` e `reconciliado` mostram "Post publicado no Instagram." e
  o link aparece com a fila recarregada; `outra_rodada` mostra "Outra rodada já está publicando
  este post."; falha mostra o texto do servidor. A fila recarrega no sucesso e no erro. No rastro, o
  evento aparece como "Publicar agora pedido".
- **Onde sai** (22/10/2026): caixas **Feed** e **Stories** em `pending_review`, `approved`,
  `overdue` e `failed`, com "Salvar" quando mudou; em post aprovado pede confirmação ("Mudar onde
  o post sai devolve ele para aprovação. Continuar?"). Stories fica travado quando o post não tem
  as imagens 9:16, com a dica de reenviar pela skill. Nos outros estados, só o rótulo ("Feed e
  stories", "Só no feed", "Só nos stories"), que também aparece na linha da lista. Abaixo, a
  situação dos stories (pendentes, publicando, publicados em tal hora ou o motivo da falha).
- **Publicar stories agora**, em post publicado com stories pendentes ou com falha: confirmação
  ("Publicar agora os N stories no Instagram? Eles ficam 24 horas no ar.") e a mesma RPC e Edge do
  "Publicar agora". Os que não couberam na chamada saem na próxima rodada, e o aviso diz isso.
- A imagem **não** se edita na tela: trocar arte é refazer o post na skill e reenviar.

Toda copy da tela passa pela skill `revisar-texto`. A tela segue o shell do Manager, e não o
contrato `harmonizar-paginas`, que é do consumer.

## 5. A skill

- **`scripts/enviar-rascunho.mjs <rascunho.md>`**: lê o front matter, roda o analisador e aborta se
  houver bloqueio, e manda o multipart para a `social-draft` com a chave de `.env.local`. Se o
  front matter traz só a data em `publicar_em`, assume 12:00 de São Paulo.
- **Passo 11** passa a descrever esse envio como o caminho padrão. A publicação manual pelo app
  continua possível.
- **`scripts/render-story.mjs`** (22/10/2026) gera o story 1080x1920 de cada slide: o slide 4:5
  inteiro no centro, sobre a própria imagem desfocada. A partir do HTML do slide, renderiza de
  novo sem a dica "arraste", que no story engana (arrastar para o lado pula para a próxima conta).
  O envio procura o story do slide `x.jpg` como `x-story.jpg` e lê `onde: [feed, story]` do front
  matter (sem o campo, os dois).
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
| `deno test` `social-draft/index.test.ts` | autenticação pelas duas formas, 409 em rascunho já aprovado e na corrida, caminho com corte e hash sem sobrescrever, escrita condicionada ao status, reenvio de recusado (sem container volta para `pending_review`, com container é 409), `update_caption` exigindo e conferindo `expected_updated_at` |
| `deno test` `publish-instagram/index.test.ts` | `dryRun: false` é 403 e não faz nenhuma chamada de rede; o ensaio e o diagnóstico seguem valendo |
| pgTAP `social_post.test.sql` | RLS (só `hub_admin` lê, ninguém escreve direto), transições das RPCs, aprovar com bloqueio recusa, aprovar com versão velha ou sem versão recusa, dois posts no mesmo dia recusa, grants revogados de `anon`/`authenticated` |
| pgTAP `social_post_stories.test.sql` | lugares válidos e coerência com as imagens e o estado (`check`), `set_placements` só para hub_admin, na versão aberta, recusa story sem imagens, publicado não troca, aprovado volta para aprovação, rastro `placements_edited`; "Publicar agora" em publicado com stories pendentes ou com falha deixa `pending`, e em publicado sem stories pendentes recusa |
| `deno test` `social-dispatch/index.test.ts`, seção (i) | stories depois do feed com o envio gravado antes do `media_publish`, sem `alt` nem legenda; falha de story não mexe no feed; nova tentativa não publica de novo (envio `PUBLISHED` conta, envio pronto é publicado sem criar outro); `media_publish` ambíguo; chave desligada não publica stories pela rodada; stories de outra chamada em andamento ficam com ela; só stories; prazo deixa o resto `pending`; "Publicar agora" em publicado publica só os stories |
| pgTAP `social_post_publish_now.test.sql` | "Publicar agora": anon não executa, não-admin 42501, versão velha ou nula recusa, bloqueio recusa, `pending_review` com data futura vira `approved` para agora mesmo com outro post publicado hoje, `failed` com container volta guardando o container e quem aprovou antes, `overdue` volta, publicado/publicando/recusado recusam, evento `publish_now` com quem pediu |
| `deno test` `social-dispatch/index.test.ts`, seção (h) | modo forçado: não-admin 403, sessão inválida 401, sem `post_id` segue o cron, `post_id` inválido 400, post fora de `approved` para agora 409, 404, publica com a chave desligada (e o cron na mesma fila só faz `dry_run`), publica com post já publicado hoje, pega vazia é `outra_rodada` sem Meta, não toca em atrasado nem parado, `failed` com container reconcilia sem POST, 502 em português, 503, CORS |
| Vitest `src/routes/manager/social.test.tsx` | Aprovar travado com bloqueio, aprovar e corrigir legenda mandando a versão aberta, editor reabrindo com a legenda de agora, legenda com destaque dos 125 caracteres, aba certa por estado; "Publicar agora" nos estados certos e escondido com bloqueio, desistir não chama nada, confirmar manda a versão aberta, aviso de post já publicado hoje, "Publicando…" travado, toasts de cada resultado |
| Vitest `src/features/social/api.test.ts` | `usePublishSocialPostNow`: RPC com a versão e depois a Edge só com `post_id`, RPC recusada não chama a Edge, 502 e 409 viram o texto do servidor, a fila recarrega no sucesso e no erro |

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
