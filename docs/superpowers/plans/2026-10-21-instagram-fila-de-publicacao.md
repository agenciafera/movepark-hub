# Fila de publicação do Instagram (E3.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a plataforma recebe o post pronto da skill `instagram`, guarda numa fila, mostra para um `hub_admin` aprovar em `/manager/social` e publica sozinha no Instagram da Movepark na hora marcada, com rastro de cada chamada à Meta.

**Architecture:** duas tabelas (`social_post`, `social_post_event`) com escrita só por Edge (service role) e por RPCs `SECURITY DEFINER`; Edge `social-draft` (entrada, com conferência no servidor) e Edge `social-dispatch` (publicação, chamada pelo `pg_cron` a cada 15 min, com a chave `social_dispatch_enabled` nascendo desligada); o cliente da Graph API sai da `publish-instagram` para `_shared/instagram.ts` e passa a ser usado pelas duas. A tela é um Manager comum (TanStack Query + RPC). A skill ganha um script que envia o rascunho.

**Tech Stack:** Postgres (Supabase) + pgTAP, Edge Functions Deno + `deno test`, React 18 + TanStack Query + Vitest/Testing Library, Node 22 para o script da skill.

**Spec:** [`docs/specs/instagram-fila-de-publicacao.md`](../../specs/instagram-fila-de-publicacao.md)

## Global Constraints

- Trabalho direto na `main`. Commit por tarefa, `git push origin main` ao fim de cada uma. Rodar `git status` antes de todo commit e não deixar arquivo não rastreado que o código use.
- Gerenciador é o **bun** (`bun run …`, `bunx …`). Nada de npm/yarn.
- **Supabase é só na nuvem** (projeto `mgaigbezdalbyuqiofcf`). Proibido `supabase start`, `supabase test db` e qualquer Docker local. pgTAP roda contra o banco vivo dentro de uma transação com `rollback` (receita na Tarefa 1).
- Migration se aplica pelo MCP `apply_migration` (ou `supabase db query --linked -f` + `supabase migration repair --status applied <versão>`), **nunca** `supabase db push`. Carimbo do arquivo único, conferido com `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` (saída vazia).
- **Não commitar `src/types/database.ts` regenerado** nesta entrega: o `gen:types` vem derrubando tabelas e funções. Os tipos da fila são escritos à mão em `src/types/domain.ts`, e o cliente sem tipo fica restrito a `src/features/social/api.ts`.
- Função nova no schema `public` nasce executável por `anon` e `authenticated`: revogar **por nome** (`from public, anon` ou `from public, anon, authenticated`).
- Edge pública: `verify_jwt = false` em `supabase/config.toml` e deploy com `--no-verify-jwt`.
- Toda string que um humano lê (UI, e-mail, mensagem de erro da Edge que aparece na tela) em pt-BR, **sem travessão `—` nem traço `–`**, e passando pela skill `revisar-texto` antes do commit da tarefa que a cria.
- Marca escrita **Movepark**. Nunca "MovePark", "Move Park" ou "MOVEPARK" em texto de exibição.
- Imports do front pelo alias `@/`. Tipos de domínio vêm de `@/types/domain`.
- Nada publica no Instagram até a Tarefa 9, e lá só com aprovação e chave ligadas por um humano.
- Antes de concluir: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:edge` verdes; `/security-review` e advisors do Supabase sem regressão.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261130180000_social_post.sql` | tabelas, enums, RLS, RPCs `social_post_*`, chave `social_dispatch_enabled` |
| `supabase/migrations/20261130190000_social_dispatch_cron.sql` | segredo no Vault e cron da `social-dispatch` |
| `supabase/tests/social_post.test.sql` | pgTAP da fila |
| `supabase/functions/_shared/instagram-validate.ts` (+ `.test.ts`) | conferência de texto e de JPEG, limites da Meta |
| `supabase/functions/_shared/instagram.ts` (+ `.test.ts`) | cliente da Graph API (container, espera, publicação, permalink, busca) |
| `supabase/functions/publish-instagram/index.ts`, `logic.ts` | passam a usar os dois módulos acima |
| `supabase/functions/social-draft/logic.ts`, `index.ts`, `index.test.ts` | entrada do rascunho e correção de legenda |
| `supabase/functions/social-dispatch/logic.ts`, `index.ts`, `index.test.ts` | rodada de publicação |
| `supabase/config.toml` | `verify_jwt = false` das duas Edges novas |
| `src/types/domain.ts` | tipos curados da fila |
| `src/features/social/social.logic.ts` (+ `.test.ts`) | regras puras da tela |
| `src/features/social/api.ts` | hooks de dados |
| `src/features/social/SocialPostDetail.tsx` | diálogo do post |
| `src/routes/manager/social.tsx` (+ `.test.tsx`) | página `/manager/social` |
| `src/routes.tsx`, `src/components/shared/nav-items.ts` | rota e item de menu |
| `.claude/skills/instagram/scripts/enviar-rascunho.mjs` | envio do rascunho pela skill |
| `.claude/skills/instagram/SKILL.md`, `references/api-instagram.md` | Passo 11 e correções da referência |
| `docs/specs/instagram-fila-de-publicacao.md`, `docs/specs/README.md` | spec e catálogo |

---

### Task 1: Migration da fila, com pgTAP

**Files:**
- Create: `supabase/migrations/20261130180000_social_post.sql`
- Create: `supabase/tests/social_post.test.sql`
- Modify: `docs/specs/instagram-fila-de-publicacao.md` (tabela de transições e lista de `kind`)

**Interfaces:**
- Produces: tabelas `public.social_post`, `public.social_post_event`; enums `social_post_status` (`pending_review`, `approved`, `publishing`, `published`, `failed`, `rejected`, `overdue`) e `social_post_kind` (`image`, `carousel`); RPCs `social_post_approve(p_id uuid) returns void`, `social_post_reject(p_id uuid, p_reason text) returns void`, `social_post_reschedule(p_id uuid, p_at timestamptz) returns void`; auxiliar `social_post_day_taken(p_id uuid, p_at timestamptz) returns boolean` (só service_role); `app_setting.social_dispatch_enabled = 'false'`. Valores aceitos em `social_post_event.kind`: `draft_received`, `caption_edited`, `approved`, `rejected`, `rescheduled`, `dry_run`, `container_child`, `container_parent`, `container_status`, `media_publish`, `permalink`, `consulta`, `reconciled`, `overdue`, `failed`.

- [ ] **Step 1: Escrever o teste pgTAP**

Criar `supabase/tests/social_post.test.sql`:

```sql
-- pgTAP: fila de publicação do Instagram (E3.6).
-- Migration: 20261130180000_social_post.sql
-- Spec: docs/specs/instagram-fila-de-publicacao.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. só hub_admin lê a fila, e cliente nenhum escreve direto nela: o que sai daqui é
--      publicação pública com a marca da Movepark;
--   2. post com bloqueio da conferência, ou com a data já passada, não é aprovado;
--   3. dois posts no mesmo dia, no fuso de São Paulo, não convivem (a regra da skill);
--   4. reagendar devolve à fila o post atrasado;
--   5. recusa exige motivo;
--   6. as RPCs não são executáveis por anon, e a auxiliar de dia não sai do servidor.
--
-- Roda em transação com rollback.

begin;
select plan(23);

-- Três posts: "a" limpo daqui a 3 dias ao meio-dia, "b" com bloqueio, "c" no mesmo dia de "a".
insert into public.social_post (id, draft_key, kind, caption, slides, scheduled_at, validation)
values
  ('a0000000-0000-4000-8000-00000000000a', 'pgtap-a:1', 'image', 'Legenda do post a',
   '[{"url":"https://exemplo.co/a.jpg","path":"social/pgtap/a.jpg","alt":"pátio a","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 days 12 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":[],"warnings":[]}'),
  ('b0000000-0000-4000-8000-00000000000b', 'pgtap-b:1', 'image', 'Legenda do post b',
   '[{"url":"https://exemplo.co/b.jpg","path":"social/pgtap/b.jpg","alt":"pátio b","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '6 days 12 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":["Promessa de transação na legenda: \"vaga garantida\" (ADR-009)."],"warnings":[]}'),
  ('c0000000-0000-4000-8000-00000000000c', 'pgtap-c:1', 'image', 'Legenda do post c',
   '[{"url":"https://exemplo.co/c.jpg","path":"social/pgtap/c.jpg","alt":"pátio c","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 days 15 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":[],"warnings":[]}');

-- ── 1. estrutura ────────────────────────────────────────────────────────────────────
select has_table('public', 'social_post', 'a fila existe');
select has_table('public', 'social_post_event', 'o rastro existe');
select ok((select relrowsecurity from pg_class where oid = 'public.social_post'::regclass), 'a fila tem RLS ligada');
select ok((select relrowsecurity from pg_class where oid = 'public.social_post_event'::regclass), 'o rastro tem RLS ligada');
select is(has_function_privilege('anon', 'public.social_post_approve(uuid)', 'execute'), false, 'anon não aprova post');
select is(has_function_privilege('authenticated', 'public.social_post_day_taken(uuid, timestamp with time zone)', 'execute'), false, 'a auxiliar de dia não é chamável pelo cliente');
select is((select value from public.app_setting where key = 'social_dispatch_enabled'), 'false', 'a publicação automática nasce desligada');

-- ── 2. quem não é hub_admin ─────────────────────────────────────────────────────────
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-cliente@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer')
    on conflict (id) do update set role = 'customer';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select throws_ok($$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a')$$, '42501', null, 'quem não é hub_admin não aprova');

set local role authenticated;
select is((select count(*)::int from public.social_post), 0, 'quem não é hub_admin não enxerga a fila');
select throws_ok(
  $$insert into public.social_post (draft_key, kind, caption, slides, scheduled_at) values ('pgtap-x:1', 'image', 'x', '[{"url":"u"}]', now() + interval '1 day')$$,
  '42501', null, 'cliente nenhum escreve direto na fila');
reset role;

-- ── 3. hub_admin ────────────────────────────────────────────────────────────────────
-- Usuário criado aqui: a RPC lê o papel do profiles, não do JWT.
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;
select is((select count(*)::int from public.social_post where draft_key like 'pgtap-%'), 3, 'hub_admin enxerga a fila');
reset role;

select lives_ok($$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a')$$, 'hub_admin aprova post limpo com data futura');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'approved', 'o post aprovado fica approved');
select ok(exists(select 1 from public.social_post_event where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'approved' and actor is not null), 'a aprovação fica no rastro com quem aprovou');
select throws_ok($$select public.social_post_approve('b0000000-0000-4000-8000-00000000000b')$$, 'P0001', null, 'post com bloqueio da conferência não é aprovado');
select throws_ok($$select public.social_post_approve('c0000000-0000-4000-8000-00000000000c')$$, 'P0001', null, 'dois posts no mesmo dia não convivem');
select throws_ok($$select public.social_post_reschedule('c0000000-0000-4000-8000-00000000000c', now() - interval '1 hour')$$, 'P0001', null, 'reagendar para o passado é recusado');
select lives_ok($$select public.social_post_reschedule('c0000000-0000-4000-8000-00000000000c', (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '4 days 12 hours') at time zone 'America/Sao_Paulo')$$, 'reagendar para um dia livre funciona');

update public.social_post set status = 'overdue' where id = 'a0000000-0000-4000-8000-00000000000a';
select lives_ok($$select public.social_post_reschedule('a0000000-0000-4000-8000-00000000000a', (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '5 days 12 hours') at time zone 'America/Sao_Paulo')$$, 'post atrasado é reagendado');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'approved', 'reagendar o atrasado devolve ele à fila de publicação');

select throws_ok($$select public.social_post_reject('b0000000-0000-4000-8000-00000000000b', '  ')$$, 'P0001', null, 'recusa sem motivo é recusada');
select lives_ok($$select public.social_post_reject('b0000000-0000-4000-8000-00000000000b', 'foto com carro antigo')$$, 'recusa com motivo funciona');
select is((select status::text from public.social_post where id = 'b0000000-0000-4000-8000-00000000000b'), 'rejected', 'o post recusado fica rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Montar o executor de pgTAP no banco vivo**

O `pgtap` não está instalado no projeto, mas `create extension` é transacional. Criar no scratchpad (`$S` = diretório de scratchpad da sessão) o tradutor:

```bash
S="${SCRATCH:-/private/tmp/claude-501/scratch-social}"; mkdir -p "$S"
cat > "$S/tap.py" <<'EOF'
import re, sys
teste = open(sys.argv[1], encoding="utf-8").read()
migration = open(sys.argv[2], encoding="utf-8").read() if sys.argv[2] != "-" else ""
corpo = re.sub(r"^\s*(begin|rollback);\s*$", "", teste, flags=re.M)
corpo = re.sub(r"^\s*select \* from finish\(\);\s*$", "", corpo, flags=re.M)
corpo = re.sub(r"^select (plan|has_table|ok|is|throws_ok|lives_ok)\(",
               r"insert into _tap(line) select \1(", corpo, flags=re.M)
saida = (
    "begin;\ncreate extension if not exists pgtap;\n" + migration +
    "\ncreate temp table _tap(id serial, line text);\n"
    "grant insert, select on _tap to authenticated, anon;\n"
    "grant usage on sequence _tap_id_seq to authenticated, anon;\n" + corpo +
    "\ndo $$ begin raise exception E'TAP\\n%', (select string_agg(line, E'\\n' order by id) from _tap); end $$;\n"
)
open(sys.argv[3], "w", encoding="utf-8").write(saida)
EOF
```

A exceção do fim devolve o TAP inteiro na mensagem de erro e garante o rollback.

- [ ] **Step 3: Rodar o teste sem a migration e ver falhar**

```bash
python3 "$S/tap.py" supabase/tests/social_post.test.sql - "$S/run.sql" && supabase db query --linked -f "$S/run.sql"
```

Expected: erro `relation "public.social_post" does not exist` (o insert da fixture falha antes do primeiro assert).

- [ ] **Step 4: Escrever a migration**

Criar `supabase/migrations/20261130180000_social_post.sql`:

```sql
-- Fila de publicação do Instagram (E3.6).
--
-- A plataforma não gera conteúdo: o post chega pronto da skill `instagram` (Claude, com a foto do
-- Higgsfield pelo MCP), pela Edge `social-draft`, e espera aqui até um hub_admin aprovar. A Edge
-- `social-dispatch`, chamada pelo pg_cron, publica na hora marcada, um por dia, e só com
-- `app_setting.social_dispatch_enabled = 'true'`.
--
-- Escrita: só a Edge (service role) e as RPCs definer abaixo. Cliente nenhum escreve direto,
-- porque o que sai daqui é publicação pública com a marca da Movepark.
--
-- Ver docs/specs/instagram-fila-de-publicacao.md.

create type public.social_post_status as enum (
  'pending_review', 'approved', 'publishing', 'published', 'failed', 'rejected', 'overdue'
);

create type public.social_post_kind as enum ('image', 'carousel');

create table public.social_post (
  id uuid primary key default gen_random_uuid(),
  -- `<origem>:<corte>`. Reenviar o mesmo rascunho atualiza a linha enquanto ela espera aprovação.
  draft_key text not null unique,
  status public.social_post_status not null default 'pending_review',
  kind public.social_post_kind not null,
  caption text not null,
  -- [{ url, path, alt, texto }] em ordem. 10 é o teto da skill (a API aceita 20 desde 2026).
  slides jsonb not null,
  keyphrase text,
  cut_number smallint check (cut_number between 1 and 4),
  blog_post_id uuid references public.blog_post(id) on delete set null,
  destination_id uuid references public.destination(id) on delete set null,
  cta_url text,
  -- Data de referência de todo R$ do post. A conferência bloqueia R$ sem ela.
  price_date date,
  scheduled_at timestamptz not null,
  -- { blockers: [], warnings: [] }. Escrito só pela Edge, que é onde a conferência roda.
  validation jsonb not null default '{"blockers": [], "warnings": []}'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  -- Gravado assim que o container pai existe: deixa a nova tentativa consultar a Meta antes de
  -- publicar, para o mesmo post nunca sair duas vezes.
  ig_container_id text,
  ig_media_id text,
  ig_permalink text,
  published_at timestamptz,
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_post_slides_validos check (
    jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 1 and 10
  ),
  constraint social_post_kind_bate check (
    (kind = 'image') = (jsonb_array_length(slides) = 1)
  ),
  constraint social_post_publicado_tem_midia check (
    status <> 'published' or ig_media_id is not null
  )
);

create index social_post_fila_idx on public.social_post (status, scheduled_at)
  where deleted_at is null;

create trigger social_post_set_updated_at
  before update on public.social_post
  for each row execute function public.set_updated_at();

comment on table public.social_post is
  'Fila de publicação do Instagram (E3.6). Entra pela Edge social-draft, sai pela social-dispatch. Só hub_admin lê; escrita só por Edge e RPC definer.';

create table public.social_post_event (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_post(id) on delete cascade,
  kind text not null check (kind in (
    'draft_received', 'caption_edited', 'approved', 'rejected', 'rescheduled', 'dry_run',
    'container_child', 'container_parent', 'container_status', 'media_publish', 'permalink',
    'consulta', 'reconciled', 'overdue', 'failed'
  )),
  http_status integer,
  -- Caminho, método e campos da chamada à Graph API. NUNCA o access_token.
  request jsonb,
  response jsonb,
  note text,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index social_post_event_post_idx on public.social_post_event (social_post_id, created_at);

comment on table public.social_post_event is
  'Rastro da fila do Instagram: toda chamada à Meta e toda decisão humana, como o payment_gateway_event faz com a Pagar.me.';

-- ── RLS: leitura só de hub_admin, escrita de ninguém pelo cliente ─────────────────────
alter table public.social_post enable row level security;
alter table public.social_post_event enable row level security;

create policy social_post_admin_read on public.social_post
  for select to authenticated using (public.is_hub_admin());
create policy social_post_event_admin_read on public.social_post_event
  for select to authenticated using (public.is_hub_admin());

revoke all on public.social_post, public.social_post_event from anon;
revoke insert, update, delete, truncate on public.social_post, public.social_post_event from authenticated;

-- ── A chave do disparo ────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value)
values ('social_dispatch_enabled', 'false')
on conflict (key) do nothing;

