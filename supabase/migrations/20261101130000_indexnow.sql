-- IndexNow: avisa o índice da Microsoft quando uma página pré-renderizada muda.
--
-- Por que existe. A busca do ChatGPT se apoia no índice da Microsoft, e hoje o site depende do
-- bingbot passar por conta própria. O IndexNow inverte isso: o site avisa. É o único caminho de
-- submissão que não exige conta em painel nenhum, porque a posse é provada por um arquivo público
-- em `https://movepark.co/<chave>.txt` (ver supabase/functions/_shared/indexnow.ts).
--
-- O desenho copia o do knowledge-embed, que já roda: gatilho enfileira, pg_cron drena, Edge faz o
-- HTTP. O gatilho não chama HTTP porque penduraria a transação de quem salva no Manager na
-- latência de um terceiro.
--
-- **A fila guarda caminho, nunca URL absoluta.** O host canônico não mora no banco (regra do
-- CLAUDE.md: ele vive em src/lib/site-host.mjs e em supabase/functions/_shared/site.ts, e um teste
-- de contrato reprova host repetido à mão). Quem monta `https://movepark.co/blog/x/` é a Edge, com
-- o `sitePath()` do _shared. Foi por isso que o POST ficou na Edge e não no pg_net do cron, como no
-- deploy automático: lá a URL do Deploy Hook é opaca e vem do Vault, aqui a URL é do próprio site.
--
-- Ver docs/specs/indexnow.md.

create table if not exists public.indexnow_request (
  id uuid primary key default gen_random_uuid(),
  -- Caminho com a barra inicial, exatamente como a URL pública responde. O contrato do blog é
  -- COM barra final (`/blog/x/`) e o do resto do Hub é SEM (`/destinos/x`); submeter a forma
  -- errada faz o buscador rastrear um redirect em vez da página.
  path text not null check (path ~ '^/'),
  source_table text not null,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0,
  dispatch_id uuid,
  dispatched_at timestamptz,
  status_code integer
);

comment on table public.indexnow_request is
  'Fila de caminhos a submeter ao IndexNow. Guarda caminho, nunca URL absoluta: o host não mora no banco.';

-- Dedupe: vinte saves seguidos do mesmo post viram um pedido só enquanto ninguém despachou.
create unique index if not exists indexnow_request_path_pendente
  on public.indexnow_request (path) where dispatched_at is null;

create index if not exists indexnow_request_pendente
  on public.indexnow_request (requested_at) where dispatched_at is null;

alter table public.indexnow_request enable row level security;

-- Leitura só do admin do Hub. Escrita não tem policy nenhuma de propósito: só os gatilhos e as
-- funções security definer abaixo gravam aqui.
drop policy if exists indexnow_request_admin_read on public.indexnow_request;
create policy indexnow_request_admin_read on public.indexnow_request
  for select using (public.is_hub_admin());

revoke all on table public.indexnow_request from anon, authenticated;
grant select on table public.indexnow_request to authenticated;

-- ── Enfileiramento ───────────────────────────────────────────────────────────

create or replace function public.enqueue_indexnow(p_path text, p_source_table text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.indexnow_request (path, source_table)
  select p_path, p_source_table
   where p_path is not null and p_path ~ '^/'
  on conflict do nothing;
$$;

revoke all on function public.enqueue_indexnow(text, text) from public, anon, authenticated;

-- Post do blog: `/blog/<slug>/`, com barra final, que é o contrato herdado do WordPress.
--
-- Despublicar e apagar também entram na fila, e isso é intencional: o IndexNow serve tanto para
-- "olha a página nova" quanto para "essa URL mudou de resposta". Os 26 posts consolidados
-- respondem 301 hoje, e avisar é o que tira o conteúdo velho do índice mais rápido.
create or replace function public.blog_post_enqueue_indexnow()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_indexnow('/blog/' || old.slug || '/', 'blog_post');
    return old;
  end if;

  perform public.enqueue_indexnow('/blog/' || new.slug || '/', 'blog_post');

  -- Slug renomeado é contrato de URL quebrado, e não deveria acontecer num post publicado. Se
  -- acontecer, a URL antiga também precisa ser reavaliada pelo buscador.
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    perform public.enqueue_indexnow('/blog/' || old.slug || '/', 'blog_post');
  end if;

  return new;
end; $fn$;

drop trigger if exists blog_post_indexnow on public.blog_post;
create trigger blog_post_indexnow
  after insert or update or delete on public.blog_post
  for each row execute function public.blog_post_enqueue_indexnow();

-- Destino: `/destinos/<slug>`, sem barra final.
create or replace function public.destination_enqueue_indexnow()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_indexnow('/destinos/' || old.slug, 'destination');
    return old;
  end if;

  perform public.enqueue_indexnow('/destinos/' || new.slug, 'destination');

  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    perform public.enqueue_indexnow('/destinos/' || old.slug, 'destination');
  end if;

  return new;
end; $fn$;

drop trigger if exists destination_indexnow on public.destination;
create trigger destination_indexnow
  after insert or update or delete on public.destination
  for each row execute function public.destination_enqueue_indexnow();

revoke all on function public.blog_post_enqueue_indexnow() from public, anon, authenticated;
revoke all on function public.destination_enqueue_indexnow() from public, anon, authenticated;

-- ── Drenagem ─────────────────────────────────────────────────────────────────

-- Claim atômico, no molde do knowledge_queue_claim. Um pedido despachado há mais de 15 minutos e
-- ainda sem `status_code` é retomado: significa que a Edge morreu no meio.
create or replace function public.indexnow_claim(p_limit integer default 500)
returns setof public.indexnow_request
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dispatch uuid := gen_random_uuid();
begin
  return query
  update public.indexnow_request q
     set dispatch_id = v_dispatch,
         dispatched_at = now(),
         attempts = q.attempts + 1
   where q.id in (
     select id from public.indexnow_request
      where (dispatched_at is null and attempts < 3)
         or (dispatched_at is not null and status_code is null
             and dispatched_at < now() - interval '15 minutes' and attempts < 3)
      order by requested_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit, 500), 500))
   )
  returning q.*;
