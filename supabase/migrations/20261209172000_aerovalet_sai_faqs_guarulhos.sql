-- A Aerovalet deixou a Movepark (27/11/2026): FAQs de destino de Guarulhos.
--
-- As FAQs aparecem na página do aeroporto, que é para onde o 301 da ficha antiga manda o
-- tráfego dela (FICHA_DE_PARCEIRO_QUE_SAIU, src/worker.ts). Elas davam a Aerovalet como a diária
-- mais barata de GRU (R$ 16,90, tabela de 28/10/2026) e o Aeropark na tabela de 19/10/2026, que
-- virou em 13/11/2026. Passam a comparar a Pare Seguro (tabela de 03/11/2026, mínimo de 2 diárias,
-- R$ 18,90 por dia e R$ 290,00 fixos de 15 a 30 diárias na descoberta, checkout pela Movepark) e o
-- Aeropark (13/11/2026 nas vagas comuns, 19/10/2026 no valet). Cifras do simulate_price lido em
-- 27/11/2026. 8 FAQs em pt (12 campos) e 12 traduções.
--
-- Trava: campo inteiro com md5 do texto lido em 27/11/2026. Ver docs/specs/rotina-mensal-frescor.md,
-- seção "Rodada extra de 27/11/2026: a Aerovalet sai".

do $aerovalet$
declare
  k int;
  total int := 0;
begin
  -- Guarda de replay: no db reset do CI não há acervo, e a migration vira no-op.
  if not exists (select 1 from public.faq where id = '028691c1-9445-4db8-826b-6755e80b0acc') then
    raise notice 'aerovalet: banco sem o acervo de 27/11/2026, nada a revisar';
    return;
  end if;

  -- faq-028691c1.pt · answer
  update public.faq set answer = $f1$Depende do setor do oficial e de quantos dias o carro fica. Nos parceiros Movepark a vaga descoberta sai a partir de R$ 290,00 em 30 diárias, ou R$ 9,67 por dia, na Pare Seguro. Pela apuração de agosto de 2026, o Economy cobrava R$ 22,00 a diária, o que daria R$ 660,00 no mesmo período, e os setores junto ao terminal cobravam R$ 100,00, que fechariam R$ 3.000,00. O oficial cobra a mesma diária em qualquer duração, então a diferença cresce com a estadia. Preço da Pare Seguro na tabela de 03/11/2026.$f1$
   where id = '028691c1-9445-4db8-826b-6755e80b0acc' and md5(coalesce(answer, '')) = 'ec45804b985f315989e8506dc45471d3';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-028691c1.pt', 'answer'; end if;
  total := total + 1;

  -- faq-028691c1.pt · body_md
  update public.faq set body_md = $f2$## Oficial ou particular em Guarulhos

Guarulhos tem a maior diferença de preço entre setores de todos os aeroportos que a Movepark cobre. O oficial vai de R$ 22,00 a R$ 100,00 por dia dependendo de onde o carro fica, então "o oficial" não é um preço só.

### A conta em 30 diárias

| Opção | Por dia | Total no mês |
| --- | --- | --- |
| Pare Seguro, vaga descoberta | R$ 9,67 | R$ 290,00 |
| Pare Seguro, vaga coberta | R$ 11,67 | R$ 350,00 |
| Aeropark, vaga descoberta | R$ 17,90 | R$ 537,00 |
| Aeropark, vaga coberta | R$ 23,90 | R$ 717,00 |
| Oficial, setor Economy | R$ 22,00 | R$ 660,00 |
| Oficial, setores junto ao terminal | R$ 100,00 | R$ 3.000,00 |

O setor Economy do oficial também depende de ônibus interno até o terminal, então a comparação com o particular é mais justa do que parece: nos dois casos você pega um transporte.

### Quando o oficial ganha?

