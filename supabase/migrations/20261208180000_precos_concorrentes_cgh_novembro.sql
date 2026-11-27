-- Preço pesquisado de Congonhas reconferido em 27/11/2026 (rotina semanal de busca e IA, item 2:
-- docs/specs/rotina-semanal-busca-e-ia.md). Mesma regra de 20261208150000 (Guarulhos).
--
-- O que mudou desde 09/10:
--
--   The Parking     A partir de R$ 35,00 (era R$ 30,00), carro, vaga coberta com traslado, reserva
--                   antecipada pelo WhatsApp. O cartão de R$ 25,00 sem traslado não diz para que
--                   veículo é: não entra.
--   MultiPark       R$ 45,00 com reserva online e R$ 55,00 no balcão (eram R$ 39,00 e R$ 50,00).
--   Grand Parking   O preço passou a variar por data e com a demanda. Simulação no motor oficial em
--                   27/11, entrada em 01/12/2026, descoberta deixando a chave: diária base R$ 34,00
--                   mais acréscimo do dia (R$ 4,99 de segunda a quinta, R$ 10,00 de sexta a domingo,
--                   R$ 14,99 de 24 a 30/12), desconto de 2% a partir de 1 diária, 5% de 7, 10% de 15 e
--                   50% de 30, e taxa de serviço 0% (era 20% com teto de R$ 50,00). Totais:
--                   R$ 38,21 / 273,56 / 553,42 / 642,39 (eram 40,00 / 285,00 / 560,00 / 1.070,00).
--   Iguais, só ganham a data: Express Parking, One Parking, e Arai Park (segue suspenso).
--   Congonhas Park  O site abriu em branco em 27/11 (e o robô foi recusado). O valor de 09/10 fica
--                   até vencer pela regra dos 90 dias; a tentativa entra como `failed`.
--
-- As FAQs "quanto custa" e "qual o mais barato" de Congonhas acompanham em pt, en e es, com trava de
-- md5. Os quatro posts que citam esses lotes vão numa migration própria.

