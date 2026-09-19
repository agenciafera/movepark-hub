-- Canais de venda do parceiro (E0.3.12). Spec: docs/specs/comissao-por-origem.md
--
-- A tabela `commission_rule` é só de hub_admin (o estacionamento não edita a própria comissão).
-- Mas ele precisa SABER quais links dele contam como venda trazida por ele, e com que comissão,
-- senão a regra existe e ninguém usa. Esta RPC devolve só as regras da empresa dele (nunca as de
-- outra, nem as globais) e as páginas públicas das unidades, para a tela montar o link rastreado.

create or replace function public.my_commission_channels(p_company_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_rules jsonb; v_locations jsonb; v_take int;
begin
  if not public.is_hub_admin() and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'finance:read') then
    raise exception 'Seu papel não permite ver a comissão (finance:read).' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'utm_sources', to_jsonb(r.utm_sources),
           'match_white_label', r.match_white_label, 'take_rate_bps', r.take_rate_bps,
           'valid_until', r.valid_until)
           order by r.priority desc, r.created_at desc), '[]'::jsonb)
    into v_rules
    from public.commission_rule r
   where r.company_id = p_company_id and r.deleted_at is null and r.is_active
     and (r.valid_from is null or r.valid_from <= now())
     and (r.valid_until is null or r.valid_until > now());

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'public_path', public.location_public_path(l))
           order by l.name), '[]'::jsonb)
    into v_locations
    from public.location l
   where l.company_id = p_company_id and l.deleted_at is null
     and public.location_public_path(l) is not null;

  select c.take_rate_bps into v_take from public.company c where c.id = p_company_id;

  return jsonb_build_object(
    'default_take_rate_bps', coalesce(v_take, 0),
    'window_days', coalesce((select nullif(trim(value), '')::int from public.app_setting
                              where key = 'commission_attribution_window_days'), 7),
    'rules', v_rules, 'locations', v_locations);
end $$;
revoke all on function public.my_commission_channels(uuid) from public, anon;
grant execute on function public.my_commission_channels(uuid) to authenticated;
