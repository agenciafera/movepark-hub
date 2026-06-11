-- pgTAP: motor de reviews (migration reviews_engine).
-- Cobre submit_review (reserva própria completed, 1 por reserva), agregado cacheado
-- (trigger só conta is_published), operator_respond_review (guard) e cron_complete_bookings.
-- Rodar com: supabase test db. Transação + rollback.

begin;
select plan(9);

-- ── Fixture: empresa ativa + operator + cliente + location + bookings ───────
do $$
declare v_cid uuid; v_op uuid := gen_random_uuid(); v_cust uuid := gen_random_uuid(); v_lid uuid; v_bk uuid; v_bk_p uuid;
begin
  v_cid := public.submit_partner_lead('Reviews QA','Op','rev-qa@example.com','+5511900000000');
  update public.company set onboarding_status='approved', status='active' where id=v_cid;
  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
    (v_op,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rev-op@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rev-cust@ex.com',now(),now());
  insert into public.profiles(id,role) values (v_op,'company_operator'),(v_cust,'customer') on conflict (id) do nothing;
  insert into public.profile_company(profile_id,company_id) values (v_op,v_cid);
  perform set_config('request.jwt.claims', json_build_object('sub',v_op)::text, true);
  v_lid := public.onboarding_upsert_location(v_cid,null,'Unidade QA','Rua X',-23.5,-46.6,'America/Sao_Paulo',null,null,null,'[]'::jsonb);
  insert into public.booking(code,profile_id,location_id,check_in_at,check_out_at,total_amount,currency,status)
    values ('REV-1',v_cust,v_lid,now()-interval '3 day',now()-interval '1 day',100,'BRL','completed') returning id into v_bk;
  insert into public.booking(code,profile_id,location_id,check_in_at,check_out_at,total_amount,currency,status)
    values ('REV-2',v_cust,v_lid,now()+interval '1 day',now()+interval '2 day',100,'BRL','pending') returning id into v_bk_p;
  perform set_config('test.cid', v_cid::text, true);
  perform set_config('test.op', v_op::text, true);
  perform set_config('test.cust', v_cust::text, true);
  perform set_config('test.lid', v_lid::text, true);
  perform set_config('test.bk', v_bk::text, true);
  perform set_config('test.bkp', v_bk_p::text, true);
end $$;

-- ── submit_review (cliente, reserva completed) ──────────────────────────────
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'))::text, true);
  perform set_config('test.rid', public.submit_review(current_setting('test.bk')::uuid, 5, 'Ótimo', 5,5,4,5)::text, true);
end $$;
select ok(current_setting('test.rid') is not null, 'submit_review cria avaliação');
select is((select rating from public.review where id=current_setting('test.rid')::uuid), 5, 'nota gravada');

-- agregado cacheado
select is((select review_count from public.location where id=current_setting('test.lid')::uuid), 1, 'review_count=1');
select is((select review_avg from public.location where id=current_setting('test.lid')::uuid), 5.0, 'review_avg=5.0');

-- reserva não-completed rejeitada
select throws_ok(
  $$ select public.submit_review(current_setting('test.bkp')::uuid, 4, 'x', null,null,null,null) $$,
  'P0001', null, 'reserva não-completed é rejeitada');

-- usuário fora da reserva → 42501
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true); end $$;
select throws_ok(
  $$ select public.submit_review(current_setting('test.bk')::uuid, 3, 'hack', null,null,null,null) $$,
  '42501', null, 'avaliar reserva de outro recebe 42501');

-- ── resposta do dono ────────────────────────────────────────────────────────
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.op'))::text, true);
  perform public.operator_respond_review(current_setting('test.rid')::uuid, 'Obrigado!');
end $$;
select is((select owner_response from public.review where id=current_setting('test.rid')::uuid), 'Obrigado!', 'resposta do dono gravada');

-- ── despublicar zera o agregado ─────────────────────────────────────────────
do $$ begin update public.review set is_published=false where id=current_setting('test.rid')::uuid; end $$;
select is((select review_count from public.location where id=current_setting('test.lid')::uuid), 0, 'despublicar → review_count=0');

-- ── cron completa reserva passada ───────────────────────────────────────────
do $$
declare v_bk uuid;
begin
  insert into public.booking(code,profile_id,location_id,check_in_at,check_out_at,total_amount,currency,status)
    values ('REV-CRON',current_setting('test.cust')::uuid,current_setting('test.lid')::uuid,
            now()-interval '2 day',now()-interval '1 hour',100,'BRL','confirmed') returning id into v_bk;
  perform public.cron_complete_bookings();
  perform set_config('test.bkc', v_bk::text, true);
end $$;
select is(
  (select status::text from public.booking where id=current_setting('test.bkc')::uuid),
  'completed', 'cron_complete_bookings marca reserva passada como completed');

select * from finish();
rollback;
