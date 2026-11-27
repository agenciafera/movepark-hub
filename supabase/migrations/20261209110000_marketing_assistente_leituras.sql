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
