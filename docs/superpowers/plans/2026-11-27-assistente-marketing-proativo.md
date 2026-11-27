# Assistente de marketing proativo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao agente de marketing da Automação 14 filtros novos de segmento, 5 ferramentas de leitura com painel próprio no chat, botões de próximo passo e uma abertura que já mostra as oportunidades do dia.

**Architecture:** os campos novos saem de uma função nova no Postgres (`marketing_contact_extras`), que o documento do contato (`marketing_contact_doc`) junta. O avaliador de segmento é genérico e passa a enxergá-los sozinho. As leituras agregadas são RPCs `security definer` com a trava `marketing_can_manage()`. Calendário e jogadas das oportunidades moram em código no `_shared/marketing`. As tools entram no registro único `MARKETING_TOOLS`, então chegam ao agente pela superfície `/marketing` do MCP sem mexer no beast-bots. A tela ganha um componente por tool. No beast-bots entram uma ferramenta só de tela (`sugerir_proximos_passos`), a persona nova e os evals.

**Tech Stack:** Postgres (Supabase, pgTAP), Deno (Edge Functions), React 18 + Vite + TanStack Query + Vitest + Testing Library + recharts, Mastra no beast-bots (bun).

**Spec:** [`docs/specs/assistente-marketing-proativo.md`](../../specs/assistente-marketing-proativo.md).

## Global Constraints

- Hub: trabalhar direto na `main`, um commit por tarefa, `git push origin main` ao fim de cada fase. Push na `main` publica o front em uns 2 minutos.
- O checkout do Hub é compartilhado com outras sessões. Antes de cada commit, rode `git status` e faça `git add` só dos arquivos desta tarefa. Nunca `git add -A`, `git stash` nem `git pull --autostash` com arquivo de outra sessão aberto.
- Sem Supabase local: nada de `supabase start`, `supabase db push` nem `bun run test:db`. pgTAP roda no banco de produção, numa transação desfeita, com `node scripts/pgtap-vivo.mjs <teste> [migration]`.
- Migration se aplica pela ferramenta MCP `apply_migration` do Supabase (projeto `mgaigbezdalbyuqiofcf`), com o arquivo local de nome monotônico. O carimbo `AAAAMMDDHHMMSS` precisa ser único e maior que o último de `supabase/migrations/`. Confira com `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` (saída vazia).
- Migration nova não pode depender do estado de produção: o job `db` do CI refaz tudo do zero. Nada de trava de md5 sobre função viva nem UUID de produção.
- Função nova no schema `public` nasce executável por `anon` e `authenticated`. Toda função nova recebe `revoke all ... from public, anon, authenticated` e, se a Edge chama, `grant execute ... to service_role`.
- Vitest com o Node 22 do nvm: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bun run test`. Com o Node 26 dá umas 100 falhas falsas de `localStorage`.
- Deno: `deno test --no-check --allow-env --allow-net --allow-read <arquivo>`.
- Depois de tocar migration, RLS, função `security definer` ou Edge: rodar os advisors de segurança do Supabase (`get_advisors`, tipo `security`) e tratar regressão.
- Texto que um humano lê passa pela skill `revisar-texto`. O texto deste plano já foi revisado, então grave como está.
- Sem travessão nem meia-risca (os caracteres U+2014 e U+2013) em código, copy, docs e commits. Antes de cada commit: `grep -nP '[\x{2014}\x{2013}]' <arquivos>` sem saída.
- Escreva sempre "Movepark", numa palavra só.
- Nenhuma campanha é executada e a chave geral do envio fica desligada. Teste e eval nunca confirmam cartão.
- beast-bots (`/Users/kallef/PhpstormProjects/orbital/FERA/beast-bots`): branch `feat/marketing-proativo`, PR. Mesclar publica, então só com o ok explícito do Kallef para aquele PR.
- Commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Toda resposta ao Kallef é em português do Brasil.

## Mapa de arquivos

| Arquivo | Fase | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261209100000_marketing_filtros_viagem.sql` | 1 | `marketing_contact_extras`, `marketing_contact_doc` com os extras, catálogo `marketing_segment_fields()` com 15 campos novos |
| `supabase/tests/marketing_filtros_viagem.test.sql` | 1 | pgTAP dos campos novos |
| `src/features/marketing/segmentBuilder.logic.ts` | 1 | catálogo da tela e `comOpcoes` |
| `src/features/marketing/SegmentBuilder.tsx` | 1 | opções de aeroporto por contexto |
| `src/features/marketing/segmentFields.contract.test.ts` | 1 | contrato tela ↔ banco lendo a migration mais recente |
| `src/features/marketing/SegmentBuilder.opcoes.test.tsx` | 1 | teste das opções dinâmicas |
| `src/routes/manager/marketing-segments.tsx` | 1 | passa os aeroportos ao construtor |
| `supabase/migrations/20261209110000_marketing_assistente_leituras.sql` | 2 | `marketing_segment_summaries`, `marketing_breakdown`, `marketing_breakdown_rotulo`, `marketing_trend`, `marketing_campaign_result` |
| `supabase/tests/marketing_assistente_leituras.test.sql` | 2 | pgTAP das leituras |
| `supabase/functions/_shared/marketing/calendario.ts` (+ `.test.ts`) | 2 | feriados e férias calculados |
| `supabase/functions/_shared/marketing/oportunidades.ts` (+ `.test.ts`) | 2 | jogadas e montagem das oportunidades |
| `supabase/functions/_shared/marketing/tools.ts`, `handlers.ts` (+ `handlers.test.ts`) | 2 | as 5 tools |
| `supabase/functions/marketing-assistant/logic.ts`, `index.ts` (+ `logic.test.ts`) | 2 | ação `oportunidades` |
| `src/features/marketing-assistant/paineis.logic.ts` (+ `.test.ts`) | 2 | formatação pura dos painéis |
| `src/features/marketing-assistant/partes/{Oportunidades,Distribuicao,Tendencia,Calendario,ResultadoDaCampanha}.tsx` | 2 | os painéis |
| `src/features/marketing-assistant/conversa.logic.ts`, `partes/VisualDaTool.tsx` | 2 e 3 | grupos, rótulos, roteamento, próximos passos |
| `src/features/marketing-assistant/partes/ProximosPassos.tsx` | 3 | botões de próximo passo |
| `src/features/marketing-assistant/Conversa.tsx`, `api.ts` | 3 | abertura com oportunidades e clique que envia |
| beast-bots `src/mastra/tenants/movepark-marketing/proximos-passos.ts` | 3 | ferramenta de tela |
| beast-bots `hub/marketing-mcp.ts`, `tenant.config.ts`, `persona.ts`, `tests/marketing.test.ts`, `evals/*` | 3 | ligação, persona, testes e evals |

---

# Fase 1: filtros novos

### Task 1: campos novos no banco

**Files:**
- Create: `supabase/migrations/20261209100000_marketing_filtros_viagem.sql`
- Create: `supabase/tests/marketing_filtros_viagem.test.sql`
- Modify: `docs/specs/assistente-marketing-proativo.md` (§ 3, "Onde entra", item 1)

**Interfaces:**
- Produces: as chaves novas no `doc` de `marketing_contact_doc(uuid[])`: `days_since_return` (int), `has_upcoming_trip` (bool), `days_until_next_trip` (int), `next_trip_fare_tier` (text), `parked_now` (bool), `abandoned_hours_ago` (int), `abandoned_amount` (numeric), `destinations` (array de slug), `last_destination` (slug), `last_fare_tier` (text), `first_channel` (`site`, `busca`, `pagina_destino`, `mia_whatsapp`), `first_traffic_source` (text minúsculo), `preferred_payment` (`pix`, `cartao`), `used_coupon` (bool), `last_rating` (int). O catálogo `marketing_segment_fields()` devolve as 15 chaves, com grupos `Viagem` e `Preferência` e as opções de aeroporto lidas de `destination`.

- [ ] **Step 1: confirmar o carimbo**

Run: `ls supabase/migrations/ | tail -3 && ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d`
Expected: o último carimbo é menor que `20261209100000` e a segunda saída é vazia. Se outro arquivo já usa um carimbo maior, troque `20261209100000` por um carimbo maior que ele aqui e na Task 3 (que usa o próximo).

- [ ] **Step 2: escrever o teste pgTAP**

Crie `supabase/tests/marketing_filtros_viagem.test.sql`:

```sql
-- pgTAP: filtros novos de segmento (viagem, abandono e preferência).
-- Migration 20261209100000_marketing_filtros_viagem. Spec: docs/specs/assistente-marketing-proativo.md § 3.
-- Roda no banco de produção sem deixar rastro:
--   node scripts/pgtap-vivo.mjs supabase/tests/marketing_filtros_viagem.test.sql
--
-- Toda compra da fixture é `completed`: o filtro só olha datas e is_purchase, e assim nenhum
-- gatilho de confirmação (integração, cashback de reserva confirmada) entra no caminho. O
-- abandono nasce `pending` e vira `expired`, a única transição que o guarda de status aceita.

begin;
select plan(22);

create temp table fv_ctx (loc uuid, slug text);
insert into fv_ctx
  select l.id, d.slug
  from public.location l
  join public.destination d on d.id = l.destination_id
  where l.deleted_at is null and d.slug is not null
  order by l.created_at
  limit 1;

create temp table fv_perfil (email text primary key, uid uuid);

do $$
declare
  v_email text;
  v_uid uuid;
begin
  foreach v_email in array array['fv-volta@ex.com', 'fv-viagem@ex.com', 'fv-patio@ex.com',
                                 'fv-abandono@ex.com', 'fv-voltou@ex.com', 'fv-empate@ex.com'] loop
    v_uid := gen_random_uuid();
    insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
      values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              v_email, now(), now());
    insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;
    insert into fv_perfil values (v_email, v_uid);
  end loop;
end $$;

-- Compras e abandonos. Colunas: código, e-mail, status, valor, criada, entrada, saída, tarifa,
-- origem, utm_source.
insert into public.booking (code, profile_id, location_id, customer_email, status, total_amount,
                            created_at, check_in_at, check_out_at, fare_tier, origin, utm_source)
select v.code, p.uid, (select loc from fv_ctx), v.email, v.status::public.booking_status, v.total,
       now() + v.criada, now() + v.entrada, now() + v.saida, v.tarifa::public.fare_tier, v.origem, v.utm
from (values
  -- Voltou há 2 dias e 1 hora, primeira compra pelo site, tráfego da Pare Seguro.
  ('MP-FV-1', 'fv-volta@ex.com', 'completed', 180, interval '-9 days', interval '-8 days',
   interval '-2 days -1 hour', 'basica', 'hub_direct', ' PareSeguro '),
  -- Viaja daqui a 3 dias e 1 hora, na Básica, comprou pela Mia.
  ('MP-FV-2', 'fv-viagem@ex.com', 'completed', 150, interval '-1 day', interval '3 days 1 hour',
   interval '8 days', 'basica', 'whatsapp-bot', null),
  -- Está no pátio: entrou ontem, sai em 2 dias.
  ('MP-FV-3', 'fv-patio@ex.com', 'completed', 120, interval '-3 days', interval '-1 day',
   interval '2 days', 'flex', 'hub_search', null),
  -- Abandonou há 5 horas e 10 minutos.
  ('MP-FV-4', 'fv-abandono@ex.com', 'pending', 210, interval '-5 hours -10 minutes', interval '2 days',
   interval '5 days', 'basica', 'hub_direct', null),
  -- Abandonou há 30 horas e comprou 10 horas depois: o abandono não conta.
  ('MP-FV-5', 'fv-voltou@ex.com', 'pending', 200, interval '-30 hours', interval '1 day',
   interval '4 days', 'basica', 'hub_direct', null),
  ('MP-FV-6', 'fv-voltou@ex.com', 'completed', 200, interval '-20 hours', interval '1 day',
   interval '4 days', 'basica', 'hub_direct', null),
  -- Duas compras: a primeira pela página do aeroporto, em PIX; a última na Flex, no cartão.
  ('MP-FV-7', 'fv-empate@ex.com', 'completed', 300, interval '-40 days', interval '-39 days',
   interval '-35 days', 'superflex', 'hub_destino', null),
  ('MP-FV-8', 'fv-empate@ex.com', 'completed', 260, interval '-20 days', interval '-19 days',
   interval '-15 days', 'flex', 'hub_direct', null)
) as v(code, email, status, total, criada, entrada, saida, tarifa, origem, utm)
join fv_perfil p on p.email = v.email;

update public.booking set status = 'expired' where code in ('MP-FV-4', 'MP-FV-5');

-- Pagamentos: um por compra que importa para a forma de pagamento.
insert into public.payment (booking_id, provider, amount, status, method, kind, paid_at)
select b.id, 'mock', b.total_amount, 'paid', v.metodo, 'booking', now() + v.pago
from (values
  ('MP-FV-1', 'card', interval '-9 days'),
  ('MP-FV-2', 'pix', interval '-1 day'),
  ('MP-FV-7', 'pix', interval '-40 days'),
  ('MP-FV-8', 'card', interval '-20 days')
) as v(code, metodo, pago)
join public.booking b on b.code = v.code;

-- Cupom só se a base tiver algum cupom: a asserção 13 compara com a mesma condição.
insert into public.booking_coupon (booking_id, coupon_id, discount_applied)
select b.id, c.id, 10
from public.booking b
cross join (select id from public.coupon order by created_at limit 1) c
where b.code = 'MP-FV-8';

insert into public.review (booking_id, profile_id, location_id, rating, created_at)
select b.id, b.profile_id, b.location_id, 5, now() - interval '1 day'
from public.booking b where b.code = 'MP-FV-1';

create temp view fv_doc as
  select d.contact_key, d.doc
  from public.marketing_contact_doc((select array[loc] from fv_ctx)) d
  where d.contact_key like 'fv-%';

-- ── Viagem ──────────────────────────────────────────────────────────────────
select is((select (doc ->> 'days_since_return')::int from fv_doc where contact_key = 'fv-volta@ex.com'),
          2, 'dias desde a volta contam da saída do pátio');
select is((select (doc ->> 'has_upcoming_trip')::boolean from fv_doc where contact_key = 'fv-volta@ex.com'),
          false, 'quem já voltou e não marcou nada não tem viagem marcada');
select is((select (doc ->> 'has_upcoming_trip')::boolean from fv_doc where contact_key = 'fv-viagem@ex.com'),
          true, 'compra com entrada no futuro é viagem marcada');
select is((select (doc ->> 'days_until_next_trip')::int from fv_doc where contact_key = 'fv-viagem@ex.com'),
          3, 'dias até a próxima viagem');
select is((select doc ->> 'next_trip_fare_tier' from fv_doc where contact_key = 'fv-viagem@ex.com'),
          'basica', 'tarifa da próxima viagem');
select is((select (doc ->> 'parked_now')::boolean from fv_doc where contact_key = 'fv-patio@ex.com'),
          true, 'entrou e ainda não saiu: está no pátio');
select is((select doc ->> 'days_since_return' from fv_doc where contact_key = 'fv-patio@ex.com'),
          null, 'quem ainda não voltou não tem dias desde a volta');

-- ── Abandono ────────────────────────────────────────────────────────────────
select is((select (doc ->> 'abandoned_hours_ago')::int from fv_doc where contact_key = 'fv-abandono@ex.com'),
          5, 'horas desde o abandono');
select is((select (doc ->> 'abandoned_amount')::numeric from fv_doc where contact_key = 'fv-abandono@ex.com'),
          210::numeric, 'valor do carrinho abandonado');
select is((select doc ->> 'abandoned_hours_ago' from fv_doc where contact_key = 'fv-voltou@ex.com'),
          null, 'abandono seguido de compra não conta');

-- ── Preferência ─────────────────────────────────────────────────────────────
select is((select doc ->> 'last_destination' from fv_doc where contact_key = 'fv-volta@ex.com'),
          (select slug from fv_ctx), 'aeroporto da última viagem é o slug do destino');
select ok((select (doc -> 'destinations') ? (select slug from fv_ctx) from fv_doc where contact_key = 'fv-volta@ex.com'),
          'aeroportos onde já estacionou trazem o slug');
select ok((select doc ->> 'used_coupon' from fv_doc where contact_key = 'fv-empate@ex.com')::boolean
          = exists (select 1 from public.coupon), 'já usou cupom quando a compra tem cupom');
select is((select doc ->> 'first_channel' from fv_doc where contact_key = 'fv-volta@ex.com'),
          'site', 'hub_direct vira site');
select is((select doc ->> 'first_channel' from fv_doc where contact_key = 'fv-viagem@ex.com'),
          'mia_whatsapp', 'whatsapp-bot vira Mia');
select is((select doc ->> 'first_channel' from fv_doc where contact_key = 'fv-empate@ex.com'),
          'pagina_destino', 'o canal é o da primeira compra, não o da última');
select is((select doc ->> 'first_traffic_source' from fv_doc where contact_key = 'fv-volta@ex.com'),
          'pareseguro', 'origem do tráfego sai em minúsculas e sem espaço');
select is((select doc ->> 'preferred_payment' from fv_doc where contact_key = 'fv-empate@ex.com'),
          'cartao', 'empate na forma de pagamento: vale a mais recente');
select is((select doc ->> 'last_fare_tier' from fv_doc where contact_key = 'fv-empate@ex.com'),
          'flex', 'tarifa da última compra');
select is((select (doc ->> 'last_rating')::int from fv_doc where contact_key = 'fv-volta@ex.com'),
          5, 'nota da última avaliação');

-- ── Catálogo e avaliador ────────────────────────────────────────────────────
select is((select count(*)::int from public.marketing_segment_fields() f
           where f.key in ('days_since_return', 'has_upcoming_trip', 'days_until_next_trip',
                           'next_trip_fare_tier', 'parked_now', 'abandoned_hours_ago',
                           'abandoned_amount', 'destinations', 'last_destination', 'last_fare_tier',
                           'first_channel', 'first_traffic_source', 'preferred_payment',
                           'used_coupon', 'last_rating')),
          15, 'o catálogo traz os 15 campos novos');
select ok(public.marketing_eval_definition(
            (select doc from fv_doc where contact_key = 'fv-volta@ex.com'),
            '{"match":"all","rules":[{"field":"days_since_return","op":"between","value":[1,3]},{"field":"has_upcoming_trip","op":"is_false"}]}'::jsonb),
          'o segmento da segunda compra casa com quem voltou há 2 dias');

select * from finish();
rollback;
```

Isso dá 22 asserções. Se mudar alguma, ajuste o `plan(22)`.

- [ ] **Step 3: ver o teste falhar**

Run: `node scripts/pgtap-vivo.mjs supabase/tests/marketing_filtros_viagem.test.sql`
Expected: falha. Os campos não existem, então os `is()` comparam `null` com o esperado.

- [ ] **Step 4: escrever a migration**

Crie `supabase/migrations/20261209100000_marketing_filtros_viagem.sql`:

