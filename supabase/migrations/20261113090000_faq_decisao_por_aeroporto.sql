-- FAQ de decisão por aeroporto (VCP, GRU, CNF, CGH).
--
-- Aplicada no banco em 08/09/2026 em cinco carimbos (faq_decisao_viracopos,
-- faq_decisao_guarulhos, faq_decisao_confins, faq_decisao_congonhas e
-- faq_reescreve_coberta_e_seguranca), porque o ambiente local não tem psql e a
-- aplicação saiu pelo MCP. Este arquivo é o conteúdo consolidado, e é ele que vale
-- num `db reset`.
--
-- Auditoria de 08/09/2026 contra os dois concorrentes na praça de Viracopos: a
-- Bandeira Park responde 10 perguntas como seção inteira e a xpark 7, enquanto a
-- nossa página tinha as perguntas certas com resposta de ~290 caracteres dentro de
-- um accordion. Recuperação em LLM é por passagem, e faltavam as perguntas que
-- DECIDEM a compra:
--
--   1. oficial do aeroporto ou particular
--   2. o que a diária já inclui
--   3. compensa deixar mais dias
--   4. dá para acompanhar a van em tempo real (só onde a Go2Park está ligada)
--
-- Todo número aqui sai do motor de preços em 08/09/2026 ou de uma resposta já
-- publicada e revisada. Distância é a medida do PostGIS (ADR-001). Sobre o
-- concorrente só entra o que o site dele publica (coberta contra descoberta);
-- estrutura de pátio e tipo de piso ficam de fora porque não temos fonte, e o CDC
-- art. 38 põe o ônus da prova em quem afirma.
--
-- As respostas curtas (`answer`) são o que o FAQPage afirma e continuam visíveis
-- literais (ADR-002). O `body_md` é o aprofundamento que a página de destino passou
-- a abrir embaixo de cada pergunta.

begin;

-- Helper local: pega o id do destino pelo slug.
create or replace function pg_temp.dest(p_slug text) returns uuid language sql stable as $fn$
  select id from public.destination where slug = p_slug
$fn$;

