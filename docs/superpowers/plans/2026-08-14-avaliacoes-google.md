# Avaliações do Google na vitrine - Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a avaliação do Google nas unidades e nos lotes mapeados do Movepark Hub, como prova social separada e rotulada, sem tocar na avaliação Movepark nem no JSON-LD.

**Architecture:** Uma tabela espelho `google_place_snapshot` chaveada pelo `place_id` (serve `location` e `prospect_location` sem FK nova), com TTL de 30 dias aplicado na policy de RLS e purge diário. Uma Edge Function disparada por `pg_cron` atualiza os snapshots semanalmente e dispara rebuild do site. O front compõe as duas fontes num hook só e escolhe um selo único no card de busca.

**Tech Stack:** Postgres 15 + RLS + pg_cron + pg_net (Supabase, projeto `mgaigbezdalbyuqiofcf`), Deno (Edge Functions), React 18 + TypeScript + TanStack Query, vite-react-ssg, Vitest, pgTAP, `deno test`.

**Spec:** [`docs/specs/avaliacoes-google.md`](../../specs/avaliacoes-google.md). Leia antes de começar. Este plano executa aquela spec e não a substitui.

## Global Constraints

- **Gerenciador de pacotes é `bun`.** Nunca `npm`/`yarn`/`pnpm`.
- **Trabalhe direto na `main`.** Não crie feature branch. `commit` + `push origin main` ao fim de cada task.
- **Proibido o travessão `—` e o traço `–`** em qualquer texto: copy, comentário de código, doc, mensagem de commit. Use ponto, vírgula, dois-pontos, parênteses ou hífen com espaços.
- **UI, comentários e mensagens em português (pt-BR).** Identificadores em inglês.
- **Imports sempre pelo alias `@/`.** Nunca `../../..`.
- **Nunca importe de `@/types/database`** nos componentes. Derive em `@/types/domain.ts`.
- **Migrations com carimbo `AAAAMMDDHHMMSS` único e real.** Antes de criar, rode `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` e confirme saída vazia.
- **Após aplicar migration:** `bun run gen:types` e commit do `src/types/database.ts`.
- **Migration é aplicada via MCP do Supabase** (`apply_migration`), nunca `supabase db push`.
- **Não rodar `supabase start` nem `bun run test:db` localmente.** O Supabase deste projeto é cloud. Os arquivos pgTAP são escritos e commitados; a execução acontece no CI (job `db`).
- **Gate antes de concluir qualquer task:** `bun run typecheck`, `bun run lint` e `bun run test` verdes.
- **Regra que atravessa tudo:** a nota do Google nunca entra em `location.review_avg`, nunca entra em `sort=rating_desc`/`min_rating`, e nunca entra em `aggregateRating` ou `review[]` do JSON-LD.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261023093000_google_place_snapshot.sql` | Tabela, RLS com TTL, grants, purge diário |
| `supabase/tests/google_place_snapshot.test.sql` | pgTAP: TTL na policy, escrita só de admin, purge |
| `supabase/functions/google-place-refresh/logic.ts` | Lógica pura: seleção de candidatos vencidos, mapeamento do Places |
| `supabase/functions/google-place-refresh/index.ts` | Edge: guarda de header, fetch do Places, upsert, rebuild |
| `supabase/functions/google-place-refresh/index.test.ts` | `deno test` da lógica pura |
| `supabase/migrations/20261023094500_google_place_refresh_cron.sql` | Agenda semanal via pg_cron + pg_net |
| `src/features/reviews/google.logic.ts` | Lógica pura do front: frescor, escolha do selo, formato do item |
| `src/features/reviews/google.logic.test.ts` | Vitest da lógica pura |
| `src/features/reviews/GoogleReviewsBlock.tsx` | Bloco com atribuição obrigatória |
| `src/features/reviews/GoogleReviewsBlock.test.tsx` | Vitest: atribuição e guard de frescor |
| `src/types/domain.ts` | Tipos `GooglePlaceSnapshot` e `GoogleReviewItem` |
| `src/features/listing/api.ts` | Loader SSG da ficha carrega o snapshot |
| `src/routes/listing.tsx` | Renderiza o bloco do Google |
| `src/features/search/ParkingCard.tsx` | Selo único com prioridade Movepark |
| `supabase/functions/search/index.ts` | Anexa nota do Google ao payload do card |
| `docs/specs/capacidades-unidade.md` | Linha nova na tabela de capacidades (ADR-009) |

---

### Task 1: Tabela, RLS com TTL e purge

**Files:**
- Create: `supabase/migrations/20261023093000_google_place_snapshot.sql`
- Create: `supabase/tests/google_place_snapshot.test.sql`
- Modify: `src/types/database.ts` (gerado, não editar à mão)

**Interfaces:**
- Consumes: nada.
- Produces: tabela `public.google_place_snapshot` com colunas `place_id text PK`, `rating numeric(2,1)`, `user_rating_count integer NOT NULL DEFAULT 0`, `maps_uri text`, `reviews jsonb NOT NULL DEFAULT '[]'`, `fetched_at timestamptz NOT NULL DEFAULT now()`, `fetch_error text`, `is_hidden boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`. Função `public.purge_google_place_snapshots()` retornando `integer`.

- [ ] **Step 1: Confirmar que o carimbo não colide**

Run: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d`
Expected: saída vazia. Se imprimir algo, existe colisão pré-existente e ela precisa ser resolvida antes.

Run: `ls supabase/migrations/ | sort | tail -1`
Expected: `20261022101500_drop_contact_message.sql`, ou seja, `20261023093000` é posterior e livre.

- [ ] **Step 2: Escrever o teste pgTAP primeiro**

Crie `supabase/tests/google_place_snapshot.test.sql`:

