-- A deduplicação do consumidor travava o segundo carro da mesma conta (09/11/2026).
--
-- Caso real: o cliente quer reservar, na mesma conta, o carro dele e o de um parente para as mesmas
-- datas e a mesma unidade. O site e a Mia (MCP /customer) criam a reserva SEM veículo e só depois
-- vinculam a placa (checkout ou set_booking_vehicle). Então as duas chamadas chegavam aqui com
-- `p_vehicle_id` nulo, geravam a mesma chave derivada e, enquanto a 1ª estava pendente, a 2ª
-- recebia replay da 1ª. Pela Mia era pior: ao vincular a placa do segundo carro, ela trocava a
-- placa da primeira reserva, e o cliente ficava com uma vaga só.
--
-- Prova no banco: nenhuma conta tinha duas reservas pagas sobrepostas na mesma unidade.
-- O white-label não tem esse problema: a regra dele (getHasDuplicateOrder) já compara a placa.
--
-- Correção: o replay agora exige que a reserva pendente esteja com o MESMO veículo pedido agora
-- (`vehicle_id is not distinct from p_vehicle_id`). O duplo-envio continua coberto: as duas
-- chamadas idênticas chegam antes de qualquer placa e caem na mesma reserva. Já a reserva que
-- recebeu a placa de um carro não é mais devolvida a quem pede outra sem placa: nasce outra.
-- A chave e o resto da função ficam iguais a 20260827000000.

create or replace function public.create_booking_atomic(
  p_profile_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone,
  p_passenger_count integer default null,
  p_has_pcd boolean default false,
  p_vehicle_id uuid default null,
  p_add_on_ids uuid[] default null,
  p_coupon_code text default null,
  p_origin text default null,
  p_fare_tier fare_tier default 'basica'::fare_tier
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dedup_key text;
  v_existing public.booking;
  v_res jsonb;
begin
  if p_profile_id is not null then
    v_dedup_key := md5(
      p_profile_id::text || '|' ||
      p_location_parking_type_id::text || '|' ||
      p_check_in_at::text || '|' ||
      p_check_out_at::text || '|' ||
      coalesce(p_fare_tier::text, 'basica') || '|' ||
      coalesce(p_passenger_count::text, '~') || '|' ||
      coalesce(p_has_pcd::text, 'false') || '|' ||
      coalesce(p_vehicle_id::text, '~') || '|' ||
      coalesce((select string_agg(x::text, ',' order by x::text)
                from unnest(p_add_on_ids) as x), '~') || '|' ||
      coalesce(p_coupon_code, '~'));

    perform pg_advisory_xact_lock(hashtextextended('mp_booking_dedup:' || v_dedup_key, 0));

    select * into v_existing from public.booking
    where profile_id = p_profile_id
      and idempotency_key = v_dedup_key
      and status = 'pending'
      and (expires_at is null or expires_at > now())
      and deleted_at is null
      -- Só é a mesma compra se o carro for o mesmo. A pendente que já ganhou a placa de um carro
      -- não serve para quem está reservando outro (o segundo carro da mesma conta).
      and vehicle_id is not distinct from p_vehicle_id
    order by created_at desc
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'code', v_existing.code,
        'booking_id', v_existing.id,
        'total_amount', v_existing.total_amount,
        'days', greatest(
          1,
          ceil(extract(epoch from (v_existing.check_out_at - v_existing.check_in_at))::numeric
               / 60 / (60 * 24))::int),
        'expires_at', v_existing.expires_at,
        'status', v_existing.status,
        'fare_tier', v_existing.fare_tier,
        'price_breakdown', v_existing.price_breakdown,
        'line_items', coalesce(v_existing.price_breakdown -> 'line_items', '[]'::jsonb),
        'idempotent_replay', true);
    end if;
  end if;

  v_res := public._create_booking_core(
    p_profile_id, null, null, null, null,
    p_location_parking_type_id, p_check_in_at, p_check_out_at,
    p_passenger_count, p_has_pcd, p_vehicle_id, p_add_on_ids, p_coupon_code, p_origin, p_fare_tier);

  if p_profile_id is not null then
    update public.booking set idempotency_key = v_dedup_key
    where id = (v_res ->> 'booking_id')::uuid;
  end if;

  return v_res;
end; $function$;
