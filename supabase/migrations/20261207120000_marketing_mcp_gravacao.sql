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
