-- pgTAP: gravação da Automação pelo banco (migration 20261207120000_marketing_mcp_gravacao).
--   - validação no servidor e recusa em P0001 (a mensagem que o MCP repassa à IA);
--   - segmento de sistema não muda nem some; segmento em campanha ativa não some;
--   - campanha encerrada não muda; running e done são do motor;
--   - remetente só pela tela; chave geral só com motivo;
--   - toda gravação deixa linha na auditoria, e hub_admin não se passa por chave;
--   - a tabela não aceita mais gravação direta.
-- Spec: docs/specs/marketing-mcp.md. Roda com: supabase test db. Transação + rollback.

begin;
select plan(24);

do $$
declare
  u uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  seg_rodando uuid := gen_random_uuid();
  camp_rodando uuid := gen_random_uuid();
  camp_feita uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-grav-cliente@ex.com', now(), now()),
           (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-grav-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';

  insert into public.marketing_segment(id, name, slug, definition)
    values (seg_rodando, 'Grav em uso', 'grav-em-uso',
            '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":1}]}');
  insert into public.marketing_campaign(id, name, slug, segment_id, status)
    values (camp_rodando, 'Grav rodando', 'grav-rodando', seg_rodando, 'running'),
           (camp_feita, 'Grav feita', 'grav-feita', null, 'done');

  perform set_config('test.u', u::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.seg_rodando', seg_rodando::text, false);
  perform set_config('test.camp_feita', camp_feita::text, false);
end $$;

create temp table _ids(nome text primary key, id uuid);
grant all on _ids to authenticated;

-- ── Como admin, pela tela ───────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$insert into _ids select 'seg', public.marketing_save_segment(null, 'Grav novo',
      '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2}]}')$$,
  'hub_admin cria segmento pela RPC');

select throws_like(
  $$select public.marketing_save_segment(null, 'Grav ruim',
      '{"match":"all","rules":[{"field":"nao_existe","op":"eq","value":1}]}')$$,
  '%campo desconhecido "nao_existe"%',
  'campo desconhecido é recusado com a mensagem para a IA');

select throws_like(
  $$select public.marketing_save_segment(
      (select id from public.marketing_segment where slug = 'campeoes'), 'Campeões',
      '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":9}]}')$$,
  '%modelo RFM não muda%',
  'segmento de sistema não muda');

select throws_like(
  $$select public.marketing_delete_segment((select id from public.marketing_segment where slug = 'campeoes'))$$,
  '%modelo RFM não pode ser excluído%',
  'segmento de sistema não some');

select throws_like(
  $$select public.marketing_delete_segment(current_setting('test.seg_rodando')::uuid)$$,
  '%Pause a campanha antes%',
  'segmento em campanha rodando não some');

select lives_ok(
  $$select public.marketing_save_segment((select id from _ids where nome = 'seg'), 'Grav novo',
      '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":3}]}',
      null, null, '{"kind":"api_key","label":"falso"}')$$,
  'hub_admin edita segmento mandando um ator falso');

reset role;
select is(
  (select actor_kind from public.marketing_audit_log
    where entity_id = (select id from _ids where nome = 'seg') and action = 'segment.update'),
  'hub_admin',
  'o ator falso é ignorado: a auditoria registra o hub_admin');

select is(
  (select count(*)::int from public.marketing_audit_log
    where entity_id = (select id from _ids where nome = 'seg')),
  2,
  'criar e editar deixaram duas linhas na auditoria');

set local role authenticated;
select lives_ok(
  $$select public.marketing_delete_segment((select id from _ids where nome = 'seg'))$$,
  'segmento comum é apagado (soft delete)');

select throws_like(
  $$select public.marketing_save_campaign(null, 'Grav camp', null, null, '{"nodes":"x"}')$$,
  '%Fluxo inválido%',
  'fluxo sem forma é recusado');

select lives_ok(
  $$insert into _ids select 'camp', public.marketing_save_campaign(null, 'Grav camp', null)$$,
  'hub_admin cria campanha');

select lives_ok(
  $$select public.marketing_save_campaign((select id from _ids where nome = 'camp'), 'Grav camp', null)$$,
  'salvar sem mudar nada não quebra');

select throws_like(
  $$select public.marketing_set_campaign_status((select id from _ids where nome = 'camp'), 'running')$$,
  '%running e done são do motor%',
  'status running é do motor');

select throws_like(
  $$select public.marketing_save_campaign(current_setting('test.camp_feita')::uuid, 'Grav feita', null)$$,
  '%encerrada não muda%',
  'campanha encerrada não muda');

select throws_like(
  $$select public.marketing_set_dispatch_config(null, null, null, null)$$,
  '%Nada para mudar%',
  'configuração sem nenhum valor é recusada');

select lives_ok(
  $$select public.marketing_set_dispatch_config(null, 321)$$,
  'hub_admin troca o teto diário');

reset role;
select is(
  (select status::text from public.marketing_campaign where id = (select id from _ids where nome = 'camp')),
  'draft',
  'campanha nasce rascunho');
select is(
  (select count(*)::int from public.marketing_audit_log
    where entity_id = (select id from _ids where nome = 'camp')),
  1,
  'salvar sem mudança não grava auditoria nova');
select is((select value from public.app_setting where key = 'marketing_daily_send_cap'), '321',
  'teto diário gravado');

-- ── Como servidor (o MCP) ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_like(
  $$select public.marketing_set_dispatch_config(null, null, 'outro@ex.com',
      '{"kind":"api_key","label":"Claude marketing"}')$$,
  '%remetente só muda pela tela%',
  'o MCP não troca o remetente');

select throws_like(
  $$select public.marketing_set_dispatch_enabled(true, '  ', '{"kind":"api_key","label":"Claude marketing"}')$$,
  '%motivo%',
  'chave geral sem motivo é recusada');

select is(
  (select public.marketing_set_dispatch_enabled(true, 'teste pgTAP',
     '{"kind":"api_key","id":"00000000-0000-0000-0000-000000000001","label":"Claude marketing"}') ->> 'enabled'),
  'true',
  'o MCP liga a chave geral com motivo (desfeito no rollback)');

select ok(
  exists (select 1 from public.marketing_audit_log
          where action = 'dispatch.enabled' and actor_kind = 'api_key'
            and actor_label = 'Claude marketing' and reason = 'teste pgTAP'),
  'ligar a chave deixa linha com a chave, o motivo, o antes e o depois');

-- ── Cliente comum ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$insert into public.marketing_segment(name, slug) values ('x', 'x-grav')$$,
  '42501', null,
  'a tabela não aceita mais gravação direta');
reset role;

select * from finish();
rollback;
