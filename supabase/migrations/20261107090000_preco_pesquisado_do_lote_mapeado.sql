-- Preço pesquisado do lote mapeado: a página de destino passa a responder "quanto custa".
--
-- O problema, medido no ar em 29/08/2026: a tabela de preço da página de destino só
-- renderiza quando existe unidade vendável, e isso só acontece em 5 dos 26 destinos
-- (Guarulhos, Viracopos, Congonhas, Curitiba e Tietê). Nos outros 21 a página responde
-- "onde fica" e "a que distância", e não responde a consulta com intenção comercial. Em
-- Confins são 6 concorrentes listados, com endereço e distância, e zero real na tela.
--
-- O dado já existia, só não no banco: 20 posts do blog têm preço de concorrente
-- pesquisado à mão, com data e fonte (o guia de Confins compara BePark, Multipark, Park
-- Confins, Central Park e o pátio oficial com valores de agosto de 2026; o de Viracopos
-- traz o bolsão F e o edifício garagem conferidos no site do aeroporto em 28/08/2026).
-- Pesquisa que vive em prosa numa URL de blog não entra em tabela, não vira JSON-LD e não
-- é citada como comparação.
--
-- ── Isto NÃO afrouxa o ADR-010 ──────────────────────────────────────────────────────
-- O ADR diz que `prospect_location` não tem preço, e continua verdade no sentido que
-- importa: aqui não existe preço TRANSACIONAL. Estas colunas são preço de terceiro
-- PESQUISADO por nós, com data e fonte, e o ADR-009 continua valendo inteiro: nenhuma
-- delas cria promessa de transação, nenhuma vira `Offer` no JSON-LD, nenhuma entra em
-- `booking`, `fare`, cupom ou payout, e nenhuma passa perto do motor de preço. A regra de
-- crescimento do ADR-010 ("campo novo só entra se aparecer na página de destino") é
-- justamente o que autoriza: estes seis campos aparecem, e são o motivo da entrega.
--
-- Data e fonte são obrigatórias por constraint, não por disciplina: preço de concorrente
-- sem carimbo de quando foi conferido é afirmação nossa sobre o negócio do outro, e a
-- reclamação vem dele. A tela mostra a data junto do valor, sempre.
--
-- Ver docs/specs/lote-mapeado-vitrine.md e docs/specs/destinations.md.

-- ── 1. As colunas ───────────────────────────────────────────────────────────────────
alter table public.prospect_location
  add column researched_daily_brl    numeric(10, 2),
  add column researched_weekly_brl   numeric(10, 2),
  add column researched_biweekly_brl numeric(10, 2),
  add column researched_monthly_brl  numeric(10, 2),
  add column researched_at           date,
  add column research_source         text;

comment on column public.prospect_location.researched_daily_brl is
  'Diária avulsa mais barata publicada pelo lote, em reais. Pesquisa nossa, não oferta.';
comment on column public.prospect_location.researched_weekly_brl is
  'Total de 7 diárias, em reais. Mesma régua da matriz da página de destino (1/7/15/30).';
comment on column public.prospect_location.researched_biweekly_brl is
  'Total de 15 diárias, em reais.';
comment on column public.prospect_location.researched_monthly_brl is
  'Total de 30 diárias, em reais.';
comment on column public.prospect_location.researched_at is
  'Quando o valor foi conferido. Renderizado junto do preço; sem ele o preço não entra.';
comment on column public.prospect_location.research_source is
  'Onde foi conferido (URL do lote, tabela de balcão, telefone). Auditoria, não é exibido.';

alter table public.prospect_location
  -- Zero não é "de graça", é campo mal preenchido, e negativo não existe.
  add constraint prospect_researched_price_positive check (
    coalesce(researched_daily_brl, 1) > 0
    and coalesce(researched_weekly_brl, 1) > 0
    and coalesce(researched_biweekly_brl, 1) > 0
    and coalesce(researched_monthly_brl, 1) > 0
  ),
  -- Preço de terceiro sem data e sem fonte não vai para a tela. A constraint é o lugar
  -- certo porque a tela não é a única porta: migration, RPC e service role também gravam.
  add constraint prospect_researched_price_needs_source check (
    (
      researched_daily_brl is null
      and researched_weekly_brl is null
      and researched_biweekly_brl is null
      and researched_monthly_brl is null
    )
    or (researched_at is not null and nullif(btrim(research_source), '') is not null)
  );

-- O SELECT em `prospect_location` é concedido POR COLUNA desde o Q-021 (o telefone que a
-- página não mostra). Coluna nova nasce fora do grant, e a RPC de vitrine é invoker: sem
-- estas linhas ela morre em 42501 para `anon`, que é exatamente o bug da 20261103091500.
grant select (
  researched_daily_brl,
  researched_weekly_brl,
  researched_biweekly_brl,
  researched_monthly_brl,
  researched_at
) on public.prospect_location to anon, authenticated;

