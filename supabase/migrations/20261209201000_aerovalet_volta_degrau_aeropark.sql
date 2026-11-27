-- A Aerovalet volta (27/11/2026): três frases de degrau do Aeropark que a migration 20261209200000
-- trouxe do texto de manhã e que deixaram de valer na tabela dele de 13/11/2026. Nela, a coberta e a
-- descoberta do Aeropark mudam de faixa só aos 7 e aos 18 dias, e em nenhuma duração reservar mais
-- dias sai mais barato (18 diárias custam R$ 6,90 a mais que 17 na coberta e R$ 0,90 na descoberta).
-- As frases não tinham cifra, por isso escaparam do verificador de R$; foram achadas no HTML
-- publicado. Trava: campo inteiro com md5 do texto gravado pela 20261209200000.

do $degrau$
declare
  k int;
  total int := 0;
begin
  if not exists (select 1 from public.blog_post where id = '500504b8-b758-4229-b724-5a2860093520') then
    raise notice 'degrau aeropark: banco sem o acervo de 27/11/2026, nada a corrigir';
    return;
  end if;

  -- blog_post · 8a42c2dd · body_md
  update public.blog_post set body_md = $d0$O preço do estacionamento no Aeroporto de Guarulhos varia por faixa de permanência e por tipo de vaga, mas não por terminal. Na tabela de 28 de outubro de 2026, sete diárias saem a partir de R$ 83,30 na vaga descoberta e R$ 97,30 na coberta, no Aerovalet. Trinta diárias, a partir de R$ 207,00 e R$ 267,00. Abaixo está a tabela dos dois pátios parceiros, o valor por dia em cada faixa e a distância até cada terminal.

| Resposta rápida | Valor em 28/10/2026 |
| --- | --- |
| Menor diária avulsa | R$ 16,90, vaga descoberta do Aerovalet |
| Menor semana | R$ 83,30, ou R$ 11,90 por dia |
| Menor mês | R$ 207,00, ou R$ 6,90 por dia |
| Economia contra o oficial, 15 diárias | até R$ 431,50, ou 70,7% |
| Pátio mais perto do Terminal 1 | Aeropark, a 1,88 km |
| Pátios parceiros | 2 |

## Os pátios do Aeroporto Internacional de São Paulo/Guarulhos em números

> **Aeropark** fica a **1,88 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), declara traslado de **10 minutos**, com van a cada **30 minutos**, e cobra **R$ 132,30** por 7 diárias e **R$ 537,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e estadia mínima de **2 diárias**.

> **Pare Seguro** fica a **3,97 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), declara traslado de **10 minutos**, com van a cada **30 minutos**, e cobra **R$ 132,30** por 7 diárias e **R$ 290,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e estadia mínima de **2 diárias**.

> **Aerovalet** fica a **4,85 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), não declara o tempo de traslado na ficha, e cobra **R$ 16,90** na diária avulsa, **R$ 83,30** por 7 diárias e **R$ 207,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e sem estadia mínima declarada.

Distâncias medidas em linha reta no banco de dados com PostGIS. Traslado, frequência da van, tolerância e estadia mínima são declarados por cada unidade na própria ficha. Preços do motor de reservas, os mesmos do [índice de preços do Aeroporto Internacional de São Paulo/Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), que mostra a data de cada tabela.

## Qual é o preço do estacionamento no Aeroporto de Guarulhos hoje?

O Aeroporto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, fica em Guarulhos, na região metropolitana de São Paulo. É o aeroporto mais movimentado do Brasil. Ele tem dois pátios parceiros da Movepark, e a tabela abaixo é o que os dois cobram: o Aerovalet na tabela de 28 de outubro de 2026 (o valet dos dois pátios segue na de 19 de outubro) e o Aeropark na de 13 de novembro de 2026.

| Pátio e tipo de vaga | Distância do Terminal 1 | 1 diária | 7 diárias | 15 diárias | 30 diárias |
| --- | --- | --- | --- | --- | --- |
| Aerovalet, descoberta | 4,85 km | R$ 16,90 | R$ 83,30 | R$ 178,50 | R$ 207,00 |
| Aerovalet, coberta | 4,85 km | R$ 19,90 | R$ 97,30 | R$ 208,50 | R$ 267,00 |
| Aerovalet, valet | 4,85 km | R$ 119,20 | R$ 593,90 | R$ 692,90 | R$ 791,90 |
| Aeropark, descoberta | 1,88 km | mínimo de 2 diárias | R$ 132,30 | R$ 283,50 | R$ 537,00 |
| Aeropark, coberta | 1,88 km | mínimo de 2 diárias | R$ 174,30 | R$ 373,50 | R$ 717,00 |
| Aeropark, valet | 1,88 km | mínimo de 2 diárias | R$ 593,90 | R$ 692,90 | R$ 791,90 |

Três leituras sobre o preço do estacionamento no Aeroporto de Guarulhos saltam daí. Primeiro, o Aerovalet cobra menos que o Aeropark em todas as faixas, na vaga descoberta e na coberta, e no valet os dois cobram o mesmo a partir de duas diárias. Aí a escolha vira preço contra distância, porque o Aeropark fica mais perto dos terminais. Depois, o Aeropark só entra na conta a partir de duas diárias, porque é a permanência mínima que ele pratica, e quem viaja um dia só tem o Aerovalet. Por fim, a diferença entre os dois cresce com a estadia: na vaga descoberta são R$ 33,80 no Aerovalet contra R$ 39,80 no Aeropark em duas diárias, e R$ 207,00 contra R$ 537,00 em trinta.

O preço vivo fica no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), com a data da última atualização de cada tabela. É o mesmo número que o motor usa no fechamento. Ou seja, o que está na tela é o que sai na conta.

## Quanto sai o dia de estacionamento em Guarulhos em cada faixa?

Olhar só o total esconde a parte que decide. O preço do estacionamento no Aeroporto de Guarulhos não é linear. A diária cai conforme a estadia estica, e a queda segue até a faixa de trinta diárias no Aerovalet e até a de dezoito no Aeropark.

| Tipo de vaga | 7 diárias | 15 diárias | 30 diárias |
| --- | --- | --- | --- |
| Descoberta, Aerovalet | R$ 11,90 por dia | R$ 11,90 por dia | R$ 6,90 por dia |
| Descoberta, Aeropark | R$ 18,90 por dia | R$ 18,90 por dia | R$ 17,90 por dia |
| Coberta, Aerovalet | R$ 13,90 por dia | R$ 13,90 por dia | R$ 8,90 por dia |
| Coberta, Aeropark | R$ 24,90 por dia | R$ 24,90 por dia | R$ 23,90 por dia |
| Valet, nos dois pátios | R$ 84,84 por dia | R$ 46,19 por dia | R$ 26,40 por dia |

Valores do Aerovalet na tabela de 28 de outubro de 2026 (o valet dos dois pátios segue na de 19 de outubro) e do Aeropark na de 13 de novembro de 2026. No valet os dois pátios cobram o mesmo, e nas vagas o Aerovalet cobra menos em todas as faixas. Repare que a queda não para na primeira semana. A tabela das vagas muda de faixa aos 7, aos 17 e aos 30 dias no Aerovalet, e aos 7 e aos 18 no Aeropark, na tabela dele de 13 de novembro de 2026. Portanto, o valor por dia continua caindo até a última. Na vaga descoberta do Aerovalet são R$ 16,90 por dia de uma a seis diárias, R$ 11,90 de sete a dezesseis, R$ 8,90 de dezessete a vinte e nove e R$ 6,90 a partir de trinta. A diária avulsa não tem mais valor próprio: segue o da faixa de uma a seis.

O degrau de preço tem uma consequência prática que quase ninguém aproveita: em alguns pontos da tabela, ficar mais dias custa menos. Na vaga descoberta do Aerovalet, seis diárias saem por R$ 101,40 e sete por R$ 83,30. Dezesseis saem por R$ 190,40 e dezessete por R$ 151,30. Vinte e nove saem por R$ 258,10 e trinta por R$ 207,00. Na coberta do Aerovalet, os mesmos pontos vão de R$ 119,40 para R$ 97,30, de R$ 222,40 para R$ 185,30 e de R$ 316,10 para R$ 267,00. No Aerovalet a vantagem começa alguns dias antes de cada virada: na descoberta, viagem de 5 ou 6 dias já paga mais que sete diárias, de 13 a 16 dias paga mais que dezessete e de 24 a 29 paga mais que trinta. No Aeropark não há ponto assim: nas duas vagas, dezoito diárias custam mais que dezessete. Se a sua volta cai nos dias antes de um desses degraus, reservar até a virada da faixa sai mais barato que o período curto.

