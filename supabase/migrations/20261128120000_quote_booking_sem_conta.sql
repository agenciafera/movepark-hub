-- Cotação sem conta, para agente confiável (agent-booking.md §5.1).
--
-- A `quote_booking` exige sessão, então o agente de WhatsApp abria sessão só
-- para responder "quanto custa?", e `assert_verified_identity` cria conta no
-- Hub para telefone novo. Uma pergunta de preço não pode criar cliente.
--
-- `quote_booking_for_agent` cota sem usuário, chamada só pela Edge `mcp` (como
-- service_role) depois de aceitar a chave de agente da Movepark. O miolo é o
-- mesmo da `quote_booking`, agora em `_quote_booking`: o motor da reserva numa
-- subtransação desfeita.
--
-- Cupom fica de fora sem usuário: o limite de uso por cliente não tem contra
-- quem ser medido, e a cotação diria um desconto que a reserva pode recusar.
-- Cotação com cupom continua pela `quote_booking`, com sessão.

create or replace function public._quote_booking(
  p_profile_id uuid,
  p_api_key_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_fare_tier public.fare_tier,
  p_add_on_ids uuid[],
  p_coupon_code text,
  p_passenger_count integer,
  p_has_pcd boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res jsonb;
begin
  begin
    v_res := public._create_booking_core(
      p_profile_id, p_api_key_id, null, null, null,
      p_location_parking_type_id, p_check_in_at, p_check_out_at,
      p_passenger_count, coalesce(p_has_pcd, false), null,
      p_add_on_ids, p_coupon_code, 'mcp', coalesce(p_fare_tier, 'basica'));
    -- Desfaz a reserva levando o resultado na mensagem. Erro de verdade do core
    -- (sem vaga, estadia mínima...) não cai aqui e sobe como está.
    raise exception using errcode = 'MPQ01', message = v_res::text;
  exception when sqlstate 'MPQ01' then
    v_res := sqlerrm::jsonb;
  end;

  -- O que só existe numa reserva de verdade não vai na cotação.
  return (v_res - 'code' - 'booking_id' - 'expires_at') || jsonb_build_object('quote', true);
end $$;

revoke all on function public._quote_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.fare_tier, uuid[], text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public._quote_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.fare_tier, uuid[], text, integer, boolean)
  to service_role;

-- Mesma assinatura e mesmo comportamento de antes; o corpo passa a ser o miolo.
create or replace function public.quote_booking(
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_fare_tier public.fare_tier default 'basica',
  p_add_on_ids uuid[] default null,
  p_coupon_code text default null,
  p_passenger_count integer default null,
  p_has_pcd boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Cupom tem limite por usuário: a cotação precisa saber quem é, como a reserva.
  if auth.uid() is null then
    raise exception 'Faça login primeiro.' using errcode = '42501';
  end if;
  return public._quote_booking(auth.uid(), null, p_location_parking_type_id, p_check_in_at,
    p_check_out_at, p_fare_tier, p_add_on_ids, p_coupon_code, p_passenger_count, p_has_pcd);
end $$;

create or replace function public.quote_booking_for_agent(
  p_api_key_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_fare_tier public.fare_tier default 'basica',
  p_add_on_ids uuid[] default null,
  p_passenger_count integer default null,
  p_has_pcd boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A Edge já aceitou a chave; aqui ela é conferida de novo, para a função não
  -- valer para qualquer id que chegue: só chave da Movepark, viva.
  if not exists (
    select 1 from public.api_key k
     where k.id = p_api_key_id and k.company_id is null and k.revoked_at is null
       and (k.expires_at is null or k.expires_at > now())
  ) then
    raise exception 'Chave de agente confiável obrigatória.' using errcode = '42501';
  end if;
  return public._quote_booking(null, p_api_key_id, p_location_parking_type_id, p_check_in_at,
    p_check_out_at, p_fare_tier, p_add_on_ids, null, p_passenger_count, p_has_pcd);
end $$;

comment on function public.quote_booking_for_agent(uuid, uuid, timestamptz, timestamptz, public.fare_tier, uuid[], integer, boolean) is
  'Cotação sem usuário para chave de agente da Movepark. Sem cupom. Mesmo motor da quote_booking.';

revoke all on function public.quote_booking_for_agent(uuid, uuid, timestamptz, timestamptz, public.fare_tier, uuid[], integer, boolean)
  from public, anon, authenticated;
grant execute on function public.quote_booking_for_agent(uuid, uuid, timestamptz, timestamptz, public.fare_tier, uuid[], integer, boolean)
  to service_role;
