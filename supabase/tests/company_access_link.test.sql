-- pgTAP: link de acesso ao Recebimento (23/09/2026). Spec: docs/specs/link-de-acesso-recebimento.md
-- Transação com rollback.

begin;
select plan(14);

do $$
declare dono uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); outro uuid := gen_random_uuid(); v_company uuid; v_link uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (dono,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cal-dono@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','cal-adm@ex.com',now(),now()),
    (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cal-outro@ex.com',now(),now());
  insert into public.profiles(id, role) values (dono,'company_operator'), (outro,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  -- Empresa que ainda não terminou o Recebimento: sem conta de repasse e sem contrato.
  select c.id into v_company from public.company c
   where c.deleted_at is null and c.contract_accepted_at is null
     and not exists (select 1 from public.company_payout_account a where a.company_id = c.id and a.deleted_at is null)
   order by c.created_at limit 1;
  insert into public.profile_company(profile_id, company_id, role) values (dono, v_company, 'owner') on conflict do nothing;
  insert into public.company_access_link(company_id, profile_id, email, token_prefix, token_hash, created_by)
    values (v_company, dono, 'cal-dono@ex.com', 'PREFIXO0123456789', 'hash-certo', adm) returning id into v_link;
  perform set_config('test.company', v_company::text, false);
  perform set_config('test.link', v_link::text, false);
  perform set_config('test.dono', dono::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.outro', outro::text, false);
end $$;

-- ── resgate (service_role) ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-certo') ->> 'ok', 'true', 'segredo certo resgata');
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-certo') ->> 'profile_id', current_setting('test.dono'), 'devolve o dono que entra');
select is((select use_count from public.company_access_link where id = current_setting('test.link')::uuid), 2, 'cada abertura conta (reutilizável)');
select isnt((select last_used_at from public.company_access_link where id = current_setting('test.link')::uuid), null, 'grava quando foi usado');
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-errado') ->> 'reason', 'invalid', 'hash errado é inválido');
select is(public.company_access_link_redeem('OUTROPREFIXO12345', 'hash-certo') ->> 'reason', 'invalid', 'prefixo desconhecido é inválido');

-- Terminou o Recebimento: o link morre sozinho.
insert into public.company_payout_account(company_id) values (current_setting('test.company')::uuid);
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-certo') ->> 'ok', 'true', 'só a conta de repasse ainda não encerra o link');
update public.company set contract_accepted_at = now() where id = current_setting('test.company')::uuid;
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-certo') ->> 'reason', 'done', 'conta + contrato: o link deixa de valer');
update public.company set contract_accepted_at = null where id = current_setting('test.company')::uuid;
delete from public.company_payout_account where company_id = current_setting('test.company')::uuid;

-- ── revogação ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.company_access_link_revoke(%L)', current_setting('test.link')), '42501', null, 'quem não é da Movepark não revoga');
select is((select count(*)::int from public.company_access_link where id = current_setting('test.link')::uuid), 0, 'quem não é da Movepark não enxerga o link');
select throws_ok('select public.company_access_link_redeem(''PREFIXO0123456789'', ''hash-certo'')', '42501', null, 'authenticated não resgata direto (só a Edge)');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.company_access_link where id = current_setting('test.link')::uuid), 1, 'hub_admin enxerga o link');
select lives_ok(format('select public.company_access_link_revoke(%L)', current_setting('test.link')), 'hub_admin revoga');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.company_access_link_redeem('PREFIXO0123456789', 'hash-certo') ->> 'reason', 'invalid', 'revogado não resgata');

select * from finish();
rollback;
