# Ataque CNF: Movepark como fonte e BePark como resposta no Google e na IA

> **Status:** aberto em 30/09/2026, com as atividades de Conteúdo 39 a 59 no ClickUp, todas com o Diego.
> **Atividade-mãe:** [Ataque CNF](https://app.clickup.com/t/86akr8jp6), irmã do Ataque GRU.
>
> **Depende de:**
> - [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md): o plano, as fases e o placar de citação em IA.
> - [canonicalizacao-vcp-cnf.md](./canonicalizacao-vcp-cnf.md): as donas de cada intenção em Confins.
> - [lote-mapeado-vitrine.md](./lote-mapeado-vitrine.md): regra do ADR-010.
> - [checkout-externo-por-local.md](./checkout-externo-por-local.md): cadastro da BePark.
> - O plano da venda pelo Hub, em `docs/superpowers/plans/2026-09-23-venda-pelo-hub-e-beneficios.md`.
> - [go2park-transfer-ao-vivo.md](./go2park-transfer-ao-vivo.md), [selo-parceiro.md](./selo-parceiro.md) e [avaliacoes-google.md](./avaliacoes-google.md).
>
> **Dados:**
> - Search Console de 31/08 a 14/09/2026 ([dados/gsc-baseline-2026-09-14](./dados/gsc-baseline-2026-09-14/)).
> - Baseline de 16 meses ([dados/gsc-baseline-2026-08-29](./dados/gsc-baseline-2026-08-29/)).
> - Banco vivo, consultado em 28 e 29/09.
> - Checagem da busca e dos sites concorrentes em 28/09/2026.

## 1. O gatilho

Em 28/09/2026, o Modo IA do Google respondeu "estacionamento aeroporto confins preço" citando estas fontes:

- **Bandeira Park:** o enquadramento de oficial contra particular e a faixa de preço dos particulares.
- **BH Airport:** a tabela dos pátios oficiais.
- **Zul+ e o site do Multipark.**
- **Três cards do Google Maps:** Multipark (4,8 com 1,9 mil avaliações), Space Park (4,4 com 537) e Premium Park (4,9 com 776).
- **Um parágrafo sobre o Central Park.**

A Movepark não apareceu, e a BePark também não. A resposta terminou perguntando se a pessoa prefere deixar o carro dentro do aeroporto ou pagar menos com traslado.

## 2. Diagnóstico

Não falta conteúdo. Confins tem:

- 8 posts, 5 deles escritos ou reescritos em setembro, de 3.300 a 4.500 palavras e com tabela datada;
- 21 FAQs com página própria;
- a ficha da BePark e as fichas dos 9 lotes mapeados.

Faltam posição, coerência e um motivo real para indicar a BePark.

### 2.1 Posição

Search Console, de 31/08 a 14/09/2026:

| Consulta | Impressões | Posição |
| --- | ---: | ---: |
| estacionamento aeroporto confins | 245 | 10,4 |
| valor do estacionamento no aeroporto de confins | 31 | 10,3 |
| diaria estacionamento aeroporto de confins | 35 | 11,1 |
| qual o valor do estacionamento no aeroporto de confins | 20 | 11,4 |
| quanto custa o estacionamento do aeroporto de confins | 24 | 11,5 |
| qual o melhor estacionamento aeroporto confins | 19 | 22,5 |

As páginas que recebem essas consultas, na mesma janela:

| Página | Impressões | Posição | Cliques |
| --- | ---: | ---: | ---: |
| `/estacionamentos/aeroporto-confins` | 2.277 | 9,5 | 13 |
| post de proximidade (`guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins`) | 760 | 11,6 | 5 |
| post "TOP 3" (`top-3-estacionamentos-do-aeroporto-de-confins`) | 524 | 13,1 | 0 |
| ficha da BePark | 291 | 7,6 | 3 |
| post de preço (`preco-do-estacionamento-no-aeroporto-de-confins`) | 266 | 10,4 | 4 |
| `/faq/quanto-custa-estacionar-no-aeroporto-de-confins` | 198 | 25,1 | 0 |

**Na busca de 28/09**, a Movepark entra no top 10 em 7 de 12 buscas, sempre entre a 5ª e a 10ª posição. Quase sempre é a página errada:

- para "preço" aparece o post de proximidade;
- para "com traslado" aparece a versão em inglês;
- para "30 dias" aparece uma FAQ.

O BH Airport está no top 10 das 12 buscas e é o primeiro em 9. A checagem foi feita por ferramenta, não pelo Google logado, então vale como tendência.

**A marca da BePark.** Mais de 21 mil impressões em 16 meses, somando as variações:

- bepark: 9.122
- be park confins: 4.197
- be park: 1.915
- bpark: 1.405
- bepark confins: 969
- b park confins: 896
- estacionamento bepark: 865

Nessas buscas a Movepark fica entre a 6ª e a 9ª posição. Em 28/09, o Bandeira Park aparecia duas vezes na busca "be park confins".

### 2.2 Por que o Bandeira foi citado antes de abrir

**A unidade.** Abre em 01/10/2026, na Rodovia MG-010, km 26,5, em Vespasiano, com 1.500 vagas. Pela coordenada que ele publica, fica a 9,47 km do ponto do aeroporto, medido no PostGIS. É mais longe que a BePark, que fica a 7,63 km.

**O post citado** é `bandeirapark.com.br/blog/quanto-custa-estacionar-aeroporto-confins`, de 06/09/2026, com cerca de 950 palavras:

- o título e o H1 são a pergunta literal, com o ano;
- a primeira frase dá a faixa do mercado inteiro, de R$ 7,98 a mais de R$ 60,00 por dia;
- logo abaixo vem uma caixa de "fatos verificados", com a data de cada fonte;
- a tabela compara 7 operadores por 1, 7 e 30 dias.

O Modo IA reproduziu quase literalmente o primeiro parágrafo e a caixa.

**O mesmo número se repete em todo lugar:**

- na página da unidade, no texto e no `Offer` do JSON-LD;
- no comparativo "mais barato";
- no llms.txt, que tem uma seção dizendo às IAs quando citar a marca;
- em 10 FAQs e em três idiomas;
- no Instagram;
- na imprensa: Itatiaia (10/09, quatro dias depois do post), Portal Impactto e Por Dentro de Tudo.

A leitura mais provável é que a IA confia no número que aparece igual em várias fontes.

**Os pontos fracos dele:**

- ainda não opera, não tem avaliação e o telefone de Confins é de São Paulo;
- os dois domínios divergem no preço:
  - o institucional anuncia R$ 18,49 de 1 a 6 dias;
  - o sistema de reserva cobra R$ 24,99 de 1 a 6 dias;
  - o R$ 7,98 depende do cupom BP26;
- a van sai "a qualquer hora" num site e a cada 30 minutos no outro;
- o dado de concorrente é de julho, e erra o Central Park, que publica R$ 320,00 congelado do 16º ao 30º dia.

### 2.3 As contradições da Movepark e o que falta no mapa

Fonte que se contradiz é fonte que a IA descarta. Em 28 e 29/09:

1. **`/estacionamentos/aeroporto-confins/mais-barato`** afirma, no texto e no FAQPage, que "a diária avulsa mais barata perto do Aeroporto de Confins custa R$ 45,00, no BePark", com "1 estacionamento comparado". Os nossos posts e FAQs dizem R$ 20,00, que é o do AeroPark Confins e do Auto Park Brasil. A causa é de produto: a página só enxerga preço de parceiro. Atividade: Conteúdo 39.

   **Resolvido em 06/10/2026 (Conteúdo 39), pela saída "mostrar o mercado":** a resposta agora diz "a diária avulsa mais barata perto do Aeroporto de Confins é R$ 20,00, no AeroPark Confins e no Auto Park Brasil (preço pesquisado em 08/09/2026, sem reserva online pela Movepark). Com reserva pela Movepark, a menor diária é R$ 45,00, no BePark", igual no texto visível, no FAQPage e no gêmeo Markdown. Os lotes com preço pesquisado aparecem em tabela própria, com a data. A regra vale para toda praça e mudou também Congonhas, Guarulhos, Viracopos e Tietê. O Bandeira Park de Confins está no banco com R$ 24,99 (pesquisa de 02/10); o R$ 18,49 citado na atividade é o de Viracopos. Detalhe em [`indice-precos.md`](indice-precos.md).
2. **A FAQ `quanto-custa-estacionar-no-aeroporto-de-confins`** termina o `body_md` com "A Movepark ainda não tem parceiro credenciado no Aeroporto de Confins". A frase aparece na página da praça, ao lado do card da BePark. O `answer`, que vai para o FAQPage, não tem a frase, então o texto visível e o dado estruturado divergem (ADR-002). Atividade: Conteúdo 40.
3. **O "a partir de" de Confins tem quatro valores**, conforme a página. Atividade: Conteúdo 40.
   - R$ 13,33, que é a diária de quem fica 30 dias;
   - R$ 45,00;
   - R$ 20,00;
   - R$ 20,00 a R$ 105,00.

   **Resolvido em 02/10/2026 (Conteúdo 40), itens 2 e 3:**

   - A FAQ perdeu a frase e ganhou a linha do BePark na tabela e na `answer` (pt, en, es). As outras 17 FAQs com a frase são de praças sem parceiro, onde ela é verdade.
   - **"A partir de" sem rótulo de duração é a diária da estadia mais curta que a unidade vende**: a diária avulsa, ou a estadia mínima com a duração escrita ao lado. Em Confins é R$ 45,00 no BePark. A menor diária da tabela (R$ 13,33, em 30 dias) só aparece com a duração ao lado, como nos cards da busca e na tabela de preços.
   - No código: o topo da praça lê `diariaAvulsa()` (`src/routes/destino.logic.ts`), o mesmo resumo da meta. A ficha (meta, resumo e card de reserva) lê `aPartirDe()` (`src/features/listing/reservation.logic.ts`). O `AggregateOffer` segue com a faixa inteira, porque faixa é outro fato. Vale para todas as praças.
   - A faixa do mercado de Confins é **R$ 20,00 a R$ 105,00** a diária (setembro de 2026). As metas de três posts que diziam "Diária a partir de R$ 45,00" sem dizer de quem passaram a dar a faixa, igual ao post de preço.

4. **O post "TOP 3"** (fev/2025) diz que o Multipark sai por R$ 14,90 e o Park Confins por R$ 15,90. É a URL que aparece em "mais barato" com esse trecho velho. Atividade: Conteúdo 46.
5. **O llms.txt diz que a van da BePark sai "a cada 10 min".** Esse 10 é o tempo de trajeto (`shuttle_to_terminal_minutes`), publicado como frequência em `scripts/generate-geo-artifacts.mjs`. Enquanto isso:
   - o site da BePark diz saída a cada 20 minutos;
   - o Instagram e a Azul dizem "8 minutos do aeroporto";
   - a ficha não tem frequência.

   Atividades: Conteúdo 41 e 51.

   **Resolvido no gerador em 02/10/2026 (Conteúdo 41):** o `destination_price_index` passou a publicar `shuttle_frequency_minutes` ao lado do trajeto (migration `20261128150000`), e a frase dos artefatos (llms.txt, llms-full.txt e gêmeos `.md`) sai de `scripts/traslado.mjs`: "traslado de 10 min até o terminal" na BePark, e "van a cada N min" só quando a ficha declara a frequência. O `bloco-de-fato.mjs` já separava os dois números e não mudou. Cadastrar a frequência da BePark na ficha é o Conteúdo 51.
6. **O mapa de Confins não tem o Bandeira Park nem o Estapar.** O Estapar é o antigo Minas Park, reservável pelo Zul+, que declara menos de 1 km do terminal. Os dois foram citados pelo Modo IA. Sem o Estapar, o ranking de distância aponta o Park Confins (2,87 km) como o mais próximo. Atividade: Conteúdo 42.

   **Resolvido em 02/10/2026 (Conteúdo 42):** os dois entraram como lote mapeado publicado (migration `20261128160000`), com `google_place_id`, coordenada e endereço da Places API e preço datado:

   | Pátio | Distância medida (PostGIS) | Preço registrado | Fonte |
   | --- | ---: | --- | --- |
   | Estapar Aeroporto (antigo Minas Park) | 5,0 km | a partir de R$ 26,90 a diária | blog do Zul+; a tabela por período só aparece no app |
   | Bandeira Park | 9,8 km | R$ 24,99 a diária, R$ 125,93 em 7, R$ 233,85 em 15, R$ 323,70 em 30 (descoberta, sem cupom) | sistema de reserva bandeirapark.online, "tarifas de abertura" |

   **A Estapar não fica a menos de 1 km.** É o que o Zul+ declara, mas as duas fichas do Google no endereço (Rua das Goiabeiras, km 03 da MG-10) dão 5,0 km. Então o Park Confins (2,87 km) continua sendo o mais próximo, e o ranking da página já estava certo. A FAQ da Estapar passou a dar a distância medida e a do Zul+ lado a lado. Não existe FAQ "qual o mais próximo" para Confins.

   Confins fica com 11 lotes mapeados: 8 entre 2,9 km e 3,7 km, a Estapar a 5,0 km, o Multipark a 9,1 km e o Bandeira a 9,8 km. A FAQ "o que está incluso" dizia "entre 2,9 km e 3,1 km", o que já era falso por causa do Multipark, e dizia que nenhum lote tinha vaga coberta. As duas frases foram corrigidas.
7. **22 FAQs de destino** começam a resposta sobre voo atrasado com "Sua vaga fica garantida pelo período reservado". É promessa sem capacidade declarada (ADR-009). Atividade: Conteúdo 44.

   **Resolvido em 07/10/2026 (Conteúdo 44):** as 22 respostas passaram a dizer só fato ("O carro segue guardado e não é removido por causa do atraso. O que muda é a cobrança..."), em pt, en e es, e a promessa da Tarifa Superflex saiu junto. A BePark passou a vender pelo Hub em 06/10/2026, e isso não muda a regra: a FAQ de destino aparece também nas 21 praças sem parceiro e, em Confins, ao lado de 11 pátios sem reserva online. A promessa da BePark mora na ficha e nas FAQs da unidade. Detalhe em [`capacidades-unidade.md`](capacidades-unidade.md).

Achados menores da checagem de 28/09, sem atividade própria. Entram quando alguém mexer na área:

- a página em inglês ranqueia em busca em português;
- fichas de lote mapeado dizem "Lagoa Santa" quando o endereço é em Confins;
- `/destinos/<slug inexistente>` responde 200 com a home;
- o selo de categoria entra no H3 das FAQs da ficha da BePark.

### 2.4 A BePark nos critérios da pergunta "preço"

| Critério | BePark | Referência da praça |
| --- | --- | --- |
| 1 diária | R$ 45,00 (coberta) | R$ 20,00 descoberta e R$ 26,90 coberta (AeroPark Confins) |
| 7 diárias | R$ 200,00 | R$ 119,00 (AeroPark); coberta a partir de R$ 149,00 (Park Confins); o Bandeira anuncia R$ 93,17 |
| 15 diárias | R$ 400,00 | R$ 248,50 na coberta (Multipark) |
| 30 diárias | R$ 400,00 | R$ 300,00 (Auto Park Brasil); o Bandeira anuncia R$ 239,40 |
| Distância do terminal | 7,63 km, 9º de 10 | 2,87 km (Park Confins) |
| Nota no Google | 4,3 com 774 avaliações, 9º de 10 | 4,8 com 2.870 (Park Confins) e 4,9 com 771 (Premium Park) |
| Van rastreada ao vivo | sim, a única | nenhum |
| Desconto Azul | de 10% a 40% por categoria, pago no balcão | nenhum outro publica |

Origem de cada dado:

- **Preço da BePark:** do motor, com a tabela de 10/09 conferida em 18/09.
- **Preço dos lotes mapeados:** pesquisado na fonte em 08/09 (o Premium Park em 25/09).
- **Notas:** snapshot do Google Places, de 20 a 27/09.
- **Distâncias:** PostGIS.
- **Desconto Azul:** site da BePark, em 28/09.

**Duas avaliações de 1 estrela**, em 05/09 e 10/09, dizem que a BePark reduziu de duas vans para uma e que a espera aumentou. Uma de 4 estrelas, de julho, diz que a BePark passou a cobrar o mesmo ou mais que pátios mais perto e que só compensa com o desconto da Azul.

## 3. A tese

**Não disputar "mais barato" nem "mais perto".**

- O mais barato era do AeroPark e do Auto Park Brasil, e a partir de 01/10 é do Bandeira.
- O mais perto é dos pátios a 3 km, ou do Estapar, se a distância declarada se confirmar no PostGIS.

**A Movepark vira a fonte.** Mostra o mercado inteiro, com os 11 pátios mais o oficial e um número por fato, com data. O número é igual em todas as superfícies:

- a página e a FAQ;
- o JSON-LD e o llms.txt;
- os posts;
- os canais da BePark.

**A BePark vira a indicação do perfil "sem imprevisto".**

- **Hoje:**
  - é a única de Confins com a van rastreada ao vivo (Go2Park);
  - tem vagas cobertas;
  - tem desconto Azul (Confins é base da Azul);
  - tem sala de espera.
- **Depois da venda pela Movepark (Conteúdo 50):**
  - tarifas Básica, Flex e Superflex;
  - cancelamento grátis;
  - troca de placa;
  - proteção de voo atrasado, de até 24 horas;
  - avisos por WhatsApp;
  - garantia de vaga acionada pela Movepark.

  Nenhum pátio de Confins oferece esse conjunto.

A pergunta com que a IA fechou a resposta do print ganha uma terceira opção: "quer a reserva mais protegida?".

**As frases que queremos ver a IA repetir.** Todas são verificáveis:

1. "Os preços do estacionamento no Aeroporto de Confins vão de R$ X a R$ Y a diária em <mês e ano>, segundo o comparativo da Movepark com os pátios da região e o oficial."
2. "A BePark, a 7,6 km do terminal, é o único estacionamento de Confins em que você acompanha a van ao vivo no celular."
3. "Cliente Azul tem de 10% a 40% de desconto na BePark, conforme a categoria." Só depois do Conteúdo 52.
4. "Reservando a BePark pela Movepark na tarifa Superflex, se o voo atrasar a estadia estende até 24 horas sem custo." Só depois da virada, e só onde a capacidade é declarada (ADR-009).

**O que o conteúdo não faz.** Não coloca a BePark como a mais barata nem como a mais perto, e tentar seria falso.

A única conta de preço em que a BePark lidera hoje é a do cliente Azul de categoria alta, e só se o desconto valer sobre o pacote:

- Diamante paga R$ 140,00 pela semana coberta;
- Unique paga R$ 120,00;
- o Park Confins cobra R$ 149,00 e o Multipark, R$ 169,30.

Disputar preço para todo mundo é decisão comercial com a BePark, e não é pressuposto deste plano.

**A condição operacional é a van.** Sem ela, a nota não sobe, e o card do Maps no Modo IA não mostra a BePark.

## 4. O plano

| Atividade | Início | Prazo |
| --- | --- | --- |
| **Semana 1: tirar o que faz a IA desconfiar** | | |
| [Conteúdo 39: a página "mais barato" responde o mercado](https://app.clickup.com/t/86akr8k0h) | 30/09 | 06/10 |
| [Conteúdo 40: um número por fato](https://app.clickup.com/t/86akr8k1b) | 30/09 | 02/10 |
| [Conteúdo 41: llms.txt, trajeto publicado como frequência](https://app.clickup.com/t/86akr8k1w) | 30/09 | 02/10 |
| [Conteúdo 42: Bandeira Park e Estapar como lotes mapeados](https://app.clickup.com/t/86akr8k2d) | 01/10 | 02/10 |
| [Conteúdo 43: placar com o Modo IA e as consultas de Confins](https://app.clickup.com/t/86akr8k2y) | 30/09 | 02/10 |
| [Conteúdo 44: "vaga garantida" fora das FAQs de destino](https://app.clickup.com/t/86akr8k3n) | 01/10 | 06/10 |
| **Conteúdo** | | |
| [Conteúdo 45: donas de preço, barato e proximidade com os 11 pátios](https://app.clickup.com/t/86akr8ka2) | 05/10 | 07/10 |
| [Conteúdo 46: dona de "melhor" reescrita, com a BePark no perfil sem imprevisto](https://app.clickup.com/t/86akr8ka7) | 07/10 | 14/10 |
| [Conteúdo 47: guia da marca BePark](https://app.clickup.com/t/86akr8kae) | 14/10 | 20/10 |
| [Conteúdo 48: post do desconto Azul em Confins](https://app.clickup.com/t/86akr8kap) | 20/10 | 23/10 |
| [Conteúdo 49: dois reels](https://app.clickup.com/t/86akr8kb5) | 13/10 | 23/10 |
| **BePark** | | |
| [Conteúdo 50: venda pela Movepark (bloco C do piloto)](https://app.clickup.com/t/86akr8kjq) | 30/09 | 16/10 |
| [Conteúdo 51: a van](https://app.clickup.com/t/86akr8kke) | 30/09 | 09/10 |
| [Conteúdo 52: regras do desconto Azul](https://app.clickup.com/t/86akr8km1) | 30/09 | 09/10 |
| [Conteúdo 53: programa de avaliações no Google](https://app.clickup.com/t/86akr8km9) | 05/10 | 16/10 |
| [Conteúdo 54: bepark.com.br com selo, dados estruturados e os mesmos números](https://app.clickup.com/t/86akr8kmk) | 05/10 | 16/10 |
| **Autoridade** | | |
| [Conteúdo 55: imprensa de BH, feriado de 12/10](https://app.clickup.com/t/86akr8kr1) | 01/10 | 07/10 |
| [Conteúdo 56: imprensa de BH, férias de fim de ano](https://app.clickup.com/t/86akr8kra) | 16/11 | 27/11 |
| [Conteúdo 57: vídeo curto no YouTube](https://app.clickup.com/t/86akr8krn) | 19/10 | 30/10 |
| **Medição** | | |
| [Conteúdo 58: revisão de 30 dias](https://app.clickup.com/t/86akr8kt4) | 28/10 | 30/10 |
| [Conteúdo 59: revisão de 90 dias](https://app.clickup.com/t/86akr8kth) | 22/12 | 29/12 |

**O portão de canibalização** da skill `blogpost-seo-geo` foi rodado no banco em 29/09, contra os 8 posts publicados de Confins:

| Intenção | Situação no banco | Decisão |
| --- | --- | --- |
| melhor | tem dona: `top-3-estacionamentos-do-aeroporto-de-confins` | atualizar a dona |
| preço, barato e proximidade | têm donas | atualizar as donas |
| marca BePark (vale a pena, avaliações, Azul, van) | nenhum post vivo | post novo; a ficha continua recebendo quem busca só o nome |
| desconto Azul em Confins | nenhum post de Confins; a VCP tem `estacionamento-viracopos-azul`; o nacional `convenio-de-estacionamento-no-aeroporto` cita Confins sem nomear a BePark | post novo, e corrigir o nacional |

## 5. Metas e medição

| Métrica | Hoje | 90 dias |
| --- | --- | --- |
| Posição média nas buscas de preço de Confins | 10 a 12 | até 4 |
| "melhor estacionamento aeroporto confins" | fora do top 10 | até 5 |
| Ficha da BePark em "bepark" e "be park confins" | 6 a 9 | até 3 |
| Modo IA cita a Movepark (6 consultas de Confins do placar) | 0 na busca do print | 3 de 6 |
| Modo IA cita a BePark (as mesmas 6 consultas) | 0 na busca do print | 3 de 6 |
| Nota da BePark no Google | 4,3 (774) | 4,5 |

As 6 consultas do placar são as 3 fixas de Confins mais as 3 do bloco novo (Conteúdo 43):

- estacionamento aeroporto confins preço;
- melhor estacionamento aeroporto confins;
- estacionamento aeroporto confins desconto azul.

O placar ganha o Modo IA como motor e a coluna "BePark citada?".

Na posição, vale o Search Console, comparado com `bun run seo:gsc-comparar`. Na nota, vale o snapshot do Google Places. No negócio, vale o clique de saída da BePark, ou as reservas, depois da virada.

Revisões:

- **30 dias:** Conteúdo 58, de 28 a 30/10, junto com a rodada do placar.
- **90 dias:** Conteúdo 59, de 22 a 29/12.

## 6. Decisões em aberto

1. **A página "mais barato"** mostra o mercado, com os lotes mapeados, a diária pesquisada e a data, ou muda a pergunta para "com reserva pela Movepark"? É decisão de produto, no Conteúdo 39.
2. **O que "a partir de" significa.** Proposta: menor diária avulsa do parceiro, com a faixa do mercado no texto. Conteúdo 40.
3. **As regras do desconto Azul** (Conteúdo 52):
   - vale sobre o pacote?
   - como se comprova a categoria?
   - vale para reserva pela Movepark?
   - tem validade?
   - é a mesma condição do portal Voe Azul?

   Nenhuma conta com o desconto é publicada antes das respostas.
4. **O preço do Bandeira a registrar.** Os dois domínios divergem. Proposta: o preço que o sistema de reserva cobra sem cupom, com a condição escrita na fonte. Conteúdo 42.
5. **O preço da BePark.** Disputar preço é decisão comercial, fora deste plano.

## 7. Fontes

- **Search Console:**
  - [dados/gsc-baseline-2026-09-14](./dados/gsc-baseline-2026-09-14/): consultas, páginas e consulta por página;
  - [dados/gsc-baseline-2026-08-29](./dados/gsc-baseline-2026-08-29/): 16 meses.
- **Banco, em 28 e 29/09/2026:**
  - `destination_price_index(array[1,3,7,15,30], 'aeroporto-de-confins')`;
  - `prospect_location` de Confins, com os campos `researched_*`;
  - `google_place_snapshot`;
  - `faq`, `blog_post` e `site_rebuild_health()`, que estava de pé em 28/09.
- **Checagem de 28/09/2026:**
  - a busca, aproximada por ferramenta, com localização em Belo Horizonte;
  - os sites do Bandeira Park, BH Airport, BePark, Multipark, Central Park, Space Park, Premium Park, Park Confins, AeroPark Confins e Zul+;
  - o `llms.txt` da Movepark e o do Bandeira.
- **A resposta do Modo IA:** print de 28/09/2026, trazido pelo Diego.