```sql
-- Filtros novos de segmento: viagem, abandono e preferência (14 filtros, 15 campos).
-- Spec: docs/specs/assistente-marketing-proativo.md § 3.
--
-- Os campos saem de uma função própria (marketing_contact_extras) que o documento do contato junta.
-- marketing_contact_metrics fica como está: mudar a assinatura dela obrigaria a derrubar e recriar
-- o RFM, as descobertas e a matriz de perfis, que a leem. O avaliador de segmento é genérico
-- (lê o doc pelo tipo do JSON), então campo novo no doc já é campo filtrável.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Os campos novos, por contato
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_contact_extras(p_location_ids uuid[] default null)
returns table (contact_key text, extras jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with scoped as (
    select f.*, d.slug as destination_slug
    from public.marketing_booking_fact f
    join public.location l on l.id = f.location_id
    left join public.destination d on d.id = l.destination_id
    where f.contact_key is not null
      and (p_location_ids is null or f.location_id = any(p_location_ids))
  ),
  compra as (select * from scoped where is_purchase),
  contatos as (select distinct s.contact_key from scoped s),
  -- Volta da viagem: a saída do pátio mais recente que já passou.
  volta as (
    select c.contact_key, max(c.check_out_at) as ultima_saida
    from compra c
    where c.check_out_at <= now()
    group by c.contact_key
  ),
  proxima as (
    select distinct on (c.contact_key) c.contact_key, c.check_in_at, c.fare_tier
    from compra c
    where c.check_in_at > now()
    order by c.contact_key, c.check_in_at asc
  ),
  patio as (
    select distinct c.contact_key
    from compra c
    where c.check_in_at <= now() and c.check_out_at > now()
  ),
  -- Abandono: o checkout vencido mais recente sem compra do mesmo contato criada depois dele.
  abandono as (
    select distinct on (s.contact_key) s.contact_key, s.created_at, s.total_amount
    from scoped s
    where s.status = 'expired'
      and not exists (
        select 1 from compra c where c.contact_key = s.contact_key and c.created_at > s.created_at)
    order by s.contact_key, s.created_at desc
  ),
  ultima as (
    select distinct on (c.contact_key) c.contact_key, c.destination_slug, c.fare_tier
    from compra c
    order by c.contact_key, c.created_at desc
  ),
  primeira as (
    select distinct on (c.contact_key) c.contact_key, c.origin, c.utm_source
    from compra c
    order by c.contact_key, c.created_at asc
  ),
  destinos as (
    select c.contact_key, jsonb_agg(distinct c.destination_slug) as slugs
    from compra c
    where c.destination_slug is not null
    group by c.contact_key
  ),
  -- Forma de pagamento mais usada; no empate, a do pagamento mais recente.
  pagamento as (
    select distinct on (x.contact_key) x.contact_key, x.method
    from (
      select c.contact_key, p.method, count(*) as n, max(p.paid_at) as ultimo
      from compra c
      join public.payment p on p.booking_id = c.booking_id
      where p.kind = 'booking' and p.paid_at is not null and p.method in ('pix', 'card')
      group by c.contact_key, p.method
    ) x
    order by x.contact_key, x.n desc, x.ultimo desc
  ),
  cupom as (
    select distinct c.contact_key
    from compra c
    join public.booking_coupon bc on bc.booking_id = c.booking_id
  ),
  nota as (
    select distinct on (c.contact_key) c.contact_key, r.rating
    from compra c
    join public.review r on r.booking_id = c.booking_id
    order by c.contact_key, r.created_at desc
  )
  select
    k.contact_key,
    jsonb_build_object(
      'days_since_return', case when v.ultima_saida is not null
        then floor(extract(epoch from now() - v.ultima_saida) / 86400)::int end,
      'has_upcoming_trip', (px.contact_key is not null),
      'days_until_next_trip', case when px.check_in_at is not null
        then floor(extract(epoch from px.check_in_at - now()) / 86400)::int end,
      'next_trip_fare_tier', px.fare_tier::text,
      'parked_now', (pt.contact_key is not null),
      'abandoned_hours_ago', case when ab.created_at is not null
        then floor(extract(epoch from now() - ab.created_at) / 3600)::int end,
      'abandoned_amount', ab.total_amount,
      'destinations', coalesce(ds.slugs, '[]'::jsonb),
      'last_destination', u.destination_slug,
      'last_fare_tier', u.fare_tier::text,
      'first_channel', case pr.origin
        when 'hub_direct' then 'site'
        when 'hub_search' then 'busca'
        when 'hub_destino' then 'pagina_destino'
        when 'whatsapp-bot' then 'mia_whatsapp'
      end,
      'first_traffic_source', nullif(lower(btrim(pr.utm_source)), ''),
      'preferred_payment', case pg.method when 'pix' then 'pix' when 'card' then 'cartao' end,
      'used_coupon', (cp.contact_key is not null),
      'last_rating', nt.rating
    ) as extras
  from contatos k
  left join volta v on v.contact_key = k.contact_key
  left join proxima px on px.contact_key = k.contact_key
  left join patio pt on pt.contact_key = k.contact_key
  left join abandono ab on ab.contact_key = k.contact_key
  left join ultima u on u.contact_key = k.contact_key
  left join primeira pr on pr.contact_key = k.contact_key
  left join destinos ds on ds.contact_key = k.contact_key
  left join pagamento pg on pg.contact_key = k.contact_key
  left join cupom cp on cp.contact_key = k.contact_key
  left join nota nt on nt.contact_key = k.contact_key;
$$;

revoke all on function public.marketing_contact_extras(uuid[]) from public, anon, authenticated;

comment on function public.marketing_contact_extras(uuid[]) is
  'Campos de viagem, abandono e preferência por contato, juntados ao doc por marketing_contact_doc. Spec: assistente-marketing-proativo.md § 3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O documento do contato junta os extras
--
-- Corpo igual ao da 20261029093000_marketing_rfm_growth, mais o join e o `||` no fim.
-- CREATE OR REPLACE preserva dono e grants.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_contact_doc(
  p_location_ids uuid[] default null
) returns table (contact_key text, doc jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    m.contact_key,
    jsonb_build_object(
      'bookings_count', m.bookings_count,
      'cancelled_count', m.cancelled_count,
      'total_spent', m.total_spent,
      'avg_ticket', m.avg_ticket,
      'last_ticket', m.last_ticket,
      'days_since_last', m.days_since_last,
      'days_since_first', m.days_since_first,
      'bookings_30', m.bookings_30,
      'bookings_90', m.bookings_90,
      'bookings_180', m.bookings_180,
      'bookings_365', m.bookings_365,
      'avg_stay_days', m.avg_stay_days,
      'avg_lead_days', m.avg_lead_days,
      'distinct_locations', m.distinct_locations,
      'top_location_id', m.top_location_id,
      'top_dow', m.top_dow,
      'weekend_share', m.weekend_share,
      'vacation_bookings', m.vacation_bookings,
      'vacation_share', m.vacation_share,
      'avg_gap_days', m.avg_gap_days,
      'cycle_overdue_days', case when m.avg_gap_days is not null and m.days_since_last is not null
        then round(m.days_since_last - m.avg_gap_days, 1) end,
      'has_second_booking', (m.second_booking_at is not null),
      'vehicle_model', m.vehicle_model,
      'vehicle_brand', m.vehicle_brand,
      'vehicle_origin', m.vehicle_origin,
      'vehicle_color', m.vehicle_color,
      'abandoned', m.abandoned,
      'cohort', m.cohort::text,
      'growth_stage', m.growth_stage::text,
      'subscription_candidate', m.subscription_candidate,
      'r_score', r.r_score,
      'f_score', r.f_score,
      'm_score', r.m_score,
      'rfm_segment', r.rfm_segment,
      'last_location_id', m.last_location_id,
      'email', m.email,
      'phone', m.phone,
      'tags', coalesce(to_jsonb(c.tags), '[]'::jsonb),
      'email_consent', coalesce(c.email_consent, false),
      'whatsapp_consent', coalesce(c.whatsapp_consent, false),
      'unsubscribed', (c.unsubscribed_at is not null),
      'has_contact_record', (c.id is not null)
    ) || coalesce(x.extras, '{}'::jsonb) as doc
  from public.marketing_contact_metrics(p_location_ids) m
  left join public.marketing_contact_rfm(p_location_ids) r on r.contact_key = m.contact_key
  left join public.marketing_contact c
    on c.contact_key = m.contact_key and c.deleted_at is null
  left join public.marketing_contact_extras(p_location_ids) x on x.contact_key = m.contact_key;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O catálogo de campos ganha os 15 campos e as opções de aeroporto
--
-- Passa de immutable a stable porque as opções de aeroporto vêm do cadastro de destinos: destino
-- com unidade entra sozinho na lista. Continua sem security definer, como era: quem chama é o MCP
-- com a chave de serviço, e um definer liberado a usuário logado viraria achado novo no advisor.
-- As linhas antigas são as da 20261207110000_marketing_mcp_base, na mesma ordem.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_segment_fields()
returns table (key text, kind text, label text, grupo text, options jsonb, hint text, operators text[])
language sql
stable
set search_path = public, pg_temp
as $$
  with aeroportos as (
    select coalesce(jsonb_agg(jsonb_build_object('value', d.slug, 'label', d.name) order by d.name),
                    '[]'::jsonb) as opcoes
    from public.destination d
    where d.slug is not null
      and exists (select 1 from public.location l where l.destination_id = d.id and l.deleted_at is null)
  )
  select v.key, v.kind, v.label, v.grupo,
         case when v.key in ('destinations', 'last_destination') then (select opcoes from aeroportos)
              else v.options end,
         v.hint, public.marketing_segment_operators(v.kind)
  from (values
    ('bookings_count', 'number', 'Reservas pagas', 'Comportamento', null::jsonb, 'Só conta reserva confirmada, com check-in ou concluída.'),
    ('days_since_last', 'number', 'Dias desde a última compra', 'Comportamento', null::jsonb, null),
    ('days_since_first', 'number', 'Dias desde a primeira compra', 'Comportamento', null::jsonb, null),
    ('avg_gap_days', 'number', 'Intervalo médio entre compras (dias)', 'Comportamento', null::jsonb, 'A cadência da própria pessoa. Base do público de recompra.'),
    ('cycle_overdue_days', 'number', 'Dias além do próprio ciclo', 'Comportamento', null::jsonb, 'Negativo é antes da hora, 0 é a hora, positivo é atraso. Entre -5 e 15 é a janela provável de retorno.'),
    ('bookings_30', 'number', 'Reservas nos últimos 30 dias', 'Comportamento', null::jsonb, null),
    ('bookings_90', 'number', 'Reservas nos últimos 90 dias', 'Comportamento', null::jsonb, null),
    ('bookings_180', 'number', 'Reservas nos últimos 180 dias', 'Comportamento', null::jsonb, null),
    ('bookings_365', 'number', 'Reservas nos últimos 365 dias', 'Comportamento', null::jsonb, null),
    ('avg_stay_days', 'number', 'Duração média da estadia (dias)', 'Comportamento', null::jsonb, null),
    ('avg_lead_days', 'number', 'Antecedência média da reserva (dias)', 'Comportamento', null::jsonb, 'Quantos dias antes da entrada a pessoa costuma reservar.'),
    ('weekend_share', 'number', 'Fatia de entradas no fim de semana', 'Comportamento', null::jsonb, 'De 0 a 1, sobre sexta, sábado e domingo. Sobre as reservas que têm data.'),
    ('top_dow', 'enum', 'Dia da semana predominante', 'Comportamento',
      '[{"value":"0","label":"Domingo"},{"value":"1","label":"Segunda"},{"value":"2","label":"Terça"},{"value":"3","label":"Quarta"},{"value":"4","label":"Quinta"},{"value":"5","label":"Sexta"},{"value":"6","label":"Sábado"}]'::jsonb, null),
    ('has_second_booking', 'boolean', 'Já fez a segunda reserva', 'Comportamento', null::jsonb, 'O marco de ativação: é a taxa de 1ª para 2ª que o time mede.'),
    ('abandoned', 'boolean', 'Tem reserva iniciada e não paga', 'Comportamento', null::jsonb, 'Checkout começado com viagem ainda por vir.'),
    ('abandoned_hours_ago', 'number', 'Horas desde o abandono', 'Comportamento', null::jsonb, 'Último checkout vencido sem compra depois dele.'),
    ('vacation_share', 'number', 'Fatia de viagens em férias', 'Comportamento', null::jsonb, 'De 0 a 1, sobre janeiro, julho e dezembro. 0,7 já é um perfil sazonal.'),
    ('distinct_locations', 'number', 'Estacionamentos diferentes usados', 'Comportamento', null::jsonb, null),
    ('cancelled_count', 'number', 'Cancelamentos e faltas', 'Comportamento', null::jsonb, null),
    ('days_since_return', 'number', 'Dias desde a volta da viagem', 'Viagem', null::jsonb, 'Conta da saída do pátio na reserva paga mais recente. De 1 a 3 é a hora de chamar para a próxima.'),
    ('has_upcoming_trip', 'boolean', 'Tem viagem marcada', 'Viagem', null::jsonb, 'Reserva paga com entrada no futuro.'),
    ('days_until_next_trip', 'number', 'Dias até a próxima viagem', 'Viagem', null::jsonb, null),
    ('next_trip_fare_tier', 'enum', 'Tarifa da próxima viagem', 'Viagem',
      '[{"value":"basica","label":"Básica"},{"value":"flex","label":"Flex"},{"value":"superflex","label":"Superflex"}]'::jsonb,
      'Quem vai na Básica pode trocar para a Flex antes de viajar.'),
    ('parked_now', 'boolean', 'Está com o carro no pátio agora', 'Viagem', null::jsonb, null),
    ('total_spent', 'money', 'Total gasto', 'Valor', null::jsonb, null),
    ('avg_ticket', 'money', 'Ticket médio', 'Valor', null::jsonb, null),
    ('last_ticket', 'money', 'Valor da última reserva', 'Valor', null::jsonb, null),
    ('abandoned_amount', 'money', 'Valor do carrinho abandonado', 'Valor', null::jsonb, null),
    ('r_score', 'number', 'Score de recência (R)', 'RFM', null::jsonb, 'De 1 a 5, por quintil da própria base. 5 é o mais recente.'),
    ('f_score', 'number', 'Score de frequência (F)', 'RFM', null::jsonb, 'De 1 a 5, por quintil. 5 é quem mais volta.'),
    ('m_score', 'number', 'Score monetário (M)', 'RFM', null::jsonb, 'De 1 a 5, por quintil. 5 é quem mais gerou receita.'),
    ('rfm_segment', 'enum', 'Segmento RFM', 'RFM',
      '[{"value":"campeoes","label":"Campeões"},{"value":"fieis","label":"Fiéis"},{"value":"recorrentes","label":"Recorrentes"},{"value":"potenciais","label":"Potenciais"},{"value":"novos","label":"Novos"},{"value":"ocasionais","label":"Ocasionais"},{"value":"oportunidade","label":"Oportunidade"},{"value":"atencao","label":"Atenção"},{"value":"recuperar","label":"Recuperar"},{"value":"em_risco","label":"Em risco"},{"value":"alto_risco","label":"Alto risco"},{"value":"inativos","label":"Inativos"},{"value":"perdidos","label":"Perdidos"},{"value":"perdidos_vip","label":"Perdidos VIP"}]'::jsonb,
      'A célula da matriz Recência × Frequência, com o M promovendo os de maior valor.'),
    ('cohort', 'enum', 'Coorte', 'Growth',
      '[{"value":"lead","label":"Lead"},{"value":"primeira_compra","label":"Primeira compra"},{"value":"recorrente","label":"Recorrente"},{"value":"campeao","label":"Campeão"},{"value":"sazonal_ferias","label":"Sazonal de férias"},{"value":"em_risco","label":"Em risco"},{"value":"inativo","label":"Inativo"}]'::jsonb, null),
    ('growth_stage', 'enum', 'Estágio de growth', 'Growth',
      '[{"value":"aquisicao","label":"Aquisição"},{"value":"ativacao","label":"Ativação"},{"value":"retencao","label":"Retenção"},{"value":"reativacao","label":"Reativação"}]'::jsonb, null),
    ('subscription_candidate', 'boolean', 'Candidato a assinante', 'Growth', null::jsonb, 'Já tem cadência de mensalista: volta muito ou volta rápido.'),
    ('vehicle_model', 'text', 'Modelo do veículo', 'Veículo', null::jsonb, null),
    ('vehicle_brand', 'text', 'Marca do veículo', 'Veículo', null::jsonb, 'Normalizada a partir do campo livre: "PEUGEOT/2008" e "Onix" viram PEUGEOT e CHEVROLET.'),
    ('vehicle_origin', 'enum', 'Origem da marca', 'Veículo',
      '[{"value":"nacional","label":"Nacional"},{"value":"importada","label":"Importada"}]'::jsonb,
      'Proxy de perfil pela marca, não o dado fiscal de importação do veículo.'),
    ('vehicle_color', 'text', 'Cor do veículo', 'Veículo', null::jsonb, null),
    ('destinations', 'tags', 'Aeroportos onde já estacionou', 'Preferência', null::jsonb, null),
    ('last_destination', 'enum', 'Aeroporto da última viagem', 'Preferência', null::jsonb, null),
    ('last_fare_tier', 'enum', 'Tarifa da última compra', 'Preferência',
      '[{"value":"basica","label":"Básica"},{"value":"flex","label":"Flex"},{"value":"superflex","label":"Superflex"}]'::jsonb, null),
    ('first_channel', 'enum', 'Por onde comprou a primeira vez', 'Preferência',
      '[{"value":"site","label":"Site"},{"value":"busca","label":"Busca do site"},{"value":"pagina_destino","label":"Página do aeroporto"},{"value":"mia_whatsapp","label":"Mia, no WhatsApp"}]'::jsonb, null),
    ('first_traffic_source', 'text', 'De onde veio o tráfego da primeira compra', 'Preferência', null::jsonb, 'A origem marcada no link da primeira compra, como pareseguro, chatgpt.com ou google.'),
    ('preferred_payment', 'enum', 'Forma de pagamento mais usada', 'Preferência',
      '[{"value":"pix","label":"PIX"},{"value":"cartao","label":"Cartão"}]'::jsonb, null),
    ('used_coupon', 'boolean', 'Já usou cupom', 'Preferência', null::jsonb, null),
    ('last_rating', 'number', 'Nota da última avaliação', 'Preferência', null::jsonb, 'De 1 a 5.'),
    ('tags', 'tags', 'Etiquetas', 'Contato', null::jsonb, null),
    ('email_consent', 'boolean', 'Aceita e-mail', 'Contato', null::jsonb, null),
    ('whatsapp_consent', 'boolean', 'Aceita WhatsApp', 'Contato', null::jsonb, null),
    ('unsubscribed', 'boolean', 'Descadastrado', 'Contato', null::jsonb, null)
  ) as v(key, kind, label, grupo, options, hint);
$$;

revoke all on function public.marketing_segment_fields() from public, anon;
grant execute on function public.marketing_segment_fields() to authenticated, service_role;
```

Antes de gravar, confira as linhas antigas do catálogo contra a fonte: `sed -n '194,246p' supabase/migrations/20261207110000_marketing_mcp_base.sql`. Todas as linhas de lá precisam estar aqui, com o mesmo texto.

- [ ] **Step 5: ver o teste passar com a migration**

Run: `node scripts/pgtap-vivo.mjs supabase/tests/marketing_filtros_viagem.test.sql supabase/migrations/20261209100000_marketing_filtros_viagem.sql`
Expected: `ok 1` até `ok 22`, nenhum `not ok`.

- [ ] **Step 6: conferir que nada mais quebrou**

Run: `node scripts/pgtap-vivo.mjs supabase/tests/marketing_rfm.test.sql supabase/migrations/20261209100000_marketing_filtros_viagem.sql && node scripts/pgtap-vivo.mjs supabase/tests/marketing_mcp_base.test.sql supabase/migrations/20261209100000_marketing_filtros_viagem.sql`
Expected: os dois verdes, com o mesmo resultado de rodar sem a migration. Rode também sem o segundo argumento e compare: falha que já existia sem a migration é fixture, não regressão.

- [ ] **Step 7: aplicar em produção**

Use a ferramenta MCP `apply_migration` do Supabase: `project_id` `mgaigbezdalbyuqiofcf`, `name` `marketing_filtros_viagem`, `query` com o conteúdo inteiro do arquivo.
Depois rode `node scripts/pgtap-vivo.mjs supabase/tests/marketing_filtros_viagem.test.sql` (sem a migration).
Expected: 22 de 22.

- [ ] **Step 8: conferir os números da spec no vivo**

Com `execute_sql`:

```sql
select
  count(*) filter (where (doc->>'days_since_return')::int between 0 and 3) volta_3d,
  count(*) filter (where (doc->>'has_upcoming_trip')::boolean) viagem_marcada,
  count(*) filter (where (doc->>'parked_now')::boolean) no_patio,
  count(*) filter (where (doc->>'abandoned_hours_ago')::int <= 24) abandono_24h
from public.marketing_contact_doc(null);
```

Expected: perto dos números de 27/11 (16, 46, 48, 5). A base anda, então diferença pequena é normal. Zero em tudo é bug.

- [ ] **Step 9: advisors de segurança**

Use `get_advisors` (tipo `security`, projeto `mgaigbezdalbyuqiofcf`).
Expected: nenhum achado novo sobre `marketing_contact_extras` ou `marketing_segment_fields`. Achado novo de "executável por anon" pede o `revoke` que faltou.

