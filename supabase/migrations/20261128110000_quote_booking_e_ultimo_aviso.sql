-- Cotação idêntica à reserva + último aviso por reserva (agent-booking.md §5.1 e §5.2).
--
-- 1. `quote_booking`. O `simulate_price` recebe só o número de diárias: não sabe
--    das datas (desconto por antecedência, tolerância da unidade no cálculo das
--    diárias), da tarifa (Flex/Superflex), do cupom nem dos adicionais. O agente
--    citava um valor e a reserva gravava outro. Em vez de reescrever o motor numa
--    segunda função (que divergiria na primeira mudança), a cotação RODA o próprio
--    `_create_booking_core` numa subtransação e a desfaz no fim: o valor é, por
--    construção, o que a reserva gravaria. Ela também recusa pelos mesmos motivos
--    (sem vaga, estadia mínima, antecedência), com as mesmas mensagens.
--
--    Nada sobra: a reserva, os itens e o que os triggers enfileiram somem com a
--    subtransação. Só o `FOR UPDATE` da disponibilidade é tomado e solto no fim.
--
-- 2. `my_booking_notifications`. Os avisos do Hub saem pelo mesmo número de
--    WhatsApp da Mia; quando o cliente responde a um template, a resposta cai na
--    conversa dela sem contexto. A RPC devolve o último aviso de cada reserva DO
--    PRÓPRIO usuário (`notification_log` só é legível por hub_admin na RLS).

-- ── 1. Cotação ──────────────────────────────────────────────────────────────

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
declare
  v_res jsonb;
begin
  -- Cupom tem limite por usuário: a cotação precisa saber quem é, como a reserva.
  if auth.uid() is null then
    raise exception 'Faça login primeiro.' using errcode = '42501';
  end if;

  begin
    v_res := public._create_booking_core(
      auth.uid(), null, null, null, null,
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

comment on function public.quote_booking(uuid, timestamptz, timestamptz, public.fare_tier, uuid[], text, integer, boolean) is
  'Cotação = _create_booking_core numa subtransação desfeita. Mesmo total que create_booking gravaria.';

revoke all on function public.quote_booking(uuid, timestamptz, timestamptz, public.fare_tier, uuid[], text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.quote_booking(uuid, timestamptz, timestamptz, public.fare_tier, uuid[], text, integer, boolean)
  to authenticated, service_role;

-- ── 2. Último aviso de cada reserva do próprio usuário ──────────────────────

create or replace function public.my_booking_notifications(p_booking_codes text[])
returns table (booking_code text, event text, channel text, status text, sent_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (b.code) b.code, n.event, n.channel, n.status, n.created_at
    from public.booking b
    join public.notification_log n on n.booking_id = b.id
   where b.profile_id = auth.uid()
     and b.code = any(p_booking_codes)
   order by b.code, n.created_at desc;
$$;

revoke all on function public.my_booking_notifications(text[]) from public, anon, authenticated;
grant execute on function public.my_booking_notifications(text[]) to authenticated, service_role;
