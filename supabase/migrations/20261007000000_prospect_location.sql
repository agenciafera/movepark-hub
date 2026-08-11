-- E0.17-a · ADR-010: o lote mapeado não vive na tabela transacional.
--
-- Estacionamento que a Movepark mapeou e que NÃO tem contrato mora em
-- `prospect_location`, nunca em `company` + `location`. A tabela não tem preço, tipo de
-- vaga, `checkout_mode`, `is_listed`, `take_rate_bps` nem recebedor, e nenhuma FK de
-- `booking`, `review`, `fare` ou `payout_*` aponta para cá: o estado impossível é
-- impossível por AUSÊNCIA DE COLUNA, não por trigger.
--
-- A medição que decidiu (10/08/2026): 52 funções fazem `from public.location` e só 2
-- filtram `is_listed`. Um trigger de guarda protegeria duas colunas e deixaria 50 funções
-- descobertas, sem impedir que `booking.location_id` apontasse para lote sem contrato.
--
-- Regra de crescimento: campo novo só entra aqui se aparecer na página de destino, e se
-- alguém pedir horário, tem que vir nullable. Em `location`, `is_24h` é NOT NULL DEFAULT
-- true, e emitir schema a partir dele faria o Hub afirmar ao Google um horário que
-- ninguém verificou.
--
-- Ver docs/specs/lote-mapeado-vitrine.md.

-- A expressão da coluna gerada é resolvida aqui, no CREATE TABLE: as funções do PostGIS
-- (schema `extensions`) precisam estar visíveis, igual em 20260618000000_geo_postgis.sql.
set search_path = public, extensions;

-- ── 1. A tabela: ~18 colunas contra as 64 de company + location ──────────────────────
create table public.prospect_location (
  id uuid primary key default gen_random_uuid(),

  -- `on delete restrict`: apagar um destino que ainda tem lote mapeado é engano, não
  -- limpeza. Em `location` o vínculo é `set null` porque lá o lote sobrevive sem destino;
  -- aqui a ficha existe justamente para aparecer na página de um destino.
  destination_id uuid not null references public.destination (id) on delete restrict,

  name text not null,
  slug text not null,
  address text,
  phone text,

  latitude numeric not null,
  longitude numeric not null,

  -- Gerada e materializada, igual à de `location`. O índice GiST abaixo é o que mantém o
  -- ADR-001 valendo: distância ao terminal continua sendo ST_Distance em tempo de
  -- consulta, nunca coluna.
  geog extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,

  google_place_id text,
  google_maps_url text,

  amenities jsonb not null default '[]'::jsonb,
  description text,

  data_source text not null default 'manual'
    check (data_source in ('manual', 'google_places', 'import_wp')),

  is_published boolean not null default false,

  notified_owner_at timestamptz,
  last_reviewed_at timestamptz,

  converted_location_id uuid references public.location (id) on delete set null,
  converted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prospect_location_slug_key unique (slug),
  constraint prospect_location_google_place_id_key unique (google_place_id),

  -- Procedência é par. A implicação é de mão única de propósito: `on delete set null`
  -- pode zerar o `converted_location_id` de uma ficha já convertida, e isso é aceitável
  -- (o carimbo de quando fica). O que não pode é apontar para uma `location` sem carimbar
  -- a data, porque é o `converted_at is null` que tira a ficha da página de destino: sem
  -- ele a ficha e a unidade nova apareceriam juntas, disputando a mesma busca.
  constraint prospect_location_converted_pair_check
    check (converted_location_id is null or converted_at is not null)
);

comment on table public.prospect_location is
  'Lote mapeado pela Movepark, sem contrato (E0.17 · ADR-010). Sem preço, sem checkout_mode, sem FK de booking: o estado impossível é impossível por ausência de coluna. Vira location só pela conversão da reivindicação. Ver docs/specs/lote-mapeado-vitrine.md.';

comment on column public.prospect_location.is_published is
  'Liga/desliga a exibição na página de destino. Nasce false de propósito: cadastro entra rascunho e só aparece depois de revisado. Publicar com dado errado queima o contato comercial antes da primeira conversa.';

comment on column public.prospect_location.converted_location_id is
  'Procedência da conversão, gravada aqui (na tabela enxuta) para location não engordar. Responde num select quantos dos mapeados viraram parceiro.';

comment on column public.prospect_location.google_place_id is
  'Chave de deduplicação (D-009) e o único campo do Google Places que pode ser armazenado indefinidamente. Foto e demais conteúdos do Places não podem ser cacheados.';