- [ ] **Step 10: ajustar a spec**

Em `docs/specs/assistente-marketing-proativo.md`, § 3, "Onde entra", troque o item 1 por:

```markdown
1. **Migration nova** com a função `marketing_contact_extras(uuid[])`, que calcula os 15 campos por
   contato, e `marketing_contact_doc` juntando o resultado no doc (`||`). `marketing_contact_metrics`
   não muda: mudar a assinatura dela obrigaria a recriar o RFM, as descobertas e a matriz de
   perfis. `marketing_segment_fields()` ganha as 15 linhas novas (14 filtros; o aeroporto tem dois
   campos) e passa de `immutable` a `stable`, porque as opções de aeroporto são lidas do banco. Os
   grupos novos são "Viagem" e "Preferência".
```

- [ ] **Step 11: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' supabase/migrations/20261209100000_marketing_filtros_viagem.sql supabase/tests/marketing_filtros_viagem.test.sql docs/specs/assistente-marketing-proativo.md
git add supabase/migrations/20261209100000_marketing_filtros_viagem.sql supabase/tests/marketing_filtros_viagem.test.sql docs/specs/assistente-marketing-proativo.md
git commit -m "feat(marketing): 14 filtros novos de segmento no banco (viagem, abandono e preferência)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O `grep` não pode imprimir nada.

---

### Task 2: catálogo da tela, contrato e aeroportos no construtor

**Files:**
- Modify: `src/features/marketing/segmentBuilder.logic.ts`
- Modify: `src/features/marketing/segmentFields.contract.test.ts`
- Modify: `src/features/marketing/SegmentBuilder.tsx`
- Modify: `src/routes/manager/marketing-segments.tsx:271`
- Create: `src/features/marketing/SegmentBuilder.opcoes.test.tsx`
- Modify: `docs/specs/marketing-rfm.md` (lista de campos de contato; a `marketing-automation.md` manda registrar campo novo lá)

**Interfaces:**
- Consumes: as 15 chaves e os tipos da Task 1.
- Produces: `type FieldOption = { value: string; label: string }`, `comOpcoes(def: FieldDef | undefined, extras: Record<string, FieldOption[]>): FieldDef | undefined`, `OpcoesDoSegmento` (React context) e a prop `opcoes?: Record<string, FieldOption[]>` do `SegmentBuilder`.

- [ ] **Step 1: o contrato passa a ler a migration mais recente**

Em `src/features/marketing/segmentFields.contract.test.ts`, troque o import e a leitura do arquivo:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEGMENT_FIELDS } from "./segmentBuilder.logic";

/**
 * O catálogo de campos existe em dois lugares: SEGMENT_FIELDS (a tela) e marketing_segment_fields()
 * (o banco, que valida o segmento e responde à IA pelo MCP). Este contrato lê a migration MAIS
 * RECENTE que define a função e reprova se as chaves ou os tipos divergirem. Lia um arquivo fixo e,
 * quando o catálogo mudou em outra migration, passou a comparar com a versão velha.
 * Spec: docs/specs/marketing-mcp.md § 3 e assistente-marketing-proativo.md § 3.
 */
const pasta = `${process.cwd()}/supabase/migrations`;
const ultima = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => readFileSync(`${pasta}/${f}`, "utf8").includes("function public.marketing_segment_fields()"))
  .at(-1);
const sql = readFileSync(`${pasta}/${ultima}`, "utf8");
```

O resto do arquivo (`doBanco` e o `describe`) fica igual.

- [ ] **Step 2: ver o contrato falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing/segmentFields.contract.test.ts`
Expected: FAIL. O banco tem 15 chaves que a tela não tem.

- [ ] **Step 3: catálogo da tela**

Em `src/features/marketing/segmentBuilder.logic.ts`:

(a) troque o tipo `FieldDef` por:

```ts
export type FieldOption = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Onde o campo aparece agrupado na UI. */
  group: "Comportamento" | "Viagem" | "Valor" | "RFM" | "Growth" | "Veículo" | "Preferência" | "Contato";
  options?: FieldOption[];
  hint?: string;
};
```

(b) logo antes de `export const SEGMENT_FIELDS`, acrescente:

```ts
const TARIFAS: FieldOption[] = [
  { value: "basica", label: "Básica" },
  { value: "flex", label: "Flex" },
  { value: "superflex", label: "Superflex" },
];
```

(c) dentro de `SEGMENT_FIELDS`, logo depois do item `abandoned`, acrescente:

```ts
  {
    key: "abandoned_hours_ago",
    label: "Horas desde o abandono",
    kind: "number",
    group: "Comportamento",
    hint: "Último checkout vencido sem compra depois dele.",
  },
```

(d) logo depois do item `cancelled_count` (o último do grupo Comportamento), acrescente o grupo Viagem:

```ts
  {
    key: "days_since_return",
    label: "Dias desde a volta da viagem",
    kind: "number",
    group: "Viagem",
    hint: "Conta da saída do pátio na reserva paga mais recente. De 1 a 3 é a hora de chamar para a próxima.",
  },
  {
    key: "has_upcoming_trip",
    label: "Tem viagem marcada",
    kind: "boolean",
    group: "Viagem",
    hint: "Reserva paga com entrada no futuro.",
  },
  { key: "days_until_next_trip", label: "Dias até a próxima viagem", kind: "number", group: "Viagem" },
  {
    key: "next_trip_fare_tier",
    label: "Tarifa da próxima viagem",
    kind: "enum",
    group: "Viagem",
    options: TARIFAS,
    hint: "Quem vai na Básica pode trocar para a Flex antes de viajar.",
  },
  { key: "parked_now", label: "Está com o carro no pátio agora", kind: "boolean", group: "Viagem" },
```

(e) logo depois do item `last_ticket`, acrescente:

```ts
  { key: "abandoned_amount", label: "Valor do carrinho abandonado", kind: "money", group: "Valor" },
```

(f) logo depois do item `vehicle_color`, acrescente o grupo Preferência:

```ts
  {
    key: "destinations",
    label: "Aeroportos onde já estacionou",
    kind: "tags",
    group: "Preferência",
    hint: "As opções vêm do cadastro de destinos.",
  },
  {
    key: "last_destination",
    label: "Aeroporto da última viagem",
    kind: "enum",
    group: "Preferência",
    hint: "As opções vêm do cadastro de destinos.",
  },
  { key: "last_fare_tier", label: "Tarifa da última compra", kind: "enum", group: "Preferência", options: TARIFAS },
  {
    key: "first_channel",
    label: "Por onde comprou a primeira vez",
    kind: "enum",
    group: "Preferência",
    options: [
      { value: "site", label: "Site" },
      { value: "busca", label: "Busca do site" },
      { value: "pagina_destino", label: "Página do aeroporto" },
      { value: "mia_whatsapp", label: "Mia, no WhatsApp" },
    ],
  },
  {
    key: "first_traffic_source",
    label: "De onde veio o tráfego da primeira compra",
    kind: "text",
    group: "Preferência",
    hint: "A origem marcada no link da primeira compra, como pareseguro, chatgpt.com ou google.",
  },
  {
    key: "preferred_payment",
    label: "Forma de pagamento mais usada",
    kind: "enum",
    group: "Preferência",
    options: [
      { value: "pix", label: "PIX" },
      { value: "cartao", label: "Cartão" },
    ],
  },
  { key: "used_coupon", label: "Já usou cupom", kind: "boolean", group: "Preferência" },
  { key: "last_rating", label: "Nota da última avaliação", kind: "number", group: "Preferência", hint: "De 1 a 5." },
```

(g) logo depois de `export function fieldDef(...)`, acrescente:

```ts
/**
 * O campo com as opções que só se conhecem em tempo de execução (os aeroportos vêm do cadastro de
 * destinos). Sem opção extra para a chave, devolve o campo como está.
 */
export function comOpcoes(
  def: FieldDef | undefined,
  extras: Record<string, FieldOption[]>,
): FieldDef | undefined {
  if (!def) return def;
  const opcoes = extras[def.key];
  return opcoes && opcoes.length > 0 ? { ...def, options: opcoes } : def;
}
```

- [ ] **Step 4: ver o contrato passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing/segmentFields.contract.test.ts src/features/marketing/segmentBuilder.logic.test.ts`
Expected: PASS.

- [ ] **Step 5: escrever o teste das opções no construtor**

Crie `src/features/marketing/SegmentBuilder.opcoes.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentBuilder } from "./SegmentBuilder";
import { comOpcoes, fieldDef } from "./segmentBuilder.logic";

const AEROPORTOS = {
  destinations: [{ value: "guarulhos", label: "Guarulhos" }],
  last_destination: [{ value: "guarulhos", label: "Guarulhos" }],
};

