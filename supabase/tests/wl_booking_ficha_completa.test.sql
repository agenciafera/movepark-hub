-- pgTAP: ficha completa da reserva do site white-label (reservas unificadas, fase 4, 09/10/2026).
-- Migration: 20261129120000_wl_booking_ficha_completa.sql. Legado: movepark-backoffice#620.
--
-- O que este arquivo protege:
--   1. a importação grava forma de pagamento, veículo, itens, voucher, afiliado, duplicata e
--      transação, e copia histórico e trocas de placa do site;
--   2. linha do legado antigo (sem os campos novos) NÃO apaga o que já foi copiado;
--   3. a lista de histórico é trocada inteira a cada leitura (o que sumiu no site some aqui);
--   4. o detalhe mostra a ficha e os eventos, e o id do gateway só para a equipe Movepark;
--   5. a lista única leva a forma de pagamento; outra empresa não lê os eventos.

begin;
select plan(14);

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_a uuid; v_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfc-a@ex.com',now(),now()),
    (v_owner_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfc-b@ex.com',now(),now()),
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfc-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_owner_a,'company_operator'), (v_owner_b,'company_operator'), (v_admin,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WFC Com Site', 'wfc-com-site', 'wfc-app.movepark.co', 'wfc') returning id into v_a;
  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WFC Outra', 'wfc-outra', 'wfc-outra.movepark.co', 'wfco') returning id into v_b;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner_a, v_a, 'owner'), (v_owner_b, v_b, 'owner');

  perform public.wl_booking_apply_page(v_a, jsonb_build_array(
    jsonb_build_object('id', 7, 'order_number', 'WFC-0007', 'status', jsonb_build_object('code', 'complete'),
      'paid_total_price', 150, 'initial_date', '2027-11-20 08:00:00', 'final_date', '2027-11-22 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Caio'), 'utm', jsonb_build_object(),
      'created_at', '2027-10-01 11:00:00', 'updated_at', '2027-10-01 11:00:00',
      'payment_method', jsonb_build_object('code', 'pix', 'name', 'PIX'),
      'vehicle', jsonb_build_object('brand', 'Fiat', 'model', 'Uno', 'color', 'Prata', 'description', 'Fiat Uno'),
      'items', jsonb_build_array(
        jsonb_build_object('product_slug', 'y', 'product_name', 'Vaga coberta', 'is_spot', true, 'quantity', 1, 'unit_price', 130),
        jsonb_build_object('product_slug', 'seguro', 'product_name', 'Seguro', 'is_spot', false, 'quantity', 1, 'unit_price', 20)),
      'voucher_url', 'https://cdn.ex/v7.pdf', 'is_affiliated', true, 'duplicate_of', 3, 'transaction_id', 'tran_7',
      'plate_changes', jsonb_build_array(jsonb_build_object('id', 1, 'old_plate', 'AAA1A11', 'new_plate', 'BBB2B22',
        'reason', 'trocou de carro', 'changed_by', 'Maria', 'created_at', '2027-10-01 10:30:00')),
      'history', jsonb_build_array(
        jsonb_build_object('id', 10, 'field', 'status_id', 'note', 'Status alterado de Novo para Completo', 'user', null, 'created_at', '2027-10-01 10:00:00'),
        jsonb_build_object('id', 11, 'field', 'manual', 'note', 'Voucher gerado', 'user', 'Maria', 'created_at', '2027-10-01 10:01:00')))
  ), '2027-10-01 11:00:00', 7);

  perform set_config('test.a', v_a::text, false);
  perform set_config('test.owner_a', v_owner_a::text, false);
  perform set_config('test.owner_b', v_owner_b::text, false);
  perform set_config('test.admin', v_admin::text, false);
end $$;

