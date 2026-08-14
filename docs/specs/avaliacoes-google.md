# Avaliações do Google na vitrine

> Espelho das avaliações do Google Places para as unidades do Hub e para os lotes mapeados,
> exibido como prova social separada e rotulada, nunca somado à avaliação Movepark.
> **Ao mudar uma regra, atualize esta spec no mesmo PR.**

**Status:** desenhado em 14/08/2026, não implementado.

Relacionado: [reviews.md](./reviews.md) · [capacidades-unidade.md](./capacidades-unidade.md) ·
[checkout-externo-por-local.md](./checkout-externo-por-local.md) ·
[lote-mapeado-vitrine.md](./lote-mapeado-vitrine.md) ·
[place-id-lote-mapeado.md](./place-id-lote-mapeado.md) ·
[customer/search-results.md](./customer/search-results.md) ·
[customer/listing-detail.md](./customer/listing-detail.md).

---

## 1. O problema

A unidade externa (`location.checkout_mode = 'external'`) não gera `booking` no Hub. Como
`review.booking_id` é `NOT NULL`, ela nunca terá avaliação Movepark, e o `ReviewsBlock` não
renderiza por decisão do ADR-009. O lote mapeado (`prospect_location`) está pior: não tem nem
FK de `review`, de propósito.

O resultado na vitrine é que boa parte do catálogo aparece sem nenhum sinal de reputação, ao
lado de unidades hub que exibem estrela. A ausência não é lida como "ainda não avaliado", é lida
como "pior".

Essas unidades **têm** reputação. Ela está no Google, e a maior parte delas já tem
`google_place_id` verificado (53 de 63 fichas de lote mapeado, na rodada do E0.17-i).

**Objetivo:** prova social na vitrine. Não é ranking, não é SEO, não é substituir a coleta
própria. Ranking e curadoria continuam rodando só sobre a avaliação Movepark.

## 2. As três travas que desenham a solução

Nenhuma das três é escolha da Movepark. Elas eliminam sozinhas a maior parte do espaço de
desenho, então vêm antes do modelo de dados.

**Só o `place_id` pode ser guardado indefinidamente.** Nota, contagem e texto de avaliação são
conteúdo do Places sob limite de cache de 30 dias. Isso mata a ideia de importar uma vez e
esquecer, e é o motivo de o TTL existir no banco e não na tela.

**Atribuição é condição de uso, não enfeite.** Marca do Google junto da nota, link para o perfil
no Maps, e cada avaliação com nome do autor, foto e link para a avaliação original. Texto sai
como veio: sem editar, sem cortar, sem traduzir.

**`aggregateRating` não pode vir de avaliação de outro site.** A política de dados estruturados
do Google proíbe marcar como sua uma nota agregada coletada em outra plataforma. O JSON-LD do
Hub não encosta nesse dado (§8).

## 3. Por que não reusar a tabela `review`

Foi a primeira alternativa levantada, e ela é razoável de fora. A medição é que decide.

A `review` hoje:

```
booking_id  uuid NOT NULL UNIQUE  → booking(id)
profile_id  uuid NOT NULL         → profiles(id)
location_id uuid NOT NULL         → location(id)
```

Para caber uma avaliação do Google, caem os dois primeiros `NOT NULL`. E eles **são** o
antifraude que a [reviews.md §5](./reviews.md) descreve como valendo "sem código adicional".
Em Postgres, `UNIQUE` aceita NULL sem limite: ao tornar `booking_id` nulável, a garantia "uma
avaliação por reserva" sobrevive, e a garantia "toda avaliação tem uma estadia por trás" morre.
É a segunda que faz a nota valer alguma coisa.

Depois vem o efeito cascata, que é o mesmo argumento do ADR-010. O trigger
`review_recompute_location` calcula `avg(rating) where location_id = X and is_published`, então
linha do Google entra na média da Movepark. Conserta-se com `and source = 'movepark'`, uma linha.
Só que **todo** leitor passa a precisar do mesmo discriminador: 9 leituras de `review` em SQL,
mais as policies de RLS, mais o front. É o "o trigger protegeria duas colunas e deixaria 50
funções descobertas" registrado no CLAUDE.md.

