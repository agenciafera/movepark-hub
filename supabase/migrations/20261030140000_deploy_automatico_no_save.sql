-- Publicação automática: mudança de conteúdo no banco dispara o build do site.
--
-- Por que existe. A página pública é SSG: o que está no ar é o HTML do último build, e o
-- React Query recebe esse dado como `initialData` com `staleTime`, então nem no cliente ele
-- é refeito no carregamento. Editar comodidade, FAQ, preço ou texto no Manager não aparecia
-- no site até alguém lembrar de rebuildar à mão. Em 19/08/2026 duas unidades ficaram seis
-- horas mostrando comodidade que já não existia no banco ("Seguro voo" na Abbapark), e o
-- histórico do repo tem commit vazio só para forçar publicação (21aeb4a8).
--
-- Desenho. Trigger DE STATEMENT nas tabelas que o build lê -> fila `site_rebuild_request` ->
-- pg_cron a cada minuto decide se dispara -> Deploy Hook do Workers Builds (POST numa URL
-- secreta, guardada no Vault).
--
-- Três decisões que valem explicar:
--
-- 1. O disparo NÃO acontece no trigger. Um save do Manager mexe em várias tabelas na mesma
--    transação, e pendurar uma chamada HTTP ali travaria a transação do usuário na latência
--    do Cloudflare, além de disparar um build por tabela tocada.
-- 2. A fila COALESCE. Vinte edições seguidas viram um build só: o cron espera o editor ficar
--    quieto (`quiet_seconds`) antes de publicar, com um teto (`max_wait_seconds`) para que
--    uma sessão longa de edição não adie a publicação para sempre.
-- 3. O trigger é de statement, não de linha. Salvar as comodidades de uma unidade regrava
--    dez linhas de `location_amenity`; o build é do site inteiro, então saber QUAL linha
--    mudou não muda nada, e uma linha de fila por statement é o suficiente.
--
-- Sem o segredo `cloudflare_deploy_hook_url` no Vault, o cron enfileira e não faz nada.
-- Ver docs/specs/deploy-automatico.md.

-- ─────────────────────────── 1. Fila de pedidos ───────────────────────────

create table if not exists public.site_rebuild_request (
  id uuid primary key default gen_random_uuid(),
  -- Qual tabela mudou. Serve para responder "por que esse build saiu", não para decidir nada:
  -- o build é sempre do site inteiro.
  source_table text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  requested_at timestamptz not null default now(),
  -- Nulo enquanto pendente. O cron carimba todas as pendentes do lote de uma vez.
  dispatched_at timestamptz,
  -- Agrupa o lote que saiu no mesmo build.
  dispatch_id uuid,
  -- Id da chamada no pg_net. A resposta do Cloudflare pode ser lida depois em
  -- `net._http_response`, sem precisar de tabela de log própria.
  net_request_id bigint
);

create index if not exists site_rebuild_request_pendente_idx
  on public.site_rebuild_request (requested_at)
  where dispatched_at is null;

create index if not exists site_rebuild_request_dispatch_idx
  on public.site_rebuild_request (dispatched_at desc nulls last);

comment on table public.site_rebuild_request is
  'Fila de publicação do site (SSG). Cada statement que muda conteúdo pré-renderizado enfileira uma linha; o cron dispatch-site-rebuild coalesce as pendentes num único build via Deploy Hook do Cloudflare.';

alter table public.site_rebuild_request enable row level security;

drop policy if exists site_rebuild_request_admin_read on public.site_rebuild_request;
create policy site_rebuild_request_admin_read on public.site_rebuild_request
  for select to authenticated using (public.is_hub_admin());

-- ─────────────────────────── 2. Configuração ───────────────────────────

-- Config no banco, não no código (ADR-007): a janela certa se descobre com o uso, e mexer
-- nela não pode exigir migration. `enabled` é o desligamento de emergência.
insert into public.app_setting (key, value)
values (
  'site_rebuild_policy',
  '{"enabled": true, "quiet_seconds": 180, "max_wait_seconds": 1200, "min_interval_seconds": 600}'
)
on conflict (key) do nothing;

