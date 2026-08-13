-- E0.17-h · Painel administrativo do lote mapeado (`prospect_location`).
--
-- Por que RPC e não PostgREST direto: a migration 20261009000000 revogou o `select` da tabela
-- e reconcedeu 13 colunas, as que a página de destino renderiza. O corte é por coluna, e grant
-- de coluna não separa `hub_admin` de cliente logado, então `phone`, `google_place_id`,
-- `data_source`, `notified_owner_at`, `last_reviewed_at`, `converted_location_id`, `created_at`
-- e `updated_at` são ilegíveis até para o admin. Um `select *` no painel voltaria
-- `42501 permission denied for column phone`.
--
-- A escrita também vem para cá, e não fica no PostgREST que a RLS já liberaria, por dois motivos:
-- o `.select()` que o supabase-js emite depois de um insert/update esbarraria no mesmo corte de
-- coluna, e as três regras do painel (publicar exige endereço, ficha convertida é somente
-- leitura, excluir é delete de verdade) passam a valer no servidor em vez de morar só na tela.
--
-- Spec: docs/specs/lote-mapeado-vitrine.md § Painel administrativo (E0.17-h) · ADR-010.

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Gate de publicação: ficha sem endereço não publica.
--
-- Constraint, e não regra na RPC, porque publicar é o que expõe a ficha na página de destino:
-- ficha sem endereço lá é thin content e queima a credibilidade da seção inteira. Como
-- constraint, o gate vale para qualquer caminho de escrita, inclusive um `update` na mão.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.prospect_location
  add constraint prospect_location_publish_needs_address
  check (not is_published or coalesce(btrim(address), '') <> '');

comment on constraint prospect_location_publish_needs_address on public.prospect_location is
  'E0.17-h: publicar exige endereço. Ficha sem endereço na página de destino é thin content.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lista do painel.