## Por que a diária de estacionamento em Guarulhos cai quando a estadia estica?

Não é promoção. Na prática, o preço do estacionamento no Aeroporto de Guarulhos é montado por faixa. O motor de preço da Movepark trabalha com faixas de permanência, e cada faixa tem um valor por dia próprio. Quando a estadia cruza de uma faixa para a outra, o valor por dia inteiro muda, e não só o dia adicional.

Na prática, o pátio ganha em previsibilidade de ocupação. Uma vaga fechada por trinta dias vale mais para quem opera do que trinta vagas fechadas por um dia. Não tem rotatividade, não tem manobra e não tem risco de o carro não aparecer. Parte desse ganho volta como desconto na faixa longa.

O efeito colateral é a viagem curta. Nas vagas descoberta e coberta, a faixa de até seis diárias tem o valor por dia mais alto da tabela. No Aerovalet, a diária avulsa da descoberta custa o mesmo valor por dia da faixa de duas a seis diárias (R$ 16,90), e no Aeropark ela nem existe. Quem viaja dois ou três dias paga o valor mais alto da tabela, então resta comparar os dois pátios.

## Quanto a tabela de balcão custa a mais?

Os dois parceiros publicam duas tabelas. A de balcão é cobrada de quem chega sem reservar. A online é mais baixa. Não é promoção: são preços diferentes para o mesmo serviço, e a diferença é conhecida com antecedência.

| Tipo de vaga | Balcão, 7 diárias | Online, 7 diárias | Diferença |
| --- | --- | --- | --- |
| Descoberta, Aerovalet | R$ 99,96 | R$ 83,30 | R$ 16,66 |
| Descoberta, Aeropark | R$ 158,76 | R$ 132,30 | R$ 26,46 |
| Coberta, Aerovalet | R$ 116,76 | R$ 97,30 | R$ 19,46 |
| Coberta, Aeropark | R$ 209,16 | R$ 174,30 | R$ 34,86 |
| Valet, nos dois pátios | R$ 742,38 | R$ 593,90 | R$ 148,48 |

A diferença fica em torno de 17% nas vagas e 20% no valet, medida nas tabelas vigentes (Aerovalet de 28 de outubro de 2026, Aeropark de 13 de novembro de 2026 e valet de 19 de outubro de 2026). Em percentual, ela é igual nos dois pátios. Ela também cresce junto com a estadia. Em trinta diárias na vaga descoberta do Aerovalet, os mesmos 17% viram R$ 41,40, porque o total de balcão é R$ 248,40 contra R$ 207,00 da tabela online.

O valet tem margem ainda maior. A diária avulsa de valet no Aerovalet sai por R$ 149,00 no balcão e R$ 119,20 na tabela online. São 20% de diferença.

Se o objetivo é chegar no menor total possível, o caminho completo está em [como estacionar barato no Aeroporto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/). Inclusive, o menor valor da praça fica sempre visível na página do [estacionamento mais barato do aeroporto](/estacionamentos/aeroporto-guarulhos/mais-barato).

## O preço do estacionamento no Aeroporto de Guarulhos muda por terminal?

Não. A tarifa é do pátio, e não do terminal. Então estacionar para embarcar no Terminal 3 custa exatamente o mesmo que estacionar para embarcar no Terminal 1. O que muda por terminal é a distância e o trajeto da van. E isso muda bastante em um dos dois pátios.

| Pátio | Terminal 1 | Terminal 2 | Terminal 3 | Diferença entre T1 e T3 |
| --- | --- | --- | --- | --- |
| Aeropark | 1,88 km | 2,65 km | 3,06 km | 1,18 km |
| Aerovalet | 4,85 km | 4,87 km | 5,00 km | 0,15 km |

Distâncias calculadas no banco de dados da Movepark, em linha reta até cada terminal. Ou seja, os três terminais estão cadastrados como pontos próprios. Quem compara estacionamento em Guarulhos costuma olhar só a quilometragem, e ela conta menos do que parece.

A leitura é direta. Primeiro, no Aeropark, o terminal importa: o Terminal 3 fica 63% mais longe que o Terminal 1. É mais de um quilômetro a mais dentro da van. No Aerovalet, o terminal é indiferente, porque os três estão dentro de uma faixa de 150 metros. Nenhum passageiro sente essa diferença.

O quilômetro extra pesa mais do que parece. O Terminal 3 concentra a maior parte dos voos internacionais de Guarulhos, ou seja, é o terminal de quem mais deixa carro parado por muitos dias. Quem embarca no Terminal 3 e escolhe o Aeropark deve somar o quilômetro extra ao planejamento, principalmente em horário de pico.

### O ponto em que a van encosta importa mais que a distância

A pergunta que fica de pé é outra, e quase ninguém responde. Não é qual pátio fica mais perto. É onde a van encosta na volta.

O ponto de desembarque varia por terminal e por horário, em qualquer pátio. Atravessar entre terminais de Guarulhos com bagagem custa mais tempo do que o quilômetro de diferença entre os dois lotes. Por isso, confirme o ponto de encontro na chegada, antes de embarcar, e anote.

## Quanto se economiza contra o estacionamento oficial do GRU Airport?

O estacionamento oficial fica dentro do complexo, com acesso a pé ao terminal, e é operado pela Indigo. Contudo, a tarifa dele não passa pelo motor da Movepark. Por isso ela foi lida à mão na tabela que o operador publica, conferida em 17 de setembro de 2026.

A tabela dele cobra por faixa de permanência, e não por diária. No setor **Standard, que atende os Terminais 1 e 2**, a faixa de 11 a 17 diárias custa **R$ 480,00**, e a de 18 a 30 diárias, **R$ 505,00**. No **Premium e no edifício garagem, que atendem os Terminais 2 e 3**, as mesmas faixas custam **R$ 610,00** e **R$ 690,00**. O Terminal 3 não tem setor Standard, então quem embarca lá começa a comparar de um patamar mais alto.

Assim, a comparação abaixo coloca o preço do estacionamento no Aeroporto de Guarulhos ao lado do oficial. São as mesmas 15 diárias, do mais barato ao mais caro, com o Aerovalet na tabela de 28 de outubro de 2026, o Aeropark na de 13 de novembro de 2026, o valet na de 19 de outubro de 2026 e o oficial na de 17 de setembro de 2026.

| Opção, 15 diárias | Total | Por dia | Contra o oficial dos Terminais 1 e 2 |
| --- | --- | --- | --- |
| Aerovalet, descoberta | R$ 178,50 | R$ 11,90 | R$ 301,50 a menos |
| Aerovalet, coberta | R$ 208,50 | R$ 13,90 | R$ 271,50 a menos |
| Aeropark, descoberta | R$ 283,50 | R$ 18,90 | R$ 196,50 a menos |
| Aeropark, coberta | R$ 373,50 | R$ 24,90 | R$ 106,50 a menos |
| Oficial, Terminais 1 e 2, Standard | R$ 480,00 | R$ 32,00 | referência |
| Oficial, Terminais 2 e 3, Premium ou edifício garagem | R$ 610,00 | R$ 40,67 | R$ 130,00 a mais |
| Aerovalet ou Aeropark, valet | R$ 692,90 | R$ 46,19 | R$ 212,90 a mais |

Então, em quinze diárias, a vaga descoberta do Aerovalet sai por 62,8% menos que o oficial dos Terminais 1 e 2. Contra o Premium e o edifício garagem, que são as opções dos Terminais 2 e 3, a diferença chega a 70,7%. Em reais, são R$ 301,50 e R$ 431,50 na mesma viagem. No Aeropark, a mesma vaga fica R$ 196,50 abaixo do Standard, ou 40,9%.

### Onde o oficial ganha de quem estaciona em Guarulhos?

Duas linhas dessa tabela desmentem a ideia de que o pátio externo ganha sempre. Elas ficam aqui de propósito.

O valet dos parceiros custa R$ 212,90 a mais que o oficial Standard em quinze diárias, e R$ 82,90 a mais que o Premium. E o oficial resolve a permanência de poucas horas sem traslado no meio do caminho, o que economiza tempo de quem vai ficar meio dia no aeroporto. Em dinheiro, porém, ele não ganha nem nessa faixa: a primeira hora custa R$ 31,00 no Standard e R$ 38,00 no Premium, acima da diária avulsa de R$ 16,90 do Aerovalet.