E quatro desencontros estruturais:

| Desencontro | Consequência |
|---|---|
| A avaliação do Google chega como conjunto de até 5, escolhidas por ele, **sem id estável entre buscas** | Não há `upsert` por registro, só substituição do conjunto. É documento, não linha |
| O TTL de 30 dias exige `delete` periódico | Rodando na tabela que guarda avaliação de cliente, dado insubstituível e sem backup do Google |
| `is_published` numa linha do Google vira o botão de esconder a nota 1 e manter as 5 | Escolher a dedo conteúdo de terceiro é exatamente o que a regra de atribuição impede |
| `operator_respond_review` passaria a aceitar resposta a avaliação que mora no Google | O parceiro responderia num lugar onde a resposta nunca aparece |

**A decisão:** separado no repouso, unificado na leitura. Duas tabelas, porque os dois dados têm
dono, ciclo de vida e situação legal diferentes. Um hook e um bloco só na tela (§6). O front não
sabe que são duas tabelas; o banco nunca finge que são a mesma coisa.

## 4. Modelo de dados

```sql
create table public.google_place_snapshot (
  place_id          text primary key,
  rating            numeric(2,1),
  user_rating_count integer not null default 0,
  maps_uri          text,
  reviews           jsonb not null default '[]'::jsonb,
  fetched_at        timestamptz not null default now(),
  fetch_error       text,
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

`is_hidden` é o liga e desliga por unidade descrito em [§6](#6-exibição). Mora aqui, e não em
`location`, porque a chave da tabela é o lugar: esconder por `place_id` já é esconder por
unidade, sem coluna nova em duas tabelas.

**A chave é o lugar, não o nosso registro.** `place_id` como PK faz três coisas de uma vez:
serve `location` e `prospect_location` sem FK nova (o ADR-010 proíbe FK apontando para lote
mapeado, e aqui o vínculo é pelo valor), deduplica quando dois registros apontam para o mesmo
lugar, e deixa explícito que o dono do dado é o Google.

**`reviews` é `jsonb`** pelo motivo da tabela do §3: conjunto substituído inteiro, sem
identidade por item. Cada item guarda o que a atribuição exige:

```jsonc
{
  "rating": 5,
  "text": "...",                      // originalText, sem edição
  "publishTime": "2026-07-02T...",
  "relativePublishTimeDescription": "há um mês",
  "authorAttribution": {
    "displayName": "...",
    "photoUri": "https://...",
    "uri": "https://www.google.com/maps/contrib/..."   // perfil do autor
  },
  "googleMapsUri": "https://..."      // a avaliação em si
}
```

**O TTL mora na policy de RLS, não na query:**

```sql
alter table public.google_place_snapshot enable row level security;

create policy google_place_snapshot_read on public.google_place_snapshot
  for select to anon, authenticated
  using (not is_hidden and fetched_at > now() - interval '30 days');

create policy google_place_snapshot_write on public.google_place_snapshot
  for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());
```

Snapshot vencido deixa de existir para quem lê, mesmo que alguém esqueça o filtro. Mesmo
espírito do "o filtro de convertida na policy, não só na query" do ADR-010.

**Esconder não basta, tem que apagar.** Um `pg_cron` diário roda
`delete from google_place_snapshot where fetched_at < now() - interval '30 days'`. A policy
protege a exibição; o purge cumpre a regra de cache.

## 5. Atualização

**Edge `google-place-refresh`**, chamada por `pg_cron` via `pg_net`, protegida por header
secreto desde a primeira versão. A `review-request` deixou essa dívida anotada na
[reviews.md §8](./reviews.md); não se repete aqui.

Seleção de candidatos, sem snapshot ou com `fetched_at` acima de 7 dias:

```sql
select google_place_id from public.location
  where google_place_id is not null and deleted_at is null and is_listed