-- `research_source` fica FORA do grant público: é rastro de auditoria, não conteúdo. Quem
-- precisa dele é o admin, que lê pela RPC security definer.

-- ── 2. A vitrine devolve o preço ────────────────────────────────────────────────────
-- Muda o RETURNS TABLE, então é drop + create com o grant reescrito por extenso.
drop function if exists public.destination_prospect_cards(text);

create function public.destination_prospect_cards(p_destination_slug text)
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
    p.researched_daily_brl,
    p.researched_weekly_brl,
    p.researched_biweekly_brl,
    p.researched_monthly_brl,
    p.researched_at
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

-- ── 3. O painel lê e escreve o preço ────────────────────────────────────────────────
drop function if exists public.manager_prospect_locations(uuid, text, text);

create function public.manager_prospect_locations(
  p_destination_id uuid default null,
  p_state text default null,
  p_search text default null
)
returns table (
  id uuid,
  destination_id uuid,
  destination_name text,
  destination_slug text,
  name text,
  slug text,
  address text,
  phone text,
  latitude numeric,
  longitude numeric,
  google_place_id text,
  google_maps_url text,
  amenities jsonb,
  description text,
  data_source text,
  is_published boolean,
  notified_owner_at timestamptz,
  last_reviewed_at timestamptz,
  converted_location_id uuid,
  converted_at timestamptz,
  converted_location_name text,
  converted_company_id uuid,
  state text,
  distance_m numeric,
  place_id_conflict_name text,
  created_at timestamptz,
  updated_at timestamptz,
  researched_daily_brl numeric,
  researched_weekly_brl numeric,
  researched_biweekly_brl numeric,
  researched_monthly_brl numeric,
  researched_at date,
  research_source text
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  -- Recusa em vez de devolver vazio: lista vazia por falta de permissão se disfarça de "não há
  -- lote mapeado", que é a leitura errada numa tela de curadoria. Mesmo padrão dos outros manager_*.
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os lotes mapeados.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.destination_id,
    d.name,
    d.slug,
    p.name,
    p.slug,
    p.address,
    p.phone,
    p.latitude,
    p.longitude,
    p.google_place_id,
    p.google_maps_url,
    p.amenities,
    p.description,
    p.data_source,
    p.is_published,
    p.notified_owner_at,
    p.last_reviewed_at,
    p.converted_location_id,
    p.converted_at,
    cl.name,
    cl.company_id,
    case
      when p.converted_at is not null then 'converted'
      when p.is_published then 'published'
      else 'draft'
    end,
    -- Distância ao destino por ST_Distance em tempo de consulta (ADR-001), nunca coluna.
    round(st_distance(p.geog, d.geog)::numeric, 0),
    conflito.name,
    p.created_at,
    p.updated_at,
    p.researched_daily_brl,
    p.researched_weekly_brl,
    p.researched_biweekly_brl,
    p.researched_monthly_brl,
    p.researched_at,
    p.research_source
  from public.prospect_location p
  join public.destination d on d.id = p.destination_id
  left join public.location cl on cl.id = p.converted_location_id
  left join lateral (
    select l.name
    from public.location l
    where p.google_place_id is not null
      and l.google_place_id = p.google_place_id
      and l.deleted_at is null
    limit 1
  ) conflito on true
  where (p_destination_id is null or p.destination_id = p_destination_id)
    and (
      p_state is null
      or p_state = 'all'
      or (p_state = 'converted' and p.converted_at is not null)
      or (p_state = 'published' and p.converted_at is null and p.is_published)
      or (p_state = 'draft' and p.converted_at is null and not p.is_published)
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or p.name ilike '%' || btrim(p_search) || '%'
      or p.slug ilike '%' || btrim(p_search) || '%'
      or coalesce(p.address, '') ilike '%' || btrim(p_search) || '%'
    )
  order by d.name asc, p.name asc;
end;
$function$;

-- `revoke ... from public` NÃO basta nas duas manager_*: o projeto tem
-- `alter default privileges ... grant execute on functions to anon, authenticated,
-- service_role`, então toda função recém-criada nasce com `anon=X` explícito, que a
-- revogação do PUBLIC não alcança. Sem o `revoke ... from anon` abaixo, o advisor de
-- segurança acusa `anon_security_definer_function_executable` nas duas, e a superfície
-- cresce mesmo com o `is_hub_admin()` recusando lá dentro. Pego pelos advisors do Supabase
-- em 30/08/2026, antes do commit.
revoke all on function public.manager_prospect_locations(uuid, text, text) from public;
revoke execute on function public.manager_prospect_locations(uuid, text, text) from anon;
grant execute on function public.manager_prospect_locations(uuid, text, text) to authenticated, service_role;

drop function if exists public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean
);

