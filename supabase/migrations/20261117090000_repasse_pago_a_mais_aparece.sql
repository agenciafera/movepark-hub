-- O que foi repassado a mais deixa de sumir da tela (varredura de 15/09/2026).
--
-- `balance_cents` é `greatest(devido - repassado, 0)`, e o travamento em zero existe para a tela do
-- parceiro não mostrar saldo negativo. O efeito colateral: um estorno DEPOIS do repasse derruba o
-- devido, o repassado continua lá, e a diferença desaparece. A Movepark pagou a mais e o painel não
-- diz nada. Sem número, ninguém cobra.
--
-- Entra `overpaid_cents`, que é exatamente a parte que o `greatest` engolia. Ele não é dívida do
-- parceiro no sentido de cobrança automática: é um saldo a recuperar, que se resolve conversando ou
-- descontando do próximo repasse (o cálculo do devido já faz isso sozinho quando houver venda nova,
-- porque `payout_transferred_cents` continua contando o repasse antigo).

create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin    boolean := public.is_hub_admin();
  v_net         bigint;
  v_owed        bigint;
  v_transferred bigint;
  v_withdrawn   bigint;
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
    'transferred_cents', v_transferred,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', greatest(v_owed - v_transferred, 0),
    -- O que o `greatest` acima engolia: repassamos mais do que devíamos (tipicamente estorno depois
    -- do repasse). Zero no caminho normal.
    'overpaid_cents', greatest(v_transferred - v_owed, 0)
  );
end;
$function$;

create or replace function public.payout_owed_overview(
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark vê os repasses da rede.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.company_name), '[]'::jsonb)
    into v_result
  from (
    select
      c.id   as company_id,
      c.name as company_name,
      public.payout_owed_cents(c.id, p_provider)        as owed_cents,
      public.payout_transferred_cents(c.id, p_provider) as transferred_cents,
      greatest(
        public.payout_owed_cents(c.id, p_provider)
          - public.payout_transferred_cents(c.id, p_provider),
        0
      ) as available_cents,
      -- Repassado a mais: aparece para alguém resolver, em vez de sumir no zero.
      greatest(
        public.payout_transferred_cents(c.id, p_provider)
          - public.payout_owed_cents(c.id, p_provider),
        0
      ) as overpaid_cents,
      pr.external_recipient_id as target_recipient_id,
      pr.status::text          as recipient_status,
      (t.id is not null)       as em_andamento,
      case when t.id is null then null else jsonb_build_object(
        'id', t.id,
        'status', t.status,
        'amount_cents', t.amount_cents,
        'enviado', t.external_transfer_id is not null,
        'failed_reason', t.failed_reason,
        'requested_at', t.requested_at
      ) end as pendente
    from public.company c
    left join public.payout_recipient pr
      on pr.company_id = c.id and pr.provider = p_provider and pr.deleted_at is null
    left join lateral (
      select * from public.payout_transfer pt
       where pt.company_id = c.id and pt.provider = p_provider
         and pt.status in ('created', 'processing') and pt.deleted_at is null
       order by pt.created_at
       limit 1
    ) t on true
    where c.deleted_at is null
      and (
        public.payout_owed_cents(c.id, p_provider) > 0
        -- Pendente sem dívida aberta ainda aparece: senão um repasse travado some da tela.
        or t.id is not null
        -- Pago a mais também: é o caso que a tela precisa mostrar para alguém agir.
        or public.payout_transferred_cents(c.id, p_provider)
           > public.payout_owed_cents(c.id, p_provider)
      )
  ) x;

  return v_result;
end;
$function$;
revoke all on function public.payout_owed_overview(text) from public, anon;
grant execute on function public.payout_owed_overview(text) to authenticated;