describe("opções que vêm do banco", () => {
  it("comOpcoes troca as opções do campo e deixa os outros como estão", () => {
    expect(comOpcoes(fieldDef("last_destination"), AEROPORTOS)?.options).toEqual(AEROPORTOS.last_destination);
    expect(comOpcoes(fieldDef("bookings_count"), AEROPORTOS)?.options).toBeUndefined();
  });

  it("aeroporto da última viagem com 'está entre' mostra os aeroportos", () => {
    const onChange = vi.fn();
    render(
      <SegmentBuilder
        value={{ match: "all", rules: [{ field: "last_destination", op: "in", value: [] }] }}
        onChange={onChange}
        opcoes={AEROPORTOS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guarulhos" }));
    expect(onChange.mock.calls[0][0].rules[0].value).toEqual(["guarulhos"]);
  });

  it("aeroportos onde já estacionou vira escolha, não texto livre", () => {
    const onChange = vi.fn();
    render(
      <SegmentBuilder
        value={{ match: "all", rules: [{ field: "destinations", op: "contains", value: "" }] }}
        onChange={onChange}
        opcoes={AEROPORTOS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guarulhos" }));
    expect(onChange.mock.calls[0][0].rules[0].value).toBe("guarulhos");
  });
});
```

- [ ] **Step 6: ver o teste falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing/SegmentBuilder.opcoes.test.tsx`
Expected: os dois testes de render falham, porque o construtor não tem a prop `opcoes` e não acha o botão "Guarulhos".

- [ ] **Step 7: opções por contexto no construtor**

Em `src/features/marketing/SegmentBuilder.tsx`:

(a) no topo, acrescente `import * as React from "react";` e, no import de `./segmentBuilder.logic`, acrescente `comOpcoes` e `type FieldOption`.

(b) crie `src/features/marketing/opcoesDoSegmento.ts` com o contexto (num arquivo à parte, porque o lint reprova contexto exportado junto de componente) e importe-o no construtor:

```ts
import * as React from "react";
import type { FieldOption } from "./segmentBuilder.logic";

/** Opções que só se conhecem em tempo de execução, por chave de campo (os aeroportos). */
export const OpcoesDoSegmento = React.createContext<Record<string, FieldOption[]>>({});
```

(c) no tipo `Props`, acrescente:

```tsx
  /** Opções vindas do banco, por chave de campo. Só a raiz recebe; os grupos aninhados herdam. */
  opcoes?: Record<string, FieldOption[]>;
```

(d) na assinatura, troque `export function SegmentBuilder({ value, onChange, depth = 0 }: Props) {` por `export function SegmentBuilder({ value, onChange, depth = 0, opcoes }: Props) {`. Troque o `return (` do componente por `const arvore = (`. Logo depois do `);` que fecha esse JSX, acrescente:

```tsx
  return opcoes ? <OpcoesDoSegmento.Provider value={opcoes}>{arvore}</OpcoesDoSegmento.Provider> : arvore;
```

(e) em `CampoValor`, troque `const def = fieldDef(rule.field);` por:

```tsx
  const def = comOpcoes(fieldDef(rule.field), React.useContext(OpcoesDoSegmento));
```

(f) em `CampoValor`, logo antes de `if (def?.kind === "enum" && (rule.op === "in" || rule.op === "not_in")) {`, acrescente:

```tsx
  if (def?.kind === "tags" && def.options && def.options.length > 0) {
    const atual = String(rule.value ?? "");
    return (
      <div className="flex flex-wrap gap-1">
        {def.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={atual === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full border px-2 py-1 text-caption-sm transition-colors",
              atual === opt.value
                ? "border-primary bg-primary text-white"
                : "border-hairline bg-canvas text-muted hover:border-primary",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
```

- [ ] **Step 8: a página de segmentos passa os aeroportos**

Em `src/routes/manager/marketing-segments.tsx`:

(a) acrescente o import `import { useAdminDestinations } from "@/features/destinations/api";`.

(b) no componente que tem `const [definicao, setDefinicao] = React.useState<SegmentGroup>(` (perto da linha 207), logo depois desse `useState`, acrescente:

```tsx
  const { data: destinos } = useAdminDestinations();
  const opcoesDeAeroporto = React.useMemo(() => {
    const lista = (destinos ?? [])
      .filter((d) => d.slug)
      .map((d) => ({ value: String(d.slug), label: d.name }));
    return { destinations: lista, last_destination: lista };
  }, [destinos]);
```

(c) troque `<SegmentBuilder value={definicao} onChange={setDefinicao} />` por `<SegmentBuilder value={definicao} onChange={setDefinicao} opcoes={opcoesDeAeroporto} />`.

- [ ] **Step 9: ver tudo passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing && bun run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 10: a spec do RFM lista os campos**

A `marketing-automation.md` diz que campo novo de contato entra em `marketing-rfm.md`. Lá, antes de "## Segurança", acrescente a seção "Campos de viagem, abandono e preferência (27/11/2026)" com a tabela das 15 chaves (chave, grupo e o que é) e a nota de que `abandoned_hours_ago` mede o checkout que virou reserva e venceu.

- [ ] **Step 11: commit e envio da fase 1**

```bash
grep -nP '[\x{2014}\x{2013}]' src/features/marketing/segmentBuilder.logic.ts src/features/marketing/SegmentBuilder.tsx src/features/marketing/SegmentBuilder.opcoes.test.tsx src/features/marketing/segmentFields.contract.test.ts src/routes/manager/marketing-segments.tsx docs/specs/marketing-rfm.md
git add src/features/marketing/segmentBuilder.logic.ts src/features/marketing/SegmentBuilder.tsx src/features/marketing/SegmentBuilder.opcoes.test.tsx src/features/marketing/segmentFields.contract.test.ts src/routes/manager/marketing-segments.tsx docs/specs/marketing-rfm.md
git commit -m "feat(marketing): filtros novos no construtor de segmento, com os aeroportos do cadastro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase origin main && git push origin main
```

Se o `pull --rebase` recusar por arquivo aberto de outra sessão, envie por uma cópia separada: `git worktree add --detach /tmp/wt-mkt origin/main`, `cherry-pick` dos seus commits lá dentro, `git push origin HEAD:main` e `git worktree remove /tmp/wt-mkt`.

---

# Fase 2: ferramentas novas e painéis

### Task 3: leituras agregadas no banco

**Files:**
- Create: `supabase/migrations/20261209110000_marketing_assistente_leituras.sql`
- Create: `supabase/tests/marketing_assistente_leituras.test.sql`

**Interfaces:**
- Consumes: as chaves do doc da Task 1.
- Produces (todas `jsonb`, travadas por `marketing_can_manage()`, executáveis só por `service_role`):
  - `marketing_segment_summaries(p_items jsonb, p_location_ids uuid[] default null)`: recebe `[{chave, definition}]` e devolve `[{chave, publico, alcance_email, ticket_medio}]` na mesma ordem.
  - `marketing_breakdown(p_dimension text, p_definition jsonb default null, p_location_ids uuid[] default null)`: devolve `{dimensao, total, itens: [{valor, rotulo, pessoas, percentual}]}`.
  - `marketing_trend(p_granularity text default 'semana', p_from timestamptz default null, p_to timestamptz default null, p_location_ids uuid[] default null)`: devolve `{granularidade, serie: [{periodo, compras, abandonos, receita}]}`, com no máximo 20 períodos.
  - `marketing_campaign_result(p_campaign_id uuid, p_window_days integer default 30)`: devolve `{campanha, janela_dias, executada, matriculados, mensagens_enviadas, janela_completa, antes: {reservas, receita}, depois: {reservas, receita}, aviso}`.

- [ ] **Step 1: escrever o teste pgTAP**

Crie `supabase/tests/marketing_assistente_leituras.test.sql`:

```sql
-- pgTAP: leituras agregadas do assistente de marketing (oportunidades, distribuição, tendência e
-- resultado de campanha). Migration 20261209110000_marketing_assistente_leituras.
-- Spec: docs/specs/assistente-marketing-proativo.md § 4.
--   node scripts/pgtap-vivo.mjs supabase/tests/marketing_assistente_leituras.test.sql

begin;
select plan(14);

-- As leituras travam em marketing_can_manage(). A Edge chama com a chave de serviço, e é assim que
-- o teste se apresenta (mesmo recurso do marketing_mcp_base.test.sql).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table la_ctx (loc uuid);
insert into la_ctx
  select l.id from public.location l
  join public.destination d on d.id = l.destination_id
  where l.deleted_at is null and d.slug is not null
  order by l.created_at limit 1;

create temp table la_perfil (email text primary key, uid uuid);

do $$
declare
  v_email text;
  v_uid uuid;
begin
  foreach v_email in array array['la-a@ex.com', 'la-b@ex.com', 'la-c@ex.com'] loop
    v_uid := gen_random_uuid();
    insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
      values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              v_email, now(), now());
    insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;
    insert into la_perfil values (v_email, v_uid);
  end loop;
end $$;

-- A: duas compras (uma antes e uma depois da entrada na campanha), total de R$ 301,48, Flex.
-- B: uma compra de R$ 457,93, Básica. C: só um checkout que venceu. Os valores quebrados são para
-- nenhum cliente real da unidade cair nos segmentos por total gasto.
insert into public.booking (code, profile_id, location_id, customer_email, status, total_amount,
                            created_at, check_in_at, check_out_at, fare_tier, origin)
select v.code, p.uid, (select loc from la_ctx), v.email, v.status::public.booking_status, v.total,
       now() + v.criada, now() + v.criada + interval '1 day', now() + v.criada + interval '4 days',
       v.tarifa::public.fare_tier, 'hub_direct'
from (values
  ('MP-LA-1', 'la-a@ex.com', 'completed', 101.37, interval '-20 days', 'flex'),
  ('MP-LA-2', 'la-a@ex.com', 'completed', 200.11, interval '-5 days', 'flex'),
  ('MP-LA-3', 'la-b@ex.com', 'completed', 457.93, interval '-10 days', 'basica'),
  ('MP-LA-4', 'la-c@ex.com', 'pending', 190, interval '-2 days', 'basica')
) as v(code, email, status, total, criada, tarifa)
join la_perfil p on p.email = v.email;

update public.booking set status = 'expired' where code = 'MP-LA-4';

-- Campanha com A matriculada há 10 dias e uma mensagem enviada.
insert into public.marketing_contact (contact_key, display_name, marketing_email)
values ('la-a@ex.com', 'Contato A', 'la-a@ex.com') on conflict do nothing;
insert into public.marketing_campaign (name, slug) values ('LA teste', 'la-teste');
insert into public.marketing_enrollment (campaign_id, contact_id, entered_at)
select c.id, mc.id, now() - interval '10 days'
from public.marketing_campaign c, public.marketing_contact mc
where c.slug = 'la-teste' and mc.contact_key = 'la-a@ex.com';
insert into public.marketing_message (campaign_id, contact_id, channel, status, sent_at)
select c.id, mc.id, 'email', 'sent', now() - interval '10 days'
from public.marketing_campaign c, public.marketing_contact mc
where c.slug = 'la-teste' and mc.contact_key = 'la-a@ex.com';

-- ── Resumo de vários segmentos de uma vez ──────────────────────────────────
create temp table la_resumo as
select t.x, t.ord from jsonb_array_elements(public.marketing_segment_summaries(
  '[{"chave":"compradores","definition":{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":1}]}},
    {"chave":"ninguem","definition":{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":999}]}}]'::jsonb,
  (select array[loc] from la_ctx))) with ordinality as t(x, ord);

select is((select x ->> 'chave' from la_resumo where ord = 1), 'compradores', 'o resumo mantém a ordem pedida');
select ok((select (x ->> 'publico')::int >= 2 from la_resumo where x ->> 'chave' = 'compradores'),
          'o resumo conta quem casa');
select is((select (x ->> 'publico')::int from la_resumo where x ->> 'chave' = 'ninguem'), 0,
          'segmento sem ninguém dá zero, não some');

-- ── Distribuição ───────────────────────────────────────────────────────────
select is((public.marketing_breakdown('tarifa',
            '{"match":"any","rules":[{"field":"total_spent","op":"eq","value":301.48},{"field":"total_spent","op":"eq","value":457.93}]}'::jsonb,
            (select array[loc] from la_ctx)) ->> 'total')::int,
          2, 'a distribuição respeita o segmento');
select is((select i ->> 'rotulo' from jsonb_array_elements(public.marketing_breakdown('tarifa',
            '{"match":"all","rules":[{"field":"total_spent","op":"eq","value":457.93}]}'::jsonb,
            (select array[loc] from la_ctx)) -> 'itens') i),
          'Básica', 'o rótulo da tarifa sai em português');
select is((select i ->> 'valor' from jsonb_array_elements(public.marketing_breakdown('faixa_ticket',
            '{"match":"all","rules":[{"field":"total_spent","op":"eq","value":457.93}]}'::jsonb,
            (select array[loc] from la_ctx)) -> 'itens') i),
          'acima_400', 'faixa de ticket acima de R$ 400');
select throws_ok($$ select public.marketing_breakdown('signo', null, null) $$, 'P0001', null,
                 'dimensão desconhecida é recusada com mensagem');

-- ── Tendência ──────────────────────────────────────────────────────────────
select is(jsonb_array_length(public.marketing_trend('dia', now() - interval '60 days', now(),
            (select array[loc] from la_ctx)) -> 'serie'),
          20, 'a série nunca passa de 20 períodos');
select ok((select sum((p ->> 'abandonos')::int) >= 1
           from jsonb_array_elements(public.marketing_trend('semana', null, null,
                  (select array[loc] from la_ctx)) -> 'serie') p),
          'a tendência conta o checkout vencido como abandono');

-- ── Resultado de campanha ──────────────────────────────────────────────────
select is((public.marketing_campaign_result(
            (select id from public.marketing_campaign where slug = 'la-teste'), 30) -> 'antes' ->> 'reservas')::int,
          1, 'reservas pagas nos 30 dias antes da entrada');
select is((public.marketing_campaign_result(
            (select id from public.marketing_campaign where slug = 'la-teste'), 30) -> 'depois' ->> 'reservas')::int,
          1, 'reservas pagas nos 30 dias depois da entrada');
select is((public.marketing_campaign_result(
            (select id from public.marketing_campaign where slug = 'la-teste'), 30) ->> 'mensagens_enviadas')::int,
          1, 'mensagens enviadas da campanha');

-- ── Acesso ─────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.marketing_breakdown(text, jsonb, uuid[])', 'execute'),
          'cliente logado não executa a distribuição');
select ok(not has_function_privilege('anon', 'public.marketing_campaign_result(uuid, integer)', 'execute'),
          'anônimo não executa o resultado de campanha');

select * from finish();
rollback;
```

- [ ] **Step 2: ver o teste falhar**

Run: `node scripts/pgtap-vivo.mjs supabase/tests/marketing_assistente_leituras.test.sql supabase/migrations/20261209100000_marketing_filtros_viagem.sql`
Expected: falha por função inexistente (`marketing_segment_summaries`). O segundo argumento só é necessário se a Task 1 ainda não foi aplicada em produção.

- [ ] **Step 3: escrever a migration**

Crie `supabase/migrations/20261209110000_marketing_assistente_leituras.sql`:

```sql
-- Leituras agregadas do assistente de marketing: resumo de vários segmentos, distribuição,
-- tendência e resultado de campanha. Spec: docs/specs/assistente-marketing-proativo.md § 4.
--
-- Todas devolvem número agregado, nunca nome, e-mail nem telefone. A trava é a comum do marketing
-- (hub_admin logado ou a chave de serviço que o MCP usa), e só service_role executa: a Edge é o
-- único caminho até elas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Resumo de vários segmentos numa passada só
--
-- As oportunidades medem 4 ou 5 segmentos de uma vez. Calcular o doc uma vez e avaliar todos sai
-- bem mais barato que um preview por segmento. O alcance por e-mail tem a mesma regra do preview.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_segment_summaries(
  p_items jsonb,
  p_location_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v jsonb;
begin
  if not public.marketing_can_manage() then
    raise exception 'Sem permissão para o resumo de segmentos.' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Mande a lista de segmentos.' using errcode = 'P0001';
  end if;

  with docs as materialized (
    select d.doc from public.marketing_contact_doc(p_location_ids) d
  ),
  itens as (
    select t.i ->> 'chave' as chave, t.i -> 'definition' as def, t.ord
    from jsonb_array_elements(p_items) with ordinality as t(i, ord)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', it.chave,
           'publico', s.publico,
           'alcance_email', s.alcance_email,
           'ticket_medio', s.ticket_medio
         ) order by it.ord), '[]'::jsonb)
    into v
  from itens it
  cross join lateral (
    select
      count(*)::int as publico,
      count(*) filter (
        where (dc.doc ->> 'email') is not null
          and (dc.doc ->> 'email') <> ''
          and (dc.doc ->> 'unsubscribed')::boolean is not true
          and (dc.doc ->> 'email_consent')::boolean is not false
      )::int as alcance_email,
      round(avg((dc.doc ->> 'avg_ticket')::numeric)
            filter (where coalesce((dc.doc ->> 'bookings_count')::int, 0) > 0), 2) as ticket_medio
    from docs dc
    where public.marketing_eval_definition(dc.doc, coalesce(it.def, '{}'::jsonb))
  ) s;

  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Distribuição por dimensão
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_breakdown_rotulo(p_dimension text, p_valor text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_valor is null then 'Sem dado'
    when p_dimension = 'aeroporto' then
      coalesce((select d.name from public.destination d where d.slug = p_valor limit 1), p_valor)
    when p_dimension = 'tarifa' then case p_valor
      when 'basica' then 'Básica' when 'flex' then 'Flex' when 'superflex' then 'Superflex' else p_valor end
    when p_dimension = 'canal' then case p_valor
      when 'site' then 'Site' when 'busca' then 'Busca do site'
      when 'pagina_destino' then 'Página do aeroporto' when 'mia_whatsapp' then 'Mia, no WhatsApp'
      else p_valor end
    when p_dimension = 'pagamento' then case p_valor
      when 'pix' then 'PIX' when 'cartao' then 'Cartão' else p_valor end
    when p_dimension = 'faixa_ticket' then case p_valor
      when 'ate_100' then 'Até R$ 100' when '100_200' then 'De R$ 100 a R$ 200'
      when '200_400' then 'De R$ 200 a R$ 400' when 'acima_400' then 'Acima de R$ 400' else p_valor end
    when p_dimension = 'dia_semana_entrada' and p_valor ~ '^[0-6]$' then
      (array['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'])[p_valor::int + 1]
    else p_valor
  end;
$$;

create or replace function public.marketing_breakdown(
  p_dimension text,
  p_definition jsonb default null,
  p_location_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v jsonb;
begin
  if not public.marketing_can_manage() then
    raise exception 'Sem permissão para a distribuição.' using errcode = '42501';
  end if;
  if p_dimension is null or p_dimension not in
     ('aeroporto', 'tarifa', 'canal', 'origem_trafego', 'pagamento', 'faixa_ticket', 'dia_semana_entrada') then
    raise exception 'Dimensão desconhecida: "%". Use aeroporto, tarifa, canal, origem_trafego, pagamento, faixa_ticket ou dia_semana_entrada.',
      coalesce(p_dimension, '') using errcode = 'P0001';
  end if;

  with base as (
    select d.doc
    from public.marketing_contact_doc(p_location_ids) d
    where case when p_definition is null
      then coalesce((d.doc ->> 'bookings_count')::int, 0) >= 1
      else public.marketing_eval_definition(d.doc, p_definition) end
  ),
  valores as (
    select case p_dimension
      when 'aeroporto' then b.doc ->> 'last_destination'
      when 'tarifa' then b.doc ->> 'last_fare_tier'
      when 'canal' then b.doc ->> 'first_channel'
      when 'origem_trafego' then b.doc ->> 'first_traffic_source'
      when 'pagamento' then b.doc ->> 'preferred_payment'
      when 'faixa_ticket' then case
        when coalesce((b.doc ->> 'avg_ticket')::numeric, 0) <= 0 then null
        when (b.doc ->> 'avg_ticket')::numeric < 100 then 'ate_100'
        when (b.doc ->> 'avg_ticket')::numeric < 200 then '100_200'
        when (b.doc ->> 'avg_ticket')::numeric < 400 then '200_400'
        else 'acima_400' end
      when 'dia_semana_entrada' then b.doc ->> 'top_dow'
    end as valor
    from base b
  ),
  contagem as (select valor, count(*)::int as pessoas from valores group by valor),
  total as (select count(*)::int as n from base)
  select jsonb_build_object(
    'dimensao', p_dimension,
    'total', (select n from total),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'valor', coalesce(c.valor, 'sem_dado'),
               'rotulo', public.marketing_breakdown_rotulo(p_dimension, c.valor),
               'pessoas', c.pessoas,
               'percentual', round(100.0 * c.pessoas / nullif((select n from total), 0), 1)
             ) order by c.pessoas desc, c.valor)
      from contagem c), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tendência: compras, abandonos e receita por dia ou semana, no fuso de Brasília
--
-- No máximo 20 períodos: a resposta passa pelo corte de listas do beast-bots, que guarda 20 itens.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_trend(
  p_granularity text default 'semana',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_location_ids uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_dia boolean := (p_granularity = 'dia');
  v_unidade text := case when p_granularity = 'dia' then 'day' else 'week' end;
  v_passo interval := case when p_granularity = 'dia' then interval '1 day' else interval '1 week' end;
  v_ate timestamp;
  v_de timestamp;
  v jsonb;
begin
  if not public.marketing_can_manage() then
    raise exception 'Sem permissão para a tendência.' using errcode = '42501';
  end if;
  if p_granularity is not null and p_granularity not in ('dia', 'semana') then
    raise exception 'Granularidade é "dia" ou "semana".' using errcode = 'P0001';
  end if;

  v_ate := date_trunc(v_unidade, coalesce(p_to, now()) at time zone 'America/Sao_Paulo');
  v_de := date_trunc(v_unidade,
            coalesce(p_from, now() - case when v_dia then interval '13 days' else interval '11 weeks' end)
            at time zone 'America/Sao_Paulo');
  if v_de > v_ate then
    raise exception '"from" precisa ser antes de "to".' using errcode = 'P0001';
  end if;
  if v_de < v_ate - v_passo * 19 then
    v_de := v_ate - v_passo * 19;
  end if;

  with periodos as (
    select generate_series(v_de, v_ate, v_passo) as inicio
  ),
  fatos as (
    select date_trunc(v_unidade, f.created_at at time zone 'America/Sao_Paulo') as inicio,
           count(*) filter (where f.is_purchase)::int as compras,
           count(*) filter (where f.status = 'expired')::int as abandonos,
           coalesce(sum(f.total_amount) filter (where f.is_purchase), 0) as receita
    from public.marketing_booking_fact f
    where (p_location_ids is null or f.location_id = any(p_location_ids))
      and f.created_at >= (v_de at time zone 'America/Sao_Paulo')
      and f.created_at < ((v_ate + v_passo) at time zone 'America/Sao_Paulo')
    group by 1
  )
  select jsonb_build_object(
    'granularidade', case when v_dia then 'dia' else 'semana' end,
    'serie', coalesce(jsonb_agg(jsonb_build_object(
               'periodo', to_char(p.inicio, 'YYYY-MM-DD'),
               'compras', coalesce(fa.compras, 0),
               'abandonos', coalesce(fa.abandonos, 0),
               'receita', coalesce(fa.receita, 0)
             ) order by p.inicio), '[]'::jsonb)
  ) into v
  from periodos p
  left join fatos fa on fa.inicio = p.inicio;

  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Resultado de campanha: reservas pagas de quem entrou, N dias depois contra N dias antes
--
-- Sem grupo de controle, é comparação, não prova, e a resposta diz isso.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_campaign_result(
  p_campaign_id uuid,
  p_window_days integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_janela int := greatest(1, least(coalesce(p_window_days, 30), 180));
  v_nome text;
  v jsonb;
begin
  if not public.marketing_can_manage() then
    raise exception 'Sem permissão para o resultado da campanha.' using errcode = '42501';
  end if;
  select c.name into v_nome
  from public.marketing_campaign c
  where c.id = p_campaign_id and c.deleted_at is null;
  if v_nome is null then
    raise exception 'Campanha não encontrada.' using errcode = 'P0001';
  end if;

  with entradas as (
    select e.entered_at, mc.contact_key
    from public.marketing_enrollment e
    join public.marketing_contact mc on mc.id = e.contact_id
    where e.campaign_id = p_campaign_id and e.entered_at is not null
  ),
  antes as (
    select count(f.booking_id)::int as reservas, coalesce(sum(f.total_amount), 0) as receita
    from entradas en
    join public.marketing_booking_fact f
      on f.contact_key = en.contact_key and f.is_purchase
     and f.created_at >= en.entered_at - make_interval(days => v_janela)
     and f.created_at < en.entered_at
  ),
  depois as (
    select count(f.booking_id)::int as reservas, coalesce(sum(f.total_amount), 0) as receita
    from entradas en
    join public.marketing_booking_fact f
      on f.contact_key = en.contact_key and f.is_purchase
     and f.created_at >= en.entered_at
     and f.created_at < en.entered_at + make_interval(days => v_janela)
  )
  select jsonb_build_object(
    'campanha', v_nome,
    'janela_dias', v_janela,
    'executada', exists (select 1 from entradas),
    'matriculados', (select count(*) from entradas)::int,
    'mensagens_enviadas', (select count(*) from public.marketing_message m
                           where m.campaign_id = p_campaign_id and m.status = 'sent')::int,
    'janela_completa', coalesce((select max(entered_at) from entradas) + make_interval(days => v_janela) <= now(), false),
    'antes', (select jsonb_build_object('reservas', a.reservas, 'receita', a.receita) from antes a),
    'depois', (select jsonb_build_object('reservas', d.reservas, 'receita', d.receita) from depois d),
    'aviso', 'Comparação, não prova: a ferramenta não tem grupo de controle.'
  ) into v;

  return v;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Acesso: só a chave de serviço (a Edge)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.marketing_segment_summaries(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.marketing_breakdown_rotulo(text, text) from public, anon, authenticated;
revoke all on function public.marketing_breakdown(text, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.marketing_trend(text, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.marketing_campaign_result(uuid, integer) from public, anon, authenticated;
grant execute on function public.marketing_segment_summaries(jsonb, uuid[]) to service_role;
grant execute on function public.marketing_breakdown_rotulo(text, text) to service_role;
grant execute on function public.marketing_breakdown(text, jsonb, uuid[]) to service_role;
grant execute on function public.marketing_trend(text, timestamptz, timestamptz, uuid[]) to service_role;
grant execute on function public.marketing_campaign_result(uuid, integer) to service_role;
```

- [ ] **Step 4: ver o teste passar com a migration**

Run: `node scripts/pgtap-vivo.mjs supabase/tests/marketing_assistente_leituras.test.sql supabase/migrations/20261209110000_marketing_assistente_leituras.sql`
Expected: 14 de 14. Falha com `42501` quer dizer que o `set_config` do topo do teste não pegou.

- [ ] **Step 5: aplicar em produção e conferir**

Use `apply_migration` (`name` `marketing_assistente_leituras`, conteúdo inteiro do arquivo). Depois rode `node scripts/pgtap-vivo.mjs supabase/tests/marketing_assistente_leituras.test.sql`.
Expected: 14 de 14.

- [ ] **Step 6: advisors de segurança**

Use `get_advisors` (tipo `security`).
Expected: nenhum achado novo sobre as 5 funções.

- [ ] **Step 7: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' supabase/migrations/20261209110000_marketing_assistente_leituras.sql supabase/tests/marketing_assistente_leituras.test.sql
git add supabase/migrations/20261209110000_marketing_assistente_leituras.sql supabase/tests/marketing_assistente_leituras.test.sql
git commit -m "feat(marketing): leituras agregadas para o assistente (resumo, distribuição, tendência e resultado)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: calendário e oportunidades em código

**Files:**
- Create: `supabase/functions/_shared/marketing/calendario.ts`
- Create: `supabase/functions/_shared/marketing/calendario.test.ts`
- Create: `supabase/functions/_shared/marketing/oportunidades.ts`
- Create: `supabase/functions/_shared/marketing/oportunidades.test.ts`

**Interfaces:**
- Consumes: a RPC `marketing_segment_summaries` da Task 3 (pelo parâmetro `rpc`).
- Produces:
  - `pascoa(ano: number): string`, `hojeEmBrasilia(agora?: Date): string`, `calendario(hoje: string, dias?: number): DataDoCalendario[]`, `type DataDoCalendario = { nome; data; tipo: "feriado" | "ferias"; aproximada; janela_de; janela_ate; abre_em_dias }`.
  - `jogadasDeHoje(hoje: string): Jogada[]`, `oportunidadesDeHoje(rpc: Rpc, locationIds: string[] | null, hoje: string): Promise<{ data: string; oportunidades: Oportunidade[] }>`, `type Oportunidade = { chave; titulo; por_que; publico; alcance_email; ticket_medio; definition; pedido }`.

- [ ] **Step 1: teste do calendário**

Crie `supabase/functions/_shared/marketing/calendario.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { calendario, hojeEmBrasilia, pascoa } from "./calendario.ts";

Deno.test("Páscoa de 2026 e 2027", () => {
  assertEquals(pascoa(2026), "2026-04-05");
  assertEquals(pascoa(2027), "2027-03-28");
});

Deno.test("feriados móveis de 2026 e 2027 batem com o calendário oficial", () => {
  const datas = calendario("2026-01-01", 366).concat(calendario("2027-01-01", 366));
  const em = (nome: string, ano: string) => datas.find((d) => d.nome === nome && d.data.startsWith(ano))?.data;
  assertEquals(em("Carnaval", "2026"), "2026-02-17");
  assertEquals(em("Corpus Christi", "2026"), "2026-06-04");
  assertEquals(em("Carnaval", "2027"), "2027-02-09");
  assertEquals(em("Sexta-feira Santa", "2027"), "2027-03-26");
  assertEquals(em("Corpus Christi", "2027"), "2027-05-27");
});

Deno.test("de 27/11/2026, os próximos 90 dias em ordem", () => {
  assertEquals(calendario("2026-11-27", 90).map((d) => d.nome), [
    "Férias de fim de ano",
    "Natal",
    "Ano Novo",
    "Carnaval",
  ]);
});

Deno.test("a janela do Natal vai de 7 a 3 dias antes", () => {
  const natal = calendario("2026-11-27", 90).find((d) => d.nome === "Natal")!;
  assertEquals([natal.janela_de, natal.janela_ate, natal.abre_em_dias], ["2026-12-18", "2026-12-22", 21]);
});

Deno.test("hoje é o dia de Brasília, não o de UTC", () => {
  assertEquals(hojeEmBrasilia(new Date("2026-11-28T02:30:00Z")), "2026-11-27");
});
```

- [ ] **Step 2: ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/calendario.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: o calendário**

Crie `supabase/functions/_shared/marketing/calendario.ts`:

```ts
// Datas de marketing: feriados nacionais e férias escolares, calculados, sem lista para manter.
// Os móveis saem da Páscoa (Carnaval, Sexta-feira Santa e Corpus Christi). As férias são data
// aproximada, porque o calendário escolar muda de estado para estado.
// A janela de envio vai de 7 a 3 dias antes, porque o cliente reserva em cima da hora (53% até
// 2 dias antes, medido em 26/11/2026). Spec: docs/specs/assistente-marketing-proativo.md § 4.

export type DataDoCalendario = {
  nome: string;
  /** AAAA-MM-DD */
  data: string;
  tipo: "feriado" | "ferias";
  aproximada: boolean;
  janela_de: string;
  janela_ate: string;
  /** Em quantos dias a janela abre. Zero é hoje, negativo é que já abriu. */
  abre_em_dias: number;
};

type Data = Omit<DataDoCalendario, "janela_de" | "janela_ate" | "abre_em_dias">;

const DIA = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (ano: number, mes: number, dia: number) => Date.UTC(ano, mes - 1, dia);

/** Domingo de Páscoa (algoritmo de Meeus, Jones e Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(ano, mes, dia));
}

function datasDoAno(ano: number): Data[] {
  const p = Date.parse(pascoa(ano));
  const fixo = (mes: number, dia: number, nome: string): Data => ({
    nome,
    data: iso(utc(ano, mes, dia)),
    tipo: "feriado",
    aproximada: false,
  });
  const movel = (dias: number, nome: string): Data => ({
    nome,
    data: iso(p + dias * DIA),
    tipo: "feriado",
    aproximada: false,
  });
  const ferias = (mes: number, dia: number, nome: string): Data => ({
    nome,
    data: iso(utc(ano, mes, dia)),
    tipo: "ferias",
    aproximada: true,
  });
  return [
    fixo(1, 1, "Ano Novo"),
    movel(-47, "Carnaval"),
    movel(-2, "Sexta-feira Santa"),
    fixo(4, 21, "Tiradentes"),
    fixo(5, 1, "Dia do Trabalho"),
    movel(60, "Corpus Christi"),
    ferias(7, 1, "Férias de julho"),
    fixo(9, 7, "Independência"),
    fixo(10, 12, "Nossa Senhora Aparecida"),
    fixo(11, 2, "Finados"),
    fixo(11, 15, "Proclamação da República"),
    fixo(11, 20, "Consciência Negra"),
    ferias(12, 15, "Férias de fim de ano"),
    fixo(12, 25, "Natal"),
  ];
}

/** Hoje em Brasília, como AAAA-MM-DD. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** As datas de `hoje` até `dias` à frente (de 1 a 366), em ordem, cada uma com a janela de envio. */
export function calendario(hoje: string, dias = 90): DataDoCalendario[] {
  const h = Date.parse(hoje);
  const limite = h + Math.max(1, Math.min(dias, 366)) * DIA;
  const ano = new Date(h).getUTCFullYear();
  return [...datasDoAno(ano), ...datasDoAno(ano + 1)]
    .filter((x) => Date.parse(x.data) >= h && Date.parse(x.data) <= limite)
    .map((x) => {
      const t = Date.parse(x.data);
      return {
        ...x,
        janela_de: iso(t - 7 * DIA),
        janela_ate: iso(t - 3 * DIA),
        abre_em_dias: Math.round((t - 7 * DIA - h) / DIA),
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}
```

- [ ] **Step 4: ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/calendario.test.ts`
Expected: 5 passed.

- [ ] **Step 5: teste das oportunidades**

Crie `supabase/functions/_shared/marketing/oportunidades.test.ts`:

```ts
import { assert, assertEquals } from "jsr:@std/assert";
import { jogadasDeHoje, oportunidadesDeHoje } from "./oportunidades.ts";

Deno.test("em 27/11/2026 não há feriado com janela abrindo em 14 dias", () => {
  assertEquals(jogadasDeHoje("2026-11-27").map((j) => j.chave), [
    "abandono_recente",
    "segunda_compra",
    "troca_flex",
    "indicacao",
  ]);
});

Deno.test("em 14/12/2026 o feriado da vez é o Natal", () => {
  const feriado = jogadasDeHoje("2026-12-14").find((j) => j.chave === "feriado")!;
  assertEquals(feriado.titulo, "Natal em 25/12");
  assert(feriado.porQue.includes("18/12 a 22/12"));
});

Deno.test("toda regra das jogadas usa campo do catálogo do banco", () => {
  const pasta = new URL("../../../migrations/", import.meta.url);
  const arquivos = [...Deno.readDirSync(pasta)].map((f) => f.name).filter((n) => n.endsWith(".sql")).sort();
  const ultima = arquivos
    .filter((n) => Deno.readTextFileSync(new URL(n, pasta)).includes("function public.marketing_segment_fields()"))
    .at(-1)!;
  const sql = Deno.readTextFileSync(new URL(ultima, pasta));
  const doBanco = new Set([...sql.matchAll(/\('([a-z_0-9]+)', '(number|money|text|enum|boolean|tags)'/g)].map((m) => m[1]));
  for (const j of jogadasDeHoje("2026-12-14")) {
    for (const r of j.definition.rules) assert(doBanco.has(String(r.field)), `${j.chave}: campo ${r.field}`);
  }
});

Deno.test("a montagem tira a jogada sem público, mantém a ordem e repassa as unidades", async () => {
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return Promise.resolve([
      { chave: "abandono_recente", publico: 5, alcance_email: 4, ticket_medio: 190.83 },
      { chave: "segunda_compra", publico: 0, alcance_email: 0, ticket_medio: null },
      { chave: "troca_flex", publico: 6, alcance_email: 6, ticket_medio: 150 },
      { chave: "indicacao", publico: 7, alcance_email: 7, ticket_medio: 180 },
    ]);
  };
  const r = await oportunidadesDeHoje(rpc, ["l-1"], "2026-11-27");
  assertEquals(r.oportunidades.map((o) => o.chave), ["abandono_recente", "troca_flex", "indicacao"]);
  assertEquals(chamadas[0].fn, "marketing_segment_summaries");
  assertEquals(chamadas[0].args.p_location_ids, ["l-1"]);
  assertEquals(r.oportunidades[0].pedido, "Quero recuperar quem abandonou o checkout nas últimas 24 horas");
  assert(!JSON.stringify(r).includes("@"), "nenhum e-mail na saída");
});
```

- [ ] **Step 6: ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/oportunidades.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 7: as oportunidades**

Crie `supabase/functions/_shared/marketing/oportunidades.ts`:

```ts
// Oportunidades de hoje: as jogadas do manual do agente, cada uma com o segmento pronto e o público
// medido agora. O segmento do cartão é o mesmo que o botão "Montar esse público" monta, então o
// número do cartão e o da prévia são a mesma conta (marketing_segment_summaries usa o mesmo
// avaliador do preview). Spec: docs/specs/assistente-marketing-proativo.md § 4.
//
// O cartão mostra público e ticket médio, nunca receita esperada: prometer resultado é proibido.

import { calendario } from "./calendario.ts";

type Regra = { field: string; op: string; value?: unknown };
export type Definicao = { match: "all" | "any"; rules: Regra[] };

export type Jogada = {
  chave: string;
  titulo: string;
  porQue: string;
  pedido: string;
  definition: Definicao;
};

export type Oportunidade = {
  chave: string;
  titulo: string;
  por_que: string;
  publico: number;
  alcance_email: number;
  ticket_medio: number | null;
  definition: Definicao;
  pedido: string;
};

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const FIXAS: Jogada[] = [
  {
    chave: "abandono_recente",
    titulo: "Abandonou o checkout nas últimas 24 horas",
    porQue: "Começou a reserva e não pagou. Quem volta sozinho volta em poucas horas, então o contato vale hoje.",
    pedido: "Quero recuperar quem abandonou o checkout nas últimas 24 horas",
    definition: { match: "all", rules: [{ field: "abandoned_hours_ago", op: "lte", value: 24 }] },
  },
  {
    chave: "segunda_compra",
    titulo: "Voltou de viagem nos últimos 3 dias",
    porQue: "Fez a primeira viagem com a Movepark e ainda não marcou a próxima. A experiência está fresca.",
    pedido: "Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias",
    definition: {
      match: "all",
      rules: [
        { field: "bookings_count", op: "eq", value: 1 },
        { field: "days_since_return", op: "between", value: [1, 3] },
        { field: "has_upcoming_trip", op: "is_false" },
      ],
    },
  },
  {
    chave: "troca_flex",
    titulo: "Viaja nesta semana na tarifa Básica",
    porQue: "Viaja nos próximos 7 dias na Básica. Dá para oferecer a troca para a Flex antes da entrada.",
    pedido: "Quero oferecer a troca para a Flex a quem viaja nesta semana na Básica",
    definition: {
      match: "all",
      rules: [
        { field: "days_until_next_trip", op: "lte", value: 7 },
        { field: "next_trip_fare_tier", op: "eq", value: "basica" },
      ],
    },
  },
];

const INDICACAO: Jogada = {
  chave: "indicacao",
  titulo: "Deu nota 5 na última avaliação",
  porQue: "Avaliou a estadia com nota máxima. É o público para pedir indicação.",
  pedido: "Quero pedir indicação a quem deu nota 5",
  definition: { match: "all", rules: [{ field: "last_rating", op: "eq", value: 5 }] },
};

/** A data do calendário cuja janela de envio está aberta ou abre em até 14 dias, se houver. */
function jogadaDoFeriado(hoje: string): Jogada | null {
  const d = calendario(hoje, 60).find((x) => x.janela_ate >= hoje && x.abre_em_dias <= 14);
  if (!d) return null;
  return {
    chave: "feriado",
    titulo: `${d.nome} em ${ddmm(d.data)}`,
    porQue: `A janela de envio vai de ${ddmm(d.janela_de)} a ${ddmm(d.janela_ate)}. Público: quem já comprou e não tem viagem marcada.`,
    pedido: `Quero montar a campanha de ${d.nome} para quem já comprou e não tem viagem marcada`,
    definition: {
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 1 },
        { field: "has_upcoming_trip", op: "is_false" },
      ],
    },
  };
}

/** As jogadas de hoje, na ordem do dinheiro mais perto para o mais longe. */
export function jogadasDeHoje(hoje: string): Jogada[] {
  const feriado = jogadaDoFeriado(hoje);
  return [...FIXAS, ...(feriado ? [feriado] : []), INDICACAO];
}

type Resumo = { chave: string; publico: number; alcance_email: number; ticket_medio: number | null };

export async function oportunidadesDeHoje(
  rpc: Rpc,
  locationIds: string[] | null,
  hoje: string,
): Promise<{ data: string; oportunidades: Oportunidade[] }> {
  const jogadas = jogadasDeHoje(hoje);
  const resumos = ((await rpc("marketing_segment_summaries", {
    p_items: jogadas.map((j) => ({ chave: j.chave, definition: j.definition })),
    p_location_ids: locationIds,
  })) ?? []) as Resumo[];
  const porChave = new Map(resumos.map((r) => [r.chave, r]));
  const oportunidades = jogadas
    .map((j): Oportunidade => {
      const r = porChave.get(j.chave);
      return {
        chave: j.chave,
        titulo: j.titulo,
        por_que: j.porQue,
        publico: Number(r?.publico ?? 0),
        alcance_email: Number(r?.alcance_email ?? 0),
        ticket_medio: r?.ticket_medio === null || r?.ticket_medio === undefined ? null : Number(r.ticket_medio),
        definition: j.definition,
        pedido: j.pedido,
      };
    })
    .filter((o) => o.publico > 0);
  return { data: hoje, oportunidades };
}
```

- [ ] **Step 8: ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/oportunidades.test.ts supabase/functions/_shared/marketing/calendario.test.ts`
Expected: 9 passed. O teste do catálogo depende da Task 1 estar no repo.

- [ ] **Step 9: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' supabase/functions/_shared/marketing/calendario.ts supabase/functions/_shared/marketing/calendario.test.ts supabase/functions/_shared/marketing/oportunidades.ts supabase/functions/_shared/marketing/oportunidades.test.ts
git add supabase/functions/_shared/marketing/calendario.ts supabase/functions/_shared/marketing/calendario.test.ts supabase/functions/_shared/marketing/oportunidades.ts supabase/functions/_shared/marketing/oportunidades.test.ts
git commit -m "feat(marketing): calendário de feriados e jogadas das oportunidades de hoje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: as 5 tools no registro e nos handlers

**Files:**
- Modify: `supabase/functions/_shared/marketing/tools.ts` (fim do bloco "Leitura" de `MARKETING_TOOLS`)
- Modify: `supabase/functions/_shared/marketing/handlers.ts` (`MARKETING_HANDLED` e o `switch`)
- Modify: `supabase/functions/_shared/marketing/handlers.test.ts`
- Modify: `docs/specs/marketing-mcp.md`, `docs/specs/mcp.md`

**Interfaces:**
- Consumes: as RPCs da Task 3; `calendario`, `hojeEmBrasilia` e `oportunidadesDeHoje` da Task 4.
- Produces: as tools `marketing_get_opportunities`, `marketing_get_breakdown`, `marketing_get_trend`, `marketing_get_calendar` e `marketing_measure_campaign`, com escopo `marketing:read`. As saídas são:
  - oportunidades: `{ data, oportunidades: Oportunidade[] }`;
  - distribuição: `{ dimensao, total, itens }`, ou `{ problems }` com segmento inválido;
  - tendência: `{ granularidade, serie }`;
  - calendário: `{ hoje, datas: DataDoCalendario[] }`;
  - resultado: o objeto de `marketing_campaign_result`.

- [ ] **Step 1: testes dos handlers**

No fim de `supabase/functions/_shared/marketing/handlers.test.ts`, acrescente:

```ts
Deno.test("oportunidades medem as jogadas numa chamada só, com as unidades", async () => {
  const db = bancoFalso({
    marketing_segment_summaries: [{ chave: "abandono_recente", publico: 5, alcance_email: 4, ticket_medio: 190.83 }],
  });
  const r = await callMarketing(db, ator, "marketing_get_opportunities", { location_ids: ["l-1"] }, semAviso) as {
    oportunidades: Array<{ chave: string }>;
  };
  assertEquals(r.oportunidades.map((o) => o.chave), ["abandono_recente"]);
  assertEquals(db.chamadas.length, 1);
  assertEquals(db.chamadas[0].args.p_location_ids, ["l-1"]);
});

Deno.test("distribuição com segmento inválido não consulta a base", async () => {
  const db = bancoFalso({ marketing_validate_definition: ['campo desconhecido "x"'] });
  const r = await callMarketing(db, ator, "marketing_get_breakdown", {
    dimension: "tarifa",
    definition: { match: "all", rules: [{ field: "x", op: "eq", value: 1 }] },
  }, semAviso) as { problems: string[] };
  assertEquals(r.problems.length, 1);
  assertEquals(db.chamadas.some((c) => c.fn === "marketing_breakdown"), false);
});

Deno.test("distribuição sem segmento vai direto, com definição nula", async () => {
  const db = bancoFalso({ marketing_breakdown: { dimensao: "aeroporto", total: 0, itens: [] } });
  await callMarketing(db, ator, "marketing_get_breakdown", { dimension: "aeroporto" }, semAviso);
  assertEquals(db.chamadas[0], {
    fn: "marketing_breakdown",
    args: { p_dimension: "aeroporto", p_definition: null, p_location_ids: null },
  });
});

Deno.test("tendência por semana é o padrão", async () => {
  const db = bancoFalso({ marketing_trend: { granularidade: "semana", serie: [] } });
  await callMarketing(db, ator, "marketing_get_trend", {}, semAviso);
  assertEquals(db.chamadas[0].args.p_granularity, "semana");
});

Deno.test("calendário não consulta o banco e traz a janela", async () => {
  const db = bancoFalso();
  const r = await callMarketing(db, ator, "marketing_get_calendar", { days: 366 }, semAviso) as {
    datas: Array<{ janela_de: string }>;
  };
  assertEquals(db.chamadas.length, 0);
  assertEquals(typeof r.datas[0]?.janela_de, "string");
});

Deno.test("resultado da campanha usa 30 dias por padrão", async () => {
  const db = bancoFalso({ marketing_campaign_result: { executada: false } });
  await callMarketing(db, ator, "marketing_measure_campaign", { campaign_id: "c-1" }, semAviso);
  assertEquals(db.chamadas[0], {
    fn: "marketing_campaign_result",
    args: { p_campaign_id: "c-1", p_window_days: 30 },
  });
});
```

- [ ] **Step 2: ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/handlers.test.ts supabase/functions/_shared/marketing/tools.test.ts`
Expected: os 6 testes novos falham com "tool desconhecida" (ou equivalente do `default` do `switch`).

- [ ] **Step 3: registrar as tools**

Em `supabase/functions/_shared/marketing/tools.ts`, no fim do bloco de leitura (logo depois da entrada `marketing_get_dispatch_config` e antes do comentário de gravação), acrescente:

```ts
  {
    name: "marketing_get_opportunities",
    scope: "marketing:read",
    description:
      "Oportunidades de hoje. Para cada jogada do manual (abandono recente, segunda compra, troca para a Flex antes da viagem, feriado com janela de envio abrindo, pedido de indicação), devolve quantas pessoas cabem agora, quantas dá para alcançar por e-mail, o ticket médio, o porquê, o segmento pronto e a frase do pedido. Comece por aqui quando perguntarem por onde começar ou o que fazer hoje.",
    inputSchema: obj({ location_ids: LOCS }),
  },
  {
    name: "marketing_get_breakdown",
    scope: "marketing:read",
    description:
      "Divide a base de compradores, ou um segmento, por uma dimensão: aeroporto, tarifa, canal, origem_trafego, pagamento, faixa_ticket ou dia_semana_entrada. Devolve pessoas e percentual por valor.",
    inputSchema: obj(
      {
        dimension: {
          type: "string",
          enum: ["aeroporto", "tarifa", "canal", "origem_trafego", "pagamento", "faixa_ticket", "dia_semana_entrada"],
        },
        definition: DEFINICAO,
        location_ids: LOCS,
      },
      ["dimension"],
    ),
  },
  {
    name: "marketing_get_trend",
    scope: "marketing:read",
    description:
      "Compras, abandonos (checkout vencido) e receita por dia ou por semana, no fuso de Brasília, até 20 períodos. Padrão: as últimas 12 semanas.",
    inputSchema: obj({
      granularity: { type: "string", enum: ["dia", "semana"] },
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      location_ids: LOCS,
    }),
  },
  {
    name: "marketing_get_calendar",
    scope: "marketing:read",
    description:
      "Feriados nacionais e férias escolares dos próximos dias (padrão 90), cada um com a janela de envio (de 7 a 3 dias antes) e em quantos dias ela abre.",
    inputSchema: obj({ days: INT }),
  },
  {
    name: "marketing_measure_campaign",
    scope: "marketing:read",
    description:
      "Resultado de uma campanha: quantas pessoas entraram, mensagens enviadas, e reservas pagas e receita dessas pessoas nos N dias depois da entrada contra os N dias antes (padrão 30). É comparação, não prova: não há grupo de controle.",
    inputSchema: obj({ campaign_id: UUID, window_days: INT }, ["campaign_id"]),
  },
```

- [ ] **Step 4: os handlers**

Em `supabase/functions/_shared/marketing/handlers.ts`:

(a) nos imports, acrescente:

```ts
import { calendario, hojeEmBrasilia } from "./calendario.ts";
import { oportunidadesDeHoje } from "./oportunidades.ts";
```

(b) em `MARKETING_HANDLED`, logo depois de `"marketing_get_dispatch_config",`, acrescente:

```ts
  "marketing_get_opportunities", "marketing_get_breakdown", "marketing_get_trend",
  "marketing_get_calendar", "marketing_measure_campaign",
```

(c) no `switch` de `callMarketing`, logo depois do `case "marketing_get_dispatch_config":` e do `return` dele, acrescente:

```ts
    case "marketing_get_opportunities":
      return await oportunidadesDeHoje((fn, args) => rpc(db, fn, args), ids(a.location_ids), hojeEmBrasilia());

    case "marketing_get_breakdown": {
      const definicao = a.definition ?? null;
      if (definicao !== null) {
        const problems = ((await rpc(db, "marketing_validate_definition", { p_def: definicao })) as string[] | null) ?? [];
        if (problems.length > 0) return { problems };
      }
      return await rpc(db, "marketing_breakdown", {
        p_dimension: txt(a.dimension),
        p_definition: definicao,
        p_location_ids: ids(a.location_ids),
      });
    }

    case "marketing_get_trend":
      return await rpc(db, "marketing_trend", {
        p_granularity: txt(a.granularity) ?? "semana",
        p_from: txt(a.from),
        p_to: txt(a.to),
        p_location_ids: ids(a.location_ids),
      });

    case "marketing_get_calendar": {
      const hoje = hojeEmBrasilia();
      return { hoje, datas: calendario(hoje, num(a.days) ?? 90) };
    }

    case "marketing_measure_campaign":
      return await rpc(db, "marketing_campaign_result", {
        p_campaign_id: String(a.campaign_id),
        p_window_days: num(a.window_days) ?? 30,
      });
```

- [ ] **Step 5: ver passar, com o guarda da documentação**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/marketing/ supabase/functions/mcp/`
Expected: tudo verde, inclusive `tools.test.ts` ("toda tool declarada tem handler").

- [ ] **Step 6: documentação (ADR-003)**

(a) Em `docs/specs/marketing-mcp.md`, ache a tabela das tools de leitura (`grep -n "marketing_get_dispatch_config" docs/specs/marketing-mcp.md`) e acrescente uma linha por tool nova, no mesmo formato, com o nome, o escopo `marketing:read` e a frase de descrição do Step 3. Troque toda menção a "26 tools" por "31 tools" (`grep -n "26" docs/specs/marketing-mcp.md docs/specs/mcp.md docs/specs/assistente-marketing.md`).

(b) Em `docs/specs/mcp.md`, § 4, na linha da superfície `/marketing` (ou do registro de marketing no `/manager`), acrescente os 5 nomes novos.

Run: `bun run lint:openapi`
Expected: sem erro.

- [ ] **Step 7: publicar a Edge do MCP e conferir no ar**

Run: `supabase functions deploy mcp --no-verify-jwt`
Depois, se as tools novas aparecerem no servidor `movepark-manager` desta sessão (carregue com `ToolSearch` pelo nome, por exemplo `select:mcp__movepark-manager__marketing_get_calendar`), chame `marketing_get_calendar` e `marketing_get_opportunities` (só leitura). Se não aparecerem (a lista de tools do servidor foi lida quando a sessão abriu), a conferência no ar fica com a Task 6, que chama as oportunidades pela Edge.
Expected: o calendário traz o Natal com janela de 18/12 a 22/12, e as oportunidades trazem os públicos de hoje, com números perto dos da spec.

- [ ] **Step 8: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' supabase/functions/_shared/marketing/tools.ts supabase/functions/_shared/marketing/handlers.ts supabase/functions/_shared/marketing/handlers.test.ts docs/specs/marketing-mcp.md docs/specs/mcp.md
git add supabase/functions/_shared/marketing/tools.ts supabase/functions/_shared/marketing/handlers.ts supabase/functions/_shared/marketing/handlers.test.ts docs/specs/marketing-mcp.md docs/specs/mcp.md docs/specs/assistente-marketing.md
git commit -m "feat(mcp): oportunidades, distribuição, tendência, calendário e resultado de campanha no marketing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ação `oportunidades` na Edge da ponte

**Files:**
- Modify: `supabase/functions/marketing-assistant/logic.ts` (tipo `Corpo` e `lerCorpo`)
- Modify: `supabase/functions/marketing-assistant/index.ts` (cabeçalho e `handler`)
- Modify: `supabase/functions/marketing-assistant/logic.test.ts`

**Interfaces:**
- Consumes: `callMarketing(..., "marketing_get_opportunities", { location_ids })` da Task 5.
- Produces: `POST /functions/v1/marketing-assistant` com `{ acao: "oportunidades", location_ids? }` devolve `{ data, oportunidades }` para `hub_admin`. Não passa pelo beast-bots.

- [ ] **Step 1: teste do corpo**

No fim de `supabase/functions/marketing-assistant/logic.test.ts`, acrescente:

```ts
Deno.test("oportunidades sem unidade vale para todas", () => {
  assertEquals(lerCorpo({ acao: "oportunidades" }), { ok: true, corpo: { acao: "oportunidades", locationIds: null } });
});

Deno.test("oportunidades com unidades aceita só uuid", () => {
  const id = "0b8f4f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  assertEquals(lerCorpo({ acao: "oportunidades", location_ids: [id] }), {
    ok: true,
    corpo: { acao: "oportunidades", locationIds: [id] },
  });
  assertEquals(lerCorpo({ acao: "oportunidades", location_ids: ["x"] }).ok, false);
});
```

Confira no topo do arquivo se `lerCorpo` e `assertEquals` já estão importados. Se não, importe de `./logic.ts` e `jsr:@std/assert`.

- [ ] **Step 2: ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/marketing-assistant/logic.test.ts`
Expected: os 2 testes novos falham (ação desconhecida).

- [ ] **Step 3: o corpo**

Em `supabase/functions/marketing-assistant/logic.ts`:

(a) no tipo `Corpo`, acrescente o membro `| { acao: "oportunidades"; locationIds: string[] | null }`.

(b) no `switch (b.acao)` de `lerCorpo`, acrescente:

```ts
    case "oportunidades": {
      const v = b.location_ids;
      if (v === undefined || v === null) return { ok: true, corpo: { acao: "oportunidades", locationIds: null } };
      if (!Array.isArray(v) || v.length > 50 || !v.every((x) => typeof x === "string" && UUID.test(x))) {
        return { ok: false, erro: "location_ids precisa ser uma lista de ids de unidade." };
      }
      return { ok: true, corpo: { acao: "oportunidades", locationIds: v.length > 0 ? v : null } };
    }
```

- [ ] **Step 4: a Edge responde sem o beast-bots**

Em `supabase/functions/marketing-assistant/index.ts`:

(a) no cabeçalho, logo depois da linha de `{ acao: "descartar", proposta_id }`, acrescente:

```ts
//   { acao: "oportunidades", location_ids? }      → { data, oportunidades } (direto do Hub, sem o modelo)
```

(b) no `handler`, logo depois do bloco `if (corpo.acao === "confirmar" || corpo.acao === "descartar") { ... }`, acrescente:

```ts
  // A abertura da conversa: as oportunidades vêm do Hub direto, sem passar pelo modelo.
  if (corpo.acao === "oportunidades") {
    const ator: Actor = { kind: "hub_admin", id: userId, label: email };
    try {
      const dados = await callMarketing(admin, ator, "marketing_get_opportunities",
        { location_ids: corpo.locationIds ?? undefined },
        { alertarDisparoLigado: (info) => alertarDisparoLigado(admin, info) });
      return json(dados);
    } catch (e) {
      console.error(`[marketing-assistant] oportunidades: ${mensagemDe(e)}`);
      return json({ error: "Não consegui ler as oportunidades agora." }, 502);
    }
  }
```

- [ ] **Step 5: ver passar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/marketing-assistant/`
Expected: tudo verde.

- [ ] **Step 6: publicar e conferir**

Run: `grep -n "marketing-assistant" -A2 supabase/config.toml` e publique com a mesma flag que o `config.toml` declara (`supabase functions deploy marketing-assistant`, com `--no-verify-jwt` se lá estiver `verify_jwt = false`).
Depois faça uma chamada de leitura como `developer@fera.ag`, gerando a sessão pelo `admin generate_link` (mesmo roteiro do turno real já usado nesta frente):
`curl -s -X POST "$U/functions/v1/marketing-assistant" -H "Authorization: Bearer $ADM" -H "apikey: $A" -H 'Content-Type: application/json' -d '{"acao":"oportunidades"}'`
Expected: JSON com `oportunidades`. Sem token, `401`.

- [ ] **Step 7: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' supabase/functions/marketing-assistant/logic.ts supabase/functions/marketing-assistant/index.ts supabase/functions/marketing-assistant/logic.test.ts
git add supabase/functions/marketing-assistant/logic.ts supabase/functions/marketing-assistant/index.ts supabase/functions/marketing-assistant/logic.test.ts
git commit -m "feat(marketing): a ponte do assistente entrega as oportunidades de hoje sem passar pelo modelo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: os painéis no chat

**Files:**
- Create: `src/features/marketing-assistant/paineis.logic.ts`
- Create: `src/features/marketing-assistant/paineis.logic.test.ts`
- Create: `src/features/marketing-assistant/partes/Oportunidades.tsx`
- Create: `src/features/marketing-assistant/partes/Distribuicao.tsx`
- Create: `src/features/marketing-assistant/partes/Tendencia.tsx`
- Create: `src/features/marketing-assistant/partes/Calendario.tsx`
- Create: `src/features/marketing-assistant/partes/ResultadoDaCampanha.tsx`
- Modify: `src/features/marketing-assistant/conversa.logic.ts` (`Grupo`, `GRUPOS`, `ROTULOS`, `ondeMostrar`, `organizarMensagem`)
- Modify: `src/features/marketing-assistant/partes/VisualDaTool.tsx`
- Modify: `src/features/marketing-assistant/partes/Partes.test.tsx`

**Interfaces:**
- Consumes: as saídas das 5 tools (Task 5).
- Produces:
  - `dataCurta(iso: string): string`, `situacaoDaJanela(d: { abre_em_dias: number; janela_ate: string }, hoje?: string): string`, `variacao(antes: number, depois: number): string | null` e `percentual(p: number | null): string`;
  - `VisualDaTool` com a prop opcional `onPedir?: (texto: string) => void`;
  - os grupos `oportunidades`, `distribuicao`, `tendencia`, `calendario` e `resultado`.

- [ ] **Step 1: teste da lógica pura**

Crie `src/features/marketing-assistant/paineis.logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dataCurta, percentual, situacaoDaJanela, variacao } from "./paineis.logic";

describe("paineis.logic", () => {
  it("data curta sem passar pelo fuso", () => {
    expect(dataCurta("2026-12-25")).toBe("25/12");
  });
  it("situação da janela de envio", () => {
    expect(situacaoDaJanela({ abre_em_dias: 21, janela_ate: "2026-12-22" }, "2026-11-27")).toBe("abre em 21 dias");
    expect(situacaoDaJanela({ abre_em_dias: 1, janela_ate: "2026-12-22" }, "2026-12-17")).toBe("abre amanhã");
    expect(situacaoDaJanela({ abre_em_dias: 0, janela_ate: "2026-12-22" }, "2026-12-18")).toBe("abre hoje");
    expect(situacaoDaJanela({ abre_em_dias: -2, janela_ate: "2026-12-22" }, "2026-12-20")).toBe("aberta agora");
    expect(situacaoDaJanela({ abre_em_dias: -5, janela_ate: "2026-12-22" }, "2026-12-23")).toBe("a janela já passou");
  });
  it("variação em percentual, e nada quando não havia base", () => {
    expect(variacao(2, 5)).toBe("+150%");
    expect(variacao(4, 2)).toBe("-50%");
    expect(variacao(0, 3)).toBeNull();
  });
  it("percentual com vírgula", () => {
    expect(percentual(63.4)).toBe("63,4%");
    expect(percentual(null)).toBe("");
  });
});
```

- [ ] **Step 2: ver falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant/paineis.logic.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: a lógica pura**

Crie `src/features/marketing-assistant/paineis.logic.ts`:

```ts
/**
 * Formatação pura dos painéis do assistente (docs/specs/assistente-marketing-proativo.md § 4).
 * Datas chegam como AAAA-MM-DD e são cortadas como texto: passar por Date mudaria o dia no fuso de
 * Brasília.
 */

export function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function situacaoDaJanela(d: { abre_em_dias: number; janela_ate: string }, hoje?: string): string {
  if (hoje && d.janela_ate < hoje) return "a janela já passou";
  if (d.abre_em_dias > 1) return `abre em ${d.abre_em_dias} dias`;
  if (d.abre_em_dias === 1) return "abre amanhã";
  if (d.abre_em_dias === 0) return "abre hoje";
  return "aberta agora";
}

export function variacao(antes: number, depois: number): string | null {
  if (!antes) return null;
  const v = Math.round(((depois - antes) / antes) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

export function percentual(p: number | null | undefined): string {
  return p === null || p === undefined ? "" : `${String(p).replace(".", ",")}%`;
}
```

- [ ] **Step 4: ver passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant/paineis.logic.test.ts`
Expected: PASS.

- [ ] **Step 5: testes dos painéis**

Em `src/features/marketing-assistant/partes/Partes.test.tsx`, dentro do `describe("VisualDaTool", ...)`, acrescente:

```tsx
  it("oportunidades mostram o público e o botão manda o pedido", () => {
    const onPedir = vi.fn();
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_opportunities",
          saida: {
            data: "2026-11-27",
            oportunidades: [
              {
                chave: "segunda_compra",
                titulo: "Voltou de viagem nos últimos 3 dias",
                por_que: "Fez a primeira viagem com a Movepark e ainda não marcou a próxima.",
                publico: 14,
                alcance_email: 13,
                ticket_medio: 172.4,
                pedido: "Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias",
              },
            ],
          },
        })}
        propostas={[]}
        onPedir={onPedir}
      />,
    );
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Voltou de viagem nos últimos 3 dias")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Montar esse público" }));
    expect(onPedir).toHaveBeenCalledWith("Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias");
  });

  it("distribuição mostra cada valor com pessoas e percentual", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_breakdown",
          saida: { dimensao: "tarifa", total: 194, itens: [{ valor: "basica", rotulo: "Básica", pessoas: 115, percentual: 59.3 }] },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("Por tarifa")).toBeInTheDocument();
    expect(screen.getByText("Básica")).toBeInTheDocument();
    expect(screen.getByText("115 (59,3%)")).toBeInTheDocument();
  });

  it("calendário mostra a data, o nome e a janela", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_get_calendar",
          saida: {
            hoje: "2026-11-27",
            datas: [{ nome: "Natal", data: "2026-12-25", tipo: "feriado", aproximada: false, janela_de: "2026-12-18", janela_ate: "2026-12-22", abre_em_dias: 21 }],
          },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("25/12")).toBeInTheDocument();
    expect(screen.getByText("Enviar de 18/12 a 22/12, abre em 21 dias")).toBeInTheDocument();
  });

  it("resultado sem execução diz que não há o que medir", () => {
    embrulho(
      <VisualDaTool parte={parte({ nome: "marketing_measure_campaign", saida: { campanha: "Volta", executada: false } })} propostas={[]} />,
    );
    expect(screen.getByText("A campanha Volta ainda não rodou, então não há resultado para medir.")).toBeInTheDocument();
  });

  it("resultado executado mostra antes, depois e o aviso", () => {
    embrulho(
      <VisualDaTool
        parte={parte({
          nome: "marketing_measure_campaign",
          saida: {
            campanha: "Volta",
            executada: true,
            janela_dias: 30,
            matriculados: 31,
            mensagens_enviadas: 28,
            janela_completa: true,
            antes: { reservas: 2, receita: 340 },
            depois: { reservas: 5, receita: 910 },
            aviso: "Comparação, não prova: a ferramenta não tem grupo de controle.",
          },
        })}
        propostas={[]}
      />,
    );
    expect(screen.getByText("+150%")).toBeInTheDocument();
    expect(screen.getByText("Comparação, não prova: a ferramenta não tem grupo de controle.")).toBeInTheDocument();
  });