Em ida e volta no mesmo dia, porque os parceiros Movepark de Guarulhos trabalham com estadia mínima de duas diárias, e nos setores próximos você ainda economiza o tempo do traslado. A partir de duas diárias o particular sai na frente no preço (R$ 37,80 na vaga descoberta da Pare Seguro contra R$ 44,00 no Economy), e a vantagem cresce com a estadia.

Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026; os do oficial vêm de apuração de agosto de 2026. O comparativo completo está em [quanto custa estacionar no Aeroporto de Guarulhos](/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos).$f2$
   where id = '028691c1-9445-4db8-826b-6755e80b0acc' and md5(coalesce(body_md, '')) = '28855c1337ffbd83b67447b4e643d1db';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-028691c1.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-028691c1.en · answer
  update public.faq_i18n set answer = $f3$It depends on the official sector and on how many days the car stays. At the Movepark partners an uncovered spot costs from R$ 290.00 for 30 days, or R$ 9.67 a day, at Pare Seguro. Per the August 2026 research, the Economy sector charged R$ 22.00 a day, which would be R$ 660.00 over the same period, and the sectors next to the terminal charged R$ 100.00, adding up to R$ 3,000.00. The official car park charges the same daily rate whatever the length of stay, so the gap grows with the trip. Pare Seguro price from its 3 November 2026 table.$f3$
   where faq_id = '028691c1-9445-4db8-826b-6755e80b0acc' and locale = 'en' and md5(coalesce(answer, '')) = '8a04bbf3af7cdb59cba15b2caf7ee0d6';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-028691c1.en', 'answer'; end if;
  total := total + 1;

  -- faq-028691c1.es · answer
  update public.faq_i18n set answer = $f4$Depende del sector del oficial y de cuántos días queda el auto. En los socios de Movepark la plaza descubierta sale desde R$ 290,00 por 30 días, o R$ 9,67 por día, en Pare Seguro. Según el relevamiento de agosto de 2026, el sector Economy cobraba R$ 22,00 la tarifa diaria, lo que daría R$ 660,00 en el mismo período, y los sectores junto a la terminal cobraban R$ 100,00, que cerrarían R$ 3.000,00. El oficial cobra la misma tarifa diaria en cualquier duración, así que la diferencia crece con la estadía. Precio de Pare Seguro según su tabla del 3 de noviembre de 2026.$f4$
   where faq_id = '028691c1-9445-4db8-826b-6755e80b0acc' and locale = 'es' and md5(coalesce(answer, '')) = 'f7bd509242df6d6b4c1f5befda5d4632';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-028691c1.es', 'answer'; end if;
  total := total + 1;

  -- faq-3d6f8b16.pt · body_md
  update public.faq set body_md = $f5$## Como funciona o traslado de estacionamento no Aeroporto de Guarulhos?

O traslado é a van do estacionamento: ela deixa você no embarque e busca de volta no desembarque. Em Guarulhos os parceiros Movepark ficam a alguns quilômetros do terminal: a Aeropark a 2,7 km e a Pare Seguro a 4,3 km, as duas com van incluída na diária. Nos lotes alternativos a van costuma sair em intervalo curto, caso do Decolar Park, com traslado 24h a cada 15 minutos.

O que conferir antes de fechar:

- Se o traslado está incluído na diária ou é cobrado à parte.
- A frequência da van e se ela roda de madrugada, principalmente pra voo que chega tarde.
- Em feriado e alta temporada, chegue com folga: a van enche e o embarque demora mais.

Veja também: [quanto custa estacionar no Aeroporto de Guarulhos](/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos) e [vaga coberta ou descoberta](/faq/as-vagas-em-guarulhos-sao-cobertas-ou-descobertas).$f5$
   where id = '3d6f8b16-7e1f-4dec-b625-ddf2cf6b3688' and md5(coalesce(body_md, '')) = '032ea241a20c31cfa7c97f09853c9016';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-3d6f8b16.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-45c4c5e2.pt · answer
  update public.faq set answer = $f6$Guarulhos tem os dois, e a diferença aparece no preço. Na Pare Seguro a descoberta sai por R$ 18,90 por dia e a coberta por R$ 28,90, com mínimo de duas diárias; em 30 diárias elas caem para R$ 9,67 e R$ 11,67 por dia. No Aeropark a entrada também é a partir de duas diárias, e em 30 diárias a descoberta fica em R$ 17,90 e a coberta em R$ 23,90 por dia. A coberta protege de sol, chuva e granizo, o que pesa para quem deixa o carro semanas. O Aeropark também oferece valet, em que a equipe estaciona o carro por você. Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026.$f6$
   where id = '45c4c5e2-817f-4490-b0ba-e6bba30c948f' and md5(coalesce(answer, '')) = '5d0366d4fc67a4c1cdd9882030ff522d';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-45c4c5e2.pt', 'answer'; end if;
  total := total + 1;

  -- faq-45c4c5e2.pt · body_md
  update public.faq set body_md = $f7$## Vaga coberta ou descoberta no Aeroporto de Guarulhos: qual escolher

