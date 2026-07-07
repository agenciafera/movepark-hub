-- PRD-08.8 — Contexto de estadia no card de avaliação ("estacionou de X a Y").
-- O RLS de `booking` bloqueia o join público a partir do read anônimo de `review`
-- (useLocationReviews lê is_published=true). Por isso denormalizamos o período da
-- estadia no próprio `review` (colunas nulas; backfill + preenchimento no submit_review).

alter table public.review
  add column if not exists stay_check_in timestamptz,
  add column if not exists stay_check_out timestamptz;

comment on column public.review.stay_check_in is
  'Snapshot do booking.check_in_at (PRD-08.8) — exibido como contexto no card, sem expor booking via RLS.';
comment on column public.review.stay_check_out is
  'Snapshot do booking.check_out_at (PRD-08.8).';

-- submit_review agora também snapshota o período da estadia (insert e update).
create or replace function public.submit_review(
  p_booking_id uuid, p_rating integer, p_comment text,
  p_cleanliness integer, p_service integer, p_value integer, p_access integer
) returns uuid language plpgsql security definer set search_path to 'public' as $fs$
declare
  v_location_id uuid; v_profile uuid; v_status text; v_id uuid;
  v_check_in timestamptz; v_check_out timestamptz;
begin
  select b.location_id, b.profile_id, b.status::text, b.check_in_at, b.check_out_at
    into v_location_id, v_profile, v_status, v_check_in, v_check_out
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
     rating_cleanliness, rating_service, rating_value, rating_access, is_published,
     stay_check_in, stay_check_out)
  values
    (p_booking_id, v_profile, v_location_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''),
     p_cleanliness, p_service, p_value, p_access, true,
     v_check_in, v_check_out)
  on conflict (booking_id) do update set
    rating             = excluded.rating,
    comment            = excluded.comment,
    rating_cleanliness = excluded.rating_cleanliness,
    rating_service     = excluded.rating_service,
    rating_value       = excluded.rating_value,
    rating_access      = excluded.rating_access,
    is_published       = true,
    stay_check_in      = excluded.stay_check_in,
    stay_check_out     = excluded.stay_check_out,
    updated_at         = now()
  returning id into v_id;
  return v_id;
end; $fs$;

-- Backfill das reviews existentes a partir do booking de origem.
update public.review r
   set stay_check_in  = b.check_in_at,
       stay_check_out = b.check_out_at
  from public.booking b
 where b.id = r.booking_id
   and (r.stay_check_in is null or r.stay_check_out is null);
