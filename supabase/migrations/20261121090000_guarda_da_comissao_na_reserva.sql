-- Guarda da comissão na reserva (E0.3.12). Spec: docs/specs/comissao-por-origem.md
--
-- A RLS de `booking` deixa o dono da reserva e qualquer membro da empresa dar UPDATE na linha, e o
-- `booking_guard_status_transition` libera o membro da empresa sem olhar coluna. Com o pacote de
-- comissão morando na reserva, isso virou caminho de dinheiro: o parceiro daria PATCH em
-- `commission_take_rate_bps = 0` numa reserva pendente e a cobrança sairia sem comissão. O mesmo
-- vale para a prova: numa reserva que ainda não tem pacote (criada por MCP ou API), trocar
-- `utm_source` faria o congelamento tardio casar a regra dele.
--
-- Escrita direta (papel `authenticated` ou `anon`) não muda pacote, prova, origem nem UTM, nem
-- sendo hub_admin: a correção passa por `admin_set_booking_commission`, que deixa histórico. As
-- funções SECURITY DEFINER rodam como dono e o service_role das Edges também, então passam.

create or replace function public.booking_guard_commission() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.commission_rule_id, new.commission_channel, new.commission_take_rate_bps, new.commission_fee_payer,
      new.commission_chargeback_bearer, new.commission_locked, new.attribution,
      new.origin, new.utm_source, new.utm_medium, new.utm_campaign)
     is distinct from
     (old.commission_rule_id, old.commission_channel, old.commission_take_rate_bps, old.commission_fee_payer,
      old.commission_chargeback_bearer, old.commission_locked, old.attribution,
      old.origin, old.utm_source, old.utm_medium, old.utm_campaign) then
    raise exception 'A origem e a comissão da reserva não são editáveis por aqui.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists booking_guard_commission on public.booking;
create trigger booking_guard_commission before update on public.booking
  for each row execute function public.booking_guard_commission();

-- Funções de trigger não são chamáveis por RPC, mas nascem com EXECUTE para todo mundo: fecha.
revoke all on function public.booking_guard_commission() from public, anon, authenticated;
revoke all on function public.commission_rule_normalize() from public, anon, authenticated;
