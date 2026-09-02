-- Preço de concorrente ganha validade: vencido some da página, não envelhece nela.
--
-- O que faltava. A 20261107090000 trouxe o preço PESQUISADO do lote mapeado e exigiu data e
-- fonte por constraint, que é a metade certa do problema: nada entra sem carimbo. A outra
-- metade ficou aberta: nada SAI. Um valor conferido em 29/08/2026 continuaria na tabela da
-- página de destino em 2027, com a data ao lado, e a data não conserta o número. Hoje são 4
-- lotes com preço, todos de agosto, e nenhum mecanismo automático os revalida.
--
-- Por que isso é diferente do preço de parceiro. O nosso é o mesmo do checkout e tem dono:
-- se estiver errado, a reclamação vem do cliente e a gente corrige na hora. O do concorrente
-- é afirmação nossa sobre o negócio de outra empresa, e quem reclama é ela. Publicidade
-- comparativa é lícita quando é verificável; o que a torna indefensável é o número velho
-- apresentado como atual.
--
-- A regra. 90 dias. Passou disso, a vitrine devolve nulo nas quatro colunas de preço E na
-- data: a linha do lote continua na página (endereço, distância, ficha), só sem tarifa. A
-- escolha do prazo é de calibragem, não de princípio: tabela de estacionamento não muda toda
-- semana, e 30 dias (o prazo da nota do Google, 20261025090000) esvaziaria a página antes de
-- alguém conseguir reconferir 145 fichas à mão.
--
-- Duas portas, pelo mesmo motivo do `google_fetched_at`. Aqui a RPC recusa o vencido, e a
-- página recusa de novo na hora de montar a linha (`isPesquisaFresca`, em
-- destinoPrices.logic.ts): esta página é SSG, o HTML sai congelado no dia do build, e sem a
-- segunda porta uma página construída no dia 89 mostraria o preço para sempre.
--
-- O painel NÃO filtra. `manager_prospect_locations` continua devolvendo o valor vencido, com
-- a data: é lá que alguém reconfere, e esconder o número de quem vai atualizá-lo só faz o
-- trabalho ser refeito do zero.
--
-- Ver docs/specs/lote-mapeado-vitrine.md.

-- ── 1. A regra num lugar só ──────────────────────────────────────────────────
--
-- Função em vez de `p.researched_at > current_date - 90` repetido cinco vezes na RPC: o
-- número precisa ter um dono, e o gêmeo em TypeScript aponta para cá pelo nome.
create or replace function public.preco_pesquisado_fresco(
  p_researched_at date,
  p_hoje date default current_date
) returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_researched_at is not null and p_researched_at > p_hoje - 90;
$$;

comment on function public.preco_pesquisado_fresco(date, date) is
  'Preço de terceiro vale 90 dias a partir da data da pesquisa. Gêmeo em TS: PRECO_PESQUISADO_TTL_DIAS em src/features/destinations/destinoPrices.logic.ts.';

revoke all on function public.preco_pesquisado_fresco(date, date) from public;
grant execute on function public.preco_pesquisado_fresco(date, date) to anon, authenticated, service_role;

-- ── 2. A vitrine devolve nulo no vencido ─────────────────────────────────────
--
-- Mesma assinatura da 20261107090000, então é `create or replace` e os grants seguem de pé.
-- O `revoke`/`grant` no fim é cinto de segurança: função recriada neste projeto já nasceu
-- com `anon=X` por default privilege mais de uma vez.
create or replace function public.destination_prospect_cards(p_destination_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  public_slug text,
  public_name text,
  public_path text,
  address text,
  latitude numeric,
  longitude numeric,
  google_maps_url text,
  amenities jsonb,
  description text,
  distance_km numeric,
  reference_name text,
  google_place_id text,
  google_rating numeric,
  google_rating_count integer,
  google_fetched_at timestamptz,
  researched_daily_brl numeric,
  researched_weekly_brl numeric,
  researched_biweekly_brl numeric,
  researched_monthly_brl numeric,
  researched_at date
)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select
    p.id,
    p.name,
    p.slug,
    p.public_slug,
    p.public_name,
    case
      when d.public_slug is not null and p.public_slug is not null
        then '/estacionamentos/' || d.public_slug || '/' || p.public_slug
    end as public_path,
    p.address,
    p.latitude,
    p.longitude,
    p.google_maps_url,
    p.amenities,
    p.description,
    round((st_distance(p.geog, coalesce(np.geog, d.geog)) / 1000.0)::numeric, 2) as distance_km,
    np.name as reference_name,
    p.google_place_id,
    g.rating as google_rating,
    coalesce(g.user_rating_count, 0) as google_rating_count,
    g.fetched_at as google_fetched_at,
    case when public.preco_pesquisado_fresco(p.researched_at) then p.researched_daily_brl end as researched_daily_brl,
    case when public.preco_pesquisado_fresco(p.researched_at) then p.researched_weekly_brl end as researched_weekly_brl,
    case when public.preco_pesquisado_fresco(p.researched_at) then p.researched_biweekly_brl end as researched_biweekly_brl,
    case when public.preco_pesquisado_fresco(p.researched_at) then p.researched_monthly_brl end as researched_monthly_brl,
    case when public.preco_pesquisado_fresco(p.researched_at) then p.researched_at end as researched_at
  from public.destination d
  join public.prospect_location p on p.destination_id = d.id
  left join lateral (
    select dp.name, dp.geog
    from public.destination_point dp
    where dp.destination_id = d.id
    order by st_distance(p.geog, dp.geog) asc
    limit 1
  ) np on true
  left join public.google_place_snapshot g
    on g.place_id = p.google_place_id
   and not g.is_hidden
   and g.fetched_at > now() - interval '30 days'
  where (d.slug = p_destination_slug or d.public_slug = p_destination_slug)
    and d.is_published
    and p.is_published
    and p.converted_at is null
  order by distance_km asc nulls last, p.name asc;
$function$;

revoke all on function public.destination_prospect_cards(text) from public;
grant execute on function public.destination_prospect_cards(text) to anon, authenticated, service_role;