with leitura(slug, url, d1, d7, d15, d30, evidencia, fonte) as (
  values
  ('the-parking', 'https://theparking.com.br/aeroporto-congonhas/',
   35.00, null::numeric, null::numeric, null::numeric,
   'Tabela On-line - Valores válidos mediante reserva antecipada via WhatsApp | Translado Gratuito para aeroporto de Congonhas (ida e volta) | Vagas Cobertas | a partir de R$ 35,00 | Horário de funcionamento Das 4:00 hs às 23:59 hs.',
   'Site do The Parking, consultado em 27/11/2026. Diária de carro a partir de R$ 35,00, vaga coberta com traslado gratuito ida e volta, válida com reserva antecipada pelo WhatsApp; pagamento só na saída. Não publica pacote. O pátio abre das 4h às 23h59.'),
  ('multipark', 'https://www.multipark.com.br/aeroporto-congonhas-multipark',
   45.00, null, null, null,
   'apenas R$45,00/dia para reservas online e R$55,00/dia no balcão | Diária apenas R$ 45,00 (por tempo limitado)',
   'Site do MultiPark (unidade Congonhas), consultado em 27/11/2026. Vaga coberta: R$ 45,00 por dia com reserva online, por tempo limitado, e R$ 55,00 no balcão. Não publica pacote.'),
  ('grand-parking', 'https://controle.grandparking.com.br/primeira-reserva',
   38.21, 273.56, 553.42, 642.39,
   'Veículo (Passeio) -> R$ 34,00 | Vaga (Descoberta - deixa a chave) -> R$ 0,00 | Valor com acréscimo 01/12/2026 -> R$ 38,99 (+R$ 4,99) | Desconto por diárias 2% a partir de 1 diária / 5% a partir de 7 / 10% a partir de 15 / 50% a partir de 30 | Taxa de serviço 0% | Total a pagar R$ 38,21 (1 dia), R$ 273,56 (7), R$ 553,42 (15), R$ 642,39 (30)',
   'Motor de reserva oficial do Grand Parking, simulado em 27/11/2026 sem enviar reserva, com entrada em 01/12/2026, vaga descoberta deixando a chave, carro de passeio. O preço varia por data e com a demanda: diária base R$ 34,00 mais acréscimo do dia (R$ 4,99 de segunda a quinta, R$ 10,00 de sexta a domingo, R$ 14,99 de 24 a 30/12), desconto progressivo e sem taxa de serviço. Coberta custa R$ 10,00 a mais por dia.'),
  ('express-parking', 'https://expressestacionamento.com.br/',
   40.00, null, 600.00, 600.00,
   'DIÁRIA Vaga Coberta Carro Pequeno R$40,00 Carro Grande R$45,00 | De 15 a 30 dias Vaga Coberta R$600,00',
   'Site do Express Parking, consultado em 27/11/2026. Vaga coberta, carro pequeno: R$ 40,00 a diária (carro grande R$ 45,00) e R$ 600,00 fixos para qualquer estadia de 15 a 30 dias. Não publica pacote de 7 dias.'),
  ('one-parking', 'https://oneparkingcongonhas.com/',
   45.00, null, null, null,
   'cARRO PEQUENO E SUV Diária - R$45,00 Por hora - R$15,00 | caminhonete Diária - R$50,00 | mensalista Carro - R$300',
   'Site do One Parking, consultado em 27/11/2026. Carro pequeno e SUV: R$ 45,00 a diária, hora R$ 15,00; caminhonete R$ 50,00. Não publica pacote; mensal R$ 300,00.'),
  ('arai-park', 'https://araipark.com.br/',
   null, null, null, null,
   'a partir do dia 15/05/2026, nosso serviço de estacionamento estará temporariamente inativo',
   'Site do Arai Park, consultado em 27/11/2026: operação segue temporariamente inativa desde 15/05/2026. A tabela de R$ 35,00 continua no site, mas o pátio não está operando, então nenhum preço é publicado.')
),
lote as (
  select p.id, l.*
  from leitura l
  join public.destination d on d.slug = 'aeroporto-de-congonhas'
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, case when d1 is null then 'failed' else 'applied' end, url,
         (date '2026-11-27' + time '10:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual de CGH, rotina semanal', now(),
         'Aplicado na migration 20261208180000, leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-11-27'
      and r.notes = 'Releitura manual de CGH, rotina semanal'
  )
  returning 1
)
update public.prospect_location p
set researched_daily_brl    = l.d1,
    researched_weekly_brl   = l.d7,
    researched_biweekly_brl = l.d15,
    researched_monthly_brl  = l.d30,
    researched_at           = date '2026-11-27',
    research_source         = l.fonte,
    last_reviewed_at        = now()
from lote l
where p.id = l.id;

insert into public.prospect_price_research (
  prospect_location_id, status, source_url, fetched_at, model, notes, decided_at, decision_note
)
select p.id, 'failed', 'https://congonhaspark.com.br/',
       (date '2026-11-27' + time '10:00') at time zone 'America/Sao_Paulo',
       'claude-opus-5-5', 'Releitura manual de CGH, rotina semanal', now(),
       'O site abriu em branco no navegador e recusou o robô em 27/11/2026. O preço de 09/10 segue até vencer.'
from public.prospect_location p
join public.destination d on d.id = p.destination_id
where d.slug = 'aeroporto-de-congonhas' and p.public_slug = 'congonhas-park'
  and not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = p.id and r.status = 'failed'
      and r.notes = 'Releitura manual de CGH, rotina semanal'
  );

