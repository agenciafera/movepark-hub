-- Preço pesquisado dos 12 lotes de Guarulhos reconferido em 26/11/2026 (rotina semanal de busca
-- e IA, item 2: docs/specs/rotina-semanal-busca-e-ia.md).
--
-- Mesma regra da releitura de outubro (20261129140000): a linha descreve UMA leitura, os quatro
-- valores são gravados juntos com a data, duração que o pátio NÃO publica fica nula, e duração
-- derivada de REGRA publicada pelo próprio pátio continua (Park 222 "entre 20 e 30 dias você paga
-- 20 diárias", FlyPark "congela na 10ª diária", Bandeira por faixa, CallPark "tabela fixa por
-- diária"). O trecho literal de cada página fica em `prospect_price_research`.
--
-- O que mudou desde 09/10:
--
--   GoPark      Descoberta promocional subiu de R$ 20,90 para R$ 24,90 (cheia R$ 27,90); 7 diárias
--               de R$ 146,30 para R$ 174,30. A tabela vai até 10 diárias.
--   Park 222    Descoberta subiu de R$ 16,99 para R$ 18,99; 7 diárias R$ 132,93. A regra de 20 a 30
--               dias continua (30 = 20 x 18,99 = R$ 379,80). O site passou a avisar que para 1 ou 2
--               diárias vale consulta; a diária fica, como a do CallPark (mínimo de 2), com o aviso
--               na fonte.
--   Bandeira    As faixas publicadas hoje começam em 7, 17 e 31 dias (R$ 18,49, 13,31, 10,18 e 7,98
--               por dia). Os 15 dias publicados (R$ 152,70) e os 30 (R$ 239,40) aplicavam a faixa
--               errada: 15 dias caem na de 7+ (R$ 199,65) e 30 na de 17+ (R$ 305,40).
--   Ponce Park  A página confirma só a diária de R$ 21,99 no PIX, com mínimo de 3 diárias. O
--               simulador mostra o período de 3 diárias e a regra das faixas (3 a 15, pacote de
--               16+) não aparece mais: 7, 15 e 30 ficam nulos.
--
-- Iguais a outubro, só ganham a data: Airport Park, CallPark, Decolar Park, Econopark, FlyPark,
-- MultiPark, ServParking e Urban Park.
--
-- A FAQ "quanto custa" de Guarulhos acompanha (GoPark e a data da consulta), em pt, en e es, com
-- trava de md5: se alguém editou o texto depois da leitura, o update não pega e o texto fica.
--
-- Idempotente: grava valor fixo e só registra histórico se ainda não houver leitura do lote no dia.

with leitura(slug, url, d1, d7, d15, d30, evidencia, fonte) as (
  values
  ('airport-park', 'https://airportpark.com.br/tarifa-reservas',
   59.90, null::numeric, 599.00, 599.00,
   'No Airport Park a diária na tarifa local é de R$59,90 | temos pacotes promocionais de 11 até 30 dias por apenas R$599,00',
   'Página de tarifas do Airport Park, consultada em 26/11/2026. Diária de balcão R$ 59,90 e pacote de R$ 599,00 de 11 a 30 dias. O preço online é anunciado como até 60% menor, sem número.'),
  ('bandeira-park', 'https://www.bandeirapark.com.br/estacionamento-aeroporto-guarulhos',
   18.49, 93.17, 199.65, 305.40,
   'a diária com reserva online sai por R$ 18,49 (vaga descoberta) e cai conforme o número de dias: 7 dias, R$ 13,31/dia; 17 dias, R$ 10,18/dia; 31 dias, R$ 7,98/dia. Preços conferidos em 17/11/2026.',
   'Site do Bandeira Park (GRU), consultado em 26/11/2026. Vaga descoberta com reserva online: R$ 18,49 por dia de 1 a 6 dias, R$ 13,31 a partir de 7 (7 = R$ 93,17, 15 = R$ 199,65), R$ 10,18 a partir de 17 (30 = R$ 305,40) e R$ 7,98 a partir de 31.'),
  ('callpark', 'https://www.callpark.com.br/',
   22.00, 154.00, 330.00, 660.00,
   'Sem surpresas: tabela fixa por diária, sem hora adicional e período mínimo de 2 diárias. | Vaga descoberta 1ª diária (24h) R$ 22,00/dia | Vaga coberta R$ 27,00/dia',
   'Site do CallPark, consultado em 26/11/2026. Vaga descoberta R$ 22,00 por dia e coberta R$ 27,00, tabela fixa por diária, sem hora adicional. Período mínimo de 2 diárias.'),
  ('decolar-park', 'https://www.decolarpark.com.br/tarifas/',
   20.90, 146.30, 313.50, 376.20,
   'Tarifas - Vagas Descobertas | 1 diária (24 horas) R$ 20,90 | 7 diárias (168 horas) R$146,30 | 15 diárias (360 horas) R$ 313,50 | Até 30 dias (até 720 horas) R$ 376,20',
   'Página de tarifas do Decolar Park, consultada em 26/11/2026. Vaga descoberta: R$ 20,90, R$ 146,30, R$ 313,50 e R$ 376,20 até 30 dias (o valor congela na 18ª diária). Coberta R$ 28,90 a diária.'),
  ('econopark', 'https://www.econoparkaeroporto.com.br/Reservas.aspx',
   20.90, null, null, null,
   'Online Promocional: A partir de R$ 20,90* | Mesma tarifa para vagas cobertas e descobertas | * Válido para determinados períodos.',
   'Página de reservas do Econopark, consultada em 26/11/2026. Diária a partir de R$ 20,90 online, mesma tarifa para coberta e descoberta, válida para determinados períodos. Outras durações só aparecem na calculadora.'),
  ('flypark', 'https://flypark.com.br/tarifas',
   40.80, 285.60, 408.00, 408.00,
   '1 R$40,80 | 7 R$285,60 | 10 R$408 | Você paga só até a 10a diária e ganha as 20 diárias consecutivas.',
   'Página de tarifas do FlyPark, consultada em 26/11/2026. Pátio com sombreador: R$ 40,80 por dia, e o valor acumulado congela na 10ª diária (R$ 408,00) até 30 dias. Coberta R$ 49,20.'),
  ('gopark', 'https://gopark.gru.br/',
   24.90, 174.30, null, null,
   'Estadia mínima de 3 diárias caso utilize a van. | 1 diária (24h) R$ 27,90 Valor promocional: R$ 24,90 | 7 diárias (168h) R$ 195,30 Valor promocional: R$ 174,30',
   'Site do GoPark, consultado em 26/11/2026. Vaga descoberta promocional R$ 24,90 (cheia R$ 27,90) e 7 diárias R$ 174,30; coberta R$ 38,90 promocional. Estadia mínima de 3 diárias para quem usa a van. A tabela vai até 10 diárias.'),
  ('multipark', 'https://www.multipark.com.br/aeroporto-de-guarulhos-multipark',
   24.99, 93.17, null, null,
   'o valor de R$13,31 à partir da 7º diária para Reserva Online e o valor de R$29,99 por dia para cobrança física | Estacione por apenas R$ 24,99 por dia!',
   'Site do MultiPark (unidade GRU), consultado em 26/11/2026. Diária de R$ 24,99 com reserva online e R$ 13,31 por dia a partir da 7ª diária (7 = R$ 93,17); balcão R$ 29,99. Não publica faixa para 15 e 30 dias.'),
  ('park-222', 'https://park222.com.br/',
   18.99, 132.93, 284.85, 379.80,
   '1 dia 24 h R$ 18,99 R$ 26,99 | 7 dias 168 h R$ 132,93 R$ 188,93 | Entre 20 e 30 dias, você paga apenas 20 diárias. | Para 1 ou 2 diárias, consulte condições específicas.',
   'Site do Park 222, consultado em 26/11/2026. Vaga descoberta R$ 18,99 por dia (coberta R$ 26,99), tabela de 1 a 90 dias; entre 20 e 30 dias cobra 20 diárias (R$ 379,80). Para 1 ou 2 diárias o site pede consulta. Avulso sem reserva R$ 30,00.'),
  ('ponce-park', 'https://poncepark.com.br/',
   21.99, null, null, null,
   'chegando a uma diária a partir de R$ 21,99 para vaga descoberta (pagamento via PIX) e R$ 29,99 para vagas cobertas | Valor válido para vagas descobertas pagas via Pix e estadia mínima de 3 diárias. Período 3 diárias Pix R$ 65,97',
   'Site do Ponce Park, consultado em 26/11/2026. Vaga descoberta a partir de R$ 21,99 por dia no PIX, com estadia mínima de 3 diárias (3 = R$ 65,97); coberta R$ 29,99. A página não publica mais as faixas de 7, 15 e 30 dias.'),
  ('servparking', 'https://servparking.com.br/',
   19.90, null, null, null,
   'Vagas descobertas de:R$ 21,90 Por: R$ 19,90 (diária) | Pacotes especiais a partir de 7 diárias Fale com nossa equipe',
   'Site do ServParking (unidade GRU), consultado em 26/11/2026. Vaga descoberta R$ 19,90 por dia (era R$ 21,90), coberta R$ 27,90. Pacote a partir de 7 diárias só sob consulta.'),
  ('urban-park', 'https://www.urbanparkgru.com.br/',
   26.90, 188.30, null, null,
   'Tarifa Mínima 1 Diária Reserva Online R$26,90 | Sem reserva online a diária aumenta para R$43,90 | 7 Diárias (168hs) R$ 188,30',
   'Site do Urban Park, consultado em 26/11/2026. Vaga descoberta com reserva online: R$ 26,90 a diária e R$ 188,30 por 7 diárias; coberta R$ 36,90; sem reserva R$ 43,90. A tabela vai até 7 diárias.')
),
lote as (
  select p.id, l.*
  from leitura l
  join public.destination d on d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', url,
         (date '2026-11-26' + time '15:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual de GRU, rotina semanal', now(),
         'Aplicado na migration 20261208150000, leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-11-26'
      and r.notes = 'Releitura manual de GRU, rotina semanal'
  )
  returning 1
)
update public.prospect_location p
set researched_daily_brl    = l.d1,
    researched_weekly_brl   = l.d7,
    researched_biweekly_brl = l.d15,
    researched_monthly_brl  = l.d30,
    researched_at           = date '2026-11-26',
    research_source         = l.fonte,
    last_reviewed_at        = now()
from lote l
where p.id = l.id;

-- FAQ "quanto custa" de Guarulhos: GoPark e a data da consulta dos lotes sem reserva online.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Guarulhos (GRU):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Aerovalet (parceiro Movepark)** | R$ 16,90 | Vaga descoberta a 4,5 km do terminal; coberta por R$ 19,90 |
| **Aeropark (parceiro Movepark)** | R$ 21,90 por dia | Vaga descoberta, com entrada a partir de 2 diárias |
| Estacionamento oficial GRU (Indigo) | R$ 22,00 | Setor Economy, descoberto e afastado; setores junto ao terminal de R$ 75,00 a R$ 100,00 |
| Decolar Park | R$ 20,90 | Descoberta, traslado 24h a cada 15 minutos |
| FlyPark | R$ 40,80 | Pátio com sombreadores |
| GoPark | R$ 24,90 | Descoberta, no preço promocional da reserva online; quem usa a van fica no mínimo 3 diárias |

Em estadia longa a distância entre os dois grupos aumenta: nos parceiros Movepark, 30 diárias na vaga descoberta saem a partir de R$ 207,00, o que dá R$ 6,90 por dia.

O preço do parceiro Movepark sai do motor de reservas, na tabela da Aerovalet de 28/10/2026 e na do Aeropark de 19/10/2026, e fica sempre atualizado na [tabela de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos). Os valores dos estacionamentos sem reserva online vêm do site de cada um, conferidos em 26 de novembro de 2026; os do estacionamento oficial são de agosto de 2026. Podem mudar sem aviso.

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-guarulhos'
  and scope = 'destination'
  and md5(body_md) = '46dd40571bad3c772a3b17739282bc76';

update public.faq
set answer = $faq$A diária mais barata perto do Aeroporto de Guarulhos é a da Aerovalet, parceira Movepark: R$ 16,90 na vaga descoberta, com preço fechado na reserva online. Na estadia longa você paga menos por dia: uma semana sai por R$ 83,30, ou R$ 11,90 por dia, e 30 diárias custam R$ 207,00, ou R$ 6,90 por dia. No Aeropark a mesma vaga custa R$ 139,30 na semana e R$ 537,00 em 30 diárias. Preços do motor de reservas da Movepark, na tabela da Aerovalet de 28/10/2026 e na do Aeropark de 19/10/2026. Nos demais lotes da tabela a diária de entrada vai de R$ 20,90 a R$ 40,80, em consulta de 26 de novembro de 2026, e o oficial fica entre R$ 22,00 no Economy e R$ 100,00 nos setores junto ao terminal, em apuração de agosto de 2026.$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-guarulhos'
  and scope = 'destination'
  and md5(answer) = '8c07a4c221a38d5b250e0028281038d5';

update public.faq_i18n i
set answer = $faq$The cheapest daily rate near Guarulhos Airport is Aerovalet, a Movepark partner: R$ 16.90 for an uncovered spot, with the price locked at booking. On long stays you pay less per day: a week is R$ 83.30, or R$ 11.90 a day, and 30 days cost R$ 207.00, or R$ 6.90 a day. At Aeropark the same spot costs R$ 139.30 for a week and R$ 537.00 for 30 days. Prices from the Movepark booking engine, on the Aerovalet table of 28 October 2026 and the Aeropark table of 19 October 2026. Across the other lots in the table the entry daily rate runs from R$ 20.90 to R$ 40.80, checked on 26 November 2026, and the official car park from R$ 22.00 in the Economy sector to R$ 100.00 in the sectors next to the terminal, as researched in August 2026.$faq$
from public.faq f
where f.id = i.faq_id
  and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-guarulhos'
  and i.locale = 'en'
  and md5(i.answer) = '01841c0a0741e131022f5205b0b86ef9';

update public.faq_i18n i
set answer = $faq$La tarifa diaria más barata cerca del Aeropuerto de Guarulhos es la de Aerovalet, socio de Movepark: R$ 16,90 en plaza descubierta, con el precio cerrado al reservar. En estadías largas pagas menos por día: una semana sale R$ 83,30, o R$ 11,90 por día, y 30 días cuestan R$ 207,00, o R$ 6,90 por día. En Aeropark la misma plaza cuesta R$ 139,30 la semana y R$ 537,00 en 30 días. Precios del motor de reservas de Movepark, según la tabla de Aerovalet del 28 de octubre de 2026 y la de Aeropark del 19 de octubre de 2026. En los demás predios de la tabla la tarifa de entrada va de R$ 20,90 a R$ 40,80, según la consulta del 26 de noviembre de 2026, y el oficial entre R$ 22,00 en el sector Economy y R$ 100,00 en los sectores junto a la terminal, según el relevamiento de agosto de 2026.$faq$
from public.faq f
where f.id = i.faq_id
  and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-guarulhos'
  and i.locale = 'es'
  and md5(i.answer) = '39e9a06366bd847971762318b3e30393';
