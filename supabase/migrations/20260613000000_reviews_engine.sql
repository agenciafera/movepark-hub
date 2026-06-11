-- Reviews (PRD-08 Fase 1): agregado cacheado por unidade, resposta do dono,
-- RPCs de submissão/resposta, e automação de "completar reserva" (pg_cron) que
-- destrava a coleta pós-estadia. Moderação pós-publicação (is_published default true).
-- Tabela `review` já existe no baseline. Dollar-quotes nomeados; %% em RAISE.

-- 1) Agregado cacheado na location -------------------------------------------
alter table public.location
  add column if not exists review_avg   numeric(2,1),
  add column if not exists review_count integer not null default 0;

-- 2) Resposta do dono + idempotência da coleta -------------------------------
alter table public.review
  add column if not exists owner_response    text,
  add column if not exists owner_response_at timestamptz;
alter table public.booking
  add column if not exists review_request_sent_at timestamptz;

-- 3) Recompute do agregado (só publicados) -----------------------------------
create or replace function public.review_recompute_location(p_location_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fr$
begin
  update public.location l set
    review_count = coalesce(sub.cnt, 0),
    review_avg   = sub.avg
  from (
    select count(*) as cnt, round(avg(rating)::numeric, 1) as avg
    from public.review where location_id = p_location_id and is_published
  ) sub
  where l.id = p_location_id;
end; $fr$;

create or replace function public.review_bump_location_rating()
returns trigger language plpgsql security definer set search_path to 'public' as $fb$
begin
  if tg_op = 'DELETE' then
    perform public.review_recompute_location(old.location_id);
    return old;
  end if;
  perform public.review_recompute_location(new.location_id);
  if tg_op = 'UPDATE' and new.location_id is distinct from old.location_id then
    perform public.review_recompute_location(old.location_id);
  end if;
  return new;
end; $fb$;

drop trigger if exists review_bump_rating on public.review;
create trigger review_bump_rating
  after insert or update or delete on public.review
  for each row execute function public.review_bump_location_rating();

-- backfill das locations que já têm review
do $bf$ declare r record; begin
  for r in select distinct location_id from public.review loop
    perform public.review_recompute_location(r.location_id);
  end loop;
end $bf$;

-- 4) Submissão de avaliação (cliente, reserva própria completed) --------------
create or replace function public.submit_review(
  p_booking_id uuid, p_rating integer, p_comment text,
  p_cleanliness integer, p_service integer, p_value integer, p_access integer
) returns uuid language plpgsql security definer set search_path to 'public' as $fs$
declare v_location_id uuid; v_profile uuid; v_status text; v_id uuid;
begin
  select b.location_id, b.profile_id, b.status::text
    into v_location_id, v_profile, v_status
  from public.booking b where b.id = p_booking_id;
  if v_location_id is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if v_profile <> auth.uid() then
    raise exception 'Você só pode avaliar suas próprias reservas.' using errcode = '42501';
  end if;
  if v_status <> 'completed' then
    raise exception 'Só é possível avaliar após a estadia.' using errcode = 'P0001';
  end if;
  if coalesce(p_rating, 0) < 1 or p_rating > 5 then
    raise exception 'A nota deve ser de 1 a 5.' using errcode = 'P0001';
  end if;

  insert into public.review
    (booking_id, profile_id, location_id, rating, comment,
     rating_cleanliness, rating_service, rating_value, rating_access, is_published)
  values
    (p_booking_id, v_profile, v_location_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''),
     p_cleanliness, p_service, p_value, p_access, true)
  on conflict (booking_id) do update set
    rating             = excluded.rating,
    comment            = excluded.comment,
    rating_cleanliness = excluded.rating_cleanliness,
    rating_service     = excluded.rating_service,
    rating_value       = excluded.rating_value,
    rating_access      = excluded.rating_access,
    is_published       = true,
    updated_at         = now()
  returning id into v_id;
  return v_id;
end; $fs$;

-- 5) Resposta do dono (operator/hub_admin) -----------------------------------
create or replace function public.operator_respond_review(p_review_id uuid, p_response text)
returns void language plpgsql security definer set search_path to 'public' as $fo$
declare v_company_id uuid; v_resp text;
begin
  select l.company_id into v_company_id
  from public.review r join public.location l on l.id = r.location_id
  where r.id = p_review_id;
  if v_company_id is null then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and not exists (
    select 1 from public.profile_company where profile_id = auth.uid() and company_id = v_company_id
  ) then
    raise exception 'Sem permissão para responder avaliações desta empresa.' using errcode = '42501';
  end if;
  v_resp := nullif(trim(coalesce(p_response, '')), '');
  update public.review set
    owner_response    = v_resp,
    owner_response_at = case when v_resp is null then null else now() end
  where id = p_review_id;
end; $fo$;

-- 6) Automação: completar reserva após o check-out (destrava coleta) ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.cron_complete_bookings()
returns integer language plpgsql security definer set search_path to 'public' as $fc$
declare n integer;
begin
  update public.booking
    set status = 'completed'
  where check_out_at < now()
    and status in ('confirmed', 'checked_in');
  get diagnostics n = row_count;
  return n;
end; $fc$;

-- agenda horária (upsert por jobname)
select cron.schedule('complete-bookings-hourly', '0 * * * *',
  $$ select public.cron_complete_bookings(); $$);

-- Job de coleta (e-mail) → chama a edge `review-request` via pg_net. Requer o
-- segredo no Vault (one-time): select vault.create_secret('<service_role_jwt>','review_request_key');
-- e a URL da function. Criado só se o segredo existir, p/ a migration não falhar.
do $cr$
declare v_key text; v_url text := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/review-request';
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'review_request_key';
  exception when others then v_key := null; end;
  if v_key is not null then
    perform cron.schedule('review-request-hourly', '15 * * * *', format(
      $job$ select net.http_post(url := %L, headers := jsonb_build_object(
        'Content-Type','application/json','Authorization','Bearer ' || %L)) $job$, v_url, v_key));
  else
    raise notice 'review-request cron NÃO agendado: defina o segredo Vault review_request_key.';
  end if;
end $cr$;

-- 7) Grants ------------------------------------------------------------------
revoke all on function public.submit_review(uuid, integer, text, integer, integer, integer, integer) from public;
grant all on function public.submit_review(uuid, integer, text, integer, integer, integer, integer) to authenticated, service_role;
revoke all on function public.operator_respond_review(uuid, text) from public;
grant all on function public.operator_respond_review(uuid, text) to authenticated, service_role;
