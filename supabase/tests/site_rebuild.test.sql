-- pgTAP: publicação automática do site (fila + decisão de disparo).
-- Rodar com: supabase test db
--
-- O que este arquivo protege: a regra de QUANDO publicar. O disparo em si (POST no Deploy
-- Hook) não é testável sem rede, por isso a decisão mora numa função própria
-- (`site_rebuild_decision`) que recebe o "agora" por parâmetro. O único caso que toca o
-- disparo é o de segurança: sem segredo no Vault, ninguém publica e a fila não é perdida.

begin;
select plan(15);

delete from public.site_rebuild_request;

-- ── Estrutura ──
select has_table('public', 'site_rebuild_request', 'a fila de publicação existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.site_rebuild_request'::regclass),
  'a fila tem RLS ligada'
);
select has_trigger('public', 'location_amenity', 'location_amenity_site_rebuild',
  'comodidade da unidade enfileira publicação');
select has_trigger('public', 'faq', 'faq_site_rebuild',
  'FAQ enfileira publicação');

-- ── Fila vazia ──
select is(public.site_rebuild_decision()->>'motivo', 'nada_pendente',
  'sem mudança pendente, nada é publicado');

-- ── O trigger enfileira de verdade ──
insert into public.amenity (code, name, category) values ('teste_rebuild_1', 'Teste 1', 'extras');
select is(
  (select count(*)::int from public.site_rebuild_request where source_table = 'amenity'),
  1, 'mudar uma comodidade do catálogo enfileira um pedido'
);

-- Trigger de statement: regravar dez comodidades de uma unidade não pode virar dez pedidos.
delete from public.site_rebuild_request;
insert into public.amenity (code, name, category)
values ('teste_rebuild_2', 'Teste 2', 'extras'), ('teste_rebuild_3', 'Teste 3', 'extras');
select is(
  (select count(*)::int from public.site_rebuild_request),
  1, 'insert de duas linhas enfileira um pedido só (trigger de statement)'
);

-- ── Janela de silêncio ──
delete from public.site_rebuild_request;
insert into public.site_rebuild_request (source_table, op, requested_at)
values ('location', 'UPDATE', now());

select is(public.site_rebuild_decision(now())->>'motivo', 'aguardando_silencio',
  'mudança recém-salva espera o editor parar antes de publicar');
select is(public.site_rebuild_decision(now() + interval '4 minutes')->>'acao', 'disparar',
  'passada a janela de silêncio, publica');

-- Quem edita sem pausar por meia hora não pode ficar sem publicar.
delete from public.site_rebuild_request;
insert into public.site_rebuild_request (source_table, op, requested_at)
select 'location', 'UPDATE', now() - make_interval(mins => g) from generate_series(0, 25) g;
select is(public.site_rebuild_decision(now())->>'acao', 'disparar',
  'edição contínua publica ao bater o teto de espera');

-- ── Teto de frequência ──
delete from public.site_rebuild_request;
insert into public.site_rebuild_request (source_table, op, requested_at, dispatched_at)
values ('location', 'UPDATE', now() - interval '30 minutes', now() - interval '2 minutes');
insert into public.site_rebuild_request (source_table, op, requested_at)
values ('faq', 'UPDATE', now() - interval '10 minutes');

select is(public.site_rebuild_decision(now())->>'motivo', 'intervalo_minimo',
  'build recente segura o próximo');
select is(public.site_rebuild_decision(now() + interval '11 minutes')->>'acao', 'disparar',
  'passado o intervalo mínimo, a pendência publica');

-- ── Desligamento de emergência ──
update public.app_setting
   set value = jsonb_set(value::jsonb, '{enabled}', 'false')::text
 where key = 'site_rebuild_policy';
select is(public.site_rebuild_decision(now() + interval '11 minutes')->>'motivo', 'desligado',
  'app_setting desliga a publicação automática sem migration');
update public.app_setting
   set value = jsonb_set(value::jsonb, '{enabled}', 'true')::text
 where key = 'site_rebuild_policy';

-- ── Sem Deploy Hook cadastrado ──
delete from public.site_rebuild_request;
insert into public.site_rebuild_request (source_table, op, requested_at)
values ('location', 'UPDATE', now() - interval '30 minutes');

select is(public.cron_dispatch_site_rebuild()->>'motivo', 'sem_deploy_hook',
  'sem o segredo no Vault, nada é publicado');
select is(
  (select count(*)::int from public.site_rebuild_request where dispatched_at is null),
  1, 'e o pedido continua pendente, esperando o hook existir'
);

select * from finish();
rollback;
