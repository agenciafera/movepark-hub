-- Reconciliação: as RPCs do motor de crescimento estão FECHADAS para anon no banco
-- vivo desde 20260709184607 (`growth_engine_rpc_hardening`) e 20260709193028
-- (`growth_engine_read_rpcs`), mas o repo não reproduz esse estado.
--
-- Como se perdeu: no rebaseline, as quatro migrations do motor (membership_engine,
-- referral_engine e as duas de hardening acima) foram consolidadas num arquivo só,
-- `20260723050000_growth_engine_membership_referral.sql`, e dele sobraram apenas os
-- três `grant ... to authenticated`. Os `revoke` ficaram de fora.
--
-- Por que isso não é inofensivo: no Supabase, função nova no schema `public` nasce com
-- EXECUTE concedido a `anon` por default privilege. O `grant ... to authenticated` não
-- desfaz isso, e as quatro são SECURITY DEFINER. Ou seja: em produção estão fechadas,
-- mas o stack construído do baseline + migrations (CI, ambiente novo) as recria
-- abertas ao portador da anon key, que é pública por design. `recompute_membership` é
-- a pior das quatro: não checa `auth.uid()`, recebe o profile_id por parâmetro e
-- escreve em `membership`.
--
-- As duas funções-trigger daquela migration (`tg_booking_completed_membership` e
-- `tg_booking_completed_referral`) já estão cobertas pela varredura de
-- 20260913000000, que fecha toda função-trigger do schema.

revoke execute on function public.recompute_membership(uuid)        from public, anon, authenticated;
revoke execute on function public.get_or_create_referral_code(uuid) from public, anon;
revoke execute on function public.get_my_membership()               from public, anon;
revoke execute on function public.get_my_referrals()                from public, anon;

-- O lado logado continua chamando (é a tela de indicações e o card de membership).
grant execute on function public.get_or_create_referral_code(uuid) to authenticated;
grant execute on function public.get_my_membership()               to authenticated;
grant execute on function public.get_my_referrals()                to authenticated;
