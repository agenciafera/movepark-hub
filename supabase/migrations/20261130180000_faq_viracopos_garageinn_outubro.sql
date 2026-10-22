-- Viracopos: as FAQs que citam a Garageinn passam à tabela de 20/10/2026.
--
-- A Garageinn virou a tarifa única online de R$ 45,90 para R$ 56,90 por dia (2 a 30 diárias) em
-- 20/10/2026. A diária avulsa segue R$ 59,99, só no balcão. O espelho do WL pegou a mudança às
-- 15h01 do mesmo dia (`pricing_mirror_run` kind `change`), então a tabela da página do destino, o
-- /precos e a página da unidade já mostram o valor novo. A FAQ é prosa escrita à mão e fica logo
-- abaixo da tabela: sem esta troca a página diz R$ 45,90 com a tabela mostrando R$ 56,90.
--
-- O que mudou de sentido, além do número:
--   - "Compensa deixar o carro mais dias" abria com "Compensa, e a queda é grande". Na Garageinn a
--     queda passou de 23% para 5% (R$ 59,99 para R$ 56,90), então a resposta separa os dois pátios.
--   - A mesma FAQ dizia "o degrau acontece na sétima diária nos dois", o que já estava errado antes
--     da virada: na Garageinn o preço cai na segunda diária, e no Virapark cai duas vezes (na
--     segunda e na sétima).
--   - "Existe estacionamento mensal": a diferença de 30 diárias entre os dois parceiros passa de
--     R$ 630,00 para R$ 960,00.
--
-- Totais da Garageinn pela tabela nova (simulate_price em 20/10/2026): 1 diária R$ 59,99, e de 2
-- em diante R$ 56,90 por dia, ou seja R$ 398,30 em 7, R$ 853,50 em 15 e R$ 1.707,00 em 30. Os
-- valores do Virapark e do oficial não mudaram e ficam com a data deles.
--
-- Os posts do blog que citam os mesmos valores vão numa migration própria, pela rotina de frescor
-- (docs/specs/rotina-mensal-frescor.md).
--
-- Idempotente: as respostas são gravadas inteiras, e as trocas dentro do body_md usam replace,
-- que não faz nada na segunda passada. O bloco do fim aborta se sobrar valor antigo.

-- 1. Tem estacionamento dentro do aeroporto de Viracopos?
update public.faq
set answer = 'Tem. Além do oficial (edifício garagem a R$ 83,00 e bolsão F a R$ 31,00 por diária, valores de agosto de 2026), o parceiro Garageinn opera no Centro Empresarial Viracopos, dentro do complexo do aeroporto, a 979 m do terminal. O traslado leva 3 minutos, com van a cada 15, e a diária custa R$ 56,90 a partir de 2 diárias, conferida no motor de reservas em 20 de outubro de 2026.'
where slug = 'tem-estacionamento-dentro-do-aeroporto-de-viracopos';

-- 2. Qual o estacionamento mais próximo do Aeroporto de Viracopos?
update public.faq
set answer = 'O edifício garagem oficial é o único colado ao terminal, com passarela e diária de R$ 83,00. Entre os alternativos, o mais próximo é o Garageinn, a 979 m, dentro do complexo, com traslado de 3 minutos e diária de R$ 56,90 a partir de 2 diárias. O Virapark fica a 3,7 km, com van a cada 15 minutos e vaga coberta por R$ 40,00 a diária, ou R$ 24,90 por dia a partir de 7 diárias. Garageinn conferido em 20 de outubro de 2026; os demais valores são de agosto de 2026.'
where slug = 'qual-o-estacionamento-mais-proximo-do-aeroporto-de-viracopos';

-- 3. Qual o estacionamento mais barato perto do Aeroporto de Viracopos?
update public.faq
set answer = 'Entre os preços que comparamos em agosto de 2026, a menor diária anunciada perto de Viracopos é a do Bandeira Park: R$ 18,49 na descoberta, caindo a R$ 7,98 em estadias de 18 a 30 dias. Em vaga coberta, o Virapark fecha R$ 24,90 por dia a partir de 7 diárias pelo motor de reservas, com traslado 24h. Dentro do complexo, o Garageinn cobra R$ 56,90 por dia a partir de 2 diárias, conferido em 20 de outubro de 2026.'
where slug = 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-viracopos';

-- 4. Quanto custa estacionar no Aeroporto de Viracopos?
update public.faq
set answer = 'Em Viracopos, a diária do parceiro Movepark Virapark é R$ 40,00 em vaga coberta com traslado 24h, caindo para R$ 24,90 por dia a partir de 7 diárias. O parceiro Garageinn, dentro do complexo do aeroporto, cobra R$ 59,99 na primeira diária e R$ 56,90 a partir da segunda, conferido em 20 de outubro de 2026. No oficial, o bolsão F custa R$ 31,00 e o edifício garagem R$ 83,00. Os demais valores foram conferidos entre 28 de agosto e 8 de setembro de 2026; a tabela abaixo compara os principais.'
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos';

