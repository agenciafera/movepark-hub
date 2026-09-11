-- Quanto devemos ao parceiro passa a ser por cobrança, não pelo valor atual da chave global.
--
-- Com `pagarme_split_enabled = 'true'` o gateway credita o parceiro na hora da venda e não devemos
-- nada. Com ele `'false'` (custódia) a cobrança inteira cai no master e a dívida é nossa. Ler a
-- chave na hora do extrato responde errado sobre o passado, porque a chave muda e o histórico não:
-- basta religar o split para o sistema passar a dizer que não devemos nada de tudo que vendemos em
-- custódia. Quem responde é `payment.split_sent_to_gateway`, gravado no ato da cobrança.
--
-- Ver docs/specs/repasse-ao-parceiro.md.

alter table public.payment
  add column if not exists split_sent_to_gateway boolean;

comment on column public.payment.split_sent_to_gateway is
  'O pedido saiu com a chave `split` para o gateway? true = o parceiro já foi creditado lá e não devemos nada; false = custódia, a dívida é nossa; NULL = desconhecido, tratado como enviado (lado seguro).';

-- Backfill. Corte: 31/07/2026 14:44 UTC, o pagamento da MP-BE2E2B, primeira venda documentadamente
-- sem split (ver payment-split.md). Duas evidências sustentam tratar o anterior como enviado: o
-- interruptor só passou a existir em 31/07/2026, e as cobranças anteriores não têm recebível nenhum
-- em `GET /payables` na conta viva, o que confirma que são da fase de sandbox e que aquele dinheiro
-- nunca existiu na conta de produção.
update public.payment
   set split_sent_to_gateway = (paid_at < timestamptz '2026-07-31 14:44:00+00')
 where provider = 'pagarme'
   and paid_at is not null
   and split_sent_to_gateway is null;

create index if not exists payment_custodia_idx
  on public.payment (provider, status)
  where split_sent_to_gateway is false;

-- ── quanto devemos, em um lugar só ──────────────────────────────────────────
-- Helper compartilhado por `payout_balance` e (na próxima migration) pela RPC que pede o repasse.
-- Duas cópias dessa conta seria a forma mais fácil de repassar valor diferente do que a tela mostra.
-- Sem gate próprio de propósito: quem chama já gateia, e o EXECUTE é revogado de anon/authenticated.
create or replace function public.payout_owed_cents(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
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
      -- `is false` e não `= false`: NULL (desconhecido) fica de fora, tratado como enviado.
      and p.split_sent_to_gateway is false
    group by p.id, p.kind, p.amount, p.refunded_amount
  )
  select coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint
  from per_payment;
$$;
revoke all on function public.payout_owed_cents(uuid, text) from public, anon, authenticated;

-- ── saldo: o que ganhou, o que já mandamos, o que ainda devemos ─────────────
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
  v_owed      bigint;
  v_withdrawn bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  -- Líquido: TUDO que o parceiro ganhou no período todo, tenha o gateway creditado ou não.
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

  v_owed := public.payout_owed_cents(p_company_id, p_provider);

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
    'transferred_cents', 0,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', v_owed
  );
end;
$function$;
