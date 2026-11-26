-- Assistente de IA da Automação, v2. Ver docs/specs/assistente-marketing.md.
--
-- O cérebro roda no beast-bots (tenant movepark-marketing) e fala com o Hub pela superfície
-- interna /marketing do MCP. Esta migration cria o que o Hub precisa para ser a fronteira de
-- confiança: o token do turno (o beast-bots nunca recebe o JWT do admin), as propostas de disparo
-- que só o clique executa, a função que resolve o token e a chave de liga e desliga com o teto.

-- ── Escopo de plataforma do agente ─────────────────────────────────────────────
insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values (
  'marketing:assist', 'assistente',
  'Agente de marketing do beast-bots: usa a superfície /marketing do MCP em nome do admin logado (uso interno).',
  true, true
)
on conflict (scope) do nothing;

-- ── Token do turno (mpm_) ──────────────────────────────────────────────────────
-- Vale 30 minutos, um admin e uma conversa, só na superfície /marketing. Guardado em sha256.
-- A linha fica depois do turno, com ended_at, porque é ela que conta o teto de uso por hora;
-- linhas com mais de um dia saem na emissão seguinte do mesmo admin.
create table public.marketing_assist_session (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversa_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
create index marketing_assist_session_profile_idx
  on public.marketing_assist_session (profile_id, created_at desc);
alter table public.marketing_assist_session enable row level security;
revoke all on table public.marketing_assist_session from anon, authenticated;

-- ── Propostas de disparo ───────────────────────────────────────────────────────
create table public.marketing_assistant_action (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversa_id uuid not null,
  tool text not null check (tool in ('marketing_run_campaign', 'marketing_set_dispatch_enabled')),
  args jsonb not null default '{}'::jsonb,
  resumo jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'blocked', 'executing', 'executed', 'failed', 'dismissed', 'expired')),
  resultado jsonb,
  erro text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index marketing_assistant_action_conversa_idx
  on public.marketing_assistant_action (profile_id, conversa_id, created_at);
alter table public.marketing_assistant_action enable row level security;
revoke all on table public.marketing_assistant_action from anon, authenticated;
grant select on table public.marketing_assistant_action to authenticated;
create policy marketing_assistant_action_select on public.marketing_assistant_action
  for select to authenticated
  using (profile_id = auth.uid());

-- ── Resolve o token ────────────────────────────────────────────────────────────
-- O papel é recalculado a cada chamada: quem deixou de ser hub_admin perde o acesso na hora,
-- sem esperar o token vencer.
create or replace function public.marketing_assist_resolve(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  s public.marketing_assist_session;
  v_role public.user_role;
  v_name text;
  v_email text;
begin
  select * into s from public.marketing_assist_session
  where token_hash = p_token_hash and expires_at > now() and ended_at is null;
  if s.id is null then
    return jsonb_build_object('ok', false, 'reason', 'token_invalido');
  end if;

  select p.role,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''))
    into v_role, v_name
  from public.profiles p where p.id = s.profile_id and p.deleted_at is null;
  if v_role is distinct from 'hub_admin' then
    return jsonb_build_object('ok', false, 'reason', 'sem_papel');
  end if;

  select u.email into v_email from auth.users u where u.id = s.profile_id;

  return jsonb_build_object(
    'ok', true, 'profile_id', s.profile_id, 'conversa_id', s.conversa_id,
    'user_name', v_name, 'email', v_email);
end; $$;
revoke all on function public.marketing_assist_resolve(text) from public, anon, authenticated;
grant execute on function public.marketing_assist_resolve(text) to service_role;

-- ── Liga e desliga, teto de uso ────────────────────────────────────────────────
insert into public.app_setting (key, value)
values ('marketing_assistant', '{"enabled": true, "max_turns_per_user_hour": 60}')
on conflict (key) do nothing;

-- A v1 lia o modelo daqui. Na v2 o modelo é configuração do tenant no beast-bots.
delete from public.app_setting where key = 'marketing_assistant_model';