Nos parceiros Movepark de Guarulhos, a vaga descoberta da Pare Seguro sai por R$ 18,90 por dia e a coberta por R$ 28,90, com mínimo de duas diárias. No Aeropark são R$ 19,90 e R$ 26,90 por dia de 2 a 6 diárias. No FlyPark eram R$ 21,60 e R$ 28,00 em apuração de agosto de 2026.

Em estadia curta a diferença de poucos reais por dia não pesa. Em 30 diárias ela soma R$ 60,00 na Pare Seguro (R$ 350,00 contra R$ 290,00). No Aeropark a diferença no mês é de R$ 180,00 (R$ 23,90 contra R$ 17,90 por dia).

- Coberta protege de sol forte, chuva e granizo; compensa pra carro que fica semanas parado.
- Descoberta costuma ter a menor diária e não tem limite de altura.
- Carro muito alto? Veja [o limite de altura (gabarito)](/faq/existe-limite-de-altura-gabarito-para-suvs-vans-ou-furgoes-guarulhos-gru).

Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026. O comparativo de preços da região está em [quanto custa estacionar no Aeroporto de Guarulhos](/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos).$f7$
   where id = '45c4c5e2-817f-4490-b0ba-e6bba30c948f' and md5(coalesce(body_md, '')) = 'b080bf519ae5f7d4cdcd6bc777126ded';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-45c4c5e2.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-45c4c5e2.en · answer
  update public.faq_i18n set answer = $f8$Guarulhos has both, and the difference shows up in the price. At Pare Seguro an uncovered spot costs R$ 18.90 a day and a covered one R$ 28.90, with a two-day minimum; over 30 days they fall to R$ 9.67 and R$ 11.67 a day. At Aeropark entry is also from two days, and over 30 days the uncovered spot comes to R$ 17.90 and the covered one to R$ 23.90 a day. Covering shields from sun, rain and hail, which matters for anyone leaving the car for weeks. Aeropark also offers valet, where the staff park the car for you. Pare Seguro prices from its 03/11/2026 table and Aeropark prices from its 13/11/2026 table.$f8$
   where faq_id = '45c4c5e2-817f-4490-b0ba-e6bba30c948f' and locale = 'en' and md5(coalesce(answer, '')) = 'e95ae7241331e9c4a7cdec6dff9fabc5';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-45c4c5e2.en', 'answer'; end if;
  total := total + 1;

  -- faq-45c4c5e2.es · answer
  update public.faq_i18n set answer = $f9$Guarulhos tiene las dos, y la diferencia aparece en el precio. En Pare Seguro la descubierta sale R$ 18,90 por día y la cubierta R$ 28,90, con mínimo de dos días; en 30 días bajan a R$ 9,67 y R$ 11,67 por día. En Aeropark la entrada también es desde dos días, y en 30 días la descubierta queda en R$ 17,90 y la cubierta en R$ 23,90 por día. La cubierta protege del sol, la lluvia y el granizo, lo que pesa para quien deja el auto semanas. Aeropark también ofrece valet, donde el equipo estaciona el auto por vos. Precios de Pare Seguro según su tabla del 03/11/2026 y de Aeropark según la del 13/11/2026.$f9$
   where faq_id = '45c4c5e2-817f-4490-b0ba-e6bba30c948f' and locale = 'es' and md5(coalesce(answer, '')) = 'f167799df946ca55752406721e9e46c1';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-45c4c5e2.es', 'answer'; end if;
  total := total + 1;

  -- faq-7288e5fb.pt · answer
  update public.faq set answer = $f10$Compensa, e mais em estadia longa. Na Pare Seguro a vaga descoberta sai por R$ 18,90 por dia de 2 a 14 diárias, e de 15 a 30 diárias o preço é fixo, R$ 290,00, o que dá R$ 9,67 por dia no mês, 49% menos. A coberta faz o mesmo caminho, de R$ 28,90 para R$ 11,67 por dia no mês. No Aeropark, que também entra a partir de duas diárias, a descoberta vai de R$ 19,90 para R$ 17,90 por dia. O estacionamento oficial cobra a mesma diária em qualquer duração. Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026.$f10$
   where id = '7288e5fb-050c-47a0-80a4-ed143bf3b461' and md5(coalesce(answer, '')) = '42516f3a988f91dadccb2815b7c0c980';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-7288e5fb.pt', 'answer'; end if;
  total := total + 1;

  -- faq-7288e5fb.pt · body_md
  update public.faq set body_md = $f11$## Como o preço por dia cai em Guarulhos?

