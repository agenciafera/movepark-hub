-- Preço pesquisado de Viracopos reconferido em 26/11/2026 (rotina semanal de busca e IA, item 2:
-- docs/specs/rotina-semanal-busca-e-ia.md). Mesma regra de 20261208150000 (Guarulhos).
--
-- O que mudou:
--
--   Bandeira Park     Faixas publicadas hoje: R$ 18,49 por dia de 1 a 6, R$ 13,31 a partir de 7,
--                     R$ 10,18 a partir de 17, R$ 7,98 a partir de 31. 15 dias caem na de 7+
--                     (R$ 199,65) e 30 na de 17+ (R$ 305,40). A ficha tinha R$ 152,70 e R$ 239,40,
--                     de 08/09.
--   BR Parking        O pátio passou a ser só de vaga coberta, R$ 40,00 por dia online (R$ 45,00 no
--                     local), sem escalonamento: a diária é integral e passa de 12h adicionais vira
--                     outra diária. 7 = R$ 280,00, 15 = R$ 600,00, 30 = R$ 1.200,00. Era descoberta a
--                     R$ 30,00.
--   Viracopos         O site monta o número por CSS (por isso a leitura de outubro não trocou a
--   Aeroparking       diária). O sistema de reserva rotula: "Descoberta - R$33,00/dia", "Coberta -
--                     R$38,00/dia". Vale o sistema de reserva, onde a reserva fecha. Era R$ 34,70.
--   Yellow Parking    Diária R$ 24,99 e pacotes fechados por faixa: 13 a 17 diárias R$ 260,00 e 18 a
--                     30 R$ 285,00. Não publica 7 dias: sai o R$ 174,93, que era diária x 7.
--   Estapar oficial   Igual: bolsão F R$ 31,00 (edifício garagem R$ 83,00).
--   KM64              O domínio km64.com.br não resolve (DNS) em 26/11. Não há leitura nova: o valor
--                     de 09/10 fica até vencer pela regra dos 90 dias, e a tentativa entra como
--                     `failed` no histórico.
--   Aero Viracopos,   Não divulgam tarifa (conferido em 22/09); não foram relidos.
--   Pórtico, Eco22
--
-- A FAQ "quanto custa" de Viracopos acompanha em pt, en e es, com trava de md5. Os 17 posts e 12
-- traduções que citam os valores antigos ficam para uma migration própria (lista na spec).
--
-- Idempotente: grava valor fixo e só registra histórico se ainda não houver leitura do lote no dia.

