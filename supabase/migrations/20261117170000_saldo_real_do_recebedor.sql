-- O saldo do recebedor passa a vir do gateway, em vez de ser deduzido (varredura de 15/09/2026).
--
-- O que motivou: a tela do parceiro ganhou de manhã um número derivado dos nossos próprios
-- registros, e ele não dá para virar "saldo". Dois motivos, os dois medidos:
--
--   1. `payout_withdrawal` só é alimentada pelo webhook `transfer.*`, e nenhum evento desse tipo
--      chegou em toda a história da conta. A tabela está vazia, então "sacado" é sempre zero.
--   2. O recebedor da Virapark tem transferência automática mensal (dia 10). O dinheiro vai para o
--      banco dela sozinho, sem passar por nós, e nada no nosso banco registra a saída.
--
-- Somando os dois, qualquer número que a gente derivasse estaria afirmando um saldo que ninguém
-- leu. Quem sabe é o gateway, e `GET /recipients/{id}/balance` responde os três valores de uma vez:
-- disponível, a liberar e já transferido para o banco. O último fecha justamente o buraco do
-- `payout_withdrawal`.
--
-- As colunas guardam a última leitura com o carimbo dela, porque saldo lido é foto, não verdade
-- permanente: sem `balance_synced_at` a tela não teria como dizer de quando é o número, e um valor
-- velho sem data mente com cara de atual. Quem preenche é o cron `refresh-recipients`.
--
-- Ver docs/specs/payment-split.md.

alter table public.payout_recipient
  add column if not exists balance_available_cents   bigint,
  add column if not exists balance_waiting_cents     bigint,
  add column if not exists balance_transferred_cents bigint,
  add column if not exists balance_synced_at         timestamptz;

comment on column public.payout_recipient.balance_available_cents is
  'Saldo disponível para saque no gateway, na última leitura. NULL = nunca lido.';
comment on column public.payout_recipient.balance_waiting_cents is
  'Valor ainda liquidando no gateway (waiting_funds), na última leitura.';
comment on column public.payout_recipient.balance_transferred_cents is
  'Acumulado que o gateway já transferiu para o banco do parceiro. É o que o payout_withdrawal '
  'nunca soube, porque o webhook transfer.* não chega e a transferência automática não passa por nós.';
comment on column public.payout_recipient.balance_synced_at is
  'Quando o saldo acima foi lido. Saldo sem carimbo mente com cara de atual, então a tela só mostra '
  'o número junto da data.';

-- ── o saldo do parceiro passa a carregar a leitura do gateway ───────────────
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
  v_recipient    jsonb;
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

  -- A foto do gateway, quando existe. NULL inteiro enquanto ninguém leu, para a tela poder
  -- distinguir "zero" de "não sei".
  select case when pr.balance_synced_at is null then null else jsonb_build_object(
           'available_cents',   coalesce(pr.balance_available_cents, 0),
           'waiting_cents',     coalesce(pr.balance_waiting_cents, 0),
           'transferred_cents', coalesce(pr.balance_transferred_cents, 0),
           'synced_at',         pr.balance_synced_at
         ) end
    into v_recipient
  from public.payout_recipient pr
  where pr.company_id = p_company_id and pr.provider = p_provider and pr.deleted_at is null
  limit 1;

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
    'overpaid_cents', greatest(v_transferred - v_owed, 0),
    'recipient_balance', v_recipient
  );
end;
$function$;
