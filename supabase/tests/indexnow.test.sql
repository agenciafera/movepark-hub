-- pgTAP: fila do IndexNow (enfileiramento, dedupe, claim e settle).
-- Rodar com: supabase test db
--
-- O que este arquivo protege: o caminho do caminho. A submissão HTTP em si mora na Edge e não é
-- testável sem rede, então o que se prova aqui é o que o banco decide: qual caminho entra na fila,
-- que forma ele tem (a barra final do blog é contrato de URL) e o que acontece quando o buscador
-- responde erro.

begin;
select plan(18);

delete from public.indexnow_request;

-- ── Estrutura ──
select has_table('public', 'indexnow_request', 'a fila do IndexNow existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.indexnow_request'::regclass),
  'a fila tem RLS ligada'
);
select has_trigger('public', 'blog_post', 'blog_post_indexnow',
  'post do blog enfileira submissão');
select has_trigger('public', 'destination', 'destination_indexnow',
  'destino enfileira submissão');

-- A tabela não pode aceitar URL absoluta: o host não mora no banco.
select throws_ok(
  $$ insert into public.indexnow_request (path, source_table)
     values ('https://movepark.co/blog/x/', 'manual') $$,
  '23514',
  null,
  'URL absoluta é recusada pela constraint: a fila guarda caminho'
);

-- ── O trigger do blog ──
insert into public.blog_post (slug, title, body_md, is_published)
values ('teste-indexnow-um', 'Teste IndexNow 1', 'Corpo.', true);

select is(
  (select path from public.indexnow_request where source_table = 'blog_post'),
  '/blog/teste-indexnow-um/',
  'post do blog entra com a barra final, que é o contrato de URL herdado'
);

-- ── Dedupe ──
update public.blog_post set title = 'Teste IndexNow 1 v2' where slug = 'teste-indexnow-um';
update public.blog_post set title = 'Teste IndexNow 1 v3' where slug = 'teste-indexnow-um';

select is(
  (select count(*)::int from public.indexnow_request where path = '/blog/teste-indexnow-um/'),
  1,
  'três saves do mesmo post viram um pedido só enquanto ninguém despachou'
);

-- ── Despublicar também avisa ──
update public.blog_post set is_published = false where slug = 'teste-indexnow-um';

select is(
  (select count(*)::int from public.indexnow_request where path = '/blog/teste-indexnow-um/'),
  1,
  'despublicar mantém o pedido: a URL mudou de resposta e o buscador precisa saber'
);

-- ── Claim ──
select is(
  (select count(*)::int from public.indexnow_claim(100)),
  1,
  'o claim leva o pedido pendente'
);

select is(
  (select count(*)::int from public.indexnow_request
    where path = '/blog/teste-indexnow-um/' and dispatched_at is not null),
  1,
  'o pedido fica carimbado como despachado'
);

select is(
  (select count(*)::int from public.indexnow_claim(100)),
  0,
  'o claim seguinte não repete o pedido já carimbado'
);

-- Com o pedido despachado, um save novo pode enfileirar de novo: o unique é só entre pendentes.
update public.blog_post set title = 'Teste IndexNow 1 v4' where slug = 'teste-indexnow-um';

select is(
  (select count(*)::int from public.indexnow_request where path = '/blog/teste-indexnow-um/'),
  2,
  'save depois do despacho abre pedido novo'
);

-- ── Settle ──
select is(
  public.indexnow_settle(
    (select dispatch_id from public.indexnow_request where dispatch_id is not null limit 1),
    200
  ),
  1,
  'resposta 2xx fecha o lote'
);

delete from public.indexnow_request;
insert into public.indexnow_request (path, source_table) values ('/destinos/teste-settle', 'manual');

select is(
  (select count(*)::int from public.indexnow_claim(10)),
  1,
  'o claim leva o pedido inserido direto na fila'
);

select is(
  (select count(*)::int from public.indexnow_request
    where path = '/destinos/teste-settle' and dispatched_at is null),
  0,
  'antes do settle o pedido está carimbado'
);

select is(
  public.indexnow_settle(
    (select dispatch_id from public.indexnow_request where path = '/destinos/teste-settle'),
    403
  ),
  1,
  'o settle de erro fecha um pedido'
);

select is(
  (select count(*)::int from public.indexnow_request
    where path = '/destinos/teste-settle' and dispatched_at is null and status_code = 403),
  1,
  'resposta de erro devolve o pedido para a fila, guardando o código'
);

-- ── Permissão ──
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_name = 'indexnow_request' and grantee = 'anon'),
  0,
  'anon não tem grant nenhum na fila'
);

select * from finish();
rollback;
