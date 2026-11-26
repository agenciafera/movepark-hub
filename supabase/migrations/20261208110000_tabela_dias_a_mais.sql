-- Tabela de dias a mais da reserva (26/11/2026).
--
-- Pedido do Kallef: o operador do balcão precisa saber quanto custa cada dia além do que o cliente
-- reservou, para cobrar a diferença quando ele sai depois do combinado. A tela da reserva mostra a
-- tabela (a estadia reservada e cada dia a mais) e um campo de saída real que diz quantas diárias a
-- mais deram e quanto cobrar.
--
-- A conta é a mesma da troca de datas de reserva paga (decisão de 17/11/2026, migration
-- 20261204140000): a diferença sai ENTRE AS DURAÇÕES da tabela que valia na compra
-- (`booking.price_by_days`). Reserva antiga, sem a tabela guardada, usa a tabela de hoje e diz isso.
--
-- Por que RPC e não leitura da coluna: desde 23/11/2026 o balcão (papel Operação, sem
-- finance:read) não lê a tabela `booking` (policy por escopo, 20261206140100), e é justamente ele
-- quem cobra no portão. A função devolve só preço de TABELA (o mesmo que o site mostra na vitrine),
-- nunca o que a reserva pagou, comissão ou repasse: `counter_booking_json` segue igual.
--
-- Quem chama: hub_admin e membro da empresa com bookings:read (`counter_company_ids`). Anon não.

create or replace function public.booking_extra_days_table(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid; v_in timestamptz; v_out timestamptz; v_pb jsonb; v_snapshot jsonb;
  v_tolerance int; v_company_slug text; v_location_slug text; v_pt_code text;
  v_days int; v_source text; v_prices jsonb := '{}'::jsonb; v_sim jsonb; v_val numeric;
  v_extra constant int := 30;
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver a reserva' using errcode = '42501';
  end if;

  select l.company_id, b.check_in_at, b.check_out_at, b.price_breakdown, b.price_by_days,
         coalesce(l.tolerance_minutes, 0), c.slug, l.slug
    into v_company, v_in, v_out, v_pb, v_snapshot, v_tolerance, v_company_slug, v_location_slug
  from public.booking b
  join public.location l on l.id = b.location_id
  join public.company c on c.id = l.company_id
  where b.id = p_booking_id and b.deleted_at is null;
  if v_company is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if not (v_company = any (public.counter_company_ids())) then
    raise exception 'Sem permissão para ver a reserva' using errcode = '42501';
  end if;

  -- Diárias que o cliente pagou. Sem o snapshot, a mesma conta da criação (com a tolerância).
  v_days := coalesce(
    nullif(v_pb ->> 'days', '')::int,
    greatest(1, ceil((extract(epoch from (v_out - v_in)) / 60 - v_tolerance) / (60 * 24))::int)
  );

  if v_snapshot -> 'prices' ? v_days::text then
    -- Tabela da compra: do que foi reservado até 30 dias a mais (o snapshot cobre até 90).
    v_source := 'compra';
    for d in v_days..(v_days + v_extra) loop
      exit when not (v_snapshot -> 'prices' ? d::text);
      v_prices := v_prices || jsonb_build_object(d::text, v_snapshot -> 'prices' -> d::text);
    end loop;
  else
    -- Reserva anterior a 17/11/2026: tabela de hoje, pelo motor de preço.
    select pt.code into v_pt_code
    from public.booking_item bi join public.parking_type pt on pt.id = bi.parking_type_id
    where bi.booking_id = p_booking_id and bi.item_type = 'parking'
    limit 1;
    if v_pt_code is not null then
      for d in v_days..(v_days + v_extra) loop
        v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, d);
        v_val := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, nullif(v_sim ->> 'price', '')::numeric);
        v_prices := v_prices || jsonb_build_object(d::text, v_val);
      end loop;
    end if;
    -- Sem preço para a própria estadia não há base para a diferença: devolve sem tabela.
    if v_prices ->> v_days::text is null then
      v_prices := '{}'::jsonb;
      v_source := null;
    else
      v_source := 'hoje';
    end if;
  end if;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'booked_days', v_days,
    'tolerance_minutes', v_tolerance,
    'check_in_at', v_in,
    'check_out_at', v_out,
    'price_source', v_source,
    'prices', v_prices
  );
end;
$$;

comment on function public.booking_extra_days_table(uuid) is
  'Preço de tabela da estadia reservada e de até 30 dias a mais, pela tabela da compra '
  '(ou a de hoje, em reserva antiga). Para o balcão cobrar quem sai depois do combinado. '
  'Só preço de tabela: nunca o que a reserva pagou.';

revoke all on function public.booking_extra_days_table(uuid) from public, anon;
grant execute on function public.booking_extra_days_table(uuid) to authenticated, service_role;