| Estadia | Pare Seguro descoberta | Pare Seguro coberta | Aeropark descoberta |
| --- | --- | --- | --- |
| 2 diárias | R$ 37,80 (R$ 18,90/dia) | R$ 57,80 (R$ 28,90/dia) | R$ 39,80 (R$ 19,90/dia) |
| 7 diárias | R$ 132,30 (R$ 18,90/dia) | R$ 202,30 (R$ 28,90/dia) | R$ 132,30 (R$ 18,90/dia) |
| 15 diárias | R$ 290,00 (R$ 19,33/dia) | R$ 350,00 (R$ 23,33/dia) | R$ 283,50 (R$ 18,90/dia) |
| 30 diárias | R$ 290,00 (R$ 9,67/dia) | R$ 350,00 (R$ 11,67/dia) | R$ 537,00 (R$ 17,90/dia) |

Na descoberta da Pare Seguro o valor por dia fica em R$ 18,90 de 2 a 14 diárias, e de 15 a 30 o total é fixo em R$ 290,00. Por isso 15 diárias custam R$ 25,40 a mais que 14 (R$ 290,00 contra R$ 264,60), mas qualquer estadia de 15 a 30 diárias custa o mesmo, e o mês inteiro sai pelo preço da quinzena. No Aeropark o valor por dia cai R$ 1,00 na sétima diária e mais R$ 1,00 na 18ª.

Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026. Para simular o seu período, use a [calculadora de estacionamento](/calculadora-estacionamento-aeroporto).$f11$
   where id = '7288e5fb-050c-47a0-80a4-ed143bf3b461' and md5(coalesce(body_md, '')) = '97ebf2158806a612f34504fc9bb8833a';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-7288e5fb.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-7288e5fb.en · answer
  update public.faq_i18n set answer = $f12$It is, especially on long stays. At Pare Seguro an uncovered spot costs R$ 18.90 a day for 2 to 14 days, and from 15 to 30 days the price is flat at R$ 290.00, which works out at R$ 9.67 a day over a month, 49% less. The covered spot follows the same path, from R$ 28.90 to R$ 11.67 a day over a month. At Aeropark, which also takes bookings from two days, the uncovered spot goes from R$ 19.90 to R$ 17.90 a day. The official car park charges the same daily rate whatever the stay. Pare Seguro prices from its 3 November 2026 table and Aeropark prices from its 13 November 2026 table.$f12$
   where faq_id = '7288e5fb-050c-47a0-80a4-ed143bf3b461' and locale = 'en' and md5(coalesce(answer, '')) = 'cbb55ac1c9f9e7e10d9071c72f47013d';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-7288e5fb.en', 'answer'; end if;
  total := total + 1;

  -- faq-7288e5fb.es · answer
  update public.faq_i18n set answer = $f13$Conviene, y más en estadías largas. En Pare Seguro la plaza descubierta sale R$ 18,90 por día de 2 a 14 días, y de 15 a 30 días el precio es fijo, R$ 290,00, lo que da R$ 9,67 por día en el mes, un 49% menos. La cubierta hace el mismo recorrido, de R$ 28,90 a R$ 11,67 por día en el mes. En Aeropark, que también acepta desde dos días, la descubierta pasa de R$ 19,90 a R$ 17,90 por día. El estacionamiento oficial cobra la misma tarifa diaria en cualquier duración. Precios de Pare Seguro según su tabla del 3 de noviembre de 2026 y de Aeropark según la del 13 de noviembre de 2026.$f13$
   where faq_id = '7288e5fb-050c-47a0-80a4-ed143bf3b461' and locale = 'es' and md5(coalesce(answer, '')) = '8fd7b14f4a88130e4486d26ad6201194';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-7288e5fb.es', 'answer'; end if;
  total := total + 1;

  -- faq-8b903062.pt · body_md
  update public.faq set body_md = $f14$## O que a diária cobre em Guarulhos?

