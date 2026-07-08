-- Cupom sem login (campanhas): validação anônima do cupom na página de detalhe.
-- Espelha public.validate_coupon (preview no checkout), mas SEM depender de sessão: passa
-- profile_id = NULL pro coupon_evaluate, que já pula o per_user_limit nesse caso. O limite
-- por-usuário continua enforced de verdade no create_booking_atomic (que tem o profile_id).
-- Mesmo perfil read-only do simulate_price (anon-callable). Ver docs/specs/coupon-rules.md.
create or replace function public.validate_coupon_public(
  p_code text,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fv$
declare
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_code text; v_cpt_id uuid;
  v_days int; v_minutes int; v_sim jsonb; v_subtotal numeric; v_eval record;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;
  if p_check_out_at <= p_check_in_at then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  select l.id, l.slug, c.slug, pt.code, cpt.id
    into v_location_id, v_location_slug, v_company_slug, v_parking_type_code, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_location_id is null then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  v_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_minutes::numeric / (60 * 24))::int);
  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
  v_subtotal := nullif(v_sim ->> 'price', '')::numeric;
  if v_subtotal is null then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  -- profile_id NULL → coupon_evaluate pula o per_user_limit (anônimo). Enforcement no booking.
  select * into v_eval from public.coupon_evaluate(
    trim(p_code), v_location_id, null::uuid, v_subtotal, v_days, v_cpt_id);

  if v_eval.error_code is not null then
    return jsonb_build_object('valid', false, 'error_code', v_eval.error_code);
  end if;

  return jsonb_build_object(
    'valid', true,
    'discount', v_eval.discount,
    'subtotal', v_subtotal,
    'total_preview', v_subtotal - v_eval.discount,
    'code', upper(trim(p_code)),
    'error_code', null
  ) || coalesce((
    select jsonb_build_object('discount_type', co.discount_type, 'discount_value', co.discount_value)
    from public.coupon co where co.id = v_eval.coupon_id
  ), '{}'::jsonb);
end; $fv$;

-- Preview read-only, sem vínculo a usuário → seguro pra anon (mesmo perfil do simulate_price).
revoke all on function public.validate_coupon_public(text, uuid, timestamptz, timestamptz) from public;
grant execute on function public.validate_coupon_public(text, uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;

comment on function public.validate_coupon_public(text, uuid, timestamptz, timestamptz) is
  'Cupom sem login: preview anônimo (profile_id NULL, pula per_user_limit). Enforcement no booking.';