Em trinta diárias, o oficial Standard fica abaixo das duas vagas do Aeropark. Ele cobra R$ 505,00 pela faixa de 18 a 30 diárias (tabela de 17 de setembro de 2026), R$ 32,00 a menos que a descoberta do Aeropark (R$ 537,00) e R$ 212,00 a menos que a coberta do Aeropark (R$ 717,00), as duas na tabela de 13 de novembro de 2026. As duas vagas do Aerovalet seguem abaixo do Standard no mês, na tabela de 28 de outubro de 2026: a descoberta, a R$ 207,00, com R$ 298,00 de diferença, e a coberta, a R$ 267,00, com R$ 238,00. Contra o Premium (R$ 690,00), a coberta do Aeropark também fica R$ 27,00 acima.

Três ressalvas honestas sobre esses números do oficial:

- **Eles não saem do motor da Movepark.** São coleta manual na página do operador, com a data ao lado, e podem mudar sem aviso. A tabela completa do aeroporto é publicada como imagem, o que dificulta a conferência automática.
- **Os R$ 480,00 são o pacote de 11 a 17 diárias**, e não o que paga quem fica poucas horas. Na mesma tabela, uma diária avulsa custa R$ 79,00 no Standard e R$ 107,00 no Premium.
- **Setor e disponibilidade mudam o valor.** O oficial tem Standard, Premium e edifício garagem, com preços diferentes, e a vaga está sujeita a disponibilidade.

Antes de decidir, confira a tarifa oficial no próprio aeroporto. O que a Movepark garante é o próprio número: o preço dos parceiros nesta página é o mesmo que o motor cobra no fechamento.

## O preço do estacionamento no Aeroporto de Guarulhos, pátio por pátio

### Aeropark, o mais perto dos terminais

O Aeropark fica na R. Joaquina de Jesus, 745, Parque Santo Agostinho, em Guarulhos. Ele é o mais próximo dos dois, ou seja, 1,88 km do Terminal 1, 2,65 km do Terminal 2 e 3,06 km do Terminal 3.

O Aeropark opera 24 horas. A ficha declara traslado de 10 minutos até o terminal, com van a cada 30 minutos. A tolerância declarada é de 60 minutos, o que dá folga quando o voo atrasa um pouco na volta. Ele também trabalha com permanência mínima de 2 diárias nos três tipos de vaga, então não atende quem vai deixar o carro por algumas horas.

A ficha da unidade ainda declara câmeras 24 horas, portaria controlada, estacionamento segurado, seguro voo, atendimento 24 horas, área de espera, banheiros, Wi-Fi, acessibilidade PCD, transfer gratuito e valet.

Em 19 de outubro de 2026, sete diárias na vaga descoberta custavam R$ 139,30. Trinta diárias custavam R$ 537,00.

### Aerovalet, o único que aceita um dia

O Aerovalet fica na Av. Novo Brasil, 954, Cidade Industrial Satélite de São Paulo, em Guarulhos. Está a 4,85 km do Terminal 1, 4,87 km do Terminal 2 e 5,00 km do Terminal 3. Ou seja, praticamente à mesma distância dos três.

O Aerovalet opera 24 horas, com tolerância declarada de 60 minutos. Também é o único dos dois que aceita estadia de um dia, o que resolve bate e volta. A ficha lista transfer gratuito entre os serviços, mas não declara o tempo de traslado nem a frequência da van. Por isso, confirme o deslocamento na chegada.

Os demais serviços declarados são câmeras 24 horas, portaria controlada, capa de proteção, seguro voo, atendimento 24 horas, área de espera, banheiros e valet.

Na tabela de 28 de outubro de 2026 o Aerovalet tem a menor diária avulsa da praça, R$ 16,90 na vaga descoberta. Na semana e no mês ele também sai mais barato que o Aeropark (tabela de 13 de novembro de 2026): na vaga descoberta, R$ 83,30 contra R$ 132,30 em sete diárias e R$ 207,00 contra R$ 537,00 em trinta.

## Vaga descoberta, coberta ou valet: quanto cada uma custa

Os dois pátios operam os três tipos. O preço muda bastante de um tipo para o outro, então vale entender o que cada um entrega antes de olhar o número.

- **Descoberta:** a vaga a céu aberto, e sempre o piso da tabela. O carro fica exposto a sol, chuva e granizo.
- **Coberta:** protege de sol e granizo, que é o que descasca pintura e amassa capô em pátio de aeroporto. Custa R$ 14,00 a mais na semana no Aerovalet, na tabela de 28 de outubro de 2026, e R$ 42,00 a mais no Aeropark, na de 13 de novembro de 2026.
- **Valet:** você entrega o carro e a equipe manobra. Serve a quem chega em cima da hora, ou não quer procurar vaga com a família e a bagagem dentro do carro.

### O valet chega a ficar mais barato que a vaga coberta?

Por fim, este é o ponto que quase ninguém publica.

| Faixa | Coberta | Valet | Diferença |
| --- | --- | --- | --- |
| 1 diária, Aerovalet | R$ 19,90 | R$ 119,20 | R$ 99,30 |
| 7 diárias, Aerovalet | R$ 97,30 | R$ 593,90 | R$ 496,60 |
| 7 diárias, Aeropark | R$ 174,30 | R$ 593,90 | R$ 419,60 |
| 15 diárias, Aerovalet | R$ 208,50 | R$ 692,90 | R$ 484,40 |
| 15 diárias, Aeropark | R$ 373,50 | R$ 692,90 | R$ 319,40 |
| 30 diárias, Aerovalet | R$ 267,00 | R$ 791,90 | R$ 524,90 |
| 30 diárias, Aeropark | R$ 717,00 | R$ 791,90 | R$ 74,90 |

Não, em nenhuma faixa. Com a coberta do Aerovalet na tabela de 28 de outubro de 2026 e o resto na de 19 de outubro de 2026, a coberta sai na frente da diária avulsa ao mês inteiro, nos dois pátios. A diferença sobe e desce conforme os pacotes do valet, e só no Aeropark encolhe no fim do mês. No Aeropark a coberta chega mais perto: em trinta diárias ela fica R$ 74,90 abaixo do valet, contra R$ 524,90 no Aerovalet.

O motivo, na verdade, é a estrutura da tabela. O valet cobra caro pela manobra na diária avulsa e achata rápido em estadia longa, de R$ 119,20 por dia para R$ 26,40 em trinta diárias. Afinal, a manobra acontece duas vezes, na entrada e na saída, e não uma vez por dia. Só que a vaga coberta também fica barata por dia na estadia longa, R$ 8,90 no Aerovalet e R$ 23,90 no Aeropark em trinta diárias, então hoje o valet se escolhe pela conveniência.

## A permanência mínima muda a conta de quem estaciona em Guarulhos por pouco tempo

O Aeropark cobra no mínimo 2 diárias em todos os tipos de vaga. O Aerovalet não tem mínimo. Portanto, isso cria três cenários bem diferentes.

Para viagem de um dia, só existe o Aerovalet entre os parceiros, a R$ 16,90 na vaga descoberta na tabela de 28 de outubro de 2026. Já para bate e volta de poucas horas, o oficial ganha em tempo, porque não tem van no meio do caminho. Em dinheiro ele não ganha: a primeira hora dele custa R$ 31,00 no Standard, acima da diária avulsa do Aerovalet.

Para viagem de dois dias, os dois entram. Mas o Aeropark cobra as duas diárias cheias, mesmo que você retire o carro no fim do primeiro dia. Então vale conferir se o total compensa o quilômetro a menos de traslado.

Para viagem de uma semana ou mais, a permanência mínima deixa de ser um fator. A decisão vira preço contra distância.

## O que somar além do preço?

O preço do estacionamento no Aeroporto de Guarulhos não é a conta inteira. Três blocos de tempo entram na decisão, e quase ninguém coloca na planilha:

- **Espera pela van.** O Aeropark declara van a cada 30 minutos. Chegar logo depois de uma saída significa meia hora parado no pátio, antes dos 10 minutos de traslado.
- **O traslado em si.** São dez minutos declarados no Aeropark, mais o quilômetro extra se o seu embarque for no Terminal 3.
- **A tolerância.** Os dois pátios declaram 60 minutos. É a folga que absorve voo atrasado sem virar diária nova.

Somados, dê algo em torno de 40 minutos entre entrar no pátio e desembarcar no terminal. Esse bloco entra antes do prazo de check-in da companhia, e não depois.

Perguntas gerais sobre a praça têm resposta própria e ficam fora deste texto de propósito. É o caso de [saber se o estacionamento em Guarulhos oferece traslado até o terminal](/faq/o-estacionamento-em-guarulhos-oferece-traslado-ate-o-terminal) e do [que acontece quando o voo atrasa](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-guarulhos-gru).