- **Traslado de ida e volta** aos Terminais 1, 2 e 3, incluído no valor.
- **Pátio monitorado** por câmeras, com controle de acesso.
- **Tolerância de horário** na chegada e na saída, definida por unidade.

### Valet muda a conta

O Aeropark oferece valet em Guarulhos. Nesse formato a equipe recebe o carro e devolve no desembarque, então você não usa a van. A diária é mais alta e o que você compra é o tempo: no Aeropark o valet parte de R$ 89,90 por dia, com mínimo de duas diárias, pela tabela de 19/10/2026.

Serviço extra como lavagem não entra na diária e aparece na página da unidade quando existe.$f14$
   where id = '8b903062-e44e-45b4-88f8-7fd22fdd4d67' and md5(coalesce(body_md, '')) = 'ed407f63031ab9260754661183124513';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-8b903062.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-8bd38575.pt · answer
  update public.faq set answer = $f15$A menor diária perto do Aeroporto de Guarulhos entre os parceiros Movepark é a da Pare Seguro: R$ 18,90 por dia na vaga descoberta, a 4,3 km do terminal, com mínimo de duas diárias e preço fechado na reserva online. Em estadias longas a conta cai: R$ 132,30 na semana e R$ 290,00 em 30 diárias, que dão R$ 9,67 por dia. O Aeropark também entra a partir de duas diárias e cobra R$ 132,30 na semana e R$ 537,00 em 30 diárias na vaga descoberta. Preços da Pare Seguro na tabela de 03/11/2026 e do Aeropark na de 13/11/2026. Entre os lotes sem reserva online, a apuração de agosto de 2026 apontava Decolar Park a R$ 20,90 e FlyPark a R$ 21,60.$f15$
   where id = '8bd38575-2707-4edc-8360-45d05fb239d9' and md5(coalesce(answer, '')) = '768775eafee5a7c7f99492512db586e0';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-8bd38575.pt', 'answer'; end if;
  total := total + 1;

  -- faq-8bd38575.en · answer
  update public.faq_i18n set answer = $f16$The lowest daily rate among the Movepark partners near Guarulhos Airport is Pare Seguro: R$ 18.90 a day for an uncovered spot, 4.3 km from the terminal, with a two-day minimum and the price locked at booking. On long stays the bill drops: R$ 132.30 for a week and R$ 290.00 for 30 days, which works out at R$ 9.67 a day. Aeropark also takes bookings from two days up and charges R$ 132.30 for a week and R$ 537.00 for 30 days for an uncovered spot. Pare Seguro prices from its 3 November 2026 table and Aeropark prices from its 13 November 2026 table. Among the lots without online booking, the August 2026 research put Decolar Park at R$ 20.90 and FlyPark at R$ 21.60.$f16$
   where faq_id = '8bd38575-2707-4edc-8360-45d05fb239d9' and locale = 'en' and md5(coalesce(answer, '')) = '853c2d49eb175e2015ebc97fbc743e73';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-8bd38575.en', 'answer'; end if;
  total := total + 1;

  -- faq-8bd38575.es · answer
  update public.faq_i18n set answer = $f17$La tarifa diaria más baja entre los socios de Movepark cerca del Aeropuerto de Guarulhos es la de Pare Seguro: R$ 18,90 por día en plaza descubierta, a 4,3 km de la terminal, con mínimo de dos días y el precio cerrado al reservar. En estadías largas la cuenta baja: R$ 132,30 la semana y R$ 290,00 en 30 días, que dan R$ 9,67 por día. Aeropark también acepta desde dos días y cobra R$ 132,30 la semana y R$ 537,00 en 30 días en plaza descubierta. Precios de Pare Seguro según su tabla del 3 de noviembre de 2026 y de Aeropark según la del 13 de noviembre de 2026. Entre los predios sin reserva en línea, el relevamiento de agosto de 2026 marcaba Decolar Park en R$ 20,90 y FlyPark en R$ 21,60.$f17$
   where faq_id = '8bd38575-2707-4edc-8360-45d05fb239d9' and locale = 'es' and md5(coalesce(answer, '')) = '734fa52e3bba8a805fb93b3fb3b37b9e';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-8bd38575.es', 'answer'; end if;
  total := total + 1;

  -- faq-c13eae75.pt · answer
  update public.faq set answer = $f18$A diária mais barata perto do Aeroporto de Guarulhos entre os parceiros Movepark é a da Pare Seguro: R$ 18,90 por dia na vaga descoberta, com mínimo de duas diárias e preço fechado na reserva online. Na estadia longa você paga menos por dia: de 15 a 30 diárias o total é fixo em R$ 290,00, o que dá R$ 9,67 por dia no mês. No Aeropark a mesma vaga custa R$ 132,30 na semana e R$ 537,00 em 30 diárias. Preços do motor de reservas da Movepark, na tabela da Pare Seguro de 03/11/2026 e na do Aeropark de 13/11/2026. Nos demais lotes da tabela a diária de entrada vai de R$ 20,90 a R$ 40,80, em consulta de 26 de novembro de 2026, e o oficial fica entre R$ 22,00 no Economy e R$ 100,00 nos setores junto ao terminal, em apuração de agosto de 2026.$f18$
   where id = 'c13eae75-0754-48c6-ba32-8319c84602c0' and md5(coalesce(answer, '')) = 'b4e77c220f2fdf4a437ccc9c8ee9415c';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-c13eae75.pt', 'answer'; end if;
  total := total + 1;

  -- faq-c13eae75.pt · body_md
  update public.faq set body_md = $f19$Comparativo dos principais estacionamentos perto do Aeroporto de Guarulhos (GRU):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Pare Seguro (parceiro Movepark)** | R$ 18,90 por dia | Vaga descoberta a 4,3 km do terminal, com entrada a partir de 2 diárias; coberta por R$ 28,90 |
