-- Guarda de transição de status em `booking` (fecha escalada de privilégio do cliente).
--
-- Contexto: a policy `booking_owner_update` deixa o cliente escrever a PRÓPRIA reserva
-- (profile_id = auth.uid()) e não havia guarda de transição, nem trigger que validasse status. Como
-- o cliente usa a anon key sob RLS, um cliente autenticado poderia, via PostgREST
-- (`update booking set status='confirmed' where id=<seu pending>`), autoconfirmar a reserva SEM
-- pagar. A página de check-in (`/voucher/validate`) libera por status='confirmed', então isso é um
-- potencial bypass de pagamento. Também podia mexer em total_amount/price_breakdown do próprio
-- pending antes de pagar.
--
-- Correção: um trigger BEFORE UPDATE (SECURITY INVOKER, para enxergar o PAPEL do chamador via
-- current_user) que impõe transições seguras para escritas de CLIENTE, preservando o caminho do
-- STAFF (operador/hub_admin, transições operacionais) e o do SERVIDOR (service_role e funções
-- SECURITY DEFINER, que rodam como o dono). Espelha a lógica de escopo da RLS `booking_operator_update`.

create or replace function public.booking_guard_status_transition()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- Servidor confiável: service_role (Edges/webhook/cron) e funções SECURITY DEFINER rodam como o
  -- dono (ex. postgres). Só os papéis de cliente do PostgREST (authenticated/anon) passam pela guarda.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- INSERT por cliente: bloqueado. Reservas nascem SEMPRE pelo servidor (Edge create-booking /
  -- create_booking_atomic, que rodam como service_role/DEFINER e caem no `return new` acima). Não há
  -- insert direto de cliente no código. Sem esta trava, a policy `booking_owner_insert` (só checa
  -- profile_id = auth.uid()) deixaria o cliente CRIAR a reserva já 'confirmed' com total 0 (mesmo
  -- bypass de pagamento do UPDATE, pelo verbo INSERT).
  if tg_op = 'INSERT' then
    raise exception 'Reservas são criadas pelo servidor, não por escrita direta do cliente.'
      using errcode = 'P0001';
  end if;

  -- Staff: hub_admin ou operador da empresa da unidade faz as transições operacionais (check-in,
  -- no-show, concluir, cancelar como override), como a RLS `booking_operator_update` já permitia.
  if public.is_hub_admin()
     or exists (
       select 1 from public.location l
       where l.id = old.location_id and l.company_id in (select public.current_company_ids())
     ) then
    return new;
  end if;

  -- Cliente dono da PRÓPRIA reserva ainda `pending`: pode editar os dados do checkout (identidade,
  -- veículo, passageiros) e abandonar/cancelar. O que NÃO pode: promover status (confirmar/entrar/
  -- concluir = bypass de pagamento) e mexer em dinheiro/escopo (total, breakdown, tarifa, unidade,
  -- datas). Confirmar, estornar, upgrade de tarifa e troca de datas passam por Edge/RPC
  -- server-authoritative (service_role), que cai no primeiro `return new`.
  if old.profile_id = (select auth.uid())
     and old.status = 'pending'
     and new.status in ('pending', 'expired', 'cancelled')
     and new.total_amount is not distinct from old.total_amount
     and new.price_breakdown is not distinct from old.price_breakdown
     and new.fare_tier is not distinct from old.fare_tier
     and new.location_id = old.location_id
     and new.check_in_at = old.check_in_at
     and new.check_out_at = old.check_out_at
  then
    return new;
  end if;

  raise exception 'Transição de reserva não permitida para este usuário (% -> %).', old.status, new.status
    using errcode = 'P0001';
end;
$$;

-- Função-trigger não é RPC: revoga o EXECUTE default (PUBLIC/anon/authenticated). Revogar não afeta
-- o disparo pelo gatilho. Invariante coberta por anon_privileged_rpcs.test.sql. Ver memória sobre
-- default privileges: revogar de PUBLIC não tira grant direto de anon, então listamos os três.
revoke all on function public.booking_guard_status_transition() from public, anon, authenticated;

drop trigger if exists booking_guard_status_transition on public.booking;
create trigger booking_guard_status_transition
  before insert or update on public.booking
  for each row execute function public.booking_guard_status_transition();