-- ── Um post por dia, no fuso de São Paulo ─────────────────────────────────────────────
create or replace function public.social_post_day_taken(p_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.social_post s
     where s.id <> p_id
       and s.deleted_at is null
       and s.status in ('approved', 'publishing', 'published')
       and (coalesce(s.published_at, s.scheduled_at) at time zone 'America/Sao_Paulo')::date
         = (p_at at time zone 'America/Sao_Paulo')::date
  );
$$;

revoke all on function public.social_post_day_taken(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.social_post_day_taken(uuid, timestamptz) to service_role;

-- ── Aprovar ───────────────────────────────────────────────────────────────────────────
create or replace function public.social_post_approve(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status <> 'pending_review' then
    raise exception 'Só post aguardando aprovação pode ser aprovado (está %).', p.status using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p.validation -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'O post tem bloqueios da conferência e não pode ser aprovado.' using errcode = 'P0001';
  end if;
  if p.scheduled_at <= now() then
    raise exception 'A data do post já passou. Reagende antes de aprovar.' using errcode = 'P0001';
  end if;
  if public.social_post_day_taken(p.id, p.scheduled_at) then
    raise exception 'Já existe post agendado ou publicado nesse dia.' using errcode = 'P0001';
  end if;

  update public.social_post
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, actor)
  values (p_id, 'approved', auth.uid());
end;
$$;

revoke all on function public.social_post_approve(uuid) from public, anon;
grant execute on function public.social_post_approve(uuid) to authenticated, service_role;

-- ── Recusar ───────────────────────────────────────────────────────────────────────────
create or replace function public.social_post_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Diga o motivo da recusa.' using errcode = 'P0001';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode mais ser recusado (está %).', p.status using errcode = 'P0001';
  end if;

  update public.social_post set status = 'rejected' where id = p_id;

  insert into public.social_post_event (social_post_id, kind, note, actor)
  values (p_id, 'rejected', v_motivo, auth.uid());
end;
$$;

revoke all on function public.social_post_reject(uuid, text) from public, anon;
grant execute on function public.social_post_reject(uuid, text) to authenticated, service_role;

-- ── Reagendar (é também o "tentar de novo" do post que falhou) ────────────────────────
create or replace function public.social_post_reschedule(p_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;
  if p_at is null or p_at <= now() then
    raise exception 'A nova data precisa estar no futuro.' using errcode = 'P0001';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode ser reagendado (está %).', p.status using errcode = 'P0001';
  end if;
  if public.social_post_day_taken(p.id, p_at) then
    raise exception 'Já existe post agendado ou publicado nesse dia.' using errcode = 'P0001';
  end if;

  update public.social_post
     set scheduled_at = p_at,
         status = case
           when p.status in ('overdue', 'failed') then 'approved'::public.social_post_status
           else p.status
         end,
         last_error = case when p.status = 'failed' then null else p.last_error end
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, request, actor)
  values (p_id, 'rescheduled',
          jsonb_build_object('de', p.scheduled_at, 'para', p_at, 'status_anterior', p.status),
          auth.uid());
end;
$$;

revoke all on function public.social_post_reschedule(uuid, timestamptz) from public, anon;
grant execute on function public.social_post_reschedule(uuid, timestamptz) to authenticated, service_role;
```

Conferir o carimbo: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` → saída vazia.

- [ ] **Step 5: Rodar o teste com a migration e ver passar**

```bash
python3 "$S/tap.py" supabase/tests/social_post.test.sql supabase/migrations/20261130180000_social_post.sql "$S/run.sql" && supabase db query --linked -f "$S/run.sql" 2>&1 | grep -E "^(not )?ok|^1\.\." 
```

Expected: `1..23` e 23 linhas `ok`, nenhuma `not ok`. Nada fica no banco (a exceção final faz rollback).

- [ ] **Step 6: Aplicar a migration no projeto**

Pelo MCP: `apply_migration(project_id: "mgaigbezdalbyuqiofcf", name: "social_post", query: <conteúdo do arquivo>)`. Sem o MCP: `supabase db query --linked -f supabase/migrations/20261130180000_social_post.sql && supabase migration repair --status applied 20261130180000`.

Conferir:

```sql
select (select count(*) from information_schema.tables where table_name in ('social_post','social_post_event')) as tabelas,
       (select value from public.app_setting where key = 'social_dispatch_enabled') as chave,
       (select string_agg(grantee, ',' order by grantee) from information_schema.role_routine_grants where routine_name = 'social_post_day_taken') as quem_chama_dia;
```

Expected: `tabelas = 2`, `chave = false`, `quem_chama_dia` sem `anon` nem `authenticated`.

- [ ] **Step 7: Ajustar a spec ao que a migration faz**

Em `docs/specs/instagram-fila-de-publicacao.md`, na tabela de transições, trocar a linha

`| \`pending_review\`, \`approved\` | \`rejected\` | \`hub_admin\` | com motivo |`

por

`| \`pending_review\`, \`approved\`, \`overdue\`, \`failed\` | \`rejected\` | \`hub_admin\` | com motivo |`

e trocar

`| \`overdue\`, \`failed\` | \`approved\` | \`hub_admin\` | reagendou para o futuro (é o "Tentar de novo") |`

por

`| \`overdue\`, \`failed\` | \`approved\` | \`hub_admin\` | reagendou para o futuro (é o "Tentar de novo"). Reagendar \`pending_review\` ou \`approved\` só muda a data |`

e, na tabela de `social_post_event`, acrescentar `consulta` à lista de `kind`, logo depois de `permalink`. Na tabela de RPCs, a linha de `social_post_reschedule` passa a dizer "aceita `pending_review`, `approved`, `overdue` e `failed`".

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261130180000_social_post.sql supabase/tests/social_post.test.sql docs/specs/instagram-fila-de-publicacao.md
git commit -m "feat(instagram): fila social_post com aprovação por hub_admin e um post por dia (E3.6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Conferência no servidor (`_shared/instagram-validate.ts`)

**Files:**
- Create: `supabase/functions/_shared/instagram-validate.ts`
- Create: `supabase/functions/_shared/instagram-validate.test.ts`
- Modify: `supabase/functions/publish-instagram/logic.ts:9-15` (os limites passam a vir do módulo)

**Interfaces:**
- Produces:
  - `LIMITES: { legenda: 2200; hashtags: 30; mencoes: 20; slides: 10; alt: 1000; bytes: 8388608; larguraMin: 320; larguraMax: 1440 }`
  - `interface SlideTexto { alt?: string | null; texto?: string | null }`
  - `interface PostTexto { caption: string; slides: SlideTexto[]; keyphrase?: string | null; priceDate?: string | null; hoje?: Date }`
  - `interface Conferencia { blockers: string[]; warnings: string[] }`
  - `conferirTexto(p: PostTexto): Conferencia`
  - `hashtagsDe(caption: string): string[]`
  - `interface ImagemInfo { jpeg: boolean; largura: number; altura: number; bytes: number }`
  - `lerJpeg(bytes: Uint8Array): ImagemInfo`
  - `conferirImagem(info: ImagemInfo, nome: string): string[]` (lista vazia = passa)

- [ ] **Step 1: Escrever os testes**

Criar `supabase/functions/_shared/instagram-validate.test.ts`:

```ts
// A conferência que o servidor repete antes de um post entrar na fila do Instagram (E3.6).
// Cada bloqueio aqui é algo que quebraria a publicação na Meta ou a marca da Movepark.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conferirImagem, conferirTexto, LIMITES, lerJpeg } from "./instagram-validate.ts";

const LEGENDA_BOA =
  "Estacionamento no aeroporto de Confins: a diária mais barata nem sempre fecha a semana mais barata.\n\n" +
  "A conta muda pelo traslado.\n\nO guia completo está no link da bio.\n\n#confins #estacionamentoaeroporto #movepark";
const SLIDES_BONS = [
  { alt: "pátio coberto de estacionamento em Confins ao entardecer", texto: "O mais barato na diária" },
  { alt: "van de traslado parada na saída do estacionamento", texto: "O traslado decide a conta" },
];
const KEY = "estacionamento no aeroporto de Confins";

const conferir = (over: Partial<Parameters<typeof conferirTexto>[0]> = {}) =>
  conferirTexto({ caption: LEGENDA_BOA, slides: SLIDES_BONS, keyphrase: KEY, ...over });

Deno.test("post bem escrito passa sem bloqueio e sem aviso", () => {
  assertEquals(conferir(), { blockers: [], warnings: [] });
});

Deno.test("legenda vazia bloqueia", () => {
  assertEquals(conferir({ caption: "   " }).blockers.includes("A legenda está vazia."), true);
});

Deno.test("legenda acima de 2.200 caracteres bloqueia", () => {
  const r = conferir({ caption: "a".repeat(LIMITES.legenda + 1) });
  assertEquals(r.blockers.some((b) => b.includes("2200")), true);
});

Deno.test("31 hashtags bloqueia e 2 hashtags só avisa", () => {
  const muitas = "Texto. " + Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  assertEquals(conferir({ caption: muitas }).blockers.some((b) => b.includes("31 hashtags")), true);
  const poucas = conferir({ caption: "Estacionamento no aeroporto de Confins sai mais barato. #confins #movepark" });
  assertEquals(poucas.blockers, []);
  assertEquals(poucas.warnings.some((w) => w.includes("2 hashtags")), true);
});

Deno.test("mais de 10 slides bloqueia", () => {
  const slides = Array.from({ length: 11 }, (_, i) => ({ alt: `pátio ${i}`, texto: null }));
  assertEquals(conferir({ slides }).blockers.some((b) => b.includes("11 slides")), true);
});

Deno.test("travessão na legenda e no alt bloqueia", () => {
  assertEquals(conferir({ caption: LEGENDA_BOA.replace(":", " \u2014") }).blockers.some((b) => b.startsWith("Travessão na legenda")), true);
  const slides = [{ alt: "pátio \u2013 vista aérea", texto: null }];
  assertEquals(conferir({ slides }).blockers.some((b) => b.startsWith("Travessão no texto alternativo do slide 1")), true);
});

Deno.test("promessa de transação bloqueia (ADR-009)", () => {
  for (const frase of ["Vaga garantida com antecedência", "você pode cancelar gratuitamente", "preço fixo o ano todo"]) {
    const r = conferir({ caption: `${LEGENDA_BOA}\n${frase}` });
    assertEquals(r.blockers.some((b) => b.includes("ADR-009")), true, frase);
  }
});

Deno.test("marca grafada errada bloqueia, minúscula em hashtag e domínio passa", () => {
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nReserve pela MovePark.` }).blockers.some((b) => b.includes("Movepark")), true);
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nMOVEPARK` }).blockers.some((b) => b.includes("Movepark")), true);
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nmovepark.co` }).blockers, []);
});

Deno.test("R$ sem data de referência bloqueia, com data passa", () => {
  const comPreco = `${LEGENDA_BOA}\nDiárias a partir de R$ 45.`;
  assertEquals(conferir({ caption: comPreco }).blockers.some((b) => b.includes("price_date")), true);
  assertEquals(conferir({ caption: comPreco, priceDate: "2026-10-20", hoje: new Date("2026-10-21T12:00:00-03:00") }).blockers, []);
  const slides = [{ alt: "tabela de preço", texto: "R$ 510 por 30 diárias" }];
  assertEquals(conferir({ slides }).blockers.some((b) => b.includes("price_date")), true);
});

Deno.test("preço conferido há mais de 30 dias avisa", () => {
  const r = conferir({ caption: `${LEGENDA_BOA}\nR$ 45`, priceDate: "2026-09-01", hoje: new Date("2026-10-21T12:00:00-03:00") });
  assertEquals(r.warnings.some((w) => w.includes("50 dias")), true);
});

Deno.test("frase-chave fora dos primeiros 125 caracteres avisa", () => {
  const r = conferir({ caption: `${"Texto de abertura sem a frase. ".repeat(5)}\n${LEGENDA_BOA}` });
  assertEquals(r.warnings.some((w) => w.includes("125")), true);
});

Deno.test("slide sem alt e alt repetido avisam", () => {
  const r = conferir({ slides: [{ alt: "pátio", texto: null }, { alt: "Pátio", texto: null }, { alt: "", texto: null }] });
  assertEquals(r.warnings.some((w) => w.includes("slide 3 está sem texto alternativo")), true);
  assertEquals(r.warnings.some((w) => w.includes("repetido")), true);
});

/** JPEG mínimo: SOI, APP0 de 16 bytes e um SOF0 com altura e largura. */
function jpegFalso(largura: number, altura: number, extra = 0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255, 0x03, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, ...new Array(extra).fill(0)]);
}

Deno.test("lerJpeg lê a largura e a altura do SOF", () => {
  const info = lerJpeg(jpegFalso(1080, 1350));
  assertEquals([info.jpeg, info.largura, info.altura], [true, 1080, 1350]);
});

Deno.test("PNG não é JPEG", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertEquals(conferirImagem(lerJpeg(png), "slide.png")[0].includes("não é JPEG"), true);
});

Deno.test("1080x1350 passa; largura acima de 1440, 9:16 e acima de 8 MB bloqueiam", () => {
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1080, 1350)), "a.jpg"), []);
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1600, 2000)), "b.jpg").some((e) => e.includes("1600 px")), true);
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1080, 1920)), "c.jpg").some((e) => e.includes("proporção")), true);
  const grande = { jpeg: true, largura: 1080, altura: 1350, bytes: LIMITES.bytes + 1 };
  assertEquals(conferirImagem(grande, "d.jpg").some((e) => e.includes("8 MB")), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/instagram-validate.test.ts`
Expected: FAIL com `Module not found ".../instagram-validate.ts"`.

- [ ] **Step 3: Implementar o módulo**

Criar `supabase/functions/_shared/instagram-validate.ts`:

```ts
// Conferência do post do Instagram no servidor (E3.6).
//
// A skill roda o analisador completo antes de enviar. Aqui o servidor repete só o que quebra a
// publicação na Meta ou a marca, porque é o que não pode depender de alguém ter rodado o script.
// Os limites são da API (.claude/skills/instagram/references/api-instagram.md); as regras de
// marca são as do CLAUDE.md e do ADR-009. Ver docs/specs/instagram-fila-de-publicacao.md, seção 2.

export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  mencoes: 20,
  /** A API aceita 20 no carrossel desde 2026; a skill fixa 10. */
  slides: 10,
  alt: 1000,
  bytes: 8 * 1024 * 1024,
  larguraMin: 320,
  larguraMax: 1440,
} as const;

/** Largura sobre altura: de 4:5 (0,8) a 1,91:1, com folga de arredondamento. */
const PROPORCAO_MIN = 0.8 - 0.005;
const PROPORCAO_MAX = 1.91 + 0.005;

export interface SlideTexto {
  alt?: string | null;
  texto?: string | null;
}

export interface PostTexto {
  caption: string;
  slides: SlideTexto[];
  keyphrase?: string | null;
  /** AAAA-MM-DD: a data em que os preços do post foram conferidos. */
  priceDate?: string | null;
  hoje?: Date;
}

export interface Conferencia {
  blockers: string[];
  warnings: string[];
}

/** Promessa de transação (ADR-009): a mesma lista do recorte arquivado do Diego, mais o "cancelar gratuitamente" do post de 26/08. */
const PROMESSAS: { termo: RegExp; rotulo: string }[] = [
  { termo: /vagas?\s+garantidas?/i, rotulo: "vaga garantida" },
  { termo: /cancel(ar|amento)\s+(gr[áa]tis|gratuit[oa]|gratuitamente|sem\s+custo)/i, rotulo: "cancelamento grátis" },
  { termo: /pre[çc]o\s+fixo/i, rotulo: "preço fixo" },
  { termo: /(melhor|menor)\s+pre[çc]o\s+garantido/i, rotulo: "melhor preço garantido" },
  { termo: /reserva\s+garantida/i, rotulo: "reserva garantida" },
  { termo: /satisfa[çc][ãa]o\s+garantida/i, rotulo: "satisfação garantida" },
];

/** Diferencia maiúscula de propósito: "movepark" em hashtag e domínio é normal. */
const MARCA_ERRADA = /\bMove\s?Park\b|\bMOVE\s?PARK\b/;