create function public.manager_prospect_location_save(
  p_id uuid,
  p_name text,
  p_slug text,
  p_latitude numeric,
  p_longitude numeric,
  p_destination_id uuid default null,
  p_address text default null,
  p_phone text default null,
  p_google_place_id text default null,
  p_google_maps_url text default null,
  p_description text default null,
  p_amenities jsonb default '[]'::jsonb,
  p_data_source text default 'manual',
  p_is_published boolean default false,
  p_researched_daily_brl numeric default null,
  p_researched_weekly_brl numeric default null,
  p_researched_biweekly_brl numeric default null,
  p_researched_monthly_brl numeric default null,
  p_researched_at date default null,
  p_research_source text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_id uuid := p_id;
  v_convertida timestamptz;
  v_tem_preco boolean := coalesce(
    p_researched_daily_brl, p_researched_weekly_brl,
    p_researched_biweekly_brl, p_researched_monthly_brl
  ) is not null;
  v_fonte text := nullif(btrim(coalesce(p_research_source, '')), '');
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os lotes mapeados.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'Nome e slug são obrigatórios.' using errcode = 'P0001';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude e longitude são obrigatórias: são elas que resolvem o destino e a distância ao terminal.'
      using errcode = 'P0001';
  end if;

  -- O gate de publicação também vive aqui, e não só na constraint, para a tela receber a frase
  -- em vez do texto do Postgres.
  if p_is_published and coalesce(btrim(p_address), '') = '' then
    raise exception 'Não dá para publicar sem endereço: ficha sem endereço na página de destino é thin content.'
      using errcode = 'P0001';
  end if;

  -- Mesma ideia: a constraint já barra, mas quem preenche preço na tela merece a frase que
  -- explica o porquê, e não "violates check constraint".
  if v_tem_preco and (p_researched_at is null or v_fonte is null) then
    raise exception 'Preço pesquisado precisa da data em que foi conferido e de onde saiu: sem isso ele não vai para a página.'
      using errcode = 'P0001';
  end if;

  if v_tem_preco and p_researched_at > current_date then
    raise exception 'A data da pesquisa não pode estar no futuro.' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.prospect_location (
      destination_id, name, slug, address, phone, latitude, longitude,
      google_place_id, google_maps_url, amenities, description, data_source, is_published,
      researched_daily_brl, researched_weekly_brl, researched_biweekly_brl,
      researched_monthly_brl, researched_at, research_source
    ) values (
      p_destination_id,
      btrim(p_name),
      btrim(p_slug),
      nullif(btrim(coalesce(p_address, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_latitude,
      p_longitude,
      nullif(btrim(coalesce(p_google_place_id, '')), ''),
      nullif(btrim(coalesce(p_google_maps_url, '')), ''),
      coalesce(p_amenities, '[]'::jsonb),
      nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_data_source, 'manual'),
      coalesce(p_is_published, false),
      p_researched_daily_brl,
      p_researched_weekly_brl,
      p_researched_biweekly_brl,
      p_researched_monthly_brl,
      case when v_tem_preco then p_researched_at end,
      case when v_tem_preco then v_fonte end
    )
    returning id into v_id;

    return v_id;
  end if;

  select pl.converted_at into v_convertida
  from public.prospect_location pl
  where pl.id = v_id;

  if not found then
    raise exception 'Lote mapeado não encontrado.' using errcode = 'P0001';
  end if;

  -- Ficha convertida é somente leitura: editar depois da conversão dessincroniza do que o
  -- parceiro já vê no painel dele.
  if v_convertida is not null then
    raise exception 'Esta ficha já virou parceiro e não é mais editável.' using errcode = 'P0001';
  end if;

  update public.prospect_location set
    destination_id  = coalesce(p_destination_id, destination_id),
    name            = btrim(p_name),
    slug            = btrim(p_slug),
    address         = nullif(btrim(coalesce(p_address, '')), ''),
    phone           = nullif(btrim(coalesce(p_phone, '')), ''),
    latitude        = p_latitude,
    longitude       = p_longitude,
    google_place_id = nullif(btrim(coalesce(p_google_place_id, '')), ''),
    google_maps_url = nullif(btrim(coalesce(p_google_maps_url, '')), ''),
    amenities       = coalesce(p_amenities, '[]'::jsonb),
    description     = nullif(btrim(coalesce(p_description, '')), ''),
    data_source     = coalesce(p_data_source, 'manual'),
    is_published    = coalesce(p_is_published, false),
    researched_daily_brl    = p_researched_daily_brl,
    researched_weekly_brl   = p_researched_weekly_brl,
    researched_biweekly_brl = p_researched_biweekly_brl,
    researched_monthly_brl  = p_researched_monthly_brl,
    researched_at   = case when v_tem_preco then p_researched_at end,
    research_source = case when v_tem_preco then v_fonte end
  where id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean,
  numeric, numeric, numeric, numeric, date, text
) from public;
revoke execute on function public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean,
  numeric, numeric, numeric, numeric, date, text
) from anon;
grant execute on function public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean,
  numeric, numeric, numeric, numeric, date, text
) to authenticated, service_role;