## Como estes preços foram apurados?

Todo preço do estacionamento no Aeroporto de Guarulhos praticado por parceiro saiu do motor de reservas da Movepark: os do Aerovalet na tabela de **28 de outubro de 2026** (o valet dos dois pátios segue na de 19 de outubro) e os do Aeropark na de **13 de novembro de 2026**. São os mesmos que aparecem na [página do Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos). Para esses valores não há estimativa nem número de terceiro: é a mesma tabela que o motor usa para fechar uma reserva.

Há uma única exceção, e ela está marcada no texto. A tarifa do estacionamento oficial não passa pelo motor, então foi lida à mão na tabela que o operador publica como imagem, conferida em 17 de setembro de 2026. É o único número desta página que a Movepark não apura, e ele pode mudar sem aviso.

Cada parceiro define a própria tabela e pode mudá-la a qualquer momento. Por isso o retrato acima vale para a data indicada, e por isso toda cifra aqui carrega a data ao lado, mais um link para o preço vivo.

As distâncias são calculadas no banco de dados com PostGIS, em linha reta entre o pátio e cada terminal, a partir das coordenadas cadastradas dos dois lados. Já o tempo de traslado, a frequência da van, a tolerância e a lista de serviços são declarados por cada unidade na própria ficha. É assim que aparecem aqui: como declaração da unidade, e não como promessa da Movepark.

Para entender o que separa um pátio do outro além do preço, o [guia com as opções de estacionamento no Aeroporto de Guarulhos](/blog/guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024/) compara os dois lado a lado. Já a comparação por distância está no post sobre [estacionamento próximo ao Aeroporto Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/). Os números de movimentação do aeroporto saem no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Quanto custa uma semana em cada tipo de vaga em Guarulhos?

Na tabela de 28 de outubro de 2026, sete diárias no Aerovalet saem por R$ 83,30 na vaga descoberta e R$ 97,30 na coberta, e o valet segue em R$ 593,90 (tabela de 19 de outubro). No Aeropark, na tabela de 13 de novembro de 2026, são R$ 132,30 na descoberta e R$ 174,30 na coberta, e os mesmos R$ 593,90 no valet, que segue na de 19 de outubro. Nas vagas, a semana sai mais barata no Aerovalet.

### Quanto custa um mês de estacionamento em Guarulhos?

Trinta diárias no Aerovalet saem por R$ 207,00 na vaga descoberta e R$ 267,00 na coberta, na tabela de 28 de outubro de 2026. No Aeropark, na de 13 de novembro de 2026, são R$ 537,00 e R$ 717,00. No valet, R$ 791,90 nos dois pátios. A média diária do mais barato fica em R$ 6,90.

### Quanto se economiza contra o estacionamento oficial de Guarulhos?

Em quinze diárias, até R$ 301,50 na vaga descoberta do Aerovalet, ou 62,8%. A tabela do oficial cobra R$ 480,00 pela faixa de 11 a 17 diárias no setor Standard, conferida em 17 de setembro de 2026, contra R$ 178,50 no Aerovalet, na tabela de 28 de outubro de 2026, e R$ 283,50 no Aeropark, na de 13 de novembro de 2026. Em trinta diárias, as duas vagas do Aerovalet (R$ 207,00 na descoberta e R$ 267,00 na coberta) seguem abaixo dos R$ 505,00 do Standard.

### O preço muda se eu embarcar no Terminal 3 de Guarulhos?

Não. A tarifa é do pátio e não do terminal, então o valor é o mesmo nos três. O que muda é a distância. O Aeropark fica 1,18 km mais longe do Terminal 3 que do Terminal 1, enquanto no Aerovalet a diferença entre os três terminais é de apenas 150 metros.

### Vale a pena o valet em estadia longa em Guarulhos?

O valet fica bem mais barato por dia conforme a estadia estica, de R$ 119,20 na diária avulsa para R$ 26,40 em trinta diárias, em 19 de outubro de 2026. Ainda assim não alcança a vaga coberta, que sai por R$ 8,90 por dia no Aerovalet (tabela de 28 de outubro de 2026) e R$ 23,90 no Aeropark no mesmo período. Em quinze diárias o valet também custa mais que o oficial, no Standard e no Premium. O valet se escolhe por conveniência.

### Como o valor da diária em Guarulhos cai conforme a estadia estica?

A tabela das vagas tem quatro faixas. Na vaga descoberta do Aerovalet, na tabela de 28 de outubro de 2026, são R$ 16,90 por dia de uma a seis diárias, R$ 11,90 de sete a dezesseis, R$ 8,90 de dezessete a vinte e nove e R$ 6,90 a partir de trinta. A maior queda vem aos sete dias, e a diária avulsa não tem mais valor próprio: segue o da faixa de uma a seis.

### Dá para estacionar no Aeroporto de Guarulhos por só um dia?

Dá, mas só em um dos dois parceiros. O Aeropark cobra no mínimo 2 diárias em todos os tipos de vaga, e o Aerovalet não tem permanência mínima. Na tabela de 28 de outubro de 2026, a diária avulsa na vaga descoberta do Aerovalet sai por R$ 16,90.

### Onde consultar a tabela atualizada de Guarulhos?

No índice de preços da Movepark, que publica o valor por faixa de permanência com a data da última atualização de cada tabela. É o mesmo número que o motor cobra no fechamento, então o que está na tela é o que sai na conta.
$d0$
   where id = '8a42c2dd-4462-4b5b-885a-2dc7ae189a26' and md5(coalesce(body_md, '')) = '4c9ae94011867ea80ea68624c12a3a20';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'degrau aeropark: % mudou', '8a42c2dd'; end if;
  total := total + 1;

  -- blog_post · 500504b8 · body_md
  update public.blog_post set body_md = $d1$Estacionar barato no Aeroporto de Guarulhos depende de cinco decisões, e elas não valem a mesma coisa. Numa viagem de quinze dias, com o Aerovalet na tabela de 28 de outubro de 2026 e o oficial na de 17 de setembro de 2026, sair do estacionamento oficial devolve R$ 301,50. Trocar o Aeropark pelo Aerovalet devolve R$ 105,00, reservar pela tabela online devolve R$ 35,70 e escolher vaga descoberta devolve R$ 30,00. Acertar o degrau da tabela, reservando dezessete diárias, devolve mais R$ 27,20. Abaixo está cada decisão com o número, o que ela cobra e as armadilhas do caminho.

| Resposta rápida | Em 28/10/2026 |
| --- | --- |
| Menor diária avulsa | R$ 16,90, vaga descoberta do Aerovalet |
| Menor semana | R$ 83,30, ou R$ 11,90 por dia, no Aerovalet |
| Menor quinzena | R$ 178,50, ou R$ 11,90 por dia (17 diárias saem por R$ 151,30) |
| Menor mês | R$ 207,00, ou R$ 6,90 por dia |
| Decisão que mais devolve | sair do oficial, R$ 301,50 em 15 diárias |
| Armadilha que ninguém avisa | voltar na véspera de um degrau da tabela |

![Vagas descobertas de quem quer estacionar barato em Guarulhos, com demarcação no asfalto](/images/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/estacionar-barato-guarulhos-vaga-descoberta.webp)

## Os pátios do Aeroporto Internacional de São Paulo/Guarulhos em números

> **Aeropark** fica a **1,88 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), declara traslado de **10 minutos**, com van a cada **30 minutos**, e cobra **R$ 132,30** por 7 diárias e **R$ 537,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e estadia mínima de **2 diárias**.

> **Pare Seguro** fica a **3,97 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), declara traslado de **10 minutos**, com van a cada **30 minutos**, e cobra **R$ 132,30** por 7 diárias e **R$ 290,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e estadia mínima de **2 diárias**.

> **Aerovalet** fica a **4,85 km** do Terminal 1 do Aeroporto Internacional de São Paulo/Guarulhos (GRU), não declara o tempo de traslado na ficha, e cobra **R$ 16,90** na diária avulsa, **R$ 83,30** por 7 diárias e **R$ 207,00** por 30 na vaga descoberta, em novembro de 2026. Opera 24 horas com tolerância de **60 minutos** e sem estadia mínima declarada.

Distâncias medidas em linha reta no banco de dados com PostGIS. Traslado, frequência da van, tolerância e estadia mínima são declarados por cada unidade na própria ficha. Preços do motor de reservas, os mesmos do [índice de preços do Aeroporto Internacional de São Paulo/Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), que mostra a data de cada tabela.