-- 5. Compensa deixar o carro mais dias no Aeroporto de Viracopos?
update public.faq
set answer = 'Depende do pátio. No parceiro Virapark compensa: a diária sai de R$ 40,00 na estadia de um dia para R$ 24,90 a partir de sete, uma queda de 38%, e o valor por dia não sobe mais até 30 diárias. No Garageinn a queda é pequena, de R$ 59,99 para R$ 56,90 a partir da segunda diária, 5% menos. O estacionamento oficial cobra o mesmo por dia em qualquer duração. Virapark em valores de setembro de 2026, Garageinn conferido em 20 de outubro de 2026.',
    body_md = replace(replace(replace(replace(body_md,
      '| 7 diárias | R$ 174,30 (R$ 24,90/dia) | R$ 321,30 (R$ 45,90/dia) |',
      '| 7 diárias | R$ 174,30 (R$ 24,90/dia) | R$ 398,30 (R$ 56,90/dia) |'),
      '| 15 diárias | R$ 373,50 (R$ 24,90/dia) | R$ 688,50 (R$ 45,90/dia) |',
      '| 15 diárias | R$ 373,50 (R$ 24,90/dia) | R$ 853,50 (R$ 56,90/dia) |'),
      '| 30 diárias | R$ 747,00 (R$ 24,90/dia) | R$ 1.377,00 (R$ 45,90/dia) |',
      '| 30 diárias | R$ 747,00 (R$ 24,90/dia) | R$ 1.707,00 (R$ 56,90/dia) |'),
      'O degrau acontece na sétima diária nos dois. Depois dele o valor por dia trava, então a viagem de 15 dias custa o dobro da de 7, sem surpresa.',
      'No Virapark o valor por dia cai duas vezes, na segunda e na sétima diária. No Garageinn cai uma vez só, na segunda. Depois do último degrau o valor por dia trava, então a viagem de 15 dias custa pouco mais que o dobro da de 7, sem surpresa. Virapark em valores de setembro de 2026, Garageinn conferido em 20 de outubro de 2026.')
where slug = 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-viracopos';

-- 6. Existe estacionamento mensal no Aeroporto de Viracopos? (a resposta curta não cita a Garageinn)
update public.faq
set body_md = replace(replace(replace(body_md,
      '| Garageinn, vaga avulsa, parceiro Movepark | R$ 1.377,00 | R$ 45,90 |',
      '| Garageinn, vaga avulsa, parceiro Movepark | R$ 1.707,00 | R$ 56,90 |'),
      'Preços Movepark do motor de reservas e tabela do site oficial de Viracopos, ambos conferidos em 17 de setembro de 2026.',
      'Preços do motor de reservas da Movepark (Virapark em 17 de setembro de 2026, Garageinn em 20 de outubro de 2026) e tabela do site oficial de Viracopos de 17 de setembro de 2026.'),
      'é aí que a diferença de R$ 630,00 aparece inteira.',
      'é aí que a diferença de R$ 960,00 aparece inteira.')
where slug = 'existe-estacionamento-mensal-no-aeroporto-de-viracopos';

