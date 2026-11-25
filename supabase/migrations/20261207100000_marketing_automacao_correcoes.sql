-- Correções do módulo de Automação do Manager (estudo de 25/11/2026). Ver
-- docs/specs/marketing-automation.md e docs/specs/marketing-rfm.md (seções "Correções de 25/11/2026").
--
-- Quatro defeitos medidos no banco vivo, nenhum deles com teste antes:
--
-- 1. A matrícula da campanha nunca funcionou. O insert declarava (campaign_id, contact_id) e o
--    select entregava (id do contato, id da campanha). A FK de campaign_id recusava a linha, então
--    toda execução com público terminava em erro: 0 matrículas e 0 mensagens desde 27/10/2026.
--
-- 2. O funil mostrava 100% de conversão. `cancel_booking_with_release` carimba `deleted_at` em toda
--    reserva expirada ou cancelada, e `marketing_booking_fact` descartava apagadas. Em 30 dias a
--    tela mostrou 137 criadas e 0 expiradas; o banco tinha 288 criadas e 142 expiradas. A view
--    passa a manter as expiradas e canceladas apagadas pelo cancelamento. Quem lê a view conta
--    compra por `is_purchase`, que continua falso para as duas.
--
-- 3. O detector de cancelamento dividia pelo total de linhas. Com as expiradas visíveis, o
--    carrinho abandonado diluiria a taxa; o denominador passa a ser o que foi pago.
--
-- 4. O RFM inventava campeões. O F era `ntile(5)` ordenado por compras e, no empate, por
--    recência: com 169 de 175 clientes com uma compra só, quem comprou ontem ganhava F5. 29 dos 31
--    "Campeões" e os 31 "Recorrentes" tinham uma compra. O score passa a sair de `percent_rank`,
--    que dá a mesma nota a quem empata. Em valores distintos o resultado é o mesmo quintil de antes.
--
-- CREATE OR REPLACE preserva dono e grants (os ajudantes continuam fechados para anon e
-- authenticated, ver 20261027094500_marketing_lock_internal_helpers.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Matrícula com as colunas na ordem certa
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_enroll_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_definition jsonb;
  v_location_ids uuid[];
  v_send_cap integer;
  v_enrolled integer := 0;
  v_already integer;
begin
  select
    coalesce(sg.definition, '{"match":"all","rules":[]}'::jsonb),
    case when cardinality(c.location_ids) > 0 then c.location_ids else null end,
    c.send_cap
  into v_definition, v_location_ids, v_send_cap
  from public.marketing_campaign c
  left join public.marketing_segment sg
    on sg.id = c.segment_id and sg.deleted_at is null
  where c.id = p_campaign_id and c.deleted_at is null;

  if not found then
    raise exception 'Campanha não encontrada.' using errcode = 'P0002';
  end if;

  select count(*) into v_already
  from public.marketing_enrollment where campaign_id = p_campaign_id;

  with elegivel as (
    select c.id
    from public.marketing_contact c
    join public.marketing_contact_doc(v_location_ids) d
      on d.contact_key = c.contact_key
    where c.deleted_at is null
      and c.unsubscribed_at is null
      and public.marketing_eval_definition(d.doc, v_definition)
      and not exists (
        select 1 from public.marketing_enrollment e
        where e.campaign_id = p_campaign_id and e.contact_id = c.id
      )
    order by c.created_at
    limit greatest(0, v_send_cap - v_already)
  ),
  ins as (
    -- A ordem do select acompanha a lista de colunas: campanha, contato.
    insert into public.marketing_enrollment (campaign_id, contact_id, status)
    select p_campaign_id, id, 'active' from elegivel
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select count(*)::int into v_enrolled from ins;

  return jsonb_build_object(
    'enrolled', v_enrolled,
    'already', v_already,
    'send_cap', v_send_cap
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A base de comportamento enxerga expirada e cancelada
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.marketing_booking_fact as
select
  b.id as booking_id,
  public.marketing_contact_key(b.customer_email, b.customer_phone, b.profile_id) as contact_key,
  b.profile_id,
  b.location_id,
  l.company_id,
  b.status,
  -- O que conta como compra. `pending` é carrinho, `expired`/`cancelled` não viraram receita.
  (b.status in ('confirmed', 'checked_in', 'completed')) as is_purchase,
  b.created_at,
  b.check_in_at,
  b.check_out_at,
  b.total_amount,
  b.fare_tier,
  b.utm_source,
  b.utm_medium,
  b.utm_campaign,
  b.origin,
  nullif(btrim(coalesce(b.customer_name, concat_ws(' ', b.customer_first_name, b.customer_last_name))), '') as customer_name,
  nullif(btrim(b.customer_email), '') as customer_email,
  nullif(btrim(b.customer_phone), '') as customer_phone,
  v.model as vehicle_model,
  v.color as vehicle_color,
  -- Janela de férias no Brasil: janeiro, julho e dezembro. Documentado na spec porque é escolha,
  -- não fato: carnaval anda no calendário e não entra nesse recorte.
  (extract(month from b.check_in_at)::int in (1, 7, 12)) as is_vacation_window
from public.booking b
join public.location l on l.id = b.location_id
left join public.vehicle v on v.id = b.vehicle_id
-- `cancel_booking_with_release` apaga (soft delete) toda reserva que encerra como expirada ou
-- cancelada. Para o marketing elas são o abandono e a perda, então ficam; o resto do que foi
-- apagado continua fora.
where b.deleted_at is null
   or b.status in ('expired', 'cancelled');

comment on view public.marketing_booking_fact is
  'Uma linha por reserva, com a chave de contato já normalizada. Inclui a expirada e a cancelada que o cancelamento apaga; compra é só is_purchase. Base única de comportamento do marketing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RFM com nota igual para quem empata
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_contact_rfm(
  p_location_ids uuid[] default null::uuid[],
  p_window_days integer default null::integer
)
returns table(contact_key text, r_score integer, f_score integer, m_score integer,
              rfm_cell text, rfm_segment text, eligible boolean)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with janela as (
    select coalesce(p_window_days, public.marketing_rfm_window_days()) as dias
  ),
  base as (
    select m.contact_key, m.days_since_last, m.bookings_count, m.total_spent
    from janela j,
         public.marketing_contact_metrics(p_location_ids, now() - make_interval(days => j.dias)) m
  ),
  eleg as (select * from base where bookings_count > 0),
  -- `percent_rank` dá a mesma posição a quem empata: é a fração da base que fica estritamente
  -- abaixo. A nota é o quinto em que essa fração cai. Com valores distintos, é o quintil de sempre;
  -- com empate, ninguém sobe de nota por um critério que não é o da dimensão (antes o F desempatava
  -- pela recência e transformava compra única recente em "campeão").
  posicao as (
    select
      e.contact_key,
      percent_rank() over (order by e.days_since_last desc nulls first) as pr_r,
      percent_rank() over (order by e.bookings_count asc) as pr_f,
      percent_rank() over (order by e.total_spent asc) as pr_m
    from eleg e
  ),
  scored as (
    select
      p.contact_key,
      least(5, 1 + floor(p.pr_r * 5))::int as r_score,
      least(5, 1 + floor(p.pr_f * 5))::int as f_score,
      least(5, 1 + floor(p.pr_m * 5))::int as m_score
    from posicao p
  ),
  rotulado as (
    select s.*,
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
    b.contact_key, r.r_score, r.f_score, r.m_score, r.rfm_cell,
    case
      when r.rfm_cell in ('alto_risco', 'em_risco', 'inativos', 'perdidos') and r.m_score = 5
        then 'perdidos_vip'
      else r.rfm_cell
    end as rfm_segment,
    (r.contact_key is not null) as eligible
  from base b
  left join rotulado r on r.contact_key = b.contact_key;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Descobertas: o detector de cancelamento divide pelo que foi pago
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marketing_discoveries(
  p_location_ids uuid[] default null::uuid[],
  p_window_days integer default 90
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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

  -- 1. Duração da estadia mudou dentro de um grupo de veículo.
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

  -- 2. Quem reserva todo mês.
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

  -- 3. Janela provável de retorno (RF-004).
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

  -- 4. Antecedência de reserva encurtou ou alongou.
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

  -- 5. Primeira para segunda reserva.
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

  -- 6. Unidade ganhando ou perdendo participação.
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

  -- 7. Concentração em fim de semana.
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

  -- 8. Cancelamento concentrado numa unidade.
  -- O denominador é o que foi pago (compra, cancelada, no-show). Carrinho abandonado (expired) e
  -- reserva em aberto (pending) não são venda, e contá-los diluiria a taxa da unidade que cancela.
  for v_row in
    select l.name,
           count(*) filter (where f.status in ('cancelled', 'no_show')) as cancel,
           count(*) as total,
           round(100.0 * count(*) filter (where f.status in ('cancelled', 'no_show')) / count(*), 1) as taxa
    from public.marketing_booking_fact f
    join public.location l on l.id = f.location_id
    where f.created_at >= now() - v_win
      and (f.is_purchase or f.status in ('cancelled', 'no_show'))
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
$function$;
