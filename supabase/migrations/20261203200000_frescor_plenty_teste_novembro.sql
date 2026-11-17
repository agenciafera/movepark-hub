-- Teste de preço da Plenty Park (Congonhas) de 17/11/2026, 21 dias, aprovado pelo cliente.
--
-- A vaga coberta da Plenty Park saiu da tabela de 16/10/2026 (R$ 39,90 por dia de 3 a 6 diárias,
-- R$ 37,90 de 7 a 14 e R$ 35,90 a partir de 15) para R$ 31,90 de 3 a 6, R$ 27,90 de 7 a 14,
-- R$ 26,90 de 15 a 29 e R$ 16,90 a partir de 30. O balcão segue R$ 49,90 por dia e a estadia
-- mínima segue 3 diárias. O WL virou em 17/11/2026 e o espelho do Hub copiou às 10h29.
-- A Aerovalet não mudou (segue na tabela de 28/10/2026).
-- FAQs e posts de Congonhas (pt, en, es) ainda citavam a tabela de 16/10, os totais dela
-- (R$ 265,30 na semana, R$ 1.077,00 no mês) e as diferenças calculadas sobre eles. O guia de
-- estacionamentos próximos ainda tinha os dois parceiros na tabela de setembro e foi corrigido de
-- passagem. Toda cifra nova saiu do simulate_price em 17/11/2026. Congonhas não tem bloco
-- "em números". O registro está em docs/specs/rotina-mensal-frescor.md.
--
-- Cada campo é trocado inteiro e só se o md5 ainda for o do texto lido em 17/11/2026. Se alguém
-- editou o documento no meio, a migration aborta inteira em vez de sobrescrever a edição.

do $frescor$
declare
  n int;
  total int := 0;
begin
  -- Guarda de replay: num banco sem o acervo (db reset do CI) não há texto a revisar.
  if not exists (select 1 from public.faq where id = '084f9d04-3d72-4840-aa7c-78096302d9fa') then
    raise notice 'frescor plenty: banco sem o acervo de 17/11, nada a revisar';
    return;
  end if;

  -- faq · as-vagas-em-congonhas-sao-cobertas-ou-descobertas · pt · answer
  update public.faq set answer = $f1$Em Congonhas as duas unidades parceiras da Movepark trabalham com vaga coberta: a Aerovalet a 738 m do terminal, por R$ 28,90 na diária avulsa, e a Plenty Park a 863 m, por R$ 31,90 por dia a partir de 3 diárias. Como o aeroporto fica dentro da cidade, os pátios cobertos costumam ser edifício-garagem, o que também abriga o carro do sol e da chuva. Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026.$f1$
   where id = '084f9d04-3d72-4840-aa7c-78096302d9fa' and md5(answer) = '3e42ec18e5a1647e2be9263b4e702388';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'as-vagas-em-congonhas-sao-cobertas-ou-descobertas', 'pt answer'; end if;
  total := total + 1;

  -- faq · as-vagas-em-congonhas-sao-cobertas-ou-descobertas · pt · body_md
  update public.faq set body_md = $f2$## Vaga coberta ou descoberta no Aeroporto de Congonhas: qual escolher

Congonhas é território de vaga coberta: os parceiros Movepark Plenty Park (R$ 27,90 por dia a partir de 7 diárias, na tabela de 17/11/2026) e Aerovalet (R$ 28,90 na diária avulsa) trabalham com garagem coberta, e o oficial é um edifício-garagem.

A conta é simples: em estadia curta, a diferença de poucos reais por dia não pesa; em 15 ou 30 diárias, ela vira o preço de mais um dia inteiro de estacionamento.

- Coberta protege de sol forte, chuva e granizo; compensa pra carro que fica semanas parado.
- Descoberta costuma ter a menor diária e não tem limite de altura.
- Carro muito alto? Veja [o limite de altura (gabarito)](/faq/existe-limite-de-altura-gabarito-para-suvs-vans-ou-furgoes-congonhas-cgh).

O comparativo de preços da região está em [quanto custa estacionar no Aeroporto de Congonhas](/faq/quanto-custa-estacionar-no-aeroporto-de-congonhas).$f2$
   where id = '084f9d04-3d72-4840-aa7c-78096302d9fa' and md5(body_md) = 'aef3a3154fd313ef960dc653f85b6fc4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'as-vagas-em-congonhas-sao-cobertas-ou-descobertas', 'pt body_md'; end if;
  total := total + 1;

  -- faq · compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas · pt · answer
  update public.faq set answer = $f3$Compensa. Na Aerovalet a vaga coberta sai de R$ 28,90 na diária avulsa para R$ 25,90 por dia em uma semana, R$ 19,90 por dia a partir de 17 diárias e R$ 14,90 por dia a partir de 30, 48% menos. Na Plenty Park, que aceita reserva a partir de 3 diárias, o valor por dia vai de R$ 31,90 para R$ 27,90 a partir de 7, R$ 26,90 a partir de 15 e R$ 16,90 a partir de 30, 47% menos. O edifício-garagem oficial cobra o mesmo por dia em qualquer duração. Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026.$f3$
   where id = '1bf27509-b855-47d2-ac8a-cdca93780a24' and md5(answer) = '9583a47bc3a147e422c47cc74c871f90';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas', 'pt answer'; end if;
  total := total + 1;

  -- faq · compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas · pt · body_md
  update public.faq set body_md = $f4$## Como o preço por dia cai em Congonhas?

| Estadia | Aerovalet | Plenty Park |
| --- | --- | --- |
| 1 diária | R$ 28,90 | mínimo de 3 diárias |
| 7 diárias | R$ 181,30 (R$ 25,90/dia) | R$ 195,30 (R$ 27,90/dia) |
| 15 diárias | R$ 388,50 (R$ 25,90/dia) | R$ 403,50 (R$ 26,90/dia) |
| 30 diárias | R$ 447,00 (R$ 14,90/dia) | R$ 507,00 (R$ 16,90/dia) |

As duas baixam o valor por dia em degraus. A Plenty Park desce para R$ 27,90 na sétima diária, R$ 26,90 na 15ª e R$ 16,90 na 30ª. A Aerovalet desce para R$ 25,90 na sétima, R$ 19,90 na 17ª e R$ 14,90 na 30ª, e sai mais barata por dia em todas as durações que a Plenty Park aceita. Como o desconto de cada faixa vale para a estadia inteira, nas duas 30 diárias custam menos que 29 (R$ 447,00 contra R$ 577,10 na Aerovalet e R$ 507,00 contra R$ 780,10 na Plenty Park), e na Aerovalet 17 diárias custam menos que 16 (R$ 338,30 contra R$ 414,40). A Plenty Park só aceita reserva a partir de 3 diárias.

Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026. Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$f4$
   where id = '1bf27509-b855-47d2-ac8a-cdca93780a24' and md5(body_md) = '12ea30abd51bd39672d150450f095a5a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'compensa-deixar-o-carro-mais-dias-no-aeroporto-de-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- faq · qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas · pt · answer
  update public.faq set answer = $f5$A menor diária perto de Congonhas é a da Aerovalet, parceira Movepark: R$ 28,90 no dia avulso, em vaga coberta e com preço fechado na reserva online, na tabela de 28/10/2026. Entre os lotes sem reserva pela Movepark, na leitura de 9 de outubro de 2026, a menor diária publicada era a do The Parking, R$ 30,00, com reserva pelo WhatsApp e pátio aberto das 4h às 23h59, e para estadias de 15 a 30 dias o Express Parking cobrava R$ 600,00 fixos, mais do que a Aerovalet cobra em qualquer duração desse intervalo. A Plenty Park, também parceira, cobra de R$ 31,90 a R$ 16,90 por dia, conforme a estadia, com mínimo de 3 diárias, na tabela de 17/11/2026. O edifício-garagem oficial cobrava R$ 44,90 com reserva.$f5$
   where id = 'cfbd93e8-2909-49e1-af1a-11d1b8c833de' and md5(answer) = 'bc2fe9e949463316e9974d9a8c9d808b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-congonhas', 'pt answer'; end if;
  total := total + 1;

  -- faq · quanto-custa-estacionar-no-aeroporto-de-congonhas · pt · answer
  update public.faq set answer = $f6$Perto do Aeroporto de Congonhas, a Aerovalet, parceira Movepark, cobra R$ 28,90 no dia avulso em vaga coberta, R$ 25,90 por dia de 7 a 16 diárias, R$ 19,90 de 17 a 29 e R$ 14,90 a partir de 30. A Plenty Park, também parceira, cobra R$ 31,90 por dia com mínimo de 3 diárias, R$ 27,90 de 7 a 14, R$ 26,90 de 15 a 29 e R$ 16,90 a partir de 30. As duas ficam a menos de 900 m do terminal. No edifício-garagem oficial a diária com reserva estava em R$ 44,90. Entre os demais lotes que abrem tarifa, o mais barato é o The Parking, a R$ 30,00, e o mais caro o One Parking, a R$ 45,00. Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026; os dos demais, de 9 de outubro de 2026.$f6$
   where id = 'ff52e15e-fcb6-4caa-8345-beff7a99fd2b' and md5(answer) = '215a1d050f05605a873943faab7885a8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'quanto-custa-estacionar-no-aeroporto-de-congonhas', 'pt answer'; end if;
  total := total + 1;

  -- faq · quanto-custa-estacionar-no-aeroporto-de-congonhas · pt · body_md
  update public.faq set body_md = $f7$Comparativo dos principais estacionamentos perto do Aeroporto de Congonhas (CGH):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Aerovalet (parceiro Movepark)** | R$ 28,90 | Vaga coberta a 738 m do terminal, sem estadia mínima; R$ 25,90 por dia de 7 a 16 diárias, R$ 19,90 de 17 a 29 e R$ 14,90 a partir de 30 |
| **Plenty Park (parceiro Movepark)** | R$ 31,90 | Vaga coberta a 863 m do terminal, com mínimo de 3 diárias; R$ 27,90 por dia de 7 a 14 diárias, R$ 26,90 de 15 a 29 e R$ 16,90 a partir de 30 |
| The Parking | R$ 30,00 | Reserva pelo WhatsApp e traslado gratuito; o pátio abre das 4h às 23h59, não é 24 horas |
| MultiPark | R$ 39,00 | Com reserva online; no balcão a mesma diária sai R$ 50,00. Aberto 24 horas |
| Grand Parking | R$ 40,00 | R$ 34,00 por dia mais taxa de serviço de 20%, limitada a R$ 50,00 por estadia. Vaga descoberta, deixando a chave |
| Congonhas Park | R$ 40,00 | Reservando pelo WhatsApp; a diária cheia sai R$ 45,00 |
| Express Parking | R$ 40,00 | Carro pequeno; carro grande sai R$ 45,00. Estadia de 15 a 30 dias por R$ 600,00 fixos |
| Edifício-garagem oficial (Estapar) | R$ 44,90 | Com reserva antecipada; o preço muda conforme a procura |
| One Parking | R$ 45,00 | Carro e SUV. Publica também hora avulsa, R$ 15,00, e o traslado só vale a partir de 2 diárias |

Os valores dos estacionamentos sem reserva pela Movepark vêm do site de cada um, conferidos em 9 de outubro de 2026, e podem mudar sem aviso. O Facility só informa o preço depois de um cadastro, e o Arai Park está com a operação suspensa desde maio de 2026. O preço do parceiro Movepark sai do motor de reservas (Aerovalet na tabela de 28/10/2026, Plenty Park na de 17/11/2026) e fica sempre atualizado na [tabela de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas).$f7$
   where id = 'ff52e15e-fcb6-4caa-8345-beff7a99fd2b' and md5(body_md) = '88be97eecb288391cb13ae03c31fbf05';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'quanto-custa-estacionar-no-aeroporto-de-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- faq · vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular · pt · body_md
  update public.faq set body_md = $f8$## Oficial ou particular em Congonhas

Congonhas é o caso em que a distância decide menos, porque o aeroporto está dentro da cidade e os particulares ficam a poucos minutos do terminal.

| Estadia | Aerovalet (coberta, 738 m) | Plenty Park (coberta, 863 m) | Oficial com reserva |
| --- | --- | --- | --- |
| 1 diária | R$ 28,90 | mínimo de 3 diárias | R$ 44,90 |
| 7 diárias | R$ 181,30 (R$ 25,90/dia) | R$ 195,30 (R$ 27,90/dia) | R$ 314,30 |
| 30 diárias | R$ 447,00 (R$ 14,90/dia) | R$ 507,00 (R$ 16,90/dia) | R$ 1.347,00 |

Pelos preços da tabela, o particular sai mais barato em todas as durações, e a vantagem cresce com a estadia. Na diária avulsa a diferença é de R$ 16,00, e o oficial muda o preço conforme a procura. Em 30 diárias a Aerovalet custa R$ 900,00 a menos e a Plenty Park, R$ 840,00 a menos.

### Atenção à estadia mínima

A Plenty Park só aceita reserva a partir de 3 diárias. Para ida e volta no mesmo dia, a opção é a Aerovalet ou o oficial.

Preços da Aerovalet na tabela de 28/10/2026 e da Plenty Park na de 17/11/2026. O oficial é a diária com reserva lida em 9 de outubro de 2026, multiplicada pelo número de dias. O comparativo completo está em [quanto custa estacionar no Aeroporto de Congonhas](/faq/quanto-custa-estacionar-no-aeroporto-de-congonhas).$f8$
   where id = '09de600d-5966-43bd-a2ff-5f16899c2036' and md5(body_md) = 'b92122dafa5134013f20859d09f9739b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq', 'vale-mais-a-pena-o-estacionamento-oficial-de-congonhas-ou-um-particular', 'pt body_md'; end if;
  total := total + 1;

  -- faq_i18n · are-congonhas-spots-covered-or-uncovered · en · answer
  update public.faq_i18n set answer = $f9$At Congonhas both Movepark partner units work with covered spots: Aerovalet 738 m from the terminal, at R$ 28.90 for a single day, and Plenty Park 863 m away, at R$ 31.90 a day from 3 days up. Since the airport sits inside the city, the covered lots tend to be garage buildings, which also shelter the car from sun and rain. Aerovalet prices from its 28/10/2026 table and Plenty Park prices from its 17/11/2026 table.$f9$
   where faq_id = '084f9d04-3d72-4840-aa7c-78096302d9fa' and locale = 'en' and md5(answer) = 'b1febf0c5a602970dd512b1e7cf07662';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'are-congonhas-spots-covered-or-uncovered', 'en answer'; end if;
  total := total + 1;

  -- faq_i18n · cheapest-parking-near-congonhas-airport · en · answer
  update public.faq_i18n set answer = $f10$The lowest daily rate near Congonhas is Aerovalet, a Movepark partner: R$ 28.90 for a single day, in a covered spot with the price locked at online booking, on its 28/10/2026 table. Among the lots not booked through Movepark, in the 9 October 2026 reading, the lowest published daily rate was The Parking, R$ 30.00, booked over WhatsApp, with the lot open from 4 am to 11:59 pm, and for stays of 15 to 30 days Express Parking charged a flat R$ 600.00, more than Aerovalet charges for any length in that range. Plenty Park, also a partner, charges from R$ 31.90 down to R$ 16.90 a day depending on the stay, with a 3-day minimum, on its 17/11/2026 table. The official garage building charged R$ 44.90 with a booking.$f10$
   where faq_id = 'cfbd93e8-2909-49e1-af1a-11d1b8c833de' and locale = 'en' and md5(answer) = '5f4cab82b7e6a37c33df1c8eea4fec38';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'cheapest-parking-near-congonhas-airport', 'en answer'; end if;
  total := total + 1;

  -- faq_i18n · how-much-does-parking-at-congonhas-airport-cost · en · answer
  update public.faq_i18n set answer = $f11$Near Congonhas Airport, Aerovalet, a Movepark partner, charges R$ 28.90 for a single day in a covered spot, R$ 25.90 a day for 7 to 16 days, R$ 19.90 for 17 to 29 and R$ 14.90 from 30 days up. Plenty Park, also a partner, charges R$ 31.90 a day with a 3-day minimum, R$ 27.90 for 7 to 14 days, R$ 26.90 for 15 to 29 and R$ 16.90 from 30 days up. Both sit less than 900 m from the terminal. At the official garage building an advance booking was R$ 44.90 a day. Among the other lots that publish rates, the cheapest is The Parking at R$ 30.00 and the dearest One Parking at R$ 45.00. Aerovalet prices from its 28/10/2026 table and Plenty Park prices from its 17/11/2026 table; the others on 9 October 2026.$f11$
   where faq_id = 'ff52e15e-fcb6-4caa-8345-beff7a99fd2b' and locale = 'en' and md5(answer) = 'dc0c3e1e2b82c5216d4e5fe0df97582b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'how-much-does-parking-at-congonhas-airport-cost', 'en answer'; end if;
  total := total + 1;

  -- faq_i18n · is-it-worth-leaving-the-car-longer-at-congonhas-airport · en · answer
  update public.faq_i18n set answer = $f12$It is. At Aerovalet a covered spot goes from R$ 28.90 for a single day to R$ 25.90 a day over a week, R$ 19.90 a day from 17 days and R$ 14.90 a day from 30 days up, 48% less. At Plenty Park, which takes bookings from 3 days, the per-day price goes from R$ 31.90 to R$ 27.90 from 7 days, R$ 26.90 from 15 and R$ 16.90 from 30 days up, 47% less. The official garage building charges the same per day at any length. Aerovalet prices from its 28/10/2026 table and Plenty Park prices from its 17/11/2026 table.$f12$
   where faq_id = '1bf27509-b855-47d2-ac8a-cdca93780a24' and locale = 'en' and md5(answer) = '9324bcec4191169d1890ad406004bd0c';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'is-it-worth-leaving-the-car-longer-at-congonhas-airport', 'en answer'; end if;
  total := total + 1;

  -- faq_i18n · las-plazas-en-congonhas-son-cubiertas-o-descubiertas · es · answer
  update public.faq_i18n set answer = $f13$En Congonhas las dos unidades socias de Movepark trabajan con plaza cubierta: Aerovalet a 738 m de la terminal, por R$ 28,90 el día suelto, y Plenty Park a 863 m, por R$ 31,90 por día a partir de 3 días. Como el aeropuerto está dentro de la ciudad, los predios cubiertos suelen ser edificios garaje, que también resguardan el auto del sol y de la lluvia. Precios de Aerovalet según su tabla del 28/10/2026 y de Plenty Park según la del 17/11/2026.$f13$
   where faq_id = '084f9d04-3d72-4840-aa7c-78096302d9fa' and locale = 'es' and md5(answer) = '32d829fac2629667d46eba3df92c90c8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'las-plazas-en-congonhas-son-cubiertas-o-descubiertas', 'es answer'; end if;
  total := total + 1;

  -- faq_i18n · estacionamiento-mas-barato-cerca-del-aeropuerto-de-congonhas · es · answer
  update public.faq_i18n set answer = $f14$La tarifa diaria más baja cerca de Congonhas es la de Aerovalet, socio Movepark: R$ 28,90 por día suelto, en plaza cubierta y con precio cerrado en la reserva en línea, según su tabla del 28/10/2026. Entre los predios sin reserva por Movepark, según el relevamiento del 9 de octubre de 2026, la tarifa diaria más baja publicada era la de The Parking, R$ 30,00, con reserva por WhatsApp y predio abierto de 4h a 23h59, y para estadías de 15 a 30 días Express Parking cobraba R$ 600,00 fijos, más de lo que cobra Aerovalet en cualquier duración de ese intervalo. Plenty Park, también socio, cobra de R$ 31,90 a R$ 16,90 por día según la estadía, con mínimo de 3 días, según su tabla del 17/11/2026. El edificio garaje oficial cobraba R$ 44,90 con reserva.$f14$
   where faq_id = 'cfbd93e8-2909-49e1-af1a-11d1b8c833de' and locale = 'es' and md5(answer) = '004b2fcd5f53fa6369fbf2718b3f0338';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'estacionamiento-mas-barato-cerca-del-aeropuerto-de-congonhas', 'es answer'; end if;
  total := total + 1;

  -- faq_i18n · cuanto-cuesta-estacionar-en-el-aeropuerto-de-congonhas · es · answer
  update public.faq_i18n set answer = $f15$Cerca del Aeropuerto de Congonhas, Aerovalet, socio Movepark, cobra R$ 28,90 por día suelto en plaza cubierta, R$ 25,90 por día de 7 a 16 días, R$ 19,90 de 17 a 29 y R$ 14,90 a partir de 30. Plenty Park, también socio, cobra R$ 31,90 por día con mínimo de 3 días, R$ 27,90 de 7 a 14, R$ 26,90 de 15 a 29 y R$ 16,90 a partir de 30. Los dos quedan a menos de 900 m de la terminal. En el edificio garaje oficial la reserva anticipada estaba en R$ 44,90 por día. Entre los demás predios que publican tarifa, el más barato es The Parking a R$ 30,00 y el más caro One Parking a R$ 45,00. Precios de Aerovalet según su tabla del 28/10/2026 y de Plenty Park según la del 17/11/2026; los demás, el 9 de octubre de 2026.$f15$
   where faq_id = 'ff52e15e-fcb6-4caa-8345-beff7a99fd2b' and locale = 'es' and md5(answer) = 'a36dfeea1684f2e47bdea016572908bb';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'cuanto-cuesta-estacionar-en-el-aeropuerto-de-congonhas', 'es answer'; end if;
  total := total + 1;

  -- faq_i18n · conviene-dejar-el-auto-mas-dias-en-el-aeropuerto-de-congonhas · es · answer
  update public.faq_i18n set answer = $f16$Conviene. En Aerovalet la plaza cubierta pasa de R$ 28,90 por día suelto a R$ 25,90 por día en una semana, R$ 19,90 por día a partir de 17 días y R$ 14,90 por día a partir de 30, un 48% menos. En Plenty Park, que acepta reservas desde 3 días, el valor por día va de R$ 31,90 a R$ 27,90 a partir de 7, R$ 26,90 a partir de 15 y R$ 16,90 a partir de 30, un 47% menos. El edificio garaje oficial cobra lo mismo por día en cualquier duración. Precios de Aerovalet según su tabla del 28/10/2026 y de Plenty Park según la del 17/11/2026.$f16$
   where faq_id = '1bf27509-b855-47d2-ac8a-cdca93780a24' and locale = 'es' and md5(answer) = '065816ff07b13e5e3a5c8fb5ac415984';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'faq_i18n', 'conviene-dejar-el-auto-mas-dias-en-el-aeropuerto-de-congonhas', 'es answer'; end if;
  total := total + 1;

  -- blog_post · voo-atrasou-estacionamento-aeroporto · pt · body_md
  update public.blog_post set body_md = $f17$Se o seu voo atrasou e o estacionamento do aeroporto cobrou mais um dia, quem paga primeiro é você, no balcão de saída. A companhia aérea não tem obrigação de pagar estacionamento como assistência. A regra seguiu igual depois da Resolução 813 da ANAC, que mudou a Resolução 400 em 26 de outubro de 2026. O que você pode fazer é pedir o valor de volta como dano material, com comprovante na mão. Abaixo: o que a ANAC cobre, quanto custa um dia a mais e como pedir o reembolso.

## Resposta rápida: quem paga o quê quando o voo atrasa?

| Situação | Quem paga | Base |
|---|---|---|
| Comida depois de 2 horas de espera | Companhia aérea | Resolução 400 da ANAC, arts. 26 e 27 |
| Hotel e transporte depois de 4 horas, com pernoite | Companhia aérea | Resolução 400 da ANAC, arts. 26 e 27 |
| Remarcação ou reembolso da passagem (atraso de mais de 4 horas, cancelamento ou preterição) | Companhia aérea | Resolução 400 da ANAC, art. 21 |
| Diária extra do estacionamento | Você paga na saída e pode pedir de volta à companhia | Código Brasileiro de Aeronáutica, art. 256, e Código de Defesa do Consumidor |
| Diária extra quando o atraso veio de mau tempo ou ordem do controle aéreo | Em regra, fica com você | Código Brasileiro de Aeronáutica, art. 256, § 3º |

A tabela resume o que a lei diz em novembro de 2026. Cada linha tem a explicação completa mais abaixo, junto com o que guardar para o pedido dar certo.

