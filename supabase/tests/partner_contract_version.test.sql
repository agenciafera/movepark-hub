-- pgTAP: versões do contrato do parceiro (27/09/2026).
--
-- Cobre: v1 semeada com o texto do front; sha256 derivado do corpo por trigger (nunca à mão);
-- texto de versão publicada não muda; `partner_contract_current()` devolve a publicada mais
-- recente (rascunho não conta) e não é executável por anon; tabela trancada por RLS.
--
-- Roda com: supabase test db. Ver README.md.

begin;
select plan(13);

-- ── Estrutura ────────────────────────────────────────────────────────────────
select has_table('public', 'partner_contract_version', 'partner_contract_version existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.partner_contract_version'::regclass),
  'partner_contract_version com RLS habilitada'
);
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.partner_contract_version'::regclass),
  0, 'tabela trancada (0 policies): leitura só por partner_contract_current()'
);
select has_column('public', 'company', 'contract_sha256', 'company.contract_sha256 existe');
select has_column('public', 'company', 'contract_accepted_by', 'company.contract_accepted_by existe');
select has_column('public', 'company', 'contract_accepted_ip', 'company.contract_accepted_ip existe');

-- ── v1 semeada com hash derivado do corpo ────────────────────────────────────
select ok(
  (select body like 'CONTRATO DE PARCERIA - MOVEPARK%7. ACEITE%'
     from public.partner_contract_version where version = 'v1'),
  'v1 semeada com o texto do contrato (cabeçalho até a cláusula 7)'
);
select is(
  (select sha256 from public.partner_contract_version where version = 'v1'),
  (select encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex')
     from public.partner_contract_version where version = 'v1'),
  'sha256 da v1 é o hash do corpo'
);

-- Hash escrito à mão é ignorado: o trigger recalcula.
insert into public.partner_contract_version (version, body, sha256, published_at)
values ('t-rascunho', 'texto de teste', 'hash-inventado', null);
select is(
  (select sha256 from public.partner_contract_version where version = 't-rascunho'),
  encode(extensions.digest(convert_to('texto de teste', 'UTF8'), 'sha256'), 'hex'),
  'sha256 informado à mão é substituído pelo hash do corpo'
);

-- ── Vigente = publicada mais recente; rascunho não conta ─────────────────────
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
select is(
  (public.partner_contract_current() ->> 'version'),
  'v1', 'rascunho não é a vigente: partner_contract_current devolve v1'
);
update public.partner_contract_version set published_at = now() where version = 't-rascunho';
select is(
  (public.partner_contract_current() ->> 'version'),
  't-rascunho', 'ao publicar, a versão mais recente passa a ser a vigente'
);

-- ── Texto publicado não muda ─────────────────────────────────────────────────
select throws_ok(
  $$ update public.partner_contract_version set body = 'outro texto' where version = 'v1' $$,
  '23514', null, 'texto de versão publicada não muda (publique outra versão)'
);

-- ── Hardening ────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.partner_contract_current()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.partner_contract_current()', 'EXECUTE'),
  'partner_contract_current: anon fora, authenticated dentro'
);

select * from finish();
rollback;
