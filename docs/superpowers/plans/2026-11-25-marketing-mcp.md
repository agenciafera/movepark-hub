# MCP de marketing: plano de implementação

> **Para quem executa:** neste projeto a execução é **na própria conversa** (executing-plans), sem
> agente em segundo plano: o Kallef quer ver o trabalho andando. Os passos usam checkbox (`- [ ]`).

**Objetivo:** expor o módulo de Automação do Manager inteiro como tools do MCP `/manager`, com
gravação validada e auditada no banco, para a IA montar segmento, campanha e cupom e executar o disparo.

**Arquitetura:** um registro único de tools em `supabase/functions/_shared/marketing/` (definições,
handlers, validação do fluxo, núcleo do motor) consumido pelo MCP agora e pelo assistente do Manager
depois. O banco é a regra: as RPCs de painel passam a aceitar o servidor, e as gravações viram RPCs
`security definer` com auditoria em `marketing_audit_log`. A tela passa a gravar pelas mesmas RPCs.

**Stack:** Postgres (Supabase) com pgTAP; Edge Functions em Deno; React + TanStack Query; Vitest + MSW.

**Spec:** [`docs/specs/marketing-mcp.md`](../../specs/marketing-mcp.md).

## Regras globais (valem para toda tarefa)

- Trabalho direto na `main`. Antes de cada commit: `git status`, nenhum arquivo não rastreado que o código use.
- Migration nova com carimbo único: conferir com `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` (saída vazia) e com `select max(version) from supabase_migrations.schema_migrations`.
- Aplicar migration no vivo com `supabase db query --linked -f <arquivo>` e registrar com `supabase migration repair --status applied <carimbo> --linked`. Nada de `db push`.
- pgTAP roda no vivo sem Docker pelo script `tap.sh` do scratchpad (receita na memória `project_migrations_via_mcp_not_dbpush`): `tap.sh <teste.sql> [migration.sql ...]`, tudo dentro de transação desfeita.
- Vitest com Node 22: `export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"` antes de `bun run test`.
- Edge: `deno test --no-check --allow-env --allow-net --allow-read <arquivo>`. Depois de rodar, `git checkout deno.lock` se ele mudar sozinho.
- **Erro de negócio das RPCs novas usa `P0001`** (o `raise exception` sem `errcode`). O MCP só repassa ao cliente a mensagem de `P0001` (`safeToolError` em `mcp/protocol.ts`); qualquer outro código vira "Parâmetro inválido" e a IA não saberia o que corrigir. Permissão continua `42501`.
- Sem travessão (`—` e `–`) em nenhum texto, comentário, doc ou commit. Texto de interface e de e-mail passa pela skill `revisar-texto`.
- **Nenhuma campanha é executada contra o banco vivo**, nem a chave geral é ligada fora de transação desfeita. A verificação no vivo usa só tools de leitura.
- Mensagens de commit `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261207110000_marketing_mcp_base.sql` | Trava comum `marketing_can_manage()`, troca da trava nas 13 RPCs de painel, escopos, `marketing_audit_log`, ator, catálogo de campos e validação de definição |
| `supabase/migrations/20261207120000_marketing_mcp_gravacao.sql` | RPCs de gravação com auditoria, configuração do disparo, políticas só-leitura em segmento e campanha |
| `supabase/tests/marketing_mcp_base.test.sql` | pgTAP da migration base |
| `supabase/tests/marketing_mcp_gravacao.test.sql` | pgTAP das gravações |
| `supabase/functions/_shared/marketing/engine.ts` (movido de `marketing-run/`) | Regras puras do motor (já existe) |
| `supabase/functions/_shared/marketing/canvas.ts` | Prontidão do fluxo (espelho de `validateCanvas` do front) |
| `supabase/functions/_shared/marketing/run.ts` | `runCampaign`: núcleo do motor, tirado da Edge |
| `supabase/functions/_shared/marketing/tools.ts` | `MARKETING_TOOLS` |
| `supabase/functions/_shared/marketing/handlers.ts` | `callMarketing` |
| `supabase/functions/_shared/email.ts` | Template `tplMarketingDispatchEnabled` (ADR-007) |
| `supabase/functions/marketing-run/index.ts` | Casca fina: trava de `hub_admin` + `runCampaign` |
| `supabase/functions/mcp/tools.ts`, `mcp/index.ts` | Registro e despacho das tools de marketing no `/manager` |
| `scripts/check-openapi-drift.mjs` | Guarda do CI enxerga `MARKETING_TOOLS` e os escopos novos |
| `src/features/marketing/api.ts` | Tela grava pelas RPCs |
| `src/features/marketing/segmentFields.contract.test.ts` | Paridade do catálogo de campos front ↔ migration |

---

### Tarefa 1: Base no banco (trava comum, escopos, auditoria, catálogo, validação)

**Arquivos:**
- Criar: `supabase/migrations/20261207110000_marketing_mcp_base.sql`
- Criar: `supabase/tests/marketing_mcp_base.test.sql`

**Interfaces:**
- Produz: `public.marketing_can_manage() returns boolean`; `public.marketing_resolve_actor(p_actor jsonb) returns jsonb` (`{kind, id, label}`); `public.marketing_audit_write(p_actor jsonb, p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_reason text) returns void`; `public.marketing_segment_operators(p_kind text) returns text[]`; `public.marketing_segment_fields() returns table(key text, kind text, label text, grupo text, options jsonb, hint text, operators text[])`; `public.marketing_validate_definition(p_def jsonb, p_path text default 'raiz') returns text[]`; tabela `public.marketing_audit_log`; escopos `marketing:read`, `marketing:write`, `marketing:dispatch`.

- [ ] **Passo 1: escrever o teste que falha**

`supabase/tests/marketing_mcp_base.test.sql`:

```sql
-- pgTAP: base do MCP de marketing (migration 20261207110000_marketing_mcp_base).
--   - escopos de plataforma;
--   - catálogo de campos de segmento e a validação de definição no servidor;
--   - a trava comum: o servidor (MCP) passa, cliente logado comum continua recusado;
--   - o ator: hub_admin não se passa por chave.
-- Spec: docs/specs/marketing-mcp.md. Roda com: supabase test db. Transação + rollback.

begin;
select plan(18);

do $$
declare
  u uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-mcp-cliente@ex.com', now(), now()),
           (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-mcp-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';

  -- Uma compra para o contato existir no documento de marketing.
  select id into v_loc from public.location where deleted_at is null limit 1;
  insert into public.booking(code, profile_id, location_id, status, total_amount, customer_email,
                             created_at, check_in_at, check_out_at)
  values ('MP-MKT-MCP-1', u, v_loc, 'completed', 120, 'mkt-mcp-cliente@ex.com',
          now() - interval '3 days', now() - interval '2 days', now() - interval '1 day');

  perform set_config('test.u', u::text, false);
  perform set_config('test.adm', adm::text, false);
end $$;

-- ── 1. Escopos ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.api_scope
    where scope in ('marketing:read', 'marketing:write', 'marketing:dispatch')
      and is_platform_scope and assignable_to_api_key),
  3,
  'os três escopos de marketing são de plataforma e atribuíveis a chave');

-- ── 2. Catálogo de campos ───────────────────────────────────────────────────
select is((select count(*)::int from public.marketing_segment_fields()), 36,
  'o catálogo tem os 36 campos do construtor do front');

select is(
  (select jsonb_array_length(options) from public.marketing_segment_fields() where key = 'rfm_segment'),
  14,
  'rfm_segment lista os 14 segmentos do RFM');

select ok(
  not exists (
    select 1 from public.marketing_segment_fields() f
    where not ((select d.doc from public.marketing_contact_doc(null) d
                where d.contact_key = 'mkt-mcp-cliente@ex.com') ? f.key)),
  'todo campo do catálogo existe no documento do contato');

-- ── 3. Validação da definição ───────────────────────────────────────────────
select is(
  public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2}]}'),
  '{}'::text[],
  'definição válida não tem problema');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"nao_existe","op":"eq","value":1}]}'), ' ')
    like '%campo desconhecido "nao_existe"%',
  'campo desconhecido é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"cohort","op":"gte","value":1}]}'), ' ')
    like '%operador "gte" não vale%',
  'operador fora do tipo do campo é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"total_spent","op":"gte"}]}'), ' ')
    like '%Falta o valor em "Total gasto"%',
  'regra sem valor é apontada');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"all","rules":[{"field":"cohort","op":"eq","value":"vip"}]}'), ' ')
    like '%Valor fora das opções em "Coorte"%',
  'valor de enum fora das opções é apontado');

select ok(
  array_to_string(public.marketing_validate_definition('{"match":"all","rules":[]}'), ' ')
    like '%pega a base inteira%',
  'segmento sem regra é apontado');

select ok(
  array_to_string(public.marketing_validate_definition(
    '{"match":"any","rules":[{"field":"bookings_count","op":"gte","value":1},{"match":"all","rules":[]}]}'), ' ')
    like '%grupo 2 está vazio%',
  'grupo vazio dentro do segmento é apontado');

-- ── 4. A trava comum ────────────────────────────────────────────────────────
-- Servidor: é o MCP com a chave de plataforma, falando como service_role.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.marketing_rfm_overview()$$,
  'o servidor lê o RFM (MCP com chave de plataforma)');
select lives_ok($$select * from public.manager_list_platform_coupons()$$,
  'o servidor lista os cupons da Movepark');

-- Cliente logado comum continua recusado.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.u'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.marketing_rfm_overview()$$, '42501', null,
  'cliente logado comum continua sem RFM');
select throws_ok($$select * from public.marketing_leads()$$, '42501', null,
  'cliente logado comum continua sem leads');
reset role;

-- Admin pela tela segue igual.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select public.marketing_rfm_overview()$$, 'hub_admin segue lendo o RFM pela tela');
reset role;

-- ── 5. O ator ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.marketing_resolve_actor(
    '{"kind":"api_key","id":"00000000-0000-0000-0000-000000000001","label":"Claude marketing"}') ->> 'kind',
  'api_key',
  'o servidor registra a chave que o MCP informou');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(
  public.marketing_resolve_actor('{"kind":"api_key","label":"falso"}') ->> 'kind',
  'hub_admin',
  'hub_admin não se passa por chave');

select * from finish();
rollback;
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `$SP/tap.sh supabase/tests/marketing_mcp_base.test.sql` (com `SP=/private/tmp/claude-501/-Users-kallef--claude-spares-spare-9jARl9/6fa70d1b-d58b-4940-a8b8-57960fcaddb1/scratchpad`; se o scratchpad sumiu, recriar o `tap.sh` pela receita da memória)
Esperado: erro `function public.marketing_segment_fields() does not exist` (ou `not ok` nos casos 1 a 18).

- [ ] **Passo 3: escrever a migration**

`supabase/migrations/20261207110000_marketing_mcp_base.sql`:

```sql
-- MCP de marketing, parte 1: trava comum, escopos, auditoria, catálogo de campos e validação.
-- Spec: docs/specs/marketing-mcp.md (§ 3 e § 4).
--
-- O MCP do Manager entra com chave de plataforma e fala com o banco como service_role, mas as RPCs
-- do painel travavam em is_hub_admin(), que depende de usuário logado. A trava comum aceita os
-- dois e continua recusando cliente comum. As gravações (parte 2) usam o ator e a auditoria daqui.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trava comum
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_hub_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

revoke all on function public.marketing_can_manage() from public, anon;
grant execute on function public.marketing_can_manage() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. As 13 RPCs de painel trocam a trava
--
-- Troca textual sobre a definição viva, com a contagem conferida: cada uma tem exatamente uma
-- `public.is_hub_admin()`. Se alguma mudar de forma, a migration para em vez de trocar errado.
-- CREATE OR REPLACE preserva dono e grants.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_fn text;
  v_def text;
  v_n int;
begin
  foreach v_fn in array array[
    'marketing_profile_matrix', 'marketing_conversion_funnel', 'marketing_segment_preview',
    'marketing_segment_contacts', 'marketing_segment_counts', 'marketing_leads',
    'marketing_move_lead', 'marketing_rfm_overview', 'marketing_rfm_contacts',
    'marketing_discoveries', 'manager_list_platform_coupons', 'manager_upsert_platform_coupon',
    'manager_set_platform_coupon_active'
  ] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_fn;
    if v_def is null then
      raise exception 'Função % não existe.', v_fn;
    end if;
    v_n := (length(v_def) - length(replace(v_def, 'public.is_hub_admin()', '')))
           / length('public.is_hub_admin()');
    if v_n <> 1 then
      raise exception 'Função % tem % travas is_hub_admin(); esperado 1.', v_fn, v_n;
    end if;
    execute replace(v_def, 'public.is_hub_admin()', 'public.marketing_can_manage()');
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Escopos de plataforma
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values
  ('marketing:read', 'marketing',
   'Ler análises, contatos com dados completos, segmentos, campanhas, leads, cupons e a configuração do disparo da Automação.',
   true, true),
  ('marketing:write', 'marketing',
   'Criar e editar segmento, campanha, cupom e lead da Automação, e trocar destinatário de ensaio e teto diário.',
   true, true),
  ('marketing:dispatch', 'marketing',
   'Executar campanha e ligar ou desligar a chave geral do disparo da Automação.',
   true, true)
on conflict (scope) do update
  set module = excluded.module,
      description = excluded.description,
      assignable_to_api_key = excluded.assignable_to_api_key,
      is_platform_scope = excluded.is_platform_scope;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Auditoria
-- ─────────────────────────────────────────────────────────────────────────────
create table public.marketing_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('hub_admin', 'api_key', 'servidor')),
  actor_id uuid,
  actor_label text,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.marketing_audit_log is
  'Quem mudou o quê na Automação (tela, MCP ou servidor), com antes e depois. Escrita só pelas RPCs. Spec: marketing-mcp.md § 3.';

create index marketing_audit_log_entity_idx
  on public.marketing_audit_log (entity, entity_id, created_at desc);
create index marketing_audit_log_created_idx on public.marketing_audit_log (created_at desc);

alter table public.marketing_audit_log enable row level security;
create policy marketing_audit_log_hub_admin_select on public.marketing_audit_log
  for select to authenticated using (public.is_hub_admin());
revoke insert, update, delete on public.marketing_audit_log from anon, authenticated;

