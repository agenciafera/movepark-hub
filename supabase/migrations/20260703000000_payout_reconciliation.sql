-- E0.3.3 — Reconciliação do split + extrato de repasses. Deriva o repasse do snapshot já gravado
-- (payment.split jsonb) — sem depender de API extra (reconciliação INTERNA, confirmada pelos webhooks).
-- A perna do PARCEIRO é a que tem liable=true; a da MOVEPARK liable=false (buildSplit garante isso),
-- então a separação não depende do app_setting atual. Registra também os SAQUES reais (payout_withdrawal),
-- alimentados pelos eventos transfer.* do Pagar.me (Edge pagarme-webhook). Ver docs/specs/payment-split.md.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Saque real (transferência recebedor → banco do parceiro). Escrita só service_role (webhook).
-- ───────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.payout_withdrawal_status as enum
    ('created', 'processing', 'paid', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

create table if not exists public.payout_withdrawal (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.company(id) on delete cascade,
  provider              text not null default 'pagarme',
  external_transfer_id  text not null,                       -- id da transferência no gateway
  external_recipient_id text,                                -- recebedor que originou (auditoria)
  amount_cents          integer not null check (amount_cents >= 0),
  fee_cents             integer not null default 0 check (fee_cents >= 0),
  status                public.payout_withdrawal_status not null default 'created',
  requested_at          timestamptz,                         -- transfer.created
  paid_at               timestamptz,                         -- transfer.paid
  raw                   jsonb,                               -- último payload (auditoria)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Idempotência do saque: 1 linha por transferência do gateway (upsert no webhook).
create unique index if not exists payout_withdrawal_external_uidx
  on public.payout_withdrawal (provider, external_transfer_id);
create index if not exists payout_withdrawal_company_idx
  on public.payout_withdrawal (company_id, created_at desc);
create index if not exists payout_withdrawal_status_idx
  on public.payout_withdrawal (status) where deleted_at is null;

create or replace trigger payout_withdrawal_set_updated_at
  before update on public.payout_withdrawal
  for each row execute function public.set_updated_at();

alter table public.payout_withdrawal enable row level security;

do $$ begin
  create policy payout_withdrawal_admin_all on public.payout_withdrawal
    to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payout_withdrawal_operator_select on public.payout_withdrawal
    for select to authenticated
    using (company_id in (select public.current_company_ids()));
exception when duplicate_object then null; end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Config de saque (taxa + cadência). Diluir a taxa = transferir agregado (não por transação).
--    O intervalo é aplicado no recebedor (transfer_settings) pela Edge sync-recipient.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value) values
  ('payout_withdrawal_fee_cents', '367'),
  ('payout_transfer_enabled', 'true'),
  ('payout_transfer_interval', 'daily'),   -- daily | weekly | monthly
  ('payout_transfer_day', '0')
  on conflict (key) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RPC de reconciliação — extrato de repasse por empresa/período.
--    SECURITY DEFINER: autoriza no corpo (hub_admin → todas; operator → só as suas).
--    Repasse em CENTAVOS (a soma do split é a fonte da verdade); o front divide por 100.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.payout_statement(
  p_from          timestamptz,
  p_to            timestamptz,
  p_company_id    uuid default null,
  p_include_lines boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is true), 0)  as partner_cents,
      coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is false), 0) as movepark_cents
    from public.payment p
    join public.booking b   on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                       as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)    as refunded_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'paid'), 0)        as net_partner_cents,
      coalesce(sum(movepark_cents) filter (where status = 'paid'), 0)       as movepark_commission_cents,
      count(*) filter (where status = 'paid')                               as paid_count,
      count(*) filter (where status = 'refunded')                          as refunded_count
    from legs
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
            'partner_cents', l.partner_cents,
            'movepark_cents', l.movepark_cents
          ) order by l.event_at desc), '[]'::jsonb)
          from legs l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$$;

-- Saldo a repassar = repasse líquido (todo período) − saques já pagos.
create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider   text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin  boolean := public.is_hub_admin();
  v_net       bigint;
  v_withdrawn bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is true), 0)
    into v_net
  from public.payment p
  join public.booking b   on b.id = p.booking_id
  join public.location loc on loc.id = b.location_id
  left join lateral jsonb_array_elements(p.split) as r on true
  where p.provider = p_provider
    and p.status = 'paid'
    and loc.company_id = p_company_id;

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
$$;

revoke all on function public.payout_statement(timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.payout_statement(timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
revoke all on function public.payout_balance(uuid, text) from public, anon;
grant execute on function public.payout_balance(uuid, text) to authenticated, service_role;
