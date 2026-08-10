-- E0.16 · Registro de clique de saída da unidade externa
-- Spec: docs/specs/clique-saida-externa.md
--
-- A reserva da unidade externa nasce no site do parceiro, então não há `booking` para ancorar
-- métrica. Hoje são seis unidades externas e doze vagas: cinco delas listadas e vendendo, com
-- zero visibilidade de funil. Não dá para saber se a vitrine externa converte, nem para
-- reconciliar com o relatório do parceiro, nem para medir se a declaração de responsabilidade
-- (Q-017) espanta gente no CTA.
--
-- Três decisões que moldam o resto:
--
-- 1. **Sem PII.** Guarda-se o que permite reconciliar (unidade, vaga, datas da busca, canal) e
--    uma sessão anônima. Nada de IP, user agent ou `profile_id`, nem para quem está logado: a
--    reconciliação com o parceiro se faz por unidade e data, nunca por pessoa.
--
-- 2. **A tabela não aceita escrita direta.** Nem `anon` nem `authenticated` têm policy de
--    INSERT; quem grava é a RPC `log_external_exit`, SECURITY DEFINER, que só aceita vaga ATIVA
--    de unidade EXTERNA. Isso limita o alvo às doze vagas que existem, em vez de deixar um
--    endpoint anônimo aceitando qualquer uuid.
--
-- 3. **Dedup de 5 minutos** por sessão + vaga + datas. Clique duplo, voltar-e-clicar-de-novo e
--    abrir em nova aba são a mesma intenção, e contá-los como três infla o funil justamente na
--    métrica que existe para decidir se vale migrar o parceiro para o Hub.
--
-- Limite conhecido: a dedup é por sessão informada pelo cliente, então não é defesa contra
-- inflação deliberada (basta rotacionar a sessão). Ela resolve o caso real, que é o mesmo
-- humano clicando duas vezes. Defesa contra abuso pediria rate-limit na borda, e a hora de
-- fazer isso é quando o número virar base de decisão comercial, não antes.