```

E, no `describe("grupos e rótulos")` de `src/features/marketing-assistant/conversa.logic.test.ts`, acrescente:

```ts
  it("as tools novas aparecem em destaque", () => {
    for (const nome of ["marketing_get_opportunities", "marketing_get_breakdown", "marketing_get_trend", "marketing_get_calendar", "marketing_measure_campaign"]) {
      expect(ondeMostrar(grupoDaTool(nome))).toBe("destaque");
    }
    expect(rotuloDaTool("marketing_get_opportunities", "rodando")).toBe("Procurando as oportunidades de hoje…");
  });
```

Se `ondeMostrar`, `grupoDaTool` ou `rotuloDaTool` não estiverem no import de `./conversa.logic` no topo do teste, acrescente.

- [ ] **Step 6: ver falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant`
Expected: os testes novos falham.

- [ ] **Step 7: grupos e rótulos**

Em `src/features/marketing-assistant/conversa.logic.ts`:

(a) no tipo `Grupo`, acrescente `| "oportunidades" | "distribuicao" | "tendencia" | "calendario" | "resultado"`.

(b) em `GRUPOS`, acrescente:

```ts
  marketing_get_opportunities: "oportunidades",
  marketing_get_breakdown: "distribuicao",
  marketing_get_trend: "tendencia",
  marketing_get_calendar: "calendario",
  marketing_measure_campaign: "resultado",
```

