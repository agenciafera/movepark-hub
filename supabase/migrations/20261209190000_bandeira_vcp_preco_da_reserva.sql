-- Bandeira Park (Viracopos): o preço da página passa a ser o que a reserva cobra. 27/11/2026.
--
-- O site bandeirapark.com.br anuncia R$ 18,49 a diária e a tabela progressiva 13,31 / 10,18 /
-- 7,98, mas o sistema de reserva para onde o próprio site encaminha (xpark, src=bandeira) cobra
-- outro valor. Cotado em 27/11/2026 para entrada em 01/12/2026 às 12h, vaga descoberta:
--   1 = R$ 24,99   7 = R$ 125,93   15 = R$ 233,87   30 = R$ 323,82
--   coberta: 1 = R$ 37,49, 7 = R$ 188,93, 15 = R$ 350,75, 30 = R$ 388,60
-- É a mesma tabela que o sistema cobra da MultiPark, que divide o pátio. Vale o que o cliente
-- paga; o número do site fica registrado na fonte.
--
-- Junto: a FAQ "quanto custa" troca a linha do Bandeira, e a FAQ "qual o mais barato" (pt, en,
-- es), que apontava o Bandeira como a menor diária, passa a apontar o Ouro Park na avulsa e a
-- Aerovalet na estadia longa. Toda escrita com trava de md5.

update public.prospect_location
   set researched_daily_brl = 24.99,
       researched_weekly_brl = 125.93,
       researched_biweekly_brl = 233.87,
       researched_monthly_brl = 323.82,
       researched_at = date '2026-11-27',
       research_source = 'Sistema de reserva para onde o site bandeirapark.com.br encaminha (xpark), consultado em 27/11/2026 para entrada em 01/12/2026, vaga descoberta: 1 = R$ 24,99, 7 = R$ 125,93, 15 = R$ 233,87, 30 = R$ 323,82; coberta 1 = R$ 37,49, 30 = R$ 388,60. O site ainda anuncia R$ 18,49 a diária (13,31 / 10,18 / 7,98 por faixa), valor que a reserva não cobra. Mesmo pátio da Aerovalet e da MultiPark.',
       last_reviewed_at = now()
 where public_slug = 'bandeira-park'
   and researched_daily_brl = 18.49
   and destination_id = (select id from public.destination where slug = 'aeroporto-de-viracopos');

-- FAQ "quanto custa": linha do Bandeira e nota do site.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Viracopos (VCP):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Virapark (parceiro Movepark)** | R$ 40,00 | Vaga coberta com traslado 24h; R$ 29,90 por dia a partir de 7 diárias |
| **Garageinn (parceiro Movepark)** | R$ 59,99 | A 979 m do terminal, preço fechado na reserva online |
| Ouro Park | R$ 13,99 | Descoberta, self park, mesma diária em qualquer duração; a coberta sai R$ 25,99 |
| Aerovalet Viracopos | R$ 18,49 | Descoberta com reserva online; 30 diárias por R$ 239,62 |
| Bandeira Park | R$ 24,99 | Descoberta com reserva online; 7 diárias por R$ 125,93 e 30 por R$ 323,82 |
| MultiPark Viracopos | R$ 24,99 | Descoberta com reserva online; 7 diárias por R$ 125,93 e coberta a R$ 37,49 |
| Yellow Parking | R$ 24,99 | Descoberta; de 13 a 17 diárias, R$ 260,00 fechados |
| Viracopos Aeroparking | R$ 29,70 | Descoberta com reserva online; no local, R$ 33,00 |
| Estacionamento oficial (Estapar) | R$ 31,00 | Bolsão econômico F, descoberto; o edifício garagem sai R$ 83,00 |
| BR Parking | R$ 40,00 | Só vaga coberta, com reserva online; no local, R$ 45,00 |

Os valores dos estacionamentos sem reserva online vêm do site de cada um e do sistema de reserva para onde ele encaminha, conferidos entre 26 e 27 de novembro de 2026, e podem mudar sem aviso. Quando os dois divergem, vale o que a reserva cobra: o site do Bandeira Park ainda anuncia R$ 18,49 a diária, e a reserva cobra R$ 24,99. Bandeira Park, Aerovalet e MultiPark dividem o mesmo pátio, na R. Antônio Luchiari, 1100, e cada marca cobra a sua tabela. O Ouro Park ocupa o endereço onde funcionava o KM64. Quatro pátios do entorno (JF Parking, Aero Viracopos, Pórtico e Eco22) não divulgam tarifa em canal nenhum, por isso não aparecem com número. O preço do parceiro Movepark sai do motor de reservas e fica sempre atualizado na [tabela de preços de Viracopos](/estacionamentos/aeroporto-viracopos/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Viracopos](/estacionamentos/aeroporto-viracopos).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(body_md) = 'ea53b5a5055d10df037eda3486942fad';

-- FAQ "qual o mais barato": o Bandeira deixa de ser a menor diária.
update public.faq
set answer = 'Na conferência de 27/11/2026, a menor diária avulsa perto de Viracopos é a do Ouro Park: R$ 13,99 na vaga descoberta, o mesmo valor em qualquer duração. Para estadia longa, a Aerovalet Viracopos fecha 30 diárias por R$ 239,62 na reserva online, cerca de R$ 7,99 por dia. Em vaga coberta, o Virapark fecha R$ 29,90 por dia a partir de 7 diárias pelo motor de reservas, na tabela de 20/10/2026, com traslado 24h. Dentro do complexo, o Garageinn cobra R$ 59,99 por um dia só e R$ 45,90 por dia a partir de duas diárias, na tabela de 12/11/2026.'
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(coalesce(answer, '')) = 'b42a11a8af5c54ad5526849728ea01d3';

update public.faq_i18n fi
set answer = 'In our 27 November 2026 check, the lowest single-day rate near Viracopos is Ouro Park: R$ 13.99 for an uncovered spot, the same rate for any length of stay. For long stays, Aerovalet Viracopos charges R$ 239.62 for 30 days with online booking, about R$ 7.99 a day. For a covered spot, Virapark comes to R$ 29.90 a day from 7 days up through the booking engine, on its 20 October 2026 table, with a 24h shuttle. Inside the complex, Garageinn charges R$ 59.99 for a single day and R$ 45.90 a day from two days up, on its 12 November 2026 table.'
where fi.locale = 'en'
  and fi.slug = 'cheapest-parking-near-viracopos-airport'
  and md5(coalesce(fi.answer, '')) = '51d60f438a4bb8d1c36b10298f7f6141';

update public.faq_i18n fi
set answer = 'En la verificación del 27 de noviembre de 2026, la tarifa diaria suelta más baja cerca de Viracopos es la de Ouro Park: R$ 13,99 en plaza descubierta, el mismo valor en cualquier duración. Para estadías largas, Aerovalet Viracopos cierra 30 días por R$ 239,62 con reserva online, cerca de R$ 7,99 por día. En plaza cubierta, Virapark cierra R$ 29,90 por día a partir de 7 días por el motor de reservas, según su tabla del 20 de octubre de 2026, con traslado 24h. Dentro del complejo, Garageinn cobra R$ 59,99 por un solo día y R$ 45,90 por día a partir de dos días, según su tabla del 12 de noviembre de 2026.'
where fi.locale = 'es'
  and fi.slug = 'estacionamiento-mas-barato-cerca-del-aeropuerto-de-viracopos'
  and md5(coalesce(fi.answer, '')) = '9365fbef86c2ddba1ee2ef0796ff62ba';