| **Aeropark (parceiro Movepark)** | R$ 19,90 por dia | Vaga descoberta, com entrada a partir de 2 diárias |
| Estacionamento oficial GRU (Indigo) | R$ 22,00 | Setor Economy, descoberto e afastado; setores junto ao terminal de R$ 75,00 a R$ 100,00 |
| Decolar Park | R$ 20,90 | Descoberta, traslado 24h a cada 15 minutos |
| FlyPark | R$ 40,80 | Pátio com sombreadores |
| GoPark | R$ 24,90 | Descoberta, no preço promocional da reserva online; quem usa a van fica no mínimo 3 diárias |

Em estadia longa a distância entre os dois grupos aumenta: nos parceiros Movepark, 30 diárias na vaga descoberta saem a partir de R$ 290,00, na Pare Seguro, o que dá R$ 9,67 por dia.

O preço do parceiro Movepark sai do motor de reservas, na tabela da Pare Seguro de 03/11/2026 e na do Aeropark de 13/11/2026, e fica sempre atualizado na [tabela de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos). Os valores dos estacionamentos sem reserva online vêm do site de cada um, conferidos em 26 de novembro de 2026; os do estacionamento oficial são de agosto de 2026. Podem mudar sem aviso.

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos).$f19$
   where id = 'c13eae75-0754-48c6-ba32-8319c84602c0' and md5(coalesce(body_md, '')) = '468035b56c0b15d91e5a4b8b3504df86';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-c13eae75.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-c13eae75.en · answer
  update public.faq_i18n set answer = $f20$The cheapest daily rate among the Movepark partners near Guarulhos Airport is Pare Seguro: R$ 18.90 a day for an uncovered spot, with a two-day minimum and the price locked at booking. On long stays you pay less per day: from 15 to 30 days the total is flat at R$ 290.00, which works out at R$ 9.67 a day over a month. At Aeropark the same spot costs R$ 132.30 for a week and R$ 537.00 for 30 days. Prices from the Movepark booking engine, on the Pare Seguro table of 3 November 2026 and the Aeropark table of 13 November 2026. Across the other lots in the table the entry daily rate runs from R$ 20.90 to R$ 40.80, checked on 26 November 2026, and the official car park from R$ 22.00 in the Economy sector to R$ 100.00 in the sectors next to the terminal, as researched in August 2026.$f20$
   where faq_id = 'c13eae75-0754-48c6-ba32-8319c84602c0' and locale = 'en' and md5(coalesce(answer, '')) = 'b8d0db3274d47d6b8ce8f1dc54fbb74e';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-c13eae75.en', 'answer'; end if;
  total := total + 1;

  -- faq-c13eae75.es · answer
  update public.faq_i18n set answer = $f21$La tarifa diaria más barata entre los socios de Movepark cerca del Aeropuerto de Guarulhos es la de Pare Seguro: R$ 18,90 por día en plaza descubierta, con mínimo de dos días y el precio cerrado al reservar. En estadías largas pagás menos por día: de 15 a 30 días el total es fijo en R$ 290,00, lo que da R$ 9,67 por día en el mes. En Aeropark la misma plaza cuesta R$ 132,30 la semana y R$ 537,00 en 30 días. Precios del motor de reservas de Movepark, según la tabla de Pare Seguro del 3 de noviembre de 2026 y la de Aeropark del 13 de noviembre de 2026. En los demás predios de la tabla la tarifa de entrada va de R$ 20,90 a R$ 40,80, según la consulta del 26 de noviembre de 2026, y el oficial entre R$ 22,00 en el sector Economy y R$ 100,00 en los sectores junto a la terminal, según el relevamiento de agosto de 2026.$f21$
   where faq_id = 'c13eae75-0754-48c6-ba32-8319c84602c0' and locale = 'es' and md5(coalesce(answer, '')) = '12ee60c524022c6c47dfd715f9ec9faa';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-c13eae75.es', 'answer'; end if;
  total := total + 1;

  -- faq-d92329d6.pt · answer
  update public.faq set answer = $f22$Existe no oficial: o GRU Airport mantém canal de mensalistas e cobra R$ 505,00 de 18 a 30 diárias no Standard, mais diária fixa de R$ 19,90 acima de 30. Na Movepark o que existe é a tabela por duração: nos parceiros a vaga descoberta sai a partir de R$ 290,00 em 30 diárias, ou R$ 9,67 por dia, na tabela da Pare Seguro de 3 de novembro de 2026.$f22$
   where id = 'd92329d6-e25b-4333-a903-c6674225a203' and md5(coalesce(answer, '')) = '3f7bb5d9998b8a50592ef7870d7c6080';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-d92329d6.pt', 'answer'; end if;
  total := total + 1;

  -- faq-d92329d6.pt · body_md
  update public.faq set body_md = $f23$## Mensal, ou 30 diárias?

