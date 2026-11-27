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
