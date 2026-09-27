-- Carteira Movepark: a validade do crédito fica pausada até existir o débito no checkout.
--
-- Contexto (27/09/2026): o cashback e a indicação creditam real na carteira com `expires_at =
-- now() + wallet_expiry_days` (90), mas nenhum checkout debita esse saldo ainda. Resultado: o
-- cliente vê "R$ X expiram em N dias" de um dinheiro que ele não tem como gastar, e o crédito
-- vence sem nunca ter tido uso. Enquanto o débito não existir, crédito novo nasce sem validade
-- e o que está vivo hoje deixa de ter data. Quando o débito entrar, basta virar a chave e os
-- créditos novos voltam a ganhar prazo; os antigos ficam como estão (ninguém retroage).
--
-- O que muda:
--   1. `app_setting.wallet_debit_enabled` ('false'): a chave que diz se o saldo pode ser gasto.
--   2. `wallet_credit_expires_at()`: a única conta de validade. Devolve nulo com a chave em
--      'false' e `now() + wallet_expiry_days` com ela em 'true'. Os dois triggers de crédito
--      (`tg_booking_completed_cashback`, `tg_booking_completed_referral`) passam a usá-la; a
--      indicação tinha 90 dias cravados no corpo e agora segue a mesma configuração.
--   3. Créditos vivos com data são zerados (update idempotente, só roda com a chave em 'false').
--      No banco vivo em 27/09/2026 eram 3 lançamentos (todos `cashback`), nenhum vencido.
--   4. `get_my_wallet()` já tratava `expires_at` nulo como "não expira" (saldo soma
--      `expires_at is null or expires_at > now()`; "próximos a vencer" exige `is not null`).
--      Não é recriada; o pgTAP `wallet_no_expiry.test.sql` trava esse contrato.
--
-- Ver docs/specs/movepark-wallet.md (nota de 27/09/2026).

-- 1. Chave: o débito no checkout existe?
insert into public.app_setting (key, value)
values ('wallet_debit_enabled', 'false')
on conflict (key) do nothing;

-- 2. A conta de validade, num lugar só.
create or replace function public.wallet_credit_expires_at()
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_enabled boolean;
  v_days    int;
begin
  select coalesce(nullif(lower(trim(value)), '') in ('true', '1', 'on'), false)
    into v_enabled
    from public.app_setting where key = 'wallet_debit_enabled';
  if not coalesce(v_enabled, false) then
    return null;
  end if;

  select coalesce(nullif(value, '')::int, 90) into v_days
    from public.app_setting where key = 'wallet_expiry_days';
  return now() + make_interval(days => coalesce(v_days, 90));
end;
$$;

comment on function public.wallet_credit_expires_at() is
  'Validade de um crédito novo da carteira: nulo (não expira) enquanto app_setting.wallet_debit_enabled for false; now() + wallet_expiry_days quando o débito no checkout existir.';

-- Função interna dos triggers: ninguém de fora precisa executar (revoke nominal, ver memória
-- sobre default privileges do Supabase).
revoke all on function public.wallet_credit_expires_at() from public, anon, authenticated;

-- 3. Triggers de crédito passam a perguntar a validade para a função acima.
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
     and new.profile_id is not null then

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

revoke all on function public.tg_booking_completed_cashback() from public, anon, authenticated;
revoke all on function public.tg_booking_completed_referral() from public, anon, authenticated;

-- 4. Créditos vivos deixam de ter data enquanto não há como gastar. Idempotente: só toca
--    lançamento positivo, ainda válido e com data, e só com a chave desligada.
do $$
declare
  v_n int;
begin
  if public.wallet_credit_expires_at() is null then
    update public.wallet_ledger
       set expires_at = null
     where amount_cents > 0
       and expires_at is not null
       and expires_at > now();
    get diagnostics v_n = row_count;
    raise notice 'carteira: % crédito(s) vivo(s) passaram a não expirar', v_n;
  end if;
end $$;
