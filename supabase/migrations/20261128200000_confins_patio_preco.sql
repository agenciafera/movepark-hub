-- Confins: o Estacionamento Pátio publica tarifa (Conteúdo 46, 07/10/2026).
--
-- A releitura da Conteúdo 45 (20261128180000) deixou o Pátio sem preço, como em setembro. A
-- pesquisa da Conteúdo 46, no mesmo dia, achou a tabela na página de reservas do operador:
-- descoberta R$ 22,00 a diária e R$ 140,00 a semana; coberta R$ 29,90 e R$ 175,00. A home do site
-- mostra outros valores (coberta a R$ 40,00 a diária), então a fonte registrada é a página onde a
-- reserva é feita, como no Bandeira Park. Não publica 15 nem 30 dias.
--
-- Idempotente: grava valor fixo e só registra o histórico se ainda não houver leitura do dia.

with lote as (
  select p.id
  from public.prospect_location p
  join public.destination d on d.id = p.destination_id and d.slug = 'aeroporto-de-confins'
  where p.public_slug = 'patio'
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', 'https://estacionamentopatioconfins.com.br/wp/reservas/',
         (date '2026-10-07' + time '12:00') at time zone 'America/Sao_Paulo',
         22.00, 140.00, null, null,
         '29,9 / dia | 175,00 / semana | 22 / dia | 140,00 / semana | Coberta Descoberta',
         'claude-opus-5-5', 'Releitura manual da Conteúdo 46', now(),
         'Aplicado na migration 20261128200000 (Conteúdo 46), leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-10-07'
  )
  returning 1
)
update public.prospect_location p
set researched_daily_brl    = 22.00,
    researched_weekly_brl   = 140.00,
    researched_biweekly_brl = null,
    researched_monthly_brl  = null,
    researched_at           = date '2026-10-07',
    research_source         = 'Página de reservas do Estacionamento Pátio, consultada em 07/10/2026. '
      || 'Vaga descoberta: R$ 22,00 a diária e R$ 140,00 a semana. Coberta: R$ 29,90 e R$ 175,00. '
      || 'A home do site mostra outros valores (coberta a R$ 40,00 a diária); vale a página de '
      || 'reservas. Não publica 15 nem 30 dias.',
    last_reviewed_at        = now()
from lote
where p.id = lote.id;

-- A tabela da FAQ "quanto custa" ganha a linha do Pátio, logo depois do Central Park.
update public.faq
set body_md = replace(body_md,
  E'| Central Park | R$ 22,00 | Descoberta; coberta por R$ 29,00; mês congelado em R$ 320,00 |\n',
  E'| Central Park | R$ 22,00 | Descoberta; coberta por R$ 29,00; mês congelado em R$ 320,00 |\n'
  || E'| Estacionamento Pátio | R$ 22,00 | Descoberta; coberta por R$ 29,90; semana de R$ 140,00 na descoberta |\n')
where slug = 'quanto-custa-estacionar-no-aeroporto-de-confins' and scope = 'destination'
  and body_md not like '%| Estacionamento Pátio |%';
