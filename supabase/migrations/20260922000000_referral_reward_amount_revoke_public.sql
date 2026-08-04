-- Fecha `referral_reward_amount()` para quem vem pela anon key.
--
-- A função é auxiliar, não endpoint: o front recebe o valor dentro de
-- `get_my_referrals()`. Um SECURITY DEFINER exposto em /rest/v1/rpc sem precisar é
-- superfície de graça.
--
-- O default da coluna `referral.reward_amount` continua funcionando: quem insere em
-- `referral` é a RPC `redeem_referral_code`, que é definer e roda como owner.
--
-- Por que esta migration existe fora de ordem: o revoke foi aplicado direto no banco
-- vivo em 03/08/2026 (versão 20260803191840) e nunca foi commitado. O resultado é que
-- o stack construído do repo (o do job `db` do CI) nascia MAIS PERMISSIVO que produção,
-- com a função alcançável por anon. Um teste de grants passaria nos dois lugares
-- medindo coisas diferentes. Aqui o repo alcança o banco.
--
-- Idempotente: revogar o que já está revogado é no-op.

revoke execute on function public.referral_reward_amount() from public, anon, authenticated;
