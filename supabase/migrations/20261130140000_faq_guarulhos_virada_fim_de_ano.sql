-- Guarulhos: as seis FAQs de preço passam à tabela de fim de ano da Aeropark e da Aerovalet.
--
-- As duas viraram em 19/10/2026 (Marés 12, ClickUp 17tn9e9nbbf e 17tn9e9nbbg), com vigência até
-- 31/01/2027. A tabela da página do destino e o /precos leem o motor, que o espelho do WL
-- atualiza sozinho. A FAQ é prosa escrita à mão e fica logo abaixo da tabela, então sem esta
-- troca a página se contradiz: a resposta dizia "uma semana sai por R$ 93,17" com a tabela
-- mostrando R$ 125,30.
--
-- O que mudou de fato, além do número:
--   - As duas tabelas deixaram de ser iguais de sete diárias em diante. A Aerovalet ficou mais
--     barata em todas as durações, e as frases "no Aeropark os valores são os mesmos a partir de
--     sete diárias" saem.
--   - Na Aerovalet a diária avulsa da descoberta ficou em R$ 18,49, abaixo da faixa de 2 a 6
--     diárias (R$ 18,90 por dia). A FAQ da curva de preço passa a dizer isso.
--   - Em 30 diárias, o pacote de R$ 505,00 do Standard (tabela do GRU Airport de 17/09/2026)
--     fica abaixo da descoberta do Aeropark e da coberta da Aerovalet (R$ 537,00). A FAQ do
--     mensal mostra as quatro linhas separadas em vez de "parceiro Movepark" genérico.
--
-- Totais pela tabela aprovada: Aerovalet descoberta 18,49 / 18,90 / 17,90 / 15,90 / 14,90,
-- coberta 24,90 / 24,90 / 21,90 / 19,90 / 17,90; Aeropark (mínimo 2 diárias) descoberta 21,90 /
-- 19,90 / 18,90 / 17,90, coberta 29,90 / 27,90 / 25,90 / 23,90, por faixa de 1, 2 a 6, 7 a 12,
-- 13 a 17 e 18 em diante. Conferidos contra o motor (simulate_price) depois do espelho.
--
-- Os posts do blog que citam os mesmos valores ficam fora: lá o preço é retrato datado ("em 17 de
-- setembro de 2026") e quem o renova é a rotina mensal de frescor (docs/specs/rotina-mensal-frescor.md).
--
-- Idempotente: as respostas são gravadas inteiras, e as trocas dentro do body_md usam replace,
-- que não faz nada na segunda passada. O bloco do fim aborta se sobrar valor antigo.

-- 1. As vagas em Guarulhos são cobertas ou descobertas?
update public.faq
set answer = 'Guarulhos tem os dois, e a diferença aparece no preço. Na Aerovalet a descoberta parte de R$ 18,49 a diária e a coberta de R$ 24,90; em 30 diárias elas caem para R$ 14,90 e R$ 17,90 por dia. No Aeropark a entrada é a partir de duas diárias, e em 30 diárias a descoberta fica em R$ 17,90 e a coberta em R$ 23,90 por dia. A coberta protege de sol, chuva e granizo, o que pesa para quem deixa o carro semanas. As duas unidades também oferecem valet, em que a equipe estaciona o carro por você. Preços conferidos em 19/10/2026.',
    body_md = replace(replace(replace(body_md,
      'a vaga descoberta da Aerovalet sai por R$ 18,49 a diária e a coberta por R$ 22,19.',
      'a vaga descoberta da Aerovalet sai por R$ 18,49 a diária e a coberta por R$ 24,90.'),
      'Em 30 diárias ela soma R$ 48,00, o equivalente a seis diárias descobertas, porque a coberta fica em R$ 9,58 por dia e a descoberta em R$ 7,98.',
      'Em 30 diárias ela soma R$ 90,00 na Aerovalet, perto do preço de seis diárias descobertas, porque a coberta fica em R$ 17,90 por dia e a descoberta em R$ 14,90. No Aeropark a diferença no mês é de R$ 180,00 (R$ 23,90 contra R$ 17,90 por dia).'),
      'Preços conferidos em 11/09/2026.',
      'Preços conferidos em 19/10/2026.')
where slug = 'as-vagas-em-guarulhos-sao-cobertas-ou-descobertas';

-- 2. Compensa deixar o carro mais dias no Aeroporto de Guarulhos?
update public.faq
set answer = 'Compensa, e mais em estadia longa. Na Aerovalet a vaga descoberta sai de R$ 18,49 na diária avulsa para R$ 17,90 por dia em uma semana e R$ 14,90 por dia em 30 diárias, 19% menos. A coberta faz o mesmo caminho, de R$ 24,90 para R$ 17,90 por dia no mês. No Aeropark, que entra a partir de duas diárias, a descoberta vai de R$ 21,90 para R$ 17,90 por dia. O estacionamento oficial cobra a mesma diária em qualquer duração. Preços conferidos em 19/10/2026.',
    body_md = '## Como o preço por dia cai em Guarulhos?

| Estadia | Aerovalet descoberta | Aerovalet coberta | Aeropark descoberta |
| --- | --- | --- | --- |
| 1 diária | R$ 18,49 | R$ 24,90 | entrada a partir de 2 diárias |
| 7 diárias | R$ 125,30 (R$ 17,90/dia) | R$ 153,30 (R$ 21,90/dia) | R$ 139,30 (R$ 19,90/dia) |
| 15 diárias | R$ 238,50 (R$ 15,90/dia) | R$ 298,50 (R$ 19,90/dia) | R$ 283,50 (R$ 18,90/dia) |
| 30 diárias | R$ 447,00 (R$ 14,90/dia) | R$ 537,00 (R$ 17,90/dia) | R$ 537,00 (R$ 17,90/dia) |

Na descoberta da Aerovalet o valor por dia cai a cada faixa: R$ 17,90 de 7 a 12 diárias, R$ 15,90 de 13 a 17 e R$ 14,90 de 18 em diante. O maior degrau fica entre a semana e a quinzena. A exceção é a estadia de 2 a 6 diárias, que custa R$ 18,90 por dia, um pouco acima da diária avulsa.

Preços conferidos em 19/10/2026. Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).'
where slug = 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-guarulhos';

