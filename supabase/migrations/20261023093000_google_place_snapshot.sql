-- Espelho das avaliações do Google (Places API New), chaveado pelo place_id.
-- Chave é o LUGAR e não o nosso registro: serve `location` e `prospect_location` sem FK nova
-- (o ADR-010 proíbe FK apontando para lote mapeado), deduplica quando dois registros apontam
-- para o mesmo lugar, e deixa explícito que o dono do dado é o Google.
--
-- O limite de cache de 30 dias do Google mora na POLICY, não na query: snapshot vencido deixa
-- de existir para quem lê, mesmo que alguém esqueça o filtro. Esconder não basta, então um
-- purge diário apaga de verdade.
--
-- Ver docs/specs/avaliacoes-google.md

create table if not exists public.google_place_snapshot (
  place_id          text primary key,
  rating            numeric(2,1),
  user_rating_count integer not null default 0,
  maps_uri          text,
  reviews           jsonb not null default '[]'::jsonb,
  fetched_at        timestamptz not null default now(),
  fetch_error       text,
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.google_place_snapshot is
  'Espelho do Google Places por place_id. Conteúdo de terceiro sob cache de 30 dias: '
  'a policy de select aplica o TTL e purge_google_place_snapshots() apaga o vencido.';
comment on column public.google_place_snapshot.reviews is
  'Conjunto de até 5 avaliações, substituído inteiro a cada refresh. Sem id estável por item, '
  'então é documento e não linha. Guarda a atribuição exigida (autor, foto, links).';
comment on column public.google_place_snapshot.fetch_error is
  'Erro da última tentativa. Falha preserva o snapshot bom: erro de rede não apaga prova social.';
comment on column public.google_place_snapshot.is_hidden is
  'Liga e desliga do hub_admin, por unidade. Mora aqui e não em `location` porque a chave da '
  'tabela é o lugar, então esconder por place_id já é esconder por unidade. Não existe esconder '
  'avaliação individual: seria escolher a dedo conteúdo de terceiro.';

create index if not exists google_place_snapshot_fetched_at_idx
  on public.google_place_snapshot (fetched_at);

drop trigger if exists set_updated_at on public.google_place_snapshot;
create trigger set_updated_at
  before update on public.google_place_snapshot
  for each row execute function public.set_updated_at();

alter table public.google_place_snapshot enable row level security;

drop policy if exists google_place_snapshot_read on public.google_place_snapshot;
create policy google_place_snapshot_read on public.google_place_snapshot
  for select to anon, authenticated
  using (not is_hidden and fetched_at > now() - interval '30 days');

drop policy if exists google_place_snapshot_write on public.google_place_snapshot;
create policy google_place_snapshot_write on public.google_place_snapshot
  for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());

grant select on public.google_place_snapshot to anon, authenticated;
grant insert, update, delete on public.google_place_snapshot to authenticated;

-- Purge: a policy esconde, isto apaga. Cumprir o limite de cache exige as duas.
create or replace function public.purge_google_place_snapshots()
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare v_deleted integer;
begin
  delete from public.google_place_snapshot
   where fetched_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end; $fn$;

-- Default privilege do Supabase deixa função nova executável por anon/authenticated.
-- Isto aqui é manutenção interna, então revoga nominal e não só `from public`.
revoke all on function public.purge_google_place_snapshots() from public, anon, authenticated;

select cron.schedule(
  'purge-google-place-snapshots',
  '23 4 * * *',
  $job$ select public.purge_google_place_snapshots(); $job$
);