--
-- Devolve a linha inteira (o admin é dono do dado) mais o que a tela precisa derivar: o estado
-- em uma palavra, o destino por nome, para onde a ficha convertida virou, e se o `google_place_id`
-- colide com uma unidade viva, que é o caso de parceiro ativo e não deve ser mapeado (D-009).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_prospect_locations(
  p_destination_id uuid default null,
  p_state text default null,
  p_search text default null
) returns table (
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
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
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
    p.updated_at
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
$$;

comment on function public.manager_prospect_locations(uuid, text, text) is
  'E0.17-h: lista do painel de lotes mapeados. SECURITY DEFINER porque o grant de coluna de Q-021 esconde telefone e place_id até do hub_admin.';

revoke all on function public.manager_prospect_locations(uuid, text, text) from public, anon;
grant execute on function public.manager_prospect_locations(uuid, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Pré-checagem do formulário: sugere destino e avisa de colisão.
--
-- Aviso na tela, não decisão automática (D-009). Dois lotes vizinhos existem de verdade em
-- aeroporto, então proximidade não pode barrar sozinha; quem decide é quem está mapeando.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_prospect_location_precheck(
  p_latitude numeric,
  p_longitude numeric,
  p_google_place_id text default null,
  p_slug text default null,
  p_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ponto extensions.geography;
  v_dest uuid;
  v_out jsonb := '{}'::jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os lotes mapeados.' using errcode = '42501';
  end if;

  if p_latitude is not null and p_longitude is not null then
    v_ponto := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
    v_dest := public.nearest_destination(p_latitude, p_longitude);
  end if;

  -- Destino sugerido pela geo, o mesmo caminho do trigger. Preencher destino à mão em dezenas
  -- de lotes é onde entra erro.
  v_out := v_out || jsonb_build_object(
    'suggested_destination',
    (
      select jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'distance_m', round(st_distance(v_ponto, d.geog)::numeric, 0)
      )
      from public.destination d
      where d.id = v_dest
    )
  );

  -- Colisão de google_place_id: com unidade viva é parceiro ativo (não mapear), com outra ficha
  -- é duplicata da carga.
  v_out := v_out || jsonb_build_object(
    'place_id_conflict',
    case
      when coalesce(btrim(p_google_place_id), '') = '' then null
      else coalesce(
        (
          select jsonb_build_object('kind', 'location', 'name', l.name)
          from public.location l
          where l.google_place_id = btrim(p_google_place_id)
            and l.deleted_at is null
          limit 1
        ),
        (
          select jsonb_build_object('kind', 'prospect', 'name', p.name)
          from public.prospect_location p
          where p.google_place_id = btrim(p_google_place_id)
            and (p_id is null or p.id <> p_id)
          limit 1
        )
      )
    end
  );

  -- Colisão de slug: o trigger já recusa na gravação, mas errar só no submit desperdiça o
  -- preenchimento inteiro do formulário.
  v_out := v_out || jsonb_build_object(
    'slug_conflict',
    case
      when coalesce(btrim(p_slug), '') = '' then null
      else coalesce(
        (
          select jsonb_build_object('kind', 'location', 'name', l.name)
          from public.location l
          where l.slug = btrim(p_slug) and l.deleted_at is null
          limit 1
        ),
        (
          select jsonb_build_object('kind', 'prospect', 'name', p.name)
          from public.prospect_location p
          where p.slug = btrim(p_slug) and (p_id is null or p.id <> p_id)
          limit 1
        )
      )
    end
  );

  -- Vizinhança de 150 m: pega o caso sem place_id, que hoje é a regra (nenhuma `location` tem
  -- place_id gravado). Aviso, não bloqueio.
  v_out := v_out || jsonb_build_object(
    'nearby',
    coalesce(
      (
        select jsonb_agg(x order by x->>'distance_m')
        from (
          select jsonb_build_object(
            'kind', 'location',
            'name', l.name,
            'distance_m', round(st_distance(v_ponto, l.geog)::numeric, 0)
          ) as x
          from public.location l
          where v_ponto is not null
            and l.deleted_at is null
            and l.geog is not null
            and st_dwithin(l.geog, v_ponto, 150)
          union all
          select jsonb_build_object(
            'kind', 'prospect',
            'name', p.name,
            'distance_m', round(st_distance(v_ponto, p.geog)::numeric, 0)
          )
          from public.prospect_location p
          where v_ponto is not null
            and (p_id is null or p.id <> p_id)
            and st_dwithin(p.geog, v_ponto, 150)
        ) vizinhos
      ),
      '[]'::jsonb
    )
  );

  return v_out;
end;
$$;

comment on function public.manager_prospect_location_precheck(numeric, numeric, text, text, uuid) is
  'E0.17-h: sugere o destino por nearest_destination() e avisa de colisão de place_id, de slug e de vizinhança (D-009). Avisa, não decide.';

revoke all on function public.manager_prospect_location_precheck(numeric, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.manager_prospect_location_precheck(numeric, numeric, text, text, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Criar e editar.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_prospect_location_save(
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
  p_is_published boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid := p_id;
  v_convertida timestamptz;
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

  if v_id is null then
    insert into public.prospect_location (
      destination_id, name, slug, address, phone, latitude, longitude,
      google_place_id, google_maps_url, amenities, description, data_source, is_published
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
      coalesce(p_is_published, false)
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
    is_published    = coalesce(p_is_published, false)
  where id = v_id;

  return v_id;
end;
$$;

comment on function public.manager_prospect_location_save(uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean) is
  'E0.17-h: cria ou edita um lote mapeado. Recusa publicar sem endereço e recusa editar ficha já convertida.';

revoke all on function public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean
) from public, anon;
grant execute on function public.manager_prospect_location_save(
  uuid, text, text, numeric, numeric, uuid, text, text, text, text, text, jsonb, text, boolean
) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ações de linha: publicar/despublicar, marcar notificado, marcar revisado.
--
-- Separadas do save porque são o trabalho recorrente da curadoria e não devem exigir abrir e
-- reenviar o formulário inteiro. Cada parâmetro é tri-estado: `null` não mexe.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_prospect_location_set_state(
  p_id uuid,
  p_is_published boolean default null,
  p_notified boolean default null,
  p_reviewed boolean default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_endereco text;
  v_convertida timestamptz;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os lotes mapeados.' using errcode = '42501';
  end if;

  select pl.address, pl.converted_at into v_endereco, v_convertida
  from public.prospect_location pl
  where pl.id = p_id;

  if not found then
    raise exception 'Lote mapeado não encontrado.' using errcode = 'P0001';
  end if;

  if v_convertida is not null then
    raise exception 'Esta ficha já virou parceiro e não é mais editável.' using errcode = 'P0001';
  end if;

  if p_is_published and coalesce(btrim(coalesce(v_endereco, '')), '') = '' then
    raise exception 'Não dá para publicar sem endereço: ficha sem endereço na página de destino é thin content.'
      using errcode = 'P0001';
  end if;

  update public.prospect_location set
    is_published      = coalesce(p_is_published, is_published),
    notified_owner_at = case
                          when p_notified is null then notified_owner_at
                          when p_notified then now()
                          else null
                        end,
    last_reviewed_at  = case
                          when p_reviewed is null then last_reviewed_at
                          when p_reviewed then now()
                          else null
                        end
  where id = p_id;
end;
$$;

comment on function public.manager_prospect_location_set_state(uuid, boolean, boolean, boolean) is
  'E0.17-h: ações de linha da curadoria (publicar, notificado, revisado). Parâmetro null não mexe no campo.';

revoke all on function public.manager_prospect_location_set_state(uuid, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.manager_prospect_location_set_state(uuid, boolean, boolean, boolean)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Excluir.
--
-- Delete de verdade, que é justamente a graça de a tabela não ter FK de booking apontando para
-- ela. A confirmação mora na tela, porque a URL tinha ranking.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.manager_prospect_location_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_convertida timestamptz;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para os lotes mapeados.' using errcode = '42501';
  end if;

  select pl.converted_at into v_convertida
  from public.prospect_location pl
  where pl.id = p_id;

  if not found then
    raise exception 'Lote mapeado não encontrado.' using errcode = 'P0001';
  end if;

  -- Apagar ficha convertida joga fora a procedência, que é o número que responde se o épico
  -- valeu: quantos dos mapeados viraram parceiro.
  if v_convertida is not null then
    raise exception 'Esta ficha já virou parceiro; apagá-la joga fora a procedência da conversão.'
      using errcode = 'P0001';
  end if;

  delete from public.prospect_location where id = p_id;
end;
$$;

comment on function public.manager_prospect_location_delete(uuid) is
  'E0.17-h: exclui um lote mapeado. Recusa ficha convertida, que guarda a procedência.';

revoke all on function public.manager_prospect_location_delete(uuid) from public, anon;
grant execute on function public.manager_prospect_location_delete(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Destino do redirecionamento da ficha convertida (E0.17-i, a parte que não foi adiada).
--
-- A E0.17-g passou a carimbar a conversão, então a ficha convertida já é possível hoje. Sem este
-- mapa, a URL que tinha ranking cai no fallback de SPA do Worker e responde 200 com o shell
-- vazio: um soft 404, pior que 404 e muito pior que redirecionar.
--
-- É `security definer` e concedida a `anon` de propósito: quem consulta é o Worker, com a anon
-- key, e a RLS esconde ficha convertida justamente de quem tem essa chave. O que a função revela
-- é só a URL pública da unidade que nasceu dali; nada que a página do parceiro já não mostre.
--
-- Quando a unidade ainda não está listada (converter não publica oferta: ela nasce inativa e sem
-- tipo de vaga), o destino é a página do destino e o redirecionamento é TEMPORÁRIO. Marcar 301
-- para um endereço de passagem cravaria no cache do navegador e do Google um destino que vai
-- mudar assim que o parceiro publicar.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.prospect_redirect_target(
  p_destination_slug text,
  p_slug text
) returns table (target text, permanent boolean)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    coalesce(publicada.url, '/destinos/' || d.slug),
    publicada.url is not null
  from public.prospect_location p
  join public.destination d on d.id = p.destination_id
  left join lateral (
    -- A URL canônica da unidade é /p/<empresa>/<unidade>/<código do tipo>, e o mesmo par de
    -- filtros do getStaticPaths do listing: tipo ativo e unidade listada. Ordenado por código
    -- para o redirecionamento não trocar de destino entre um build e outro.
    --
    -- Faltou `status = 'active'` aqui, e a correção está em 20261017093000: a policy pública
    -- exige os três, então sem ele o 301 podia apontar para página que a RLS recusa.
    select '/p/' || c.slug || '/' || l.slug || '/' || pt.code as url
    from public.location l
    join public.company c on c.id = l.company_id
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where l.id = p.converted_location_id
      and l.deleted_at is null
      and l.is_listed
      and lpt.is_active
    order by pt.code
    limit 1
  ) publicada on true
  where p.slug = p_slug
    and d.slug = p_destination_slug
    and p.converted_at is not null;
$$;

comment on function public.prospect_redirect_target(text, text) is
  'E0.17-i: para onde a URL da ficha convertida deve apontar. Zero linhas quando não há conversão. permanent=false enquanto a unidade não está listada, porque o destino final ainda vai mudar.';

revoke all on function public.prospect_redirect_target(text, text) from public;
grant execute on function public.prospect_redirect_target(text, text) to anon, authenticated, service_role;
