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
  select l.id from public.location l where l.deleted_at is null order by l.created_at limit 1;

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