-- ── 1. grava a ficha ─────────────────────────────────────────────────────────
select is((select payment_method_name from public.wl_booking where wl_order_number = 'WFC-0007'), 'PIX', 'forma de pagamento');
select is((select vehicle->>'description' from public.wl_booking where wl_order_number = 'WFC-0007'), 'Fiat Uno', 'veículo');
select is((select jsonb_array_length(items) from public.wl_booking where wl_order_number = 'WFC-0007'), 2, 'itens: vaga e adicional');
select ok((select is_affiliated and duplicate_of_wl_order_id = 3 and gateway_transaction_id = 'tran_7' and voucher_url is not null
             from public.wl_booking where wl_order_number = 'WFC-0007'), 'afiliado, duplicata, transação e voucher');
select is((select count(*)::int from public.wl_booking_event e join public.wl_booking w on w.id = e.wl_booking_id
            where w.wl_order_number = 'WFC-0007'), 3, 'duas entradas de histórico e uma troca de placa');

-- ── 2. legado antigo não apaga ───────────────────────────────────────────────
select 1 from public.wl_booking_apply_page(current_setting('test.a')::uuid, jsonb_build_array(
  jsonb_build_object('id', 7, 'order_number', 'WFC-0007', 'status', jsonb_build_object('code', 'complete'),
    'paid_total_price', 150, 'initial_date', '2027-11-20 08:00:00', 'final_date', '2027-11-22 08:00:00',
    'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
    'customer', jsonb_build_object('name', 'Caio'), 'utm', jsonb_build_object(),
    'created_at', '2027-10-01 11:00:00', 'updated_at', '2027-10-01 12:00:00')
), '2027-10-01 12:00:00', 7);
select ok((select payment_method_name = 'PIX' and jsonb_array_length(items) = 2 from public.wl_booking where wl_order_number = 'WFC-0007'),
  'linha sem os campos novos mantém a ficha copiada');
select is((select count(*)::int from public.wl_booking_event e join public.wl_booking w on w.id = e.wl_booking_id
            where w.wl_order_number = 'WFC-0007'), 3, 'e mantém os eventos');

-- ── 3. histórico trocado inteiro ─────────────────────────────────────────────
select 1 from public.wl_booking_apply_page(current_setting('test.a')::uuid, jsonb_build_array(
  jsonb_build_object('id', 7, 'order_number', 'WFC-0007', 'status', jsonb_build_object('code', 'complete'),
    'paid_total_price', 150, 'initial_date', '2027-11-20 08:00:00', 'final_date', '2027-11-22 08:00:00',
    'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
    'customer', jsonb_build_object('name', 'Caio'), 'utm', jsonb_build_object(),
    'created_at', '2027-10-01 11:00:00', 'updated_at', '2027-10-01 13:00:00',
    'plate_changes', jsonb_build_array(),
    'history', jsonb_build_array(jsonb_build_object('id', 10, 'field', 'status_id', 'note', 'Status alterado', 'created_at', '2027-10-01 10:00:00')))
), '2027-10-01 13:00:00', 7);
select is((select count(*)::int from public.wl_booking_event e join public.wl_booking w on w.id = e.wl_booking_id
            where w.wl_order_number = 'WFC-0007'), 1, 'a cópia segue o site: sobra uma entrada');

-- ── 4. detalhe ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'))::text, true);
create temp table _d on commit drop as
  select public.wl_booking_detail((select id from public.wl_booking where wl_order_number = 'WFC-0007')) d;
select is((select d->>'payment_method_name' from _d), 'PIX', 'o detalhe traz a forma de pagamento');
select is((select jsonb_array_length(d->'site_events') from _d), 1, 'e os eventos do site');
select ok((select d->'gateway_transaction_id' = 'null'::jsonb from _d), 'o parceiro não vê o id do gateway');
select is(
  (select public.bookings_list_page(p_source => 'wl') -> 'items' -> 0 -> 'wl' ->> 'payment_method_name'),
  'PIX', 'a lista única leva a forma de pagamento');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_b'))::text, true);
select is((select count(*)::int from public.wl_booking_event), 0, 'outra empresa não lê os eventos');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select public.wl_booking_detail((select id from public.wl_booking where wl_order_number = 'WFC-0007')) ->> 'gateway_transaction_id'),
  'tran_7', 'a equipe Movepark vê o id do gateway');
reset role;

select * from finish();
rollback;
