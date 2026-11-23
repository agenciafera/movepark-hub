-- Tabela de taxas para o estacionamento, no Operator (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
--
-- Atividade "Hub: tabela de taxas da Pagar.me fixa no dashboard admin": o estacionamento abre o
-- Financeiro e encontra as taxas vigentes sem precisar perguntar. A tabela contratada
-- (`app_setting.gateway_fee_schedule`) e a política de parcelamento são `is_public = false`, então o
-- estacionamento lê por esta RPC, restrita a quem tem finance:read na empresa (Dono, Gerente,
-- Financeiro) e a hub_admin.
--
-- Devolve: Pix, faixas do cartão e custo para receber em 30 dias (cet30_bps); a taxa de antecipação ao
-- mês e a de saque; a política de parcelamento; e os canais da empresa com comissão, quem paga o
-- cartão e quem paga a antecipação, na mesma precedência de resolve_commission (regra, empresa,
-- padrão do Hub). O antifraude só vai quando algum recebível dos últimos 90 dias trouxe
-- fraud_coverage_fee maior que zero (decisão do Kallef: só mostra se tiver valor). O gateway por
-- transação nunca vai, porque não vem nos recebíveis. Nenhuma taxa entra nesta migration.

create or replace function public.partner_fee_table(p_company_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_co record;
  v_sched jsonb;
  v_policy jsonb;
  v_default_fee text := coalesce(
    (select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark');
  v_default_ant text := coalesce(
    (select nullif(trim(value), '') from public.app_setting where key = 'commission_default_anticipation_payer'), 'movepark');
  v_antifraude_cobrado boolean;
  v_channels jsonb;
begin
  if not (public.is_hub_admin() or public.member_has_scope(p_company_id, 'finance:read')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select c.take_rate_bps, c.installments_max, c.installments_interest_free, c.anticipation_fee_payer
    into v_co
    from public.company c
   where c.id = p_company_id and c.deleted_at is null;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;

  begin
    v_sched := (select value from public.app_setting where key = 'gateway_fee_schedule')::jsonb;
  exception when others then
    v_sched := null;
  end;
  begin
    v_policy := (select value from public.app_setting where key = 'card_installment_policy')::jsonb;
  exception when others then
    v_policy := null;
  end;

  select exists (
    select 1
      from public.payment p
      join public.payment_gateway_event e on e.payment_id = p.id and e.kind = 'payables'
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(e.response -> 'data') = 'array' then e.response -> 'data' else '[]'::jsonb end
      ) as x(r)
     where p.provider = 'pagarme'
       and p.status in ('paid', 'refunded')
       and p.paid_at >= now() - interval '90 days'
       and coalesce((x.r ->> 'fraud_coverage_fee')::numeric, 0) > 0
  ) into v_antifraude_cobrado;

  select jsonb_build_array(jsonb_build_object(
           'name', null,
           'take_rate_bps', coalesce(v_co.take_rate_bps, 0),
           'card_fee_payer', v_default_fee,
           'anticipation_payer', coalesce(v_co.anticipation_fee_payer, v_default_ant),
           'installments_max', v_co.installments_max,
           'installments_interest_free', v_co.installments_interest_free))
         || coalesce((
           select jsonb_agg(jsonb_build_object(
                    'name', r.name,
                    'take_rate_bps', r.take_rate_bps,
                    'card_fee_payer', r.gateway_fee_payer,
                    'anticipation_payer', coalesce(r.anticipation_fee_payer, v_co.anticipation_fee_payer, v_default_ant),
                    'installments_max', coalesce(r.installments_max, v_co.installments_max),
                    'installments_interest_free', case when r.installments_max is not null
                                                       then r.installments_interest_free
                                                       else v_co.installments_interest_free end)
                    order by r.priority desc, r.created_at)
             from public.commission_rule r
            where r.company_id = p_company_id
              and r.deleted_at is null
              and r.is_active
              and (r.valid_from is null or r.valid_from <= now())
              and (r.valid_until is null or r.valid_until > now())), '[]'::jsonb)
    into v_channels;

  return jsonb_build_object(
    'pix_bps', v_sched -> 'pix_bps',
    'card', v_sched -> 'card',
    'cet30_bps', v_sched -> 'cet30_bps',
    'antifraud_cents', case when v_antifraude_cobrado then v_sched -> 'antifraud_cents' end,
    'anticipation_rate_bps',
      (select nullif(trim(value), '')::int from public.app_setting where key = 'card_anticipation_rate_monthly_bps'),
    'withdrawal_fee_cents',
      (select nullif(trim(value), '')::int from public.app_setting where key = 'payout_withdrawal_fee_cents'),
    'policy', v_policy,
    'channels', v_channels);
end;
$$;

revoke all on function public.partner_fee_table(uuid) from public, anon, authenticated;
grant execute on function public.partner_fee_table(uuid) to authenticated;

comment on function public.partner_fee_table(uuid) is
  'Tabela de taxas para o estacionamento (Operator › Financeiro): contrato da Pagar.me sem o gateway por transação, antecipação, saque, parcelamento e canais. finance:read ou hub_admin. Spec: docs/specs/taxas-da-reserva.md';