## O que mudou na Resolução 400 da ANAC em outubro de 2026?

A Resolução 400 da ANAC, de dezembro de 2016, define os direitos do passageiro em voo atrasado, cancelado ou interrompido. Em 23 de setembro de 2026 a agência aprovou a Resolução 813, que alterou o capítulo de atrasos e cancelamentos. As regras novas valem desde 26 de outubro de 2026, segundo a própria ANAC.

### As quatro mudanças que importam para quem deixou o carro

Foram quatro pontos alterados pela Resolução 813, todos com efeito para quem deixou o carro no estacionamento do aeroporto:

- **Aviso por canal digital.** A companhia tem que avisar o atraso ou o cancelamento assim que souber. Na mensagem vêm a nova previsão de partida, as opções de remarcação e reembolso e o caminho para pedir a assistência, com a data e a hora da última atualização.
- **Aviso antes da compra.** Na hora de comprar a passagem, a companhia tem que dizer, em linguagem simples, que o voo pode atrasar ou ser cancelado por clima e por exigência de segurança.
- **Assistência separada de culpa.** Dar comida e hotel não significa que a companhia admitiu a culpa pelo atraso. A assistência continua devida mesmo em caso fortuito ou força maior.
- **Reembolso da assistência em casos excepcionais.** Às vezes o aeroporto não tem como fornecer comida, transporte ou hotel. Nesse caso, a companhia pode reembolsar o que você gastou, em até sete dias, com comprovante.

