-- Isolamento das três modalidades no blog (auditoria de 11/08/2026).
--
-- Os dois furos que este arquivo tranca:
--   1. `api_assert_scopes` aceitava escopo de PLATAFORMA de membro de empresa,
--      então um parceiro se dava `blog:write` e escrevia no blog da Movepark;
--   2. `blog_post_select` era `USING (true)`, então o `anon` lia rascunho.

begin;
select plan(9);

-- ── Catálogo: cada escopo na modalidade certa ────────────────────────────────
select is(
  (select is_platform_scope from api_scope where scope = 'blog:write'),
  true,
  'blog:write é escopo de plataforma'
);
select is(
  (select is_platform_scope from api_scope where scope = 'blog:read'),
  false,
  'blog:read é escopo de empresa (leitura pública)'
);

-- ── Chave de API: parceiro não se dá escopo de plataforma ────────────────────
-- O papel aqui é `service_role`, não `authenticated`, e a razão importa: `authenticated`
-- não tem EXECUTE em `api_assert_scopes` (só `service_role` tem), então a chamada crua
-- morria com 42501 de PERMISSÃO antes de chegar na regra. Como três das asserções abaixo
-- esperam justamente 42501, elas passavam pelo motivo errado: a de escopo de plataforma
-- ficava verde sem nunca ter avaliado escopo nenhum.
--
-- Quem chama de verdade é `operator_create_api_key`, que é SECURITY DEFINER e roda com os
-- direitos do dono. Trocar o papel reproduz esse contexto. Quem decide o veredito continua
-- sendo a IDENTIDADE do JWT, não o papel do Postgres: `api_assert_scopes` ramifica em
-- `is_hub_admin()`, que lê `auth.uid()`. O `sub` abaixo não é hub_admin, então o teste
-- continua medindo "membro de empresa".
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);

select lives_ok(
  $$ select api_assert_scopes(array['bookings:read','blog:read']) $$,
  'membro de empresa monta chave com escopo de empresa'
);
select throws_ok(
  $$ select api_assert_scopes(array['blog:write']) $$,
  '42501',
  null,
  'membro de empresa NÃO se dá blog:write'
);
select throws_ok(
  $$ select api_assert_scopes(array['checkout:link']) $$,
  '42501',
  null,
  'membro de empresa NÃO se dá checkout:link'
);
select throws_ok(
  $$ select api_assert_scopes(array['bookings:read','blog:write']) $$,
  '42501',
  null,
  'misturar com escopo válido não driblar a checagem'
);
select throws_ok(
  $$ select api_assert_scopes(array['payouts:write']) $$,
  'P0001',
  null,
  'escopo só-interno continua fora de qualquer chave'
);
reset role;

-- ── RLS: rascunho não vaza ───────────────────────────────────────────────────
insert into blog_post (slug, title, body_md, is_published)
values ('pgtap-rascunho', 'Rascunho', 'x', false);
insert into blog_post (slug, title, body_md, is_published)
values ('pgtap-publicado', 'Publicado', 'x', true);

set local role anon;
select is(
  (select count(*)::int from blog_post where slug = 'pgtap-rascunho'),
  0,
  'anon não enxerga rascunho'
);
select is(
  (select count(*)::int from blog_post where slug = 'pgtap-publicado'),
  1,
  'anon enxerga post publicado'
);
reset role;

select * from finish();
rollback;