## Qual é o menor preço para estacionar no Aeroporto de Guarulhos em cada duração?

O Aeroporto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, fica em Guarulhos, na região metropolitana de São Paulo. Ele tem dois pátios parceiros da Movepark, o Aeropark e o Aerovalet. A tabela abaixo mostra o menor total por duração e quem pratica cada um, na tabela do Aerovalet de 28 de outubro de 2026.

| Duração | Menor total | Por dia | Quem pratica |
| --- | --- | --- | --- |
| 1 diária | R$ 16,90 | R$ 16,90 | Aerovalet, descoberta. O Aeropark não aceita um dia |
| 2 diárias | R$ 33,80 | R$ 16,90 | Aerovalet, descoberta |
| 5 diárias | R$ 84,50 | R$ 16,90 | Aerovalet, descoberta |
| 7 diárias | R$ 83,30 | R$ 11,90 | Aerovalet, descoberta |
| 13 diárias | R$ 154,70 | R$ 11,90 | Aerovalet, descoberta |
| 15 diárias | R$ 178,50 | R$ 11,90 | Aerovalet, descoberta |
| 18 diárias | R$ 160,20 | R$ 8,90 | Aerovalet, descoberta |
| 30 diárias | R$ 207,00 | R$ 6,90 | Aerovalet, descoberta |

Duas coisas saltam da tabela. Primeiro, o menor total é sempre do Aerovalet: desde a revisão de 19 de outubro de 2026 ele fica abaixo do Aeropark em todas as durações e nos dois tipos de vaga, e continua assim com a tabela do Aeropark de 13 de novembro de 2026, então o nome do pátio pesa no preço. Segundo, a diária avulsa do Aerovalet deixou de ter preço próprio: um dia custa os mesmos R$ 16,90 da faixa de duas a seis diárias. O degrau da tabela, em que ficar mais dias custa menos, ficou largo: sete diárias saem mais baratas que cinco, e dezoito mais baratas que quinze. Ele vale uma seção inteira mais abaixo.

A tabela completa por pátio e por tipo de vaga está no [post de preço do estacionamento em Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/). O menor valor do momento fica na página do [estacionamento mais barato do aeroporto](/estacionamentos/aeroporto-guarulhos/mais-barato), e o preço vivo no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos).

## Quais decisões mais economizam no estacionamento de Guarulhos?

Quase toda lista de dicas coloca as decisões lado a lado, como se valessem o mesmo. Elas não valem. A tabela abaixo mede cada uma na mesma estadia de quinze diárias, com o Aerovalet na tabela de 28 de outubro de 2026, o Aeropark na de 13 de novembro de 2026 e o oficial na de 17 de setembro de 2026, porque comparar uma economia de sete dias com outra de trinta infla a maior e some com a menor.

| Decisão | De | Para | Devolve |
| --- | --- | --- | --- |
| Sair do estacionamento oficial | R$ 480,00 | R$ 178,50 | **R$ 301,50** |
| Escolher o Aerovalet em vez do Aeropark | R$ 283,50 | R$ 178,50 | **R$ 105,00** |
| Reservar pela tabela online em vez do balcão | R$ 214,20 | R$ 178,50 | **R$ 35,70** |
| Escolher vaga descoberta em vez de coberta | R$ 208,50 | R$ 178,50 | **R$ 30,00** |
| Acertar o degrau da tabela | R$ 178,50 | R$ 151,30 | **R$ 27,20** |

Portanto, três leituras sobre como estacionar barato no Aeroporto de Guarulhos saem daí.

A primeira: **uma decisão vale mais que as outras juntas.** Sair de dentro do aeroporto devolve R$ 301,50, mais que as outras quatro somadas. Esse valor supõe a vaga descoberta do Aerovalet na tabela online, e a escada mais abaixo mostra quanto sobra com outra escolha.

A segunda: **tipo de vaga e tabela online ficam perto.** No Aerovalet, em quinze diárias, a vaga descoberta devolve R$ 30,00 e a tabela online, R$ 35,70. Ou seja, reservar a vaga coberta pela tabela online custa R$ 5,70 a menos que chegar no balcão e parar na descoberta.

A terceira: **escolher o pátio virou a segunda decisão que mais devolve.** Até agosto de 2026 o Aerovalet saía R$ 3,00 por dia abaixo do Aeropark. Na revisão de setembro as duas tabelas ficaram iguais de sete diárias em diante. Na de 19 de outubro, o Aerovalet passou a cobrar menos em todas as durações e nos dois tipos de vaga, e na de 28 de outubro a diferença chegou a R$ 105,00 na quinzena da vaga descoberta.

### Decisão 1: sair do estacionamento oficial de Guarulhos

É a que mais devolve, com folga, para quem quer estacionar barato no Aeroporto de Guarulhos. O estacionamento oficial fica dentro do complexo, com acesso a pé ao terminal, e é operado pela Indigo. Ele cobra pela proximidade.

A tarifa dele não passa pelo motor da Movepark. Por isso foi lida à mão na tabela que o operador publica, conferida em 17 de setembro de 2026. Ela cobra por faixa de permanência: no setor Standard, que atende os Terminais 1 e 2, a faixa de 11 a 17 diárias custa R$ 480,00. No Premium e no edifício garagem, que atendem os Terminais 2 e 3, a mesma faixa custa R$ 610,00, e o Terminal 3 não tem Standard.

Uma viagem de quinze dias cai na faixa de 11 a 17 diárias, então paga R$ 480,00 no Standard. A vaga descoberta do Aerovalet sai por R$ 178,50 na tabela de 28 de outubro de 2026. São R$ 301,50 de diferença, ou 63%. Contra os R$ 610,00 do Premium e do edifício garagem, que são as opções de quem embarca no Terminal 3, a diferença sobe para R$ 431,50. No Aeropark, a mesma vaga sai por R$ 283,50, R$ 196,50 abaixo do Standard.

**O que ela cobra em troca:** o traslado. Você deixa de andar até o terminal e passa a depender da van. No Aeropark, a ficha declara 10 minutos de trajeto e van a cada 30 minutos. Se a viagem é de poucas horas, o oficial ganha em tempo, porque não tem van no meio do caminho. Em dinheiro ele não ganha nem aí: a primeira hora no Standard custa R$ 31,00, acima da diária avulsa de R$ 16,90 do Aerovalet.

### Decisão 2: escolher a vaga descoberta

Em quinze diárias no Aerovalet, a vaga coberta custa R$ 208,50 e a descoberta R$ 178,50, na tabela de 28 de outubro de 2026. São R$ 30,00 pelo mesmo endereço, o mesmo portão e a mesma equipe. Muda o teto sobre o carro. No Aeropark, a mesma troca vale R$ 105,00, na tabela de 13 de novembro de 2026.

Além disso, em trinta diárias no Aerovalet a diferença cresce para R$ 60,00, de R$ 267,00 para R$ 207,00. Por dia, são R$ 2,00. No Aeropark, são R$ 6,00 por dia.

**O que ela cobra em troca:** exposição a sol, chuva e granizo. Em pátio de aeroporto, o granizo é o que preocupa, porque amassa capô e quebra vidro. No Aerovalet, com a diferença em R$ 2,00 por dia no mês, a cobertura ainda pesa pouco para quem tem carro novo ou pintura escura.

### Decisão 3: reservar pela tabela online

Os dois parceiros publicam duas tabelas. A de balcão vale para quem chega sem reservar, e a online fica em torno de 17% abaixo nas vagas descoberta e coberta, e 20% no valet.

| Tipo de vaga | Balcão, 15 diárias | Online, 15 diárias | Devolve |
| --- | --- | --- | --- |
| Descoberta, Aerovalet | R$ 214,20 | R$ 178,50 | R$ 35,70 |
| Descoberta, Aeropark | R$ 340,20 | R$ 283,50 | R$ 56,70 |
| Coberta, Aerovalet | R$ 250,20 | R$ 208,50 | R$ 41,70 |
| Coberta, Aeropark | R$ 448,20 | R$ 373,50 | R$ 74,70 |
| Valet, nos dois pátios | R$ 866,13 | R$ 692,90 | R$ 173,23 |

Valores do Aerovalet na tabela de 28 de outubro de 2026 (o valet dos dois pátios segue na de 19 de outubro) e do Aeropark na de 13 de novembro de 2026. Em trinta diárias na vaga descoberta do Aerovalet, os mesmos 17% viram R$ 41,40, de R$ 248,40 para R$ 207,00.

**O que ela cobra em troca:** planejamento. Ou seja, você precisa saber a data de volta antes de sair de casa. Por outro lado, é a única decisão desta lista que não troca nada no carro nem no trajeto.

