-- A Aerovalet deixou a Movepark (27/11/2026): os três posts por terminal de Guarulhos.
--
-- Terminal 1, 2 e 3, em pt, en e es. Os três usavam a Aerovalet como o parceiro mais barato de
-- cada comparação (diária avulsa de R$ 16,90, tabela de 28/10/2026) e o Aeropark na tabela de
-- 19/10/2026, que virou em 13/11/2026. Passam a comparar a Pare Seguro (tabela de 03/11/2026,
-- mínimo de 2 diárias, R$ 290,00 fixos de 15 a 30 diárias na descoberta) e o Aeropark (13/11/2026
-- nas vagas comuns, 19/10/2026 no valet), com a distância de cada pátio a cada terminal medida
-- no PostGIS. Mudou de sentido: nenhum parceiro aceita diária avulsa, então para poucas horas o
-- oficial também ganha em preço; os dois empatam na descoberta de 7 a 14 diárias; a Pare Seguro
-- fica abaixo a partir da quinzena. Cifras do simulate_price lido em 27/11/2026. 9 documentos.
--
-- Trava: campo inteiro com md5 do texto lido em 27/11/2026. Ver docs/specs/rotina-mensal-frescor.md,
-- seção "Rodada extra de 27/11/2026: a Aerovalet sai".

do $aerovalet$
declare
  k int;
  total int := 0;
begin
  -- Guarda de replay: no db reset do CI não há acervo, e a migration vira no-op.
  if not exists (select 1 from public.blog_post where id = 'ae214f5b-c207-47be-bd84-41b02089bc26') then
    raise notice 'aerovalet: banco sem o acervo de 27/11/2026, nada a revisar';
    return;
  end if;

  -- estacionamento-terminal-1-aeroporto-guarulhos.pt · body_md
  update public.blog_post set body_md = $f1$O estacionamento no Terminal 1 do Aeroporto de Guarulhos tem a tarifa mais baixa do complexo e nenhuma opção coberta. O T1 é atendido só pelo setor Standard, que cobra R$ 31,00 na primeira hora e R$ 480,00 na faixa de 11 a 17 diárias. Quem quer vaga coberta precisa ir para outro terminal ou para um pátio de fora, onde a coberta sai a partir de R$ 350,00 em 15 diárias. O oficial foi conferido em 17 de setembro de 2026, e o pátio de fora mais barato está na tabela de 3 de novembro de 2026.

| Resposta rápida | Oficial em 17/09/2026, Pare Seguro em 03/11/2026, Aeropark em 13/11/2026 |
| --- | --- |
| Setor do oficial que atende o T1 | Standard, e só ele |
| Tem vaga coberta oficial no T1? | não, o edifício garagem atende T2 e T3 |
| Primeira hora no oficial do T1 | R$ 31,00 |
| Diária avulsa no oficial do T1 | R$ 79,00 |
| 15 diárias no oficial do T1 | R$ 480,00 |
| 15 diárias na Pare Seguro, vaga descoberta | R$ 290,00 |
| 15 diárias no Aeropark, vaga descoberta | R$ 283,50 |
| Parceiro mais perto do T1 | Aeropark, a 1,88 km em linha reta |

## Qual setor atende o estacionamento do Terminal 1 de Guarulhos?

O Aeroporto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tem três terminais de passageiros. O Terminal 1 é o mais antigo, concentra voos domésticos e é o único atendido por um setor só.

| Setor do oficial | Atende | Primeira hora | Diária avulsa |
| --- | --- | --- | --- |
| Standard | Terminais 1 e 2 | R$ 31,00 | R$ 79,00 |
| Premium e edifício garagem | Terminais 2 e 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

A divisão por setor tem dois efeitos, e os dois valem saber antes de dirigir até lá.

O primeiro é bom para o bolso: **quem embarca no T1 paga a tabela mais baixa do oficial**. São R$ 7,00 menos na primeira hora. E R$ 28,00 menos na diária, contra quem usa Premium ou edifício garagem.

O segundo é uma limitação: **não existe vaga coberta oficial no Terminal 1**. O edifício garagem atende os Terminais 2 e 3. Ou seja, quem quer o carro sob teto no complexo precisa estacionar em outro terminal e se deslocar.

## Quanto custa o estacionamento no Terminal 1 do Aeroporto de Guarulhos?

A tabela cobra por faixa de permanência, e não por diária multiplicada. Os valores abaixo são os do Standard, que é o setor do T1. Todos lidos na tabela publicada pelo operador e conferidos em 17 de setembro de 2026.

| Permanência | Total no oficial do T1 |
| --- | --- |
| Até 1 hora | R$ 31,00 |
| Até 2 horas | R$ 54,00 |
| Até 3 horas | R$ 62,00 |
| Até 4 horas | R$ 70,00 |
| Até 1 diária | R$ 79,00 |
| 2 diárias | R$ 157,00 |
| 3 diárias | R$ 223,00 |
| 4 diárias | R$ 290,00 |
| 5 diárias | R$ 360,00 |
| De 6 a 10 diárias | R$ 460,00 |
| De 11 a 17 diárias | R$ 480,00 |
| De 18 a 30 diárias | R$ 505,00 |
| Acima de 30 diárias | pacote de 30 diárias mais R$ 19,90 por diária |

Duas leituras importam. A primeira: as faixas são **totais**, não valores por dia. Uma viagem de quinze dias cai na faixa de 11 a 17 diárias e paga R$ 480,00, o mesmo que pagaria uma de dezessete.

A segunda: a curva é íngreme até o quinto dia e quase plana depois. Cinco diárias custam R$ 360,00 e dez custam R$ 460,00. Portanto, o preço por dia cai de R$ 72,00 para R$ 46,00 nesse intervalo.

### Quanto sai o dia em cada faixa do T1?

Olhar o valor por dia muda a decisão, e a tabela do oficial esconde isso.

| Faixa do Standard | Total | Valor por dia no limite da faixa |
| --- | --- | --- |
| Até 1 diária | R$ 79,00 | R$ 79,00 |
| 2 diárias | R$ 157,00 | R$ 78,50 |
| 5 diárias | R$ 360,00 | R$ 72,00 |
| De 6 a 10 diárias | R$ 460,00 | R$ 46,00 |
| De 11 a 17 diárias | R$ 480,00 | R$ 28,24 |
| De 18 a 30 diárias | R$ 505,00 | R$ 16,83 |

Ou seja, o valor por dia cai de R$ 79,00 para R$ 16,83 conforme a estadia estica. É a mesma lógica dos parceiros, com pisos bem diferentes. Na vaga descoberta do Aeropark, na tabela de 13 de novembro de 2026, o dia sai a R$ 19,90 de 2 a 6 diárias e cai até R$ 17,90 a partir de 18 diárias. Na Pare Seguro, na tabela de 3 de novembro de 2026, o dia sai a R$ 18,90 até 14 diárias, e de 15 a 30 o total é fixo em R$ 290,00. Em trinta diárias, o oficial sai a R$ 16,83 por dia, acima dos R$ 9,67 da descoberta da Pare Seguro e abaixo dos R$ 17,90 da descoberta do Aeropark.

## Quanto sai a alternativa fora do complexo para quem embarca no T1?

Além do estacionamento oficial do T1, a Movepark tem dois pátios parceiros na praça, os dois com traslado de van. Com a Pare Seguro na tabela de 3 de novembro de 2026 e o Aeropark na de 13 de novembro de 2026, os dois empatam na vaga descoberta de 7 a 14 diárias, e o Aeropark sai mais barato na coberta até 14. A Pare Seguro fica abaixo na coberta a partir de 15 diárias e na descoberta a partir de 16. Só o Aeropark tem valet.

| Permanência | Vaga descoberta | Vaga coberta | Valet |
| --- | --- | --- | --- |
| 2 diárias na Pare Seguro | R$ 37,80 | R$ 57,80 | não oferece |
| 2 diárias no Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 diárias na Pare Seguro | R$ 132,30 | R$ 202,30 | não oferece |
| 7 diárias no Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 diárias na Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 15 diárias no Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 diárias na Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 30 diárias no Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Nenhum dos dois aceita diária avulsa: os dois trabalham com permanência mínima de 2 diárias. O preço vivo fica no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), com a data da última atualização de cada tabela.

## Quanto se economiza saindo do oficial no Terminal 1?

O setor Standard do Terminal 1 tem a tabela mais baixa do complexo. Portanto, esta é a comparação mais dura que o pátio de fora enfrenta na praça. A diferença é grande na semana e encolhe a partir da quinzena, quando o Standard passa a cobrar por faixa. A tabela usa, em cada duração, a vaga descoberta mais barata entre a Pare Seguro (tabela de 3 de novembro de 2026) e o Aeropark (tabela de 13 de novembro de 2026).

| Permanência | Oficial Standard | Parceiro mais barato, descoberta | Diferença |
| --- | --- | --- | --- |
| 2 diárias | R$ 157,00 | R$ 37,80 na Pare Seguro | R$ 119,20, ou 75,9% |
| 7 diárias | R$ 460,00 | R$ 132,30 nos dois parceiros | R$ 327,70, ou 71,2% |
| 15 diárias | R$ 480,00 | R$ 283,50 no Aeropark | R$ 196,50, ou 40,9% |
| 30 diárias | R$ 505,00 | R$ 290,00 na Pare Seguro | R$ 215,00, ou 42,6% |

Vale notar onde o oficial fica na frente. O valet do Aeropark custa R$ 692,90 em quinze diárias, R$ 212,90 acima dos R$ 480,00 do Standard. Se você quer manobrista e o menor total, a conta não fecha no parceiro nessa faixa.

Em trinta diárias, o Standard do T1 (R$ 505,00) fica abaixo de duas das quatro vagas dos parceiros, as do Aeropark. A descoberta do Aeropark custa R$ 537,00, R$ 32,00 a mais, e a coberta, R$ 717,00. No mês, as duas vagas da Pare Seguro seguem abaixo do oficial: R$ 290,00 na descoberta e R$ 350,00 na coberta.

## Onde estacionar coberto se o voo sai do Terminal 1?

Como não existe setor coberto oficial no T1, há três caminhos para o estacionamento no Terminal 1 do Aeroporto de Guarulhos, e eles custam bem diferente.

| Opção coberta, 15 diárias | Total | O que ela cobra em troca |
| --- | --- | --- |
| Vaga coberta no pátio parceiro | de R$ 350,00 a R$ 373,50 | traslado de van, de 15 a 50 minutos |
| Edifício garagem no T2 | R$ 610,00 | deslocamento interno entre terminais |
| Valet no Aeropark | R$ 692,90 | traslado de van, com manobrista |

A coberta da Pare Seguro sai R$ 260,00 abaixo do edifício garagem do T2 na mesma quinzena, na tabela de 3 de novembro de 2026, e a do Aeropark, R$ 236,50 abaixo, na de 13 de novembro de 2026. Em trinta diárias, a coberta da Pare Seguro custa R$ 350,00 contra R$ 690,00, ou R$ 340,00 de diferença. A do Aeropark, a R$ 717,00, passa a custar R$ 27,00 a mais que o edifício garagem. O valet do Aeropark também fica acima dele na quinzena, por R$ 82,90.