-- 7. Traduções. "Existe estacionamento mensal" não tem cifra da Garageinn em en/es.
update public.faq_i18n i
set answer = v.answer
from (values
  ('tem-estacionamento-dentro-do-aeroporto-de-viracopos', 'en',
   'There is. Besides the official one (garage building at R$ 83.00 and lot F at R$ 31.00 a day, August 2026 prices), the partner Garageinn operates at Centro Empresarial Viracopos, inside the airport complex, 979 m from the terminal. The shuttle takes 3 minutes, with a van every 15, and a day costs R$ 56.90 from 2 days up, checked in the booking engine on 20 October 2026.'),
  ('tem-estacionamento-dentro-do-aeroporto-de-viracopos', 'es',
   'Sí. Además del oficial (edificio garaje a R$ 83,00 y playa F a R$ 31,00 por día, precios de agosto de 2026), el socio Garageinn opera en el Centro Empresarial Viracopos, dentro del complejo del aeropuerto, a 979 m de la terminal. El traslado tarda 3 minutos, con combi cada 15, y el día cuesta R$ 56,90 a partir de 2 días, verificado en el motor de reservas el 20 de octubre de 2026.'),
  ('qual-o-estacionamento-mais-proximo-do-aeroporto-de-viracopos', 'en',
   'The official garage building is the only one right by the terminal, with a walkway and a daily rate of R$ 83.00. Among the alternatives, the closest is Garageinn, 979 m away, inside the complex, with a 3-minute shuttle and a daily rate of R$ 56.90 from 2 days up. Virapark sits 3.7 km away, with a van every 15 minutes and a covered spot at R$ 40.00 a day, or R$ 24.90 a day from 7 days up. Garageinn checked on 20 October 2026; the other prices are from August 2026.'),
  ('qual-o-estacionamento-mais-proximo-do-aeroporto-de-viracopos', 'es',
   'El edificio garaje oficial es el único pegado a la terminal, con pasarela y tarifa diaria de R$ 83,00. Entre los alternativos, el más cercano es Garageinn, a 979 m, dentro del complejo, con traslado de 3 minutos y tarifa diaria de R$ 56,90 a partir de 2 días. Virapark queda a 3,7 km, con combi cada 15 minutos y plaza cubierta a R$ 40,00 por día, o R$ 24,90 por día a partir de 7 días. Garageinn verificado el 20 de octubre de 2026; los demás precios son de agosto de 2026.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-viracopos', 'en',
   'Among the prices we compared in August 2026, the lowest advertised daily rate near Viracopos is Bandeira Park: R$ 18.49 uncovered, dropping to R$ 7.98 on stays of 18 to 30 days. For a covered spot, Virapark comes to R$ 24.90 a day from 7 days up through the booking engine, with a 24h shuttle. Inside the complex, Garageinn charges R$ 56.90 a day from 2 days up, checked on 20 October 2026.'),
  ('qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-viracopos', 'es',
   'Entre los precios que comparamos en agosto de 2026, la tarifa diaria más baja anunciada cerca de Viracopos es la de Bandeira Park: R$ 18,49 en descubierta, y baja a R$ 7,98 en estadías de 18 a 30 días. En plaza cubierta, Virapark cierra R$ 24,90 por día a partir de 7 días por el motor de reservas, con traslado 24h. Dentro del complejo, Garageinn cobra R$ 56,90 por día a partir de 2 días, verificado el 20 de octubre de 2026.'),
  ('quanto-custa-estacionar-no-aeroporto-de-viracopos', 'en',
   'At Viracopos, the Movepark partner Virapark charges R$ 40.00 a day for a covered spot with a 24h shuttle, dropping to R$ 24.90 a day from 7 days up. The partner Garageinn, inside the airport complex, charges R$ 59.99 for the first day and R$ 56.90 from the second, checked on 20 October 2026. At the official car park, lot F costs R$ 31.00 and the garage building R$ 83.00. The other prices were checked between 28 August and 8 September 2026; the table below compares the main ones.'),
  ('quanto-custa-estacionar-no-aeroporto-de-viracopos', 'es',
   'En Viracopos, el socio Movepark Virapark cobra R$ 40,00 por día en plaza cubierta con traslado 24h, y baja a R$ 24,90 por día a partir de 7 días. El socio Garageinn, dentro del complejo del aeropuerto, cobra R$ 59,99 el primer día y R$ 56,90 desde el segundo, verificado el 20 de octubre de 2026. En el oficial, la playa F cuesta R$ 31,00 y el edificio garaje R$ 83,00. Los demás precios se verificaron entre el 28 de agosto y el 8 de septiembre de 2026; la tabla de abajo compara los principales.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-viracopos', 'en',
   'It depends on the lot. At the partner Virapark it is worth it: the daily rate goes from R$ 40.00 on a one-day stay to R$ 24.90 from seven days up, a 38% fall, and the per-day price does not rise again up to 30 days. At Garageinn the drop is small, from R$ 59.99 to R$ 56.90 from the second day, 5% less. The official car park charges the same per day at any length. Virapark at September 2026 prices, Garageinn checked on 20 October 2026.'),
  ('compensa-deixar-o-carro-mais-dias-no-aeroporto-de-viracopos', 'es',
   'Depende del predio. En el socio Virapark conviene: la tarifa pasa de R$ 40,00 en una estadía de un día a R$ 24,90 a partir de siete, una caída del 38%, y el valor por día no vuelve a subir hasta los 30 días. En Garageinn la baja es pequeña, de R$ 59,99 a R$ 56,90 desde el segundo día, un 5% menos. El estacionamiento oficial cobra lo mismo por día en cualquier duración. Virapark con precios de septiembre de 2026, Garageinn verificado el 20 de octubre de 2026.')
) as v(slug, locale, answer)
join public.faq f on f.slug = v.slug
where i.faq_id = f.id and i.locale = v.locale::public.content_locale;

-- Trava: nenhum valor da tabela antiga da Garageinn pode sobrar nessas FAQs, em idioma nenhum. Se
-- um replace não casou (o texto mudou desde a leitura de 22/10), a migration falha em vez de
-- publicar meia troca.
do $$
declare
  antigos text := '(45[,.]90|321[,.]30|688[,.]50|1[.,]377[,.]00|R\$ 630[,.]00|sétima diária nos dois|23% menos|23% less|un 23% menos)';
  sobra text;
begin
  select string_agg(distinct f.slug || coalesce(' (' || i.locale || ')', ''), ', ')
    into sobra
  from public.faq f
  left join public.faq_i18n i on i.faq_id = f.id
  where f.slug in (
      'tem-estacionamento-dentro-do-aeroporto-de-viracopos',
      'qual-o-estacionamento-mais-proximo-do-aeroporto-de-viracopos',
      'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-viracopos',
      'quanto-custa-estacionar-no-aeroporto-de-viracopos',
      'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-viracopos',
      'existe-estacionamento-mensal-no-aeroporto-de-viracopos')
    and (coalesce(f.answer, '') || coalesce(f.body_md, '') || coalesce(i.answer, '') || coalesce(i.body_md, '')) ~ antigos;

  if sobra is not null then
    raise exception 'FAQ de Viracopos com valor da tabela antiga da Garageinn: %', sobra;
  end if;
end $$;
