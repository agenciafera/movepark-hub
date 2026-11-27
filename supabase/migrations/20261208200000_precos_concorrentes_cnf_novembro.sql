-- Preço pesquisado de Confins reconferido em 27/11/2026 (rotina semanal de busca e IA, item 2:
-- docs/specs/rotina-semanal-busca-e-ia.md). Os 10 lotes publicam hoje exatamente o que foi lido em
-- 02 e 07/10/2026, inclusive as regras que geram os totais (AeroPark R$ 20,00 por dia a partir de 7;
-- Central Park R$ 20,00 de 8 a 15 e R$ 320,00 congelado de 16 a 30; Multipark R$ 34,90 nas 4
-- primeiras e R$ 9,90 da 5ª em diante; Bandeira por faixa). Nada muda de valor: só a data da
-- leitura e a fonte, para a página não mostrar um preço de 50 dias quando ele foi conferido hoje.
-- Nenhum texto publicado precisa mudar, porque os valores citados continuam certos e trazem a data
-- da leitura em que foram tirados.
--
-- Idempotente: só registra histórico se ainda não houver leitura do lote no dia.

with leitura(slug, url, evidencia) as (
  values
  ('aeropark', 'https://aeroparkconfins.com.br/',
   'R$ 22 por dia | R$ 20 por dia em estadias de 7 dias ou mais | R$ 29,90 por dia | R$ 24 por dia em estadias de 7 dias ou mais | R$ 40 por dia | R$ 35 por dia em estadias de 7 dias ou mais'),
  ('auto-park-brasil', 'https://autoparkbrasil.com.br/',
   'Vagas Descobertas Diária R$ 20,00 Semanal R$ 126,00 Mensal R$ 300,00 | Vagas Cobertas Diária R$ 27,90 Semanal R$ 154,00 Mensal R$ 350,00'),
  ('bandeira-park', 'https://bandeirapark.online/estacionamento-aeroporto-confins',
   'Diária (1 a 6 dias) R$ 24,99 | 7 a 12 dias R$ 17,99 | 13 a 17 dias R$ 15,59 | 18 a 30 dias R$ 10,79 (descoberta); coberta R$ 29,99 / 21,59 / 18,71 / 12,95'),
  ('central-park', 'https://centralparkconfins.com.br/',
   'Vaga Descoberta 1 dia R$ 22,00 ... 7 dias R$ 140,00 + de 7 dias R$ 20 (diária) do 16º ao 30º dia valor congelado em R$ 320,00 | Vaga Coberta 1 dia R$ 29,00 ... 7 dias R$ 168,00 + de 7 dias R$ 24,00 diária + de 15 dias = mensal R$ 384,00'),
  ('estapar', 'https://www.zuldigital.com.br/blog/estacionamento-aeroporto-confins/',
   'Pela plataforma, diárias de carro partem de R$ 26,90. (post de 21 de julho de 2026)'),
  ('multipark', 'https://www.multipark.com.br/multipark-aeroporto-confins',
   'Pague a tarifa diária de R$ 34,90 durante os primeiros 04 dias e aproveite a tarifa diária especial de R$ 9,90, à partir da 5ª diária'),
  ('park-confins', 'https://www.parkconfins.com.br/',
   'Tipo de vaga Coberta | Diária R$ 35,00 | Semanal R$ 149,00'),
  ('patio', 'https://estacionamentopatioconfins.com.br/wp/reservas/',
   'Coberta 29,9 / dia 175,00 / semana | Descoberta 22 / dia 140,00 / semana'),
  ('premium-park', 'https://premiumpark.com.br/estacionamento-aeroporto-confins/',
   'DIÁRIA De: R$ 45,00 R$ 40,50 | SEMANA De: R$ 180,00 R$ 162,00'),
  ('space-park', 'https://www.estacionamentospacepark.com.br/',
   'Tarifa Mínima 24h: R$ 40,00 | Vaga Descoberta R$ 24/diária Semana por apenas R$ 140 | Vaga Coberta R$ 32/diária Semana por apenas R$ 168')
),
lote as (
  select p.id, p.researched_daily_brl d1, p.researched_weekly_brl d7,
         p.researched_biweekly_brl d15, p.researched_monthly_brl d30, l.*
  from leitura l
  join public.destination d on d.slug = 'aeroporto-de-confins'
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', url,
         (date '2026-11-27' + time '17:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual de CNF, rotina semanal', now(),
         'Aplicado na migration 20261208200000: valores iguais aos de outubro, só a data da leitura muda.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-11-27'
      and r.notes = 'Releitura manual de CNF, rotina semanal'
  )
  returning 1
)
update public.prospect_location p
set researched_at    = date '2026-11-27',
    research_source  = replace(replace(p.research_source,
                         'consultado em 02/10/2026', 'consultado em 27/11/2026'),
                         '07/10/2026', '27/11/2026'),
    last_reviewed_at = now()
from lote l
where p.id = l.id;
