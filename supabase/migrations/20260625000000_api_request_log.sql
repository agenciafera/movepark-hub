-- Public API / MCP — observabilidade (E0.7 Fase 1.1). Ver docs/specs/public-api.md §6.
-- Log de uso/auditoria por chave: o gateway (Edge `api`) e o MCP parceiro (Edge `mcp`)
-- gravam uma linha por request autenticado (via service_role). Operator lê os próprios.
-- Retenção: prune diário > 90 dias (pg_cron). Sem escrita direta por RLS.

create table if not exists public.api_request_log (
  id          uuid primary key default gen_random_uuid(),
  api_key_id  uuid references public.api_key(id) on delete set null,
  company_id  uuid references public.company(id) on delete cascade,
  surface     text not null check (surface in ('rest', 'mcp')),
  method      text,        -- método HTTP (rest) ou método/tool MCP
  path        text,        -- rota REST ou nome da tool MCP
  scope       text,        -- escopo exigido pelo endpoint/tool
  status      integer,     -- status HTTP (rest) ou 200/4xx derivado (mcp)
  request_id  text,
  ip          text,
  latency_ms  integer,
  created_at  timestamptz not null default now()
);

create index if not exists api_request_log_company_idx
  on public.api_request_log (company_id, created_at desc);
create index if not exists api_request_log_key_idx
  on public.api_request_log (api_key_id, created_at desc);

alter table public.api_request_log enable row level security;
-- Leitura: operator vê só os logs da própria empresa; hub_admin vê tudo. Sem INSERT/UPDATE/DELETE
-- por RLS — a escrita vem do service_role (gateway), que bypassa RLS.
do $$ begin
  create policy api_request_log_operator_select on public.api_request_log
    for select using (
      public.is_hub_admin() or company_id in (select public.current_company_ids())
    );
exception when duplicate_object then null; end $$;

-- Leitura agregada/recente para o painel do operator (gateada por empresa).
create or replace function public.operator_api_usage(
  p_company_id uuid,
  p_limit integer default 100,
  p_since timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $usage$
declare v_recent jsonb; v_summary jsonb;
begin
  perform public.api_key_assert_company_access(p_company_id);

  select jsonb_agg(r) into v_recent from (
    select id, api_key_id, surface, method, path, scope, status, latency_ms, created_at
    from public.api_request_log
    where company_id = p_company_id
      and (p_since is null or created_at >= p_since)
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  ) r;

  select jsonb_build_object(
    'total', count(*),
    'errors', count(*) filter (where status >= 400),
    'avg_latency_ms', round(avg(latency_ms))::int,
    'by_surface', jsonb_object_agg(surface, n)
  ) into v_summary
  from (
    select surface, status, latency_ms, count(*) over () , count(*) over (partition by surface) n
    from public.api_request_log
    where company_id = p_company_id and (p_since is null or created_at >= p_since)
  ) s;

  return jsonb_build_object(
    'summary', coalesce(v_summary, jsonb_build_object('total', 0)),
    'recent', coalesce(v_recent, '[]'::jsonb)
  );
end; $usage$;

revoke all on function public.operator_api_usage(uuid, integer, timestamptz) from public;
grant all on function public.operator_api_usage(uuid, integer, timestamptz) to authenticated, service_role;

-- Prune diário (retenção 90 dias).
create or replace function public.cron_prune_api_request_log()
returns integer language plpgsql security definer set search_path to 'public' as $prune$
declare n integer;
begin
  delete from public.api_request_log where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end; $prune$;

revoke all on function public.cron_prune_api_request_log() from public;
grant all on function public.cron_prune_api_request_log() to service_role;

select cron.schedule('prune-api-request-log', '17 4 * * *',
  $$ select public.cron_prune_api_request_log(); $$);