A obrigação de oferecer telefone e internet depois de uma hora de espera caiu, porque todo mundo anda com celular. Quem quiser ler a versão oficial encontra o resumo no [comunicado da ANAC sobre a atualização da Resolução 400](https://www.gov.br/anac/pt-br/noticias/2026/anac-atualiza-regras-sobre-atrasos-e-cancelamentos-e-amplia-deveres-de-informacao-aos-passageiros), publicado em setembro de 2026.

![passageiro paga a diária extra no estacionamento do aeroporto depois do voo atrasado, no caixa de saída num fim de tarde nublado](/images/blog/voo-atrasou-estacionamento-aeroporto/voo-atrasou-estacionamento-aeroporto-caixa-de-saida.webp)

## A companhia aérea paga o estacionamento quando o voo atrasa?

Não como assistência. A lista da Resolução 400 da ANAC é fechada em alimentação, hospedagem e transporte. O transporte de que ela fala é o trajeto até o hotel e de volta ao aeroporto. A diária extra do estacionamento não aparece em nenhuma linha, nem na versão alterada pela Resolução 813.

A diária extra do estacionamento entra em outra porta: a da responsabilidade civil. O Código Brasileiro de Aeronáutica diz, no artigo 256, que a companhia responde pelo dano causado pelo atraso do transporte que você contratou. O Código de Defesa do Consumidor vai na mesma direção para o serviço com defeito. Se o atraso fez você pagar um dia a mais de estacionamento, esse dia é um prejuízo em dinheiro. A lei chama isso de dano material, e ele pode ser cobrado da companhia.

Na prática, quando o voo atrasou e o estacionamento do aeroporto passou da tolerância, acontecem duas coisas:

1. O estacionamento cobra de você, na saída, porque o contrato dele é com você e não com a companhia aérea.
2. Você pede o valor de volta à companhia, com o recibo do estacionamento e a prova do atraso.

Ninguém faz esse acerto por você. A companhia não liga para o estacionamento, e o estacionamento não manda a conta para a companhia. Quem junta os papéis e faz o pedido é o passageiro.

## Quando o atraso vem do mau tempo, a companhia ainda paga a diária?

Em regra, não. A Lei 14.034, de 2020, incluiu no artigo 256 do Código Brasileiro de Aeronáutica uma lista de situações de caso fortuito ou força maior. Nelas, a companhia não responde pelo dano do atraso. Estão na lista as restrições de pouso e decolagem por condição meteorológica adversa, as restrições do controle do espaço aéreo, a indisponibilidade da infraestrutura do aeroporto e as ordens de autoridade pública.

A Resolução 813 da ANAC repetiu essa regra no texto da própria norma, no novo artigo 25-B. A agência não criou exceção nova: só deixou escrito, no regulamento do passageiro, o que a lei já dizia.

Mesmo com mau tempo, a assistência continua obrigatória. A companhia segue devendo comida depois de duas horas e hotel depois de quatro, quando há pernoite. O que fica de fora é o dano material, e a diária do estacionamento está nesse grupo.

Se o voo atrasou e o estacionamento do aeroporto cobrou a diária por causa de neblina, a companhia, em regra, não devolve o valor. Por isso vale perguntar o motivo do atraso no balcão da companhia e anotar a resposta. Atraso por manutenção do avião, troca de tripulação, excesso de venda ou problema de escala é falha do serviço, e o pedido de reembolso da diária tem base. Atraso por neblina que fechou o aeroporto, em regra, não tem. Se a companhia disser que foi o tempo e você suspeitar do contrário, o histórico de outros voos do mesmo horário naquele aeroporto ajuda a tirar a dúvida.

## Quanto custa um dia a mais no estacionamento do aeroporto?

A diferença entre 7 e 8 diárias na tabela de reserva dos parceiros da Movepark, conferida no motor de reservas em 13 de novembro de 2026 (a do Plenty Park, na tabela de 17 de novembro de 2026), vai de R$ 11,90 a R$ 45,90, conforme o aeroporto e o tipo de vaga. A tabela abaixo mostra a vaga mais barata de cada parceiro.

| Aeroporto | Estacionamento | Vaga | 7 diárias | 8 diárias | Um dia a mais |
|---|---|---|---|---|---|
| Guarulhos (GRU) | Aerovalet | Descoberta | R$ 83,30 | R$ 95,20 | R$ 11,90 |
| Guarulhos (GRU) | Aeropark | Descoberta | R$ 132,30 | R$ 151,20 | R$ 18,90 |
| Guarulhos (GRU) | Pare Seguro | Descoberta | R$ 132,30 | R$ 151,20 | R$ 18,90 |
| Congonhas (CGH) | Aerovalet | Coberta | R$ 181,30 | R$ 207,20 | R$ 25,90 |
| Congonhas (CGH) | Plenty Park | Coberta | R$ 195,30 | R$ 223,20 | R$ 27,90 |
| Viracopos (VCP) | Virapark | Coberta | R$ 209,30 | R$ 239,20 | R$ 29,90 |
| Viracopos (VCP) | Garageinn | Avulsa | R$ 321,30 | R$ 367,20 | R$ 45,90 |
| Afonso Pena (CWB) | Abbapark | Descoberta | R$ 153,30 | R$ 175,20 | R$ 21,90 |
| Afonso Pena (CWB) | Nationpark | Descoberta | R$ 181,30 | R$ 207,20 | R$ 25,90 |
| Confins (CNF) | BePark | Coberta | R$ 200,00 | R$ 245,00 | R$ 45,00 |

Preços da tabela de reserva em 13/11/2026. Os valores de hoje estão em [estacionamentos no Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos), [estacionamentos no Aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas), [estacionamentos no Aeroporto de Viracopos](/estacionamentos/aeroporto-viracopos), [estacionamentos no Aeroporto Afonso Pena](/estacionamentos/aeroporto-curitiba) e [estacionamentos no Aeroporto de Confins](/estacionamentos/aeroporto-confins).

### Por que o balcão pode cobrar outro valor?

A diferença entre 7 e 8 diárias é a melhor referência do custo de um dia a mais. Mesmo assim, ela não é o número que o balcão vai cobrar com certeza. Quando você passa do horário, o estacionamento cobra pela tabela própria dele no momento da saída. Essa tabela de balcão pode ser diferente da tabela de reserva. Pergunte o valor antes de pagar e peça o recibo com a data e a hora de entrada e de saída.

Quando o voo atrasou e o estacionamento do aeroporto cobrou um dia a mais, o valor é pequeno para começar pela Justiça. Por isso o caminho mais curto para pedir o reembolso, descrito mais abaixo, começa pela própria companhia e pelas plataformas públicas de reclamação.

## Seu voo atrasou e o estacionamento do aeroporto cobra hora ou diária?

O estacionamento do aeroporto cobra por diária, e não por hora, quando o voo atrasa. Na conta do motor de reservas da Movepark, a diária vale 24 horas a partir da entrada. A ficha de todas as unidades parceiras declara **60 minutos de tolerância** na saída. Até uma hora depois do horário reservado, nada muda. A partir do minuto 61, o período a mais vira uma diária inteira.

Veja como a conta funciona numa viagem de sete dias com entrada às 6h de segunda-feira:

| Saída | Tempo depois do horário reservado | Diárias cobradas |
|---|---|---|
| Segunda seguinte, 6h | 0 | 7 |
| Segunda seguinte, 6h50 | 50 minutos | 7, dentro da tolerância |
| Segunda seguinte, 7h10 | 1 hora e 10 minutos | 8 |
| Segunda seguinte, 22h | 16 horas | 8 |
| Terça, 7h10 | 25 horas e 10 minutos | 9 |

A tabela mostra o detalhe que pega muita gente de surpresa: um atraso de 70 minutos custa o mesmo que um atraso de 23 horas. A diária extra não é proporcional à hora. Se o seu voo de volta atrasou duas horas, você paga um dia a mais inteiro, mesmo que tenha retirado o carro na mesma noite.

A regra da tolerância varia conforme onde você reservou. Na reserva fechada pela Movepark, a tolerância é a de 60 minutos que a [resposta sobre sair depois do horário](/faq/posso-chegar-antes-ou-sair-depois-do-horario) descreve. Na reserva feita direto no site ou no WhatsApp do estacionamento, vale a tolerância que ele informou na hora da compra.

Os parceiros da Movepark operam 24 horas, então o carro não fica preso se o voo chegar de madrugada. Em pátio que fecha à noite, um atraso que empurra o pouso para depois do horário de funcionamento vira uma diária a mais, mais o custo de voltar no dia seguinte. Confirme o horário de funcionamento antes de reservar.

![passageira põe as malas na van de traslado do estacionamento do aeroporto à noite, depois do voo atrasado, no pátio coberto](/images/blog/voo-atrasou-estacionamento-aeroporto/voo-atrasado-estacionamento-aeroporto-traslado-van.webp)

## Voo cancelado: o que muda para quem deixou o carro no estacionamento?

Com o voo cancelado, a Resolução 400 da ANAC dá três opções, e a escolha é sua: remarcar no próximo voo disponível, receber o valor da passagem de volta ou seguir viagem por outro meio de transporte, quando houver. A companhia também deve a assistência enquanto você espera a remarcação: comida depois de duas horas e hotel com transporte depois de quatro, se houver pernoite.

Para quem deixou o carro no estacionamento do aeroporto, o cancelamento abre dois cenários. Eles pedem decisões opostas.

**Cancelamento na ida, antes de embarcar.** O carro já entrou no estacionamento e você ainda está no aeroporto. Se a remarcação for para o dia seguinte e você mora na cidade, pode valer mais tirar o carro, voltar para casa e entrar de novo no outro dia. A Resolução 400 permite que a companhia ofereça só o transporte de ida e volta para casa, em vez de hotel, para quem mora na cidade do aeroporto. Antes de decidir, compare o preço de uma diária a mais com o custo de ir e voltar de casa.

**Cancelamento na volta, longe de casa.** O carro está parado no estacionamento e você está em outra cidade. Cada dia de remarcação vira diária extra. Guarde o comprovante de cancelamento e o da nova passagem, porque é a diferença entre a data original e a nova que mostra quantos dias o cancelamento custou.

Nos dois cenários, avise o estacionamento assim que souber da nova data. O carro não é removido por causa do atraso, e o aviso evita surpresa no valor cobrado na saída.

## Voltei antes por causa do cancelamento: recebo as diárias que sobraram?

Na maioria dos estacionamentos, não. Depois que o carro entra, a vaga ficou reservada para o período inteiro, e a saída antecipada não devolve as diárias que sobraram. A regra para quem reservou pela Movepark está na [resposta sobre voltar antes do previsto](/faq/voltei-antes-do-previsto-recebo-as-diarias-que-nao-usei), e a de cada pátio está no contrato dele.

O lado da companhia aérea é outro assunto. Se o cancelamento fez você desistir da viagem, a Resolução 400 garante o reembolso integral da passagem. As diárias pagas e não usadas no estacionamento entram no mesmo pedido de dano material da diária extra, com a mesma condição: o cancelamento precisa ter sido falha da companhia, e não força maior.

## Voo atrasou e o estacionamento do aeroporto cobrou: como pedir o reembolso?

O pedido de reembolso da diária extra do estacionamento passa por três degraus, do mais rápido ao mais formal. Comece pelo primeiro e só suba se a resposta não vier ou vier negativa.

1. **Canal de atendimento da companhia.** Abra o pedido pelo site ou pelo aplicativo da companhia, na área de reclamação ou de reembolso. Descreva o voo, o atraso, o valor pago a mais e anexe os comprovantes. Peça o número de protocolo.
2. **Plataformas públicas.** Sem resposta em prazo razoável, registre a reclamação no [Anac Passageiro](https://www.gov.br/anac/pt-br/assuntos/passageiros/anac_passageiro), a plataforma da ANAC que acompanha o atendimento das companhias, ou no consumidor.gov.br, onde as empresas cadastradas respondem dentro de um prazo. O Procon da sua cidade é outra porta.
3. **Juizado Especial Cível.** Se nada resolver, a ação para valor de até 20 salários mínimos pode ser aberta sem advogado, pela Lei 9.099, de 1995. Uma diária de estacionamento cabe com folga nesse limite.

Três cuidados que aumentam a chance de dar certo:

- **Peça só o que pode provar.** A diária do estacionamento é dano material: tem recibo, tem valor, tem data. Misturar com dano moral no primeiro pedido torna a conversa mais longa. A Lei 14.034 exige prova do prejuízo para o dano moral, e o Superior Tribunal de Justiça já afastou o dano moral presumido pelo simples atraso.
- **Faça o pedido logo.** No voo dentro do Brasil, o Código de Defesa do Consumidor dá cinco anos para cobrar. Esperar só faz o recibo sumir da gaveta.
- **Seja específico no valor.** "Paguei R$ 25,90 de diária extra no dia 14 por causa do atraso de 3 horas do voo tal" resolve mais rápido do que "quero ser ressarcido pelo transtorno".

![comprovantes do voo atrasado e do estacionamento do aeroporto organizados para pedir o reembolso, com celular, cartão de embarque, recibo e chave do carro](/images/blog/voo-atrasou-estacionamento-aeroporto/voo-cancelado-estacionamento-aeroporto-comprovante.webp)

## Que comprovantes guardar para pedir o reembolso do estacionamento?

Guarde cinco documentos para pedir o reembolso do estacionamento à companhia aérea. Sem eles, o pedido vira a sua palavra contra a da companhia.

| Documento | Para quê | Onde conseguir |
|---|---|---|
| Cartão de embarque ou bilhete | Prova o voo e o horário contratado | Aplicativo ou e-mail da companhia |
| Aviso de atraso ou cancelamento | Prova a ocorrência e, às vezes, o motivo | Mensagem, e-mail ou notificação do aplicativo |
| Declaração de atraso ou cancelamento | Documento formal com horários e motivo | Balcão da companhia no aeroporto, peça na hora |
| Recibo do estacionamento | Prova o valor pago, a entrada e a saída | Caixa de saída ou e-mail da reserva |
| Confirmação do estacionamento | Prova quantos dias você tinha planejado | E-mail da confirmação |

A declaração de atraso é o documento mais difícil de conseguir depois que você sai do aeroporto. Peça no balcão da companhia ainda no aeroporto, antes de ir buscar o carro, com o motivo do atraso escrito. Se o balcão não entregar, tire print da tela do aplicativo com o status do voo e a hora da última atualização, que a Resolução 813 tornou obrigatória.

Fotografe também o recibo do estacionamento assim que receber. Papel térmico apaga com o tempo, e a foto com data no celular resolve.

## E no voo internacional, a regra é a mesma?

Não exatamente. No voo internacional, o dano material segue a Convenção de Montreal, e não o Código de Defesa do Consumidor. O Supremo Tribunal Federal decidiu isso no Tema 210, e o efeito prático são duas diferenças: o prazo para entrar na Justiça cai para dois anos, e a indenização por atraso tem um teto fixado pela convenção.

Para uma diária de estacionamento, o teto não faz diferença, porque ele fica muito acima de qualquer valor de estacionamento. O prazo faz. Quem voltou de uma viagem internacional com o voo atrasado tem dois anos, e não cinco, para cobrar a diária extra na Justiça.

A assistência material da Resolução 400 vale também para o voo internacional que sai do Brasil, com as mesmas regras de tempo de espera para comida e hotel.

## Como evitar pagar diária extra quando o voo pode atrasar?

Ninguém garante que o voo saia no horário. Mesmo assim, dá para reduzir a chance de pagar diária extra no estacionamento do aeroporto e o tamanho da conta quando ela vier.

### Na hora de reservar

- **Reserve a saída pela hora em que chega ao balcão.** Muita gente marca a saída pela decolagem da volta. O que conta é o pouso, mais desembarque, bagagem e traslado.
- **Some o traslado na conta.** Nos parceiros da Movepark que declaram traslado, a van leva de 3 a 10 minutos até o pátio e passa a cada 15 a 30 minutos. A espera pela van mais a viagem come uma parte da tolerância de 60 minutos.
- **Prefira pátio 24 horas.** Atraso que empurra o pouso para a madrugada não vira diária a mais por portão fechado.
- **Veja a política de alteração antes de comprar.** Cada estacionamento e cada canal de reserva tem regra própria para mudar a data. Leia antes de fechar, porque é ela que decide se a mudança de voo custa uma diária ou uma reserva nova.

### No dia da volta

- **Acompanhe o voo pelo aplicativo da companhia.** A Resolução 813 obriga a companhia a avisar o atraso assim que souber, por canal digital. Quanto antes você souber, antes avisa o estacionamento e reorganiza a volta.
- **Avise o estacionamento.** Se o voo atrasou, o estacionamento do aeroporto não remove o carro, mas saber da nova hora evita discussão no caixa de saída.

Se você ainda vai reservar, o guia de [quanto custa deixar o carro no aeroporto](/blog/quanto-custa-deixar-o-carro-no-aeroporto/) compara a diária nos principais aeroportos. Para quem viaja nas festas, o [preço do estacionamento no aeroporto no fim de ano](/blog/estacionamento-aeroporto-fim-de-ano/) mostra a conta de 23 de dezembro a 4 de janeiro. E o passo a passo de [como reservar estacionamento com pagamento antecipado](/blog/como-reservar-um-estacionamento-com-pagamento-antecipado/) explica o que muda em relação a pagar no balcão.

## O que cada aeroporto diz sobre voo atrasado e estacionamento?

Cada aeroporto com estacionamento na Movepark tem uma resposta curta sobre atraso, com o funcionamento dos pátios daquela praça. Elas complementam este guia, sem repetir a parte da ANAC:

- [voo atrasado no estacionamento de Guarulhos](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-guarulhos-gru)
- [voo atrasado no estacionamento de Congonhas](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-congonhas-cgh)
- [voo atrasado no estacionamento de Viracopos](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-viracopos-vcp)
- [voo atrasado no estacionamento do Afonso Pena](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-afonso-pena-cwb)
- [voo atrasado no estacionamento de Confins](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-confins-cnf)
- [voo atrasado no estacionamento do Recife](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-recife-rec)

## Perguntas frequentes sobre voo atrasado e estacionamento no aeroporto

### A Resolução 400 da ANAC obriga a companhia a pagar o estacionamento?

Não. A assistência da Resolução 400 da ANAC cobre alimentação depois de duas horas e hotel com transporte depois de quatro, quando há pernoite. O estacionamento não está na lista, nem depois da Resolução 813, em vigor desde 26 de outubro de 2026. A diária extra pode ser cobrada da companhia como dano material, se o atraso foi falha dela.

### O voo atrasou 2 horas. Pago uma diária inteira de estacionamento?

Na maioria dos estacionamentos, sim. Os parceiros da Movepark declaram 60 minutos de tolerância na saída, e passou disso o período vira uma diária inteira, sem cobrança por hora. Um atraso de 2 horas custa o mesmo que um de 20 horas. Em novembro de 2026, um dia a mais custava de R$ 11,90 a R$ 45,90 na tabela de reserva dos parceiros.

### Quanto tempo tenho para pedir o reembolso da diária extra?

No voo dentro do Brasil, o Código de Defesa do Consumidor dá cinco anos para cobrar o dano material. No voo internacional vale a Convenção de Montreal, com prazo de dois anos para a ação, conforme o Tema 210 do Supremo Tribunal Federal. Na prática, faça o pedido na mesma semana, enquanto o recibo e o aviso do atraso estão à mão.

### A companhia pode negar o reembolso do estacionamento dizendo que foi o tempo?

Pode, e a lei apoia a negativa quando o motivo é real. O artigo 256 do Código Brasileiro de Aeronáutica exclui a responsabilidade por dano em caso de mau tempo, restrição do controle aéreo ou infraestrutura indisponível. Peça a declaração com o motivo escrito no balcão e, se suspeitar da justificativa, compare com outros voos do mesmo horário.

### Preciso de advogado para cobrar a diária extra do estacionamento?

Não. A ação no Juizado Especial Cível pode ser aberta sem advogado até 20 salários mínimos, pela Lei 9.099, de 1995, e uma diária de estacionamento fica muito abaixo disso. Antes, tente o canal da companhia, o Anac Passageiro e o consumidor.gov.br, que costumam resolver valores pequenos mais rápido do que a Justiça.

### Quem cobra a diária extra do estacionamento, o pátio ou a companhia aérea?

O estacionamento cobra a diária extra de você na saída, porque o contrato de guarda do carro é com você, e a companhia aérea não paga o pátio diretamente. O caminho é pagar, guardar o recibo com entrada e saída e pedir o valor de volta à companhia, pelo canal dela ou pelo Anac Passageiro.

## Antes de reservar a próxima viagem

Voo atrasado é o tipo de imprevisto que ninguém controla. Se o voo atrasou e o estacionamento do aeroporto já cobrou, guarde o recibo e siga o passo a passo do reembolso. Para a próxima viagem, o custo do atraso no estacionamento dá para prever. Compare a diária, a tolerância e o horário de funcionamento antes de fechar, e reserve com folga no horário de saída. Os preços de hoje estão em [estacionamentos no Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos) e nas páginas dos outros aeroportos, com o valor que você paga na reserva.
$f17$
   where id = '8ecd943a-1f8e-404f-b739-3a0319b5ce8c' and md5(body_md) = '581ee832477540c1f78d7059dd49a6ee';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'voo-atrasou-estacionamento-aeroporto', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · deixar-o-carro-no-aeroporto-de-congonhas · pt · body_md
  update public.blog_post set body_md = $f18$Para deixar o carro no aeroporto de Congonhas você tem três caminhos: o estacionamento oficial dentro do terminal, um dos pátios particulares num raio de 1,4 km, ou a vaga rotativa da rua, que só serve para parada rápida. A escolha depende de quantos dias o carro vai ficar e de quanto tempo você tem até o embarque.

![passageiro caminhando com mala pela passarela ao deixar o carro no aeroporto de Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/deixar-o-carro-no-aeroporto-de-congonhas/deixar-o-carro-no-aeroporto-de-congonhas.webp)

Congonhas não se parece com nenhum outro aeroporto grande do país. Ele fica dentro da cidade, cercado por bairro residencial, e isso muda toda a logística. Não existe a longa estrada de acesso de Guarulhos nem o estacionamento remoto a cinco quilômetros. Aqui, o pátio mais distante da nossa lista está a 1,39 km, e vários ficam a dez minutos de caminhada.

Este guia mostra o passo a passo completo de como deixar o carro no aeroporto de Congonhas: como escolher onde parar, o que conferir antes de entregar a chave, quanto tempo reservar para chegar ao portão e o que fazer no desembarque. Todos os valores citados têm data de consulta, porque tarifa muda sem avisar.

## Onde deixar o carro em Congonhas: as três opções

Existem três formas de deixar o carro no aeroporto de Congonhas, e cada uma resolve um problema diferente. Antes de olhar preço, entenda para que serve cada uma, porque escolher pelo valor sem olhar o encaixe costuma sair caro depois.

| Opção | Serve para | Distância a pé | Diária | Fonte e data |
| --- | --- | --- | --- | --- |
| Estacionamento oficial | pressa, viagem de 2 a 5 dias | dentro do terminal | a partir de R$ 44,90 | Estapar Reserva, 05/09/2026 |
| Pátio particular | economia e estadia longa | 8 a 18 minutos | R$ 28,90 a R$ 50,00 | sites próprios, 05/09/2026, e Movepark, 28/10/2026 |
| Vaga rotativa na rua | embarque e desembarque rápido | variável | zona azul | regra municipal |

A vaga de rua entra na lista só por honestidade, não como recomendação. O entorno de Congonhas tem zona azul com tempo curto e fiscalização ativa, além de ser bairro adensado. Para qualquer permanência acima de algumas horas, ela sai mais cara que um pátio fechado e ainda expõe o veículo.

### Quando o estacionamento do terminal compensa?

O oficial funciona 24 horas dentro do aeroporto, com operação da Estapar, conforme a Aena informa na página do aeroporto. Ele ganha em dois cenários: quando você está atrasado e quando a viagem dura de dois a cinco dias, faixa em que o pacote derruba o custo diário para menos de R$ 18,00.

Fora desses casos, você paga um valor alto por uma conveniência de poucos minutos. Afinal, a caminhada de um pátio próximo leva cerca de dez minutos pela passarela.

### Quando o pátio particular compensa?

Para viagem longa, quase sempre. Trinta diárias no [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet), parceiro da Movepark na Rua Vieira de Morais, 2110, saem por R$ 447,00 pela tabela de 28 de outubro de 2026, o que dá R$ 14,90 por dia. O Express Parking fechava de 15 a 30 dias por R$ 600,00 em 5 de setembro de 2026, acima disso.

Além do preço, o pátio particular costuma oferecer serviços que o terminal não tem, como lavagem, valet e transporte de bagagem até o portão. Ou seja, quem viaja com frequência ganha tempo, e não só desconto.

### As duas unidades parceiras da Movepark

Entre os pátios da região, dois têm contrato com a Movepark, e isso muda o que você enxerga antes de fechar. O valor não é retrato de tabela: sai do motor de reservas e acompanha qualquer alteração do sistema.

O [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet) fica na Rua Vieira de Morais, 2110, Campo Belo, a 740 metros do embarque. Abre 24 horas, tem vaga coberta e chega a R$ 14,90 por dia em trinta diárias, pela tabela de 28 de outubro de 2026.

O [Plenty Park](/estacionamentos/aeroporto-congonhas/plenty-park) fica na Rua Nhu-Guaçu, 211, Vila Congonhas, a 860 metros. Também abre 24 horas, com vaga coberta, e sai por R$ 27,90 por dia na semana cheia, pela tabela de 17 de novembro de 2026. Exige três diárias no mínimo, e a entrada tem 2 metros de altura, então carro com bagageiro no teto não entra. Vale medir o seu antes de reservar.

## Como deixar o carro no aeroporto de Congonhas em 6 passos

Este é o roteiro que evita as dores de cabeça mais comuns de quem vai deixar o carro no aeroporto de Congonhas. Ele funciona tanto para quem vai ao pátio particular quanto para quem usa o terminal.

1. **Reserve com antecedência.** A diferença entre reserva e balcão chega a 25% em alguns pátios, e no oficial a cota promocional acaba durante o dia.
2. **Confirme o horário de funcionamento.** Nem todo pátio abre 24 horas, e voo de madrugada exige atenção redobrada.
3. **Pergunte pela regra do traslado.** Alguns endereços só oferecem van gratuita a partir de duas diárias.
4. **Fotografe o carro na entrada.** Registre painel, quilometragem, rodas e qualquer avaria já existente.
5. **Guarde o comprovante e o contato do pátio.** Anote também o telefone exclusivo do traslado, quando houver.
6. **Avise o horário de retorno.** Vários pátios preparam o carro com antecedência quando sabem o voo de volta.

O passo 4 é o que mais gente pula e o que mais evita discussão. Leva menos de um minuto e resolve qualquer dúvida sobre um risco que já estava lá.

### O que levar do carro antes de entregar?

Parece óbvio, mas a pressa faz esquecer. Retire documento do veículo, controle de portão, óculos de sol, carregador e qualquer objeto à vista. Deixe o porta-luvas vazio e aberto quando o pátio pedir, porque isso reduz a curiosidade de terceiros.

Se o carro tem rastreador com corte de combustível, avise o pátio. Manobrista que não sabe disso pode achar que o carro deu problema.

## Quanto tempo antes preciso chegar para deixar o veículo em CGH?

Para deixar o carro no aeroporto de Congonhas com folga, some 30 minutos ao seu planejamento normal se for usar pátio particular com traslado, e 15 minutos se for ao estacionamento do terminal. Esse é o intervalo que cobre a manobra, a espera da van e o trajeto.

![manobrista recebendo a chave do motorista em pátio coberto perto do terminal de Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/deixar-o-carro-no-aeroporto-de-congonhas/deixar-o-carro-no-aeroporto-de-congonhas-manobrista.webp)

Hoje existe um motivo extra para essa folga. O aeroporto passa pela maior obra da sua história, e o trânsito do entorno ficou mais lento. Um dos pátios avisa no próprio site que o traslado pode atrasar por causa das obras e recomenda o acesso a pé pela passarela.

| Situação | Folga recomendada | Por quê |
| --- | --- | --- |
| Estacionamento do terminal | 15 minutos | manobra e caminhada interna |
| Pátio a menos de 800 m, a pé | 20 minutos | caminhada com bagagem |
| Pátio com traslado | 30 minutos | espera da van mais trajeto |
| Horário de pico ou feriado | 45 minutos | trânsito do entorno e fila |

Vale lembrar que essa folga soma ao tempo de check-in da companhia aérea, não substitui. Ou seja, ela entra antes do relógio que você já costuma seguir.

## Quanto custa deixar o carro no aeroporto de Congonhas?

O custo de deixar o carro no aeroporto de Congonhas muda conforme o período. Por isso a pergunta "qual o mais barato" quase nunca tem resposta única. A tabela abaixo reúne o que cada opção cobrava: o oficial em 5 de setembro de 2026, o Aerovalet pela tabela de 28 de outubro de 2026 e o Plenty Park pela de 17 de novembro de 2026.

| Período | Estacionamento oficial | Aerovalet | Plenty Park |
| --- | --- | --- | --- |
| 1 dia | a partir de R$ 44,90 | R$ 28,90 | não atende |
| 3 dias | a partir de R$ 85,90 | R$ 86,70 | R$ 95,70 |
| 7 dias | a partir de R$ 149,90 | R$ 181,30 | R$ 195,30 |
| 15 dias | sem pacote publicado | R$ 388,50 | R$ 403,50 |
| 30 dias | sem pacote publicado | R$ 447,00 | R$ 507,00 |

Duas conclusões saem daí. Para viagem de três a dez dias, o pacote do terminal sai mais barato que os dois parceiros, desde que ainda haja vaga na cota promocional: em sete dias, R$ 149,90 contra R$ 181,30 no Aerovalet. Em três dias, a diferença para o Aerovalet cai para R$ 0,80. Já acima de quinze dias, o oficial sai da disputa, porque não publica pacote longo.

Repare também que o Plenty Park tem estadia mínima de três diárias. Ou seja, ele não atende quem quer deixar o carro no aeroporto de Congonhas por uma noite só. Para isso o Aerovalet atende, e pela tabela de 28 de outubro de 2026 ele sai mais barato que o Plenty Park em todas as durações.

### O que faz o valor subir?

Quatro detalhes explicam quase toda a diferença entre o que você espera pagar e o que aparece na saída. Vale conferir os quatro antes de fechar.

- **Canal de reserva.** Na MultiPark, a diária saía por R$ 40,00 online e R$ 50,00 no balcão.
- **Porte do veículo.** No Express Parking, carro grande pagava R$ 45,00 contra R$ 40,00 do pequeno.
- **Carência do traslado.** No One Parking, a van gratuita valia só a partir de duas diárias.
- **Diária cheia por entrada.** Ficar 26 horas costuma custar dois dias completos, e não um dia mais frações.

## Deixar o carro no aeroporto de Congonhas ou seguir de aplicativo?

Carro ou aplicativo é uma dúvida que aparece em toda viagem curta, e a matemática resolve rápido. O ponto de equilíbrio depende de quanto custa a sua corrida de ida e volta até o aeroporto.

Se a corrida de ida e volta custa R$ 120,00, por exemplo, ela equivale a quatro diárias de R$ 30,00. Portanto, para viagens de até três dias, o aplicativo tende a ganhar. Acima disso, guardar o carro sai mais barato, e a vantagem cresce a cada dia porque a diária cai com o pacote enquanto a corrida não muda.

Existe ainda um fator que não entra na planilha: o horário. Voo que sai às 5h30 significa aplicativo às 4h da manhã, com preço dinâmico e menos carros disponíveis. Nesse cenário, muita gente prefere o próprio carro mesmo pagando um pouco mais.

### O caso de quem mora longe

Para quem vem do interior ou de outra cidade da região metropolitana, a comparação nem existe. O carro é o meio de chegada, então a pergunta vira apenas onde guardá-lo. Nesse caso, priorize pátio com traslado incluído e horário 24 horas, porque a chegada costuma acontecer fora do horário comercial.

## Como chegar aos estacionamentos de Congonhas?

Quase todos os pátios ficam em duas vias principais, o que simplifica bastante a navegação. Conhecer isso evita voltas desnecessárias no bairro, onde há muita mão única.

| Endereço | Estacionamentos | Distância do terminal |
| --- | --- | --- |
| Av. Washington Luís | Congonhas Park, One Parking, The Parking | 0,64 km a 0,79 km |
| Rua Vieira de Morais | Aerovalet (parceiro Movepark) | 0,74 km |
| Rua Baronesa de Bela Vista | MultiPark, Grand Parking | 0,78 km a 0,98 km |
| Rua Nhu-Guaçu | Plenty Park (parceiro Movepark) | 0,86 km |
| Rua Renascença | Facility | 0,64 km |
| Rua Barão de Suruí | Arai Park | 1,03 km |
| Rua Zacarias de Góis | Express Parking | 1,39 km |

A Avenida Washington Luís é a via mais direta e também a mais movimentada. Quem chega pela Marginal Pinheiros costuma entrar melhor pelas ruas internas do Campo Belo, evitando o trecho de maior fila em frente ao embarque.

### Atenção às obras no entorno

O entorno do aeroporto está em obra, e o trânsito piorou ao longo de todo o dia. Um dos pátios avisa isso no próprio site e recomenda o acesso a pé pela passarela quando o passageiro tem pressa.

Na prática, isso favorece quem escolheu um endereço próximo. Quem vai deixar o carro no aeroporto de Congonhas num pátio a 640 metros pode simplesmente caminhar e ignorar a fila da van.

## Deixar o carro no aeroporto de Congonhas é seguro?

Deixar o carro no aeroporto de Congonhas é seguro na maioria dos pátios, porque a região trabalha com vaga coberta e fechada. Isso já resolve boa parte do risco. Como o terreno é apertado e caro, os pátios aproveitam garagens de prédios e estruturas com controle de acesso, em vez de terrenos abertos.

Mesmo assim, segurança não é uniforme. Antes de escolher, confira estes quatro pontos:

- **Cobertura e fechamento.** Vaga coberta em ambiente fechado protege de granizo, sol e furto de acessório.
- **Câmeras e controle de acesso.** Pergunte se há monitoramento e por quanto tempo as imagens ficam guardadas.
- **Seguro.** Alguns pátios informam seguro de responsabilidade civil de garagista, outros trabalham com seguradora nomeada.
- **Reputação pública.** As notas do Google ajudam, principalmente quando há volume de avaliações.

Sobre reputação, a coleta de 28 de agosto de 2026 mostrava Grand Parking com 4,4 em 880 avaliações, Express Parking com 4,4 em 670 e The Parking com 4,2 em 559. Volume alto de avaliação diz mais que nota isolada.

### O que o seguro do pátio costuma cobrir?

O seguro de garagista cobre danos ocorridos sob a guarda do estabelecimento, como colisão na manobra e furto do veículo. Ele normalmente não cobre objetos deixados dentro do carro, e é por isso que o passo de esvaziar o porta-luvas importa.

Portanto, pergunte o que o seguro cobre antes de assumir que está tudo resolvido. Essa conversa de dois minutos evita frustração na volta.

## Guardar o carro no aeroporto de Congonhas por muitos dias

Deixar o carro no aeroporto de Congonhas por muitos dias muda a operação, e não só o preço. Um carro parado por trinta dias exige cuidados que ninguém lembra na hora de embarcar.

- **Bateria.** Carro moderno consome energia mesmo desligado. Acima de vinte dias, a chance de bateria fraca na volta cresce bastante.
- **Pneus.** Calibragem em dia evita deformação por carga parada no mesmo ponto.
- **Combustível.** Tanque quase vazio favorece condensação, então vale deixar acima da metade.
- **Freio de mão.** Em estadia muito longa, alguns manuais recomendam evitar o freio de mão engatado.

Vários pátios da região trabalham bem essa faixa. Trinta dias custam R$ 447,00 no Aerovalet, pela tabela de 28 de outubro de 2026, e R$ 507,00 no Plenty Park, pela de 17 de novembro de 2026, os dois com preço vivo do motor de reservas. O Express Parking fechava 15 a 30 dias por R$ 600,00 em 5 de setembro de 2026, acima dos dois parceiros no mês. Você compara os parceiros na [página de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos).

### Vale contratar lavagem enquanto viaja?

Costuma valer para quem fica muitos dias fora. Carro parado acumula poeira, e alguns pátios oferecem lavagem e estética durante a estadia, aproveitando o tempo ocioso. O Grand Parking e o The Parking informam esse serviço no site.

O ponto de atenção é o preço, que quase nunca aparece na tabela pública. Peça o valor junto da reserva, e não na retirada.

## Erros comuns de quem vai deixar o carro no aeroporto de Congonhas

Alguns tropeços de quem vai deixar o carro no aeroporto de Congonhas se repetem tanto que dá para listar. Todos eles custam dinheiro ou tempo, e todos se evitam com um minuto de atenção.

**Escolher o pátio na chegada.** Quem decide olhando placa na avenida paga o preço de balcão e fica com a vaga que sobrou. Reservar antes inverte essa posição.

**Confundir distância com tempo.** Um pátio a 1,39 km parece perto no mapa, mas depende da van. Já um a 640 metros permite caminhar. Portanto compare o tempo real, e não o número de quilômetros.

**Ignorar o horário de retirada.** Essa é a que mais dói. O voo atrasa, o desembarque vira madrugada e o pátio já fechou, então o carro só sai no dia seguinte.

**Deixar objeto à vista.** Seguro de garagista cobre o veículo, e normalmente não cobre o que está dentro dele.

**Não fotografar o carro.** Sem registro de entrada, qualquer discussão sobre avaria vira palavra contra palavra.

### A regra de ouro para quem viaja pouco

Trate a escolha do estacionamento como parte da passagem, e não como detalhe do último minuto. Decidir com uma semana de antecedência costuma render desconto, horário adequado e traslado confirmado, tudo de uma vez.

Quem faz isso raramente tem problema. Quem deixa para a hora quase sempre paga mais e anda mais.

## O que fazer na volta, no desembarque?

O retorno é onde a maioria dos contratempos acontece. Você chega cansado, às vezes fora do horário previsto, e a pressa atrapalha. Três atitudes resolvem quase tudo.

Primeiro, avise o pátio assim que pegar a bagagem, e não quando o avião pousar. A diferença entre os dois momentos passa de vinte minutos em Congonhas quando há bagagem despachada.

Depois, confira o carro ainda no pátio, com as fotos da entrada na mão. Rodar o veículo e voltar depois enfraquece qualquer reclamação.

Por fim, guarde o comprovante de pagamento até chegar em casa. Ele é o documento que liga você àquela estadia se aparecer alguma cobrança indevida.

### Se o voo atrasar ou for cancelado

Avise o pátio o quanto antes. A maioria cobra a diária adicional pela tabela vigente, mas quem avisa costuma conseguir tratamento melhor que quem simplesmente não aparece. Além disso, em pátio com horário limitado, esse aviso evita que você chegue com o portão fechado.

Lembre que o The Parking atende das 4h às 23:59, conforme o site próprio em 5 de setembro de 2026. Um atraso que empurre o desembarque para depois da meia-noite deixa a retirada para o dia seguinte.

## Onde ver as opções antes de escolher?

A Movepark reúne as unidades parceiras de Congonhas com o valor que o sistema cobra de verdade, no [guia de estacionamentos do aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas). Para os pátios sem contrato, existem fichas com endereço, distância e avaliação, como a do [The Parking em Congonhas](/estacionamentos/aeroporto-congonhas/the-parking).

Se o seu critério for preço, vale ler o [comparativo dos três principais estacionamentos de Congonhas](/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/). E para conhecer o terminal antes de chegar, o [panorama do aeroporto de Congonhas](/blog/aeroporto-de-congonhas-informacoes-completas/) cobre estrutura, acessos e serviços.

Sobre as obras, o Governo Federal e a Aena anunciaram R$ 2,6 bilhões para o aeroporto, segundo o [Ministério de Portos e Aeroportos](https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/noticias/2026/02/governo-federal-e-aena-anunciam-r-9-2-bilhoes-em-investimentos-para-11-aeroportos-do-pais). O terminal vai para 135 mil metros quadrados, com conclusão prevista para junho de 2028.

## Perguntas frequentes sobre deixar o carro em Congonhas

### Posso deixar o carro no aeroporto de Congonhas por um mês?

Pode, e vários pátios da região têm pacote para isso. Pela tabela de 28 de outubro de 2026, trinta dias saem por R$ 447,00 no Aerovalet, uma das duas unidades parceiras da Movepark. Na outra, o Plenty Park, custam R$ 507,00 pela tabela de 17 de novembro de 2026. O Express Parking fechava 15 a 30 dias por R$ 600,00 em 5 de setembro de 2026. Antes de embarcar, cuide da bateria e da calibragem dos pneus.

### Onde deixar o carro em Congonhas para embarque de madrugada?

Prefira um pátio aberto 24 horas. As duas unidades parceiras da Movepark, [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet) e [Plenty Park](/estacionamentos/aeroporto-congonhas/plenty-park), funcionam em tempo integral, assim como MultiPark, Express Parking e o estacionamento do terminal. O The Parking, que tem uma das diárias mais baixas da região, atende das 4h às 23:59 e não cobre retirada depois da meia-noite.

### Preciso de reserva para estacionar em Congonhas?

Não é obrigatório, mas quase sempre compensa. A reserva antecipada rende desconto de até 25% em alguns pátios e assegura a cota promocional do estacionamento oficial, que é limitada por dia. Em feriado e alta temporada, ela também evita rodar atrás de vaga.

### Dá para ir a pé do estacionamento até o terminal de Congonhas?

Dá, e é uma das vantagens do aeroporto. Seis dos dez endereços mapeados ficam a menos de 800 metros do embarque, o que corresponde a cerca de dez minutos de caminhada pela passarela. Com as obras deixando o trânsito lento, às vezes a pé chega antes que a van.

### O que acontece se eu perder o comprovante do estacionamento?

Leve um documento com foto e o documento do veículo. Os pátios costumam liberar o carro após conferir a titularidade, embora alguns cobrem uma taxa administrativa pela segunda via. Por isso vale fotografar o comprovante assim que recebê-lo.

### Vale mais a pena deixar o carro ou ir de aplicativo até Congonhas?

Depende dos dias e de onde você mora. Para uma ou duas diárias, a corrida de ida e volta costuma sair parecida com o estacionamento. Acima de cinco dias, guardar o carro quase sempre custa menos, porque a diária cai com o pacote enquanto o preço da corrida não muda.

### Deixar o carro no aeroporto de Congonhas com moto é mais barato?

É bem mais barato. No The Parking, a moto saía por R$ 20,00 contra R$ 30,00 do carro em 5 de setembro de 2026. No One Parking, a diária de moto custava R$ 30,00 contra R$ 45,00 do automóvel. Vários pátios têm vaga específica para duas rodas, mas nem todos, então confirme antes.

### O pátio pode se recusar a entregar o carro fora do horário?

Pode, quando o estabelecimento não opera 24 horas. Por isso o horário de funcionamento vale tanto quanto o preço na hora de escolher. Pátios como MultiPark e Express Parking atendem full time, enquanto o The Parking encerra às 23:59 e retoma às 4h.

### Preciso deixar a chave com o estacionamento?

Depende do modelo de operação. Em pátio com manobrista ou valet, a chave fica com a equipe, porque os carros são organizados em fila dupla para aproveitar o espaço. Em estacionamento de autoatendimento, como o do terminal, você estaciona e leva a chave.$f18$
   where id = '07c131fa-b4dd-4f72-a433-641600f3685b' and md5(body_md) = 'e0f1d4caf9c79737a530877b2f048996';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'deixar-o-carro-no-aeroporto-de-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · preco-estacionamento-aeroporto-congonhas · pt · body_md
  update public.blog_post set body_md = $f19$O preço do estacionamento no aeroporto de Congonhas fica entre R$ 28,90 e R$ 50,00 a diária, conforme as tabelas que conferimos em 5 de setembro de 2026 e a do parceiro Aerovalet, de 28 de outubro de 2026. Dentro do terminal, a operadora oficial parte de R$ 44,90. Nos pátios da vizinhança, a diária começa em R$ 28,90. A diferença cabe num café, mas em dez dias ela vira quase o preço da passagem.

![totem de pagamento e cancela no preço do estacionamento no aeroporto de Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/preco-estacionamento-aeroporto-congonhas/preco-estacionamento-aeroporto-congonhas.webp)

Para entender o preço do estacionamento no aeroporto de Congonhas, comece pela geografia. O aeroporto tem uma característica que nenhum outro terminal grande do país repete: ele está encravado no meio da cidade. Não existe um cinturão de terrenos vazios ao redor, como em Guarulhos. O que existe é bairro, com prédio residencial colado na pista. Por isso o metro quadrado ali custa caro. E é por isso que o preço do estacionamento no aeroporto de Congonhas se comporta de um jeito diferente do resto do Brasil.

Este guia abre a tabela de cada opção e entrega a conta pronta para 1, 7, 15 e 30 dias. Ele também explica o que faz o preço do estacionamento no aeroporto de Congonhas subir. Todos os valores têm data de consulta ao lado, porque tarifa sem data envelhece sem avisar ninguém.

## Qual é o preço do estacionamento no aeroporto de Congonhas em 2026?

O preço do estacionamento no aeroporto de Congonhas se organiza em três faixas, e elas quase não se misturam. Dentro do terminal fica o estacionamento oficial, com tabela própria. Num raio de até 1,4 km vêm os pátios particulares, que atendem com traslado ou com caminhada. Por fim, algumas unidades trabalham só com reserva antecipada e cobram por pacote, não por diária avulsa.

A tabela abaixo resume a diária cheia de cada opção que publica tarifa. Ela serve para uma estadia curta, de um dia. Para viagem longa, a conta muda bastante, e o capítulo sobre 15 e 30 dias explica por quê.

| Opção | Distância do terminal | Diária (carro) | Fonte e data |
| --- | --- | --- | --- |
| Estacionamento oficial (Estapar) | dentro do terminal | a partir de R$ 44,90 | Estapar Reserva, consultado em 05/09/2026 |
| The Parking | 0,79 km | R$ 30,00 | site do The Parking, consultado em 05/09/2026 |
| MultiPark (Slaviero Slim) | 0,78 km | R$ 40,00 online, R$ 50,00 no balcão | site da MultiPark, consultado em 05/09/2026 |
| Express Parking | 1,39 km | R$ 40,00 carro pequeno, R$ 45,00 carro grande | site do Express Parking, consultado em 05/09/2026 |
| One Parking | 0,64 km | R$ 45,00 carro e SUV, R$ 50,00 caminhonete | site do One Parking, consultado em 05/09/2026 |
| Aerovalet (parceiro Movepark) | 0,74 km | R$ 28,90 | [preço vivo no Movepark](/estacionamentos/aeroporto-congonhas/aerovalet), 28/10/2026 |
| Plenty Park (parceiro Movepark) | 0,86 km | R$ 31,90 a partir de 3 diárias | [preço vivo no Movepark](/estacionamentos/aeroporto-congonhas/plenty-park), 17/11/2026 |

Repare numa coisa: a diferença entre o mais barato e o mais caro da lista é de R$ 21,10 por dia. Ou seja, quem viaja uma vez por mês e sempre escolhe errado deixa mais de R$ 200,00 no ano em cima da mesa.

### O que entra e o que não entra nesse valor?

A diária cobre a vaga. Só isso. Serviços que muita gente assume como incluídos aparecem com regra própria em cada pátio, e é aí que a conta escapa.

- **Traslado.** No One Parking, o traslado gratuito vale a partir de duas diárias. Quem deixa o carro por um dia só precisa ir a pé ou pagar à parte.
- **Tamanho do carro.** No Express Parking e no One Parking, SUV e caminhonete pagam mais que hatch.
- **Canal de reserva.** Na MultiPark, a mesma vaga custa R$ 40,00 pela internet e R$ 50,00 no balcão.
- **Horário.** No The Parking, o atendimento vai das 4h às 23:59. Voo de madrugada não combina com esse pátio.

## Qual o valor da diária no estacionamento oficial de Congonhas?

O estacionamento oficial de Congonhas funciona dentro do terminal e a operação é da Estapar, conforme a Aena informa na página do aeroporto. A reserva sai pelo canal próprio da operadora. Em 5 de setembro de 2026, a tabela mostrava três faixas.

| Período | Valor total | Custo por dia | Fonte e data |
| --- | --- | --- | --- |
| 1 diária | a partir de R$ 44,90 | R$ 44,90 | Estapar Reserva, 05/09/2026 |
| 2 a 5 diárias | a partir de R$ 85,90 | R$ 17,18 em 5 dias | Estapar Reserva, 05/09/2026 |
| 6 a 10 diárias | a partir de R$ 149,90 | R$ 21,41 em 7 dias | Estapar Reserva, 05/09/2026 |

No pacote de 2 a 5 diárias mora a informação que quase nenhum artigo conta direito. Ele derruba o custo diário para menos de R$ 18,00, e nesse recorte o oficial fica mais barato que boa parte da vizinhança. Portanto a regra popular de que o estacionamento do terminal é sempre o mais caro não se sustenta quando a viagem dura cinco dias.

Existe uma condição, no entanto, e ela é grande: a própria operadora avisa que as vagas promocionais são limitadas por dia. Se a cota acabou, o valor sobe para a tabela seguinte. Ou seja, o preço baixo depende de reservar cedo, e quem chega de última hora costuma pagar a tabela cheia.

### Por que o preço de balcão é outro?

Toda vaga reservada é uma vaga que o pátio já sabe que vai vender. Isso reduz o risco dele, e o desconto que você recebe é a parte desse risco que volta para o seu bolso. Quando você chega sem reserva, o pátio cobra pela incerteza que assumiu ao guardar espaço vazio.

Na prática, esse é o motivo de a MultiPark cobrar R$ 10,00 a mais no balcão e de o oficial trabalhar com cota promocional. Isso vale para o setor inteiro, e não só para Congonhas.

## Quanto custa estacionar em Congonhas fora do terminal?

Fora do terminal, o preço do estacionamento no aeroporto de Congonhas cai, mas a comparação exige atenção. Alguns pátios publicam a tabela aberta no site. Outros só informam o valor depois que você pede um orçamento, e essa diferença de transparência importa na hora de planejar.

![garagem coberta com vagas demarcadas e câmeras de segurança perto do terminal de Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/preco-estacionamento-aeroporto-congonhas/preco-estacionamento-aeroporto-congonhas-garagem-coberta.webp)

### Os pátios que publicam a tarifa

Quatro estacionamentos da vizinhança mostram o preço sem exigir cadastro. Confirmamos cada um no site da própria empresa em 5 de setembro de 2026.

| Estacionamento | Diária carro | Diária moto | Horário | Observação |
| --- | --- | --- | --- | --- |
| The Parking | R$ 30,00 | R$ 20,00 | 4h às 23:59 | traslado gratuito ida e volta |
| MultiPark | R$ 40,00 online | não informa | 24 horas | R$ 50,00 no balcão |
| Express Parking | R$ 40,00 pequeno, R$ 45,00 grande | tem vaga, valor sob consulta | 24 horas | 15 a 30 dias por R$ 600,00 |
| One Parking | R$ 45,00 carro e SUV | R$ 30,00 | não informa | traslado só a partir de 2 diárias |

O One Parking também publica valor por hora, o que é raro por ali: R$ 15,00 a hora para carro e SUV e R$ 10,00 para moto. Esse dado resolve a dúvida de quem vai só buscar alguém e acaba esperando mais do que planejava.

### Os pátios que não publicam a tarifa

Quatro endereços mapeados ao redor de Congonhas não abrem o preço na internet. No Grand Parking, por exemplo, existe um simulador na área do cliente, mas nada de tabela pública. Já o Congonhas Park não carregava a tabela no dia da consulta. Facility e Arai Park também não divulgam valor.

A falta de tabela pública não significa que sejam caros. Significa apenas que você precisa ligar antes, e que comparar sem sair de casa fica impossível. Quando o assunto é dinheiro, vale considerar a transparência como parte do serviço. Um pátio que esconde a tabela também costuma esconder a regra do traslado e a política de horário.

## Por que o preço do estacionamento no aeroporto de Congonhas varia tanto?

Cinco fatores explicam quase toda a variação do preço do estacionamento no aeroporto de Congonhas que você vê entre um pátio e outro. Conhecer os cinco evita a surpresa na hora de retirar o carro.

### O tamanho do carro entra na conta

Vaga coberta é um bem escasso em bairro adensado. Um SUV ocupa mais espaço útil que um hatch, então dois pátios cobram por isso de forma explícita. No Express Parking, carro grande paga R$ 5,00 a mais por dia. No One Parking, caminhonete paga R$ 5,00 acima do carro comum. Em quinze dias, esse detalhe vira R$ 75,00.

### A reserva antecipada muda o número

Já falamos disso, e vale repetir com o número na mão: a MultiPark cobra R$ 40,00 pela reserva online e R$ 50,00 no balcão, uma diferença de 25%. O oficial trabalha com cota promocional que acaba. Assim, quem reserva na véspera quase sempre paga a tabela pior.

### O traslado nem sempre acompanha a diária

O traslado é o item que mais gera briga na saída. No The Parking e no Express Parking, o traslado de ida e volta sai de graça sem condição de prazo. Já o One Parking libera a van gratuita só a partir de duas diárias. Portanto, para uma ida e volta no mesmo dia, o pátio mais barato na tabela pode sair mais caro na prática.

### O horário de funcionamento limita a escolha

Nem todo pátio abre 24 horas, e Congonhas tem voos cedo. O The Parking, que tem uma das diárias mais baixas da lista, funciona das 4h às 23:59. Se o seu voo pousa 00h30, você não consegue retirar o carro. Já a MultiPark e o Express Parking funcionam full time.

### A duração da estadia reorganiza tudo

A duração da estadia é o fator mais forte, e o próximo capítulo trata só dele.

## Qual o valor da diária em Congonhas para viagem longa?

Quando a viagem passa de uma semana, a lógica vira de cabeça para baixo. Pátios que cobram caro na diária avulsa passam a cobrar barato no acumulado, porque trabalham com pacote. Nas duas unidades parceiras da Movepark em Congonhas, o [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet), na Rua Vieira de Morais, 2110, e o [Plenty Park](/estacionamentos/aeroporto-congonhas/plenty-park), na Rua Nhu-Guaçu, 211, a queda vem por faixa de permanência, e o valor por dia cai a cada faixa. As duas ficam abertas 24 horas, têm vaga coberta e carregam preço vivo do motor de reservas: a tabela do Aerovalet é de 28 de outubro de 2026, e a do Plenty Park, de 17 de novembro de 2026.

| Período | Aerovalet (total) | Aerovalet por dia | Plenty Park (total) | Plenty Park por dia |
| --- | --- | --- | --- | --- |
| 1 dia | R$ 28,90 | R$ 28,90 | não atende | não atende |
| 3 dias | R$ 86,70 | R$ 28,90 | R$ 95,70 | R$ 31,90 |
| 7 dias | R$ 181,30 | R$ 25,90 | R$ 195,30 | R$ 27,90 |
| 15 dias | R$ 388,50 | R$ 25,90 | R$ 403,50 | R$ 26,90 |
| 30 dias | R$ 447,00 | R$ 14,90 | R$ 507,00 | R$ 16,90 |

Duas leituras saltam da tabela. A primeira: no Aerovalet, a diária cai de R$ 28,90 para R$ 14,90 quando a estadia vai de um dia para trinta. A segunda: o Plenty Park tem estadia mínima de três diárias, então ele não disputa o fim de semana curto, e o Aerovalet sai abaixo dele em todas as durações que os dois atendem, de R$ 9,00 a menos em 3 diárias a R$ 60,00 a menos em 30, com a maior distância em 29 diárias, R$ 203,00.

### O detalhe do Plenty Park que muda o preço do estacionamento no aeroporto de Congonhas para alguns carros

Um detalhe do Plenty Park merece atenção e quase nenhum site publica: a entrada tem 2 metros de altura, então carro com bagageiro ou suporte de teto não passa. Vale medir o seu antes de reservar, porque descobrir isso no portão custa tempo e obriga a procurar outro pátio na hora.

Para trinta dias, o Aerovalet cobra R$ 447,00 e o Plenty Park, R$ 507,00. No meio do caminho, a troca de faixa cria atalhos: no Aerovalet, 17 diárias (R$ 338,30) saem mais baratas que 16 (R$ 414,40), e 30 (R$ 447,00) mais baratas que 29 (R$ 577,10); no Plenty Park, 30 diárias (R$ 507,00) saem mais baratas que 29 (R$ 780,10). É aí que o preço do estacionamento no aeroporto de Congonhas recompensa quem compara. Por isso a pergunta certa nunca é "qual é o mais barato", e sim "qual é o mais barato para os meus dias". Você confere os dois lado a lado na [página de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos), que puxa o valor direto do sistema de reservas.

### A conta que vale a pena fazer antes de sair de casa

Multiplique a diária pelo número de dias e compare com o pacote. É assim que o preço do estacionamento no aeroporto de Congonhas revela a opção certa para a sua viagem. Parece óbvio, mas quase ninguém faz. Um exemplo com números das tabelas acima: sete dias no Express Parking, pela diária cheia de R$ 40,00, dariam R$ 280,00. Sete dias no Plenty Park saem por R$ 195,30, bem abaixo, e no Aerovalet, por R$ 181,30. Já o pacote oficial de 6 a 10 diárias parte de R$ 149,90, quando ainda há vaga promocional, e a diferença paga o táxi de volta para casa.

Para quem vai ficar de 15 a 30 dias, o Express Parking tem um pacote fechado de R$ 600,00, o que dá R$ 20,00 por dia em trinta dias. No Aerovalet, pela tabela de 28 de outubro de 2026, trinta dias custam R$ 447,00 (R$ 14,90 por dia), abaixo do pacote do Express Parking em toda a faixa de 15 a 30 dias, com R$ 577,10 no pior caso, em 29 diárias. No Plenty Park, pela tabela de 17 de novembro de 2026, trinta dias custam R$ 507,00 (R$ 16,90 por dia), também abaixo do pacote do Express Parking. Na faixa de 15 a 29 diárias ele fica abaixo até 22 diárias (R$ 591,80) e acima de 23 a 29, com R$ 780,10 no pior caso, em 29 diárias.

## Quanto custa deixar o carro em Congonhas por mês?

Quem viaja a trabalho por longos períodos precisa de outra conta, porque o preço do estacionamento no aeroporto de Congonhas por mês segue outra lógica. A boa notícia é que o mercado da região trabalha bem essa faixa, porque vaga parada por trinta dias dá previsibilidade ao pátio.

| Opção | 30 dias | Custo por dia | Fonte e data |
| --- | --- | --- | --- |
| Express Parking (15 a 30 dias) | R$ 600,00 | R$ 20,00 | site do Express Parking, 05/09/2026 |
| Aerovalet | R$ 447,00 | R$ 14,90 | preço vivo no Movepark, 28/10/2026 |
| Plenty Park | R$ 507,00 | R$ 16,90 | preço vivo no Movepark, 17/11/2026 |
| One Parking (mensalista) | R$ 300,00 | R$ 10,00 | site do One Parking, 05/09/2026 |

Um detalhe importante muda a leitura dessa tabela. Aquele plano mensalista de R$ 300,00 do One Parking atende quem usa a vaga na rotina da cidade. Ele não foi desenhado para o carro que fica guardado trinta dias seguidos. Já o pacote de longa permanência, como o do Express Parking, existe justamente para o carro que fica parado.

Antes de fechar mensalidade, pergunte três coisas:

- **O carro pode ficar parado o mês inteiro?** Alguns planos urbanos preveem entrada e saída diária.
- **O traslado continua incluído?** Em plano mensal, a van às vezes sai do pacote.
- **Existe cobrança extra por dia excedente?** Voo remarcado é comum, e o excedente costuma custar caro.

## O preço do estacionamento no aeroporto de Congonhas é maior que o de Guarulhos?

O preço do estacionamento no aeroporto de Congonhas é maior na diária avulsa, sim, e a geografia explica. Guarulhos tem terreno de sobra no entorno, com pátios grandes a três ou quatro quilômetros do terminal. Congonhas não tem esse espaço, então cada vaga disputa lugar com prédio residencial e comércio de rua.

Por outro lado, Congonhas devolve em tempo o que cobra em dinheiro. Vários pátios ficam a menos de 800 metros do embarque, distância que se vence a pé em dez minutos. Em Guarulhos, a van é obrigatória e some de 20 a 40 minutos do seu dia, contando ida e volta.

Ou seja, comparar só a diária engana. Quem viaja com frequência costuma avaliar o custo total da operação, que inclui o tempo perdido e o risco de perder o voo por causa de um traslado atrasado.

### Estacionar na rua vale a pena?

Não vale, e esse é um ponto em que a resposta é curta. O entorno de Congonhas tem zona azul, vaga curta e fiscalização ativa, além de o bairro ser residencial e adensado. Deixar um carro na rua por dias no Campo Belo ou na Vila Congonhas expõe o veículo e ainda rende multa.

Se a estadia passa de algumas horas, um pátio fechado a R$ 30,00 sai mais barato que a soma de zona azul e o risco assumido.

## Vale a pena pagar mais caro pelo estacionamento dentro do aeroporto?

Depende de quantos dias você vai ficar fora. Na diária avulsa, o preço do estacionamento no aeroporto de Congonhas cobrado dentro do terminal é o mais alto da praça. Para uma diária avulsa, o oficial cobrava R$ 44,90 em 5 de setembro de 2026, e o pátio mais barato da vizinhança, o Aerovalet, cobra R$ 28,90 pela tabela de 28 de outubro de 2026. São R$ 16,00 de diferença em troca de não pegar van e de andar menos com mala.

Para cinco dias, a conta inverte. O pacote oficial de 2 a 5 diárias sai a partir de R$ 85,90, contra R$ 150,00 de cinco diárias cheias no The Parking. Nesse recorte, o terminal ganha em preço e em conveniência ao mesmo tempo, desde que ainda haja vaga promocional.

Para trinta dias, a vizinhança volta a mandar, porque o oficial não publica pacote acima de dez diárias. Em resumo: viagem curtíssima e viagem média favorecem o terminal, e viagem longa favorece o pátio externo.

## Como as obras de Congonhas mexem no preço e no tempo?

O aeroporto vive a maior reforma da sua história. Governo Federal e Aena anunciaram R$ 2,6 bilhões para Congonhas, segundo o [Ministério de Portos e Aeroportos](https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/noticias/2026/02/governo-federal-e-aena-anunciam-r-9-2-bilhoes-em-investimentos-para-11-aeroportos-do-pais). O terminal de passageiros vai para 135 mil metros quadrados. As pontes de embarque sobem de 12 para 19, e a conclusão está prevista para junho de 2028.

Para quem estaciona, isso tem dois efeitos hoje. O primeiro é o trânsito: o entorno ficou mais lento, e um pátio avisa no próprio site que o traslado pode atrasar por causa das obras. O segundo é a caminhada, que virou alternativa real para os lotes mais próximos, já que a passarela segue aberta.

Na prática, some dez ou quinze minutos ao seu planejamento até o fim das obras. E se o seu pátio fica a menos de 700 metros, considere ir a pé em vez de esperar a van.

## Como conferir o preço do estacionamento no aeroporto de Congonhas antes de viajar?

O preço do estacionamento no aeroporto de Congonhas muda sem aviso, e nenhum site manda recado quando isso acontece. Por isso, faça três checagens rápidas antes de fechar.

1. **Confira a data da tabela.** Se o site não diz quando atualizou o preço, trate o número como estimativa.
2. **Some o traslado e o tamanho do carro.** Pergunte se a van está incluída e se SUV paga a mais.
3. **Compare pelo total, não pela diária.** Pacote de sete dias muda a ordem da lista, como a tabela acima mostra.

Para pular essa pesquisa, veja o [guia de estacionamentos do aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas). A Movepark reúne ali as unidades parceiras com o valor que o sistema cobra de verdade. Lá o preço não é retrato de um dia, ele vem do próprio motor de reservas.

Vale ler também o [comparativo dos três principais estacionamentos de Congonhas](/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/), que olha estrutura e atendimento além do valor. Para quem não conhece o terminal, o [panorama completo do aeroporto de Congonhas](/blog/aeroporto-de-congonhas-informacoes-completas/) ajuda a se situar.

## Perguntas frequentes sobre o preço em Congonhas

### Quanto custa uma hora de estacionamento no aeroporto de Congonhas?

Poucos pátios da vizinhança publicam tarifa por hora. Em 5 de setembro de 2026, o One Parking cobrava R$ 15,00 a hora para carro e SUV e R$ 10,00 para moto. A maioria dos pátios externos trabalha por diária, então a fração horária costuma existir só no estacionamento do próprio terminal.

### O preço do estacionamento no aeroporto de Congonhas muda em alta temporada?

Muda, embora nem sempre pela tabela. Em julho, dezembro e janeiro, as cotas promocionais acabam mais cedo, e quem reserva em cima da hora acaba pagando a faixa seguinte. A tabela publicada continua a mesma, mas a chance de pegar o valor mais baixo cai bastante.

### Existe diferença de preço entre carro e moto em Congonhas?

Existe, e é grande. No The Parking, a moto pagava R$ 20,00 contra R$ 30,00 do carro em 5 de setembro de 2026. No One Parking, a moto saía por R$ 30,00 contra R$ 45,00 do carro. Ou seja, a moto costuma custar de dois terços a metade da diária de um automóvel.

### Dá para pagar o estacionamento de Congonhas no PIX?

A maioria dos pátios da região aceita PIX, cartão e dinheiro, mas a forma de pagamento varia de endereço para endereço e algumas unidades só cobram na saída. Confirme no momento da reserva, principalmente se você pretende deixar o carro por muitos dias.

### Quanto custa deixar o carro em Congonhas por uma semana?

Pela tabela de 28 de outubro de 2026, sete dias saem por R$ 181,30 no Aerovalet, R$ 25,90 por dia. No Plenty Park, a semana custa R$ 195,30 (R$ 27,90 por dia) pela tabela de 17 de novembro de 2026. No estacionamento oficial, o pacote de 6 a 10 diárias partia de R$ 149,90 em 5 de setembro de 2026, com vagas promocionais limitadas.

### O valor da diária em Congonhas inclui o traslado?

Nem sempre. O The Parking e o Express Parking incluem o traslado de ida e volta na diária. O One Parking só libera a van gratuita a partir de duas diárias. Como vários pátios ficam a menos de um quilômetro do terminal, a caminhada é uma alternativa concreta.

### Quanto tempo antes preciso reservar para pegar o preço mais baixo?

As cotas promocionais do estacionamento oficial acabam por dia, então reservar com uma semana de antecedência já melhora bastante a chance de pegar a faixa mais barata. Nos pátios da vizinhança, a reserva antecipada costuma valer desconto fixo, como os R$ 10,00 de diferença da MultiPark.

### Os pátios de Congonhas cobram por diária cheia ou por hora corrida?

Quase todos trabalham por diária cheia, contada a partir da entrada. Ou seja, ficar 26 horas costuma custar duas diárias. Alguns endereços, como o One Parking, publicam também tarifa por hora, o que ajuda em permanências curtas de quem foi buscar passageiro.$f19$
   where id = '886553e4-7de2-4d1b-9afc-d1ad851db0a0' and md5(body_md) = '0d47790bd612711ac496a504e0548eff';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'preco-estacionamento-aeroporto-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · top-3-estacionamentos-do-aeroporto-de-congonhas · pt · excerpt
  update public.blog_post set excerpt = $f20$Os três estacionamentos do Aeroporto de Congonhas que valem a comparação são o Aerovalet, o Plenty Park e o oficial. A semana em vaga coberta sai por R$ 181,30 no Aerovalet e R$ 195,30 no Plenty Park, os dois lotes externos, que ficam a menos de um quilômetro do terminal.$f20$
   where id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and md5(excerpt) = '218f563c684e4ae0ef04d65ed0bd7baf';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'top-3-estacionamentos-do-aeroporto-de-congonhas', 'pt excerpt'; end if;
  total := total + 1;

  -- blog_post · top-3-estacionamentos-do-aeroporto-de-congonhas · pt · body_md
  update public.blog_post set body_md = $f21$Os três estacionamentos do Aeroporto de Congonhas que valem a comparação são o Aerovalet, o Plenty Park e o estacionamento oficial. Os dois primeiros ficam a menos de um quilômetro do terminal, distância rara em aeroporto brasileiro e curta a ponto de dispensar van. A semana em vaga coberta sai por R$ 181,30 no Aerovalet, pela tabela de 28 de outubro de 2026, e R$ 195,30 no Plenty Park, pela de 17 de novembro de 2026. Abaixo estão os três lado a lado e a conta que decide.

![Estacionamento Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/estacionamento-congonhas.webp)
_Estacionamento perto do Aeroporto de Congonhas_

## Os estacionamentos de Congonhas, lado a lado

O Aeroporto de São Paulo/Congonhas, código IATA CGH, fica dentro da malha urbana da zona sul, o que muda a lógica do estacionamento: aqui o pátio externo não precisa de traslado, porque dá para chegar ao terminal em poucos minutos. Nenhum dos dois lotes listados declara van própria, justamente por isso.

| Pátio | Distância do terminal | Estadia mínima | 1 diária | 7 diárias | 30 diárias |
| --- | --- | --- | --- | --- | --- |
| Aerovalet Congonhas | 700 metros | sem mínimo | R$ 28,90 | R$ 181,30 | R$ 447,00 |
| Plenty Park | 900 metros | 3 diárias | não aceita | R$ 195,30 | R$ 507,00 |

Os dois trabalham só com vaga coberta e operam 24 horas, então o que separa um do outro é a régua de preço. Pela tabela de 28 de outubro de 2026, o Aerovalet sai mais barato em todas as durações que o Plenty Park atende e segue como o único que aceita uma diária avulsa.

### 1. Aerovalet Congonhas: o mais perto e o único sem estadia mínima

Fica na Rua Vieira de Morais, 2110, no Campo Belo, a 700 metros do terminal. Na tabela de 28 de outubro de 2026, a vaga coberta custa R$ 28,90 por dia de uma a seis diárias, R$ 25,90 por dia de sete a dezesseis, R$ 19,90 de dezessete a vinte e nove e R$ 14,90 a partir de trinta. Como a diária muda de faixa, dezessete diárias (R$ 338,30) saem mais baratas que dezesseis (R$ 414,40), e trinta (R$ 447,00) mais baratas que vinte e nove (R$ 577,10). É a única das duas opções externas que aceita estadia de um dia, o que resolve bate e volta.

### 2. Plenty Park: vaga coberta a partir de três diárias

Fica na Rua Nhu-Guaçu, 211, na Vila Congonhas, a 900 metros do terminal. Na tabela de 17 de novembro de 2026, a vaga coberta sai por R$ 31,90 por dia de três a seis diárias, R$ 27,90 de sete a quatorze, R$ 26,90 de quinze a vinte e nove e R$ 16,90 a partir de trinta. Como a diária muda de faixa, trinta diárias (R$ 507,00) saem mais baratas que vinte e nove (R$ 780,10). Ele só aceita estadia a partir de três diárias, então uma parada de um dia entra cobrada como três.

### 3. O estacionamento oficial do aeroporto

Fica dentro do complexo, com acesso a pé até o terminal, e cobra por faixa de permanência. A tarifa é do operador do aeroporto e se ajusta ao longo do ano, então ela não entra na tabela acima: publicar um número sem a data em que ele foi lido seria pior que não publicar. Em Congonhas ele faz sentido em permanência de poucas horas, quando nem o percurso curto até os pátios externos compensa. Com vaga na cota promocional, ele também sai mais barato que os dois parceiros de três a dez diárias: a Estapar Reserva anunciava a partir de R$ 85,90 de duas a cinco diárias e R$ 149,90 de seis a dez, em consulta de 5 de setembro de 2026.

## Qual dos três vale para o seu caso?

- **Viagem de um dia:** Aerovalet, o único a aceitar diária avulsa, por R$ 28,90 pela tabela de 28 de outubro de 2026. No Plenty Park a mesma parada entra como três diárias.
- **Uma semana:** Aerovalet, por R$ 181,30 pela tabela de 28 de outubro de 2026, contra R$ 195,30 no Plenty Park pela tabela de 17 de novembro de 2026, uma diferença de R$ 14,00 pela mesma vaga coberta. Com vaga na cota promocional, o oficial sai mais barato que os dois.
- **Um mês:** Aerovalet. Trinta diárias saem por R$ 447,00 no Aerovalet, R$ 14,90 por dia, contra R$ 507,00 no Plenty Park, uma diferença de R$ 60,00.
- **Poucas horas:** o oficial, que cobra pelo período usado e dispensa qualquer deslocamento.

## O que olhar antes de escolher em Congonhas

- **Estadia mínima:** é o ponto que mais muda a conta em viagem curta. O piso de três diárias do Plenty Park faz um dia custar R$ 95,70.
- **Tabela online contra a de balcão:** a diferença é grande nos dois. No Aerovalet a diária de balcão marca R$ 39,05 contra R$ 28,90; no Plenty Park a semana vai de R$ 349,30 no balcão para R$ 195,30.
- **Tipo de vaga:** os dois lotes publicam só vaga coberta, então não existe versão descoberta mais barata para comparar em Congonhas.
- **Distância:** 700 e 900 metros. Nenhum dos dois declara van, e a diferença de duzentos metros entre eles não muda o tempo até o embarque.

As unidades listadas para Congonhas, com o preço mais recente, ficam na [página do Aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas).

## Como esta comparação foi apurada

Endereço, distância e horário saem da ficha de cada unidade no sistema da Movepark, com a distância calculada no banco de dados em linha reta até o terminal. As duas unidades fecham a reserva no próprio pátio, e a Movepark espelha a tabela que cada operador publica: por isso cada valor aqui carrega a sua data: 28 de outubro de 2026 no Aerovalet e 17 de novembro de 2026 no Plenty Park, datas das tabelas vigentes. Tabela de pátio muda várias vezes por ano, então confirme o valor antes de viajar. A tarifa do estacionamento oficial não passa pelo sistema da Movepark. Os dados de movimentação do aeroporto estão no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Qual estacionamento fica mais perto do terminal de Congonhas?

O Aerovalet Congonhas, a 700 metros do terminal, seguido do Plenty Park, a 900 metros. Nos dois a distância é curta a ponto de dispensar van, e nenhum dos dois declara traslado próprio na ficha.

### Sete diárias saem mais baratas em qual dos dois lotes?

No Aerovalet, por R$ 181,30 em vaga coberta pela tabela de 28 de outubro de 2026, contra R$ 195,30 no Plenty Park pela tabela de 17 de novembro de 2026. A diferença é de R$ 14,00, e o Plenty Park ainda só aceita estadia a partir de três diárias.

### Existe estadia mínima nos estacionamentos de Congonhas?

No Plenty Park existe, três diárias, então uma parada de um dia entra cobrada como três, R$ 95,70. O Aerovalet aceita diária avulsa, que sai por R$ 28,90 pela tabela de 28 de outubro de 2026. Para viagem curta essa regra pesa mais que o preço do dia.

### Os estacionamentos de Congonhas funcionam de madrugada?

Os dois lotes listados em Congonhas operam 24 horas, o que cobre retirada de madrugada. O aeroporto tem restrição de voo noturno, mas quem embarca por Congonhas e volta por outro aeroporto costuma buscar o carro fora do horário comercial.

### Compensa o pacote de 30 dias em Congonhas?

Compensa nos dois. Pela tabela de 28 de outubro de 2026, trinta diárias em vaga coberta saem por R$ 447,00 no Aerovalet, o que dá R$ 14,90 por dia, contra R$ 28,90 da diária avulsa, e custam menos que vinte e nove diárias (R$ 577,10). No Plenty Park, pela tabela de 17 de novembro de 2026, o mês sai por R$ 507,00, R$ 16,90 por dia, e também custa menos que vinte e nove diárias (R$ 780,10).

### Reservar antes sai mais barato que chegar e pagar em Congonhas?

Sai nos dois lotes. No Aerovalet a diária de balcão marca R$ 39,05 contra R$ 28,90 na tabela online de 28 de outubro de 2026. No Plenty Park a semana vai de R$ 349,30 no balcão para R$ 195,30 na tabela de 17 de novembro de 2026, uma diferença de R$ 154,00 na mesma vaga.$f21$
   where id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and md5(body_md) = 'b782fc1b4f7a15b77c81dff7020ee532';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'top-3-estacionamentos-do-aeroporto-de-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-congonhas · pt · body_md
  update public.blog_post set body_md = $f22$Existem 10 estacionamentos próximos ao aeroporto de Congonhas mapeados num raio de 1,4 km do embarque. Seis deles ficam a menos de 800 metros, distância que se vence a pé em dez minutos. Este guia lista todos, com endereço, distância medida, tarifa conferida na fonte e nota do Google.

![vista aérea dos estacionamentos próximos ao aeroporto de Congonhas cercados pelo bairro](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-congonhas/estacionamentos-proximos-aeroporto-congonhas.webp)

Os estacionamentos próximos ao aeroporto de Congonhas formam um caso único entre os grandes aeroportos brasileiros. Ele não tem cinturão de terrenos vazios ao redor, como Guarulhos ou Viracopos. O que existe é bairro consolidado, com prédio residencial praticamente colado na cabeceira da pista.

A falta de terreno vazio define tudo. Os pátios da região ocupam garagens de edifícios, terrenos estreitos e estruturas verticais, então quase todos oferecem vaga coberta. E como a distância é curta, a caminhada compete de verdade com o traslado, o que não acontece em nenhum outro aeroporto grande de São Paulo.

## O mapa dos estacionamentos próximos ao aeroporto de Congonhas

A tabela abaixo ordena por distância real do terminal, medida a partir das coordenadas de cada endereço. As tarifas vêm do site de cada empresa, conferido em 5 de setembro de 2026, ou do motor de reservas da Movepark, no caso dos dois parceiros: o Aerovalet na tabela de 28 de outubro de 2026 e o Plenty Park na de 17 de novembro de 2026. As notas do Google são da coleta de 28 de agosto de 2026.

| Estacionamento | Distância | Endereço | Diária carro | Nota no Google |
| --- | --- | --- | --- | --- |
| Congonhas Park | 0,64 km | Av. Washington Luís, 6915 | não publica | 4,0 (291) |
| Facility | 0,64 km | Rua Renascença, 112 | não publica | sem avaliação |
| One Parking | 0,64 km | Av. Washington Luís, 6901 | R$ 45,00 | 4,3 (89) |
| Aerovalet | 0,74 km | R. Vieira de Morais, 2110 | R$ 28,90 | sem avaliação |
| MultiPark | 0,78 km | Rua Baronesa de Bela Vista, 499 | R$ 40,00 online | 4,0 (165) |
| The Parking | 0,79 km | Av. Washington Luís, 7135 | R$ 30,00 | 4,2 (559) |
| Plenty Park | 0,86 km | R. Nhu-Guaçu, 211 | R$ 31,90 em 3 diárias | sem avaliação |
| Grand Parking | 0,98 km | Rua Baronesa de Bela Vista, 228 | não publica | 4,4 (880) |
| Arai Park | 1,03 km | Rua Barão de Suruí, 46 | não publica | sem avaliação |
| Express Parking | 1,39 km | Rua Zacarias de Góis, 1859 | R$ 40,00 | 4,4 (670) |

Quatro endereços não divulgam tarifa na internet, e isso aparece na tabela como "não publica". Isso não os torna caros, apenas exige uma ligação para comparar. Preferimos deixar a lacuna visível a preencher com número que não conseguimos confirmar.

### Onde ficam os estacionamentos próximos ao aeroporto de Congonhas?

Repare na coluna de endereços. A Avenida Washington Luís reúne três pátios e a Rua Baronesa de Bela Vista reúne mais dois. Ou seja, metade dos estacionamentos próximos ao aeroporto de Congonhas está em duas vias, o que facilita muito quem quer comparar pessoalmente.

A Washington Luís é a via mais direta e também a mais congestionada, principalmente durante as obras atuais. Já a Baronesa de Bela Vista fica uma quadra para dentro, com trânsito mais tranquilo e acesso pelo miolo do bairro.

## Quais estacionamentos perto do aeroporto de Congonhas dá para ir a pé?

Entre os estacionamentos próximos ao aeroporto de Congonhas, seis ficam a menos de 800 metros do embarque. Na prática, isso corresponde a uma caminhada de 8 a 12 minutos, dependendo do peso da bagagem e do ritmo. A passarela de acesso ao terminal segue aberta durante as obras.

| Estacionamento | Distância | Caminhada estimada | Tem traslado |
| --- | --- | --- | --- |
| Congonhas Park | 0,64 km | 8 minutos | informa traslado |
| Facility | 0,64 km | 8 minutos | não informado |
| One Parking | 0,64 km | 8 minutos | só a partir de 2 diárias |
| Aerovalet | 0,74 km | 9 minutos | sem van, aberto 24 horas |
| MultiPark | 0,78 km | 10 minutos | não informado no site |
| The Parking | 0,79 km | 10 minutos | gratuito ida e volta |

A distância curta é a grande vantagem competitiva de Congonhas. Em Guarulhos, o pátio externo típico fica a três ou quatro quilômetros, e a van é obrigatória. Aqui, quem viaja leve pode simplesmente andar, o que elimina a espera nas duas pontas.

### Quando a caminhada compensa mais que a van?

Três situações favorecem ir a pé. Primeiro, horário de pico, quando o trânsito do entorno trava e a van demora mais que os dez minutos de caminhada. Segundo, bagagem de mão apenas, sem mala despachada. Terceiro, chegada apertada, porque andar dá previsibilidade e esperar não.

Por outro lado, com mala grande, criança pequena ou chuva forte, o traslado continua sendo a melhor escolha. Também vale lembrar que a calçada da região tem trechos estreitos.

## Os estacionamentos próximos ao aeroporto de Congonhas com traslado

Nem todos os estacionamentos próximos ao aeroporto de Congonhas oferecem van. Entre os que oferecem, ainda por cima, as regras variam bastante. Conferimos cada informação no site da própria empresa em 5 de setembro de 2026.

| Estacionamento | Traslado | Condição | Horário |
| --- | --- | --- | --- |
| The Parking | gratuito ida e volta | sem carência | 4h às 23:59 |
| Express Parking | gratuito 24 horas | sem carência | 24 horas |
| One Parking | gratuito | a partir de 2 diárias | não informado |
| Grand Parking | traslado e valet | tarifa sob consulta | não informado |

O Express Parking, que fica mais longe de todos a 1,39 km, compensa a distância com van 24 horas e informa que leva a bagagem do porta-malas até o portão de embarque. Ou seja, o serviço aqui entra no que você compra, e ajuda a explicar a tarifa.

Já o One Parking cobra carência de duas diárias para liberar a van gratuita. Como ele fica a 640 metros, essa condição pesa pouco para quem topa caminhar, mas pesa muito para quem vai e volta no mesmo dia com mala.

![avenida com entradas de garagens entre os estacionamentos perto do terminal de Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-congonhas/estacionamentos-proximos-aeroporto-congonhas-avenida.webp)

## Ficha de cada estacionamento perto do aeroporto de Congonhas

Abaixo, o que sabemos de cada um dos estacionamentos próximos ao aeroporto de Congonhas, sempre com a fonte da informação. Onde não há dado confirmado, dizemos isso em vez de estimar.

### One Parking, o mais próximo com tarifa aberta

Fica na Avenida Washington Luís, 6901, a 640 metros do embarque. Publica a tabela mais detalhada da região, toda conferida em 5 de setembro de 2026. Carro e SUV saem por R$ 45,00 a diária ou R$ 15,00 a hora. Caminhonete custa R$ 50,00, moto fica em R$ 30,00 a diária, e o mensalista de carro sai por R$ 300,00.

Trabalha com vaga coberta em ambiente fechado, câmeras, wi-fi e seguro nomeado. O traslado gratuito vale a partir de duas diárias. A empresa avisa no site que as obras do entorno podem atrasar a van, e recomenda o acesso a pé. Nota 4,3 com 89 avaliações no Google.

### The Parking, a menor diária da região

Endereço na Avenida Washington Luís, 7135, a 790 metros. Cobrava R$ 30,00 a diária de carro e R$ 20,00 a de moto em 5 de setembro de 2026, mediante reserva antecipada. É a tarifa mais baixa entre os pátios que publicam preço.

Oferece vaga coberta e fechada, seguro de garagista, traslado gratuito de ida e volta e lavagem. O ponto de atenção é o horário. Atende das 4h às 23:59, então não cobre retirada depois da meia-noite. Nota 4,2 com 559 avaliações.

### Grand Parking, o mais bem avaliado

Rua Baronesa de Bela Vista, 228, a 980 metros. Tem a melhor combinação de nota e volume da região: 4,4 com 880 avaliações no Google. Informa mais de 150 vagas, cobertura e segurança 24 horas. Também oferece traslado de ida e volta, valet, lavagem e carregador para carros elétricos.

Não publica tabela de preços. O site trabalha com simulador na área do cliente, então o valor só aparece depois do orçamento. Conheça a estrutura na [ficha do Grand Parking em Congonhas](/estacionamentos/aeroporto-congonhas/grand-parking).

### Express Parking, o mais estruturado

Rua Zacarias de Góis, 1859, a 1,39 km. É o mais distante da lista e o que mais compensa isso com serviço. Informa mais de 500 vagas e funcionamento 24 horas. O traslado gratuito também roda 24 horas, com trajeto de menos de cinco minutos, e ainda há wi-fi, manobristas e transporte de bagagem até o portão.

A tarifa varia por porte do veículo. Carro pequeno paga R$ 40,00 e carro grande paga R$ 45,00, com pacote de 15 a 30 dias por R$ 600,00, conferidos em 5 de setembro de 2026. Nota 4,4 com 670 avaliações.

### MultiPark, no hotel Slaviero Slim

Rua Baronesa de Bela Vista, 499, a 780 metros. Funciona junto ao hotel Slaviero Slim. Oferece sala de espera com wi-fi e banheiros, o que ajuda quem chega muito antes do voo. Aberto 24 horas, com vaga coberta.

Cobrava R$ 40,00 a diária pela reserva online e R$ 50,00 no balcão em 5 de setembro de 2026, uma diferença de 25% que recompensa quem se organiza. Nota 4,0 com 165 avaliações.

### Aerovalet, o parceiro aberto 24 horas

Rua Vieira de Morais, 2110, no Campo Belo, a 740 metros do embarque. É uma das duas unidades parceiras da Movepark em Congonhas, o que muda uma coisa importante: o preço não é retrato de tabela, ele vem do motor de reservas e acompanha o sistema.

Trabalha com vaga coberta e funciona 24 horas, então atende voo de madrugada e desembarque tarde da noite. A diária parte de R$ 28,90 e cai para R$ 14,90 por dia em trinta diárias (R$ 447,00 pela tabela de 28 de outubro de 2026), a menor tarifa diária de toda a lista. Veja a unidade e o valor do seu período na [página do Aerovalet em Congonhas](/estacionamentos/aeroporto-congonhas/aerovalet).

### Plenty Park, a vaga coberta a partir de três diárias

Rua Nhu-Guaçu, 211, na Vila Congonhas, a 860 metros. Também é parceiro da Movepark, com vaga coberta e funcionamento 24 horas. Pela tabela de 17 de novembro de 2026, sai por R$ 95,70 em três dias, R$ 195,30 em sete (R$ 27,90 por dia) e R$ 507,00 em trinta (R$ 16,90 por dia). Na semana fica R$ 14,00 acima do Aerovalet.

Duas condições merecem atenção antes de reservar. A primeira é a estadia mínima de três diárias, então ele não atende quem viaja por uma noite. A segunda quase ninguém publica: **a entrada tem 2 metros de altura**, e carro com bagageiro ou suporte de teto não passa. Confira o preço do seu período na [página do Plenty Park em Congonhas](/estacionamentos/aeroporto-congonhas/plenty-park) ou compare os dois na [página de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos).

### Congonhas Park, Facility e Arai Park

Na Avenida Washington Luís, 6915, a 640 metros, fica o Congonhas Park, com nota 4,0 e 291 avaliações. Na data da consulta, o site não carregava a tabela de preços, então o valor sai por telefone.

Já o Facility está na Rua Renascença, 112, também a 640 metros, em frente ao aeroporto, sem avaliações públicas registradas. Por fim, o Arai Park fica na Rua Barão de Suruí, 46, a 1,03 km, também sem tarifa publicada nem avaliação. Ambos entram no mapa por proximidade, e não por dado comercial confirmado.

## Como escolher entre os estacionamentos próximos ao aeroporto de Congonhas?

Quatro critérios resolvem quase toda decisão entre os estacionamentos próximos ao aeroporto de Congonhas. Vale ordená-los conforme a sua viagem, porque o peso de cada um muda bastante.

1. **Horário do voo.** Se o desembarque passa da meia-noite, elimine os pátios que fecham e fique com os de 24 horas.
2. **Duração da estadia.** Até dois dias, a diária avulsa manda. Acima de sete, o pacote decide, e a ordem da lista muda.
3. **Bagagem.** Viajando leve, a caminhada libera as seis opções mais próximas. Com mala grande, priorize traslado sem carência.
4. **Porte do veículo.** SUV e caminhonete pagam a mais em pelo menos dois pátios da região.

### O que a nota do Google revela sobre os estacionamentos próximos ao aeroporto de Congonhas?

Nota alta com poucas avaliações significa pouco. O One Parking tem 4,3, mas com 89 avaliações, enquanto o Grand Parking tem 4,4 com 880. A segunda nota é muito mais confiável, porque o volume dilui o acaso.

Por outro lado, a nota não mede preço nem horário. Um pátio pode ter atendimento excelente e ainda assim não servir para o seu voo das 5h. Portanto use a avaliação como filtro de qualidade, e não como critério único.

## Estacionamentos próximos ao aeroporto de Congonhas por perfil de viagem

Nenhum dos estacionamentos próximos ao aeroporto de Congonhas é o melhor para todo mundo. Por isso vale cruzar a lista com o tipo de viagem que você faz, porque o critério que decide muda conforme o caso.

| Perfil | Recomendação | Por quê |
| --- | --- | --- |
| Bate e volta no mesmo dia | The Parking ou pátio a pé | menor diária e sem carência de van |
| Fim de semana, 2 a 3 dias | Plenty Park ou Aerovalet | pacote curto já derruba a diária |
| Semana de férias, 7 dias | Aerovalet ou Plenty Park | R$ 181,30 e R$ 195,30 na semana |
| Viagem longa, 30 dias | Aerovalet | R$ 14,90 por dia em trinta diárias |
| Voo de madrugada | Aerovalet ou Plenty Park | parceiros abertos 24 horas |
| Chegada com pressa | estacionamento do terminal | sem van e sem caminhada |

Repare que a indicação muda de linha para linha. Isso acontece porque cada pátio da região otimizou uma coisa: preço avulso, pacote longo, horário ou serviço.

### Viajando com a família

Com criança pequena e mala grande, elimine a caminhada da equação. Priorize pátio com traslado sem carência de dias, como The Parking e Express Parking, e confirme se a van comporta cadeirinha. Alguns pátios pedem aviso prévio para isso.

Também vale perguntar se o pátio tem sala de espera. A MultiPark informa ter, com wi-fi e banheiros, o que ajuda quando a família chega muito antes do embarque.

### Viajando a trabalho, sozinho

Para quem viaja sozinho a trabalho, a caminhada costuma ganhar. Com bagagem de mão, os seis endereços a menos de 800 metros ficam disponíveis, e você elimina a espera da van nas duas pontas. Ou seja, ganha previsibilidade, que é o que mais importa quando a agenda é apertada.

Para quem viaja toda semana, vale investigar mensalidade. O One Parking publica plano mensal de carro a R$ 300,00, embora esse tipo de plano costume atender uso urbano, e não carro parado por longos períodos.

## O que perguntar antes de fechar com um pátio?

Uma ligação de três minutos evita quase todo problema. Estas são as perguntas que realmente mudam a conta final:

- **Qual a tarifa para o meu período exato**, e não a diária de tabela.
- **O traslado está incluído** e existe carência mínima de diárias.
- **SUV ou caminhonete pagam a mais** que um carro comum.
- **Qual o horário de entrada e de retirada**, inclusive em feriado.
- **O que o seguro cobre**, e se ele alcança objetos deixados no veículo.
- **Existe cobrança extra por dia excedente** quando o voo atrasa.

Guarde a resposta por escrito quando puder, nem que seja numa mensagem de WhatsApp. Isso resolve qualquer divergência na retirada.

## As obras de Congonhas e o que muda no entorno

O aeroporto vive a maior reforma da sua história. Governo Federal e Aena anunciaram R$ 2,6 bilhões para Congonhas, segundo o [Ministério de Portos e Aeroportos](https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/noticias/2026/02/governo-federal-e-aena-anunciam-r-9-2-bilhoes-em-investimentos-para-11-aeroportos-do-pais). O terminal de passageiros vai para 135 mil metros quadrados. Além disso, as pontes de embarque sobem de 12 para 19, e a conclusão está prevista para junho de 2028.

Para quem estaciona, o efeito é imediato no trânsito. O entorno ficou mais lento ao longo de todo o dia, e um dos pátios avisa no próprio site que o traslado pode atrasar por causa disso. Some dez ou quinze minutos ao planejamento até a obra terminar.

Há também um efeito positivo. Como a passarela segue aberta, a caminhada virou alternativa ainda mais atraente entre os estacionamentos perto do aeroporto de Congonhas, principalmente nos endereços a menos de 700 metros.

## Estacionamentos próximos ao aeroporto de Congonhas contra o pátio do terminal

Vale comparar os estacionamentos próximos ao aeroporto de Congonhas com a opção de dentro do terminal, porque a resposta não é a mesma em toda viagem. O estacionamento oficial funciona 24 horas dentro do terminal, com operação da Estapar, conforme a Aena informa na página do aeroporto.

| Critério | Pátios da vizinhança | Estacionamento do terminal |
| --- | --- | --- |
| Diária avulsa | de R$ 30,00 a R$ 50,00 | a partir de R$ 44,90 |
| Pacote de 2 a 5 dias | varia por pátio | a partir de R$ 85,90 |
| Pacote de 30 dias | de R$ 511,90 a R$ 777,00 | sem pacote publicado |
| Deslocamento | caminhada ou van | direto ao terminal |
| Cobertura | padrão da região | disponível |
| Serviços extras | lavagem, valet, bagagem | não oferece |

Todos os valores foram conferidos em 5 de setembro de 2026. A leitura rápida é esta: o terminal ganha em viagem média e em pressa, enquanto a vizinhança ganha em viagem longa e em serviço.

### O que só o pátio externo oferece?

Lavagem, estética automotiva, valet e transporte de bagagem não existem no estacionamento do terminal. Quem viaja muito costuma valorizar isso tanto quanto o preço, porque devolve o carro limpo e revisado no fim da viagem.

Por outro lado, quem chega atrasado não quer nada disso. Nesse momento, os poucos minutos que a caminhada ou a van consomem valem mais que qualquer serviço adicional.

## Perguntas que definem o pátio certo para você

Antes de olhar a tabela de novo, responda a estas quatro. Elas eliminam a maioria das opções em segundos e deixam só as que servem.

1. **Meu voo chega ou sai entre meia-noite e 4h?** Se sim, fique apenas com os pátios de 24 horas.
2. **Vou ficar mais de uma semana fora?** Se sim, o critério vira pacote, e não diária.
3. **Vou carregar mala despachada?** Se sim, priorize traslado sem carência de dias.
4. **Meu carro é SUV ou caminhonete?** Se sim, confirme o adicional de porte antes de fechar.

Quem responde as quatro costuma chegar a dois ou três candidatos, e aí a nota do Google desempata bem.

## Onde reservar e o que ler antes?

A Movepark reúne as unidades parceiras com o valor que o sistema cobra de verdade no [guia de estacionamentos do aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas). Para os pátios sem contrato, mantemos fichas com endereço, distância e avaliação, como a do [The Parking em Congonhas](/estacionamentos/aeroporto-congonhas/the-parking).

Se o seu critério principal for preço, o [comparativo dos três principais estacionamentos de Congonhas](/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/) entra em estrutura e atendimento. E para conhecer o terminal antes de chegar, o [panorama do aeroporto de Congonhas](/blog/aeroporto-de-congonhas-informacoes-completas/) cobre acessos, serviços e história.

## Perguntas frequentes sobre os pátios ao redor de Congonhas

### Qual é o estacionamento mais perto do aeroporto de Congonhas?

Três endereços empatam a 640 metros do embarque. São eles Congonhas Park e One Parking, na Avenida Washington Luís, e Facility, na Rua Renascença. Entre eles, só o One Parking publica tarifa aberta, com diária de R$ 45,00 para carro e SUV em 5 de setembro de 2026.

### Quantos estacionamentos próximos ao aeroporto de Congonhas existem?

Mapeamos 10 endereços num raio de 1,4 km do terminal. São 2 unidades parceiras da Movepark e 8 pátios independentes. Seis deles ficam a menos de 800 metros, o que permite ir a pé. O mais distante da lista é o Express Parking, a 1,39 km.

### Todos os estacionamentos perto de Congonhas são cobertos?

A grande maioria sim, e isso é uma característica da região. Como o terreno é caro e apertado, os pátios ocupam garagens de edifícios e estruturas fechadas em vez de terrenos abertos. Cobertura ali é padrão de mercado, não um diferencial que encarece a diária.

### Existe estacionamento 24 horas perto do aeroporto de Congonhas?

Existe, e são cinco. As duas unidades parceiras da Movepark, Aerovalet e Plenty Park, funcionam 24 horas, assim como MultiPark, Express Parking e o estacionamento oficial do terminal. Em contrapartida, o The Parking atende das 4h às 23:59, então não serve para retirada de madrugada.

### Vale a pena escolher um pátio mais longe para pagar menos?

Nem sempre, porque em Congonhas a diferença de distância é pequena e a de preço também. O Express Parking, o mais distante a 1,39 km, cobra R$ 40,00, enquanto o The Parking, a 790 metros, cobra R$ 30,00. Ou seja, aqui o mais longe não é automaticamente o mais barato.

### Como comparar pátios que não publicam a tarifa?

Ligue e pergunte quatro coisas de uma vez. A diária para o seu período exato, se o traslado tem carência, se SUV paga a mais, e qual o horário de entrada e retirada. Quem responde tudo sem enrolar costuma ser o mesmo que não inventa taxa na saída.$f22$
   where id = '89f08e3b-3bab-4749-ba1f-3c03e0b91b9b' and md5(body_md) = 'e764451e4bca4d25c099982c3345aab6';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · estacionamento-aeroporto-fim-de-ano · pt · body_md
  update public.blog_post set body_md = $f23$O estacionamento no aeroporto no fim de ano, de 23 de dezembro a 4 de janeiro, custa a partir de R$ 142,80 pelas 12 diárias num pátio parceiro de Guarulhos. No estacionamento oficial mais caro de Confins, a mesma janela passa de R$ 1.000,00. Os valores dos parceiros vêm do motor de reservas da Movepark em 10 de novembro de 2026. Já os oficiais foram conferidos no site de cada aeroporto, na mesma data.

## Quanto custa o estacionamento no aeroporto no fim de ano?

O estacionamento no aeroporto no fim de ano custa entre R$ 142,80 e R$ 682,80 nos pátios parceiros da Movepark, para a janela de 23 de dezembro a 4 de janeiro. A conta é de 12 diárias, com entrada e saída no mesmo horário. Nos estacionamentos oficiais, a mesma janela fica entre R$ 190,80 e R$ 1.020,00, conforme a praça e o tipo de vaga.

O número que importa é o total da estadia, e não a diária de entrada. Viagem de fim de ano é longa por natureza. Quem sai antes do Natal e volta depois do Réveillon deixa o carro parado por quase duas semanas. Nessa duração, portanto, a tabela escalonada dos pátios de fora do aeroporto derruba o valor por dia. Enquanto isso, boa parte dos oficiais cobra a diária cheia do primeiro ao último dia.

Os números abaixo cobrem as cinco praças onde a Movepark tem parceiro com preço no motor: Guarulhos, Congonhas, Viracopos, Confins e Curitiba. Para os outros aeroportos do país, a referência de diária por praça está no post [quanto custa deixar o carro no aeroporto em 2026](/blog/quanto-custa-deixar-o-carro-no-aeroporto/).

## Qual é o preço do estacionamento no aeroporto no fim de ano em cada praça?

A tabela de 23 de dezembro a 4 de janeiro compara, em cada aeroporto, o total de 12 diárias no pátio parceiro com o estacionamento oficial. O valor do parceiro é o mesmo que o checkout mostra para essa duração. Já o valor do oficial vem da tabela publicada pelo próprio aeroporto, com a data da consulta na última coluna.

| Aeroporto | Pátio parceiro (12 diárias) | Por dia | Oficial (12 diárias) | Referência |
|---|---|---|---|---|
| Guarulhos (GRU) | R$ 142,80 na Aerovalet, descoberta | R$ 11,90 | R$ 480,00 no Standard | motor Movepark e site do GRU Airport, 10/11/2026 |
| Congonhas (CGH) | R$ 310,80 na Aerovalet, coberta | R$ 25,90 | R$ 44,90 a diária, sem pacote de 12 dias publicado | motor Movepark 10/11/2026, Estapar Reserva 05/09/2026 |
| Viracopos (VCP) | R$ 358,80 no Virapark, coberta | R$ 29,90 | R$ 372,00 no bolsão F | motor Movepark e site de Viracopos, 10/11/2026 |
| Confins (CNF) | R$ 400,00 na BePark, coberta | R$ 33,33 | R$ 720,00 no Econômico 3 | motor Movepark e site da BH Airport, 10/11/2026 |
| Curitiba (CWB) | R$ 262,80 na Abbapark, descoberta | R$ 21,90 | a partir de R$ 190,80 na Área C | motor Movepark e site da Indigo, 10/11/2026 |

Em quatro das cinco praças, o pátio parceiro sai abaixo do oficial na janela das festas. A exceção é Curitiba. Lá, a Área C do estacionamento oficial parte de R$ 15,90 a diária, com mínimo de cinco diárias. O detalhe que pesa no fim de ano é outro, porém: a Indigo, operadora do oficial de Curitiba, declara no próprio site que a tarifa se ajusta à demanda. Por isso, o "a partir de" de novembro pode não ser o preço de dezembro.

O preço vivo de cada praça fica nas páginas de preço, com todas as vagas e as durações de 1, 7, 15 e 30 diárias. São elas: [Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), [Congonhas](/estacionamentos/aeroporto-congonhas/precos), [Viracopos](/estacionamentos/aeroporto-viracopos/precos), [Confins](/estacionamentos/aeroporto-confins/precos) e [Curitiba](/estacionamentos/aeroporto-curitiba/precos).

## Quanto custa o estacionamento no aeroporto numa semana de férias em janeiro?

Uma semana de férias em janeiro, com 7 diárias, custa a partir de R$ 83,30 no estacionamento parceiro de Guarulhos. No parceiro mais próximo do terminal de Viracopos, a mesma semana chega a R$ 398,30. Os dois valores são do motor de reservas da Movepark em 10 de novembro de 2026. A data de exemplo é de 9 a 16 de janeiro de 2027, mas o total vale para qualquer semana de janeiro.

| Aeroporto | Pátio parceiro (7 diárias) | Oficial (7 diárias) | Referência |
|---|---|---|---|
| Guarulhos (GRU) | R$ 83,30 na Aerovalet, descoberta | R$ 450,00 no Standard | motor Movepark e site do GRU Airport, 10/11/2026 |
| Congonhas (CGH) | R$ 181,30 na Aerovalet, coberta | R$ 149,90 no pacote de 7 dias da cota promocional | motor Movepark 10/11/2026, Estapar Reserva 05/09/2026 |
| Viracopos (VCP) | R$ 209,30 no Virapark, coberta | R$ 217,00 no bolsão F | motor Movepark e site de Viracopos, 10/11/2026 |
| Confins (CNF) | R$ 200,00 na BePark, coberta | a partir de R$ 189,00 no pacote online do Econômico | motor Movepark e site da BH Airport, 10/11/2026 |
| Curitiba (CWB) | R$ 153,30 na Abbapark, descoberta | a partir de R$ 111,30 na Área C | motor Movepark e site da Indigo, 10/11/2026 |

Na semana de janeiro, o retrato muda. O oficial fica abaixo do parceiro em Congonhas, Confins e Curitiba, desde que você consiga a condição promocional. A BH Airport, por exemplo, exige reserva com 72 horas de antecedência para o pacote de R$ 189,00 em Confins. Sem ela, a diária do Econômico 3 é R$ 60,00, o que dá R$ 420,00 na semana. Já o pacote de R$ 149,90 da Estapar em Congonhas depende de cota diária, que é a primeira coisa a acabar em alta temporada.

### Guarulhos e Viracopos: o parceiro abaixo do oficial

Por outro lado, Guarulhos tem a maior distância entre as duas colunas: R$ 366,70 numa semana. O Standard do GRU Airport cobra R$ 450,00 por qualquer estadia de 6 a 10 diárias. Enquanto isso, a Aerovalet cobra R$ 83,30 pelas mesmas sete. Em Viracopos, o Virapark também fica abaixo do bolsão F, por R$ 7,70 na semana.

## Por que 12 diárias e não 13?

A janela de 23 de dezembro a 4 de janeiro dá 12 diárias quando você entra e sai do pátio no mesmo horário. A diária do estacionamento de aeroporto conta 24 horas a partir da entrada, e não da meia-noite. Assim, quem entra às 8h do dia 23 e sai às 8h do dia 4 paga 12 diárias. Quem sai às 10h do dia 4 já começou a 13ª.

Na prática, o horário do voo de volta decide a conta. Voo que pousa às 6h permite sair do pátio antes do horário de entrada. Voo que pousa às 22h quase sempre empurra a estadia para mais uma diária, porque soma desembarque, bagagem e traslado. Então, ao reservar, use o horário em que você estima pegar o carro, e não o horário do pouso.

O motor de reservas da Movepark calcula o número de diárias a partir das datas e horas informadas. Depois, mostra o total antes do pagamento. Se o voo de volta mudar, o total muda junto.

## Quanto custa cada vaga em Guarulhos no fim de ano?

O estacionamento no aeroporto no fim de ano em Guarulhos tem a maior oferta: três parceiros com preço no motor, em vaga descoberta e coberta. Para a janela de 23 de dezembro a 4 de janeiro, com 12 diárias, os totais de 10 de novembro de 2026 são estes:

| Estacionamento em Guarulhos | Vaga | 12 diárias | 7 diárias | Mínimo de diárias |
|---|---|---|---|---|
| Aerovalet | descoberta | R$ 142,80 | R$ 83,30 | não exige |
| Aerovalet | coberta | R$ 166,80 | R$ 97,30 | não exige |
| Pare Seguro | descoberta | R$ 226,80 | R$ 132,30 | 2 |
| Aeropark | descoberta | R$ 238,80 | R$ 139,30 | 2 |
| Aeropark | coberta | R$ 334,80 | R$ 195,30 | 2 |
| Pare Seguro | coberta | R$ 346,80 | R$ 202,30 | 2 |

A Pare Seguro tem tabela nova programada no motor de reservas para 1º de dezembro de 2026. A partir dessa data, a vaga descoberta passa a R$ 298,80 em 12 diárias e a coberta a R$ 466,80, com mínimo de 3 diárias nas duas. A reserva da Pare Seguro é feita pela própria Movepark, e o valor calculado no momento da reserva fica registrado nela.

As distâncias também separam os três pátios de Guarulhos. O Aeropark fica a 2,7 km do terminal, em linha reta, e declara van de 10 minutos, com saída a cada 30 minutos. A Pare Seguro fica a 4,3 km e declara o mesmo trajeto de 10 minutos. A Aerovalet fica a 4,5 km e não declara o tempo de traslado na ficha. Para quem viaja com criança e mala grande, portanto, o tempo de van entra na conta tanto quanto o preço.

A página de [estacionamentos no Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos) aceita a data de ida e de volta e mostra o total de cada opção para o seu calendário.

## E em Congonhas, Viracopos, Confins e Curitiba?

Fora de Guarulhos, cada aeroporto tem um ou dois parceiros com preço no motor, e a lógica de alta temporada muda de praça para praça. Os totais de 12 diárias e de 7 diárias, de 10 de novembro de 2026 (no Plenty Park, da tabela de 17 de novembro de 2026), são estes:

| Aeroporto | Estacionamento | Vaga | 12 diárias | 7 diárias | Mínimo |
|---|---|---|---|---|---|
| Congonhas | Aerovalet | coberta | R$ 310,80 | R$ 181,30 | não exige |
| Congonhas | Plenty Park | coberta | R$ 334,80 | R$ 195,30 | 3 |
| Viracopos | Virapark | coberta | R$ 358,80 | R$ 209,30 | não exige |
| Viracopos | Garageinn | avulsa | R$ 682,80 | R$ 398,30 | não exige |
| Confins | BePark | coberta | R$ 400,00 | R$ 200,00 | não exige |
| Curitiba | Abbapark | descoberta | R$ 262,80 | R$ 153,30 | 3 |
| Curitiba | Nationpark | descoberta | R$ 310,80 | R$ 181,30 | 3 |
| Curitiba | Abbapark | coberta | R$ 346,80 | R$ 202,30 | 3 |
| Curitiba | Nationpark | coberta | R$ 406,80 | R$ 237,30 | 3 |

### Congonhas no fim de ano

Os dois parceiros de Congonhas ficam a menos de 900 metros do terminal: a Aerovalet a 740 metros e o Plenty Park a 860 metros, em linha reta. Na janela das festas, a diferença entre os dois é de R$ 24,00. Além disso, o Plenty só aceita estadia a partir de 3 diárias.

### Viracopos no fim de ano

Em Viracopos, a escolha é entre distância e preço. A Garageinn fica a 980 metros do terminal e declara van de 3 minutos, com saída a cada 15 minutos. O Virapark fica a 3,7 km e também declara saída da van a cada 15 minutos. Nas 12 diárias das festas, a proximidade da Garageinn custa R$ 324,00 a mais que o Virapark.

### Confins no fim de ano

A BePark fica a 7,6 km do terminal de Confins e declara van de 10 minutos, com saída a cada 20 minutos. A tabela da BePark trabalha com pacote. Assim, 7 diárias saem por R$ 200,00, e 12 diárias por R$ 400,00, o mesmo valor de 15 diárias. Ou seja, quem vai ficar mais de 12 dias em Confins paga o mesmo total até o 15º dia.

### Curitiba no fim de ano

A Nationpark fica a 1,4 km do terminal Afonso Pena e a Abbapark a 2,6 km, as duas com van declarada de 5 minutos. As duas também exigem mínimo de 3 diárias, o que não pesa numa viagem de fim de ano.

![estacionamento no aeroporto no Réveillon com viajantes tirando as malas do porta-malas ao entardecer](/images/blog/estacionamento-aeroporto-fim-de-ano/estacionamento-aeroporto-reveillon-alta-temporada.webp)

## O que muda no estacionamento do aeroporto no fim de ano?

O estacionamento do aeroporto no fim de ano muda em quatro pontos: a tabela, a ocupação, a fila da van e a regra de estadia mínima. Nenhum deles aparece na diária anunciada. Mesmo assim, todos afetam quanto você paga e quanto tempo gasta até o portão de embarque.

**A tabela.** Os pátios ajustam o preço para a temporada, e por isso a data da tabela importa. Os valores de parceiros deste post são os que estavam em vigor no motor de reservas em 10 de novembro de 2026. Do lado oficial, a Indigo de Curitiba declara tarifa ajustada pela demanda. A Estapar de Congonhas, por sua vez, trabalha com cota promocional por dia.

**A ocupação.** Dezembro e janeiro concentram as viagens de férias, e o bolsão econômico do aeroporto costuma ser o primeiro a encher. Quando sobra só a área cara, o preço que você planejou vira outro. Pátio de fora do aeroporto também tem número de vagas, e a disponibilidade da sua data aparece na hora da reserva.

**A fila da van.** Mais carros no pátio significam mais gente esperando o traslado no mesmo horário. Isso pesa principalmente nas manhãs de 23 e 24 de dezembro e na volta, entre 2 e 6 de janeiro. Por isso, some ao menos 20 minutos ao tempo que você usaria num dia comum.

**A estadia mínima.** Plenty Park, Abbapark e Nationpark pedem 3 diárias, e Aeropark e Pare Seguro pedem 2. Em viagem de fim de ano isso raramente atrapalha. Ainda assim, vale conferir antes de reservar uma ida e volta curta para a ceia.

## Quando reservar o estacionamento no aeroporto para o fim de ano?

Reserve o estacionamento no aeroporto para o fim de ano assim que a data do voo estiver fechada. O motivo é simples: o valor que vale é o da tabela no dia em que você reserva. E a tendência da alta temporada é a tabela subir, não cair. Na Pare Seguro de Guarulhos, por exemplo, a mesma estadia de 12 diárias em vaga descoberta custa R$ 226,80 hoje. Pela tabela programada para 1º de dezembro de 2026, ela passa a R$ 298,80.

O oficial também premia quem se adianta. A BH Airport só libera o pacote de 7 dias por R$ 189,00 com reserva feita 72 horas antes da entrada. Já a Estapar de Congonhas trabalha com cota limitada por dia para a diária promocional. Quem chega no balcão sem reserva paga a tarifa cheia, quando há vaga.

Três cuidados na hora de reservar:

- use as datas e os horários reais de entrada e saída, porque o total muda com uma diária a mais
- confira o tipo de vaga, já que coberta e descoberta têm preços diferentes no mesmo pátio
- leia as condições de alteração e de cancelamento da unidade antes de pagar, porque cada estacionamento tem a sua regra

## Vale a pena pagar mais pela vaga coberta em janeiro?

Em janeiro, a vaga coberta costuma valer a diferença para quem deixa o carro mais de uma semana. Doze dias de sol de verão no descoberto castigam pintura, borracha e painel. Além disso, a chuva de fim de tarde típica da estação deixa o carro sujo de lama e folha na volta. Em viagem curta, a cobertura é conforto. Já em viagem de duas semanas, ela é proteção.

O custo da cobertura no estacionamento do aeroporto no fim de ano, pelas tabelas de 10 de novembro de 2026, é este:

| Estacionamento | Descoberta (12 diárias) | Coberta (12 diárias) | Diferença |
|---|---|---|---|
| Aerovalet, Guarulhos | R$ 142,80 | R$ 166,80 | R$ 24,00 |
| Aeropark, Guarulhos | R$ 238,80 | R$ 334,80 | R$ 96,00 |
| Pare Seguro, Guarulhos | R$ 226,80 | R$ 346,80 | R$ 120,00 |
| Abbapark, Curitiba | R$ 262,80 | R$ 346,80 | R$ 84,00 |
| Nationpark, Curitiba | R$ 310,80 | R$ 406,80 | R$ 96,00 |

Na Aerovalet de Guarulhos, a vaga coberta custa R$ 2,00 a mais por dia, o que torna a escolha quase automática. Nos outros pátios, a diferença fica entre R$ 7,00 e R$ 10,00 por dia. Nesse caso, a decisão depende do tempo de viagem e do carro. Em Congonhas, Viracopos e Confins, os parceiros com preço no motor só oferecem vaga coberta.

![vaga coberta no estacionamento do aeroporto nas férias de janeiro protegendo o carro do sol](/images/blog/estacionamento-aeroporto-fim-de-ano/estacionamento-aeroporto-ferias-de-janeiro-vaga-coberta.webp)

## Deixar o carro no aeroporto nas festas sai mais barato que ir de aplicativo?

Deixar o carro no aeroporto nas festas sai mais barato que ir de aplicativo quando a estadia no pátio custa menos que a soma da ida e da volta. Em Guarulhos, as 12 diárias da Aerovalet somam R$ 142,80. Na tarifa de referência da categoria básica que a calculadora da Movepark usa, uma corrida de 30 km sai por cerca de R$ 73,00. Assim, a ida e a volta somam R$ 146,00 sem tarifa dinâmica. Com a dinâmica de 1,5 vez, comum na noite de 23 de dezembro e na volta de 4 de janeiro, as duas corridas passam de R$ 219,00.

A conta só vira contra o carro em estadia muito longa ou quando quem viaja mora perto do aeroporto. Para a sua conta, use a [calculadora de estacionamento de aeroporto](/calculadora-estacionamento-aeroporto). Ela compara o menor estacionamento da duração com duas corridas estimadas de aplicativo, e a metodologia fica aberta na própria página.

Some também o combustível e o pedágio da ida e da volta. Viracopos e Confins ficam longe do centro das capitais, então o pedágio entra de verdade na conta. Já em Congonhas e Guarulhos, o trânsito da véspera de feriado costuma pesar mais que o custo.

## Como evitar susto no caixa na volta das férias?

A volta das férias é quando aparece a cobrança que ninguém planejou. Quase sempre o motivo é um destes cinco, e todos dá para prever antes de sair de casa:

1. **Voo de volta atrasado.** Se o voo atrasar e você sair do pátio depois do horário reservado, a diferença é cobrada pela regra da unidade. Guarde o comprovante do atraso, porque a companhia aérea tem deveres com o passageiro. A [página de direitos do passageiro da ANAC](https://www.gov.br/anac/pt-br/assuntos/passageiros/copy_of_anac-passageiro/conheca-seus-direitos) explica o que a companhia deve oferecer em atraso e cancelamento.
2. **Horário de saída subestimado.** Reserve pelo horário em que você estima pegar o carro, com margem para bagagem e van, e não pelo horário do pouso.
3. **Tipo de vaga trocado.** Chegar com reserva de descoberta e pedir coberta no balcão muda o preço da estadia inteira.
4. **Mínimo de diárias.** Em pátio que exige 3 diárias, uma estadia de 2 é cobrada como 3.
5. **Balcão sem reserva.** O preço de quem chega sem reserva é o mais alto da tabela, e no fim de ano a vaga pode não existir.

Na verdade, nenhum desses itens é pegadinha. São regras de operação que valem o ano inteiro. Mas pesam mais quando a estadia é de duas semanas e o pátio está cheio.

![van de traslado do estacionamento do aeroporto no fim de ano recebendo viajantes com malas](/images/blog/estacionamento-aeroporto-fim-de-ano/estacionamento-aeroporto-fim-de-ano-traslado-van.webp)

## Quanto custa estacionar no aeroporto o mês inteiro de férias?

Estacionar no aeroporto o mês inteiro de férias custa a partir de R$ 207,00 por 30 diárias na Aerovalet de Guarulhos, na vaga descoberta, pelo motor de reservas em 10 de novembro de 2026. Em estadia longa, a tabela escalonada dos pátios de fora derruba o valor por dia para menos de R$ 7,00.

No oficial, o cenário de 30 dias é bem diferente. O Standard do GRU Airport cobra R$ 505,00 de 18 a 30 diárias, e o Premium cobra R$ 690,00. A tabela do edifício garagem de Viracopos termina em 10 diárias e não publica o valor de um mês. E 30 diárias no Econômico 3 de Confins, a R$ 60,00 a diária de balcão, somariam R$ 1.800,00.

Quem viaja muito ou fica fora por temporada encontra o detalhe dessa conta no post sobre [estacionamento mensal no aeroporto de Guarulhos](/blog/estacionamento-mensal-no-aeroporto-de-guarulhos/), com os pacotes de 30 dias e quando eles compensam.

## Qual é o checklist do estacionamento no aeroporto no fim de ano?

O checklist do estacionamento no aeroporto no fim de ano tem sete itens e leva cinco minutos. Rode a lista antes de sair de casa, de preferência na véspera, quando ainda dá tempo de corrigir:

- reserva confirmada com data, horário de entrada e de saída, e o tipo de vaga
- endereço do pátio salvo no aplicativo de mapa, porque a entrada de alguns fica numa rua lateral
- horário da van que leva ao terminal, inclusive se ela roda de madrugada
- foto do carro pelos quatro lados e do painel com a quilometragem, feita no pátio
- comprovante de entrada guardado até o fim da viagem
- nada de valor à vista dentro do carro
- telefone do pátio salvo, para avisar se o voo de volta atrasar

Para quem vai voar de Congonhas, o post sobre [deixar o carro no aeroporto de Congonhas](/blog/deixar-o-carro-no-aeroporto-de-congonhas/) mostra a diferença entre o oficial e os pátios vizinhos. Também explica por que a vaga de rua só serve para parada rápida.

## Perguntas frequentes sobre estacionamento no aeroporto no fim de ano

### Quantas diárias dá de 23 de dezembro a 4 de janeiro?

Dá 12 diárias quando a entrada e a saída do pátio acontecem no mesmo horário, por exemplo às 8h do dia 23 e às 8h do dia 4. A diária conta 24 horas a partir da entrada. Se você sair duas horas depois do horário de entrada, a estadia passa a 13 diárias e o total muda.

### Qual é o estacionamento de aeroporto mais barato para o Réveillon?

Entre os parceiros da Movepark, o menor total para 23 de dezembro a 4 de janeiro é da Aerovalet, em Guarulhos: R$ 142,80 por 12 diárias em vaga descoberta, ou R$ 11,90 por dia, no motor de reservas em 10 de novembro de 2026. Na mesma data, a vaga coberta da Aerovalet saía por R$ 166,80.

### O preço do estacionamento no aeroporto sobe no fim de ano?

Pode subir, e depende do pátio. A Pare Seguro, em Guarulhos, tem tabela nova programada no motor para 1º de dezembro de 2026. A Indigo, no oficial de Curitiba, declara tarifa ajustada pela demanda. Por isso, o valor que vale é o da tabela no dia em que você faz a reserva.

### Em quais aeroportos o oficial sai mais barato que o pátio de fora nas férias?

Na semana de janeiro, o oficial ficou abaixo do parceiro em Congonhas, Confins e Curitiba, mas só com a condição promocional. No caso de Congonhas, ela é o pacote de 7 dias com cota diária. Para Confins, é a reserva com 72 horas de antecedência. E na Área C de Curitiba, é o mínimo de cinco diárias. Sem essas condições, o oficial volta à tarifa cheia.

### Preciso chegar mais cedo ao estacionamento no fim de ano?

Sim. Some ao menos 20 minutos ao tempo que você usaria num dia comum, por causa da fila na entrada do pátio e da espera pela van, que são maiores nas manhãs de 23 e 24 de dezembro. Em pátio com van a cada 30 minutos, perder uma saída já custa meia hora.

### Vale reservar a vaga coberta para uma viagem de duas semanas em janeiro?

Na maioria dos pátios, vale. Doze diárias de sol de verão no descoberto desgastam pintura e borracha. A diferença para a coberta ficou entre R$ 24,00 e R$ 120,00 na estadia inteira nos parceiros de Guarulhos e Curitiba, pelas tabelas de 10 de novembro de 2026. Na Aerovalet de Guarulhos, a cobertura custa R$ 2,00 a mais por dia.

## Qual é o resumo do estacionamento no aeroporto no fim de ano?

O estacionamento no aeroporto no fim de ano custa de R$ 142,80 a R$ 682,80 nas 12 diárias de 23 de dezembro a 4 de janeiro, nos parceiros da Movepark. Na mesma janela, o oficial vai de R$ 190,80 a R$ 1.020,00. A praça decide mais que a marca, e a duração decide mais que a diária. Além disso, o valor que vale é o da tabela do dia em que você reserva, e em alta temporada ela tende a subir.

O caminho mais curto é colocar as suas datas e comparar os totais lado a lado. Comece pelos [estacionamentos no Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos), onde o preço mostrado é o mesmo da reserva, ou veja o retrato de todos os aeroportos no [índice de preços de estacionamento](/precos).
$f23$
   where id = '4e082a1f-13c7-459b-b89a-62aa3b31ac47' and md5(body_md) = '6d7f3fb14e00f6adb582cae2e44723db';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'estacionamento-aeroporto-fim-de-ano', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post · estacionamento-barato-aeroporto-congonhas · pt · body_md
  update public.blog_post set body_md = $f24$Os estacionamentos mais baratos do Aeroporto de Congonhas custam entre R$ 14,90 e R$ 28,90 por dia, conforme as tabelas que conferimos em 5 de setembro de 2026 e a do parceiro Aerovalet, de 28 de outubro de 2026, e é dessa faixa que sai o ranking das cinco opções mais em conta da praça. O valor por dia mais baixo aparece no Aerovalet a partir de 30 diárias, e o pacote do estacionamento oficial chega a R$ 17,18 por dia em cinco diárias, com vaga promocional limitada. Na diária avulsa, o piso da região fica em R$ 28,90, também no Aerovalet. Quem escolhe pelo preço da placa, sem olhar o período, quase sempre paga mais.

![Van de traslado recolhendo passageiro em rua movimentada perto do terminal de Congonhas, no caminho do estacionamento barato](/images/blog/estacionamento-barato-aeroporto-congonhas/estacionamento-barato-congonhas-traslado-van.webp)

Existe um detalhe que muda tudo em Congonhas e que quase ninguém comenta. Barato aqui depende do número de dias, e muda de nome conforme o período. O pátio que cobra a menor diária avulsa pode perder o primeiro lugar numa viagem de trinta dias, e o inverso também acontece com frequência.

Este guia ranqueia as opções de estacionamento barato no aeroporto de Congonhas por período, mostra onde a economia é real e aponta as cinco pegadinhas que transformam uma diária de R$ 30,00 numa conta de R$ 50,00 na saída.

## O top 5 dos estacionamentos mais baratos do Aeroporto de Congonhas

Antes de destrinchar cada opção, a tabela abaixo resume o ranking por diária, do mais barato ao mais caro, com as tarifas conferidas em 5 de setembro de 2026 e o preço dos parceiros pela tabela vigente de cada um: a do Aerovalet é de 28 de outubro de 2026, e a do Plenty Park, de 17 de novembro de 2026.

| Posição | Onde | Diária | Distância do terminal | Fonte e data |
|---|---|---|---|---|
| 1 | Estacionamento oficial, pacote de 5 diárias | R$ 17,18 por dia | dentro do aeroporto | Estapar Reserva, 05/09/2026 |
| 2 | Aerovalet | R$ 28,90 | 0,74 km | preço vivo no Movepark, 28/10/2026 |
| 3 | The Parking | R$ 30,00 | 0,79 km | site do The Parking, 05/09/2026 |
| 4 | Plenty Park, a partir de 3 diárias | R$ 31,90 | 0,86 km | preço vivo no Movepark, 17/11/2026 |
| 5 | MultiPark, com reserva online | R$ 40,00 | 0,78 km | site do MultiPark, 05/09/2026 |

Repare que o topo do ranking muda conforme a duração. Quem procura estacionar barato em Congonhas por poucos dias raramente fecha no mesmo pátio de quem vai passar duas semanas fora. O pacote de cinco diárias do oficial lidera na faixa dele, enquanto na diária avulsa quem ganha é o pátio de fora: o Aerovalet, parceiro da Movepark, cobra R$ 28,90 e desce a R$ 14,90 por dia a partir de 30 diárias. O Express Parking empata com a MultiPark em R$ 40,00 no carro pequeno, mas cobra R$ 45,00 no grande, e fica logo atrás do top 5. As seções seguintes mostram onde cada um vence.

## Qual é o estacionamento mais barato de Congonhas hoje?

A resposta depende de quantas noites o carro vai ficar parado. Para deixar isso claro, montamos a comparação por faixa de permanência, com o custo por dia já calculado. Assim você não precisa fazer a conta de cabeça no balcão.

| Período | Opção mais barata | Custo por dia | Total | Fonte e data |
| --- | --- | --- | --- | --- |
| 1 dia | Aerovalet | R$ 28,90 | R$ 28,90 | preço vivo no Movepark, 28/10/2026 |
| 3 dias | estacionamento oficial | R$ 28,63 | a partir de R$ 85,90 | Estapar Reserva, 05/09/2026 |
| 5 dias | estacionamento oficial | R$ 17,18 | a partir de R$ 85,90 | Estapar Reserva, 05/09/2026 |
| 7 dias | estacionamento oficial | R$ 21,41 | a partir de R$ 149,90 | Estapar Reserva, 05/09/2026 |
| 15 dias | Aerovalet | R$ 25,90 | R$ 388,50 | preço vivo no Movepark, 28/10/2026 |
| 30 dias | Aerovalet | R$ 14,90 | R$ 447,00 | preço vivo no Movepark, 28/10/2026 |

A tabela acima costuma surpreender, porque o estacionamento do próprio terminal aparece como a opção em conta em três faixas. Não há erro ali. O pacote promocional de 2 a 5 diárias derruba o custo diário para menos de R$ 18,00, e nenhum pátio da vizinhança bate isso nesse recorte.

Existe uma condição, porém. A operadora avisa que as vagas promocionais são limitadas por dia, então esse valor depende de reservar cedo. Quem chega em cima da hora pega a faixa seguinte e perde a vantagem.

### Por que o mais barato muda conforme os dias?

Um estacionamento barato no aeroporto de Congonhas convive com dois custos diferentes. O primeiro é o da vaga em si, que vale mais quanto mais perto do terminal. O segundo é o custo de movimentar o carro, que acontece uma vez só, na entrada e na saída, independente de quantos dias passaram.

Por isso a diária cai conforme a estadia estica. O custo de movimentação se dilui, e o pátio topa cobrar menos por dia para garantir a vaga ocupada por mais tempo. Em resumo, quanto mais dias, mais espaço o pátio tem para dar desconto.

## Onde encontrar estacionamento barato no aeroporto de Congonhas fora do terminal?

Procurar estacionamento barato no aeroporto de Congonhas tem uma vantagem que Guarulhos não oferece. Os pátios ficam perto de verdade: dez endereços mapeados estão num raio de 1,4 km do embarque. Seis deles ficam a menos de 800 metros. Isso significa que a caminhada é uma alternativa concreta, não um consolo.

| Estacionamento | Distância | Diária carro | Nota no Google | Fonte da tarifa |
| --- | --- | --- | --- | --- |
| Aerovalet (parceiro) | 0,74 km | R$ 28,90 | sem avaliação | preço vivo no Movepark, 28/10/2026 |
| The Parking | 0,79 km | R$ 30,00 | 4,2 (559 avaliações) | site próprio, 05/09/2026 |
| Plenty Park (parceiro) | 0,86 km | R$ 31,90 a partir de 3 diárias | sem avaliação | preço vivo no Movepark, 17/11/2026 |
| MultiPark | 0,78 km | R$ 40,00 online | 4,0 (165 avaliações) | site próprio, 05/09/2026 |
| Express Parking | 1,39 km | R$ 40,00 | 4,4 (670 avaliações) | site próprio, 05/09/2026 |
| One Parking | 0,64 km | R$ 45,00 | 4,3 (89 avaliações) | site próprio, 05/09/2026 |
| Grand Parking | 0,98 km | não publica | 4,4 (880 avaliações) | sem tarifa pública |
| Congonhas Park | 0,64 km | não publica | 4,0 (291 avaliações) | sem tarifa pública |
| Facility | 0,64 km | não publica | sem avaliação | sem tarifa pública |
| Arai Park | 1,03 km | não publica | sem avaliação | sem tarifa pública |

As notas do Google vêm da coleta de 28 de agosto de 2026. Elas ajudam a separar preço de reputação num estacionamento barato no aeroporto de Congonhas. Repare que os dois pátios mais bem avaliados, Grand Parking e Express Parking, têm perfis opostos. Um não publica tarifa, e o outro publica e fica no meio da tabela.

### Os dois parceiros da Movepark em Congonhas

Duas unidades da região são parceiras da Movepark, e isso muda o que você vê antes de reservar: o valor não é retrato de tabela, ele sai do próprio motor de reservas e acompanha qualquer mudança.

O [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet) fica na Rua Vieira de Morais, 2110, no Campo Belo, a 740 metros do embarque. Abre 24 horas, trabalha com vaga coberta e, pela tabela de 28 de outubro de 2026, cobra R$ 28,90 por dia de uma a seis diárias, R$ 25,90 de 7 a 16, R$ 19,90 de 17 a 29 e R$ 14,90 a partir de 30. Em estadia longa, o valor por dia do Aerovalet fica abaixo do The Parking e do pacote do Express Parking.

O [Plenty Park](/estacionamentos/aeroporto-congonhas/plenty-park) fica na Rua Nhu-Guaçu, 211, na Vila Congonhas, a 860 metros. Também abre 24 horas e tem vaga coberta. Ele cobra R$ 27,90 por dia na semana cheia, pela tabela de 17 de novembro de 2026, e entre os dois parceiros o Aerovalet sai mais barato em todas as durações que o Plenty Park atende. O Plenty Park exige estadia mínima de três diárias, e a entrada tem 2 metros de altura, o que barra carro com bagageiro ou suporte de teto.

### Estacionamento barato no aeroporto de Congonhas sem tarifa publicada

Quatro endereços não divulgam valor na internet. Isso não os torna caros, mas atrapalha quem quer comparar antes de sair de casa. Na hora de ligar, pergunte estas quatro coisas de uma vez:

- **Qual a diária para o meu período exato**, e não a diária avulsa de tabela.
- **Se o traslado está incluído** e se existe carência de dias para ele valer.
- **Se SUV ou caminhonete pagam a mais** que um carro comum.
- **Qual o horário de entrada e de retirada**, principalmente para voo de madrugada.

Um pátio que responde às quatro sem enrolar costuma ser o mesmo que não inventa taxa na saída.

## As cinco pegadinhas que encarecem a diária barata

A parte prática de quem procura estacionamento barato no aeroporto de Congonhas está nestas cinco pegadinhas. Uma diária baixa na vitrine não garante conta baixa na saída, e elas explicam quase toda a diferença entre o que você esperava pagar e o que aparece na maquininha.

![Portaria de estacionamento barato no aeroporto de Congonhas com carros entrando no fim da tarde](/images/blog/estacionamento-barato-aeroporto-congonhas/estacionamento-barato-congonhas-portaria.webp)

### O traslado com carência de dias

A carência de dias é a pegadinha mais comum da região. No One Parking, o traslado gratuito vale a partir de duas diárias, segundo o site da própria empresa em 5 de setembro de 2026. Ou seja, numa ida e volta no mesmo dia, você precisa caminhar ou pagar o transporte à parte.

Como o pátio fica a 640 metros do terminal, a caminhada resolve bem para quem viaja leve. Com mala grande e criança no colo, a história muda.

### O preço de balcão diferente do preço online

Na MultiPark, a mesma vaga custava R$ 40,00 pela reserva online e R$ 50,00 no balcão em 5 de setembro de 2026. São 25% de diferença por não ter reservado. O estacionamento oficial usa a mesma lógica por outro caminho, com cota promocional que acaba durante o dia.

### O porte do veículo

Dois pátios cobram por tamanho. No Express Parking, carro grande paga R$ 45,00 contra R$ 40,00 do pequeno. No One Parking, caminhonete sai por R$ 50,00 contra R$ 45,00 do carro comum. Parece pouco, mas em quinze dias vira R$ 75,00 de diferença.

### O horário que não cobre o seu voo

O The Parking, dono de uma das diárias mais baixas da região, atende das 4h às 23:59. Voo que pousa depois da meia-noite fica sem retirada até o dia seguinte. Portanto confira o horário antes de escolher pelo preço, porque uma noite extra de diária apaga a economia.

### A diária cheia contada por entrada

Quase todos os pátios cobram diária cheia a partir do momento da entrada, e não por hora corrida. Ficar 26 horas costuma custar duas diárias completas. Quando o voo de volta chega de manhã cedo, adiantar a saída em duas horas às vezes economiza um dia inteiro.

## Quanto custa um estacionamento barato no aeroporto de Congonhas por semana?

Sete dias é o período mais comum de viagem, e também onde a escolha errada custa mais caro. Quando você multiplica a diária avulsa por sete, o número assusta. Mas quase todo pátio da região tem pacote para essa faixa, então vale sempre perguntar.

| Opção | 7 dias (total) | Custo por dia | Fonte e data |
| --- | --- | --- | --- |
| Estacionamento oficial | a partir de R$ 149,90 | R$ 21,41 | Estapar Reserva, 05/09/2026 |
| Aerovalet | R$ 181,30 | R$ 25,90 | preço vivo no Movepark, 28/10/2026 |
| Plenty Park | R$ 195,30 | R$ 27,90 | preço vivo no Movepark, 17/11/2026 |
| The Parking (diária cheia) | R$ 210,00 | R$ 30,00 | site do The Parking, 05/09/2026 |
| Express Parking (diária cheia) | R$ 280,00 | R$ 40,00 | site do Express Parking, 05/09/2026 |

Repare no que acontece quando o pátio não tem pacote semanal. O Express Parking, que cobra R$ 40,00 na diária, chega a R$ 280,00 em sete dias, quase o dobro do pacote oficial. Ou seja, a mesma semana pode custar R$ 149,90 ou R$ 280,00 conforme a escolha. A diferença paga a bagagem despachada de ida e volta.

Por isso, para viagem de uma semana, sempre pergunte se existe tarifa fechada. Muitos pátios oferecem, mas só quando o cliente pede.

### O ponto de virada da conta

Existe um momento em que sai mais barato pagar por pacote do que por diária. Na região de Congonhas, esse ponto costuma aparecer no terceiro dia. Antes disso, a diária avulsa ainda compensa, principalmente nos pátios de menor valor.

Do terceiro ao décimo dia, o pacote do estacionamento oficial compensa mais que a diária cheia, enquanto houver vaga promocional. Um exemplo: o pacote oficial de 2 a 5 diárias parte de R$ 85,90, menos do que três diárias cheias no The Parking. Já em quinze dias, a tabela por faixa do Aerovalet (R$ 388,50) e a do Plenty Park (R$ 403,50) saem abaixo da diária cheia do The Parking (R$ 450,00).

## Estacionamento barato no aeroporto de Congonhas com traslado incluído

Nem toda economia sobrevive ao traslado, e esse item merece capítulo próprio. Entre os pátios que publicam tarifa, três incluem a van sem condição e um cobra carência de dias.

| Estacionamento | Traslado | Condição | Fonte e data |
| --- | --- | --- | --- |
| The Parking | gratuito ida e volta | sem carência | site próprio, 05/09/2026 |
| Express Parking | gratuito 24 horas | sem carência | site próprio, 05/09/2026 |
| One Parking | gratuito | só a partir de 2 diárias | site próprio, 05/09/2026 |
| Grand Parking | oferece traslado e valet | tarifa sob consulta | site próprio, 05/09/2026 |

O Express Parking, além de van 24 horas, informa que leva a bagagem do porta-malas até o portão de embarque. Como ele fica a 1,39 km, o mais distante da lista, esse serviço deixa de ser luxo e vira parte do que você compra.

Já quem escolhe um pátio a menos de 700 metros muitas vezes nem precisa da van. Nesse caso, a carência de dias do One Parking deixa de ser problema, porque a caminhada resolve em dez minutos.

### Quando o traslado gratuito sai caro?

Van gratuita não significa van imediata. Em horário de pico, ou durante as obras do entorno, a espera pode passar de quinze minutos em cada ponta. Portanto, quando o seu voo sai cedo, saia de casa contando com esse tempo.

Na volta, o efeito é pior, porque você já está cansado. Vale perguntar ao pátio qual o tempo médio de espera no horário do seu desembarque, e não a média geral do dia.

## Estacionamento barato no aeroporto de Congonhas para voo de madrugada

Congonhas tem restrição de operação noturna, mas ainda assim há voos muito cedo e desembarques tarde da noite. Nesses casos, o preço deixa de ser o primeiro critério, porque nem todo pátio abre.

- **Aerovalet:** parceiro da Movepark, aberto 24 horas, vaga coberta, a 740 metros do embarque.
- **Plenty Park:** parceiro da Movepark, aberto 24 horas, vaga coberta, com estadia mínima de três diárias.
- **The Parking:** das 4h às 23:59, segundo o site próprio em 05/09/2026. Não cobre retirada após a meia-noite.
- **MultiPark:** aberto 24 horas, com sala de espera, wi-fi e banheiros.
- **Express Parking:** aberto 24 horas, com traslado também 24 horas.
- **Estacionamento oficial:** opera 24 horas dentro do terminal.

Ou seja, se o seu voo pousa depois da meia-noite, o The Parking sai da disputa. Nesse cenário, na diária avulsa, o [Aerovalet](/estacionamentos/aeroporto-congonhas/aerovalet), a R$ 28,90 pela tabela de 28 de outubro de 2026, é o mais em conta entre os que atendem no horário, e a MultiPark (R$ 40,00 online) e o Express Parking (R$ 40,00 no carro pequeno) vêm depois.

E ainda cabe um lembrete simples: confirme o horário na véspera. Escala de fim de semana e feriado muda o atendimento de alguns pátios pequenos.

## Vale mais a pena o pátio externo ou o estacionamento do terminal?

Para quem busca estacionamento barato no aeroporto de Congonhas, a resposta muda em três cenários bem definidos. Vale decorar os três, porque eles cobrem quase toda viagem.

**Até dois dias, o pátio externo ganha.** A diária de R$ 30,00 do The Parking contra os R$ 44,90 do oficial abre uma diferença de quase R$ 30,00 em dois dias. A caminhada de 800 metros costuma compensar esse valor.

**De três a sete dias, o oficial fica competitivo.** Os pacotes de 2 a 5 e de 6 a 10 diárias derrubam o custo por dia para a faixa de R$ 17,00 a R$ 21,00, desde que ainda haja vaga promocional na data.

**Acima de quinze dias, o externo volta a mandar.** O oficial não publica pacote acima de dez diárias, enquanto o Express Parking fecha 15 a 30 dias por R$ 600,00, o que dá R$ 20,00 por dia em trinta dias, e o Aerovalet cobra R$ 447,00 por 30 diárias, R$ 14,90 por dia, pela tabela de 28 de outubro de 2026.

### A conta que quase ninguém faz

Some o custo do deslocamento até o pátio. Se você mora na zona sul, chegar ao Campo Belo custa o mesmo que chegar ao terminal. Já quem vem da Marginal Pinheiros pode gastar dez minutos a mais no trânsito para economizar R$ 15,00 na diária, e nem sempre esse troco compensa.

Também vale considerar o retorno. Você desembarca cansado, às vezes de madrugada, e esperar quinze minutos por uma van economiza pouco e desgasta muito. Compare o [preço vivo das unidades parceiras de Congonhas](/estacionamentos/aeroporto-congonhas/precos) antes de decidir só pelo número.

## Como economizar de verdade no estacionamento de Congonhas?

Cinco atitudes concentram quase toda a economia possível em estacionamento barato no aeroporto de Congonhas. Nenhuma delas exige sorte, só um pouco de antecedência.

1. **Reserve com antecedência.** Vale desconto direto em vários pátios e é o que garante a cota promocional do oficial.
2. **Compare pelo total do período, nunca pela diária.** A ordem da lista muda conforme os dias, como as tabelas acima mostram.
3. **Confirme o traslado antes.** Carência de dias e horário de van derrubam a economia de quem não perguntou.
4. **Avalie ir a pé.** Seis pátios ficam a menos de 800 metros, o que dá dez minutos de caminhada pela passarela.
5. **Ajuste o horário de retirada.** Sair antes de completar a próxima diária pode poupar um dia cheio.

### O erro clássico de quem procura estacionamento barato no aeroporto de Congonhas sem planejar

Muita gente escolhe o pátio na chegada, olhando placa na avenida. Naquele momento você não tem poder de barganha, o preço é o de balcão e a vaga disponível é a que sobrou. É assim que uma viagem planejada por meses termina com a diária mais cara da região.

Chegar com reserva feita inverte essa posição. Você entra sabendo o valor, o horário e a regra do traslado.

## As obras de Congonhas mudam a conta da economia?

Mudam o tempo, mais que o dinheiro. Governo Federal e Aena anunciaram R$ 2,6 bilhões para o aeroporto, segundo o [Ministério de Portos e Aeroportos](https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/noticias/2026/02/governo-federal-e-aena-anunciam-r-9-2-bilhoes-em-investimentos-para-11-aeroportos-do-pais). O terminal vai para 135 mil metros quadrados, e a conclusão está prevista para junho de 2028.

O efeito prático hoje aparece no trânsito do entorno. Um dos pátios avisa no próprio site que a van pode atrasar por causa das obras e recomenda o acesso a pé pela passarela. Portanto, quem escolheu um pátio distante só pelo preço precisa somar esse tempo ao planejamento.

Para uma visão completa do terminal e dos acessos, vale ler o [panorama do aeroporto de Congonhas](/blog/aeroporto-de-congonhas-informacoes-completas/). Se preferir uma leitura focada em estrutura e atendimento, o [comparativo dos três principais estacionamentos](/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/) ajuda a decidir.

## Onde reservar com preço conferido?

A Movepark lista as unidades parceiras de Congonhas com o valor que o sistema cobra de fato, e não com retrato de tabela. Você vê o total por período no [guia de estacionamentos do aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas) e compara antes de sair de casa.

Para os pátios sem contrato, a Movepark mantém fichas com endereço, distância e avaliação, como a do [Grand Parking em Congonhas](/estacionamentos/aeroporto-congonhas/grand-parking). Elas servem para você conhecer o lugar antes de ligar.

## Perguntas frequentes sobre economia em Congonhas

### Qual o estacionamento mais barato de Congonhas para um dia só?

Pela tabela de 28 de outubro de 2026, o Aerovalet, parceiro da Movepark, cobra R$ 28,90 por uma diária de vaga coberta, o menor valor da região para permanência avulsa, e atende 24 horas. Logo depois vem o The Parking, que cobrava R$ 30,00 a diária de carro em 5 de setembro de 2026 e atende das 4h às 23:59, o que não cobre voos de madrugada.

### Estacionamento barato no aeroporto de Congonhas costuma ser descoberto?

Não em Congonhas. A maioria dos pátios trabalha com vaga coberta, inclusive os mais baratos. O terreno é apertado, então as construções aproveitam garagens de prédios e estruturas fechadas. Cobertura ali é padrão, não diferencial de preço.

### É mais barato deixar a moto do que o carro em Congonhas?

Sim, e a diferença é grande. No The Parking, a moto saía por R$ 20,00 contra R$ 30,00 do carro em 5 de setembro de 2026. No One Parking, a moto custava R$ 30,00 contra R$ 45,00 do automóvel, o que dá dois terços do valor.

### Dá para achar diária abaixo de R$ 20,00 em Congonhas?

Só em pacote ou em estadia longa. Em 5 de setembro de 2026, o pacote oficial de 2 a 5 diárias saía a R$ 17,18 por dia em cinco dias, com vaga promocional limitada. No Aerovalet, parceiro da Movepark, a diária cai para R$ 19,90 de 17 a 29 diárias e para R$ 14,90 a partir de 30, pela tabela de 28 de outubro de 2026. Na diária avulsa, nenhum pátio baixa de R$ 28,90.

### Vale a pena caminhar em vez de usar o traslado?

Para quem viaja leve, costuma valer. Seis pátios ficam a menos de 800 metros do embarque, distância de cerca de dez minutos a pé pela passarela. Com as obras no entorno deixando o trânsito mais lento, a caminhada às vezes chega antes que a van.

### O estacionamento oficial pode ser mais barato que o externo?

Pode, e acontece na faixa de três a sete dias. O pacote de 2 a 5 diárias partia de R$ 85,90 em 5 de setembro de 2026. Isso dá R$ 17,18 por dia em cinco dias, abaixo de qualquer pátio externo da região. A cota promocional é limitada por dia.

### Reservar online garante um estacionamento barato no aeroporto de Congonhas?

Garante o melhor preço da tabela, mas não uma tarifa fixa para sempre. Na MultiPark, a reserva online saía por R$ 40,00 contra R$ 50,00 do balcão em 5 de setembro de 2026. No estacionamento oficial, reservar cedo é o que assegura a cota promocional antes de ela acabar.

### Quanto tempo de caminhada separa os pátios baratos do terminal?

Seis dos dez endereços mapeados ficam a menos de 800 metros do embarque, o que dá cerca de dez minutos a pé. O mais próximo com tarifa publicada é o One Parking, a 640 metros. O mais distante é o Express Parking, a 1,39 km, e nesse caso a van compensa.

### Existe estacionamento barato no aeroporto de Congonhas com valet?

Existe, embora poucos pátios publiquem a tarifa desse serviço. O Grand Parking informa oferecer valet, traslado e lavagem, mas trabalha com orçamento na área do cliente em vez de tabela aberta. Como o valet costuma entrar como adicional, confirme o valor no momento da reserva.

### Congonhas tem estacionamento mais barato que Guarulhos?

Não na diária avulsa. Guarulhos tem terreno de sobra no entorno e pátios grandes competindo por volume, o que derruba o preço. Congonhas cobra mais por vaga, porém devolve em proximidade: vários pátios ficam a dez minutos de caminhada, enquanto em Guarulhos a van é obrigatória.$f24$
   where id = '39f38659-c73c-430f-b927-4ec29047c421' and md5(body_md) = 'b3751922da3846608eb9560d530cc6a9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post', 'estacionamento-barato-aeroporto-congonhas', 'pt body_md'; end if;
  total := total + 1;

  -- blog_post_i18n · top-3-car-parks-at-congonhas-airport · en · excerpt
  update public.blog_post_i18n set excerpt = $f25$The three car parks at Congonhas Airport worth comparing are Aerovalet, Plenty Park and the official one. A week in a covered spot comes to R$ 181.30 at Aerovalet and R$ 195.30 at Plenty Park, the two outside lots, both under a kilometre from the terminal.$f25$
   where blog_post_id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and locale = 'en' and md5(excerpt) = 'c706957eebb2cb2d848af64faeeb0a52';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post_i18n', 'top-3-car-parks-at-congonhas-airport', 'en excerpt'; end if;
  total := total + 1;

  -- blog_post_i18n · top-3-car-parks-at-congonhas-airport · en · body_md
  update public.blog_post_i18n set body_md = $f26$The three car parks at Congonhas Airport worth comparing are Aerovalet, Plenty Park and the official one. The first two sit less than a kilometre from the terminal, a rare distance at a Brazilian airport and short enough to make a van unnecessary. A week in a covered spot comes to R$ 181.30 at Aerovalet, according to the table of 28 October 2026, and R$ 195.30 at Plenty Park, according to the table of 17 November 2026. Below are the three side by side and the sum that decides.

![Parking at Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/estacionamento-congonhas.webp)
_A car park near Congonhas Airport_

## The Congonhas car parks, side by side

São Paulo/Congonhas Airport, IATA code CGH, sits inside the urban fabric of the city's south side, which changes the logic of parking: here an outside lot needs no transfer, because you can reach the terminal in a few minutes. Neither of the two listed lots states a van of its own, for exactly that reason.

| Lot | Distance from terminal | Minimum stay | 1 day | 7 days | 30 days |
| --- | --- | --- | --- | --- | --- |
| Aerovalet Congonhas | 700 metres | no minimum | R$ 28.90 | R$ 181.30 | R$ 447.00 |
| Plenty Park | 900 metres | 3 days | not accepted | R$ 195.30 | R$ 507.00 |

Both work with covered spots only and operate 24 hours, so what sets them apart is the price scale. Under the table of 28 October 2026, Aerovalet is cheaper at every length of stay Plenty Park accepts, and it is still the only one that accepts a single day.

### 1. Aerovalet Congonhas: the closest, and the only one without a minimum stay

It is at Rua Vieira de Morais, 2110, in Campo Belo, 700 metres from the terminal. In the table of 28 October 2026, a covered spot costs R$ 28.90 a day from one to six days, R$ 25.90 a day from seven to sixteen, R$ 19.90 from seventeen to twenty-nine and R$ 14.90 from thirty up. Because the daily rate changes band, seventeen days (R$ 338.30) cost less than sixteen (R$ 414.40), and thirty (R$ 447.00) less than twenty-nine (R$ 577.10). It is the only one of the two outside options that accepts a one-day stay, which solves a there-and-back trip.

### 2. Plenty Park: covered spots from three days

It is at Rua Nhu-Guaçu, 211, in Vila Congonhas, 900 metres from the terminal. In the table of 17 November 2026, a covered spot comes to R$ 31.90 a day from three to six days, R$ 27.90 from seven to fourteen, R$ 26.90 from fifteen to twenty-nine and R$ 16.90 from thirty up. Because the daily rate changes band, thirty days (R$ 507.00) cost less than twenty-nine (R$ 780.10). It only accepts stays from three days, so a one-day stop is charged as three.

### 3. The official airport car park

It sits inside the complex, within walking distance of the terminal, and charges by length of stay. The rate belongs to the airport operator and moves through the year, so it is not in the table above: publishing a figure without the date it was read would be worse than not publishing it. At Congonhas it makes sense for a stay of a few hours, when even the short trip to the outside lots does not pay off. With a spot left in the promotional quota, it also comes out cheaper than both partners from three to ten days: Estapar Reserva advertised from R$ 85.90 for two to five days and R$ 149.90 for six to ten, as checked on 5 September 2026.

## Which of the three fits your case?

- **A one-day trip:** Aerovalet, the only one accepting a single day, at R$ 28.90 under the table of 28 October 2026. At Plenty Park the same stop counts as three days.
- **A week:** Aerovalet, at R$ 181.30 under the table of 28 October 2026, against R$ 195.30 at Plenty Park under the table of 17 November 2026, a difference of R$ 14.00 for the same covered spot. With a spot left in the promotional quota, the official car park comes out cheaper than both.
- **A month:** Aerovalet. Thirty days come to R$ 447.00 at Aerovalet, R$ 14.90 a day, against R$ 507.00 at Plenty Park, a difference of R$ 60.00.
- **A few hours:** the official one, which charges for the time used and spares you any journey.

## What to check before choosing in Congonhas

- **Minimum stay:** this is the point that changes the sum most on a short trip. Plenty Park's three-day floor makes a single day cost R$ 95.70.
- **Online rate against counter rate:** the gap is wide at both. At Aerovalet the counter day rate shows R$ 39.05 against R$ 28.90; at Plenty Park the week goes from R$ 349.30 at the counter to R$ 195.30.
- **Spot type:** both lots publish covered spots only, so there is no cheaper uncovered version to compare at Congonhas.
- **Distance:** 700 and 900 metres. Neither states a van, and the two hundred metres between them does not change the time to departures.

The units listed for Congonhas, with the most recent price, are on the [Congonhas Airport page](/en/airport-parking/congonhas-airport).

## How this comparison was gathered

Address, distance and opening hours come from each unit's page in the Movepark system, with distance calculated in the database as a straight line to the terminal. Both units close the booking at the lot itself, and Movepark mirrors the table each operator publishes: that is why every figure here carries its date: 28 October 2026 at Aerovalet and 17 November 2026 at Plenty Park, the dates of the current tables. A lot's table changes several times a year, so confirm the figure before travelling. The official car park's rate does not pass through the Movepark system. Airport traffic figures are on the [ANAC statistics portal](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Frequently asked questions

### Which car park is closest to the Congonhas terminal?

Aerovalet Congonhas, 700 metres from the terminal, followed by Plenty Park at 900 metres. At both the distance is short enough to make a van unnecessary, and neither states a transfer of its own on its page.

### Which of the two lots is cheaper for seven days?

Aerovalet, at R$ 181.30 for a covered spot under the table of 28 October 2026, against R$ 195.30 at Plenty Park under the table of 17 November 2026. The difference is R$ 14.00, and Plenty Park also only accepts stays from three days up.

### Is there a minimum stay at the Congonhas car parks?

At Plenty Park there is, three days, so a one-day stop is charged as three, R$ 95.70. Aerovalet accepts a single day, which comes to R$ 28.90 under the table of 28 October 2026. On a short trip that rule weighs more than the daily price.

### Do the Congonhas car parks operate overnight?

Both lots listed at Congonhas operate 24 hours, which covers an overnight collection. The airport restricts night flights, but anyone departing from Congonhas and returning through another airport usually collects the car outside business hours.

### Is the 30-day package worth it at Congonhas?

It is at both. Under the table of 28 October 2026, thirty days in a covered spot come to R$ 447.00 at Aerovalet, which works out at R$ 14.90 a day, against the single-day rate of R$ 28.90, and cost less than twenty-nine days (R$ 577.10). At Plenty Park, under the table of 17 November 2026, the month comes to R$ 507.00, R$ 16.90 a day, and also costs less than twenty-nine days (R$ 780.10).

### Is booking ahead cheaper than turning up and paying at Congonhas?

It is at both lots. At Aerovalet the counter day rate shows R$ 39.05 against R$ 28.90 in the online table of 28 October 2026. At Plenty Park the week goes from R$ 349.30 at the counter to R$ 195.30 in the table of 17 November 2026, a difference of R$ 154.00 for the same spot.$f26$
   where blog_post_id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and locale = 'en' and md5(body_md) = 'e1663f76b7f3e0b79ae478a0d26bc544';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post_i18n', 'top-3-car-parks-at-congonhas-airport', 'en body_md'; end if;
  total := total + 1;

  -- blog_post_i18n · top-3-estacionamientos-del-aeropuerto-de-congonhas · es · excerpt
  update public.blog_post_i18n set excerpt = $f27$Los tres estacionamientos del Aeropuerto de Congonhas que vale comparar son Aerovalet, Plenty Park y el oficial. La semana en plaza cubierta sale R$ 181,30 en Aerovalet y R$ 195,30 en Plenty Park, los dos predios externos, a menos de un kilómetro de la terminal.$f27$
   where blog_post_id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and locale = 'es' and md5(excerpt) = '76c861aebf845dacdf900831342721f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post_i18n', 'top-3-estacionamientos-del-aeropuerto-de-congonhas', 'es excerpt'; end if;
  total := total + 1;

  -- blog_post_i18n · top-3-estacionamientos-del-aeropuerto-de-congonhas · es · body_md
  update public.blog_post_i18n set body_md = $f28$Los tres estacionamientos del Aeropuerto de Congonhas que vale la pena comparar son Aerovalet, Plenty Park y el estacionamiento oficial. Los dos primeros quedan a menos de un kilómetro de la terminal, una distancia rara en un aeropuerto brasileño y tan corta que hace innecesaria la combi. La semana en plaza cubierta sale R$ 181,30 en Aerovalet, según la tabla del 28 de octubre de 2026, y R$ 195,30 en Plenty Park, según la del 17 de noviembre de 2026. Abajo están los tres lado a lado y la cuenta que decide.

![Estacionamiento en Congonhas](https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/blog/top-3-estacionamentos-do-aeroporto-de-congonhas/estacionamento-congonhas.webp)
_Estacionamiento cerca del Aeropuerto de Congonhas_

## Los estacionamientos de Congonhas, lado a lado

El Aeropuerto de São Paulo/Congonhas, código IATA CGH, queda dentro de la malla urbana de la zona sur, lo que cambia la lógica del estacionamiento: acá el predio externo no necesita traslado, porque se llega a la terminal en pocos minutos. Ninguno de los dos predios listados declara combi propia, justamente por eso.

| Predio | Distancia de la terminal | Estadía mínima | 1 día | 7 días | 30 días |
| --- | --- | --- | --- | --- | --- |
| Aerovalet Congonhas | 700 metros | sin mínimo | R$ 28,90 | R$ 181,30 | R$ 447,00 |
| Plenty Park | 900 metros | 3 días | no acepta | R$ 195,30 | R$ 507,00 |

Los dos trabajan solo con plaza cubierta y operan 24 horas, así que lo que los separa es la escala de precio. Según la tabla del 28 de octubre de 2026, Aerovalet sale más barato en todas las duraciones que Plenty Park atiende y sigue siendo el único que acepta un día suelto.

### 1. Aerovalet Congonhas: el más cerca y el único sin estadía mínima

Queda en Rua Vieira de Morais, 2110, en Campo Belo, a 700 metros de la terminal. En la tabla del 28 de octubre de 2026, la plaza cubierta cuesta R$ 28,90 por día de uno a seis días, R$ 25,90 por día de siete a dieciséis, R$ 19,90 de diecisiete a veintinueve y R$ 14,90 desde treinta. Como la diaria cambia de franja, diecisiete días (R$ 338,30) salen más baratos que dieciséis (R$ 414,40), y treinta (R$ 447,00) más baratos que veintinueve (R$ 577,10). Es la única de las dos opciones externas que acepta estadía de un día, lo que resuelve una ida y vuelta.

### 2. Plenty Park: plaza cubierta desde tres días

Queda en Rua Nhu-Guaçu, 211, en Vila Congonhas, a 900 metros de la terminal. En la tabla del 17 de noviembre de 2026, la plaza cubierta sale R$ 31,90 por día de tres a seis días, R$ 27,90 de siete a catorce, R$ 26,90 de quince a veintinueve y R$ 16,90 desde treinta. Como la diaria cambia de franja, treinta días (R$ 507,00) salen más baratos que veintinueve (R$ 780,10). Solo acepta estadía a partir de tres días, así que una parada de un día se cobra como tres.

### 3. El estacionamiento oficial del aeropuerto

Queda dentro del complejo, con acceso a pie hasta la terminal, y cobra por franja de permanencia. La tarifa es del operador del aeropuerto y se ajusta a lo largo del año, así que no entra en la tabla de arriba: publicar un número sin la fecha en que fue leído sería peor que no publicarlo. En Congonhas tiene sentido en permanencias de pocas horas, cuando ni el trayecto corto hasta los predios externos compensa. Con lugar en el cupo promocional, también sale más barato que los dos asociados de tres a diez días: Estapar Reserva anunciaba desde R$ 85,90 de dos a cinco días y R$ 149,90 de seis a diez, en la consulta del 5 de septiembre de 2026.

## ¿Cuál de los tres sirve para tu caso?

- **Viaje de un día:** Aerovalet, el único que acepta día suelto, por R$ 28,90 según la tabla del 28 de octubre de 2026. En Plenty Park la misma parada entra como tres días.
- **Una semana:** Aerovalet, por R$ 181,30 según la tabla del 28 de octubre de 2026, contra R$ 195,30 en Plenty Park según la tabla del 17 de noviembre de 2026, una diferencia de R$ 14,00 por la misma plaza cubierta. Con lugar en el cupo promocional, el oficial sale más barato que los dos.
- **Un mes:** Aerovalet. Treinta días salen R$ 447,00 en Aerovalet, R$ 14,90 por día, contra R$ 507,00 en Plenty Park, una diferencia de R$ 60,00.
- **Pocas horas:** el oficial, que cobra por el período usado y evita cualquier traslado.

## Qué mirar antes de elegir en Congonhas

- **Estadía mínima:** es el punto que más cambia la cuenta en un viaje corto. El piso de tres días de Plenty Park hace que un día cueste R$ 95,70.
- **Tarifa en línea contra la de mostrador:** la diferencia es grande en los dos. En Aerovalet la diaria de mostrador marca R$ 39,05 contra R$ 28,90; en Plenty Park la semana va de R$ 349,30 en mostrador a R$ 195,30.
- **Tipo de plaza:** los dos predios publican solo plaza cubierta, así que no existe una versión descubierta más barata para comparar en Congonhas.
- **Distancia:** 700 y 900 metros. Ninguno de los dos declara combi, y los doscientos metros de diferencia no cambian el tiempo hasta el embarque.

Las unidades listadas para Congonhas, con el precio más reciente, están en la [página del Aeropuerto de Congonhas](/es/estacionamiento-aeropuerto/aeropuerto-congonhas).

## ¿Cómo se obtuvo esta comparación?

La dirección, la distancia y el horario salen de la ficha de cada unidad en el sistema de Movepark, con la distancia calculada en la base de datos en línea recta hasta la terminal. Las dos unidades cierran la reserva en el propio predio, y Movepark refleja la tabla que publica cada operador: por eso cada valor de acá lleva su fecha: 28 de octubre de 2026 en Aerovalet y 17 de noviembre de 2026 en Plenty Park, fechas de las tablas vigentes. La tabla de un predio cambia varias veces al año, así que confirmá el valor antes de viajar. La tarifa del estacionamiento oficial no pasa por el sistema de Movepark. Los datos de movimiento del aeropuerto están en el [portal de estadísticas de ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Preguntas frecuentes

### ¿Qué estacionamiento queda más cerca de la terminal de Congonhas?

Aerovalet Congonhas, a 700 metros de la terminal, seguido de Plenty Park, a 900 metros. En los dos la distancia es tan corta que hace innecesaria la combi, y ninguno declara traslado propio en su ficha.

### ¿En cuál de los dos predios salen más baratos siete días?

En Aerovalet, por R$ 181,30 en plaza cubierta según la tabla del 28 de octubre de 2026, contra R$ 195,30 en Plenty Park según la tabla del 17 de noviembre de 2026. La diferencia es de R$ 14,00, y Plenty Park además solo acepta estadía a partir de tres días.

### ¿Hay estadía mínima en los estacionamientos de Congonhas?

En Plenty Park la hay, tres días, así que una parada de un día se cobra como tres, R$ 95,70. Aerovalet acepta día suelto, que sale R$ 28,90 según la tabla del 28 de octubre de 2026. Para un viaje corto esa regla pesa más que el precio del día.

### ¿Los estacionamientos de Congonhas funcionan de madrugada?

Los dos predios listados en Congonhas operan 24 horas, lo que cubre el retiro de madrugada. El aeropuerto tiene restricción de vuelos nocturnos, pero quien embarca por Congonhas y vuelve por otro aeropuerto suele buscar el auto fuera del horario comercial.

### ¿Conviene el paquete de 30 días en Congonhas?

Conviene en los dos. Según la tabla del 28 de octubre de 2026, treinta días en plaza cubierta salen R$ 447,00 en Aerovalet, lo que da R$ 14,90 por día, contra la diaria suelta de R$ 28,90, y cuestan menos que veintinueve días (R$ 577,10). En Plenty Park, según la tabla del 17 de noviembre de 2026, el mes sale R$ 507,00, R$ 16,90 por día, y también cuesta menos que veintinueve días (R$ 780,10).

### ¿Reservar antes sale más barato que llegar y pagar en Congonhas?

Sale en los dos predios. En Aerovalet la diaria de mostrador marca R$ 39,05 contra R$ 28,90 en la tabla en línea del 28 de octubre de 2026. En Plenty Park la semana va de R$ 349,30 en mostrador a R$ 195,30 en la tabla del 17 de noviembre de 2026, una diferencia de R$ 154,00 por la misma plaza.$f28$
   where blog_post_id = '30469012-3ca5-4c48-92e0-4fd770e5b756' and locale = 'es' and md5(body_md) = '5addb8b95e4fcc65f3e8201f1dd89813';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'frescor plenty: % · % · % mudou desde a leitura de 17/11', 'blog_post_i18n', 'top-3-estacionamientos-del-aeropuerto-de-congonhas', 'es body_md'; end if;
  total := total + 1;

  if total <> 28 then raise exception 'frescor plenty: % de 28 campos gravados', total; end if;
end
$frescor$;
