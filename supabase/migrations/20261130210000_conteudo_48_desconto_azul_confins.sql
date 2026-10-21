-- Conteúdo 48 do Ataque CNF: o post do desconto Azul no estacionamento de Confins, em rascunho,
-- e a FAQ de unidade do BePark sobre o desconto.
--
-- O post nasce com `is_published = false`: publicar é decisão do usuário (skill blogpost-seo-geo,
-- passo 8). A condição citada é a que a BePark publica no site (lida em 07/10/2026) e confirmou à
-- Movepark em 09/10/2026 (ataque-cnf-bepark.md §6): de 10% a 40% por categoria do Azul Fidelidade,
-- sobre qualquer período. O preço é o do motor em 21/10/2026.
--
-- A FAQ descreve só a condição do balcão (bloco ADR-009 da atividade: o texto não promete preço na
-- reserva) e segue o padrão das FAQs de Virapark e Abbapark sobre a Azul.
--
-- Idempotente: upsert do post pelo slug, tags com `on conflict do nothing`, FAQ só se não existir.

insert into public.blog_post (
  slug, title, excerpt, body_md, cover_image_url, meta_title, meta_description,
  destination_id, author_name, author_id, category_id, is_published)
values (
  'desconto-azul-no-estacionamento-de-confins',
  'Desconto Azul no estacionamento de Confins: quanto cada categoria paga em 2026',
  'A BePark dá de 10% a 40% de desconto para cliente Azul Fidelidade em Confins, sobre qualquer período. Veja quanto cada categoria paga na diária, na semana e no mês, com preço conferido em outubro de 2026.',
  $corpo$O desconto Azul no estacionamento de Confins existe, e quem dá é a BePark: de 10% a 40% para cliente Azul Fidelidade, conforme a categoria, sobre qualquer período. A condição está no site da BePark e foi confirmada por ela à Movepark em 9 de outubro de 2026. Na semana, o Diamante paga R$ 140,00 e o Diamante Unique, R$ 120,00. Este texto mostra a conta de cada categoria, como pedir o desconto e quando ele vale mais que um pátio colado no terminal.

## A Azul tem estacionamento próprio em Confins?

Não tem. A Azul opera voos, balcão e embarque no Aeroporto Internacional de Belo Horizonte, em Confins, mas não opera estacionamento. Os pátios oficiais do aeroporto são da concessionária BH Airport, e os particulares da região são empresas independentes, cada uma com a sua tabela.

A confusão é compreensível. Confins é uma das bases da Azul, e muita gente que chega de carro vai embarcar num voo dela. Na cabeça do passageiro, companhia e estacionamento viram a mesma coisa. Na prática, o desconto Azul no estacionamento de Confins é uma condição que a BePark oferece aos clientes do programa de fidelidade da companhia.

Por isso vale buscar pelo nome do estacionamento. Entre os 12 pátios que a Movepark mapeou em Confins em outubro de 2026, a BePark é o único que publica desconto Azul no próprio site.

### Onde fica a BePark, em relação ao terminal?

A BePark fica em Lagoa Santa, na Avenida Paulo Ferreira da Costa, 445, a 7,63 km do terminal do Aeroporto de Confins, em linha reta, pela medição da Movepark com PostGIS. A ficha da unidade declara traslado gratuito de 10 minutos até o terminal, com van a cada 20 minutos. Oito dos outros 11 pátios mapeados ficam entre 2,9 km e 3,7 km do terminal, então a conta do desconto precisa considerar a distância.

![cliente mostra a categoria no app da companhia aérea no balcão do estacionamento em Confins para pedir o desconto Azul](/images/blog/desconto-azul-no-estacionamento-de-confins/desconto-azul-estacionamento-confins-balcao-app.webp)

## Quanto vale o desconto Azul no estacionamento de Confins em cada categoria?

O desconto Azul Fidelidade em Confins cresce com a categoria no programa. A tabela aplica cada percentual sobre o preço da BePark no motor de reservas da Movepark, conferido em 21 de outubro de 2026: R$ 45,00 a diária, R$ 200,00 de 5 a 7 diárias e R$ 400,00 de 12 a 30 diárias.

| Categoria Azul Fidelidade | Desconto | 1 diária | 5 a 7 diárias | 12 a 30 diárias |
| --- | --- | --- | --- | --- |
| Sem categoria | 0% | R$ 45,00 | R$ 200,00 | R$ 400,00 |
| Azul Fidelidade | 10% | R$ 40,50 | R$ 180,00 | R$ 360,00 |
| Topázio | 15% | R$ 38,25 | R$ 170,00 | R$ 340,00 |
| Safira | 25% | R$ 33,75 | R$ 150,00 | R$ 300,00 |
| Diamante | 30% | R$ 31,50 | R$ 140,00 | R$ 280,00 |
| Diamante Unique | 40% | R$ 27,00 | R$ 120,00 | R$ 240,00 |

Os percentuais são os que a BePark publica no site, lidos em 7 de outubro de 2026, e batem com a tabela de estacionamento do portal da Azul, conferida pela Movepark em 9 de outubro de 2026. A conta é da Movepark, sobre a tabela vigente. Quem fecha o valor é o caixa da BePark, e a tabela pode mudar: o preço vivo fica na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark).

