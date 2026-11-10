-- pgTAP: e-mails da equipe por escopo (company_scope_emails, 10/11/2026). Serve ao aviso de saque,
-- que passou a ir para quem tem payouts:read (Dono, Gerente e Financeiro) e não só para o contato
-- da ficha. Cobre: quem tem o escopo recebe, Operação não, banido não, minúsculas, só o servidor.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(4);

select ok(
  not has_function_privilege('authenticated', 'public.company_scope_emails(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.company_scope_emails(uuid, text)', 'execute'),
  'cliente e parceiro não chamam company_scope_emails'
);

do $$
declare
  dono uuid := gen_random_uuid(); ger uuid := gen_random_uuid(); fin uuid := gen_random_uuid();
  op uuid := gen_random_uuid(); banido uuid := gen_random_uuid(); cid uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at, banned_until) values
    (dono, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Escopo-Dono@ex.com', now(), now(), null),
    (ger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escopo-ger@ex.com', now(), now(), null),
    (fin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escopo-fin@ex.com', now(), now(), null),
    (op, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escopo-op@ex.com', now(), now(), null),
    (banido, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escopo-banido@ex.com', now(), now(), now() + interval '1 year');
  insert into public.profiles(id, role) values (dono, 'company_operator'), (ger, 'company_operator'),
    (fin, 'company_operator'), (op, 'company_operator'), (banido, 'company_operator') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Escopo Park', 'escopo-park');
  insert into public.profile_company(profile_id, company_id, role) values
    (dono, cid, 'owner'), (ger, cid, 'manager'), (fin, cid, 'finance'), (op, cid, 'operator'), (banido, cid, 'finance');
  perform set_config('test.cid', cid::text, true);
end $$;

select is(
  (select array_agg(e order by e) from public.company_scope_emails(current_setting('test.cid')::uuid, 'payouts:read') e),
  array['escopo-dono@ex.com', 'escopo-fin@ex.com', 'escopo-ger@ex.com'],
  'payouts:read: Dono, Gerente e Financeiro recebem; Operação e banido não; minúsculas'
);

select is(
  (select array_agg(e order by e) from public.company_scope_emails(current_setting('test.cid')::uuid, 'payouts:write') e),
  array['escopo-dono@ex.com'],
  'payouts:write é só do Dono'
);

select is(
  (select count(*)::int from public.company_scope_emails(gen_random_uuid(), 'payouts:read')),
  0, 'empresa sem equipe devolve vazio'
);

select * from finish();
rollback;