create table if not exists public.external_exit_click (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  location_id uuid not null references public.location(id) on delete cascade,
  location_parking_type_id uuid not null references public.location_parking_type(id) on delete cascade,
  -- Datas que o cliente escolheu na single e que viajam no link de saída.
  check_in_at timestamptz,
  check_out_at timestamptz,
  days integer,
  -- Sessão anônima do navegador (sessionStorage). Não identifica pessoa e não sobrevive ao
  -- fechamento da aba: serve para dedup e para contar visitante, não para rastrear.
  session_id text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

comment on table public.external_exit_click is
  'E0.16: clique no CTA de saída de unidade externa. Sem PII. Escrita só pela RPC log_external_exit.';
comment on column public.external_exit_click.session_id is
  'Sessão anônima do navegador. Nunca é identificador de pessoa; não relacionar com profiles.';

-- O funil é lido por empresa e por período; a terceira serve à dedup.
create index if not exists external_exit_click_company_idx
  on public.external_exit_click (company_id, created_at desc);
create index if not exists external_exit_click_lpt_idx
  on public.external_exit_click (location_parking_type_id, created_at desc);
create index if not exists external_exit_click_dedup_idx
  on public.external_exit_click (session_id, location_parking_type_id, created_at desc);

alter table public.external_exit_click enable row level security;

-- Só hub_admin lê. Sem policy de INSERT/UPDATE/DELETE para ninguém: a gravação passa pela RPC
-- definer, e ninguém edita clique depois de registrado.
drop policy if exists external_exit_click_admin_read on public.external_exit_click;
create policy external_exit_click_admin_read on public.external_exit_click
  for select using (public.is_hub_admin());

revoke all on table public.external_exit_click from public, anon, authenticated;
grant select on table public.external_exit_click to authenticated;

-- ─────────────────────────── Gravação ───────────────────────────

-- Devolve `true` quando gravou. `false` quando a vaga não é de unidade externa (alvo inválido)
-- ou quando é repique da dedup. Quem chama é fire-and-forget e ignora a resposta; o retorno
-- existe para o teste conseguir afirmar as duas recusas.
create or replace function public.log_external_exit(
  p_location_parking_type_id uuid,
  p_session_id text,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_location uuid;
  v_days integer;
begin
  if p_location_parking_type_id is null or nullif(btrim(coalesce(p_session_id, '')), '') is null then
    return false;
  end if;

  -- Alvo válido é vaga ativa de unidade externa. Sem isto, a RPC viraria um insert anônimo que
  -- aceita qualquer uuid.
  select l.company_id, l.id
    into v_company, v_location
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
   where lpt.id = p_location_parking_type_id
     and lpt.is_active
     and l.checkout_mode = 'external'
     and l.deleted_at is null;

  if v_company is null then
    return false;
  end if;

  -- Mesma sessão, mesma vaga, mesmas datas, nos últimos 5 minutos: é o mesmo clique.
  if exists (
    select 1 from public.external_exit_click c
     where c.session_id = p_session_id
       and c.location_parking_type_id = p_location_parking_type_id
       and c.check_in_at is not distinct from p_check_in_at
       and c.check_out_at is not distinct from p_check_out_at
       and c.created_at > now() - interval '5 minutes'
  ) then
    return false;
  end if;

  v_days := case
    when p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at then null
    else greatest(1, ceil(extract(epoch from (p_check_out_at - p_check_in_at)) / 86400)::int)
  end;

  insert into public.external_exit_click (
    company_id, location_id, location_parking_type_id,
    check_in_at, check_out_at, days, session_id,
    utm_source, utm_medium, utm_campaign
  ) values (
    v_company, v_location, p_location_parking_type_id,
    p_check_in_at, p_check_out_at, v_days, p_session_id,
    left(p_utm_source, 120), left(p_utm_medium, 120), left(p_utm_campaign, 120)
  );

  return true;
end;
$$;

revoke all on function public.log_external_exit(uuid, text, timestamptz, timestamptz, text, text, text)
  from public;
grant execute on function public.log_external_exit(uuid, text, timestamptz, timestamptz, text, text, text)
  to anon, authenticated;

-- ─────────────────────────── Leitura do funil ───────────────────────────

-- Cliques por unidade e vaga num período, com sessões distintas ao lado do total: a diferença
-- entre os dois é quanta gente voltou para clicar de novo.
--
-- A parte de "impressão" e "reserva confirmada no relatório do parceiro" NÃO entra aqui, porque
-- nenhuma das duas existe hoje: o Hub não registra impressão de busca e o parceiro não devolve
-- reserva por API. O que esta RPC entrega é o elo do meio, que é o que faltava.
create or replace function public.manager_external_exit_clicks(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
) returns table (
  company_slug text,
  company_name text,
  location_slug text,
  parking_type_code text,
  clicks bigint,
  sessions bigint,
  last_click_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Recusa, e não devolve vazio. Falha de permissão que volta como lista vazia se disfarça de
  -- "não teve clique nenhum", que é exatamente a leitura errada num painel de funil. Mesmo
  -- padrão dos outros `manager_*`.
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o funil de saída externa.' using errcode = '42501';
  end if;

  return query
  select c.slug, c.name, l.slug, pt.code,
         count(*)::bigint,
         count(distinct e.session_id)::bigint,
         max(e.created_at)
    from public.external_exit_click e
    join public.company c on c.id = e.company_id
    join public.location l on l.id = e.location_id
    join public.location_parking_type lpt on lpt.id = e.location_parking_type_id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
   where e.created_at >= p_from
     and e.created_at < p_to
   group by c.slug, c.name, l.slug, pt.code
   order by count(*) desc;
end;
$$;

revoke all on function public.manager_external_exit_clicks(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.manager_external_exit_clicks(timestamptz, timestamptz)
  to authenticated, service_role;

-- ─────────────────────────── Retenção ───────────────────────────

-- 180 dias, o dobro do log de integração. Clique de saída é série temporal de produto (compara-se
-- semestre contra semestre), e não rastro de máquina, que só interessa enquanto está fresco.
create or replace function public.cron_prune_integration_logs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconcile integer;
  v_mirror integer;
  v_exit integer;
begin
  delete from public.wl_reconcile_log where created_at < now() - interval '90 days';
  get diagnostics v_reconcile = row_count;

  delete from public.pricing_mirror_run
   where kind in ('divergent', 'error') and created_at < now() - interval '90 days';
  get diagnostics v_mirror = row_count;

  delete from public.external_exit_click where created_at < now() - interval '180 days';
  get diagnostics v_exit = row_count;

  return jsonb_build_object(
    'wl_reconcile_log', v_reconcile,
    'pricing_mirror_run', v_mirror,
    'external_exit_click', v_exit
  );
end;
$$;

revoke all on function public.cron_prune_integration_logs() from public, anon, authenticated;
grant execute on function public.cron_prune_integration_logs() to service_role;