const normaliza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function hashtagsDe(caption: string): string[] {
  return caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

export function conferirTexto(p: PostTexto): Conferencia {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const caption = typeof p.caption === "string" ? p.caption : "";
  const slides = Array.isArray(p.slides) ? p.slides : [];

  if (!caption.trim()) blockers.push("A legenda está vazia.");
  if (caption.length > LIMITES.legenda) {
    blockers.push(`A legenda tem ${caption.length} caracteres e o limite do Instagram é ${LIMITES.legenda}.`);
  }

  const hashtags = hashtagsDe(caption);
  if (hashtags.length > LIMITES.hashtags) {
    blockers.push(`${hashtags.length} hashtags; o limite do Instagram é ${LIMITES.hashtags}.`);
  } else if (hashtags.length < 3 || hashtags.length > 5) {
    warnings.push(`${hashtags.length} hashtags; a skill recomenda de 3 a 5.`);
  }

  const mencoes = caption.match(/@[A-Za-z0-9._]+/g) ?? [];
  if (mencoes.length > LIMITES.mencoes) {
    blockers.push(`${mencoes.length} menções; o limite do Instagram é ${LIMITES.mencoes}.`);
  }

  if (slides.length === 0) blockers.push("O post não tem imagem.");
  if (slides.length > LIMITES.slides) {
    blockers.push(`${slides.length} slides; a skill fixa o teto em ${LIMITES.slides}.`);
  }

  const textos: { onde: string; texto: string }[] = [{ onde: "na legenda", texto: caption }];
  slides.forEach((s, i) => {
    const n = i + 1;
    const alt = (s?.alt ?? "").trim();
    if (!alt) warnings.push(`O slide ${n} está sem texto alternativo.`);
    if (alt.length > LIMITES.alt) {
      blockers.push(`O texto alternativo do slide ${n} tem ${alt.length} caracteres; o limite é ${LIMITES.alt}.`);
    }
    if (alt) textos.push({ onde: `no texto alternativo do slide ${n}`, texto: alt });
    const t = (s?.texto ?? "").trim();
    if (t) textos.push({ onde: `no texto do slide ${n}`, texto: t });
  });

  const alts = slides.map((s) => normaliza(s?.alt ?? "")).filter(Boolean);
  if (new Set(alts).size < alts.length) warnings.push("Há texto alternativo repetido entre slides.");

  for (const { onde, texto } of textos) {
    if (/[\u2014\u2013]/.test(texto)) {
      blockers.push(`Travessão ${onde}. Troque por ponto, vírgula, dois-pontos ou " - ".`);
    }
    for (const { termo, rotulo } of PROMESSAS) {
      if (termo.test(texto)) blockers.push(`Promessa de transação ${onde}: "${rotulo}" (ADR-009).`);
    }
    if (MARCA_ERRADA.test(texto)) blockers.push(`Marca grafada errada ${onde}. O certo é "Movepark".`);
  }

  const temPreco = textos.some(({ texto }) => /R\$\s?\d/.test(texto));
  if (temPreco && !p.priceDate) {
    blockers.push("O post cita R$ e não tem a data em que o preço foi conferido (price_date).");
  }
  if (p.priceDate) {
    const hoje = p.hoje ?? new Date();
    const conferido = Date.parse(`${p.priceDate}T12:00:00-03:00`);
    const dias = Math.floor((hoje.getTime() - conferido) / 86_400_000);
    if (dias > 30) warnings.push(`O preço foi conferido há ${dias} dias.`);
  }

  if (p.keyphrase && !normaliza(caption.slice(0, 125)).includes(normaliza(p.keyphrase))) {
    warnings.push("A frase-chave não aparece nos primeiros 125 caracteres da legenda.");
  }

  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export interface ImagemInfo {
  jpeg: boolean;
  largura: number;
  altura: number;
  bytes: number;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Lê largura e altura do primeiro SOF. Não decodifica a imagem: só anda pelos marcadores. */
export function lerJpeg(b: Uint8Array): ImagemInfo {
  const nada = { jpeg: false, largura: 0, altura: 0, bytes: b.length };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return nada;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return nada;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      i += 2;
      continue;
    }
    const tamanho = (b[i + 2] << 8) | b[i + 3];
    if (SOF.has(marcador)) {
      if (i + 8 >= b.length) return nada;
      return {
        jpeg: true,
        altura: (b[i + 5] << 8) | b[i + 6],
        largura: (b[i + 7] << 8) | b[i + 8],
        bytes: b.length,
      };
    }
    i += 2 + tamanho;
  }
  return nada;
}

/** Problemas que a Meta recusaria na hora de publicar. Lista vazia: a imagem passa. */
export function conferirImagem(info: ImagemInfo, nome: string): string[] {
  if (!info.jpeg) return [`${nome} não é JPEG. A API do Instagram só aceita JPEG.`];
  const erros: string[] = [];
  if (info.largura < LIMITES.larguraMin || info.largura > LIMITES.larguraMax) {
    erros.push(`${nome} tem ${info.largura} px de largura; o Instagram aceita de ${LIMITES.larguraMin} a ${LIMITES.larguraMax}.`);
  }
  const proporcao = info.altura ? info.largura / info.altura : 0;
  if (proporcao < PROPORCAO_MIN || proporcao > PROPORCAO_MAX) {
    erros.push(`${nome} está em ${info.largura}x${info.altura}; a proporção aceita vai de 4:5 a 1,91:1.`);
  }
  if (info.bytes > LIMITES.bytes) {
    erros.push(`${nome} tem ${(info.bytes / 1048576).toFixed(1)} MB; o limite é 8 MB.`);
  }
  return erros;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/instagram-validate.test.ts`
Expected: todos `ok`.

- [ ] **Step 5: `publish-instagram/logic.ts` passa a usar os limites do módulo**

Em `supabase/functions/publish-instagram/logic.ts`, trocar o bloco

```ts
export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  mencoes: 20,
  slides: 10,
  alt: 1000,
} as const;
```

por

```ts
import { LIMITES } from "../_shared/instagram-validate.ts";

export { LIMITES };
```

(o `import` vai para o topo do arquivo, logo depois do comentário de cabeçalho).

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/publish-instagram/`
Expected: os 14 testes atuais `ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/instagram-validate.ts supabase/functions/_shared/instagram-validate.test.ts supabase/functions/publish-instagram/logic.ts
git commit -m "feat(instagram): conferência de texto e JPEG no servidor, com os limites da Meta num lugar só

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Cliente da Graph API compartilhado (`_shared/instagram.ts`)

**Files:**
- Create: `supabase/functions/_shared/instagram.ts`
- Create: `supabase/functions/_shared/instagram.test.ts`
- Modify: `supabase/functions/publish-instagram/index.ts` (passa a usar o módulo)

**Interfaces:**
- Produces:
  - `VERSAO_PADRAO = "v21.0"`
  - `interface IgConfig { token: string; igUserId: string; versao: string }`
  - `igConfigFromEnv(get: (k: string) => string | undefined): IgConfig | null`
  - `interface GraphResult { ok: boolean; status: number; body: Record<string, unknown> }`
  - `type GraphKind = "container_child" | "container_parent" | "container_status" | "media_publish" | "permalink" | "consulta"`
  - `interface GraphCall { kind: GraphKind; metodo: "GET" | "POST"; caminho: string; campos: Record<string, string>; result: GraphResult }` (sem token)
  - `interface Opcoes { fetcher?: typeof fetch; onCall?: (c: GraphCall) => void | Promise<void>; esperaMs?: number; tentativas?: number }`
  - `graph(cfg, caminho, metodo, campos?, opts?, kind?): Promise<GraphResult>`
  - `esperarContainer(cfg, id, opts?): Promise<{ pronto: boolean; status: string; detalhe?: unknown }>`
  - `statusDoContainer(cfg, id, opts?): Promise<string>`
  - `interface Imagem { url: string; alt?: string | null }`
  - `type ResultadoPublicacao = { ok: true; mediaId: string; containerId: string } | { ok: false; etapa: string; resposta: unknown; containerId?: string }`
  - `publicar(cfg, { caption, images }, opts?: Opcoes & { onContainer?: (id: string) => void | Promise<void> }): Promise<ResultadoPublicacao>`
  - `lerPermalink(cfg, mediaId, opts?): Promise<string | null>`
  - `acharMidiaPorLegenda(cfg, caption, opts?): Promise<{ id: string; permalink: string | null } | null>`

- [ ] **Step 1: Escrever os testes**

Criar `supabase/functions/_shared/instagram.test.ts`:

```ts
// O cliente da Graph API é o único lugar que fala com a Meta. Os testes usam um fetch falso:
// conferem a ordem das chamadas, os campos de cada uma e que o token nunca vai para o rastro.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acharMidiaPorLegenda, type GraphCall, igConfigFromEnv, publicar } from "./instagram.ts";

const CFG = { token: "TOKEN-SECRETO", igUserId: "17841", versao: "v21.0" };

function fetchFalso(respostas: Array<{ status?: number; body: unknown }>) {
  const chamadas: { url: string; corpo: string }[] = [];
  let i = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), corpo: init?.body ? String(init.body) : "" });
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fetcher, chamadas };
}

const rapido = { esperaMs: 0, tentativas: 2 };

Deno.test("carrossel: um container por slide, o pai com os filhos, espera e publica", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "c1" } },
    { body: { id: "c2" } },
    { body: { id: "pai" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const containers: string[] = [];
  const r = await publicar(
    CFG,
    { caption: "Legenda", images: [{ url: "https://x.co/1.jpg", alt: "um" }, { url: "https://x.co/2.jpg", alt: "dois" }] },
    { ...rapido, fetcher, onContainer: (id) => void containers.push(id) },
  );
  assertEquals(r, { ok: true, mediaId: "midia", containerId: "pai" });
  assertEquals(chamadas.length, 5);
  assertEquals(chamadas[0].corpo.includes("is_carousel_item=true"), true);
  assertEquals(chamadas[0].corpo.includes("alt_text=um"), true);
  assertEquals(chamadas[2].corpo.includes("media_type=CAROUSEL"), true);
  assertEquals(decodeURIComponent(chamadas[2].corpo).includes("children=c1,c2"), true);
  assertEquals(chamadas[4].url.endsWith("/17841/media_publish"), true);
  assertEquals(containers, ["pai"]);
});

Deno.test("post único: um container com legenda, espera e publica", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "unico" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const r = await publicar(CFG, { caption: "Legenda", images: [{ url: "https://x.co/1.jpg" }] }, { ...rapido, fetcher });
  assertEquals(r.ok, true);
  assertEquals(chamadas.length, 3);
  assertEquals(chamadas[0].corpo.includes("caption=Legenda"), true);
});

Deno.test("falha no segundo slide para antes de criar o pai e de publicar", async () => {
  const { fetcher, chamadas } = fetchFalso([
    { body: { id: "c1" } },
    { status: 400, body: { error: { message: "Only photo or video can be accepted as media type." } } },
  ]);
  const r = await publicar(
    CFG,
    { caption: "x", images: [{ url: "https://x.co/1.jpg" }, { url: "https://x.co/2.jpg" }] },
    { ...rapido, fetcher },
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.etapa, "container do slide 2");
  assertEquals(chamadas.length, 2);
});

Deno.test("container com ERROR não é publicado e devolve o id do container", async () => {
  const { fetcher } = fetchFalso([{ body: { id: "unico" } }, { body: { status_code: "ERROR", status: "falhou" } }]);
  const r = await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, { ...rapido, fetcher });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals([r.etapa, r.containerId], ["container não ficou pronto", "unico"]);
});

Deno.test("o rastro recebe toda chamada e nunca o token", async () => {
  const { fetcher } = fetchFalso([
    { body: { id: "unico" } },
    { body: { status_code: "FINISHED" } },
    { body: { id: "midia" } },
  ]);
  const rastro: GraphCall[] = [];
  await publicar(CFG, { caption: "x", images: [{ url: "https://x.co/1.jpg" }] }, {
    ...rapido,
    fetcher,
    onCall: (c) => void rastro.push(c),
  });
  assertEquals(rastro.map((c) => c.kind), ["container_parent", "container_status", "media_publish"]);
  assertEquals(JSON.stringify(rastro).includes("TOKEN-SECRETO"), false);
});

Deno.test("acharMidiaPorLegenda acha pela legenda, ignorando espaço nas pontas", async () => {
  const { fetcher } = fetchFalso([
    { body: { data: [{ id: "m9", caption: "Outra" }, { id: "m1", caption: "Legenda certa\n", permalink: "https://www.instagram.com/p/abc/" }] } },
  ]);
  assertEquals(await acharMidiaPorLegenda(CFG, "Legenda certa", { fetcher }), { id: "m1", permalink: "https://www.instagram.com/p/abc/" });
});

Deno.test("igConfigFromEnv devolve nulo sem token", () => {
  assertEquals(igConfigFromEnv(() => undefined), null);
  assertEquals(igConfigFromEnv((k) => ({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" } as Record<string, string>)[k]), {
    token: "t",
    igUserId: "1",
    versao: "v21.0",
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/instagram.test.ts`
Expected: FAIL com `Module not found ".../instagram.ts"`.

- [ ] **Step 3: Implementar o módulo**

Criar `supabase/functions/_shared/instagram.ts`:

```ts
// Cliente mínimo da Graph API para publicar no Instagram da Movepark (E3.6).
//
// Usado pela `publish-instagram` (diagnóstico e publicação manual) e pela `social-dispatch`
// (publicação agendada). O fluxo da Meta é sempre de dois passos: container e media_publish. No
// carrossel, cada slide vira um container com is_carousel_item, e um pai com media_type=CAROUSEL
// amarra todos. Detalhe em .claude/skills/instagram/references/api-instagram.md.
//
// Toda chamada passa por `onCall` com o caminho, o método e os campos SEM o token, para quem
// chama gravar o rastro. O token nunca sai deste arquivo.

export const VERSAO_PADRAO = "v21.0";

export interface IgConfig {
  token: string;
  igUserId: string;
  versao: string;
}

export interface GraphResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

export type GraphKind =
  | "container_child"
  | "container_parent"
  | "container_status"
  | "media_publish"
  | "permalink"
  | "consulta";

export interface GraphCall {
  kind: GraphKind;
  metodo: "GET" | "POST";
  caminho: string;
  campos: Record<string, string>;
  result: GraphResult;
}

export interface Opcoes {
  fetcher?: typeof fetch;
  onCall?: (c: GraphCall) => void | Promise<void>;
  esperaMs?: number;
  tentativas?: number;
}

export function igConfigFromEnv(get: (k: string) => string | undefined): IgConfig | null {
  const token = get("INSTAGRAM_ACCESS_TOKEN");
  if (!token) return null;
  return {
    token,
    igUserId: get("INSTAGRAM_USER_ID") ?? "",
    versao: get("INSTAGRAM_API_VERSION") ?? VERSAO_PADRAO,
  };
}

export async function graph(
  cfg: IgConfig,
  caminho: string,
  metodo: "GET" | "POST",
  campos: Record<string, string> = {},
  opts: Opcoes = {},
  kind: GraphKind = "consulta",
): Promise<GraphResult> {
  const f = opts.fetcher ?? fetch;
  const url = new URL(`https://graph.facebook.com/${cfg.versao}/${caminho}`);
  const params = new URLSearchParams({ ...campos, access_token: cfg.token });
  const init: RequestInit = { method: metodo };
  if (metodo === "GET") url.search = params.toString();
  else {
    init.body = params;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  let result: GraphResult;
  try {
    const r = await f(url.toString(), init);
    const body = await r.json().catch(() => ({}));
    result = { ok: r.ok, status: r.status, body: body as Record<string, unknown> };
  } catch (e) {
    result = { ok: false, status: 0, body: { erro: String(e) } };
  }
  await opts.onCall?.({ kind, metodo, caminho, campos, result });
  return result;
}

/** O container do carrossel demora para ficar pronto; publicar antes falha. */
export async function esperarContainer(
  cfg: IgConfig,
  id: string,
  opts: Opcoes = {},
): Promise<{ pronto: boolean; status: string; detalhe?: unknown }> {
  const tentativas = opts.tentativas ?? 12;
  const espera = opts.esperaMs ?? 2500;
  for (let i = 0; i < tentativas; i++) {
    const r = await graph(cfg, id, "GET", { fields: "status_code,status" }, opts, "container_status");
    const status = String(r.body.status_code ?? "");
    if (status === "FINISHED") return { pronto: true, status };
    if (status === "ERROR" || status === "EXPIRED") return { pronto: false, status, detalhe: r.body.status };
    if (i < tentativas - 1) await new Promise((res) => setTimeout(res, espera));
  }
  return { pronto: false, status: "TIMEOUT" };
}

export async function statusDoContainer(cfg: IgConfig, id: string, opts: Opcoes = {}): Promise<string> {
  const r = await graph(cfg, id, "GET", { fields: "status_code" }, opts, "container_status");
  return String(r.body.status_code ?? "");
}

export interface Imagem {
  url: string;
  alt?: string | null;
}

export type ResultadoPublicacao =
  | { ok: true; mediaId: string; containerId: string }
  | { ok: false; etapa: string; resposta: unknown; containerId?: string };

export async function publicar(
  cfg: IgConfig,
  entrada: { caption: string; images: Imagem[] },
  opts: Opcoes & { onContainer?: (id: string) => void | Promise<void> } = {},
): Promise<ResultadoPublicacao> {
  const { caption, images } = entrada;
  let containerId: string;

  if (images.length > 1) {
    const filhos: string[] = [];
    for (const [i, img] of images.entries()) {
      const r = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
        image_url: img.url,
        is_carousel_item: "true",
        ...(img.alt ? { alt_text: img.alt } : {}),
      }, opts, "container_child");
      if (!r.ok || !r.body.id) return { ok: false, etapa: `container do slide ${i + 1}`, resposta: r.body };
      filhos.push(String(r.body.id));
    }
    const pai = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
      media_type: "CAROUSEL",
      children: filhos.join(","),
      caption,
    }, opts, "container_parent");
    if (!pai.ok || !pai.body.id) return { ok: false, etapa: "container do carrossel", resposta: pai.body };
    containerId = String(pai.body.id);
  } else {
    const img = images[0];
    const c = await graph(cfg, `${cfg.igUserId}/media`, "POST", {
      image_url: img.url,
      caption,
      ...(img.alt ? { alt_text: img.alt } : {}),
    }, opts, "container_parent");
    if (!c.ok || !c.body.id) return { ok: false, etapa: "container", resposta: c.body };
    containerId = String(c.body.id);
  }

  await opts.onContainer?.(containerId);

  const espera = await esperarContainer(cfg, containerId, opts);
  if (!espera.pronto) return { ok: false, etapa: "container não ficou pronto", resposta: espera, containerId };

  const pub = await graph(cfg, `${cfg.igUserId}/media_publish`, "POST", { creation_id: containerId }, opts, "media_publish");
  if (!pub.ok || !pub.body.id) return { ok: false, etapa: "media_publish", resposta: pub.body, containerId };
  return { ok: true, mediaId: String(pub.body.id), containerId };
}

export async function lerPermalink(cfg: IgConfig, mediaId: string, opts: Opcoes = {}): Promise<string | null> {
  const r = await graph(cfg, mediaId, "GET", { fields: "permalink" }, opts, "permalink");
  return typeof r.body.permalink === "string" ? r.body.permalink : null;
}

/** Procura, nos últimos posts da conta, a mídia com esta legenda. Usado para não publicar duas vezes. */
export async function acharMidiaPorLegenda(
  cfg: IgConfig,
  caption: string,
  opts: Opcoes = {},
): Promise<{ id: string; permalink: string | null } | null> {
  const r = await graph(cfg, `${cfg.igUserId}/media`, "GET", { fields: "id,caption,permalink,timestamp", limit: "10" }, opts, "consulta");
  const lista = Array.isArray(r.body.data) ? (r.body.data as Array<Record<string, unknown>>) : [];
  const alvo = caption.trim();
  const achada = lista.find((m) => String(m.caption ?? "").trim() === alvo);
  if (!achada) return null;
  return { id: String(achada.id), permalink: typeof achada.permalink === "string" ? achada.permalink : null };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/instagram.test.ts`
Expected: todos `ok`.

- [ ] **Step 5: `publish-instagram` passa a usar o módulo**

Substituir o conteúdo inteiro de `supabase/functions/publish-instagram/index.ts` por:

```ts
// Edge Function: /publish-instagram
// Publica um post (imagem única ou carrossel) na conta profissional do Instagram
// da Movepark (@moveparkestacionamento), pela Content Publishing API da Meta.
//
// A publicação agendada da fila é da `social-dispatch`; esta função fica para o diagnóstico do
// token e para a publicação manual. As duas usam o mesmo cliente da Graph API
// (`_shared/instagram.ts`). Detalhe em .claude/skills/instagram/references/api-instagram.md.
//
// POST /functions/v1/publish-instagram   (header: x-publish-instagram-key: <PUBLISH_INSTAGRAM_KEY>)
//   { "action": "diagnose" }
//     → confere token, permissões e a conta ligada. Não escreve nada.
//   { "action": "publish", "caption": "...", "images": [{url, alt}], "dryRun": true }
//     → valida tudo e diz o que faria. NÃO publica.
//   { "action": "publish", ..., "dryRun": false }
//     → publica de verdade.
//
// dryRun nasce true de propósito, mesmo padrão do marketing_dispatch_enabled:
// ferramenta de publicação que nasce ligada posta na conta real no primeiro teste.
//
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional),
//          PUBLISH_INSTAGRAM_KEY

import { autorizado, ehCarrossel, validar, type Imagem } from "./logic.ts";
import { graph, type IgConfig, igConfigFromEnv, publicar } from "../_shared/instagram.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const env = (k: string): string | undefined => Deno.env.get(k);

/**
 * Descobre o id da conta do Instagram a partir das Páginas do token.
 * Poupa um passo manual: com o token em mãos, o INSTAGRAM_USER_ID sai daqui.
 */
async function descobrirConta(cfg: IgConfig) {
  const r = await graph(cfg, "me/accounts", "GET", {
    fields: "id,name,instagram_business_account{id,username}",
  });
  const paginas = Array.isArray(r.body.data) ? (r.body.data as Array<Record<string, any>>) : [];
  const comIg = paginas
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      pagina: p.name,
      page_id: p.id,
      instagram_user_id: p.instagram_business_account.id,
      username: p.instagram_business_account.username,
    }));
  return { ok: r.ok, paginas: paginas.length, contas: comIg, resposta: r.ok ? undefined : r.body };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!autorizado(env("PUBLISH_INSTAGRAM_KEY"), req.headers.get("x-publish-instagram-key"))) {
    return json({ error: "unauthorized" }, 401);
  }

  const cfg = igConfigFromEnv(env);
  if (!cfg) {
    return json({
      error: "falta o token",
      detalhe: "defina INSTAGRAM_ACCESS_TOKEN nos secrets do projeto. O INSTAGRAM_USER_ID a " +
        "própria função descobre: rode com action diagnose.",
    }, 503);
  }

  const corpo = await req.json().catch(() => ({}));
  const action = corpo.action ?? "diagnose";

  // ---- diagnose: confere o token antes de qualquer escrita ------------------
  if (action === "diagnose") {
    const permissoes = await graph(cfg, "me/permissions", "GET");
    const descoberta = await descobrirConta(cfg);

    // Sem o id configurado, usa o primeiro descoberto para já dizer se dá certo.
    const idParaChecar = cfg.igUserId || descoberta.contas[0]?.instagram_user_id;
    if (!idParaChecar) {
      const concedidasSemConta = Array.isArray(permissoes.body.data)
        ? (permissoes.body.data as Array<Record<string, string>>)
            .filter((p) => p.status === "granted").map((p) => p.permission)
        : [];
      return json({
        ok: false,
        motivo: "o token não enxerga nenhuma Página com conta do Instagram ligada",
        permissoes_concedidas: concedidasSemConta,
        paginas_vistas: descoberta.paginas,
        dica: "confirme que a conta é profissional, que está ligada a uma Página, e que o token " +
          "tem pages_show_list além das permissões de Instagram",
        resposta_da_meta: descoberta.resposta,
      }, 400);
    }

    const conta = await graph(cfg, idParaChecar, "GET", {
      fields: "id,username,name,followers_count,media_count",
    });
    const concedidas = Array.isArray(permissoes.body.data)
      ? (permissoes.body.data as Array<Record<string, string>>)
          .filter((p) => p.status === "granted")
          .map((p) => p.permission)
      : [];
    const precisa = ["instagram_basic", "instagram_content_publish"];
    const alternativa = ["instagram_business_basic", "instagram_business_content_publish"];
    const temPublicacao =
      concedidas.includes("instagram_content_publish") ||
      concedidas.includes("instagram_business_content_publish");
    return json({
      ok: conta.ok && temPublicacao,
      conta: conta.ok ? conta.body : { erro: conta.body },
      contas_encontradas: descoberta.contas,
      instagram_user_id_em_uso: idParaChecar,
      instagram_user_id_configurado: cfg.igUserId || null,
      permissoes_concedidas: concedidas,
      pode_publicar: temPublicacao,
      falta: temPublicacao ? [] : [precisa[1], `ou ${alternativa[1]}`],
    }, conta.ok ? 200 : 400);
  }

  if (action !== "publish") return json({ error: `action desconhecida: ${action}` }, 400);

  // Publicar NUNCA usa conta descoberta: o id tem que estar configurado, senão
  // um token com duas Páginas postaria na errada sem ninguém escolher.
  if (!cfg.igUserId) {
    return json({
      error: "INSTAGRAM_USER_ID não configurado",
      detalhe: "rode action diagnose, pegue o instagram_user_id da conta certa e grave no secret",
    }, 503);
  }

  // ---- publish --------------------------------------------------------------
  const caption: string = corpo.caption ?? "";
  const images: Imagem[] = Array.isArray(corpo.images) ? corpo.images : [];
  const dryRun = corpo.dryRun !== false; // nasce travado

  const erros = validar({ caption, images });
  if (erros.length) return json({ ok: false, erros }, 422);

  // As URLs precisam responder para a Meta, que busca do servidor dela.
  const inacessiveis: string[] = [];
  for (const img of images) {
    const r = await fetch(img.url, { method: "HEAD" }).catch(() => null);
    if (!r || !r.ok) inacessiveis.push(img.url);
    else if (!/image\/jpeg/i.test(r.headers.get("content-type") ?? "")) {
      inacessiveis.push(`${img.url} (content-type ${r.headers.get("content-type")})`);
    }
  }
  if (inacessiveis.length) {
    return json({ ok: false, erros: ["imagem não acessível ou não é JPEG"], inacessiveis }, 422);
  }

  const carrossel = ehCarrossel(images);
  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      publicaria: {
        tipo: carrossel ? "carrossel" : "post único",
        slides: images.length,
        caracteres: caption.length,
        hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
        conta: cfg.igUserId,
      },
      aviso: "nada foi publicado. Repita com dryRun: false para publicar de verdade.",
    });
  }

  const res = await publicar(cfg, { caption, images });
  if (!res.ok) {
    return json({ ok: false, etapa: res.etapa, resposta: res.resposta, containerId: res.containerId }, 502);
  }
  return json({
    ok: true,
    tipo: carrossel ? "carrossel" : "post único",
    slides: images.length,
    media_id: res.mediaId,
  });
});
```

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/publish-instagram/ supabase/functions/_shared/`
Expected: todos `ok`.