São dois produtos diferentes e a confusão custa dinheiro. O estacionamento oficial do Aeroporto Internacional de São Paulo/Guarulhos (GRU) tem contrato de mensalista, com canal próprio de atendimento. A Movepark não tem mensalidade: o motor de reservas precifica a estadia por número de diárias, e 30 diárias é só mais uma duração na tabela.

### Quanto custa o mês em cada opção

| Opção | 30 dias | Por dia |
| --- | --- | --- |
| Pare Seguro, vaga descoberta | R$ 290,00 | R$ 9,67 |
| Pare Seguro, vaga coberta | R$ 350,00 | R$ 11,67 |
| Aeropark, vaga descoberta | R$ 537,00 | R$ 17,90 |
| Aeropark, vaga coberta | R$ 717,00 | R$ 23,90 |
| Oficial Standard, faixa de 18 a 30 diárias | R$ 505,00 | R$ 16,83 |
| Oficial Premium e Edifício Garagem | R$ 690,00 | R$ 23,00 |

Preços Movepark do motor de reservas, na tabela da Pare Seguro de 3 de novembro de 2026 e na do Aeropark de 13 de novembro de 2026. Preços do oficial na tabela de valores do GRU Airport, consultada em 17 de setembro de 2026.

### O que acontece acima de 30 dias

