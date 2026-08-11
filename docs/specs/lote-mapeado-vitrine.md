# Lote mapeado: unidade de vitrine no funil existente (E0.17)

> **Épico:** [E0.17](https://app.clickup.com/t/86ajyp580) · **Fase:** 0
> **Depende de:** E0.14 (`checkout_mode`, `hub_relationship`), E0.15 (capacidades / ADR-009)
> **Q/D:** [Q-021](https://app.clickup.com/t/86ajyp5pu) telefone do lote mapeado · [D-009](https://app.clickup.com/t/86ajyp5w7) chave de deduplicação na importação
> **ADR:** ADR-010 (tier de listagem é enforced no dado)
> **Status:** especificado em 10/08/2026, não iniciado.
> **Case de referência desta spec:** Talentos Park, Recife. Todo exemplo aqui usa dados reais dele.

## Atividades

| ID | Atividade | ClickUp |
|---|---|---|
| E0.17-a | Migration: `prospect`, `checkout_mode = none` e a guarda no banco | [86ajyp71u](https://app.clickup.com/t/86ajyp71u) |
| E0.17-b | Reclassificar os 12 lotes de prospecção | [86ajyp7bj](https://app.clickup.com/t/86ajyp7bj) |
| E0.17-c | Cadastrar o Talentos Park como case-piloto | [86ajyp7xu](https://app.clickup.com/t/86ajyp7xu) |
| E0.17-d | Página de destino: seção separada e ordenação | [86ajyp87t](https://app.clickup.com/t/86ajyp87t) |
| E0.17-e | Single sem caminho para reserva, CTA de demanda | [86ajyp8jn](https://app.clickup.com/t/86ajyp8jn) |
| E0.17-f | JSON-LD `ParkingFacility` | [86ajyp8u6](https://app.clickup.com/t/86ajyp8u6) |
| E0.17-g | Reivindicação: link assinado + OTP | [86ajyp96d](https://app.clickup.com/t/86ajyp96d) |

Ordem real: **a** destrava **b**, **c** e **g**; **c** destrava **d**, **e** e **f**. A atividade **e** está bloqueada por Q-021.

## Por quê

Em 06/08/2026 o WordPress publicou **41 páginas de estacionamento que não são parceiros**, só
para posicionamento orgânico. Elas rankeiam, e o WordPress vai ser desligado no cutover.

Hoje o Hub tem 29 unidades e o WordPress tem 41. **O site que vai morrer cobre mais mercado que
o que vai ficar.** Se o cutover acontecer antes deste épico, o Hub perde 41 URLs e a cobertura de
Recife, Confins, Galeão, Santos Dumont e Navegantes inteira.

O que falta não é entidade nova. É rótulo.

## O modelo: nada de mecanismo novo

A tentação era criar `listing_tier`, tabela de claim e um kanban paralelo de conversão. **Está
rejeitado.** Três eixos que já existem no schema respondem tudo:

| Pergunta | Coluna | Já existe? |
|---|---|---|
| Em que estágio do funil está? | `company.onboarding_status` | ✅ enum `pending_review \| approved \| in_progress \| active \| rejected` |
| Aparece na vitrine de busca geral? | `location.is_listed` | ✅ boolean |
| Tem o que vender? | `location.checkout_mode` + `location_parking_type` | ✅ |

E a ligação que faria o dono "recomeçar do zero" ao reivindicar **já é a chave primária**:
`company_onboarding.company_id` é PK, 1:1 com `company`. Reivindicar não é cadastro novo, é o
dono chegando numa `company` que já existe e ganhando a linha dele em `company_onboarding`.

Como `location.company_id` é `NOT NULL`, **todo lote mapeado já nasce como entidade de CRM**.

### Prova de que o padrão já roda

Existem hoje **12 locations com `is_listed = false`**: Max Park, Maxxi Park, Vita Park, PER Park,
Botuquara, Eco Park, Pare Park, Nine, Jaragua, Cow Lapa, Ferapark, Peu Park. É o lote de
prospecção de SP criado a partir de 08/07. O modelo roda há um mês sem nome.

E com dois rótulos errados, sendo o segundo grave:

1. `onboarding_status = 'active'` — herdado do default. Nunca se cadastraram. Estão no board como
   parceiros vivos e entrariam em régua de e-mail de parceiro.
2. `checkout_mode = 'hub'` — **não têm o que vender, mas a flag diz que têm.** No dia em que
   alguém virar `is_listed = true` num deles, o Hub renderiza botão de reserva em lote sem
   contrato, sem preço e sem recebedor.

O item 2 é a razão de ADR-010 existir.

## 🔒 ADR-010 — o tier é enforced no dado, nunca no template

> Uma unidade cuja empresa está em `onboarding_status = 'prospect'` **não pode**, por construção
> de banco, ter `checkout_mode <> 'none'` nem `is_listed = true`. A garantia é constraint/trigger
> no Postgres, não `if` no componente. Um template pode ser esquecido numa refatoração; uma
> constraint não.

Mesmo princípio de ADR-001 (geo no banco) e ADR-009 (renderizar por capacidade).

## Migrations

```sql
-- 1. estágio de funil para quem nós mapeamos e nunca levantou a mão
alter type onboarding_status add value 'prospect' before 'pending_review';

-- 2. "esta unidade não vende em lugar nenhum"
alter table location drop constraint location_checkout_mode_check;
alter table location add constraint location_checkout_mode_check
  check (checkout_mode in ('hub','external','none'));

-- 3. procedência do dado (sem isso não há como auditar de onde veio cada campo)
alter table location add column data_source text not null default 'manual'
  check (data_source in ('manual','partner','google_places','import_wp'));
alter table location add column verified_by_owner_at timestamptz;
alter table location add column last_reviewed_at timestamptz;

-- 4. foto sem procedência declarada não entra
alter table location_photo add column source text not null default 'partner_upload'
  check (source in ('partner_upload','movepark_own','street_view_api','static_map'));
alter table location_photo add column credit text;
```

`alter type ... add value` não pode ser usado na mesma transação que o cria. Rodar a migration 1
sozinha, as outras depois.

### A guarda (ADR-010), como trigger

`check` normal não enxerga outra tabela, então é trigger em `location` (INSERT/UPDATE) mais
trigger em `company` (UPDATE de `onboarding_status`):

```sql
create or replace function enforce_prospect_cannot_sell() returns trigger
language plpgsql as $$
begin
  if (select onboarding_status from company where id = new.company_id) = 'prospect' then
    if new.checkout_mode <> 'none' or new.is_listed then
      raise exception
        'location % pertence a company prospect: checkout_mode deve ser none e is_listed false',
        new.id;
    end if;
  end if;
  return new;
end $$;
```

E o caminho inverso: rebaixar uma company para `prospect` tem que rebaixar as locations dela
junto, não deixar órfão inconsistente.

**Teste pgTAP obrigatório:** tentar `update location set is_listed = true` numa unidade de company
`prospect` tem que levantar exceção. Se esse teste não existir, ADR-010 é comentário.

## O cadastro, com o Talentos Park

Fonte: `https://maps.google.com/?cid=4598899734266939223`

| Campo | Valor | De onde vem |
|---|---|---|
| `company.name` | Talentos Park | nome público no Google |
| `company.slug` | `talentos-park` | derivado |
| `company.onboarding_status` | `prospect` | nós mapeamos |
| `company.hub_relationship` | `onboarded` | não é `silent`; ver nota abaixo |
| `company.tax_id` | `null` | **não inventar** |
| `location.name` | Aeroporto do Recife | padrão das outras unidades |
| `location.destination_id` | `ee60459f-0a19-4177-8d3b-c121c899939f` (REC) | destino criado em 10/08 |
| `location.latitude/longitude` | −8.1309368 / −34.9156297 | Google Maps |
| `location.google_place_id` | preencher via Places API | **único campo do Places armazenável para sempre** |
| `location.google_maps_url` | `https://maps.google.com/?cid=4598899734266939223` | CID é estável |
| `location.address` | **a preencher** | Places API ou verificação humana |
| `location.phone` | **a preencher** | Places API; exibição depende de Q-021 |
| `location.checkout_mode` | `none` | não vende |
| `location.is_listed` | `false` | fora da busca geral |
| `location.data_source` | `google_places` | procedência |
| `location.is_24h` | ⚠️ ver armadilha | |
| `location.has_shuttle` | `false` | ausência é o default seguro |
| `location_parking_type` | **nenhuma linha** | sem tipo de vaga não há o que vender |
| `location_photo` | **nenhuma linha** | ver "Fotos" |

`geog` é coluna gerada, sai sozinha de lat/long. **Não escrever distância ao terminal em lugar
nenhum**: são 1.012 m até o terminal do REC e isso é `ST_Distance` sobre `geog` em tempo de
consulta (ADR-001).

### ⚠️ Armadilha: `is_24h` tem default `true`

`location.is_24h` é `NOT NULL DEFAULT true`. Inserir um lote mapeado sem tocar nesse campo faz o
Hub **afirmar que o Talentos Park funciona 24h**, o que ninguém verificou. É exatamente a classe
de problema do ADR-009: promessa renderizada por default em vez de por capacidade.

Enquanto não houver `is_24h` nullable, a regra é: **`is_24h` de unidade `prospect` não renderiza**,
e o bloco de horário só aparece com `verified_by_owner_at IS NOT NULL`. Se preferir resolver no
dado, tornar a coluna nullable é o caminho limpo, e aí `null` significa "não sabemos".

### Por que `hub_relationship = 'onboarded'` e não `'silent'`

`silent` (E0.14) quer dizer "o parceiro tem contrato e não sabe que está no Hub". O Talentos Park
é o oposto: não tem contrato nenhum. Os dois eixos são independentes e não devem ser confundidos.
`hub_relationship` responde "o parceiro sabe?"; `onboarding_status` responde "em que ponto do
funil está?".

### Insert

```sql
with c as (
  insert into company (name, slug, onboarding_status, take_rate_bps)
  values ('Talentos Park', 'talentos-park', 'prospect', 2000)
  returning id
)
insert into location (
  company_id, name, slug, destination_id,
  latitude, longitude, google_maps_url,
  checkout_mode, is_listed, data_source, has_shuttle
)
select c.id, 'Aeroporto do Recife', 'talentos-park-aeroporto-recife',
       'ee60459f-0a19-4177-8d3b-c121c899939f',
       -8.1309368, -34.9156297,
       'https://maps.google.com/?cid=4598899734266939223',
       'none', false, 'google_places', false
from c;
```

`take_rate_bps` fica no default de 20% porque a coluna é `NOT NULL`. **Não é negociação**, é
placeholder inerte enquanto não há contrato. Não usar esse valor em nenhum relatório de receita
sem filtrar `onboarding_status <> 'prospect'`.

## Fotos: nenhuma, e a razão não é jurídica primeiro

1. **Comercial.** Foto do pátio dele numa página que não vende é o que transforma "exposição
   grátis" em "tira meu nome do ar". A Aerovalet sozinha tem 3 lotes na base; esses donos se falam.
2. **Google Places.** Conteúdo do Places não pode ser pré-buscado, cacheado nem armazenado. A
   exceção única é o `place_id`. Foto do Places precisa ser renderizada via API a cada request,
   com atribuição do autor, o que não indexa e não escala.
3. **Lei 9.610/98.** O titular da foto do site dele é a pessoa para quem vamos ligar.

**O que renderizar no lugar:** mapa estático (licenciado para exibição), diagrama de distância ao
terminal a partir do `geog`, e a hero do destino, que é ativo próprio. Google não precisa de foto
do pátio para rankear. Foto é conversão, e conversão é justamente o que o tier mapeado não tem.
Foto vira o presente de quem reivindica.

⚠️ **Risco maior que o das fotos, e já ativo no WordPress:** as descrições parecem copiadas do
marketing do próprio lote ("A Aero Park Locadora é uma empresa preocupada com a mobilidade dos
seus clientes..."). Isso é cópia de obra protegida **e** duplicate content. Não corrigir no
WordPress, que vai morrer. **Corrigir na importação**, reescrevendo as 41 em texto factual.

## Renderização

### Página de destino (`/estacionamentos/aeroporto-recife/`)

Duas seções, não uma lista misturada:

1. **Com reserva pela Movepark** — `is_listed = true`, ordenado como hoje.
2. **Outros estacionamentos na região** — `onboarding_status = 'prospect'` com
   `destination_id` daquele destino. Card menor, selo "Sem reserva online", sem preço.

A ordenação **é** o produto que o parceiro paga. O card mapeado nunca fica acima de um vendável.

⚠️ **Nunca criar lote mapeado em Viracopos.** Vale zero e ofende o dono de ~80% da receita.
Se houver parceiro ativo naquele destino, não construir link interno para o mapeado.

### Single do lote mapeado

Reaproveita a máquina de capacidades do E0.15 (ADR-009), **não escreve componente novo**. Uma
unidade `prospect` simplesmente não declara nenhuma capacidade de transação, então nada de
promessa renderiza. O que fica:

- Nome, endereço, mapa estático, distância ao terminal calculada.
- Telefone: **pendente de Q-021**.
- `"Preço: não informado. Este estacionamento ainda não publica tarifas na Movepark."` — fato
  honesto, citável por LLM, e alavanca sobre o dono.
- CTA primário: **"Quero reservar aqui, me avise quando abrir"**.
- CTA secundário: **"É o administrador? Reivindique esta página"**, em bloco próprio.
- **Proibido:** botão de reserva, widget de WhatsApp de reserva, link para o site ou motor de
  reserva do lote.

**Por que não linkar o canal dele:** no dia em que ele abre o Analytics e vê referral da Movepark,
já está recebendo de graça exatamente o que íamos cobrar 20%. A venda morre ali.

### JSON-LD

`ParkingFacility` com `name`, `address`, `geo`, `telephone`, `amenityFeature`. **`Offer` só com
capacidade de transação declarada.** O WordPress hoje não emite nada disso, só `WebPage` e
`ImageObject` do Yoast, então isso é ganho líquido sobre a página que está no ar.

## Reivindicação: ponto de entrada, não fluxo

Link assinado na single: `/parceiro/onboarding?claim=<location_id>&sig=<hmac>`.

1. Resolve o `company_id` que **já existe**, pré-preenche nome, endereço e telefone.
2. Prova de titularidade: **OTP para o telefone mapeado**, reusando a tabela `identifier_otp`
   que já existe. Quem atende o telefone público do lote é prova suficiente para entrar na fila.
3. `company_onboarding` ganha a linha dele (a PK é o vínculo, não há tabela nova).
4. `onboarding_status: prospect → pending_review`. Cai no mesmo board, na mesma coluna, aprovado
   pela mesma pessoa.
5. A partir daí é o wizard do E1.9, sem desvio.

**Sem o OTP não sobe de `prospect`.** Sem essa trava, qualquer um reivindica o lote do concorrente.

## O que este épico NÃO entrega

- **Tabela de sinal de demanda.** O "me avise quando abrir" grava evento em GA4/Posthog, não em
  tabela nova. É instrumentação, não mecanismo. Vira tabela quando provar valor.
- **A importação das 41 URLs.** Este épico entrega o modelo e o case do Talentos Park. A carga em
  lote é atividade própria e depende de D-009.
- **Notificação dos donos.** É trabalho comercial, não código. Vive na task "Campanha B2B de
  aquisição de parceiro" (86ajp47c4).
- **Tabela comparativa de todos os lotes do aeroporto.** É a jogada de GEO que decorre disto, mas
  é E3.2.

## Checklist de aceite

- [ ] `alter type` aplicado; `prospect` ordena antes de `pending_review`.
- [ ] Teste pgTAP: `is_listed = true` em unidade de company `prospect` levanta exceção.
- [ ] Teste pgTAP: `checkout_mode = 'hub'` em unidade de company `prospect` levanta exceção.
- [ ] Os 12 lotes de prospecção reclassificados para `prospect` / `none`.
- [ ] Talentos Park visível em `/estacionamentos/aeroporto-recife/`, na seção de baixo, sem preço.
- [ ] Single do Talentos Park sem nenhum caminho para reserva (teste de componente).
- [ ] JSON-LD `ParkingFacility` presente e sem `Offer`.
- [ ] Link de claim assinado abre o onboarding com os campos preenchidos.
- [ ] `location_photo` recusa insert sem `source`.
- [ ] Nenhum relatório de receita conta company `prospect`.