-- Quem está agindo. hub_admin é sempre o usuário logado (o p_actor é ignorado, para ninguém se
-- passar por outro pela tela). service_role é o MCP ou o motor: aí vale o que o chamador informou.
create or replace function public.marketing_resolve_actor(p_actor jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
begin
  if public.is_hub_admin() then
    select u.email into v_label from auth.users u where u.id = v_uid;
    return jsonb_build_object('kind', 'hub_admin', 'id', v_uid, 'label', v_label);
  end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return jsonb_build_object(
      'kind', case when p_actor ->> 'kind' in ('hub_admin', 'api_key') then p_actor ->> 'kind'
                   else 'servidor' end,
      'id', p_actor ->> 'id',
      'label', coalesce(nullif(btrim(p_actor ->> 'label'), ''), 'servidor'));
  end if;
  raise exception 'Sem permissão para a Automação.' using errcode = '42501';
end;
$$;

create or replace function public.marketing_audit_write(
  p_actor jsonb,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a jsonb := public.marketing_resolve_actor(p_actor);
begin
  insert into public.marketing_audit_log
    (actor_kind, actor_id, actor_label, action, entity, entity_id, before, after, reason)
  values (
    v_a ->> 'kind',
    case when (v_a ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then (v_a ->> 'id')::uuid end,
    v_a ->> 'label', p_action, p_entity, p_entity_id, p_before, p_after,
    nullif(btrim(p_reason), ''));
end;
$$;

revoke all on function public.marketing_resolve_actor(jsonb) from public, anon, authenticated;
grant execute on function public.marketing_resolve_actor(jsonb) to service_role;
revoke all on function public.marketing_audit_write(jsonb, text, text, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.marketing_audit_write(jsonb, text, text, uuid, jsonb, jsonb, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Catálogo de campos de segmento
--
-- Espelho de SEGMENT_FIELDS (src/features/marketing/segmentBuilder.logic.ts), com as mesmas chaves e
-- tipos. O contrato src/features/marketing/segmentFields.contract.test.ts lê este arquivo e reprova
-- divergência. Campo novo entra nos dois lados e no documento do contato.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_segment_operators(p_kind text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_kind
    when 'number' then array['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'between', 'is_empty', 'is_present']
    when 'money' then array['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'between', 'is_empty', 'is_present']
    when 'enum' then array['eq', 'neq', 'in', 'not_in']
    when 'boolean' then array['is_true', 'is_false']
    when 'tags' then array['contains']
    else array['contains', 'eq', 'neq', 'is_empty', 'is_present']
  end;
$$;

create or replace function public.marketing_segment_fields()
returns table (key text, kind text, label text, grupo text, options jsonb, hint text, operators text[])
language sql
immutable
set search_path = public, pg_temp
as $$
  select v.key, v.kind, v.label, v.grupo, v.options, v.hint, public.marketing_segment_operators(v.kind)
  from (values
    ('bookings_count', 'number', 'Reservas pagas', 'Comportamento', null::jsonb, 'Só conta reserva confirmada, com check-in ou concluída.'),
    ('days_since_last', 'number', 'Dias desde a última compra', 'Comportamento', null::jsonb, null),
    ('days_since_first', 'number', 'Dias desde a primeira compra', 'Comportamento', null::jsonb, null),
    ('avg_gap_days', 'number', 'Intervalo médio entre compras (dias)', 'Comportamento', null::jsonb, 'A cadência da própria pessoa. Base do público de recompra.'),
    ('cycle_overdue_days', 'number', 'Dias além do próprio ciclo', 'Comportamento', null::jsonb, 'Negativo é antes da hora, 0 é a hora, positivo é atraso. Entre -5 e 15 é a janela provável de retorno.'),
    ('bookings_30', 'number', 'Reservas nos últimos 30 dias', 'Comportamento', null::jsonb, null),
    ('bookings_90', 'number', 'Reservas nos últimos 90 dias', 'Comportamento', null::jsonb, null),
    ('bookings_180', 'number', 'Reservas nos últimos 180 dias', 'Comportamento', null::jsonb, null),
    ('bookings_365', 'number', 'Reservas nos últimos 365 dias', 'Comportamento', null::jsonb, null),
    ('avg_stay_days', 'number', 'Duração média da estadia (dias)', 'Comportamento', null::jsonb, null),
    ('avg_lead_days', 'number', 'Antecedência média da reserva (dias)', 'Comportamento', null::jsonb, 'Quantos dias antes da entrada a pessoa costuma reservar.'),
    ('weekend_share', 'number', 'Fatia de entradas no fim de semana', 'Comportamento', null::jsonb, 'De 0 a 1, sobre sexta, sábado e domingo. Sobre as reservas que têm data.'),
    ('top_dow', 'enum', 'Dia da semana predominante', 'Comportamento',
      '[{"value":"0","label":"Domingo"},{"value":"1","label":"Segunda"},{"value":"2","label":"Terça"},{"value":"3","label":"Quarta"},{"value":"4","label":"Quinta"},{"value":"5","label":"Sexta"},{"value":"6","label":"Sábado"}]'::jsonb, null),
    ('has_second_booking', 'boolean', 'Já fez a segunda reserva', 'Comportamento', null::jsonb, 'O marco de ativação: é a taxa de 1ª para 2ª que o time mede.'),
    ('abandoned', 'boolean', 'Tem reserva iniciada e não paga', 'Comportamento', null::jsonb, 'Checkout começado com viagem ainda por vir.'),
    ('vacation_share', 'number', 'Fatia de viagens em férias', 'Comportamento', null::jsonb, 'De 0 a 1, sobre janeiro, julho e dezembro. 0,7 já é um perfil sazonal.'),
    ('distinct_locations', 'number', 'Estacionamentos diferentes usados', 'Comportamento', null::jsonb, null),
    ('cancelled_count', 'number', 'Cancelamentos e faltas', 'Comportamento', null::jsonb, null),
    ('total_spent', 'money', 'Total gasto', 'Valor', null::jsonb, null),
    ('avg_ticket', 'money', 'Ticket médio', 'Valor', null::jsonb, null),
    ('last_ticket', 'money', 'Valor da última reserva', 'Valor', null::jsonb, null),
    ('r_score', 'number', 'Score de recência (R)', 'RFM', null::jsonb, 'De 1 a 5, por quintil da própria base. 5 é o mais recente.'),
    ('f_score', 'number', 'Score de frequência (F)', 'RFM', null::jsonb, 'De 1 a 5, por quintil. 5 é quem mais volta.'),
    ('m_score', 'number', 'Score monetário (M)', 'RFM', null::jsonb, 'De 1 a 5, por quintil. 5 é quem mais gerou receita.'),
    ('rfm_segment', 'enum', 'Segmento RFM', 'RFM',
      '[{"value":"campeoes","label":"Campeões"},{"value":"fieis","label":"Fiéis"},{"value":"recorrentes","label":"Recorrentes"},{"value":"potenciais","label":"Potenciais"},{"value":"novos","label":"Novos"},{"value":"ocasionais","label":"Ocasionais"},{"value":"oportunidade","label":"Oportunidade"},{"value":"atencao","label":"Atenção"},{"value":"recuperar","label":"Recuperar"},{"value":"em_risco","label":"Em risco"},{"value":"alto_risco","label":"Alto risco"},{"value":"inativos","label":"Inativos"},{"value":"perdidos","label":"Perdidos"},{"value":"perdidos_vip","label":"Perdidos VIP"}]'::jsonb,
      'A célula da matriz Recência × Frequência, com o M promovendo os de maior valor.'),
    ('cohort', 'enum', 'Coorte', 'Growth',
      '[{"value":"lead","label":"Lead"},{"value":"primeira_compra","label":"Primeira compra"},{"value":"recorrente","label":"Recorrente"},{"value":"campeao","label":"Campeão"},{"value":"sazonal_ferias","label":"Sazonal de férias"},{"value":"em_risco","label":"Em risco"},{"value":"inativo","label":"Inativo"}]'::jsonb, null),
    ('growth_stage', 'enum', 'Estágio de growth', 'Growth',
      '[{"value":"aquisicao","label":"Aquisição"},{"value":"ativacao","label":"Ativação"},{"value":"retencao","label":"Retenção"},{"value":"reativacao","label":"Reativação"}]'::jsonb, null),
    ('subscription_candidate', 'boolean', 'Candidato a assinante', 'Growth', null::jsonb, 'Já tem cadência de mensalista: volta muito ou volta rápido.'),
    ('vehicle_model', 'text', 'Modelo do veículo', 'Veículo', null::jsonb, null),
    ('vehicle_brand', 'text', 'Marca do veículo', 'Veículo', null::jsonb, 'Normalizada a partir do campo livre: "PEUGEOT/2008" e "Onix" viram PEUGEOT e CHEVROLET.'),
    ('vehicle_origin', 'enum', 'Origem da marca', 'Veículo',
      '[{"value":"nacional","label":"Nacional"},{"value":"importada","label":"Importada"}]'::jsonb,
      'Proxy de perfil pela marca, não o dado fiscal de importação do veículo.'),
    ('vehicle_color', 'text', 'Cor do veículo', 'Veículo', null::jsonb, null),
    ('tags', 'tags', 'Etiquetas', 'Contato', null::jsonb, null),
    ('email_consent', 'boolean', 'Aceita e-mail', 'Contato', null::jsonb, null),
    ('whatsapp_consent', 'boolean', 'Aceita WhatsApp', 'Contato', null::jsonb, null),
    ('unsubscribed', 'boolean', 'Descadastrado', 'Contato', null::jsonb, null)
  ) as v(key, kind, label, grupo, options, hint);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Validação da definição de segmento
--
-- Mesma regra de validateDefinition do front, mais o que o front não precisa checar porque o seletor
-- não deixa errar: campo e operador existentes e valor de enum dentro das opções. Devolve TODOS os
-- problemas, não só o primeiro.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_validate_definition(p_def jsonb, p_path text default 'raiz')
returns text[]
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_problems text[] := '{}';
  v_rule jsonb;
  v_i int := 0;
  v_field record;
  v_op text;
  v_val jsonb;
begin
  if coalesce(jsonb_typeof(p_def), '') <> 'object' then
    return array[format('%s: o segmento precisa ser um objeto com "match" e "rules".', p_path)];
  end if;
  if coalesce(p_def ->> 'match', '') not in ('all', 'any') then
    v_problems := v_problems || format('%s: "match" precisa ser "all" ou "any".', p_path);
  end if;
  if coalesce(jsonb_typeof(p_def -> 'rules'), '') <> 'array'
     or jsonb_array_length(p_def -> 'rules') = 0 then
    return v_problems || case when p_path = 'raiz'
      then 'O segmento não tem nenhuma regra, então ele pega a base inteira.'
      else format('O grupo em %s está vazio.', p_path) end;
  end if;

  for v_rule in select * from jsonb_array_elements(p_def -> 'rules') loop
    v_i := v_i + 1;
    if jsonb_typeof(v_rule) = 'object' and v_rule ? 'rules' then
      v_problems := v_problems || public.marketing_validate_definition(v_rule, p_path || ' › grupo ' || v_i);
      continue;
    end if;

    select * into v_field from public.marketing_segment_fields() f where f.key = v_rule ->> 'field';
    if not found then
      v_problems := v_problems || format('%s, regra %s: campo desconhecido "%s".',
                                         p_path, v_i, coalesce(v_rule ->> 'field', ''));
      continue;
    end if;

    v_op := v_rule ->> 'op';
    if v_op is null or not (v_op = any (v_field.operators)) then
      v_problems := v_problems || format('%s, regra %s: operador "%s" não vale para "%s".',
                                         p_path, v_i, coalesce(v_op, ''), v_field.label);
      continue;
    end if;

    if v_op in ('is_true', 'is_false', 'is_empty', 'is_present') then
      continue;
    end if;

    v_val := v_rule -> 'value';
    if v_op = 'between' then
      if coalesce(jsonb_typeof(v_val), '') <> 'array' or jsonb_array_length(v_val) <> 2 then
        v_problems := v_problems || format('Falta o valor em "%s": "between" pede dois valores.', v_field.label);
      end if;
    elsif v_op in ('in', 'not_in') then
      if coalesce(jsonb_typeof(v_val), '') <> 'array' or jsonb_array_length(v_val) = 0 then
        v_problems := v_problems || format('Falta o valor em "%s": "%s" pede uma lista.', v_field.label, v_op);
      end if;
    elsif v_val is null or jsonb_typeof(v_val) = 'null' or v_val = '""'::jsonb then
      v_problems := v_problems || format('Falta o valor em "%s".', v_field.label);
      continue;
    end if;

    if v_field.kind = 'enum' and v_field.options is not null
       and v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if exists (
        select 1
        from jsonb_array_elements_text(
               case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end) x(v)
        where not exists (
          select 1 from jsonb_array_elements(v_field.options) o where o ->> 'value' = x.v)
      ) then
        v_problems := v_problems || format('Valor fora das opções em "%s".', v_field.label);
      end if;
    end if;
  end loop;

  return v_problems;
end;
$$;

revoke all on function public.marketing_segment_operators(text) from anon;
revoke all on function public.marketing_segment_fields() from anon;
revoke all on function public.marketing_validate_definition(jsonb, text) from anon;
```

- [ ] **Passo 4: rodar o teste com a migration e ver passar**

Run: `$SP/tap.sh supabase/tests/marketing_mcp_base.test.sql supabase/migrations/20261207110000_marketing_mcp_base.sql`
Esperado: `ok 1` a `ok 18`, sem `not ok`.

Se `pgTAP` reclamar de `throws_ok` por causa do `set local role` dentro do arquivo montado, conferir que o `tap.sh` dá `grant` da `_tap` para `authenticated`.

- [ ] **Passo 5: rodar os pgTAP de marketing existentes com a migration (regressão)**

Run: `$SP/tap.sh supabase/tests/marketing_rfm.test.sql supabase/migrations/20261207110000_marketing_mcp_base.sql` e `$SP/tap.sh supabase/tests/marketing_campaign_engine.test.sql supabase/migrations/20261207110000_marketing_mcp_base.sql`
Esperado: todos `ok` (19 e 11).

- [ ] **Passo 6: aplicar no vivo e registrar**

```bash
supabase db query --linked -f supabase/migrations/20261207110000_marketing_mcp_base.sql
supabase migration repair --status applied 20261207110000 --linked
```

Conferir no vivo (MCP `execute_sql`): `select count(*) from api_scope where scope like 'marketing:%'` = 3, e `select has_function_privilege('anon','public.marketing_audit_write(jsonb,text,text,uuid,jsonb,jsonb,text)','execute')` = `false`.

- [ ] **Passo 7: commit**

```bash
git add supabase/migrations/20261207110000_marketing_mcp_base.sql supabase/tests/marketing_mcp_base.test.sql
git commit -m "feat(marketing): base do MCP no banco, trava comum, escopos, auditoria e catálogo de campos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Gravação pelo banco, com auditoria

**Arquivos:**
- Criar: `supabase/migrations/20261207120000_marketing_mcp_gravacao.sql`
- Criar: `supabase/tests/marketing_mcp_gravacao.test.sql`

**Interfaces:**
- Consome (Tarefa 1): `marketing_can_manage()`, `marketing_audit_write(...)`, `marketing_validate_definition(jsonb)`.
- Produz (todas `security definer`, executáveis por `authenticated` e `service_role`, recusa de negócio em `P0001`):
  - `marketing_save_segment(p_segment_id uuid, p_name text, p_definition jsonb, p_description text default null, p_location_ids uuid[] default null, p_actor jsonb default null) returns uuid`
  - `marketing_delete_segment(p_segment_id uuid, p_actor jsonb default null) returns void`
  - `marketing_save_campaign(p_campaign_id uuid, p_name text, p_segment_id uuid, p_location_ids uuid[] default null, p_canvas jsonb default null, p_send_cap integer default null, p_actor jsonb default null) returns uuid`
  - `marketing_set_campaign_status(p_campaign_id uuid, p_status text, p_actor jsonb default null) returns void`
  - `marketing_dispatch_config() returns jsonb` (`{enabled, daily_cap, test_recipient, email_from, sent_today}`)
  - `marketing_set_dispatch_config(p_test_recipient text default null, p_daily_cap integer default null, p_email_from text default null, p_actor jsonb default null) returns jsonb`
  - `marketing_set_dispatch_enabled(p_enabled boolean, p_reason text, p_actor jsonb default null) returns jsonb` (`{changed, enabled}`)

- [ ] **Passo 1: escrever o teste que falha**

`supabase/tests/marketing_mcp_gravacao.test.sql`:

```sql
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
```

São 24 asserções: 6 `lives_ok`, 10 `throws_like`, 6 `is`, 1 `ok` e 1 `throws_ok`. Conferência: `grep -cE "^select (is|ok|lives_ok|throws_ok|throws_like)\(" supabase/tests/marketing_mcp_gravacao.test.sql` devolve `24`.

- [ ] **Passo 2: rodar e ver falhar**

Run: `$SP/tap.sh supabase/tests/marketing_mcp_gravacao.test.sql supabase/migrations/20261207110000_marketing_mcp_base.sql`
Esperado: falha em `marketing_save_segment does not exist`.

Antes do passo 3, acrescentar `throws_like` ao `tap.sh` se ele não converter: a regex do script troca `select (is|ok|isnt|lives_ok|throws_ok|cmp_ok|results_eq)(`. Mudar para `(is|ok|isnt|lives_ok|throws_ok|throws_like|cmp_ok|results_eq)`.

- [ ] **Passo 3: escrever a migration**

`supabase/migrations/20261207120000_marketing_mcp_gravacao.sql`:

```sql
-- MCP de marketing, parte 2: a gravação da Automação passa pelo banco, validada e auditada.
-- Spec: docs/specs/marketing-mcp.md (§ 3 e § 5).
--
-- Tela e MCP gravam pelas mesmas RPCs. Recusa de negócio sai em P0001, que é o único código cuja
-- mensagem o MCP repassa ao cliente (safeToolError): sem isso a IA receberia "Parâmetro inválido"
-- e não saberia que campo corrigir. Segmento e campanha deixam de aceitar gravação direta.

create or replace function public.marketing_require_manage()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.marketing_can_manage() then
    raise exception 'Sem permissão para a Automação.' using errcode = '42501';
  end if;
end;
$$;

-- Slug a partir do nome, único na tabela pedida. Só para marketing_segment e marketing_campaign.
create or replace function public.marketing_slug(p_name text, p_table text)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_slug text;
  v_existe boolean;
begin
  if p_table not in ('marketing_segment', 'marketing_campaign') then
    raise exception 'Tabela sem slug de marketing: %', p_table;
  end if;
  v_base := trim(both '-' from regexp_replace(lower(translate(coalesce(p_name, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'item';
  end if;
  v_slug := left(v_base, 60);
  loop
    execute format('select exists (select 1 from public.%I where slug = $1)', p_table)
      into v_existe using v_slug;
    exit when not v_existe;
    v_slug := left(v_base, 53) || '-' || substr(md5(random()::text), 1, 6);
  end loop;
  return v_slug;
end;
$$;

-- Forma do fluxo: o que precisa estar certo para o fluxo ser salvo. Prontidão para executar (assunto,
-- template, saídas da condição) é regra do motor, em _shared/marketing/canvas.ts.
create or replace function public.marketing_canvas_shape_problems(p_canvas jsonb)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text[] := '{}';
  v_ids text[];
begin
  if coalesce(jsonb_typeof(p_canvas), '') <> 'object'
     or coalesce(jsonb_typeof(p_canvas -> 'nodes'), '') <> 'array'
     or coalesce(jsonb_typeof(p_canvas -> 'edges'), '') <> 'array' then
    return array['O fluxo precisa ser um objeto com "nodes" e "edges".'];
  end if;

  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(p_canvas -> 'nodes') n;

  if exists (select 1 from jsonb_array_elements(p_canvas -> 'nodes') n
             where coalesce(n ->> 'id', '') = '') then
    v := v || 'Todo nó precisa de "id".';
  end if;
  if cardinality(v_ids) <> (select count(distinct i) from unnest(v_ids) i) then
    v := v || 'Há nós com o mesmo "id".';
  end if;
  if exists (select 1 from jsonb_array_elements(p_canvas -> 'nodes') n
             where coalesce(n ->> 'type', '') not in
               ('trigger', 'email', 'whatsapp', 'wait', 'condition', 'exit')) then
    v := v || 'Tipo de nó desconhecido. Use trigger, email, whatsapp, wait, condition ou exit.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_canvas -> 'edges') e
             where not (coalesce(e ->> 'from', '') = any (v_ids)
                        and coalesce(e ->> 'to', '') = any (v_ids))) then
    v := v || 'Há ligação apontando para nó que não existe.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_canvas -> 'edges') e
             where jsonb_typeof(e -> 'branch') = 'string' and e ->> 'branch' not in ('yes', 'no')) then
    v := v || 'Ramo de condição precisa ser "yes" ou "no".';
  end if;
  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Segmento
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_save_segment(
  p_segment_id uuid,
  p_name text,
  p_definition jsonb,
  p_description text default null,
  p_location_ids uuid[] default null,
  p_actor jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_problems text[];
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  perform public.marketing_require_manage();
  if nullif(btrim(p_name), '') is null then
    raise exception 'O segmento precisa de nome.';
  end if;
  v_problems := public.marketing_validate_definition(p_definition);
  if cardinality(v_problems) > 0 then
    raise exception 'Segmento inválido: %', array_to_string(v_problems, ' | ');
  end if;

  if p_segment_id is null then
    insert into public.marketing_segment (name, slug, description, definition, location_ids, created_by)
    values (btrim(p_name), public.marketing_slug(p_name, 'marketing_segment'),
            nullif(btrim(p_description), ''), p_definition, coalesce(p_location_ids, '{}'), auth.uid())
    returning id into v_id;
  else
    select to_jsonb(s) into v_before from public.marketing_segment s
    where s.id = p_segment_id and s.deleted_at is null for update;
    if v_before is null then
      raise exception 'Segmento não encontrado.';
    end if;
    if (v_before ->> 'is_system')::boolean then
      raise exception 'Segmento do modelo RFM não muda. Crie um novo a partir dele.';
    end if;
    update public.marketing_segment
       set name = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           definition = p_definition,
           location_ids = coalesce(p_location_ids, location_ids),
           updated_at = now()
     where id = p_segment_id;
    v_id := p_segment_id;
  end if;

  select to_jsonb(s) into v_after from public.marketing_segment s where s.id = v_id;
  if v_before is null or (v_before - 'updated_at') is distinct from (v_after - 'updated_at') then
    perform public.marketing_audit_write(
      p_actor, case when v_before is null then 'segment.create' else 'segment.update' end,
      'marketing_segment', v_id, v_before, v_after);
  end if;
  return v_id;
end;
$$;

create or replace function public.marketing_delete_segment(p_segment_id uuid, p_actor jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
begin
  perform public.marketing_require_manage();
  select to_jsonb(s) into v_before from public.marketing_segment s
  where s.id = p_segment_id and s.deleted_at is null for update;
  if v_before is null then
    raise exception 'Segmento não encontrado.';
  end if;
  if (v_before ->> 'is_system')::boolean then
    raise exception 'Segmento do modelo RFM não pode ser excluído.';
  end if;
  if exists (select 1 from public.marketing_campaign c
             where c.segment_id = p_segment_id and c.deleted_at is null
               and c.status in ('running', 'scheduled')) then
    raise exception 'Segmento em uso por campanha em andamento. Pause a campanha antes.';
  end if;
  update public.marketing_segment set deleted_at = now(), updated_at = now() where id = p_segment_id;
  perform public.marketing_audit_write(p_actor, 'segment.delete', 'marketing_segment',
                                       p_segment_id, v_before, null);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Campanha
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_save_campaign(
  p_campaign_id uuid,
  p_name text,
  p_segment_id uuid,
  p_location_ids uuid[] default null,
  p_canvas jsonb default null,
  p_send_cap integer default null,
  p_actor jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_problems text[];
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  perform public.marketing_require_manage();
  if nullif(btrim(p_name), '') is null then
    raise exception 'A campanha precisa de nome.';
  end if;
  if p_segment_id is not null and not exists (
       select 1 from public.marketing_segment where id = p_segment_id and deleted_at is null) then
    raise exception 'Segmento não encontrado.';
  end if;
  if p_canvas is not null then
    v_problems := public.marketing_canvas_shape_problems(p_canvas);
    if cardinality(v_problems) > 0 then
      raise exception 'Fluxo inválido: %', array_to_string(v_problems, ' | ');
    end if;
  end if;
  if p_send_cap is not null and (p_send_cap <= 0 or p_send_cap > 10000) then
    raise exception 'O teto de público da campanha vai de 1 a 10000.';
  end if;

  if p_campaign_id is null then
    insert into public.marketing_campaign
      (name, slug, segment_id, location_ids, canvas, send_cap, created_by, status)
    values (btrim(p_name), public.marketing_slug(p_name, 'marketing_campaign'), p_segment_id,
            coalesce(p_location_ids, '{}'), coalesce(p_canvas, '{"nodes":[],"edges":[]}'::jsonb),
            coalesce(p_send_cap, 100), auth.uid(), 'draft')
    returning id into v_id;
  else
    select to_jsonb(c) into v_before from public.marketing_campaign c
    where c.id = p_campaign_id and c.deleted_at is null for update;
    if v_before is null then
      raise exception 'Campanha não encontrada.';
    end if;
    if v_before ->> 'status' in ('done', 'archived') then
      raise exception 'Campanha encerrada não muda. Crie outra.';
    end if;
    update public.marketing_campaign
       set name = btrim(p_name),
           segment_id = p_segment_id,
           location_ids = coalesce(p_location_ids, location_ids),
           canvas = coalesce(p_canvas, canvas),
           send_cap = coalesce(p_send_cap, send_cap),
           updated_at = now()
     where id = p_campaign_id;
    v_id := p_campaign_id;
  end if;

  select to_jsonb(c) into v_after from public.marketing_campaign c where c.id = v_id;
  if v_before is null or (v_before - 'updated_at') is distinct from (v_after - 'updated_at') then
    perform public.marketing_audit_write(
      p_actor, case when v_before is null then 'campaign.create' else 'campaign.update' end,
      'marketing_campaign', v_id, v_before, v_after);
  end if;
  return v_id;
end;
$$;

create or replace function public.marketing_set_campaign_status(
  p_campaign_id uuid,
  p_status text,
  p_actor jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.marketing_require_manage();
  if p_status not in ('draft', 'paused', 'archived') then
    raise exception 'Status permitido: draft, paused ou archived. running e done são do motor.';
  end if;
  select to_jsonb(c) into v_before from public.marketing_campaign c
  where c.id = p_campaign_id and c.deleted_at is null for update;
  if v_before is null then
    raise exception 'Campanha não encontrada.';
  end if;
  if v_before ->> 'status' in ('done', 'archived') and p_status <> 'archived' then
    raise exception 'Campanha encerrada não volta. Crie outra.';
  end if;
  update public.marketing_campaign
     set status = p_status::public.marketing_campaign_status, updated_at = now()
   where id = p_campaign_id;
  select to_jsonb(c) into v_after from public.marketing_campaign c where c.id = p_campaign_id;
  perform public.marketing_audit_write(p_actor, 'campaign.status', 'marketing_campaign',
                                       p_campaign_id, v_before, v_after);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Configuração do disparo
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_dispatch_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap text := (select value from public.app_setting where key = 'marketing_daily_send_cap');
begin
  perform public.marketing_require_manage();
  return jsonb_build_object(
    'enabled', lower(coalesce((select value from public.app_setting
                               where key = 'marketing_dispatch_enabled'), 'false')) = 'true',
    'daily_cap', case when v_cap ~ '^\d+$' then v_cap::int else 200 end,
    'test_recipient', nullif((select value from public.app_setting
                              where key = 'marketing_test_recipient'), ''),
    'email_from', nullif((select value from public.app_setting
                          where key = 'marketing_email_from'), ''),
    'sent_today', (select count(*) from public.marketing_message
                   where status = 'sent' and sent_at >= date_trunc('day', now())));
end;
$$;

create or replace function public.marketing_set_dispatch_config(
  p_test_recipient text default null,
  p_daily_cap integer default null,
  p_email_from text default null,
  p_actor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.marketing_require_manage();
  if p_test_recipient is null and p_daily_cap is null and p_email_from is null then
    raise exception 'Nada para mudar: informe destinatário de ensaio, teto diário ou remetente.';
  end if;
  if p_email_from is not null and not public.is_hub_admin() then
    raise exception 'O remetente só muda pela tela do Manager.';
  end if;
  if p_daily_cap is not null and (p_daily_cap < 0 or p_daily_cap > 5000) then
    raise exception 'O teto diário vai de 0 a 5000 envios.';
  end if;
  if nullif(btrim(p_test_recipient), '') is not null
     and btrim(p_test_recipient) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'O destinatário de ensaio precisa ser um e-mail.';
  end if;
  if nullif(btrim(p_email_from), '') is not null
     and btrim(p_email_from) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'O remetente precisa ser um e-mail.';
  end if;

  v_before := public.marketing_dispatch_config();
  if p_test_recipient is not null then
    insert into public.app_setting (key, value) values ('marketing_test_recipient', btrim(p_test_recipient))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_daily_cap is not null then
    insert into public.app_setting (key, value) values ('marketing_daily_send_cap', p_daily_cap::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_email_from is not null then
    insert into public.app_setting (key, value) values ('marketing_email_from', btrim(p_email_from))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  v_after := public.marketing_dispatch_config();

  perform public.marketing_audit_write(p_actor, 'dispatch.config', 'app_setting', null,
                                       v_before - 'sent_today', v_after - 'sent_today');
  return v_after;
end;
$$;

create or replace function public.marketing_set_dispatch_enabled(
  p_enabled boolean,
  p_reason text,
  p_actor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before boolean;
begin
  perform public.marketing_require_manage();
  if p_enabled is null then
    raise exception 'Diga se o disparo fica ligado (true) ou desligado (false).';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Diga o motivo de ligar ou desligar o disparo.';
  end if;

  v_before := lower(coalesce((select value from public.app_setting
                              where key = 'marketing_dispatch_enabled'), 'false')) = 'true';
  insert into public.app_setting (key, value)
  values ('marketing_dispatch_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.marketing_audit_write(
    p_actor, 'dispatch.enabled', 'app_setting', null,
    jsonb_build_object('enabled', v_before), jsonb_build_object('enabled', p_enabled), p_reason);

  return jsonb_build_object('changed', v_before is distinct from p_enabled, 'enabled', p_enabled);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Segmento e campanha deixam de aceitar gravação direta
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists marketing_segment_hub_admin on public.marketing_segment;
create policy marketing_segment_hub_admin_select on public.marketing_segment
  for select to authenticated using (public.is_hub_admin());

drop policy if exists marketing_campaign_hub_admin on public.marketing_campaign;
create policy marketing_campaign_hub_admin_select on public.marketing_campaign
  for select to authenticated using (public.is_hub_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants (o Supabase concede execute a anon e authenticated por padrão; revogar nominalmente)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.marketing_slug(text, text) from public, anon, authenticated;
revoke all on function public.marketing_canvas_shape_problems(jsonb) from public, anon;
revoke all on function public.marketing_require_manage() from public, anon;
grant execute on function public.marketing_require_manage() to authenticated, service_role;

revoke all on function public.marketing_save_segment(uuid, text, jsonb, text, uuid[], jsonb) from public, anon;
revoke all on function public.marketing_delete_segment(uuid, jsonb) from public, anon;
revoke all on function public.marketing_save_campaign(uuid, text, uuid, uuid[], jsonb, integer, jsonb) from public, anon;
revoke all on function public.marketing_set_campaign_status(uuid, text, jsonb) from public, anon;
revoke all on function public.marketing_dispatch_config() from public, anon;
revoke all on function public.marketing_set_dispatch_config(text, integer, text, jsonb) from public, anon;
revoke all on function public.marketing_set_dispatch_enabled(boolean, text, jsonb) from public, anon;

grant execute on function public.marketing_save_segment(uuid, text, jsonb, text, uuid[], jsonb) to authenticated, service_role;
grant execute on function public.marketing_delete_segment(uuid, jsonb) to authenticated, service_role;
grant execute on function public.marketing_save_campaign(uuid, text, uuid, uuid[], jsonb, integer, jsonb) to authenticated, service_role;
grant execute on function public.marketing_set_campaign_status(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.marketing_dispatch_config() to authenticated, service_role;
grant execute on function public.marketing_set_dispatch_config(text, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.marketing_set_dispatch_enabled(boolean, text, jsonb) to authenticated, service_role;
```

- [ ] **Passo 4: rodar e ver passar**

Run: `$SP/tap.sh supabase/tests/marketing_mcp_gravacao.test.sql supabase/migrations/20261207110000_marketing_mcp_base.sql supabase/migrations/20261207120000_marketing_mcp_gravacao.sql`
Esperado: `ok` em todos. O ligar da chave geral fica dentro da transação desfeita do script.

- [ ] **Passo 5: aplicar no vivo e conferir que nada mudou de estado**

```bash
supabase db query --linked -f supabase/migrations/20261207120000_marketing_mcp_gravacao.sql
supabase migration repair --status applied 20261207120000 --linked
```

Conferir: `select value from app_setting where key = 'marketing_dispatch_enabled'` continua `false`; `select count(*) from marketing_audit_log` = 0; `select has_function_privilege('anon','public.marketing_save_segment(uuid,text,jsonb,text,uuid[],jsonb)','execute')` = `false`.

- [ ] **Passo 6: commit**

```bash
git add supabase/migrations/20261207120000_marketing_mcp_gravacao.sql supabase/tests/marketing_mcp_gravacao.test.sql
git commit -m "feat(marketing): segmento, campanha e disparo gravados pelo banco, validados e auditados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Atenção:** a partir daqui a tela do Manager **não consegue** salvar segmento nem campanha até a Tarefa 7, porque a política agora é só leitura. Fazer as Tarefas 3 a 7 na mesma sessão e publicar o front junto (o push na `main` publica). Se a sessão parar no meio, reverter só as duas políticas com `create policy ... for all` até o front subir.

---

### Tarefa 3: Motor em `_shared/marketing` e prontidão do fluxo

**Arquivos:**
- Mover: `supabase/functions/marketing-run/engine.ts` → `supabase/functions/_shared/marketing/engine.ts`
- Mover: `supabase/functions/marketing-run/engine.test.ts` → `supabase/functions/_shared/marketing/engine.test.ts`
- Modificar: `supabase/functions/marketing-run/index.ts` (import)
- Criar: `supabase/functions/_shared/marketing/canvas.ts`
- Criar: `supabase/functions/_shared/marketing/canvas.test.ts`

**Interfaces:**
- Produz: `validateCanvas(canvas: Canvas): CanvasProblem[]` e `type CanvasProblem = { nodeId: string | null; message: string }` em `_shared/marketing/canvas.ts`. `Canvas`, `NodeType`, `renderMergeTags`, `nextStep`, `advancesAfterDelivery`, `decideSend`, `waitUntil`, `DeliveryOutcome` seguem em `_shared/marketing/engine.ts`.

- [ ] **Passo 1: mover o motor**

```bash
mkdir -p supabase/functions/_shared/marketing
git mv supabase/functions/marketing-run/engine.ts supabase/functions/_shared/marketing/engine.ts
git mv supabase/functions/marketing-run/engine.test.ts supabase/functions/_shared/marketing/engine.test.ts
sed -i '' 's#from "./engine.ts";#from "../_shared/marketing/engine.ts";#' supabase/functions/marketing-run/index.ts
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/engine.test.ts`
Esperado: `ok | 29 passed`.

- [ ] **Passo 2: escrever o teste da prontidão (falha)**

`supabase/functions/_shared/marketing/canvas.test.ts` (os mesmos casos de `src/features/marketing/canvas.logic.test.ts`, "validação antes de disparar"):

```ts
// Mesmos casos de src/features/marketing/canvas.logic.test.ts ("validação antes de disparar").
// Os dois lados rodam os mesmos casos para travar divergência entre a tela e o motor.
import { assertEquals } from "jsr:@std/assert";
import type { Canvas } from "./engine.ts";
import { validateCanvas } from "./canvas.ts";

function fluxoValido(): Canvas {
  return {
    nodes: [
      { id: "trigger", type: "trigger" },
      { id: "email-1", type: "email", data: { subject: "Oi", body: "corpo" } },
      { id: "exit-1", type: "exit" },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "exit-1" },
    ],
  };
}

const msgs = (c: Canvas) => validateCanvas(c).map((p) => p.message);

Deno.test("fluxo completo não reclama", () => {
  assertEquals(validateCanvas(fluxoValido()), []);
});

Deno.test("aponta e-mail sem assunto e sem corpo", () => {
  const c = fluxoValido();
  c.nodes[1].data = { subject: "", body: "" };
  assertEquals(msgs(c).includes("E-mail sem assunto."), true);
  assertEquals(msgs(c).includes("E-mail sem corpo."), true);
});

Deno.test("aponta WhatsApp sem template", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "whatsapp-1", type: "whatsapp" }],
    edges: [{ from: "trigger", to: "whatsapp-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("sem template")), true);
});

Deno.test("cobra as duas saídas da condição", () => {
  const c: Canvas = {
    nodes: [
      { id: "trigger", type: "trigger" },
      { id: "condition-1", type: "condition" },
      { id: "email-1", type: "email", data: { subject: "a", body: "b" } },
    ],
    edges: [
      { from: "trigger", to: "condition-1" },
      { from: "condition-1", to: "email-1", branch: "yes" },
    ],
  };
  assertEquals(msgs(c).some((m) => m.includes('saída "não"')), true);
  assertEquals(msgs(c).some((m) => m.includes('saída "sim"')), false);
});

Deno.test("reclama de fluxo sem nenhum envio", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "exit-1", type: "exit" }],
    edges: [{ from: "trigger", to: "exit-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("nenhum envio")), true);
});

Deno.test("reclama de nó solto", () => {
  const c = fluxoValido();
  c.nodes.push({ id: "email-2", type: "email", data: { subject: "a", body: "b" } });
  assertEquals(msgs(c).some((m) => m.includes("está solto")), true);
});

Deno.test("reclama de espera com tempo zero", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "wait-1", type: "wait", data: { hours: 0 } }],
    edges: [{ from: "trigger", to: "wait-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("maior que zero")), true);
});

Deno.test("reclama de entrada que não leva a lugar nenhum", () => {
  const c: Canvas = { nodes: [{ id: "trigger", type: "trigger" }], edges: [] };
  assertEquals(msgs(c).some((m) => m.includes("não leva a lugar nenhum")), true);
});
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/canvas.test.ts`
Esperado: FAIL (`Module not found "./canvas.ts"`).

- [ ] **Passo 3: implementar**

`supabase/functions/_shared/marketing/canvas.ts`:

```ts
// Prontidão do fluxo de campanha: o que impede uma execução honesta.
//
// Espelho de `validateCanvas` em src/features/marketing/canvas.logic.ts. O front usa a dele para
// mostrar o problema na hora; esta é a que vale, porque o motor (run.ts) recusa executar fluxo com
// problema, e tela e IA executam pelo mesmo motor. Os mesmos casos de teste rodam dos dois lados
// (canvas.test.ts aqui, canvas.logic.test.ts lá). Mudou lá, muda aqui.
// Spec: docs/specs/marketing-mcp.md § 3.

import type { Canvas, NodeType } from "./engine.ts";

export type CanvasProblem = { nodeId: string | null; message: string };

const NODE_LABELS: Record<NodeType, string> = {
  trigger: "Entrada",
  email: "E-mail",
  whatsapp: "WhatsApp",
  wait: "Espera",
  condition: "Condição",
  exit: "Fim",
};

function outgoing(canvas: Canvas, from: string, branch?: "yes" | "no") {
  return canvas.edges.find((e) => e.from === from && (branch ? e.branch === branch : !e.branch));
}

export function validateCanvas(canvas: Canvas): CanvasProblem[] {
  const problemas: CanvasProblem[] = [];
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas?.edges) ? canvas.edges : [];
  const c: Canvas = { nodes, edges };
  const gatilho = nodes.find((n) => n.type === "trigger");

  if (!gatilho) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nó de entrada." });
  } else if (!edges.some((e) => e.from === gatilho.id)) {
    problemas.push({
      nodeId: gatilho.id,
      message: "A entrada não leva a lugar nenhum. Ligue o primeiro passo.",
    });
  }

  if (!nodes.some((n) => n.type === "email" || n.type === "whatsapp")) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nenhum envio de e-mail ou WhatsApp." });
  }

  for (const node of nodes) {
    if (node.type === "email") {
      if (!String(node.data?.subject ?? "").trim()) {
        problemas.push({ nodeId: node.id, message: "E-mail sem assunto." });
      }
      if (!String(node.data?.body ?? "").trim()) {
        problemas.push({ nodeId: node.id, message: "E-mail sem corpo." });
      }
    }
    if (node.type === "whatsapp" && !String(node.data?.template ?? "").trim()) {
      problemas.push({
        nodeId: node.id,
        message: "WhatsApp sem template. A Meta recusa envio sem template aprovado.",
      });
    }
    if (node.type === "condition") {
      for (const ramo of ["yes", "no"] as const) {
        if (!outgoing(c, node.id, ramo)) {
          problemas.push({
            nodeId: node.id,
            message: `A condição não tem saída "${ramo === "yes" ? "sim" : "não"}". Quem cair nesse lado para aqui.`,
          });
        }
      }
    }
    if (node.type === "wait") {
      const horas = Number(node.data?.hours ?? 0);
      if (!Number.isFinite(horas) || horas <= 0) {
        problemas.push({ nodeId: node.id, message: "A espera precisa de um tempo maior que zero." });
      }
    }
    if (node.type !== "trigger" && !edges.some((e) => e.to === node.id)) {
      problemas.push({
        nodeId: node.id,
        message: `O passo "${NODE_LABELS[node.type] ?? node.type}" está solto, sem ninguém chegando nele.`,
      });
    }
  }

  return problemas;
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/`
Esperado: `ok | 37 passed` (29 do motor + 8 da prontidão).

- [ ] **Passo 5: anotar a paridade no front e commitar**

Acrescentar ao comentário de `validateCanvas` em `src/features/marketing/canvas.logic.ts`, logo acima da função:

```ts
/**
 * Problemas que impedem uma execução honesta. A tela mostra tudo antes de deixar disparar, porque
 * campanha é irreversível: e-mail com assunto vazio já saiu quando alguém percebe.
 *
 * Espelho no motor: supabase/functions/_shared/marketing/canvas.ts, que é a regra que vale (o motor
 * recusa fluxo com problema). Os mesmos casos de teste rodam dos dois lados; mudou aqui, muda lá.
 */
```

```bash
git checkout deno.lock 2>/dev/null; git add supabase/functions/_shared/marketing supabase/functions/marketing-run src/features/marketing/canvas.logic.ts
git commit -m "refactor(marketing): motor em _shared/marketing e prontidão do fluxo espelhada no servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Núcleo do motor (`runCampaign`) e a Edge como casca fina

**Arquivos:**
- Criar: `supabase/functions/_shared/marketing/run.ts`
- Criar: `supabase/functions/_shared/marketing/run.test.ts`
- Modificar: `supabase/functions/marketing-run/index.ts` (fica só trava + chamada)

**Interfaces:**
- Consome: `nextStep`, `advancesAfterDelivery`, `decideSend`, `renderMergeTags`, `waitUntil`, `DeliveryOutcome`, `Canvas` (engine.ts); `validateCanvas` (canvas.ts); `sendEmail`, `siteUrl` (`../email.ts`); `sendWhatsAppTemplate` (`../whatsapp.ts`); RPC `marketing_audit_write`.
- Produz:
  - `export type Actor = { kind: "hub_admin" | "api_key"; id: string | null; label: string }`
  - `export type RunResult = { enrolled: number; processed: number; sent: number; skipped: number; suppressed: number; failed: number; completed: number; dispatchEnabled: boolean; testRecipient: string | null; capRemaining: number }`
  - `export class RunError extends Error { status: number }`
  - `export async function runCampaign(admin: Db, campaignId: string, opts: { limit?: number; actor: Actor; deps?: Partial<RunDeps> }): Promise<RunResult>`
  - `export function actorJson(actor: Actor): Record<string, unknown>`

- [ ] **Passo 1: escrever o teste (falha)**

`supabase/functions/_shared/marketing/run.test.ts`:

```ts
// O núcleo do motor recusa antes de matricular: campanha inexistente, pausada ou com fluxo que não
// está pronto. O caminho de envio é coberto por engine.test.ts (regras) e pelo pgTAP (matrícula).
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { runCampaign, RunError } from "./run.ts";

const ator = { kind: "api_key" as const, id: "k-1", label: "Claude marketing (MCP)" };

function bancoFalso(campanha: Record<string, unknown> | null) {
  const chamadas: string[] = [];
  const consulta = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "gte", "update", "insert", "order", "limit"]) {
      q[m] = () => q;
    }
    q.maybeSingle = () => Promise.resolve({ data: campanha, error: null });
    q.single = () => Promise.resolve({ data: { id: "m-1" }, error: null });
    return q;
  };
  return {
    chamadas,
    from: (t: string) => {
      chamadas.push(`from:${t}`);
      return consulta();
    },
    rpc: (n: string) => {
      chamadas.push(`rpc:${n}`);
      return Promise.resolve({ data: { enrolled: 0 }, error: null });
    },
  };
}

Deno.test("campanha inexistente devolve 404", async () => {
  const db = bancoFalso(null);
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 404);
});

Deno.test("campanha pausada devolve 409 e não matricula ninguém", async () => {
  const db = bancoFalso({ id: "c-1", status: "paused", canvas: { nodes: [], edges: [] } });
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 409);
  assertEquals(db.chamadas.includes("rpc:marketing_enroll_campaign"), false);
});

Deno.test("fluxo que não está pronto devolve 400 com o problema e não matricula", async () => {
  const db = bancoFalso({
    id: "c-1",
    status: "draft",
    canvas: {
      nodes: [{ id: "trigger", type: "trigger" }, { id: "w", type: "whatsapp", data: {} }],
      edges: [{ from: "trigger", to: "w" }],
    },
  });
  const e = await assertRejects(() => runCampaign(db, "c-1", { actor: ator }), RunError);
  assertEquals(e.status, 400);
  assertEquals(e.message.includes("sem template"), true);
  assertEquals(db.chamadas.includes("rpc:marketing_enroll_campaign"), false);
});
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/run.test.ts`
Esperado: FAIL (`Module not found "./run.ts"`).

- [ ] **Passo 2: implementar `run.ts`**

Mover o corpo de `marketing-run/index.ts` que vem depois da trava (de `const { data: campaign ... }` até o `return json({...})` final) para `runCampaign`, trocando `json(...)` por `throw new RunError(...)` nos erros e por `return {...}` no fim. Código completo:

```ts
// Núcleo do motor de campanha: matricula o público e anda um passo por pessoa.
//
// Usado pela Edge marketing-run (botão da tela) e pelo MCP (tool marketing_run_campaign). Um motor
// só para os dois, então as travas valem igual para tela e IA: prontidão do fluxo, supressão,
// consentimento, endereço, chave geral, teto do dia e destinatário de ensaio.
// Spec: docs/specs/marketing-mcp.md § 6 e marketing-automation.md § 7.

import { sendEmail as sendEmailReal, siteUrl as siteUrlReal } from "../email.ts";
import { sendWhatsAppTemplate as sendWhatsAppReal } from "../whatsapp.ts";
import { validateCanvas } from "./canvas.ts";
import {
  advancesAfterDelivery,
  type Canvas,
  decideSend,
  type DeliveryOutcome,
  nextStep,
  renderMergeTags,
  waitUntil,
} from "./engine.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type Actor = { kind: "hub_admin" | "api_key"; id: string | null; label: string };

export type RunResult = {
  enrolled: number;
  processed: number;
  sent: number;
  skipped: number;
  suppressed: number;
  failed: number;
  completed: number;
  dispatchEnabled: boolean;
  testRecipient: string | null;
  capRemaining: number;
};

export class RunError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RunDeps = {
  sendEmail: typeof sendEmailReal;
  sendWhatsAppTemplate: typeof sendWhatsAppReal;
  siteUrl: typeof siteUrlReal;
};

export function actorJson(actor: Actor): Record<string, unknown> {
  return { kind: actor.kind, id: actor.id, label: actor.label };
}

/** Casca do e-mail de marketing. Simples de propósito: o que precisa existir é o descadastro. */
function wrapEmail(bodyHtml: string, unsubscribeUrl: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#EDEDEF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEDEF;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#4041A3;padding:20px 24px;color:#FFFFFF;font-size:18px;font-weight:600;">Movepark</td></tr>
        <tr><td style="padding:24px;color:#424242;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 24px;background:#F7F7F8;color:#6A6A6A;font-size:12px;line-height:1.5;">
          Você recebeu este e-mail porque tem cadastro na Movepark.
          <a href="${unsubscribeUrl}" style="color:#5D5FEF;">Descadastrar</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function runCampaign(
  admin: Db,
  campaignId: string,
  opts: { limit?: number; actor: Actor; deps?: Partial<RunDeps> },
): Promise<RunResult> {
  const deps: RunDeps = {
    sendEmail: opts.deps?.sendEmail ?? sendEmailReal,
    sendWhatsAppTemplate: opts.deps?.sendWhatsAppTemplate ?? sendWhatsAppReal,
    siteUrl: opts.deps?.siteUrl ?? siteUrlReal,
  };
  const limit = Math.min(Math.max(Number(opts.limit ?? 100) || 100, 1), 500);

  const { data: campaign, error: campErr } = await admin
    .from("marketing_campaign")
    .select("id, name, status, canvas, send_cap")
    .eq("id", campaignId)
    .is("deleted_at", null)
    .maybeSingle();

  if (campErr || !campaign) throw new RunError(404, "Campanha não encontrada.");
  if (campaign.status === "paused" || campaign.status === "archived" || campaign.status === "done") {
    throw new RunError(409, `Campanha ${campaign.status}: nada a executar.`);
  }

  const canvas = (campaign.canvas ?? { nodes: [], edges: [] }) as Canvas;
  const problemas = validateCanvas(canvas);
  if (problemas.length > 0) {
    throw new RunError(
      400,
      `O fluxo tem problema e não roda: ${problemas.map((p) => p.message).join(" ")}`,
    );
  }

  // ── Config de disparo ──────────────────────────────────────────────────────
  const { data: settings } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", [
      "marketing_dispatch_enabled",
      "marketing_daily_send_cap",
      "marketing_test_recipient",
      "marketing_email_from",
      "partner_email_from",
    ]);
  const cfg: Record<string, string> = Object.fromEntries(
    (settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value ?? ""]),
  );
  const dispatchEnabled = String(cfg.marketing_dispatch_enabled).toLowerCase() === "true";
  const testRecipient = (cfg.marketing_test_recipient ?? "").trim();
  const from = (cfg.marketing_email_from || cfg.partner_email_from || "").trim();
  const dailyCap = Number(cfg.marketing_daily_send_cap ?? "200") || 200;

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const { count: sentToday } = await admin
    .from("marketing_message")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", inicioDoDia.toISOString());
  let capRemaining = Math.max(0, dailyCap - (sentToday ?? 0));

  // ── Matrícula ──────────────────────────────────────────────────────────────
  const { data: enrollResult, error: enrollErr } = await admin.rpc("marketing_enroll_campaign", {
    p_campaign_id: campaignId,
  });
  if (enrollErr) throw new RunError(400, enrollErr.message);

  const { data: due, error: dueErr } = await admin.rpc("marketing_due_enrollments", {
    p_campaign_id: campaignId,
    p_limit: limit,
  });
  if (dueErr) throw new RunError(400, dueErr.message);

  await admin
    .from("marketing_campaign")
    .update({
      status: "running",
      started_at: campaign.status === "draft" ? new Date().toISOString() : undefined,
    })
    .eq("id", campaignId);

  // ── Caminhada pelos nós ────────────────────────────────────────────────────
  // (o mesmo laço que a Edge tinha desde a correção de 25/11/2026: nextStep até o próximo envio ou
  // espera; o contato só sai do envio com destino final, advancesAfterDelivery)
  const stats = { processed: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0, completed: 0 };

  const concluir = async (enrollmentId: string) => {
    await admin
      .from("marketing_enrollment")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    stats.completed += 1;
  };

  const esperar = async (enrollmentId: string, node: { id: string; data?: Record<string, unknown> }) => {
    await admin
      .from("marketing_enrollment")
      .update({
        status: "waiting",
        current_node_id: node.id,
        wait_until: waitUntil(node.data, new Date()).toISOString(),
      })
      .eq("id", enrollmentId);
  };

  for (const row of (due ?? []) as Array<Record<string, unknown>>) {
    const enrollmentId = String(row.enrollment_id);
    const contactId = String(row.contact_id);
    const doc = (row.doc ?? {}) as Record<string, unknown>;
    stats.processed += 1;

    const passo = nextStep(canvas, (row.current_node_id as string | null) ?? null, doc);
    if (passo.kind === "end") {
      await concluir(enrollmentId);
      continue;
    }
    if (passo.kind === "wait") {
      await esperar(enrollmentId, passo.node);
      continue;
    }

    const node = passo.node;
    const canal = node.type as "email" | "whatsapp";
    const endereco = canal === "email" ? (row.email as string) : (row.phone as string);
    const decisao = decideSend({
      channel: canal,
      address: endereco,
      consent: canal === "email" ? Boolean(row.email_consent) : Boolean(row.whatsapp_consent),
      suppressed: canal === "email" ? Boolean(row.email_suppressed) : Boolean(row.whatsapp_suppressed),
      dispatchEnabled,
      capRemaining,
    });

    const assunto =
      canal === "email" ? renderMergeTags(String(node.data?.subject ?? "Movepark"), doc) : null;
    const corpo =
      canal === "email"
        ? renderMergeTags(String(node.data?.body ?? ""), doc, { escape: true })
        : renderMergeTags(String(node.data?.preview ?? ""), doc);
    const template = canal === "whatsapp" ? String(node.data?.template ?? "") : null;
    const destinoReal =
      canal === "email" && testRecipient ? testRecipient : String(endereco ?? "");

    const { data: msg } = await admin
      .from("marketing_message")
      .insert({
        campaign_id: campaignId,
        enrollment_id: enrollmentId,
        contact_id: contactId,
        node_id: node.id,
        channel: canal,
        status: decisao.status,
        to_address: destinoReal,
        subject: assunto,
        body: corpo,
        template_name: template,
        error: decisao.reason ?? null,
      })
      .select("id")
      .single();

    let resultado: DeliveryOutcome;
    if (decisao.status === "queued") {
      let ok = false;
      let erro: string | undefined;
      if (canal === "email") {
        const { data: contato } = await admin
          .from("marketing_contact")
          .select("unsubscribe_token")
          .eq("id", contactId)
          .maybeSingle();
        const unsubscribeUrl = `${deps.siteUrl()}/descadastro?t=${contato?.unsubscribe_token ?? ""}`;
        const res = await deps.sendEmail({
          from,
          to: destinoReal,
          subject: assunto ?? "Movepark",
          html: wrapEmail(corpo, unsubscribeUrl),
        });
        ok = res.ok;
        erro = res.error;
      } else {
        const res = await deps.sendWhatsAppTemplate({
          to: destinoReal,
          template: template ?? "",
          bodyParams: Array.isArray(node.data?.params)
            ? (node.data?.params as string[]).map((p) => renderMergeTags(String(p), doc))
            : [],
        });
        ok = res.ok;
        erro = res.error;
      }
      await admin
        .from("marketing_message")
        .update({
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          error: ok ? null : (erro ?? "falha no envio"),
        })
        .eq("id", msg?.id);
      if (ok) {
        stats.sent += 1;
        capRemaining -= 1;
        resultado = "sent";
      } else {
        stats.failed += 1;
        resultado = "failed";
      }
    } else if (decisao.status === "suppressed") {
      stats.suppressed += 1;
      resultado = "suppressed";
    } else {
      stats.skipped += 1;
      resultado = "skipped";
    }

    let falhas = 0;
    if (resultado === "failed") {
      const { count } = await admin
        .from("marketing_message")
        .select("id", { count: "exact", head: true })
        .eq("enrollment_id", enrollmentId)
        .eq("node_id", node.id)
        .eq("status", "failed");
      falhas = count ?? 1;
    }
    if (!advancesAfterDelivery(resultado, falhas)) continue;

    const depois = nextStep(canvas, node.id, doc);
    if (depois.kind === "end") {
      await concluir(enrollmentId);
    } else if (depois.kind === "wait") {
      await esperar(enrollmentId, depois.node);
    } else {
      await admin
        .from("marketing_enrollment")
        .update({ status: "active", current_node_id: node.id, wait_until: null })
        .eq("id", enrollmentId);
    }
  }

  const { count: pendentes } = await admin
    .from("marketing_enrollment")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["active", "waiting"]);

  await admin
    .from("marketing_campaign")
    .update({
      stats: { ...stats, updated_at: new Date().toISOString() },
      ...(pendentes === 0 ? { status: "done", finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", campaignId);

  const result: RunResult = {
    ...stats,
    enrolled: (enrollResult as { enrolled?: number } | null)?.enrolled ?? 0,
    dispatchEnabled,
    testRecipient: testRecipient || null,
    capRemaining,
  };

  // Auditoria da execução. Nunca derruba a resposta: o envio já aconteceu.
  const { error: auditErr } = await admin.rpc("marketing_audit_write", {
    p_actor: actorJson(opts.actor),
    p_action: "campaign.run",
    p_entity: "marketing_campaign",
    p_entity_id: campaignId,
    p_before: null,
    p_after: result,
    p_reason: null,
  });
  if (auditErr) console.warn("[marketing] auditoria da execução falhou:", auditErr.message);

  return result;
}
```

- [ ] **Passo 3: reduzir a Edge à casca**

`supabase/functions/marketing-run/index.ts` inteiro:

```ts
// Edge Function: /marketing-run
//
// Executa uma rodada de uma campanha de marketing pelo botão da tela do Manager. O motor mora em
// _shared/marketing/run.ts e é o mesmo que a tool marketing_run_campaign do MCP usa, então as
// travas valem igual para tela e IA (docs/specs/marketing-mcp.md § 6).
//
// POST /functions/v1/marketing-run   { "campaignId": uuid, "limit"?: number }
// → { enrolled, processed, sent, skipped, suppressed, failed, completed, dispatchEnabled,
//     testRecipient, capRemaining }
//
// Quem pode chamar: hub_admin (JWT do painel). É ferramenta de disparo em massa, então a trava é
// explícita e não depende só de `verify_jwt`.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runCampaign, RunError } from "../_shared/marketing/run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  let campaignId = "";
  let limit = 100;
  try {
    const body = await req.json();
    campaignId = String(body?.campaignId ?? "");
    if (typeof body?.limit === "number") limit = body.limit;
  } catch {
    return json({ error: "payload inválido" }, 400);
  }
  if (!campaignId) return json({ error: "campaignId obrigatório" }, 400);

  try {
    const r = await runCampaign(admin, campaignId, {
      limit,
      actor: { kind: "hub_admin", id: userData.user.id, label: userData.user.email ?? "hub_admin" },
    });
    return json(r);
  } catch (e) {
    if (e instanceof RunError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : "falha ao executar a campanha" }, 500);
  }
});
```

- [ ] **Passo 4: rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/`
Esperado: `ok | 40 passed` (29 + 8 + 3).

- [ ] **Passo 5: commit**

```bash
git checkout deno.lock 2>/dev/null; git add supabase/functions/_shared/marketing/run.ts supabase/functions/_shared/marketing/run.test.ts supabase/functions/marketing-run/index.ts
git commit -m "refactor(marketing): núcleo do motor compartilhado entre a tela e o MCP, com auditoria da execução

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Registro de tools, handlers e o aviso da chave geral

**Arquivos:**
- Criar: `supabase/functions/_shared/marketing/tools.ts`, `tools.test.ts`
- Criar: `supabase/functions/_shared/marketing/handlers.ts`, `handlers.test.ts`
- Modificar: `supabase/functions/_shared/email.ts` (template), `supabase/functions/_shared/email.test.ts`

**Interfaces:**
- Consome: `runCampaign`, `Actor`, `actorJson` (run.ts); `validateCanvas` (canvas.ts); `renderMergeTags`, `Canvas` (engine.ts); as RPCs das Tarefas 1 e 2 e as de painel.
- Produz:
  - `export const MARKETING_TOOLS: MarketingToolDef[]` com `type MarketingToolDef = { name: string; description: string; inputSchema: Record<string, unknown>; scope: "marketing:read" | "marketing:write" | "marketing:dispatch" }`
  - `export const MARKETING_HANDLED: readonly string[]`
  - `export type MarketingDeps = { alertarDisparoLigado: (info: { actorLabel: string; reason: string }) => Promise<void>; run?: typeof runCampaign }`
  - `export async function callMarketing(db: Db, actor: Actor, name: string, a: Record<string, unknown>, deps: MarketingDeps): Promise<unknown>`
  - `export function tplMarketingDispatchEnabled(i: { actorLabel: string; reason: string; quando: string }): { subject: string; html: string }` em `_shared/email.ts`

- [ ] **Passo 1: escrever os testes do registro (falham)**

`supabase/functions/_shared/marketing/tools.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { MARKETING_TOOLS } from "./tools.ts";
import { MARKETING_HANDLED } from "./handlers.ts";

const ESCOPOS = ["marketing:read", "marketing:write", "marketing:dispatch"];

Deno.test("toda tool de marketing tem prefixo, escopo de marketing e schema fechado", () => {
  for (const t of MARKETING_TOOLS) {
    assertEquals(t.name.startsWith("marketing_"), true, t.name);
    assertEquals(ESCOPOS.includes(t.scope), true, t.name);
    assertEquals(t.inputSchema.type, "object", t.name);
    assertEquals(t.inputSchema.additionalProperties, false, t.name);
  }
});

Deno.test("nomes únicos", () => {
  const nomes = MARKETING_TOOLS.map((t) => t.name);
  assertEquals(new Set(nomes).size, nomes.length);
});

Deno.test("só run_campaign e set_dispatch_enabled exigem o escopo de disparo", () => {
  const disparo = MARKETING_TOOLS.filter((t) => t.scope === "marketing:dispatch").map((t) => t.name).sort();
  assertEquals(disparo, ["marketing_run_campaign", "marketing_set_dispatch_enabled"]);
});

Deno.test("toda tool declarada tem handler, e todo handler tem tool", () => {
  assertEquals(
    [...MARKETING_HANDLED].sort(),
    MARKETING_TOOLS.map((t) => t.name).sort(),
  );
});
```

`supabase/functions/_shared/marketing/handlers.test.ts`:

```ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { callMarketing } from "./handlers.ts";

const ator = { kind: "api_key" as const, id: "k-1", label: "Claude marketing (MCP)" };

type Chamada = { fn: string; args: Record<string, unknown> };

function bancoFalso(respostas: Record<string, unknown> = {}) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      chamadas.push({ fn, args });
      return Promise.resolve({ data: fn in respostas ? respostas[fn] : null, error: null });
    },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return q;
    },
  };
}

const semAviso = { alertarDisparoLigado: () => Promise.resolve() };

Deno.test("get_rfm repassa unidades e janela", async () => {
  const db = bancoFalso({ marketing_rfm_overview: { totals: {} } });
  await callMarketing(db, ator, "marketing_get_rfm", { location_ids: ["l-1"], window_days: 180 }, semAviso);
  assertEquals(db.chamadas[0], {
    fn: "marketing_rfm_overview",
    args: { p_location_ids: ["l-1"], p_window_days: 180 },
  });
});

Deno.test("preview_segment com problema não consulta a base", async () => {
  const db = bancoFalso({ marketing_validate_definition: ['campo desconhecido "x"'] });
  const r = await callMarketing(db, ator, "marketing_preview_segment", {
    definition: { match: "all", rules: [{ field: "x", op: "eq", value: 1 }] },
  }, semAviso) as { problems: string[]; preview: unknown };
  assertEquals(r.problems.length, 1);
  assertEquals(r.preview, null);
  assertEquals(db.chamadas.some((c) => c.fn === "marketing_segment_preview"), false);
});

Deno.test("save_segment manda o ator da chave", async () => {
  const db = bancoFalso({ marketing_save_segment: "s-1" });
  const r = await callMarketing(db, ator, "marketing_save_segment", {
    name: "Voltaram", definition: { match: "all", rules: [] },
  }, semAviso);
  assertEquals(r, { segment_id: "s-1" });
  assertEquals(db.chamadas[0].args.p_actor, { kind: "api_key", id: "k-1", label: "Claude marketing (MCP)" });
});

Deno.test("ligar a chave geral avisa a equipe com quem ligou e o motivo", async () => {
  const avisos: Array<{ actorLabel: string; reason: string }> = [];
  const db = bancoFalso({ marketing_set_dispatch_enabled: { changed: true, enabled: true } });
  await callMarketing(db, ator, "marketing_set_dispatch_enabled", { enabled: true, reason: "campanha de dezembro" }, {
    alertarDisparoLigado: (i) => {
      avisos.push(i);
      return Promise.resolve();
    },
  });
  assertEquals(avisos, [{ actorLabel: "Claude marketing (MCP)", reason: "campanha de dezembro" }]);
});

Deno.test("desligar, ou ligar o que já estava ligado, não avisa", async () => {
  let avisos = 0;
  const deps = { alertarDisparoLigado: () => { avisos += 1; return Promise.resolve(); } };
  await callMarketing(bancoFalso({ marketing_set_dispatch_enabled: { changed: true, enabled: false } }),
    ator, "marketing_set_dispatch_enabled", { enabled: false, reason: "fim" }, deps);
  await callMarketing(bancoFalso({ marketing_set_dispatch_enabled: { changed: false, enabled: true } }),
    ator, "marketing_set_dispatch_enabled", { enabled: true, reason: "de novo" }, deps);
  assertEquals(avisos, 0);
});

Deno.test("run_campaign usa o motor com o ator da chave e o limite", async () => {
  const chamadas: Array<{ id: string; limit?: number; label: string }> = [];
  await callMarketing(bancoFalso(), ator, "marketing_run_campaign", { campaign_id: "c-1", limit: 50 }, {
    ...semAviso,
    run: (_db, id, o) => {
      chamadas.push({ id, limit: o.limit, label: o.actor.label });
      return Promise.resolve({} as never);
    },
  });
  assertEquals(chamadas, [{ id: "c-1", limit: 50, label: "Claude marketing (MCP)" }]);
});

Deno.test("list_contacts sem critério explica o que falta", async () => {
  await assertRejects(
    () => callMarketing(bancoFalso(), ator, "marketing_list_contacts", {}, semAviso),
    Error,
    "Informe segment_id, definition ou rfm_segment.",
  );
});

Deno.test("tool desconhecida é recusada", async () => {
  await assertRejects(() => callMarketing(bancoFalso(), ator, "marketing_nao_existe", {}, semAviso));
});
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/tools.test.ts supabase/functions/_shared/marketing/handlers.test.ts`
Esperado: FAIL (módulos inexistentes).

- [ ] **Passo 2: escrever o registro**

`supabase/functions/_shared/marketing/tools.ts`:

```ts
// MCP de marketing: definição das tools (nome, descrição, schema e escopo).
//
// Registro único: o MCP do Manager espalha este array no MANAGER_TOOLS, e o assistente da tela de
// Automação vai consumi-lo por adaptador (como o chat do site faz com _shared/assistant-tools.ts).
// Os handlers ficam em handlers.ts. Spec: docs/specs/marketing-mcp.md § 5.
//
// Atenção ao guarda do CI (scripts/check-openapi-drift.mjs): ele colhe os nomes por `name: "…"`.
// Nenhum outro campo deste arquivo pode ser escrito como `name: "texto"`.

export type MarketingScope = "marketing:read" | "marketing:write" | "marketing:dispatch";

export type MarketingToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scope: MarketingScope;
};

function obj(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
const S = { type: "string" };
const UUID = { type: "string", description: "uuid" };
const INT = { type: "integer" };
const BOOL = { type: "boolean" };
const LOCS = {
  type: "array",
  items: { type: "string" },
  description: "Ids de unidade (location). Vazio ou ausente = todas. Veja marketing_list_locations.",
};
const DEFINICAO = {
  type: "object",
  description:
    'Árvore do segmento: {"match":"all"|"any","rules":[{"field","op","value"} ou outro grupo]}. Campos e operadores em marketing_list_segment_fields.',
};
const FLUXO = {
  type: "object",
  description:
    'Fluxo da campanha: {"nodes":[{"id","type","data"}],"edges":[{"from","to","branch"?}]}. type: trigger, email (data.subject, data.body com {{nome}} etc.), whatsapp (data.template, data.params), wait (data.hours), condition (data.field, data.op, data.value; arestas com branch "yes"/"no"), exit.',
};

export const MARKETING_TOOLS: MarketingToolDef[] = [
  // ── Leitura ────────────────────────────────────────────────────────────────
  {
    name: "marketing_list_locations",
    scope: "marketing:read",
    description: "Unidades (estacionamentos) com id, nome, empresa e destino. Use os ids para recortar análises, segmentos e campanhas.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_rfm",
    scope: "marketing:read",
    description: "Matriz RFM da base de clientes do Hub: células, totais, segmentos e oportunidades. Não inclui cliente do white-label.",
    inputSchema: obj({ location_ids: LOCS, window_days: { ...INT, description: "Janela em dias. Padrão: a configurada (365)." } }),
  },
  {
    name: "marketing_get_funnel",
    scope: "marketing:read",
    description: "Funil de conversão do período: reservas criadas, pagas, check-in e concluídas, com perdas (expiradas, canceladas) e cliques de saída para o site do parceiro.",
    inputSchema: obj(
      { from: { type: "string", format: "date-time" }, to: { type: "string", format: "date-time" }, location_ids: LOCS },
      ["from", "to"],
    ),
  },
  {
    name: "marketing_get_discoveries",
    scope: "marketing:read",
    description: "Descobertas da base (mudanças de comportamento), cada uma com estado achado, estavel ou sem_dados.",
    inputSchema: obj({ location_ids: LOCS, window_days: INT }),
  },
  {
    name: "marketing_get_profiles",
    scope: "marketing:read",
    description: "Matriz de perfis de cliente por estacionamento (coortes).",
    inputSchema: obj({ location_ids: LOCS }),
  },
  {
    name: "marketing_list_segment_fields",
    scope: "marketing:read",
    description: "Catálogo de campos para montar segmento: chave, tipo, rótulo, opções e os operadores que cada tipo aceita. Leia antes de montar ou editar um segmento.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_preview_segment",
    scope: "marketing:read",
    description: "Valida uma definição de segmento e, se estiver certa, conta quem casa, quem dá para alcançar por e-mail e por WhatsApp, e devolve uma amostra.",
    inputSchema: obj({ definition: DEFINICAO, location_ids: LOCS, limit: INT }, ["definition"]),
  },
  {
    name: "marketing_list_segments",
    scope: "marketing:read",
    description: "Segmentos salvos, automáticos (RFM) e manuais, com quantos casam e quantos dá para alcançar.",
    inputSchema: obj({ location_ids: LOCS }),
  },
  {
    name: "marketing_list_contacts",
    scope: "marketing:read",
    description: "Contatos com nome, e-mail, telefone e comportamento, a partir de um segmento salvo, de uma definição ou de um segmento RFM.",
    inputSchema: obj({
      segment_id: UUID,
      definition: DEFINICAO,
      rfm_segment: { type: "string", description: "Ex.: campeoes, em_risco, perdidos_vip. Veja marketing_list_segment_fields." },
      location_ids: LOCS,
      limit: INT,
    }),
  },
  {
    name: "marketing_get_contact",
    scope: "marketing:read",
    description: "Um contato pelo e-mail, telefone ou contact_key: documento completo, RFM, reservas, cartões de lead e mensagens recebidas.",
    inputSchema: obj({ email: S, phone: S, contact_key: S }),
  },
  {
    name: "marketing_list_campaigns",
    scope: "marketing:read",
    description: "Campanhas com status, público, teto e estatística da última execução.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_campaign",
    scope: "marketing:read",
    description: "Uma campanha: fluxo, segmento, matrículas por status, problemas que impedem executar e as últimas mensagens.",
    inputSchema: obj({ campaign_id: UUID }, ["campaign_id"]),
  },
  {
    name: "marketing_render_message",
    scope: "marketing:read",
    description: "Monta o e-mail ou WhatsApp de um nó da campanha para um contato, com as marcações preenchidas, sem enviar nada.",
    inputSchema: obj({ campaign_id: UUID, node_id: S, contact_key: S }, ["campaign_id", "node_id"]),
  },
  {
    name: "marketing_list_leads",
    scope: "marketing:read",
    description: "Cartões do quadro de leads do consumidor, com etapa, reserva e comportamento. Filtra por etapa (stage_key), unidade e busca.",
    inputSchema: obj({
      stage_key: { type: "string", description: "descoberta, interesse, reserva_iniciada, cliente ou perdido" },
      location_ids: LOCS,
      search: S,
    }),
  },
  {
    name: "marketing_list_coupons",
    scope: "marketing:read",
    description: "Cupons da Movepark (de plataforma), com regras e uso.",
    inputSchema: obj({}),
  },
  {
    name: "marketing_get_dispatch_config",
    scope: "marketing:read",
    description: "Configuração do disparo: chave geral, teto diário, enviados hoje, destinatário de ensaio e remetente.",
    inputSchema: obj({}),
  },
  // ── Gravação ───────────────────────────────────────────────────────────────
  {
    name: "marketing_save_segment",
    scope: "marketing:write",
    description: "Cria (sem segment_id) ou edita um segmento. A definição é validada no servidor; segmento automático do RFM não muda.",
    inputSchema: obj(
      { segment_id: UUID, name: S, definition: DEFINICAO, description: S, location_ids: LOCS },
      ["name", "definition"],
    ),
  },
  {
    name: "marketing_delete_segment",
    scope: "marketing:write",
    description: "Exclui um segmento (soft delete). Recusa segmento automático e segmento de campanha em andamento.",
    inputSchema: obj({ segment_id: UUID }, ["segment_id"]),
  },
  {
    name: "marketing_save_campaign",
    scope: "marketing:write",
    description: "Cria (sem campaign_id) ou edita uma campanha. Nasce rascunho. Devolve os problemas que ainda impedem executar.",
    inputSchema: obj(
      { campaign_id: UUID, name: S, segment_id: UUID, location_ids: LOCS, canvas: FLUXO, send_cap: { ...INT, description: "Teto de público, de 1 a 10000. Padrão 100." } },
      ["name"],
    ),
  },
  {
    name: "marketing_set_campaign_status",
    scope: "marketing:write",
    description: "Pausa, volta a rascunho ou arquiva uma campanha. running e done são do motor.",
    inputSchema: obj(
      { campaign_id: UUID, status: { type: "string", enum: ["draft", "paused", "archived"] } },
      ["campaign_id", "status"],
    ),
  },
  {
    name: "marketing_move_lead",
    scope: "marketing:write",
    description: "Move um cartão de lead para outra etapa (stage_key). O cartão deixa de seguir o checkout sozinho, como quando se arrasta na tela.",
    inputSchema: obj({ lead_id: UUID, stage_key: S }, ["lead_id", "stage_key"]),
  },
  {
    name: "marketing_save_coupon",
    scope: "marketing:write",
    description: "Cria (sem coupon_id) ou edita um cupom da Movepark. O desconto sai da comissão da Movepark. Percentual exige max_discount_amount; audience winback exige audience_inactive_days.",
    inputSchema: obj(
      {
        coupon_id: UUID,
        code: S,
        title: S,
        description: S,
        terms: S,
        discount_type: { type: "string", enum: ["percent", "fixed"] },
        discount_value: { type: "number" },
        max_discount_amount: { type: "number" },
        audience: {
          type: "string",
          enum: ["code_only", "public", "first_purchase", "second_purchase", "winback"],
          description: "Quem pode usar. Padrão code_only (só quem tem o código).",
        },
        audience_inactive_days: INT,
        valid_from: { type: "string", format: "date-time" },
        valid_until: { type: "string", format: "date-time" },
        max_uses: INT,
        per_user_limit: INT,
        min_amount: { type: "number" },
        min_days: INT,
        is_active: BOOL,
        is_advertised: BOOL,
        sort_order: INT,
      },
    ),
  },
  {
    name: "marketing_set_coupon_active",
    scope: "marketing:write",
    description: "Pausa (active=false) ou reativa um cupom da Movepark.",
    inputSchema: obj({ coupon_id: UUID, active: BOOL }, ["coupon_id", "active"]),
  },
  {
    name: "marketing_set_dispatch_config",
    scope: "marketing:write",
    description: "Troca o destinatário de ensaio (todo e-mail vai para ele em vez do cliente; vazio desliga) e o teto diário de envios. O remetente não muda por aqui.",
    inputSchema: obj({ test_recipient: S, daily_cap: INT }),
  },
  // ── Disparo ────────────────────────────────────────────────────────────────
  {
    name: "marketing_run_campaign",
    scope: "marketing:dispatch",
    description: "Executa uma rodada da campanha (até limit pessoas, padrão 100). Com a chave geral desligada, monta e grava as mensagens como seguradas sem enviar. Recusa fluxo com problema.",
    inputSchema: obj({ campaign_id: UUID, limit: INT }, ["campaign_id"]),
  },
  {
    name: "marketing_set_dispatch_enabled",
    scope: "marketing:dispatch",
    description: "Liga ou desliga a chave geral do disparo real de todas as campanhas. Exige motivo. Ligar avisa a equipe por e-mail.",
    inputSchema: obj({ enabled: BOOL, reason: S }, ["enabled", "reason"]),
  },
];
```

- [ ] **Passo 3: escrever os handlers**

`supabase/functions/_shared/marketing/handlers.ts`:

```ts
// MCP de marketing: execução das tools. Recebe o cliente do banco (service_role) e quem está agindo.
//
// O banco é a regra (RPCs das migrations 20261207110000 e 20261207120000). Aqui só se traduz
// argumento em chamada e se junta o que a IA precisa numa resposta. Erro de negócio das RPCs vem em
// P0001 e chega à IA com a mensagem (safeToolError no MCP). Spec: docs/specs/marketing-mcp.md § 5.

import { validateCanvas } from "./canvas.ts";
import { type Canvas, renderMergeTags } from "./engine.ts";
import { type Actor, actorJson, runCampaign } from "./run.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type MarketingDeps = {
  alertarDisparoLigado: (info: { actorLabel: string; reason: string }) => Promise<void>;
  run?: typeof runCampaign;
};

export const MARKETING_HANDLED = [
  "marketing_list_locations", "marketing_get_rfm", "marketing_get_funnel", "marketing_get_discoveries",
  "marketing_get_profiles", "marketing_list_segment_fields", "marketing_preview_segment",
  "marketing_list_segments", "marketing_list_contacts", "marketing_get_contact",
  "marketing_list_campaigns", "marketing_get_campaign", "marketing_render_message",
  "marketing_list_leads", "marketing_list_coupons", "marketing_get_dispatch_config",
  "marketing_save_segment", "marketing_delete_segment", "marketing_save_campaign",
  "marketing_set_campaign_status", "marketing_move_lead", "marketing_save_coupon",
  "marketing_set_coupon_active", "marketing_set_dispatch_config", "marketing_run_campaign",
  "marketing_set_dispatch_enabled",
] as const;

async function rpc(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function rows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 ? v.map(String) : null;
const num = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);
const txt = (v: unknown): string | null =>
  v === undefined || v === null ? null : String(v);

function contactKeyFrom(a: Record<string, unknown>): string {
  if (a.contact_key) return String(a.contact_key);
  if (a.email) return String(a.email).trim().toLowerCase();
  if (a.phone) return String(a.phone).replace(/\D/g, "");
  throw new Error("Informe email, phone ou contact_key.");
}

async function audit(
  db: Db, actor: Actor, action: string, entity: string, entityId: string | null,
  before: unknown, after: unknown,
) {
  await rpc(db, "marketing_audit_write", {
    p_actor: actorJson(actor), p_action: action, p_entity: entity, p_entity_id: entityId,
    p_before: before ?? null, p_after: after ?? null, p_reason: null,
  });
}

export async function callMarketing(
  db: Db,
  actor: Actor,
  name: string,
  a: Record<string, unknown>,
  deps: MarketingDeps,
): Promise<unknown> {
  const run = deps.run ?? runCampaign;
  const ator = actorJson(actor);

  switch (name) {
    // ── Leitura ──────────────────────────────────────────────────────────────
    case "marketing_list_locations":
      return { unidades: await rows(
        db.from("location")
          .select("id, name, slug, checkout_mode, is_listed, destination_id, company:company_id(name, slug)")
          .is("deleted_at", null)
          .order("name"),
      ) };

    case "marketing_get_rfm":
      return await rpc(db, "marketing_rfm_overview", {
        p_location_ids: ids(a.location_ids), p_window_days: num(a.window_days),
      });

    case "marketing_get_funnel":
      return await rpc(db, "marketing_conversion_funnel", {
        p_from: String(a.from), p_to: String(a.to), p_location_ids: ids(a.location_ids),
      });

    case "marketing_get_discoveries":
      return await rpc(db, "marketing_discoveries", {
        p_location_ids: ids(a.location_ids), p_window_days: num(a.window_days) ?? 90,
      });

    case "marketing_get_profiles":
      return await rpc(db, "marketing_profile_matrix", { p_location_ids: ids(a.location_ids) });

    case "marketing_list_segment_fields":
      return { campos: await rpc(db, "marketing_segment_fields") };

    case "marketing_preview_segment": {
      const problems = (await rpc(db, "marketing_validate_definition", { p_def: a.definition })) as string[] ?? [];
      if (problems.length > 0) return { problems, preview: null };
      const preview = await rpc(db, "marketing_segment_preview", {
        p_definition: a.definition, p_location_ids: ids(a.location_ids), p_limit: num(a.limit) ?? 25,
      });
      return { problems: [], preview };
    }

    case "marketing_list_segments": {
      const segmentos = (await rows(
        db.from("marketing_segment")
          .select("id, name, slug, description, definition, location_ids, is_system, updated_at")
          .is("deleted_at", null)
          .order("name"),
      )) as Array<Record<string, unknown>> ?? [];
      const contagens = (await rpc(db, "marketing_segment_counts", {
        p_location_ids: ids(a.location_ids),
      })) as Array<Record<string, unknown>> ?? [];
      const porId = new Map(contagens.map((c) => [c.segment_id, c]));
      return {
        segmentos: segmentos.map((s) => ({
          ...s,
          total: porId.get(s.id)?.total ?? 0,
          reachable_email: porId.get(s.id)?.reachable_email ?? 0,
          reachable_whatsapp: porId.get(s.id)?.reachable_whatsapp ?? 0,
        })),
      };
    }

    case "marketing_list_contacts": {
      const limite = num(a.limit) ?? 100;
      if (a.rfm_segment) {
        return await rpc(db, "marketing_rfm_contacts", {
          p_segment: String(a.rfm_segment), p_location_ids: ids(a.location_ids), p_limit: limite,
        });
      }
      let definicao = a.definition;
      if (!definicao && a.segment_id) {
        const { data, error } = await db.from("marketing_segment")
          .select("definition").eq("id", String(a.segment_id)).is("deleted_at", null).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Segmento não encontrado.");
        definicao = data.definition;
      }
      if (!definicao) throw new Error("Informe segment_id, definition ou rfm_segment.");
      return { contatos: await rpc(db, "marketing_segment_contacts", {
        p_definition: definicao, p_location_ids: ids(a.location_ids), p_limit: limite,
      }) };
    }

    case "marketing_get_contact": {
      const chave = contactKeyFrom(a);
      const { data: contato, error } = await db.from("marketing_contact")
        .select("*").eq("contact_key", chave).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!contato) throw new Error("Contato não encontrado na base de marketing.");
      const { data: doc } = await db.rpc("marketing_contact_doc", { p_location_ids: null })
        .eq("contact_key", chave).maybeSingle();
      const { data: rfm } = await db.rpc("marketing_contact_rfm", { p_location_ids: null, p_window_days: null })
        .eq("contact_key", chave).maybeSingle();
      const reservas = await rows(
        db.from("marketing_booking_fact")
          .select("booking_id, status, is_purchase, created_at, check_in_at, check_out_at, total_amount, location_id, utm_source, origin")
          .eq("contact_key", chave).order("created_at", { ascending: false }).limit(20),
      );
      const leads = await rows(
        db.from("marketing_lead")
          .select("id, title, stage_id, booking_id, auto_synced, created_at, stage:stage_id(name, stage_key)")
          .eq("contact_id", contato.id).is("deleted_at", null),
      );
      const mensagens = await rows(
        db.from("marketing_message")
          .select("id, campaign_id, channel, status, subject, error, sent_at, created_at")
          .eq("contact_id", contato.id).order("created_at", { ascending: false }).limit(20),
      );
      return { contato, documento: doc?.doc ?? null, rfm, reservas, leads, mensagens };
    }

    case "marketing_list_campaigns":
      return { campanhas: await rows(
        db.from("marketing_campaign")
          .select("id, name, slug, status, segment_id, location_ids, send_cap, stats, started_at, finished_at, updated_at")
          .is("deleted_at", null).order("updated_at", { ascending: false }),
      ) };

    case "marketing_get_campaign": {
      const { data: camp, error } = await db.from("marketing_campaign")
        .select("*, segment:segment_id(id, name, definition)")
        .eq("id", String(a.campaign_id)).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!camp) throw new Error("Campanha não encontrada.");
      const matriculas = (await rows(
        db.from("marketing_enrollment").select("status").eq("campaign_id", camp.id).limit(10000),
      )) as Array<{ status: string }> ?? [];
      const porStatus: Record<string, number> = {};
      for (const m of matriculas) porStatus[m.status] = (porStatus[m.status] ?? 0) + 1;
      const mensagens = await rows(
        db.from("marketing_message")
          .select("id, channel, status, to_address, subject, error, sent_at, created_at")
          .eq("campaign_id", camp.id).order("created_at", { ascending: false }).limit(20),
      );
      return {
        campanha: camp,
        matriculas: porStatus,
        problemas: validateCanvas(camp.canvas as Canvas).map((p) => p.message),
        mensagens,
      };
    }

    case "marketing_render_message": {
      const { data: camp, error } = await db.from("marketing_campaign")
        .select("id, canvas, segment:segment_id(definition)")
        .eq("id", String(a.campaign_id)).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!camp) throw new Error("Campanha não encontrada.");
      const canvas = (camp.canvas ?? { nodes: [], edges: [] }) as Canvas;
      const node = canvas.nodes.find((n) => n.id === String(a.node_id));
      if (!node || (node.type !== "email" && node.type !== "whatsapp")) {
        throw new Error("Nó de envio (email ou whatsapp) não encontrado nesta campanha.");
      }
      let chave = a.contact_key ? String(a.contact_key) : null;
      if (!chave && camp.segment?.definition) {
        const amostra = (await rpc(db, "marketing_segment_contacts", {
          p_definition: camp.segment.definition, p_location_ids: null, p_limit: 1,
        })) as Array<{ contact_key: string }> ?? [];
        chave = amostra[0]?.contact_key ?? null;
      }
      let doc: Record<string, unknown> = {};
      if (chave) {
        const { data } = await db.rpc("marketing_contact_doc", { p_location_ids: null })
          .eq("contact_key", chave).maybeSingle();
        doc = (data?.doc ?? {}) as Record<string, unknown>;
      }
      if (node.type === "email") {
        return {
          channel: "email",
          contact_key: chave,
          subject: renderMergeTags(String(node.data?.subject ?? ""), doc),
          body: renderMergeTags(String(node.data?.body ?? ""), doc, { escape: true }),
        };
      }
      return {
        channel: "whatsapp",
        contact_key: chave,
        template: String(node.data?.template ?? ""),
        params: Array.isArray(node.data?.params)
          ? (node.data?.params as string[]).map((p) => renderMergeTags(String(p), doc))
          : [],
      };
    }

    case "marketing_list_leads": {
      const cartoes = (await rpc(db, "marketing_leads", {
        p_pipeline_id: null, p_location_ids: ids(a.location_ids), p_search: txt(a.search),
      })) as Array<Record<string, unknown>> ?? [];
      if (!a.stage_key) return { leads: cartoes.slice(0, 200) };
      const etapas = (await rows(
        db.from("marketing_pipeline_stage").select("id").eq("stage_key", String(a.stage_key)),
      )) as Array<{ id: string }> ?? [];
      const alvo = new Set(etapas.map((e) => e.id));
      return { leads: cartoes.filter((c) => alvo.has(String(c.stage_id))).slice(0, 200) };
    }

    case "marketing_list_coupons":
      return { cupons: await rpc(db, "manager_list_platform_coupons") };

    case "marketing_get_dispatch_config":
      return await rpc(db, "marketing_dispatch_config");

    // ── Gravação ─────────────────────────────────────────────────────────────
    case "marketing_save_segment":
      return { segment_id: await rpc(db, "marketing_save_segment", {
        p_segment_id: txt(a.segment_id), p_name: String(a.name ?? ""), p_definition: a.definition,
        p_description: txt(a.description), p_location_ids: ids(a.location_ids), p_actor: ator,
      }) };

    case "marketing_delete_segment":
      await rpc(db, "marketing_delete_segment", { p_segment_id: String(a.segment_id), p_actor: ator });
      return { ok: true };

    case "marketing_save_campaign": {
      const id = (await rpc(db, "marketing_save_campaign", {
        p_campaign_id: txt(a.campaign_id), p_name: String(a.name ?? ""), p_segment_id: txt(a.segment_id),
        p_location_ids: ids(a.location_ids), p_canvas: a.canvas ?? null, p_send_cap: num(a.send_cap),
        p_actor: ator,
      })) as string;
      const { data: camp } = await db.from("marketing_campaign").select("canvas").eq("id", id).maybeSingle();
      const problemas = validateCanvas((camp?.canvas ?? { nodes: [], edges: [] }) as Canvas).map((p) => p.message);
      return { campaign_id: id, ready: problemas.length === 0, problems: problemas };
    }

    case "marketing_set_campaign_status":
      await rpc(db, "marketing_set_campaign_status", {
        p_campaign_id: String(a.campaign_id), p_status: String(a.status), p_actor: ator,
      });
      return { ok: true };

    case "marketing_move_lead": {
      const { data: lead, error } = await db.from("marketing_lead")
        .select("id, pipeline_id, stage_id").eq("id", String(a.lead_id)).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!lead) throw new Error("Lead não encontrado.");
      const { data: etapa } = await db.from("marketing_pipeline_stage")
        .select("id").eq("pipeline_id", lead.pipeline_id).eq("stage_key", String(a.stage_key)).maybeSingle();
      if (!etapa) throw new Error("Etapa não encontrada. Use descoberta, interesse, reserva_iniciada, cliente ou perdido.");
      await rpc(db, "marketing_move_lead", { p_lead_id: lead.id, p_stage_id: etapa.id, p_sort_order: 0 });
      await audit(db, actor, "lead.move", "marketing_lead", lead.id,
        { stage_id: lead.stage_id }, { stage_id: etapa.id });
      return { ok: true };
    }

    case "marketing_save_coupon": {
      let atual: Record<string, unknown> = {};
      if (a.coupon_id) {
        const { data, error } = await db.from("coupon").select("*")
          .eq("id", String(a.coupon_id)).is("company_id", null).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Cupom da Movepark não encontrado.");
        atual = data;
      }
      const v = (k: string) => (k in a ? a[k] : atual[k]) ?? null;
      const id = await rpc(db, "manager_upsert_platform_coupon", {
        p_id: txt(a.coupon_id), p_code: v("code"), p_title: v("title"), p_description: v("description"),
        p_terms: v("terms"), p_discount_type: v("discount_type"), p_discount_value: v("discount_value"),
        p_max_discount_amount: v("max_discount_amount"), p_audience: v("audience") ?? "code_only",
        p_audience_inactive_days: v("audience_inactive_days"), p_valid_from: v("valid_from"),
        p_valid_until: v("valid_until"), p_max_uses: v("max_uses"), p_per_user_limit: v("per_user_limit"),
        p_min_amount: v("min_amount"), p_min_days: v("min_days"), p_is_active: v("is_active") ?? false,
        p_is_advertised: v("is_advertised") ?? false, p_sort_order: v("sort_order") ?? 0,
      });
      const { data: depois } = await db.from("coupon").select("*").eq("id", id).maybeSingle();
      await audit(db, actor, a.coupon_id ? "coupon.update" : "coupon.create", "coupon", String(id),
        a.coupon_id ? atual : null, depois);
      return { coupon_id: id };
    }

    case "marketing_set_coupon_active": {
      await rpc(db, "manager_set_platform_coupon_active", {
        p_coupon_id: String(a.coupon_id), p_is_active: a.active === true,
      });
      await audit(db, actor, "coupon.active", "coupon", String(a.coupon_id), null, { is_active: a.active === true });
      return { ok: true };
    }

    case "marketing_set_dispatch_config":
      return await rpc(db, "marketing_set_dispatch_config", {
        p_test_recipient: txt(a.test_recipient), p_daily_cap: num(a.daily_cap), p_email_from: null,
        p_actor: ator,
      });

    // ── Disparo ──────────────────────────────────────────────────────────────
    case "marketing_run_campaign":
      return await run(db, String(a.campaign_id), { limit: num(a.limit) ?? undefined, actor });

    case "marketing_set_dispatch_enabled": {
      const r = (await rpc(db, "marketing_set_dispatch_enabled", {
        p_enabled: a.enabled === true, p_reason: String(a.reason ?? ""), p_actor: ator,
      })) as { changed: boolean; enabled: boolean };
      if (r?.enabled && r.changed) {
        await deps.alertarDisparoLigado({ actorLabel: actor.label, reason: String(a.reason ?? "") });
      }
      return r;
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
```

- [ ] **Passo 4: template do aviso (ADR-007), revisado pela skill `revisar-texto`**

Acrescentar ao fim de `supabase/functions/_shared/email.ts`:

```ts
/**
 * Aviso para a equipe quando a chave geral do disparo de marketing é ligada fora da tela (pelo MCP
 * ou pelo assistente). Com ela ligada, campanha executada manda e-mail e WhatsApp para cliente
 * real. Spec: docs/specs/marketing-mcp.md § 6.
 */
export function tplMarketingDispatchEnabled(i: {
  actorLabel: string;
  reason: string;
  quando: string;
}): { subject: string; html: string } {
  return {
    subject: "Disparo de marketing ligado pelo MCP",
    html: shell("O disparo de campanhas foi ligado", `
      <p style="margin:0 0 14px">A chave geral do disparo de campanhas foi ligada por <strong>${escapeHtml(i.actorLabel)}</strong> em ${escapeHtml(i.quando)}.</p>
      <p style="margin:0 0 14px">Motivo informado: ${escapeHtml(i.reason)}</p>
      <p style="margin:0 0 22px">Com ela ligada, toda campanha executada manda e-mail e WhatsApp para clientes reais.</p>
      <p style="margin:0 0 22px;text-align:center">${button(`${siteUrl()}/manager/marketing/campanhas`, "Ver o disparo")}</p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">Para desligar, use o painel Disparo real em Automação › Campanhas.</p>`),
  };
}
```

E em `supabase/functions/_shared/email.test.ts`:

```ts
Deno.test("tplMarketingDispatchEnabled: diz quem ligou, o motivo e escapa o texto", () => {
  const m = tplMarketingDispatchEnabled({
    actorLabel: "Claude <marketing>", reason: "campanha & cupom", quando: "25/11/2026 10:00",
  });
  assertEquals(m.subject, "Disparo de marketing ligado pelo MCP");
  assertEquals(m.html.includes("Claude &lt;marketing&gt;"), true);
  assertEquals(m.html.includes("campanha &amp; cupom"), true);
  assertEquals(m.html.includes("/manager/marketing/campanhas"), true);
});
```

(incluir `tplMarketingDispatchEnabled` no `import` do topo do `email.test.ts`).

- [ ] **Passo 5: rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/ supabase/functions/_shared/email.test.ts`
Esperado: tudo `ok` (40 da Tarefa 4 + 4 do registro + 8 dos handlers + os de e-mail).

