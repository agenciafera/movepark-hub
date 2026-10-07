-- Confins: preço pesquisado reconferido em 07/10/2026 (Conteúdo 45, docs/specs/ataque-cnf-bepark.md).
--
-- As três donas de Confins (preço, barato e proximidade) passam a citar os 11 pátios com dado de
-- outubro, e a página de destino e a "mais barato" leem destas mesmas colunas. Para que todas as
-- superfícies digam o mesmo número com a mesma data, a fonte é uma só: `prospect_location`.
--
-- O que mudou na releitura de 07/10, site a site (trecho literal em `prospect_price_research`):
--
--   AeroPark Confins  SUBIU. Descoberta R$ 22,00 a diária e R$ 20,00 por dia de 7 dias em
--                     diante (era R$ 20,00 e R$ 17,00 em 08/09). O topo do site segue dizendo
--                     "a partir de R$ 20", que é a diária de 7 dias em diante.
--   Space Park        A diária de R$ 24,00 só vale de 2 dias em diante: o site publica "Tarifa
--                     Mínima 24h: R$ 40,00". Uma diária custa R$ 40,00.
--   Os demais         Iguais a setembro.
--
-- E o que sai: duração que o pátio NÃO publica. Park Confins, Space Park e Premium Park só
-- publicam diária e semana, o Auto Park não publica pacote de 15 dias e o Estapar só publica o
-- "a partir de" da diária. Os valores que estavam no banco eram a diária multiplicada pelos
-- dias (35 x 30 = R$ 1.050,00 no Park Confins, 26,90 x 7 = R$ 188,30 no Estapar), número que
-- ninguém publicou e que a tabela "Sem reserva online" mostrava como preço. A regra é a do
-- `loteMapeadoPreco.logic.ts`: não inventar duração que não foi pesquisada. Duração derivada de
-- REGRA publicada pelo próprio pátio continua (AeroPark "7+ dias R$ 20/dia", Multipark "R$ 9,90
-- a partir da 5ª diária", Central Park "do 16º ao 30º congelado em R$ 320", Bandeira por faixa).
--
-- Os quatro valores de cada lote são gravados juntos, com a data da leitura, como faz o
-- `manager_price_research_decide`: a linha descreve UMA leitura. O Estapar não foi relido (a
-- fonte é um post do blog do Zul+) e mantém 02/10, perdendo só as durações inventadas.
--
-- Idempotente: o histórico só entra se ainda não houver leitura do mesmo lote no mesmo dia, e
-- a atualização reescreve os mesmos valores.

with leitura(slug, url, d1, d7, d15, d30, lido_em, evidencia, fonte) as (
  values
  ('aeropark', 'https://aeroparkconfins.com.br/', 22.00, 140.00, 300.00, 600.00, date '2026-10-07',
   'Vaga Descoberta R$22/diária 7+ dias: R$20/dia · economize 9% | Vaga Coberta R$29,90/diária 7+ dias: R$24/dia | Galpão R$40/diária 7+ dias: R$35/dia',
   'Site do AeroPark Confins, consultado em 07/10/2026. Vaga descoberta: R$ 22,00 a diária e R$ 20,00 por dia de 7 dias em diante (7 = R$ 140,00, 15 = R$ 300,00, 30 = R$ 600,00). Coberta R$ 29,90 (R$ 24,00 de 7 dias) e galpão R$ 40,00 (R$ 35,00 de 7 dias). Subiu desde 08/09 (R$ 20,00 e R$ 17,00).'),
  ('auto-park-brasil', 'https://autoparkbrasil.com.br/', 20.00, 126.00, null, 300.00, date '2026-10-07',
   'Vagas Descobertas Diária R$ 20,00 Semanal R$ 126,00 Mensal R$ 300,00 | Vagas Cobertas Diária R$ 27,90 Semanal R$ 154,00 Mensal R$ 350,00',
   'Site do Auto Park Brasil, consultado em 07/10/2026. Vaga descoberta: diária R$ 20,00, semanal R$ 126,00 e mensal R$ 300,00. Coberta: R$ 27,90, R$ 154,00 e R$ 350,00. Não publica pacote de 15 diárias.'),
  ('central-park', 'https://centralparkconfins.com.br/', 22.00, 140.00, 300.00, 320.00, date '2026-10-07',
   'Vaga Descoberta 1 dia R$ 22,00 ... 7 dias R$ 140,00 + de 7 dias R$ 20 (diária) do 16º ao 30º dia valor congelado em R$ 320,00 | Vaga Coberta 1 dia R$ 29,00 ... 7 dias R$ 168,00 + de 7 dias R$ 24,00 diária + de 15 dias = mensal R$ 384,00',
   'Site do Central Park Confins, consultado em 07/10/2026. Vaga descoberta: diária R$ 22,00, 7 diárias R$ 140,00, R$ 20,00 por dia de 8 a 15 (R$ 300,00) e R$ 320,00 congelado de 16 a 30. Coberta: R$ 29,00, R$ 168,00, R$ 24,00 por dia de 8 a 15 e R$ 384,00 no mensal.'),
  ('park-confins', 'https://www.parkconfins.com.br/', 35.00, 149.00, null, null, date '2026-10-07',
   'Coberta | Diária R$ 35,00 | Semanal R$ 149,00',
   'Site do Park Confins, consultado em 07/10/2026. Vaga coberta: diária R$ 35,00 e semanal R$ 149,00. Não publica descoberta nem pacote acima de 7 diárias.'),
  ('space-park', 'https://estacionamentospacepark.com.br/', 40.00, 140.00, null, null, date '2026-10-07',
   'Tarifa Mínima 24h: R$ 40,00 | Vaga Descoberta R$ 24/diária Semana por apenas R$ 140 | Vaga Coberta R$ 32/diária Semana por apenas R$ 168',
   'Site do Space Park, consultado em 07/10/2026. Tarifa mínima de R$ 40,00 para estadia de até 24h, então 1 diária custa R$ 40,00; de 2 diárias em diante, vaga descoberta a R$ 24,00 por dia e semana a R$ 140,00. Coberta R$ 32,00 por dia e R$ 168,00 a semana. Não publica 15 nem 30 dias.'),
  ('premium-park', 'https://premiumpark.com.br/filial-aeroporto/', 45.00, 180.00, null, null, date '2026-10-07',
   'DIÁRIA De: R$ 45,00 R$ 40,50 | SEMANA De: R$ 180,00 R$ 162,00 | Traslado gratuito de ida e volta incluído',
   'Site do Premium Park (filial aeroporto), consultado em 07/10/2026. Vaga coberta: diária R$ 45,00 e semana R$ 180,00; com reserva antecipada, R$ 40,50 e R$ 162,00. Não publica vaga descoberta nem 15 e 30 dias.'),
  ('multipark', 'https://www.multipark.com.br/multipark-aeroporto-confins', 34.90, 169.30, 248.50, 397.00, date '2026-10-07',
   'Pague a tarifa diária de R$ 34,90 durante os primeiros 04 dias e aproveite a tarifa diária especial de R$ 9,90, à partir da 5ª diária',
   'Site do Multipark, consultado em 07/10/2026. Vaga coberta: R$ 34,90 nas 4 primeiras diárias e R$ 9,90 da quinta em diante (7 = R$ 169,30, 15 = R$ 248,50, 30 = R$ 397,00). Não publica vaga descoberta.'),
  ('bandeira-park', 'https://bandeirapark.online/estacionamento-aeroporto-confins', 24.99, 125.93, 233.85, 323.70, date '2026-10-07',
   'Vaga descoberta Diária (1 a 6 dias) R$ 24,99 | 7 a 12 dias R$ 17,99 | 13 a 17 dias R$ 15,59 | 18 a 30 dias R$ 10,79 | Tarifas de abertura, sujeitas a ajuste. | Daily rate from R$ 7,98 with coupon BP26',
   'https://bandeirapark.online/estacionamento-aeroporto-confins (sistema onde a reserva fecha), consultado em 07/10/2026. Vaga descoberta, sem cupom, "tarifas de abertura, sujeitas a ajuste": R$ 24,99 por dia de 1 a 6 dias, R$ 17,99 de 7 a 12, R$ 15,59 de 13 a 17 e R$ 10,79 de 18 a 30; os totais são diária x dias. Coberta: R$ 29,99, R$ 21,59, R$ 18,71 e R$ 12,95. O R$ 7,98 que o site anuncia depende do cupom BP26, e o bandeirapark.com.br anuncia R$ 18,49 de 1 a 6 dias, valor que o sistema de reserva não cobra. Van gratuita com saída a cada 30 min. Abriu em 01/10/2026.')
),
lote as (
  select p.id, l.*
  from leitura l
  join public.prospect_location p on p.public_slug = l.slug
  join public.destination d on d.id = p.destination_id and d.slug = 'aeroporto-de-confins'
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', url, (lido_em + time '12:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual da Conteúdo 45', now(),
         'Aplicado na migration 20261128180000 (Conteúdo 45), leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = lote.lido_em
  )
  returning 1
)
update public.prospect_location p
set researched_daily_brl    = l.d1,
    researched_weekly_brl   = l.d7,
    researched_biweekly_brl = l.d15,
    researched_monthly_brl  = l.d30,
    researched_at           = l.lido_em,
    research_source         = l.fonte,
    last_reviewed_at        = now()
from lote l
where p.id = l.id;

-- Estapar: só a diária é publicada. Sai a semana, a quinzena e o mês calculados.
update public.prospect_location p
set researched_weekly_brl   = null,
    researched_biweekly_brl = null,
    researched_monthly_brl  = null
from public.destination d
where d.id = p.destination_id
  and d.slug = 'aeroporto-de-confins'
  and p.public_slug = 'estapar'
  and (p.researched_weekly_brl is not null
    or p.researched_biweekly_brl is not null
    or p.researched_monthly_brl is not null);