### O desconto Azul vale também nos pacotes de semana e de mês?

Vale. A BePark respondeu por escrito à Movepark, em 9 de outubro de 2026, que o desconto Azul vale para qualquer período, com os pacotes incluídos. A diferença importa, porque o portal da Azul descreve a condição como "desconto na diária", e quem aplica o desconto é o estacionamento. Sem essa confirmação, a semana de R$ 200,00 ficaria fora da conta, e a semana é justamente onde o desconto pesa mais.

## Como pedir o desconto Azul no estacionamento de Confins?

No balcão, o desconto Azul no estacionamento de Confins sai com dois itens à mão. A BePark pede a categoria aberta no app da Azul, com o login ativo. O portal da Azul pede o cartão de embarque válido e o Cartão Azul Fidelidade digital, que também fica no app. Levar os dois cobre o que cada fonte exige.

O passo a passo fica assim:

1. Antes de sair de casa, abra o app da Azul e confira se o login está ativo e a categoria aparece.
2. Deixe o cartão de embarque do voo salvo no celular, porque o sinal na garagem pode falhar.
3. Na chegada à BePark, avise que é cliente Azul antes de pagar.
4. Mostre a categoria no app e o cartão de embarque.
5. Confira o valor no comprovante antes de seguir para a van.

O desconto é pessoal e vale para um veículo, segundo o site da BePark em 7 de outubro de 2026. Duas pessoas da mesma família com categoria Azul não somam desconto no mesmo carro, e um cliente não estende o benefício para o carro de outra pessoa.

### O que muda entre pagar na chegada e pagar na saída?

A BePark aceita o pagamento no balcão na chegada ou na retirada do carro, com cartão de crédito, débito, PIX ou dinheiro, segundo o site em 7 de outubro de 2026. Para o desconto Azul, o momento do pagamento é o que conta: é na hora de pagar que você mostra a categoria e o cartão de embarque. Quem paga na volta precisa do app logado na volta também, então vale não deixar o login expirar durante a viagem.

![cartão de embarque no celular ao lado da chave do carro, o que levar para pedir o desconto Azul no estacionamento de Confins](/images/blog/desconto-azul-no-estacionamento-de-confins/desconto-azul-confins-cartao-de-embarque.webp)

## O desconto Azul vale na reserva online?

Vale. A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale também na reserva feita pela Movepark, em qualquer período. No sistema de reserva da BePark, o desconto aparece como um cupom por categoria do Azul Fidelidade, que você escolhe na etapa de cupons.

Três cuidados para a reserva online:

- **A categoria é declarada por você.** O sistema de reserva não consulta o Azul Fidelidade. Leve o app logado e o cartão de embarque mesmo assim, porque o balcão é quem recebe o carro.
- **O desconto é um só.** A condição publicada pela BePark é um percentual sobre a estadia. Se você usou o cupom na reserva, não conte com outro abatimento no balcão.
- **O valor final aparece antes de pagar.** O total com o cupom sai na tela do checkout, e é esse o número que vale. A tabela deste texto serve para comparar.

A vantagem de reservar antes é saber o total na hora, em vez de descobrir no balcão. O preço por duração e o botão de reserva estão na [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark).

## A condição da BePark é a mesma do portal da Azul?