(c) em `ROTULOS`, acrescente:

```ts
  marketing_get_opportunities: [
    "Procurando as oportunidades de hoje…",
    "Achou as oportunidades de hoje",
    "Não conseguiu ler as oportunidades",
  ],
  marketing_get_breakdown: ["Dividindo o público…", "Dividiu o público", "Não conseguiu dividir o público"],
  marketing_get_trend: ["Lendo a tendência…", "Leu a tendência", "Não conseguiu ler a tendência"],
  marketing_get_calendar: ["Olhando o calendário…", "Olhou o calendário", "Não conseguiu ler o calendário"],
  marketing_measure_campaign: [
    "Medindo o resultado da campanha…",
    "Mediu o resultado da campanha",
    "Não conseguiu medir o resultado da campanha",
  ],
```

(d) em `ondeMostrar`, troque a primeira linha por:

```ts
  if (
    grupo === "proposta" || grupo === "gravacao" || grupo === "segmento" || grupo === "mensagem" ||
    grupo === "oportunidades" || grupo === "distribuicao" || grupo === "tendencia" ||
    grupo === "calendario" || grupo === "resultado"
  ) return "destaque";
```

(e) em `organizarMensagem`, troque `const unicos = new Set(["segmento", "mensagem"]);` por `const unicos = new Set(["segmento", "mensagem", "oportunidades", "calendario"]);`.

- [ ] **Step 8: os painéis**

Crie `src/features/marketing-assistant/partes/Oportunidades.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";

export type Oportunidade = {
  chave: string;
  titulo: string;
  por_que: string;
  publico: number;
  alcance_email: number;
  ticket_medio: number | null;
  pedido: string;
};

export function listaDeOportunidades(saida: unknown): Oportunidade[] {
  const l = (saida as { oportunidades?: unknown } | null)?.oportunidades;
  return Array.isArray(l) ? (l as Oportunidade[]) : [];
}

/** As jogadas que cabem hoje: o público em destaque e o botão que começa o trabalho. */
export function Oportunidades({ saida, onPedir }: { saida: unknown; onPedir?: (texto: string) => void }) {
  const lista = listaDeOportunidades(saida);
  if (lista.length === 0) return <p className="text-body-sm text-muted">Nenhuma oportunidade aberta hoje.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lista.map((o) => (
        <article key={o.chave} className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-4 text-left">
          <div className="flex items-baseline gap-2">
            <span className="text-display-sm tabular-nums text-mp-primary">{o.publico.toLocaleString("pt-BR")}</span>
            <span className="text-caption-sm text-muted">
              {o.publico === 1 ? "pessoa" : "pessoas"}, {o.alcance_email.toLocaleString("pt-BR")} com e-mail
            </span>
          </div>
          <h3 className="text-body-sm font-semibold text-ink">{o.titulo}</h3>
          <p className="text-pretty text-body-sm text-body">{o.por_que}</p>
          {o.ticket_medio ? (
            <p className="text-caption-sm text-muted">Ticket médio de {formatBRL(o.ticket_medio)}</p>
          ) : null}
          {onPedir ? (
            <Button type="button" size="sm" variant="outline" className="mt-auto self-start" onClick={() => onPedir(o.pedido)}>
              Montar esse público
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
```

Crie `src/features/marketing-assistant/partes/Distribuicao.tsx`:

```tsx
import { percentual } from "../paineis.logic";

type Item = { valor: string; rotulo: string; pessoas: number; percentual: number | null };
type Saida = { problems?: string[]; dimensao?: string; total?: number; itens?: Item[]; itens_aviso?: string };

const TITULO: Record<string, string> = {
  aeroporto: "Por aeroporto",
  tarifa: "Por tarifa",
  canal: "Por canal da primeira compra",
  origem_trafego: "Por origem do tráfego",
  pagamento: "Por forma de pagamento",
  faixa_ticket: "Por faixa de ticket",
  dia_semana_entrada: "Por dia da semana da entrada",
};

/** O público dividido por uma dimensão, em barras com quantidade e percentual. */
export function Distribuicao({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  if (s.problems && s.problems.length > 0) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-body-sm text-error">
        {s.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    );
  }
  const itens = Array.isArray(s.itens) ? s.itens : [];
  if (itens.length === 0) return <p className="text-body-sm text-muted">Ninguém no público para dividir.</p>;
  const maior = Math.max(...itens.map((i) => i.pessoas), 1);
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{TITULO[s.dimensao ?? ""] ?? "Distribuição"}</span>
        <span className="text-muted"> · {(s.total ?? 0).toLocaleString("pt-BR")} pessoas</span>
      </p>
      <ul className="space-y-2">
        {itens.map((i) => (
          <li key={i.valor} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-ink">{i.rotulo}</span>
              <span className="tabular-nums text-muted">
                {i.percentual !== null ? `${i.pessoas.toLocaleString("pt-BR")} (${percentual(i.percentual)})` : i.pessoas.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-2 rounded-full bg-hairline" aria-hidden>
              <div className="h-2 rounded-full bg-mp-primary" style={{ width: `${(i.pessoas / maior) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {s.itens_aviso ? <p className="text-caption-sm text-muted">{s.itens_aviso}</p> : null}
    </div>
  );
}
```

Crie `src/features/marketing-assistant/partes/Tendencia.tsx`:

```tsx
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";
import { dataCurta } from "../paineis.logic";

type Ponto = { periodo: string; compras: number; abandonos: number; receita: number };
type Saida = { granularidade?: "dia" | "semana"; serie?: Ponto[] };

