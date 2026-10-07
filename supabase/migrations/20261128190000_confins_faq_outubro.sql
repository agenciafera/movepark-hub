-- FAQs de Confins com os números de outubro (Conteúdo 45, docs/specs/ataque-cnf-bepark.md).
--
-- As três donas de Confins passaram a citar os 11 pátios mapeados com o preço relido em
-- 07/10/2026 (migration 20261128180000). Estas FAQs de destino citam os mesmos fatos e não podem
-- contradizer as donas, nem a página "mais barato", que lê do mesmo banco.
--
-- O que muda, e por quê:
--
--   qual-o-estacionamento-mais-barato  Dizia "agosto de 2026" e dava o AeroPark como empatado na
--                                      menor diária. Em 07/10 o AeroPark subiu para R$ 22,00, e a
--                                      menor diária é só a do Auto Park Brasil.
--   quanto-custa-estacionar            Mesma correção, e a tabela ganha os pátios que faltavam.
--   vale-mais-a-pena-oficial-ou-particular
--                                      A coluna "Oficial com reserva" era 26,90 x dias (R$ 188,30,
--                                      R$ 403,50, R$ 807,00). R$ 26,90 é o "a partir de" do
--                                      Estapar no Zul+, outro pátio, e as outras três células eram
--                                      multiplicação, não preço publicado. O BH Airport publica a
--                                      semana com reserva de 72h a partir de R$ 189,00 e não
--                                      publica 15 nem 30 dias com reserva.
--   compensa-deixar-mais-dias, existe-estacionamento-mensal
--                                      Só a data (o motor do BePark foi conferido em 06/10).
--   o-que-e-a-premium-park             O endereço é em Confins, não em Lagoa Santa, e a distância
--                                      medida é 3,7 km (o operador declara 3 km).
--
-- Cada FAQ muda em pt, en e es juntas. Idempotente: grava valor fixo pelo slug.

-- ── qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-confins ───────────────────────

update public.faq set answer =
  'Em 7 de outubro de 2026, a menor diária perto do Aeroporto de Confins é a do Auto Park Brasil: '
  || 'R$ 20,00 na vaga descoberta, com traslado 24h grátis, a 3,1 km do terminal. Na semana, o menor '
  || 'total é o do Bandeira Park, R$ 125,93, e no mês, o do Auto Park Brasil, R$ 300,00. No pátio '
  || 'oficial, a semana com reserva de 72 horas sai por R$ 189,00.'
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = case i.locale
  when 'en' then 'On 7 October 2026, the lowest daily rate near Confins Airport is at Auto Park Brasil: '
    || 'R$ 20.00 for an uncovered spot, with a free 24h shuttle, 3.1 km from the terminal. For a week, '
    || 'the lowest total is at Bandeira Park, R$ 125.93, and for a month at Auto Park Brasil, R$ 300.00. '
    || 'At the official car park, a week booked 72 hours ahead costs R$ 189.00.'
  when 'es' then 'El 7 de octubre de 2026, la tarifa diaria más baja cerca del Aeropuerto de Confins es la '
    || 'de Auto Park Brasil: R$ 20,00 en plaza descubierta, con traslado gratis 24h, a 3,1 km de la '
    || 'terminal. Por semana, el menor total es el de Bandeira Park, R$ 125,93, y por mes, el de Auto '
    || 'Park Brasil, R$ 300,00. En el oficial, la semana reservada con 72 horas sale R$ 189,00.'
  else i.answer end
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-confins';

-- ── quanto-custa-estacionar-no-aeroporto-de-confins ───────────────────────────────────────

update public.faq set
  answer =
    'Perto do Aeroporto de Confins a diária dos lotes particulares começa em R$ 20,00 na vaga '
    || 'descoberta do Auto Park Brasil, com traslado grátis 24h. No BePark, parceiro Movepark, a '
    || 'diária avulsa da vaga coberta é R$ 45,00. No BH Airport a diária de balcão vai de R$ 60,00 a '
    || 'R$ 105,00, e a semana com reserva de 72 horas sai por R$ 189,00. Valores de outubro de 2026; '
    || 'o comparativo está abaixo.',
  body_md =
    E'Comparativo dos estacionamentos perto do Aeroporto de Confins (CNF):\n\n'
    || E'| Estacionamento | Diária a partir de | Como é |\n|---|---|---|\n'
    || E'| Auto Park Brasil | R$ 20,00 | Descoberta; coberta por R$ 27,90; mensal de R$ 300,00 na descoberta |\n'
    || E'| AeroPark Confins | R$ 22,00 | Descoberta; coberta por R$ 29,90; R$ 20,00 por dia de 7 dias em diante; traslado 24h |\n'
    || E'| Central Park | R$ 22,00 | Descoberta; coberta por R$ 29,00; mês congelado em R$ 320,00 |\n'
    || E'| Space Park | R$ 24,00 | Descoberta, de 2 diárias em diante; estadia de até 24h paga a tarifa mínima de R$ 40,00; coberta por R$ 32,00 |\n'
    || E'| Bandeira Park | R$ 24,99 | Descoberta, sem cupom; coberta por R$ 29,99; a 9,8 km, van a cada 30 minutos |\n'
    || E'| Estapar Aeroporto | R$ 26,90 | Diária mínima divulgada pelo Zul+; a 5,0 km |\n'
    || E'| Park Confins | R$ 35,00 | Vaga coberta, o pátio mais próximo do terminal, a 2,9 km |\n'
    || E'| Premium Park | R$ 45,00 | Vaga coberta; R$ 40,50 com reserva antecipada |\n'
    || E'| BePark (parceiro Movepark) | R$ 45,00 | Vaga coberta; 7 diárias por R$ 200,00 e 30 por R$ 400,00; van acompanhada ao vivo no celular |\n'
    || E'| Estacionamento do BH Airport | R$ 60,00 | Balcão do pátio Econômico 3; premium até R$ 105,00; semana com reserva de 72h a partir de R$ 189,00 |\n\n'
    || 'Os valores vêm dos canais públicos de cada estacionamento, consultados em 7 de outubro de 2026 '
    || '(o Estapar, em 2 de outubro), e podem mudar sem aviso. Os estacionamentos da região estão '
    || E'mapeados na página do [Aeroporto de Confins](/estacionamentos/aeroporto-confins). O preço do '
    || 'BePark vem do motor de reservas da Movepark e está na [página do BePark](/estacionamentos/aeroporto-confins/bepark).'