Os percentuais são os mesmos. O portal da Azul, na página de estacionamento do programa, publica 10% para Azul Fidelidade, 15% para Topázio, 25% para Safira, 30% para Diamante e 40% para Diamante Unique, conferidos pela Movepark em 9 de outubro de 2026. A lista de categorias e o que cada uma exige para subir de nível estão na [tabela de benefícios do Azul Fidelidade](https://www.voeazul.com.br/br/pt/programa-fidelidade/conheca-os-beneficios), no site da companhia.

Duas diferenças aparecem entre as fontes. A primeira é o alcance: a Azul escreve "desconto na diária", e a BePark diz que vale para qualquer período, pacote incluído. A segunda é a comprovação: a Azul pede cartão de embarque e Cartão Azul Fidelidade digital, e a BePark fala da categoria no celular. Quando perguntada se é a mesma condição do portal, a BePark respondeu que não sabe dizer.

Os nomes também variam um pouco. O site da BePark chama a categoria de entrada de "Azul" e a mais alta de "Unique"; o portal usa "Azul Fidelidade" e "Diamante Unique". Este texto segue o nome do portal, que é o dono do programa.

## Quanto custa a semana com desconto Azul contra os vizinhos?

A semana é a estadia em que o estacionamento em Confins para cliente Azul muda de posição no ranking. Sem desconto, a BePark cobra R$ 200,00 de 5 a 7 diárias, acima dos pátios da região do aeroporto. Com Diamante ou Diamante Unique, a semana cai para R$ 140,00 ou R$ 120,00, e passa a disputar com a vaga descoberta mais barata de Confins.

| Estacionamento | Semana (7 diárias) | Tipo de vaga | Distância do terminal | Fonte e data |
| --- | --- | --- | --- | --- |
| BePark, Diamante Unique | R$ 120,00 | não informado | 7,63 km | Motor Movepark, 21/10/2026, com 40% |
| Bandeira Park | R$ 125,93 | descoberta, sem cupom | 9,79 km | Sistema de reserva do Bandeira Park, 07/10/2026 |
| Auto Park Brasil | R$ 126,00 | descoberta | 3,13 km | Site do Auto Park Brasil, 07/10/2026 |
| BePark, Diamante | R$ 140,00 | não informado | 7,63 km | Motor Movepark, 21/10/2026, com 30% |
| Central Park | R$ 140,00 | descoberta | 2,96 km | Site do Central Park Confins, 07/10/2026 |
| AeroPark Confins | R$ 140,00 | descoberta | 3,08 km | Site do AeroPark Confins, 07/10/2026 |
| Park Confins | R$ 149,00 | coberta | 2,87 km | Site do Park Confins, 07/10/2026 |
| BePark, Safira | R$ 150,00 | não informado | 7,63 km | Motor Movepark, 21/10/2026, com 25% |
| Auto Park Brasil | R$ 154,00 | coberta | 3,13 km | Site do Auto Park Brasil, 07/10/2026 |
| Multipark | R$ 169,30 | coberta | 9,13 km | Site do Multipark, 07/10/2026 |
| BePark, sem categoria | R$ 200,00 | não informado | 7,63 km | Motor Movepark, 21/10/2026 |

As distâncias são em linha reta, medidas pela Movepark com PostGIS. Os preços dos outros pátios foram lidos no site de cada operador e não têm reserva pela Movepark, então podem ter mudado depois da data. A comparação completa, com os 12 pátios, está no [preço do estacionamento no aeroporto de Confins](/blog/preco-do-estacionamento-no-aeroporto-de-confins/).

### O que a tabela da semana mostra?

Na leitura de outubro de 2026, a semana da BePark com Diamante Unique é a menor da tabela, R$ 5,93 abaixo do Bandeira Park e R$ 6,00 abaixo da descoberta do Auto Park Brasil. Com Diamante, a semana empata com a descoberta do Central Park e do AeroPark Confins e fica abaixo de toda vaga coberta da lista. Com Safira, Topázio ou Azul Fidelidade, um pátio mais perto ainda sai mais barato.

### Por que a tabela não informa o tipo de vaga da BePark?

O site da BePark declara mais de 350 vagas, cobertas e descobertas, em pátio fechado, em 7 de outubro de 2026. O desconto Azul vale sobre a estadia inteira, qualquer que seja a vaga, então a comparação acima mostra o preço sem prometer cobertura. Se a vaga coberta é decisiva para você, confirme com a BePark antes de reservar.

![van do traslado do estacionamento de Confins com a porta aberta para a passageira embarcar, trajeto incluído no preço com desconto Azul](/images/blog/desconto-azul-no-estacionamento-de-confins/desconto-azul-estacionamento-confins-traslado-van.webp)

## Em que estadia o desconto Azul no estacionamento de Confins compensa?

O desconto Azul no estacionamento de Confins compensa mais quanto maior a categoria e mais longa a estadia. Na diária avulsa, a BePark parte de R$ 45,00, enquanto a descoberta do Auto Park Brasil custa R$ 20,00 e a do Central Park, R$ 22,00, segundo os sites em 7 de outubro de 2026. Nem o Diamante Unique, a R$ 27,00, chega lá.

| Estadia | BePark sem categoria | BePark Diamante | BePark Diamante Unique | Menor preço da região |
| --- | --- | --- | --- | --- |
| 1 diária | R$ 45,00 | R$ 31,50 | R$ 27,00 | R$ 20,00, Auto Park Brasil, descoberta |
| 7 diárias | R$ 200,00 | R$ 140,00 | R$ 120,00 | R$ 125,93, Bandeira Park, descoberta |
| 15 diárias | R$ 400,00 | R$ 280,00 | R$ 240,00 | R$ 233,85, Bandeira Park, descoberta |
| 30 diárias | R$ 400,00 | R$ 280,00 | R$ 240,00 | R$ 300,00, Auto Park Brasil, descoberta |

Preços da BePark no motor de reservas da Movepark em 21 de outubro de 2026, com o desconto calculado pela Movepark. Menor preço da região lido no site de cada operador em 7 de outubro de 2026.

### Uma diária, uma semana ou um mês?

Três leituras saem da tabela de estadias:

- **Uma ou duas diárias:** o pátio perto do terminal ganha em qualquer categoria. A diferença chega a R$ 25,00 sem desconto e cai para R$ 7,00 com Diamante Unique.
- **Uma semana:** o Diamante Unique lidera, e o Diamante empata com a descoberta dos pátios mais perto.
- **Um mês:** a BePark trava em R$ 400,00 de 12 a 30 diárias, e o desconto age sobre esse teto. Com Safira, os 30 dias saem por R$ 300,00, o mesmo da descoberta do Auto Park Brasil. Com Diamante, R$ 280,00, e com Diamante Unique, R$ 240,00, ou R$ 8,00 por dia.

Na quinzena, o Bandeira Park segue R$ 6,15 abaixo do Diamante Unique, na leitura de 7 de outubro de 2026. A BePark cobra R$ 400,00 já a partir de 12 diárias, então a quinzena paga o mesmo teto do mês.

## A distância muda a conta do desconto Azul?

Muda o tempo até o embarque. A BePark fica a 7,63 km do terminal, e oito dos pátios da região ficam entre 2,9 km e 3,7 km. A van da BePark leva cerca de 10 minutos até o terminal e sai a cada 20 minutos, segundo a ficha da unidade. Na pior hipótese, a van acabou de sair e você espera 20 minutos antes dos 10 de trajeto.

O traslado gratuito está incluído em todas as tarifas da BePark, e o desconto Azul incide sobre a estadia, sem custo extra de van. A van da BePark é acompanhada ao vivo no celular, pelo serviço da Go2Park, e é o único pátio de Confins com esse recurso declarado, na leitura da Movepark de outubro de 2026. Para quem volta de madrugada, ver onde a van está antes de sair do desembarque reduz a espera no ponto.

Para o voo, a BePark recomenda chegar com no mínimo 45 minutos de antecedência em relação ao horário de embarque, segundo o site em 7 de outubro de 2026. Quem vai pedir o desconto no balcão ganha tempo chegando com o app da Azul já aberto e o cartão de embarque salvo.

## O que o desconto Azul no estacionamento de Confins não cobre?

O desconto Azul no estacionamento de Confins reduz o preço da estadia, e só isso. Ele não garante vaga coberta, não reserva vaga sozinho e não muda as regras de cancelamento, troca de data ou atraso de voo da BePark. Cada uma dessas condições depende da forma como você reserva e do que a unidade declara na ficha.

Também não existe garantia de que o convênio Azul em Confins dure. A BePark disse à Movepark, em 9 de outubro de 2026, que o desconto não tem data de validade nem limite de vagas. Mesmo assim, é uma condição comercial do estacionamento, e pode mudar sem aviso. Por isso cada número deste texto vem com a data em que foi lido.

O desconto Azul também não vale nos outros pátios de Confins. Nenhum dos outros 11 pátios mapeados pela Movepark publica desconto Azul no próprio site, na leitura de outubro de 2026. Se aparecer uma oferta parecida em outro lugar, confira a data, a fonte e sobre qual tarifa o percentual incide.

## Erros comuns de quem procura desconto Azul no estacionamento de Confins

Os enganos que mais custam dinheiro nessa busca são estes:

- **Achar que o desconto é da companhia aérea.** Quem oferece e aplica o desconto é a BePark.
- **Achar que é benefício automático.** Sem a categoria no app e o cartão de embarque, ou sem o cupom na reserva online, você paga o preço cheio.
- **Multiplicar a diária pelos dias.** A BePark tem pacote de 5 a 7 diárias e teto de 12 a 30 diárias, e a multiplicação esconde onde o desconto pesa.
- **Esquecer a distância.** A BePark fica a 7,63 km do terminal, e o desconto não encurta a van.
- **Contar com a categoria antiga.** O desconto é o da categoria que o app mostra no dia.

### O detalhe que quase ninguém confere

A categoria no Azul Fidelidade muda conforme o que você acumula no programa, pelas regras da Azul. Quem conta com o desconto de Diamante para fechar a conta da viagem precisa conferir a categoria na semana do voo. A diferença entre Diamante e Safira, numa semana na BePark, é de R$ 10,00. Num mês, é de R$ 20,00.

## Checklist de quem voa Azul e deixa o carro em Confins

Antes de sair de casa:

- Confira a categoria no app da Azul e o login ativo.
- Salve o cartão de embarque no celular.
- Decida a duração: até 4 diárias, compare com os pátios perto do terminal; de 5 diárias em diante, a BePark com desconto entra na disputa.
- Se for reservar online, escolha o cupom da sua categoria e anote o total do checkout.
- Chegue à BePark com no mínimo 45 minutos de antecedência do embarque, como ela recomenda, e conte a espera da van.

No balcão e na volta:

- Avise que é cliente Azul antes de pagar.
- Mostre categoria e cartão de embarque.
- Confira o valor no comprovante.
- Na volta, acompanhe a van ao vivo no celular antes de sair do desembarque.

### Desconto Azul no estacionamento de Confins, em três linhas

A BePark é o único pátio de Confins que publica desconto Azul, de 10% a 40% conforme a categoria, sobre qualquer período. Na semana, o Diamante Unique paga R$ 120,00, o menor preço da região em outubro de 2026. Para uma ou duas diárias, um pátio perto do terminal segue mais barato.

## Perguntas frequentes sobre o desconto Azul no estacionamento de Confins

### Qual é o desconto Azul Diamante no estacionamento de Confins?

Na BePark, o cliente Azul Fidelidade Diamante tem 30% de desconto, segundo o site da BePark em 7 de outubro de 2026. Sobre a tabela do motor de reservas da Movepark em 21 de outubro de 2026, a diária cai de R$ 45,00 para R$ 31,50, a semana de R$ 200,00 para R$ 140,00 e o mês de R$ 400,00 para R$ 280,00.

### O desconto Azul vale na semana e no mês da BePark?

Vale. A BePark confirmou à Movepark, em 9 de outubro de 2026, que o desconto Azul vale para qualquer período, com os pacotes incluídos. Por isso o percentual incide sobre os R$ 200,00 de 5 a 7 diárias e sobre os R$ 400,00 de 12 a 30 diárias, além da diária avulsa.

### Preciso do cartão de embarque para ter o desconto Azul em Confins?

O portal da Azul condiciona o desconto ao cartão de embarque válido e ao Cartão Azul Fidelidade digital, e a BePark pede a categoria aberta no app da Azul. Levar os dois resolve as duas exigências. Salve o cartão de embarque no celular antes de chegar, porque o sinal pode falhar na garagem.

### Posso usar o desconto Azul em dois carros?

Não. O desconto Azul da BePark é pessoal e vale para um veículo, segundo o site da BePark em 7 de outubro de 2026. Se duas pessoas da família viajam em carros separados, cada uma precisa ter a própria categoria no Azul Fidelidade e apresentar o próprio app e cartão de embarque no balcão.

### O desconto Azul vale na reserva online da BePark?

Vale. A BePark confirmou em 9 de outubro de 2026 que o desconto vale na reserva feita pela Movepark, em qualquer período. No sistema de reserva da BePark, ele aparece como cupom por categoria. A categoria é declarada por você, então leve o app da Azul logado e o cartão de embarque para o balcão.

### Só a BePark dá desconto Azul no estacionamento de Confins?

Na leitura da Movepark de outubro de 2026, sim. Entre os 12 pátios mapeados em Confins, a BePark é o único que publica desconto para cliente Azul Fidelidade no próprio site. Os outros 11 publicam tarifa cheia, alguns com promoção ou cupom próprio, sem vínculo com o programa da Azul.

### A Movepark confere a minha categoria Azul?

Não. Na reserva online, a categoria do Azul Fidelidade é uma declaração sua, e o sistema de reserva não consulta o programa da Azul. O estacionamento é quem recebe o carro e pode pedir a comprovação, por isso vale levar a categoria aberta no app e o cartão de embarque do voo.

## Veja o total da sua viagem na BePark

O desconto Azul no estacionamento de Confins rende mais para quem tem categoria alta e fica uma semana ou mais. Para conferir o total das suas datas antes de decidir, use a [página da BePark em Confins](/estacionamentos/aeroporto-confins/bepark), que mostra o preço do motor de reservas, a distância e a van. Para ver todos os pátios lado a lado, a lista completa fica em [estacionamentos no Aeroporto de Confins](/estacionamentos/aeroporto-confins), e o perfil completo da unidade está no [guia da BePark Confins](/blog/bepark-confins/).
$corpo$,
  '/images/blog/desconto-azul-no-estacionamento-de-confins/desconto-azul-no-estacionamento-de-confins.webp',
  'Desconto Azul no estacionamento de Confins em 2026',
  'Desconto Azul no estacionamento de Confins: de 10% a 40% na BePark. A partir de R$ 45,00 a diária em outubro de 2026. Compare e reserve pela Movepark.',
  (select id from public.destination where slug = 'aeroporto-de-confins'),
  'peu',
  '1700c4e9-8fa8-48ef-8f33-7bf1fa861ca3',
  (select id from public.blog_category where slug = 'guias'),
  false)