/** Compras e abandonos no tempo, com o total do período no título. */
export function Tendencia({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  const serie = Array.isArray(s.serie) ? s.serie : [];
  if (serie.length === 0) return <p className="text-body-sm text-muted">Sem movimento no período.</p>;
  const total = serie.reduce(
    (t, p) => ({ compras: t.compras + p.compras, abandonos: t.abandonos + p.abandonos, receita: t.receita + Number(p.receita) }),
    { compras: 0, abandonos: 0, receita: 0 },
  );
  const dados = serie.map((p) => ({ ...p, rotulo: dataCurta(p.periodo) }));
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{s.granularidade === "dia" ? "Por dia" : "Por semana"}</span>
        <span className="text-muted">
          {" "}
          · {total.compras} compras, {total.abandonos} abandonos, {formatBRL(total.receita)}
        </span>
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="rotulo" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} width={32} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="compras" name="Compras" stroke="hsl(var(--mp-primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="abandonos" name="Abandonos" stroke="hsl(var(--mp-red))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Crie `src/features/marketing-assistant/partes/Calendario.tsx`:

```tsx
import { dataCurta, situacaoDaJanela } from "../paineis.logic";

type Data = {
  nome: string;
  data: string;
  tipo: "feriado" | "ferias";
  aproximada: boolean;
  janela_de: string;
  janela_ate: string;
  abre_em_dias: number;
};

/** As próximas datas, cada uma com a janela de envio. */
export function Calendario({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as { hoje?: string; datas?: Data[] };
  const datas = Array.isArray(s.datas) ? s.datas : [];
  if (datas.length === 0) return <p className="text-body-sm text-muted">Nenhum feriado nos próximos dias.</p>;
  return (
    <ol className="space-y-2 rounded-xl border border-hairline bg-surface p-4">
      {datas.map((d) => (
        <li key={d.nome + d.data} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-body-sm">
          <span className="text-ink">
            {d.aproximada ? <span className="text-muted">Por volta de </span> : null}
            <span className="font-semibold tabular-nums">{dataCurta(d.data)}</span> {d.nome}
          </span>
          <span className="text-muted">
            {`Enviar de ${dataCurta(d.janela_de)} a ${dataCurta(d.janela_ate)}, ${situacaoDaJanela(d, s.hoje)}`}
          </span>
        </li>
      ))}
    </ol>
  );
}
```

Crie `src/features/marketing-assistant/partes/ResultadoDaCampanha.tsx`:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";
import { variacao } from "../paineis.logic";

type Lado = { reservas: number; receita: number };
type Saida = {
  campanha?: string;
  janela_dias?: number;
  executada?: boolean;
  matriculados?: number;
  mensagens_enviadas?: number;
  janela_completa?: boolean;
  antes?: Lado;
  depois?: Lado;
  aviso?: string;
};

/** Reservas pagas de quem entrou na campanha, antes e depois. Comparação, não prova. */
export function ResultadoDaCampanha({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  if (!s.executada) {
    return (
      <p className="text-body-sm text-muted">
        {s.campanha ? `A campanha ${s.campanha} ainda não rodou` : "A campanha ainda não rodou"}, então não há resultado para medir.
      </p>
    );
  }
  const antes = s.antes ?? { reservas: 0, receita: 0 };
  const depois = s.depois ?? { reservas: 0, receita: 0 };
  const dias = s.janela_dias ?? 30;
  const v = variacao(antes.reservas, depois.reservas);
  const dados = [
    { lado: `${dias} dias antes`, reservas: antes.reservas },
    { lado: `${dias} dias depois`, reservas: depois.reservas },
  ];
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{s.campanha}</span>
        <span className="text-muted">
          {" "}
          · {s.matriculados ?? 0} pessoas, {s.mensagens_enviadas ?? 0} mensagens enviadas
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div className="h-32 min-w-[12rem] flex-1 text-mp-primary">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados}>
              <XAxis dataKey="lado" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} width={28} />
              <Tooltip />
              <Bar dataKey="reservas" name="Reservas pagas" fill="currentColor" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {v ? (
          <div className="flex flex-col">
            <span className="text-display-sm tabular-nums text-ink">{v}</span>
            <span className="text-caption-sm text-muted">nas reservas pagas</span>
          </div>
        ) : null}
      </div>
      <p className="text-body-sm text-muted">
        Receita de {formatBRL(antes.receita)} antes e {formatBRL(depois.receita)} depois.
      </p>
      {s.janela_completa === false ? (
        <p className="text-caption-sm text-muted">A janela de {dias} dias ainda não fechou para todo mundo.</p>
      ) : null}
      {s.aviso ? <p className="text-caption-sm text-muted">{s.aviso}</p> : null}
    </div>
  );
}
```

- [ ] **Step 9: o roteador desenha os painéis**

Em `src/features/marketing-assistant/partes/VisualDaTool.tsx`:

(a) acrescente os imports:

```tsx
import { Calendario } from "./Calendario";
import { Distribuicao } from "./Distribuicao";
import { Oportunidades } from "./Oportunidades";
import { ResultadoDaCampanha } from "./ResultadoDaCampanha";
import { Tendencia } from "./Tendencia";
```

(b) troque a assinatura por:

```tsx
export function VisualDaTool({
  parte,
  propostas,
  onPedir,
}: {
  parte: ParteDeTool;
  propostas: Proposta[];
  onPedir?: (texto: string) => void;
}) {
```

(c) no `switch`, logo antes de `case "gravacao": {`, acrescente:

```tsx
    case "oportunidades":
      return <Oportunidades saida={s} onPedir={onPedir} />;
    case "distribuicao":
      return <Distribuicao saida={s} />;
    case "tendencia":
      return <Tendencia saida={s} />;
    case "calendario":
      return <Calendario saida={s} />;
    case "resultado":
      return <ResultadoDaCampanha saida={s} />;
```

- [ ] **Step 10: ver passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant && bun run typecheck && bun run lint`
Expected: tudo verde.

- [ ] **Step 11: commit e envio da fase 2**

```bash
grep -nP '[\x{2014}\x{2013}]' src/features/marketing-assistant/paineis.logic.ts src/features/marketing-assistant/paineis.logic.test.ts src/features/marketing-assistant/conversa.logic.ts src/features/marketing-assistant/conversa.logic.test.ts src/features/marketing-assistant/partes/*.tsx
git add src/features/marketing-assistant/paineis.logic.ts src/features/marketing-assistant/paineis.logic.test.ts src/features/marketing-assistant/conversa.logic.ts src/features/marketing-assistant/conversa.logic.test.ts src/features/marketing-assistant/partes/Oportunidades.tsx src/features/marketing-assistant/partes/Distribuicao.tsx src/features/marketing-assistant/partes/Tendencia.tsx src/features/marketing-assistant/partes/Calendario.tsx src/features/marketing-assistant/partes/ResultadoDaCampanha.tsx src/features/marketing-assistant/partes/VisualDaTool.tsx src/features/marketing-assistant/partes/Partes.test.tsx
git commit -m "feat(marketing): painéis de oportunidades, distribuição, tendência, calendário e resultado no chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase origin main && git push origin main
```

Confira o CI (`gh run list --branch main --limit 3`). O job `db` precisa ficar verde com as duas migrations novas.

---

# Fase 3: proatividade

### Task 8: próximos passos e abertura com oportunidades na tela

**Files:**
- Create: `src/features/marketing-assistant/partes/ProximosPassos.tsx`
- Modify: `src/features/marketing-assistant/conversa.logic.ts` (`MensagemOrganizada`, `organizarMensagem`, `passosSugeridos`)
- Modify: `src/features/marketing-assistant/api.ts` (`assistenteKeys`, `useOportunidades`)
- Modify: `src/features/marketing-assistant/Conversa.tsx`
- Modify: `src/features/marketing-assistant/Conversa.test.tsx`
- Modify: `src/features/marketing-assistant/conversa.logic.test.ts`

**Interfaces:**
- Consumes: a ação `oportunidades` da Edge (Task 6), `Oportunidades` (Task 7) e a ferramenta `sugerir_proximos_passos` (entrada `{ passos: string[] }`, Task 9).
- Produces: `useOportunidades(ligado: boolean)`, `passosSugeridos(t: ParteDeTool): string[]`, e o campo `proximos: string[]` em `MensagemOrganizada`.

- [ ] **Step 1: testes**

Em `src/features/marketing-assistant/conversa.logic.test.ts`, acrescente:

```ts
describe("próximos passos", () => {
  it("saem da ferramenta de tela e não viram passo do agente", () => {
    const m = organizarMensagem([
      { type: "text", text: "Pronto." },
      { type: "tool-sugerir_proximos_passos", toolCallId: "p1", state: "input-available", input: { passos: ["Montar o segmento", "", "Ver a mensagem"] } },
    ]);
    expect(m.proximos).toEqual(["Montar o segmento", "Ver a mensagem"]);
    expect(m.passos).toEqual([]);
  });
});
```

Se `organizarMensagem` não estiver no import de `./conversa.logic` no topo desse teste, acrescente.

Em `src/features/marketing-assistant/Conversa.test.tsx`:

(a) troque o mock de `./api` por:

```tsx
let oportunidades: { data?: unknown; isError?: boolean; isLoading?: boolean } = {};
vi.mock("./api", () => ({
  criarTransporte: () => ({}),
  useDecidirProposta: () => ({ mutate: vi.fn(), isPending: false }),
  useOportunidades: () => oportunidades,
}));
```

(b) no começo do teste "vazia, convida e oferece sugestões que enviam", acrescente `oportunidades = { isError: true };`.

(c) acrescente os testes:

```tsx
  it("vazia, abre com as oportunidades de hoje e o cartão começa a conversa", () => {
    estado = { messages: [], status: "ready" };
    oportunidades = {
      data: {
        data: "2026-11-27",
        oportunidades: [
          {
            chave: "abandono_recente",
            titulo: "Abandonou o checkout nas últimas 24 horas",
            por_que: "Começou a reserva e não pagou.",
            publico: 5,
            alcance_email: 4,
            ticket_medio: 190.83,
            pedido: "Quero recuperar quem abandonou o checkout nas últimas 24 horas",
          },
        ],
      },
    };
    enviar.mockReset();
    desenhar();
    expect(screen.getByText("Oportunidades de hoje")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Montar esse público" }));
    expect(enviar).toHaveBeenCalledWith({ text: "Quero recuperar quem abandonou o checkout nas últimas 24 horas" });
  });

  it("próximos passos só na última resposta, e o clique envia", () => {
    oportunidades = {};
    estado = {
      status: "ready",
      messages: [
        { id: "a0", role: "assistant", parts: [{ type: "tool-sugerir_proximos_passos", toolCallId: "p0", state: "input-available", input: { passos: ["Passo velho"] } }] },
        { id: "u1", role: "user", parts: [{ type: "text", text: "E agora?" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "text", text: "Dá para montar." },
            { type: "tool-sugerir_proximos_passos", toolCallId: "p1", state: "input-available", input: { passos: ["Montar o segmento"] } },
          ],
        },
      ],
    };
    enviar.mockReset();
    desenhar();
    expect(screen.queryByRole("button", { name: "Passo velho" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Montar o segmento" }));
    expect(enviar).toHaveBeenCalledWith({ text: "Montar o segmento" });
  });
```

- [ ] **Step 2: ver falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant`
Expected: os testes novos falham.

- [ ] **Step 3: lógica dos próximos passos**

Em `src/features/marketing-assistant/conversa.logic.ts`:

(a) troque `export type MensagemOrganizada = { passos: ParteDeTool[]; textos: string[]; destaques: ParteDeTool[] };` por:

```ts
export type MensagemOrganizada = {
  passos: ParteDeTool[];
  textos: string[];
  destaques: ParteDeTool[];
  /** Os botões de próximo passo, da ferramenta de tela `sugerir_proximos_passos`. */
  proximos: string[];
};

/** Até 3 passos com texto, cada um com até 48 caracteres (o mesmo teto da ferramenta). */
export function passosSugeridos(t: ParteDeTool): string[] {
  const lista = (t.entrada as { passos?: unknown }).passos;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim().slice(0, 48))
    .slice(0, 3);
}
```

(b) em `organizarMensagem`, logo depois de `const textos: string[] = [];`, acrescente `let proximos: string[] = [];`. Troque `if (tool) passos.push(tool);` por:

```ts
    if (!tool) continue;
    if (tool.nome === "sugerir_proximos_passos") {
      proximos = passosSugeridos(tool);
      continue;
    }
    passos.push(tool);
```

e troque o `return { passos, textos, destaques };` por `return { passos, textos, destaques, proximos };`.

- [ ] **Step 4: o componente dos botões**

Crie `src/features/marketing-assistant/partes/ProximosPassos.tsx`:

```tsx
import { Button } from "@/components/ui/button";

/** Os próximos passos que o agente sugeriu. O clique manda o texto como se o admin tivesse escrito. */
export function ProximosPassos({
  passos,
  onPedir,
  desligado,
}: {
  passos: string[];
  onPedir: (texto: string) => void;
  desligado: boolean;
}) {
  if (passos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Próximos passos">
      {passos.map((p) => (
        <Button key={p} type="button" variant="outline" size="sm" className="rounded-full" disabled={desligado} onClick={() => onPedir(p)}>
          {p}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: a consulta das oportunidades**

Em `src/features/marketing-assistant/api.ts`:

(a) em `assistenteKeys`, acrescente `oportunidades: () => [...assistenteKeys.all, "oportunidades"] as const,`.

(b) acrescente o import `import type { Oportunidade } from "./partes/Oportunidades";` e, depois de `useConversa`, a função:

```ts
/** A abertura da conversa: as oportunidades de hoje, direto do Hub, sem passar pelo modelo. */
export function useOportunidades(ligado: boolean) {
  return useQuery({
    queryKey: assistenteKeys.oportunidades(),
    queryFn: () =>
      chamar<{ data: string; oportunidades: Oportunidade[] }>({ acao: "oportunidades" }, "Não consegui ler as oportunidades."),
    enabled: ligado,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
```

- [ ] **Step 6: a conversa usa tudo**

Em `src/features/marketing-assistant/Conversa.tsx`:

(a) troque o import de `./api` por `import { criarTransporte, useOportunidades } from "./api";` e acrescente:

```tsx
import { listaDeOportunidades, Oportunidades } from "./partes/Oportunidades";
import { ProximosPassos } from "./partes/ProximosPassos";
```

(b) troque o componente `Mensagem` por:

```tsx
function Mensagem({
  m,
  propostas,
  ultima,
  ocupado,
  onPedir,
}: {
  m: UIMessage;
  propostas: Proposta[];
  ultima: boolean;
  ocupado: boolean;
  onPedir: (texto: string) => void;
}) {
  if (m.role === "user") {
    const texto = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-mp-primary px-4 py-2.5 text-body-sm text-white">
          {texto}
        </div>
      </div>
    );
  }
  const { passos, textos, destaques, proximos } = organizarMensagem(m.parts as never);
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        <PassosDoAgente passos={passos} propostas={propostas} />
        {textos.map((t, i) => (
          <MarkdownRestrito key={i} markdown={t} className="space-y-3 text-body-sm leading-relaxed text-body" />
        ))}
        {destaques.map((d, i) => (
          <VisualDaTool key={d.id || i} parte={d} propostas={propostas} onPedir={ultima && !ocupado ? onPedir : undefined} />
        ))}
        {ultima ? <ProximosPassos passos={proximos} onPedir={onPedir} desligado={ocupado} /> : null}
      </div>
    </div>
  );
}
```

(c) em `Conversa`, logo depois de `const ocupado = ...;`, acrescente:

```tsx
  const abertura = useOportunidades(messages.length === 0);
  const temOportunidade = listaDeOportunidades(abertura.data).length > 0;
```

(d) troque o bloco do estado vazio (o `<div className="mx-auto mt-16 max-w-md space-y-5 text-center">` inteiro) por:

```tsx
            <div className="mx-auto mt-12 max-w-2xl space-y-5 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-mp-primary/10 text-mp-primary">
                <Sparkle size={20} weight="fill" />
              </span>
              <p className="text-pretty text-body-md text-ink">
                Peça em uma frase. Eu consulto a base e deixo tudo pronto para você revisar.
              </p>
              {temOportunidade ? (
                <div className="space-y-3 text-left">
                  <h2 className="text-balance text-body-md font-semibold text-ink">Oportunidades de hoje</h2>
                  <Oportunidades saida={abertura.data} onPedir={enviar} />
                </div>
              ) : abertura.isLoading ? (
                <p className="text-body-sm text-muted">Procurando as oportunidades de hoje…</p>
              ) : (
                <div className="mx-auto flex max-w-md flex-col gap-2">
                  {SUGESTOES.map((s) => (
                    <Button key={s} variant="outline" className="h-auto whitespace-normal py-2.5" onClick={() => enviar(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              )}
            </div>
```

(e) troque `messages.map((m) => <Mensagem key={m.id} m={m} propostas={propostas} />)` por:

```tsx
            messages.map((m, i) => (
              <Mensagem
                key={m.id}
                m={m}
                propostas={propostas}
                ultima={i === messages.length - 1}
                ocupado={ocupado}
                onPedir={enviar}
              />
            ))
```

- [ ] **Step 7: ver passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bunx vitest run src/features/marketing-assistant && bun run typecheck && bun run lint`
Expected: tudo verde, inclusive os testes antigos de `Conversa.test.tsx`.

- [ ] **Step 8: commit e envio**

```bash
grep -nP '[\x{2014}\x{2013}]' src/features/marketing-assistant/Conversa.tsx src/features/marketing-assistant/Conversa.test.tsx src/features/marketing-assistant/api.ts src/features/marketing-assistant/conversa.logic.ts src/features/marketing-assistant/conversa.logic.test.ts src/features/marketing-assistant/partes/ProximosPassos.tsx
git add src/features/marketing-assistant/Conversa.tsx src/features/marketing-assistant/Conversa.test.tsx src/features/marketing-assistant/api.ts src/features/marketing-assistant/conversa.logic.ts src/features/marketing-assistant/conversa.logic.test.ts src/features/marketing-assistant/partes/ProximosPassos.tsx
git commit -m "feat(marketing): conversa abre com as oportunidades de hoje e termina com os próximos passos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase origin main && git push origin main
```

Isso pode ir ao ar antes do beast-bots. Sem a ferramenta de tela, a resposta só não tem botões.

---

### Task 9: a ferramenta de tela no beast-bots

**Files (repo beast-bots):**
- Create: `src/mastra/tenants/movepark-marketing/proximos-passos.ts`
- Modify: `src/mastra/tenants/movepark-marketing/hub/marketing-mcp.ts` (`toolsDoMarketing`)
- Modify: `src/mastra/tenants/movepark-marketing/tenant.config.ts` (comentário)
- Modify: `tests/marketing.test.ts`

**Interfaces:**
- Produces: a tool `sugerir_proximos_passos` com entrada `{ passos: string[] }` (de 1 a 3 itens, até 48 caracteres cada). A saída é `{ ok: true, passos }`. A tela lê a **entrada** (Task 8).

- [ ] **Step 1: branch**

```bash
cd /Users/kallef/PhpstormProjects/orbital/FERA/beast-bots && git checkout main && git pull -q origin main && git checkout -b feat/marketing-proativo
```

- [ ] **Step 2: teste**

Em `tests/marketing.test.ts`, acrescente ao import: `import { ESQUEMA_DOS_PASSOS, sugerirProximosPassos } from '../src/mastra/tenants/movepark-marketing/proximos-passos';`. Antes da contagem final de falhas, acrescente:

```ts
secao('próximos passos');
t('aceita de 1 a 3 passos curtos', ESQUEMA_DOS_PASSOS.safeParse({ passos: ['Montar o segmento'] }).success, true);
t('recusa quatro passos', ESQUEMA_DOS_PASSOS.safeParse({ passos: ['a', 'b', 'c', 'd'] }).success, false);
t('recusa passo com mais de 48 caracteres', ESQUEMA_DOS_PASSOS.safeParse({ passos: ['x'.repeat(49)] }).success, false);
t('recusa lista vazia', ESQUEMA_DOS_PASSOS.safeParse({ passos: [] }).success, false);
t('a ferramenta tem o nome que a tela procura', sugerirProximosPassos.id, 'sugerir_proximos_passos');
```

- [ ] **Step 3: ver falhar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bun run test`
Expected: falha de import (o módulo não existe).

- [ ] **Step 4: a ferramenta**

Crie `src/mastra/tenants/movepark-marketing/proximos-passos.ts`:

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Ferramenta só de tela: a página Assistente de IA desenha os passos como botões no fim da
 * resposta, e o clique manda o texto como mensagem do admin. Não chama o Hub e não grava nada.
 * Spec no Hub: docs/specs/assistente-marketing-proativo.md § 4.
 */
export const ESQUEMA_DOS_PASSOS = z.object({
  passos: z
    .array(z.string().trim().min(1).max(48))
    .min(1)
    .max(3)
    .describe('De 1 a 3 próximos passos, cada um com até 48 caracteres, escritos como o admin falaria: "Montar o segmento", "Ver a mensagem".'),
});

export const sugerirProximosPassos = createTool({
  id: 'sugerir_proximos_passos',
  description:
    'Mostra de 1 a 3 botões de próximo passo no fim da resposta. Chame por último, uma vez por resposta. O clique manda o texto do botão como mensagem do admin.',
  inputSchema: ESQUEMA_DOS_PASSOS,
  execute: async (input) => ({ ok: true, passos: input.passos }),
});
```

- [ ] **Step 5: ligar no tenant**

Em `src/mastra/tenants/movepark-marketing/hub/marketing-mcp.ts`:

(a) acrescente o import `import { sugerirProximosPassos } from '../proximos-passos';`.

(b) em `toolsDoMarketing`, troque `return toolsDaLista(lista.data, token);` por:

```ts
    return { ...toolsDaLista(lista.data, token), sugerir_proximos_passos: sugerirProximosPassos } as ToolsDoTurno;
```

Em `src/mastra/tenants/movepark-marketing/tenant.config.ts`, troque no comentário "Sem canal e sem tool local:" por "Sem canal, e com uma só tool local (`sugerir_proximos_passos`, só de tela):".

- [ ] **Step 6: ver passar**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bun run test && npx tsc --noEmit -p .`
Expected: "Tudo certo." e tsc sem erro.

- [ ] **Step 7: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' src/mastra/tenants/movepark-marketing/proximos-passos.ts src/mastra/tenants/movepark-marketing/hub/marketing-mcp.ts src/mastra/tenants/movepark-marketing/tenant.config.ts tests/marketing.test.ts
git add src/mastra/tenants/movepark-marketing/proximos-passos.ts src/mastra/tenants/movepark-marketing/hub/marketing-mcp.ts src/mastra/tenants/movepark-marketing/tenant.config.ts tests/marketing.test.ts
git commit -m "feat(movepark-marketing): ferramenta de tela para os botões de próximo passo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: persona, evals, PR e publicação do beast-bots

**Files (repo beast-bots):**
- Modify: `src/mastra/tenants/movepark-marketing/persona.ts` (seção "Como conversar")
- Modify: `tests/marketing.test.ts`
- Modify: `evals/marketing-mcp-falso.ts`
- Modify: `evals/marketing.ts`

**Interfaces:**
- Consumes: as 5 tools do Hub (pelo MCP falso nos evals) e `sugerir_proximos_passos`.

- [ ] **Step 1: asserts da persona**

Em `tests/marketing.test.ts`, junto dos asserts da persona (perto de `'sabe a idade dos números'`), acrescente:

```ts
  t('por onde começar pede as oportunidades', p.includes('marketing_get_opportunities'), true);
  t('topar encadeia até o cartão', p.includes('faça a sequência sem pedir licença a cada passo'), true);
  t('toda resposta fecha com os próximos passos', p.includes('sugerir_proximos_passos'), true);
```

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bun run test`
Expected: os 3 falham.

- [ ] **Step 2: persona**

Em `src/mastra/tenants/movepark-marketing/persona.ts`, na seção `# Como conversar`, logo depois da linha que começa com "- Use o mínimo de ferramentas.", acrescente:

```
- Use a ferramenta certa para cada pergunta. "Por onde começo?" ou "o que faço hoje?": marketing_get_opportunities. "Como está tal aeroporto ou unidade?": marketing_get_trend e marketing_get_breakdown. "Quando mando?": marketing_get_calendar. "Deu certo?": marketing_measure_campaign. Os painéis aparecem na tela; no texto, diga o que eles significam e o que fazer.
- Quando o admin topar uma jogada ("pode montar", "vamos", ou uma mensagem que começa com "Quero" vinda de um cartão de oportunidade), faça a sequência sem pedir licença a cada passo: leia os campos se ainda não leu, meça o público, salve o segmento, salve a campanha em rascunho, mostre a mensagem e chame marketing_run_campaign para deixar a proposta no cartão. Pare no cartão. Nunca ative campanha nem cupom sem o admin pedir.
- Termine toda resposta chamando sugerir_proximos_passos com 1 a 3 passos curtos, escritos como o admin falaria ("Montar o segmento", "Ver a mensagem", "Medir o resultado"). Não repita esses passos no texto.
```

Na seção `# Como escrever`, troque o fim da regra "Para medir," ("... e quando você termina oferecendo montar o segmento.") por:

```
... e quando você termina oferecendo montar o segmento. Se a campanha já rodou, cite o resultado de marketing_measure_campaign em vez do método.
```

No comentário do topo do arquivo, acrescente um parágrafo:

```
 * Em 27/11/2026 ganhou as ferramentas de oportunidade, distribuição, tendência, calendário e
 * resultado, o encadeamento até o cartão quando o admin topa, e os botões de próximo passo
 * (spec no Hub: assistente-marketing-proativo.md).
```

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && bun run test && npx tsc --noEmit -p .`
Expected: verde.

- [ ] **Step 3: o MCP falso conhece as tools novas**

Em `evals/marketing-mcp-falso.ts`:

(a) em `TOOLS_DO_MARKETING`, acrescente:

```ts
  { name: 'marketing_get_opportunities', description: 'Oportunidades de hoje: público, alcance, porquê e segmento pronto por jogada.', inputSchema: obj({}) },
  { name: 'marketing_get_breakdown', description: 'Divide a base ou um segmento por aeroporto, tarifa, canal, origem_trafego, pagamento, faixa_ticket ou dia_semana_entrada.', inputSchema: obj({ dimension: S }, ['dimension']) },
  { name: 'marketing_get_trend', description: 'Compras, abandonos e receita por dia ou semana.', inputSchema: obj({ granularity: S }) },
  { name: 'marketing_get_calendar', description: 'Feriados e férias com a janela de envio.', inputSchema: obj({}) },
  { name: 'marketing_measure_campaign', description: 'Resultado de uma campanha: reservas pagas antes e depois.', inputSchema: obj({ campaign_id: S }, ['campaign_id']) },
  { name: 'marketing_list_campaigns', description: 'Lista as campanhas.', inputSchema: obj({}) },
  {
    name: 'marketing_save_campaign',
    description: 'Cria ou edita uma campanha (fluxo em canvas, texto JSON).',
    inputSchema: obj({ name: S, segment_id: S, canvas: { type: 'object' } }, ['name']),
  },
```

(b) em `RESPOSTAS_PADRAO`, acrescente:

```ts
  marketing_get_opportunities: {
    data: '2026-11-27',
    oportunidades: [
      {
        chave: 'abandono_recente',
        titulo: 'Abandonou o checkout nas últimas 24 horas',
        por_que: 'Começou a reserva e não pagou. Quem volta sozinho volta em poucas horas, então o contato vale hoje.',
        publico: 5,
        alcance_email: 4,
        ticket_medio: 190.83,
        pedido: 'Quero recuperar quem abandonou o checkout nas últimas 24 horas',
        definition: { match: 'all', rules: [{ field: 'abandoned_hours_ago', op: 'lte', value: 24 }] },
      },
      {
        chave: 'segunda_compra',
        titulo: 'Voltou de viagem nos últimos 3 dias',
        por_que: 'Fez a primeira viagem com a Movepark e ainda não marcou a próxima. A experiência está fresca.',
        publico: 14,
        alcance_email: 13,
        ticket_medio: 172.4,
        pedido: 'Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias',
        definition: {
          match: 'all',
          rules: [
            { field: 'bookings_count', op: 'eq', value: 1 },
            { field: 'days_since_return', op: 'between', value: [1, 3] },
            { field: 'has_upcoming_trip', op: 'is_false' },
          ],
        },
      },
    ],
  },
  marketing_get_breakdown: {
    dimensao: 'aeroporto',
    total: 194,
    itens: [
      { valor: 'guarulhos', rotulo: 'Aeroporto Internacional de São Paulo/Guarulhos', pessoas: 123, percentual: 63.4 },
      { valor: 'curitiba', rotulo: 'Aeroporto Afonso Pena', pessoas: 64, percentual: 33 },
    ],
  },
  marketing_get_trend: {
    granularidade: 'semana',
    serie: [
      { periodo: '2026-11-16', compras: 21, abandonos: 30, receita: 3900 },
      { periodo: '2026-11-23', compras: 18, abandonos: 26, receita: 3400 },
    ],
  },
  marketing_get_calendar: {
    hoje: '2026-11-27',
    datas: [
      { nome: 'Natal', data: '2026-12-25', tipo: 'feriado', aproximada: false, janela_de: '2026-12-18', janela_ate: '2026-12-22', abre_em_dias: 21 },
    ],
  },
  marketing_measure_campaign: {
    campanha: 'Volta 90',
    janela_dias: 30,
    executada: true,
    matriculados: 31,
    mensagens_enviadas: 28,
    janela_completa: true,
    antes: { reservas: 2, receita: 340 },
    depois: { reservas: 5, receita: 910 },
    aviso: 'Comparação, não prova: a ferramenta não tem grupo de controle.',
  },
  marketing_list_campaigns: { campanhas: [{ id: 'c-1', name: 'Volta 90', status: 'running' }] },
  marketing_save_campaign: { campaign_id: 'c-2', problems: [] },
```

- [ ] **Step 4: os evals novos**

Em `evals/marketing.ts`:

(a) logo depois da constante `MEDE`, acrescente:

```ts
// Toda resposta fecha com os botões de próximo passo (spec assistente-marketing-proativo.md § 5).
const FECHA = (_: string, tools: string[]) =>
  tools.at(-1) === 'sugerir_proximos_passos' ? undefined : 'não fechou com os próximos passos';
const antesDe = (tools: string[], a: string, b: string) => {
  const ia = tools.indexOf(a);
  const ib = tools.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
};
```

(b) acrescente `FECHA,` ao fim das `regras` de todos os casos que já existem.

(c) acrescente os casos, no fim de `CASOS`:

```ts
  {
    nome: 'proativo: por onde começo usa as oportunidades',
    fala: 'Por onde eu começo hoje?',
    regras: [
      (_, tools) => (tools.includes('marketing_get_opportunities') ? undefined : 'não olhou as oportunidades'),
      (_, tools) => (tools.includes('marketing_list_leads') ? 'puxou a lista de leads' : undefined),
      MEDE,
      FECHA,
    ],
  },
  {
    nome: 'proativo: topar a segunda compra encadeia até o cartão',
    fala: 'Quero chamar para a segunda compra quem voltou de viagem nos últimos 3 dias. Pode montar tudo.',
    regras: [
      (_, tools) => (antesDe(tools, 'marketing_preview_segment', 'marketing_save_segment') ? undefined : 'não mediu antes de salvar o segmento'),
      (_, tools) => (antesDe(tools, 'marketing_save_segment', 'marketing_save_campaign') ? undefined : 'não salvou a campanha depois do segmento'),
      (_, tools) => (antesDe(tools, 'marketing_render_message', 'marketing_run_campaign') ? undefined : 'não mostrou a mensagem antes da proposta'),
      (texto) => (DISSE_QUE_DISPAROU.test(texto) ? 'disse que disparou' : undefined),
      (texto) => (/cart[aã]o/i.test(texto) ? undefined : 'não mandou confirmar no cartão'),
      (_, tools) => (tools.length > 10 ? `usou ${tools.length} ferramentas` : undefined),
      FECHA,
    ],
  },
  {
    nome: 'proativo: quando mandar usa o calendário',
    fala: 'Quando eu mando a campanha do Natal?',
    regras: [
      (_, tools) => (tools.includes('marketing_get_calendar') ? undefined : 'não olhou o calendário'),
      (texto) => (/(18|22)(\/12| de dezembro)/.test(texto) ? undefined : 'não deu a janela do calendário'),
      MEDE,
      FECHA,
    ],
  },
  {
    nome: 'proativo: deu certo usa o resultado e não inventa',
    fala: 'A campanha Volta 90 deu certo?',
    regras: [
      (_, tools) => (tools.includes('marketing_measure_campaign') ? undefined : 'não mediu o resultado'),
      (texto) => {
        const citados = [...texto.matchAll(/\b(\d+)\s+reservas?\b/gi)].map((m) => m[1]);
        const inventados = citados.filter((n) => !['2', '5'].includes(n));
        return inventados.length ? `citou reservas que a ferramenta não deu: ${inventados.join(', ')}` : undefined;
      },
      (texto) => (/(grupo de controle|não é prova|não prova|comparação)/i.test(texto) ? undefined : 'não disse que é comparação, não prova'),
      FECHA,
    ],
  },
```

- [ ] **Step 5: rodar os evals até passar**

Run (no repo beast-bots):

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="$(grep -E '^GOOGLE_GENERATIVE_AI_API_KEY=' /Users/kallef/PhpstormProjects/orbital/FERA/movepark-hub/beast-bots/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
EVAL_MOSTRAR=1 bun run eval:marketing 2>&1 | grep -vE 'GOOGLE|AIza' > /tmp/eval-proativo.txt; grep -E '^(✓|✗)|ok\.' /tmp/eval-proativo.txt
```

Expected: 24 de 24 (12 casos × 2) e "Evals de marketing ok.". Leia o texto de cada resposta em `/tmp/eval-proativo.txt`, não só a regra: resposta que passa mas está feia (lista longa, número sem fonte, botão que repete o texto) é ajuste de persona. Corrija o que reprovar ajustando a persona (não afrouxe a regra sem motivo escrito no comentário dela) e rode de novo.

- [ ] **Step 6: commit, PR e pedido de ok**

```bash
grep -nP '[\x{2014}\x{2013}]' src/mastra/tenants/movepark-marketing/persona.ts evals/marketing.ts evals/marketing-mcp-falso.ts tests/marketing.test.ts
git add src/mastra/tenants/movepark-marketing/persona.ts evals/marketing.ts evals/marketing-mcp-falso.ts tests/marketing.test.ts
git commit -m "feat(movepark-marketing): agente proativo, com ferramenta certa por pergunta, encadeamento até o cartão e próximos passos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/marketing-proativo
gh pr create --base main --head feat/marketing-proativo --title "Agente de marketing proativo: oportunidades, painéis e próximos passos" --body "$(cat <<'EOF'
## O que muda

- Ferramenta só de tela `sugerir_proximos_passos`: de 1 a 3 botões no fim da resposta; o clique manda o texto como mensagem do admin. Não chama o Hub.
- A persona usa a ferramenta certa para cada pergunta (oportunidades, tendência e distribuição, calendário, resultado de campanha), encadeia até o cartão de execução quando o admin topa uma jogada e fecha toda resposta com os próximos passos.
- As 5 ferramentas novas vêm do Hub pela superfície `/marketing` do MCP, sem mudança no cliente.

## Testes

- `bun run test`: esquema dos passos e asserts novos da persona; tsc limpo.
- `bun run eval:marketing` com o modelo de verdade e o MCP falso (que ganhou as ferramentas novas): 24 de 24. Casos novos: por onde começo, encadeamento da segunda compra até a proposta, quando mandar a do Natal e se a campanha deu certo sem inventar número. Toda resposta precisa fechar com os próximos passos.

Spec no Hub: `docs/specs/assistente-marketing-proativo.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Se o número de evals mudar, corrija o "24 de 24" do corpo antes de criar o PR. Depois pergunte ao Kallef pelo `AskUserQuestion` se pode mesclar. Mostre um exemplo real de resposta tirado de `/tmp/eval-proativo.txt` e diga que o build de prévia do Cloudflare falha em todo PR, enquanto o da main passa. **Não mescle sem o ok dele.**

- [ ] **Step 7: com o ok, mesclar e conferir no ar**

```bash
gh pr merge <número> --merge --delete-branch
git checkout main && git pull -q origin main && git fetch -q --prune origin
```

Espere o check `Workers Builds: beast-bots` do commit de merge ficar `success` (`gh api repos/agenciafera/beast-bots/commits/<sha>/check-runs --jq '.check_runs[] | "\(.status) \(.conclusion)"'`). Depois faça um turno real de leitura com a pergunta "Por onde eu começo hoje?", usando o mesmo roteiro do turno real (sessão do `developer@fera.ag` por `generate_link`, `acao: "conversar"`, conversa nova). Confira se vieram `marketing_get_opportunities` e `sugerir_proximos_passos` nas tools, e apague a conversa de teste no fim (`acao: "apagar"`).

---

### Task 11: fechamento

**Files:**
- Modify: `docs/specs/assistente-marketing-proativo.md` (status)
- Modify: `docs/specs/README.md` (linha da spec)
- Modify: memória `project_automacao_marketing_estado.md`

- [ ] **Step 1: status da spec**

Em `docs/specs/assistente-marketing-proativo.md`, troque o bloco de status por:

```markdown
> **Status:** no ar desde <data>. Fase 1 (filtros) e fase 2 (ferramentas e painéis) no Hub; fase 3
> (abertura com oportunidades, botões e persona) no Hub e no beast-bots (PR agenciafera/beast-bots#<número>,
> evals 24 de 24, turno real conferido). Nenhuma campanha foi executada e a chave geral segue desligada.
```

E, em `docs/specs/README.md`, troque "(desenho aprovado em 27/11/2026, a implementar em três fases)" por "(no ar desde <data>)".

- [ ] **Step 2: memória**

Na memória `project_automacao_marketing_estado.md`, acrescente um parágrafo com a data: os 14 filtros, as 5 tools novas (31 no total), a abertura com oportunidades, os botões e o PR do beast-bots. Atualize a linha dela no `MEMORY.md`.

- [ ] **Step 3: commit**

```bash
grep -nP '[\x{2014}\x{2013}]' docs/specs/assistente-marketing-proativo.md
git add docs/specs/assistente-marketing-proativo.md docs/specs/README.md
git commit -m "docs(marketing): assistente proativo no ar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase origin main && git push origin main
```
