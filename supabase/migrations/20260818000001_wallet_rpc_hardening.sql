-- Hardening dos RPCs do wallet/indicação: alinha com E0.6 e zera o advisor
-- `anon_security_definer_function_executable`.
--
-- Contexto: `get_my_wallet()` e `redeem_referral_code(text)` nasceram na migration
-- `movecoins_wallet` (20260709204418), que veio DEPOIS da `growth_engine_rpc_hardening`
-- (20260709184607). Por isso essas duas não levaram o `revoke ... from public, anon`
-- que as demais RPCs de leitura do motor (`get_my_membership`/`get_my_referrals`/
-- `get_or_create_referral_code`) já têm, e continuaram executáveis por `anon`.
--
-- As duas exigem sessão (`auth.uid()`, levantam exceção sem ela), então `anon` nunca
-- deveria alcançá-las. Isto é defesa em profundidade + paridade de convenção; não muda
-- comportamento para o usuário autenticado.

revoke all on function public.get_my_wallet() from public, anon;
grant execute on function public.get_my_wallet() to authenticated;

revoke all on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;