```sql
begin;
select plan(10);

-- A tabela existe com a chave certa
select has_table('public', 'google_place_snapshot', 'tabela google_place_snapshot existe');
select col_is_pk('public', 'google_place_snapshot', 'place_id', 'place_id e a PK');

-- Seed: um snapshot fresco e um vencido
insert into public.google_place_snapshot (place_id, rating, user_rating_count, fetched_at)
values ('ChIJ_fresco', 4.6, 312, now() - interval '3 days'),
       ('ChIJ_vencido', 4.9, 100, now() - interval '31 days');

-- Anonimo enxerga so o fresco (TTL mora na policy)
set local role anon;
select is(
  (select count(*)::int from public.google_place_snapshot),
  1,
  'anon ve so o snapshot com menos de 30 dias'
);
select is(
  (select place_id from public.google_place_snapshot),
  'ChIJ_fresco',
  'o snapshot visivel e o fresco'
);

-- Anonimo nao escreve
select throws_ok(
  $$ insert into public.google_place_snapshot (place_id) values ('ChIJ_invasor') $$,
  '42501',
  null,
  'anon nao insere snapshot'
);
select throws_ok(
  $$ update public.google_place_snapshot set rating = 1.0 where place_id = 'ChIJ_fresco' $$,
  '42501',
  null,
  'anon nao atualiza snapshot'
);
reset role;

-- O liga e desliga do hub_admin: is_hidden esconde o bloco inteiro daquela unidade
update public.google_place_snapshot set is_hidden = true where place_id = 'ChIJ_fresco';
set local role anon;
select is(
  (select count(*)::int from public.google_place_snapshot),
  0,
  'is_hidden esconde o snapshot do leitor publico'
);
reset role;
update public.google_place_snapshot set is_hidden = false where place_id = 'ChIJ_fresco';

-- Upsert substitui o conjunto inteiro de reviews, nao acumula
insert into public.google_place_snapshot (place_id, reviews, fetched_at)
values ('ChIJ_fresco', '[{"rating":5}]'::jsonb, now())
on conflict (place_id) do update
  set reviews = excluded.reviews, fetched_at = excluded.fetched_at;
select is(
  (select jsonb_array_length(reviews) from public.google_place_snapshot where place_id = 'ChIJ_fresco'),
  1,
  'upsert substitui o array de reviews'
);

-- Purge apaga de fato o vencido
select is(public.purge_google_place_snapshots(), 1, 'purge apaga 1 snapshot vencido');
select is(
  (select count(*)::int from public.google_place_snapshot where place_id = 'ChIJ_vencido'),
  0,
  'o vencido sumiu da tabela'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Escrever a migration**

Crie `supabase/migrations/20261023093000_google_place_snapshot.sql`:

```sql
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
```

- [ ] **Step 4: Aplicar a migration no projeto linkado**

Use a tool MCP do Supabase `apply_migration` com `project_id: mgaigbezdalbyuqiofcf`, `name: google_place_snapshot` e o conteúdo do arquivo acima.
Expected: sucesso, sem erro de sintaxe.

Se `public.set_updated_at()` não existir com esse nome exato, rode antes:
```sql
select proname from pg_proc where proname like '%updated_at%';
```
e use o nome real no trigger.

- [ ] **Step 5: Verificar a policy no banco vivo**

Rode via MCP `execute_sql`:
```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy where polrelid = 'public.google_place_snapshot'::regclass;
```
Expected: `google_place_snapshot_read` com `((NOT is_hidden) AND (fetched_at > (now() - '30 days'::interval)))`.

- [ ] **Step 6: Regenerar os tipos**

Run: `bun run gen:types`
Expected: `src/types/database.ts` ganha o bloco `google_place_snapshot`.

- [ ] **Step 7: Rodar os advisors de segurança**

Use a tool MCP `get_advisors` com `type: security`, `project_id: mgaigbezdalbyuqiofcf`.
Expected: nenhum achado NOVO referente a `google_place_snapshot` (nem RLS desabilitada, nem mutação exposta a `anon`). Achados pré-existentes de outras tabelas não bloqueiam.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261023093000_google_place_snapshot.sql supabase/tests/google_place_snapshot.test.sql src/types/database.ts
git commit -m "feat(avaliacoes-google): tabela espelho com TTL na policy e purge diario"
git push origin main
```

---

### Task 2: Edge de refresh, cron e rebuild

**Files:**
- Create: `supabase/functions/google-place-refresh/logic.ts`
- Create: `supabase/functions/google-place-refresh/index.ts`
- Create: `supabase/functions/google-place-refresh/index.test.ts`
- Create: `supabase/migrations/20261023094500_google_place_refresh_cron.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: tabela `public.google_place_snapshot` da Task 1.
- Produces: `REFRESH_AFTER_DAYS = 7`; `selectStale(candidates: string[], snapshots: {place_id: string; fetched_at: string}[], now: Date): string[]`; `mapPlaceDetails(place: unknown): { rating: number | null; user_rating_count: number; maps_uri: string | null; reviews: GoogleReviewItem[] }`. O tipo `GoogleReviewItem` tem `{ rating: number; text: string; publishTime: string; relativePublishTimeDescription: string; authorName: string; authorPhotoUri: string | null; authorUri: string | null; reviewUri: string | null }`.

- [ ] **Step 1: Escrever os testes da lógica pura primeiro**

Crie `supabase/functions/google-place-refresh/index.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapPlaceDetails, REFRESH_AFTER_DAYS, selectStale } from "./logic.ts";

const NOW = new Date("2026-08-14T12:00:00Z");

Deno.test("selectStale: place sem snapshot entra", () => {
  assertEquals(selectStale(["A"], [], NOW), ["A"]);
});

Deno.test("selectStale: snapshot mais novo que 7 dias fica de fora", () => {
  const snaps = [{ place_id: "A", fetched_at: "2026-08-12T12:00:00Z" }];
  assertEquals(selectStale(["A"], snaps, NOW), []);
});

Deno.test("selectStale: snapshot com mais de 7 dias entra", () => {
  const snaps = [{ place_id: "A", fetched_at: "2026-08-05T12:00:00Z" }];
  assertEquals(selectStale(["A"], snaps, NOW), ["A"]);
});

Deno.test("selectStale: a janela e de 7 dias", () => {
  assertEquals(REFRESH_AFTER_DAYS, 7);
});

Deno.test("mapPlaceDetails: extrai nota, contagem e atribuicao", () => {
  const out = mapPlaceDetails({
    rating: 4.6,
    userRatingCount: 312,
    googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: [
      {
        rating: 5,
        text: { text: "Atendimento rapido." },
        publishTime: "2026-07-02T10:00:00Z",
        relativePublishTimeDescription: "há um mês",
        googleMapsUri: "https://maps.google.com/review/1",
        authorAttribution: {
          displayName: "Ana P.",
          photoUri: "https://lh3.googleusercontent.com/a/1",
          uri: "https://www.google.com/maps/contrib/1",
        },
      },
    ],
  });
  assertEquals(out.rating, 4.6);
  assertEquals(out.user_rating_count, 312);
  assertEquals(out.maps_uri, "https://maps.google.com/?cid=1");
  assertEquals(out.reviews.length, 1);
  assertEquals(out.reviews[0].authorName, "Ana P.");
  assertEquals(out.reviews[0].authorUri, "https://www.google.com/maps/contrib/1");
  assertEquals(out.reviews[0].text, "Atendimento rapido.");
});

Deno.test("mapPlaceDetails: lugar sem avaliacao nao quebra", () => {
  const out = mapPlaceDetails({ rating: null, userRatingCount: 0 });
  assertEquals(out.rating, null);
  assertEquals(out.user_rating_count, 0);
  assertEquals(out.reviews, []);
  assertEquals(out.maps_uri, null);
});