A tabela oficial trata o mês como teto e cobra por dia depois dele: pacote de 30 diárias mais diária fixa de R$ 19,90 no Standard e de R$ 22,90 no Premium. No parceiro, a diária de 30 dias é a última faixa publicada no índice de preços, então estadia maior pede consulta.

### A curva de desconto por duração

Na vaga descoberta da Pare Seguro o valor por dia fica em R$ 18,90 até 14 diárias e cai com o pacote fixo de 15 a 30.

| Duração | Total | Por dia |
| --- | --- | --- |
| 2 diárias | R$ 37,80 | R$ 18,90 |
| 7 diárias | R$ 132,30 | R$ 18,90 |
| 15 diárias | R$ 290,00 | R$ 19,33 |
| 20 diárias | R$ 290,00 | R$ 14,50 |
| 30 diárias | R$ 290,00 | R$ 9,67 |

Em 30 diárias o valor por dia chega a R$ 9,67, porque qualquer estadia de 15 a 30 diárias custa os mesmos R$ 290,00. Contra o pacote de R$ 505,00 do Standard, a Pare Seguro fica abaixo em toda a faixa de 18 a 30 diárias, com R$ 215,00 de diferença em qualquer duração dessa faixa. Tabela da Pare Seguro de 3 de novembro de 2026.

A conta por duração também está em [compensa deixar o carro mais dias no Aeroporto de Guarulhos](/faq/compensa-deixar-o-carro-mais-dias-no-aeroporto-de-guarulhos).$f23$
   where id = 'd92329d6-e25b-4333-a903-c6674225a203' and md5(coalesce(body_md, '')) = '238d267c5169d3bf0774a0c44b9898e3';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-d92329d6.pt', 'body_md'; end if;
  total := total + 1;

  -- faq-d92329d6.en · answer
  update public.faq_i18n set answer = $f24$There is at the official one: GRU Airport keeps a season-ticket channel and charges R$ 505.00 for 18 to 30 days in Standard, plus a flat R$ 19.90 a day beyond 30. At Movepark what exists is the per-duration table: at the partners an uncovered spot starts at R$ 290.00 over 30 days, or R$ 9.67 a day, on the Pare Seguro table of 3 November 2026.$f24$
   where faq_id = 'd92329d6-e25b-4333-a903-c6674225a203' and locale = 'en' and md5(coalesce(answer, '')) = 'aeac6fc9f9eda8ec83ec910bb07a8556';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-d92329d6.en', 'answer'; end if;
  total := total + 1;

  -- faq-d92329d6.es · answer
  update public.faq_i18n set answer = $f25$Sí, en el oficial: GRU Airport mantiene un canal de abonados y cobra R$ 505,00 de 18 a 30 días en Standard, más una tarifa fija de R$ 19,90 por día arriba de 30. En Movepark lo que existe es la tabla por duración: en los socios la plaza descubierta sale desde R$ 290,00 en 30 días, o R$ 9,67 por día, según la tabla de Pare Seguro del 3 de noviembre de 2026.$f25$
   where faq_id = 'd92329d6-e25b-4333-a903-c6674225a203' and locale = 'es' and md5(coalesce(answer, '')) = 'c5021dfc1fbcba5849d3cef3409b8589';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'faq-d92329d6.es', 'answer'; end if;
  total := total + 1;

  if total <> 25 then raise exception 'aerovalet: % de 25 campos gravados', total; end if;
end
$aerovalet$;