with leitura(slug, url, d1, d7, d15, d30, evidencia, fonte) as (
  values
  ('bandeira-park', 'https://www.bandeirapark.com.br/estacionamento-aeroporto-viracopos',
   18.49, 93.17::numeric, 199.65::numeric, 305.40::numeric,
   'No Bandeira Park VCP, a diária com reserva online sai por R$ 18,49 (vaga descoberta) e a tabela é progressiva: 7 dias, R$ 13,31/dia; 17 dias, R$ 10,18/dia; 31 dias, R$ 7,98/dia. Preços conferidos em 17/11/2026.',
   'Site do Bandeira Park (VCP), consultado em 26/11/2026. Vaga descoberta com reserva online: R$ 18,49 por dia de 1 a 6 dias, R$ 13,31 a partir de 7 (7 = R$ 93,17, 15 = R$ 199,65), R$ 10,18 a partir de 17 (30 = R$ 305,40) e R$ 7,98 a partir de 31. Coberta R$ 27,74 a diária.'),
  ('br-parking', 'https://viracopos.brparking.com.br/',
   40.00, 280.00, 600.00, 1200.00,
   'Vaga Coberta (Local) R$ 45,00 Diária | Vaga Coberta (Online) R$ 40,00 Diária online | A primeira diária de 24h é cobrada integralmente, mesmo para estadias menores. Após 24h, horas adicionais até 12h são cobradas pela tarifa horária; acima de 12h adicionais, será gerada uma nova diária integral.',
   'Site do BR Parking (VCP), consultado em 26/11/2026. Só vaga coberta: R$ 40,00 a diária com reserva online e R$ 45,00 no local, sem desconto por volume; passando de 12h adicionais, conta outra diária (7 = R$ 280,00, 15 = R$ 600,00, 30 = R$ 1.200,00).'),
  ('viracopos-aeroparking', 'https://reserva.viracoposaeroparking.com.br/',
   33.00, null, null, null,
   'Tipo de vaga (Coberta/Descoberta) Coberta - R$38,00/dia Descoberta - R$33,00/dia',
   'Sistema de reserva do Viracopos Aeroparking, consultado em 26/11/2026. Vaga descoberta R$ 33,00 por dia e coberta R$ 38,00. A home do site mostra outros valores montados por CSS; vale o sistema onde a reserva fecha. Não publica pacote por duração.'),
  ('yellow-parking', 'https://yellowparking.com.br/yellow-parking-estacionamento-viracopos/',
   24.99, null, 260.00, 285.00,
   'Diária Coberta R$ 29,99 | Diária Descoberta R$ 24,99 | 13 - 17 = R$ 350,00 18 - 30 = R$ 395,00 | 13 - 17 = R$ 260,00 18 - 30 = R$ 285,00',
   'Site do Yellow Parking (Viracopos), consultado em 26/11/2026. Vaga descoberta R$ 24,99 a diária e pacotes fechados de 13 a 17 diárias (R$ 260,00) e de 18 a 30 (R$ 285,00); coberta R$ 29,99, R$ 350,00 e R$ 395,00. Não publica preço de 7 diárias.'),
  ('estapar-oficial', 'https://www.viracopos.com/pt_br/passageiro/estacionamento.htm',
   31.00, null, null, null,
   'Rotativo bolsão "F" - diária R$ 31,00 | Preço edg Até 1 diária R$ 83,00',
   'Site do Aeroporto de Viracopos, consultado em 26/11/2026. Bolsão F (econômico): R$ 31,00 a diária no balcão; edifício garagem R$ 83,00. Não publica pacote para o bolsão.')
),
lote as (
  select p.id, l.*
  from leitura l
  join public.destination d on d.slug = 'aeroporto-de-viracopos'
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', url,
         (date '2026-11-26' + time '16:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual de VCP, rotina semanal', now(),
         'Aplicado na migration 20261208160000, leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-11-26'
      and r.notes = 'Releitura manual de VCP, rotina semanal'
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

-- KM64: tentativa sem leitura, para o painel saber por que a ficha vai vencer.
insert into public.prospect_price_research (
  prospect_location_id, status, source_url, fetched_at, model, notes, decided_at, decision_note
)
select p.id, 'failed', 'https://km64.com.br/',
       (date '2026-11-26' + time '16:00') at time zone 'America/Sao_Paulo',
       'claude-opus-5-5', 'Releitura manual de VCP, rotina semanal', now(),
       'O domínio km64.com.br não resolveu (DNS) em 26/11/2026. O preço de 09/10 segue até vencer.'
from public.prospect_location p
join public.destination d on d.id = p.destination_id
where d.slug = 'aeroporto-de-viracopos' and p.public_slug = 'km64'
  and not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = p.id
      and r.status = 'failed'
      and r.notes = 'Releitura manual de VCP, rotina semanal'
  );

-- FAQ "quanto custa" de Viracopos.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Viracopos (VCP):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Virapark (parceiro Movepark)** | R$ 40,00 | Vaga coberta com traslado 24h; R$ 29,90 por dia a partir de 7 diárias |
| **Garageinn (parceiro Movepark)** | R$ 59,99 | A 979 m do terminal, preço fechado na reserva online |
| Bandeira Park | R$ 18,49 | Descoberta com reserva online; a diária cai para R$ 13,31 a partir de 7 dias |
| KM64 | R$ 19,00 | Descoberta, diária promocional |
| Yellow Parking | R$ 24,99 | Descoberta; de 13 a 17 diárias, R$ 260,00 fechados |
| Estacionamento oficial (Estapar) | R$ 31,00 | Bolsão econômico F, descoberto; o edifício garagem sai R$ 83,00 |
| Viracopos Aeroparking | R$ 33,00 | Descoberta no sistema de reserva; a coberta sai R$ 38,00 |
| BR Parking | R$ 40,00 | Só vaga coberta, com reserva online; no local, R$ 45,00 |

Os valores dos estacionamentos sem reserva online vêm do site de cada um, conferidos em 26 de novembro de 2026, e podem mudar sem aviso. O do KM64 é de 9 de outubro, porque o site dele estava fora do ar na conferência. Três pátios do entorno (Aero Viracopos, Pórtico e Eco22) não divulgam tarifa em canal nenhum, por isso não aparecem com número. O preço do parceiro Movepark sai do motor de reservas e fica sempre atualizado na [tabela de preços de Viracopos](/estacionamentos/aeroporto-viracopos/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Viracopos](/estacionamentos/aeroporto-viracopos).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(body_md) = '4bc1103fe8e62becdf77cd19a494140f';

update public.faq
set answer = $faq$Em Viracopos, a diária do parceiro Movepark Virapark é R$ 40,00 em vaga coberta com traslado 24h, caindo para R$ 29,90 por dia a partir de 7 diárias. O parceiro Garageinn, dentro do complexo do aeroporto, cobra R$ 59,99 por um dia só e R$ 45,90 por dia a partir de duas diárias. No oficial, o bolsão F custa R$ 31,00 e o edifício garagem R$ 83,00. Preços do Virapark na tabela de 20 de outubro de 2026, do Garageinn na de 12 de novembro de 2026, e os demais conferidos em 26 de novembro de 2026. A tabela abaixo compara os principais.$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(answer) = '98e582643b9088cd0d8a55d86da9f2b5';

update public.faq_i18n i
set answer = $faq$At Viracopos, the Movepark partner Virapark charges R$ 40.00 a day for a covered spot with a 24h shuttle, dropping to R$ 29.90 a day from 7 days up. The partner Garageinn, inside the airport complex, charges R$ 59.99 for a single day and R$ 45.90 a day from two days up. At the official car park, lot F costs R$ 31.00 and the garage building R$ 83.00. Virapark prices from its 20 October 2026 table, Garageinn from its 12 November 2026 table, and the others checked on 26 November 2026. The table below compares the main ones.$faq$
from public.faq f
where f.id = i.faq_id
  and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and i.locale = 'en'
  and md5(i.answer) = '83708909e48c8ac121049889c881aa30';

update public.faq_i18n i
set answer = $faq$En Viracopos, el socio Movepark Virapark cobra R$ 40,00 por día en plaza cubierta con traslado 24h, y baja a R$ 29,90 por día a partir de 7 días. El socio Garageinn, dentro del complejo del aeropuerto, cobra R$ 59,99 por un solo día y R$ 45,90 por día a partir de dos días. En el oficial, la playa F cuesta R$ 31,00 y el edificio garaje R$ 83,00. Precios de Virapark según su tabla del 20 de octubre de 2026, de Garageinn según la del 12 de noviembre de 2026, y los demás verificados el 26 de noviembre de 2026. La tabla de abajo compara los principales.$faq$
from public.faq f
where f.id = i.faq_id
  and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and i.locale = 'es'
  and md5(i.answer) = 'a3b58dd2c1e63de15619d2688dd80e1e';