end;
$$;

revoke all on function public.indexnow_claim(integer) from public, anon, authenticated;
grant execute on function public.indexnow_claim(integer) to service_role;

-- Fecha o lote. Resposta fora da faixa 2xx devolve os pedidos para a fila, e o teto de 3 tentativas
-- do claim é o que impede um caminho ruim de rodar para sempre.
create or replace function public.indexnow_settle(p_dispatch_id uuid, p_status_code integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_afetados integer;
begin
  if p_status_code between 200 and 299 then
    update public.indexnow_request
       set status_code = p_status_code
     where dispatch_id = p_dispatch_id;
  else
    update public.indexnow_request
       set dispatch_id = null, dispatched_at = null, status_code = p_status_code
     where dispatch_id = p_dispatch_id;
  end if;

  get diagnostics v_afetados = row_count;
  return v_afetados;
end;
$$;

revoke all on function public.indexnow_settle(uuid, integer) from public, anon, authenticated;
grant execute on function public.indexnow_settle(uuid, integer) to service_role;

-- ── Chave que protege a Edge (esta SIM é segredo) ────────────────────────────
--
-- Criada operacionalmente, fora do repo:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'indexnow_dispatch_key');
--
-- Não confundir com a chave do protocolo IndexNow, que é pública por desenho e mora em
-- supabase/functions/_shared/indexnow.ts.

create or replace function public.indexnow_dispatch_key_valid(p_key text)
returns boolean
language sql
security definer
set search_path to 'public, vault'
stable
as $$
  select p_key is not null and p_key <> '' and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'indexnow_dispatch_key' and s.decrypted_secret = p_key
  );
$$;

revoke all on function public.indexnow_dispatch_key_valid(text) from public, anon, authenticated;
grant execute on function public.indexnow_dispatch_key_valid(text) to service_role;

-- ── Cron ─────────────────────────────────────────────────────────────────────
--
-- De 10 em 10 minutos. O IndexNow não é caminho quente: o buscador leva horas para rastrear de
-- qualquer jeito, e submeter a mesma URL repetidas vezes é o que o protocolo pede para evitar.
--
-- Enquanto o segredo não existir no Vault, o header vai vazio, a Edge recusa com 401 e a fila fica
-- intacta. É o mesmo comportamento do deploy automático sem Deploy Hook: nada se perde.

select cron.unschedule('indexnow-ping') where exists (
  select 1 from cron.job where jobname = 'indexnow-ping'
);

select cron.schedule(
  'indexnow-ping',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/indexnow',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-indexnow-dispatch-key',
      coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'indexnow_dispatch_key'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- Poda: pedido concluído há mais de 30 dias não serve para nada, no mesmo espírito da poda da
-- fila de rebuild.
create or replace function public.cron_prune_indexnow_request()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_apagados integer;
begin
  delete from public.indexnow_request
   where status_code is not null and dispatched_at < now() - interval '30 days';
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke all on function public.cron_prune_indexnow_request() from public, anon, authenticated;

select cron.unschedule('prune-indexnow-request') where exists (
  select 1 from cron.job where jobname = 'prune-indexnow-request'
);

select cron.schedule(
  'prune-indexnow-request',
  '47 4 * * *',
  $job$ select public.cron_prune_indexnow_request(); $job$
);