-- FAQ "quanto custa" de Congonhas.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Congonhas (CGH):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Aerovalet (parceiro Movepark)** | R$ 28,90 | Vaga coberta a 738 m do terminal, sem estadia mínima; R$ 25,90 por dia de 7 a 16 diárias, R$ 19,90 de 17 a 29 e R$ 14,90 a partir de 30 |
| **Plenty Park (parceiro Movepark)** | R$ 31,90 | Vaga coberta a 863 m do terminal, com mínimo de 3 diárias; R$ 27,90 por dia de 7 a 14 diárias, R$ 26,90 de 15 a 29 e R$ 16,90 a partir de 30 |
| The Parking | R$ 35,00 | Reserva pelo WhatsApp e traslado gratuito; o pátio abre das 4h às 23h59, não é 24 horas |
| Grand Parking | R$ 38,21 | O preço muda por data e com a procura: é a simulação de 1 diária com entrada em 1º de dezembro, vaga descoberta deixando a chave. Não cobra mais taxa de serviço |
| Congonhas Park | R$ 40,00 | Reservando pelo WhatsApp; a diária cheia sai R$ 45,00 |
| Express Parking | R$ 40,00 | Carro pequeno; carro grande sai R$ 45,00. Estadia de 15 a 30 dias por R$ 600,00 fixos |
| Edifício-garagem oficial (Estapar) | R$ 44,90 | Com reserva antecipada; o preço muda conforme a procura |
| MultiPark | R$ 45,00 | Com reserva online, por tempo limitado; no balcão a mesma diária sai R$ 55,00 |
| One Parking | R$ 45,00 | Carro e SUV. Publica também hora avulsa, R$ 15,00 |

