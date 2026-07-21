-- A chave de dedup do consumidor ignorava a tarifa (86ajmycpc).
--
-- Regressão de 20260825000000: a chave derivada cobria só (profile, vaga, entrada, saída). O cliente
-- criava uma pending na Básica, voltava e escolhia Superflex para a mesma vaga e as mesmas datas, e
-- recebia um replay silencioso da reserva Básica. Ele achava que tinha comprado Superflex e ficava
-- com o preço e a janela de cancelamento da Básica (24h em vez de 1 minuto antes), descobrindo só na
-- hora de cancelar. O mesmo valia para add-ons, passageiros, veículo e cupom.
--
-- A chave existe para pegar duplo-envio IDÊNTICO, não para colapsar escolhas diferentes. Agora ela
-- cobre tudo que define o que o cliente comprou. `p_origin` fica de fora de propósito: é telemetria
-- de canal, não muda a compra.
--
-- Nulos: cada parte entra com coalesce para um sentinela, porque em Postgres `'a' || null` é null e
-- a chave inteira viraria null (os parâmetros novos são quase todos anuláveis). add_on_ids entra
-- ordenado, para que a mesma cesta em ordem diferente gere a mesma chave.

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
  p_fare_tier public.fare_tier default 'basica'
) returns jsonb language plpgsql security definer set search_path to 'public' as $cba$
declare
  v_dedup_key text;
  v_existing public.booking;
  v_res jsonb;
begin
  if p_profile_id is not null then
    -- Chave derivada: idêntica entre duplo-envios; distinta por qualquer mudança na compra.
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

    -- Serializa idênticas concorrentes: a 2ª espera a 1ª commitar antes de checar a pending.
    perform pg_advisory_xact_lock(hashtextextended('mp_booking_dedup:' || v_dedup_key, 0));

    select * into v_existing from public.booking
    where profile_id = p_profile_id
      and idempotency_key = v_dedup_key
      and status = 'pending'
      and (expires_at is null or expires_at > now())
      and deleted_at is null
    order by created_at desc
    limit 1;

    if v_existing.id is not null then
      -- Replay: devolve a reserva viva com o mesmo shape que o checkout/MCP já consomem.
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
end; $cba$;

-- Assinatura inalterada: os grants de 20260717 (authenticated, service_role) permanecem.
