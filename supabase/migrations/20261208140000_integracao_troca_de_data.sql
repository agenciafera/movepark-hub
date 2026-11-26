-- Integrações, Fase 4 (parte): troca de data ou de placa antes da entrada chega à Cloudpark.
-- Spec: docs/specs/integracoes.md § 5.8.
--
-- A fila só nascia na confirmação (`integration_enqueue_booking`), então quem trocava a data ou a
-- placa depois disso ficava com a reserva antiga na cancela. Pela resposta da Nationpark
-- (26/11/2026), passada a folga de 1 hora a cancela barra a placa e a portaria tem que validar ou
-- cobrar no balcão: o cliente que trocou a data chegava e era barrado.
--
-- A Cloudpark não tem rota para alterar nem cancelar reserva (§ 3). O desenho da § 5.8: a troca
-- cria uma reserva nova lá, o voucher é refeito com o QR novo e reenviado, e a reserva antiga fica
-- marcada para bloquear (`block_pending`); a unidade recebe e-mail com os dois códigos.
--
--   integration_enqueue_booking_change   trigger AFTER UPDATE OF check_in_at, check_out_at, vehicle_id
--   integration_store_access_code        grava o código devolvido e aposenta o anterior (service_role)
--
-- Quando NÃO enfileira:
--   - reserva fora de `confirmed`, ou com entrada registrada (`checked_in_at`);
--   - entrada igual e já passada: é a extensão no pátio (o carro está dentro), e a portaria valida
--     a saída na Cloudpark, como a tela avisa (booking-modifications.md § 8.8);
--   - a unidade sem conexão ligada, ou a reserva sem código ativo nela (o envio inicial falhou e o
--     alerta já mandou cadastrar à mão);
--   - já existe entrega pendente da reserva nessa conexão: ela lê a reserva na hora de enviar, então
--     leva as datas e a placa de agora.
--
-- A entrega da troca tem `hold_until` de 15 minutos só para o alerta de "seguimos tentando" sair no
-- mesmo prazo da confirmação: há código ativo, então nenhum e-mail de confirmação é retido. O
-- trigger nunca derruba a alteração: erro vira WARNING.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enfileirar a troca
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.integration_enqueue_booking_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_plate text;
begin
  if new.status is distinct from 'confirmed' or new.checked_in_at is not null then
    return null;
  end if;
  if (new.check_in_at, new.check_out_at, new.vehicle_id)
       is not distinct from (old.check_in_at, old.check_out_at, old.vehicle_id) then
    return null;
  end if;
  -- Mesma entrada, e ela já passou: o carro pode estar dentro (extensão no pátio).
  if new.check_in_at = old.check_in_at and old.check_in_at <= now() then
    return null;
  end if;

  begin
    select v.license_plate into v_plate from public.vehicle v where v.id = old.vehicle_id;

    insert into public.integration_delivery
      (connection_id, company_id, source, booking_id, operation, idempotency_key, payload, hold_until)
    select c.id, c.company_id, 'hub', new.id, 'reserve',
           'hub:' || new.id::text || ':change:' || c.id::text || ':' || gen_random_uuid()::text,
           jsonb_build_object(
             'reason', 'change',
             'previous', jsonb_build_object(
               'check_in_at', old.check_in_at,
               'check_out_at', old.check_out_at,
               'plate', v_plate)),
           now() + interval '15 minutes'
      from public.integration_connection c
     where c.location_id = new.location_id
       and c.enabled
       and c.send_hub_bookings
       and c.deleted_at is null
       and exists (
         select 1 from public.integration_access_code a
          where a.booking_id = new.id and a.connection_id = c.id and a.status = 'active'
       )
       and not exists (
         select 1 from public.integration_delivery d
          where d.booking_id = new.id and d.connection_id = c.id and d.status = 'pending'
       )
    on conflict (idempotency_key) do nothing;
  exception when others then
    -- A integração nunca derruba a alteração da reserva.
    raise warning 'integration_enqueue_booking_change(%): %', new.id, sqlerrm;
  end;
  return null;
end $function$;

drop trigger if exists booking_integration_enqueue_change on public.booking;
create trigger booking_integration_enqueue_change
  after update of check_in_at, check_out_at, vehicle_id on public.booking
  for each row execute function public.integration_enqueue_booking_change();

revoke all on function public.integration_enqueue_booking_change() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Gravar o código devolvido
-- ─────────────────────────────────────────────────────────────────────────────
-- Uma transação só: o anterior vira `block_pending` e o novo nasce ativo (o índice único deixa um
-- ativo por reserva e conexão). Devolve { stored, code_id, previous_code }:
--   stored = false  → nada mudou: retentativa da mesma entrega, o provedor devolveu o mesmo código
--                     (o sandbox da Cloudpark devolve sempre o mesmo) ou a entrega inicial perdeu
--                     a corrida para outra (vale o primeiro código, como antes);
--   previous_code   → o código aposentado, que a unidade precisa bloquear na Cloudpark.
create or replace function public.integration_store_access_code(p_delivery_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := btrim(coalesce(p_code, ''));
  v_d public.integration_delivery%rowtype;
  v_id uuid;
  v_prev_id uuid;
  v_prev_code text;
begin
  if v_code = '' then
    raise exception 'Código de acesso vazio.';
  end if;
  select * into v_d from public.integration_delivery where id = p_delivery_id for update;
  if not found or v_d.booking_id is null then
    raise exception 'Entrega % não encontrada.', p_delivery_id;
  end if;

  -- Retentativa da mesma entrega: o código já está gravado.
  select a.id into v_id
    from public.integration_access_code a
   where a.delivery_id = v_d.id and a.status = 'active'
   limit 1;
  if v_id is not null then
    return jsonb_build_object('stored', false, 'code_id', v_id, 'previous_code', null);
  end if;

  select a.id, a.code into v_prev_id, v_prev_code
    from public.integration_access_code a
   where a.booking_id = v_d.booking_id and a.connection_id = v_d.connection_id and a.status = 'active'
   for update;

  if v_prev_id is not null
     and (v_prev_code = v_code or coalesce(v_d.payload ->> 'reason', '') <> 'change') then
    return jsonb_build_object('stored', false, 'code_id', v_prev_id, 'previous_code', null);
  end if;

  if v_prev_id is not null then
    update public.integration_access_code set status = 'block_pending' where id = v_prev_id;
  end if;

  insert into public.integration_access_code (connection_id, company_id, booking_id, delivery_id, code)
  values (v_d.connection_id, v_d.company_id, v_d.booking_id, v_d.id, v_code)
  returning id into v_id;

  return jsonb_build_object('stored', true, 'code_id', v_id, 'previous_code', v_prev_code);
end $function$;

revoke all on function public.integration_store_access_code(uuid, text) from public, anon, authenticated;
grant execute on function public.integration_store_access_code(uuid, text) to service_role;