### Decisão 4: acertar o degrau da tabela

Acertar o degrau é a decisão que quase ninguém conhece, e a próxima seção mostra em que viagens ela vale. Na quinzena, ela devolve R$ 27,20: dezessete diárias custam R$ 151,30 na vaga descoberta do Aerovalet, menos que as quinze (R$ 178,50). No Aerovalet, o degrau aparece na véspera de sete, de dezessete e de trinta diárias.

**O que ela cobra em troca:** nada no preço, porque você paga menos. O que ela exige é conferir, antes de reservar, o que a unidade faz quando você retira o carro antes do fim do período. A resposta geral da praça está em [o que acontece se o voo atrasar ou se eu voltar antes do previsto](/faq/e-se-meu-voo-atrasar-ou-eu-voltar-antes-do-previsto-guarulhos-gru).

### Decisão 5: escolher o pátio mais distante

Desde 19 de outubro de 2026, escolher o pátio mais distante devolve dinheiro em qualquer duração: o Aerovalet cobra menos que o Aeropark em todas as faixas e nos dois tipos de vaga, e isso segue valendo com a tabela do Aeropark de 13 de novembro de 2026.

| Estadia, vaga descoberta | Aerovalet, a 4,85 km do Terminal 1 | Aeropark, a 1,88 km do Terminal 1 | Diferença |
| --- | --- | --- | --- |
| 1 diária | R$ 16,90 | mínimo de 2 diárias, R$ 39,80 | R$ 22,90 |
| 2 diárias | R$ 33,80 | R$ 39,80 | R$ 6,00 |
| 5 diárias | R$ 84,50 | R$ 99,50 | R$ 15,00 |
| 7 diárias | R$ 83,30 | R$ 132,30 | R$ 49,00 |
| 15 diárias | R$ 178,50 | R$ 283,50 | R$ 105,00 |
| 30 diárias | R$ 207,00 | R$ 537,00 | R$ 330,00 |

Na vaga coberta, a diferença é maior: R$ 180,00 em quinze diárias (R$ 208,50 contra R$ 388,50) e R$ 450,00 em trinta (R$ 267,00 contra R$ 717,00). Valores do Aerovalet na tabela de 28 de outubro de 2026 e do Aeropark na de 13 de novembro de 2026.

