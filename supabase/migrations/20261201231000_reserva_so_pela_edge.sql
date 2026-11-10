-- Criar reserva direto pela API deixava o usuário logado reservar na conta de outra pessoa
-- (09/11/2026).
--
-- `create_booking_atomic` e `_create_booking_core` são SECURITY DEFINER, recebem o `profile_id`
-- como parâmetro e não conferem `auth.uid()`. Com EXECUTE para `authenticated`, qualquer cliente
-- logado chamava `/rest/v1/rpc/create_booking_atomic` com o `profile_id` de outra pessoa e criava
-- reservas pendentes na conta dela, segurando vagas reais até expirarem. O núcleo era pior: aceita
-- também `p_created_via_api_key_id` e o contato do cliente, e pula a deduplicação.
--
-- Ninguém legítimo depende desse EXECUTE: o site, a Mia e o chat passam pela Edge `create-booking`,
-- que confere o JWT e chama a RPC com a chave de serviço. Medido nos logs em 09/11: as 14 chamadas
-- das últimas 24h vieram todas da Edge. O núcleo só é chamado por outras funções definer
-- (`create_booking_atomic`, `api_create_booking`), que rodam como dono.
--
-- Revoke nominal, e não só de `public`: função nova no schema public nasce executável por
-- anon/authenticated pelos default privileges do Supabase.

revoke execute on function public.create_booking_atomic(
  uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier
) from public, anon, authenticated;

revoke execute on function public._create_booking_core(
  uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier
) from public, anon, authenticated;

grant execute on function public.create_booking_atomic(
  uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier
) to service_role;

grant execute on function public._create_booking_core(
  uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier
) to service_role;
