# Lote mapeado: `prospect_location` (E0.17)

> **Épico:** [E0.17](https://app.clickup.com/t/86ajyp580) · **Fase:** 0 · **Depende de:** E0.15 (capacidades / ADR-009)
> **Q/D:** [Q-021](https://app.clickup.com/t/86ajyp5pu) telefone **decidido em 11/08/2026: guardar, não exibir** · [Q-022](https://app.clickup.com/t/86ajz8n1j) **decidido → ADR-010** · [D-009](https://app.clickup.com/t/86ajyp5w7) deduplicação
> **ADR:** ADR-010 (lote não-parceiro não vive na tabela transacional)
> **Status:** especificado em 10/08/2026. **a, b, c, d, e, f no ar** e **g na versão curta** (referência + carimbo), tudo em 11/08/2026, com Q-021 decidido. Em 13/08/2026 entrou o **h** (painel) e o **301 da ficha convertida**, que era a parte da **i** que não estava adiada por decisão, só à espera de existir conversão. Falta da **i** só a prova de titularidade (HMAC + OTP), adiada enquanto a aprovação humana no board for o portão.
> **Case de referência:** Talentos Park, Recife. Todo exemplo aqui usa dados reais dele.

Este arquivo é **autossuficiente**: quem for implementar não precisa abrir o ClickUp nem `gestao/`. O ClickUp serve só para saber qual atividade puxar e em que ordem.

## Atividades

| ID | Atividade | Seção aqui | ClickUp |
|---|---|---|---|
| E0.17-a | ✅ Criar a tabela `prospect_location` | [§ A tabela](#a-tabela) | [86ajyp71u](https://app.clickup.com/t/86ajyp71u) |
| E0.17-b | ✅ Higienizar os registros obsoletos em `location` | [§ Higiene do legado](#higiene-dos-registros-legados-e017-b) | [86ajyp7bj](https://app.clickup.com/t/86ajyp7bj) |
| E0.17-c | ✅ Cadastrar o Talentos Park como case-piloto | [§ O cadastro](#o-cadastro-com-o-talentos-park-e017-c) | [86ajyp7xu](https://app.clickup.com/t/86ajyp7xu) |
| E0.17-d | ✅ Cards do lote mapeado na página de destino | [§ Página de destino](#página-de-destino-e017-d) | [86ajyp87t](https://app.clickup.com/t/86ajyp87t) |
| E0.17-e | ✅ Single sem caminho para reserva | [§ Single](#single-e017-e) | [86ajyp8jn](https://app.clickup.com/t/86ajyp8jn) |
| E0.17-f | ✅ JSON-LD `ParkingFacility` | [§ JSON-LD](#json-ld-e017-f) | [86ajyp8u6](https://app.clickup.com/t/86ajyp8u6) |
| E0.17-g | 🟡 Conversão da reivindicação (referência + carimbo; falta o OTP) | [§ Conversão](#conversão-e017-g) | [86ajyp96d](https://app.clickup.com/t/86ajyp96d) |
| E0.17-h | ✅ Painel administrativo | [§ Painel](#painel-administrativo-e017-h) | [86ajz8mvz](https://app.clickup.com/t/86ajz8mvz) |
| E0.17-i | 🟡 301 da ficha convertida no ar; HMAC + OTP adiados | [§ Conversão](#conversão-e017-g) | [86ajzdx41](https://app.clickup.com/t/86ajzdx41) |

**a** destrava **c**, **g** e **h**; **c** destrava **d**, **e** e **f**. A **b** é independente. Q-021 foi decidido em 11/08/2026, então a **e** não está mais bloqueada.

## Por quê

Em 06/08/2026 o WordPress publicou **41 páginas de estacionamento que não são parceiros**, só para posicionamento orgânico. Elas rankeiam, e o WordPress vai ser desligado no cutover.

Hoje o Hub tem 29 unidades e o WordPress tem 41. **O site que vai morrer cobre mais mercado que o que vai ficar.** Sem este épico o cutover perde 41 URLs e a cobertura de Recife, Confins, Galeão, Santos Dumont e Navegantes inteira.

---

## 🔒 ADR-010 — lote não-parceiro não vive na tabela transacional

> Estacionamento que a Movepark mapeou e que não tem contrato mora em **`prospect_location`**, nunca em `company` + `location`. A tabela não tem preço, tipo de vaga, `checkout_mode`, `is_listed` nem recebedor: **o estado impossível é impossível por ausência de coluna, não por trigger.** Ele só entra em `location` pela conversão.

### A medição que decidiu

A primeira versão desta spec propunha reusar `company` + `location` com um estágio `prospect` no enum e um trigger de guarda. Foi descartada no mesmo dia depois de medir o acoplamento:

| Medição | Número |
|---|---|
| Funções que fazem `from public.location` | **52** |
| Dessas, quantas filtram `is_listed` | **2** |
| Que **não** filtram | **50** |
| Funções que mencionam `location` | 93 de 211 |
| Policies tocando `location`/`company` | 42 de 135 |
| Tabelas com FK para `location` | 11, incluindo **`booking`** |
| Tabelas com FK para `company` | 17, incluindo **`payout_recipient`**, `company_payout_account`, `payout_withdrawal` |

O trigger protegia `checkout_mode` e `is_listed` — duas colunas — e deixava 50 funções descobertas, sem impedir que `booking.location_id` apontasse para lote sem contrato. Regra que não precisa existir é melhor que regra bem testada.

**Ganho secundário:** criar uma unidade hoje exige empresa → unidade → tipo de vaga, três entidades e 64 colunas para guardar ~10 fatos sobre um lote que só aparece numa página de destino.

---

## A tabela

**(E0.17-a)** · ✅ no ar em 11/08/2026. Migration `20261008000000_prospect_location.sql`, pgTAP `supabase/tests/prospect_location.test.sql`, tipo curado `ProspectLocation` em `src/types/domain.ts`.

```sql
create table prospect_location (
  id                    uuid primary key default gen_random_uuid(),
  destination_id        uuid not null references destination(id) on delete restrict,
  name                  text not null,
  slug                  text not null unique,
  address               text,
  phone                 text,
  latitude              numeric not null,
  longitude             numeric not null,
  geog                  geography(Point,4326)
                          generated always as
                          (st_setsrid(st_makepoint(longitude, latitude), 4326)::geography) stored,
  google_place_id       text unique,
  google_maps_url       text,
  amenities             jsonb not null default '[]'::jsonb,
  description           text,
  data_source           text not null default 'manual'
                          check (data_source in ('manual','google_places','import_wp')),
  is_published          boolean not null default false,
  notified_owner_at     timestamptz,
  last_reviewed_at      timestamptz,
  converted_location_id uuid references location(id) on delete set null,
  converted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on prospect_location using gist (geog);
create index on prospect_location (destination_id) where is_published;
create unique index on prospect_location (converted_location_id)
  where converted_location_id is not null;
```

~18 colunas contra as 64 de `company` + `location`.

**RLS:** leitura pública só com `is_published = true and converted_at is null`. Escrita só `is_hub_admin()`. **Não existe papel de parceiro aqui** — enquanto a ficha é mapeada, ninguém de fora edita.

### As três colunas que carregam o desenho

- **`is_published`** — o liga/desliga de exibição na página de destino. Nasce `false` de propósito: cadastro entra rascunho e só aparece depois de revisado. Publicar um lote com dado errado queima o contato comercial antes da primeira conversa.
- **`converted_location_id` + `converted_at`** — a procedência, gravada **na tabela enxuta** para `location` não engordar. Responde num `select` a pergunta que vai ser feita em toda reunião: quantos dos mapeados viraram parceiro.
- **`google_place_id` unique** — a chave de deduplicação (ver [§ Deduplicação](#deduplicação-d-009)), e o único campo do Places que pode ser armazenado indefinidamente.

### O que a tabela NÃO tem, e é o ponto

`checkout_mode`, `is_listed`, `take_rate_bps`, preço, tipo de vaga, recebedor, `is_24h`, FK de `booking`, FK de `review`, FK de `payout_*`.

Isto é impossível de escrever, não apenas proibido:

```sql
update prospect_location set checkout_mode = 'hub' where ...;
-- ERROR: column "checkout_mode" does not exist
```

E `booking.location_id` não tem como apontar para um lote mapeado, porque a FK aponta para `location` e o registro não está lá.

### Notas de implementação

- `geog` é **generated stored**, igual à de `location`. O índice GiST é o que mantém o **ADR-001** valendo: distância ao terminal continua sendo `ST_Distance` em tempo de consulta, nunca coluna.
- `destination_id` é `NOT NULL`, mas dá para sugerir o valor com a função **`nearest_destination()`** que já existe, a partir de lat/long — mesmo espírito do trigger `location_set_destination`. Preencher destino à mão em dezenas de lotes é onde entra erro.
- **Nunca** adicionar FK de `booking`, `review`, `fare` ou `payout_*` apontando para cá. Quem precisar disso converte primeiro. É a regra inteira.
- **Regra de crescimento:** a tabela tem que resistir a engordar. Campo novo só entra se aparecer na página de destino. Se alguém pedir horário, tem que vir **nullable** — em `location`, `is_24h` é `NOT NULL DEFAULT true`, e emitir schema a partir dele faria o Hub afirmar ao Google um horário que ninguém verificou.
- O `slug` é unique nesta tabela, mas **precisa ser unique também contra `location.slug`** (ver [§ Single](#single-e017-e)).

### O que a entrega tem além do DDL

Três guardas que o SQL acima não trazia escritas, e que a implementação fechou:

- **`prospect_location_guard_slug_trg`** (BEFORE INSERT OR UPDATE OF slug) recusa slug que já pertence a uma `location` **viva**. Postgres não tem unique entre tabelas, e slug repetido não dá erro em lugar nenhum: ele some a ficha, e some justamente a URL que tinha ranking. Só conta `location` com `deleted_at is null`, de propósito: a higiene do legado (E0.17-b) vai aposentar lotes mortos que podem voltar como ficha mapeada **com a mesma URL**. Se a E0.17-b resolver por `status = 'inactive'` em vez de `deleted_at`, esses slugs continuam bloqueados, e aí a decisão dela vira decisão daqui.
- **`prospect_location_set_destination_trg`** (BEFORE INSERT) preenche o `destination_id` pelo `nearest_destination()` quando vier nulo, igual ao trigger de `location`. Sem destino publicado por perto o insert falha (`23502`), que é o certo: ficha órfã não tem página onde aparecer. Conferido no banco vivo com a geo do Talentos Park: sugeriu **REC** e deu **1.012 m** até o terminal, o número da spec.
- **`prospect_location_converted_pair_check`**: apontar `converted_location_id` sem carimbar `converted_at` é recusado. É o `converted_at is null` que tira a ficha da página de destino, então meia-conversão deixaria a ficha e a unidade nova disputando a mesma busca. A implicação é de mão única porque o `on delete set null` pode zerar a FK de uma ficha já convertida, e aí só o carimbo sobrevive.

A RLS de leitura ficou `(is_published and converted_at is null) or is_hub_admin()`: o filtro de convertida mora na **policy**, não só na query, e o `hub_admin` enxerga rascunho e convertida pela segunda condição, que é o que o painel do E0.17-h precisa.

---

## O cadastro, com o Talentos Park

**(E0.17-c)**

Fonte: `https://maps.google.com/?cid=4598899734266939223`

```sql
insert into prospect_location (
  destination_id, name, slug, latitude, longitude,
  google_maps_url, data_source, is_published
) values (
  'ee60459f-0a19-4177-8d3b-c121c899939f',   -- REC
  'Talentos Park',
  'talentos-park-aeroporto-recife',
  -8.1309368, -34.9156297,
  'https://maps.google.com/?cid=4598899734266939223',
  'google_places',
  false
);
```

Uma linha, uma tabela.

**A preencher, não chutar:** `address`, `phone` e `google_place_id` saem da Places API ou de verificação humana. Deixar `null` é informação; preencher errado é dívida.

### O que ficou gravado (11/08/2026)

Resolvido na Places API (Text Search, viés de 2 km na geo acima), não chutado. Migration `20261010000000_prospect_location_pilot_recife.sql`.

| Campo | Valor | Nota |
|---|---|---|
| `google_place_id` | `ChIJyRH1jmMfqwcRV4eeOvGS0j8` | chave de dedup (D-009) |
| `address` | R. Projetada, 169 - Boa Viagem, Recife - PE, 51150-650 | sem o sufixo "Brasil", igual ao formato de `location.address` |
| `phone` | `+5581986929632` | E.164, **guardado e não exibido** (Q-021) |
| `name` | Talentos Park | e não o "Talentos Park Aeroporto - Estacionamento" do Google: nome de exibição é copy nossa |
| `is_published` | `false` | publica na E0.17-d, quando existir seção onde aparecer |
| `description` | `null` | texto factual escrito por nós, ainda a fazer |

O CID devolvido pela API bate com o da spec (`4598899734266939223`), o que confirma que é o mesmo lugar. `businessStatus` veio `OPERATIONAL`, então o lote não fechou (o que não vale para boa parte dos 41 do WordPress). Distância medida com o `geog`: **1.012 m** até o REC, o número que a spec previa.

**Por que um piloto:** carregar em volume sem ter validado um é como a Movepark descobre, em produção, que faltou um campo. Se o Talentos Park renderiza certo na página de Recife e não tem nenhum caminho para reserva, o resto é repetição.

Recife é o destino certo para o piloto: acabou de ser criado e tem **zero** unidades vendáveis, então não há parceiro para canibalizar.

### Notas de implementação

- `geog` é coluna gerada. Não tentar inserir.
- São **1.012 m** até o terminal do REC. Esse número **não vai para o banco**.
- O **CID** (`4598899734266939223`) fica em `google_maps_url` porque é estável e não expira. O `google_place_id` continua sendo o campo canônico de deduplicação.
- `is_published` nasce `false`. Não pular a revisão só porque é um registro só: o hábito é o que protege quando forem dezenas.
- ⚠️ **Nunca mapear lote em Viracopos.** Vale zero e ofende o dono de ~80% da receita da empresa.

---

## Fotos e conteúdo

**Nenhuma foto do lote.** Três razões, na ordem de peso:

1. **Comercial.** Foto do pátio dele numa página que não vende é o que transforma "exposição grátis" em "tira meu nome do ar". A Aerovalet sozinha tem 3 lotes na base; esses donos se falam.
2. **Google Places.** Conteúdo do Places não pode ser pré-buscado, cacheado nem armazenado. A exceção única é o `place_id`. Foto do Places precisa ser renderizada via API a cada request, com atribuição do autor, o que não indexa e não escala.
3. **Lei 9.610/98.** O titular da foto do site dele é a pessoa para quem vamos ligar.

**No lugar:** mapa estático (licenciado para exibição), diagrama de distância ao terminal a partir do `geog`, e a hero do destino, que é ativo próprio. Google não precisa de foto do pátio para rankear. Foto é conversão, e conversão é o que a ficha mapeada não tem. **Foto é o presente de quem reivindica.**

⚠️ **Risco maior que o das fotos, e já ativo no WordPress:** as descrições parecem copiadas do marketing do próprio lote ("A Aero Park Locadora é uma empresa preocupada com a mobilidade dos seus clientes..."). Cópia de obra protegida **e** duplicate content. A `description` tem que ser **escrita por nós**, em texto factual.

---

## Página de destino

**(E0.17-d)** · ✅ no ar em 11/08/2026. É aqui que mora o custo de ter duas tabelas, e é a atividade que paga esse custo uma vez só.

> ### O que mudou na execução: não deu para fazer o `union all`
>
> A spec pedia **uma** RPC com `union all` e um discriminador `kind`, para o front consumir uma lista só. Foi descartado ao encostar no código: **o lado vendável desta página não é um `select from location`**. É a Edge `search`, que devolve preço calculado na janela, disponibilidade, comodidades, nota e os selos de vantagem. Um `union all` em SQL teria que largar tudo isso para caber na mesma linha do lado mapeado, que não tem preço nenhum.
>
> O que a RPC única compraria era um fetch a menos. O que ela custaria era o preço sumir do card do parceiro que paga 20%. Ficaram duas leituras, e o custo é pequeno porque as duas seções já são separadas na tela, paginam separado e ordenam por critérios diferentes, que é o que a própria spec exige logo abaixo.
>
> Entregue: **`destination_prospect_cards(p_destination_slug)`** (`20261012000000`), `SECURITY INVOKER` de propósito. Definer contornaria o grant de coluna e devolveria o telefone sem querer, que é justamente o que Q-021 fechou. A distância sai de `ST_Distance` sobre `geog`, com o terminal como referência quando o destino tem `destination_point` cadastrado e o centro do destino quando não tem: em aeroporto de um terminal só (todos, menos GRU) a geo do destino **é** a do terminal.
>
> **Os cards saem no HTML do build.** O `loader` da rota chama a RPC, então o selo "Sem reserva online" está no HTML pré-renderizado e não depende do JS rodar. Conferido no `dist`: o selo, o nome, o endereço e a linha de apoio estão lá, e o telefone não aparece em lugar nenhum do build.

O desenho original, mantido aqui como registro:

```sql
create or replace function destination_cards(p_destination_slug text)
returns table (
  kind text,            -- 'bookable' | 'prospect'
  id uuid,
  name text,
  slug text,
  distance_m numeric,   -- ST_Distance, nunca coluna (ADR-001)
  ...
)
-- select 'bookable', ... from location
--   where is_listed and destination_id = d.id and deleted_at is null
-- union all
-- select 'prospect', ... from prospect_location
--   where is_published and converted_at is null and destination_id = d.id
```

O front renderiza **duas seções**, não uma lista misturada:

1. **"Com reserva pela Movepark"** — `kind = 'bookable'`, ordenação atual, cards completos com preço.
2. **"Outros estacionamentos na região"** — `kind = 'prospect'`, card menor, selo **"Sem reserva online"**, sem preço, sem badge de vantagem.

A busca geral (home, resultados, disponibilidade) continua lendo **só `location`** e não muda em nada.

**Por quê:** o parceiro que paga 20% vai olhar essa página e perguntar por que está ao lado de quem não paga nada. A separação e a ordem são a resposta, e são literalmente o produto que ele compra — presença é de graça, conversão é paga. E cada clique que um card mapeado rouba de um parceiro ativo no mesmo aeroporto é GMV que já era nosso, trocado por nada.

### Notas de implementação

- **Não paginar as duas seções juntas.** A proporção varia demais: em Confins vão ser 7 mapeados e 0 vendáveis, em GRU o inverso.
- **`is_popular` só ordena dentro da seção 1.** Não existe em `prospect_location` e não deve ser inventado.
- Filtrar `converted_at is null` **sempre**: ficha convertida virou `location` e apareceria duas vezes.
- A distância vem de `ST_Distance` sobre `geog` nas duas fontes, **com o mesmo formato de exibição** — senão o card mapeado parece de outro sistema.
- Selo "Sem reserva online" é **texto no HTML**, não tooltip. Precisa estar lá para o crawler ler.
- A regra de não canibalizar vale para **link interno** também: não construir link de card vendável para card mapeado no mesmo aeroporto.
- **Estado vazio da seção 1 é o caso normal em destino novo**, não exceção — vale para REC, NVT, CNF, GIG e SDU. O texto de topo precisa funcionar assim: *"Ainda não temos reserva online no Recife. Estes são os estacionamentos que mapeamos na região."*

---

## Single

**(E0.17-e)** · Q-021 **decidido em 11/08/2026: o telefone é guardado e não exibido.** Destravada.

> **Q-021.** O número entra no banco porque é a prova de titularidade mais barata que existe para a reivindicação (E0.17-g é OTP no telefone mapeado), e não aparece na página nem no JSON-LD, pela mesma razão que a single não linka o site do lote: quem liga direto vira cliente dele de graça, e a venda dos 20% morre ali.
>
> A decisão virou **permissão, não layout**: a migration `20261009000000_prospect_location_public_columns.sql` revoga o `select` da tabela e concede só as colunas que a página de destino renderiza. A RLS devolve a linha inteira da ficha publicada, então sem esse corte um `select=*` com a anon key leria o telefone que a tela não mostra. RLS corta por linha; coluna é grant. Exibir passa a exigir decisão nova, não um `select` a mais.
>
> Efeito colateral aceito: `authenticated` cai junto, porque grant de coluna não separa `hub_admin` de cliente logado. O painel do E0.17-h lê o telefone por RPC `SECURITY DEFINER`, no molde de `manager_external_exit_clicks`.
>
> **Atualização (avaliações do Google, `20261024093000_prospect_cards_google_rating.sql`).** Essa migration reabriu uma fresta no grant fechado acima: `select (google_place_id)` voltou para `anon` e `authenticated`. O motivo é técnico, não uma mudança de decisão. `destination_prospect_cards` continua `SECURITY INVOKER` de propósito (virar `definer` contornaria o grant de coluna e devolveria o telefone sem querer), e função invoker cobra do chamador o privilégio de coluna mesmo quando a coluna só aparece na condição do join, que é como a RPC encontra o snapshot de avaliação (`google_place_snapshot.place_id = p.google_place_id`). Sem o grant, a nota do Google simplesmente não carregava para quem não está logado como `hub_admin`. O telefone segue fora do grant, então o propósito de Q-021 (esconder o telefone) continua intacto. A exposição de fato é **nula hoje**: o `google_maps_url` que a página já mostra embute o mesmo place_id, em texto claro, no formato `?q=place_id:ChIJ...`, então liberar a coluna não entrega ao cliente nada que ele já não lesse no link do mapa. Essa equivalência é convenção de dado, não garantia estrutural: o piloto de Recife (`20261010000000_prospect_location_pilot_recife.sql`) gravou o `google_maps_url` originalmente no formato CID (`?cid=...`), e as linhas foram reescritas para place_id depois. Se algum dia o `google_maps_url` voltar a usar CID, o grant de `google_place_id` passa a ser uma divulgação nova de verdade, e cabe reabrir a decisão, não presumir que continua nula.

Rota `/estacionamentos/{destino}/{slug}` resolve **`location` primeiro**, depois `prospect_location` com `is_published` e `converted_at is null`.

Com o ADR-010 a página fica quase trivial: **não existe caminho de reserva para esconder, porque não existe dado de reserva.** O que a página tem:

- Nome, endereço, mapa estático, distância ao terminal calculada do `geog`.
- `"Preço: não informado. Este estacionamento ainda não publica tarifas na Movepark."`
- **CTA primário:** "Quero reservar aqui, me avise quando abrir" (captura e-mail/WhatsApp).
- **CTA secundário:** "É o administrador? Reivindique esta página" — bloco próprio, com botão.
- Telefone: **não entra na página** (Q-021). Ele existe no banco e é ilegível para a anon key.

**Proibido:** botão de reserva, seletor de datas, widget de WhatsApp de reserva, e **link para o site ou o motor de reserva do lote**.

### O que ficou no ar (11/08/2026)

Rota **`/estacionamentos/:destino/:slug`**, pré-renderizada (`getStaticPaths` sobre as fichas publicadas e não convertidas), em [`src/routes/estacionamento-mapeado.tsx`](../../src/routes/estacionamento-mapeado.tsx). Entra no **sitemap** junto: sem isso a página dependeria só do link interno da página de destino. O card da seção de baixo passou a linkar para cá, e é o único link que ele tem: sem link interno a página nasce órfã, e é ela que carrega o JSON-LD e a reivindicação.

Duas decisões que a spec deixou em aberto e a execução teve de fechar:

- **O "me avise quando abrir" NÃO pede e-mail nem telefone.** A spec pede captura de contato e, três linhas depois, manda gravar só evento em GA4/Posthog, "não em tabela nova". As duas coisas não cabem juntas: pedir contato para descartar é coletar PII sem finalidade nem guarda. Ficou o clique como sinal (`prospect_demand_signal` no dataLayer, via `src/lib/analytics.ts`) e a confirmação não promete avisar ninguém, porque não temos como. O campo de contato entra junto com a tabela, no dia em que o volume justificar.
- **A reivindicação leva a `/seja-parceiro`, não a um link assinado.** O fluxo com HMAC e OTP é a E0.17-g, que ainda não existe. A spec é explícita: "não deixar o botão levar a um beco". Enquanto o caminho verificado não existe, o botão leva ao caminho real que existe, e dispara `prospect_claim_intent`.

O **301 da ficha convertida ficou para a E0.17-g**, e não é adiamento: hoje não existe conversão, então não existe `location` para onde redirecionar. Enquanto isso, ficha convertida simplesmente deixa de ser gerada (a RPC filtra `converted_at is null`), e quem cria o redirect é quem cria a conversão.

**Por que não linkar o canal dele:** no dia em que ele abre o Analytics e vê referral da Movepark, já está recebendo de graça exatamente o que íamos cobrar 20%. A venda morre ali.

**Por que não deixar o widget de reserva:** hoje, no WordPress, a página do não-parceiro tem um *"Olá! Gostaria de fazer uma reserva?"* flutuante sobre um lote onde não existe reserva. Cliente pede, ninguém entrega. Isso é CDC art. 30/31 e é pogo-stick puro na SERP.

O produto desta página não é a reserva, é **prova de demanda**: em 60 dias dá para chegar no dono com *"sua página teve N visitas e M pessoas pediram para reservar aqui, e você converteu zero porque não está listado"*.

### Notas de implementação

- **Colisão de slug entre as duas tabelas é possível e precisa ser impedida na origem.** Resolver `location` primeiro na rota, e garantir unicidade cruzada na hora de gerar o slug do prospect (checar contra `location.slug` antes de gravar).
- **Teste de componente é entregável:** renderizar a single de um `prospect_location` e afirmar que não existe nenhum elemento com ação de reserva na árvore. É o que impede alguém de reintroduzir o botão numa refatoração de layout.
- O "me avise quando abrir" grava **evento em GA4/Posthog**, não em tabela nova. É instrumentação, não mecanismo. Vira tabela se provar valor.
- Mapa estático do Google é licenciado para exibição; foto do Places **não pode ser cacheada nem re-hospedada**. Não confundir os dois.
- **Nada de FAQ da unidade nesta página:** `faq.location_id` aponta para `location` e não existe para prospect. É por desenho, não é falta. Desde ago/2026 a página mostra o **FAQ do aeroporto** (escopo `destination`, via loader + `get-faq`): traslado, segurança e gabarito são fato do destino e não prometem transação deste lote. A `global` fica fora, porque fala de reserva pela Movepark.
- Se `converted_at` não for nulo: **301 para a `location` que nasceu dela.** A URL antiga é justamente a que tinha ranking, e é o motivo de todo este épico existir.

---

## JSON-LD

**(E0.17-f)**

`ParkingFacility` (subtipo de `LocalBusiness`) na single, servindo as duas fontes:

- Sempre: `name`, `address` (PostalAddress), `geo` (GeoCoordinates), `url`, `amenityFeature`.
- `telephone`: **não sai em prospect** (Q-021: guardado, não exibido); em parceiro também não entra (lá o caminho é a reserva).
- `openingHoursSpecification`: **não sai em prospect**, porque não existe campo de horário na tabela. É proposital.
- `aggregateRating`: só com avaliação real. Não existe em prospect.
- **`Offer` / `priceRange`: nunca em prospect.** `Offer` é promessa, e ADR-009 vale para dado estruturado também.

**Por quê:** a página no ar hoje no WordPress emite só `WebPage` e `ImageObject` do Yoast. Nenhum `LocalBusiness`, nenhum endereço estruturado, nenhum `geo`. **Isto é ganho líquido sobre o que existe**, não paridade. E é o item de maior peso em GEO: LLM cita a fonte que tem dado estruturado.

```jsonc
{
  "@context": "https://schema.org",
  "@type": "ParkingFacility",
  "name": "Talentos Park",
  "geo": { "@type": "GeoCoordinates",
           "latitude": -8.1309368, "longitude": -34.9156297 },
  "address": { "@type": "PostalAddress", "addressLocality": "Recife",
               "addressRegion": "PE", "addressCountry": "BR" }
  // sem "offers"            → não vende
  // sem "openingHours"      → o campo nem existe na tabela
  // sem "aggregateRating"   → não há avaliação
}
```

### Notas de implementação

- A geração é **no build** (SSG/prerender do E0.4), então o dado precisa estar no banco antes do deploy.
- Corrigir junto o **canonical duplicado** que existe hoje nas páginas do WordPress (duas tags `<link rel="canonical">` na mesma página). Não repetir isso no Hub.
- Validar no Rich Results Test **e** buscando a página com user-agent de retrieval bot.
- O `robots.txt` do Hub já libera `OAI-SearchBot`, `PerplexityBot` e `Claude-Web` e bloqueia treinamento (`Google-Extended`, `CCBot`, `Bytespider`). **Manter essa config no cutover, removendo só o `noindex`** — ver `seo-indexacao.md`.

---

## Conversão

**(E0.17-g)**

Link assinado na single: `/parceiro/onboarding?claim=<prospect_location_id>&sig=<hmac>`

1. Valida a assinatura, resolve o `prospect_location` e **pré-preenche** o wizard com nome, endereço, telefone e coordenadas.
2. **Prova de titularidade: OTP no telefone mapeado**, reusando a tabela `identifier_otp` que já existe.
3. `convert_prospect_location(p_prospect_id, ...)`, transacional:
   - cria `company` em `onboarding_status = 'pending_review'`
   - cria `location` copiando os campos, **sem `location_parking_type` e com `is_listed = false`**
   - grava `converted_location_id` e `converted_at` na ficha mapeada
   - cria a linha em `company_onboarding` (a PK é `company_id`, e ela **é** o vínculo — não existe tabela de claim)
4. Daí em diante é o wizard do **E1.9**, sem desvio, sem tela especial.
5. A ficha mapeada **não é apagada**: some da página de destino pelo filtro `converted_at is null`, e a URL antiga faz 301.

**Por quê:** a conversão explícita é melhor que um `update status` porque força decidir, uma vez e por escrito, quais campos migram do dado que a Movepark levantou para o dado que o parceiro passa a ser dono. Um update arrastaria tudo, inclusive o que foi chute nosso.

### O que entrou em 11/08/2026 (versão curta), e o que ficou

Decidido com o time: o link assinado com HMAC e o OTP no telefone **ficam para quando o volume tornar a triagem manual cara**. O valor deles é impedir que o concorrente reivindique o lote alheio, e com aprovação humana no board isso é defesa em profundidade, não o único portão. Não existe `convert_prospect_location()` transacional: o estacionamento passa pelo funil inteiro do mesmo jeito.

O que **não** dava para adiar é o carimbo da procedência, e é ele que entrou (migration `20261014000000`):

- **`company_onboarding.prospect_location_id`** (`on delete set null`, para excluir a ficha seguir sendo delete de verdade). Mora aqui, e não em `partner_lead`, porque quem cria empresa é o `submit_partner_lead`, e ele grava contato, cidade e UTM nesta tabela.
- **A referência é validada, não confiada.** Chega de um parâmetro de URL, então uuid inventado ou de ficha já convertida é descartado, e o lead entra assim mesmo: perder atribuição é aceitável, recusar um parceiro real por causa de um parâmetro não é.
- **O carimbo entra no `onboarding_upsert_location`**, o único ponto onde existe um `location.id` para apontar. Só no ramo de INSERT e só uma vez, então a ficha converte para a **primeira** unidade criada e a segunda não rouba o vínculo. Converter continua não publicando oferta: a unidade nasce inativa e sem tipo de vaga.
- **O `?lote=` no "Seja parceiro"** preenche o nome que a Places API já resolveu e mostra de qual página a pessoa veio. Só preenche o que está vazio: quem digitou manda mais que a URL.

Sem esse carimbo, a ficha mapeada e a unidade nova passariam a renderizar as duas, disputando a mesma busca. É o estado que o filtro `converted_at is null` da RLS foi feito para impedir, e ele só vale se alguém escrever o carimbo.

**Sobre o OTP:** sem ele, qualquer um reivindica o lote do concorrente. Em aeroporto, onde 6 ou 7 lotes disputam a mesma vaga de SERP, isso não é risco teórico. O telefone que já está na ficha é a prova mais barata que existe. Não substitui a aprovação humana, que continua no board.

### O 301 da ficha convertida (E0.17-i), no ar em 13/08/2026

O adiamento do 301 tinha uma razão que deixou de valer: *"hoje não existe conversão, então não existe `location`
para onde redirecionar"*. A **g** passou a carimbar `converted_at`, então a ficha convertida virou estado
alcançável, e o que sobrou foi um buraco pior que o adiamento sugeria.

**O que acontecia sem o redirecionamento.** Convertida, a ficha some da RPC de cards, deixa de ser gerada pelo
`getStaticPaths` e sai do sitemap. O `wrangler.jsonc` tem `not_found_handling: "single-page-application"`, então
a URL que rankeava passa a responder **200 com o shell vazio da SPA**. Isso é soft 404: pior que 404, porque o
Google registra uma página viva e sem conteúdo, e muito pior que redirecionar. E existe uma segunda janela, entre
a conversão e o deploy seguinte, em que o HTML antigo continua no ar **renderizado inteiro**, dizendo que o lote
não tem reserva quando ele já é parceiro. Só o Worker cobre essa janela, porque ele roda antes dos assets
(`run_worker_first: true`).

**Como ficou.** RPC `prospect_redirect_target(destino, slug)` e um ramo novo no
[`src/worker.ts`](../../src/worker.ts), logo depois do `blogRedirect` e **antes** da negociação de Markdown, senão
um agente pedindo `Accept: text/markdown` receberia o `.md` velho em vez do redirecionamento.

| Situação da ficha | Resposta | Por quê |
|---|---|---|
| Não existe, ou não foi convertida | segue como hoje | a página é legítima, não há para onde mandar |
| Convertida, unidade já listada | **301** para `/p/<empresa>/<unidade>/<código>` | é o endereço definitivo, e é ele que herda o ranking |
| Convertida, unidade ainda não listada | **302** para `/destinos/<slug>` | converter não publica oferta: a unidade nasce inativa e sem tipo de vaga |

O 302 é a parte que não estava na spec e a execução teve de decidir. Cravar 301 para a página do destino
gravaria no cache do navegador e do Google um endereço de passagem, que muda assim que o parceiro publica, e 301
é justamente o que ninguém revisita. Enquanto a unidade não está listada, o redirecionamento é honestamente
temporário.

A função é `SECURITY DEFINER` e concedida a `anon` de propósito: quem consulta é o Worker, com a anon key, e a
RLS esconde ficha convertida justamente de quem tem essa chave. O que ela revela é só a URL pública da unidade
que nasceu dali. A consulta é **fail-open**: RPC fora do ar devolve `null` e o request segue, porque um
redirecionamento que não resolve não pode derrubar a página.

**O que continua adiado:** o link assinado com HMAC e o OTP no telefone mapeado. A decisão do time não mudou, e
a razão dela também não: com aprovação humana no board, a prova de titularidade é defesa em profundidade, não o
único portão.

### Notas de implementação

- HMAC com segredo de servidor **e validade**. Sem validade, o link vaza num grupo de WhatsApp e vira porta aberta.
- A função é `SECURITY DEFINER` e **idempotente**: chamar duas vezes com o mesmo `prospect_location` tem que falhar limpo, não criar duas companies. **Checar `converted_at is not null` na entrada** é mais barato que tratar a violação do índice unique.
- **Converter não publica oferta.** A `location` sobe quando houver tipo de vaga e preço, que é o wizard do E1.9.
- **Nunca copiar a `description` que a Movepark escreveu como se fosse do parceiro sem ele revisar** — o texto passa a ser responsabilidade dele.
- Se o telefone estiver vazio (é o caso do Talentos Park hoje), o claim precisa de caminho alternativo: e-mail no domínio do lote ou triagem manual. **Não deixar o botão levar a um beco** — sem forma de verificar, o CTA vira "fale com a gente".

---

## Painel administrativo

**(E0.17-h)**

Tela no admin, **separada de "Unidades"**, para não misturar inventário vendável com mapeamento. Reaproveita a casca que já existe (`admin_search`, `manager_*`) — é CRUD, não módulo novo.

**Lista**, filtrável por destino e por estado:

| Coluna | Nota |
|---|---|
| Nome / destino | |
| **Publicado** | toggle direto na linha, é a ação mais frequente |
| Endereço · telefone | vazio precisa ser **visualmente óbvio**, é o que trava a publicação |
| `google_place_id` | preenchido ou não |
| Dono notificado em | `notified_owner_at`, a campanha B2B |
| Revisado em | `last_reviewed_at` |
| Convertido | link para a `location` que nasceu dela |

**Ações:** criar, editar, publicar/despublicar, marcar como notificado, marcar como revisado, excluir. Sem aprovação em duas etapas — é dado nosso, não submissão de terceiro.

**Três estados que a lista precisa deixar na cara:** rascunho (`is_published = false`), publicado, e convertido (`converted_at` preenchido).

**Por quê:** sem tela, o cadastro vira SQL na mão, e aí ninguém que não seja dev consegue mapear um estacionamento, e o `is_published` de segurança vira letra morta porque quem insere já insere publicado. O mapeamento é feito **por aeroporto** e boa parte dos estacionamentos cadastrados em julho já fechou: isto não é carga única, é **curadoria recorrente**. Trabalho recorrente sem tela não acontece.

### Notas de implementação

- Ao criar, **sugerir o `destination_id` com `nearest_destination()`** a partir de lat/long.
- **Gate de publicação: não deixar publicar sem endereço.** Ficha sem endereço na página de destino é thin content e queima a credibilidade da seção inteira.
- **Avisar quando o `google_place_id` colidir com uma `location` existente** — é o caso de parceiro ativo, que não deve ser mapeado.
- **Ficha convertida entra em modo leitura.** Editar depois da conversão dessincroniza do que o parceiro já vê.
- Excluir é `delete` de verdade (não há FK de booking apontando para cá, e essa é a graça), mas **exigir confirmação**: a URL tinha ranking.

### O que ficou no ar (13/08/2026)

Rota **`/manager/lotes-mapeados`**, separada de Unidades como a spec pede, em
[`src/routes/manager/lotes-mapeados.tsx`](../../src/routes/manager/lotes-mapeados.tsx), com a feature em
`src/features/prospect-locations/`. Migration `20261017090000_manager_prospect_location.sql`, pgTAP
`prospect_location_admin.test.sql`.

> #### O que mudou na execução: a tela inteira fala por RPC, inclusive a escrita
>
> A spec dizia "reaproveita a casca que já existe, é CRUD, não módulo novo", e a leitura por RPC já estava
> prevista desde Q-021. O que a execução descobriu é que **a escrita também tem que vir para a RPC**, e não é
> preferência: o `.select()` que o supabase-js emite depois de um `insert`/`update` pede `RETURNING`, e
> `RETURNING` precisa de `select` nas colunas devolvidas. Como `20261009000000` revogou o `select` da tabela e
> reconcedeu 13 colunas, um `insert().select()` estouraria `42501` mesmo com a RLS liberando a escrita.
>
> O ganho de ter ido por ali: as três regras do painel deixaram de morar só na tela.

| Regra | Onde passou a viver |
|---|---|
| Publicar exige endereço | constraint `prospect_location_publish_needs_address`, mais a mensagem legível na RPC |
| Ficha convertida é somente leitura | `save`, `set_state` e `delete` recusam com `P0001` |
| Só `hub_admin` escreve | `is_hub_admin()` nas cinco, e **recusa** em vez de devolver vazio |

As cinco RPCs: `manager_prospect_locations` (lista com `state` derivado, distância e colisão de place_id),
`manager_prospect_location_precheck` (destino sugerido e avisos), `manager_prospect_location_save`,
`manager_prospect_location_set_state` (as ações de linha, tri-estado: `null` não mexe no campo) e
`manager_prospect_location_delete`.

Três decisões que a spec deixou em aberto e a execução teve de fechar:

- **O gate de publicação virou constraint, não regra na RPC.** A RPC também recusa, mas só para a tela receber
  uma frase em vez do texto do Postgres. Como constraint, o gate vale para qualquer caminho de escrita, e o
  `update is_published = true` na mão deixa de ser uma porta lateral.
- **Ações de linha não passam pelo formulário.** Publicar, marcar notificado e marcar revisado são o trabalho
  recorrente da curadoria; exigir abrir e reenviar o formulário inteiro para carimbar uma data é o tipo de
  atrito que faz o carimbo não acontecer.
- **A deduplicação (D-009) entrou como aviso, e a vizinhança entrou junto do place_id.** A spec pedia aviso de
  colisão de `google_place_id`, mas **nenhuma `location` tem place_id gravado hoje**, então o aviso sozinho
  nunca dispararia. O precheck avisa também quando existe estacionamento a menos de 150 m, que é o caso real.
  Aviso, nunca bloqueio: dois lotes vizinhos existem de verdade em aeroporto, e quem decide é quem mapeia.

---

## Higiene dos registros legados

**(E0.17-b)** · ✅ no ar em 11/08/2026, e a apuração mudou a premissa.

> ### Não era prospecção morta, era QA em produção
>
> A spec supunha registros de prospecção abandonados. O banco mostrou outra coisa: **os 11 são execuções do wizard de onboarding feitas pelo time**, todas com dono `leo.henrique+NN@fera.ag` ou `peu+...@fera.ag`, com o plus-address incrementando a cada rodada (+00, +11, +19, +44, +56, +77, +88, +109, +321) e `company_onboarding` preenchido.
>
> Duas consequências. Limpar é mais seguro do que a spec supunha, porque não há contato comercial real para queimar. E **`Max Park`, `Maxi Park` e `Maxxi Park` não são três grafias do mesmo lote**: são três rodadas de teste do mesmo dia (16/07), em três destinos diferentes (OPO, jardim-paulista, centro-sp). Confirmado com o time: o **Maxipark** de verdade é uma rede com várias unidades, incluindo uma em Guarulhos, e **não está no banco**. Ele é candidato a `prospect_location`, não a exclusão.
>
> **O que estava no ar por causa disso:** `Maxi Park`, uma rodada de QA, aparecia no catálogo público (`is_listed = true`, 1 foto, 3 tipos de vaga ativos, capacidade 208) ao lado de Abbapark, Aeropark, Aerovalet, Garageinn, Nationpark, Plenty e Virapark. O cenário que a spec descreve como risco futuro já era presente.
>
> **A regra aplicada, uniforme:** sem reserva vai para `deleted_at` (11 registros); com reserva vai para `status = 'inactive'`, nunca delete (só `Ferapark / Unidade Aeroporto`, 1 reserva). `is_listed = false` entra junto, para o registro não voltar publicado se alguém limpar o `deleted_at` para investigar. O soft delete também libera o slug para a ficha mapeada reusar a mesma URL no remapeamento.
>
> ### O que ficou de fora, e precisa de decisão
>
> A varredura achou **mais três empresas de QA listadas publicamente** que não constam da lista da spec. Não mexi nelas: são fixtures que alguém pode estar usando, e apagar quebraria roteiro de teste em uso.
>
> | Empresa | Dono | Reservas | Situação |
> |---|---|---|---|
> | `Motion Park` | `leo.henrique+123@fera.ag` | **65** | listada; claramente fixture ativa |
> | `Gaita Park` | `peu+gaita@fera.ag` | 1 | listada |
> | `Lisboa Park` | `leo.henrique+145@fera.ag` | 0 | listada |
>
> `Agência Fera` (fixture do E2E, 4 reservas) e `Peu Park` (já `inactive`) seguem intocadas, como a spec pede.
>
> Fica a pergunta para o time: quais dessas fixtures ainda são usadas? As que não forem entram na mesma regra. Enquanto isso, o catálogo público tem 18 unidades, e 4 delas são de teste.

**Isto NÃO é a migração dos lotes antigos para a tabela nova.** O remapeamento é feito por aeroporto, com base na lista do WordPress, porque boa parte desses estacionamentos já fechou. **O remapeamento não tem atividade e não deve ganhar uma.**

O que sobra é limpar os registros mortos que ficaram em `location`:

**Max Park · Maxxi Park · Vita Park · PER Park · Botuquara Park · Eco Park · Pare Park · Nine (Av. 9 de Julho) · Jaragua Park · Cow LAPA · Ferapark (Unidade Aeroporto)**

Para cada um: `deleted_at` (soft delete, que a tabela já suporta) ou `status = 'inactive'`. Decidir qual no PR e aplicar igual em todos.

**Por quê:** esses registros ficaram com `checkout_mode = 'hub'` sem contrato, sem recebedor e sem preço, por herança de default. Enquanto existirem assim, um `update is_listed = true` publica reserva de vaga que ninguém prometeu. A tabela nova resolve daqui para frente; ela não limpa o que já está lá. E qualquer relatório que conte unidades no Hub está somando estacionamentos que provavelmente nem existem mais.

### Notas de implementação

- **`Agência Fera` e `Peu Park` parecem cadastro interno de teste**, não prospecção. Não apagar junto sem confirmar.
- Conferir se alguma tem `location_parking_type` com preço configurado — se tiver, alguém começou a montar oferta ali e não é prospecção morta.
- Conferir se alguma tem `booking`. Se tiver, **não apagar**: é histórico financeiro. Aí é `status = 'inactive'`, nunca delete.
- **`Max Park` / `Maxxi Park` / `Maxi Park`:** três nomes quase idênticos, criados no mesmo dia, 1 location cada, e `Maxi Park` está com `is_listed = true`. Duas quase certamente são duplicata da terceira. **Não resolver por conta própria** — confirmar qual é a real.
- Migration versionada, não SQL solto no editor.

---

## Deduplicação (D-009)

**Em aberto.** Ao mapear por aeroporto com base na lista do WordPress, nada impede criar ficha de um estacionamento que **já é parceiro**: `aeropark-guarulhos`, `aerovalet-*`, `virapark-*`, `garage-inn-*`, `plenty-park` e `abba-park-*` estão na lista do WP **e** são clientes ativos hoje. Ficha fantasma competindo com a página do próprio parceiro pela mesma keyword.

Com o ADR-010 o risco diminuiu (não há como criar `company` duplicada de cliente real), mas duplicidade de conteúdo e de SERP continua.

Candidatas a chave, provavelmente em cascata:

1. **`google_place_id`** — canônico, já unique nesta tabela e existente em `location`. Custa chamada de API para resolver.
2. **Proximidade** — `ST_DWithin` sobre `geog` com raio de 50 a 100 m + similaridade de nome. Pega os casos sem place_id, mas dois lotes vizinhos existem de verdade em aeroporto.
3. **Slug do WordPress** — torna a carga repetível, não detecta unidade já na base com outro nome.

**Encaminhamento provável:** as três em cascata, com **aviso na tela do admin** em vez de decisão automática. Colidiu com parceiro ativo, não mapeia.

---

## O que este épico NÃO entrega

- **O mapeamento em massa dos 41.** Feito por aeroporto, com base na lista do WordPress. **Não tem atividade e não deve ganhar uma.**
- **Tabela de sinal de demanda.** O "me avise quando abrir" grava evento em GA4/Posthog. É instrumentação, não mecanismo.
- **Notificação dos donos.** Trabalho comercial. Vive na task "Campanha B2B de aquisição de parceiro" ([86ajp47c4](https://app.clickup.com/t/86ajp47c4)).
- **Tabela comparativa de todos os lotes do aeroporto.** É a jogada de GEO que decorre disto, mas é E3.2.

## Checklist de aceite

- [x] `prospect_location` criada, com `geog` gerada, índice GiST e RLS.
- [x] Leitura pública só devolve `is_published and converted_at is null`; escrita só `is_hub_admin()`.
- [x] Slug do prospect é unique também contra `location.slug`.
- [x] Talentos Park cadastrado, publicado, visível na seção de baixo de `/destinos/aeroporto-internacional-do-recife-guararapes`.
- [x] As duas fontes na página, vendável primeiro, com o mesmo formato de distância (`formatDistance`). Em duas leituras, não numa RPC com `union all`: ver o bloco acima.
- [x] Seções separadas de ponta a ponta (títulos, ordenação e paginação próprios); `is_popular` não existe no lado mapeado e não foi inventado.
- [x] Teste de componente: single de `prospect_location` não tem nenhum elemento com ação de reserva (`estacionamento-mapeado.test.tsx`), e também não tem link externo nem telefone.
- [x] JSON-LD `ParkingFacility` presente, sem `Offer`, sem `openingHours`, sem `aggregateRating` e sem `telephone`. Conferido no HTML do `dist`, não só no teste.
- [x] Painel admin permite criar, publicar e despublicar sem SQL; sugere destino por `nearest_destination()`.
- [x] Publicação bloqueada sem endereço, por constraint e não só por regra na tela; aviso de colisão de `google_place_id` com `location`, mais aviso de vizinho a menos de 150 m, que é o caso que dispara de verdade enquanto nenhuma `location` tem place_id.
- [x] Ficha convertida em modo leitura no admin, recusada nas três RPCs de escrita.
- [x] A conversão grava a procedência, é idempotente (carimba só a primeira unidade) e **não** publica oferta. Sem `convert_prospect_location()` transacional: o carimbo entra no `onboarding_upsert_location`, e o OTP ficou para quando houver volume.
- [x] URL de ficha convertida faz 301 para a `location`, no Worker, antes dos assets. Enquanto a unidade não está listada o redirecionamento é 302 para a página do destino, porque o endereço definitivo ainda vai existir e 301 é o que ninguém revisita.
- [x] Registros obsoletos resolvidos em `location` (11 soft delete, 1 inativa), preservando o que tem `booking`. Eram QA em produção, não prospecção: ver a seção. **Sobram 3 fixtures de QA listadas publicamente**, fora da lista da spec, aguardando decisão do time.
