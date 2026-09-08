-- E3.2 · CRM Intelligence: motor RFM, campos comportamentais e segmentos automaticos.
--
-- Implementa o MVP dos dois documentos do time de marketing (apresentacao "CRM Intelligence
-- RFM + Growth" e "Especificacao Funcional"), RF-001 a RF-005.
--
-- Tres decisoes de arquitetura que os documentos deixaram em aberto:
--
-- 1. **RFM e calculado, nao persistido.** A especificacao diz que a decisao e do time (secao 3).
--    Calcular na consulta mantem a regra do E3.1: comportamento e derivado da reserva, nunca
--    gravado, porque uma segunda copia envelhece calada (reserva cancelada e o rotulo "campeao"
--    continua la). O "ultimo recalculo" que a RF-001 pede vira o instante da consulta, devolvido
--    em `calculated_at`.
--
-- 2. **Os cortes sao quintis, nao numeros fixos.** A especificacao pede explicitamente para
--    "evitar thresholds arbitrarios permanentes" (secao 4). `ntile(5)` sobre a propria base faz o
--    score se ajustar sozinho conforme ela cresce: R5 e sempre o quinto mais recente da base, e
--    nao "menos de 30 dias", que envelhece no dia em que o negocio muda de ritmo.
--
-- 3. **A janela e parametrizavel** (`marketing_rfm_window_days` no app_setting, 365 por padrao),
--    como pede a secao 11.
--
-- Spec: docs/specs/marketing-rfm.md

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Marca e origem do veiculo
--
-- `vehicle.model` e campo livre e chega sujo: "PEUGEOT/2008", "HONDA/FIT", e as vezes so o modelo
-- ("ONIX", "CRETA", "FIESTA"). Pegar a primeira palavra daria "ONIX" como se fosse marca. Aqui a
-- normalizacao casa contra um dicionario, e cai para o modelo conhecido quando a marca nao aparece.
--
-- `origem` e um PROXY por marca, nao o dado de importacao do veiculo: diz se a MARCA e premium/sem
-- fabrica no Brasil. Serve para a leitura de comportamento ("carro importado ficou mais tempo"),
-- nao para nada fiscal. A lista mora aqui, num lugar so, para ser corrigida sem cacar string.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_vehicle_brand(p_model text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  with limpo as (
    select upper(regexp_replace(coalesce(p_model, ''), '[/,]+', ' ', 'g')) as t
  ),
  marca as (
    select m from limpo, unnest(array[
      'VOLKSWAGEN','VW','CHEVROLET','GM','FIAT','FORD','RENAULT','HYUNDAI','TOYOTA','HONDA',
      'NISSAN','PEUGEOT','CITROEN','JEEP','CAOA','CHERY','MITSUBISHI','KIA','SUZUKI','SUBARU',
      'AUDI','BMW','MERCEDES','VOLVO','LAND','RANGE','PORSCHE','MINI','JAGUAR','LEXUS','BYD',
      'GWM','HAVAL','RAM','DODGE','CHRYSLER','ALFA','FERRARI','LAMBORGHINI','MASERATI','TESLA'
    ]) m where t like '%' || m || '%'
    order by length(m) desc limit 1
  ),
  -- Modelo conhecido salva a linha quando a marca nao foi digitada.
  pelo_modelo as (
    select b from limpo, (values
      ('ONIX','CHEVROLET'),('CRUZE','CHEVROLET'),('TRACKER','CHEVROLET'),('S10','CHEVROLET'),
      ('CRETA','HYUNDAI'),('HB20','HYUNDAI'),('TUCSON','HYUNDAI'),
      ('FIESTA','FORD'),('KA','FORD'),('RANGER','FORD'),('ECOSPORT','FORD'),
      ('COROLLA','TOYOTA'),('HILUX','TOYOTA'),('YARIS','TOYOTA'),('ETIOS','TOYOTA'),
      ('CIVIC','HONDA'),('FIT','HONDA'),('CITY','HONDA'),('HRV','HONDA'),('HR-V','HONDA'),
      ('GOL','VOLKSWAGEN'),('POLO','VOLKSWAGEN'),('VIRTUS','VOLKSWAGEN'),('TCROSS','VOLKSWAGEN'),
      ('T-CROSS','VOLKSWAGEN'),('SAVEIRO','VOLKSWAGEN'),('NIVUS','VOLKSWAGEN'),
      ('ARGO','FIAT'),('MOBI','FIAT'),('TORO','FIAT'),('STRADA','FIAT'),('PULSE','FIAT'),
      ('UNO','FIAT'),('PALIO','FIAT'),('CRONOS','FIAT'),
      ('KWID','RENAULT'),('SANDERO','RENAULT'),('DUSTER','RENAULT'),('LOGAN','RENAULT'),
      ('KICKS','NISSAN'),('VERSA','NISSAN'),('FRONTIER','NISSAN'),
      ('COMPASS','JEEP'),('RENEGADE','JEEP'),('COMMANDER','JEEP'),
      ('208','PEUGEOT'),('2008','PEUGEOT'),('207','PEUGEOT'),('3008','PEUGEOT'),
      ('PICASSO','CITROEN'),('C3','CITROEN'),('C4','CITROEN'),('AIRCROSS','CITROEN')
    ) as t2(modelo, b)
    where limpo.t like '%' || t2.modelo || '%'
    order by length(t2.modelo) desc limit 1
  )
  select coalesce(
    (select case m when 'VW' then 'VOLKSWAGEN' when 'GM' then 'CHEVROLET' else m end from marca),
    (select b from pelo_modelo)
  );
$fn$;

comment on function public.marketing_vehicle_brand(text) is
  'Marca normalizada a partir do campo livre vehicle.model, que chega sujo ("PEUGEOT/2008", "ONIX"). Casa por dicionario; primeira palavra daria modelo como marca.';

create or replace function public.marketing_vehicle_origin(p_model text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case
    when public.marketing_vehicle_brand(p_model) is null then null
    when public.marketing_vehicle_brand(p_model) = any(array[
      'AUDI','BMW','MERCEDES','VOLVO','LAND','RANGE','PORSCHE','MINI','JAGUAR','LEXUS',
      'SUBARU','KIA','SUZUKI','BYD','GWM','HAVAL','RAM','DODGE','CHRYSLER','ALFA',
      'FERRARI','LAMBORGHINI','MASERATI','TESLA','MITSUBISHI'
    ]) then 'importada'
    else 'nacional'
  end;
$fn$;

comment on function public.marketing_vehicle_origin(text) is
  'PROXY por marca: diz se a marca e premium/sem fabrica no Brasil. Nao e o dado fiscal de importacao do veiculo; serve para leitura de comportamento.';

revoke all on function public.marketing_vehicle_brand(text) from public, anon, authenticated;
revoke all on function public.marketing_vehicle_origin(text) from public, anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campos comportamentais (RF-001 secao 7 da especificacao)
--
-- A funcao existente ganha os campos que a especificacao lista. Precisa de DROP porque a assinatura
-- de retorno muda; as funcoes que chamam ela nao quebram (corpo de funcao e resolvido em execucao,
-- e todas fazem `select *` ou nomeiam colunas que continuam existindo).
--
-- Um campo que o documento pede e que NAO da para entregar honesto hoje: `status_abandono`. A
-- apresentacao (pag. 10) quer guardar estacionamento/data/valor "mesmo sem concluir a compra", mas
-- hoje so existe reserva `pending`, que e carrinho com reserva ja criada. Entao `abandoned_*` sai
-- do `pending` vencido, e nao de um evento de checkout que ainda nao e gravado. Fica anotado como
-- limitacao na spec em vez de virar um campo que mente.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.marketing_contact_metrics(uuid[], timestamptz, timestamptz);

create function public.marketing_contact_metrics(
  p_location_ids uuid[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (
  contact_key text,
  profile_id uuid,
  display_name text,
  email text,
  phone text,
  bookings_count integer,
  cancelled_count integer,
  first_booking_at timestamptz,
  second_booking_at timestamptz,
  last_booking_at timestamptz,
  days_since_last integer,
  days_since_first integer,
  bookings_30 integer,
  bookings_90 integer,
  bookings_180 integer,
  bookings_365 integer,
  total_spent numeric,
  avg_ticket numeric,
  last_ticket numeric,
  avg_stay_days numeric,
  avg_lead_days numeric,
  distinct_locations integer,
  top_location_id uuid,
  top_dow integer,
  weekend_share numeric,
  vacation_bookings integer,
  vacation_share numeric,
  avg_gap_days numeric,
  vehicle_model text,
  vehicle_brand text,
  vehicle_origin text,
  vehicle_color text,
  last_location_id uuid,
  abandoned boolean,
  abandoned_check_in timestamptz,
  abandoned_check_out timestamptz,
  cohort public.marketing_cohort,
  growth_stage public.marketing_growth_stage,
  subscription_candidate boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with scoped as (
    select f.*
    from public.marketing_booking_fact f
    where f.contact_key is not null
      and (p_location_ids is null or f.location_id = any(p_location_ids))
      and (p_from is null or f.created_at >= p_from)
      and (p_to is null or f.created_at < p_to)
  ),
  agg as (
    select
      s.contact_key,
      max(s.profile_id::text)::uuid as profile_id,
      (array_agg(s.customer_name order by s.created_at desc) filter (where s.customer_name is not null))[1] as display_name,
      (array_agg(s.customer_email order by s.created_at desc) filter (where s.customer_email is not null))[1] as email,
      (array_agg(s.customer_phone order by s.created_at desc) filter (where s.customer_phone is not null))[1] as phone,
      count(*) filter (where s.is_purchase)::int as bookings_count,
      count(*) filter (where s.status in ('cancelled', 'no_show'))::int as cancelled_count,
      min(s.created_at) filter (where s.is_purchase) as first_booking_at,
      -- Segunda reserva: o marco de ativacao do documento ("taxa de 1a -> 2a reserva").
      (array_agg(s.created_at order by s.created_at asc) filter (where s.is_purchase))[2] as second_booking_at,
      max(s.created_at) filter (where s.is_purchase) as last_booking_at,
      count(*) filter (where s.is_purchase and s.created_at >= now() - interval '30 days')::int as bookings_30,
      count(*) filter (where s.is_purchase and s.created_at >= now() - interval '90 days')::int as bookings_90,
      count(*) filter (where s.is_purchase and s.created_at >= now() - interval '180 days')::int as bookings_180,
      count(*) filter (where s.is_purchase and s.created_at >= now() - interval '365 days')::int as bookings_365,
      coalesce(sum(s.total_amount) filter (where s.is_purchase), 0) as total_spent,
      (array_agg(s.total_amount order by s.created_at desc) filter (where s.is_purchase))[1] as last_ticket,
      -- Duracao da estadia e antecedencia so existem com as duas pontas preenchidas.
      round(avg((extract(epoch from s.check_out_at - s.check_in_at) / 86400)::numeric)
        filter (where s.is_purchase and s.check_in_at is not null and s.check_out_at is not null), 2) as avg_stay_days,
      round(avg((extract(epoch from s.check_in_at - s.created_at) / 86400)::numeric)
        filter (where s.is_purchase and s.check_in_at is not null), 2) as avg_lead_days,
      count(distinct s.location_id) filter (where s.is_purchase)::int as distinct_locations,
      -- Unidade mais usada: a moda, com desempate pela mais recente.
      (select x.location_id
         from (select s2.location_id, count(*) c, max(s2.created_at) u
                 from scoped s2 where s2.contact_key = s.contact_key and s2.is_purchase
                 group by s2.location_id order by c desc, u desc limit 1) x) as top_location_id,
      (select x.dow
         from (select extract(dow from s2.check_in_at)::int dow, count(*) c
                 from scoped s2 where s2.contact_key = s.contact_key and s2.is_purchase
                  and s2.check_in_at is not null
                 group by 1 order by c desc, dow asc limit 1) x) as top_dow,
      count(*) filter (where s.is_purchase and extract(dow from s.check_in_at)::int in (0, 5, 6))::int as weekend_bookings,
      count(*) filter (where s.is_purchase and s.check_in_at is not null)::int as dated_bookings,
      count(*) filter (where s.is_purchase and s.is_vacation_window)::int as vacation_bookings,
      (array_agg(s.vehicle_model order by s.created_at desc) filter (where s.vehicle_model is not null))[1] as vehicle_model,
      (array_agg(s.vehicle_color order by s.created_at desc) filter (where s.vehicle_color is not null))[1] as vehicle_color,
      (array_agg(s.location_id order by s.created_at desc))[1] as last_location_id,
      -- Abandono: reserva iniciada que nunca virou compra e cuja viagem ainda nao passou.
      bool_or(s.status = 'pending' and s.check_in_at > now()) as abandoned,
      (array_agg(s.check_in_at order by s.created_at desc)
        filter (where s.status = 'pending' and s.check_in_at > now()))[1] as abandoned_check_in,
      (array_agg(s.check_out_at order by s.created_at desc)
        filter (where s.status = 'pending' and s.check_in_at > now()))[1] as abandoned_check_out
    from scoped s
    group by s.contact_key
  ),
  derived as (
    select
      a.*,
      case when a.bookings_count > 0
        then round(a.total_spent / a.bookings_count, 2) else 0 end as avg_ticket,
      -- epoch/86400, e não `extract(day from ...)`: em intervalo, `day` devolve só a parcela de
      -- dias ("1 mon 3 days" daria 3), o que faria todo cliente antigo parecer recente.
      case when a.last_booking_at is not null
        then (extract(epoch from now() - a.last_booking_at) / 86400)::int end as days_since_last,
      case when a.first_booking_at is not null
        then (extract(epoch from now() - a.first_booking_at) / 86400)::int end as days_since_first,
      case when a.bookings_count > 0
        then round(a.vacation_bookings::numeric / a.bookings_count, 4) else 0 end as vacation_share,
      -- Denominador é `dated_bookings` e não `bookings_count`: reserva sem check-in não tem dia da
      -- semana, e contá-la embaixo diluiria o percentual de quem só viaja no fim de semana.
      case when a.dated_bookings > 0
        then round(a.weekend_bookings::numeric / a.dated_bookings, 4) end as weekend_share,
      -- Cadência própria da pessoa: quantos dias, em média, ela leva entre uma viagem e outra.
      case when a.bookings_count >= 2
        then round((extract(epoch from a.last_booking_at - a.first_booking_at) / 86400)::numeric
                   / nullif(a.bookings_count - 1, 0), 1) end as avg_gap_days
    from agg a
  )
  select
    d.contact_key, d.profile_id, d.display_name, d.email, d.phone,
    d.bookings_count, d.cancelled_count,
    d.first_booking_at, d.second_booking_at, d.last_booking_at,
    d.days_since_last, d.days_since_first,
    d.bookings_30, d.bookings_90, d.bookings_180, d.bookings_365,
    d.total_spent, d.avg_ticket, d.last_ticket,
    d.avg_stay_days, d.avg_lead_days,
    d.distinct_locations, d.top_location_id, d.top_dow, d.weekend_share,
    d.vacation_bookings, d.vacation_share, d.avg_gap_days,
    d.vehicle_model,
    public.marketing_vehicle_brand(d.vehicle_model) as vehicle_brand,
    public.marketing_vehicle_origin(d.vehicle_model) as vehicle_origin,
    d.vehicle_color, d.last_location_id,
    coalesce(d.abandoned, false) as abandoned,
    d.abandoned_check_in, d.abandoned_check_out,
    -- A ordem dos ramos é a regra. "Inativo" vence "recorrente" porque quem sumiu há mais de um
    -- ano não é público de retenção; "em risco" vence "recorrente" porque é o único acionável.
    (case
      when d.bookings_count = 0 then 'lead'
      when d.days_since_last > 365 then 'inativo'
      when d.bookings_count >= 4 and d.days_since_last <= 180 then 'campeao'
      when d.bookings_count >= 2 and d.vacation_share >= 0.7 then 'sazonal_ferias'
      when d.bookings_count >= 2 and d.avg_gap_days is not null
           and d.avg_gap_days > 0 and d.days_since_last > d.avg_gap_days * 2 then 'em_risco'
      when d.bookings_count >= 2 then 'recorrente'
      else 'primeira_compra'
    end)::public.marketing_cohort as cohort,
    (case
      when d.bookings_count = 0 then 'aquisicao'
      when d.days_since_last > 365 then 'reativacao'
      when d.bookings_count = 1 then 'ativacao'
      else 'retencao'
    end)::public.marketing_growth_stage as growth_stage,
    -- Candidato a assinante: já mostrou cadência de mensalista. Ou volta muito, ou volta rápido.
    (d.bookings_count >= 3 and coalesce(d.days_since_last, 9999) <= 365)
      or (d.avg_gap_days is not null and d.avg_gap_days <= 45 and d.bookings_count >= 2)
      as subscription_candidate
  from derived d;
$$;

revoke all on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz)
  from public, anon, authenticated;

comment on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz) is
  'Métricas comportamentais por contato (RF-001 §7), com recorte por unidade aplicado antes da agregação. Coorte, estágio AARRR e RFM são derivados, nunca gravados.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Motor RFM (RF-001, RF-002)
--
-- Os cortes sao QUINTIS da propria base (`ntile(5)`), nao numeros fixos, porque a especificacao
-- pede em letras maiusculas para "evitar thresholds arbitrarios permanentes" (secao 4). "R5" quer
-- dizer "esta no quinto mais recente da base", uma frase que continua verdadeira quando a base
-- dobrar; "menos de 30 dias" nao.
--
-- Consequencia honesta do quintil, que precisa estar escrita: com base pequena, ele SEMPRE preenche
-- as cinco faixas. Com 6 clientes, alguem vai ser "campeao" por ser o melhor entre 6. Por isso a
-- funcao devolve `eligible_contacts` junto, e a tela avisa quando a amostra e pequena demais para o
-- rotulo significar alguma coisa.
--
-- `p_window_days` sai do app_setting `marketing_rfm_window_days` (365 por padrao), como pede a
-- secao 11 da especificacao. Reservas canceladas ja nao contam: `is_purchase` no fato as exclui.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_rfm_window_days()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif((select value from public.app_setting where key = 'marketing_rfm_window_days'), '')::int,
    365
  );
$$;

create or replace function public.marketing_contact_rfm(
  p_location_ids uuid[] default null,
  p_window_days integer default null
) returns table (
  contact_key text,
  r_score integer,
  f_score integer,
  m_score integer,
  rfm_cell text,
  rfm_segment text,
  eligible boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with janela as (
    select coalesce(p_window_days, public.marketing_rfm_window_days()) as dias
  ),
  base as (
    select m.contact_key, m.days_since_last, m.bookings_count, m.total_spent
    from janela j,
         public.marketing_contact_metrics(p_location_ids, now() - make_interval(days => j.dias)) m
  ),
  -- Só quem comprou entra no cálculo. Lead sem compra não tem R nem F nem M; deixá-lo dentro
  -- empurraria todo mundo um quintil para cima e inventaria "campeões" que só compraram uma vez.
  eleg as (
    select * from base where bookings_count > 0
  ),
  scored as (
    select
      e.contact_key,
      ntile(5) over (order by e.days_since_last desc nulls first)::int as r_score,
      ntile(5) over (order by e.bookings_count asc, e.days_since_last desc)::int as f_score,
      ntile(5) over (order by e.total_spent asc, e.bookings_count asc)::int as m_score
    from eleg e
  ),
  rotulado as (
    select
      s.*,
      -- A matriz da pág. 7 da apresentação, célula por célula: linha = frequência, coluna = recência.
      case
        when s.f_score = 5 then case s.r_score
          when 5 then 'campeoes' when 4 then 'fieis' when 3 then 'recuperar'
          when 2 then 'alto_risco' else 'perdidos_vip' end
        when s.f_score = 4 then case s.r_score
          when 5 then 'fieis' when 4 then 'recorrentes' when 3 then 'atencao'
          when 2 then 'em_risco' else 'inativos' end
        when s.f_score = 3 then case s.r_score
          when 5 then 'potenciais' when 4 then 'potenciais' when 3 then 'oportunidade'
          when 2 then 'inativos' else 'perdidos' end
        else case s.r_score
          when 5 then 'novos' when 4 then 'ocasionais' when 3 then 'ocasionais'
          when 2 then 'inativos' else 'perdidos' end
      end as rfm_cell
    from scored s
  )
  select
    b.contact_key,
    r.r_score, r.f_score, r.m_score,
    r.rfm_cell,
    -- O M entra como terceira dimensão (pág. 7): não muda a célula, promove dentro dela. Um
    -- "em risco" com M alto vira "perdidos_vip", que é a fila que o dinheiro manda atender antes.
    case
      when r.rfm_cell in ('alto_risco', 'em_risco', 'inativos', 'perdidos') and r.m_score = 5
        then 'perdidos_vip'
      else r.rfm_cell
    end as rfm_segment,
    (r.contact_key is not null) as eligible
  from base b
  left join rotulado r on r.contact_key = b.contact_key;
$$;

revoke all on function public.marketing_rfm_window_days() from public, anon, authenticated;
revoke all on function public.marketing_contact_rfm(uuid[], integer) from public, anon, authenticated;

comment on function public.marketing_contact_rfm(uuid[], integer) is
  'Score R/F/M em quintis da própria base (RF-001) e célula da matriz Recência × Frequência. Calculado, nunca gravado: reserva cancelada muda o score na mesma hora.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O documento do contato ganha os campos novos (RF-005, pag. 11 da apresentacao)
--
-- O construtor manual continua o mesmo: quem passa a saber mais e o documento contra o qual as
-- regras sao avaliadas. Nenhuma regra ja salva quebra, porque so entram chaves novas.
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
      -- Quantos dias faltam (negativo) ou já passaram (positivo) da janela provável de retorno.
      -- É o campo do RF-004: a diferença entre o tempo parado e o ciclo próprio da pessoa.
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
    ) as doc
  from public.marketing_contact_metrics(p_location_ids) m
  left join public.marketing_contact_rfm(p_location_ids) r on r.contact_key = m.contact_key
  left join public.marketing_contact c
    on c.contact_key = m.contact_key and c.deleted_at is null;
$$;

revoke all on function public.marketing_contact_doc(uuid[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Segmentos automaticos (RF-003)
--
-- Sao linhas normais de `marketing_segment`, escritas com o MESMO construtor que o gestor usa.
-- Podia ser codigo dentro da funcao, mas ai o gestor abriria "Campeoes" e nao veria as regras nem
-- poderia clonar. Como linha, ele abre, entende, duplica e ajusta.
--
-- `is_system` protege apenas de apagar: as regras continuam editaveis, porque a definicao de
-- "fiel" muda com o negocio e travar isso no codigo obrigaria deploy para uma decisao de marketing.
--
-- Entram e saem sozinhos (RF-003) porque nada e materializado: o segmento e uma pergunta feita ao
-- vivo. Quem comprou ontem ja esta dentro do "Campeoes" na proxima consulta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_segment
  add column if not exists is_system boolean not null default false;

comment on column public.marketing_segment.is_system is
  'Segmento vindo do modelo RFM/Growth. Protegido contra exclusão; as regras seguem editáveis.';

insert into public.marketing_segment (name, slug, description, definition, is_system)
values
  ('Campeões', 'campeoes',
   'Recentes, muito frequentes e de alto valor. A fila que não pode ser perdida.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"eq","value":"campeoes"}]}'::jsonb, true),

  ('Fiéis', 'fieis',
   'Boa frequência e histórico consistente.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"eq","value":"fieis"}]}'::jsonb, true),

  ('Recorrentes', 'recorrentes',
   'Voltam com regularidade, sem serem os maiores em valor.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"eq","value":"recorrentes"}]}'::jsonb, true),

  ('Viajantes frequentes', 'viajantes-frequentes',
   'Padrão previsível: quatro reservas ou mais no ano, com ciclo próprio de até 60 dias.',
   '{"match":"all","rules":[{"field":"bookings_365","op":"gte","value":4},{"field":"avg_gap_days","op":"lte","value":60}]}'::jsonb, true),

  ('Fim de semana', 'fim-de-semana',
   'Concentração de entradas entre sexta e domingo, com pelo menos duas viagens.',
   '{"match":"all","rules":[{"field":"weekend_share","op":"gte","value":0.7},{"field":"bookings_count","op":"gte","value":2}]}'::jsonb, true),

  ('Novos clientes', 'novos-clientes',
   'Primeira reserva feita, segunda ainda não. É aqui que a ativação acontece.',
   '{"match":"all","rules":[{"field":"bookings_count","op":"eq","value":1},{"field":"days_since_first","op":"lte","value":90}]}'::jsonb, true),

  ('Em risco', 'em-risco',
   'Já eram bons e estão sumindo: passaram do próprio ciclo de retorno.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"in","value":["em_risco","alto_risco","atencao"]}]}'::jsonb, true),

  ('Inativos', 'inativos',
   'Fora do ciclo esperado, sem reserva há mais de um ano.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"in","value":["inativos","perdidos"]}]}'::jsonb, true),

  ('Perdidos VIP', 'perdidos-vip',
   'Alto valor que parou de comprar. A recuperação mais cara de perder.',
   '{"match":"all","rules":[{"field":"rfm_segment","op":"eq","value":"perdidos_vip"}]}'::jsonb, true),

  ('Está na hora de voltar', 'hora-de-voltar',
   'Entraram na janela provável de retorno pelo ciclo individual (RF-004). O segmento de timing.',
   '{"match":"all","rules":[{"field":"bookings_count","op":"gte","value":2},{"field":"cycle_overdue_days","op":"between","value":[-5,15]}]}'::jsonb, true),

  ('Candidatos a assinatura', 'candidatos-assinatura',
   'Cadência de mensalista: já voltam rápido o bastante para um plano fazer sentido.',
   '{"match":"all","rules":[{"field":"subscription_candidate","op":"is_true"}]}'::jsonb, true)
on conflict (slug) do update
  set is_system = true,
      description = excluded.description,
      -- A definição só é reescrita se ninguém tiver mexido: reaplicar a migration não pode
      -- apagar o ajuste que o time de marketing fez na regra.
      definition = case when public.marketing_segment.updated_at <= public.marketing_segment.created_at + interval '1 second'
        then excluded.definition else public.marketing_segment.definition end;

-- Segmento de sistema não se apaga por engano: a tela some, a campanha vinculada fica órfã.
create or replace function public.marketing_guard_system_segment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_system and new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Segmento do modelo RFM não pode ser excluído. Edite as regras ou crie um novo.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_guard_system_segment on public.marketing_segment;
create trigger marketing_guard_system_segment
  before update on public.marketing_segment
  for each row execute function public.marketing_guard_system_segment();
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Descobertas: o que a base esta fazendo e ninguem pediu para ver
--
-- Isto e a inversao que a apresentacao chama de "novo modelo" (pag. 3): hoje o gestor precisa
-- pensar no publico antes de encontra-lo. Aqui o banco varre a base e diz o que mudou.
--
-- **Cada detector declara o dado de que precisa.** Sem isso a tela mentiria por omissao: um
-- detector de tendencia sem historico volta vazio, e vazio se le como "nao ha nada acontecendo",
-- quando a verdade e "nao da para saber ainda". Entao o retorno tem tres estados, nunca dois:
--
--   `achado`    algo mudou o suficiente para agir
--   `estavel`   ha dado, e ele nao mostra mudanca
--   `sem_dados` falta historico ou amostra, e o detector diz exatamente o que falta
--
-- Comparacao de tendencia usa duas janelas iguais e coladas (os ultimos 90 dias contra os 90
-- anteriores). Comparar contra "a media de sempre" acusaria mudanca toda vez que a empresa cresce.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_discoveries(
  p_location_ids uuid[] default null,
  p_window_days integer default 90
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_win interval := make_interval(days => greatest(coalesce(p_window_days, 90), 7));
  v_dias integer := greatest(coalesce(p_window_days, 90), 7);
  v_hist_days integer;
  v_hist_months integer;
  v_min_amostra constant integer := 5;   -- abaixo disso, uma reserva sozinha vira "tendência"
  v_row record;
  v_mediana numeric;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para as descobertas de marketing.' using errcode = '42501';
  end if;

  select
    (extract(epoch from max(created_at) - min(created_at)) / 86400)::int,
    count(distinct date_trunc('month', created_at))::int
  into v_hist_days, v_hist_months
  from public.marketing_booking_fact f
  where f.is_purchase
    and (p_location_ids is null or f.location_id = any(p_location_ids));

  v_hist_days := coalesce(v_hist_days, 0);
  v_hist_months := coalesce(v_hist_months, 0);

  -- ── 1. Duração da estadia mudou dentro de um grupo de veículo ───────────────
  -- O exemplo que o time deu: "carros importados passaram a dobrar o período".
  if v_hist_days < v_dias * 2 then
    v_out := v_out || jsonb_build_object(
      'key', 'duracao_por_veiculo',
      'title', 'Duração da estadia por tipo de veículo',
      'status', 'sem_dados',
      'requirement', format('Precisa de %s dias de histórico para comparar duas janelas. Hoje há %s.',
                            v_dias * 2, v_hist_days));
  else
    for v_row in
      with j as (
        select
          public.marketing_vehicle_origin(f.vehicle_model) as grupo,
          case when f.created_at >= now() - v_win then 'atual' else 'anterior' end as fase,
          (extract(epoch from f.check_out_at - f.check_in_at) / 86400)::numeric as dias
        from public.marketing_booking_fact f
        where f.is_purchase
          and f.created_at >= now() - v_win * 2
          and f.check_in_at is not null and f.check_out_at is not null
          and f.vehicle_model is not null
          and (p_location_ids is null or f.location_id = any(p_location_ids))
      )
      select
        grupo,
        round(avg(dias) filter (where fase = 'atual'), 2) as agora,
        round(avg(dias) filter (where fase = 'anterior'), 2) as antes,
        count(*) filter (where fase = 'atual') as n_agora
      from j where grupo is not null
      group by grupo
      having count(*) filter (where fase = 'atual') >= v_min_amostra
         and count(*) filter (where fase = 'anterior') >= v_min_amostra
    loop
      v_out := v_out || jsonb_build_object(
        'key', 'duracao_veiculo_' || v_row.grupo,
        'title', format('Duração da estadia: marca %s', v_row.grupo),
        'status', case when abs(v_row.agora - v_row.antes) / nullif(v_row.antes, 0) >= 0.3
                       then 'achado' else 'estavel' end,
        'headline', format('%s dia(s) em média, contra %s na janela anterior', v_row.agora, v_row.antes),
        'metric', v_row.agora, 'baseline', v_row.antes,
        'delta_pct', round(100 * (v_row.agora - v_row.antes) / nullif(v_row.antes, 0), 1),
        'sample', v_row.n_agora,
        'detail', 'Marca é proxy de perfil, não dado de importação do veículo.');
    end loop;
    -- Nenhum grupo alcançou amostra: isso é falta de dado, não estabilidade.
    if not exists (select 1 from jsonb_array_elements(v_out) e
                   where e->>'key' like 'duracao_veiculo_%') then
      v_out := v_out || jsonb_build_object(
        'key', 'duracao_por_veiculo',
        'title', 'Duração da estadia por tipo de veículo',
        'status', 'sem_dados',
        'requirement', format('Precisa de %s reservas com veículo e datas em cada janela.', v_min_amostra));
    end if;
  end if;

  -- ── 2. Quem reserva todo mês ────────────────────────────────────────────────
  if v_hist_months < 3 then
    v_out := v_out || jsonb_build_object(
      'key', 'todo_mes',
      'title', 'Clientes que reservam todo mês',
      'status', 'sem_dados',
      'requirement', format('Precisa de 3 meses com reserva. Hoje há %s.', v_hist_months));
  else
    select count(*) as n into v_row from (
      select f.contact_key
      from public.marketing_booking_fact f
      where f.is_purchase and f.contact_key is not null
        and f.created_at >= date_trunc('month', now()) - interval '3 months'
        and f.created_at < date_trunc('month', now())
        and (p_location_ids is null or f.location_id = any(p_location_ids))
      group by f.contact_key
      having count(distinct date_trunc('month', f.created_at)) >= 3
    ) x;
    v_out := v_out || jsonb_build_object(
      'key', 'todo_mes',
      'title', 'Clientes que reservam todo mês',
      'status', case when v_row.n > 0 then 'achado' else 'estavel' end,
      'headline', format('%s pessoa(s) com reserva nos 3 últimos meses fechados', v_row.n),
      'metric', v_row.n, 'contacts', v_row.n,
      'detail', 'Cadência de mensalista sem plano de mensalista. É a fila natural de assinatura.');
  end if;

  -- ── 3. Janela provável de retorno (RF-004) ──────────────────────────────────
  select
    count(*) filter (where avg_gap_days is not null) as com_ciclo,
    count(*) filter (where avg_gap_days is not null
                       and days_since_last between avg_gap_days - 5 and avg_gap_days + 15) as na_janela,
    count(*) filter (where avg_gap_days is not null
                       and days_since_last > avg_gap_days * 2) as fora_do_ciclo
  into v_row
  from public.marketing_contact_metrics(p_location_ids);

  if v_row.com_ciclo = 0 then
    v_out := v_out || jsonb_build_object(
      'key', 'janela_retorno',
      'title', 'Entrando na janela provável de retorno',
      'status', 'sem_dados',
      'requirement', 'Precisa de clientes com pelo menos duas reservas para existir um ciclo individual.');
  else
    v_out := v_out || jsonb_build_object(
      'key', 'janela_retorno',
      'title', 'Entrando na janela provável de retorno',
      'status', case when v_row.na_janela > 0 then 'achado' else 'estavel' end,
      'headline', format('%s de %s cliente(s) com ciclo estão na janela agora', v_row.na_janela, v_row.com_ciclo),
      'metric', v_row.na_janela, 'contacts', v_row.na_janela,
      'detail', format('Outros %s já passaram do dobro do próprio ciclo e contam como recuperação.',
                       v_row.fora_do_ciclo));
  end if;

  -- ── 4. Antecedência de reserva encurtou ou alongou ──────────────────────────
  if v_hist_days < v_dias * 2 then
    v_out := v_out || jsonb_build_object(
      'key', 'antecedencia',
      'title', 'Antecedência da reserva',
      'status', 'sem_dados',
      'requirement', format('Precisa de %s dias de histórico. Hoje há %s.',
                            v_dias * 2, v_hist_days));
  else
    select
      round(avg((extract(epoch from check_in_at - created_at) / 86400)::numeric)
        filter (where created_at >= now() - v_win), 2) as agora,
      round(avg((extract(epoch from check_in_at - created_at) / 86400)::numeric)
        filter (where created_at < now() - v_win), 2) as antes,
      count(*) filter (where created_at >= now() - v_win) as n
    into v_row
    from public.marketing_booking_fact f
    where f.is_purchase and f.check_in_at is not null
      and f.created_at >= now() - v_win * 2
      and (p_location_ids is null or f.location_id = any(p_location_ids));

    if coalesce(v_row.n, 0) < v_min_amostra or v_row.antes is null then
      v_out := v_out || jsonb_build_object(
        'key', 'antecedencia', 'title', 'Antecedência da reserva', 'status', 'sem_dados',
        'requirement', format('Precisa de %s reservas com data de entrada em cada janela.', v_min_amostra));
    else
      v_out := v_out || jsonb_build_object(
        'key', 'antecedencia', 'title', 'Antecedência da reserva',
        'status', case when abs(v_row.agora - v_row.antes) / nullif(v_row.antes, 0) >= 0.3
                       then 'achado' else 'estavel' end,
        'headline', format('%s dia(s) de antecedência, contra %s antes', v_row.agora, v_row.antes),
        'metric', v_row.agora, 'baseline', v_row.antes,
        'delta_pct', round(100 * (v_row.agora - v_row.antes) / nullif(v_row.antes, 0), 1),
        'sample', v_row.n,
        'detail', 'Antecedência menor encurta a janela de lembrete; maior abre espaço para upsell.');
    end if;
  end if;

  -- ── 5. Primeira → segunda reserva ───────────────────────────────────────────
  -- Só conta quem teve tempo de voltar: a mediana do intervalo da base, ou 45 dias sem base.
  select percentile_cont(0.5) within group (order by avg_gap_days)
      into v_mediana
    from public.marketing_contact_metrics(p_location_ids) where avg_gap_days is not null;
    v_mediana := coalesce(v_mediana, 45);

    select
      count(*) filter (where bookings_count >= 1 and days_since_first >= v_mediana) as elegiveis,
      count(*) filter (where bookings_count >= 2 and days_since_first >= v_mediana) as voltaram
    into v_row
    from public.marketing_contact_metrics(p_location_ids);

    if coalesce(v_row.elegiveis, 0) < v_min_amostra then
      v_out := v_out || jsonb_build_object(
        'key', 'primeira_segunda', 'title', 'Taxa de 1ª para 2ª reserva', 'status', 'sem_dados',
        'requirement', format('Precisa de %s clientes com pelo menos %s dias desde a primeira reserva. Hoje há %s.',
                              v_min_amostra, round(v_mediana), coalesce(v_row.elegiveis, 0)));
    else
      v_out := v_out || jsonb_build_object(
        'key', 'primeira_segunda', 'title', 'Taxa de 1ª para 2ª reserva',
        'status', 'achado',
        'headline', format('%s%% voltaram para a segunda (%s de %s)',
                           round(100.0 * v_row.voltaram / v_row.elegiveis, 1), v_row.voltaram, v_row.elegiveis),
        'metric', round(100.0 * v_row.voltaram / v_row.elegiveis, 1),
        'contacts', v_row.elegiveis - v_row.voltaram,
        'detail', format('Janela de espera: %s dias, a mediana do intervalo da base.', round(v_mediana)));
  end if;

  -- ── 6. Unidade ganhando ou perdendo participação ────────────────────────────
  if v_hist_days < v_dias * 2 then
    v_out := v_out || jsonb_build_object(
      'key', 'mix_unidade', 'title', 'Participação por unidade', 'status', 'sem_dados',
      'requirement', format('Precisa de %s dias de histórico. Hoje há %s.',
                            v_dias * 2, v_hist_days));
  else
    for v_row in
      with j as (
        select f.location_id,
               count(*) filter (where f.created_at >= now() - v_win) as agora,
               count(*) filter (where f.created_at < now() - v_win) as antes
        from public.marketing_booking_fact f
        where f.is_purchase and f.created_at >= now() - v_win * 2
          and (p_location_ids is null or f.location_id = any(p_location_ids))
        group by f.location_id
      ),
      t as (select sum(agora) ta, sum(antes) tb from j)
      select l.name, j.agora, j.antes,
             round(100.0 * j.agora / nullif(t.ta, 0), 1) as pct_agora,
             round(100.0 * j.antes / nullif(t.tb, 0), 1) as pct_antes
      from j join t on true join public.location l on l.id = j.location_id
      where t.ta >= v_min_amostra and t.tb >= v_min_amostra
        and abs(100.0 * j.agora / nullif(t.ta, 0) - 100.0 * j.antes / nullif(t.tb, 0)) >= 15
      order by abs(100.0 * j.agora / nullif(t.ta, 0) - 100.0 * j.antes / nullif(t.tb, 0)) desc
      limit 3
    loop
      v_out := v_out || jsonb_build_object(
        'key', 'mix_unidade_' || v_row.name,
        'title', format('Participação: %s', v_row.name),
        'status', 'achado',
        'headline', format('%s%% das reservas, contra %s%% na janela anterior', v_row.pct_agora, v_row.pct_antes),
        'metric', v_row.pct_agora, 'baseline', v_row.pct_antes,
        'delta_pct', round(v_row.pct_agora - v_row.pct_antes, 1),
        'sample', v_row.agora);
    end loop;
    if not exists (select 1 from jsonb_array_elements(v_out) e where e->>'key' like 'mix_unidade%') then
      v_out := v_out || jsonb_build_object(
        'key', 'mix_unidade', 'title', 'Participação por unidade', 'status', 'estavel',
        'headline', 'Nenhuma unidade mudou mais de 15 pontos de participação.');
    end if;
  end if;

  -- ── 7. Concentração em fim de semana ────────────────────────────────────────
  select
    count(*) filter (where weekend_share >= 0.7 and bookings_count >= 2) as fds,
    count(*) filter (where weekend_share is not null and bookings_count >= 2) as com_dado
  into v_row
  from public.marketing_contact_metrics(p_location_ids);

  if coalesce(v_row.com_dado, 0) < v_min_amostra then
    v_out := v_out || jsonb_build_object(
      'key', 'fim_de_semana', 'title', 'Público de fim de semana', 'status', 'sem_dados',
      'requirement', format('Precisa de %s clientes com duas reservas datadas. Hoje há %s.',
                            v_min_amostra, coalesce(v_row.com_dado, 0)));
  else
    v_out := v_out || jsonb_build_object(
      'key', 'fim_de_semana', 'title', 'Público de fim de semana',
      'status', case when v_row.fds > 0 then 'achado' else 'estavel' end,
      'headline', format('%s de %s cliente(s) entram quase sempre entre sexta e domingo',
                         v_row.fds, v_row.com_dado),
      'metric', v_row.fds, 'contacts', v_row.fds);
  end if;

  -- ── 8. Cancelamento concentrado numa unidade ────────────────────────────────
  for v_row in
    select l.name,
           count(*) filter (where f.status in ('cancelled', 'no_show')) as cancel,
           count(*) as total,
           round(100.0 * count(*) filter (where f.status in ('cancelled', 'no_show')) / count(*), 1) as taxa
    from public.marketing_booking_fact f
    join public.location l on l.id = f.location_id
    where f.created_at >= now() - v_win
      and (p_location_ids is null or f.location_id = any(p_location_ids))
    group by l.name
    having count(*) >= v_min_amostra
       and count(*) filter (where f.status in ('cancelled', 'no_show')) * 100.0 / count(*) >= 20
    order by 4 desc limit 3
  loop
    v_out := v_out || jsonb_build_object(
      'key', 'cancelamento_' || v_row.name,
      'title', format('Cancelamento: %s', v_row.name),
      'status', 'achado',
      'headline', format('%s%% das reservas cancelaram (%s de %s)', v_row.taxa, v_row.cancel, v_row.total),
      'metric', v_row.taxa, 'sample', v_row.total,
      'detail', 'Taxa alta de cancelamento contamina frequência e receita de quem cancela.');
  end loop;

  return jsonb_build_object(
    'generated_at', now(),
    'window_days', v_dias,
    'history_days', v_hist_days,
    'history_months', v_hist_months,
    'items', v_out);
end;
$$;

revoke all on function public.marketing_discoveries(uuid[], integer) from public, anon;

comment on function public.marketing_discoveries(uuid[], integer) is
  'Varre a base e devolve o que mudou de comportamento. Cada detector declara o dado de que precisa: sem histórico devolve "sem_dados" com o requisito, nunca vazio (vazio se lê como "nada acontecendo").';
-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Painel RFM (RF-006 e o mockup da pag. 12)
--
-- A tela precisa responder "onde esta o dinheiro escondido na base?". Entao a funcao devolve, num
-- retorno so: os quatro numeros de topo, a distribuicao por segmento RFM, a matriz 5x4 celula a
-- celula (com receita, porque o M e a terceira dimensao) e as tres oportunidades do mockup.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.marketing_rfm_overview(
  p_location_ids uuid[] default null,
  p_window_days integer default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o painel RFM.' using errcode = '42501';
  end if;

  with m as (
    select * from public.marketing_contact_metrics(p_location_ids)
  ),
  r as (
    select * from public.marketing_contact_rfm(p_location_ids, p_window_days)
  ),
  j as (
    select m.*, r.r_score, r.f_score, r.m_score, r.rfm_segment
    from m left join r on r.contact_key = m.contact_key
  )
  select jsonb_build_object(
    'window_days', coalesce(p_window_days, public.marketing_rfm_window_days()),
    'totals', (
      select jsonb_build_object(
        'contacts', count(*),
        'customers', count(*) filter (where bookings_count > 0),
        -- `eligible` é quem entrou no cálculo RFM. É ele que dá sentido (ou não) aos rótulos:
        -- com poucos elegíveis, "campeão" quer dizer "o melhor entre pouca gente".
        'eligible', count(*) filter (where rfm_segment is not null),
        'bookings_per_customer', case when count(*) filter (where bookings_count > 0) > 0
          then round(sum(bookings_count)::numeric / count(*) filter (where bookings_count > 0), 2) else 0 end,
        'avg_ticket', case when coalesce(sum(bookings_count), 0) > 0
          then round(sum(total_spent) / sum(bookings_count), 2) else 0 end,
        'avg_ltv', case when count(*) filter (where bookings_count > 0) > 0
          then round(sum(total_spent) / count(*) filter (where bookings_count > 0), 2) else 0 end,
        'revenue', coalesce(sum(total_spent), 0)
      ) from j
    ),
    'by_segment', coalesce((
      select jsonb_agg(x order by x.revenue desc)
      from (
        select rfm_segment as segment, count(*) as contacts,
               coalesce(sum(total_spent), 0) as revenue,
               round(avg(m_score), 2) as avg_m
        from j where rfm_segment is not null
        group by rfm_segment
      ) x
    ), '[]'::jsonb),
    -- Matriz da pág. 7: uma linha por célula (r_score × f_score) com contagem e receita.
    'matrix', coalesce((
      select jsonb_agg(x order by x.f_score desc, x.r_score desc)
      from (
        select r_score, f_score, count(*) as contacts,
               coalesce(sum(total_spent), 0) as revenue,
               (array_agg(rfm_segment))[1] as segment
        from j where r_score is not null
        group by r_score, f_score
      ) x
    ), '[]'::jsonb),
    'opportunities', (
      select jsonb_build_object(
        'alto_valor_em_risco', count(*) filter (
          where m_score >= 4 and rfm_segment in ('em_risco', 'alto_risco', 'atencao', 'perdidos_vip')),
        'proximos_do_ciclo', count(*) filter (
          where avg_gap_days is not null
            and days_since_last between avg_gap_days - 5 and avg_gap_days + 15),
        'novos_para_segunda', count(*) filter (
          where bookings_count = 1 and coalesce(days_since_first, 0) <= 90)
      ) from j
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.marketing_rfm_overview(uuid[], integer) from public, anon;

comment on function public.marketing_rfm_overview(uuid[], integer) is
  'Painel RFM: KPIs de topo, distribuição por segmento, matriz Recência × Frequência e as três filas de oportunidade (RF-006).';

-- Lista os contatos de uma célula da matriz. É o que faz o card ser clicável (RF-006): o gestor vê
-- "18% campeões" e abre quem são, sem ter que remontar as regras no construtor.
create or replace function public.marketing_rfm_contacts(
  p_segment text,
  p_location_ids uuid[] default null,
  p_window_days integer default null,
  p_limit integer default 200
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a lista de contatos.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.total_spent desc), '[]'::jsonb) into v_result
  from (
    select m.contact_key, m.display_name, m.email, m.phone,
           m.bookings_count, m.total_spent, m.avg_ticket, m.days_since_last,
           m.avg_gap_days, m.vehicle_model, m.vehicle_origin,
           r.r_score, r.f_score, r.m_score, r.rfm_segment
    from public.marketing_contact_metrics(p_location_ids) m
    join public.marketing_contact_rfm(p_location_ids, p_window_days) r
      on r.contact_key = m.contact_key
    where r.rfm_segment = p_segment
    limit greatest(coalesce(p_limit, 200), 1)
  ) x;

  return v_result;
end;
$$;

revoke all on function public.marketing_rfm_contacts(text, uuid[], integer, integer) from public, anon;

insert into public.app_setting (key, value)
values ('marketing_rfm_window_days', '365')
on conflict (key) do nothing;
