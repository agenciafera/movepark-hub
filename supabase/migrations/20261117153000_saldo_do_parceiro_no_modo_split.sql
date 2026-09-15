-- O saldo do parceiro para de zerar quando o split voltar (varredura de 15/09/2026).
--
-- Hoje a venda é em custódia (`pagarme_split_enabled = 'false'`): a cobrança inteira cai na
-- Movepark e `payout_owed_cents` conta tudo, porque conta justamente o que NÃO foi ao gateway
-- (`split_sent_to_gateway is false`). A tela do parceiro mostra "Saldo a receber" e acerta.
--
-- No dia em que o split voltar, a venda nova nasce com `split_sent_to_gateway = true`: o gateway
-- credita o parceiro direto, a dívida da Movepark é zero, e a mesma tela passa a dizer
-- "Saldo a receber R$ 0,00" para quem acabou de vender. O dinheiro existe, está no recebedor dele,
-- e a tela não tem como saber disso porque o número que ela lê é só a dívida.
--
-- Entra `gateway_credited_cents`: a parte do parceiro nas vendas que FORAM ao gateway, já
-- descontado estorno, pelo mesmo rateio proporcional do resto da função. É o complemento exato de
-- `owed_cents` sobre o mesmo conjunto, então os dois somados dão o que ele ganhou, e nenhum modo
-- de split deixa a tela muda. Hoje volta zero para todo mundo.

create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin     boolean := public.is_hub_admin();
  v_net          bigint;
  v_no_gateway   bigint;
  v_owed         bigint;
  v_transferred  bigint;
  v_withdrawn    bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  with per_payment as (
    select
      p.id,
      -- `is not false`: NULL (desconhecido) conta como enviado, igual a payout_owed_cents.
      (p.split_sent_to_gateway is not false) as foi_ao_gateway,
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
    group by p.id, p.kind, p.amount, p.refunded_amount, p.split_sent_to_gateway
  )
  select
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint,
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio))
      filter (where foi_ao_gateway), 0)::bigint
    into v_net, v_no_gateway
  from per_payment;

  v_owed        := public.payout_owed_cents(p_company_id, p_provider);
  v_transferred := public.payout_transferred_cents(p_company_id, p_provider);

  -- Saque é o parceiro tirando dinheiro que já é dele. Informa a tela dele, mas NÃO desconta a
  -- nossa dívida: descontar saque e repasse contaria o mesmo dinheiro duas vezes.
  select coalesce(sum(amount_cents), 0)
    into v_withdrawn
  from public.payout_withdrawal
  where company_id = p_company_id and provider = p_provider
    and status = 'paid' and deleted_at is null;

  return jsonb_build_object(
    'company_id', p_company_id,
    'net_partner_cents', v_net,
    'owed_cents', v_owed,
    -- Creditado direto pelo gateway no recebedor do parceiro (venda com split enviado). Zero
    -- enquanto a custódia estiver ligada; é o que impede a tela de zerar quando ela desligar.
    'gateway_credited_cents', v_no_gateway,
    'transferred_cents', v_transferred,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', greatest(v_owed - v_transferred, 0),
    -- O que o `greatest` acima engolia: repassamos mais do que devíamos (tipicamente estorno depois
    -- do repasse). Zero no caminho normal.
    'overpaid_cents', greatest(v_transferred - v_owed, 0)
  );
end;
$function$;
