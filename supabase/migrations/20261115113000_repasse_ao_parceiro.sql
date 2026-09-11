-- Repasse ao parceiro (E0.3.4): o hop que faltava na custódia.
--
-- `POST /transfers` tem DUAS semânticas, definidas pelo corpo. `{amount, recipient_id}` é saque (o
-- recebedor é a origem, o destino é a conta bancária dele) e já existe em `payout_withdrawal`.
-- `{amount, source_id, target_id}` é repasse entre recebedores, e é o que falta: tirar do master da
-- Movepark e creditar o recebedor do parceiro.
--
-- Tabela própria, e não reuso de `payout_withdrawal`: misturar as duas semânticas faria o
-- "já transferido" da tela do parceiro contar o mesmo dinheiro duas vezes, o repasse que entrega e
-- o saque que ele tira depois.
--
-- Ver docs/specs/repasse-ao-parceiro.md.

create table if not exists public.payout_transfer (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.company(id) on delete restrict,
  provider              text not null default 'pagarme',
  amount_cents          integer not null check (amount_cents > 0),
  status                public.payout_withdrawal_status not null default 'created',
  -- Nasce no banco e vai no header `Idempotency-Key`. Sem ela, um timeout na chamada vira
  -- transferência duplicada na retentativa.
  idempotency_key       text not null unique,
  external_transfer_id  text,
  source_recipient_id   text not null,
  target_recipient_id   text not null,
  requested_by          uuid references public.profiles(id) on delete set null,
  requested_at          timestamptz not null default now(),
  paid_at               timestamptz,
  failed_reason         text,
  raw                   jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create unique index if not exists payout_transfer_external_idx
  on public.payout_transfer (provider, external_transfer_id)
  where external_transfer_id is not null;

create index if not exists payout_transfer_company_idx
  on public.payout_transfer (company_id, status);

-- Um repasse em andamento por empresa. A RPC já serializa por advisory lock, mas a corrida real
-- acontece entre processos e o índice é a única barreira que não depende de quem chama.
create unique index if not exists payout_transfer_um_em_andamento_idx
  on public.payout_transfer (company_id, provider)
  where status in ('created', 'processing') and deleted_at is null;

drop trigger if exists set_updated_at on public.payout_transfer;
create trigger set_updated_at before update on public.payout_transfer
  for each row execute function public.set_updated_at();

alter table public.payout_transfer enable row level security;

-- Espelha `payout_withdrawal`: hub_admin lê tudo, o parceiro lê o que é dele, e ninguém escreve por
-- RLS. Toda escrita passa pela Edge, com service_role.
drop policy if exists payout_transfer_admin_read on public.payout_transfer;
create policy payout_transfer_admin_read on public.payout_transfer
  for select to authenticated using (public.is_hub_admin());

drop policy if exists payout_transfer_company_read on public.payout_transfer;
create policy payout_transfer_company_read on public.payout_transfer
  for select to authenticated
  using (company_id in (select public.current_company_ids()));

comment on table public.payout_transfer is
  'Repasse da Movepark ao recebedor do parceiro (POST /transfers com source_id/target_id). Hop 1 da custódia; o saque do parceiro para o banco dele é o hop 2, em payout_withdrawal.';

-- ── quanto já foi repassado ─────────────────────────────────────────────────
-- `created` e `processing` contam junto com `paid`: enquanto o gateway não disse que falhou, aquele
-- dinheiro está comprometido, e não contá-lo deixaria um segundo repasse do mesmo valor passar.
create or replace function public.payout_transferred_cents(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(amount_cents), 0)::bigint
  from public.payout_transfer
  where company_id = p_company_id
    and provider = p_provider
    and status in ('created', 'processing', 'paid')
    and deleted_at is null;
$$;
revoke all on function public.payout_transferred_cents(uuid, text) from public, anon, authenticated;

-- ── o pedido de repasse ─────────────────────────────────────────────────────
-- SÓ a Movepark. `payouts:write` é do Dono da empresa, para saque e KYC; repasse é ato nosso, e um
-- escopo delegável aqui deixaria o parceiro mandar em quanto recebe.
create or replace function public.payout_transfer_request(
  p_company_id uuid,
  p_amount_cents integer,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row        public.payout_transfer;
  v_owed       bigint;
  v_transferred bigint;
  v_disponivel bigint;
  v_source     text;
  v_target     text;
  v_target_status public.payout_recipient_status;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark faz repasse ao parceiro.' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor do repasse inválido.' using errcode = '22023';
  end if;

  -- Serializa por empresa: dois cliques ao mesmo tempo não viram dois repasses.
  perform pg_advisory_xact_lock(hashtext('payout_transfer:' || p_company_id::text));

  -- Repasse em andamento é RETOMADO, não duplicado. É o que torna a retentativa segura: a Edge
  -- recebe a mesma linha e a mesma chave de idempotência que já tinha.
  select * into v_row
  from public.payout_transfer
  where company_id = p_company_id
    and provider = p_provider
    and status in ('created', 'processing')
    and deleted_at is null
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object('reused', true, 'transfer', to_jsonb(v_row));
  end if;

  v_owed        := public.payout_owed_cents(p_company_id, p_provider);
  v_transferred := public.payout_transferred_cents(p_company_id, p_provider);
  v_disponivel  := v_owed - v_transferred;

  if p_amount_cents > v_disponivel then
    raise exception 'Repasse de % excede o devido (% em aberto).',
      p_amount_cents, greatest(v_disponivel, 0) using errcode = 'P0001';
  end if;

  select value into v_source from public.app_setting where key = 'pagarme_movepark_recipient_id';
  if coalesce(btrim(v_source), '') = '' then
    raise exception 'Recebedor master da Movepark não configurado.' using errcode = 'P0001';
  end if;

  select external_recipient_id, status into v_target, v_target_status
  from public.payout_recipient
  where company_id = p_company_id and provider = p_provider and deleted_at is null
  limit 1;
  if v_target is null then
    raise exception 'O parceiro não tem recebedor no gateway.' using errcode = 'P0001';
  end if;
  if v_target_status <> 'active' then
    raise exception 'O recebedor do parceiro não está apto a receber (%).', v_target_status
      using errcode = 'P0001';
  end if;

  insert into public.payout_transfer (
    company_id, provider, amount_cents, idempotency_key,
    source_recipient_id, target_recipient_id, requested_by
  ) values (
    p_company_id, p_provider, p_amount_cents,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    btrim(v_source), v_target, auth.uid()
  )
  returning * into v_row;

  return jsonb_build_object('reused', false, 'transfer', to_jsonb(v_row));
end;
$function$;
revoke all on function public.payout_transfer_request(uuid, integer, text) from public, anon;
grant execute on function public.payout_transfer_request(uuid, integer, text) to authenticated;

-- ── saldo: agora com o repasse descontado ───────────────────────────────────
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
    'balance_cents', greatest(v_owed - v_transferred, 0)
  );
end;
$function$;