union
select google_place_id from public.prospect_location
  where google_place_id is not null and is_published and converted_at is null
```

**Cadência de 7 dias contra prazo de 30** dá quatro tentativas antes de o selo sumir da vitrine.
Falha da Places API grava `fetch_error` e **preserva** o snapshot bom: erro de rede não pode
apagar prova social.

Contrato, Places API (New):

```http
GET https://places.googleapis.com/v1/places/{place_id}?languageCode=pt-BR&regionCode=BR
X-Goog-Api-Key: <GOOGLE_PLACES_SERVER_KEY>
X-Goog-FieldMask: id,rating,userRatingCount,googleMapsUri,reviews
```

**A chave do projeto não serve.** A `VITE_GOOGLE_MAPS_API_KEY` é restrita por referrer e recusa
chamada de servidor com `API_KEY_HTTP_REFERRER_BLOCKED`, como o
[place-id-lote-mapeado.md](./place-id-lote-mapeado.md) documentou. Entra uma
`GOOGLE_PLACES_SERVER_KEY` separada, restrita por IP, guardada como secret do Supabase, que
nunca vai para o bundle. A restrição por referrer da chave do browser **não muda**.

### O HTML do SSG também é cache

O bloco precisa sair no HTML pré-renderizado (§8), e HTML publicado **é** uma cópia do conteúdo
do Google. A policy do §4 protege a leitura do banco e não alcança uma página que foi construída
há 40 dias e continua servida na borda. O limite de 30 dias vale para os dois.

Duas defesas, porque nenhuma sozinha fecha:

1. **O refresh dispara rebuild.** Ao terminar uma passada que mudou algum snapshot, a Edge chama
   o deploy hook do Cloudflare. Com refresh semanal, o HTML publicado fica na casa de 7 dias de
   idade, não de 30.
2. **O componente confere no cliente.** O payload do SSG carrega `fetched_at`, e o bloco não
   renderiza quando ele passou de 30 dias. Página velha se corrige sozinha para o usuário real,
   mesmo que o rebuild tenha falhado.

O crawler ainda pode pegar HTML velho entre um rebuild e outro, e é por isso que a defesa 1 é a
principal: reduzir a janela é o que resolve, o guard do cliente é rede.

## 6. Exibição

**Um payload, duas fontes.** A mescla acontece onde o dado é buscado, e não num hook: a ficha
carrega o snapshot no loader do SSG (§5), o card recebe a nota já anexada pela Edge `search`, e
o lote mapeado recebe pela RPC `destination_prospect_cards`. `ReviewsBlock` e `RatingBadge`
consomem o formato final e não sabem que existem duas tabelas.

Não há hook novo, e isso não é atalho: o bloco **precisa** sair no HTML pré-renderizado (§8), e
hook de cliente não põe nada no HTML. Um `useGooglePlaceSnapshot` renderizaria depois da
hidratação, ou seja, tarde demais para o crawler e para a dobra em 4G. A lógica compartilhada
mora em `src/features/reviews/google.logic.ts`, que é pura e testável.

**A avaliação é do estacionamento, nunca do tipo de vaga.** Já vale hoje: a busca consulta
`location_parking_type`, mas a nota vem do `location` no join, então um lote com coberto,
descoberto e valet mostra a mesma nota nos três cards. O snapshot segue igual, porque
`place_id` resolve para um lote.

| Superfície | Regra |
|---|---|
| Card de busca (`/search`) | **Um selo só.** Nota Movepark quando existe; a do Google quando não existe. Em 375px, dois selos viram ruído e nenhuma das notas é lida |
| Página de destino (`/destinos/<slug>`) | Reusa o card, mesma regra. Inclui as fichas de `prospect_location` |
| Ficha da unidade (`/p/<slug>`) | Tem espaço: mostra **as duas**, rotuladas, com o bloco do Google abaixo do Movepark |
| Ficha do lote mapeado | Só o do Google, que é o único que existe |

**Moderação é tudo ou nada, por unidade.** O único liga e desliga é do `hub_admin`, e vale para
o bloco inteiro daquele lote. Não existe esconder avaliação individual do Google. Se der para
tirar a nota 1 e manter as cinco estrelas, não é exibir o Google, é fabricar prova social com o
nome dele.

O controle é a coluna `google_place_snapshot.is_hidden`, que entra na policy de leitura junto do
TTL. Ela mora no snapshot e não na `location` porque a chave da tabela é o lugar, então esconder
por `place_id` já é esconder por unidade, sem coluna nova em duas tabelas.

Na primeira entrega o `hub_admin` liga e desliga por `update` direto (a policy de escrita já
permite). Tela no Manager fica para depois, e está em [§11](#11-fora-de-escopo): construir UI
antes de existir um caso real de uso é adivinhar o fluxo.

## 7. ADR-009: isso é fato da unidade, não promessa de transação

Reputação descreve o lugar e é verdade independente de onde a reserva fecha, igual a endereço,
foto e amenidade. Então o bloco do Google **renderiza sempre**, inclusive na unidade externa. É
por isso que ele resolve o buraco do ADR-009 sem furá-lo.

A linha "Avaliações e nota: não renderiza" da
[capacidades-unidade.md](./capacidades-unidade.md) continua correta para a avaliação Movepark, e
ganha uma linha nova para a do Google, atualizada no mesmo PR. `LocationCapabilities` não ganha
capacidade nova, porque não há promessa a declarar.

## 8. JSON-LD: não muda uma vírgula

A nota do Google **não** entra em `aggregateRating` nem em `review[]` do `productOfferSchema`, e
o bloco não recebe marcação nenhuma.

A [capacidades-unidade.md](./capacidades-unidade.md) já registra o incidente em que o
`aggregateRating` ficou sem gate enquanto o `review[]` tinha, produzindo schema com nota agregada
e nada por trás. Marcar avaliação do Google como nossa é a mesma armadilha, agora com risco de
ação manual em cima.

O ganho de citação por IA vem de o texto estar no HTML pré-renderizado do SSG, que os crawlers
de IA leem sem precisar de marcação.

## 9. Testes

| Camada | O que trava |
|---|---|
| pgTAP `google_place_snapshot.test.sql` | policy esconde snapshot com mais de 30 dias do `anon`; `hub_admin` escreve e `anon` não; purge apaga de fato; upsert por `place_id` substitui o conjunto inteiro |
| Deno `google-place-refresh/index.test.ts` | refresh sem header secreto é recusado; seleção pega só o que está sem snapshot ou com mais de 7 dias; erro da Places API grava `fetch_error` e preserva o snapshot bom |
| Vitest | merge das duas fontes no hook; atribuição renderiza autor, foto e link; card de busca escolhe um selo só, com prioridade Movepark; **regressão que falha se o `productOfferSchema` ganhar `aggregateRating` vindo do Google** |

## 10. Custo e operação

Cerca de 70 fichas com refresh semanal dão aproximadamente 300 chamadas por mês. O campo
`reviews` coloca o Place Details no SKU Enterprise, na casa de US$ 25 por mil chamadas, então o
custo fica perto de US$ 7,50 por mês.

A ordem de grandeza é irrelevante hoje e vira relevante se isso um dia rodar por pageview, que é
mais uma razão para o espelho existir em vez de consulta ao vivo.

## 11. Fora de escopo

- **Ranking e curadoria.** `sort=rating_desc`, `min_rating` e "Mais bem avaliados" continuam
  rodando só sobre `location.review_avg`. Misturar duas escalas no mesmo ordenamento é outra
  decisão, e não é esta.
- **Responder avaliação do Google pelo Hub.** Quem responde é o dono, no Google Meu Negócio.
- **Traduzir ou resumir o texto.** A regra de atribuição não permite.
- **Fotos do Places.** Outro campo, outro SKU, outra regra de cache.
- **Tela de moderação no Manager.** O `is_hidden` existe e o `hub_admin` liga e desliga por
  `update`. A tela entra quando aparecer o primeiro caso real, não antes.
