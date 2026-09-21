-- Allowlist de colunas na escrita direta em `booking`. Spec: docs/specs/booking-flow.md
--
-- A RLS de `booking` deixa o dono da reserva (`booking_owner_update`) e qualquer membro da empresa
-- (`booking_operator_update`) dar UPDATE na linha inteira, e o `booking_guard_status_transition`
-- libera o hub_admin e o membro da empresa sem olhar coluna. Resultado medido em 21/09/2026: um
-- `company_operator` autenticado dava PATCH, por PostgREST, em `total_amount`, `price_breakdown`,
-- `fare_tier`, `fare_price_cents`, `check_in_at`, `check_out_at`, `profile_id` etc. de qualquer
-- reserva das unidades dele. O `booking_guard_commission` (20261121090000) fechou só a comissão.
-- O ramo do dono também era denylist: protegia seis colunas e deixava `fare_price_cents`,
-- `fare_cancel_until`, `expires_at` e o resto abertos enquanto a reserva estava `pending`.
--
-- Este guarda inverte a lógica: escrita direta (papel `authenticated` ou `anon`) só muda coluna
-- que está na allowlist do ator. Coluna nova nasce negada. A lista saiu do que o código escreve
-- de fato como `authenticated`:
--
--   staff (hub_admin, ou membro da empresa com `bookings:write` ou `bookings:checkin`, ADR-005)
--     status, checked_in_at, checked_out_at, notes
--       src/features/bookings/api.ts (useUpdateBookingStatus), src/features/voucher/api.ts
--
--   dono, só enquanto a reserva está `pending`
--     vehicle_id, passenger_count, has_pcd, customer_first_name, customer_last_name,
--     customer_name, customer_phone, customer_email, customer_tax_id, passenger_first_name,
--     passenger_last_name, passenger_phone, status, deleted_at
--       src/features/checkout/api.ts e as tools de cliente da Edge `mcp` (que usam o JWT do usuário)
--
-- O hub_admin segue a mesma lista do staff, como no guarda da comissão: o Manager não escreve
-- mais nada direto na reserva, e correção de dinheiro, tarifa ou data passa por RPC/Edge, que deixa
-- rastro. Quais transições de status valem continua sendo assunto do
-- `booking_guard_status_transition`; aqui só se decide QUAIS COLUNAS mudam.
--
-- O servidor passa livre: funções SECURITY DEFINER rodam como dono e o service_role das Edges
-- também, então `current_user` não é `authenticated` nem `anon`.
--
-- Ordem dos triggers: o Postgres dispara os BEFORE em ordem alfabética do nome. Este se chama
-- `booking_guard_write_allowlist` para rodar DEPOIS do `booking_guard_status_transition` (os
-- erros P0001 que o cliente já recebia continuam iguais) e ANTES do
-- `booking_reconcile_customer_name`, então o nome remontado pelo trigger não conta como escrita
-- do cliente. O `updated_at` fica fora do diff porque o `booking_set_updated_at` sobrescreve o
-- valor de qualquer jeito, o que deixa o guarda correto mesmo se a ordem mudar.

create or replace function public.booking_guard_write_allowlist() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare
  v_changed text[];
  v_allowed text[] := array['updated_at'];
  v_denied  text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Diff genérico: toda coluna cujo valor mudou, inclusive as que ainda não existem hoje.
  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key);

  if v_changed <@ v_allowed then
    return new;
  end if;

  if public.is_hub_admin() or exists (
       select 1 from public.location l
       where l.id = old.location_id
         and l.company_id in (select public.current_company_ids())
         and (public.member_has_scope(l.company_id, 'bookings:write')
              or public.member_has_scope(l.company_id, 'bookings:checkin'))
     ) then
    v_allowed := v_allowed || array['status', 'checked_in_at', 'checked_out_at', 'notes'];
  end if;

  if old.profile_id = (select auth.uid()) and old.status = 'pending' then
    v_allowed := v_allowed || array[
      'vehicle_id', 'passenger_count', 'has_pcd',
      'customer_first_name', 'customer_last_name', 'customer_name',
      'customer_phone', 'customer_email', 'customer_tax_id',
      'passenger_first_name', 'passenger_last_name', 'passenger_phone',
      'status', 'deleted_at'
    ];
  end if;

  select array_agg(c order by c) into v_denied
  from unnest(v_changed) c
  where c <> all (v_allowed);

  if v_denied is not null then
    raise exception 'Estes campos da reserva não são editáveis por aqui: %.', array_to_string(v_denied, ', ')
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists booking_guard_write_allowlist on public.booking;
create trigger booking_guard_write_allowlist before update on public.booking
  for each row execute function public.booking_guard_write_allowlist();

-- Funções de trigger não são chamáveis por RPC, mas nascem com EXECUTE para todo mundo: fecha.
revoke all on function public.booking_guard_write_allowlist() from public, anon, authenticated;
