-- Renomeia os objetos da carteira: prefixo `movecoins_` passa a `wallet_`.
--
-- Decisão de produto: a carteira se chama "carteira Movepark" (Movepark Wallet) e
-- guarda real (BRL) 1 para 1; o nome "MoveCoins" foi descontinuado. A tabela está
-- vazia em produção, então o rename é seguro (sem migração de dados).
--
-- Renomeia tabela, constraints, índices e a chave de `app_setting`. As três funções
-- que referenciam a tabela/chave por nome (`get_my_wallet`, `tg_booking_completed_cashback`,
-- `tg_booking_completed_referral`) são recriadas apontando para os novos nomes.
-- Os arquivos históricos de migration (20260723500000 / 20260724000000) NÃO são editados.

-- ── Tabela + constraints + índices ───────────────────────────────────────────
alter table public.movecoins_ledger rename to wallet_ledger;

alter table public.wallet_ledger rename constraint movecoins_ledger_pkey             to wallet_ledger_pkey;
alter table public.wallet_ledger rename constraint movecoins_ledger_kind_check       to wallet_ledger_kind_check;
alter table public.wallet_ledger rename constraint movecoins_ledger_booking_id_fkey  to wallet_ledger_booking_id_fkey;
alter table public.wallet_ledger rename constraint movecoins_ledger_profile_id_fkey  to wallet_ledger_profile_id_fkey;
alter table public.wallet_ledger rename constraint movecoins_ledger_referral_id_fkey to wallet_ledger_referral_id_fkey;

alter index public.movecoins_ledger_profile_idx rename to wallet_ledger_profile_idx;
alter index public.movecoins_cashback_once      rename to wallet_cashback_once;

-- ── Configuração ─────────────────────────────────────────────────────────────
update public.app_setting set key = 'wallet_expiry_days' where key = 'movecoins_expiry_days';

-- ── Funções que referenciam a tabela/chave (recriadas com os novos nomes) ─────
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
    from public.wallet_ledger
   where profile_id = v_uid and (expires_at is null or expires_at > now());

  select coalesce(sum(amount_cents), 0), min(expires_at)
    into v_expiring, v_exp_at
    from public.wallet_ledger
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
      select * from public.wallet_ledger
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
        from public.app_setting where key = 'wallet_expiry_days';
      v_days := coalesce(v_days, 90);

      insert into public.wallet_ledger
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

create or replace function public.tg_booking_completed_referral()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r       record;
  v_cents int;
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

        insert into public.wallet_ledger
          (profile_id, amount_cents, kind, referral_id, note, expires_at)
        values
          (r.referrer_profile_id, v_cents, 'referral', r.id,
           'Indicação recompensada', now() + interval '90 days');

        insert into public.wallet_ledger
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

-- ── Hardening reafirmado (create-or-replace preserva ACL, mas fixamos aqui) ────
revoke all on function public.get_my_wallet() from public, anon;
grant execute on function public.get_my_wallet() to authenticated;

revoke all on function public.tg_booking_completed_cashback() from public, anon, authenticated;
revoke all on function public.tg_booking_completed_referral() from public, anon, authenticated;