- [ ] **Passo 6: commit**

```bash
git checkout deno.lock 2>/dev/null; git add supabase/functions/_shared/marketing supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts
git commit -m "feat(marketing): registro e handlers das tools de marketing, com aviso quando a IA liga o disparo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: As tools no MCP do Manager e o guarda do CI

**Arquivos:**
- Modificar: `supabase/functions/mcp/tools.ts` (`MANAGER_TOOLS`)
- Modificar: `supabase/functions/mcp/index.ts` (`callManager`, `depsDeProducao`)
- Modificar: `supabase/functions/mcp/dispatcher.test.ts`, `supabase/functions/mcp/mcp.test.ts`
- Modificar: `scripts/check-openapi-drift.mjs`

**Interfaces:**
- Consome: `MARKETING_TOOLS` (tools.ts), `callMarketing`, `MarketingDeps` (handlers.ts), `tplMarketingDispatchEnabled`, `getEmailConfig`, `sendEmail` (email.ts).
- Produz: `callManager(admin, name, a, apiKeyId)` despachando `marketing_*`.

- [ ] **Passo 1: testes do dispatcher (falham)**

Em `supabase/functions/mcp/dispatcher.test.ts`, junto das outras constantes:

```ts
const CHAVE_MKT_EDICAO = "mp_live_mkt_edicao_abcdefgh";
const CHAVE_MKT_DISPARO = "mp_live_mkt_disparo_abcdefg";
```

E dentro do `switch` de `verificar` em `ambiente()`:

```ts
        case CHAVE_MKT_EDICAO:
          return Promise.resolve({
            ok: true, api_key_id: "k-mkt-edicao", company_id: null,
            scopes: ["marketing:read", "marketing:write"], environment: "live",
          });
        case CHAVE_MKT_DISPARO:
          return Promise.resolve({
            ok: true, api_key_id: "k-mkt-disparo", company_id: null,
            scopes: ["marketing:read", "marketing:write", "marketing:dispatch"], environment: "live",
          });
