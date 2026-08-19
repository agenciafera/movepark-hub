-- Auditoria de endereço: gravação do veredito do Google, com a distância calculada no banco.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- Por que uma RPC e não um upsert direto da Edge: o sinal que decide tudo é `drift_m`, a
-- distância entre o pino que temos e o que o Google devolveu, e distância é PostGIS (ADR-001)
-- e nunca haversine em TS no Edge. A Edge busca no Google e repassa os números; quem mede a
-- distância e classifica ok/divergente é o Postgres, onde a regra fica testável em pgTAP.
--
-- Classificação:
--   ok         → o pino do Google está dentro de `drift_alert_meters` E o endereço bate.
--   divergent  → pino longe demais OU endereço textual diferente. Vai para revisão humana.
--   no_match   → a Edge não achou candidato que passasse no critério de aceite.
--   error      → falha de rede/API. Preserva o veredito anterior (erro não apaga prova).

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
begin
  if p_status not in ('ok', 'divergent', 'no_match', 'error') then
    raise exception 'Status inválido: %', p_status using errcode = 'P0001';
  end if;

  select * into v_loc from public.location where id = p_location_id and deleted_at is null;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;

  -- Falha de API só carimba o erro: o veredito bom que estava ali continua valendo, do mesmo
  -- jeito que google-place-refresh preserva o snapshot quando o Google cai.
  if p_status = 'error' then
    update public.location_address_audit
       set verify_status = 'error',
           fetch_error = p_error,
           verified_at = now()
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
      p_location_id, 'no_match', now(), null,
      null, null, null, null, null, null, null, null, null
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

  -- Distância entre os dois pinos, em metros, no banco (ADR-001).
  if v_loc.geog is not null and p_latitude is not null and p_longitude is not null then
    v_drift := round(
      st_distance(
        v_loc.geog,
        st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
      )::numeric,
      1
    );
  end if;

  -- Endereço textual: compara a porta (logradouro + número normalizados), não a string
  -- inteira, porque o Google escreve bairro e CEP do jeito dele e isso não é divergência.
  v_addr_diff := p_address is not null
    and left(coalesce(public.location_address_key(v_loc.address), ''), 18)
        is distinct from left(coalesce(public.location_address_key(p_address), ''), 18);

  v_status := case
    when v_drift is null then 'divergent'          -- sem pino nosso para comparar: alguém olha
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
        -- Um veredito novo reabre a revisão, menos quando alguém já aplicou a correção: nesse
        -- caso o "ok" que vem depois é a confirmação de que a correção pegou.
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

comment on function public.location_address_audit_record(uuid, text, text, text, text, numeric, numeric, text, text, numeric, text) is
  'Grava o veredito do Google para uma unidade. A Edge repassa o que achou; a distância entre os pinos e a classificação ok/divergente são calculadas aqui (ADR-001).';

revoke all on function public.location_address_audit_record(uuid, text, text, text, text, numeric, numeric, text, text, numeric, text) from public;
grant execute on function public.location_address_audit_record(uuid, text, text, text, text, numeric, numeric, text, text, numeric, text) to service_role;

-- ── Fila da verificação ───────────────────────────────────────────────────────────────────
-- Quem a Edge deve consultar nesta passada: nunca verificada, ou verificada há mais de
-- `verify_after_days`. Fica no banco (e não em TS na Edge) para o critério de vencimento ser
-- um só, igual ao selectStale do google-place-refresh, e testável.

create or replace function public.location_address_audit_queue(p_limit integer default 50)
returns table (
  location_id uuid,
  location_name text,
  address text,
  latitude numeric,
  longitude numeric,
  google_place_id text,
  destination_code text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    l.id,
    l.name,
    l.address,
    l.latitude,
    l.longitude,
    l.google_place_id,
    d.code
  from public.location l
  left join public.destination d on d.id = l.destination_id
  left join public.location_address_audit a on a.location_id = l.id
  where l.deleted_at is null
    and (
      a.verified_at is null
      or a.verified_at < now() - make_interval(
        days => coalesce((public.location_address_audit_policy()->>'verify_after_days')::int, 90)
      )
    )
  order by l.is_listed desc, a.verified_at asc nulls first
  limit greatest(p_limit, 1);
$$;

comment on function public.location_address_audit_queue(integer) is
  'Unidades que a Edge de auditoria deve verificar nesta passada (nunca verificadas ou vencidas).';

revoke all on function public.location_address_audit_queue(integer) from public;
grant execute on function public.location_address_audit_queue(integer) to service_role;
