-- Relatório de vendas por canal de comissão (E0.3.12). Spec: docs/specs/comissao-por-origem.md
--
-- Responde duas perguntas do Manager: quanto cada canal vendeu e quanto a Movepark ficou; e qual
-- empresa está vendendo quase tudo pelo canal dela. A segunda é o alerta de concentração: acima
-- de `commission_partner_share_alert_pct` (padrão 60%) alguém olha. Pode ser marketing bom do
-- estacionamento; pode ser tráfego do Hub chegando com o UTM dele. O número não decide, só chama.
--
-- Conta cobrança PAGA de reserva (estornada inteira sai; parcial conta o que ficou), pela data do
-- pagamento. A parte da Movepark vem do split gravado, o mesmo razão do resto do financeiro.

create or replace function public.commission_channel_report(p_from timestamptz, p_to timestamptz)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_alert int := coalesce((select nullif(trim(value), '')::int from public.app_setting
                            where key = 'commission_partner_share_alert_pct'), 60);
  v_companies jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  with pay as (
    select c.id as company_id, c.name as company_name,
           (b.commission_rule_id is not null) as from_rule,
           case when b.commission_rule_id is not null then b.commission_channel else 'hub' end as channel,
           b.commission_take_rate_bps,
           round((p.amount - coalesce(p.refunded_amount, 0)) * 100)::bigint as gmv_cents,
           round(coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                            where not public.split_rule_is_partner(r)), 0)
                 * case when p.amount > 0 then (p.amount - coalesce(p.refunded_amount, 0)) / p.amount else 0 end)::bigint as movepark_cents
      from public.payment p
      join public.booking b  on b.id = p.booking_id
      join public.location l on l.id = b.location_id
      join public.company c  on c.id = l.company_id
     where p.kind = 'booking' and p.status = 'paid'
       and p.paid_at >= p_from and p.paid_at < p_to
  ),
  por_canal as (
    select company_id, company_name, channel, from_rule,
           count(*) as paid_bookings, sum(gmv_cents) as gmv_cents, sum(movepark_cents) as movepark_cents,
           round(avg(commission_take_rate_bps)) as avg_take_rate_bps
      from pay group by company_id, company_name, channel, from_rule
  ),
  por_empresa as (
    select company_id, company_name,
           sum(paid_bookings) as paid_bookings, sum(gmv_cents) as gmv_cents, sum(movepark_cents) as movepark_cents,
           sum(gmv_cents) filter (where from_rule) as partner_gmv_cents,
           jsonb_agg(jsonb_build_object(
             'channel', channel, 'from_rule', from_rule, 'paid_bookings', paid_bookings,
             'gmv_cents', gmv_cents, 'movepark_cents', movepark_cents, 'avg_take_rate_bps', avg_take_rate_bps)
             order by gmv_cents desc) as channels
      from por_canal group by company_id, company_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'company_id', company_id, 'company_name', company_name,
           'paid_bookings', paid_bookings, 'gmv_cents', gmv_cents, 'movepark_cents', movepark_cents,
           'partner_gmv_cents', coalesce(partner_gmv_cents, 0),
           'partner_share_pct', case when gmv_cents > 0 then round(coalesce(partner_gmv_cents, 0) * 100.0 / gmv_cents) else 0 end,
           'alert', gmv_cents > 0 and coalesce(partner_gmv_cents, 0) * 100.0 / gmv_cents >= v_alert,
           'channels', channels) order by gmv_cents desc), '[]'::jsonb)
    into v_companies
    from por_empresa;

  return jsonb_build_object('alert_pct', v_alert, 'companies', v_companies);
end $$;
revoke all on function public.commission_channel_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.commission_channel_report(timestamptz, timestamptz) to authenticated;

-- Quem criou a regra: preenchido pelo banco, para a tela não precisar mandar (nem poder forjar).
alter table public.commission_rule alter column created_by set default auth.uid();