```

Testes novos no fim do arquivo:

```ts
// ── Marketing no /manager ──────────────────────────────────────────────────
// O disparo é escopo à parte: chave de edição não chega a executar campanha nem a ligar a chave
// geral, nem sabendo o nome da tool. Spec: docs/specs/marketing-mcp.md § 4.

Deno.test("marketing: chave sem escopo de marketing não lista tool de marketing", async () => {
  const { deps } = ambiente();
  const r = await handle(pedido("/manager", listar, { Authorization: `Bearer ${CHAVE_PLATAFORMA}` }), deps);
  const b = await corpo(r) as unknown as { result: { tools: Array<{ name: string }> } };
  assertEquals(b.result.tools.some((t) => t.name.startsWith("marketing_")), false);
});

Deno.test("marketing: chave de edição lista gravação mas não disparo", async () => {
  const { deps } = ambiente();
  const r = await handle(pedido("/manager", listar, { Authorization: `Bearer ${CHAVE_MKT_EDICAO}` }), deps);
  const b = await corpo(r) as unknown as { result: { tools: Array<{ name: string }> } };
  const nomes = b.result.tools.map((t) => t.name);
  assertEquals(nomes.includes("marketing_save_segment"), true);
  assertEquals(nomes.includes("marketing_run_campaign"), false);
  assertEquals(nomes.includes("marketing_set_dispatch_enabled"), false);
});

