-- pgTAP: publicação automática do site (fila + decisão de disparo).
-- Rodar com: supabase test db
--
-- O que este arquivo protege: a regra de QUANDO publicar. O disparo em si (POST no Deploy
-- Hook) não é testável sem rede, por isso a decisão mora numa função própria
-- (`site_rebuild_decision`) que recebe o "agora" por parâmetro. O único caso que toca o
-- disparo é o de segurança: sem segredo no Vault, ninguém publica e a fila não é perdida.

begin;
select plan(22);

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

-- ── Saúde: a pergunta "isto consegue publicar?" ──
--
-- Estes casos existem por causa de 01/09/2026: o mecanismo passou 13 dias inerte porque o
-- segredo do Deploy Hook nunca foi cadastrado, e nada no sistema reclamava. A decisão de
-- publicar respondia "não" o tempo todo, o que é normal nela; quem tinha que gritar era a
-- saúde, que não existia.

-- Sem hook, é notícia mesmo com a fila zerada: o mecanismo está inerte por configuração.
delete from public.site_rebuild_request;
select is((public.site_rebuild_health(now())->>'ok')::boolean, false,
  'sem o Deploy Hook cadastrado, a publicação automática não está saudável');
select is(public.site_rebuild_health(now())->>'motivo', 'sem_deploy_hook',
  'e o motivo aponta o segredo que falta, mesmo com a fila vazia');

select vault.create_secret(
  'https://api.cloudflare.com/client/v4/deploy_hooks/segredo-so-do-teste',
  'cloudflare_deploy_hook_url',
  'fixture do pgTAP'
);

-- A saúde é lida por quem não pode ver a URL: ela responde um booleano, nunca o segredo.
select is(
  position('segredo-so-do-teste' in public.site_rebuild_health(now())::text),
  0, 'a saúde diz que o hook existe sem devolver a URL dele'
);

select is((public.site_rebuild_health(now())->>'ok')::boolean, true,
  'com hook e sem fila, a publicação está saudável'
);

-- Conteúdo esperando além do limite é o sintoma de disparo falhando em silêncio.
insert into public.site_rebuild_request (source_table, op, requested_at)
values ('faq', 'UPDATE', now() - interval '10 hours');
select is(public.site_rebuild_health(now())->>'motivo', 'fila_parada',
  'conteúdo parado há mais horas que o limite acende o alarme');

-- Fila que incha depressa acende antes de o relógio bater: import ou correção em massa que
-- não está saindo.
delete from public.site_rebuild_request;
insert into public.site_rebuild_request (source_table, op, requested_at)
select 'location', 'UPDATE', now() from generate_series(1, 251);
select is(public.site_rebuild_health(now())->>'motivo', 'fila_grande',
  'fila grande e recente acende o alarme antes do limite de horas'
);

-- Os limites são config, não código: mexer neles não pode exigir migration.
update public.app_setting
   set value = jsonb_set(value::jsonb, '{alert_max_pending}', '5000')::text
 where key = 'site_rebuild_policy';
select is((public.site_rebuild_health(now())->>'ok')::boolean, true,
  'subir o limite no app_setting cala o alarme sem deploy'
);

select * from finish();
rollback;
