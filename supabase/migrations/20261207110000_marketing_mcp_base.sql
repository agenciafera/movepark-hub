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