Deno.test("mapPlaceDetails: review sem autor e descartada, porque atribuicao e obrigatoria", () => {
  const out = mapPlaceDetails({
    rating: 4.0,
    userRatingCount: 2,
    reviews: [{ rating: 5, text: { text: "boa" }, publishTime: "2026-07-02T10:00:00Z" }],
  });
  assertEquals(out.reviews, []);
});
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `bun run test:edge`
Expected: FAIL com erro de módulo não encontrado (`./logic.ts`).

- [ ] **Step 3: Implementar a lógica pura**

Crie `supabase/functions/google-place-refresh/logic.ts`:

```ts
// Lógica pura do refresh do Google Places. Sem rede e sem Deno.env → testável.

export const REFRESH_AFTER_DAYS = 7;

export type GoogleReviewItem = {
  rating: number;
  text: string;
  publishTime: string;
  relativePublishTimeDescription: string;
  authorName: string;
  authorPhotoUri: string | null;
  authorUri: string | null;
  reviewUri: string | null;
};

export type SnapshotFreshness = { place_id: string; fetched_at: string };

/**
 * Quais place_ids precisam de refresh: os sem snapshot e os com mais de 7 dias.
 * A janela de 7 dias contra o prazo de 30 do Google dá quatro tentativas antes de o selo
 * sumir da vitrine.
 */
export function selectStale(
  candidates: string[],
  snapshots: SnapshotFreshness[],
  now: Date,
): string[] {
  const cutoff = now.getTime() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const fresh = new Set(
    snapshots
      .filter((s) => new Date(s.fetched_at).getTime() > cutoff)
      .map((s) => s.place_id),
  );
  return candidates.filter((id) => !fresh.has(id));
}

type RawReview = {
  rating?: number;
  text?: { text?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  googleMapsUri?: string;
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
};

/**
 * Traduz a resposta do Places (New) para a linha do espelho.
 * Review sem nome de autor é DESCARTADA: exibir sem atribuição não é permitido, então
 * guardar um dado que não pode ser mostrado só cria lixo com prazo de validade.
 */
export function mapPlaceDetails(place: unknown): {
  rating: number | null;
  user_rating_count: number;
  maps_uri: string | null;
  reviews: GoogleReviewItem[];
} {
  const p = (place ?? {}) as {
    rating?: number | null;
    userRatingCount?: number | null;
    googleMapsUri?: string | null;
    reviews?: RawReview[];
  };

  const reviews: GoogleReviewItem[] = (p.reviews ?? [])
    .filter((r) => !!r.authorAttribution?.displayName)
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.text?.text ?? "",
      publishTime: r.publishTime ?? "",
      relativePublishTimeDescription: r.relativePublishTimeDescription ?? "",
      authorName: r.authorAttribution!.displayName!,
      authorPhotoUri: r.authorAttribution?.photoUri ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      reviewUri: r.googleMapsUri ?? null,
    }));

  return {
    rating: p.rating ?? null,
    user_rating_count: p.userRatingCount ?? 0,
    maps_uri: p.googleMapsUri ?? null,
    reviews,
  };
}
```

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `bun run test:edge`
Expected: PASS, 7 testes de `google-place-refresh`.

- [ ] **Step 5: Escrever a Edge**

Crie `supabase/functions/google-place-refresh/index.ts`:

```ts
// Edge Function: /google-place-refresh
// Atualiza o espelho `google_place_snapshot` a partir da Places API (New).
//
// Candidatos: place_id de `location` viva e listada + `prospect_location` publicada e não
// convertida. Refresha os sem snapshot e os com mais de 7 dias (REFRESH_AFTER_DAYS).
//
// Falha da Places API grava `fetch_error` e PRESERVA o snapshot bom: erro de rede não pode
// apagar prova social.
//
// A chave do projeto (VITE_GOOGLE_MAPS_API_KEY) é restrita por referrer e recusa chamada de
// servidor. Aqui usa-se GOOGLE_PLACES_SERVER_KEY, restrita por IP, que nunca vai para o bundle.
//
// Ao mudar algum snapshot, dispara o rebuild do site: o HTML do SSG também é cache do
// conteúdo do Google e precisa respeitar o mesmo limite de 30 dias.
//
// Chamada interna pelo pg_cron (pg_net), header x-google-place-key. verify_jwt = false.
//
// POST /functions/v1/google-place-refresh   (header: x-google-place-key: <GOOGLE_PLACE_REFRESH_KEY>)
// body opcional: { place_id?: string }  → limita a um lugar (útil para rodar na mão)
// → { ok, candidates, refreshed, failed, rebuilt }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapPlaceDetails, selectStale } from "./logic.ts";

const FIELD_MASK = "id,rating,userRatingCount,googleMapsUri,reviews";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("GOOGLE_PLACE_REFRESH_KEY");
  if (!expected || req.headers.get("x-google-place-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  // @ts-expect-error - Deno env
  const googleKey = Deno.env.get("GOOGLE_PLACES_SERVER_KEY");
  if (!googleKey) return json({ error: "GOOGLE_PLACES_SERVER_KEY ausente" }, 500);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const body = (await req.json().catch(() => ({}))) as { place_id?: string };

  const [locs, prospects, snaps] = await Promise.all([
    admin
      .from("location")
      .select("google_place_id")
      .not("google_place_id", "is", null)
      .is("deleted_at", null)
      .eq("is_listed", true),
    admin
      .from("prospect_location")
      .select("google_place_id")
      .not("google_place_id", "is", null)
      .eq("is_published", true)
      .is("converted_at", null),
    admin.from("google_place_snapshot").select("place_id, fetched_at"),
  ]);
  if (locs.error) return json({ error: locs.error.message }, 500);
  if (prospects.error) return json({ error: prospects.error.message }, 500);
  if (snaps.error) return json({ error: snaps.error.message }, 500);

  const all = [
    ...(locs.data ?? []).map((r: { google_place_id: string }) => r.google_place_id),
    ...(prospects.data ?? []).map((r: { google_place_id: string }) => r.google_place_id),
  ];
  const candidates = body.place_id
    ? all.filter((id) => id === body.place_id)
    : selectStale([...new Set(all)], snaps.data ?? [], new Date());

  let refreshed = 0;
  let failed = 0;

  for (const placeId of candidates) {
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
          `?languageCode=pt-BR&regionCode=BR`,
        { headers: { "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": FIELD_MASK } },
      );
      if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
      const mapped = mapPlaceDetails(await res.json());
      const { error } = await admin.from("google_place_snapshot").upsert(
        {
          place_id: placeId,
          rating: mapped.rating,
          user_rating_count: mapped.user_rating_count,
          maps_uri: mapped.maps_uri,
          reviews: mapped.reviews,
          fetched_at: new Date().toISOString(),
          fetch_error: null,
        },
        { onConflict: "place_id" },
      );
      if (error) throw new Error(error.message);
      refreshed++;
    } catch (e) {
      failed++;
      // Preserva o snapshot bom: só carimba o erro, sem tocar em rating/reviews.
      await admin
        .from("google_place_snapshot")
        .update({ fetch_error: String(e) })
        .eq("place_id", placeId);
    }
  }

  // O HTML do SSG também é cache do conteúdo do Google, então mudou snapshot, rebuilda.
  let rebuilt = false;
  if (refreshed > 0) {
    const { data: setting } = await admin
      .from("app_setting")
      .select("value")
      .eq("key", "google_place_rebuild_hook_url")
      .maybeSingle();
    const hook = (setting?.value as string | null) ?? null;
    if (hook) {
      const r = await fetch(hook, { method: "POST" }).catch(() => null);
      rebuilt = !!r?.ok;
    }
  }

  return json({ ok: true, candidates: candidates.length, refreshed, failed, rebuilt });
});
```

