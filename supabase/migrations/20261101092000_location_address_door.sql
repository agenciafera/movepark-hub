-- Auditoria de endereço: comparar a PORTA, não um prefixo de tamanho fixo.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- A primeira versão comparava os 18 primeiros caracteres normalizados do endereço. Errado, e o
-- teste pegou: "Rua Teste, 100 - Bairro" e "Rua Teste, 100 - Outro Bairro" (o mesmo lugar, com
-- o bairro escrito do jeito do Google) caíam dentro dos 18 caracteres e viravam divergência
-- falsa. Divergência falsa é pior que inútil: enche a fila de revisão de coisa certa e o
-- revisor para de ler a lista.
--
-- O que identifica a porta é logradouro + número. Tudo depois disso (bairro, cidade, CEP,
-- complemento) é onde a variação de escrita mora e não distingue endereço nenhum. Então a
-- chave passa a ser o texto normalizado ATÉ o primeiro número, inclusive:
--
--   "Av. Novo Brasil, 954 - Cidade Industrial Satélite"            -> avnovobrasil954
--   "Av. Novo Brasil, 954 - Cidade Industrial de São Paulo, ..."   -> avnovobrasil954
--   "Rua Teste, 100 - Bairro, Cidade - SP, 01000-000"              -> ruateste100
--   "Rod. Santos Dumont, km 66 - Vila Aeroporto, Campinas - SP"    -> rodsantosdumontkm66
--
-- Endereço sem número nenhum devolve null: aí quem fala é a flag `endereco_sem_numero`, e
-- comparar duas unidades por "avrochapombosn" produziria falso duplicado entre lotes que só
-- copiaram o endereço do aeroporto.

