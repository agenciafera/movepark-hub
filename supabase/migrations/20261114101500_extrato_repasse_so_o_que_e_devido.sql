-- Extrato de repasse: sai do parceiro o que nunca foi dele.
--
-- Duas correções em payout_statement/payout_balance (ver docs/specs/payment-split.md).
--
-- 1. Receita de serviço da Movepark entrava como dívida com o parceiro. O upgrade de Tarifa
--    (`create-fare-upgrade`) e a diferença de troca de datas (`change-booking-dates-paid`) cobram
--    valor que é 100% da Movepark, e gravam o split com UMA perna, apontando para o recebedor
--    master. Essa perna vai com `liable: true` porque o gateway exige um responsável por chargeback
--    dentro do split, não porque o dinheiro seja do parceiro. Como a leitura classificava parceiro
--    por `liable`, a Tarifa virava repasse devido. Quem separa os dois casos é `payment.kind`:
--    só `booking` tem perna de parceiro; `fare_upgrade` e `date_change` são receita nossa inteira.
--
--    A alternativa, comparar o `recipientId` com `app_setting.pagarme_movepark_recipient_id`, foi
--    descartada: trocar o recebedor master reescreveria o passado de todos os extratos.
--
-- 2. Estorno parcial não era descontado. Estorno total muda o status para `refunded` e some do
--    líquido sozinho. O parcial (evento `charge.partial_canceled`, hoje feito no painel da
--    Pagar.me) deixa o pagamento em `paid` com `refunded_amount` preenchido, e o valor seguia
--    contando inteiro para o parceiro. Com custódia ligada isso é repasse indevido em dinheiro.
--    A Pagar.me reverte o split proporcionalmente, então o desconto aqui é proporcional nas duas
--    pernas, e a identidade bruto − estornado = líquido continua fechando.
--
-- Nada muda para o caminho normal: reserva paga sem estorno tem ratio 0 e kind 'booking'.

create or replace function public.payout_statement(
  p_from timestamptz,
  p_to timestamptz,
  p_company_id uuid default null,
  p_include_lines boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      -- Só `booking` tem perna de parceiro. Em `fare_upgrade`/`date_change` o `liable` é exigência
      -- do gateway, não titularidade do dinheiro.
      coalesce(sum((r->>'amount')::int)
        filter (where (r->>'liable')::boolean is true and p.kind = 'booking'), 0) as partner_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where (r->>'liable')::boolean is false or p.kind <> 'booking'), 0) as movepark_cents,
      -- Estorno parcial: o pagamento continua `paid`, então o desconto tem que vir daqui.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio
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
             p.kind, p.amount, p.refunded_amount
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
      count(*) filter (where status = 'paid')                            as paid_count,
      count(*) filter (where status = 'refunded')                        as refunded_count
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
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            -- A linha mostra o que sobrou de verdade: já líquido do estorno parcial.
            'partner_cents', l.partner_net_cents,
            'movepark_cents', l.movepark_net_cents
          ) order by l.event_at desc), '[]'::jsonb)
          from lines l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$function$;

create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin  boolean := public.is_hub_admin();
  v_net       bigint;
  v_withdrawn bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  -- Mesma regra do extrato: só `booking` tem perna de parceiro, e estorno parcial desconta
  -- proporcionalmente. Divergir daqui faria a tela do parceiro brigar com o próprio extrato.
  with per_payment as (
    select
      p.id,
      coalesce(sum((r->>'amount')::int)
        filter (where (r->>'liable')::boolean is true and p.kind = 'booking'), 0) as partner_cents,
      case
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and p.status = 'paid'
      and loc.company_id = p_company_id
    group by p.id, p.kind, p.amount, p.refunded_amount
  )
  select coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint
    into v_net
  from per_payment;

  select coalesce(sum(amount_cents), 0)
    into v_withdrawn
  from public.payout_withdrawal
  where company_id = p_company_id and provider = p_provider
    and status = 'paid' and deleted_at is null;

  return jsonb_build_object(
    'company_id', p_company_id,
    'net_partner_cents', v_net,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', v_net - v_withdrawn
  );
end;
$function$;
