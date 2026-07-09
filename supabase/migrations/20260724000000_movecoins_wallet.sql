-- Motor de Crescimento · Engrenagem 2 — Carteira MoveCoins (dinheiro de volta)
--
-- Contexto: os níveis do Clube (membership/membership_tier) e a indicação
-- (referral/referral_code) já existiam no banco (recompute_membership,
-- get_my_membership, get_my_referrals, triggers de conclusão). Faltava a
-- CARTEIRA em reais — o cashback era só `cashback_bps` no catálogo de níveis,
-- sem lugar pra acumular. Esta migration cria o ledger, a leitura de saldo e o
-- crédito automático na conclusão da reserva (cashback do nível + recompensa de
-- indicação). O DÉBITO no checkout (gastar o saldo) fica para a fase seguinte:
-- abater cobrança toca o fluxo de pagamento (ADR-004) e é server-authoritative.

-- ─────────────────────────────────────────────────────────────────────────────
-- Ledger append-only. Saldo = soma dos lançamentos não expirados.
-- amount_cents > 0 crédito, < 0 débito. Créditos expiram; débitos não.
create table if not exists public.movecoins_ledger (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null,
  kind         text not null check (kind in ('cashback', 'referral', 'debit', 'expire', 'adjust')),
  booking_id   uuid references public.booking(id) on delete set null,
  referral_id  uuid references public.referral(id) on delete set null,
  note         text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists movecoins_ledger_profile_idx
  on public.movecoins_ledger (profile_id, created_at desc);

-- Idempotência: no máximo um crédito de cashback por reserva.
create unique index if not exists movecoins_cashback_once
  on public.movecoins_ledger (booking_id) where kind = 'cashback';

-- RLS: trancada (sem policy) — acesso só via RPC/trigger SECURITY DEFINER,
-- mesmo padrão de membership/referral.
alter table public.movecoins_ledger enable row level security;

-- Configuração (calibrável no Manager): validade do crédito em dias.
insert into public.app_setting (key, value)
values ('movecoins_expiry_days', '90')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Leitura do saldo + próximos a expirar + extrato recente.
create or replace function public.get_my_wallet()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance  int;
  v_expiring int;
  v_exp_at   timestamptz;
  v_tx       jsonb;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  select coalesce(sum(amount_cents), 0) into v_balance
    from public.movecoins_ledger
   where profile_id = v_uid and (expires_at is null or expires_at > now());

  -- créditos ainda válidos que vencem nos próximos 60 dias
  select coalesce(sum(amount_cents), 0), min(expires_at)
    into v_expiring, v_exp_at
    from public.movecoins_ledger
   where profile_id = v_uid and amount_cents > 0
     and expires_at is not null and expires_at > now()
     and expires_at <= now() + interval '60 days';

  select coalesce(jsonb_agg(jsonb_build_object(
           'amount_cents', amount_cents,
           'kind', kind,
           'note', note,
           'created_at', created_at,
           'expires_at', expires_at
         ) order by created_at desc), '[]'::jsonb)
    into v_tx
    from (
      select * from public.movecoins_ledger
       where profile_id = v_uid
       order by created_at desc
       limit 20
    ) s;

  return jsonb_build_object(
    'balance_cents',  v_balance,
    'expiring_cents', v_expiring,
    'expiring_at',    v_exp_at,
    'transactions',   v_tx
  );
end;
$$;

grant execute on function public.get_my_wallet() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Crédito de cashback na conclusão da reserva: total * cashback_bps do nível.
-- Auto-suficiente: recomputa o nível antes de ler o bps (independe da ordem
-- dos triggers). Idempotente pelo índice parcial (um cashback por reserva).
create or replace function public.tg_booking_completed_cashback()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bps   int;
  v_cents int;
  v_days  int;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.profile_id is not null then

    perform public.recompute_membership(new.profile_id);

    select t.cashback_bps into v_bps
      from public.membership m
      join public.membership_tier t on t.code = m.tier_code
     where m.profile_id = new.profile_id;

    v_cents := round(coalesce(new.total_amount, 0) * coalesce(v_bps, 0) / 100.0)::int;

    if v_cents > 0 then
      select coalesce(nullif(value, '')::int, 90) into v_days
        from public.app_setting where key = 'movecoins_expiry_days';
      v_days := coalesce(v_days, 90);

      insert into public.movecoins_ledger
        (profile_id, amount_cents, kind, booking_id, note, expires_at)
      values
        (new.profile_id, v_cents, 'cashback', new.id,
         'Cashback da reserva ' || coalesce(new.code, ''),
         now() + make_interval(days => v_days))
      on conflict (booking_id) where kind = 'cashback' do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_completed_cashback on public.booking;
create trigger booking_completed_cashback
  after insert or update on public.booking
  for each row execute function public.tg_booking_completed_cashback();

-- ─────────────────────────────────────────────────────────────────────────────
-- Indicação: recompensa os dois lados quando a 1ª reserva do indicado conclui.
-- Substitui a versão anterior (que só marcava 'qualified') para também creditar
-- reward_amount na carteira dos dois e fechar como 'rewarded'.
create or replace function public.tg_booking_completed_referral()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r          record;
  v_cents    int;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.profile_id is not null then

    -- só a PRIMEIRA reserva concluída do indicado qualifica
    if not exists (
      select 1 from public.booking b
       where b.profile_id = new.profile_id
         and b.status = 'completed'
         and b.id <> new.id
    ) then
      for r in
        select * from public.referral
         where referred_profile_id = new.profile_id and status = 'pending'
      loop
        v_cents := round(coalesce(r.reward_amount, 25) * 100)::int;

        -- crédito para quem indicou ("+R$25 de volta")
        insert into public.movecoins_ledger
          (profile_id, amount_cents, kind, referral_id, note, expires_at)
        values
          (r.referrer_profile_id, v_cents, 'referral', r.id,
           'Indicação recompensada', now() + interval '90 days');

        -- crédito para quem foi indicado (na carteira, pra próxima reserva)
        insert into public.movecoins_ledger
          (profile_id, amount_cents, kind, referral_id, note, expires_at)
        values
          (new.profile_id, v_cents, 'referral', r.id,
           'Bônus de boas-vindas', now() + interval '90 days');

        update public.referral
           set status = 'rewarded',
               qualifying_booking_id = new.id,
               qualified_at = now(),
               rewarded_at = now(),
               updated_at = now()
         where id = r.id;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Atribuição: registra a indicação quando o novo cliente usa um código.
-- Guardas: código existe, não é o próprio, ainda sem reserva concluída, uma vez.
create or replace function public.redeem_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_norm  text := upper(trim(coalesce(p_code, '')));
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  if v_norm = '' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select profile_id into v_owner from public.referral_code where code = v_norm;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  if exists (select 1 from public.booking where profile_id = v_uid and status = 'completed') then
    return jsonb_build_object('ok', false, 'error', 'not_new');
  end if;
  if exists (select 1 from public.referral where referred_profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;

  insert into public.referral (code, referrer_profile_id, referred_profile_id, status)
  values (v_norm, v_owner, v_uid, 'pending')
  on conflict (referrer_profile_id, referred_profile_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.redeem_referral_code(text) to authenticated;
