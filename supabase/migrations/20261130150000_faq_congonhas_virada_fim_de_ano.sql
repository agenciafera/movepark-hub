-- Congonhas: as FAQs de preço passam à tabela de fim de ano da Aerovalet e da Plenty Park.
--
-- A Aerovalet virou em 19/10/2026 (Marés 12, ClickUp 17tn9e9nbbg), com vigência até 31/01/2027:
-- vaga coberta a R$ 42,90 de 1 a 6 diárias, R$ 39,90 de 7 a 12, R$ 37,90 de 13 a 17 e R$ 35,90
-- de 18 em diante. A Plenty Park também mudou (espelho do WL amostrado em 16/10/2026): R$ 39,90
-- de 3 a 6 diárias, R$ 37,90 de 7 a 14 e R$ 35,90 de 15 em diante, com mínimo de 3 diárias.
-- A tabela da página do destino e o /precos leem o motor; a FAQ é prosa escrita à mão logo
-- abaixo, então sem esta troca a página se contradiz (a FAQ dizia R$ 32,54 a diária com a
-- tabela mostrando R$ 42,90).
--
-- O que mudou de fato, além do número:
--   - A queda por duração encolheu. A Aerovalet ia de R$ 32,54 a R$ 17,06 por dia ("quase
--     metade"); agora vai de R$ 42,90 a R$ 35,90, 16% menos. A Plenty Park vai de R$ 39,90 a
--     R$ 35,90. De 18 diárias em diante as duas cobram o mesmo, e a frase "no mês a diferença
--     chega a R$ 265,20" sai.
--   - O oficial. As respostas curtas usavam R$ 39,90 (post antigo da Estapar), e a tabela da
--     "quanto custa" já trazia R$ 44,90, leitura de 09/10/2026 (20261129140000). Fica a leitura
--     mais recente, datada. A R$ 39,90 a Aerovalet passaria a ser mais cara que o oficial na
--     diária avulsa; a R$ 44,90 ela é R$ 2,00 mais barata, e o texto diz que o oficial muda o
--     preço conforme a procura. A "menos da metade do oficial" em 30 diárias sai: são
--     R$ 1.077,00 contra R$ 1.347,00.
--   - "Qual o mais barato" (fora da lista original, mas com os mesmos valores velhos) ainda
--     cotava o Grand Parking a R$ 25,00, número que a releitura de 09/10 derrubou, e a Plenty
--     Park a R$ 26,90. Com a tabela nova a menor diária publicada é a do The Parking
--     (R$ 30,00), e para 15 a 30 dias o Express Parking cobra R$ 600,00 fixos. A resposta diz
--     isso: a pergunta é qual é o mais barato, e o parceiro não é.
--
-- Totais conferidos no motor (simulate_price) em 19/10/2026: Aerovalet 1d 42,90 · 7d 279,30 ·
-- 15d 568,50 · 30d 1.077,00; Plenty Park 3d 119,70 · 7d 265,30 · 15d 538,50 · 30d 1.077,00.
--
-- Os posts do blog que citam os mesmos valores ficam fora: lá o preço é retrato datado e quem o
-- renova é a rotina mensal de frescor (docs/specs/rotina-mensal-frescor.md).
--
-- Idempotente: as respostas são gravadas inteiras, e as trocas dentro do body_md usam replace,
-- que não faz nada na segunda passada. O bloco do fim aborta se sobrar valor antigo.

-- 1. As vagas em Congonhas são cobertas ou descobertas?
update public.faq
set answer = 'Em Congonhas as duas unidades parceiras da Movepark trabalham com vaga coberta: a Aerovalet a 738 m do terminal, por R$ 42,90 na diária avulsa, e a Plenty Park a 863 m, por R$ 39,90 por dia a partir de 3 diárias. Como o aeroporto fica dentro da cidade, os pátios cobertos costumam ser edifício-garagem, o que também abriga o carro do sol e da chuva. Preços conferidos em 19/10/2026.',
    body_md = replace(body_md,
      'os parceiros Movepark Plenty Park (R$ 26,90 por dia a partir de 7 diárias) e Aerovalet (R$ 32,54 na diária avulsa)',
      'os parceiros Movepark Plenty Park (R$ 37,90 por dia a partir de 7 diárias) e Aerovalet (R$ 42,90 na diária avulsa)')
where slug = 'as-vagas-em-congonhas-sao-cobertas-ou-descobertas';

-- 2. Compensa deixar o carro mais dias no Aeroporto de Congonhas?
update public.faq
set answer = 'Compensa. Na Aerovalet a vaga coberta sai de R$ 42,90 na diária avulsa para R$ 39,90 por dia em uma semana e R$ 35,90 por dia a partir de 18 diárias, 16% menos. Na Plenty Park, que aceita reserva a partir de 3 diárias, o valor por dia vai de R$ 39,90 a R$ 35,90 a partir de 15. O edifício-garagem oficial cobra o mesmo por dia em qualquer duração. Preços conferidos em 19/10/2026.',
    body_md = replace(body_md,
      '| 1 diária | R$ 32,54 | mínimo de 3 diárias |
| 7 diárias | R$ 199,29 (R$ 28,47/dia) | R$ 188,30 (R$ 26,90/dia) |
| 15 diárias | R$ 326,55 (R$ 21,77/dia) | R$ 388,50 (R$ 25,90/dia) |
| 30 diárias | R$ 511,80 (R$ 17,06/dia) | R$ 777,00 (R$ 25,90/dia) |

As duas se comportam de maneira diferente conforme a viagem estica. A Aerovalet reduz o valor por dia a cada faixa; a Plenty Park para de reduzir em 15 diárias. No mês a diferença chega a R$ 265,20.

Preços conferidos em 11/09/2026.',
      '| 1 diária | R$ 42,90 | mínimo de 3 diárias |
| 7 diárias | R$ 279,30 (R$ 39,90/dia) | R$ 265,30 (R$ 37,90/dia) |
| 15 diárias | R$ 568,50 (R$ 37,90/dia) | R$ 538,50 (R$ 35,90/dia) |
| 30 diárias | R$ 1.077,00 (R$ 35,90/dia) | R$ 1.077,00 (R$ 35,90/dia) |

As duas baixam o valor por dia em degraus até R$ 35,90: a Plenty Park chega lá com 15 diárias e a Aerovalet com 18. De 18 em diante elas cobram o mesmo. Em estadia mais curta a Plenty Park custa igual ou menos por dia, mas só aceita reserva a partir de 3 diárias.

Preços conferidos em 19/10/2026.')
where slug = 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas';

-- 3. O que está incluso na diária do estacionamento em Congonhas? (a resposta curta não cita
-- preço, e as traduções também não)
update public.faq
set body_md = replace(body_md,
      'Quem viaja por um dia deve olhar a Aerovalet, que aceita diária avulsa por R$ 32,54.',
      'Quem viaja por um dia deve olhar a Aerovalet, que aceita diária avulsa, por R$ 42,90 em 19/10/2026.')
where slug = 'o-que-esta-incluso-na-diaria-do-estacionamento-em-congonhas';

-- 4. Quanto custa estacionar no Aeroporto de Congonhas?
update public.faq
set answer = 'Perto do Aeroporto de Congonhas os parceiros Movepark cobram a partir de R$ 35,90 por dia em vaga coberta: a Plenty Park a partir de 15 diárias e a Aerovalet a partir de 18. Na estadia curta, a Plenty Park cobra R$ 39,90 por dia, com mínimo de 3 diárias, e a Aerovalet R$ 42,90 no dia avulso. As duas ficam a menos de 900 m do terminal. No edifício-garagem oficial a diária com reserva estava em R$ 44,90. Entre os lotes que abrem tarifa, o mais barato é o The Parking, a R$ 30,00, e o mais caro o One Parking, a R$ 45,00. Preços Movepark conferidos em 19/10/2026; os dos demais, em 9 de outubro de 2026.',
    body_md = replace(replace(body_md,
      '| **Plenty Park (parceiro Movepark)** | R$ 26,90 por dia | Vaga coberta a 863 m do terminal, a partir de 7 diárias; o mínimo de reserva é 3 diárias, a R$ 29,90 por dia |',
      '| **Plenty Park (parceiro Movepark)** | R$ 35,90 por dia | Vaga coberta a 863 m do terminal, a partir de 15 diárias; o mínimo de reserva é 3 diárias, a R$ 39,90 por dia |'),
      '| **Aerovalet (parceiro Movepark)** | R$ 32,54 | Vaga coberta a 738 m do terminal, sem estadia mínima |',
      '| **Aerovalet (parceiro Movepark)** | R$ 42,90 | Vaga coberta a 738 m do terminal, sem estadia mínima; R$ 35,90 por dia a partir de 18 diárias |')
where slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas';

-- 5. Vale mais a pena o estacionamento oficial de Congonhas ou um particular?
update public.faq
set answer = 'Em Congonhas a distância quase empata, porque os dois parceiros Movepark ficam a menos de 900 m do terminal. O que muda é o preço. No edifício-garagem oficial a diária com reserva estava em R$ 44,90 em 9 de outubro de 2026, e na Aerovalet a vaga coberta sai por R$ 42,90 no dia avulso e por R$ 35,90 por dia a partir de 18 diárias. Em um mês são R$ 1.077,00 contra R$ 1.347,00 do oficial. Preços Movepark conferidos em 19/10/2026.',
    body_md = replace(replace(replace(body_md,
      '| 1 diária | R$ 32,54 | mínimo de 3 diárias | R$ 39,90 |
| 7 diárias | R$ 199,29 (R$ 28,47/dia) | R$ 188,30 (R$ 26,90/dia) | R$ 279,30 |
| 30 diárias | R$ 511,80 (R$ 17,06/dia) | R$ 777,00 (R$ 25,90/dia) | R$ 1.197,00 |',
      '| 1 diária | R$ 42,90 | mínimo de 3 diárias | R$ 44,90 |
| 7 diárias | R$ 279,30 (R$ 39,90/dia) | R$ 265,30 (R$ 37,90/dia) | R$ 314,30 |
| 30 diárias | R$ 1.077,00 (R$ 35,90/dia) | R$ 1.077,00 (R$ 35,90/dia) | R$ 1.347,00 |'),
      'O particular ganha em qualquer duração aqui, inclusive na diária avulsa. Em 30 diárias a Aerovalet custa menos da metade do oficial.',
      'Pelos preços da tabela, o particular sai mais barato em todas as durações, e a vantagem cresce com a estadia. Na diária avulsa a diferença é de R$ 2,00, e o oficial muda o preço conforme a procura. Em 30 diárias os dois parceiros custam R$ 270,00 a menos.'),
      'Preços Movepark conferidos em 11/09/2026.',
      'Preços Movepark conferidos em 19/10/2026. O oficial é a diária com reserva lida em 9 de outubro de 2026, multiplicada pelo número de dias.')
where slug = 'vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular';

-- 6. Qual o estacionamento mais barato perto do Aeroporto de Congonhas? (body_md não cita preço)
update public.faq
set answer = 'Na leitura de 9 de outubro de 2026, a menor diária publicada perto de Congonhas é a do The Parking: R$ 30,00, com reserva pelo WhatsApp e pátio aberto das 4h às 23h59. Para estadias de 15 a 30 dias, o Express Parking cobra R$ 600,00 fixos. Nos parceiros Movepark, com vaga coberta e preço fechado na reserva online, a Plenty Park cobra de R$ 39,90 a R$ 35,90 por dia, conforme a estadia, com mínimo de 3 diárias, e a Aerovalet parte de R$ 42,90 no dia avulso. O edifício-garagem oficial cobrava R$ 44,90 com reserva. Preços Movepark conferidos em 19/10/2026.'
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas';

-- Traduções (só a resposta curta é traduzida; body_md é nulo em en e es). A FAQ 3 não entra:
-- a resposta dela não cita preço.
update public.faq_i18n i
set answer = v.answer
from (values
  ('as-vagas-em-congonhas-sao-cobertas-ou-descobertas', 'en',
   'At Congonhas both Movepark partner units work with covered spots: Aerovalet 738 m from the terminal, at R$ 42.90 for a single day, and Plenty Park 863 m away, at R$ 39.90 a day from 3 days up. Since the airport sits inside the city, the covered lots tend to be garage buildings, which also shelter the car from sun and rain. Prices checked on 19/10/2026.'),
  ('as-vagas-em-congonhas-sao-cobertas-ou-descobertas', 'es',
   'En Congonhas las dos unidades socias de Movepark trabajan con plaza cubierta: Aerovalet a 738 m de la terminal, por R$ 42,90 el día suelto, y Plenty Park a 863 m, por R$ 39,90 por día a partir de 3 días. Como el aeropuerto está dentro de la ciudad, los predios cubiertos suelen ser edificios garaje, que también resguardan el auto del sol y de la lluvia. Precios verificados el 19/10/2026.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas', 'en',
   'It is. At Aerovalet a covered spot goes from R$ 42.90 for a single day to R$ 39.90 a day over a week and R$ 35.90 a day from 18 days up, 16% less. At Plenty Park, which takes bookings from 3 days, the per-day price goes from R$ 39.90 to R$ 35.90 from 15 days up. The official garage building charges the same per day at any length. Prices checked on 19/10/2026.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas', 'es',
   'Conviene. En Aerovalet la plaza cubierta pasa de R$ 42,90 por día suelto a R$ 39,90 por día en una semana y R$ 35,90 por día a partir de 18 días, un 16% menos. En Plenty Park, que acepta reservas desde 3 días, el valor por día va de R$ 39,90 a R$ 35,90 a partir de 15. El edificio garaje oficial cobra lo mismo por día en cualquier duración. Precios verificados el 19/10/2026.'),
  ('quanto-custa-estacionar-no-aeroporto-de-congonhas', 'en',
   'Near Congonhas Airport the Movepark partners start at R$ 35.90 a day for a covered spot: Plenty Park from 15 days up and Aerovalet from 18. On short stays, Plenty Park charges R$ 39.90 a day with a 3-day minimum, and Aerovalet R$ 42.90 for a single day. Both sit less than 900 m from the terminal. At the official garage building an advance booking was R$ 44.90 a day. Among the lots that publish rates, the cheapest is The Parking at R$ 30.00 and the dearest One Parking at R$ 45.00. Movepark prices checked on 19/10/2026; the others on 9 October 2026.'),
  ('quanto-custa-estacionar-no-aeroporto-de-congonhas', 'es',
   'Cerca del Aeropuerto de Congonhas los socios Movepark cobran desde R$ 35,90 por día en plaza cubierta: Plenty Park a partir de 15 días y Aerovalet a partir de 18. En estadías cortas, Plenty Park cobra R$ 39,90 por día, con mínimo de 3 días, y Aerovalet R$ 42,90 por día suelto. Los dos quedan a menos de 900 m de la terminal. En el edificio garaje oficial la reserva anticipada estaba en R$ 44,90 por día. Entre los predios que publican tarifa, el más barato es The Parking a R$ 30,00 y el más caro One Parking a R$ 45,00. Precios Movepark verificados el 19/10/2026; los demás, el 9 de octubre de 2026.'),
  ('vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular', 'en',
   'At Congonhas distance is almost a tie, because the two Movepark partners sit less than 900 m from the terminal. What changes is the price. At the official garage building a booked day was R$ 44.90 on 9 October 2026, and at Aerovalet a covered spot costs R$ 42.90 for a single day and R$ 35.90 a day from 18 days up. Over a month that is R$ 1,077.00 against R$ 1,347.00 for the official one. Movepark prices checked on 19/10/2026.'),
  ('vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular', 'es',
   'En Congonhas la distancia casi empata, porque los dos socios Movepark quedan a menos de 900 m de la terminal. Lo que cambia es el precio. En el edificio garaje oficial el día con reserva estaba en R$ 44,90 el 9 de octubre de 2026, y en Aerovalet la plaza cubierta sale R$ 42,90 por día suelto y R$ 35,90 por día a partir de 18 días. En un mes son R$ 1.077,00 contra R$ 1.347,00 del oficial. Precios Movepark verificados el 19/10/2026.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas', 'en',
   'In the 9 October 2026 reading, the lowest published daily rate near Congonhas is The Parking: R$ 30.00, booked over WhatsApp, with the lot open from 4 am to 11:59 pm. For stays of 15 to 30 days, Express Parking charges a flat R$ 600.00. At the Movepark partners, with a covered spot and the price locked at online booking, Plenty Park charges from R$ 39.90 down to R$ 35.90 a day depending on the stay, with a 3-day minimum, and Aerovalet starts at R$ 42.90 for a single day. The official garage building charged R$ 44.90 with a booking. Movepark prices checked on 19/10/2026.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas', 'es',
   'Según el relevamiento del 9 de octubre de 2026, la tarifa diaria más baja publicada cerca de Congonhas es la de The Parking: R$ 30,00, con reserva por WhatsApp y predio abierto de 4h a 23h59. Para estadías de 15 a 30 días, Express Parking cobra R$ 600,00 fijos. En los socios Movepark, con plaza cubierta y precio cerrado en la reserva en línea, Plenty Park cobra de R$ 39,90 a R$ 35,90 por día según la estadía, con mínimo de 3 días, y Aerovalet parte de R$ 42,90 por día suelto. El edificio garaje oficial cobraba R$ 44,90 con reserva. Precios Movepark verificados el 19/10/2026.')
) as v(slug, locale, answer)
join public.faq f on f.slug = v.slug
where i.faq_id = f.id and i.locale = v.locale::public.content_locale;

-- Trava: nenhum valor da tabela antiga pode sobrar nessas FAQs, em idioma nenhum. Se um replace
-- não casou (o texto mudou desde a leitura de 19/10), a migration falha em vez de publicar meia
-- troca. O R$ 39,90 do oficial não entra na lista solta porque virou o preço de 3 a 6 diárias da
-- Plenty Park; ele é pego quando aparece na mesma linha que "oficial".
do $$
declare
  antigos text := '(^|[^0-9.,])(32[,.]54|28[,.]47|21[,.]77|17[,.]06|16[,.]90|199[,.]29|326[,.]55|511[,.]80|511[,.]90|26[,.]90|29[,.]90|25[,.]90|188[,.]30|388[,.]50|777[,.]00|265[,.]20|1[,.]197[,.]00|25[,.]00)'
    || '|(oficial|official)[^.\n]*39[,.]90'
    || '|11/09/2026|11 September|11 de septiembre|5 de setembro|5 September|5 de septiembre|agosto de 2026|August 2026';
  sobra text;
begin
  select string_agg(distinct f.slug || coalesce(' (' || i.locale || ')', ''), ', ')
    into sobra
  from public.faq f
  left join public.faq_i18n i on i.faq_id = f.id
  where f.slug in (
      'as-vagas-em-congonhas-sao-cobertas-ou-descobertas',
      'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas',
      'o-que-esta-incluso-na-diaria-do-estacionamento-em-congonhas',
      'quanto-custa-estacionar-no-aeroporto-de-congonhas',
      'vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular',
      'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas')
    and (coalesce(f.answer, '') || coalesce(f.body_md, '') || coalesce(i.answer, '')) ~ antigos;

  if sobra is not null then
    raise exception 'FAQ de Congonhas com valor da tabela antiga: %', sobra;
  end if;
end $$;
