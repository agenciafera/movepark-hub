-- O balcão (papel Operação, sem `finance:read`) volta a ver UM número de dinheiro na lista de
-- reservas: o total que o cliente pagou (`paid_amount`), para conferir se a reserva está certa sem
-- abrir o detalhe. Pedido do cliente em 24/11/2026.
--
-- Só a LISTA (`operator_bookings_by_ids`) leva o campo. O detalhe (`operator_booking_by_code`)
-- segue sem valor, e diárias, comissão, repasse, taxas e `payment.amount` continuam nulos/ausentes:
-- `counter_booking_json` não muda.
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
             public.counter_booking_json(x.id) || jsonb_build_object('paid_amount', x.total_amount)
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

-- Pedido do site (white-label) na lista: `paid_total_cents` (o que o cliente pagou lá) passa a sair
-- para o balcão também. `total_cents` segue só para quem tem `finance:read`. A função da lista é
-- grande e só esta expressão muda, então a troca é feita sobre a definição viva, e é idempotente.
do $$
declare
  v_oid oid;
  v_def text;
  v_old constant text :=
    $q$'paid_total_cents', case when v_admin or w.company_id = any (v_dinheiro) then w.paid_total_cents end$q$;
begin
  for v_oid in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'bookings_list_page'
  loop
    v_def := pg_get_functiondef(v_oid);
    if position(v_old in v_def) > 0 then
      execute replace(v_def, v_old, $q$'paid_total_cents', w.paid_total_cents$q$);
    end if;
  end loop;
end $$;