- [ ] **Step 6: Registrar a função como pública no config**

Em `supabase/config.toml`, ao lado das outras entradas de função pública, adicione:

```toml
[functions.google-place-refresh]
verify_jwt = false
```

Confirme o formato lendo uma entrada vizinha antes de escrever:
Run: `grep -n -A2 "functions.review-request\|functions.wl-price-mirror" supabase/config.toml`

- [ ] **Step 7: Criar os segredos**

A `GOOGLE_PLACES_SERVER_KEY` é uma chave NOVA do Google Cloud, restrita por IP, com a Places API (New) habilitada. **Não reutilize a `VITE_GOOGLE_MAPS_API_KEY`** e não altere a restrição por referrer dela.

Peça ao usuário a chave e o valor do segredo interno, então:

```bash
supabase secrets set GOOGLE_PLACES_SERVER_KEY=<chave-do-google>
supabase secrets set GOOGLE_PLACE_REFRESH_KEY=<segredo-interno-aleatorio>
```

Se o usuário ainda não tiver a chave do Google, pare aqui e avise. Os passos seguintes desta task dependem dela.

- [ ] **Step 8: Deploy da Edge**

Run: `supabase functions deploy google-place-refresh --no-verify-jwt`
Expected: deploy concluído.

- [ ] **Step 9: Rodar uma vez na mão contra um lugar conhecido**

Pegue um `place_id` real:
```sql
select google_place_id, name from public.prospect_location
 where google_place_id is not null and is_published limit 1;
```

Chame a função com esse `place_id` no body e o header `x-google-place-key`. Depois confira:
```sql
select place_id, rating, user_rating_count, jsonb_array_length(reviews) as n, fetch_error
from public.google_place_snapshot;
```
Expected: uma linha com `rating` preenchido, `n` entre 0 e 5 e `fetch_error` nulo.

Se vier `fetch_error` com `REQUEST_DENIED` ou `403`, a chave não tem a Places API (New) habilitada ou a restrição de IP não cobre o egress do Supabase. Resolva antes de seguir.

- [ ] **Step 10: Escrever a migration do cron**

Crie `supabase/migrations/20261023094500_google_place_refresh_cron.sql`:

```sql
-- Agenda o refresh do espelho do Google: semanal, domingo 05:40 UTC.
-- pg_net faz o POST async; a chave interna (x-google-place-key) vem do Vault, sem segredo no repo.
-- Cadência de 7 dias contra o prazo de cache de 30 dá quatro tentativas antes de o selo sumir.

select cron.schedule(
  'google-place-refresh-weekly',
  '40 5 * * 0',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/google-place-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-google-place-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'google_place_refresh_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
```

Antes de aplicar, grave o segredo no Vault com o MESMO valor do `GOOGLE_PLACE_REFRESH_KEY`:
```sql
select vault.create_secret('<segredo-interno-aleatorio>', 'google_place_refresh_key');
```

- [ ] **Step 11: Aplicar a migration e conferir o job**

Aplique via MCP `apply_migration`, depois:
```sql
select jobname, schedule, active from cron.job where jobname like 'google-place%';
```
Expected: `google-place-refresh-weekly` e `purge-google-place-snapshots`, ambos `active = true`.

- [ ] **Step 12: Rodar o gate e commitar**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

```bash
git add supabase/functions/google-place-refresh supabase/migrations/20261023094500_google_place_refresh_cron.sql supabase/config.toml
git commit -m "feat(avaliacoes-google): edge de refresh semanal com cron, purge e rebuild"
git push origin main
```

---

### Task 3: Lógica pura e tipos do front

**Files:**
- Create: `src/features/reviews/google.logic.ts`
- Create: `src/features/reviews/google.logic.test.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**
- Consumes: tabela da Task 1 (leitura anônima via RLS).
- Produces: tipos `GoogleReviewItem` e `GooglePlaceSnapshot` em `@/types/domain`; `isSnapshotFresh(fetchedAt: string, now?: Date): boolean`; `pickCardBadge(movepark: { avg: number | null; count: number }, google: { rating: number | null; count: number } | null): BadgeChoice`.

**Não existe hook nesta task, e é de propósito.** O bloco precisa sair no HTML pré-renderizado, e hook de cliente só renderiza depois da hidratação, tarde demais para o crawler e para a dobra em 4G. As três superfícies buscam o snapshot onde já buscam o resto: loader do SSG (Task 4 e 6), Edge `search` (Task 5), RPC do destino (Task 6). O que é compartilhado é a lógica pura, e ela vive aqui.

- [ ] **Step 1: Escrever os testes da lógica pura primeiro**

Crie `src/features/reviews/google.logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSnapshotFresh, pickCardBadge } from "./google.logic";

const NOW = new Date("2026-08-14T12:00:00Z");

describe("isSnapshotFresh", () => {
  it("aceita snapshot de 3 dias", () => {
    expect(isSnapshotFresh("2026-08-11T12:00:00Z", NOW)).toBe(true);
  });

  it("recusa snapshot de 31 dias, porque o limite de cache do Google e 30", () => {
    expect(isSnapshotFresh("2026-07-14T11:00:00Z", NOW)).toBe(false);
  });
});

