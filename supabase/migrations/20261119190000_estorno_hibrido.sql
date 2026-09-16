-- Estorno híbrido (E0.3.6, 16/09/2026). Spec: docs/specs/estorno-hibrido.md.
--
-- Quando o recebedor do parceiro tem saldo disponível que cobre o líquido que ele recebeu, o
-- estorno vai com duas regras e o gateway debita o parceiro: a dívida nem nasce. Esta migration
-- guarda o que a Edge decidiu (`refund_split`, `refund_partner_cents`,
-- `refund_partner_balance_cents`), cria a chave, DESLIGADA, e ensina o extrato a dizer quem pagou.
-- `payout_debt_cents` não muda: já lê só `refund_absorbed_by_master = true`.

alter table public.payment
  add column if not exists refund_split jsonb,
  add column if not exists refund_partner_cents integer not null default 0,
  add column if not exists refund_partner_balance_cents integer;

comment on column public.payment.refund_split is
  'Regras enviadas no estorno (as que valeram, se houve fallback). Diagnóstico.';
comment on column public.payment.refund_partner_cents is
  'Quanto o gateway debitou do recebedor do parceiro neste estorno (E0.3.6). Zero quando a Movepark absorveu.';
comment on column public.payment.refund_partner_balance_cents is
  'Saldo disponível do recebedor do parceiro lido na decisão do estorno híbrido. Nulo sem leitura.';

insert into public.app_setting (key, value, is_public)
values ('pagarme_refund_hybrid_enabled', 'false', false)
on conflict (key) do nothing;

-- ── payout_statement: quem pagou cada estorno ──
create or replace function public.payout_statement(p_from timestamp with time zone, p_to timestamp with time zone, p_company_id uuid DEFAULT NULL::uuid, p_include_lines boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
    if not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Seu papel não permite ver o financeiro (finance:read).' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      -- Só `booking` tem perna de parceiro. A perna é identificada por `role` (regras antigas: por
      -- `liable`, que era a marca do parceiro até o split dinâmico).
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), 0) as partner_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where not public.split_rule_is_partner(r) or p.kind <> 'booking'), 0) as movepark_cents,
      -- Estorno parcial: o pagamento continua `paid`, então o desconto tem que vir daqui.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio,
      -- Custo da Movepark, apurado em `GET /payables`. Nulo (não apurado) soma nada.
      coalesce(p.gateway_fee_cents, 0) as gateway_fee_cents,
      -- Abatimento de dívida gravado NESTA cobrança (split dinâmico). A perna do parceiro acima é a
      -- normal; o que ele recebeu de fato é perna menos abatimento.
      coalesce(p.debt_recovered_cents, 0) as debt_recovered_cents,
      -- Estorno híbrido (E0.3.6): quem devolveu. `refund_partner_cents` é o que o gateway debitou
      -- do parceiro; `refund_absorbed_by_master` marca o que a Movepark pagou (vira dívida).
      coalesce(p.refund_partner_cents, 0) as refund_partner_cents,
      p.refund_absorbed_by_master as refund_absorbed_by_master
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at,
             p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents, p.debt_recovered_cents,
             p.refund_partner_cents, p.refund_absorbed_by_master
  ),
  lines as (
    select
      l.*,
      round(l.partner_cents  * l.refund_ratio)::bigint as partner_partial_cents,
      (l.partner_cents  - round(l.partner_cents  * l.refund_ratio))::bigint as partner_net_cents,
      (l.movepark_cents - round(l.movepark_cents * l.refund_ratio))::bigint as movepark_net_cents
    from legs l
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                    as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)
        + coalesce(sum(partner_partial_cents) filter (where status = 'paid'), 0)
                                                                         as refunded_partner_cents,
      coalesce(sum(partner_net_cents)  filter (where status = 'paid'), 0) as net_partner_cents,
      coalesce(sum(movepark_net_cents) filter (where status = 'paid'), 0) as movepark_commission_cents,
      coalesce(sum(gateway_fee_cents)  filter (where status = 'paid'), 0) as gateway_fee_cents,
      count(*) filter (where status = 'paid')                            as paid_count,
      count(*) filter (where status = 'refunded')                        as refunded_count,
      -- Dos estornos, quanto o gateway debitou do próprio parceiro (não virou dívida).
      coalesce(sum(refund_partner_cents), 0)                             as refunded_by_partner_cents
    from lines
    group by company_id, company_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'companies', coalesce(jsonb_agg(
      jsonb_build_object(
        'company_id', a.company_id,
        'company_name', a.company_name,
        'gross_partner_cents', a.gross_partner_cents,
        'refunded_partner_cents', a.refunded_partner_cents,
        'net_partner_cents', a.net_partner_cents,
        'movepark_commission_cents', a.movepark_commission_cents,
        'gateway_fee_cents', a.gateway_fee_cents,
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'refunded_by_partner_cents', a.refunded_by_partner_cents,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            -- A linha mostra o que sobrou de verdade: já líquido do estorno parcial.
            'partner_cents', l.partner_net_cents,
            'movepark_cents', l.movepark_net_cents,
            'gateway_fee_cents', l.gateway_fee_cents,
            'debt_recovered_cents', l.debt_recovered_cents,
            'refund_partner_cents', l.refund_partner_cents,
            'refund_absorbed_by_master', l.refund_absorbed_by_master
          ) order by l.event_at desc), '[]'::jsonb)
          from lines l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$function$
;