Deno.test("marketing: chave de edição não executa campanha sabendo o nome", async () => {
  const { deps, chamadas } = ambiente();
  const r = await handle(
    pedido("/manager", chamar("marketing_run_campaign", { campaign_id: "c-1" }),
      { Authorization: `Bearer ${CHAVE_MKT_EDICAO}` }),
    deps,
  );
  const b = await corpo(r) as unknown as { error?: { message: string } };
  assertEquals(b.error?.message.includes("Tool indisponível"), true);
  assertEquals(chamadas, []);
});

Deno.test("marketing: chave com disparo executa e o handler recebe o id da chave", async () => {
  const { deps, chamadas, agentes } = ambiente();
  await handle(
    pedido("/manager", chamar("marketing_run_campaign", { campaign_id: "c-1" }),
      { Authorization: `Bearer ${CHAVE_MKT_DISPARO}` }),
    deps,
  );
  assertEquals(chamadas[0].endpoint, "manager");
  assertEquals(chamadas[0].nome, "marketing_run_campaign");
  assertEquals(agentes[0].apiKeyId, "k-mkt-disparo");
});
```

Em `supabase/functions/mcp/mcp.test.ts`, um teste de registro:

```ts
Deno.test("MANAGER_TOOLS inclui todas as tools de marketing, cada uma com escopo de marketing", () => {
  const nomes = new Set(MANAGER_TOOLS.map((t) => t.name));
  for (const t of MARKETING_TOOLS) {
    assertEquals(nomes.has(t.name), true, t.name);
    assertEquals(t.scope?.startsWith("marketing:"), true, t.name);
  }
});