-- 3. Qual o estacionamento mais barato perto do Aeroporto de Guarulhos? (body_md não cita preço)
update public.faq
set answer = 'A menor diária perto do Aeroporto de Guarulhos é a da Aerovalet, parceira Movepark: R$ 18,49 na vaga descoberta, a 4,5 km do terminal, com preço fechado na reserva online. Em estadias longas a conta cai: R$ 125,30 na semana e R$ 447,00 em 30 diárias, que dão R$ 14,90 por dia. O Aeropark entra a partir de duas diárias e cobra R$ 139,30 na semana e R$ 537,00 em 30 diárias na vaga descoberta. Preços conferidos em 19/10/2026. Entre os lotes sem reserva online, a apuração de agosto de 2026 apontava Decolar Park a R$ 20,90 e FlyPark a R$ 21,60.'
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-guarulhos';

-- 4. Quanto custa estacionar no Aeroporto de Guarulhos?
update public.faq
set answer = 'A diária mais barata perto do Aeroporto de Guarulhos é a da Aerovalet, parceira Movepark: R$ 18,49 na vaga descoberta, com preço fechado na reserva online. Na estadia longa você paga menos por dia: uma semana sai por R$ 125,30, ou R$ 17,90 por dia, e 30 diárias custam R$ 447,00, ou R$ 14,90 por dia. No Aeropark a mesma vaga custa R$ 139,30 na semana e R$ 537,00 em 30 diárias. Preços do motor de reservas da Movepark, conferidos em 19/10/2026. Nos demais lotes da tabela a diária de entrada vai de R$ 20,90 a R$ 40,80, em consulta de setembro de 2026, e o oficial fica entre R$ 22,00 no Economy e R$ 100,00 nos setores junto ao terminal, em apuração de agosto de 2026.',
    body_md = replace(replace(replace(replace(body_md,
      '| **Aerovalet (parceiro Movepark)** | R$ 18,49 | Vaga descoberta a 4,5 km do terminal; coberta por R$ 22,19 |',
      '| **Aerovalet (parceiro Movepark)** | R$ 18,49 | Vaga descoberta a 4,5 km do terminal; coberta por R$ 24,90 |'),
      '| **Aeropark (parceiro Movepark)** | R$ 18,49 por dia | Vaga descoberta, com entrada a partir de 2 diárias |',
      '| **Aeropark (parceiro Movepark)** | R$ 21,90 por dia | Vaga descoberta, com entrada a partir de 2 diárias |'),
      'nos parceiros Movepark, 30 diárias na vaga descoberta saem por R$ 239,40, o que dá R$ 7,98 por dia.',
      'nos parceiros Movepark, 30 diárias na vaga descoberta saem a partir de R$ 447,00, o que dá R$ 14,90 por dia.'),
      'conferido em 11/09/2026,',
      'conferido em 19/10/2026,')
