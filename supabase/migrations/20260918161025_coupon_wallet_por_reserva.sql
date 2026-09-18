-- E3.3. A carteira no checkout avalia contra a RESERVA, não contra uma simulação nova.
--
-- Por que a assinatura mudou logo depois de nascer: o checkout não carrega o
-- `location_parking_type_id`, e, mais importante, simular o preço de novo ali seria errado. O
-- desconto mostrado no cartão sairia de um preço recalculado agora, enquanto
-- `apply_coupon_to_booking` grava sobre o `price_breakdown.subtotal` congelado quando a reserva
-- nasceu. Preço muda entre reservar e pagar, e o cliente veria um número no botão e outro no total.
--
-- `p_booking_id` tem precedência sobre unidade+datas. Sem nenhum dos dois, segue listando condições.
drop function if exists public.customer_coupon_wallet(uuid, timestamptz, timestamptz);

create or replace function public.customer_coupon_wallet(
  p_location_parking_type_id uuid default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_booking_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_location_id uuid; v_company_id uuid; v_cpt_id uuid;
  v_location_slug text; v_company_slug text; v_parking_type_code text;
  v_days int; v_minutes int; v_sim jsonb; v_subtotal numeric;
  v_auto_stack boolean := true; v_disc record;
  v_rows jsonb := '[]'::jsonb;
  r record; v_eval record; v_card jsonb;
  v_best_id uuid; v_best numeric := 0;
  bk public.booking; v_parking_type_id uuid; v_rule_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'has_order_context', false);
  end if;

  if p_booking_id is not null then
    -- Contexto vindo da reserva (checkout). Só reserva pendente do próprio cliente.
    select * into bk from public.booking
    where id = p_booking_id and profile_id = v_uid and deleted_at is null and status = 'pending';

    if bk.id is not null then
      v_location_id := bk.location_id;
      select l.company_id into v_company_id from public.location l where l.id = bk.location_id;
      v_subtotal := nullif(bk.price_breakdown ->> 'subtotal', '')::numeric;
      v_days := coalesce(nullif(bk.price_breakdown ->> 'days', '')::int,
                  greatest(1, ceil(extract(epoch from (bk.check_out_at - bk.check_in_at))::numeric
                                   / 60 / (60 * 24))::int));
      select bi.parking_type_id into v_parking_type_id
      from public.booking_item bi
      where bi.booking_id = bk.id and bi.item_type = 'parking' limit 1;
      select cpt.id into v_cpt_id from public.company_parking_type cpt
      where cpt.company_id = v_company_id and cpt.parking_type_id = v_parking_type_id limit 1;

      v_rule_id := nullif(bk.price_breakdown -> 'auto_discount' ->> 'rule_id', '')::uuid;
      if v_rule_id is not null then
        select coalesce(dr.allow_coupon_stack, true) into v_auto_stack
        from public.discount_rule dr where dr.id = v_rule_id;
        v_auto_stack := coalesce(v_auto_stack, true);
      end if;
    end if;

  elsif p_location_parking_type_id is not null
     and p_check_in_at is not null and p_check_out_at is not null
     and p_check_out_at > p_check_in_at then
    select l.id, l.company_id, cpt.id, l.slug, co.slug, pt.code
      into v_location_id, v_company_id, v_cpt_id, v_location_slug, v_company_slug, v_parking_type_code
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company co on co.id = l.company_id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where lpt.id = p_location_parking_type_id and l.deleted_at is null;

    if v_location_id is not null then
      v_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
      v_days := greatest(1, ceil(v_minutes::numeric / (60 * 24))::int);
      v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
      v_subtotal := nullif(v_sim ->> 'price', '')::numeric;

      -- Promoção automática pode proibir empilhar cupom. Se proibir, TODO cupom fica indisponível
      -- e o motivo é esse. Melhor dizer isso do que listar cupom que falha no "Usar".
      for v_disc in
        select * from public.discount_evaluate(
          v_location_id, v_cpt_id,
          coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_subtotal),
          v_days, p_check_in_at)
      loop
        v_auto_stack := coalesce(v_disc.allow_coupon_stack, true);
      end loop;
    end if;
  end if;

  for r in
    -- Entra na carteira o cupom que a pessoa resgatou, e o cupom de audiência que casa com ela.
    -- Cupom de empresa só entra quando ela está comprando naquela empresa: sem isso a tela viraria
    -- a lista de promoções de toda a rede, e nenhuma serviria para o pedido.
    select c.*, (w.profile_id is not null) as is_redeemed, co.name as company_name
    from public.coupon c
    left join public.coupon_wallet w on w.coupon_id = c.id and w.profile_id = v_uid
    left join public.company co on co.id = c.company_id
    where c.is_active
      and (c.valid_until is null or c.valid_until >= now())
      and (c.max_uses is null or c.times_used < c.max_uses)
      and (
        w.profile_id is not null
        or (c.audience <> 'code_only' and (c.company_id is null or c.company_id = v_company_id)))
    order by c.sort_order, c.created_at
  loop
    -- A audiência decide se o cupom APARECE; coupon_evaluate decide se ele VALE para este pedido.
    -- Cupom resgatado cujo dono saiu da audiência continua aparecendo, com o motivo. Sumir sem
    -- explicação seria pior para quem guardou.
    if not r.is_redeemed and r.audience not in ('public', 'code_only') then
      declare v_stats record; v_match boolean := false;
      begin
        select * into v_stats from public.coupon_customer_stats(v_uid);
        v_match := case r.audience
          when 'first_purchase'  then coalesce(v_stats.paid_count, 0) = 0
          when 'second_purchase' then coalesce(v_stats.paid_count, 0) = 1
          when 'winback'         then coalesce(v_stats.paid_count, 0) > 0
                                      and coalesce(v_stats.days_since_last, 0) >= r.audience_inactive_days
          else false end;
        if not v_match then continue; end if;
      end;
    end if;

    v_card := jsonb_build_object(
      'id', r.id, 'code', upper(r.code), 'title', coalesce(r.title, r.description),
      'terms', r.terms, 'discount_type', r.discount_type, 'discount_value', r.discount_value,
      'max_discount_amount', r.max_discount_amount, 'min_amount', r.min_amount,
      'min_days', r.min_days, 'valid_until', r.valid_until,
      'scope', case when r.company_id is null then 'platform' else 'company' end,
      'company_name', r.company_name, 'audience', r.audience, 'is_redeemed', r.is_redeemed,
      'is_best', false, 'discount', 0);

    if v_location_id is not null and v_subtotal is not null then
      if not v_auto_stack then
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object('is_eligible', false, 'reason', 'no_stack'));
        continue;
      end if;
      select * into v_eval from public.coupon_evaluate(
        r.code, v_location_id, v_uid, v_subtotal, v_days, v_cpt_id);
      if v_eval.error_code is not null then
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object('is_eligible', false, 'reason', v_eval.error_code));
      else
        v_rows := v_rows || jsonb_build_array(
          v_card || jsonb_build_object('is_eligible', true, 'reason', null, 'discount', v_eval.discount));
        if v_eval.discount > v_best then
          v_best := v_eval.discount; v_best_id := r.id;
        end if;
      end if;
    else
      -- Sem pedido: a tela lista condições, não veredito. Dizer "disponível" aqui seria prometer
      -- um desconto que depende da unidade e das datas que a pessoa ainda não escolheu.
      v_rows := v_rows || jsonb_build_array(
        v_card || jsonb_build_object('is_eligible', null, 'reason', null));
    end if;
  end loop;

  -- "Melhor opção": o maior desconto em reais para este pedido.
  if v_best_id is not null then
    select jsonb_agg(
             case when (x ->> 'id')::uuid = v_best_id
                  then x || jsonb_build_object('is_best', true) else x end
             order by ord)
      into v_rows
    from jsonb_array_elements(v_rows) with ordinality as t(x, ord);
  end if;

  return jsonb_build_object(
    'items', coalesce(v_rows, '[]'::jsonb),
    'has_order_context', v_location_id is not null and v_subtotal is not null);
end; $fn$;

comment on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz, uuid) is
  'Carteira de cupons do cliente. Com p_booking_id avalia contra o subtotal congelado da reserva '
  '(o mesmo que apply_coupon_to_booking usa, para preview e cobrança nunca divergirem); com '
  'unidade e datas simula o preço; sem nenhum dos dois lista condições (is_eligible null).';

revoke all on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz, uuid)
  from public, anon;
grant execute on function public.customer_coupon_wallet(uuid, timestamptz, timestamptz, uuid)
  to authenticated, service_role;