where slug = 'quanto-custa-estacionar-no-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = case i.locale
  when 'en' then 'Near Confins Airport the private lots start at R$ 20.00 a day for an uncovered spot at '
    || 'Auto Park Brasil, with a free 24h shuttle. At BePark, a Movepark partner, a single day in a '
    || 'covered spot costs R$ 45.00. At BH Airport the walk-up daily rate runs from R$ 60.00 to '
    || 'R$ 105.00, and a week booked 72 hours ahead costs R$ 189.00. October 2026 prices; the '
    || 'comparison is below.'
  when 'es' then 'Cerca del Aeropuerto de Confins los predios privados arrancan en R$ 20,00 por día en '
    || 'plaza descubierta de Auto Park Brasil, con traslado gratis 24h. En BePark, socio de Movepark, '
    || 'el día suelto en plaza cubierta cuesta R$ 45,00. En el BH Airport la tarifa de mostrador va de '
    || 'R$ 60,00 a R$ 105,00, y la semana reservada con 72 horas sale R$ 189,00. Precios de octubre de '
    || '2026; el comparativo está abajo.'
  else i.answer end
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'quanto-custa-estacionar-no-aeroporto-de-confins';

-- ── vale-mais-a-pena-o-estacionamento-oficial-de-confins-ou-um-particular ─────────────────

update public.faq set
  answer =
    'Depende de quantos dias. No balcão do BH Airport a diária vai de R$ 60,00 a R$ 105,00, e a '
    || 'semana no Econômico com reserva de 72 horas sai por R$ 189,00. No parceiro Movepark BePark a '
    || 'vaga coberta custa R$ 45,00 no dia avulso, R$ 200,00 na semana e R$ 400,00 no mês, o que dá '
    || 'R$ 13,33 por dia. Valores de outubro de 2026.',
  body_md =
    E'## Oficial ou particular em Confins\n\n'
    || 'O oficial fica dentro do aeroporto e cobra diária fixa. O particular exige traslado e trabalha '
    || E'com pacote, então o valor por dia despenca conforme a estadia cresce.\n\n'
    || E'### A conta por duração\n\n'
    || E'| Estadia | BePark (coberta) | Oficial, Econômico 3 no balcão | Oficial, Econômico com reserva de 72h |\n'
    || E'| --- | --- | --- | --- |\n'
    || E'| 1 diária | R$ 45,00 | R$ 60,00 | não se aplica |\n'
    || E'| 7 diárias | R$ 200,00 (R$ 28,57/dia) | R$ 420,00 | R$ 189,00 |\n'
    || E'| 15 diárias | R$ 400,00 (R$ 26,67/dia) | R$ 900,00 | não publicado |\n'
    || E'| 30 diárias | R$ 400,00 (R$ 13,33/dia) | R$ 1.800,00 | não publicado |\n\n'
    || 'Valores do motor de reservas da Movepark (06/10/2026) e da tabela do BH Airport (07/10/2026). '
    || 'Na diária solta, o BePark já fica abaixo do balcão do oficial. Na semana, o oficial reservado '
    || 'com 72 horas fica um pouco abaixo. De duas semanas em diante, o BePark abre distância, porque o '
    || E'pacote de 30 diárias custa o mesmo do de 15.\n\n'
    || E'### O que pesa além do preço?\n\n'
    || 'O BePark fica a 7,6 km do terminal, com van de cerca de 10 minutos e rastreio em tempo real. '
    || E'Quem vai passar poucas horas fora tende a preferir o oficial mesmo pagando mais.\n\n'
    || 'O comparativo da região está em [quanto custa estacionar no Aeroporto de Confins](/faq/quanto-custa-estacionar-no-aeroporto-de-confins).'