-- ─────────────────────────── 3. Enfileirar ───────────────────────────

create or replace function public.request_site_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.site_rebuild_request (source_table, op)
  values (tg_table_name, tg_op);
  return null; -- trigger AFTER de statement ignora o retorno
end;
$$;

comment on function public.request_site_rebuild() is
  'Trigger de statement: enfileira um pedido de publicação quando a tabela muda.';

-- As tabelas que o build lê para gerar HTML. Regra para crescer esta lista: entra tabela cujo
-- conteúdo aparece em página pré-renderizada E que é escrita por gente. Ficam DE FORA:
--
--   • `google_place_snapshot` — reescrita pelo cron de avaliações do Google; entraria em
--     laço de build a cada refresh.
--   • `review` — a nota que a página mostra vive em `location.review_avg`, e o trigger
--     `review_bump_rating` já atualiza `location`, que está na lista. Incluir as duas só
--     duplicaria o pedido.
--   • `booking` e tudo do caminho transacional — não sai em HTML pré-renderizado.
do $$
declare
  v_tabela text;
  v_tabelas text[] := array[
    -- unidade e empresa
    'location', 'location_amenity', 'location_parking_type',
    'company', 'company_parking_type', 'amenity', 'parking_type',
    -- catálogo e conteúdo
    'destination', 'prospect_location', 'faq', 'faq_category', 'blog_post',
    -- preço (sai no card, no /precos e no JSON-LD de oferta)
    'pricing_rule', 'pricing_tier', 'pricing_hourly_bracket'
  ];
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass('public.' || quote_ident(v_tabela)) is null then
      raise exception 'site_rebuild: tabela public.% não existe', v_tabela;
    end if;
    execute format('drop trigger if exists %I on public.%I', v_tabela || '_site_rebuild', v_tabela);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each statement execute function public.request_site_rebuild()',
      v_tabela || '_site_rebuild', v_tabela
    );
  end loop;
end;
$$;

-- ─────────────────────────── 4. Decisão (a parte testável) ───────────────────────────

-- Separada do disparo de propósito: aqui mora a regra, e ela é verificável sem rede. O
-- `p_now` existe para o teste simular a passagem do tempo.
create or replace function public.site_rebuild_decision(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb;
  v_enabled boolean;
  v_quiet integer;
  v_max_wait integer;
  v_min_interval integer;
  v_pendentes integer;
  v_mais_antigo timestamptz;
  v_mais_novo timestamptz;
  v_ultimo_build timestamptz;
begin
  v_cfg := coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'site_rebuild_policy'),
    '{}'::jsonb
  );
  v_enabled       := coalesce((v_cfg->>'enabled')::boolean, true);
  v_quiet         := coalesce((v_cfg->>'quiet_seconds')::integer, 180);
  v_max_wait      := coalesce((v_cfg->>'max_wait_seconds')::integer, 1200);
  v_min_interval  := coalesce((v_cfg->>'min_interval_seconds')::integer, 600);

  select count(*), min(requested_at), max(requested_at)
    into v_pendentes, v_mais_antigo, v_mais_novo
    from public.site_rebuild_request
   where dispatched_at is null;

  select max(dispatched_at) into v_ultimo_build from public.site_rebuild_request;

  if v_pendentes = 0 then
    return jsonb_build_object('acao', 'nao', 'motivo', 'nada_pendente', 'pendentes', 0);
  end if;

  if not v_enabled then
    return jsonb_build_object('acao', 'nao', 'motivo', 'desligado', 'pendentes', v_pendentes);
  end if;

  -- Teto de frequência: protege a cota de build minutos do Cloudflare de uma enxurrada de
  -- escrita (import, correção em massa) virar um build a cada minuto.
  if v_ultimo_build is not null
     and p_now - v_ultimo_build < make_interval(secs => v_min_interval) then
    return jsonb_build_object('acao', 'nao', 'motivo', 'intervalo_minimo', 'pendentes', v_pendentes);
  end if;

  -- Espera o editor parar de digitar, mas não além do teto: quem edita sem pausa por meia
  -- hora publica assim mesmo.
  if p_now - v_mais_novo < make_interval(secs => v_quiet)
     and p_now - v_mais_antigo < make_interval(secs => v_max_wait) then
    return jsonb_build_object('acao', 'nao', 'motivo', 'aguardando_silencio', 'pendentes', v_pendentes);
  end if;

  return jsonb_build_object(
    'acao', 'disparar',
    'pendentes', v_pendentes,
    'desde', v_mais_antigo
  );
