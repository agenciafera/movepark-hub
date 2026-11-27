-- Tipo de vaga na lista de reservas (27/11/2026).
--
-- A lista do Manager e do Operator ganha a coluna "Tipo de vaga". Na reserva do Hub ele vem do item
-- de vaga (`booking_item.parking_type_id` -> `parking_type.name`); na do site, do próprio pedido.
--
-- 1. O balcão (Operação, sem finance:read) não lê `booking_item` pela tabela: a policy acompanha a
--    de `booking`. A lista dele vem de `operator_bookings_by_ids`, que passa a pedir os itens a
--    `counter_booking_json(id, true)`. Os itens só levam `item_type` e o nome do tipo de vaga,
--    nunca preço, quantidade ou subtotal (o mesmo formato que o voucher do balcão já usa).
--
-- 2. Furo fechado no caminho: a policy `booking_item_owner_write` (ALL, para o dono da reserva) e o
--    grant padrão de INSERT/UPDATE/DELETE deixavam o cliente logado trocar, pelo PostgREST, o tipo
--    de vaga, a quantidade, o preço unitário e o subtotal dos itens da própria reserva, e incluir
--    item. A coluna nova mostraria ao estacionamento um tipo de vaga que o cliente pode ter trocado.
--    Ninguém escreve nessa tabela com o token do usuário: as quatro funções que escrevem
--    (`_create_booking_core`, `change_booking_dates`, `set_booking_addons`,
--    `apply_paid_date_change`) são SECURITY DEFINER, e nem o front nem as Edges fazem `from
--    ("booking_item")`. Medido no vivo em 27/11/2026: nenhum item com tipo de vaga que a unidade
--    não oferece, ou seja, sem sinal de uso. A leitura (`booking_item_owner_select`,
--    `booking_item_select`) continua igual.

create or replace function public.operator_bookings_by_ids(p_ids uuid[])
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sem permissão para ver reservas' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
             public.counter_booking_json(x.id, true) || jsonb_build_object('paid_amount', x.total_amount)
             order by x.created_at desc, x.id)
      from (
        select b.id, b.created_at, b.total_amount
          from public.booking b
          join public.location l on l.id = b.location_id
         where b.id = any (coalesce(p_ids, '{}'::uuid[]))
           and l.company_id = any (public.counter_company_ids())
      ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.operator_bookings_by_ids(uuid[]) from public, anon;
grant execute on function public.operator_bookings_by_ids(uuid[]) to authenticated, service_role;

drop policy if exists booking_item_owner_write on public.booking_item;
revoke insert, update, delete on public.booking_item from anon, authenticated;
