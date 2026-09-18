-- ---------------------------------------------------------------------------
-- coupon_evaluate volta a ser ajudante interno
-- ---------------------------------------------------------------------------
-- Quem fala com o cliente é validate_coupon / validate_coupon_public / customer_coupon_wallet,
-- todas SECURITY DEFINER (chamam este helper como dono, então nada quebra).
--
-- A migration original fez `revoke ... from public`, que NÃO alcança o grant que o Supabase dá a
-- anon e authenticated por privilégio padrão. É a mesma lição da 20261027094500.
--
-- Deixar aberto agora é pior do que era ontem, por dois motivos:
--   1. O código passou a valer dinheiro da Movepark (BEMVINDO30 dá 30%), então varrer códigos
--      contra a função vira ataque com retorno.
--   2. `p_profile_id` vem do CHAMADOR. Com a audiência nova, um anônimo pode passar o id de outra
--      pessoa e ler do erro (not_first_purchase / not_second_purchase / not_winback) se aquela
--      pessoa tem 0, 1 ou mais reservas pagas. Vazamento de histórico de terceiro.
revoke all on function public.coupon_evaluate(text, uuid, uuid, numeric, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.coupon_evaluate(text, uuid, uuid, numeric, integer, uuid)
  to service_role;