-- ---------------------------------------------------------------------------
-- Viracopos (VCP)
-- Garageinn: 979 m, van 3 min, Go2Park, R$ 59,99 a diária, R$ 45,90/dia em 7+.
-- Virapark: 3.695 m, 100% coberta, Go2Park, R$ 40,00 a diária, R$ 24,90/dia em 7+.
-- Oficial (Estapar): edifício-garagem R$ 83,00, bolsão F R$ 31,00.
-- ---------------------------------------------------------------------------
insert into public.faq (scope, destination_id, category_id, question, answer, body_md, sort_order)
values
(
  'destination', pg_temp.dest('aeroporto-de-viracopos'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Vale mais a pena o estacionamento oficial de Viracopos ou um particular?',
  'Depende de quantos dias o carro fica. Na diária avulsa o bolsão do oficial custa R$ 31,00 e sai na frente dos particulares. A partir de uma semana a conta se inverte, porque o oficial cobra o mesmo valor todo dia e o parceiro Virapark cai para R$ 24,90 por dia em vaga coberta. Em 30 diárias são R$ 747,00 no Virapark contra R$ 2.490,00 no edifício-garagem oficial. Valores de setembro de 2026.',
  $md$## O que muda entre o oficial e o particular em Viracopos

O que decide a conta em Viracopos é a duração da viagem, muito mais que a distância até o terminal.

O oficial fica dentro do aeroporto e cobra diária fixa: o edifício-garagem sai por R$ 83,00 e o bolsão F por R$ 31,00, o mesmo valor no primeiro e no trigésimo dia. Os particulares trabalham com tarifa decrescente, então o valor por dia cai conforme a estadia cresce.

### A conta por duração

- **1 diária:** bolsão oficial R$ 31,00, Virapark R$ 40,00, Garageinn R$ 59,99.
- **7 diárias:** Virapark R$ 174,30 (R$ 24,90 por dia), bolsão oficial R$ 217,00.
- **30 diárias:** Virapark R$ 747,00, bolsão oficial R$ 930,00, edifício-garagem oficial R$ 2.490,00.

Para uma ida e volta no mesmo fim de semana, o bolsão resolve. Para viagem de uma semana ou mais, o particular ganha, e a diferença cresce todo dia.

### O que você troca

O oficial dispensa traslado, porque você já está no aeroporto. O particular exige a van, e aí entram dois fatores: quanto tempo ela leva e se você consegue acompanhar. O [Garageinn fica a 979 m, com van de 3 minutos](/estacionamentos/aeroporto-viracopos/garageinn), e os dois parceiros da praça mostram a van no mapa em tempo real.

A tabela completa da região está em [quanto custa estacionar no Aeroporto de Viracopos](/faq/quanto-custa-estacionar-no-aeroporto-de-viracopos).$md$,
  2
),
(
  'destination', pg_temp.dest('aeroporto-de-viracopos'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Compensa deixar o carro mais dias no Aeroporto de Viracopos?',
  'Compensa, e a queda é grande. No parceiro Virapark a diária sai de R$ 40,00 na estadia de um dia para R$ 24,90 a partir de sete, uma queda de 38%, e o valor por dia não sobe mais até 30 diárias. No Garageinn a diária cai de R$ 59,99 para R$ 45,90, 23% menos. O estacionamento oficial cobra o mesmo por dia em qualquer duração. Valores de setembro de 2026.',
  $md$## Como o preço por dia cai em Viracopos

Quase todo particular da região trabalha com tarifa decrescente. Quem compara só a diária avulsa lê o preço errado para a própria viagem.

| Estadia | Virapark (coberta) | Garageinn |
| --- | --- | --- |
| 1 diária | R$ 40,00 | R$ 59,99 |
| 7 diárias | R$ 174,30 (R$ 24,90/dia) | R$ 321,30 (R$ 45,90/dia) |
| 15 diárias | R$ 373,50 (R$ 24,90/dia) | R$ 688,50 (R$ 45,90/dia) |
| 30 diárias | R$ 747,00 (R$ 24,90/dia) | R$ 1.377,00 (R$ 45,90/dia) |

O degrau acontece na sétima diária nos dois. Depois dele o valor por dia trava, então a viagem de 15 dias custa o dobro da de 7, sem surpresa.

Para simular o seu período exato, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$md$,
  4
),
(
  'destination', pg_temp.dest('aeroporto-de-viracopos'),
  (select id from public.faq_category where slug = 'check-in'),
  'O que está incluso na diária do estacionamento em Viracopos?',
  'Nos parceiros Movepark em Viracopos a diária já inclui o traslado de ida e volta até o terminal, sem cobrar por passageiro nem por bagagem, o pátio monitorado por câmeras e o rastreio da van em tempo real. O Garageinn leva 3 minutos até o terminal. No estacionamento oficial não existe traslado a considerar, porque o pátio fica no próprio aeroporto.',
  $md$## O que a diária cobre em Viracopos

O que costuma vir junto nos parceiros da praça:

- **Traslado de ida e volta**, incluído no valor, sem cobrança por pessoa ou por mala.
- **Pátio monitorado** por câmeras, com controle de acesso na entrada.
- **Rastreio da van pela Go2Park**, que mostra o veículo no mapa e o tempo até o embarque.

### O que varia entre as unidades

O tipo de vaga é a diferença principal. O Virapark tem 100% das vagas cobertas, e o Garageinn trabalha com vaga avulsa dentro do Centro Empresarial Viracopos, a 979 m do terminal.

Serviço extra como lavagem não entra na diária e aparece na página da unidade quando existe.$md$,
  6
),
(
  'destination', pg_temp.dest('aeroporto-de-viracopos'),
  (select id from public.faq_category where slug = 'check-in'),
  'Dá para acompanhar a van do estacionamento em tempo real em Viracopos?',
  'Dá, nos dois parceiros Movepark do aeroporto. O Virapark e o Garageinn usam a Go2Park, que mostra a van no mapa e o tempo até o ponto de embarque. Em Viracopos são os únicos que oferecem isso. Você chama o transfer pelo WhatsApp e acompanha o trajeto, em vez de esperar no meio-fio sem saber quanto falta.',
  $md$## Como funciona o rastreio da van

Depois de pousar, você chama o transfer pelo WhatsApp da unidade. A partir daí acompanha a van no mapa, com o tempo estimado até o ponto de embarque.

Isso resolve o pior momento da volta: desembarcar com mala e criança e não saber se a van saiu, se está a dois minutos ou a vinte.

### Onde funciona

- **Virapark** e **Garageinn**, os dois parceiros Movepark em Viracopos.
- Também no **BePark**, em Confins.

Os demais lotes da região atendem por telefone ou por rádio, sem posição da van na tela.$md$,
  8
);

-- ---------------------------------------------------------------------------
-- Guarulhos (GRU)
-- Aeropark: 2.672 m, van 10 min. Descoberta R$ 18,90/dia em 7+, coberta R$ 26,90/dia.
-- Aerovalet: 4.549 m. Descoberta R$ 18,90 a diária e R$ 14,90/dia em 30; coberta R$ 26,90.
-- Oficial: R$ 22,00 (Economy) a R$ 100,00 (setores junto ao terminal).
-- ---------------------------------------------------------------------------
insert into public.faq (scope, destination_id, category_id, question, answer, body_md, sort_order)
values
(
  'destination', pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Vale mais a pena o estacionamento oficial de Guarulhos ou um particular?',
  'Depende do setor do oficial e de quantos dias o carro fica. O setor Economy parte de R$ 22,00 a diária e os setores junto ao terminal chegam a R$ 100,00. Nos parceiros Movepark a vaga descoberta da Aerovalet começa em R$ 18,90 e cai para R$ 14,90 por dia em 30 diárias. Em um mês são R$ 447,00 na Aerovalet contra R$ 660,00 no Economy e R$ 3.000,00 nos setores colados ao terminal. Valores de setembro de 2026.',
  $md$## Oficial ou particular em Guarulhos

Guarulhos tem a maior diferença de preço entre setores de todos os aeroportos que a Movepark cobre. O oficial vai de R$ 22,00 a R$ 100,00 por dia dependendo de onde o carro fica, então "o oficial" não é um preço só.

### A conta em 30 diárias

| Opção | Por dia | Total no mês |
| --- | --- | --- |
| Aerovalet, vaga descoberta | R$ 14,90 | R$ 447,00 |
| Aerovalet, vaga coberta | R$ 21,90 | R$ 657,00 |
| Oficial, setor Economy | R$ 22,00 | R$ 660,00 |
| Oficial, setores junto ao terminal | R$ 100,00 | R$ 3.000,00 |

O setor Economy do oficial já não fica colado ao terminal e também depende de ônibus interno, então a comparação com o particular é mais justa do que parece: nos dois casos você pega um transporte.

### Quando o oficial ganha

Em ida e volta no mesmo dia, principalmente nos setores próximos, porque você economiza o tempo do traslado. A partir de dois ou três dias o particular abre vantagem e não devolve mais.

O comparativo completo está em [quanto custa estacionar no Aeroporto de Guarulhos](/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos).$md$,
  2
),
(
  'destination', pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Compensa deixar o carro mais dias no Aeroporto de Guarulhos?',
  'Compensa. Na Aerovalet a vaga descoberta sai de R$ 18,90 na diária avulsa para R$ 15,90 por dia em uma semana e R$ 14,90 por dia em 30 diárias, 21% menos. A coberta segue o mesmo caminho, de R$ 26,90 para R$ 21,90 por dia no mês. O estacionamento oficial cobra a mesma diária em qualquer duração. Valores de setembro de 2026.',
  $md$## Como o preço por dia cai em Guarulhos

| Estadia | Aerovalet descoberta | Aerovalet coberta | Aeropark descoberta |
| --- | --- | --- | --- |
| 1 diária | R$ 18,90 | R$ 26,90 | ver na página |
| 7 diárias | R$ 111,30 (R$ 15,90/dia) | R$ 160,30 (R$ 22,90/dia) | R$ 132,30 (R$ 18,90/dia) |
| 15 diárias | R$ 223,50 (R$ 14,90/dia) | R$ 328,50 (R$ 21,90/dia) | R$ 268,50 (R$ 17,90/dia) |
| 30 diárias | R$ 447,00 (R$ 14,90/dia) | R$ 657,00 (R$ 21,90/dia) | R$ 537,00 (R$ 17,90/dia) |

A queda se concentra entre a diária avulsa e a primeira semana. De 15 para 30 diárias o valor por dia já não muda, então viagem longa custa proporcional, sem degrau novo.

Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$md$,
  4
),
(
  'destination', pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos'),
  (select id from public.faq_category where slug = 'check-in'),
  'O que está incluso na diária do estacionamento em Guarulhos?',
  'Nos parceiros Movepark em Guarulhos a diária inclui o traslado de ida e volta até os Terminais 1, 2 e 3, sem cobrar por passageiro nem por bagagem, e o pátio monitorado por câmeras. O Aeropark leva cerca de 10 minutos até o terminal. Quem escolhe valet entrega o carro e recebe de volta sem passar pelo pátio, então nesse caso o traslado sai da conta.',
  $md$## O que a diária cobre em Guarulhos

- **Traslado de ida e volta** aos Terminais 1, 2 e 3, incluído no valor.
- **Pátio monitorado** por câmeras, com controle de acesso.
- **Tolerância de horário** na chegada e na saída, definida por unidade.

### Valet muda a conta

Aeropark e Aerovalet oferecem valet em Guarulhos. Nesse formato a equipe recebe o carro e devolve no desembarque, então você não usa a van. A diária é mais alta e o que você compra é o tempo: na Aerovalet o valet parte de R$ 119,20.

Serviço extra como lavagem não entra na diária e aparece na página da unidade quando existe.$md$,
  6
);

-- ---------------------------------------------------------------------------
-- Confins (CNF)
-- BePark: 7.626 m, van 10 min, Go2Park, vaga coberta.
--   R$ 45,00 a diária | 7d R$ 200,00 | 15d R$ 400,00 | 30d R$ 400,00.
-- Oficial (BH Airport): balcão de R$ 60,00 a R$ 105,00; reserva antecipada R$ 26,90.
-- ---------------------------------------------------------------------------
insert into public.faq (scope, destination_id, category_id, question, answer, body_md, sort_order)
values
(
  'destination', pg_temp.dest('aeroporto-de-confins'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Vale mais a pena o estacionamento oficial de Confins ou um particular?',
  'Depende de quantos dias. No balcão do BH Airport a diária vai de R$ 60,00 a R$ 105,00, e com reserva antecipada parte de R$ 26,90. No parceiro Movepark BePark a vaga coberta sai por R$ 45,00 no dia avulso e por R$ 400,00 no mês inteiro, o que dá R$ 13,33 por dia. Em 30 diárias são R$ 400,00 contra R$ 807,00 da reserva antecipada do oficial. Valores de setembro de 2026.',
  $md$## Oficial ou particular em Confins

O oficial fica dentro do aeroporto e cobra diária fixa. O particular exige traslado e trabalha com pacote, então o valor por dia despenca conforme a estadia cresce.

### A conta por duração

| Estadia | BePark (coberta) | Oficial com reserva |
| --- | --- | --- |
| 1 diária | R$ 45,00 | R$ 26,90 |
| 7 diárias | R$ 200,00 (R$ 28,57/dia) | R$ 188,30 |
| 15 diárias | R$ 400,00 (R$ 26,67/dia) | R$ 403,50 |
| 30 diárias | R$ 400,00 (R$ 13,33/dia) | R$ 807,00 |

Para uma diária solta, o oficial ganha. O ponto de virada fica perto de duas semanas, e a partir daí o BePark abre distância rápido, porque o pacote de 30 diárias custa o mesmo do de 15.

### O que pesa além do preço

O BePark fica a 7,6 km do terminal, a maior distância entre os parceiros Movepark, com van de cerca de 10 minutos e rastreio em tempo real. Quem vai passar poucas horas fora tende a preferir o oficial mesmo pagando mais.

O comparativo da região está em [quanto custa estacionar no Aeroporto de Confins](/faq/quanto-custa-estacionar-no-aeroporto-de-confins).$md$,
  2
),
(
  'destination', pg_temp.dest('aeroporto-de-confins'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Compensa deixar o carro mais dias no Aeroporto de Confins?',
  'Compensa muito em Confins, mais que em qualquer outra praça da Movepark. No BePark a vaga coberta sai de R$ 45,00 na diária avulsa para R$ 28,57 por dia em uma semana e R$ 13,33 por dia em 30 diárias, uma queda de 70%. O pacote de 15 e o de 30 diárias custam os mesmos R$ 400,00, então da terceira semana em diante os dias extras não somam nada. Valores de setembro de 2026.',
  $md$## O pacote de Confins tem um degrau incomum

| Estadia | Total | Por dia |
| --- | --- | --- |
| 1 diária | R$ 45,00 | R$ 45,00 |
| 7 diárias | R$ 200,00 | R$ 28,57 |
| 15 diárias | R$ 400,00 | R$ 26,67 |
| 30 diárias | R$ 400,00 | R$ 13,33 |

O detalhe que quase ninguém nota: **15 e 30 diárias custam o mesmo**. Se a sua viagem passa de duas semanas, o mês inteiro já está pago. Vale conferir a data de volta antes de reservar por um período menor.

Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$md$,
  4
),
(
  'destination', pg_temp.dest('aeroporto-de-confins'),
  (select id from public.faq_category where slug = 'check-in'),
  'O que está incluso na diária do estacionamento em Confins?',
  'No parceiro Movepark BePark a diária inclui a vaga coberta, o traslado de ida e volta até o terminal com cerca de 10 minutos de trajeto, o pátio monitorado e o rastreio da van em tempo real pela Go2Park. Não há cobrança por passageiro nem por bagagem. No estacionamento do BH Airport não existe traslado a considerar, porque o pátio fica no próprio aeroporto.',
  $md$## O que a diária cobre em Confins

- **Vaga coberta**, e não descoberta como nos lotes mais baratos da região.
- **Traslado de ida e volta**, incluído no valor, sem cobrança por pessoa ou por mala.
- **Rastreio da van pela Go2Park**, com a posição no mapa e o tempo até o embarque.
- **Pátio monitorado** por câmeras, com controle de acesso.

### A distância é a contrapartida

O BePark fica a 7,6 km do terminal, mais longe que os lotes mapeados da região, que ficam entre 2,9 km e 3,1 km. O que ele entrega em troca é vaga coberta e van rastreada, que nenhum deles oferece.$md$,
  6
),
(
  'destination', pg_temp.dest('aeroporto-de-confins'),
  (select id from public.faq_category where slug = 'check-in'),
  'Dá para acompanhar a van do estacionamento em tempo real em Confins?',
  'Dá. O parceiro Movepark BePark usa a Go2Park, que mostra a van no mapa e o tempo até o ponto de embarque. Você chama o transfer pelo WhatsApp e acompanha o trajeto, em vez de esperar no meio-fio sem saber quanto falta. Em Confins ele é o único parceiro Movepark com esse recurso.',
  $md$## Por que isso importa em Confins

O BePark fica a 7,6 km do terminal, com van de cerca de 10 minutos. Numa distância dessas, saber se a van saiu muda a espera de verdade.

Depois de pousar você chama o transfer pelo WhatsApp da unidade e acompanha a van no mapa até o ponto de embarque.

O mesmo recurso existe no **Virapark** e no **Garageinn**, em Viracopos.$md$,
  8
);

-- ---------------------------------------------------------------------------
-- Congonhas (CGH)
-- Aerovalet: 738 m, coberta. R$ 32,90 | 7d R$ 202,30 | 15d R$ 369,90 | 30d R$ 511,90.
-- Plenty Park: 863 m, coberta, mínimo 3 diárias. 7d R$ 188,30 | 15d R$ 388,50 | 30d R$ 777,00.
-- Oficial: edifício-garagem com reserva a partir de R$ 39,90.
-- ---------------------------------------------------------------------------
insert into public.faq (scope, destination_id, category_id, question, answer, body_md, sort_order)
values
(
  'destination', pg_temp.dest('aeroporto-de-congonhas'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Vale mais a pena o estacionamento oficial de Congonhas ou um particular?',
  'Em Congonhas a distância quase empata, porque os dois parceiros Movepark ficam a menos de 900 m do terminal. O que muda é o preço. No edifício-garagem oficial a diária com reserva parte de R$ 39,90, e na Aerovalet a vaga coberta sai por R$ 32,90 no dia avulso e por R$ 17,06 por dia em 30 diárias. Em um mês são R$ 511,90 contra R$ 1.197,00 do oficial. Valores de setembro de 2026.',
  $md$## Oficial ou particular em Congonhas

Congonhas é o caso em que a distância decide menos, porque o aeroporto está dentro da cidade e os particulares ficam a poucos minutos a pé ou de van.

| Estadia | Aerovalet (coberta, 738 m) | Plenty Park (coberta, 863 m) | Oficial com reserva |
| --- | --- | --- | --- |
| 1 diária | R$ 32,90 | mínimo de 3 diárias | R$ 39,90 |
| 7 diárias | R$ 202,30 (R$ 28,90/dia) | R$ 188,30 (R$ 26,90/dia) | R$ 279,30 |
| 30 diárias | R$ 511,90 (R$ 17,06/dia) | R$ 777,00 (R$ 25,90/dia) | R$ 1.197,00 |

O particular ganha em qualquer duração aqui, inclusive na diária avulsa. Em 30 diárias a Aerovalet custa menos da metade do oficial.

### Atenção à estadia mínima

A Plenty Park só aceita reserva a partir de 3 diárias. Para ida e volta no mesmo dia, a opção é a Aerovalet ou o oficial.

O comparativo completo está em [quanto custa estacionar no Aeroporto de Congonhas](/faq/quanto-custa-estacionar-no-aeroporto-de-congonhas).$md$,
  2
),
(
  'destination', pg_temp.dest('aeroporto-de-congonhas'),
  (select id from public.faq_category where slug = 'pagamentos'),
  'Compensa deixar o carro mais dias no Aeroporto de Congonhas?',
  'Compensa. Na Aerovalet a vaga coberta sai de R$ 32,90 na diária avulsa para R$ 28,90 por dia em uma semana e R$ 17,06 por dia em 30 diárias, quase metade. Na Plenty Park o valor por dia fica entre R$ 26,90 e R$ 25,90 conforme a estadia. O edifício-garagem oficial cobra o mesmo por dia em qualquer duração. Valores de setembro de 2026.',
  $md$## Como o preço por dia cai em Congonhas

| Estadia | Aerovalet | Plenty Park |
| --- | --- | --- |
| 1 diária | R$ 32,90 | mínimo de 3 diárias |
| 7 diárias | R$ 202,30 (R$ 28,90/dia) | R$ 188,30 (R$ 26,90/dia) |
| 15 diárias | R$ 369,90 (R$ 24,66/dia) | R$ 388,50 (R$ 25,90/dia) |
| 30 diárias | R$ 511,90 (R$ 17,06/dia) | R$ 777,00 (R$ 25,90/dia) |

As duas se comportam de maneira diferente conforme a viagem estica. Até 15 diárias a Plenty Park e a Aerovalet andam próximas; em 30, a Aerovalet fica bem à frente porque continua reduzindo o valor por dia.

Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$md$,
  4
),
(
  'destination', pg_temp.dest('aeroporto-de-congonhas'),
  (select id from public.faq_category where slug = 'check-in'),
  'O que está incluso na diária do estacionamento em Congonhas?',
  'Nos parceiros Movepark em Congonhas a diária inclui vaga coberta, pátio monitorado por câmeras e o traslado até o terminal. Como a Aerovalet fica a 738 m e a Plenty Park a 863 m, o percurso é curto. A Plenty Park trabalha com estadia mínima de 3 diárias, o que muda o planejamento de quem viaja por um dia só.',
  $md$## O que a diária cobre em Congonhas

- **Vaga coberta** nas duas unidades parceiras.
- **Traslado até o terminal**, com percurso curto: 738 m na Aerovalet e 863 m na Plenty Park.
- **Pátio monitorado** por câmeras, com controle de acesso.

### O detalhe do prazo

A Plenty Park só aceita reserva a partir de 3 diárias. Quem viaja por um dia deve olhar a Aerovalet, que aceita diária avulsa por R$ 32,90.

Serviço extra como lavagem não entra na diária e aparece na página da unidade quando existe.$md$,
  6
);

-- ---------------------------------------------------------------------------
-- Reescritas: as duas perguntas que estavam genéricas demais para virar seção.
--
-- "coberta ou descoberta" e "é seguro" respondiam sem um único fato da praça
-- ("varia por estacionamento", "listam suas comodidades na própria página"). Como
-- resposta de accordion passava; como SEÇÃO com H2 próprio, uma resposta que não
-- afirma nada não sustenta citação nenhuma.
-- ---------------------------------------------------------------------------

-- Viracopos: o Virapark é o único da praça com 100% das vagas cobertas.
update public.faq set answer =
  'Os dois formatos existem na região, e em Viracopos há uma diferença que pesa no preço. O parceiro Virapark trabalha com 100% das vagas cobertas, por R$ 40,00 na diária e R$ 24,90 por dia a partir de sete. Os lotes mais baratos do entorno vendem vaga descoberta. Quem deixa o carro parado por semanas sob o sol do interior paulista costuma preferir a coberta, e quem viaja por um ou dois dias raramente vê diferença.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-viracopos')
  and question = 'As vagas em Viracopos são cobertas ou descobertas?';

update public.faq set answer =
  'Os parceiros Movepark em Viracopos operam com pátio fechado, monitoramento por câmeras 24 horas e controle de acesso na portaria, e os dois têm rastreio da van em tempo real pela Go2Park. A página de cada unidade lista os itens de segurança um a um, antes de você reservar. Confira o que está escrito ali: é o que a unidade declara entregar.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-viracopos')
  and question = 'Os estacionamentos de Viracopos são seguros? Têm monitoramento?';

-- Guarulhos: a diferença entre coberta e descoberta é a maior das quatro praças.
update public.faq set answer =
  'Guarulhos tem os dois, e a diferença de preço é clara. Na Aerovalet a descoberta parte de R$ 18,90 a diária e a coberta de R$ 26,90; no Aeropark a descoberta sai por R$ 18,90 por dia a partir de sete diárias e a coberta por R$ 26,90. A coberta protege de sol, chuva e granizo, o que pesa para quem deixa o carro semanas. As duas unidades também oferecem valet, em que a equipe estaciona o carro por você.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos')
  and question = 'As vagas em Guarulhos são cobertas ou descobertas?';

update public.faq set answer =
  'Os parceiros Movepark em Guarulhos operam com pátio fechado, monitoramento por câmeras 24 horas e controle de acesso, e a página de cada unidade lista os itens de segurança um a um. Quem escolhe valet entrega o carro para a equipe da unidade e recebe de volta no desembarque, sem circular pelo pátio. Confira os itens antes de reservar.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos')
  and question = 'Os estacionamentos de Guarulhos são seguros? Têm monitoramento?';

-- Confins: o parceiro é coberto e os lotes baratos da região não são.
update public.faq set answer =
  'Em Confins o parceiro Movepark BePark trabalha com vaga coberta, por R$ 45,00 na diária avulsa e R$ 13,33 por dia em 30 diárias. Os lotes mais baratos da região vendem vaga descoberta, a partir de R$ 20,00 a diária. A coberta protege de sol forte e de chuva, e faz mais diferença em estadia longa, quando o carro fica semanas parado no mesmo lugar.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-confins')
  and question = 'As vagas no Aeroporto de Confins são cobertas ou descobertas?';