Deno.test("nome de tool de marketing não colide com nenhum outro registro", () => {
  // Numa URL só, quem escolhe o handler é o perfil; um nome repetido entre registros é o risco que
  // a seção "Colisão de nome entre registros" do mcp.md descreve.
  const outros = new Set([...PUBLIC_TOOLS, ...PARTNER_TOOLS, ...CUSTOMER_TOOLS].map((t) => t.name));
  const manager = MANAGER_TOOLS.map((t) => t.name);
  assertEquals(new Set(manager).size, manager.length);
  for (const t of MARKETING_TOOLS) assertEquals(outros.has(t.name), false, t.name);
});
```

(importar `MARKETING_TOOLS` de `"../_shared/marketing/tools.ts"` no topo do `mcp.test.ts`).

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/mcp/`
Esperado: FAIL nos testes novos (as tools ainda não estão no `MANAGER_TOOLS`).

- [ ] **Passo 2: espalhar no registro**

Em `supabase/functions/mcp/tools.ts`, no topo:

```ts
import { MARKETING_TOOLS } from "../_shared/marketing/tools.ts";
```

E como último item do array `MANAGER_TOOLS` (depois de `delete_blog_post`):

```ts
  // Automação de marketing inteira (segmento, campanha, cupom, leads e disparo), em três escopos de
  // plataforma. Registro único em _shared/marketing. Spec: docs/specs/marketing-mcp.md.
  ...MARKETING_TOOLS,
```