**O que ela cobra em troca:** cerca de 3 km a mais até o Terminal 1. Além disso, a ficha do Aerovalet lista transfer entre os serviços, mas não declara o tempo de traslado nem a frequência da van. A comparação por distância completa está no post sobre [estacionamento próximo ao Aeroporto Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## Por que reservar mais dias pode sair mais barato em Guarulhos?

Porque a tabela dos dois pátios não cobra por dia de forma linear, e é aqui que muita gente perde a chance de estacionar barato no Aeroporto de Guarulhos. Ela tem quatro faixas de permanência, que mudam de um pátio para o outro: no Aerovalet, as viradas são em 7, 17 e 30 diárias; no Aeropark, em 7, 13 e 18. Quando a estadia cruza de uma faixa para a próxima, o valor por dia de todos os dias cai de uma vez, e não só o do dia a mais.

| Faixa, vaga descoberta | Aerovalet em 28/10/2026 | Aeropark em 13/11/2026 |
| --- | --- | --- |
| 1 diária | R$ 16,90 | não vende |
| De 2 a 6 diárias | R$ 16,90 | R$ 19,90 |
| De 7 a 12 diárias | R$ 11,90 | R$ 18,90 |
| De 13 a 16 diárias | R$ 11,90 | R$ 18,90 |
| 17 diárias | R$ 8,90 | R$ 18,90 |
| De 18 a 29 diárias | R$ 8,90 | R$ 17,90 |
| De 30 diárias em diante | R$ 6,90 | R$ 17,90 |

### Quando vale reservar mais dias do que a viagem?

A consequência prática: na véspera de um degrau, o total da estadia mais curta passa o da mais longa. A tabela abaixo mostra os casos em que reservar mais dias sai mais barato, com o Aerovalet na tabela de 28 de outubro de 2026 e o Aeropark na de 13 de novembro de 2026.

| Sua viagem | Paga | Reservando | Paga | Economiza |
| --- | --- | --- | --- | --- |
| 5 ou 6 dias no Aerovalet, descoberta | R$ 84,50 a R$ 101,40 | 7 diárias | R$ 83,30 | R$ 1,20 a R$ 18,10 |
| 13 a 16 dias no Aerovalet, descoberta | R$ 154,70 a R$ 190,40 | 17 diárias | R$ 151,30 | R$ 3,40 a R$ 39,10 |
| 24 a 29 dias no Aerovalet, descoberta | R$ 213,60 a R$ 258,10 | 30 diárias | R$ 207,00 | R$ 6,60 a R$ 51,10 |
| 5 ou 6 dias no Aerovalet, coberta | R$ 99,50 a R$ 119,40 | 7 diárias | R$ 97,30 | R$ 2,20 a R$ 22,10 |
| 14 a 16 dias no Aerovalet, coberta | R$ 194,60 a R$ 222,40 | 17 diárias | R$ 185,30 | R$ 9,30 a R$ 37,10 |
| 25 a 29 dias no Aerovalet, coberta | R$ 272,50 a R$ 316,10 | 30 diárias | R$ 267,00 | R$ 5,50 a R$ 49,10 |

Repare que o degrau ficou largo no Aerovalet. Ele aparece antes de cada virada de faixa, e a véspera chega a cobrir seis dias antes da de trinta diárias. No Aeropark não há nenhum, nas duas vagas: dezoito diárias custam R$ 0,90 a mais que dezessete na descoberta e R$ 6,90 a mais na coberta.

Na prática, o caso mais extremo é o de 29 dias na vaga descoberta do Aerovalet. Ele custa R$ 258,10, R$ 51,10 a mais que trinta diárias (R$ 207,00) e mais até que trinta e uma (R$ 213,90).

### A regra curta dos degraus em Guarulhos

A regra curta, para guardar: **no Aerovalet, viagem de 5 ou 6 dias, reserve 7. De 13 a 16 dias, reserve 17. De 24 a 29 dias, reserve 30. Na vaga coberta, as duas últimas vésperas começam um dia depois (14 e 25 dias). No Aeropark não há degrau: reserve o período exato.** Fora desses casos, reserve o período exato. Por exemplo, doze dias na vaga descoberta do Aerovalet custam R$ 142,80, e esticar para dezessete custaria R$ 151,30.

A tabela nova do Aerovalet também desmonta uma dica antiga. Até agosto de 2026, a tabela parava de cair em quinze diárias, e esticar a reserva além disso não devolvia nada. Com a revisão de setembro, a queda passou a ir até dezoito diárias, e no Aerovalet, desde 28 de outubro, ela vai até trinta. Texto sobre estacionamento barato em Guarulhos que ainda diga o contrário está com a tabela velha.

## Quanto se economiza contra o balcão em Guarulhos, em reais?

A economia da tabela online contra a de balcão cresce com a estadia, porque o percentual fica fixo e o total aumenta. Os valores abaixo são do Aerovalet na tabela de 28 de outubro de 2026 e do Aeropark na de 13 de novembro de 2026.

| Duração | Descoberta, balcão | Descoberta, online | Economia | Coberta, balcão | Coberta, online | Economia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 diária (Aerovalet) | R$ 20,28 | R$ 16,90 | R$ 3,38 | R$ 23,88 | R$ 19,90 | R$ 3,98 |
| 7 diárias, Aerovalet | R$ 99,96 | R$ 83,30 | R$ 16,66 | R$ 116,76 | R$ 97,30 | R$ 19,46 |
| 7 diárias, Aeropark | R$ 158,76 | R$ 132,30 | R$ 26,46 | R$ 209,16 | R$ 174,30 | R$ 34,86 |
| 15 diárias, Aerovalet | R$ 214,20 | R$ 178,50 | R$ 35,70 | R$ 250,20 | R$ 208,50 | R$ 41,70 |
| 15 diárias, Aeropark | R$ 340,20 | R$ 283,50 | R$ 56,70 | R$ 448,20 | R$ 373,50 | R$ 74,70 |
| 30 diárias, Aerovalet | R$ 248,40 | R$ 207,00 | R$ 41,40 | R$ 320,40 | R$ 267,00 | R$ 53,40 |
| 30 diárias, Aeropark | R$ 644,40 | R$ 537,00 | R$ 107,40 | R$ 860,40 | R$ 717,00 | R$ 143,40 |

Assim, em viagem de um dia, a tabela online devolve menos de R$ 5,00. Em um mês na vaga coberta, devolve R$ 53,40 no Aerovalet e R$ 143,40 no Aeropark. Ou seja, quanto mais longa a viagem, mais pesa decidir antes.

## A escada completa para estacionar barato no Aeroporto de Guarulhos

As decisões não se excluem. A escada abaixo parte do estacionamento oficial e desce um degrau por decisão, sempre em quinze diárias, com os preços do Aerovalet na tabela de 28 de outubro de 2026, os do Aeropark na de 13 de novembro de 2026 e o do oficial em 17 de setembro de 2026.

| Escolha | Total em 15 diárias | Já economizado |
| --- | --- | --- |
| Oficial, Terminais 1 e 2, Standard | R$ 480,00 | referência |
| Aeropark, coberta, tabela de balcão | R$ 448,20 | R$ 31,80 |
| Aerovalet, coberta, tabela de balcão | R$ 250,20 | R$ 229,80 |
| Aerovalet, coberta, tabela online | R$ 208,50 | R$ 271,50 |
| Aerovalet, descoberta, tabela online | R$ 178,50 | **R$ 301,50** |

Do topo ao último degrau são R$ 301,50, ou 63% do valor inicial. O primeiro degrau sozinho, sair do oficial para a vaga mais cara na pior tabela, devolve só R$ 31,80: a vaga coberta do Aeropark no balcão fica perto do Standard. Por isso, sair do oficial só sustenta a conta quando vem junto de pelo menos mais uma decisão.

No segundo degrau está a novidade: trocar de pátio, que em setembro não mexia no preço, agora devolve R$ 216,00 na vaga coberta pela tabela de balcão. A escada para em quinze diárias pagas, mas ainda cabe um degrau: reservar dezessete diárias na vaga descoberta do Aerovalet custa R$ 151,30, R$ 27,20 a menos, e leva a economia sobre o oficial a R$ 328,70.

## O que se abre mão para chegar no estacionamento mais barato do GRU?

Cada degrau da escada troca alguma coisa, e vale olhar a lista inteira antes de escolher o último.

- **Distância até o terminal, contra o oficial.** O pátio parceiro exige van. No Aeropark a ficha declara 10 minutos de trajeto e van a cada 30 minutos, o que pode somar cerca de 40 minutos entre entrar no pátio e chegar ao balcão da companhia.
- **Cobertura, na vaga descoberta.** O carro fica exposto a sol, chuva e granizo pelo período inteiro. Em trinta diárias, evitar isso custa R$ 60,00 a mais no Aerovalet.
- **Flexibilidade, na tabela online.** Você decide a data de volta antes de sair de casa.
- **Dias que você não usa, no degrau.** Você paga um período maior que a viagem, mesmo que o total seja menor. Confira a regra de retirada antecipada da unidade antes.
- **Traslado declarado, no pátio mais distante.** Em todas as durações o Aerovalet sai mais barato, fica cerca de 3 km mais longe do Terminal 1 e não declara tempo de van na ficha.

Por outro lado, a proximidade agora tem preço: **o pátio mais perto custa mais em todas as durações**. Em quinze diárias na vaga descoberta, escolher o Aeropark custa R$ 105,00 a mais e encurta a distância até o Terminal 1 de 4,85 km para 1,88 km. Quem embarca no Terminal 3 deve somar a diferença: o Aeropark fica a 3,06 km dele, e o Aerovalet a 5,00 km.

## Quando a economia no estacionamento de Guarulhos vira armadilha em viagem curta?

A viagem curta é onde a economia mais engana, por três motivos que se somam.

**O piso de permanência.** O Aeropark cobra no mínimo 2 diárias em todos os tipos de vaga. Quem deixa o carro por um dia paga R$ 43,80 na vaga descoberta, na tabela de 19 de outubro de 2026, mais que o dobro dos R$ 16,90 do Aerovalet, na de 28 de outubro de 2026. Na vaga coberta, R$ 59,80 contra R$ 19,90. A diferença na diária anunciada parece pequena, mas o total da viagem não é.

**A faixa mais cara da tabela.** De uma a seis diárias, o valor por dia é o mais alto: R$ 16,90 na vaga descoberta do Aerovalet, contra R$ 6,90 de quem fica trinta dias ou mais. A diária que aparece nos anúncios "a partir de" costuma ser a da faixa longa, que não vale para quem viaja três dias.

**O oficial por hora.** Para bate e volta de poucas horas, o pátio parceiro cobra a diária inteira, com traslado no meio, e o oficial cobra pelo período usado a pé do terminal. Só que a tabela dele começa em R$ 31,00 na primeira hora do Standard, acima da diária avulsa do Aerovalet. Nessa faixa o oficial compra tempo, não economia.

Três checagens resolvem isso em trinta segundos:

- **Compare totais, não diárias.** O número que importa é o que sai na conta pelo período inteiro da sua viagem.
- **Confira a permanência mínima.** Uma diária barata que exige duas diárias dobra o custo de quem fica um dia.
- **Confira em qual faixa está o valor anunciado.** Uma diária de piso que vale a partir de trinta dias não serve para quem viaja cinco.

## Quais armadilhas custam mais caro para quem procura estacionamento barato em Guarulhos?

Nem toda tática de economia funciona, e algumas cobram mais do que devolvem. Estas quatro aparecem com frequência.

### Voltar na véspera de um degrau

É a armadilha que ninguém avisa. Uma viagem de 29 dias na vaga descoberta do Aerovalet custa R$ 258,10. Trinta diárias custam R$ 207,00. São R$ 51,10 pagos a mais por ter reservado menos, na tabela de 28 de outubro de 2026. A tabela de degraus da seção anterior mostra todos os casos.

### Pátio muito distante devolve pouco e cobra caro

Entre os dois parceiros de Guarulhos, os cerca de 3 km a mais até o Aerovalet valem de R$ 3,00 a R$ 11,00 por dia na vaga descoberta e de R$ 7,00 a R$ 15,00 na coberta, com o Aerovalet na tabela de 28 de outubro de 2026 e o Aeropark na de 13 de novembro de 2026. Essa diferença sai da tabela de cada pátio e não cresce com a distância: um lote a 20 km do terminal não devolve sete vezes mais.

Contudo, o que ele cobra cresce rápido. Mais estrada no dia do voo, mais tempo de van, mais risco de perder o horário e menos margem se a van atrasar.

### Preço sem data não prova estacionamento barato em Guarulhos

Boa parte das listas de estacionamento barato em Guarulhos que circulam na busca traz valores de meses ou anos atrás, sem dizer quando foram apurados. Esta própria página mostra o problema: a menor quinzena caiu de R$ 223,50 em agosto para R$ 152,70 em setembro de 2026, subiu para R$ 238,50 em 19 de outubro e voltou a cair para R$ 178,50 na tabela de 28 de outubro. No mesmo período, a diferença entre os pátios sumiu da semana em diante, depois voltou e cresceu.

Todo valor desta página carrega a data ao lado e um link para o preço vivo. Se um número que você encontrar em qualquer lugar não tiver data, trate como referência histórica.

### Escolher o valet pensando em economia

Até agosto de 2026, em trinta diárias, o valet chegava a sair mais barato que a vaga coberta. Com a revisão de setembro, isso acabou. Na tabela de 19 de outubro de 2026, trinta diárias de valet custam R$ 791,90 nos dois pátios, contra R$ 267,00 na coberta do Aerovalet (tabela de 28 de outubro de 2026) e R$ 717,00 na do Aeropark (tabela de 13 de novembro de 2026).

Ainda assim, o valet segue fazendo sentido para quem chega em cima da hora ou viaja com família e bagagem. Só não é caminho para gastar menos em nenhuma faixa.

## Qual decisão pesa mais em cada duração de viagem em Guarulhos?

A decisão certa muda conforme o tempo de viagem. Valores do Aerovalet na tabela de 28 de outubro de 2026 e do Aeropark na de 13 de novembro de 2026.

- **Algumas horas.** Compare com o oficial antes de qualquer pátio. Ele cobra por período usado e fica a pé do terminal.
- **1 dia.** Só o Aerovalet aceita, a R$ 16,90 na descoberta. O Aeropark cobraria duas diárias.
- **De 2 a 6 dias.** O Aerovalet sai mais barato: de R$ 10,00 a R$ 30,00 na descoberta e de R$ 20,00 a R$ 60,00 na coberta. De 2 a 4 dias, reserve o período exato. Com 5 ou 6 dias, reserve sete no Aerovalet: sete diárias custam R$ 83,30 na descoberta e R$ 97,30 na coberta.

De uma semana em diante, o Aerovalet segue mais barato e o degrau entra na conta em mais dois pontos.

- **De 7 a 12 dias.** Reserve o período exato. A decisão é o tipo de vaga, a tabela online e o pátio: o mais perto, o Aeropark, custa R$ 7,00 a mais por dia na descoberta e R$ 11,00 na coberta.
- **De 13 a 16 dias.** No Aerovalet, reserve dezessete (na coberta, a partir de 14 dias). Devolve até R$ 39,10 na descoberta. No Aeropark, reserve o período exato.
- **17 dias.** O Aerovalet já está na faixa de R$ 8,90 por dia na descoberta. No Aeropark, reserve o período exato.
- **De 18 a 29 dias.** De 18 a 23 dias, reserve o período exato. De 24 a 29 no Aerovalet (na coberta, de 25 a 29), reserve trinta. Devolve até R$ 51,10 na descoberta.
- **30 dias ou mais.** O valor por dia chegou ao piso, R$ 6,90 na descoberta do Aerovalet. Num mês, compare com o oficial: em trinta diárias, o Standard (R$ 505,00 na tabela de 17 de setembro de 2026) fica abaixo das duas vagas do Aeropark. As duas do Aerovalet saem mais baratas que ele: a descoberta, a R$ 207,00, fica R$ 298,00 abaixo, e a coberta, a R$ 267,00, R$ 238,00 abaixo.

## Como conferir se o seu estacionamento barato em Guarulhos ainda é o menor?

Por fim, um roteiro curto para estacionar barato no Aeroporto de Guarulhos, que funciona em qualquer data e não depende dos números desta página.

1. Abra o [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) e olhe a faixa exata da sua viagem, não a diária de vitrine.
2. Confira a data da última atualização ao lado da tabela. Preço sem data não serve para decidir.
3. Simule também um e dois dias a mais que a sua viagem. Se o total cair, você está na véspera de um degrau.
4. Compare os dois pátios no mesmo tipo de vaga. Se empatarem, escolha pela distância até o seu terminal.
5. Cheque a permanência mínima e a regra de retirada antecipada da unidade antes de fechar.

Feito isso, a página do [estacionamento mais barato do aeroporto](/estacionamentos/aeroporto-guarulhos/mais-barato) mostra o menor valor da praça no momento. Para comparar os dois pátios além do preço, o [guia com as opções de estacionamento no Aeroporto de Guarulhos](/blog/guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024/) coloca os dois lado a lado.

## Como estes números foram apurados?

Todo preço de parceiro citado aqui saiu do motor de reservas da Movepark: os do Aerovalet na tabela de **28 de outubro de 2026** (o valet dos dois pátios segue na de 19 de outubro) e os do Aeropark na de **13 de novembro de 2026**. São os mesmos que aparecem na [página do Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos). Para esses valores não há estimativa nem número de terceiro. A tabela de balcão é a que o próprio parceiro publica para quem chega sem reservar, e também sai do motor.

Há uma única exceção, marcada no texto. A tarifa do estacionamento oficial não passa pelo motor, então foi lida à mão na tabela que o operador publica como imagem, conferida em 17 de setembro de 2026. É o único número desta página que a Movepark não apura e está sujeito a disponibilidade. Por isso a comparação com o oficial foi feita na faixa de 11 a 17 diárias. O único caso fora dela é a estadia de um mês, marcada no texto, que usa a faixa de 18 a 30 diárias da mesma tabela.

Vale dizer que o ranking das decisões é aritmética simples sobre esses valores, sempre na mesma faixa de quinze diárias. A tabela de degraus compara totais do mesmo pátio e do mesmo tipo de vaga. Cada parceiro define a própria tabela e pode mudá-la a qualquer momento, então o retrato vale para a data indicada, e os números de agosto, setembro e 19 de outubro citados como histórico são os das versões anteriores desta página.

As distâncias são calculadas no banco de dados com PostGIS, em linha reta entre o pátio e cada terminal. Já o tempo de traslado, a frequência da van e a lista de serviços são declarados por cada unidade na própria ficha, e aparecem aqui como declaração da unidade.

Perguntas gerais da praça têm resposta própria e ficam fora daqui, como [qual o estacionamento mais barato perto do Aeroporto de Guarulhos](/faq/qual-o-estacionamento-mais-barato-perto-do-aeroporto-de-guarulhos). Os números de movimentação do aeroporto saem no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Qual decisão devolve mais dinheiro em Guarulhos?

Sair do estacionamento oficial. Em quinze diárias, a diferença é de R$ 301,50, com a vaga descoberta do Aerovalet a R$ 178,50 na tabela de 28 de outubro de 2026 e o oficial a R$ 480,00 em 17 de setembro de 2026. Depois vêm a troca do Aeropark pelo Aerovalet (R$ 105,00), tabela online (R$ 35,70), vaga descoberta (R$ 30,00) e o degrau da tabela (R$ 27,20, reservando dezessete diárias).

### Reservar mais dias pode sair mais barato em Guarulhos?

Pode, na véspera de um degrau. Na tabela de 28 de outubro de 2026, dezesseis diárias na vaga descoberta do Aerovalet custam R$ 190,40 e dezessete custam R$ 151,30. A regra curta no Aerovalet é reservar sete para viagem de 5 ou 6 dias, dezessete para viagem de 13 a 16 dias e trinta para viagem de 24 a 29 dias (na coberta, a partir de 14 e de 25 dias). No Aeropark não há degrau em nenhuma das duas vagas: reserve o período exato.

### O Aerovalet é mais barato que o Aeropark?

Sim, nas vagas descoberta e coberta, em todas as durações. Com o Aerovalet na tabela de 28 de outubro de 2026 e o Aeropark na de 13 de novembro de 2026, na vaga descoberta, a diferença vai de R$ 6,00 em duas diárias a R$ 330,00 em trinta, e o Aerovalet é o único que aceita estadia de um dia. No valet, os dois cobram o mesmo a partir de duas diárias.

### O que se abre mão ao escolher o lote mais barato em Guarulhos?

Cobertura e distância. O menor preço é sempre da vaga descoberta, exposta a sol e granizo. Em todas as durações, o mais barato é o Aerovalet, a 4,85 km do Terminal 1 e sem tempo de van declarado. O Aeropark, a 1,88 km, custa mais: R$ 105,00 a mais em quinze diárias na vaga descoberta.

### Quanto a tabela online economiza contra o balcão em Guarulhos?

Cerca de 17% nas vagas descoberta e coberta, e 20% no valet, nos dois pátios. Em reais, no Aerovalet, na tabela de 28 de outubro de 2026, são R$ 16,66 numa semana de vaga descoberta, R$ 35,70 na quinzena e R$ 53,40 em trinta diárias de vaga coberta.

### Por que viagem de um dia custa mais caro no Aeropark?

Porque o Aeropark cobra no mínimo 2 diárias em todos os tipos de vaga. Na tabela de 19 de outubro de 2026, quem deixa o carro um dia paga R$ 43,80 na descoberta, mais que o dobro dos R$ 16,90 do Aerovalet (tabela de 28 de outubro de 2026), que não tem permanência mínima. Para poucas horas, compare também com o oficial.

### Vale pagar a vaga coberta no estacionamento barato em Guarulhos?

Depende do pátio. Na tabela de 28 de outubro de 2026, no Aerovalet, a cobertura custa R$ 30,00 a mais em quinze diárias e R$ 60,00 em trinta, ou R$ 2,00 por dia no mês. No Aeropark, R$ 6,00 por dia no mês. Para carro novo, pintura escura ou estadia longa, é o preço de proteger o carro de sol e granizo.

### Somando tudo, quanto economiza quem quer estacionar barato no Aeroporto de Guarulhos?

R$ 301,50, ou 63%, numa viagem de quinze dias. É a distância entre o oficial dos Terminais 1 e 2, a R$ 480,00 na faixa de 11 a 17 diárias, conferido em 17 de setembro de 2026, e a vaga descoberta do Aerovalet na tabela online, a R$ 178,50 na tabela de 28 de outubro de 2026. Reservando dezessete diárias, o degrau da tabela, a conta chega a R$ 328,70.$d1$
   where id = '500504b8-b758-4229-b724-5a2860093520' and md5(coalesce(body_md, '')) = 'f9d3d17f44656167ee5f3782bab68bbe';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'degrau aeropark: % mudou', '500504b8'; end if;
  total := total + 1;

  if total <> 2 then raise exception 'degrau aeropark: % de 2', total; end if;
end
$degrau$;