end;
$$;

comment on function public.site_rebuild_decision(timestamptz) is
  'Decide se a fila de publicação deve virar um build agora. Retorna {acao, motivo, pendentes}.';

-- ─────────────────────────── 5. Disparo ───────────────────────────

create or replace function public.cron_dispatch_site_rebuild()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_decisao jsonb;
  v_url text;
  v_corte timestamptz;
  v_request_id bigint;
  v_dispatch uuid;
  v_marcadas integer;
begin
  v_decisao := public.site_rebuild_decision();
  if v_decisao->>'acao' <> 'disparar' then
    return v_decisao;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'cloudflare_deploy_hook_url';

  -- Enquanto ninguém cadastrou o hook, a fila fica pendente e nada é perdido: no dia em que
  -- o segredo entrar, o próximo minuto publica tudo o que se acumulou.
  if v_url is null or v_url = '' then
    return jsonb_build_object('acao', 'nao', 'motivo', 'sem_deploy_hook',
                              'pendentes', v_decisao->'pendentes');
  end if;

  -- Corte tirado ANTES do POST: mudança que entrar durante o build continua pendente e ganha
  -- o próximo. O contrário (carimbar tudo) perderia a edição feita enquanto o Cloudflare lê
  -- o banco.
  v_corte := clock_timestamp();

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;

  v_dispatch := gen_random_uuid();

  update public.site_rebuild_request
     set dispatched_at = v_corte,
         dispatch_id = v_dispatch,
         net_request_id = v_request_id
   where dispatched_at is null
     and requested_at <= v_corte;
  get diagnostics v_marcadas = row_count;

  return jsonb_build_object(
    'acao', 'disparado',
    'dispatch_id', v_dispatch,
    'net_request_id', v_request_id,
    'pedidos', v_marcadas
  );
end;
$$;

comment on function public.cron_dispatch_site_rebuild() is
  'Publica o site quando a fila pede: POST no Deploy Hook do Workers Builds e carimba as pendentes.';

create or replace function public.cron_prune_site_rebuild_request()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removidas integer;
begin
  delete from public.site_rebuild_request
   where dispatched_at is not null
     and dispatched_at < now() - interval '30 days';
  get diagnostics v_removidas = row_count;
  return jsonb_build_object('removidas', v_removidas);
end;
$$;

-- ─────────────────────────── 6. Permissões ───────────────────────────

revoke all on function public.request_site_rebuild() from public, anon, authenticated;
revoke all on function public.cron_dispatch_site_rebuild() from public, anon, authenticated;
revoke all on function public.cron_prune_site_rebuild_request() from public, anon, authenticated;
revoke all on function public.site_rebuild_decision(timestamptz) from public, anon;
grant execute on function public.cron_dispatch_site_rebuild() to service_role;
grant execute on function public.cron_prune_site_rebuild_request() to service_role;
grant execute on function public.site_rebuild_decision(timestamptz) to service_role;

-- ─────────────────────────── 7. Agenda ───────────────────────────

-- De minuto em minuto: a decisão é uma leitura de índice parcial, e a espera de verdade quem
-- faz é o `quiet_seconds`. Rodar de 5 em 5 só somaria atraso à publicação.
select cron.unschedule('dispatch-site-rebuild')
 where exists (select 1 from cron.job where jobname = 'dispatch-site-rebuild');

select cron.schedule(
  'dispatch-site-rebuild', '* * * * *',
  $job$ select public.cron_dispatch_site_rebuild(); $job$
);

select cron.unschedule('prune-site-rebuild-request')
 where exists (select 1 from cron.job where jobname = 'prune-site-rebuild-request');

select cron.schedule(
  'prune-site-rebuild-request', '41 4 * * *',
  $job$ select public.cron_prune_site_rebuild_request(); $job$
);
