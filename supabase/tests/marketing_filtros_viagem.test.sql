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