Os valores dos estacionamentos sem reserva pela Movepark vêm do site de cada um, conferidos em 27 de novembro de 2026, e podem mudar sem aviso. O do Congonhas Park é de 9 de outubro, porque o site dele estava fora do ar na conferência. O Facility só informa o preço depois de um cadastro, e o Arai Park segue com a operação suspensa desde maio de 2026. O preço do parceiro Movepark sai do motor de reservas (Aerovalet na tabela de 28/10/2026, Plenty Park na de 17/11/2026) e fica sempre atualizado na [tabela de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas'
  and scope = 'destination'
  and md5(body_md) = '9d0dbeb80b66850336854be5ac63ac30';

update public.faq
set answer = $faq$Perto do Aeroporto de Congonhas, a Aerovalet, parceira Movepark, cobra R$ 28,90 no dia avulso em vaga coberta, R$ 25,90 por dia de 7 a 16 diárias, R$ 19,90 de 17 a 29 e R$ 14,90 a partir de 30. A Plenty Park, também parceira, cobra R$ 31,90 por dia com mínimo de 3 diárias, R$ 27,90 de 7 a 14, R$ 26,90 de 15 a 29 e R$ 16,90 a partir de 30. As duas ficam a menos de 900 m do terminal. No edifício-garagem oficial a diária com reserva estava em R$ 44,90. Entre os demais lotes que abrem tarifa, o mais barato é o The Parking, a R$ 35,00, e os mais caros são o MultiPark e o One Parking, a R$ 45,00. Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026; os dos demais, de 27 de novembro de 2026.$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas'
  and scope = 'destination'
  and md5(answer) = '338cc3a7c308cdca391a107c802676a5';

update public.faq_i18n i
set answer = $faq$Near Congonhas Airport, Aerovalet, a Movepark partner, charges R$ 28.90 for a single day in a covered spot, R$ 25.90 a day for 7 to 16 days, R$ 19.90 for 17 to 29 and R$ 14.90 from 30 days up. Plenty Park, also a partner, charges R$ 31.90 a day with a 3-day minimum, R$ 27.90 for 7 to 14 days, R$ 26.90 for 15 to 29 and R$ 16.90 from 30 days up. Both sit less than 900 m from the terminal. At the official garage building an advance booking was R$ 44.90 a day. Among the other lots that publish rates, the cheapest is The Parking at R$ 35.00 and the dearest are MultiPark and One Parking at R$ 45.00. Aerovalet prices from its 28/10/2026 table and Plenty Park prices from its 17/11/2026 table; the others on 27 November 2026.$faq$
from public.faq f
where f.id = i.faq_id and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas'
  and i.locale = 'en' and md5(i.answer) = '2d73b95c934355bb795f20d8169efc22';

update public.faq_i18n i
set answer = $faq$Cerca del Aeropuerto de Congonhas, Aerovalet, socio Movepark, cobra R$ 28,90 por día suelto en plaza cubierta, R$ 25,90 por día de 7 a 16 días, R$ 19,90 de 17 a 29 y R$ 14,90 a partir de 30. Plenty Park, también socio, cobra R$ 31,90 por día con mínimo de 3 días, R$ 27,90 de 7 a 14, R$ 26,90 de 15 a 29 y R$ 16,90 a partir de 30. Los dos quedan a menos de 900 m de la terminal. En el edificio garaje oficial la reserva anticipada estaba en R$ 44,90 por día. Entre los demás predios que publican tarifa, el más barato es The Parking a R$ 35,00 y los más caros son MultiPark y One Parking a R$ 45,00. Precios de Aerovalet según su tabla del 28/10/2026 y de Plenty Park según la del 17/11/2026; los demás, el 27 de noviembre de 2026.$faq$
from public.faq f
where f.id = i.faq_id and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas'
  and i.locale = 'es' and md5(i.answer) = '816cbb821bd9c82cf65d2947911b0ed2';

-- FAQ "qual o mais barato" de Congonhas.
update public.faq
set answer = $faq$A menor diária perto de Congonhas é a da Aerovalet, parceira Movepark: R$ 28,90 no dia avulso, em vaga coberta e com preço fechado na reserva online, na tabela de 28/10/2026. Entre os lotes sem reserva pela Movepark, na leitura de 27 de novembro de 2026, a menor diária publicada era a do The Parking, R$ 35,00, com reserva pelo WhatsApp e pátio aberto das 4h às 23h59, e para estadias de 15 a 30 dias o Express Parking cobrava R$ 600,00 fixos, mais do que a Aerovalet cobra em qualquer duração desse intervalo. A Plenty Park, também parceira, cobra de R$ 31,90 a R$ 16,90 por dia, conforme a estadia, com mínimo de 3 diárias, na tabela de 17/11/2026. O edifício-garagem oficial cobrava R$ 44,90 com reserva.$faq$
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas'
  and scope = 'destination'
  and md5(answer) = '5fc1ca9625a964efa6d21d9e2d01784f';

update public.faq_i18n i
set answer = $faq$The lowest daily rate near Congonhas is Aerovalet, a Movepark partner: R$ 28.90 for a single day, in a covered spot with the price locked at online booking, on its 28/10/2026 table. Among the lots not booked through Movepark, in the 27 November 2026 reading, the lowest published daily rate was The Parking, R$ 35.00, booked over WhatsApp, with the lot open from 4 am to 11:59 pm, and for stays of 15 to 30 days Express Parking charged a flat R$ 600.00, more than Aerovalet charges for any length in that range. Plenty Park, also a partner, charges from R$ 31.90 down to R$ 16.90 a day depending on the stay, with a 3-day minimum, on its 17/11/2026 table. The official garage building charged R$ 44.90 with a booking.$faq$
from public.faq f
where f.id = i.faq_id and f.slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas'
  and i.locale = 'en' and md5(i.answer) = '66660b2a12e54bb7b52d1b0041804b71';

update public.faq_i18n i
set answer = $faq$La tarifa diaria más baja cerca de Congonhas es la de Aerovalet, socio Movepark: R$ 28,90 por día suelto, en plaza cubierta y con precio cerrado en la reserva en línea, según su tabla del 28/10/2026. Entre los predios sin reserva por Movepark, según el relevamiento del 27 de noviembre de 2026, la tarifa diaria más baja publicada era la de The Parking, R$ 35,00, con reserva por WhatsApp y predio abierto de 4h a 23h59, y para estadías de 15 a 30 días Express Parking cobraba R$ 600,00 fijos, más de lo que cobra Aerovalet en cualquier duración de ese intervalo. Plenty Park, también socio, cobra de R$ 31,90 a R$ 16,90 por día según la estadía, con mínimo de 3 días, según su tabla del 17/11/2026. El edificio garaje oficial cobraba R$ 44,90 con reserva.$faq$
from public.faq f
where f.id = i.faq_id and f.slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas'
  and i.locale = 'es' and md5(i.answer) = '5deba07d19d5735260d73c02f496aeda';