- [ ] **Passo 3: despachar no index**

Em `supabase/functions/mcp/index.ts`, nos imports:

```ts
import { callMarketing } from "../_shared/marketing/handlers.ts";
import { getEmailConfig, sendEmail, tplMarketingDispatchEnabled } from "../_shared/email.ts";
```

(se `email.ts` já é importado no arquivo, acrescentar os nomes ao import existente em vez de duplicar).

Logo antes de `async function callManager`:

```ts
/** Quem está agindo pelo MCP: a chave de plataforma, pelo nome que ela tem no Manager. */
// deno-lint-ignore no-explicit-any
async function atorDaChave(admin: any, apiKeyId: string | null) {
  let nome = "chave sem nome";
  if (apiKeyId) {
    const { data } = await admin.from("api_key").select("name").eq("id", apiKeyId).maybeSingle();
    if (data?.name) nome = String(data.name);
  }
  return { kind: "api_key" as const, id: apiKeyId, label: `${nome} (MCP)` };
}

/** Avisa a equipe que a chave geral do disparo foi ligada fora da tela. Nunca lança. */
// deno-lint-ignore no-explicit-any
async function alertarDisparoLigado(admin: any, info: { actorLabel: string; reason: string }) {
  try {
    const { data } = await admin.from("app_setting").select("value")
      .eq("key", "team_daily_digest_recipients").maybeSingle();
    const para = String(data?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const { from } = await getEmailConfig(admin);
    if (para.length === 0 || !from) return;
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const mail = tplMarketingDispatchEnabled({ ...info, quando });
    await sendEmail({ from, to: para, subject: mail.subject, html: mail.html });
  } catch (e) {
    console.warn("[mcp] aviso de disparo ligado falhou:", e instanceof Error ? e.message : e);
  }
}
```

Trocar a assinatura e o começo de `callManager`:

```ts
async function callManager(
  // deno-lint-ignore no-explicit-any
  admin: any,
  name: string,
  a: Record<string, unknown>,
  apiKeyId: string | null,
): Promise<unknown> {
  // Automação de marketing: registro e handlers em _shared/marketing.
  if (name.startsWith("marketing_")) {
    return callMarketing(admin, await atorDaChave(admin, apiKeyId), name, a, {
      alertarDisparoLigado: (info) => alertarDisparoLigado(admin, info),
    });
  }
```

(o resto do corpo de `callManager` fica igual). E em `depsDeProducao`, no ramo do manager:

```ts
        : endpoint === "manager"
        ? callManager(admin, nome, args, apiKeyId)
```

- [ ] **Passo 4: guarda do CI**

Em `scripts/check-openapi-drift.mjs`:

Depois da linha `const operatorSrc = readFileSync(...)`:

```js
const marketingSrc = readFileSync("supabase/functions/_shared/marketing/tools.ts", "utf8");
```

Depois de `const OPERATOR_ASSIST = ...`:

```js
// Automação de marketing (espalhada no MANAGER_TOOLS, interna, sem card).
const MARKETING = literalNames(arrayBody(marketingSrc, "MARKETING_TOOLS"));
```

Junto dos outros `DERIVES_*`:

```js
const DERIVES_MARKETING = /\.\.\.MARKETING_TOOLS\b/;
```

Em `toolNames`, acrescentar a linha:

```js
  ...(DERIVES_MARKETING.test(s) ? MARKETING : []),
```

Em `ASSIGNABLE_SCOPES`, acrescentar `"marketing:read", "marketing:write", "marketing:dispatch",`.

Em `toolScopes`, trocar `[toolsSrc, customerSrc, operatorSrc]` por `[toolsSrc, customerSrc, operatorSrc, marketingSrc]`.

Se `arrayBody` estiver declarada depois do uso como `const` (não `function`), mover a declaração de `MARKETING` para logo depois da definição de `arrayBody`.

- [ ] **Passo 5: rodar tudo e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/mcp/ supabase/functions/_shared/marketing/`
Esperado: tudo `ok`.

Run: `bun run lint:openapi`
Esperado: `✓ MCP em sincronia ... e N internas fora de todo card` com N contando as 26 de marketing, e nenhum escopo órfão.

- [ ] **Passo 6: deploy das Edges (não executa campanha)**

```bash
supabase functions deploy mcp --no-verify-jwt
supabase functions deploy marketing-run
```

Esperado: `Deployed Functions on project mgaigbezdalbyuqiofcf: mcp` e `marketing-run`.

- [ ] **Passo 7: commit**

```bash
git checkout deno.lock 2>/dev/null; git add supabase/functions/mcp scripts/check-openapi-drift.mjs
git commit -m "feat(mcp): tools de marketing no /manager, em três escopos de plataforma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: A tela grava pelas mesmas RPCs

**Arquivos:**
- Modificar: `src/features/marketing/api.ts` (`useSaveSegment`, `useDeleteSegment`, `useSaveCampaign`, `useSaveDispatchConfig`)
- Modificar: `src/routes/manager/marketing-segments.tsx:227`, `src/routes/manager/marketing-campaign.tsx:109`, `src/routes/manager/marketing-campaigns.tsx:286` (tirar `slug`)
- Modificar: `src/features/marketing/api.test.tsx`
- Criar: `src/features/marketing/segmentFields.contract.test.ts`

**Interfaces:**
- Consome: as RPCs da Tarefa 2.
- Produz: hooks com a mesma assinatura de antes, menos o `slug` (o servidor gera).

- [ ] **Passo 1: testes de rede e o contrato (falham)**

Em `src/features/marketing/api.test.tsx`, substituir os blocos `describe("useSaveSegment")`, `describe("useDeleteSegment")`, `describe("useSaveCampaign")` e `describe("useSaveDispatchConfig")` por:

```tsx
describe("useSaveSegment", () => {
  it("cria pela RPC, sem slug (o servidor gera)", async () => {
    const chamada = rpc("marketing_save_segment", { json: "seg-1" });
    const { result } = renderMutation(() => useSaveSegment());

    await result.current.mutateAsync({ name: "Recorrentes", definition: definicao, locationIds: ["loc-1"] });

    expect(chamada.ultimoBody).toEqual({
      p_segment_id: null,
      p_name: "Recorrentes",
      p_definition: definicao,
      p_description: null,
      p_location_ids: ["loc-1"],
    });
  });

  it("edita mandando o id", async () => {
    const chamada = rpc("marketing_save_segment", { json: "seg-1" });
    const { result } = renderMutation(() => useSaveSegment());

    await result.current.mutateAsync({ id: "seg-1", name: "Recorrentes", definition: definicao, locationIds: [] });

    expect((chamada.ultimoBody as { p_segment_id: string }).p_segment_id).toBe("seg-1");
  });

  it("mostra a recusa do servidor", async () => {
    falha("rpc", "marketing_save_segment", 400, "Segmento do modelo RFM não muda. Crie um novo a partir dele.");
    const { result } = renderMutation(() => useSaveSegment());

    await expect(
      result.current.mutateAsync({ id: "seg-1", name: "x", definition: definicao, locationIds: [] }),
    ).rejects.toThrow(/modelo RFM não muda/);
  });
});

describe("useDeleteSegment", () => {
  it("apaga pela RPC, que faz soft delete e grava a auditoria", async () => {
    const chamada = rpc("marketing_delete_segment", { status: 204 });
    const { result } = renderMutation(() => useDeleteSegment());

    await result.current.mutateAsync("seg-1");

    expect(chamada.ultimoBody).toEqual({ p_segment_id: "seg-1" });
  });
});

describe("useSaveCampaign", () => {
  it("cria pela RPC e devolve o id", async () => {
    const chamada = rpc("marketing_save_campaign", { json: "camp-1" });
    const { result } = renderMutation(() => useSaveCampaign());

    const id = await result.current.mutateAsync({ name: "Reativação", canvas: emptyCanvas() });

    expect(id).toBe("camp-1");
    expect(chamada.ultimoBody).toMatchObject({ p_campaign_id: null, p_name: "Reativação" });
  });

  it("não manda canvas quando a chamada não mexe no fluxo", async () => {
    // Canvas nulo na RPC preserva o fluxo já salvo.
    const chamada = rpc("marketing_save_campaign", { json: "camp-1" });
    const { result } = renderMutation(() => useSaveCampaign());

    await result.current.mutateAsync({ id: "camp-1", name: "Reativação" });

    expect((chamada.ultimoBody as { p_canvas: unknown }).p_canvas).toBeNull();
  });

  it("troca o status pela RPC própria", async () => {
    rpc("marketing_save_campaign", { json: "camp-1" });
    const status = rpc("marketing_set_campaign_status", { status: 204 });
    const { result } = renderMutation(() => useSaveCampaign());

    await result.current.mutateAsync({ id: "camp-1", name: "Reativação", status: "paused" });

    expect(status.ultimoBody).toEqual({ p_campaign_id: "camp-1", p_status: "paused" });
  });
});

describe("useSaveDispatchConfig", () => {
  it("ligar a chave geral vai pela RPC com motivo da tela", async () => {
    const chamada = rpc("marketing_set_dispatch_enabled", { json: { changed: true, enabled: true } });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ enabled: true });

    expect(chamada.ultimoBody).toEqual({ p_enabled: true, p_reason: "Alterado pela tela do Manager" });
  });

  it("desligar manda false, não vazio", async () => {
    const chamada = rpc("marketing_set_dispatch_enabled", { json: { changed: true, enabled: false } });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ enabled: false });

    expect((chamada.ultimoBody as { p_enabled: boolean }).p_enabled).toBe(false);
  });

  it("teto e destinatário vão numa chamada só", async () => {
    const chamada = rpc("marketing_set_dispatch_config", { json: {} });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ dailyCap: 500, testRecipient: "qa@movepark.co" });

    expect(chamada.chamadas.length).toBe(1);
    expect(chamada.ultimoBody).toEqual({
      p_test_recipient: "qa@movepark.co",
      p_daily_cap: 500,
      p_email_from: null,
    });
  });
});
```

`src/features/marketing/segmentFields.contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEGMENT_FIELDS } from "./segmentBuilder.logic";

/**
 * O catálogo de campos existe em dois lugares: SEGMENT_FIELDS (a tela) e marketing_segment_fields()
 * (o banco, que valida o segmento e responde à IA pelo MCP). Este contrato lê a migration como texto
 * e reprova se as chaves ou os tipos divergirem. Spec: docs/specs/marketing-mcp.md § 3.
 */
const sql = readFileSync(
  `${process.cwd()}/supabase/migrations/20261207110000_marketing_mcp_base.sql`,
  "utf8",
);
const doBanco = [
  ...sql.matchAll(/\('([a-z_0-9]+)', '(number|money|text|enum|boolean|tags)'/g),
].map((m) => [m[1], m[2]] as const);

describe("catálogo de campos de segmento: tela ↔ banco", () => {
  it("mesmas chaves e mesmos tipos", () => {
    expect(new Map(doBanco)).toEqual(new Map(SEGMENT_FIELDS.map((f) => [f.key, f.kind])));
  });
});
```

Run: `export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; bunx vitest run src/features/marketing/`
Esperado: FAIL nos `describe` alterados (os hooks ainda gravam na tabela). O contrato passa (a migration já existe).

- [ ] **Passo 2: trocar os hooks**

Em `src/features/marketing/api.ts`, acima de `useSaveSegment`:

```ts
/**
 * RPCs de gravação com auditoria (20261207120000_marketing_mcp_gravacao). Não estão no database.ts:
 * o `gen:types` sai incompleto e apaga funções que existem no banco (memória do projeto), então a
 * chamada passa por este cast localizado até a regeneração sair limpa.
 */
async function rpcAuditada(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const cliente = supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw error;
  return data;
}
```

Substituir `useSaveSegment` e `useDeleteSegment`:

```ts
export function useSaveSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      description?: string | null;
      definition: SegmentGroup;
      locationIds: string[];
    }) =>
      // O servidor valida a definição, gera o slug, recusa segmento do RFM e grava a auditoria.
      (await rpcAuditada("marketing_save_segment", {
        p_segment_id: input.id ?? null,
        p_name: input.name,
        p_definition: input.definition,
        p_description: input.description ?? null,
        p_location_ids: input.locationIds,
      })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

export function useDeleteSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete no servidor: campanha antiga aponta para o segmento, e apagar de verdade
      // deixaria o histórico sem explicação de para quem aquilo foi.
      await rpcAuditada("marketing_delete_segment", { p_segment_id: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}
```

Substituir `useSaveCampaign`:

```ts
export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      segmentId?: string | null;
      locationIds?: string[];
      canvas?: CampaignCanvas;
      sendCap?: number;
      status?: MarketingCampaign["status"];
    }) => {
      const id = (await rpcAuditada("marketing_save_campaign", {
        p_campaign_id: input.id ?? null,
        p_name: input.name,
        p_segment_id: input.segmentId ?? null,
        p_location_ids: input.locationIds ?? null,
        // Nulo preserva o fluxo já salvo: um save que não mexe no fluxo não pode zerá-lo.
        p_canvas: input.canvas ?? null,
        p_send_cap: input.sendCap ?? null,
      })) as string;
      if (input.status) {
        await rpcAuditada("marketing_set_campaign_status", { p_campaign_id: id, p_status: input.status });
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}
```

Substituir o `mutationFn` de `useSaveDispatchConfig`:

```ts
    mutationFn: async (patch: Partial<DispatchConfig>) => {
      if (patch.enabled !== undefined) {
        // Vai para a auditoria com o motivo fixo da tela; pelo MCP o motivo é obrigatório e livre.
        await rpcAuditada("marketing_set_dispatch_enabled", {
          p_enabled: patch.enabled,
          p_reason: "Alterado pela tela do Manager",
        });
      }
      if (
        patch.dailyCap !== undefined ||
        patch.testRecipient !== undefined ||
        patch.emailFrom !== undefined
      ) {
        await rpcAuditada("marketing_set_dispatch_config", {
          p_test_recipient: patch.testRecipient ?? null,
          p_daily_cap: patch.dailyCap ?? null,
          p_email_from: patch.emailFrom ?? null,
        });
      }
    },
```

Se `Json` ficar sem uso no arquivo depois disso, removê-lo do import (o `noUnusedLocals` reprova).

- [ ] **Passo 3: tirar o `slug` dos chamadores**

- `src/routes/manager/marketing-segments.tsx:227`: apagar a linha `slug: segment?.slug ?? slugify(nome),`. Se `slugify` ficar sem uso no arquivo, tirar do import.
- `src/routes/manager/marketing-campaign.tsx:109`: apagar a linha `slug: campanha.data!.slug,`.
- `src/routes/manager/marketing-campaigns.tsx:286`: trocar `{ name: nome.trim(), slug: slugify(nome), canvas: emptyCanvas() }` por `{ name: nome.trim(), canvas: emptyCanvas() }`, e tirar `slugify` do import se ficar sem uso.

- [ ] **Passo 4: rodar e ver passar**

Run: `export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; bunx vitest run src/features/marketing/ src/routes/manager/`
Esperado: tudo verde.

Run: `bun run typecheck && bun run lint`
Esperado: typecheck limpo; lint sem erro (avisos antigos seguem).

- [ ] **Passo 5: commit**

```bash
git add src/features/marketing src/routes/manager/marketing-segments.tsx src/routes/manager/marketing-campaign.tsx src/routes/manager/marketing-campaigns.tsx
git commit -m "feat(marketing): tela grava segmento, campanha e disparo pelas RPCs auditadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Documentação, verificação final e publicação

**Arquivos:**
- Modificar: `docs/specs/marketing-mcp.md` (status, `marketing_list_locations`, cupom e lead auditados só pelo MCP)
- Modificar: `docs/specs/mcp.md` § 4 (tabela do Manager)
- Modificar: `docs/specs/marketing-automation.md` (§ 2 auditoria, § 8 trava comum e gravação por RPC)
- Modificar: `docs/specs/permissions.md` (escopos de plataforma)
- Modificar: `docs/specs/README.md` (as duas migrations no catálogo)

- [ ] **Passo 1: atualizar as specs**

- `marketing-mcp.md`: status para "implementado em <data>"; na tabela de leitura, acrescentar `marketing_list_locations` (sem entrada; devolve id, nome, empresa e destino das unidades); em § 3, uma linha dizendo que cupom e lead são auditados quando a gravação vem pelo MCP (as RPCs de cupom e de lead da tela são as que já existiam e não gravam auditoria).
- `mcp.md` § 4, Manager: trocar o parágrafo "Marketing (planejado)" por uma linha na tabela: `marketing_*` (26 tools) | `marketing:read`, `marketing:write`, `marketing:dispatch` | "O módulo de Automação inteiro. Ver marketing-mcp.md".
- `marketing-automation.md`: em § 8, registrar `marketing_can_manage()` (hub_admin ou service_role) e que segmento, campanha e configuração do disparo só se gravam pelas RPCs auditadas (políticas só-leitura).
- `permissions.md`: na seção de escopo de plataforma, acrescentar os três de marketing.
- `README.md`: duas linhas no catálogo de migrations, depois de `20261207100000`.

Varrer travessão: `grep -n "—\|–" docs/specs/marketing-mcp.md docs/specs/mcp.md docs/specs/marketing-automation.md docs/specs/permissions.md` só pode mostrar linhas que já existiam antes.

- [ ] **Passo 2: verificação completa**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
bun run typecheck
bun run lint
bun run test
bun run lint:openapi
deno test --no-check --allow-env --allow-net --allow-read supabase/functions/mcp/ supabase/functions/_shared/
```

E os quatro pgTAP de marketing no vivo (as migrations já aplicadas, então sem passá-las ao script):

```bash
$SP/tap.sh supabase/tests/marketing_mcp_base.test.sql
$SP/tap.sh supabase/tests/marketing_mcp_gravacao.test.sql
$SP/tap.sh supabase/tests/marketing_campaign_engine.test.sql
$SP/tap.sh supabase/tests/marketing_rfm.test.sql
```

Esperado: tudo verde.

- [ ] **Passo 3: segurança (CLAUDE.md, E0.6)**

- Rodar a skill `security-review` sobre o diff.
- `supabase db advisors --linked --type security --output-format json` e comparar com o retrato de 25/11/2026 (236 avisos, 208 de `authenticated_security_definer_function_executable`): as funções novas de gravação aparecem como executáveis por `authenticated` por desenho (trava `marketing_require_manage` dentro); nenhuma pode aparecer para `anon`.
- Conferir no vivo: `select value from app_setting where key='marketing_dispatch_enabled'` = `false`; `select count(*) from marketing_message` = 0; `select count(*) from marketing_audit_log` = 0.

- [ ] **Passo 4: commit e push**

```bash
git status
git add docs/specs
git commit -m "docs(marketing): MCP de marketing implementado, specs e catálogo atualizados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase origin main
git push origin main
```

---

### Tarefa 9: A chave e a verificação de leitura no vivo

Esta tarefa depende do Kallef: a chave é segredo dele.

- [ ] **Passo 1: o Kallef gera a chave** em `movepark.co/manager/api-interna`, ambiente live, com `marketing:read`, `marketing:write` e `marketing:dispatch`, e adiciona o servidor no Claude dele:

```bash
claude mcp add --transport http movepark-manager https://mcp.movepark.co/manager --header "Authorization: Bearer <a chave>"
```

- [ ] **Passo 2: verificação só de leitura**, numa sessão com o MCP conectado: `tools/list` mostra as 26 tools `marketing_*`; chamar `marketing_list_segment_fields`, `marketing_get_rfm`, `marketing_preview_segment` com `{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2}]}` (esperado: 6 contatos) e `marketing_get_dispatch_config` (esperado: `enabled: false`).

**Não chamar** `marketing_run_campaign`, `marketing_set_dispatch_enabled` nem nenhuma tool de gravação nessa verificação.