where slug = 'vale-mais-a-pena-o-estacionamento-oficial-de-confins-ou-um-particular' and scope = 'destination';

update public.faq_i18n i set answer = case i.locale
  when 'en' then 'It depends on how many days. At the BH Airport counter a day runs from R$ 60.00 to '
    || 'R$ 105.00, and a week at the Econômico lot booked 72 hours ahead costs R$ 189.00. At the '
    || 'Movepark partner BePark a covered spot costs R$ 45.00 for a single day, R$ 200.00 for a week '
    || 'and R$ 400.00 for a month, which works out at R$ 13.33 a day. October 2026 prices.'
  when 'es' then 'Depende de cuántos días. En el mostrador del BH Airport el día va de R$ 60,00 a '
    || 'R$ 105,00, y la semana en la playa Econômico reservada con 72 horas sale R$ 189,00. En el socio '
    || 'Movepark BePark la plaza cubierta cuesta R$ 45,00 por día suelto, R$ 200,00 por semana y '
    || 'R$ 400,00 por mes, lo que da R$ 13,33 por día. Precios de octubre de 2026.'
  else i.answer end
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'vale-mais-a-pena-o-estacionamento-oficial-de-confins-ou-um-particular';

-- ── compensa-deixar-o-carro-mais-dias-no-aeroporto-de-confins (só a data) ─────────────────

update public.faq set answer = replace(answer, 'Valores de setembro de 2026.', 'Valores de outubro de 2026.')
where slug = 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = replace(replace(i.answer,
    'September 2026 prices.', 'October 2026 prices.'),
    'Precios de septiembre de 2026.', 'Precios de octubre de 2026.')
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-confins';

-- ── existe-estacionamento-mensal-no-aeroporto-de-confins (só as datas) ────────────────────

update public.faq set
  answer = replace(answer, 'em 17 de setembro de 2026', 'em 6 de outubro de 2026'),
  body_md = replace(replace(body_md,
    'Conferido no motor de reservas em 17 de setembro de 2026.',
    'Conferido no motor de reservas em 6 de outubro de 2026.'),
    'consultada em 17 de setembro de 2026', 'consultada em 7 de outubro de 2026')
where slug = 'existe-estacionamento-mensal-no-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = replace(replace(i.answer,
    'on 17 September 2026', 'on 6 October 2026'),
    'el 17 de septiembre de 2026', 'el 6 de octubre de 2026')
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'existe-estacionamento-mensal-no-aeroporto-de-confins';

-- ── o-que-e-a-premium-park-no-aeroporto-de-confins ────────────────────────────────────────

update public.faq set answer =
  'É um estacionamento privado na Rodovia LMG-800, em Confins, a 3,7 km do terminal na nossa medição '
  || '(o operador declara 3 km), com 600 vagas cobertas e traslado gratuito 24 horas. Em 7 de outubro '
  || 'de 2026 o site do operador anunciava diária de R$ 45,00, ou R$ 40,50 com reserva antecipada, e '
  || 'semana de R$ 180,00, ou R$ 162,00 com desconto.'
where slug = 'o-que-e-a-premium-park-no-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = case i.locale
  when 'en' then 'It is a private car park on the LMG-800 road in Confins, 3.7 km from the terminal by '
    || 'our measurement (the operator says 3 km), with 600 covered spaces and a free 24-hour shuttle. '
    || 'On 7 October 2026 the operator''s site advertised a daily rate of R$ 45.00, or R$ 40.50 with an '
    || 'advance booking, and a week at R$ 180.00, or R$ 162.00 with the discount.'
  when 'es' then 'Es un estacionamiento privado en la ruta LMG-800, en Confins, a 3,7 km de la terminal '
    || 'según nuestra medición (el operador declara 3 km), con 600 plazas cubiertas y traslado gratuito '
    || 'las 24 horas. El 7 de octubre de 2026 el sitio del operador anunciaba tarifa diaria de R$ 45,00, '
    || 'o R$ 40,50 con reserva anticipada, y semana de R$ 180,00, o R$ 162,00 con descuento.'
  else i.answer end
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'o-que-e-a-premium-park-no-aeroporto-de-confins';

-- ── quanto-custa-o-estacionamento-de-moto-no-aeroporto-de-confins (só a data) ─────────────
-- A tabela do BH Airport foi relida em 07/10/2026 e o Pátio Motos segue a R$ 10,00 por 30
-- minutos e R$ 30,00 a diária.

update public.faq set answer = replace(answer,
    'consultado no site oficial em 17 de setembro de 2026', 'consultado no site oficial em 7 de outubro de 2026')
where slug = 'quanto-custa-o-estacionamento-de-moto-no-aeroporto-de-confins' and scope = 'destination';

update public.faq_i18n i set answer = regexp_replace(regexp_replace(i.answer,
    '17 September 2026', '7 October 2026'),
    '17 de septiembre de 2026', '7 de octubre de 2026')
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'quanto-custa-o-estacionamento-de-moto-no-aeroporto-de-confins';