describe("pickCardBadge", () => {
  it("prioriza a nota Movepark quando ela existe", () => {
    const out = pickCardBadge({ avg: 4.9, count: 12 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "movepark", avg: 4.9, count: 12 });
  });

  it("usa a do Google quando nao ha avaliacao Movepark", () => {
    const out = pickCardBadge({ avg: null, count: 0 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "google", avg: 4.6, count: 312 });
  });

  it("usa a do Google quando a Movepark tem media mas contagem zero", () => {
    const out = pickCardBadge({ avg: 5, count: 0 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "google", avg: 4.6, count: 312 });
  });

  it("devolve null quando nenhuma das duas existe", () => {
    expect(pickCardBadge({ avg: null, count: 0 }, null)).toBeNull();
  });

  it("devolve null quando o Google tem place mas nenhuma avaliacao", () => {
    expect(pickCardBadge({ avg: null, count: 0 }, { rating: null, count: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun run test src/features/reviews/google.logic.test.ts`
Expected: FAIL, módulo `./google.logic` não encontrado.

- [ ] **Step 3: Implementar a lógica pura**

Crie `src/features/reviews/google.logic.ts`:

```ts
// Lógica pura das avaliações do Google. Sem React/Supabase → testável (Vitest).

/** Limite de cache do Google para conteúdo do Places que não seja o place_id. */
export const GOOGLE_CACHE_DAYS = 30;

/**
 * O HTML do SSG também é cache: uma página construída há 40 dias carrega conteúdo do Google
 * fora do prazo. O componente confere no cliente e não renderiza, mesmo que a policy do banco
 * já tenha escondido a linha para quem consulta agora.
 */
export function isSnapshotFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return age < GOOGLE_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

export type BadgeChoice =
  | { source: "movepark"; avg: number; count: number }
  | { source: "google"; avg: number; count: number }
  | null;

/**
 * O card de busca mostra UM selo só: em 375px, dois selos viram ruído e nenhuma das notas é
 * lida. Prioridade para a Movepark, que é a nota que a gente controla e que o cliente entende
 * como "de quem reservou aqui". A do Google preenche o vazio.
 */
export function pickCardBadge(
  movepark: { avg: number | null; count: number },
  google: { rating: number | null; count: number } | null,
): BadgeChoice {
  if (movepark.avg != null && movepark.count > 0) {
    return { source: "movepark", avg: movepark.avg, count: movepark.count };
  }
  if (google?.rating != null && google.count > 0) {
    return { source: "google", avg: google.rating, count: google.count };
  }
  return null;
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `bun run test src/features/reviews/google.logic.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Adicionar os tipos de domínio**

Em `src/types/domain.ts`, junto dos outros tipos curados, adicione:

```ts
/** Um item do array `reviews` do espelho do Google. A atribuição é obrigatória na exibição. */
export type GoogleReviewItem = {
  rating: number;
  text: string;
  publishTime: string;
  relativePublishTimeDescription: string;
  authorName: string;
  authorPhotoUri: string | null;
  authorUri: string | null;
  reviewUri: string | null;
};

/** Espelho do Google Places por place_id. Conteúdo de terceiro, sob cache de 30 dias. */
export type GooglePlaceSnapshot = {
  place_id: string;
  rating: number | null;
  user_rating_count: number;
  maps_uri: string | null;
  reviews: GoogleReviewItem[];
  fetched_at: string;
};
```

- [ ] **Step 6: Rodar o gate**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/features/reviews/google.logic.ts src/features/reviews/google.logic.test.ts src/types/domain.ts
git commit -m "feat(avaliacoes-google): logica pura de frescor e escolha de selo"
git push origin main
```

---

### Task 4: Bloco na ficha da unidade, com atribuição

**Files:**
- Create: `src/features/reviews/GoogleReviewsBlock.tsx`
- Create: `src/features/reviews/GoogleReviewsBlock.test.tsx`
- Modify: `src/features/listing/api.ts`
- Modify: `src/routes/listing.tsx`
- Modify: `docs/specs/capacidades-unidade.md`

**Interfaces:**
- Consumes: `GooglePlaceSnapshot`, `GoogleReviewItem`, `isSnapshotFresh` da Task 3.
- Produces: componente `<GoogleReviewsBlock snapshot={GooglePlaceSnapshot | null} placeName={string} />`; campo `google` no retorno de `fetchListing`.

- [ ] **Step 1: Escrever o teste do componente primeiro**

Crie `src/features/reviews/GoogleReviewsBlock.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleReviewsBlock } from "./GoogleReviewsBlock";
import type { GooglePlaceSnapshot } from "@/types/domain";

const snapshot: GooglePlaceSnapshot = {
  place_id: "ChIJ_x",
  rating: 4.6,
  user_rating_count: 312,
  maps_uri: "https://maps.google.com/?cid=1",
  fetched_at: new Date().toISOString(),
  reviews: [
    {
      rating: 5,
      text: "Atendimento rapido e vaga coberta.",
      publishTime: "2026-07-02T10:00:00Z",
      relativePublishTimeDescription: "há um mês",
      authorName: "Ana P.",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/1",
      authorUri: "https://www.google.com/maps/contrib/1",
      reviewUri: "https://maps.google.com/review/1",
    },
  ],
};

describe("GoogleReviewsBlock", () => {
  it("mostra a nota e deixa claro que a fonte e o Google", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByText(/4,6/)).toBeInTheDocument();
    expect(screen.getByText(/Google/i)).toBeInTheDocument();
  });

  it("credita o autor com nome, foto e link, que e condicao de uso", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByText("Ana P.")).toBeInTheDocument();
    const foto = screen.getByAltText("Ana P.") as HTMLImageElement;
    expect(foto.src).toContain("lh3.googleusercontent.com");
    const link = screen.getByRole("link", { name: /ver no google/i });
    expect(link).toHaveAttribute("href", "https://maps.google.com/review/1");
  });

  it("nao renderiza quando o snapshot passou dos 30 dias, porque o HTML do SSG tambem e cache", () => {
    const velho = { ...snapshot, fetched_at: "2026-01-01T00:00:00Z" };
    const { container } = render(<GoogleReviewsBlock snapshot={velho} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza sem snapshot", () => {
    const { container } = render(<GoogleReviewsBlock snapshot={null} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza quando o lugar nao tem avaliacao nenhuma", () => {
    const vazio = { ...snapshot, rating: null, user_rating_count: 0, reviews: [] };
    const { container } = render(<GoogleReviewsBlock snapshot={vazio} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun run test src/features/reviews/GoogleReviewsBlock.test.tsx`
Expected: FAIL, módulo `./GoogleReviewsBlock` não encontrado.

- [ ] **Step 3: Implementar o componente**

Crie `src/features/reviews/GoogleReviewsBlock.tsx`:

```tsx
import { formatRating } from "@/lib/format";
import type { GooglePlaceSnapshot } from "@/types/domain";
import { isSnapshotFresh } from "./google.logic";
import { RatingStars } from "./RatingStars";

/**
 * Avaliações do Google, exibidas como prova social de terceiro.
 *
 * A atribuição não é enfeite, é condição de uso: marca do Google junto da nota, link para o
 * perfil no Maps, e cada avaliação com nome do autor, foto e link para a avaliação original.
 * O texto sai como veio, sem editar, sem cortar e sem traduzir.
 *
 * Não existe moderação por avaliação individual. O liga e desliga é por unidade e é do
 * hub_admin. Esconder a nota 1 e manter as cinco estrelas não seria exibir o Google, seria
 * fabricar prova social com o nome dele.
 */
export function GoogleReviewsBlock({
  snapshot,
  placeName,
}: {
  snapshot: GooglePlaceSnapshot | null;
  placeName: string;
}) {
  if (!snapshot) return null;
  if (!isSnapshotFresh(snapshot.fetched_at)) return null;
  if (snapshot.rating == null || snapshot.user_rating_count === 0) return null;

  return (
    <section className="space-y-4" aria-label={`Avaliações do Google para ${placeName}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-title-md">Avaliações no Google</h2>
        <span className="text-body-sm text-muted-foreground">
          {formatRating(snapshot.rating)} de 5 em {snapshot.user_rating_count} avaliações no Google
        </span>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {snapshot.reviews.map((r, i) => (
          <li key={`${r.authorName}-${i}`} className="rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {r.authorPhotoUri && (
                <img
                  src={r.authorPhotoUri}
                  alt={r.authorName}
                  loading="lazy"
                  className="size-8 rounded-full"
                />
              )}
              <div>
                {r.authorUri ? (
                  <a
                    href={r.authorUri}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="text-body-sm font-medium"
                  >
                    {r.authorName}
                  </a>
                ) : (
                  <span className="text-body-sm font-medium">{r.authorName}</span>
                )}
                <p className="text-body-xs text-muted-foreground">
                  {r.relativePublishTimeDescription}
                </p>
              </div>
            </div>
            <RatingStars value={r.rating} className="mt-2" />
            <p className="text-body-sm mt-2">{r.text}</p>
            {r.reviewUri && (
              <a
                href={r.reviewUri}
                target="_blank"
                rel="noreferrer nofollow"
                className="text-body-xs mt-2 inline-block underline"
              >
                Ver no Google
              </a>
            )}
          </li>
        ))}
      </ul>

      {snapshot.maps_uri && (
        <a
          href={snapshot.maps_uri}
          target="_blank"
          rel="noreferrer nofollow"
          className="text-body-sm underline"
        >
          Ver todas as avaliações no Google
        </a>
      )}
    </section>
  );
}
```

Antes de rodar, confirme a assinatura real de `RatingStars` e de `formatRating`:
Run: `grep -n "export function RatingStars" -A8 src/features/reviews/RatingStars.tsx && grep -n "export function formatRating" -A4 src/lib/format.ts`
Ajuste as props do `RatingStars` para o que o arquivo expõe, se divergir de `value`/`className`.

- [ ] **Step 4: Rodar para ver passar**

Run: `bun run test src/features/reviews/GoogleReviewsBlock.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Levar o snapshot para o loader SSG**

O bloco precisa sair no HTML pré-renderizado, porque crawler de IA não executa JS. Em `src/features/listing/api.ts`, no tipo de retorno de `fetchListing`, adicione ao lado de `location`:

```ts
  /**
   * Espelho do Google carregado no build. O bloco precisa sair no HTML: crawler de IA não
   * executa JS. `null` quando a unidade não tem place_id ou o snapshot venceu.
   */
  google: GooglePlaceSnapshot | null;
```

Importe o tipo com `import type { GooglePlaceSnapshot, GoogleReviewItem } from "@/types/domain";`.

Dentro de `fetchListing`, depois de montar o objeto da unidade e antes do `return`, busque o snapshot:

```ts
  let google: GooglePlaceSnapshot | null = null;
  if (m.location.google_place_id) {
    const { data: snap, error: snapError } = await supabase
      .from("google_place_snapshot")
      .select("place_id, rating, user_rating_count, maps_uri, reviews, fetched_at")
      .eq("place_id", m.location.google_place_id)
      .maybeSingle();
    if (snapError) throw snapError;
    google = snap
      ? ({
          ...snap,
          rating: snap.rating != null ? Number(snap.rating) : null,
          reviews: (snap.reviews ?? []) as GoogleReviewItem[],
        } as GooglePlaceSnapshot)
      : null;
  }
```

e inclua `google` no objeto retornado.

- [ ] **Step 6: Renderizar na ficha**

Em `src/routes/listing.tsx`, importe o bloco:

```tsx
import { GoogleReviewsBlock } from "@/features/reviews/GoogleReviewsBlock";
```

e renderize logo abaixo do `ReviewsBlock` existente:

```tsx
<GoogleReviewsBlock snapshot={listing.google} placeName={listing.location.name} />
```

Localize o `ReviewsBlock` com:
Run: `grep -n "ReviewsBlock" src/routes/listing.tsx`

- [ ] **Step 7: Escrever a regressão do JSON-LD**

A nota do Google não pode entrar no schema. Localize o teste existente:
Run: `grep -rn "aggregateRating" src/lib/jsonld.test.ts | head`

Adicione neste arquivo:

```ts
it("nao deixa a nota do Google virar aggregateRating: o Google proibe marcar avaliacao de outro site como sua", () => {
  const schema = productOfferSchema({
    ...baseArgs,
    reviewAvg: null,
    reviewCount: 0,
  } as never);
  expect(JSON.stringify(schema)).not.toContain("aggregateRating");
});
```

Ajuste `baseArgs` e o nome do argumento de nota ao que a assinatura real de `productOfferSchema` expõe (leia o topo do arquivo de teste para reusar o fixture que já existe). O ponto do teste é: unidade sem avaliação Movepark não emite `aggregateRating`, por mais que exista snapshot do Google no payload.

- [ ] **Step 8: Atualizar a spec de capacidades (ADR-009)**

Em `docs/specs/capacidades-unidade.md`, na tabela por bloco, abaixo da linha "Avaliações e nota", adicione:

```markdown
| Avaliações do Google | mostra | **mostra** | `google_place_snapshot` |
```

E logo depois da tabela, o parágrafo:

```markdown
**A avaliação do Google é fato da unidade, não promessa de transação.** Reputação descreve o
lugar e é verdade independente de onde a reserva fecha, igual a endereço, foto e amenidade. Por
isso o bloco renderiza também na unidade externa, e é assim que ele preenche o vazio que a linha
acima deixa. `LocationCapabilities` não ganha capacidade nova, porque não há promessa a declarar.
A nota continua fora do `aggregateRating` do JSON-LD. Ver
[avaliacoes-google.md](./avaliacoes-google.md).
```

- [ ] **Step 9: Rodar o gate**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

- [ ] **Step 10: Verificar no browser**

Run: `bun run dev` (via preview_start, nunca via Bash)
Abra a ficha de uma unidade que tenha `google_place_id` com snapshot, confirme que o bloco aparece com foto, nome e link do autor, e que o console não tem erro.

- [ ] **Step 11: Commit**

```bash
git add src/features/reviews/GoogleReviewsBlock.tsx src/features/reviews/GoogleReviewsBlock.test.tsx src/features/listing/api.ts src/routes/listing.tsx src/lib/jsonld.test.ts docs/specs/capacidades-unidade.md
git commit -m "feat(avaliacoes-google): bloco na ficha com atribuicao, pre-renderizado no SSG"
git push origin main
```

---

### Task 5: Selo único no card de busca

**Files:**
- Modify: `supabase/functions/search/index.ts`
- Modify: `src/features/search/ParkingCard.tsx`
- Create: `src/features/search/ParkingCard.test.tsx` (se já existir, modifique)

**Interfaces:**
- Consumes: `pickCardBadge` da Task 3.
- Produces: campos `google_rating: number | null` e `google_rating_count: number` no objeto `location` do payload da edge `search`; prop `googleRating?: { avg: number | null; count: number } | null` no `ParkingCard`.

- [ ] **Step 1: Escrever o teste do card primeiro**

Verifique se o arquivo já existe:
Run: `ls src/features/search/ParkingCard.test.tsx 2>/dev/null || echo "nao existe"`

Adicione (ou crie o arquivo com) estes casos, reusando as props obrigatórias que o componente já exige (leia o `type Props` no topo de `ParkingCard.tsx` e monte um fixture mínimo):

```tsx
it("mostra a nota Movepark quando ela existe, e nao mostra a do Google junto", () => {
  render(<ParkingCard {...base} rating={{ avg: 4.9, count: 12 }} googleRating={{ avg: 4.6, count: 312 }} />);
  expect(screen.getByText(/4,9/)).toBeInTheDocument();
  expect(screen.queryByText(/no Google/i)).not.toBeInTheDocument();
});

it("cai para a nota do Google quando nao ha avaliacao Movepark", () => {
  render(<ParkingCard {...base} rating={null} googleRating={{ avg: 4.6, count: 312 }} />);
  expect(screen.getByText(/4,6/)).toBeInTheDocument();
  expect(screen.getByText(/no Google/i)).toBeInTheDocument();
});

it("nao mostra selo nenhum quando nao ha nota em lugar nenhum", () => {
  render(<ParkingCard {...base} rating={null} googleRating={null} />);
  expect(screen.queryByText(/no Google/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun run test src/features/search/ParkingCard.test.tsx`
Expected: FAIL, a prop `googleRating` não existe.

- [ ] **Step 3: Aceitar a prop no card**

Em `src/features/search/ParkingCard.tsx`, adicione ao tipo de props:

```tsx
  /**
   * Nota do Google. Entra só quando não há avaliação Movepark: em 375px, dois selos viram
   * ruído e nenhuma das notas é lida.
   */
  googleRating?: { avg: number | null; count: number } | null;
```

Troque a renderização condicional da linha 207 por:

```tsx
{(() => {
  const badge = pickCardBadge(
    { avg: rating?.avg ?? null, count: rating?.count ?? 0 },
    googleRating ? { rating: googleRating.avg, count: googleRating.count } : null,
  );
  if (!badge) return null;
  return (
    <RatingBadge
      avg={badge.avg}
      count={badge.count}
      className="text-body-sm"
      suffix={badge.source === "google" ? "no Google" : undefined}
    />
  );
})()}
```

com `import { pickCardBadge } from "@/features/reviews/google.logic";`.

- [ ] **Step 4: Aceitar o sufixo no RatingBadge**

Em `src/features/reviews/RatingStars.tsx`, no `RatingBadge`, adicione a prop opcional:

```tsx
  /** Rótulo da fonte, quando a nota não é da Movepark. Ex.: "no Google". */
  suffix?: string;
```

e renderize-o depois da contagem, no mesmo tom de texto secundário já usado ali. Leia o corpo atual antes de editar:
Run: `sed -n '60,95p' src/features/reviews/RatingStars.tsx`

- [ ] **Step 5: Rodar para ver passar**

Run: `bun run test src/features/search/ParkingCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Levar a nota do Google no payload da busca**

Em `supabase/functions/search/index.ts`, o `select` da linha 197 não muda (o snapshot é outra tabela). Depois de montar `results` e antes do retorno, anexe:

```ts
  // Nota do Google como prova social do card. NÃO entra em sort=rating_desc nem em min_rating:
  // ranking e curadoria continuam rodando só sobre a avaliação Movepark.
  const placeIds = [...new Set(
    rows.map((r) => r.location.google_place_id).filter((id): id is string => !!id),
  )];
  const snapshots = new Map<string, { rating: number | null; count: number }>();
  if (placeIds.length > 0) {
    // A edge usa service role, que passa por cima da RLS: o TTL de 30 dias e o is_hidden
    // precisam vir explícitos aqui, senão a busca serve o que a policy esconde.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: snaps } = await supabase
      .from("google_place_snapshot")
      .select("place_id, rating, user_rating_count")
      .in("place_id", placeIds)
      .eq("is_hidden", false)
      .gt("fetched_at", cutoff);
    for (const s of snaps ?? []) {
      snapshots.set(s.place_id, {
        rating: s.rating != null ? Number(s.rating) : null,
        count: s.user_rating_count ?? 0,
      });
    }
  }
```

Adicione `google_place_id` ao `select` do `candidateQuery` (linha 197, junto de `review_avg, review_count, photos`), e no objeto `location` da saída (perto da linha 444):

```ts
      google_rating: snapshots.get(r.location.google_place_id ?? "")?.rating ?? null,
      google_rating_count: snapshots.get(r.location.google_place_id ?? "")?.count ?? 0,
```

Ajuste o nome da variável de linhas (`rows`) ao que o arquivo realmente usa nesse ponto:
Run: `sed -n '420,445p' supabase/functions/search/index.ts`

**Não** altere o filtro de `min_rating` (linha 271) nem o comparador de `sort=rating_desc` (linha 398).

- [ ] **Step 7: Passar a prop onde o card é usado**

Run: `grep -rn "<ParkingCard" src | head`

Em cada uso, passe `googleRating={{ avg: r.location.google_rating, count: r.location.google_rating_count }}` a partir do resultado da busca. Onde o dado não existir na fonte, passe `null` explicitamente.

- [ ] **Step 8: Deploy da edge e verificação**

Run: `supabase functions deploy search --no-verify-jwt`

Chame a busca de um destino que tenha lote com snapshot e confirme os dois campos novos no JSON. Depois confirme que a ordenação não mudou:
Chame a mesma busca com `sort=rating_desc` e verifique que a ordem continua sendo a de `review_avg`, com as unidades sem avaliação Movepark no fim, independentemente da nota do Google.

- [ ] **Step 9: Rodar o gate e commitar**

Run: `bun run typecheck && bun run lint && bun run test`

```bash
git add supabase/functions/search/index.ts src/features/search/ParkingCard.tsx src/features/search/ParkingCard.test.tsx src/features/reviews/RatingStars.tsx
git commit -m "feat(avaliacoes-google): selo unico no card, com prioridade Movepark"
git push origin main
```

---

### Task 6: Lote mapeado no destino e na ficha

**Files:**
- Modify: `supabase/migrations/` (nova migration para a RPC `destination_prospect_cards`)
- Modify: `src/features/destinations/ProspectCard.tsx`
- Modify: `src/routes.tsx` (loader da ficha do lote mapeado, linhas 214-226)
- Modify: `docs/specs/avaliacoes-google.md` (status)
- Modify: `docs/specs/README.md` (status)

**Interfaces:**
- Consumes: tabela da Task 1, `GoogleReviewsBlock` da Task 4, `pickCardBadge` da Task 3.
- Produces: campos `google_rating` e `google_rating_count` no retorno da RPC `destination_prospect_cards`.

- [ ] **Step 1: Entender por que isso passa por RPC**

Leia a razão antes de editar, porque a alternativa óbvia não funciona:
Run: `sed -n '1,50p' supabase/migrations/20261009000000_prospect_location_public_columns.sql`

`prospect_location.google_place_id` teve o `select` revogado de `anon`/`authenticated` e concedido por coluna. O front anônimo **não** consegue ler o place_id do lote mapeado para depois buscar o snapshot. A nota tem que sair pronta da RPC.

- [ ] **Step 2: Ver a RPC atual**

Run: `grep -rn "destination_prospect_cards" supabase/migrations/*.sql | head -3`

Leia a definição completa da função no arquivo que a criou. A migration nova vai recriá-la com `create or replace`, mantendo tudo e somando duas colunas.

- [ ] **Step 3: Escrever a migration**

Escolha o carimbo conferindo antes:
Run: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d && ls supabase/migrations/ | sort | tail -1`

Crie `supabase/migrations/<carimbo>_prospect_cards_google_rating.sql` com um `create or replace function public.destination_prospect_cards(...)` idêntico ao atual, mais um `left join public.google_place_snapshot g on g.place_id = p.google_place_id` e duas colunas no `returns table`:

```sql
  google_rating       numeric,
  google_rating_count integer,
```

selecionadas como:

```sql
  g.rating                        as google_rating,
  coalesce(g.user_rating_count, 0) as google_rating_count,
```

A função é `SECURITY DEFINER`, então ela enxerga a tabela sem esbarrar na policy de TTL. **Por isso o filtro de 30 dias tem que ser explícito no join:**

```sql
  left join public.google_place_snapshot g
    on g.place_id = p.google_place_id
   and not g.is_hidden
   and g.fetched_at > now() - interval '30 days'
```

Sem essas duas linhas, a RPC serviria conteúdo vencido e conteúdo desligado pelo `hub_admin`, que é exatamente o furo que a policy fecha para os leitores normais.

- [ ] **Step 4: Aplicar e conferir**

Aplique via MCP `apply_migration`, depois:
```sql
select name, google_rating, google_rating_count
from public.destination_prospect_cards('recife');
```
Expected: as fichas do destino, com nota preenchida onde há snapshot fresco.

Run: `bun run gen:types`

- [ ] **Step 5: Mostrar a nota no card do lote mapeado**

Em `src/features/destinations/ProspectCard.tsx`, use o mesmo `pickCardBadge` com `movepark` sempre vazio, porque lote mapeado nunca tem avaliação Movepark:

```tsx
const badge = pickCardBadge(
  { avg: null, count: 0 },
  { rating: prospect.google_rating, count: prospect.google_rating_count },
);
```

e renderize o `RatingBadge` com `suffix="no Google"` quando `badge` não for nulo.

- [ ] **Step 6: Levar o snapshot para a ficha do lote mapeado**

Em `src/routes.tsx`, no loader das linhas 214-226, depois de achar o `prospect`, busque o snapshot e devolva junto:

```tsx
  let google = null;
  if (prospect.google_place_id) {
    const { data: snap } = await supabase
      .from("google_place_snapshot")
      .select("place_id, rating, user_rating_count, maps_uri, reviews, fetched_at")
      .eq("place_id", prospect.google_place_id)
      .maybeSingle();
    google = snap
      ? { ...snap, rating: snap.rating != null ? Number(snap.rating) : null }
      : null;
  }
  return { destination, prospect, faqs, google };
```

Se `prospect.google_place_id` não vier no shape do `ProspectCard` (por causa do corte de coluna do Step 1), inclua o place_id no `returns table` da RPC do Step 3. Ele é público por natureza: já aparece no link do Maps que a ficha mostra.

Renderize `<GoogleReviewsBlock snapshot={google} placeName={prospect.name} />` na página da ficha do lote mapeado.

- [ ] **Step 7: Rodar o gate**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: tudo verde.

- [ ] **Step 8: Atualizar o status das specs**

Em `docs/specs/avaliacoes-google.md`, troque a linha de status por:

```markdown
**Status:** ✅ implementado em <data>. Tabela `google_place_snapshot` + purge diário, Edge
`google-place-refresh` semanal, bloco na ficha da unidade e do lote mapeado, selo único no card
de busca e no destino.
```

Em `docs/specs/README.md`, na tabela de Status, troque a linha `avaliacoes-google` de `📝 Desenhado` para `✅ Implementado`, mantendo o resumo do que foi descartado e por quê.

- [ ] **Step 9: Rodar a revisão de segurança**

O diff tocou migration, RLS, policy, função `SECURITY DEFINER` e Edge Function, então a convenção do CLAUDE.md exige:

1. Rode `/security-review`.
2. Rode os advisors: MCP `get_advisors`, `type: security`, `project_id: mgaigbezdalbyuqiofcf`.

Expected: nenhuma regressão (RLS que caiu, mutação nova exposta a `anon`). Trate o que aparecer antes de fechar.

- [ ] **Step 10: Commit final**

```bash
git status
```
Confirme que não sobrou `Untracked file` referenciado pelo código.

```bash
git add -A supabase/migrations src/features/destinations src/routes.tsx src/types/database.ts docs/specs
git commit -m "feat(avaliacoes-google): lote mapeado no destino e na ficha, specs atualizadas"
git push origin main
```

---

## Verificação final

Depois da Task 6, confirme de ponta a ponta:

- [ ] `bun run typecheck && bun run lint && bun run test` verdes.
- [ ] `select count(*) from public.google_place_snapshot;` maior que zero no vivo.
- [ ] `select jobname, active from cron.job where jobname like 'google-place%' or jobname like 'purge-google%';` com os dois jobs ativos.
- [ ] Buscar num destino e ver o selo "no Google" nas unidades sem avaliação Movepark, e o selo normal nas que têm.
- [ ] `sort=rating_desc` continua ordenando só por `review_avg`.
- [ ] `curl -s https://hub.movepark.co/p/<slug> | grep -c aggregateRating` devolve `0` numa unidade sem avaliação Movepark que tenha snapshot do Google.