- [ ] **Step 6: Deploy e prova de que nada regrediu**

```bash
supabase functions deploy publish-instagram --no-verify-jwt
K=$(grep '^PUBLISH_INSTAGRAM_KEY=' .env.local | cut -d= -f2)
U=https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/publish-instagram
curl -s -X POST "$U" -H "Content-Type: application/json" -H "x-publish-instagram-key: $K" -d '{"action":"diagnose"}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["ok"], d["pode_publicar"], d["conta"]["username"])'
B=https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/social/preco-do-estacionamento-no-aeroporto-de-confins
curl -s -X POST "$U" -H "Content-Type: application/json" -H "x-publish-instagram-key: $K" -d "{\"action\":\"publish\",\"dryRun\":true,\"caption\":\"Teste de regressão, não publicar.\",\"images\":[{\"url\":\"$B/preco-estacionamento-aeroporto-confins-periodo-01.jpg\"},{\"url\":\"$B/preco-estacionamento-aeroporto-confins-periodo-02.jpg\"}]}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["ok"], d["dryRun"], d["publicaria"]["tipo"])'
```

Expected: `True True moveparkestacionamento` e `True True carrossel`. Nada é publicado (`dryRun: true`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/instagram.ts supabase/functions/_shared/instagram.test.ts supabase/functions/publish-instagram/index.ts
git commit -m "refactor(instagram): cliente da Graph API vira módulo compartilhado, com rastro sem token

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Entrada do rascunho (Edge `social-draft`)

**Files:**
- Create: `supabase/functions/social-draft/logic.ts`
- Create: `supabase/functions/social-draft/index.ts`
- Create: `supabase/functions/social-draft/index.test.ts`
- Modify: `supabase/config.toml` (bloco da função)

**Interfaces:**
- Consumes: `conferirTexto`, `conferirImagem`, `lerJpeg` (Task 2); tabela `social_post` e `social_post_event` (Task 1).
- Produces (HTTP):
  - `POST /functions/v1/social-draft` multipart, header `x-social-draft-key`, campo `post` (JSON) + um arquivo por slide com o nome do `arquivo` → `200 { ok: true, id, status: "pending_review", validation }`, `401`, `409 { ok: false, erros }`, `422 { ok: false, erros }`.
  - `POST /functions/v1/social-draft` JSON `{ action: "update_caption", id, caption }`, `Authorization: Bearer <JWT hub_admin>` → `200 { ok: true, validation }`, `401`, `403`, `404`, `409`, `422`.
- Produces (logic.ts): `lerRascunho(bruto: unknown)`, `draftKey(origem, corte)`, `podeReenviar(status)`, `podeCorrigirLegenda(status)`, `caminhoNoBucket(origem, arquivo)`, `urlPublica(supabaseUrl, caminho, versao)`, `chaveConfere(esperada, recebida)`, tipo `Rascunho`.

- [ ] **Step 1: Escrever os testes da lógica**

Criar `supabase/functions/social-draft/index.test.ts`:

```ts
// Regras da entrada da fila do Instagram. O que passa daqui vira linha em social_post.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  lerRascunho,
  podeCorrigirLegenda,
  podeReenviar,
  urlPublica,
} from "./logic.ts";

const BOM = {
  origem: "preco-do-estacionamento-no-aeroporto-de-confins",
  corte: 2,
  destination: "aeroporto-de-confins",
  keyphrase: "estacionamento no aeroporto de Confins",
  publicar_em: "2026-10-28T12:00:00-03:00",
  cta_url: "https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram",
  price_date: "2026-10-21",
  caption: "Legenda do post.",
  slides: [
    { arquivo: "preco-estacionamento-aeroporto-confins-01.jpg", alt: "pátio", texto: "R$ 45 a diária" },
    { arquivo: "preco-estacionamento-aeroporto-confins-02.jpg", alt: "van", texto: null },
  ],
};

Deno.test("rascunho bom é lido e a data vira ISO em UTC", () => {
  const r = lerRascunho(BOM);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.rascunho.publicarEm, "2026-10-28T15:00:00.000Z");
    assertEquals(r.rascunho.corte, 2);
    assertEquals(r.rascunho.slides.length, 2);
  }
});

Deno.test("origem é obrigatória e em kebab-case", () => {
  for (const origem of [undefined, "", "Preço Confins", "confins_preco"]) {
    const r = lerRascunho({ ...BOM, origem });
    assertEquals(r.ok, false, String(origem));
  }
});

Deno.test("publicar_em sem fuso é recusado, porque a hora mudaria de sentido", () => {
  assertEquals(lerRascunho({ ...BOM, publicar_em: "2026-10-28T12:00:00" }).ok, false);
  assertEquals(lerRascunho({ ...BOM, publicar_em: "amanhã" }).ok, false);
});

Deno.test("corte fora de 1 a 4 é recusado; sem corte vale", () => {
  assertEquals(lerRascunho({ ...BOM, corte: 5 }).ok, false);
  const sem = lerRascunho({ ...BOM, corte: undefined });
  assertEquals(sem.ok && sem.rascunho.corte, null);
});

Deno.test("arquivo do slide precisa ser kebab-case .jpg e não repetir", () => {
  assertEquals(lerRascunho({ ...BOM, slides: [{ arquivo: "Slide 1.png" }] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [BOM.slides[0], BOM.slides[0]] }).ok, false);
  assertEquals(lerRascunho({ ...BOM, slides: [] }).ok, false);
});

Deno.test("price_date fora do formato é recusada", () => {
  assertEquals(lerRascunho({ ...BOM, price_date: "21/10/2026" }).ok, false);
});

Deno.test("chave do rascunho, caminho no bucket e URL com versão", () => {
  assertEquals(draftKey("confins", 2), "confins:2");
  assertEquals(draftKey("confins", null), "confins:0");
  assertEquals(caminhoNoBucket("confins", "a.jpg"), "social/confins/a.jpg");
  assertEquals(
    urlPublica("https://x.supabase.co/", "social/confins/a.jpg", "abc"),
    "https://x.supabase.co/storage/v1/object/public/assets-public/social/confins/a.jpg?v=abc",
  );
});

Deno.test("só rascunho esperando aprovação é sobrescrito; legenda corrige até aprovado", () => {
  assertEquals(podeReenviar("pending_review"), true);
  assertEquals(podeReenviar("approved"), false);
  assertEquals(podeCorrigirLegenda("approved"), true);
  assertEquals(podeCorrigirLegenda("published"), false);
});

Deno.test("chave confere só quando configurada e igual", () => {
  assertEquals(chaveConfere("k", "k"), true);
  assertEquals(chaveConfere("k", "x"), false);
  assertEquals(chaveConfere(undefined, null), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/social-draft/`
Expected: FAIL com `Module not found ".../social-draft/logic.ts"`.

- [ ] **Step 3: Implementar a lógica**

Criar `supabase/functions/social-draft/logic.ts`:

```ts
// Regras puras da entrada de rascunho do Instagram (E3.6). Sem rede, para ter teste.
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 2.

export interface SlideRascunho {
  arquivo: string;
  alt: string | null;
  texto: string | null;
}

export interface Rascunho {
  origem: string;
  corte: number | null;
  destination: string | null;
  keyphrase: string | null;
  /** ISO em UTC. */
  publicarEm: string;
  ctaUrl: string | null;
  priceDate: string | null;
  caption: string;
  slides: SlideRascunho[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARQUIVO = /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpe?g$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COM_FUSO = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function lerRascunho(
  bruto: unknown,
): { ok: true; rascunho: Rascunho } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const m = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;

  const origem = texto(m.origem);
  if (!origem || !SLUG.test(origem)) erros.push("origem obrigatória, em kebab-case sem acento");

  let corte: number | null = null;
  if (m.corte !== undefined && m.corte !== null && m.corte !== "") {
    const n = Number(m.corte);
    if (!Number.isInteger(n) || n < 1 || n > 4) erros.push("corte vai de 1 a 4");
    else corte = n;
  }

  const publicarEm = texto(m.publicar_em);
  if (!publicarEm || !COM_FUSO.test(publicarEm) || Number.isNaN(Date.parse(publicarEm))) {
    erros.push("publicar_em precisa ser data e hora com fuso, ex. 2026-10-28T12:00:00-03:00");
  }

  const priceDate = texto(m.price_date);
  if (priceDate && !DATA.test(priceDate)) erros.push("price_date no formato AAAA-MM-DD");

  const caption = typeof m.caption === "string" ? m.caption.trim() : "";
  if (!caption) erros.push("caption vazia");

  const brutos = Array.isArray(m.slides) ? m.slides : [];
  if (brutos.length < 1 || brutos.length > 10) erros.push("de 1 a 10 slides");
  const slides: SlideRascunho[] = brutos.map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { arquivo: texto(o.arquivo) ?? "", alt: texto(o.alt), texto: texto(o.texto) };
  });
  slides.forEach((s, i) => {
    if (!ARQUIVO.test(s.arquivo)) erros.push(`slide ${i + 1}: arquivo em kebab-case terminando em .jpg`);
  });
  if (new Set(slides.map((s) => s.arquivo)).size < slides.length) erros.push("dois slides com o mesmo arquivo");

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    rascunho: {
      origem: origem!,
      corte,
      destination: texto(m.destination),
      keyphrase: texto(m.keyphrase),
      publicarEm: new Date(publicarEm!).toISOString(),
      ctaUrl: texto(m.cta_url),
      priceDate,
      caption,
      slides,
    },
  };
}

export const draftKey = (origem: string, corte: number | null) => `${origem}:${corte ?? 0}`;
export const podeReenviar = (status: string) => status === "pending_review";
export const podeCorrigirLegenda = (status: string) => status === "pending_review" || status === "approved";
export const caminhoNoBucket = (origem: string, arquivo: string) => `social/${origem}/${arquivo}`;

/** A versão na query evita que o CDN sirva a imagem antiga quando o rascunho é reenviado com o mesmo nome. */
export function urlPublica(supabaseUrl: string, caminho: string, versao: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/assets-public/${caminho}?v=${versao}`;
}

