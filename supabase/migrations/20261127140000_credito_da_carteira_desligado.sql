-- Carteira Movepark: crédito de cashback e de indicação desligado até o lançamento do Clube.
--
-- Contexto (30/09/2026): o Clube (cashback) e o Indique e ganhe não foram testados de ponta a
-- ponta e saíram da conta do cliente (chave de build `VITE_GROWTH`, desligada). Com a tela
-- escondida, o banco continuaria lançando dinheiro que o cliente não vê e que ninguém validou.
-- Esta migration fecha a torneira na origem: os dois triggers de crédito só lançam com a chave
-- ligada.
--
-- O que muda:
--   1. `app_setting.wallet_credit_enabled` ('false'): a chave que diz se reserva concluída gera
--      crédito na carteira.
--   2. `wallet_credit_enabled()`: leitura da chave num lugar só (mesmo formato de
--      `wallet_credit_expires_at`). Interna, sem execução para anon/authenticated.
--   3. `tg_booking_completed_cashback`: o nível do Clube continua sendo recalculado
--      (`recompute_membership`), porque não é dinheiro; o lançamento de cashback só acontece com
--      a chave ligada.
--   4. `tg_booking_completed_referral`: com a chave desligada não credita nem marca a indicação
--      como recompensada (ela fica `pending`). Como a recompensa depende da PRIMEIRA reserva
--      concluída do indicado, indicação cuja primeira reserva concluir com a chave desligada não
--      é paga depois. Aceito: a tela de indicação está fora do ar e ninguém resgata código.
--   5. O que já está no `wallet_ledger` não é tocado.
--
-- Para lançar: `update app_setting set value = 'true' where key = 'wallet_credit_enabled';`
-- junto com `VITE_GROWTH=on` no build. Ver docs/specs/movepark-wallet.md (nota de 30/09/2026).

-- 1. Chave.
insert into public.app_setting (key, value)
values ('wallet_credit_enabled', 'false')
on conflict (key) do nothing;

-- 2. Leitura da chave.
create or replace function public.wallet_credit_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select lower(trim(value)) in ('true', '1', 'on')
       from public.app_setting where key = 'wallet_credit_enabled'),
    false
  );
$$;

comment on function public.wallet_credit_enabled() is
  'Reserva concluída gera crédito (cashback e indicação) na carteira? Lê app_setting.wallet_credit_enabled; ausente = false.';

revoke all on function public.wallet_credit_enabled() from public, anon, authenticated;

-- 3. Cashback: nível sempre, crédito só com a chave.
create or replace function public.tg_booking_completed_cashback()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bps   int;
  v_cents int;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.profile_id is not null then

    perform public.recompute_membership(new.profile_id);

    if not public.wallet_credit_enabled() then
      return new;
    end if;

    select t.cashback_bps into v_bps
      from public.membership m
      join public.membership_tier t on t.code = m.tier_code
     where m.profile_id = new.profile_id;

    v_cents := round(coalesce(new.total_amount, 0) * coalesce(v_bps, 0) / 100.0)::int;

    if v_cents > 0 then
      insert into public.wallet_ledger
        (profile_id, amount_cents, kind, booking_id, note, expires_at)
      values
        (new.profile_id, v_cents, 'cashback', new.id,
         'Cashback da reserva ' || coalesce(new.code, ''),
         public.wallet_credit_expires_at())
      on conflict (booking_id) where kind = 'cashback' do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- 4. Indicação: nada acontece com a chave desligada.
create or replace function public.tg_booking_completed_referral()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r       record;
  v_cents int;
  v_exp   timestamptz;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.profile_id is not null
     and public.wallet_credit_enabled() then

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
        v_exp   := public.wallet_credit_expires_at();

        insert into public.wallet_ledger
          (profile_id, amount_cents, kind, referral_id, note, expires_at)
        values
          (r.referrer_profile_id, v_cents, 'referral', r.id,
           'Indicação recompensada', v_exp);

        insert into public.wallet_ledger
          (profile_id, amount_cents, kind, referral_id, note, expires_at)
        values
          (new.profile_id, v_cents, 'referral', r.id,
           'Bônus de boas-vindas', v_exp);

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

-- Funções de trigger: ninguém chama direto (revoke nominal, default privileges do Supabase).
revoke all on function public.tg_booking_completed_cashback() from public, anon, authenticated;
revoke all on function public.tg_booking_completed_referral() from public, anon, authenticated;
