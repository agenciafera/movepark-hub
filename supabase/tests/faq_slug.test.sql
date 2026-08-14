-- pgTAP: slug de FAQ (páginas /faq/<slug>).
-- Cobre o schema (colunas novas), o autofill por trigger (pergunta → slug,
-- colisão → sufixo, destino → nome do aeroporto no slug) e o formato do slug.
-- Roda em transação com rollback.

begin;
select plan(9);

-- ── schema ──────────────────────────────────────────────────────────────────
select has_column('public', 'faq', 'slug', 'faq.slug existe');
select has_column('public', 'faq', 'body_md', 'faq.body_md existe');
select ok(
  exists (select 1 from pg_constraint where conname = 'faq_slug_scope'),
  'check faq_slug_scope existe (slug só em global/destination)'
);

-- ── fixture: destino para o teste de sufixo ─────────────────────────────────
do $$
declare did uuid;
begin
  insert into public.destination(code, name, short_name, slug, type, city, country, latitude, longitude, is_published)
  values ('FQS', 'Aeroporto Slug Teste', 'Slugteste', 'aeroporto-slug-teste', 'airport', 'Cidade', 'BR', -23.0, -46.0, true)
  returning id into did;
  perform set_config('test.did', did::text, false);
end $$;

-- ── trigger: insert sem slug ganha um derivado da pergunta ──────────────────
select lives_ok(
  $$ insert into public.faq(scope, question, answer, is_published)
     values ('global', 'Qual é a pergunta de teste?', 'R.', true) $$,
  'insert global sem slug funciona'
);
select is(
  (select slug from public.faq where question = 'Qual é a pergunta de teste?' and deleted_at is null),
  'qual-e-a-pergunta-de-teste',
  'slug derivado da pergunta, sem acento e em kebab'
);

-- mesma pergunta de novo → sufixo numérico, nunca colisão
select lives_ok(
  $$ insert into public.faq(scope, question, answer, is_published)
     values ('global', 'Qual é a pergunta de teste?', 'R2.', true) $$,
  'insert com pergunta repetida funciona'
);
select is(
  (select slug from public.faq where answer = 'R2.'),
  'qual-e-a-pergunta-de-teste-2',
  'colisão de slug ganha sufixo numérico'
);

-- FAQ de destino: o slug carrega o nome do aeroporto
select is(
  (
    with nova as (
      insert into public.faq(scope, destination_id, question, answer, is_published)
      values ('destination', current_setting('test.did')::uuid, 'Tem traslado?', 'Tem.', true)
      returning slug
    )
    select slug from nova
  ),
  'tem-traslado-slugteste',
  'slug de FAQ de destino termina com o nome do aeroporto'
);

-- Pergunta que já menciona o aeroporto não ganha sufixo duplicado
select is(
  (
    with nova as (
      insert into public.faq(scope, destination_id, question, answer, is_published)
      values ('destination', current_setting('test.did')::uuid, 'O Slugteste tem valet?', 'Tem.', true)
      returning slug
    )
    select slug from nova
  ),
  'o-slugteste-tem-valet',
  'pergunta que cita o aeroporto fica sem sufixo (comparação por palavra)'
);

select * from finish();
rollback;