export function chaveConfere(esperada: string | undefined, recebida: string | null): boolean {
  return Boolean(esperada) && esperada === recebida;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/social-draft/`
Expected: todos `ok`.

- [ ] **Step 5: Implementar a Edge**

Criar `supabase/functions/social-draft/index.ts`:

```ts
// Edge Function: /social-draft
// Entrada da fila de publicação do Instagram (E3.6).
//
// POST multipart  (header x-social-draft-key: <SOCIAL_DRAFT_KEY>)
//   campo "post": JSON do front matter da skill + "caption"; um arquivo por slide, com o nome do
//   "arquivo" do front matter.
//   → 200 { ok, id, status, validation } | 401 | 409 (rascunho já aprovado) | 422 { erros }
//   Problema de arquivo ou de formato devolve 422 e não grava nada. Problema de texto fica em
//   `validation` e trava a aprovação, para a tela mostrar o motivo.
//
// POST JSON { action: "update_caption", id, caption }  (Authorization: Bearer <JWT hub_admin>)
//   → 200 { ok, validation } | 401 | 403 | 404 | 409 | 422
//   Corrigir a legenda devolve o post para "pending_review": o texto aprovado deixou de existir.
//
// verify_jwt = false: o script da skill não tem JWT, e a chave basta para criar rascunho, que não
// publica nem aprova nada. A correção de legenda confere hub_admin aqui dentro.
// Secrets: SOCIAL_DRAFT_KEY. Ver docs/specs/instagram-fila-de-publicacao.md.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conferirImagem, conferirTexto, lerJpeg } from "../_shared/instagram-validate.ts";
import {
  caminhoNoBucket,
  chaveConfere,
  draftKey,
  lerRascunho,
  podeCorrigirLegenda,
  podeReenviar,
  urlPublica,
} from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-draft-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno env
const env = (k: string): string | undefined => Deno.env.get(k);

async function versaoDe(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...h.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function submeter(req: Request, admin: Admin, supabaseUrl: string): Promise<Response> {
  if (!chaveConfere(env("SOCIAL_DRAFT_KEY"), req.headers.get("x-social-draft-key"))) {
    return json({ error: "unauthorized" }, 401);
  }
  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, erros: ["multipart inválido"] }, 422);

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(form.get("post") ?? ""));
  } catch {
    return json({ ok: false, erros: ["o campo post não é JSON"] }, 422);
  }
  const lido = lerRascunho(bruto);
  if (!lido.ok) return json({ ok: false, erros: lido.erros }, 422);
  const r = lido.rascunho;

  const arquivos: { nome: string; bytes: Uint8Array }[] = [];
  const erros: string[] = [];
  for (const s of r.slides) {
    const f = form.get(s.arquivo);
    if (!(f instanceof File)) {
      erros.push(`faltou o arquivo ${s.arquivo}`);
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    erros.push(...conferirImagem(lerJpeg(bytes), s.arquivo));
    arquivos.push({ nome: s.arquivo, bytes });
  }
  if (erros.length) return json({ ok: false, erros }, 422);

  const chave = draftKey(r.origem, r.corte);
  const { data: existente, error: e1 } = await admin
    .from("social_post")
    .select("id, status")
    .eq("draft_key", chave)
    .maybeSingle();
  if (e1) return json({ error: e1.message }, 500);
  if (existente && !podeReenviar(existente.status)) {
    return json({ ok: false, erros: [`este rascunho já está ${existente.status} e não é sobrescrito`] }, 409);
  }

  const slides = [];
  for (const [i, a] of arquivos.entries()) {
    const caminho = caminhoNoBucket(r.origem, a.nome);
    const { error } = await admin.storage
      .from("assets-public")
      .upload(caminho, a.bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    if (error) return json({ error: `upload de ${a.nome}: ${error.message}` }, 500);
    const s = r.slides[i];
    slides.push({ url: urlPublica(supabaseUrl, caminho, await versaoDe(a.bytes)), path: caminho, alt: s.alt, texto: s.texto });
  }

  const validation = conferirTexto({ caption: r.caption, slides, keyphrase: r.keyphrase, priceDate: r.priceDate });

  const { data: post } = await admin
    .from("blog_post")
    .select("id")
    .eq("slug", r.origem)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: destino } = r.destination
    ? await admin.from("destination").select("id").eq("slug", r.destination).maybeSingle()
    : { data: null };

  const linha = {
    draft_key: chave,
    status: "pending_review",
    kind: slides.length > 1 ? "carousel" : "image",
    caption: r.caption,
    slides,
    keyphrase: r.keyphrase,
    cut_number: r.corte,
    blog_post_id: post?.id ?? null,
    destination_id: destino?.id ?? null,
    cta_url: r.ctaUrl,
    price_date: r.priceDate,
    scheduled_at: r.publicarEm,
    validation,
    approved_by: null,
    approved_at: null,
    last_error: null,
    deleted_at: null,
  };
  const { data: salvo, error: e2 } = await admin
    .from("social_post")
    .upsert(linha, { onConflict: "draft_key" })
    .select("id")
    .single();
  if (e2) return json({ error: e2.message }, 500);

  await admin.from("social_post_event").insert({
    social_post_id: salvo.id,
    kind: "draft_received",
    note: `${slides.length} slide(s)`,
    response: validation,
  });
  return json({ ok: true, id: salvo.id, status: "pending_review", validation });
}

async function corrigirLegenda(req: Request, admin: Admin): Promise<Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: u, error: eu } = await admin.auth.getUser(token);
  if (eu || !u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (perfil?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  const corpo = await req.json().catch(() => ({}));
  if (corpo.action !== "update_caption") return json({ error: `action desconhecida: ${corpo.action}` }, 400);
  const caption = typeof corpo.caption === "string" ? corpo.caption.trim() : "";
  if (!caption) return json({ ok: false, erros: ["A legenda está vazia."] }, 422);

  const { data: post } = await admin
    .from("social_post")
    .select("id, status, caption, slides, keyphrase, price_date")
    .eq("id", corpo.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) return json({ error: "post não encontrado" }, 404);
  if (!podeCorrigirLegenda(post.status)) {
    return json({ ok: false, erros: [`Post ${post.status} não tem a legenda corrigida.`] }, 409);
  }

  const validation = conferirTexto({ caption, slides: post.slides, keyphrase: post.keyphrase, priceDate: post.price_date });
  const { error } = await admin
    .from("social_post")
    .update({ caption, validation, status: "pending_review", approved_by: null, approved_at: null })
    .eq("id", post.id);
  if (error) return json({ error: error.message }, 500);

  await admin.from("social_post_event").insert({
    social_post_id: post.id,
    kind: "caption_edited",
    actor: u.user.id,
    request: { antes: post.caption, depois: caption },
    response: validation,
  });
  return json({ ok: true, validation });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = env("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) return await submeter(req, admin, supabaseUrl);
  return await corrigirLegenda(req, admin);
});
```

- [ ] **Step 6: Configurar, gerar a chave e publicar a função**

Em `supabase/config.toml`, logo depois do bloco `[functions.publish-instagram]`, acrescentar:

```toml
[functions.social-draft]
verify_jwt = false
```

Gerar a chave sem imprimir o valor e guardar a cópia local (o `.env.local` é ignorado pelo git):

```bash
K=$(openssl rand -hex 32) && supabase secrets set SOCIAL_DRAFT_KEY="$K" >/dev/null 2>&1 \
  && printf '\n# Chave da Edge social-draft (E3.6). Nao versionar.\nSOCIAL_DRAFT_KEY=%s\n' "$K" >> .env.local \
  && echo "chave gravada"
supabase functions deploy social-draft --no-verify-jwt
```

Expected: `chave gravada` e `Deployed Functions on project mgaigbezdalbyuqiofcf: social-draft`.

- [ ] **Step 7: Prova de ponta a ponta com um rascunho de teste**

```bash
T=$(mktemp -d); B=https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/social/preco-do-estacionamento-no-aeroporto-de-confins
curl -s -o "$T/teste-integracao-01.jpg" "$B/preco-estacionamento-aeroporto-confins-periodo-01.jpg"
K=$(grep '^SOCIAL_DRAFT_KEY=' .env.local | cut -d= -f2); U=https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/social-draft
QUANDO=$(date -u -v+10d +%Y-%m-%dT15:00:00Z)
POST="{\"origem\":\"teste-integracao-instagram\",\"corte\":1,\"publicar_em\":\"$QUANDO\",\"caption\":\"Teste de integração da fila. #a #b #c\",\"slides\":[{\"arquivo\":\"teste-integracao-01.jpg\",\"alt\":\"slide de teste\"}]}"
curl -s -o /dev/null -w "sem chave: %{http_code}\n" -X POST "$U" -F "post=$POST" -F "teste-integracao-01.jpg=@$T/teste-integracao-01.jpg;type=image/jpeg"
curl -s -X POST "$U" -H "x-social-draft-key: $K" -F "post=$POST" -F "teste-integracao-01.jpg=@$T/teste-integracao-01.jpg;type=image/jpeg"
```

Expected: `sem chave: 401`, depois `{"ok":true,"id":"…","status":"pending_review","validation":{"blockers":[],"warnings":[…]}}`.

Limpar o teste (a linha sai da fila, e o arquivo sai do bucket):

```sql
update public.social_post set deleted_at = now() where draft_key = 'teste-integracao-instagram:1';
```

```bash
supabase storage rm "ss:///assets-public/social/teste-integracao-instagram/teste-integracao-01.jpg" --linked --experimental --yes
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/social-draft/ supabase/config.toml
git commit -m "feat(instagram): Edge social-draft recebe o rascunho da skill e confere no servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Publicação agendada (Edge `social-dispatch` + cron)

**Files:**
- Create: `supabase/functions/social-dispatch/logic.ts`
- Create: `supabase/functions/social-dispatch/index.ts`
- Create: `supabase/functions/social-dispatch/index.test.ts`
- Create: `supabase/migrations/20261130190000_social_dispatch_cron.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `igConfigFromEnv`, `publicar`, `statusDoContainer`, `lerPermalink`, `acharMidiaPorLegenda`, `GraphCall` (Task 3); `cron_key_matches(p_name text, p_key text)` (já existe, migration `20261112090000`); tabelas da Task 1.
- Produces (logic.ts): `ATRASO_MAXIMO_MS`, `PUBLICANDO_PARADO_MS`, `interface PostFila { id: string; status: string; scheduled_at: string; published_at: string | null; updated_at: string }`, `diaEmSaoPaulo(d: Date): string`, `atrasados(posts, agora): string[]`, `parados(posts, agora): string[]`, `type Escolha = { id: string } | { motivo: "nada" | "ja_publicou_hoje" | "em_andamento" }`, `escolher(posts, agora): Escolha`, `jaPublicado(statusContainer: string): boolean`, `resumoDoErro(etapa: string, resposta: unknown): string`.
- Produces (HTTP): `POST /functions/v1/social-dispatch` com `x-social-dispatch-key` → `{ ok, acao, post?, permalink?, erro? }`, `acao` em `nada | ja_publicou_hoje | em_andamento | reconciliou | dry_run | outra_rodada | reconciliado | publicado | falhou`.

- [ ] **Step 1: Escrever os testes da decisão**

Criar `supabase/functions/social-dispatch/index.test.ts`:

```ts
// Quem sai na rodada. Errar aqui é publicar duas vezes, publicar fora de hora ou despejar a fila.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { atrasados, diaEmSaoPaulo, escolher, jaPublicado, parados, type PostFila, resumoDoErro } from "./logic.ts";

const AGORA = new Date("2026-10-28T15:05:00Z"); // 12:05 em São Paulo
const p = (over: Partial<PostFila>): PostFila => ({
  id: "x",
  status: "approved",
  scheduled_at: "2026-10-28T15:00:00Z",
  published_at: null,
  updated_at: "2026-10-28T10:00:00Z",
  ...over,
});

Deno.test("diaEmSaoPaulo usa o fuso de São Paulo, não o UTC", () => {
  assertEquals(diaEmSaoPaulo(new Date("2026-10-29T01:30:00Z")), "2026-10-28");
});

Deno.test("escolhe o aprovado mais antigo cuja hora chegou", () => {
  const posts = [
    p({ id: "depois", scheduled_at: "2026-10-28T15:04:00Z" }),
    p({ id: "antes", scheduled_at: "2026-10-28T14:00:00Z" }),
    p({ id: "futuro", scheduled_at: "2026-10-28T18:00:00Z" }),
  ];
  assertEquals(escolher(posts, AGORA), { id: "antes" });
});

Deno.test("nada a publicar quando nenhum aprovado chegou na hora", () => {
  assertEquals(escolher([p({ scheduled_at: "2026-10-28T18:00:00Z" })], AGORA), { motivo: "nada" });
});

Deno.test("um por dia: já publicou hoje no fuso de São Paulo, não publica outro", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "published", published_at: "2026-10-28T11:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { motivo: "ja_publicou_hoje" });
});

Deno.test("publicado ontem à noite em São Paulo não conta como hoje", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "published", published_at: "2026-10-28T02:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { id: "a" });
});

Deno.test("com outra rodada publicando agora, espera", () => {
  const posts = [p({ id: "a" }), p({ id: "b", status: "publishing", updated_at: "2026-10-28T15:00:00Z" })];
  assertEquals(escolher(posts, AGORA), { motivo: "em_andamento" });
});

Deno.test("atraso acima de 6 horas vira overdue e não é escolhido", () => {
  const velho = p({ id: "velho", scheduled_at: "2026-10-28T08:00:00Z" });
  assertEquals(atrasados([velho], AGORA), ["velho"]);
  assertEquals(escolher([velho], AGORA), { motivo: "nada" });
});

Deno.test("publishing parado há mais de 15 minutos é reconciliado", () => {
  const parado = p({ id: "parado", status: "publishing", updated_at: "2026-10-28T14:40:00Z" });
  const vivo = p({ id: "vivo", status: "publishing", updated_at: "2026-10-28T15:00:00Z" });
  assertEquals(parados([parado, vivo], AGORA), ["parado"]);
});

Deno.test("container PUBLISHED nunca é publicado de novo", () => {
  assertEquals(jaPublicado("PUBLISHED"), true);
  assertEquals(jaPublicado("FINISHED"), false);
  assertEquals(jaPublicado("EXPIRED"), false);
});

