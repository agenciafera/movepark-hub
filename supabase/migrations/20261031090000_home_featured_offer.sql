-- Vitrine da home vira curadoria explícita, no lugar do ranking por venda.
--
-- Spec: docs/specs/customer/home-and-search.md
--
-- Por que o ranking por venda saiu:
--
-- 1. Ele mede `booking` do Hub, e das 18 unidades listadas as 9 de empresa ativa são TODAS
--    `checkout_mode = 'external'`: vendem no site do parceiro, e o Hub nunca registra a reserva.
--    O contador delas é zero por desenho, para sempre. As 9 de checkout no Hub pertencem todas a
--    empresa inativa. Ou seja, o ranking só sabia ordenar quem não está mais no ar.
-- 2. O histórico inteiro são 55 reservas em 4 unidades, a última de 31/07/2026, quase tudo de
--    teste. Ordenar por isso é ordenar por fixture congelada.
-- 3. `popular_parking_types` nunca filtrou status da empresa (ela dá `join company` só para pegar
--    o slug). Empresa inativa ocupava 16 das 24 linhas do buffer e empurrava para fora do corte
--    quem deveria aparecer: o Aeropark Guarulhos caía na posição 25 de 35.
--
-- O que entra no lugar: uma lista curada pelo Manager, por TIPO DE VAGA (não por unidade), porque
-- a vitrine mostra oferta ("Aeropark > Vaga Coberta") e não estacionamento. Sem ranking, sem
-- embaralhamento por semente do dia, sem teto de 1 por empresa nem de 1 por destino: quem decide
-- a composição e a ordem é quem edita a lista. Os tetos existiam para conter um ranking automático
-- que ninguém controlava, e contra curadoria eles só brigavam com a decisão de quem curou.
--
-- O gate de publicação continua no servidor, e agora num lugar só: a RPC de leitura repete o mesmo
-- predicado das RLS `catalog_read_company`/`catalog_read_location`, então unidade de empresa
-- inativa some da home mesmo para quem está logado como hub_admin (que enxerga a `company` inteira
-- pela policy `company_select`, e por isso via na home o que o anônimo não via).
--
-- `location.is_popular` e `location.popular_sort_order` (migration 20260705000000) ficam onde
-- estão, sem consumidor: eram curadoria por unidade, nunca ganharam tela e a granularidade errada
-- é justamente o que esta tabela conserta. Limpeza fica para um PR próprio.

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.home_featured_offer (
  id                       uuid primary key default gen_random_uuid(),
  -- A curadoria aponta para o tipo de vaga, que é o que vira card. `on delete cascade` porque
  -- destaque órfão não é dado a preservar: se o tipo de vaga deixou de existir, o card também.
  location_parking_type_id uuid not null unique
                           references public.location_parking_type(id) on delete cascade,
  sort_order               integer not null default 0,
  -- Tirar da vitrine sem perder a posição. Separado do `delete` de propósito: guardar um destaque
  -- desligado é o caso comum (unidade em manutenção, campanha que volta), e refazer a ordem toda
  -- por causa disso é o tipo de atrito que faz a tela não ser usada.
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Sem `deleted_at` de propósito: isto é lista de curadoria, não dado transacional. Soft delete aqui
-- brigaria com o `unique` (a linha apagada seguraria o lugar da nova) e não protege nada, porque
-- remover um card não perde histórico nenhum. Mesmo desenho de `destination`.

create index if not exists idx_home_featured_offer_ordem
  on public.home_featured_offer (sort_order, id);

create trigger set_updated_at before update on public.home_featured_offer
  for each row execute function public.set_updated_at();

comment on table public.home_featured_offer is
  'Curadoria da vitrine da home, por tipo de vaga. Editada em /manager/destaques. Substitui o '
  'ranking por venda da popular_parking_types, que não media nada enquanto o catálogo vivo é todo '
  'de checkout externo.';
comment on column public.home_featured_offer.sort_order is
  'Ordem na home (menor primeiro). Reescrita em bloco pela tela ao mover um card.';
comment on column public.home_featured_offer.is_active is
  'Desligar tira da home sem perder a posição na lista.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS: escrita e leitura da tabela são só do hub_admin
-- ─────────────────────────────────────────────────────────────────────────────
-- O consumidor nunca lê a tabela: ele lê a RPC abaixo, que já aplica o gate de publicação. Sem
-- policy de catálogo aqui, então, a superfície pública fica com uma porta só.

alter table public.home_featured_offer enable row level security;

create policy "home_featured_offer_admin_write" on public.home_featured_offer
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Leitura pública
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma forma de retorno da popular_parking_types (id do tipo de vaga + slugs), para o front
-- continuar montando preço e foto com as consultas que ele já tem. `security definer` porque a
-- tabela é fechada, e por isso o predicado de publicação vem escrito aqui dentro por extenso.

create or replace function public.home_featured_offers()
returns table (
  id                 uuid,
  location_id        uuid,
  operator_slug      text,
  location_slug      text,
  parking_type_code  text,
  sort_order         integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    lpt.id,
    l.id as location_id,
    c.slug as operator_slug,
    l.slug as location_slug,
    pt.code as parking_type_code,
    hf.sort_order
  from public.home_featured_offer hf
  join public.location_parking_type lpt on lpt.id = hf.location_parking_type_id
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where hf.is_active
    and lpt.is_active
    and cpt.is_active
    and l.deleted_at is null
    and l.status = 'active'::entity_status
    and l.is_listed
    and c.deleted_at is null
    and c.status = 'active'::entity_status
    and c.onboarding_status = 'active'::onboarding_status
  order by hf.sort_order, hf.id;
$function$;

comment on function public.home_featured_offers() is
  'Vitrine curada da home, já filtrada pelo mesmo predicado das RLS de catálogo. É a única porta '
  'pública para home_featured_offer.';

-- A home é pública: `revoke from public` não tira o grant de anon, então os dois vão explícitos.
revoke all on function public.home_featured_offers() from public, anon;
grant execute on function public.home_featured_offers() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Carga inicial a partir do critério atual
-- ─────────────────────────────────────────────────────────────────────────────
-- Semeia com o que o ranking de hoje produziria SE ele filtrasse empresa, um card por empresa
-- ativa (que era o teto que o front já aplicava), para a tela nascer com uma lista utilizável em
-- vez de vazia. O teto por destino não entra: era o corte que escondia metade dos parceiros.
--
-- O desempate por `lpt.id` do ranking antigo é sorteio disfarçado, e com ele o Aeropark entraria
-- com Valet só porque o uuid da linha veio antes. Onde tudo empata, a semente prefere a vitrine
-- natural: coberta, depois descoberta, depois o resto.
--
-- Exige `pricing_rule`: sem tabela de preço o card não tem "a partir de" e o front descarta a
-- linha, então semear isso seria semear um buraco.
--
-- Roda em banco vazio (CI, `supabase db reset`) sem inserir nada, de propósito.

with elegivel as (
  select
    lpt.id,
    l.company_id,
    count(distinct b.id) as reservas,
    l.review_count,
    l.popular_sort_order,
    l.created_at,
    case pt.code
      when 'covered'   then 1
      when 'uncovered' then 2
      when 'valet'     then 3
      when 'premium'   then 4
      else 5
    end as preferencia_de_vitrine
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  left join public.booking_item bi on bi.parking_type_id = pt.id
  left join public.booking b
    on b.id = bi.booking_id
   and b.location_id = l.id
   and b.status in ('confirmed', 'checked_in', 'completed', 'no_show')
  where lpt.is_active
    and cpt.is_active
    and l.deleted_at is null
    and l.status = 'active'::entity_status
    and l.is_listed
    and c.deleted_at is null
    and c.status = 'active'::entity_status
    and c.onboarding_status = 'active'::onboarding_status
  group by lpt.id, l.company_id, l.review_count, l.popular_sort_order, l.created_at, pt.code
),
melhor_da_empresa as (
  select
    e.*,
    row_number() over (
      partition by e.company_id
      order by e.reservas desc, e.review_count desc, e.popular_sort_order asc,
               e.preferencia_de_vitrine asc, e.created_at asc, e.id asc
    ) as posicao_na_empresa
  from elegivel e
)
insert into public.home_featured_offer (location_parking_type_id, sort_order)
select
  m.id,
  row_number() over (
    order by m.reservas desc, m.review_count desc, m.popular_sort_order asc,
             m.preferencia_de_vitrine asc, m.created_at asc, m.id asc
  )
from melhor_da_empresa m
where m.posicao_na_empresa = 1
on conflict (location_parking_type_id) do nothing;
