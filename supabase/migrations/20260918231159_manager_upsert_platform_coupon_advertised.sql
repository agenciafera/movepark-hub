-- E3.3. O upsert do Manager passa a controlar `is_advertised` (o que vira cartaz em /descontos).
--
-- A assinatura antiga é DROPADA, e não deixada ao lado: o Postgres aceitaria as duas como
-- sobrecarga, e uma chamada sem o parâmetro novo cairia silenciosamente na versão velha, que
-- ignora o campo. O gestor desmarcaria "anunciar" e a campanha continuaria no cartaz.
drop function if exists public.manager_upsert_platform_coupon(
  uuid, text, text, text, text, text, numeric, numeric, text, integer,
  timestamptz, timestamptz, integer, integer, numeric, integer, boolean, integer);

create or replace function public.manager_upsert_platform_coupon(
  p_id uuid, p_code text, p_title text, p_description text, p_terms text,
  p_discount_type text, p_discount_value numeric, p_max_discount_amount numeric,
  p_audience text, p_audience_inactive_days integer,
  p_valid_from timestamptz, p_valid_until timestamptz,
  p_max_uses integer, p_per_user_limit integer, p_min_amount numeric, p_min_days integer,
  p_is_active boolean, p_is_advertised boolean, p_sort_order integer)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark cria cupom de plataforma.' using errcode = '42501';
  end if;
  if p_discount_type not in ('percent', 'fixed') then
    raise exception 'Tipo de desconto inválido.' using errcode = 'P0001';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'Desconto percentual não pode passar de 100%%.' using errcode = 'P0001';
  end if;
  if p_discount_type = 'percent' and p_max_discount_amount is null then
    raise exception 'Cupom percentual de plataforma exige teto (max_discount_amount).'
      using errcode = 'P0001';
  end if;

  insert into public.coupon (
    id, company_id, code, title, description, terms,
    discount_type, discount_value, max_discount_amount,
    funded_by, audience, audience_inactive_days,
    valid_from, valid_until, max_uses, per_user_limit, min_amount, min_days,
    is_active, is_advertised, sort_order)
  values (
    coalesce(p_id, gen_random_uuid()), null, upper(trim(p_code)), p_title, p_description, p_terms,
    p_discount_type::public.discount_type, p_discount_value, p_max_discount_amount,
    'platform', p_audience::public.coupon_audience, p_audience_inactive_days,
    p_valid_from, p_valid_until, p_max_uses, p_per_user_limit, p_min_amount, p_min_days,
    coalesce(p_is_active, true), coalesce(p_is_advertised, false), coalesce(p_sort_order, 0))
  on conflict (id) do update set
    code = excluded.code, title = excluded.title, description = excluded.description,
    terms = excluded.terms, discount_type = excluded.discount_type,
    discount_value = excluded.discount_value, max_discount_amount = excluded.max_discount_amount,
    audience = excluded.audience, audience_inactive_days = excluded.audience_inactive_days,
    valid_from = excluded.valid_from, valid_until = excluded.valid_until,
    max_uses = excluded.max_uses, per_user_limit = excluded.per_user_limit,
    min_amount = excluded.min_amount, min_days = excluded.min_days,
    is_active = excluded.is_active, is_advertised = excluded.is_advertised,
    sort_order = excluded.sort_order
  returning id into v_id;

  return v_id;
end; $fn$;

revoke all on function public.manager_upsert_platform_coupon(
  uuid, text, text, text, text, text, numeric, numeric, text, integer,
  timestamptz, timestamptz, integer, integer, numeric, integer, boolean, boolean, integer)
  from public, anon;
grant execute on function public.manager_upsert_platform_coupon(
  uuid, text, text, text, text, text, numeric, numeric, text, integer,
  timestamptz, timestamptz, integer, integer, numeric, integer, boolean, boolean, integer)
  to authenticated, service_role;