Na prática, quem embarca no T1 e quer teto sobre o carro gasta menos na coberta do Aeropark em viagem de até 14 diárias e na da Pare Seguro na quinzena e no mês, as duas abaixo do edifício garagem. A comparação de cobertura por faixa está no [post de preço do estacionamento em Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## A que distância fica o estacionamento no Terminal 1 do Aeroporto de Guarulhos?

A boa notícia do estacionamento GRU Terminal 1 é a distância: ele é o terminal mais perto dos pátios parceiros, e por uma margem grande.

| Pátio parceiro | Distância do T1, em linha reta | Distância do T2 | Distância do T3 | Traslado declarado |
| --- | --- | --- | --- | --- |
| Aeropark | 1,88 km | 2,65 km | 3,06 km | 10 minutos, van a cada 30 |
| Pare Seguro | 3,97 km | 4,51 km | 4,88 km | 10 minutos, van a cada 30 |

As distâncias são calculadas no banco de dados da Movepark com PostGIS, em linha reta. Os três terminais estão cadastrados como pontos próprios, então a medida é por terminal, e não uma média do complexo.

A leitura prática é direta. O Aeropark fica 1,18 km mais perto do T1 do que do T3. Ele também está 2,09 km à frente da Pare Seguro. A proximidade quase não pesa no preço da semana: na vaga descoberta os dois cobram o mesmo de 7 a 14 diárias. Na estadia longa a conta vira para a Pare Seguro, que cobra R$ 290,00 fixos de 15 a 30 diárias na descoberta, R$ 247,00 a menos que o Aeropark no mês.

## Quanto tempo somar ao trajeto quando o embarque é no Terminal 1?

Além disso, o bloco de tempo é o menor da praça, porque o T1 é o terminal mais próximo dos dois pátios.

Nos dois parceiros, a ficha declara traslado de 10 minutos e van a cada 30 minutos. Somando espera, trajeto e caminhada até o balcão, dá de 15 a 50 minutos entre entrar no pátio e estar no terminal. Reserve cerca de 40 minutos, e coloque esse bloco **antes** do prazo de check-in da companhia.

Assim, mesmo no melhor caso da praça, o pátio de fora cobra tempo. É isso que o oficial vende na primeira hora de R$ 31,00: caminhada em vez de van. A conta completa de tempo porta a porta está no post sobre [estacionamento próximo ao Aeroporto Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## Quanto custa buscar alguém no Terminal 1?

A tarifa por hora é a consulta de quem não vai viajar, e a tabela do estacionamento no Terminal 1 do Aeroporto de Guarulhos responde direto.

| Tempo no pátio | Standard, no T1 |
| --- | --- |
| Até 1 hora | R$ 31,00 |
| Até 2 horas | R$ 54,00 |
| Até 3 horas | R$ 62,00 |
| Até 4 horas | R$ 70,00 |

Para esse uso, o oficial é a escolha óbvia. Ele fica a pé do terminal, sem van no meio do caminho, e isso resolve desembarque com voo atrasado.

Em dinheiro ele também ganha nessa faixa. A primeira hora custa R$ 31,00, e os parceiros só aceitam estadia a partir de duas diárias, que saem por R$ 37,80 na descoberta da Pare Seguro.

## Quanto custa ficar mais de trinta dias no estacionamento do Terminal 1?

A faixa mais longa funciona diferente das outras. Acima de 30 diárias, o oficial cobra o pacote de 30 e soma **R$ 19,90 por diária extra**, que é a diária fixa do Standard.

Na prática, 45 dias no T1 dão R$ 505,00 do pacote mais R$ 298,50 das quinze diárias extras. Assim, o total fica em R$ 803,50.

Na vaga descoberta da Pare Seguro, a tabela de 3 de novembro de 2026 cobra R$ 290,00 fixos de 15 a 30 diárias e volta a R$ 18,90 por dia depois disso. Quarenta e cinco dias saem por R$ 573,50, R$ 230,00 abaixo do oficial. Na coberta da Pare Seguro, a R$ 28,90 por dia acima de 30, saem por R$ 783,50, também abaixo. Na descoberta e na coberta do Aeropark, os 45 dias já passam do oficial.

## Vale trocar o Terminal 1 pelo Terminal 2 para estacionar?

A dúvida sobre trocar de terminal aparece muito em quem compara estacionamento no Terminal 1 do Aeroporto de Guarulhos. A tarifa é **do setor em que o carro fica**, e não do terminal em que você embarca. Como o Standard atende os Terminais 1 e 2, quem embarca no T1 não ganha nada trocando de pátio: o preço é o mesmo nos dois.

A troca só faz sentido por outro motivo, que é cobertura. O edifício garagem fica no T2, e ali a faixa de 11 a 17 diárias custa R$ 610,00, contra R$ 480,00 do Standard.

Três pontos para decidir:

- **Se quer só o menor preço dentro do complexo**, fique no Standard do próprio T1.
- **Se quer teto sobre o carro**, compare os R$ 130,00 a mais do edifício garagem com a coberta do parceiro, a partir de R$ 350,00 em quinze diárias.
- **Se o voo é de madrugada**, considere que o deslocamento interno com bagagem acontece nos dois sentidos.

### O que muda na volta, no desembarque do T1?

Na volta, o que decide não é o preço, e sim onde o carro está. Quem deixou no oficial caminha do terminal ao pátio. Quem deixou no pátio de fora precisa acionar a van e esperar por ela.

Os dois parceiros funcionam 24 horas pela ficha, então existe alguém para acionar em qualquer horário, e os dois declaram van a cada 30 minutos.

Além disso, os dois declaram 60 minutos de tolerância na retirada, que é a folga para voo atrasado sem virar diária nova.

## Como funciona o pagamento no estacionamento oficial do Terminal 1?

A página do operador lista o que o oficial aceita, e isso resolve a dúvida de quem já está na rodovia. Em 17 de setembro de 2026, ele aceitava:

- **Dinheiro**, somente em real.
- **Cartões** de crédito e débito.
- **Tags eletrônicas**: Sem Parar, ConectCar, Veloe e Taggy.
- **QR Code**, escaneando o ticket pelo celular.

O operador também informa que os veículos são segurados contra roubo e furto, conforme a Lei Municipal de Guarulhos nº 13.912/2010. E que a reserva antecipada dá acesso a uma cancela própria, com voucher por QR Code.

Nos pátios parceiros, a forma de pagamento é a da reserva pela Movepark. O que cada unidade declara na ficha está em [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) e [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## Quem se encaixa em cada opção no Terminal 1?

Portanto, cinco perfis cobrem quem usa o estacionamento no Terminal 1 do Aeroporto de Guarulhos. Os valores do oficial são de 17 de setembro de 2026, os da Pare Seguro, da tabela de 3 de novembro de 2026, e os do Aeropark, da de 13 de novembro de 2026:

- **Buscar ou levar alguém:** oficial Standard, a R$ 31,00 na primeira hora, pela ausência de van.
- **Bate e volta de um dia:** o oficial, a R$ 79,00, porque os parceiros só aceitam a partir de duas diárias. Se a volta passar de 24 horas, a Pare Seguro sai por R$ 37,80 em duas diárias na vaga descoberta.
- **Semana de viagem:** parceiro, na vaga descoberta ou coberta, que fica de R$ 257,70 a R$ 327,70 abaixo do oficial.
- **Mês inteiro:** Pare Seguro, na vaga descoberta a R$ 290,00 ou na coberta a R$ 350,00, R$ 215,00 e R$ 155,00 abaixo do oficial. No Aeropark, o oficial sai mais barato no mês.
- **Quem quer cobertura:** coberta do parceiro, a partir de R$ 350,00 em quinze diárias, já que o T1 não tem setor coberto.

## Quando o oficial do Terminal 1 não compensa?

Duas situações em que a diferença fica indefensável para quem procura estacionamento no Terminal 1 do Aeroporto de Guarulhos.

**Viagem de cinco dias.** O oficial cobra R$ 360,00, e o parceiro cobra R$ 94,50 pelos mesmos cinco dias na vaga descoberta da Pare Seguro. São R$ 265,50 de diferença numa viagem curta.

**Viagem de quinze dias.** São R$ 480,00 no oficial contra R$ 283,50 na vaga descoberta do Aeropark. A diferença, R$ 196,50, paga mais de dez diárias no pátio de fora.

Na estadia de um mês, a vantagem do pátio de fora depende do pátio. As duas vagas da Pare Seguro ficam abaixo do oficial do T1, por R$ 215,00 na descoberta e R$ 155,00 na coberta, e as do Aeropark ficam acima.

Quem quer o menor total possível encontra o caminho completo em [como estacionar barato no Aeroporto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## Um roteiro de cinco passos para o Terminal 1

Por fim, o que fazer antes de sair de casa, na ordem:

1. Confirme que o voo embarca no T1, porque no oficial isso define o setor e o preço.
2. Some a permanência real, com folga na volta, e olhe a faixa, não a diária.
3. Se quiser vaga coberta, saiba que ela não existe no T1 e compare as três opções acima.
4. Simule o mesmo período no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) e compare totais.
5. Se escolher o pátio de fora, cheque a permanência mínima e reserve pela tabela online.

## O Terminal 1 tem estacionamento para moto?

A tabela publicada pelo operador não abre valor para moto em nenhum setor. Ou seja, a resposta honesta é que esse dado não está na fonte. Vale ligar antes de contar com a vaga.

Do lado dos parceiros, o sistema da Movepark tem tipo de vaga para moto. Assim, o índice de preços separa moto de carro quando a unidade oferece. Em 27 de novembro de 2026, nenhuma das duas unidades de Guarulhos tinha tabela de moto ativa. O Aeropark publicava vaga descoberta, coberta e valet, e a Pare Seguro, descoberta, coberta e Vaga Max, para veículo grande. A Pare Seguro declara vagas para motos na ficha, sem tabela de moto no motor.

Ou seja, em Guarulhos a moto ainda não tem preço publicado em nenhum dos dois lados. Quem precisa disso deve confirmar por telefone com o pátio escolhido, e é uma lacuna que vale registrar.

## Como estes preços foram apurados?

O preço dos pátios parceiros saiu do motor de reservas: o da Pare Seguro na tabela de **3 de novembro de 2026** e o do Aeropark na de **13 de novembro de 2026** (o valet segue na de 19 de outubro). É o mesmo número que fecha a reserva, publicado no índice de preços com a data da última atualização de cada tabela.

O preço do estacionamento oficial **não passa pelo motor da Movepark**. Ele foi lido à mão na tabela que o operador publica no site do aeroporto, como imagem, e conferido em 17 de setembro de 2026. Por isso todo valor do oficial aqui carrega a data ao lado. Ele pode mudar sem aviso, e nenhum sistema nos avisa quando muda. A divisão por setor, as formas de pagamento e a referência à lei municipal também saem dessa mesma página.

As distâncias são calculadas no banco de dados com PostGIS, em linha reta entre as coordenadas do pátio e de cada terminal. Já o tempo de traslado e a frequência da van são declarados por cada unidade na ficha. Eles aparecem como declaração da unidade, e não como promessa da Movepark. Quando um campo não está declarado, o texto diz que não está.

Os números de movimentação do aeroporto saem no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Quanto custa o estacionamento no Terminal 1 do Aeroporto de Guarulhos?

Em 17 de setembro de 2026, o oficial do T1 cobrava R$ 31,00 na primeira hora e R$ 79,00 na diária. Na faixa de 11 a 17 diárias, R$ 480,00, e na de 18 a 30, R$ 505,00. É o setor Standard, que atende os Terminais 1 e 2.

### O Terminal 1 de Guarulhos tem estacionamento coberto?

Não, o oficial não tem. Como o edifício garagem e o Premium atendem os Terminais 2 e 3, no T1 só existe pátio Standard descoberto. Quem quer o carro sob teto usa a vaga coberta de um pátio parceiro, a partir de R$ 350,00 em quinze diárias, ou estaciona em outro terminal.

### Qual estacionamento fica mais perto do Terminal 1 de Guarulhos?

O oficial, porque fica dentro do complexo. Entre os parceiros da Movepark, o Aeropark, a 1,88 km do T1 em linha reta, que é a menor distância da praça. Ele declara traslado de 10 minutos e van a cada 30. A Pare Seguro fica a 3,97 km.

### Quanto se economiza estacionando fora do Terminal 1?

Em uma semana, R$ 327,70, ou 71,2%. Ali o oficial cobra R$ 460,00, em 17 de setembro de 2026, e a vaga descoberta da Pare Seguro e a do Aeropark saem por R$ 132,30, nas tabelas de 3 e de 13 de novembro de 2026. Em quinze diárias a diferença é de R$ 196,50, e em trinta, de R$ 215,00. No mês, só as vagas do Aeropark custam mais que o oficial.

### Quanto custa uma hora no estacionamento do Terminal 1?

R$ 31,00 no setor Standard, em 17 de setembro de 2026. Para quem fica poucas horas, o oficial também sai mais barato que os parceiros, que só aceitam a partir de duas diárias (R$ 37,80 na descoberta da Pare Seguro, tabela de 3 de novembro de 2026).

### O estacionamento do Terminal 1 aceita tag de pedágio?

Sim. A página do operador lista Sem Parar, ConectCar, Veloe e Taggy, além de dinheiro, cartões de crédito e débito e pagamento por QR Code no ticket. A informação é do próprio operador, conferida em 17 de setembro de 2026.

### O preço muda se eu embarcar no Terminal 1 e não no Terminal 3?

No oficial muda, porque a tarifa é do setor. O T1 usa o Standard, que é o mais barato. Já o T3 só tem setores mais caros, com R$ 130,00 de diferença na faixa de 11 a 17 diárias. Nos pátios parceiros a tabela é a mesma para os três terminais.$f1$
   where id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and md5(coalesce(body_md, '')) = 'd81cc38a06846b6cd4d796439ba3518b';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.pt', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.pt · meta_description
  update public.blog_post set meta_description = $f2$Estacionamento no Terminal 1 do Aeroporto de Guarulhos: setor e preço. Diária a partir de R$ 18,90 em novembro de 2026. Compare e reserve pela Movepark.$f2$
   where id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and md5(coalesce(meta_description, '')) = '9e358584fc8882855e16f0fcad062ed2';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.pt', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.en · body_md
  update public.blog_post_i18n set body_md = $f3$Parking at Terminal 1 of Guarulhos Airport has the lowest rate in the complex and no covered option. T1 is served only by the Standard sector, which charges R$ 31.00 for the first hour and R$ 480.00 in the 11 to 17-day band. Anyone who wants a covered spot has to go to another terminal or to an outside lot, where a covered spot starts at R$ 350.00 over 15 days. The official car park was checked on 17 September 2026, and the cheapest outside lot is on its table of 3 November 2026.

| Quick answer | Official on 17/09/2026, Pare Seguro on 03/11/2026, Aeropark on 13/11/2026 |
| --- | --- |
| Official sector serving T1 | Standard, and only it |
| Is there an official covered spot at T1? | no, the multi-storey car park serves T2 and T3 |
| First hour at the official T1 car park | R$ 31.00 |
| Single day at the official T1 car park | R$ 79.00 |
| 15 days at the official T1 car park | R$ 480.00 |
| 15 days at Pare Seguro, uncovered spot | R$ 290.00 |
| 15 days at Aeropark, uncovered spot | R$ 283.50 |
| Closest partner to T1 | Aeropark, 1.88 km as the crow flies |

## Which sector serves parking at Terminal 1 in Guarulhos?

São Paulo/Guarulhos Governador André Franco Montoro International Airport, IATA code GRU, has three passenger terminals. Terminal 1 is the oldest, concentrates domestic flights and is the only one served by a single sector.

| Official sector | Serves | First hour | Single day |
| --- | --- | --- | --- |
| Standard | Terminals 1 and 2 | R$ 31.00 | R$ 79.00 |
| Premium and multi-storey car park | Terminals 2 and 3 | R$ 38.00 | R$ 107.00 |
| Flex | Terminal 3 | R$ 38.00 | R$ 107.00 |

The split by sector has two effects, and both are worth knowing before driving out there.

The first is good for your wallet: **anyone departing from T1 pays the lowest official table**. That is R$ 7.00 less for the first hour. And R$ 28.00 less for a day, against anyone using Premium or the multi-storey car park.

The second is a limitation: **there is no official covered spot at Terminal 1**. The multi-storey car park serves Terminals 2 and 3. In other words, anyone who wants the car under a roof inside the complex has to park at another terminal and travel across.

## How much does parking at Terminal 1 of Guarulhos Airport cost?

The table charges by length-of-stay band, not by a daily rate multiplied out. The figures below are for Standard, which is the T1 sector. All read from the table published by the operator and checked on 17 September 2026.

| Length of stay | Total at the official T1 car park |
| --- | --- |
| Up to 1 hour | R$ 31.00 |
| Up to 2 hours | R$ 54.00 |
| Up to 3 hours | R$ 62.00 |
| Up to 4 hours | R$ 70.00 |
| Up to 1 day | R$ 79.00 |
| 2 days | R$ 157.00 |
| 3 days | R$ 223.00 |
| 4 days | R$ 290.00 |
| 5 days | R$ 360.00 |
| 6 to 10 days | R$ 460.00 |
| 11 to 17 days | R$ 480.00 |
| 18 to 30 days | R$ 505.00 |
| Over 30 days | the 30-day package plus R$ 19.90 a day |

Two readings matter. First: the bands are **totals**, not per-day figures. A fifteen-day trip falls into the 11-to-17-day band and pays R$ 480.00, the same as a seventeen-day one.

Second: the curve is steep up to the fifth day and almost flat after that. Five days cost R$ 360.00 and ten cost R$ 460.00. So the price per day drops from R$ 72.00 to R$ 46.00 across that interval.

### What does a day come to in each T1 band?

Looking at the per-day figure changes the decision, and the official table hides it.

| Standard band | Total | Per-day figure at the top of the band |
| --- | --- | --- |
| Up to 1 day | R$ 79.00 | R$ 79.00 |
| 2 days | R$ 157.00 | R$ 78.50 |
| 5 days | R$ 360.00 | R$ 72.00 |
| 6 to 10 days | R$ 460.00 | R$ 46.00 |
| 11 to 17 days | R$ 480.00 | R$ 28.24 |
| 18 to 30 days | R$ 505.00 | R$ 16.83 |

In other words, the per-day figure drops from R$ 79.00 to R$ 16.83 as the stay stretches. It is the same logic as the partners, with very different floors. At Aeropark's uncovered spot, on its table of 13 November 2026, a day costs R$ 19.90 for 2 to 6 days and falls to R$ 17.90 from 18 days up. At Pare Seguro, on its table of 3 November 2026, a day costs R$ 18.90 up to 14 days, and from 15 to 30 the total is flat at R$ 290.00. Over thirty days, the official car park comes to R$ 16.83 a day, above Pare Seguro's R$ 9.67 for an uncovered spot and below Aeropark's R$ 17.90.

## What does the alternative outside the complex cost for a T1 departure?

Besides the official T1 car park, Movepark has two partner lots in this location, both with a van transfer. With Pare Seguro on its table of 3 November 2026 and Aeropark on its table of 13 November 2026, the two tie on an uncovered spot from 7 to 14 days, and Aeropark is cheaper for a covered spot up to 14. Pare Seguro comes in lower for a covered spot from 15 days and for an uncovered one from 16. Only Aeropark has valet.

| Length of stay | Uncovered spot | Covered spot | Valet |
| --- | --- | --- | --- |
| 2 days at Pare Seguro | R$ 37.80 | R$ 57.80 | not offered |
| 2 days at Aeropark | R$ 39.80 | R$ 53.80 | R$ 179.80 |
| 7 days at Pare Seguro | R$ 132.30 | R$ 202.30 | not offered |
| 7 days at Aeropark | R$ 132.30 | R$ 174.30 | R$ 593.90 |
| 15 days at Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 15 days at Aeropark | R$ 283.50 | R$ 373.50 | R$ 692.90 |
| 30 days at Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 30 days at Aeropark | R$ 537.00 | R$ 717.00 | R$ 791.90 |

Neither takes a single day: both work with a 2-day minimum stay. The live price is in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos), with the date of each table's last update.

## How much do you save by leaving the official car park at Terminal 1?

The Standard sector of Terminal 1 has the lowest table in the complex. So this is the hardest comparison an outside lot faces in this location. The gap is wide over a week and narrows from the fortnight on, when Standard starts charging by band. For each length of stay, the table uses the cheaper uncovered spot of Pare Seguro (table of 3 November 2026) and Aeropark (table of 13 November 2026).

| Length of stay | Official Standard | Cheapest partner, uncovered | Difference |
| --- | --- | --- | --- |
| 2 days | R$ 157.00 | R$ 37.80 at Pare Seguro | R$ 119.20, or 75.9% |
| 7 days | R$ 460.00 | R$ 132.30 at both partners | R$ 327.70, or 71.2% |
| 15 days | R$ 480.00 | R$ 283.50 at Aeropark | R$ 196.50, or 40.9% |
| 30 days | R$ 505.00 | R$ 290.00 at Pare Seguro | R$ 215.00, or 42.6% |

It is worth noting where the official car park comes out ahead. Aeropark's valet costs R$ 692.90 over fifteen days, R$ 212.90 above the R$ 480.00 of Standard. If you want a valet and the lowest total, the sum does not work at the partner in that band.

Over thirty days, T1 Standard (R$ 505.00) comes in below two of the partners' four spot options, Aeropark's. Aeropark's uncovered spot costs R$ 537.00, R$ 32.00 more, and its covered spot R$ 717.00. Over the month, both of Pare Seguro's spots stay below the official car park: R$ 290.00 uncovered and R$ 350.00 covered.

## Where do you park under cover if the flight leaves from Terminal 1?

Since there is no official covered sector at T1, there are three routes for parking at Terminal 1 of Guarulhos Airport, and they cost quite differently.

| Covered option, 15 days | Total | What it charges in return |
| --- | --- | --- |
| Covered spot at a partner lot | R$ 350.00 to R$ 373.50 | a van transfer, 15 to 50 minutes |
| Multi-storey car park at T2 | R$ 610.00 | an internal journey between terminals |
| Valet at Aeropark | R$ 692.90 | a van transfer, with a valet |

Pare Seguro's covered spot comes in R$ 260.00 below the T2 multi-storey car park over the same fortnight, on its table of 3 November 2026, and Aeropark's, R$ 236.50 below, on its table of 13 November 2026. Over thirty days, Pare Seguro's covered spot costs R$ 350.00 against R$ 690.00, a difference of R$ 340.00. Aeropark's, at R$ 717.00, ends up R$ 27.00 above the multi-storey car park. Aeropark's valet also sits above it over the fortnight, by R$ 82.90.

In practice, anyone departing from T1 who wants a roof over the car spends less at Aeropark's covered spot on a trip of up to 14 days and at Pare Seguro's over a fortnight or a month, both below the multi-storey car park. The covered comparison by band is in the [Guarulhos parking price post](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## How far is the parking from Terminal 1 of Guarulhos Airport?

The good news about GRU Terminal 1 parking is the distance: it is the terminal closest to the partner lots, and by a wide margin.

| Partner lot | Distance from T1, straight line | Distance from T2 | Distance from T3 | Stated transfer |
| --- | --- | --- | --- | --- |
| Aeropark | 1.88 km | 2.65 km | 3.06 km | 10 minutes, van every 30 |
| Pare Seguro | 3.97 km | 4.51 km | 4.88 km | 10 minutes, van every 30 |

Distances are calculated in Movepark's database with PostGIS, as a straight line. All three terminals are registered as points of their own, so the measurement is per terminal, not an average of the complex.

The practical reading is direct. Aeropark sits 1.18 km closer to T1 than to T3. It is also 2.09 km ahead of Pare Seguro. The proximity barely shows in the weekly price: for an uncovered spot both charge the same from 7 to 14 days. On a long stay the sum turns towards Pare Seguro, which charges a flat R$ 290.00 from 15 to 30 days for an uncovered spot, R$ 247.00 less than Aeropark over a month.

## How much time should you add to the journey when departing from Terminal 1?

The time block is the smallest in this location, because T1 is the terminal closest to both lots.

At both partners, the page states a 10-minute transfer and a van every 30 minutes. Adding the wait, the ride and the walk to the desk, that is 15 to 50 minutes between entering the lot and being at the terminal. Allow about 40 minutes, and put that block **before** the airline's check-in deadline.

So even in this location's best case, the outside lot charges time. That is what the official car park sells for R$ 31.00 in the first hour: a walk instead of a van. The full door-to-door time sum is in the post on [parking near Guarulhos Airport](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## How much does it cost to pick someone up at Terminal 1?

The hourly rate is the question of someone who is not travelling, and the Terminal 1 table answers it directly.

| Time in the lot | Standard, at T1 |
| --- | --- |
| Up to 1 hour | R$ 31.00 |
| Up to 2 hours | R$ 54.00 |
| Up to 3 hours | R$ 62.00 |
| Up to 4 hours | R$ 70.00 |

For that use, the official car park is the obvious choice. It is a walk from the terminal, with no van in the way, and that solves an arrival with a delayed flight.

It wins on money too in that band. The first hour costs R$ 31.00, and the partners only take stays from two days, which come to R$ 37.80 for Pare Seguro's uncovered spot.

## What does staying more than thirty days at the Terminal 1 car park cost?

The longest band works differently from the others. Above 30 days, the official car park charges the 30-day package and adds **R$ 19.90 per extra day**, which is Standard's fixed daily rate.

In practice, 45 days at T1 come to R$ 505.00 for the package plus R$ 298.50 for the fifteen extra days. So the total lands at R$ 803.50.

At Pare Seguro's uncovered spot, the table of 3 November 2026 charges a flat R$ 290.00 from 15 to 30 days and goes back to R$ 18.90 a day after that. Forty-five days come to R$ 573.50, R$ 230.00 below the official car park. At Pare Seguro's covered spot, at R$ 28.90 a day beyond 30, they come to R$ 783.50, also below. At Aeropark's uncovered and covered spots, 45 days already go above the official car park.

## Is it worth swapping Terminal 1 for Terminal 2 to park?

The question of switching terminals comes up a lot for anyone comparing parking at Terminal 1 of Guarulhos Airport. The rate belongs to **the sector the car sits in**, not to the terminal you depart from. Since Standard serves Terminals 1 and 2, anyone departing from T1 gains nothing by switching lots: the price is the same at both.

The switch only makes sense for another reason, which is cover. The multi-storey car park is at T2, and there the 11-to-17-day band costs R$ 610.00, against R$ 480.00 for Standard.

Three points to decide by:

- **If you only want the lowest price inside the complex**, stay in your own T1 Standard.
- **If you want a roof over the car**, compare the R$ 130.00 extra of the multi-storey car park with a partner's covered spot, from R$ 350.00 over fifteen days.
- **If the flight is at night**, bear in mind that the internal journey with luggage happens in both directions.

### What changes on the way back, on arrival at T1?

On the way back, what decides is not the price but where the car is. Anyone who left it at the official car park walks from the terminal to the lot. Anyone who left it at an outside lot has to call the van and wait for it.

Both partners operate 24 hours according to their pages, so there is someone to call at any hour, and both state a van every 30 minutes.

Both also state 60 minutes of grace on collection, which is the slack for a delayed flight without it turning into a new day's charge.

## How does payment work at the official Terminal 1 car park?

The operator's page lists what the official car park accepts, and that settles the question for someone already on the motorway. On 17 September 2026 it accepted:

- **Cash**, in Brazilian reais only.
- **Credit and debit cards**.
- **Electronic toll tags**: Sem Parar, ConectCar, Veloe and Taggy.
- **QR Code**, scanning the ticket with a phone.

The operator also states that vehicles are insured against theft and robbery, under Guarulhos municipal law nº 13,912/2010. And that booking ahead gives access to a dedicated barrier, with a QR Code voucher.

At the partner lots, the payment method is the one for a Movepark booking. What each unit states on its page is in [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) and [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## Who fits each option at Terminal 1?

Five profiles cover everyone using parking at Terminal 1 of Guarulhos Airport. The official figures are from 17 September 2026, Pare Seguro's from its table of 3 November 2026, and Aeropark's from its table of 13 November 2026:

- **Picking someone up or dropping them off:** official Standard, at R$ 31.00 for the first hour, because there is no van.
- **A one-day there-and-back:** the official car park, at R$ 79.00, because the partners only take stays from two days. If the return goes past 24 hours, Pare Seguro comes to R$ 37.80 for two days in an uncovered spot.
- **A week's travel:** a partner, in an uncovered or covered spot, which comes in R$ 257.70 to R$ 327.70 below the official car park.
- **A whole month:** Pare Seguro, uncovered at R$ 290.00 or covered at R$ 350.00, R$ 215.00 and R$ 155.00 below the official car park. At Aeropark, the official car park comes out cheaper over the month.
- **Anyone who wants cover:** a partner's covered spot, from R$ 350.00 over fifteen days, since T1 has no covered sector.

## When does the official Terminal 1 car park not pay off?

Two situations where the gap becomes indefensible for anyone looking for parking at Terminal 1 of Guarulhos Airport.

**A five-day trip.** The official car park charges R$ 360.00, and the partner charges R$ 94.50 for those same five days in Pare Seguro's uncovered spot. That is R$ 265.50 of difference on a short trip.

**A fifteen-day trip.** That is R$ 480.00 at the official car park against R$ 283.50 for Aeropark's uncovered spot. The difference, R$ 196.50, pays for more than ten days at the outside lot.

On a month-long stay, the outside lot's advantage depends on the lot. Both of Pare Seguro's spots come in below the official T1 car park, by R$ 215.00 uncovered and R$ 155.00 covered, and Aeropark's come in above.

Anyone after the lowest possible total will find the full route in [how to park cheaply at Guarulhos Airport](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## A five-step routine for Terminal 1

What to do before leaving home, in order:

1. Confirm the flight departs from T1, because at the official car park that sets the sector and the price.
2. Add up the real length of stay, with slack on the return, and look at the band, not the daily rate.
3. If you want a covered spot, know that it does not exist at T1 and compare the three options above.
4. Simulate the same period in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos) and compare totals.
5. If you choose the outside lot, check the minimum stay and book on the online table.

## Does Terminal 1 have motorcycle parking?

The table published by the operator does not break out a figure for motorcycles in any sector. So the honest answer is that the data is not in the source. It is worth calling before counting on a space.

On the partners' side, the Movepark system has a spot type for motorcycles. So the price index separates motorcycle from car when the unit offers it. On 27 November 2026, neither of the two Guarulhos units had an active motorcycle table. Aeropark published uncovered, covered and valet spots, and Pare Seguro uncovered, covered and Vaga Max, for large vehicles. Pare Seguro states motorcycle spaces on its page, with no motorcycle table in the engine.

In other words, in Guarulhos the motorcycle still has no published price on either side. Anyone who needs it should confirm by phone with their chosen lot, and it is a gap worth recording.

## How were these prices gathered?

The partner lots' prices came from the booking engine: Pare Seguro's on its table of **3 November 2026** and Aeropark's on its table of **13 November 2026** (its valet stays on the table of 19 October). It is the same figure that closes the booking, published in the price index with the date of each table's last update.

The official car park's price **does not pass through the Movepark engine**. It was read by hand from the table the operator publishes on the airport's site, as an image, and checked on 17 September 2026. That is why every official figure here carries the date beside it. It can change without notice, and no system tells us when it does. The split by sector, the payment methods and the reference to the municipal law also come from that same page.

Distances are calculated in the database with PostGIS, as a straight line between the lot's coordinates and each terminal's. Transfer time and van frequency are stated by each unit on its page. They appear as the unit's own statement, not as a Movepark promise. When a field is not stated, the text says so.

Airport traffic figures are on the [ANAC statistics portal](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Frequently asked questions

### How much does parking at Terminal 1 of Guarulhos Airport cost?

On 17 September 2026, the official T1 car park charged R$ 31.00 for the first hour and R$ 79.00 for a day. In the 11-to-17-day band, R$ 480.00, and in the 18-to-30 band, R$ 505.00. That is the Standard sector, which serves Terminals 1 and 2.

### Does Terminal 1 in Guarulhos have covered parking?

No, the official car park does not. Since the multi-storey car park and Premium serve Terminals 2 and 3, at T1 there is only an uncovered Standard lot. Anyone who wants the car under a roof uses a covered spot at a partner lot, from R$ 350.00 over fifteen days, or parks at another terminal.

### Which car park is closest to Terminal 1 in Guarulhos?

The official one, because it is inside the complex. Among the Movepark partners, Aeropark, 1.88 km from T1 as the crow flies, which is the shortest distance in this location. It states a 10-minute transfer and a van every 30. Pare Seguro is 3.97 km away.

### How much do you save by parking outside Terminal 1?

Over a week, R$ 327.70, or 71.2%. There the official car park charges R$ 460.00, on 17 September 2026, and the uncovered spots at Pare Seguro and Aeropark come to R$ 132.30, on their tables of 3 and 13 November 2026. Over fifteen days the difference is R$ 196.50, and over thirty, R$ 215.00. Over the month, only Aeropark's spots cost more than the official car park.

### How much does an hour at the Terminal 1 car park cost?

R$ 31.00 in the Standard sector, on 17 September 2026. For a stay of a few hours, the official car park is also cheaper than the partners, which only take stays from two days (R$ 37.80 for Pare Seguro's uncovered spot, table of 3 November 2026).

### Does the Terminal 1 car park accept toll tags?

Yes. The operator's page lists Sem Parar, ConectCar, Veloe and Taggy, along with cash, credit and debit cards, and payment by QR Code on the ticket. The information is the operator's own, checked on 17 September 2026.

### Does the price change if I depart from Terminal 1 and not Terminal 3?

At the official car park it does, because the rate belongs to the sector. T1 uses Standard, which is the cheapest. T3 only has more expensive sectors, with R$ 130.00 of difference in the 11-to-17-day band. At the partner lots the table is the same for all three terminals.$f3$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'en' and md5(coalesce(body_md, '')) = 'facbe2376cfd76e56beea6851b040c7f';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.en', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.en · excerpt
  update public.blog_post_i18n set excerpt = $f4$T1 has the lowest rate in the complex and no covered option. The Standard sector charges R$ 31.00 for the first hour and R$ 480.00 over 11 to 17 days; a partner's covered spot starts at R$ 350.00.$f4$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'en' and md5(coalesce(excerpt, '')) = 'd253e6c2d99a6d2b0e92611a643f54f7';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.en', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.en · meta_description
  update public.blog_post_i18n set meta_description = $f5$Parking at Terminal 1 of Guarulhos Airport: sector and price. A day from R$ 18.90 in November 2026. Compare and book with Movepark.$f5$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'en' and md5(coalesce(meta_description, '')) = '2d3b1014878677209963c8505f29ae61';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.en', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.es · body_md
  update public.blog_post_i18n set body_md = $f6$El estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos tiene la tarifa más baja del complejo y ninguna opción cubierta. La T1 está atendida solo por el sector Standard, que cobra R$ 31,00 la primera hora y R$ 480,00 en la franja de 11 a 17 días. Quien quiere plaza cubierta tiene que ir a otra terminal o a un predio de afuera, donde la cubierta sale desde R$ 350,00 en 15 días. El oficial se consultó el 17 de septiembre de 2026, y el predio de afuera más barato está en su tabla del 3 de noviembre de 2026.

| Respuesta rápida | Oficial al 17/09/2026, Pare Seguro al 03/11/2026, Aeropark al 13/11/2026 |
| --- | --- |
| Sector del oficial que atiende la T1 | Standard, y solo él |
| ¿Hay plaza cubierta oficial en la T1? | no, el edificio cochera atiende T2 y T3 |
| Primera hora en el oficial de la T1 | R$ 31,00 |
| Diaria suelta en el oficial de la T1 | R$ 79,00 |
| 15 días en el oficial de la T1 | R$ 480,00 |
| 15 días en Pare Seguro, plaza descubierta | R$ 290,00 |
| 15 días en Aeropark, plaza descubierta | R$ 283,50 |
| Asociado más cerca de la T1 | Aeropark, a 1,88 km en línea recta |

## ¿Qué sector atiende el estacionamiento de la Terminal 1 de Guarulhos?

El Aeropuerto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tiene tres terminales de pasajeros. La Terminal 1 es la más antigua, concentra vuelos domésticos y es la única atendida por un solo sector.

| Sector del oficial | Atiende | Primera hora | Diaria suelta |
| --- | --- | --- | --- |
| Standard | Terminales 1 y 2 | R$ 31,00 | R$ 79,00 |
| Premium y edificio cochera | Terminales 2 y 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

La división por sector tiene dos efectos, y los dos vale conocerlos antes de manejar hasta ahí.

El primero es bueno para el bolsillo: **quien embarca en la T1 paga la tabla más baja del oficial**. Son R$ 7,00 menos en la primera hora. Y R$ 28,00 menos en la diaria, contra quien usa Premium o edificio cochera.

El segundo es una limitación: **no existe plaza cubierta oficial en la Terminal 1**. El edificio cochera atiende las Terminales 2 y 3. O sea, quien quiere el auto bajo techo dentro del complejo tiene que estacionar en otra terminal y trasladarse.

## ¿Cuánto cuesta el estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos?

La tabla cobra por franja de permanencia, y no por diaria multiplicada. Los valores de abajo son los del Standard, que es el sector de la T1. Todos leídos en la tabla publicada por el operador y verificados el 17 de septiembre de 2026.

| Permanencia | Total en el oficial de la T1 |
| --- | --- |
| Hasta 1 hora | R$ 31,00 |
| Hasta 2 horas | R$ 54,00 |
| Hasta 3 horas | R$ 62,00 |
| Hasta 4 horas | R$ 70,00 |
| Hasta 1 día | R$ 79,00 |
| 2 días | R$ 157,00 |
| 3 días | R$ 223,00 |
| 4 días | R$ 290,00 |
| 5 días | R$ 360,00 |
| De 6 a 10 días | R$ 460,00 |
| De 11 a 17 días | R$ 480,00 |
| De 18 a 30 días | R$ 505,00 |
| Más de 30 días | el paquete de 30 días más R$ 19,90 por día |

Dos lecturas importan. La primera: las franjas son **totales**, no valores por día. Un viaje de quince días cae en la franja de 11 a 17 días y paga R$ 480,00, lo mismo que pagaría uno de diecisiete.

La segunda: la curva es empinada hasta el quinto día y casi plana después. Cinco días cuestan R$ 360,00 y diez cuestan R$ 460,00. Por lo tanto, el precio por día cae de R$ 72,00 a R$ 46,00 en ese intervalo.

### ¿Cuánto sale el día en cada franja de la T1?

Mirar el valor por día cambia la decisión, y la tabla del oficial lo esconde.

| Franja del Standard | Total | Valor por día en el límite de la franja |
| --- | --- | --- |
| Hasta 1 día | R$ 79,00 | R$ 79,00 |
| 2 días | R$ 157,00 | R$ 78,50 |
| 5 días | R$ 360,00 | R$ 72,00 |
| De 6 a 10 días | R$ 460,00 | R$ 46,00 |
| De 11 a 17 días | R$ 480,00 | R$ 28,24 |
| De 18 a 30 días | R$ 505,00 | R$ 16,83 |

O sea, el valor por día cae de R$ 79,00 a R$ 16,83 conforme la estadía se estira. Es la misma lógica de los asociados, con pisos muy distintos. En la plaza descubierta de Aeropark, en su tabla del 13 de noviembre de 2026, el día sale R$ 19,90 de 2 a 6 días y baja hasta R$ 17,90 desde 18 días. En Pare Seguro, en su tabla del 3 de noviembre de 2026, el día sale R$ 18,90 hasta 14 días, y de 15 a 30 el total es fijo en R$ 290,00. En treinta días, el oficial sale R$ 16,83 por día, por encima de los R$ 9,67 de la descubierta de Pare Seguro y por debajo de los R$ 17,90 de la descubierta de Aeropark.

## ¿Cuánto sale la alternativa fuera del complejo para quien embarca en la T1?

Además del estacionamiento oficial de la T1, Movepark tiene dos predios asociados en la zona, los dos con traslado en combi. Con Pare Seguro en su tabla del 3 de noviembre de 2026 y Aeropark en la del 13 de noviembre de 2026, los dos empatan en plaza descubierta de 7 a 14 días, y Aeropark sale más barato en la cubierta hasta 14. Pare Seguro queda por debajo en la cubierta desde 15 días y en la descubierta desde 16. Solo Aeropark tiene valet.

| Permanencia | Plaza descubierta | Plaza cubierta | Valet |
| --- | --- | --- | --- |
| 2 días en Pare Seguro | R$ 37,80 | R$ 57,80 | no ofrece |
| 2 días en Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 días en Pare Seguro | R$ 132,30 | R$ 202,30 | no ofrece |
| 7 días en Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 días en Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 15 días en Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 días en Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 30 días en Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Ninguno de los dos acepta día suelto: los dos trabajan con una permanencia mínima de 2 días. El precio en vivo está en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), con la fecha de la última actualización de cada tabla.

## ¿Cuánto se ahorra saliendo del oficial en la Terminal 1?

El sector Standard de la Terminal 1 tiene la tabla más baja del complejo. Por lo tanto, esta es la comparación más dura que enfrenta el predio de afuera en la zona. La diferencia es grande en la semana y se achica a partir de la quincena, cuando el Standard pasa a cobrar por franja. La tabla usa, en cada duración, la plaza descubierta más barata entre Pare Seguro (tabla del 3 de noviembre de 2026) y Aeropark (tabla del 13 de noviembre de 2026).

| Permanencia | Oficial Standard | Asociado más barato, descubierta | Diferencia |
| --- | --- | --- | --- |
| 2 días | R$ 157,00 | R$ 37,80 en Pare Seguro | R$ 119,20, o un 75,9% |
| 7 días | R$ 460,00 | R$ 132,30 en los dos asociados | R$ 327,70, o un 71,2% |
| 15 días | R$ 480,00 | R$ 283,50 en Aeropark | R$ 196,50, o un 40,9% |
| 30 días | R$ 505,00 | R$ 290,00 en Pare Seguro | R$ 215,00, o un 42,6% |

Vale notar dónde el oficial queda adelante. El valet de Aeropark cuesta R$ 692,90 en quince días, R$ 212,90 por encima de los R$ 480,00 del Standard. Si querés valet y el menor total, la cuenta no cierra en el asociado en esa franja.

En treinta días, el Standard de la T1 (R$ 505,00) queda por debajo de dos de las cuatro plazas de los asociados, las de Aeropark. La descubierta de Aeropark cuesta R$ 537,00, R$ 32,00 más, y la cubierta, R$ 717,00. En el mes, las dos plazas de Pare Seguro siguen por debajo del oficial: R$ 290,00 en la descubierta y R$ 350,00 en la cubierta.

## ¿Dónde estacionar cubierto si el vuelo sale de la Terminal 1?

Como no existe sector cubierto oficial en la T1, hay tres caminos para el estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos, y cuestan bastante distinto.

| Opción cubierta, 15 días | Total | Qué cobra a cambio |
| --- | --- | --- |
| Plaza cubierta en predio asociado | de R$ 350,00 a R$ 373,50 | traslado en combi, de 15 a 50 minutos |
| Edificio cochera en la T2 | R$ 610,00 | traslado interno entre terminales |
| Valet en Aeropark | R$ 692,90 | traslado en combi, con valet |

La cubierta de Pare Seguro sale R$ 260,00 por debajo del edificio cochera de la T2 en la misma quincena, en su tabla del 3 de noviembre de 2026, y la de Aeropark, R$ 236,50 por debajo, en la del 13 de noviembre de 2026. En treinta días, la cubierta de Pare Seguro cuesta R$ 350,00 contra R$ 690,00, o R$ 340,00 de diferencia. La de Aeropark, a R$ 717,00, pasa a costar R$ 27,00 más que el edificio cochera. El valet de Aeropark también queda por encima de él en la quincena, por R$ 82,90.

En la práctica, quien embarca en la T1 y quiere techo sobre el auto gasta menos en la cubierta de Aeropark en viajes de hasta 14 días y en la de Pare Seguro en la quincena y el mes, las dos por debajo del edificio cochera. La comparación de cobertura por franja está en el [post de precio del estacionamiento en Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## ¿A qué distancia queda el estacionamiento de la Terminal 1 del Aeropuerto de Guarulhos?

La buena noticia del estacionamiento GRU Terminal 1 es la distancia: es la terminal más cerca de los predios asociados, y por un margen grande.

| Predio asociado | Distancia de la T1, en línea recta | Distancia de la T2 | Distancia de la T3 | Traslado declarado |
| --- | --- | --- | --- | --- |
| Aeropark | 1,88 km | 2,65 km | 3,06 km | 10 minutos, combi cada 30 |
| Pare Seguro | 3,97 km | 4,51 km | 4,88 km | 10 minutos, combi cada 30 |

Las distancias se calculan en la base de datos de Movepark con PostGIS, en línea recta. Las tres terminales están registradas como puntos propios, así que la medida es por terminal, y no un promedio del complejo.

La lectura práctica es directa. Aeropark queda 1,18 km más cerca de la T1 que de la T3. También está 2,09 km por delante de Pare Seguro. La cercanía casi no pesa en el precio de la semana: en plaza descubierta los dos cobran lo mismo de 7 a 14 días. En la estadía larga la cuenta se inclina hacia Pare Seguro, que cobra R$ 290,00 fijos de 15 a 30 días en la descubierta, R$ 247,00 menos que Aeropark en el mes.

## ¿Cuánto tiempo sumar al trayecto cuando el embarque es en la Terminal 1?

El bloque de tiempo es el menor de la zona, porque la T1 es la terminal más cercana a los dos predios.

En los dos asociados, la ficha declara traslado de 10 minutos y combi cada 30 minutos. Sumando espera, trayecto y caminata hasta el mostrador, dan de 15 a 50 minutos entre entrar al predio y estar en la terminal. Reservá unos 40 minutos, y poné ese bloque **antes** del plazo de check-in de la aerolínea.

Así, incluso en el mejor caso de la zona, el predio de afuera cobra tiempo. Es eso lo que el oficial vende en la primera hora de R$ 31,00: caminata en vez de combi. La cuenta completa de tiempo puerta a puerta está en el post sobre [estacionamiento cerca del Aeropuerto de Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## ¿Cuánto cuesta buscar a alguien en la Terminal 1?

La tarifa por hora es la consulta de quien no va a viajar, y la tabla de la Terminal 1 responde directo.

| Tiempo en el predio | Standard, en la T1 |
| --- | --- |
| Hasta 1 hora | R$ 31,00 |
| Hasta 2 horas | R$ 54,00 |
| Hasta 3 horas | R$ 62,00 |
| Hasta 4 horas | R$ 70,00 |

Para ese uso, el oficial es la elección obvia. Queda a pie de la terminal, sin combi en el medio del camino, y eso resuelve un desembarque con vuelo demorado.

En dinero también gana en esa franja. La primera hora cuesta R$ 31,00, y los asociados solo aceptan estadías desde dos días, que salen R$ 37,80 en la descubierta de Pare Seguro.

## ¿Cuánto cuesta quedarse más de treinta días en el estacionamiento de la Terminal 1?

La franja más larga funciona distinto de las otras. Por encima de 30 días, el oficial cobra el paquete de 30 y suma **R$ 19,90 por día extra**, que es la diaria fija del Standard.

En la práctica, 45 días en la T1 dan R$ 505,00 del paquete más R$ 298,50 de los quince días extra. Así, el total queda en R$ 803,50.

En la plaza descubierta de Pare Seguro, la tabla del 3 de noviembre de 2026 cobra R$ 290,00 fijos de 15 a 30 días y vuelve a R$ 18,90 por día después. Cuarenta y cinco días salen R$ 573,50, R$ 230,00 por debajo del oficial. En la cubierta de Pare Seguro, a R$ 28,90 por día después de 30, salen R$ 783,50, también por debajo. En la descubierta y en la cubierta de Aeropark, los 45 días ya superan al oficial.

## ¿Conviene cambiar la Terminal 1 por la Terminal 2 para estacionar?

La duda sobre cambiar de terminal aparece mucho en quien compara el estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos. La tarifa es **del sector en el que queda el auto**, y no de la terminal desde la que embarcás. Como el Standard atiende las Terminales 1 y 2, quien embarca en la T1 no gana nada cambiando de predio: el precio es el mismo en los dos.

El cambio solo tiene sentido por otro motivo, que es la cobertura. El edificio cochera queda en la T2, y ahí la franja de 11 a 17 días cuesta R$ 610,00, contra R$ 480,00 del Standard.

Tres puntos para decidir:

- **Si querés solo el menor precio dentro del complejo**, quedate en el Standard de la propia T1.
- **Si querés techo sobre el auto**, compará los R$ 130,00 de más del edificio cochera con la cubierta del asociado, desde R$ 350,00 en quince días.
- **Si el vuelo es de madrugada**, considerá que el traslado interno con equipaje ocurre en los dos sentidos.

### ¿Qué cambia a la vuelta, en el desembarque de la T1?

A la vuelta, lo que decide no es el precio, sino dónde está el auto. Quien lo dejó en el oficial camina de la terminal al predio. Quien lo dejó en el predio de afuera necesita llamar a la combi y esperarla.

Los dos asociados funcionan 24 horas según la ficha, así que hay alguien a quien llamar en cualquier horario, y los dos declaran combi cada 30 minutos.

Además, los dos declaran 60 minutos de tolerancia en el retiro, que es la holgura para un vuelo demorado sin que se vuelva una diaria nueva.

## ¿Cómo funciona el pago en el estacionamiento oficial de la Terminal 1?

La página del operador lista lo que acepta el oficial, y eso resuelve la duda de quien ya está en la ruta. El 17 de septiembre de 2026 aceptaba:

- **Efectivo**, solamente en reales.
- **Tarjetas** de crédito y débito.
- **Telepeajes electrónicos**: Sem Parar, ConectCar, Veloe y Taggy.
- **Código QR**, escaneando el ticket con el celular.

El operador también informa que los vehículos están asegurados contra robo y hurto, conforme la ley municipal de Guarulhos nº 13.912/2010. Y que la reserva anticipada da acceso a una barrera propia, con voucher por código QR.

En los predios asociados, la forma de pago es la de la reserva por Movepark. Lo que declara cada unidad en su ficha está en [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) y [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## ¿Quién encaja en cada opción en la Terminal 1?

Cinco perfiles cubren a quien usa el estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos. Los valores del oficial son del 17 de septiembre de 2026, los de Pare Seguro, de su tabla del 3 de noviembre de 2026, y los de Aeropark, de la del 13 de noviembre de 2026:

- **Buscar o llevar a alguien:** oficial Standard, a R$ 31,00 la primera hora, por la ausencia de combi.
- **Ida y vuelta de un día:** el oficial, a R$ 79,00, porque los asociados solo aceptan desde dos días. Si la vuelta pasa de 24 horas, Pare Seguro sale R$ 37,80 por dos días en plaza descubierta.
- **Semana de viaje:** un asociado, en plaza descubierta o cubierta, que queda de R$ 257,70 a R$ 327,70 por debajo del oficial.
- **Un mes entero:** Pare Seguro, en plaza descubierta a R$ 290,00 o en cubierta a R$ 350,00, R$ 215,00 y R$ 155,00 por debajo del oficial. En Aeropark, el oficial sale más barato en el mes.
- **Quien quiere cobertura:** la cubierta del asociado, desde R$ 350,00 en quince días, ya que la T1 no tiene sector cubierto.

## ¿Cuándo no compensa el oficial de la Terminal 1?

Dos situaciones en que la diferencia queda indefendible para quien busca estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos.

**Viaje de cinco días.** El oficial cobra R$ 360,00, y el asociado cobra R$ 94,50 por esos mismos cinco días en la plaza descubierta de Pare Seguro. Son R$ 265,50 de diferencia en un viaje corto.

**Viaje de quince días.** Son R$ 480,00 en el oficial contra R$ 283,50 en la plaza descubierta de Aeropark. La diferencia, R$ 196,50, paga más de diez días en el predio de afuera.

En una estadía de un mes, la ventaja del predio de afuera depende del predio. Las dos plazas de Pare Seguro quedan por debajo del oficial de la T1, por R$ 215,00 en la descubierta y R$ 155,00 en la cubierta, y las de Aeropark quedan por encima.

Quien quiere el menor total posible encuentra el camino completo en [cómo estacionar barato en el Aeropuerto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## Una rutina de cinco pasos para la Terminal 1

Qué hacer antes de salir de casa, en orden:

1. Confirmá que el vuelo embarca en la T1, porque en el oficial eso define el sector y el precio.
2. Sumá la permanencia real, con holgura a la vuelta, y mirá la franja, no la diaria.
3. Si querés plaza cubierta, sabé que no existe en la T1 y compará las tres opciones de arriba.
4. Simulá el mismo período en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) y compará totales.
5. Si elegís el predio de afuera, verificá la permanencia mínima y reservá por la tabla en línea.

## ¿La Terminal 1 tiene estacionamiento para moto?

La tabla publicada por el operador no abre un valor para moto en ningún sector. O sea, la respuesta honesta es que ese dato no está en la fuente. Vale llamar antes de contar con la plaza.

Del lado de los asociados, el sistema de Movepark tiene tipo de plaza para moto. Así, el índice de precios separa moto de auto cuando la unidad lo ofrece. El 27 de noviembre de 2026, ninguna de las dos unidades de Guarulhos tenía tabla de moto activa. Aeropark publicaba plaza descubierta, cubierta y valet, y Pare Seguro, descubierta, cubierta y Vaga Max, para vehículo grande. Pare Seguro declara plazas para motos en la ficha, sin tabla de moto en el motor.

O sea, en Guarulhos la moto todavía no tiene precio publicado en ninguno de los dos lados. Quien lo necesite debe confirmar por teléfono con el predio elegido, y es una laguna que vale registrar.

## ¿Cómo se obtuvieron estos precios?

El precio de los predios asociados salió del motor de reservas: el de Pare Seguro en su tabla del **3 de noviembre de 2026** y el de Aeropark en la del **13 de noviembre de 2026** (el valet sigue en la del 19 de octubre). Es el mismo número que cierra la reserva, publicado en el índice de precios con la fecha de la última actualización de cada tabla.

El precio del estacionamiento oficial **no pasa por el motor de Movepark**. Se leyó a mano en la tabla que el operador publica en el sitio del aeropuerto, como imagen, y se verificó el 17 de septiembre de 2026. Por eso todo valor del oficial acá lleva la fecha al lado. Puede cambiar sin aviso, y ningún sistema nos avisa cuando cambia. La división por sector, las formas de pago y la referencia a la ley municipal también salen de esa misma página.

Las distancias se calculan en la base de datos con PostGIS, en línea recta entre las coordenadas del predio y de cada terminal. El tiempo de traslado y la frecuencia de la combi los declara cada unidad en su ficha. Aparecen como declaración de la unidad, y no como promesa de Movepark. Cuando un campo no está declarado, el texto lo dice.

Los números de movimiento del aeropuerto salen en el [portal de estadísticas de ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Preguntas frecuentes

### ¿Cuánto cuesta el estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos?

El 17 de septiembre de 2026, el oficial de la T1 cobraba R$ 31,00 la primera hora y R$ 79,00 la diaria. En la franja de 11 a 17 días, R$ 480,00, y en la de 18 a 30, R$ 505,00. Es el sector Standard, que atiende las Terminales 1 y 2.

### ¿La Terminal 1 de Guarulhos tiene estacionamiento cubierto?

No, el oficial no tiene. Como el edificio cochera y el Premium atienden las Terminales 2 y 3, en la T1 solo existe predio Standard descubierto. Quien quiere el auto bajo techo usa la plaza cubierta de un predio asociado, desde R$ 350,00 en quince días, o estaciona en otra terminal.

### ¿Qué estacionamiento queda más cerca de la Terminal 1 de Guarulhos?

El oficial, porque queda dentro del complejo. Entre los asociados de Movepark, Aeropark, a 1,88 km de la T1 en línea recta, que es la menor distancia de la zona. Declara traslado de 10 minutos y combi cada 30. Pare Seguro queda a 3,97 km.

### ¿Cuánto se ahorra estacionando fuera de la Terminal 1?

En una semana, R$ 327,70, o un 71,2%. Ahí el oficial cobra R$ 460,00, el 17 de septiembre de 2026, y las plazas descubiertas de Pare Seguro y de Aeropark salen R$ 132,30, en sus tablas del 3 y del 13 de noviembre de 2026. En quince días la diferencia es de R$ 196,50, y en treinta, de R$ 215,00. En el mes, solo las plazas de Aeropark cuestan más que el oficial.

### ¿Cuánto cuesta una hora en el estacionamiento de la Terminal 1?

R$ 31,00 en el sector Standard, el 17 de septiembre de 2026. Para quien se queda pocas horas, el oficial también sale más barato que los asociados, que solo aceptan desde dos días (R$ 37,80 en la descubierta de Pare Seguro, tabla del 3 de noviembre de 2026).

### ¿El estacionamiento de la Terminal 1 acepta telepeaje?

Sí. La página del operador lista Sem Parar, ConectCar, Veloe y Taggy, además de efectivo, tarjetas de crédito y débito y pago por código QR en el ticket. La información es del propio operador, verificada el 17 de septiembre de 2026.

### ¿El precio cambia si embarco en la Terminal 1 y no en la Terminal 3?

En el oficial cambia, porque la tarifa es del sector. La T1 usa el Standard, que es el más barato. La T3 solo tiene sectores más caros, con R$ 130,00 de diferencia en la franja de 11 a 17 días. En los predios asociados la tabla es la misma para las tres terminales.$f6$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'es' and md5(coalesce(body_md, '')) = 'bb590f3741a1ccdca9b9dee222c539ae';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.es', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.es · excerpt
  update public.blog_post_i18n set excerpt = $f7$La T1 tiene la tarifa más baja del complejo y ninguna opción cubierta. El sector Standard cobra R$ 31,00 la primera hora y R$ 480,00 de 11 a 17 días; la cubierta del asociado sale desde R$ 350,00.$f7$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'es' and md5(coalesce(excerpt, '')) = 'a674d3380937f3d9d623798c8c206bd3';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.es', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-1-aeroporto-guarulhos.es · meta_description
  update public.blog_post_i18n set meta_description = $f8$Estacionamiento en la Terminal 1 del Aeropuerto de Guarulhos: sector y precio. Diaria desde R$ 18,90 en noviembre de 2026. Compará y reservá con Movepark.$f8$
   where blog_post_id = 'ae214f5b-c207-47be-bd84-41b02089bc26' and locale = 'es' and md5(coalesce(meta_description, '')) = 'cac9054a9b64dfa5f1e343ccfcd67757';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-1-aeroporto-guarulhos.es', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.pt · body_md
  update public.blog_post set body_md = $f9$O estacionamento no Terminal 2 do Aeroporto de Guarulhos é o único que aparece nas duas tabelas do oficial. O T2 é atendido pelo setor Standard, o mais barato, e também pelo Premium e pelo edifício garagem. A diferença entre os dois chega a R$ 130,00 numa viagem de quinze dias. Fora do complexo, a mesma viagem sai por R$ 283,50 na vaga descoberta do Aeropark, a 2,65 km do T2, e por R$ 290,00 na Pare Seguro, a 4,51 km. O oficial foi conferido em 17 de setembro de 2026. A tabela do Aeropark é de 13 de novembro de 2026, e a da Pare Seguro, de 3 de novembro de 2026.

| Resposta rápida | Oficial em 17/09/2026, Pare Seguro em 03/11/2026, Aeropark em 13/11/2026 |
| --- | --- |
| Setores que atendem o T2 | Standard, Premium e edifício garagem |
| Primeira hora, setor Standard | R$ 31,00 |
| Diária avulsa, setor Standard | R$ 79,00 |
| 15 diárias, setor Standard | R$ 480,00 |
| 15 diárias, Premium ou edifício garagem | R$ 610,00 |
| 15 diárias no Aeropark, vaga descoberta | R$ 283,50 |
| Parceiro mais perto do T2 | Aeropark, a 2,65 km em linha reta |

## Quais setores atendem o estacionamento do Terminal 2 de Guarulhos?

O Aeroporto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tem três terminais de passageiros. O Terminal 2 fica no meio do complexo, e é o único servido pelas duas faixas de tarifa do estacionamento oficial, operado pela INDIGO Group Brasil.

| Setor do oficial | Atende | Primeira hora | Diária avulsa |
| --- | --- | --- | --- |
| Standard | Terminais 1 e 2 | R$ 31,00 | R$ 79,00 |
| Premium e edifício garagem | Terminais 2 e 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

Na prática, o estacionamento GRU Terminal 2 dá ao passageiro uma escolha que o do Terminal 3 não tem. Ele pode pagar a tabela mais barata do oficial, que o T3 não alcança, ou pagar o Premium e ficar no edifício garagem.

Ou seja, a pergunta no T2 não é só dentro ou fora do aeroporto. É também **qual dos dois setores do oficial**, e essa escolha vale mais de cem reais em viagem longa.

## Quanto custa o estacionamento no Terminal 2 do Aeroporto de Guarulhos?

A tabela do oficial cobra por faixa de permanência, e não por diária multiplicada. Abaixo estão as duas faixas que atendem o T2, lidas na tabela publicada pelo operador e conferidas em 17 de setembro de 2026.

| Permanência | Standard | Premium e edifício garagem | Diferença |
| --- | --- | --- | --- |
| Até 1 hora | R$ 31,00 | R$ 38,00 | R$ 7,00 |
| Até 2 horas | R$ 54,00 | R$ 67,00 | R$ 13,00 |
| Até 3 horas | R$ 62,00 | R$ 78,00 | R$ 16,00 |
| Até 4 horas | R$ 70,00 | R$ 89,00 | R$ 19,00 |
| Até 1 diária | R$ 79,00 | R$ 107,00 | R$ 28,00 |
| 2 diárias | R$ 157,00 | R$ 215,00 | R$ 58,00 |
| 3 diárias | R$ 223,00 | R$ 295,00 | R$ 72,00 |
| 4 diárias | R$ 290,00 | R$ 390,00 | R$ 100,00 |
| 5 diárias | R$ 360,00 | R$ 535,00 | R$ 175,00 |
| De 6 a 10 diárias | R$ 460,00 | R$ 565,00 | R$ 105,00 |
| De 11 a 17 diárias | R$ 480,00 | R$ 610,00 | R$ 130,00 |
| De 18 a 30 diárias | R$ 505,00 | R$ 690,00 | R$ 185,00 |

Duas leituras saem dessa tabela, e as duas contrariam o que a diária anunciada sugere.

A primeira: as faixas são **totais**, não valores por dia. Uma viagem de quinze dias cai na faixa de 11 a 17 diárias e paga R$ 480,00 no Standard, o mesmo que pagaria uma de dezessete.

A segunda: a curva é íngreme no meio e quase plana depois. Cinco diárias no Standard custam R$ 360,00, e dez custam R$ 460,00. São só R$ 100,00 por cinco dias a mais, então quem fica cinco dias paga caro por dia.

## Standard ou Premium: qual escolher no Terminal 2?

Como o setor Standard do Terminal 2 convive com o Premium, vale saber o que a diferença compra. Vaga coberta e acesso mais curto ao terminal vêm do Premium e do edifício garagem. Já o Standard é pátio comum.

Em números de 17 de setembro de 2026, a escolha custa assim:

- **Em uma hora**, R$ 7,00 a mais, o que é troco para quem vai buscar alguém.
- **Na diária avulsa**, R$ 28,00 a mais, mais que o valor de um dia na vaga descoberta do parceiro mais barato, R$ 18,90.
- **Em quinze diárias**, são R$ 130,00 a mais.
- **No mês fechado**, a diferença chega a R$ 185,00.

A regra prática: em permanência curta, a diferença é pequena e a cobertura pode valer. Em viagem longa, ela pesa: os R$ 130,00 a mais em quinze diárias passam de um terço dos R$ 350,00 que a vaga coberta da Pare Seguro cobra pelo mesmo período.

## Quanto sai a alternativa fora do complexo para quem embarca no T2?

Além do estacionamento oficial do T2, a Movepark tem dois pátios parceiros, os dois fora do complexo e com traslado de van. Com a tabela da Pare Seguro de 3 de novembro de 2026 e a do Aeropark de 13 de novembro de 2026, os dois empatam na vaga descoberta de 7 a 14 diárias, e o Aeropark sai mais barato na coberta até 14. A Pare Seguro fica abaixo na coberta a partir de 15 diárias e na descoberta a partir de 16. Só o Aeropark tem valet.

| Permanência | Vaga descoberta | Vaga coberta | Valet |
| --- | --- | --- | --- |
| 2 diárias, Pare Seguro | R$ 37,80 | R$ 57,80 | não oferece |
| 2 diárias, Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 diárias, Pare Seguro | R$ 132,30 | R$ 202,30 | não oferece |
| 7 diárias, Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 diárias, Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 15 diárias, Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 diárias, Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 30 diárias, Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Nenhum dos dois aceita diária avulsa: os dois trabalham com permanência mínima de 2 diárias. O preço vivo fica no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), com a data da última atualização de cada tabela.

## Quanto se economiza saindo do oficial no Terminal 2?

A comparação abaixo usa o Standard, que é a opção mais barata do estacionamento no Terminal 2 do Aeroporto de Guarulhos. Portanto, é a comparação mais dura possível para o pátio de fora.

| Permanência | Oficial Standard | Parceiro mais barato, descoberta | Diferença |
| --- | --- | --- | --- |
| 2 diárias | R$ 157,00 | R$ 37,80 na Pare Seguro | R$ 119,20, ou 75,9% |
| 7 diárias | R$ 460,00 | R$ 132,30 nos dois parceiros | R$ 327,70, ou 71,2% |
| 15 diárias | R$ 480,00 | R$ 283,50 no Aeropark | R$ 196,50, ou 40,9% |
| 30 diárias | R$ 505,00 | R$ 290,00 na Pare Seguro | R$ 215,00, ou 42,6% |

Contra o Premium e o edifício garagem, que também atendem o T2, a diferença em quinze diárias sobe para R$ 431,50.

Vale notar onde o oficial fica na frente. O valet do Aeropark custa R$ 692,90 em quinze diárias, R$ 212,90 acima do Standard e R$ 82,90 acima do Premium. Se o que você quer é manobrista e o menor total, a conta não fecha no parceiro nessa faixa. No mês fechado, o Standard sai por R$ 505,00 e fica abaixo das duas vagas do Aeropark: a descoberta custa R$ 537,00, e a coberta, R$ 717,00. As duas vagas da Pare Seguro seguem abaixo do Standard no mês, a descoberta por R$ 215,00 e a coberta por R$ 155,00.

## Quanto custa buscar alguém no Terminal 2?

A tarifa por hora é a consulta de quem não vai viajar, e a tabela do estacionamento no Terminal 2 do Aeroporto de Guarulhos responde direto.

| Tempo no pátio | Standard | Premium e edifício garagem |
| --- | --- | --- |
| Até 1 hora | R$ 31,00 | R$ 38,00 |
| Até 2 horas | R$ 54,00 | R$ 67,00 |
| Até 3 horas | R$ 62,00 | R$ 78,00 |
| Até 4 horas | R$ 70,00 | R$ 89,00 |

Para buscar alguém o oficial é a escolha óbvia. Ele fica a pé do terminal, sem van no meio do caminho. O tempo economizado é de 15 a 50 minutos em cada sentido, e em desembarque com voo atrasado isso conta dobrado.

Em dinheiro ele também ganha nessa faixa. A primeira hora do Standard custa R$ 31,00, e os parceiros só aceitam estadia a partir de duas diárias, que saem por R$ 37,80 na descoberta da Pare Seguro.

## A que distância fica o estacionamento no Terminal 2 do Aeroporto de Guarulhos?

O T2 fica entre os outros dois terminais, e isso coloca os pátios parceiros numa distância intermediária.

| Pátio parceiro | Distância do T2, em linha reta | Distância do T1 | Distância do T3 | Traslado declarado |
| --- | --- | --- | --- | --- |
| Aeropark | 2,65 km | 1,88 km | 3,06 km | 10 minutos, van a cada 30 |
| Pare Seguro | 4,51 km | 3,97 km | 4,88 km | 10 minutos, van a cada 30 |

As distâncias são calculadas no banco de dados da Movepark com PostGIS, em linha reta. Os três terminais estão cadastrados como pontos próprios, então a medida é por terminal, e não uma média do complexo.

A leitura é simples. O Aeropark fica 1,86 km mais perto do T2 que a Pare Seguro. Na vaga descoberta, os dois cobram o mesmo de 7 a 14 diárias, então na semana a distância menor sai de graça. No mês a conta vira: a Pare Seguro cobra R$ 290,00 na descoberta, R$ 247,00 a menos que o Aeropark. A conta de tempo porta a porta está no post sobre [estacionamento próximo ao Aeroporto Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## Dá para estacionar no Standard e embarcar em outro terminal?

Dá, porque a tarifa é **do setor em que você estaciona**, e não do terminal em que você embarca. É o que torna o T2 interessante: ele tem o Standard e fica no meio do complexo.

Assim, quem embarca no Terminal 3 pode deixar o carro no Standard e economizar R$ 130,00 na faixa de 11 a 17 diárias. Em troca, atravessa o complexo com bagagem, na ida e na volta.

Três pontos para decidir:

- **Com mala despachada e tempo folgado**, a economia costuma valer o trajeto interno.
- **Com criança ou voo apertado**, não vale.
- **Na volta**, o percurso é o mesmo em sentido contrário, depois do voo.

Quem faz essa conta e ainda acha caro tem a terceira via, o pátio de fora, a R$ 283,50 em quinze diárias na vaga descoberta do Aeropark.

## Quanto custa ficar mais de trinta dias no estacionamento do Terminal 2?

A faixa mais longa funciona diferente das outras. Acima de 30 diárias, o oficial cobra o pacote de 30 e soma uma diária fixa por dia extra: **R$ 19,90 no Standard** e R$ 22,90 no Premium.

Na prática, 45 dias no Standard dão R$ 505,00 do pacote mais R$ 298,50 das quinze diárias extras. Assim, o total fica em R$ 803,50, quase o dobro do pacote de 30.

Na Pare Seguro, a vaga descoberta custa R$ 290,00 fixos de 15 a 30 diárias e volta a R$ 18,90 por dia depois disso. Quarenta e cinco dias saem por R$ 573,50, R$ 230,00 abaixo do Standard.

## Por que a diária avulsa do oficial é tão mais alta no T2?

A resposta está no desenho da tabela, e vale entender porque ela repete o padrão do motor de preço dos parceiros. O oficial cobra por pacote, então ele protege a vaga de rotatividade alta e cobra caro de quem fica pouco.

Veja o valor por dia que cada faixa do Standard representa, em 17 de setembro de 2026:

| Faixa | Total | Valor por dia no limite da faixa |
| --- | --- | --- |
| Até 1 diária | R$ 79,00 | R$ 79,00 |
| 2 diárias | R$ 157,00 | R$ 78,50 |
| 5 diárias | R$ 360,00 | R$ 72,00 |
| De 6 a 10 diárias | R$ 460,00 | R$ 46,00 |
| De 11 a 17 diárias | R$ 480,00 | R$ 28,24 |
| De 18 a 30 diárias | R$ 505,00 | R$ 16,83 |

Ou seja, o valor por dia do oficial cai de R$ 79,00 para R$ 16,83 conforme a estadia estica. É a mesma lógica dos parceiros: na vaga descoberta do Aeropark, o valor por dia vai de R$ 19,90 (de 2 a 6 diárias) a R$ 17,90 (de 18 em diante), e na Pare Seguro o pacote de 15 a 30 diárias leva o dia a R$ 9,67 no mês.

A consequência prática é a mesma dos dois lados: **a viagem curta é a que paga caro por dia**. E é na viagem de até uma semana que o pátio de fora fica mais atrativo em percentual, com 76% de diferença em duas diárias e 71% em sete.

### Vale esticar a reserva para cair numa faixa melhor?

No oficial, sim, e a conta é direta. Uma estadia de 11 diárias custa R$ 480,00, o mesmo que 17. Já 10 diárias custam R$ 460,00, então esticar de 10 para 11 custa R$ 20,00 e não devolve nada.

O caso que compensa é outro: 5 diárias custam R$ 360,00 e 6 já entram na faixa de R$ 460,00. Portanto, aqui esticar piora. O degrau que devolve dinheiro está em algumas vagas dos parceiros: na descoberta da Pare Seguro, qualquer estadia de 15 a 30 diárias custa os mesmos R$ 290,00, e no Aeropark 18 diárias custam só R$ 0,90 a mais que 17. A conta completa está em [como estacionar barato no Aeroporto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## Como funciona o pagamento no estacionamento oficial do Terminal 2?

A página do operador lista o que o oficial aceita, e isso resolve a dúvida de quem já está na rodovia. Em 17 de setembro de 2026, ele aceitava:

- **Dinheiro**, somente em real.
- **Cartões** de crédito e débito.
- **Tags eletrônicas**: Sem Parar, ConectCar, Veloe e Taggy.
- **QR Code**, escaneando o ticket pelo celular.

O operador também informa que os veículos são segurados contra roubo e furto, conforme a Lei Municipal de Guarulhos nº 13.912/2010. E que a reserva antecipada dá acesso a uma cancela própria, com voucher por QR Code.

Nos pátios parceiros, a forma de pagamento é a da reserva pela Movepark. O que cada unidade declara na ficha está em [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) e [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## Quem se encaixa em cada opção no Terminal 2?

Portanto, cinco perfis cobrem quase todo mundo que usa o estacionamento no Terminal 2 do Aeroporto de Guarulhos, com valores do oficial de 17 de setembro de 2026, da Pare Seguro de 3 de novembro de 2026 e do Aeropark de 13 de novembro de 2026:

- **Buscar ou levar alguém:** oficial Standard, a R$ 31,00 na primeira hora, pela ausência de van.
- **Bate e volta de um dia:** o oficial, a R$ 79,00 no Standard, porque os parceiros só aceitam a partir de duas diárias, que saem por R$ 37,80 na descoberta da Pare Seguro.
- **Semana de viagem:** parceiro, na vaga descoberta ou coberta, porque a diferença para o Standard passa de R$ 250,00 em qualquer uma delas.
- **Mês inteiro:** Pare Seguro, a R$ 290,00 na vaga descoberta, abaixo dos R$ 505,00 do Standard. Com cobertura, a Pare Seguro cobra R$ 350,00, contra R$ 690,00 do edifício garagem.
- **Quem quer cobertura dentro do complexo:** edifício garagem, a R$ 610,00 em quinze diárias.

### O que o edifício garagem entrega a mais?

Vale dizer o que a diferença do Premium compra, porque o texto seria injusto sem isso. O edifício garagem é estrutura coberta, com acesso mais curto ao terminal e circulação protegida de chuva.

Para quem viaja com criança pequena, com muita bagagem ou em dia de temporal, isso pesa. Os R$ 28,00 a mais na diária avulsa compram uma experiência diferente, e não só uma vaga.

O que não muda é a natureza da comparação com o pátio de fora. Lá, a vaga coberta da Pare Seguro sai por R$ 350,00 em quinze diárias, contra R$ 610,00 do edifício garagem. A diferença de R$ 260,00 é o preço de andar de van em vez de caminhar.

Para estadia de um mês, a mesma conta fica em R$ 350,00 na coberta da Pare Seguro contra R$ 690,00 no edifício garagem. São R$ 340,00, ou 49,3% a menos, pelo carro coberto do mesmo jeito. Na coberta do Aeropark, o mês sai por R$ 717,00, R$ 27,00 acima do edifício garagem.

## Quando o oficial do Terminal 2 não compensa?

Duas situações em que a diferença fica indefensável para quem procura estacionamento no Terminal 2 do Aeroporto de Guarulhos.

**Viagem de cinco dias.** O Standard cobra R$ 360,00, quase o mesmo que os R$ 460,00 de dez diárias. O parceiro cobra R$ 94,50 pelos mesmos cinco dias na vaga descoberta da Pare Seguro.

**Viagem de quinze dias.** São R$ 480,00 no Standard contra R$ 283,50 na vaga descoberta do Aeropark. A diferença, R$ 196,50, paga mais de dez diárias no pátio de fora. No mês fechado, a vantagem fica em R$ 215,00 na descoberta da Pare Seguro, e a vaga coberta dela também sai abaixo do Standard, por R$ 155,00 a menos.

Quem quer o menor total possível encontra o caminho completo em [como estacionar barato no Aeroporto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/). Já o comparativo por faixa dos dois parceiros está no [post de preço do estacionamento em Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## Um roteiro de cinco passos para o Terminal 2

Por fim, o que fazer antes de sair de casa, na ordem:

1. Confirme que o voo embarca no T2, porque no oficial isso define os setores disponíveis.
2. Some a permanência real, com folga na volta, e olhe a faixa, não a diária.
3. Escolha entre Standard e Premium com a diferença em mãos, que vai de R$ 7,00 a R$ 185,00.
4. Simule o mesmo período no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) e compare totais.
5. Se escolher o pátio de fora, cheque a permanência mínima e reserve pela tabela online.

## Como estes preços foram apurados?

O preço dos pátios parceiros saiu do motor de reservas, com a tabela da Pare Seguro de **3 de novembro de 2026** e a do Aeropark de **13 de novembro de 2026** (o valet segue na de 19 de outubro). É o mesmo número que fecha a reserva, publicado no índice de preços com a data da última atualização de cada tabela.

O preço do estacionamento oficial **não passa pelo motor da Movepark**. Ele foi lido à mão na tabela que o operador publica no site do aeroporto, como imagem, e conferido em 17 de setembro de 2026. Por isso todo valor do oficial aqui carrega a data ao lado. Ele pode mudar sem aviso, e nenhum sistema nos avisa quando muda. A divisão por setor, as formas de pagamento e a referência à lei municipal também saem dessa mesma página.

As distâncias são calculadas no banco de dados com PostGIS, em linha reta entre as coordenadas do pátio e de cada terminal. Já o tempo de traslado e a frequência da van são declarados por cada unidade na ficha. Eles aparecem como declaração da unidade, e não como promessa da Movepark. Quando um campo não está declarado, o texto diz que não está.

Os números de movimentação do aeroporto saem no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Quanto custa o estacionamento no Terminal 2 do Aeroporto de Guarulhos?

Em 17 de setembro de 2026, o Standard cobrava R$ 31,00 na primeira hora e R$ 79,00 na diária. Na faixa de 11 a 17 diárias, R$ 480,00. No Premium e no edifício garagem, que também atendem o T2, os mesmos períodos saem por R$ 38,00, R$ 107,00 e R$ 610,00.

### O Terminal 2 tem setor Standard e Premium?

Tem os dois, e é o único terminal de Guarulhos nessa situação. O Standard atende os Terminais 1 e 2, e o Premium com o edifício garagem atende os Terminais 2 e 3. A diferença entre eles vai de R$ 7,00 na primeira hora a R$ 185,00 na faixa de 18 a 30 diárias.

### Qual estacionamento fica mais perto do Terminal 2 de Guarulhos?

O oficial, porque fica dentro do complexo. Entre os parceiros da Movepark, o Aeropark, a 2,65 km do T2 em linha reta, com traslado de 10 minutos e van a cada 30 declarados. A Pare Seguro fica a 4,51 km e declara o mesmo traslado.

### Quanto se economiza estacionando fora do Terminal 2?

Em uma semana, R$ 327,70, ou 71,2%. Ali o oficial Standard cobra R$ 460,00, em 17 de setembro de 2026, e as vagas descobertas da Pare Seguro e do Aeropark saem por R$ 132,30, nas tabelas de 3 e de 13 de novembro de 2026. Em quinze diárias a diferença é de R$ 196,50, e em trinta, de R$ 215,00. No mês, a vaga coberta da Pare Seguro também custa menos que o Standard, e as duas do Aeropark custam mais.

### Quanto custa uma hora no estacionamento do Terminal 2?

R$ 31,00 no setor Standard e R$ 38,00 no Premium ou no edifício garagem, em 17 de setembro de 2026. Para quem fica poucas horas, o oficial também sai mais barato que os parceiros, que só aceitam a partir de duas diárias (R$ 37,80 na descoberta da Pare Seguro, tabela de 3 de novembro de 2026).

### O estacionamento do Terminal 2 aceita tag de pedágio?

Sim. A página do operador lista Sem Parar, ConectCar, Veloe e Taggy, além de dinheiro, cartões de crédito e débito e pagamento por QR Code no ticket. A informação é do próprio operador, conferida em 17 de setembro de 2026.

### O estacionamento do Terminal 2 serve para quem embarca no Terminal 3?

Dá, porque a tarifa é do setor em que o carro fica, e não do terminal do voo. A economia é de R$ 130,00 na faixa de 11 a 17 diárias, e o custo é atravessar o complexo com bagagem, na ida e na volta.$f9$
   where id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and md5(coalesce(body_md, '')) = 'bde4c139ba0b163919f356361df761c2';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.pt', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.pt · meta_description
  update public.blog_post set meta_description = $f10$Estacionamento no Terminal 2 do Aeroporto de Guarulhos: setores e preço. Diária a partir de R$ 18,90 em novembro de 2026. Compare e reserve pela Movepark.$f10$
   where id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and md5(coalesce(meta_description, '')) = '6ca4dcc27adcbe372e07b780b22f0c3f';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.pt', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.en · body_md
  update public.blog_post_i18n set body_md = $f11$Parking at Terminal 2 of Guarulhos Airport is the only one that appears in both official tables. T2 is served by the Standard sector, the cheapest, and also by Premium and the multi-storey car park. The gap between the two reaches R$ 130.00 on a fifteen-day trip. Outside the complex, the same trip comes to R$ 283.50 for an uncovered spot at Aeropark, 2.65 km from T2, and R$ 290.00 at Pare Seguro, 4.51 km away. The official car park was checked on 17 September 2026. Aeropark's table is from 13 November 2026, and Pare Seguro's from 3 November 2026.

| Quick answer | Official on 17/09/2026, Pare Seguro on 03/11/2026, Aeropark on 13/11/2026 |
| --- | --- |
| Sectors serving T2 | Standard, Premium and the multi-storey car park |
| First hour, Standard sector | R$ 31.00 |
| Single day, Standard sector | R$ 79.00 |
| 15 days, Standard sector | R$ 480.00 |
| 15 days, Premium or multi-storey | R$ 610.00 |
| 15 days at Aeropark, uncovered spot | R$ 283.50 |
| Closest partner to T2 | Aeropark, 2.65 km as the crow flies |

## Which sectors serve parking at Terminal 2 in Guarulhos?

São Paulo/Guarulhos Governador André Franco Montoro International Airport, IATA code GRU, has three passenger terminals. Terminal 2 sits in the middle of the complex, and it is the only one served by both rate bands of the official car park, operated by INDIGO Group Brasil.

| Official sector | Serves | First hour | Single day |
| --- | --- | --- | --- |
| Standard | Terminals 1 and 2 | R$ 31.00 | R$ 79.00 |
| Premium and multi-storey car park | Terminals 2 and 3 | R$ 38.00 | R$ 107.00 |
| Flex | Terminal 3 | R$ 38.00 | R$ 107.00 |

In practice, GRU Terminal 2 parking gives the passenger a choice that Terminal 3 does not have. They can pay the cheapest official table, which T3 cannot reach, or pay Premium and stay in the multi-storey car park.

In other words, the question at T2 is not only inside or outside the airport. It is also **which of the two official sectors**, and that choice is worth more than a hundred reais on a long trip.

## How much does parking at Terminal 2 of Guarulhos Airport cost?

The official table charges by length-of-stay band, not by a daily rate multiplied out. Below are the two bands that serve T2, read from the table published by the operator and checked on 17 September 2026.

| Length of stay | Standard | Premium and multi-storey | Difference |
| --- | --- | --- | --- |
| Up to 1 hour | R$ 31.00 | R$ 38.00 | R$ 7.00 |
| Up to 2 hours | R$ 54.00 | R$ 67.00 | R$ 13.00 |
| Up to 3 hours | R$ 62.00 | R$ 78.00 | R$ 16.00 |
| Up to 4 hours | R$ 70.00 | R$ 89.00 | R$ 19.00 |
| Up to 1 day | R$ 79.00 | R$ 107.00 | R$ 28.00 |
| 2 days | R$ 157.00 | R$ 215.00 | R$ 58.00 |
| 3 days | R$ 223.00 | R$ 295.00 | R$ 72.00 |
| 4 days | R$ 290.00 | R$ 390.00 | R$ 100.00 |
| 5 days | R$ 360.00 | R$ 535.00 | R$ 175.00 |
| 6 to 10 days | R$ 460.00 | R$ 565.00 | R$ 105.00 |
| 11 to 17 days | R$ 480.00 | R$ 610.00 | R$ 130.00 |
| 18 to 30 days | R$ 505.00 | R$ 690.00 | R$ 185.00 |

Two readings come out of that table, and both contradict what the advertised daily rate suggests.

The first: the bands are **totals**, not per-day figures. A fifteen-day trip falls into the 11-to-17-day band and pays R$ 480.00 in Standard, the same as a seventeen-day one.

The second: the curve is steep in the middle and almost flat after. Five days in Standard cost R$ 360.00, and ten cost R$ 460.00. That is only R$ 100.00 for five more days, so anyone staying five days pays dearly per day.

## Standard or Premium: which to choose at Terminal 2?

Since the Standard sector of Terminal 2 coexists with Premium, it is worth knowing what the difference buys. A covered spot and shorter access to the terminal come from Premium and the multi-storey car park. Standard is an ordinary lot.

In figures from 17 September 2026, the choice costs this much:

- **Over one hour**, R$ 7.00 more, which is small change for someone picking a person up.
- **On a single day**, R$ 28.00 more, more than a day in the cheapest partner's uncovered spot, R$ 18.90.
- **Over fifteen days**, it is R$ 130.00 more.
- **Over a full month**, the gap reaches R$ 185.00.

The practical rule: on a short stay, the difference is small and cover may be worth it. On a long trip, it weighs: the R$ 130.00 extra over fifteen days is more than a third of the R$ 350.00 that Pare Seguro's covered spot charges for the same period.

## What does the alternative outside the complex cost for a T2 departure?

Besides the official T2 car park, Movepark has two partner lots, both outside the complex and with a van transfer. With Pare Seguro's table of 3 November 2026 and Aeropark's of 13 November 2026, the two tie on an uncovered spot from 7 to 14 days, and Aeropark is cheaper for a covered spot up to 14. Pare Seguro comes in lower for a covered spot from 15 days and for an uncovered one from 16. Only Aeropark has valet.

| Length of stay | Uncovered spot | Covered spot | Valet |
| --- | --- | --- | --- |
| 2 days, Pare Seguro | R$ 37.80 | R$ 57.80 | not offered |
| 2 days, Aeropark | R$ 39.80 | R$ 53.80 | R$ 179.80 |
| 7 days, Pare Seguro | R$ 132.30 | R$ 202.30 | not offered |
| 7 days, Aeropark | R$ 132.30 | R$ 174.30 | R$ 593.90 |
| 15 days, Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 15 days, Aeropark | R$ 283.50 | R$ 373.50 | R$ 692.90 |
| 30 days, Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 30 days, Aeropark | R$ 537.00 | R$ 717.00 | R$ 791.90 |

Neither takes a single day: both work with a 2-day minimum stay. The live price is in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos), with the date of each table's last update.

## How much do you save by leaving the official car park at Terminal 2?

The comparison below uses Standard, which is the cheapest option for parking at Terminal 2 of Guarulhos Airport. So it is the hardest possible comparison for an outside lot.

| Length of stay | Official Standard | Cheapest partner, uncovered | Difference |
| --- | --- | --- | --- |
| 2 days | R$ 157.00 | R$ 37.80 at Pare Seguro | R$ 119.20, or 75.9% |
| 7 days | R$ 460.00 | R$ 132.30 at both partners | R$ 327.70, or 71.2% |
| 15 days | R$ 480.00 | R$ 283.50 at Aeropark | R$ 196.50, or 40.9% |
| 30 days | R$ 505.00 | R$ 290.00 at Pare Seguro | R$ 215.00, or 42.6% |

Against Premium and the multi-storey car park, which also serve T2, the gap over fifteen days rises to R$ 431.50.

It is worth noting where the official car park comes out ahead. Aeropark's valet costs R$ 692.90 over fifteen days, R$ 212.90 above Standard and R$ 82.90 above Premium. If what you want is a valet and the lowest total, the sum does not work at the partner in that band. Over a full month, Standard comes to R$ 505.00 and sits below both of Aeropark's spots: the uncovered one costs R$ 537.00, and the covered one R$ 717.00. Both of Pare Seguro's spots stay below Standard over the month, the uncovered one by R$ 215.00 and the covered one by R$ 155.00.

## How much does it cost to pick someone up at Terminal 2?

The hourly rate is the question of someone who is not travelling, and the Terminal 2 table answers it directly.

| Time in the lot | Standard | Premium and multi-storey |
| --- | --- | --- |
| Up to 1 hour | R$ 31.00 | R$ 38.00 |
| Up to 2 hours | R$ 54.00 | R$ 67.00 |
| Up to 3 hours | R$ 62.00 | R$ 78.00 |
| Up to 4 hours | R$ 70.00 | R$ 89.00 |

For picking someone up, the official car park is the obvious choice. It is a walk from the terminal, with no van in the way. The time saved is 15 to 50 minutes in each direction, and on an arrival with a delayed flight that counts double.

It wins on money too in that band. Standard's first hour costs R$ 31.00, and the partners only take stays from two days, which come to R$ 37.80 for Pare Seguro's uncovered spot.

## How far is the parking from Terminal 2 of Guarulhos Airport?

T2 sits between the other two terminals, and that puts the partner lots at an intermediate distance.

| Partner lot | Distance from T2, straight line | Distance from T1 | Distance from T3 | Stated transfer |
| --- | --- | --- | --- | --- |
| Aeropark | 2.65 km | 1.88 km | 3.06 km | 10 minutes, van every 30 |
| Pare Seguro | 4.51 km | 3.97 km | 4.88 km | 10 minutes, van every 30 |

Distances are calculated in Movepark's database with PostGIS, as a straight line. All three terminals are registered as points of their own, so the measurement is per terminal, not an average of the complex.

The reading is simple. Aeropark sits 1.86 km closer to T2 than Pare Seguro. For an uncovered spot, both charge the same from 7 to 14 days, so over a week the shorter distance comes free. Over a month the sum turns: Pare Seguro charges R$ 290.00 for an uncovered spot, R$ 247.00 less than Aeropark. The door-to-door time sum is in the post on [parking near Guarulhos Airport](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## Can you park in Standard and depart from another terminal?

You can, because the rate belongs to **the sector where you park**, not to the terminal you depart from. That is what makes T2 interesting: it has Standard and sits in the middle of the complex.

So anyone departing from Terminal 3 can leave the car in Standard and save R$ 130.00 in the 11-to-17-day band. In exchange, they cross the complex with luggage, there and back.

Three points to decide by:

- **With checked baggage and time to spare**, the saving usually justifies the internal trip.
- **With a child or a tight flight**, it does not.
- **On the way back**, the route is the same in reverse, after the flight.

Anyone who does this sum and still finds it expensive has the third route, the outside lot, at R$ 283.50 over fifteen days for Aeropark's uncovered spot.

## What does staying more than thirty days at the Terminal 2 car park cost?

The longest band works differently from the others. Above 30 days, the official car park charges the 30-day package and adds a fixed daily rate per extra day: **R$ 19.90 in Standard** and R$ 22.90 in Premium.

In practice, 45 days in Standard come to R$ 505.00 for the package plus R$ 298.50 for the fifteen extra days. So the total lands at R$ 803.50, nearly double the 30-day package.

At Pare Seguro, the uncovered spot costs a flat R$ 290.00 from 15 to 30 days and goes back to R$ 18.90 a day after that. Forty-five days come to R$ 573.50, R$ 230.00 below Standard.

## Why is the official single-day rate so much higher at T2?

The answer is in the design of the table, and it is worth understanding because it repeats the pattern of the partners' pricing engine. The official car park charges by package, so it protects the space from high turnover and charges dearly from anyone staying briefly.

Here is the per-day figure each Standard band represents, on 17 September 2026:

| Band | Total | Per-day figure at the top of the band |
| --- | --- | --- |
| Up to 1 day | R$ 79.00 | R$ 79.00 |
| 2 days | R$ 157.00 | R$ 78.50 |
| 5 days | R$ 360.00 | R$ 72.00 |
| 6 to 10 days | R$ 460.00 | R$ 46.00 |
| 11 to 17 days | R$ 480.00 | R$ 28.24 |
| 18 to 30 days | R$ 505.00 | R$ 16.83 |

In other words, the official per-day figure drops from R$ 79.00 to R$ 16.83 as the stay stretches. It is the same logic as the partners: at Aeropark's uncovered spot, the per-day figure goes from R$ 19.90 (2 to 6 days) to R$ 17.90 (18 days up), and at Pare Seguro the 15 to 30-day package brings the day down to R$ 9.67 over a month.

The practical consequence is the same on both sides: **the short trip is the one that pays dearly per day**. And it is on a trip of up to a week that the outside lot looks most attractive in percentage terms, with a 76% difference over two days and 71% over seven.

### Is it worth stretching the booking to land in a better band?

At the official car park, yes, and the sum is direct. An 11-day stay costs R$ 480.00, the same as 17. A 10-day stay costs R$ 460.00, so stretching from 10 to 11 costs R$ 20.00 and gives nothing back.

The case that pays off is another one: 5 days cost R$ 360.00 and 6 already fall into the R$ 460.00 band. So here stretching makes it worse. The step that gives money back is in some of the partners' spots: at Pare Seguro's uncovered spot, any stay from 15 to 30 days costs the same R$ 290.00, and at Aeropark 18 days cost only R$ 0.90 more than 17. The full sum is in [how to park cheaply at Guarulhos Airport](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## How does payment work at the official Terminal 2 car park?

The operator's page lists what the official car park accepts, and that settles the question for someone already on the motorway. On 17 September 2026 it accepted:

- **Cash**, in Brazilian reais only.
- **Credit and debit cards**.
- **Electronic toll tags**: Sem Parar, ConectCar, Veloe and Taggy.
- **QR Code**, scanning the ticket with a phone.

The operator also states that vehicles are insured against theft and robbery, under Guarulhos municipal law nº 13,912/2010. And that booking ahead gives access to a dedicated barrier, with a QR Code voucher.

At the partner lots, the payment method is the one for a Movepark booking. What each unit states on its page is in [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) and [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## Who fits each option at Terminal 2?

So five profiles cover almost everyone using parking at Terminal 2 of Guarulhos Airport, with official figures from 17 September 2026, Pare Seguro's from 3 November 2026 and Aeropark's from 13 November 2026:

- **Picking someone up or dropping them off:** official Standard, at R$ 31.00 for the first hour, because there is no van.
- **A one-day there-and-back:** the official car park, at R$ 79.00 in Standard, because the partners only take stays from two days, which come to R$ 37.80 for Pare Seguro's uncovered spot.
- **A week's travel:** a partner, in an uncovered or covered spot, because the gap to Standard is over R$ 250.00 in either.
- **A whole month:** Pare Seguro, at R$ 290.00 for an uncovered spot, below Standard's R$ 505.00. With cover, Pare Seguro charges R$ 350.00, against R$ 690.00 at the multi-storey car park.
- **Anyone who wants cover inside the complex:** the multi-storey car park, at R$ 610.00 over fifteen days.

### What does the multi-storey car park deliver in return?

It is worth saying what Premium's difference buys, because the text would be unfair without it. The multi-storey car park is a covered structure, with shorter access to the terminal and circulation protected from rain.

For anyone travelling with a small child, with a lot of luggage or on a stormy day, that weighs. The R$ 28.00 extra on a single day buys a different experience, not just a space.

What does not change is the nature of the comparison with the outside lot. There, Pare Seguro's covered spot comes to R$ 350.00 over fifteen days, against R$ 610.00 at the multi-storey car park. The R$ 260.00 difference is the price of riding a van instead of walking.

For a month-long stay, the same sum comes to R$ 350.00 for Pare Seguro's covered spot against R$ 690.00 at the multi-storey car park. That is R$ 340.00, or 49.3% less, for a car covered just the same. At Aeropark's covered spot, the month comes to R$ 717.00, R$ 27.00 above the multi-storey car park.

## When does the official Terminal 2 car park not pay off?

Two situations where the gap becomes indefensible for anyone looking for parking at Terminal 2 of Guarulhos Airport.

**A five-day trip.** Standard charges R$ 360.00, almost the same as the R$ 460.00 for ten days. The partner charges R$ 94.50 for those same five days in Pare Seguro's uncovered spot.

**A fifteen-day trip.** That is R$ 480.00 in Standard against R$ 283.50 for Aeropark's uncovered spot. The difference, R$ 196.50, pays for more than ten days at the outside lot. Over a full month, the advantage is R$ 215.00 for Pare Seguro's uncovered spot, and its covered spot also comes in below Standard, by R$ 155.00.

Anyone after the lowest possible total will find the full route in [how to park cheaply at Guarulhos Airport](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/). The band-by-band comparison of the two partners is in the [post on the price of parking at Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## A five-step routine for Terminal 2

What to do before leaving home, in order:

1. Confirm the flight departs from T2, because at the official car park that sets the sectors available.
2. Add up the real length of stay, with slack on the return, and look at the band, not the daily rate.
3. Choose between Standard and Premium with the difference in hand, which runs from R$ 7.00 to R$ 185.00.
4. Simulate the same period in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos) and compare totals.
5. If you choose the outside lot, check the minimum stay and book on the online table.

## How were these prices gathered?

The partner lots' prices came from the booking engine, with Pare Seguro's table of **3 November 2026** and Aeropark's of **13 November 2026** (its valet stays on the table of 19 October). It is the same figure that closes the booking, published in the price index with the date of each table's last update.

The official car park's price **does not pass through the Movepark engine**. It was read by hand from the table the operator publishes on the airport's site, as an image, and checked on 17 September 2026. That is why every official figure here carries the date beside it. It can change without notice, and no system tells us when it does. The split by sector, the payment methods and the reference to the municipal law also come from that same page.

Distances are calculated in the database with PostGIS, as a straight line between the lot's coordinates and each terminal's. Transfer time and van frequency are stated by each unit on its page. They appear as the unit's own statement, not as a Movepark promise. When a field is not stated, the text says so.

Airport traffic figures are on the [ANAC statistics portal](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Frequently asked questions

### How much does parking at Terminal 2 of Guarulhos Airport cost?

On 17 September 2026, Standard charged R$ 31.00 for the first hour and R$ 79.00 for a day. In the 11-to-17-day band, R$ 480.00. In Premium and the multi-storey car park, which also serve T2, the same periods come to R$ 38.00, R$ 107.00 and R$ 610.00.

### Does Terminal 2 have both a Standard and a Premium sector?

It has both, and it is the only terminal in Guarulhos in that situation. Standard serves Terminals 1 and 2, and Premium with the multi-storey car park serves Terminals 2 and 3. The difference between them runs from R$ 7.00 in the first hour to R$ 185.00 in the 18-to-30-day band.

### Which car park is closest to Terminal 2 in Guarulhos?

The official one, because it is inside the complex. Among the Movepark partners, Aeropark, 2.65 km from T2 as the crow flies, with a stated 10-minute transfer and a van every 30. Pare Seguro is 4.51 km away and states the same transfer.

### How much do you save by parking outside Terminal 2?

Over a week, R$ 327.70, or 71.2%. There official Standard charges R$ 460.00, on 17 September 2026, and the uncovered spots at Pare Seguro and Aeropark come to R$ 132.30, on their tables of 3 and 13 November 2026. Over fifteen days the difference is R$ 196.50, and over thirty, R$ 215.00. Over the month, Pare Seguro's covered spot also costs less than Standard, and both of Aeropark's cost more.

### How much does an hour at the Terminal 2 car park cost?

R$ 31.00 in the Standard sector and R$ 38.00 in Premium or the multi-storey car park, on 17 September 2026. For a stay of a few hours, the official car park is also cheaper than the partners, which only take stays from two days (R$ 37.80 for Pare Seguro's uncovered spot, table of 3 November 2026).

### Does the Terminal 2 car park accept toll tags?

Yes. The operator's page lists Sem Parar, ConectCar, Veloe and Taggy, along with cash, credit and debit cards, and payment by QR Code on the ticket. The information is the operator's own, checked on 17 September 2026.

### Does the Terminal 2 car park work for someone departing from Terminal 3?

It does, because the rate belongs to the sector the car sits in, not to the flight's terminal. The saving is R$ 130.00 in the 11-to-17-day band, and the cost is crossing the complex with luggage, there and back.$f11$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'en' and md5(coalesce(body_md, '')) = 'fc195440ed1b6622bf503370dd4723f8';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.en', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.en · excerpt
  update public.blog_post_i18n set excerpt = $f12$T2 is the only terminal in both official tables. Standard charges R$ 480.00 over 15 days and Premium R$ 610.00; outside the complex, Aeropark's uncovered spot costs R$ 283.50 over the same 15 days.$f12$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'en' and md5(coalesce(excerpt, '')) = '6cf66672d278b905c3264d2037e6bba5';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.en', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.en · meta_description
  update public.blog_post_i18n set meta_description = $f13$Parking at Terminal 2 of Guarulhos Airport: sectors and price. A day from R$ 18.90 in November 2026. Compare and book with Movepark.$f13$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'en' and md5(coalesce(meta_description, '')) = '7d6916188fbb042d5f9186293ff03e3a';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.en', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.es · body_md
  update public.blog_post_i18n set body_md = $f14$El estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos es el único que aparece en las dos tablas del oficial. La T2 está atendida por el sector Standard, el más barato, y también por el Premium y el edificio cochera. La diferencia entre los dos llega a R$ 130,00 en un viaje de quince días. Fuera del complejo, el mismo viaje sale R$ 283,50 en la plaza descubierta de Aeropark, a 2,65 km de la T2, y R$ 290,00 en Pare Seguro, a 4,51 km. El oficial se consultó el 17 de septiembre de 2026. La tabla de Aeropark es del 13 de noviembre de 2026, y la de Pare Seguro, del 3 de noviembre de 2026.

| Respuesta rápida | Oficial al 17/09/2026, Pare Seguro al 03/11/2026, Aeropark al 13/11/2026 |
| --- | --- |
| Sectores que atienden la T2 | Standard, Premium y edificio cochera |
| Primera hora, sector Standard | R$ 31,00 |
| Diaria suelta, sector Standard | R$ 79,00 |
| 15 días, sector Standard | R$ 480,00 |
| 15 días, Premium o edificio cochera | R$ 610,00 |
| 15 días en Aeropark, plaza descubierta | R$ 283,50 |
| Asociado más cerca de la T2 | Aeropark, a 2,65 km en línea recta |

## ¿Qué sectores atienden el estacionamiento de la Terminal 2 de Guarulhos?

El Aeropuerto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tiene tres terminales de pasajeros. La Terminal 2 queda en el medio del complejo, y es la única servida por las dos franjas de tarifa del estacionamiento oficial, operado por INDIGO Group Brasil.

| Sector del oficial | Atiende | Primera hora | Diaria suelta |
| --- | --- | --- | --- |
| Standard | Terminales 1 y 2 | R$ 31,00 | R$ 79,00 |
| Premium y edificio cochera | Terminales 2 y 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

En la práctica, el estacionamiento GRU Terminal 2 le da al pasajero una elección que el de la Terminal 3 no tiene. Puede pagar la tabla más barata del oficial, que la T3 no alcanza, o pagar el Premium y quedarse en el edificio cochera.

O sea, la pregunta en la T2 no es solo dentro o fuera del aeropuerto. Es también **cuál de los dos sectores del oficial**, y esa elección vale más de cien reales en un viaje largo.

## ¿Cuánto cuesta el estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos?

La tabla del oficial cobra por franja de permanencia, y no por diaria multiplicada. Abajo están las dos franjas que atienden la T2, leídas en la tabla publicada por el operador y verificadas el 17 de septiembre de 2026.

| Permanencia | Standard | Premium y edificio cochera | Diferencia |
| --- | --- | --- | --- |
| Hasta 1 hora | R$ 31,00 | R$ 38,00 | R$ 7,00 |
| Hasta 2 horas | R$ 54,00 | R$ 67,00 | R$ 13,00 |
| Hasta 3 horas | R$ 62,00 | R$ 78,00 | R$ 16,00 |
| Hasta 4 horas | R$ 70,00 | R$ 89,00 | R$ 19,00 |
| Hasta 1 día | R$ 79,00 | R$ 107,00 | R$ 28,00 |
| 2 días | R$ 157,00 | R$ 215,00 | R$ 58,00 |
| 3 días | R$ 223,00 | R$ 295,00 | R$ 72,00 |
| 4 días | R$ 290,00 | R$ 390,00 | R$ 100,00 |
| 5 días | R$ 360,00 | R$ 535,00 | R$ 175,00 |
| De 6 a 10 días | R$ 460,00 | R$ 565,00 | R$ 105,00 |
| De 11 a 17 días | R$ 480,00 | R$ 610,00 | R$ 130,00 |
| De 18 a 30 días | R$ 505,00 | R$ 690,00 | R$ 185,00 |

Dos lecturas salen de esa tabla, y las dos contradicen lo que sugiere la diaria anunciada.

La primera: las franjas son **totales**, no valores por día. Un viaje de quince días cae en la franja de 11 a 17 días y paga R$ 480,00 en el Standard, lo mismo que pagaría uno de diecisiete.

La segunda: la curva es empinada en el medio y casi plana después. Cinco días en el Standard cuestan R$ 360,00, y diez cuestan R$ 460,00. Son solo R$ 100,00 por cinco días más, así que quien se queda cinco días paga caro por día.

## ¿Standard o Premium: cuál elegir en la Terminal 2?

Como el sector Standard de la Terminal 2 convive con el Premium, vale saber qué compra la diferencia. La plaza cubierta y el acceso más corto a la terminal vienen del Premium y del edificio cochera. El Standard es predio común.

En números del 17 de septiembre de 2026, la elección cuesta así:

- **En una hora**, R$ 7,00 más, que es vuelto para quien va a buscar a alguien.
- **En el día suelto**, R$ 28,00 más, más que el valor de un día en la plaza descubierta del asociado más barato, R$ 18,90.
- **En quince días**, son R$ 130,00 más.
- **En el mes cerrado**, la diferencia llega a R$ 185,00.

La regla práctica: en una permanencia corta, la diferencia es chica y la cobertura puede valer. En un viaje largo, pesa: los R$ 130,00 de más en quince días superan un tercio de los R$ 350,00 que cobra la plaza cubierta de Pare Seguro por el mismo período.

## ¿Cuánto sale la alternativa fuera del complejo para quien embarca en la T2?

Además del estacionamiento oficial de la T2, Movepark tiene dos predios asociados, los dos fuera del complejo y con traslado en combi. Con la tabla de Pare Seguro del 3 de noviembre de 2026 y la de Aeropark del 13 de noviembre de 2026, los dos empatan en plaza descubierta de 7 a 14 días, y Aeropark sale más barato en la cubierta hasta 14. Pare Seguro queda por debajo en la cubierta desde 15 días y en la descubierta desde 16. Solo Aeropark tiene valet.

| Permanencia | Plaza descubierta | Plaza cubierta | Valet |
| --- | --- | --- | --- |
| 2 días, Pare Seguro | R$ 37,80 | R$ 57,80 | no ofrece |
| 2 días, Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 días, Pare Seguro | R$ 132,30 | R$ 202,30 | no ofrece |
| 7 días, Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 días, Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 15 días, Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 días, Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 30 días, Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Ninguno de los dos acepta día suelto: los dos trabajan con una permanencia mínima de 2 días. El precio en vivo está en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), con la fecha de la última actualización de cada tabla.

## ¿Cuánto se ahorra saliendo del oficial en la Terminal 2?

La comparación de abajo usa el Standard, que es la opción más barata del estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos. Por lo tanto, es la comparación más dura posible para el predio de afuera.

| Permanencia | Oficial Standard | Asociado más barato, descubierta | Diferencia |
| --- | --- | --- | --- |
| 2 días | R$ 157,00 | R$ 37,80 en Pare Seguro | R$ 119,20, o un 75,9% |
| 7 días | R$ 460,00 | R$ 132,30 en los dos asociados | R$ 327,70, o un 71,2% |
| 15 días | R$ 480,00 | R$ 283,50 en Aeropark | R$ 196,50, o un 40,9% |
| 30 días | R$ 505,00 | R$ 290,00 en Pare Seguro | R$ 215,00, o un 42,6% |

Contra el Premium y el edificio cochera, que también atienden la T2, la diferencia en quince días sube a R$ 431,50.

Vale notar dónde el oficial queda adelante. El valet de Aeropark cuesta R$ 692,90 en quince días, R$ 212,90 por encima del Standard y R$ 82,90 por encima del Premium. Si lo que querés es valet y el menor total, la cuenta no cierra en el asociado en esa franja. En el mes cerrado, el Standard sale R$ 505,00 y queda por debajo de las dos plazas de Aeropark: la descubierta cuesta R$ 537,00, y la cubierta, R$ 717,00. Las dos plazas de Pare Seguro siguen por debajo del Standard en el mes, la descubierta por R$ 215,00 y la cubierta por R$ 155,00.

## ¿Cuánto cuesta buscar a alguien en la Terminal 2?

La tarifa por hora es la consulta de quien no va a viajar, y la tabla de la Terminal 2 responde directo.

| Tiempo en el predio | Standard | Premium y edificio cochera |
| --- | --- | --- |
| Hasta 1 hora | R$ 31,00 | R$ 38,00 |
| Hasta 2 horas | R$ 54,00 | R$ 67,00 |
| Hasta 3 horas | R$ 62,00 | R$ 78,00 |
| Hasta 4 horas | R$ 70,00 | R$ 89,00 |

Para buscar a alguien el oficial es la elección obvia. Queda a pie de la terminal, sin combi en el medio del camino. El tiempo ahorrado es de 15 a 50 minutos en cada sentido, y en un desembarque con vuelo demorado eso cuenta doble.

En dinero también gana en esa franja. La primera hora del Standard cuesta R$ 31,00, y los asociados solo aceptan estadías desde dos días, que salen R$ 37,80 en la descubierta de Pare Seguro.

## ¿A qué distancia queda el estacionamiento de la Terminal 2 del Aeropuerto de Guarulhos?

La T2 queda entre las otras dos terminales, y eso pone a los predios asociados en una distancia intermedia.

| Predio asociado | Distancia de la T2, en línea recta | Distancia de la T1 | Distancia de la T3 | Traslado declarado |
| --- | --- | --- | --- | --- |
| Aeropark | 2,65 km | 1,88 km | 3,06 km | 10 minutos, combi cada 30 |
| Pare Seguro | 4,51 km | 3,97 km | 4,88 km | 10 minutos, combi cada 30 |

Las distancias se calculan en la base de datos de Movepark con PostGIS, en línea recta. Las tres terminales están registradas como puntos propios, así que la medida es por terminal, y no un promedio del complejo.

La lectura es simple. Aeropark queda 1,86 km más cerca de la T2 que Pare Seguro. En plaza descubierta, los dos cobran lo mismo de 7 a 14 días, así que en la semana la distancia menor sale gratis. En el mes la cuenta se da vuelta: Pare Seguro cobra R$ 290,00 en la descubierta, R$ 247,00 menos que Aeropark. La cuenta de tiempo puerta a puerta está en el post sobre [estacionamiento cerca del Aeropuerto de Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## ¿Se puede estacionar en el Standard y embarcar en otra terminal?

Se puede, porque la tarifa es **del sector en el que estacionás**, y no de la terminal desde la que embarcás. Es lo que vuelve interesante a la T2: tiene el Standard y queda en el medio del complejo.

Así, quien embarca en la Terminal 3 puede dejar el auto en el Standard y ahorrar R$ 130,00 en la franja de 11 a 17 días. A cambio, atraviesa el complejo con equipaje, a la ida y a la vuelta.

Tres puntos para decidir:

- **Con equipaje despachado y tiempo de sobra**, el ahorro suele justificar el trayecto interno.
- **Con un chico o un vuelo ajustado**, no vale.
- **A la vuelta**, el recorrido es el mismo en sentido contrario, después del vuelo.

Quien hace esa cuenta y todavía lo encuentra caro tiene la tercera vía, el predio de afuera, a R$ 283,50 en quince días en la plaza descubierta de Aeropark.

## ¿Cuánto cuesta quedarse más de treinta días en el estacionamiento de la Terminal 2?

La franja más larga funciona distinto de las otras. Por encima de 30 días, el oficial cobra el paquete de 30 y suma una diaria fija por día extra: **R$ 19,90 en el Standard** y R$ 22,90 en el Premium.

En la práctica, 45 días en el Standard dan R$ 505,00 del paquete más R$ 298,50 de los quince días extra. Así, el total queda en R$ 803,50, casi el doble del paquete de 30.

En Pare Seguro, la plaza descubierta cuesta R$ 290,00 fijos de 15 a 30 días y vuelve a R$ 18,90 por día después. Cuarenta y cinco días salen R$ 573,50, R$ 230,00 por debajo del Standard.

## ¿Por qué la diaria suelta del oficial es tanto más alta en la T2?

La respuesta está en el diseño de la tabla, y vale entenderla porque repite el patrón del motor de precio de los asociados. El oficial cobra por paquete, así que protege la plaza de la rotación alta y le cobra caro a quien se queda poco.

Mirá el valor por día que representa cada franja del Standard, el 17 de septiembre de 2026:

| Franja | Total | Valor por día en el límite de la franja |
| --- | --- | --- |
| Hasta 1 día | R$ 79,00 | R$ 79,00 |
| 2 días | R$ 157,00 | R$ 78,50 |
| 5 días | R$ 360,00 | R$ 72,00 |
| De 6 a 10 días | R$ 460,00 | R$ 46,00 |
| De 11 a 17 días | R$ 480,00 | R$ 28,24 |
| De 18 a 30 días | R$ 505,00 | R$ 16,83 |

O sea, el valor por día del oficial cae de R$ 79,00 a R$ 16,83 conforme la estadía se estira. Es la misma lógica de los asociados: en la plaza descubierta de Aeropark, el valor por día va de R$ 19,90 (de 2 a 6 días) a R$ 17,90 (desde 18), y en Pare Seguro el paquete de 15 a 30 días lleva el día a R$ 9,67 en el mes.

La consecuencia práctica es la misma de los dos lados: **el viaje corto es el que paga caro por día**. Y es en el viaje de hasta una semana donde el predio de afuera resulta más atractivo en porcentaje, con un 76% de diferencia en dos días y un 71% en siete.

### ¿Vale estirar la reserva para caer en una franja mejor?

En el oficial, sí, y la cuenta es directa. Una estadía de 11 días cuesta R$ 480,00, lo mismo que 17. Ya 10 días cuestan R$ 460,00, así que estirar de 10 a 11 cuesta R$ 20,00 y no devuelve nada.

El caso que compensa es otro: 5 días cuestan R$ 360,00 y 6 ya entran en la franja de R$ 460,00. Por lo tanto, acá estirar empeora. El escalón que devuelve plata está en algunas plazas de los asociados: en la descubierta de Pare Seguro, cualquier estadía de 15 a 30 días cuesta los mismos R$ 290,00, y en Aeropark 18 días cuestan solo R$ 0,90 más que 17. La cuenta completa está en [cómo estacionar barato en el Aeropuerto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## ¿Cómo funciona el pago en el estacionamiento oficial de la Terminal 2?

La página del operador lista lo que acepta el oficial, y eso resuelve la duda de quien ya está en la ruta. El 17 de septiembre de 2026 aceptaba:

- **Efectivo**, solamente en reales.
- **Tarjetas** de crédito y débito.
- **Telepeajes electrónicos**: Sem Parar, ConectCar, Veloe y Taggy.
- **Código QR**, escaneando el ticket con el celular.

El operador también informa que los vehículos están asegurados contra robo y hurto, conforme la ley municipal de Guarulhos nº 13.912/2010. Y que la reserva anticipada da acceso a una barrera propia, con voucher por código QR.

En los predios asociados, la forma de pago es la de la reserva por Movepark. Lo que declara cada unidad en su ficha está en [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) y [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## ¿Quién encaja en cada opción en la Terminal 2?

Por lo tanto, cinco perfiles cubren a casi todos los que usan el estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos, con valores del oficial del 17 de septiembre de 2026, de Pare Seguro del 3 de noviembre de 2026 y de Aeropark del 13 de noviembre de 2026:

- **Buscar o llevar a alguien:** oficial Standard, a R$ 31,00 la primera hora, por la ausencia de combi.
- **Ida y vuelta de un día:** el oficial, a R$ 79,00 en el Standard, porque los asociados solo aceptan desde dos días, que salen R$ 37,80 en la descubierta de Pare Seguro.
- **Semana de viaje:** un asociado, en plaza descubierta o cubierta, porque la diferencia con el Standard supera los R$ 250,00 en cualquiera de las dos.
- **Un mes entero:** Pare Seguro, a R$ 290,00 en plaza descubierta, por debajo de los R$ 505,00 del Standard. Con cobertura, Pare Seguro cobra R$ 350,00, contra R$ 690,00 del edificio cochera.
- **Quien quiere cobertura dentro del complejo:** el edificio cochera, a R$ 610,00 en quince días.

### ¿Qué entrega de más el edificio cochera?

Vale decir qué compra la diferencia del Premium, porque el texto sería injusto sin eso. El edificio cochera es estructura cubierta, con acceso más corto a la terminal y circulación protegida de la lluvia.

Para quien viaja con un chico pequeño, con mucho equipaje o en día de temporal, eso pesa. Los R$ 28,00 de más en la diaria suelta compran una experiencia distinta, y no solo una plaza.

Lo que no cambia es la naturaleza de la comparación con el predio de afuera. Allá, la plaza cubierta de Pare Seguro sale R$ 350,00 en quince días, contra R$ 610,00 del edificio cochera. La diferencia de R$ 260,00 es el precio de ir en combi en lugar de caminar.

Para una estadía de un mes, la misma cuenta queda en R$ 350,00 en la cubierta de Pare Seguro contra R$ 690,00 en el edificio cochera. Son R$ 340,00, o un 49,3% menos, por el auto cubierto igual. En la cubierta de Aeropark, el mes sale R$ 717,00, R$ 27,00 por encima del edificio cochera.

## ¿Cuándo no compensa el oficial de la Terminal 2?

Dos situaciones en que la diferencia queda indefendible para quien busca estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos.

**Viaje de cinco días.** El Standard cobra R$ 360,00, casi lo mismo que los R$ 460,00 de diez días. El asociado cobra R$ 94,50 por esos mismos cinco días en la plaza descubierta de Pare Seguro.

**Viaje de quince días.** Son R$ 480,00 en el Standard contra R$ 283,50 en la plaza descubierta de Aeropark. La diferencia, R$ 196,50, paga más de diez días en el predio de afuera. En el mes cerrado, la ventaja queda en R$ 215,00 en la descubierta de Pare Seguro, y su plaza cubierta también sale por debajo del Standard, por R$ 155,00 menos.

Quien quiere el menor total posible encuentra el camino completo en [cómo estacionar barato en el Aeropuerto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/). El comparativo por franja de los dos asociados está en el [post de precio del estacionamiento en Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

## Una rutina de cinco pasos para la Terminal 2

Qué hacer antes de salir de casa, en orden:

1. Confirmá que el vuelo embarca en la T2, porque en el oficial eso define los sectores disponibles.
2. Sumá la permanencia real, con holgura a la vuelta, y mirá la franja, no la diaria.
3. Elegí entre Standard y Premium con la diferencia en la mano, que va de R$ 7,00 a R$ 185,00.
4. Simulá el mismo período en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) y compará totales.
5. Si elegís el predio de afuera, verificá la permanencia mínima y reservá por la tabla en línea.

## ¿Cómo se obtuvieron estos precios?

El precio de los predios asociados salió del motor de reservas, con la tabla de Pare Seguro del **3 de noviembre de 2026** y la de Aeropark del **13 de noviembre de 2026** (el valet sigue en la del 19 de octubre). Es el mismo número que cierra la reserva, publicado en el índice de precios con la fecha de la última actualización de cada tabla.

El precio del estacionamiento oficial **no pasa por el motor de Movepark**. Se leyó a mano en la tabla que el operador publica en el sitio del aeropuerto, como imagen, y se verificó el 17 de septiembre de 2026. Por eso todo valor del oficial acá lleva la fecha al lado. Puede cambiar sin aviso, y ningún sistema nos avisa cuando cambia. La división por sector, las formas de pago y la referencia a la ley municipal también salen de esa misma página.

Las distancias se calculan en la base de datos con PostGIS, en línea recta entre las coordenadas del predio y de cada terminal. El tiempo de traslado y la frecuencia de la combi los declara cada unidad en su ficha. Aparecen como declaración de la unidad, y no como promesa de Movepark. Cuando un campo no está declarado, el texto lo dice.

Los números de movimiento del aeropuerto salen en el [portal de estadísticas de ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Preguntas frecuentes

### ¿Cuánto cuesta el estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos?

El 17 de septiembre de 2026, el Standard cobraba R$ 31,00 la primera hora y R$ 79,00 la diaria. En la franja de 11 a 17 días, R$ 480,00. En el Premium y el edificio cochera, que también atienden la T2, los mismos períodos salen R$ 38,00, R$ 107,00 y R$ 610,00.

### ¿La Terminal 2 tiene sector Standard y Premium?

Tiene los dos, y es la única terminal de Guarulhos en esa situación. El Standard atiende las Terminales 1 y 2, y el Premium con el edificio cochera atiende las Terminales 2 y 3. La diferencia entre ellos va de R$ 7,00 en la primera hora a R$ 185,00 en la franja de 18 a 30 días.

### ¿Qué estacionamiento queda más cerca de la Terminal 2 de Guarulhos?

El oficial, porque queda dentro del complejo. Entre los asociados de Movepark, Aeropark, a 2,65 km de la T2 en línea recta, con traslado de 10 minutos y combi cada 30 declarados. Pare Seguro queda a 4,51 km y declara el mismo traslado.

### ¿Cuánto se ahorra estacionando fuera de la Terminal 2?

En una semana, R$ 327,70, o un 71,2%. Ahí el oficial Standard cobra R$ 460,00, el 17 de septiembre de 2026, y las plazas descubiertas de Pare Seguro y de Aeropark salen R$ 132,30, en sus tablas del 3 y del 13 de noviembre de 2026. En quince días la diferencia es de R$ 196,50, y en treinta, de R$ 215,00. En el mes, la plaza cubierta de Pare Seguro también cuesta menos que el Standard, y las dos de Aeropark cuestan más.

### ¿Cuánto cuesta una hora en el estacionamiento de la Terminal 2?

R$ 31,00 en el sector Standard y R$ 38,00 en el Premium o en el edificio cochera, el 17 de septiembre de 2026. Para quien se queda pocas horas, el oficial también sale más barato que los asociados, que solo aceptan desde dos días (R$ 37,80 en la descubierta de Pare Seguro, tabla del 3 de noviembre de 2026).

### ¿El estacionamiento de la Terminal 2 acepta telepeaje?

Sí. La página del operador lista Sem Parar, ConectCar, Veloe y Taggy, además de efectivo, tarjetas de crédito y débito y pago por código QR en el ticket. La información es del propio operador, verificada el 17 de septiembre de 2026.

### ¿El estacionamiento de la Terminal 2 sirve para quien embarca en la Terminal 3?

Sirve, porque la tarifa es del sector en el que queda el auto, y no de la terminal del vuelo. El ahorro es de R$ 130,00 en la franja de 11 a 17 días, y el costo es atravesar el complejo con equipaje, a la ida y a la vuelta.$f14$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'es' and md5(coalesce(body_md, '')) = 'c24acff653bf37ac5fa41fbfdcec5999';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.es', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.es · excerpt
  update public.blog_post_i18n set excerpt = $f15$La T2 es la única terminal presente en las dos tablas del oficial. El Standard cobra R$ 480,00 en 15 días y el Premium R$ 610,00; fuera del complejo, la plaza descubierta de Aeropark cuesta R$ 283,50 en los mismos 15 días.$f15$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'es' and md5(coalesce(excerpt, '')) = '487f988a154590dda9853a8787d54a61';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.es', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-2-aeroporto-guarulhos.es · meta_description
  update public.blog_post_i18n set meta_description = $f16$Estacionamiento en la Terminal 2 del Aeropuerto de Guarulhos: sectores y precio. Diaria desde R$ 18,90 en noviembre de 2026. Compará y reservá con Movepark.$f16$
   where blog_post_id = 'f71728d4-55ad-465f-a623-7725bb54edaa' and locale = 'es' and md5(coalesce(meta_description, '')) = 'b7eb6b95f14ec3664ee358ebbe9767db';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-2-aeroporto-guarulhos.es', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.pt · body_md
  update public.blog_post set body_md = $f17$O estacionamento no Terminal 3 do Aeroporto de Guarulhos tem um detalhe que muda a conta. O T3 não é atendido pelo setor Standard, o mais barato do oficial. Lá dentro só existem Premium, edifício garagem e Flex, que partem de R$ 38,00 na primeira hora e R$ 107,00 na diária. Fora do complexo, os dois pátios parceiros ficam a 3,06 km e 4,88 km do T3, e a vaga descoberta sai a partir de R$ 18,90 por dia, com mínimo de 2 diárias, na tabela da Pare Seguro de 3 de novembro de 2026. O oficial foi conferido em 17 de setembro de 2026.

| Resposta rápida | Oficial em 17/09/2026, Pare Seguro em 03/11/2026, Aeropark em 13/11/2026 |
| --- | --- |
| Setores do oficial que atendem o T3 | Premium, edifício garagem e Flex |
| Tem setor Standard no T3? | não, ele atende só os Terminais 1 e 2 |
| Primeira hora no oficial do T3 | R$ 38,00 |
| Diária avulsa no oficial do T3 | R$ 107,00 |
| 15 diárias no oficial do T3 | R$ 610,00 |
| 15 diárias no Aeropark, vaga descoberta | R$ 283,50 |
| Parceiro mais perto do T3 | Aeropark, a 3,06 km em linha reta |

## Quais setores atendem o estacionamento do Terminal 3 de Guarulhos?

O Aeroporto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tem três terminais de passageiros. O Terminal 3 é o de voos internacionais, e o estacionamento oficial dele é operado pela INDIGO Group Brasil.

A tabela do estacionamento oficial do T3 divide os pátios em setores, e essa divisão é o que quase ninguém explica. Em 17 de setembro de 2026, ela estava assim:

| Setor do oficial | Atende | Primeira hora | Diária avulsa |
| --- | --- | --- | --- |
| Standard | Terminais 1 e 2 | R$ 31,00 | R$ 79,00 |
| Premium e edifício garagem | Terminais 2 e 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

Ou seja, **quem embarca no Terminal 3 não tem acesso ao setor mais barato do oficial**. A tarifa começa no patamar do Premium. São R$ 7,00 a mais na primeira hora e R$ 28,00 a mais na diária, contra o Standard dos Terminais 1 e 2.

A tarifa mínima do Premium é o ponto de partida de qualquer comparação no T3. Ele explica por que a diferença contra o pátio de fora é maior aqui que nos outros dois terminais.

## Quanto custa o estacionamento no Terminal 3 do Aeroporto de Guarulhos?

A tabela do oficial cobra por faixa de permanência, e não por diária multiplicada. Os valores abaixo são os do Premium, do edifício garagem e do Flex, que são os setores do T3. Todos lidos na tabela publicada pelo operador em 17 de setembro de 2026.

| Permanência | Total no oficial do T3 |
| --- | --- |
| Até 1 hora | R$ 38,00 |
| Até 2 horas | R$ 67,00 |
| Até 3 horas | R$ 78,00 |
| Até 4 horas | R$ 89,00 |
| Até 1 diária | R$ 107,00 |
| 2 diárias | R$ 215,00 |
| 3 diárias | R$ 295,00 |
| 4 diárias | R$ 390,00 |
| 5 diárias | R$ 535,00 |
| De 6 a 10 diárias | R$ 565,00 |
| De 11 a 17 diárias | R$ 610,00 |
| De 18 a 30 diárias | R$ 690,00 |
| Acima de 30 diárias | pacote de 30 diárias mais R$ 22,90 por diária |

Duas leituras importam aqui. A primeira: as faixas são **totais**, não valores por dia. Uma viagem de quinze dias cai na faixa de 11 a 17 diárias e paga R$ 610,00, o mesmo que pagaria uma de dezessete.

A segunda: a curva é bem íngreme no começo. Cinco diárias custam R$ 535,00, quase o mesmo que dez, que custam R$ 565,00. Quem vai ficar cinco dias paga praticamente o preço de dez.

## Quanto sai a alternativa fora do complexo para quem embarca no T3?

Além do estacionamento GRU Terminal 3 operado no complexo, a Movepark tem dois pátios parceiros na praça, os dois com traslado de van. Com a tabela da Pare Seguro de 3 de novembro de 2026 e a do Aeropark de 13 de novembro de 2026, os dois empatam na vaga descoberta de 7 a 14 diárias, e o Aeropark sai mais barato na coberta até 14. A Pare Seguro fica abaixo na coberta a partir de 15 diárias e na descoberta a partir de 16. Só o Aeropark tem valet.

| Permanência | Vaga descoberta | Vaga coberta | Valet |
| --- | --- | --- | --- |
| 2 diárias, Pare Seguro | R$ 37,80 | R$ 57,80 | não oferece |
| 2 diárias, Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 diárias, Pare Seguro | R$ 132,30 | R$ 202,30 | não oferece |
| 7 diárias, Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 diárias, Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 15 diárias, Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 diárias, Pare Seguro | R$ 290,00 | R$ 350,00 | não oferece |
| 30 diárias, Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Nenhum dos dois aceita diária avulsa: os dois trabalham com permanência mínima de 2 diárias. O preço vivo fica no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), com a data da última atualização de cada tabela.

## Quanto se economiza saindo do oficial no Terminal 3?

Portanto, aqui está a conta que nenhum comparador faz por terminal, e que decide o estacionamento no Terminal 3 do Aeroporto de Guarulhos. Ela coloca o setor do T3 ao lado da vaga descoberta mais barata dos parceiros em cada permanência. O oficial é de 17 de setembro de 2026, e as tabelas dos parceiros, de 3 de novembro (Pare Seguro) e de 13 de novembro de 2026 (Aeropark).

| Permanência | Oficial do T3 | Parceiro mais barato, descoberta | Diferença |
| --- | --- | --- | --- |
| 2 diárias | R$ 215,00 | R$ 37,80 na Pare Seguro | R$ 177,20, ou 82% |
| 7 diárias | R$ 565,00 | R$ 132,30 nos dois parceiros | R$ 432,70, ou 77% |
| 15 diárias | R$ 610,00 | R$ 283,50 no Aeropark | R$ 326,50, ou 54% |
| 30 diárias | R$ 690,00 | R$ 290,00 na Pare Seguro | R$ 400,00, ou 58% |

A diferença fica acima de R$ 320,00 de uma semana em diante, de R$ 432,70 em sete diárias a R$ 400,00 no mês, sempre a favor do pátio de fora. A exceção é o valet do Aeropark, que **custa mais que o oficial do T3**. Em quinze diárias são R$ 692,90 contra R$ 610,00, R$ 82,90 a mais pelo manobrista.

Nos Terminais 1 e 2 a vantagem do pátio de fora é menor, porque lá o oficial tem o setor Standard, que custa R$ 480,00 na mesma faixa. Em quinze diárias, a vaga descoberta do Aeropark fica R$ 196,50 abaixo do Standard e R$ 326,50 abaixo do setor do T3. É a diferença de setor, e não de distância, que muda o resultado.

## Dá para estacionar no Standard e embarcar no Terminal 3?

Dá, e é a jogada que a tabela do oficial permite sem dizer. A tarifa é **do setor em que você estaciona**, e não do terminal em que você embarca. Quem deixa o carro no Standard paga a tabela do Standard, mesmo que o voo saia do T3.

O que isso custa em reais, na faixa de 11 a 17 diárias: R$ 480,00 no Standard contra R$ 610,00 no Premium ou no edifício garagem. São R$ 130,00 de diferença dentro do próprio oficial, sem sair do complexo.

O que isso cobra em troca é deslocamento interno com bagagem, entre o pátio de um terminal e o embarque em outro. Três pontos para decidir:

- **Com mala despachada e tempo folgado**, os R$ 130,00 costumam valer o trajeto interno.
- **Com criança, cadeirinha ou voo apertado**, a economia não paga o estresse de atravessar o complexo.
- **Na volta**, o percurso é o mesmo em sentido contrário, depois de um voo internacional longo.

Quem faz essa conta e ainda acha caro tem a terceira opção, o pátio de fora. São R$ 283,50 em quinze diárias na vaga descoberta do Aeropark. Ou seja, R$ 196,50 abaixo do Standard e R$ 326,50 abaixo do setor do T3.

## O estacionamento do Terminal 3 é mais caro que o do Terminal 1?

É, e a diferença é do setor, não do terminal em si. O oficial cobra pelo pátio em que você estaciona, e o T3 não tem pátio Standard.

| Permanência | Standard, Terminais 1 e 2 | Premium, edifício garagem e Flex, Terminais 2 e 3 | A mais no T3 |
| --- | --- | --- | --- |
| Até 1 hora | R$ 31,00 | R$ 38,00 | R$ 7,00 |
| Até 1 diária | R$ 79,00 | R$ 107,00 | R$ 28,00 |
| De 6 a 10 diárias | R$ 460,00 | R$ 565,00 | R$ 105,00 |
| De 11 a 17 diárias | R$ 480,00 | R$ 610,00 | R$ 130,00 |
| De 18 a 30 diárias | R$ 505,00 | R$ 690,00 | R$ 185,00 |

Em uma viagem de um mês, o estacionamento no Terminal 3 do Aeroporto de Guarulhos custa R$ 185,00 a mais que o mesmo mês no Terminal 1. Já nos pátios parceiros a tarifa é a mesma para os três terminais, porque ela é do pátio e não do terminal.

O comparativo completo por faixa, com os dois parceiros lado a lado, está no [post de preço do estacionamento em Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

### Quanto custa ficar mais de trinta dias no estacionamento do Terminal 3?

A faixa mais longa do oficial funciona diferente. Acima de 30 diárias, ele cobra o pacote de 30 e soma **R$ 22,90 por diária extra** no Premium e no edifício garagem. No Standard dos Terminais 1 e 2, essa diária extra é de R$ 19,90.

Na prática, 45 dias no oficial do T3 dão R$ 690,00 do pacote mais R$ 343,50 das quinze diárias extras. Assim, o total fica em R$ 1.033,50. Nos parceiros, a vaga descoberta da Pare Seguro custa R$ 290,00 fixos de 15 a 30 diárias e volta a R$ 18,90 por dia depois disso, o que dá R$ 573,50 em 45 dias.

## A que distância fica o estacionamento no Terminal 3 do Aeroporto de Guarulhos?

Além disso, o T3 fica no extremo do complexo, e isso encurta a vantagem de quem está mais perto.

| Pátio parceiro | Distância do T3, em linha reta | Distância do T1 | Traslado declarado |
| --- | --- | --- | --- |
| Aeropark | 3,06 km | 1,88 km | 10 minutos, van a cada 30 |
| Pare Seguro | 4,88 km | 3,97 km | 10 minutos, van a cada 30 |

As distâncias são calculadas no banco de dados da Movepark com PostGIS, em linha reta. Os três terminais estão cadastrados como pontos próprios, então a medida é por terminal. O percurso de van é mais longo, porque segue as vias de acesso.

Repare no que acontece com o Aeropark: ele fica 1,18 km mais longe do T3 do que do T1, uma diferença de 63%. Na Pare Seguro a distância também cresce, de 3,97 km no T1 para 4,88 km no T3.

A leitura prática para quem embarca no T3 é curta. A vantagem de distância do Aeropark cai de 2,09 km no T1 para 1,82 km no T3. No preço, os dois empatam na vaga descoberta de 7 a 14 diárias, e a Pare Seguro fica R$ 247,00 abaixo no mês. A comparação de tempo porta a porta está no post sobre [estacionamento próximo ao Aeroporto Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## Quanto tempo somar ao trajeto quando o embarque é no Terminal 3?

Assim, o bloco de tempo é o mesmo dos outros terminais, com o quilômetro extra da van.

Nos dois parceiros, a ficha declara traslado de 10 minutos e van a cada 30 minutos. Somando espera, trajeto e caminhada até o balcão, dá de 15 a 50 minutos entre entrar no pátio e estar no terminal. Reserve cerca de 40 minutos, e coloque esse bloco **antes** do prazo de check-in da companhia.

No T3 vale um cuidado extra. Voo internacional costuma pedir apresentação com mais antecedência. Confirme na chegada onde a van encosta no seu terminal: atravessar entre terminais com bagagem custa mais tempo que o quilômetro entre os dois pátios.

## Como funciona o pagamento no estacionamento oficial do Terminal 3?

A página do próprio operador lista o que o estacionamento oficial do T3 aceita, e isso responde uma dúvida comum de quem já está dirigindo. Em 17 de setembro de 2026, o oficial aceitava:

- **Dinheiro**, somente em real.
- **Cartões** de crédito e débito.
- **Tags eletrônicas**: Sem Parar, ConectCar, Veloe e Taggy.
- **QR Code**, escaneando o ticket pelo celular.

O operador também informa que os veículos são segurados contra roubo e furto, conforme a Lei Municipal de Guarulhos nº 13.912/2010. E que a reserva antecipada dá acesso a uma cancela própria, com voucher por QR Code.

Nos pátios parceiros, a forma de pagamento é a da reserva pela Movepark. O que cada unidade declara na ficha está em [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) e [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## Quando vale estacionar dentro do Terminal 3?

Vale em dois casos, e nenhum deles é preço.

Na prática, o edifício garagem do Terminal 3 compra tempo, não economia.

**Permanência de poucas horas.** Buscar alguém que desembarca no T3 custa R$ 38,00 na primeira hora e R$ 67,00 em duas. É caro por hora, mas resolve sem van no caminho. O tempo economizado é real: de 15 a 50 minutos em cada sentido.

**Horário muito apertado.** Se o voo é internacional e a margem é curta, a caminhada coberta do oficial até o balcão vale mais que a diferença em reais.

Quem se encaixa em cada opção, em uma frase:

- **Buscar ou levar alguém:** oficial do T3, pela ausência de van no caminho.
- **Bate e volta de um dia:** o oficial, a R$ 107,00, porque os parceiros só aceitam a partir de duas diárias. Se a volta passar de 24 horas, a Pare Seguro sai por R$ 37,80 em duas diárias na vaga descoberta.
- **Semana de férias:** parceiro, na vaga descoberta ou na coberta, porque a diferença para o oficial vai de R$ 362,70 a R$ 432,70.
- **Mês inteiro:** Pare Seguro na vaga descoberta, a R$ 290,00, ou coberta a R$ 350,00 se o carro vai pegar sol.
- **Quem não quer manobrar:** valet do Aeropark, a R$ 692,90 em quinze diárias, R$ 82,90 acima do oficial do T3.

Fora dos dois casos acima, a conta favorece o pátio de fora com folga. Em uma semana, a diferença é de R$ 432,70, mais de três vezes o total cobrado pelos parceiros na vaga descoberta. Quem quer o menor total possível encontra o caminho em [como estacionar barato no Aeroporto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## Quando o oficial do Terminal 3 não compensa de jeito nenhum?

Ou seja, há três situações em que a diferença fica indefensável para quem procura estacionamento no Terminal 3 do Aeroporto de Guarulhos.

**Viagem de cinco dias.** O oficial cobra R$ 535,00, quase o mesmo que os R$ 565,00 de dez diárias. O parceiro cobra R$ 94,50 pelos mesmos cinco dias na vaga descoberta da Pare Seguro.

**Estadia de um mês.** São R$ 690,00 no oficial do T3 contra R$ 290,00 na vaga descoberta da Pare Seguro, uma diferença de R$ 400,00. Na vaga coberta, o pátio faz diferença: a da Pare Seguro sai por R$ 350,00, e a do Aeropark, por R$ 717,00, R$ 27,00 acima do oficial.

**Quem quer cobertura.** A vaga coberta sai por R$ 350,00 em quinze diárias na Pare Seguro e por R$ 373,50 no Aeropark. O edifício garagem do oficial, que é a opção coberta do T3, sai por R$ 610,00 na mesma faixa.

## Vale reservar antes no estacionamento do Terminal 3?

Nos dois lados, sim, por motivos diferentes.

No oficial, a reserva antecipada dá a cancela própria, e o operador trata a vaga como sujeita a disponibilidade. Ou seja, ali reservar resolve acesso, e não preço.

Nos parceiros, a reserva pela tabela online fica abaixo da tabela de balcão. No Aeropark a diferença fica em torno de 17%: em quinze diárias na vaga descoberta, isso significa sair de R$ 340,20 para R$ 283,50. É o mesmo mecanismo em qualquer terminal, porque a tarifa é do pátio.

## Um roteiro de cinco passos para o Terminal 3

Por fim, o que fazer antes de sair de casa, na ordem:

1. Confira em qual terminal o seu voo embarca, porque no oficial isso muda o setor disponível e o preço.
2. Some a permanência real, com folga na volta, e olhe a faixa correspondente, não a diária.
3. Simule o mesmo período no [índice de preços de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) e compare o total, não o valor por dia.
4. Se escolher o pátio de fora, cheque a permanência mínima e reserve pela tabela online.
5. Anote o tempo de van no planejamento, de 15 a 50 minutos, antes do prazo de check-in.

## Como estes preços foram apurados?

O preço dos pátios parceiros saiu do motor de reservas, com a tabela da Pare Seguro de **3 de novembro de 2026** e a do Aeropark de **13 de novembro de 2026** (o valet segue na de 19 de outubro). É o mesmo número que fecha a reserva. Ele aparece na [página do Aeroporto de Guarulhos](/estacionamentos/aeroporto-guarulhos) e no índice de preços, com a data da última atualização de cada tabela.

O preço do estacionamento oficial **não passa pelo motor da Movepark**. Ele foi lido à mão na tabela que o operador publica no site do aeroporto, como imagem, e conferido em 17 de setembro de 2026. Por isso todo valor do oficial aqui carrega a data ao lado. Ele pode mudar sem aviso, e nenhum sistema nos avisa quando muda. A divisão por setor, as formas de pagamento e a referência à lei municipal também saem dessa mesma página do operador.

As distâncias são calculadas no banco de dados com PostGIS, em linha reta entre as coordenadas do pátio e de cada terminal. Já o tempo de traslado e a frequência da van são declarados por cada unidade na ficha. Eles aparecem como declaração da unidade, e não como promessa da Movepark. Quando um campo não está declarado, o texto diz que não está.

Os números de movimentação do aeroporto saem no [portal de estatísticas da ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Perguntas frequentes

### Quanto custa, afinal, o estacionamento no Terminal 3 do Aeroporto de Guarulhos?

Em 17 de setembro de 2026, o oficial do T3 cobrava R$ 38,00 na primeira hora e R$ 107,00 na diária. Na faixa de 11 a 17 diárias, R$ 610,00, e na de 18 a 30, R$ 690,00. São os setores Premium, edifício garagem e Flex, porque o T3 não tem Standard.

### O Terminal 3 de Guarulhos tem setor Standard?

Não. Pela tabela do operador, o Standard atende apenas os Terminais 1 e 2. Quem embarca no Terminal 3 usa Premium, edifício garagem ou Flex. Eles partem de um patamar mais alto: R$ 28,00 a mais na diária e R$ 130,00 a mais na faixa de 11 a 17 diárias.

### Qual estacionamento fica mais perto do Terminal 3 de Guarulhos?

O oficial, porque fica dentro do complexo. Entre os parceiros, o Aeropark, a 3,06 km do T3 em linha reta. Ele declara traslado de 10 minutos e van a cada 30. A Pare Seguro fica a 4,88 km e declara o mesmo traslado.

### Quanto se economiza estacionando fora do Terminal 3?

Em uma semana, R$ 432,70, ou 77%. É o oficial a R$ 565,00, em 17 de setembro de 2026, contra R$ 132,30 na vaga descoberta da Pare Seguro e do Aeropark, nas tabelas de 3 e de 13 de novembro de 2026. Em quinze diárias a diferença é de R$ 326,50, e em trinta, de R$ 400,00.

### O estacionamento do Terminal 3 aceita tag de pedágio?

Sim. A página do operador lista Sem Parar, ConectCar, Veloe e Taggy, além de dinheiro, cartões de crédito e débito e pagamento por QR Code no ticket. A informação é do próprio operador, conferida em 17 de setembro de 2026.

### Vale a pena o valet do parceiro para quem embarca no T3?

Em quinze diárias, o valet do Aeropark sai por R$ 692,90 e o oficial do T3 por R$ 610,00. Ou seja, o valet custa R$ 82,90 a mais, e só compensa se o manobrista valer essa diferença para você. A vaga descoberta do Aeropark sai por R$ 283,50 e continua sendo o menor total.

### O preço do estacionamento muda entre os terminais de Guarulhos?

No oficial muda, porque a tarifa é do setor, e o T3 só tem setores mais caros. Nos pátios parceiros não muda: a tabela é do pátio, igual para os três terminais. O que muda ali é a distância, de 3,06 km a 4,88 km até o T3.$f17$
   where id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and md5(coalesce(body_md, '')) = 'a325e9688e12343f64f2fa059fb2a0e5';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.pt', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.pt · meta_description
  update public.blog_post set meta_description = $f18$Estacionamento no Terminal 3 do Aeroporto de Guarulhos: setores e preço. Diária a partir de R$ 18,90 em novembro de 2026. Compare e reserve pela Movepark.$f18$
   where id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and md5(coalesce(meta_description, '')) = '7b20927d0e3140505b0a961f4f1c2fa8';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.pt', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.en · body_md
  update public.blog_post_i18n set body_md = $f19$Parking at Terminal 3 of Guarulhos Airport has a detail that changes the sum. T3 is not served by the Standard sector, the cheapest official one. Inside there are only Premium, the multi-storey car park and Flex, which start at R$ 38.00 for the first hour and R$ 107.00 a day. Outside the complex, the two partner lots sit 3.06 km and 4.88 km from T3, and an uncovered spot starts at R$ 18.90 a day, with a 2-day minimum, on Pare Seguro's table of 3 November 2026. The official car park was checked on 17 September 2026.

| Quick answer | Official on 17/09/2026, Pare Seguro on 03/11/2026, Aeropark on 13/11/2026 |
| --- | --- |
| Official sectors serving T3 | Premium, multi-storey car park and Flex |
| Is there a Standard sector at T3? | no, it serves Terminals 1 and 2 only |
| First hour at the official T3 car park | R$ 38.00 |
| Single day at the official T3 car park | R$ 107.00 |
| 15 days at the official T3 car park | R$ 610.00 |
| 15 days at Aeropark, uncovered spot | R$ 283.50 |
| Closest partner to T3 | Aeropark, 3.06 km as the crow flies |

## Which sectors serve parking at Terminal 3 in Guarulhos?

São Paulo/Guarulhos Governador André Franco Montoro International Airport, IATA code GRU, has three passenger terminals. Terminal 3 is the international one, and its official car park is operated by INDIGO Group Brasil.

The official T3 table splits the lots into sectors, and that split is what almost nobody explains. On 17 September 2026 it looked like this:

| Official sector | Serves | First hour | Single day |
| --- | --- | --- | --- |
| Standard | Terminals 1 and 2 | R$ 31.00 | R$ 79.00 |
| Premium and multi-storey car park | Terminals 2 and 3 | R$ 38.00 | R$ 107.00 |
| Flex | Terminal 3 | R$ 38.00 | R$ 107.00 |

In other words, **anyone departing from Terminal 3 has no access to the cheapest official sector**. The rate starts at the Premium level. That is R$ 7.00 more for the first hour and R$ 28.00 more for a day, against the Standard of Terminals 1 and 2.

The Premium minimum is the starting point of any comparison at T3. It explains why the gap against an outside lot is wider here than at the other two terminals.

## How much does parking at Terminal 3 of Guarulhos Airport cost?

The official table charges by length-of-stay band, not by a daily rate multiplied out. The figures below are for Premium, the multi-storey car park and Flex, which are the T3 sectors. All read from the table published by the operator on 17 September 2026.

| Length of stay | Total at the official T3 car park |
| --- | --- |
| Up to 1 hour | R$ 38.00 |
| Up to 2 hours | R$ 67.00 |
| Up to 3 hours | R$ 78.00 |
| Up to 4 hours | R$ 89.00 |
| Up to 1 day | R$ 107.00 |
| 2 days | R$ 215.00 |
| 3 days | R$ 295.00 |
| 4 days | R$ 390.00 |
| 5 days | R$ 535.00 |
| 6 to 10 days | R$ 565.00 |
| 11 to 17 days | R$ 610.00 |
| 18 to 30 days | R$ 690.00 |
| Over 30 days | the 30-day package plus R$ 22.90 a day |

Two readings matter here. First: the bands are **totals**, not per-day figures. A fifteen-day trip falls into the 11-to-17-day band and pays R$ 610.00, the same as a seventeen-day one.

Second: the curve is steep early on. Five days cost R$ 535.00, nearly the same as ten, which cost R$ 565.00. Anyone staying five days pays practically the price of ten.

## What does the alternative outside the complex cost for a T3 departure?

Besides the GRU Terminal 3 car park run inside the complex, Movepark has two partner lots in this location, both with a van transfer. With Pare Seguro's table of 3 November 2026 and Aeropark's of 13 November 2026, the two tie on an uncovered spot from 7 to 14 days, and Aeropark is cheaper for a covered spot up to 14. Pare Seguro comes in lower for a covered spot from 15 days and for an uncovered one from 16. Only Aeropark has valet.

| Length of stay | Uncovered spot | Covered spot | Valet |
| --- | --- | --- | --- |
| 2 days, Pare Seguro | R$ 37.80 | R$ 57.80 | not offered |
| 2 days, Aeropark | R$ 39.80 | R$ 53.80 | R$ 179.80 |
| 7 days, Pare Seguro | R$ 132.30 | R$ 202.30 | not offered |
| 7 days, Aeropark | R$ 132.30 | R$ 174.30 | R$ 593.90 |
| 15 days, Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 15 days, Aeropark | R$ 283.50 | R$ 373.50 | R$ 692.90 |
| 30 days, Pare Seguro | R$ 290.00 | R$ 350.00 | not offered |
| 30 days, Aeropark | R$ 537.00 | R$ 717.00 | R$ 791.90 |

Neither takes a single day: both work with a 2-day minimum stay. The live price is in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos), with the date of each table's last update.

## How much do you save by leaving the official car park at Terminal 3?

So here is the sum no comparison site does by terminal, and that decides parking at Terminal 3 of Guarulhos Airport. It puts the T3 sector next to the partners' cheapest uncovered spot for each length of stay. The official car park is from 17 September 2026, and the partners' tables from 3 November (Pare Seguro) and 13 November 2026 (Aeropark).

| Length of stay | Official T3 | Cheapest partner, uncovered | Difference |
| --- | --- | --- | --- |
| 2 days | R$ 215.00 | R$ 37.80 at Pare Seguro | R$ 177.20, or 82% |
| 7 days | R$ 565.00 | R$ 132.30 at both partners | R$ 432.70, or 77% |
| 15 days | R$ 610.00 | R$ 283.50 at Aeropark | R$ 326.50, or 54% |
| 30 days | R$ 690.00 | R$ 290.00 at Pare Seguro | R$ 400.00, or 58% |

The difference stays above R$ 320.00 from a week up, from R$ 432.70 over seven days to R$ 400.00 over a month, always in favour of the outside lot. The exception is Aeropark's valet, which **costs more than the official T3 car park**. Over fifteen days it is R$ 692.90 against R$ 610.00, R$ 82.90 more for the valet.

At Terminals 1 and 2 the outside lot's advantage is smaller, because there the official car park has the Standard sector, which costs R$ 480.00 in the same band. Over fifteen days, Aeropark's uncovered spot comes in R$ 196.50 below Standard and R$ 326.50 below the T3 sector. It is the difference in sector, not in distance, that changes the result.

## Can you park in Standard and depart from Terminal 3?

You can, and it is the move the official table allows without saying so. The rate belongs to **the sector where you park**, not to the terminal you depart from. Anyone leaving the car in Standard pays the Standard table, even if the flight leaves from T3.

What that is worth in reais, over the 11-to-17-day band: R$ 480.00 in Standard against R$ 610.00 in Premium or the multi-storey car park. That is R$ 130.00 of difference inside the official car park itself, without leaving the complex.

What it charges in return is an internal journey with luggage, between one terminal's lot and another terminal's departures. Three points to decide by:

- **With checked baggage and time to spare**, the R$ 130.00 usually justifies the internal trip.
- **With a child, a car seat or a tight flight**, the saving does not pay for the stress of crossing the complex.
- **On the way back**, the route is the same in reverse, after a long international flight.

Anyone who does this sum and still finds it expensive has the third option, the outside lot. That is R$ 283.50 over fifteen days for Aeropark's uncovered spot. In other words, R$ 196.50 below Standard and R$ 326.50 below the T3 sector.

## Is parking at Terminal 3 more expensive than at Terminal 1?

It is, and the difference is the sector, not the terminal itself. The official car park charges for the lot you park in, and T3 has no Standard lot.

| Length of stay | Standard, Terminals 1 and 2 | Premium, multi-storey and Flex, Terminals 2 and 3 | Extra at T3 |
| --- | --- | --- | --- |
| Up to 1 hour | R$ 31.00 | R$ 38.00 | R$ 7.00 |
| Up to 1 day | R$ 79.00 | R$ 107.00 | R$ 28.00 |
| 6 to 10 days | R$ 460.00 | R$ 565.00 | R$ 105.00 |
| 11 to 17 days | R$ 480.00 | R$ 610.00 | R$ 130.00 |
| 18 to 30 days | R$ 505.00 | R$ 690.00 | R$ 185.00 |

On a month-long trip, parking at Terminal 3 of Guarulhos Airport costs R$ 185.00 more than the same month at Terminal 1. At the partner lots the rate is the same for all three terminals, because it belongs to the lot and not to the terminal.

The full comparison by band, with both partners side by side, is in the [post on the price of parking at Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

### What does staying more than thirty days at the Terminal 3 car park cost?

The official car park's longest band works differently. Above 30 days it charges the 30-day package and adds **R$ 22.90 per extra day** in Premium and the multi-storey car park. In the Standard of Terminals 1 and 2, that extra day is R$ 19.90.

In practice, 45 days at the official T3 car park come to R$ 690.00 for the package plus R$ 343.50 for the fifteen extra days. So the total lands at R$ 1,033.50. At the partners, Pare Seguro's uncovered spot costs a flat R$ 290.00 from 15 to 30 days and goes back to R$ 18.90 a day after that, which comes to R$ 573.50 over 45 days.

## How far is the parking from Terminal 3 of Guarulhos Airport?

T3 also sits at the far end of the complex, and that shortens the advantage of whoever is closest.

| Partner lot | Distance from T3, straight line | Distance from T1 | Stated transfer |
| --- | --- | --- | --- |
| Aeropark | 3.06 km | 1.88 km | 10 minutes, van every 30 |
| Pare Seguro | 4.88 km | 3.97 km | 10 minutes, van every 30 |

Distances are calculated in Movepark's database with PostGIS, as a straight line. All three terminals are registered as points of their own, so the measurement is per terminal. The van route is longer, because it follows the access roads.

Notice what happens with Aeropark: it sits 1.18 km further from T3 than from T1, a 63% difference. At Pare Seguro the distance also grows, from 3.97 km at T1 to 4.88 km at T3.

The practical reading for anyone departing from T3 is short. Aeropark's distance advantage drops from 2.09 km at T1 to 1.82 km at T3. On price, the two tie for an uncovered spot from 7 to 14 days, and Pare Seguro comes in R$ 247.00 lower over a month. The door-to-door time comparison is in the post on [parking near Guarulhos Airport](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## How much time should you add to the journey when departing from Terminal 3?

The time block is the same as at the other terminals, with the extra kilometre of van.

At both partners, the page states a 10-minute transfer and a van every 30 minutes. Adding the wait, the ride and the walk to the desk, that is 15 to 50 minutes between entering the lot and being at the terminal. Allow about 40 minutes, and put that block **before** the airline's check-in deadline.

At T3 one extra care applies. An international flight usually asks you to be there earlier. Confirm on arrival where the van stops at your terminal: crossing between terminals with luggage costs more time than the kilometre between the two lots.

## How does payment work at the official Terminal 3 car park?

The operator's own page lists what the official T3 car park accepts, and that answers a common question for someone already driving. On 17 September 2026 the official car park accepted:

- **Cash**, in Brazilian reais only.
- **Credit and debit cards**.
- **Electronic toll tags**: Sem Parar, ConectCar, Veloe and Taggy.
- **QR Code**, scanning the ticket with a phone.

The operator also states that vehicles are insured against theft and robbery, under Guarulhos municipal law nº 13,912/2010. And that booking ahead gives access to a dedicated barrier, with a QR Code voucher.

At the partner lots, the payment method is the one for a Movepark booking. What each unit states on its page is in [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) and [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## When is it worth parking inside Terminal 3?

It is worth it in two cases, and neither of them is price.

In practice, the Terminal 3 multi-storey car park buys time, not savings.

**A stay of a few hours.** Picking someone up arriving at T3 costs R$ 38.00 for the first hour and R$ 67.00 for two. It is expensive per hour, but it solves the problem with no van in the way. The time saved is real: 15 to 50 minutes in each direction.

**A very tight schedule.** If the flight is international and the margin is short, the covered walk from the official car park to the desk is worth more than the difference in reais.

Who fits each option, in one line:

- **Picking someone up or dropping them off:** the official T3 car park, because there is no van in the way.
- **A one-day there-and-back:** the official car park, at R$ 107.00, because the partners only take stays from two days. If the return goes past 24 hours, Pare Seguro comes to R$ 37.80 for two days in an uncovered spot.
- **A holiday week:** a partner, in an uncovered or covered spot, because the gap to the official car park runs from R$ 362.70 to R$ 432.70.
- **A whole month:** Pare Seguro's uncovered spot, at R$ 290.00, or the covered one at R$ 350.00 if the car will be in the sun.
- **Anyone who does not want to park:** Aeropark's valet, at R$ 692.90 over fifteen days, R$ 82.90 above the official T3 car park.

Outside the two cases above, the sum favours the outside lot by a wide margin. Over a week, the difference is R$ 432.70, more than three times the total the partners charge for an uncovered spot. Anyone after the lowest possible total finds the route in [how to park cheaply at Guarulhos Airport](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## When does the official Terminal 3 car park make no sense at all?

There are three situations where the gap becomes indefensible for anyone looking for parking at Terminal 3 of Guarulhos Airport.

**A five-day trip.** The official car park charges R$ 535.00, almost the same as the R$ 565.00 for ten days. The partner charges R$ 94.50 for those same five days in Pare Seguro's uncovered spot.

**A month-long stay.** That is R$ 690.00 at the official T3 car park against R$ 290.00 for Pare Seguro's uncovered spot, a difference of R$ 400.00. For a covered spot, the lot makes a difference: Pare Seguro's comes to R$ 350.00, and Aeropark's to R$ 717.00, R$ 27.00 above the official car park.

**Anyone who wants cover.** A covered spot comes to R$ 350.00 over fifteen days at Pare Seguro and R$ 373.50 at Aeropark. The official multi-storey car park, which is T3's covered option, comes to R$ 610.00 in the same band.

## Is it worth booking ahead at the Terminal 3 car park?

On both sides, yes, for different reasons.

At the official car park, booking ahead gives you the dedicated barrier, and the operator treats the space as subject to availability. So booking there solves access, not price.

At the partners, booking on the online table comes in below the counter table. At Aeropark the gap is around 17%: over fifteen days in an uncovered spot, that means going from R$ 340.20 to R$ 283.50. It is the same mechanism at any terminal, because the rate belongs to the lot.

## A five-step routine for Terminal 3

What to do before leaving home, in order:

1. Check which terminal your flight departs from, because at the official car park that changes the sector available and the price.
2. Add up the real length of stay, with slack on the return, and look at the matching band, not the daily rate.
3. Simulate the same period in the [Guarulhos price index](/estacionamentos/aeroporto-guarulhos/precos) and compare the total, not the per-day figure.
4. If you choose the outside lot, check the minimum stay and book on the online table.
5. Note the van time in your planning, 15 to 50 minutes, before the check-in deadline.

## How were these prices gathered?

The partner lots' prices came from the booking engine, with Pare Seguro's table of **3 November 2026** and Aeropark's of **13 November 2026** (its valet stays on the table of 19 October). It is the same figure that closes the booking. It appears on the [Guarulhos Airport page](/estacionamentos/aeroporto-guarulhos) and in the price index, with the date of each table's last update.

The official car park's price **does not pass through the Movepark engine**. It was read by hand from the table the operator publishes on the airport's site, as an image, and checked on 17 September 2026. That is why every official figure here carries the date beside it. It can change without notice, and no system tells us when it does. The split by sector, the payment methods and the reference to the municipal law also come from that same operator page.

Distances are calculated in the database with PostGIS, as a straight line between the lot's coordinates and each terminal's. Transfer time and van frequency are stated by each unit on its page. They appear as the unit's own statement, not as a Movepark promise. When a field is not stated, the text says so.

Airport traffic figures are on the [ANAC statistics portal](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Frequently asked questions

### So how much does parking at Terminal 3 of Guarulhos Airport cost?

On 17 September 2026, the official T3 car park charged R$ 38.00 for the first hour and R$ 107.00 for a day. In the 11-to-17-day band, R$ 610.00, and in the 18-to-30 band, R$ 690.00. Those are the Premium, multi-storey and Flex sectors, because T3 has no Standard.

### Does Terminal 3 in Guarulhos have a Standard sector?

No. By the operator's table, Standard serves Terminals 1 and 2 only. Anyone departing from Terminal 3 uses Premium, the multi-storey car park or Flex. They start from a higher level: R$ 28.00 more a day and R$ 130.00 more in the 11-to-17-day band.

### Which car park is closest to Terminal 3 in Guarulhos?

The official one, because it is inside the complex. Among the partners, Aeropark, 3.06 km from T3 as the crow flies. It states a 10-minute transfer and a van every 30. Pare Seguro is 4.88 km away and states the same transfer.

### How much do you save by parking outside Terminal 3?

Over a week, R$ 432.70, or 77%. That is the official car park at R$ 565.00, on 17 September 2026, against R$ 132.30 for the uncovered spot at Pare Seguro and Aeropark, on their tables of 3 and 13 November 2026. Over fifteen days the difference is R$ 326.50, and over thirty, R$ 400.00.

### Does the Terminal 3 car park accept toll tags?

Yes. The operator's page lists Sem Parar, ConectCar, Veloe and Taggy, along with cash, credit and debit cards, and payment by QR Code on the ticket. The information is the operator's own, checked on 17 September 2026.

### Is a partner's valet worth it for a T3 departure?

Over fifteen days, Aeropark's valet comes to R$ 692.90 and the official T3 car park to R$ 610.00. In other words, the valet costs R$ 82.90 more, and only pays off if the valet is worth that difference to you. Aeropark's uncovered spot comes to R$ 283.50 and is still the lowest total.

### Does the parking price change between the Guarulhos terminals?

At the official car park it changes, because the rate belongs to the sector, and T3 only has the dearer sectors. At the partner lots it does not change: the table belongs to the lot, the same for all three terminals. What changes there is the distance, from 3.06 km to 4.88 km to T3.$f19$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'en' and md5(coalesce(body_md, '')) = '13f1db6f7d6a102826490e3d3df3e861';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.en', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.en · excerpt
  update public.blog_post_i18n set excerpt = $f20$T3 has no Standard sector, the cheapest official one. Inside, rates start at R$ 38.00 for the first hour and R$ 107.00 a day; outside, a partner lot charges from R$ 18.90 a day in its table from 3 November 2026.$f20$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'en' and md5(coalesce(excerpt, '')) = '40ffebadfdc0d2323cf6d4ca81cb3d4b';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.en', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.en · meta_description
  update public.blog_post_i18n set meta_description = $f21$Parking at Terminal 3 of Guarulhos Airport: sectors and price. A day from R$ 18.90 in November 2026. Compare and book with Movepark.$f21$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'en' and md5(coalesce(meta_description, '')) = 'febacd3dfb495ad910647e8e08529e3e';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.en', 'meta_description'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.es · body_md
  update public.blog_post_i18n set body_md = $f22$El estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos tiene un detalle que cambia la cuenta. La T3 no está atendida por el sector Standard, el más barato del oficial. Adentro solo hay Premium, edificio cochera y Flex, que parten de R$ 38,00 la primera hora y R$ 107,00 la diaria. Fuera del complejo, los dos predios asociados quedan a 3,06 km y 4,88 km de la T3, y la plaza descubierta sale desde R$ 18,90 por día, con mínimo de 2 días, en la tabla de Pare Seguro del 3 de noviembre de 2026. El oficial se consultó el 17 de septiembre de 2026.

| Respuesta rápida | Oficial al 17/09/2026, Pare Seguro al 03/11/2026, Aeropark al 13/11/2026 |
| --- | --- |
| Sectores del oficial que atienden la T3 | Premium, edificio cochera y Flex |
| ¿Hay sector Standard en la T3? | no, atiende solo las Terminales 1 y 2 |
| Primera hora en el oficial de la T3 | R$ 38,00 |
| Diaria suelta en el oficial de la T3 | R$ 107,00 |
| 15 días en el oficial de la T3 | R$ 610,00 |
| 15 días en Aeropark, plaza descubierta | R$ 283,50 |
| Asociado más cerca de la T3 | Aeropark, a 3,06 km en línea recta |

## ¿Qué sectores atienden el estacionamiento de la Terminal 3 de Guarulhos?

El Aeropuerto Internacional de São Paulo/Guarulhos Governador André Franco Montoro, código IATA GRU, tiene tres terminales de pasajeros. La Terminal 3 es la de vuelos internacionales, y su estacionamiento oficial lo opera INDIGO Group Brasil.

La tabla del estacionamiento oficial de la T3 divide los predios en sectores, y esa división es lo que casi nadie explica. El 17 de septiembre de 2026 estaba así:

| Sector del oficial | Atiende | Primera hora | Diaria suelta |
| --- | --- | --- | --- |
| Standard | Terminales 1 y 2 | R$ 31,00 | R$ 79,00 |
| Premium y edificio cochera | Terminales 2 y 3 | R$ 38,00 | R$ 107,00 |
| Flex | Terminal 3 | R$ 38,00 | R$ 107,00 |

O sea, **quien embarca en la Terminal 3 no tiene acceso al sector más barato del oficial**. La tarifa empieza en el nivel del Premium. Son R$ 7,00 más en la primera hora y R$ 28,00 más en la diaria, contra el Standard de las Terminales 1 y 2.

La tarifa mínima del Premium es el punto de partida de cualquier comparación en la T3. Explica por qué la diferencia contra el predio de afuera es mayor acá que en las otras dos terminales.

## ¿Cuánto cuesta el estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos?

La tabla del oficial cobra por franja de permanencia, y no por diaria multiplicada. Los valores de abajo son los del Premium, el edificio cochera y el Flex, que son los sectores de la T3. Todos leídos en la tabla publicada por el operador el 17 de septiembre de 2026.

| Permanencia | Total en el oficial de la T3 |
| --- | --- |
| Hasta 1 hora | R$ 38,00 |
| Hasta 2 horas | R$ 67,00 |
| Hasta 3 horas | R$ 78,00 |
| Hasta 4 horas | R$ 89,00 |
| Hasta 1 día | R$ 107,00 |
| 2 días | R$ 215,00 |
| 3 días | R$ 295,00 |
| 4 días | R$ 390,00 |
| 5 días | R$ 535,00 |
| De 6 a 10 días | R$ 565,00 |
| De 11 a 17 días | R$ 610,00 |
| De 18 a 30 días | R$ 690,00 |
| Más de 30 días | el paquete de 30 días más R$ 22,90 por día |

Dos lecturas importan acá. La primera: las franjas son **totales**, no valores por día. Un viaje de quince días cae en la franja de 11 a 17 días y paga R$ 610,00, lo mismo que pagaría uno de diecisiete.

La segunda: la curva es empinada al principio. Cinco días cuestan R$ 535,00, casi lo mismo que diez, que cuestan R$ 565,00. Quien se queda cinco días paga prácticamente el precio de diez.

## ¿Cuánto sale la alternativa fuera del complejo para quien embarca en la T3?

Además del estacionamiento GRU Terminal 3 operado en el complejo, Movepark tiene dos predios asociados en la zona, los dos con traslado en combi. Con la tabla de Pare Seguro del 3 de noviembre de 2026 y la de Aeropark del 13 de noviembre de 2026, los dos empatan en plaza descubierta de 7 a 14 días, y Aeropark sale más barato en la cubierta hasta 14. Pare Seguro queda por debajo en la cubierta desde 15 días y en la descubierta desde 16. Solo Aeropark tiene valet.

| Permanencia | Plaza descubierta | Plaza cubierta | Valet |
| --- | --- | --- | --- |
| 2 días, Pare Seguro | R$ 37,80 | R$ 57,80 | no ofrece |
| 2 días, Aeropark | R$ 39,80 | R$ 53,80 | R$ 179,80 |
| 7 días, Pare Seguro | R$ 132,30 | R$ 202,30 | no ofrece |
| 7 días, Aeropark | R$ 132,30 | R$ 174,30 | R$ 593,90 |
| 15 días, Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 15 días, Aeropark | R$ 283,50 | R$ 373,50 | R$ 692,90 |
| 30 días, Pare Seguro | R$ 290,00 | R$ 350,00 | no ofrece |
| 30 días, Aeropark | R$ 537,00 | R$ 717,00 | R$ 791,90 |

Ninguno de los dos acepta día suelto: los dos trabajan con una permanencia mínima de 2 días. El precio en vivo está en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos), con la fecha de la última actualización de cada tabla.

## ¿Cuánto se ahorra saliendo del oficial en la Terminal 3?

Por lo tanto, acá está la cuenta que ningún comparador hace por terminal, y que decide el estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos. Pone el sector de la T3 al lado de la plaza descubierta más barata de los asociados en cada permanencia. El oficial es del 17 de septiembre de 2026, y las tablas de los asociados, del 3 de noviembre (Pare Seguro) y del 13 de noviembre de 2026 (Aeropark).

| Permanencia | Oficial de la T3 | Asociado más barato, descubierta | Diferencia |
| --- | --- | --- | --- |
| 2 días | R$ 215,00 | R$ 37,80 en Pare Seguro | R$ 177,20, o un 82% |
| 7 días | R$ 565,00 | R$ 132,30 en los dos asociados | R$ 432,70, o un 77% |
| 15 días | R$ 610,00 | R$ 283,50 en Aeropark | R$ 326,50, o un 54% |
| 30 días | R$ 690,00 | R$ 290,00 en Pare Seguro | R$ 400,00, o un 58% |

La diferencia queda por encima de R$ 320,00 de una semana en adelante, de R$ 432,70 en siete días a R$ 400,00 en el mes, siempre a favor del predio de afuera. La excepción es el valet de Aeropark, que **cuesta más que el oficial de la T3**. En quince días son R$ 692,90 contra R$ 610,00, R$ 82,90 más por el valet.

En las Terminales 1 y 2 la ventaja del predio de afuera es menor, porque allá el oficial tiene el sector Standard, que cuesta R$ 480,00 en la misma franja. En quince días, la plaza descubierta de Aeropark queda R$ 196,50 por debajo del Standard y R$ 326,50 por debajo del sector de la T3. Es la diferencia de sector, y no de distancia, la que cambia el resultado.

## ¿Se puede estacionar en el Standard y embarcar en la Terminal 3?

Se puede, y es la jugada que la tabla del oficial permite sin decirlo. La tarifa es **del sector en el que estacionás**, y no de la terminal desde la que embarcás. Quien deja el auto en el Standard paga la tabla del Standard, aunque el vuelo salga de la T3.

Lo que eso vale en reales, en la franja de 11 a 17 días: R$ 480,00 en el Standard contra R$ 610,00 en el Premium o el edificio cochera. Son R$ 130,00 de diferencia dentro del propio oficial, sin salir del complejo.

Lo que cobra a cambio es un traslado interno con equipaje, entre el predio de una terminal y el embarque en otra. Tres puntos para decidir:

- **Con equipaje despachado y tiempo de sobra**, los R$ 130,00 suelen justificar el trayecto interno.
- **Con un chico, sillita o vuelo ajustado**, el ahorro no paga el estrés de atravesar el complejo.
- **A la vuelta**, el recorrido es el mismo en sentido contrario, después de un vuelo internacional largo.

Quien hace esa cuenta y todavía lo encuentra caro tiene la tercera opción, el predio de afuera. Son R$ 283,50 en quince días en la plaza descubierta de Aeropark. O sea, R$ 196,50 por debajo del Standard y R$ 326,50 por debajo del sector de la T3.

## ¿El estacionamiento de la Terminal 3 es más caro que el de la Terminal 1?

Lo es, y la diferencia es del sector, no de la terminal en sí. El oficial cobra por el predio en el que estacionás, y la T3 no tiene predio Standard.

| Permanencia | Standard, Terminales 1 y 2 | Premium, edificio cochera y Flex, Terminales 2 y 3 | De más en la T3 |
| --- | --- | --- | --- |
| Hasta 1 hora | R$ 31,00 | R$ 38,00 | R$ 7,00 |
| Hasta 1 día | R$ 79,00 | R$ 107,00 | R$ 28,00 |
| De 6 a 10 días | R$ 460,00 | R$ 565,00 | R$ 105,00 |
| De 11 a 17 días | R$ 480,00 | R$ 610,00 | R$ 130,00 |
| De 18 a 30 días | R$ 505,00 | R$ 690,00 | R$ 185,00 |

En un viaje de un mes, el estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos cuesta R$ 185,00 más que el mismo mes en la Terminal 1. En los predios asociados la tarifa es la misma para las tres terminales, porque es del predio y no de la terminal.

El comparativo completo por franja, con los dos asociados lado a lado, está en el [post de precio del estacionamiento en Guarulhos](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/).

### ¿Cuánto cuesta quedarse más de treinta días en el estacionamiento de la Terminal 3?

La franja más larga del oficial funciona distinto. Por encima de 30 días cobra el paquete de 30 y suma **R$ 22,90 por día extra** en el Premium y el edificio cochera. En el Standard de las Terminales 1 y 2, ese día extra es de R$ 19,90.

En la práctica, 45 días en el oficial de la T3 dan R$ 690,00 del paquete más R$ 343,50 de los quince días extra. Así, el total queda en R$ 1.033,50. En los asociados, la plaza descubierta de Pare Seguro cuesta R$ 290,00 fijos de 15 a 30 días y vuelve a R$ 18,90 por día después, lo que da R$ 573,50 en 45 días.

## ¿A qué distancia queda el estacionamiento de la Terminal 3 del Aeropuerto de Guarulhos?

Además, la T3 queda en el extremo del complejo, y eso acorta la ventaja de quien está más cerca.

| Predio asociado | Distancia de la T3, en línea recta | Distancia de la T1 | Traslado declarado |
| --- | --- | --- | --- |
| Aeropark | 3,06 km | 1,88 km | 10 minutos, combi cada 30 |
| Pare Seguro | 4,88 km | 3,97 km | 10 minutos, combi cada 30 |

Las distancias se calculan en la base de datos de Movepark con PostGIS, en línea recta. Las tres terminales están registradas como puntos propios, así que la medida es por terminal. El recorrido de la combi es más largo, porque sigue las vías de acceso.

Fijate lo que pasa con Aeropark: queda 1,18 km más lejos de la T3 que de la T1, una diferencia del 63%. En Pare Seguro la distancia también crece, de 3,97 km en la T1 a 4,88 km en la T3.

La lectura práctica para quien embarca en la T3 es corta. La ventaja de distancia de Aeropark baja de 2,09 km en la T1 a 1,82 km en la T3. En precio, los dos empatan en plaza descubierta de 7 a 14 días, y Pare Seguro queda R$ 247,00 por debajo en el mes. La comparación de tiempo puerta a puerta está en el post sobre [estacionamiento cerca del Aeropuerto de Guarulhos](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/).

## ¿Cuánto tiempo sumar al trayecto cuando el embarque es en la Terminal 3?

El bloque de tiempo es el mismo de las otras terminales, con el kilómetro extra de combi.

En los dos asociados, la ficha declara traslado de 10 minutos y combi cada 30 minutos. Sumando espera, trayecto y caminata hasta el mostrador, dan de 15 a 50 minutos entre entrar al predio y estar en la terminal. Reservá unos 40 minutos, y poné ese bloque **antes** del plazo de check-in de la aerolínea.

En la T3 vale un cuidado extra. Un vuelo internacional suele pedir presentación con más anticipación. Confirmá al llegar dónde para la combi en tu terminal: atravesar entre terminales con equipaje cuesta más tiempo que el kilómetro entre los dos predios.

## ¿Cómo funciona el pago en el estacionamiento oficial de la Terminal 3?

La página del propio operador lista lo que acepta el estacionamiento oficial de la T3, y eso responde una duda común de quien ya está manejando. El 17 de septiembre de 2026, el oficial aceptaba:

- **Efectivo**, solamente en reales.
- **Tarjetas** de crédito y débito.
- **Telepeajes electrónicos**: Sem Parar, ConectCar, Veloe y Taggy.
- **Código QR**, escaneando el ticket con el celular.

El operador también informa que los vehículos están asegurados contra robo y hurto, conforme la ley municipal de Guarulhos nº 13.912/2010. Y que la reserva anticipada da acceso a una barrera propia, con voucher por código QR.

En los predios asociados, la forma de pago es la de la reserva por Movepark. Lo que declara cada unidad en su ficha está en [Aeropark](/estacionamentos/aeroporto-guarulhos/aeropark) y [Pare Seguro](/estacionamentos/aeroporto-guarulhos/pare-seguro).

## ¿Cuándo conviene estacionar dentro de la Terminal 3?

Conviene en dos casos, y ninguno de ellos es el precio.

En la práctica, el edificio cochera de la Terminal 3 compra tiempo, no ahorro.

**Permanencia de pocas horas.** Buscar a alguien que desembarca en la T3 cuesta R$ 38,00 la primera hora y R$ 67,00 en dos. Es caro por hora, pero resuelve sin combi en el camino. El tiempo ahorrado es real: de 15 a 50 minutos en cada sentido.

**Horario muy ajustado.** Si el vuelo es internacional y el margen es corto, la caminata cubierta del oficial hasta el mostrador vale más que la diferencia en reales.

Quién encaja en cada opción, en una frase:

- **Buscar o llevar a alguien:** el oficial de la T3, por la ausencia de combi en el camino.
- **Ida y vuelta de un día:** el oficial, a R$ 107,00, porque los asociados solo aceptan desde dos días. Si la vuelta pasa de 24 horas, Pare Seguro sale R$ 37,80 por dos días en plaza descubierta.
- **Semana de vacaciones:** un asociado, en plaza descubierta o cubierta, porque la diferencia con el oficial va de R$ 362,70 a R$ 432,70.
- **Un mes entero:** Pare Seguro en plaza descubierta, a R$ 290,00, o cubierta a R$ 350,00 si el auto va a estar al sol.
- **Quien no quiere estacionar:** el valet de Aeropark, a R$ 692,90 en quince días, R$ 82,90 por encima del oficial de la T3.

Fuera de los dos casos de arriba, la cuenta favorece al predio de afuera con holgura. En una semana, la diferencia es de R$ 432,70, más de tres veces el total que cobran los asociados en plaza descubierta. Quien quiere el menor total posible encuentra el camino en [cómo estacionar barato en el Aeropuerto de Guarulhos](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/).

## ¿Cuándo el oficial de la Terminal 3 no compensa de ninguna manera?

Hay tres situaciones en que la diferencia queda indefendible para quien busca estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos.

**Viaje de cinco días.** El oficial cobra R$ 535,00, casi lo mismo que los R$ 565,00 de diez días. El asociado cobra R$ 94,50 por esos mismos cinco días en la plaza descubierta de Pare Seguro.

**Estadía de un mes.** Son R$ 690,00 en el oficial de la T3 contra R$ 290,00 en la plaza descubierta de Pare Seguro, una diferencia de R$ 400,00. En la plaza cubierta, el predio hace diferencia: la de Pare Seguro sale R$ 350,00, y la de Aeropark, R$ 717,00, R$ 27,00 por encima del oficial.

**Quien quiere cobertura.** La plaza cubierta sale R$ 350,00 en quince días en Pare Seguro y R$ 373,50 en Aeropark. El edificio cochera del oficial, que es la opción cubierta de la T3, sale R$ 610,00 en la misma franja.

## ¿Vale reservar antes en el estacionamiento de la Terminal 3?

En los dos lados, sí, por motivos distintos.

En el oficial, la reserva anticipada da la barrera propia, y el operador trata la plaza como sujeta a disponibilidad. O sea, ahí reservar resuelve el acceso, y no el precio.

En los asociados, la reserva por la tabla en línea queda por debajo de la tabla de mostrador. En Aeropark la diferencia ronda el 17%: en quince días en plaza descubierta, eso significa pasar de R$ 340,20 a R$ 283,50. Es el mismo mecanismo en cualquier terminal, porque la tarifa es del predio.

## Una rutina de cinco pasos para la Terminal 3

Qué hacer antes de salir de casa, en orden:

1. Verificá desde qué terminal embarca tu vuelo, porque en el oficial eso cambia el sector disponible y el precio.
2. Sumá la permanencia real, con holgura a la vuelta, y mirá la franja correspondiente, no la diaria.
3. Simulá el mismo período en el [índice de precios de Guarulhos](/estacionamentos/aeroporto-guarulhos/precos) y compará el total, no el valor por día.
4. Si elegís el predio de afuera, verificá la permanencia mínima y reservá por la tabla en línea.
5. Anotá el tiempo de combi en la planificación, de 15 a 50 minutos, antes del plazo de presentación.

## ¿Cómo se obtuvieron estos precios?

El precio de los predios asociados salió del motor de reservas, con la tabla de Pare Seguro del **3 de noviembre de 2026** y la de Aeropark del **13 de noviembre de 2026** (el valet sigue en la del 19 de octubre). Es el mismo número que cierra la reserva. Aparece en la [página del Aeropuerto de Guarulhos](/estacionamentos/aeroporto-guarulhos) y en el índice de precios, con la fecha de la última actualización de cada tabla.

El precio del estacionamiento oficial **no pasa por el motor de Movepark**. Se leyó a mano en la tabla que el operador publica en el sitio del aeropuerto, como imagen, y se verificó el 17 de septiembre de 2026. Por eso todo valor del oficial acá lleva la fecha al lado. Puede cambiar sin aviso, y ningún sistema nos avisa cuando cambia. La división por sector, las formas de pago y la referencia a la ley municipal también salen de esa misma página del operador.

Las distancias se calculan en la base de datos con PostGIS, en línea recta entre las coordenadas del predio y de cada terminal. El tiempo de traslado y la frecuencia de la combi los declara cada unidad en su ficha. Aparecen como declaración de la unidad, y no como promesa de Movepark. Cuando un campo no está declarado, el texto lo dice.

Los números de movimiento del aeropuerto salen en el [portal de estadísticas de ANAC](https://www.anac.gov.br/assuntos/dados-e-estatisticas).

## Preguntas frecuentes

### ¿Cuánto cuesta, al final, el estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos?

El 17 de septiembre de 2026, el oficial de la T3 cobraba R$ 38,00 la primera hora y R$ 107,00 la diaria. En la franja de 11 a 17 días, R$ 610,00, y en la de 18 a 30, R$ 690,00. Son los sectores Premium, edificio cochera y Flex, porque la T3 no tiene Standard.

### ¿La Terminal 3 de Guarulhos tiene sector Standard?

No. Según la tabla del operador, el Standard atiende solamente las Terminales 1 y 2. Quien embarca en la Terminal 3 usa Premium, edificio cochera o Flex. Parten de un nivel más alto: R$ 28,00 más en la diaria y R$ 130,00 más en la franja de 11 a 17 días.

### ¿Qué estacionamiento queda más cerca de la Terminal 3 de Guarulhos?

El oficial, porque queda dentro del complejo. Entre los asociados, Aeropark, a 3,06 km de la T3 en línea recta. Declara traslado de 10 minutos y combi cada 30. Pare Seguro queda a 4,88 km y declara el mismo traslado.

### ¿Cuánto se ahorra estacionando fuera de la Terminal 3?

En una semana, R$ 432,70, o un 77%. Es el oficial a R$ 565,00, el 17 de septiembre de 2026, contra R$ 132,30 en la plaza descubierta de Pare Seguro y de Aeropark, en sus tablas del 3 y del 13 de noviembre de 2026. En quince días la diferencia es de R$ 326,50, y en treinta, de R$ 400,00.

### ¿El estacionamiento de la Terminal 3 acepta telepeaje?

Sí. La página del operador lista Sem Parar, ConectCar, Veloe y Taggy, además de efectivo, tarjetas de crédito y débito y pago por código QR en el ticket. La información es del propio operador, verificada el 17 de septiembre de 2026.

### ¿Vale la pena el valet del asociado para quien embarca en la T3?

En quince días, el valet de Aeropark sale R$ 692,90 y el oficial de la T3 R$ 610,00. O sea, el valet cuesta R$ 82,90 más, y solo compensa si el valet vale esa diferencia para vos. La plaza descubierta de Aeropark sale R$ 283,50 y sigue siendo el menor total.

### ¿El precio del estacionamiento cambia entre las terminales de Guarulhos?

En el oficial cambia, porque la tarifa es del sector, y la T3 solo tiene sectores más caros. En los predios asociados no cambia: la tabla es del predio, igual para las tres terminales. Lo que cambia ahí es la distancia, de 3,06 km a 4,88 km hasta la T3.$f22$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'es' and md5(coalesce(body_md, '')) = '629ed338e4d3946d7b1e9bcb9222a348';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.es', 'body_md'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.es · excerpt
  update public.blog_post_i18n set excerpt = $f23$La T3 no tiene sector Standard, el más barato del oficial. Adentro las tarifas parten de R$ 38,00 la primera hora y R$ 107,00 la diaria; afuera, un predio asociado cobra desde R$ 18,90 por día en su tabla del 3 de noviembre de 2026.$f23$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'es' and md5(coalesce(excerpt, '')) = '335fa1347ab0d6a9120320287729139d';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.es', 'excerpt'; end if;
  total := total + 1;

  -- estacionamento-terminal-3-aeroporto-guarulhos.es · meta_description
  update public.blog_post_i18n set meta_description = $f24$Estacionamiento en la Terminal 3 del Aeropuerto de Guarulhos: sectores y precio. Diaria desde R$ 18,90 en noviembre de 2026. Compará y reservá con Movepark.$f24$
   where blog_post_id = 'ff38b703-a819-4e8c-8ad3-3ce5e9d5406f' and locale = 'es' and md5(coalesce(meta_description, '')) = 'd92fd214ddc19025b8c8e510a6f054cd';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'aerovalet: % · % mudou desde a leitura de 27/11/2026', 'estacionamento-terminal-3-aeroporto-guarulhos.es', 'meta_description'; end if;
  total := total + 1;

  if total <> 24 then raise exception 'aerovalet: % de 24 campos gravados', total; end if;
end
$aerovalet$;
