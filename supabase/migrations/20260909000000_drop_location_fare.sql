-- Fonte única global de tarifa (ClickUp 86ajnxf04). Remove o mecanismo de preço
-- por unidade: a global (public.fare) passa a ser a única fonte. Entra junto do
-- editor global (86ajnxeym / 20260908000000), nunca antes: sem o editor, o Super
-- Admin ficaria sem lugar para editar tarifa.
--
-- CUIDADO PRESERVADO: _create_booking_core e apply_fare_upgrade NÃO são tocados.
-- Os dois só chamam get_unit_fares(unidade); como a assinatura e o retorno dela
-- não mudam, os gates de prazo/status do upgrade (tarefa 86ajmy41d) seguem
-- intactos. Só o CORPO de get_unit_fares muda: deixa de ler location_fare.
-- Recriar essas funções inteiras a partir de versões antigas foi a armadilha que
-- gerou a regressão do overlay (cabeçalho de 20260829000000); por isso não o faço.

-- 1. get_unit_fares passa a ler só o catálogo global. O parâmetro fica na
--    assinatura (criação, upgrade e front chamam por nome), mas é ignorado.
create or replace function public.get_unit_fares(p_location_parking_type_id uuid default null)
returns table(
  tier public.fare_tier,
  label text,
  price_cents integer,
  is_popular boolean,
  sort_order integer,
  cancel_window_minutes integer,
  benefits jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.tier, f.label, f.price_cents, f.is_popular, f.sort_order,
         f.cancel_window_minutes, f.benefits
  from public.fare f
  where f.is_active = true
  order by f.sort_order;
$$;

-- 2. Some a RPC de escrita por unidade.
drop function if exists public.operator_set_unit_fare(uuid, public.fare_tier, boolean, integer);

-- 3. Some a tabela por unidade (0 linhas com override, 0 desativadas, então é
--    drop limpo). Leva junto as policies location_fare_admin/location_fare_select.
drop table if exists public.location_fare;
