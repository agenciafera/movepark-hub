-- Idempotência do consumidor em create_booking_atomic (achado H1 / §16-1 de
-- docs/specs/customer/agent-test-scenarios.md).
--
-- Problema: o create_booking do consumidor (chatbot/agente MCP e checkout web) não manda
-- idempotency_key. Dois "reserva" seguidos (ou um duplo-submit no checkout) criavam DUAS reservas
-- pending idênticas, e cada pending segura vaga real até o cron de expiração rodar.
--
-- O parceiro já é idempotente por chave EXPLÍCITA (api_create_booking, keyed em api_key). Mas um
-- modelo não tem por que inventar uma idempotency_key estável entre duas mensagens, então expor o
-- campo não protegeria o caso real. Aqui a chave é DERIVADA no servidor de
-- (profile, tipo de vaga, entrada, saída) e guardada na mesma coluna booking.idempotency_key.
--
-- Escopo: só o wrapper do consumidor (create_booking_atomic). A API (api_create_booking) mantém a
-- idempotência por chave explícita, e o núcleo (_create_booking_core) fica intacto. Assinatura
-- inalterada → sem drop, sem re-grant, sem mudança no database.ts.
--
-- Janela: a vida do hold (status='pending' e não expirado). Cobre o duplo-envio; uma re-reserva
-- legítima das mesmas datas DEPOIS que a 1ª expira/confirma continua criando reserva nova (não há
-- unique constraint que trave isso — a coluna idempotency_key aqui é dica de dedup, não trava).
--
-- Corrida: pg_advisory_xact_lock serializa requisições idênticas quase-simultâneas — a 2ª transação
-- espera a 1ª commitar e então enxerga a pending recém-criada, devolvendo-a (idempotent_replay).

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
    -- Chave derivada: idêntica entre duplo-envios; distinta por vaga/datas.
    v_dedup_key := md5(
      p_profile_id::text || '|' || p_location_parking_type_id::text || '|' ||
      p_check_in_at::text || '|' || p_check_out_at::text);

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