on conflict (slug) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  body_md = excluded.body_md,
  cover_image_url = excluded.cover_image_url,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  destination_id = excluded.destination_id,
  category_id = excluded.category_id;

insert into public.blog_post_tag (post_id, tag_id)
select p.id, t.id
  from public.blog_post p
  join public.blog_tag t on t.slug in ('economia', 'traslado', 'reserva-online')
 where p.slug = 'desconto-azul-no-estacionamento-de-confins'
on conflict do nothing;

insert into public.faq (scope, location_id, category_id, question, answer, sort_order, is_published)
select 'location',
       l.id,
       (select id from public.faq_category where slug = 'reservas'),
       'O BePark tem desconto para cliente Azul?',
       'Tem. O cliente Azul Fidelidade tem de 10% a 40% de desconto, conforme a categoria: Azul Fidelidade 10%, Topázio 15%, Safira 25%, Diamante 30% e Diamante Unique 40%. Vale para qualquer período, inclusive os pacotes de semana e de mês. Na hora de pagar no balcão, mostre a categoria no app da Azul, com o login ativo, e o cartão de embarque. O desconto é pessoal e vale para um veículo. Condição publicada e confirmada pelo BePark em outubro de 2026.',
       40,
       true
  from public.location l
 where l.public_slug = 'bepark'
   and l.deleted_at is null
   and not exists (
     select 1 from public.faq f
      where f.location_id = l.id
        and f.question = 'O BePark tem desconto para cliente Azul?'
        and f.deleted_at is null);