where slug = 'quanto-custa-estacionar-no-aeroporto-de-guarulhos';

-- 5. Vale mais a pena o estacionamento oficial de Guarulhos ou um particular?
update public.faq
set answer = 'Depende do setor do oficial e de quantos dias o carro fica. Nos parceiros Movepark a vaga descoberta sai a partir de R$ 447,00 em 30 diárias, ou R$ 14,90 por dia. Pela apuração de agosto de 2026, o Economy cobrava R$ 22,00 a diária, o que daria R$ 660,00 no mesmo período, e os setores junto ao terminal cobravam R$ 100,00, que fechariam R$ 3.000,00. O oficial cobra a mesma diária em qualquer duração, então a diferença cresce com a estadia. Preços Movepark conferidos em 19/10/2026.',
    body_md = replace(replace(body_md,
      '| Aerovalet ou Aeropark, vaga descoberta | R$ 7,98 | R$ 239,40 |
| Aerovalet ou Aeropark, vaga coberta | R$ 9,58 | R$ 287,40 |',
      '| Aerovalet, vaga descoberta | R$ 14,90 | R$ 447,00 |
| Aeropark, vaga descoberta | R$ 17,90 | R$ 537,00 |
| Aerovalet, vaga coberta | R$ 17,90 | R$ 537,00 |
| Aeropark, vaga coberta | R$ 23,90 | R$ 717,00 |'),
      'Preços Movepark conferidos em 11/09/2026;',
      'Preços Movepark conferidos em 19/10/2026;')
where slug = 'vale-mais-a-pena-o-estacionamento-oficial-de-guarulhos-ou-um-particular';

-- 6. Existe estacionamento mensal no Aeroporto de Guarulhos?
update public.faq
set answer = 'Existe no oficial: o GRU Airport mantém canal de mensalistas e cobra R$ 505,00 de 18 a 30 diárias no Standard, mais diária fixa de R$ 19,90 acima de 30. Na Movepark o que existe é a tabela por duração: nos parceiros a vaga descoberta sai a partir de R$ 447,00 em 30 diárias, ou R$ 14,90 por dia, em 19 de outubro de 2026.',
    body_md = replace(replace(replace(body_md,
      '| Parceiro Movepark, vaga descoberta | R$ 239,40 | R$ 7,98 |
| Parceiro Movepark, vaga coberta | R$ 287,40 | R$ 9,58 |',
      '| Aerovalet, vaga descoberta | R$ 447,00 | R$ 14,90 |
| Aeropark, vaga descoberta | R$ 537,00 | R$ 17,90 |
| Aerovalet, vaga coberta | R$ 537,00 | R$ 17,90 |
| Aeropark, vaga coberta | R$ 717,00 | R$ 23,90 |'),
      'Preços Movepark do motor de reservas, conferidos em 17 de setembro de 2026. Preços do oficial na tabela de valores do GRU Airport, consultada na mesma data.',
      'Preços Movepark do motor de reservas, conferidos em 19 de outubro de 2026. Preços do oficial na tabela de valores do GRU Airport, consultada em 17 de setembro de 2026.'),
      'Nos parceiros de Guarulhos o valor por dia cai conforme a estadia cresce, na vaga descoberta.

| Duração | Total | Por dia |
| --- | --- | --- |
| 1 diária | R$ 18,49 | R$ 18,49 |
| 7 diárias | R$ 93,17 | R$ 13,31 |
| 15 diárias | R$ 152,70 | R$ 10,18 |
| 20 diárias | R$ 159,60 | R$ 7,98 |
| 30 diárias | R$ 239,40 | R$ 7,98 |

De 20 diárias em diante o valor por dia estaciona em R$ 7,98, então a faixa de 20 a 30 dias é onde a diferença para o oficial fica maior. Conferido no motor de reservas em 17 de setembro de 2026.',
      'Na vaga descoberta da Aerovalet o valor por dia cai conforme a estadia cresce.

| Duração | Total | Por dia |
| --- | --- | --- |
| 1 diária | R$ 18,49 | R$ 18,49 |
| 7 diárias | R$ 125,30 | R$ 17,90 |
| 15 diárias | R$ 238,50 | R$ 15,90 |
| 20 diárias | R$ 298,00 | R$ 14,90 |
| 30 diárias | R$ 447,00 | R$ 14,90 |

De 18 diárias em diante o valor por dia fica em R$ 14,90. Contra o pacote de R$ 505,00 do Standard, a diferença é maior no começo da faixa, com 18 diárias a R$ 268,20, e diminui até o fim do mês: em 30 diárias são R$ 447,00 contra R$ 505,00. Conferido no motor de reservas em 19 de outubro de 2026.')
where slug = 'existe-estacionamento-mensal-no-aeroporto-de-guarulhos';

-- Traduções (só a resposta curta é traduzida; body_md é nulo em en e es).
update public.faq_i18n i
set answer = v.answer
from (values
  ('as-vagas-em-guarulhos-sao-cobertas-ou-descobertas', 'en',
   'Guarulhos has both, and the difference shows up in the price. At Aerovalet an uncovered spot starts at R$ 18.49 a day and a covered one at R$ 24.90; over 30 days they fall to R$ 14.90 and R$ 17.90 a day. At Aeropark entry is from two days, and over 30 days the uncovered spot comes to R$ 17.90 and the covered one to R$ 23.90 a day. Covering shields from sun, rain and hail, which matters for anyone leaving the car for weeks. Both units also offer valet, where the staff park the car for you. Prices checked on 19/10/2026.'),
  ('as-vagas-em-guarulhos-sao-cobertas-ou-descobertas', 'es',
   'Guarulhos tiene las dos, y la diferencia aparece en el precio. En Aerovalet la descubierta parte de R$ 18,49 por día y la cubierta de R$ 24,90; en 30 días bajan a R$ 14,90 y R$ 17,90 por día. En Aeropark la entrada es desde dos días, y en 30 días la descubierta queda en R$ 17,90 y la cubierta en R$ 23,90 por día. La cubierta protege del sol, la lluvia y el granizo, lo que pesa para quien deja el auto semanas. Las dos unidades también ofrecen valet, donde el equipo estaciona el auto por vos. Precios verificados el 19/10/2026.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-guarulhos', 'en',
   'It is, especially on long stays. At Aerovalet an uncovered spot goes from R$ 18.49 for a single day to R$ 17.90 a day over a week and R$ 14.90 a day over 30 days, which is 19% less. The covered spot follows the same curve, from R$ 24.90 to R$ 17.90 a day over a month. At Aeropark, which takes bookings from two days, the uncovered spot goes from R$ 21.90 to R$ 17.90 a day. The official car park charges the same daily rate whatever the stay. Prices checked on 19 October 2026.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-guarulhos', 'es',
   'Conviene, y más en estadías largas. En Aerovalet la plaza descubierta pasa de R$ 18,49 en el día suelto a R$ 17,90 por día en una semana y R$ 14,90 por día en 30 días, un 19% menos. La cubierta hace el mismo recorrido, de R$ 24,90 a R$ 17,90 por día en el mes. En Aeropark, que acepta desde dos días, la descubierta pasa de R$ 21,90 a R$ 17,90 por día. El estacionamiento oficial cobra la misma tarifa diaria en cualquier duración. Precios verificados el 19 de octubre de 2026.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-guarulhos', 'en',
   'The lowest daily rate near Guarulhos Airport is Aerovalet, a Movepark partner: R$ 18.49 for an uncovered spot, 4.5 km from the terminal, with the price locked at booking. On long stays the bill drops: R$ 125.30 for a week and R$ 447.00 for 30 days, which works out at R$ 14.90 a day. Aeropark takes bookings from two days up and charges R$ 139.30 for a week and R$ 537.00 for 30 days for an uncovered spot. Prices checked on 19 October 2026. Among the lots without online booking, the August 2026 research put Decolar Park at R$ 20.90 and FlyPark at R$ 21.60.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-guarulhos', 'es',
   'La tarifa diaria más baja cerca del Aeropuerto de Guarulhos es la de Aerovalet, socio de Movepark: R$ 18,49 en plaza descubierta, a 4,5 km de la terminal, con el precio cerrado al reservar. En estadías largas la cuenta baja: R$ 125,30 la semana y R$ 447,00 en 30 días, que dan R$ 14,90 por día. Aeropark acepta desde dos días y cobra R$ 139,30 la semana y R$ 537,00 en 30 días en plaza descubierta. Precios verificados el 19 de octubre de 2026. Entre los predios sin reserva en línea, el relevamiento de agosto de 2026 marcaba Decolar Park en R$ 20,90 y FlyPark en R$ 21,60.'),
  ('quanto-custa-estacionar-no-aeroporto-de-guarulhos', 'en',
   'The cheapest daily rate near Guarulhos Airport is Aerovalet, a Movepark partner: R$ 18.49 for an uncovered spot, with the price locked at booking. On long stays you pay less per day: a week is R$ 125.30, or R$ 17.90 a day, and 30 days cost R$ 447.00, or R$ 14.90 a day. At Aeropark the same spot costs R$ 139.30 for a week and R$ 537.00 for 30 days. Prices from the Movepark booking engine, checked on 19 October 2026. Across the other lots in the table the entry daily rate runs from R$ 20.90 to R$ 40.80, checked in September 2026, and the official car park from R$ 22.00 in the Economy sector to R$ 100.00 in the sectors next to the terminal, as researched in August 2026.'),
  ('quanto-custa-estacionar-no-aeroporto-de-guarulhos', 'es',
   'La tarifa diaria más barata cerca del Aeropuerto de Guarulhos es la de Aerovalet, socio de Movepark: R$ 18,49 en plaza descubierta, con el precio cerrado al reservar. En estadías largas pagas menos por día: una semana sale R$ 125,30, o R$ 17,90 por día, y 30 días cuestan R$ 447,00, o R$ 14,90 por día. En Aeropark la misma plaza cuesta R$ 139,30 la semana y R$ 537,00 en 30 días. Precios del motor de reservas de Movepark, verificados el 19 de octubre de 2026. En los demás predios de la tabla la tarifa de entrada va de R$ 20,90 a R$ 40,80, según la consulta de septiembre de 2026, y el oficial entre R$ 22,00 en el sector Economy y R$ 100,00 en los sectores junto a la terminal, según el relevamiento de agosto de 2026.'),
  ('vale-mais-a-pena-o-estacionamento-oficial-de-guarulhos-ou-um-particular', 'en',
   'It depends on the official sector and on how many days the car stays. At the Movepark partners an uncovered spot costs from R$ 447.00 for 30 days, or R$ 14.90 a day. Per the August 2026 research, the Economy sector charged R$ 22.00 a day, which would be R$ 660.00 over the same period, and the sectors next to the terminal charged R$ 100.00, adding up to R$ 3,000.00. The official car park charges the same daily rate whatever the length of stay, so the gap grows with the trip. Movepark prices checked on 19 October 2026.'),
  ('vale-mais-a-pena-o-estacionamento-oficial-de-guarulhos-ou-um-particular', 'es',
   'Depende del sector del oficial y de cuántos días queda el auto. En los socios de Movepark la plaza descubierta sale desde R$ 447,00 por 30 días, o R$ 14,90 por día. Según el relevamiento de agosto de 2026, el sector Economy cobraba R$ 22,00 la tarifa diaria, lo que daría R$ 660,00 en el mismo período, y los sectores junto a la terminal cobraban R$ 100,00, que cerrarían R$ 3.000,00. El oficial cobra la misma tarifa diaria en cualquier duración, así que la diferencia crece con la estadía. Precios Movepark verificados el 19 de octubre de 2026.'),
  ('existe-estacionamento-mensal-no-aeroporto-de-guarulhos', 'en',
   'There is at the official one: GRU Airport keeps a season-ticket channel and charges R$ 505.00 for 18 to 30 days in Standard, plus a flat R$ 19.90 a day beyond 30. At Movepark what exists is the per-duration table: at the partners an uncovered spot starts at R$ 447.00 over 30 days, or R$ 14.90 a day, as of 19 October 2026.'),
  ('existe-estacionamento-mensal-no-aeroporto-de-guarulhos', 'es',
   'Sí, en el oficial: GRU Airport mantiene un canal de abonados y cobra R$ 505,00 de 18 a 30 días en Standard, más una tarifa fija de R$ 19,90 por día arriba de 30. En Movepark lo que existe es la tabla por duración: en los socios la plaza descubierta sale desde R$ 447,00 en 30 días, o R$ 14,90 por día, al 19 de octubre de 2026.')
) as v(slug, locale, answer)
join public.faq f on f.slug = v.slug
where i.faq_id = f.id and i.locale = v.locale::public.content_locale;

-- Trava: nenhum valor da tabela antiga pode sobrar nessas FAQs, em idioma nenhum. Se um replace
-- não casou (o texto mudou desde a leitura de 19/10), a migration falha em vez de publicar meia
-- troca.
do $$
declare
  antigos text := '(7[,.]98|9[,.]58|22[,.]19|13[,.]31|15[,.]97|10[,.]18|12[,.]22|93[,.]17|111[,.]79|152[,.]70|183[,.]30|239[,.]40|287[,.]40|159[,.]60|11/09/2026|11 September|11 de septiembre)';
  sobra text;
begin
  select string_agg(distinct f.slug || coalesce(' (' || i.locale || ')', ''), ', ')
    into sobra
  from public.faq f
  left join public.faq_i18n i on i.faq_id = f.id
  where f.slug in (
      'as-vagas-em-guarulhos-sao-cobertas-ou-descobertas',
      'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-guarulhos',
      'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-guarulhos',
      'quanto-custa-estacionar-no-aeroporto-de-guarulhos',
      'vale-mais-a-pena-o-estacionamento-oficial-de-guarulhos-ou-um-particular',
      'existe-estacionamento-mensal-no-aeroporto-de-guarulhos')
    and (coalesce(f.answer, '') || coalesce(f.body_md, '') || coalesce(i.answer, '')) ~ antigos;

  if sobra is not null then
    raise exception 'FAQ de Guarulhos com valor da tabela antiga: %', sobra;
  end if;
end $$;
