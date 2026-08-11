-- `checkout:link` tem que continuar sendo escopo de plataforma.
--
-- A tool `create_checkout_link` gera um link que **autentica quem o abre**. Se
-- um parceiro conseguisse chamá-la, ele fixaria a sessão de um cliente que não é
-- dele. O que impede isso hoje são duas coisas, e a primeira é frágil:
--
--   1. `api_scope.is_platform_scope = true` no `checkout:link`, mais o trigger
--      `api_key_assert_ownership`, que recusa uma chave de empresa carregando
--      escopo de plataforma. Isso mora numa linha de catálogo: um
--      `update api_scope set is_platform_scope = false` entrega a fixação de
--      sessão, e nenhum teste percebia.
--   2. O resolvedor do MCP, que só aceita chave SEM empresa como agente
--      confiável (`resolver.ts`, coberto em `resolver.test.ts`).
--
-- Este arquivo trava a primeira. A segunda é TypeScript e vive no deno test.
--
-- Ver docs/specs/mcp.md e docs/specs/permissions.md.

begin;
select plan(5);

-- ── 1. A flag ───────────────────────────────────────────────────────────────

select is(
  (select is_platform_scope from public.api_scope where scope = 'checkout:link'),
  true,
  'checkout:link é escopo de plataforma'
);

select is(
  (select assignable_to_api_key from public.api_scope where scope = 'checkout:link'),
  true,
  'checkout:link é atribuível a chave (a do bot interno), e ser de plataforma não muda isso'
);

-- ── 2. Escopo de plataforma não entra em papel de empresa ──────────────────
-- Nem no Dono, que tem "todos" os escopos do catálogo de empresa.

select is_empty(
  $$ select crs.scope
       from public.company_role_scope crs
       join public.api_scope s on s.scope = crs.scope
      where s.is_platform_scope $$,
  'nenhum escopo de plataforma foi concedido a papel de empresa'
);

-- ── 3. E o trigger recusa a tentativa ──────────────────────────────────────

select throws_ok(
  $$ insert into public.company_role_scope (role, scope) values ('owner', 'checkout:link') $$,
  'P0001',
  null,
  'o guard recusa conceder checkout:link a um papel de empresa'
);

-- ── 4. Chave de empresa não carrega escopo de plataforma ───────────────────
-- A trava de tabela pega qualquer caminho de escrita, inclusive service_role.

select throws_ok(
  $$ insert into public.api_key
       (company_id, name, key_prefix, key_hash, environment, scopes)
     values
       ((select id from public.company limit 1), 'pgtap-fixacao', 'mp_test_pgtapfx',
        repeat('a', 64), 'test', array['checkout:link']) $$,
  '42501',
  null,
  'chave de empresa não pode carregar checkout:link'
);

select * from finish();
rollback;