Deno.test("resumo do erro cabe em 500 caracteres", () => {
  assertEquals(resumoDoErro("media_publish", { msg: "x".repeat(1000) }).length, 500);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/social-dispatch/`
Expected: FAIL com `Module not found ".../social-dispatch/logic.ts"`.

- [ ] **Step 3: Implementar a decisão**

Criar `supabase/functions/social-dispatch/logic.ts`:

```ts
// Decisões puras da publicação agendada do Instagram (E3.6). Sem rede e sem banco, para ter teste.
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

/** Post aprovado com mais de 6 h de atraso não sai sozinho: ligar a chave não despeja a fila. */
export const ATRASO_MAXIMO_MS = 6 * 60 * 60 * 1000;
/** `publishing` sem mudança há 15 min é rodada que caiu no meio do caminho. */
export const PUBLICANDO_PARADO_MS = 15 * 60 * 1000;

export interface PostFila {
  id: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  updated_at: string;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AAAA-MM-DD no fuso de São Paulo. */
export const diaEmSaoPaulo = (d: Date) => DIA_SP.format(d);

export function atrasados(posts: PostFila[], agora: Date): string[] {
  return posts
    .filter((p) => p.status === "approved" && agora.getTime() - Date.parse(p.scheduled_at) > ATRASO_MAXIMO_MS)
    .map((p) => p.id);
}

export function parados(posts: PostFila[], agora: Date): string[] {
  return posts
    .filter((p) => p.status === "publishing" && agora.getTime() - Date.parse(p.updated_at) > PUBLICANDO_PARADO_MS)
    .map((p) => p.id);
}

export type Escolha = { id: string } | { motivo: "nada" | "ja_publicou_hoje" | "em_andamento" };

export function escolher(posts: PostFila[], agora: Date): Escolha {
  const t = agora.getTime();
  const emAndamento = posts.some(
    (p) => p.status === "publishing" && t - Date.parse(p.updated_at) <= PUBLICANDO_PARADO_MS,
  );
  if (emAndamento) return { motivo: "em_andamento" };

  const candidatos = posts
    .filter((p) => p.status === "approved")
    .filter((p) => {
      const hora = Date.parse(p.scheduled_at);
      return hora <= t && t - hora <= ATRASO_MAXIMO_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  if (!candidatos.length) return { motivo: "nada" };

  const hoje = diaEmSaoPaulo(agora);
  const publicouHoje = posts.some(
    (p) => p.status === "published" && p.published_at && diaEmSaoPaulo(new Date(p.published_at)) === hoje,
  );
  if (publicouHoje) return { motivo: "ja_publicou_hoje" };

  return { id: candidatos[0].id };
}

export const jaPublicado = (statusContainer: string) => statusContainer === "PUBLISHED";

export function resumoDoErro(etapa: string, resposta: unknown): string {
  return `${etapa}: ${JSON.stringify(resposta ?? {})}`.slice(0, 500);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/social-dispatch/`
Expected: todos `ok`.

- [ ] **Step 5: Implementar a Edge**

Criar `supabase/functions/social-dispatch/index.ts`:

```ts
// Edge Function: /social-dispatch
// Publicação agendada da fila do Instagram (E3.6). Chamada pelo pg_cron a cada 15 minutos.
//
// Uma rodada:
//   1. com a chave ligada, reconcilia post parado em `publishing` (rodada que caiu no meio);
//   2. marca `overdue` todo aprovado com mais de 6 h de atraso;
//   3. escolhe UM aprovado cuja hora chegou, um por dia no fuso de São Paulo;
//   4. chave desligada (`app_setting.social_dispatch_enabled` diferente de 'true'): só grava o
//      evento `dry_run`, uma vez por post, e não muda o estado;
//   5. chave ligada: pega o post com update condicional (status = 'approved'), consulta o container
//      antigo antes de criar outro e publica. O mesmo post nunca sai duas vezes.
//
// Toda chamada à Graph API vira linha em `social_post_event`, sem o token.
//
// POST /functions/v1/social-dispatch  (header x-social-dispatch-key, conferido no Vault por
// cron_key_matches: o valor não passa por terminal nem por secret de Edge)
// → { ok, acao, post?, permalink?, erro? }
// Secrets: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_API_VERSION (opcional).
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  acharMidiaPorLegenda,
  type GraphCall,
  type IgConfig,
  igConfigFromEnv,
  lerPermalink,
  publicar,
  statusDoContainer,
} from "../_shared/instagram.ts";
import { atrasados, escolher, jaPublicado, parados, type PostFila, resumoDoErro } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno env
const env = (k: string): string | undefined => Deno.env.get(k);

// deno-lint-ignore no-explicit-any
type Admin = any;

type PostCompleto = PostFila & {
  caption: string;
  slides: Array<{ url: string; alt: string | null }>;
  ig_container_id: string | null;
  attempts: number;
};

type Registrar = (postId: string, kind: string, extra?: Record<string, unknown>) => Promise<void>;

async function marcarFalha(admin: Admin, registrar: Registrar, id: string, msg: string) {
  await admin.from("social_post").update({ status: "failed", last_error: msg }).eq("id", id);
  await registrar(id, "failed", { note: msg });
}

/** Rodada que caiu no meio do caminho: decide pelo container, nunca publicando de novo às cegas. */
async function reconciliar(
  admin: Admin,
  cfg: IgConfig,
  p: PostCompleto,
  registrar: Registrar,
  onCall: (c: GraphCall) => Promise<void>,
) {
  if (!p.ig_container_id) {
    await marcarFalha(admin, registrar, p.id, "A rodada caiu antes de criar o envio na Meta. Reagende para tentar de novo.");
    return;
  }
  const st = await statusDoContainer(cfg, p.ig_container_id, { onCall });
  if (!jaPublicado(st)) {
    await marcarFalha(admin, registrar, p.id, `A rodada caiu com o envio na Meta em ${st || "estado desconhecido"}. Reagende para tentar de novo.`);
    return;
  }
  const midia = await acharMidiaPorLegenda(cfg, p.caption, { onCall });
  if (!midia) {
    await marcarFalha(admin, registrar, p.id, "O envio aparece como publicado na Meta, mas o post não foi achado no perfil. Confira no Instagram antes de reagendar.");
    return;
  }
  await admin
    .from("social_post")
    .update({ status: "published", ig_media_id: midia.id, ig_permalink: midia.permalink, published_at: new Date().toISOString(), last_error: null })
    .eq("id", p.id);
  await registrar(p.id, "reconciled", { note: "o envio já estava publicado; nada foi publicado de novo", response: midia });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: autorizado } = await admin.rpc("cron_key_matches", {
    p_name: "social_dispatch_key",
    p_key: req.headers.get("x-social-dispatch-key") ?? "",
  });
  if (autorizado !== true) return json({ error: "unauthorized" }, 401);

  const cfg = igConfigFromEnv(env);
  if (!cfg || !cfg.igUserId) return json({ error: "INSTAGRAM_ACCESS_TOKEN ou INSTAGRAM_USER_ID ausente" }, 503);

  const { data: chave } = await admin.from("app_setting").select("value").eq("key", "social_dispatch_enabled").maybeSingle();
  const ligada = String(chave?.value ?? "").toLowerCase() === "true";

  const agora = new Date();
  const desde = new Date(agora.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const campos = "id, status, scheduled_at, published_at, updated_at, caption, slides, ig_container_id, attempts";
  const { data: ativos, error: e1 } = await admin
    .from("social_post").select(campos).is("deleted_at", null).in("status", ["approved", "publishing"]);
  const { data: recentes, error: e2 } = await admin
    .from("social_post").select(campos).is("deleted_at", null).eq("status", "published").gte("published_at", desde);
  if (e1 || e2) return json({ error: (e1 ?? e2).message }, 500);
  const posts = [...(ativos ?? []), ...(recentes ?? [])] as PostCompleto[];

  const registrar: Registrar = async (postId, kind, extra = {}) => {
    await admin.from("social_post_event").insert({ social_post_id: postId, kind, ...extra });
  };
  const rastro = (postId: string) => async (c: GraphCall) => {
    await registrar(postId, c.kind, {
      http_status: c.result.status || null,
      request: { metodo: c.metodo, caminho: c.caminho, campos: c.campos },
      response: c.result.body,
    });
  };

  // 1. Rodada que caiu no meio do caminho.
  if (ligada) {
    const ids = parados(posts, agora);
    for (const id of ids) {
      const p = posts.find((x) => x.id === id)!;
      await reconciliar(admin, cfg, p, registrar, rastro(p.id));
    }
    if (ids.length) return json({ ok: true, acao: "reconciliou", posts: ids });
  }

  // 2. Atrasados saem da fila.
  for (const id of atrasados(posts, agora)) {
    const { data } = await admin.from("social_post").update({ status: "overdue" }).eq("id", id).eq("status", "approved").select("id");
    if (data?.length) {
      await registrar(id, "overdue", { note: "Passou mais de 6 horas da hora marcada sem publicar. Reagende para voltar à fila." });
    }
  }

  // 3. Quem sai agora.
  const escolha = escolher(posts, agora);
  if (!("id" in escolha)) return json({ ok: true, acao: escolha.motivo, ligada });
  const post = posts.find((p) => p.id === escolha.id)!;

  // 4. Chave desligada: registra o que faria, uma vez.
  if (!ligada) {
    const { count } = await admin
      .from("social_post_event").select("id", { count: "exact", head: true })
      .eq("social_post_id", post.id).eq("kind", "dry_run");
    if (!count) {
      await registrar(post.id, "dry_run", {
        note: "Publicaria agora. A publicação automática está desligada.",
        request: { slides: post.slides.length, caracteres: post.caption.length, scheduled_at: post.scheduled_at },
      });
    }
    return json({ ok: true, acao: "dry_run", post: post.id });
  }

  // 5. Pega o post. Se outra rodada pegou antes, a linha não volta.
  const { data: pego } = await admin
    .from("social_post")
    .update({ status: "publishing", attempts: post.attempts + 1 })
    .eq("id", post.id).eq("status", "approved")
    .select("id");
  if (!pego?.length) return json({ ok: true, acao: "outra_rodada", post: post.id });

  if (post.ig_container_id) {
    const st = await statusDoContainer(cfg, post.ig_container_id, { onCall: rastro(post.id) });
    if (jaPublicado(st)) {
      await reconciliar(admin, cfg, post, registrar, rastro(post.id));
      return json({ ok: true, acao: "reconciliado", post: post.id });
    }
  }

  const res = await publicar(
    cfg,
    { caption: post.caption, images: post.slides.map((s) => ({ url: s.url, alt: s.alt })) },
    {
      onCall: rastro(post.id),
      onContainer: async (id) => {
        await admin.from("social_post").update({ ig_container_id: id }).eq("id", post.id);
      },
    },
  );
  if (!res.ok) {
    const msg = resumoDoErro(res.etapa, res.resposta);
    await marcarFalha(admin, registrar, post.id, msg);
    return json({ ok: false, acao: "falhou", post: post.id, erro: msg }, 502);
  }

  const permalink = await lerPermalink(cfg, res.mediaId, { onCall: rastro(post.id) });
  await admin
    .from("social_post")
    .update({ status: "published", ig_media_id: res.mediaId, ig_permalink: permalink, published_at: new Date().toISOString(), last_error: null })
    .eq("id", post.id);
  return json({ ok: true, acao: "publicado", post: post.id, permalink });
});
```

- [ ] **Step 6: Migration do cron**

Criar `supabase/migrations/20261130190000_social_dispatch_cron.sql`:

```sql
-- Cron da publicação agendada do Instagram (E3.6).
--
-- A chave nasce aqui dentro, no Vault, e a Edge pergunta ao banco se bate (cron_key_matches):
-- o valor nunca passa por terminal, CLI nem secret de Edge, e rotacionar é um UPDATE no Vault.
-- Mesmo padrão do robô de pesquisa de preço (20261112090000).
--
-- A cada 15 minutos. A rodada é inofensiva com a chave `social_dispatch_enabled` desligada: só
-- grava `dry_run`. Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'social_dispatch_key',
  'Header x-social-dispatch-key do cron da fila do Instagram'
) where not exists (select 1 from vault.secrets where name = 'social_dispatch_key');

select cron.unschedule('social-dispatch')
 where exists (select 1 from cron.job where jobname = 'social-dispatch');

select cron.schedule(
  'social-dispatch',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/social-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-dispatch-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'social_dispatch_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
```

Em `supabase/config.toml`, logo depois do bloco `[functions.social-draft]`:

```toml
[functions.social-dispatch]
verify_jwt = false
```

Conferir o carimbo: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` → saída vazia.

- [ ] **Step 7: Publicar a função, aplicar a migration e provar a rodada**

Primeiro a função, depois o cron (senão o cron chama uma função que ainda não existe):

```bash
supabase functions deploy social-dispatch --no-verify-jwt
```

Aplicar a migration pelo MCP `apply_migration(name: "social_dispatch_cron", query: <conteúdo>)` (ou `supabase db query --linked -f … && supabase migration repair --status applied 20261130190000`).

Rodar uma rodada na hora, do mesmo jeito que o cron chama:

```sql
select net.http_post(
  url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/social-dispatch',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-social-dispatch-key', (select decrypted_secret from vault.decrypted_secrets where name = 'social_dispatch_key')),
  body := '{}'::jsonb, timeout_milliseconds := 120000) as request_id;
```

Esperar uns segundos e ler a resposta:

```sql
select status_code, content::text from net._http_response order by id desc limit 1;
```

Expected: `200` e `{"ok":true,"acao":"nada","ligada":false}`. E o cron existe: `select jobname, schedule from cron.job where jobname = 'social-dispatch';` → `social-dispatch | */15 * * * *`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/social-dispatch/ supabase/migrations/20261130190000_social_dispatch_cron.sql supabase/config.toml
git commit -m "feat(instagram): Edge social-dispatch publica a fila na hora marcada, um por dia, sem nunca publicar duas vezes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Tipos, regras e dados da tela

**Files:**
- Modify: `src/types/domain.ts` (acrescentar no fim)
- Create: `src/features/social/social.logic.ts`
- Create: `src/features/social/social.logic.test.ts`
- Create: `src/features/social/api.ts`

**Interfaces:**
- Produces (domain.ts): `SocialPostStatus`, `SocialPostKind`, `SocialPostSlide`, `SocialPostValidation`, `SocialPost`, `SocialPostEvent`.
- Produces (social.logic.ts): `type SocialAba = "para-aprovar" | "agendados" | "publicados" | "falhas"`, `ABAS: { id: SocialAba; rotulo: string }[]`, `abaDoStatus(s): SocialAba | null`, `ROTULO_STATUS: Record<SocialPostStatus, string>`, `TOM_STATUS: Record<SocialPostStatus, "pending" | "confirmed" | "active" | "completed" | "cancelled" | "neutral" | "noshow">`, `ROTULO_EVENTO: Record<string, string>`, `LIMITE_GANCHO = 125`, `partirGancho(caption): { gancho: string; resto: string }`, `podeAprovar(p, agora): { ok: true } | { ok: false; motivo: string }`, `paraCampoDeData(iso): string`, `deCampoDeData(valor): string`, `formatarQuando(iso): string`, `formatarDia(aaaaMmDd): string`, `REAGENDAVEIS: SocialPostStatus[]`.
- Produces (api.ts): `socialKeys`, `useSocialPosts()`, `useSocialPostEvents(id: string | null)`, `useApproveSocialPost()` (`{ p_id }`), `useRejectSocialPost()` (`{ p_id, p_reason }`), `useRescheduleSocialPost()` (`{ p_id, p_at }`), `useUpdateSocialCaption()` (`{ id, caption }` → `SocialPostValidation`).

- [ ] **Step 1: Tipos curados**

Acrescentar ao fim de `src/types/domain.ts`:

```ts
// ── Fila do Instagram (E3.6) ────────────────────────────────────────────────────────────
// Escritos à mão: o `supabase gen types` vem derrubando tabelas e funções (ver
// features/payouts/api.ts), e a fila não pode depender dele. Espelham a migration
// 20261130180000_social_post.sql; mudou a tabela, muda aqui.

export type SocialPostStatus =
  | "pending_review"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "rejected"
  | "overdue";

export type SocialPostKind = "image" | "carousel";

export type SocialPostSlide = { url: string; path: string; alt: string | null; texto: string | null };

export type SocialPostValidation = { blockers: string[]; warnings: string[] };

export type SocialPost = {
  id: string;
  draft_key: string;
  status: SocialPostStatus;
  kind: SocialPostKind;
  caption: string;
  slides: SocialPostSlide[];
  keyphrase: string | null;
  cut_number: number | null;
  blog_post_id: string | null;
  destination_id: string | null;
  cta_url: string | null;
  price_date: string | null;
  scheduled_at: string;
  validation: SocialPostValidation;
  approved_by: string | null;
  approved_at: string | null;
  ig_container_id: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  published_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialPostEvent = {
  id: string;
  social_post_id: string;
  kind: string;
  http_status: number | null;
  request: Json | null;
  response: Json | null;
  note: string | null;
  actor: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Escrever os testes das regras**

Criar `src/features/social/social.logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  abaDoStatus,
  deCampoDeData,
  formatarDia,
  paraCampoDeData,
  partirGancho,
  podeAprovar,
} from "./social.logic";

const AGORA = new Date("2026-10-21T15:00:00Z");

describe("abaDoStatus", () => {
  it("põe o atrasado junto do que espera aprovação, e esconde o recusado", () => {
    expect(abaDoStatus("pending_review")).toBe("para-aprovar");
    expect(abaDoStatus("overdue")).toBe("para-aprovar");
    expect(abaDoStatus("approved")).toBe("agendados");
    expect(abaDoStatus("publishing")).toBe("agendados");
    expect(abaDoStatus("published")).toBe("publicados");
    expect(abaDoStatus("failed")).toBe("falhas");
    expect(abaDoStatus("rejected")).toBeNull();
  });
});

describe("partirGancho", () => {
  it("separa os 125 caracteres que aparecem antes do mais", () => {
    const legenda = "a".repeat(130);
    expect(partirGancho(legenda)).toEqual({ gancho: "a".repeat(125), resto: "aaaaa" });
  });
});

describe("podeAprovar", () => {
  const limpo = { status: "pending_review" as const, validation: { blockers: [], warnings: ["x"] }, scheduled_at: "2026-10-22T15:00:00Z" };

  it("aprova post limpo com data futura, mesmo com aviso", () => {
    expect(podeAprovar(limpo, AGORA)).toEqual({ ok: true });
  });
  it("trava com bloqueio", () => {
    expect(podeAprovar({ ...limpo, validation: { blockers: ["b"], warnings: [] } }, AGORA).ok).toBe(false);
  });
  it("trava com data passada", () => {
    expect(podeAprovar({ ...limpo, scheduled_at: "2026-10-21T14:00:00Z" }, AGORA).ok).toBe(false);
  });
  it("trava fora de pending_review", () => {
    expect(podeAprovar({ ...limpo, status: "approved" }, AGORA).ok).toBe(false);
  });
});

describe("campo de data", () => {
  it("mostra a hora de São Paulo e volta ao mesmo instante", () => {
    expect(paraCampoDeData("2026-10-28T15:00:00.000Z")).toBe("2026-10-28T12:00");
    expect(deCampoDeData("2026-10-28T12:00")).toBe("2026-10-28T15:00:00.000Z");
  });
});

describe("formatarDia", () => {
  it("escreve a data no formato brasileiro", () => {
    expect(formatarDia("2026-10-21")).toBe("21/10/2026");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bunx vitest run --project unit src/features/social/social.logic.test.ts`
Expected: FAIL com `Failed to resolve import "./social.logic"`.

- [ ] **Step 4: Implementar as regras**

Criar `src/features/social/social.logic.ts`:

```ts
import type { SocialPost, SocialPostStatus } from "@/types/domain";

/**
 * Regras da tela da fila do Instagram (E3.6). O servidor é quem decide (RPC e Edge); aqui é só
 * o espelho, para a tela não oferecer o que o servidor vai recusar.
 *
 * Spec: docs/specs/instagram-fila-de-publicacao.md
 */

export type SocialAba = "para-aprovar" | "agendados" | "publicados" | "falhas";

export const ABAS: { id: SocialAba; rotulo: string }[] = [
  { id: "para-aprovar", rotulo: "Para aprovar" },
  { id: "agendados", rotulo: "Agendados" },
  { id: "publicados", rotulo: "Publicados" },
  { id: "falhas", rotulo: "Falhas" },
];

/** O atrasado volta para "Para aprovar" porque precisa de uma decisão: nova data. O recusado some. */
export function abaDoStatus(s: SocialPostStatus): SocialAba | null {
  switch (s) {
    case "pending_review":
    case "overdue":
      return "para-aprovar";
    case "approved":
    case "publishing":
      return "agendados";
    case "published":
      return "publicados";
    case "failed":
      return "falhas";
    default:
      return null;
  }
}

export const ROTULO_STATUS: Record<SocialPostStatus, string> = {
  pending_review: "Para aprovar",
  approved: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  rejected: "Recusado",
  overdue: "Atrasado",
};

export const TOM_STATUS: Record<
  SocialPostStatus,
  "pending" | "confirmed" | "active" | "completed" | "cancelled" | "neutral" | "noshow"
> = {
  pending_review: "pending",
  approved: "confirmed",
  publishing: "active",
  published: "completed",
  failed: "cancelled",
  rejected: "neutral",
  overdue: "noshow",
};

export const ROTULO_EVENTO: Record<string, string> = {
  draft_received: "Rascunho recebido",
  caption_edited: "Legenda corrigida",
  approved: "Aprovado",
  rejected: "Recusado",
  rescheduled: "Reagendado",
  dry_run: "Publicaria agora (publicação automática desligada)",
  container_child: "Envio do slide criado na Meta",
  container_parent: "Envio do post criado na Meta",
  container_status: "Situação do envio na Meta",
  media_publish: "Publicado na Meta",
  permalink: "Link do post lido",
  consulta: "Consulta à Meta",
  reconciled: "Conferido: já estava publicado",
  overdue: "Atrasado",
  failed: "Falhou",
};

/** Estados em que a data ainda pode mudar. Em `failed`, reagendar é o "tentar de novo". */
export const REAGENDAVEIS: SocialPostStatus[] = ["pending_review", "approved", "overdue", "failed"];

/** O Instagram mostra cerca de 125 caracteres antes do "mais". */
export const LIMITE_GANCHO = 125;

export function partirGancho(caption: string): { gancho: string; resto: string } {
  return { gancho: caption.slice(0, LIMITE_GANCHO), resto: caption.slice(LIMITE_GANCHO) };
}

export function podeAprovar(
  p: Pick<SocialPost, "status" | "validation" | "scheduled_at">,
  agora: Date,
): { ok: true } | { ok: false; motivo: string } {
  if (p.status !== "pending_review") return { ok: false, motivo: "Só post aguardando aprovação pode ser aprovado." };
  if (p.validation.blockers.length) return { ok: false, motivo: "Resolva os bloqueios antes de aprovar." };
  if (Date.parse(p.scheduled_at) <= agora.getTime()) {
    return { ok: false, motivo: "A data já passou. Reagende antes de aprovar." };
  }
  return { ok: true };
}

/** O Brasil não tem horário de verão desde 2019, então São Paulo é sempre -03:00. */
const TRES_HORAS = 3 * 60 * 60 * 1000;

/** ISO do banco para o valor de um `<input type="datetime-local">` na hora de São Paulo. */
export function paraCampoDeData(iso: string): string {
  return new Date(Date.parse(iso) - TRES_HORAS).toISOString().slice(0, 16);
}

/** Valor do `<input type="datetime-local">`, lido como hora de São Paulo, para ISO em UTC. */
export function deCampoDeData(valor: string): string {
  return new Date(`${valor}:00-03:00`).toISOString();
}

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function formatarQuando(iso: string): string {
  return QUANDO.format(new Date(iso));
}

/** AAAA-MM-DD para DD/MM/AAAA, sem passar por Date (que mudaria o dia pelo fuso). */
export function formatarDia(aaaaMmDd: string): string {
  return `${aaaaMmDd.slice(8, 10)}/${aaaaMmDd.slice(5, 7)}/${aaaaMmDd.slice(0, 4)}`;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bunx vitest run --project unit src/features/social/social.logic.test.ts`
Expected: todos `passed`.

- [ ] **Step 6: Hooks de dados**

Criar `src/features/social/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { SocialPost, SocialPostEvent, SocialPostValidation } from "@/types/domain";

/**
 * Fila de publicação do Instagram (E3.6). A tela lê a fila e o rastro, e decide pelas RPCs
 * `social_post_*`, que conferem hub_admin no servidor. A correção de legenda vai pela Edge
 * `social-draft`, porque é lá que a conferência roda.
 *
 * Spec: docs/specs/instagram-fila-de-publicacao.md
 */

/**
 * `social_post`, `social_post_event` e as RPCs não passam pelo tipo gerado: o `supabase gen
 * types` vem derrubando tabelas e funções que existem no banco (ver features/payouts/api.ts).
 * O cliente sem tipo fica neste arquivo só, e os tipos da tela são os curados em `@/types/domain`.
 */
const db = supabase as unknown as SupabaseClient;

export const socialKeys = {
  all: ["social"] as const,
  list: () => [...socialKeys.all, "list"] as const,
  events: (id: string) => [...socialKeys.all, "events", id] as const,
};

async function fetchPosts(): Promise<SocialPost[]> {
  const { data, error } = await db
    .from("social_post")
    .select("*")
    .is("deleted_at", null)
    .neq("status", "rejected")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SocialPost[];
}

export function useSocialPosts() {
  return useQuery({ queryKey: socialKeys.list(), queryFn: fetchPosts });
}

export function useSocialPostEvents(id: string | null) {
  return useQuery({
    queryKey: socialKeys.events(id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<SocialPostEvent[]> => {
      const { data, error } = await db
        .from("social_post_event")
        .select("*")
        .eq("social_post_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SocialPostEvent[];
    },
  });
}

function useSocialRpc<T extends Record<string, unknown>>(fn: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: T) => {
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

export function useApproveSocialPost() {
  return useSocialRpc<{ p_id: string }>("social_post_approve");
}

export function useRejectSocialPost() {
  return useSocialRpc<{ p_id: string; p_reason: string }>("social_post_reject");
}

export function useRescheduleSocialPost() {
  return useSocialRpc<{ p_id: string; p_at: string }>("social_post_reschedule");
}

export function useUpdateSocialCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }): Promise<SocialPostValidation> => {
      const { data, error } = await supabase.functions.invoke("social-draft", {
        body: { action: "update_caption", id, caption },
      });
      if (error) throw error;
      return (data as { validation: SocialPostValidation }).validation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}
```

Run: `bun run typecheck`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts src/features/social/social.logic.ts src/features/social/social.logic.test.ts src/features/social/api.ts
git commit -m "feat(instagram): tipos, regras e dados da tela da fila

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: Tela `/manager/social`

**Files:**
- Create: `src/features/social/SocialPostDetail.tsx`
- Create: `src/routes/manager/social.tsx`
- Create: `src/routes/manager/social.test.tsx`
- Modify: `src/routes.tsx` (import junto dos outros `Manager*` e rota logo depois de `blog`)
- Modify: `src/components/shared/nav-items.ts` (ícone e item depois de Blog)

**Interfaces:**
- Consumes: tudo da Task 6; `useAppSettings`, `useUpdateAppSettings` de `@/features/settings/api`.
- Produces: `export default function ManagerSocial()`; `export function SocialPostDetail({ post, onClose }: { post: SocialPost | null; onClose: () => void })`.

- [ ] **Step 1: Escrever o teste da tela**

Criar `src/routes/manager/social.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { SocialPost } from "@/types/domain";

const { posts, settings, approve, updateSettings } = vi.hoisted(() => ({
  posts: { current: [] as unknown[] },
  settings: { current: {} as Record<string, string> },
  approve: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/features/social/api", () => ({
  useSocialPosts: () => ({ data: posts.current, isLoading: false }),
  useSocialPostEvents: () => ({ data: [], isLoading: false }),
  useApproveSocialPost: () => ({ mutateAsync: approve, isPending: false }),
  useRejectSocialPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRescheduleSocialPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSocialCaption: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => ({ data: settings.current, isLoading: false }),
  useUpdateAppSettings: () => ({ mutateAsync: updateSettings, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerSocial from "./social";

const FUTURO = new Date(Date.now() + 3 * 86_400_000).toISOString();
const LEGENDA =
  "Estacionar no aeroporto de Confins sai mais barato do que parece quando a viagem passa de uma semana inteira. " +
  "A conta muda pelo traslado.\n\n#confins #estacionamentoaeroporto #movepark";

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "p1",
    draft_key: "confins:1",
    status: "pending_review",
    kind: "image",
    caption: LEGENDA,
    slides: [{ url: "https://exemplo.co/1.jpg", path: "social/confins/1.jpg", alt: "pátio em Confins", texto: null }],
    keyphrase: "estacionamento no aeroporto de Confins",
    cut_number: 1,
    blog_post_id: null,
    destination_id: null,
    cta_url: null,
    price_date: null,
    scheduled_at: FUTURO,
    validation: { blockers: [], warnings: [] },
    approved_by: null,
    approved_at: null,
    ig_container_id: null,
    ig_media_id: null,
    ig_permalink: null,
    published_at: null,
    attempts: 0,
    last_error: null,
    created_at: FUTURO,
    updated_at: FUTURO,
    ...over,
  };
}

describe("ManagerSocial", () => {
  beforeEach(() => {
    approve.mockReset();
    approve.mockResolvedValue(undefined);
    updateSettings.mockReset();
    updateSettings.mockResolvedValue(undefined);
    settings.current = { social_dispatch_enabled: "false" };
    posts.current = [
      post(),
      post({
        id: "p2",
        draft_key: "confins:2",
        caption: "Vaga garantida em Confins.\n\n#confins #movepark #aeroporto",
        validation: { blockers: ['Promessa de transação na legenda: "vaga garantida" (ADR-009).'], warnings: [] },
      }),
      post({ id: "p3", draft_key: "confins:3", status: "approved" }),
      post({ id: "p4", draft_key: "confins:4", status: "published", ig_media_id: "m1", ig_permalink: "https://www.instagram.com/p/x/" }),
    ];
  });

  it("separa os posts por aba, com a contagem", () => {
    renderWithProviders(<ManagerSocial />);
    expect(screen.getByRole("tab", { name: "Para aprovar (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agendados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Publicados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Falhas (0)" })).toBeInTheDocument();
  });

  it("aprova o post limpo", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    const aprovar = await screen.findByRole("button", { name: "Aprovar" });
    expect(aprovar).toBeEnabled();
    await userEvent.click(aprovar);
    await waitFor(() => expect(approve).toHaveBeenCalledWith({ p_id: "p1" }));
  });

  it("trava a aprovação enquanto houver bloqueio e mostra o motivo", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Vaga garantida em Confins/));
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeDisabled();
    expect(screen.getByText(/Bloqueio: Promessa de transação/)).toBeInTheDocument();
  });

  it("destaca os primeiros 125 caracteres da legenda, que aparecem antes do mais", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    expect((await screen.findByTestId("gancho")).textContent).toBe(LEGENDA.slice(0, 125));
  });

  it("liga a publicação automática só depois de confirmar", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<ManagerSocial />);
    expect(screen.getByText("Publicação automática desligada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Publicação automática" }));
    expect(confirmar).toHaveBeenCalled();
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ social_dispatch_enabled: "true" }));
    confirmar.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run --project unit src/routes/manager/social.test.tsx`
Expected: FAIL com `Failed to resolve import "./social"`.

- [ ] **Step 3: Diálogo do post**

Criar `src/features/social/SocialPostDetail.tsx`:

```tsx
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useApproveSocialPost,
  useRejectSocialPost,
  useRescheduleSocialPost,
  useSocialPostEvents,
  useUpdateSocialCaption,
} from "./api";
import {
  deCampoDeData,
  formatarDia,
  formatarQuando,
  paraCampoDeData,
  partirGancho,
  podeAprovar,
  REAGENDAVEIS,
  ROTULO_EVENTO,
  ROTULO_STATUS,
} from "./social.logic";
import type { SocialPost } from "@/types/domain";

/**
 * Um post da fila do Instagram: os slides como vão sair, a legenda com o trecho que aparece antes
 * do "mais", a conferência, a agenda, a decisão e o rastro. A imagem não se edita aqui: trocar a
 * arte é refazer o post na skill e reenviar.
 */
export function SocialPostDetail({ post, onClose }: { post: SocialPost | null; onClose: () => void }) {
  const eventos = useSocialPostEvents(post?.id ?? null);
  const aprovar = useApproveSocialPost();
  const recusar = useRejectSocialPost();
  const reagendar = useRescheduleSocialPost();
  const corrigir = useUpdateSocialCaption();
  const [quando, setQuando] = React.useState("");
  const [legenda, setLegenda] = React.useState("");
  const [editando, setEditando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  React.useEffect(() => {
    if (!post) return;
    setQuando(paraCampoDeData(post.scheduled_at));
    setLegenda(post.caption);
    setEditando(false);
    setMotivo("");
  }, [post]);

  if (!post) return null;

  const aprovacao = podeAprovar(post, new Date());
  const { gancho, resto } = partirGancho(post.caption);
  const reagendavel = REAGENDAVEIS.includes(post.status);
  const editavel = post.status === "pending_review" || post.status === "approved";

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    try {
      await acao();
      toast.success(sucesso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo. Tente de novo.");
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ROTULO_STATUS[post.status]} · {formatarQuando(post.scheduled_at)}
          </DialogTitle>
          <DialogDescription>
            Origem: {post.draft_key}
            {post.keyphrase ? ` · Frase-chave: ${post.keyphrase}` : ""}
            {post.price_date ? ` · Preços conferidos em ${formatarDia(post.price_date)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Slides" className="flex gap-3 overflow-x-auto pb-2">
          {post.slides.map((s, i) => (
            <figure key={s.path} className="w-40 shrink-0">
              <img src={s.url} alt={s.alt ?? ""} className="aspect-[4/5] w-full rounded object-cover" />
              <figcaption className="mt-1 text-xs text-muted">
                {i + 1}. {s.alt ?? "Sem texto alternativo"}
              </figcaption>
            </figure>
          ))}
        </section>

        <section aria-label="Legenda" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Legenda</h3>
            <span className="text-xs text-muted">{post.caption.length} de 2.200 caracteres</span>
          </div>
          {editando ? (
            <>
              <Textarea
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                rows={10}
                aria-label="Legenda do post"
              />
              <div className="flex gap-2">
                <Button
                  disabled={corrigir.isPending}
                  onClick={() =>
                    executar(async () => {
                      await corrigir.mutateAsync({ id: post.id, caption: legenda });
                      setEditando(false);
                    }, "Legenda salva. O post voltou para aprovação.")
                  }
                >
                  Salvar legenda
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLegenda(post.caption);
                    setEditando(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap rounded border border-hairline p-3 text-sm">
              <mark data-testid="gancho" className="bg-mp-primary/10 text-ink">
                {gancho}
              </mark>
              {resto}
            </p>
          )}
          {!editando && editavel && (
            <Button variant="ghost" onClick={() => setEditando(true)}>
              Corrigir legenda
            </Button>
          )}
        </section>

        {(post.validation.blockers.length > 0 || post.validation.warnings.length > 0) && (
          <section aria-label="Conferência" className="space-y-1 text-sm">
            {post.validation.blockers.map((b) => (
              <p key={b} className="text-error">
                Bloqueio: {b}
              </p>
            ))}
            {post.validation.warnings.map((w) => (
              <p key={w} className="text-muted">
                Atenção: {w}
              </p>
            ))}
          </section>
        )}

        {post.last_error && <p className="text-sm text-error">Último erro: {post.last_error}</p>}
        {post.ig_permalink && (
          <a href={post.ig_permalink} target="_blank" rel="noreferrer" className="text-sm text-mp-primary underline">
            Ver o post no Instagram
          </a>
        )}

        {reagendavel && (
          <section aria-label="Agenda" className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="social-quando">Data e hora (São Paulo)</Label>
              <Input
                id="social-quando"
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              disabled={!quando || reagendar.isPending}
              onClick={() =>
                executar(
                  () => reagendar.mutateAsync({ p_id: post.id, p_at: deCampoDeData(quando) }),
                  "Post reagendado",
                )
              }
            >
              {post.status === "failed" ? "Tentar de novo nessa data" : "Reagendar"}
            </Button>
          </section>
        )}

        {post.status === "pending_review" && (
          <section aria-label="Aprovação" className="space-y-2">
            {!aprovacao.ok && <p className="text-sm text-muted">{aprovacao.motivo}</p>}
            <Button
              disabled={!aprovacao.ok || aprovar.isPending}
              onClick={() => executar(() => aprovar.mutateAsync({ p_id: post.id }), "Post aprovado")}
            >
              Aprovar
            </Button>
          </section>
        )}

        {reagendavel && (
          <section aria-label="Recusa" className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <Label htmlFor="social-motivo">Motivo da recusa</Label>
              <Input id="social-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <Button
              variant="danger"
              disabled={!motivo.trim() || recusar.isPending}
              onClick={() =>
                executar(async () => {
                  await recusar.mutateAsync({ p_id: post.id, p_reason: motivo });
                  onClose();
                }, "Post recusado")
              }
            >
              Recusar
            </Button>
          </section>
        )}

        <section aria-label="Rastro" className="space-y-1">
          <h3 className="font-semibold">Rastro</h3>
          {(eventos.data ?? []).map((ev) => (
            <details key={ev.id} className="rounded border border-hairline p-2 text-xs">
              <summary>
                {formatarQuando(ev.created_at)} · {ROTULO_EVENTO[ev.kind] ?? ev.kind}
                {ev.http_status ? ` · HTTP ${ev.http_status}` : ""}
                {ev.note ? ` · ${ev.note}` : ""}
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify({ request: ev.request, response: ev.response }, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Página**

Criar `src/routes/manager/social.tsx`:

```tsx
import * as React from "react";
import { toast } from "sonner";
import { InstagramLogo } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSettings, useUpdateAppSettings } from "@/features/settings/api";
import { useSocialPosts } from "@/features/social/api";
import { SocialPostDetail } from "@/features/social/SocialPostDetail";
import {
  ABAS,
  abaDoStatus,
  formatarQuando,
  ROTULO_STATUS,
  type SocialAba,
  TOM_STATUS,
} from "@/features/social/social.logic";
import type { SocialPost } from "@/types/domain";

const VAZIO: Record<SocialAba, string> = {
  "para-aprovar": "Quando um post chegar da skill do Instagram, ele aparece aqui para você conferir.",
  agendados: "Nenhum post aprovado esperando a hora de sair.",
  publicados: "Nenhum post publicado pela plataforma ainda.",
  falhas: "Nenhuma publicação falhou.",
};

/**
 * Fila de publicação do Instagram (E3.6). O post chega pronto da skill, alguém confere e aprova
 * aqui, e a Edge `social-dispatch` publica na hora marcada quando a publicação automática está
 * ligada. Spec: docs/specs/instagram-fila-de-publicacao.md
 */
export default function ManagerSocial() {
  const { data, isLoading } = useSocialPosts();
  const settings = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const [aba, setAba] = React.useState<SocialAba>("para-aprovar");
  const [abertoId, setAbertoId] = React.useState<string | null>(null);

  const ligada = settings.data?.social_dispatch_enabled === "true";

  const porAba = React.useMemo(() => {
    const grupos: Record<SocialAba, SocialPost[]> = {
      "para-aprovar": [],
      agendados: [],
      publicados: [],
      falhas: [],
    };
    for (const p of data ?? []) {
      const a = abaDoStatus(p.status);
      if (a) grupos[a].push(p);
    }
    grupos.publicados.reverse();
    return grupos;
  }, [data]);

  const aberto = (data ?? []).find((p) => p.id === abertoId) ?? null;

  async function alternar(valor: boolean) {
    const pergunta = valor
      ? "Ligar a publicação automática? Os posts aprovados passam a sair sozinhos na hora marcada."
      : "Desligar a publicação automática? Nada sai até você ligar de novo.";
    if (!window.confirm(pergunta)) return;
    try {
      await updateSettings.mutateAsync({ social_dispatch_enabled: valor ? "true" : "false" });
      toast.success(valor ? "Publicação automática ligada" : "Publicação automática desligada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para salvar. Tente de novo.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instagram"
        description="Os posts que chegaram para aprovar, a fila do que vai sair e o que já foi publicado."
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Switch
              checked={ligada}
              onCheckedChange={alternar}
              aria-label="Publicação automática"
              disabled={settings.isLoading || updateSettings.isPending}
            />
            <span>{ligada ? "Publicação automática ligada" : "Publicação automática desligada"}</span>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs value={aba} onValueChange={(v) => setAba(v as SocialAba)}>
          <TabsList>
            {ABAS.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.rotulo} ({porAba[a.id].length})
              </TabsTrigger>
            ))}
          </TabsList>
          {ABAS.map((a) => (
            <TabsContent key={a.id} value={a.id} className="mt-4">
              {porAba[a.id].length === 0 ? (
                <EmptyState icon={<InstagramLogo />} title="Nada por aqui" description={VAZIO[a.id]} />
              ) : (
                <ul className="divide-y divide-hairline rounded-lg border border-hairline">
                  {porAba[a.id].map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setAbertoId(p.id)}
                        className="flex w-full items-center gap-4 p-3 text-left hover:bg-surface-soft"
                      >
                        <img src={p.slides[0]?.url} alt="" className="size-16 shrink-0 rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.caption.split("\n")[0]}</p>
                          <p className="text-sm text-muted">
                            {formatarQuando(p.scheduled_at)} · {p.slides.length}{" "}
                            {p.slides.length > 1 ? "slides" : "imagem"}
                          </p>
                        </div>
                        <Badge tone={TOM_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <SocialPostDetail post={aberto} onClose={() => setAbertoId(null)} />
    </div>
  );
}
```

- [ ] **Step 5: Rota e menu**

Em `src/routes.tsx`, logo depois da linha `import ManagerBlog from "@/routes/manager/blog";`:

```tsx
import ManagerSocial from "@/routes/manager/social";
```

e logo depois de `{ path: "blog", element: <ManagerBlog /> },`:

```tsx
              // Fila de publicação do Instagram (E3.6).
              { path: "social", element: <ManagerSocial /> },
```

Em `src/components/shared/nav-items.ts`, acrescentar `InstagramLogo` à lista de ícones importados de `@phosphor-icons/react` (em ordem alfabética, entre `Handshake` e `Kanban`) e, logo depois de `{ to: "/manager/blog", label: "Blog", icon: Article },`:

```ts
      { to: "/manager/social", label: "Instagram", icon: InstagramLogo },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `bunx vitest run --project unit src/routes/manager/social.test.tsx src/components/shared/`
Expected: todos `passed` (inclusive os testes do menu, que conferem rotas únicas).

- [ ] **Step 7: Revisão de copy**

Invocar a skill `revisar-texto` sobre todas as strings visíveis de `SocialPostDetail.tsx`, `social.tsx` e de `ROTULO_STATUS`, `ROTULO_EVENTO` e `ABAS` em `social.logic.ts`. Aplicar o que ela devolver. Se mudar alguma string usada nos testes (`"Aprovar"`, `"Publicação automática desligada"`, `"Para aprovar"`), atualizar o teste junto e rodar o Step 6 de novo. Conferir travessão: `grep -n "[—–]" src/features/social/*.ts* src/routes/manager/social.tsx` → nada.

- [ ] **Step 8: Typecheck, lint e commit**

```bash
bun run typecheck && bun run lint
git add src/features/social/SocialPostDetail.tsx src/routes/manager/social.tsx src/routes/manager/social.test.tsx src/routes.tsx src/components/shared/nav-items.ts src/features/social/social.logic.ts
git commit -m "feat(instagram): tela /manager/social com aprovação, agenda e rastro de cada post

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: Envio pela skill e referência corrigida

**Files:**
- Create: `.claude/skills/instagram/scripts/enviar-rascunho.mjs`
- Modify: `.claude/skills/instagram/SKILL.md` (front matter de exemplo, Passo 11, checklist)
- Modify: `.claude/skills/instagram/references/api-instagram.md`

**Interfaces:**
- Consumes: `POST /functions/v1/social-draft` (Task 4); `analisar-carrossel.mjs --json` (já existe: imprime `{ arquivo, meta, achados, resumo }` e sai com código 1 quando há bloqueio).
- Produces: `node .claude/skills/instagram/scripts/enviar-rascunho.mjs <rascunho.md> [--pasta <dir>] [--seco]`.

- [ ] **Step 1: O script**

Criar `.claude/skills/instagram/scripts/enviar-rascunho.mjs`:

```js
#!/usr/bin/env node
/**
 * Envia um rascunho pronto da skill para a fila do Instagram na plataforma (E3.6).
 *
 * Roda o analisador antes e aborta se houver bloqueio. A plataforma confere de novo, mas só o
 * que quebra a publicação ou a marca; o resto da régua da skill mora no analisador.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/enviar-rascunho.mjs <rascunho.md> [--pasta <dir>] [--seco]
 *
 * Os JPEGs são procurados ao lado do .md, a não ser que --pasta diga outro lugar. Com --seco,
 * mostra o que mandaria e não envia. A chave vem de SOCIAL_DRAFT_KEY (ambiente ou .env.local) e
 * a URL de VITE_SUPABASE_URL (.env). Ver docs/specs/instagram-fila-de-publicacao.md.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../../..");

let arquivo = null;
let pasta = null;
let seco = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pasta") pasta = args[++i];
  else if (args[i] === "--seco") seco = true;
  else arquivo = args[i];
}
if (!arquivo) {
  console.error("uso: enviar-rascunho.mjs <rascunho.md> [--pasta <dir>] [--seco]");
  process.exit(2);
}
pasta = pasta ?? path.dirname(path.resolve(arquivo));

function lerEnv(nome) {
  if (process.env[nome]) return process.env[nome];
  for (const f of [".env.local", ".env"]) {
    const p = path.join(RAIZ, f);
    if (!fs.existsSync(p)) continue;
    const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${nome}=`));
    if (linha) return linha.slice(nome.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

// 1. O analisador decide se o rascunho pode sair daqui.
let analise;
try {
  analise = JSON.parse(
    execFileSync(process.execPath, [path.join(AQUI, "analisar-carrossel.mjs"), arquivo, "--json"], { encoding: "utf8" }),
  );
} catch (e) {
  // Com bloqueio ele sai com código 1, mas o JSON vem inteiro no stdout.
  if (!e.stdout) throw e;
  analise = JSON.parse(e.stdout);
}
const bloqueios = analise.achados.filter((a) => a.nivel === "vermelho");
if (bloqueios.length) {
  console.error("O analisador achou bloqueio. Corrija antes de enviar:\n");
  for (const b of bloqueios) console.error(`  XX ${b.grupo} / ${b.titulo}: ${b.texto}`);
  process.exit(1);
}

// 2. O payload, no formato que a Edge social-draft lê.
const meta = analise.meta;
const bruto = fs.readFileSync(arquivo, "utf8");
const caption = bruto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
const publicarEm = /^\d{4}-\d{2}-\d{2}$/.test(meta.publicar_em ?? "")
  ? `${meta.publicar_em}T12:00:00-03:00`
  : meta.publicar_em;
const slides = (meta.slides ?? []).map((s) => ({ arquivo: s.arquivo, alt: s.alt ?? null, texto: s.texto ?? null }));
const post = {
  origem: meta.origem_post ?? meta.origem,
  corte: meta.corte ? Number(meta.corte) : null,
  tipo: meta.tipo,
  destination: meta.destination ?? null,
  keyphrase: meta.keyphrase ?? null,
  publicar_em: publicarEm,
  cta_url: meta.cta_url ?? null,
  price_date: meta.price_date ?? null,
  caption,
  slides,
};

const form = new FormData();
form.append("post", JSON.stringify(post));
for (const s of slides) {
  const p = path.join(pasta, s.arquivo);
  if (!fs.existsSync(p)) {
    console.error(`Não achei ${p}`);
    process.exit(1);
  }
  form.append(s.arquivo, new Blob([fs.readFileSync(p)], { type: "image/jpeg" }), s.arquivo);
}

if (seco) {
  console.log(JSON.stringify({ ...post, caption: `${caption.slice(0, 80)}...` }, null, 2));
  process.exit(0);
}

// 3. O envio.
const url = lerEnv("VITE_SUPABASE_URL");
const chave = lerEnv("SOCIAL_DRAFT_KEY");
if (!url || !chave) {
  console.error("Faltou VITE_SUPABASE_URL (.env) ou SOCIAL_DRAFT_KEY (.env.local).");
  process.exit(1);
}
const r = await fetch(`${url}/functions/v1/social-draft`, {
  method: "POST",
  headers: { "x-social-draft-key": chave },
  body: form,
});
const corpo = await r.json().catch(() => ({}));
console.log(JSON.stringify(corpo, null, 2));
if (!r.ok) process.exit(1);
console.log("\nNa fila. Abra /manager/social para aprovar.");
```

- [ ] **Step 2: Provar o script em modo seco**

Montar um rascunho de teste no scratchpad com um JPEG qualquer de 1080x1350:

```bash
T=$(mktemp -d)
curl -s -o "$T/teste-seco-01.jpg" "https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/social/preco-do-estacionamento-no-aeroporto-de-confins/preco-estacionamento-aeroporto-confins-periodo-01.jpg"
cat > "$T/rascunho.md" <<'EOF'
---
tipo: post
corte: 3
origem_post: preco-do-estacionamento-no-aeroporto-de-confins
destination: aeroporto-de-confins
keyphrase: estacionamento no aeroporto de Confins
publicar_em: 2026-11-04
cta_url: https://movepark.co/destinos/aeroporto-de-confins?utm_source=instagram&utm_medium=social&utm_campaign=confins-teste
slides:
  - texto: Quanto custa estacionar em Confins
    arquivo: teste-seco-01.jpg
    alt: pátio de estacionamento no aeroporto de Confins ao entardecer
hashtags: [confins, estacionamentoaeroporto, movepark]
---

Estacionamento no aeroporto de Confins: a conta da semana muda mais pelo traslado do que pela diária.

O guia completo está no link da bio.

#confins #estacionamentoaeroporto #movepark
EOF
node .claude/skills/instagram/scripts/enviar-rascunho.mjs "$T/rascunho.md" --seco
```

Expected: o JSON do payload com `"publicar_em": "2026-11-04T12:00:00-03:00"`, `"corte": 3` e um slide. Nada é enviado. Se o analisador acusar bloqueio no rascunho de teste, ajustar o texto do teste (não o script) até passar.

- [ ] **Step 3: SKILL.md**

Em `.claude/skills/instagram/SKILL.md`:

1. No front matter de exemplo da seção "O arquivo de trabalho", logo depois da linha `publicar_em: 2026-09-10`, acrescentar `price_date: 2026-09-08`.
2. Substituir a seção inteira `## Passo 11: publicar` (do título até antes de `## O arquivo de trabalho`) por:

````markdown
## Passo 11: publicar

**O caminho padrão é a fila da plataforma.** Com o analisador sem bloqueio e os JPEGs no lugar:

```bash
node .claude/skills/instagram/scripts/enviar-rascunho.mjs <rascunho.md>
```

O script roda o analisador de novo, sobe os JPEGs e cria o post em `/manager/social` como "Para
aprovar". Um `hub_admin` confere os slides, a legenda e a data, e aprova. A Edge
`social-dispatch` publica na hora marcada, um post por dia, quando a publicação automática está
ligada na tela.

- Reenviar o mesmo rascunho (mesma `origem_post` e mesmo `corte`) atualiza o post enquanto ele
  espera aprovação. Depois de aprovado, o reenvio é recusado: peça para recusar e mande de novo.
- `--seco` mostra o que seria enviado sem mandar nada; `--pasta` aponta os JPEGs quando eles não
  estão ao lado do `.md`.
- Se `publicar_em` traz só a data, o post sai às 12:00 de São Paulo.
- **Todo R$ do post exige `price_date` no front matter.** Sem ela a plataforma trava a aprovação.

Publicar à mão pelo app continua possível, mas aí nada fica registrado na plataforma.

Detalhe da API em [`references/api-instagram.md`](references/api-instagram.md) e da fila em
[`docs/specs/instagram-fila-de-publicacao.md`](../../../docs/specs/instagram-fila-de-publicacao.md).
````

3. No "Checklist final", acrescentar o item `12. Enviado pela fila (\`enviar-rascunho.mjs\`), com \`price_date\` quando houver R$.`

- [ ] **Step 4: api-instagram.md**

Em `.claude/skills/instagram/references/api-instagram.md`:

1. Trocar o parágrafo

```
A Movepark já tem app Meta com verificação de negócio aprovada, usada pelo
WhatsApp Cloud API (`supabase/functions/_shared/whatsapp.ts`). Adicionar a
permissão de publicação é review incremental, não cadastro novo.
```

por

```
**App Review não é exigido** para app que só publica na conta da própria empresa: o
acesso padrão basta (doc oficial de App Review, conferida em 21/10/2026). Só vira
necessário se um parceiro for publicar na conta dele pela plataforma.

O que está configurado desde 21/10/2026: app **MoveparkInst** (portfólio Clientes
Agência Fera), usuário do sistema **movepark-instagram** com acesso à Página Movepark
(`315106352508707`) e conta `17841465371053612` em `INSTAGRAM_USER_ID`. O token fica em
`INSTAGRAM_ACCESS_TOKEN`; o diagnóstico é a action `diagnose` da Edge `publish-instagram`.
```

2. Trocar `Máximo de **10 filhos** pela API.` por `A API aceita até **20 filhos** desde 2026; a skill fixa 10.`
3. Na seção "O que a API não faz", trocar `- Não edita legenda de post já publicado (só pela rota de update, com limites).` por:

```
- Não edita legenda de post já publicado: a rota de update só liga e desliga comentários.
- Apaga post (desde dez/2025, permissão `instagram_manage_contents`), o que a Movepark não usa.
- Aceita `is_ai_generated` para declarar foto de IA. A Movepark decidiu não marcar
  (decisão 8 da spec da fila).
```

4. Trocar a frase `Conferido na documentação em\n03/09/2026.` do topo por `Conferido na documentação em\n03/09/2026 e revisto em 21/10/2026.`

Conferir travessão nos três arquivos: `grep -n "[—–]" .claude/skills/instagram/SKILL.md .claude/skills/instagram/references/api-instagram.md .claude/skills/instagram/scripts/enviar-rascunho.mjs` → nada novo.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/instagram/scripts/enviar-rascunho.mjs .claude/skills/instagram/SKILL.md .claude/skills/instagram/references/api-instagram.md
git commit -m "feat(skill): instagram envia o rascunho para a fila da plataforma, e a referência da API fica em dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: Fechamento e primeiro post real

**Files:**
- Modify: `docs/specs/instagram-fila-de-publicacao.md` (status)
- Modify: `docs/specs/README.md` (catálogo e tabela de migrations)

- [ ] **Step 1: Portões de qualidade**

```bash
bun run typecheck && bun run lint && bun run test && bun run test:edge
```

Expected: tudo verde. Falha em teste que não é desta entrega: rodar o mesmo comando no commit anterior à Task 1 para provar que já falhava, e registrar.

- [ ] **Step 2: Segurança**

1. Rodar `/security-review` sobre o diff desde `ce70abde` (o commit da spec). Tratar todo achado de severidade média ou maior.
2. Advisors: MCP `get_advisors(project_id: "mgaigbezdalbyuqiofcf", type: "security")` ou `supabase db advisors --linked --type security --output-format json`. Nenhum aviso novo sobre `social_post`, `social_post_event` ou `social_post_*`.
3. Conferir os grants de verdade:

```sql
select routine_name, string_agg(grantee, ',' order by grantee)
  from information_schema.role_routine_grants
 where routine_name like 'social_post_%'
 group by routine_name;
```

Expected: `social_post_day_taken` só com `postgres` e `service_role`; as outras três sem `anon`.

- [ ] **Step 3: Documentação**

Em `docs/specs/instagram-fila-de-publicacao.md`, trocar a linha de status por `> **Status:** implementado em <data de hoje>. Primeiro post real: ver Step 5 do plano.` Em `docs/specs/README.md`, atualizar a linha do catálogo de `instagram-fila-de-publicacao.md` de "desenhado em 21/10/2026" para "implementado em <data de hoje>" e acrescentar, logo depois da linha de `20261130170000_resumo_diario_parceiro.sql`:

```
| `20261130180000_social_post.sql` | **Fila do Instagram (E3.6):** `social_post` (rascunho, conferência, agenda, IDs da Meta) e `social_post_event` (rastro de toda chamada à Meta e de toda decisão), leitura só de hub_admin e escrita só por Edge e RPC; `social_post_approve` (sem bloqueio, data futura, um por dia em São Paulo), `social_post_reject` (com motivo), `social_post_reschedule` (também é o "tentar de novo"); `app_setting.social_dispatch_enabled = false`. pgTAP `social_post.test.sql` (23). Ver [instagram-fila-de-publicacao.md](./instagram-fila-de-publicacao.md) |
| `20261130190000_social_dispatch_cron.sql` | **Cron da fila do Instagram:** chave `social_dispatch_key` nascida no Vault e conferida por `cron_key_matches`, e a Edge `social-dispatch` a cada 15 minutos. Inofensivo com a publicação automática desligada (só grava `dry_run`). Ver [instagram-fila-de-publicacao.md](./instagram-fila-de-publicacao.md) |
```

Commit:

```bash
git status
git add docs/specs/instagram-fila-de-publicacao.md docs/specs/README.md
git commit -m "docs(instagram): fila de publicação implementada, catálogo e migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Token só com o necessário (humano)**

Pedir ao Kallef: no Business Manager (portfólio Clientes Agência Fera), usuário do sistema **movepark-instagram** > Generate token, app **MoveparkInst**, validade **Never**, marcar **só** `instagram_basic`, `instagram_content_publish`, `pages_show_list` e `pages_read_engagement`, e colar direto no Supabase (Edge Functions > Secrets > `INSTAGRAM_ACCESS_TOKEN`), sem passar pelo chat. Depois rodar o `diagnose` (comando do Step 6 da Task 3) e conferir `pode_publicar: true` e `permissoes_concedidas` sem `instagram_manage_contents` e sem `instagram_manage_messages`.

- [ ] **Step 5: Primeiro post real (com o humano no meio)**

1. Pela skill `instagram`, produzir o corte 2 ("Quanto custa") do post `preco-do-estacionamento-no-aeroporto-de-confins`, com os preços conferidos hoje no banco e `price_date` de hoje. Os slides de setembro em `assets-public/social/preco-do-estacionamento-no-aeroporto-de-confins/` só podem ser reaproveitados se os números baterem com os de hoje.
2. Enviar: `node .claude/skills/instagram/scripts/enviar-rascunho.mjs <rascunho.md>`. Expected: `"ok": true` e `"blockers": []`.
3. **Humano:** abrir `/manager/social`, conferir slide por slide (frota moderna, sem placa legível), conferir a legenda e aprovar.
4. **Humano:** ligar a publicação automática na mesma tela.
5. Depois da hora marcada (a rodada é a cada 15 min), conferir:

```sql
select status, ig_permalink, last_error, attempts from public.social_post where draft_key like 'preco-do-estacionamento-no-aeroporto-de-confins:%' order by created_at desc limit 1;
```

Expected: `published`, `ig_permalink` preenchido, `last_error` nulo, `attempts = 1`. Abrir o link e conferir o post no perfil. O rastro do post na tela mostra `container_child` (um por slide), `container_parent`, `container_status`, `media_publish` e `permalink`.