update public.faq set answer =
  'O parceiro Movepark BePark opera com pátio coberto e fechado, monitoramento por câmeras 24 horas, controle de acesso e rastreio da van em tempo real pela Go2Park. A página da unidade lista os itens de segurança um a um. Nos lotes que a Movepark apenas mapeou, sem contrato, confira as condições direto com o estacionamento.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-confins')
  and question = 'Os estacionamentos perto do Aeroporto de Confins são seguros? Têm monitoramento?';

-- Congonhas: as duas unidades parceiras são cobertas.
update public.faq set answer =
  'Em Congonhas as duas unidades parceiras da Movepark trabalham com vaga coberta: a Aerovalet a 738 m do terminal, por R$ 32,90 na diária avulsa, e a Plenty Park a 863 m, por R$ 26,90 por dia a partir de 3 diárias. Como o aeroporto fica dentro da cidade, os pátios cobertos costumam ser edifício-garagem, o que também abriga o carro do sol e da chuva.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-congonhas')
  and question = 'As vagas em Congonhas são cobertas ou descobertas?';

update public.faq set answer =
  'Os parceiros Movepark em Congonhas operam com pátio coberto e fechado, monitoramento por câmeras 24 horas e controle de acesso, e a página de cada unidade lista os itens de segurança um a um. As duas ficam a menos de 900 m do terminal, em área movimentada da zona sul de São Paulo. Confira os itens antes de reservar.'