create or replace function public.location_address_door(p_address text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select nullif(
    regexp_replace(
      lower(translate(
        coalesce((regexp_match(coalesce(p_address, ''), '^(.*?\d{1,6})'))[1], ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      )),
      '[^a-z0-9]', '', 'g'
    ),
    ''
  );
$$;

comment on function public.location_address_door(text) is
  'A porta do endereço (logradouro + número, normalizado). Null quando o endereço não traz número. É a chave de comparação da auditoria.';

-- ── Triagem: duplicado passa a ser mesma porta ────────────────────────────────────────────

create or replace function public.location_address_scan()
returns integer
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_policy jsonb := public.location_address_audit_policy();
  v_max_air numeric := coalesce((v_policy->>'max_km_airport')::numeric, 15);
  v_max_other numeric := coalesce((v_policy->>'max_km_other')::numeric, 12);
  v_pin_dup numeric := coalesce((v_policy->>'pin_dup_meters')::numeric, 50);
  v_count integer;
begin
  with base as (
    select
      l.id,
      l.address,
      l.latitude,
      l.longitude,
      l.geog,
      l.destination_id,
      l.google_place_id,
      d.type::text as dest_type,
      case when l.geog is not null and d.geog is not null
        then st_distance(l.geog, d.geog) / 1000.0 end as dist_km,
      public.location_address_door(l.address) as door
    from public.location l
    left join public.destination d on d.id = l.destination_id
    where l.deleted_at is null
  ),
  flagged as (
    select
      b.id,
      array_remove(array[
        case when b.latitude is null or b.longitude is null then 'sem_geo' end,
        case when b.destination_id is null and b.latitude is not null then 'sem_destino' end,
        case when b.google_place_id is null then 'sem_place_id' end,
        case when b.google_place_id is not null and b.google_place_id not like 'ChIJ%'
          then 'place_id_nao_e_estabelecimento' end,
        case when b.dist_km is not null and b.dest_type = 'airport' and b.dist_km > v_max_air
          then 'longe_do_destino' end,
        case when b.dist_km is not null and b.dest_type <> 'airport' and b.dist_km > v_max_other
          then 'longe_do_destino' end,
        case when b.address is null or length(trim(b.address)) < 12 then 'endereco_incompleto' end,
        case when b.door is null then 'endereco_sem_numero' end,
        case when exists (
          select 1 from base o
          where o.id <> b.id and b.door is not null and o.door = b.door
        ) then 'endereco_duplicado' end,
        case when exists (
          select 1 from base o
          where o.id <> b.id
            and o.geog is not null and b.geog is not null
            and st_dwithin(o.geog, b.geog, v_pin_dup)
        ) then 'pino_duplicado' end
      ], null) as flags
    from base b
  )
  insert into public.location_address_audit as a (location_id, flags, scanned_at)
  select f.id, f.flags, now() from flagged f
  on conflict (location_id) do update
    set flags = excluded.flags,
        scanned_at = excluded.scanned_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── Veredito: divergência de endereço passa a ser divergência de porta ────────────────────

create or replace function public.location_address_audit_record(
  p_location_id uuid,
  p_status text,
  p_place_id text default null,
  p_name text default null,
  p_address text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_maps_url text default null,
  p_business_status text default null,
  p_name_similarity numeric default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_policy jsonb := public.location_address_audit_policy();
  v_alert numeric := coalesce((v_policy->>'drift_alert_meters')::numeric, 250);
  v_loc public.location%rowtype;
  v_drift numeric;
  v_status text;
  v_addr_diff boolean;
  v_door_nosso text;
  v_door_google text;
begin
  if p_status not in ('ok', 'divergent', 'no_match', 'error') then
    raise exception 'Status inválido: %', p_status using errcode = 'P0001';
  end if;

  select * into v_loc from public.location where id = p_location_id and deleted_at is null;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;

  if p_status = 'error' then
    update public.location_address_audit
       set verify_status = 'error', fetch_error = p_error, verified_at = now()
     where location_id = p_location_id;
    if not found then
      insert into public.location_address_audit (location_id, verify_status, fetch_error, verified_at)
      values (p_location_id, 'error', p_error, now());
    end if;
    return jsonb_build_object('status', 'error');
  end if;

  if p_status = 'no_match' then
    insert into public.location_address_audit as a (
      location_id, verify_status, verified_at, fetch_error,
      match_place_id, match_name, match_address, match_latitude, match_longitude,
      match_maps_url, match_business_status, name_similarity, drift_m
    ) values (
      p_location_id, 'no_match', now(), null, null, null, null, null, null, null, null, null, null
    )
    on conflict (location_id) do update
      set verify_status = 'no_match',
          verified_at = now(),
          fetch_error = null,
          match_place_id = null,
          match_name = null,
          match_address = null,
          match_latitude = null,
          match_longitude = null,
          match_maps_url = null,
          match_business_status = null,
          name_similarity = null,
          drift_m = null,
          decision = case when a.decision = 'applied' then a.decision else 'pending' end;
    return jsonb_build_object('status', 'no_match');
  end if;

  if v_loc.geog is not null and p_latitude is not null and p_longitude is not null then
    v_drift := round(
      st_distance(
        v_loc.geog,
        st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
      )::numeric,
      1
    );
  end if;

  -- Porta contra porta. Endereço sem número dos dois lados não conta como divergência: a flag
  -- `endereco_sem_numero` já cobre esse caso e o drift decide sozinho.
  v_door_nosso := public.location_address_door(v_loc.address);
  v_door_google := public.location_address_door(p_address);
  v_addr_diff := v_door_nosso is not null
    and v_door_google is not null
    and v_door_nosso is distinct from v_door_google;

  v_status := case
    when v_drift is null then 'divergent'
    when v_drift > v_alert then 'divergent'
    when v_addr_diff then 'divergent'
    else 'ok'
  end;

  insert into public.location_address_audit as a (
    location_id, verify_status, verified_at, fetch_error,
    match_place_id, match_name, match_address, match_latitude, match_longitude,
    match_maps_url, match_business_status, name_similarity, drift_m
  ) values (
    p_location_id, v_status, now(), null,
    p_place_id, p_name, p_address, p_latitude, p_longitude,
    p_maps_url, p_business_status, p_name_similarity, v_drift
  )
  on conflict (location_id) do update
    set verify_status = v_status,
        verified_at = now(),
        fetch_error = null,
        match_place_id = excluded.match_place_id,
        match_name = excluded.match_name,
        match_address = excluded.match_address,
        match_latitude = excluded.match_latitude,
        match_longitude = excluded.match_longitude,
        match_maps_url = excluded.match_maps_url,
        match_business_status = excluded.match_business_status,
        name_similarity = excluded.name_similarity,
        drift_m = excluded.drift_m,
        decision = case
          when a.decision = 'applied' and v_status = 'ok' then 'applied'
          else 'pending'
        end,
        decision_note = case
          when a.decision = 'applied' and v_status = 'ok' then a.decision_note
          else null
        end;

  return jsonb_build_object('status', v_status, 'drift_m', v_drift);
end;
$$;

revoke all on function public.location_address_audit_record(uuid, text, text, text, text, numeric, numeric, text, text, numeric, text) from public;
grant execute on function public.location_address_audit_record(uuid, text, text, text, text, numeric, numeric, text, text, numeric, text) to service_role;