comment on column public.prospect_location.description is
  'Texto factual escrito por nós. NUNCA copiar o marketing do site do lote: é obra protegida (Lei 9.610/98) e duplicate content.';

comment on column public.prospect_location.geog is
  'Coluna gerada (não inserir). Distância ao terminal sai de ST_Distance em tempo de consulta (ADR-001), nunca de coluna materializada.';

-- ── 2. Índices ───────────────────────────────────────────────────────────────────────
create index prospect_location_geog_idx
  on public.prospect_location using gist (geog);

-- Caminho de leitura da página de destino. O predicado da consulta também filtra
-- `converted_at is null`, que implica este parcial, então o índice serve os dois.
create index prospect_location_published_destination_idx
  on public.prospect_location (destination_id)
  where is_published;

-- Uma `location` nasce de no máximo uma ficha mapeada. É o par do check de idempotência
-- de `convert_prospect_location` (E0.17-g), não o substituto dele.
create unique index prospect_location_converted_location_idx
  on public.prospect_location (converted_location_id)
  where converted_location_id is not null;

-- ── 3. updated_at ────────────────────────────────────────────────────────────────────
create trigger prospect_location_set_updated_at
  before update on public.prospect_location
  for each row execute function public.set_updated_at();

-- ── 4. Sugestão de destino a partir da geo ───────────────────────────────────────────
-- Mesmo espírito de `location_set_destination_trg`: preencher destino à mão em dezenas de
-- lotes é onde entra erro. `destination_id` é NOT NULL, e a checagem do NOT NULL acontece
-- depois dos triggers BEFORE, então o auto-fill funciona. Sem destino publicado por perto
-- o insert falha (23502), que é o certo: ficha órfã não tem página onde aparecer.
create or replace function public.prospect_location_set_destination()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.destination_id is null
     and new.latitude is not null and new.longitude is not null then
    new.destination_id := public.nearest_destination(new.latitude, new.longitude);
  end if;
  return new;
end $$;

create trigger prospect_location_set_destination_trg
  before insert on public.prospect_location
  for each row execute function public.prospect_location_set_destination();

-- ── 5. Slug único também contra location.slug ────────────────────────────────────────
-- A rota da single resolve `location` primeiro e cai na ficha mapeada depois. Slug
-- repetido não dá erro em lugar nenhum: ele some a ficha, e some justamente a URL que
-- tinha ranking, que é o motivo deste épico existir. Postgres não tem unique entre
-- tabelas, então a única forma é checar na origem.
--
-- Só conta `location` viva: slug de unidade soft-deletada está livre, e isso é
-- proposital. A higiene do legado (E0.17-b) vai aposentar lotes mortos que podem voltar
-- como ficha mapeada com a MESMA URL. Se a E0.17-b resolver por `status = 'inactive'` em
-- vez de `deleted_at`, esses slugs continuam bloqueados aqui.
create or replace function public.prospect_location_guard_slug()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  if exists (
    select 1
    from public.location l
    where l.slug = new.slug
      and l.deleted_at is null
      and (new.converted_location_id is null or l.id <> new.converted_location_id)
  ) then
    raise exception
      'slug "%" já pertence a uma unidade em location; a rota resolve location primeiro e a ficha mapeada ficaria inalcançável',
      new.slug
      using errcode = '23505';
  end if;

  return new;
end $$;

create trigger prospect_location_guard_slug_trg
  before insert or update of slug on public.prospect_location
  for each row execute function public.prospect_location_guard_slug();

-- Função-trigger não é RPC. No Supabase, função nova em `public` nasce com EXECUTE para
-- anon/authenticated por default privilege, e `revoke ... from public` não desfaz um
-- grant nominal. Revogar não afeta o disparo do trigger. Invariante em
-- supabase/tests/anon_privileged_rpcs.test.sql.
revoke all on function public.prospect_location_set_destination() from public, anon, authenticated;
revoke all on function public.prospect_location_guard_slug() from public, anon, authenticated;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────────────
alter table public.prospect_location enable row level security;

-- Leitura pública só do que está publicado e ainda não virou parceiro. `converted_at is
-- null` está na policy, não só na query: ficha convertida virou `location` e apareceria
-- duas vezes na mesma busca. O hub_admin vê rascunho e convertido pela segunda condição,
-- que é o que o painel do E0.17-h precisa.
create policy prospect_location_select on public.prospect_location
  for select using (
    (is_published and converted_at is null) or public.is_hub_admin()
  );

-- Não existe papel de parceiro aqui: enquanto a ficha é mapeada, ninguém de fora edita.
create policy prospect_location_admin_write on public.prospect_location
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());