where scope='destination' and destination_id = pg_temp.dest('aeroporto-de-congonhas')
  and question = 'Os estacionamentos de Congonhas são seguros? Têm monitoramento?';

-- ---------------------------------------------------------------------------
-- Ordem editorial: answer-first.
--
-- Preço abre (é a consulta de maior intenção), a decisão vem em seguida, e a
-- logística fecha. As perguntas novas já nasceram nas posições pares 2, 4, 6 e 8;
-- este bloco reposiciona as que já existiam ao redor delas.
-- ---------------------------------------------------------------------------
update public.faq f set sort_order = novo.pos
from (values
  ('Quanto custa estacionar%',                    1),
  ('Qual o estacionamento mais barato%',          3),
  ('As vagas%cobertas ou descobertas?',           5),
  ('O estacionamento%traslado%',                  7),
  ('Os estacionamentos%seguros%',                 9),
  ('E se meu voo atrasar%',                      10),
  ('Tem valet ou é self-park%',                  11),
  ('Existe limite de altura%',                   12),
  ('Tem estacionamento dentro do aeroporto%',    13),
  ('Qual o estacionamento mais próximo%',        14)
) as novo(padrao, pos)
where f.scope = 'destination'
  and f.deleted_at is null
  and f.destination_id in (
    pg_temp.dest('aeroporto-de-viracopos'),
    pg_temp.dest('aeroporto-internacional-de-sao-paulo-guarulhos'),
    pg_temp.dest('aeroporto-de-confins'),
    pg_temp.dest('aeroporto-de-congonhas')
  )
  and f.question like novo.padrao;

commit;
