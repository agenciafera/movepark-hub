# Conteúdo 49: dois reels de Confins

Atividade: [Conteúdo 49 - Dois reels de Confins](https://app.clickup.com/t/86akr8kb5).
Spec: [`docs/specs/ataque-cnf-bepark.md`](../../specs/ataque-cnf-bepark.md) §2.3.7. Skill `instagram`.

| Reel | Situação | Fonte |
| --- | --- | --- |
| Quanto custa estacionar em Confins em outubro | **Pronto**, para publicar pelo app em 27/10/2026 | [`preco/`](preco/) |
| A van da BePark no mapa (Go2Park) | **Esperando a gravação** com a BePark e a Go2Park | [`van/`](van/) |

Os dois saem pelo app do Instagram, à mão: a fila de `/manager/social` não publica reel (decisão
4 de [`instagram-fila-de-publicacao.md`](../../specs/instagram-fila-de-publicacao.md), mantida em
26/10/2026). Por isso esta pasta é o registro do que foi ao ar.

## Reel de preço

Oito cenas, 29 segundos, sem narração. Os números são os do post
[`preco-do-estacionamento-no-aeroporto-de-confins`](https://movepark.co/blog/preco-do-estacionamento-no-aeroporto-de-confins/)
e de `prospect_location` (pátios e oficial em 07/10/2026; BePark pelo motor, tabela de 06/10/2026).
Os valores do banco e a tabela do post no ar foram reconferidos em 26/10/2026, sem mudança.

| Duração | Oficial (Econômico 3, balcão) | Particular mais barato | BePark |
| --- | ---: | ---: | ---: |
| 1 diária | R$ 60 (Premium até R$ 105) | R$ 20, Auto Park Brasil | R$ 45 |
| 7 diárias | R$ 420, ou a partir de R$ 189 reservando com 72h | R$ 125,93, Bandeira Park | R$ 200 |
| 30 diárias | R$ 1.800 | R$ 300, Auto Park Brasil | R$ 400 |

A BePark entra sem tipo de vaga: a ficha ainda diz "Vaga Coberta" e o site dela diz coberta e
descoberta, e a reserva não garante a coberta (§2.3.5 da spec). Escrever "coberta" seria promessa
(ADR-009).

**Para gerar o vídeo e a capa** (precisa de `bun install` e do ffmpeg):

```bash
P=docs/social/conteudo-49-reels-confins/preco
node .claude/skills/instagram/scripts/render-reel.mjs preco-estacionamento-aeroporto-confins-outubro.mp4 \
  $P/cena-01.html:3.2 $P/cena-02.html:3.5 $P/cena-03.html:3.5 $P/cena-04.html:3.8 \
  $P/cena-05.html:4.2 $P/cena-06.html:3.8 $P/cena-07.html:3.5 $P/cena-08.html:3.5 \
  --capa preco-estacionamento-aeroporto-confins-outubro-capa.jpg
node .claude/skills/instagram/scripts/analisar-carrossel.mjs $P/reel.md
```

O MP4 não fica no git: ele sai igual destes HTML. As fotos de fundo estão em
[`preco/fotos/`](preco/fotos/): três imagens 9:16 geradas no Higgsfield para este reel, com os
emblemas de marca, as placas dos carros e o letreiro inventado da sinalização desfocados (registro
em [`docs/procedencia-imagens.md`](../../procedencia-imagens.md)).

## Reel da van: roteiro de gravação

**O que precisa ser real.** A tela do rastreio e a van. Nada aqui pode ser simulado: um mapa
montado ou uma van gerada por IA seria a prova falsa do único diferencial que a BePark tem em
Confins. Por isso o reel espera a gravação.

**Antes de gravar, confirmar com a BePark e a Go2Park:**

1. **Como o cliente abre o rastreio.** O site diz "sem baixar app", mas não diz por onde chega o
   link (WhatsApp, QR no balcão, e-mail da reserva). A legenda não afirma canal até isso vir por
   escrito, a mesma regra do bloco Go2Park da ficha.
2. **O fluxo de Confins não tem "pedido".** A atividade fala em "do pedido até o embarque", mas a
   van da BePark não é chamada: ela sai a cada 20 minutos do ponto fixo (§2.3.4). O roteiro segue
   o fluxo real, da van saindo do pátio até o embarque no aeroporto.
3. **Se o aviso de proximidade está ligado** na BePark. Se estiver, ele entra numa tomada; se não,
   fica fora do texto.
4. **Autorização de imagem** de quem aparece e da tela do painel.
5. **Exclusividade.** A legenda diz que é a única dos 12 pátios com a van ao vivo, pelo
   levantamento de outubro. Reconferir no dia de publicar.

**Tomadas** (vertical, 1080 x 1920, 30 fps; gravação de tela do celular na resolução nativa):

| # | Tempo | O que filmar | Texto na tela |
| --- | --- | --- | --- |
| 1 | 0 a 3 s | Celular na mão, na plataforma do aeroporto, com o mapa aberto e a van andando | A van da BePark Confins aparece no mapa, ao vivo |
| 2 | 3 a 8 s | Gravação de tela: abrir o rastreio no navegador | Você abre o rastreio no celular, sem baixar app |
| 3 | 8 a 14 s | Gravação de tela: a van saindo do pátio e andando no mapa (acelerar de 4x a 8x) | A van sai a cada 20 minutos, 24 horas |
| 4 | 14 a 19 s | Gravação de tela: a van chegando ao ponto | O trajeto até o terminal leva cerca de 10 minutos |
| 5 | 19 a 24 s | Câmera: a van chegando no piso inferior, plataforma da Expresso Unir, e o embarque | Embarque no piso inferior, na plataforma da Expresso Unir |
| 6 | 24 a 27,5 s | Card de fechamento, [`van/cena-fechamento.html`](van/cena-fechamento.html) | A 7,6 km do terminal, com van a cada 20 minutos |

**Na edição:** desfocar placa (da van e dos carros), rosto de quem não autorizou, nome de cliente,
telefone e qualquer dado da reserva que apareça no mapa. A capa é um quadro da tomada 1 com o
texto dela. Sem promessa de tempo de espera: a queixa das avaliações é a espera, e o reel mostra
onde a van está, sem dizer que ela chega antes.

O card de fechamento sai pronto para o editor com:

```bash
node .claude/skills/instagram/scripts/render-reel.mjs bepark-confins-van-fechamento.mp4 \
  docs/social/conteudo-49-reels-confins/van/cena-fechamento.html:3.5
```

## Publicar pelo app

1. Reel novo, com o MP4. Em "Capa", escolha a capa JPEG da galeria.
2. Cole a legenda do `reel.md` (do primeiro parágrafo às hashtags, sem o front matter).
3. Música: opcional, da biblioteca do app e em volume baixo. O vídeo é mudo e se lê sem som.
   Acessibilidade: a API não aceita texto alternativo em reel, então todo valor da tela está
   escrito na legenda (o analisador confere). Se o app oferecer "Texto alternativo" em
   Configurações avançadas, use o `capa_alt` do `reel.md`.
4. Deixe "Compartilhar também no feed" ligado.
5. Troque o link da bio para a `cta_url` do `reel.md`, com a UTM.
6. Depois de publicar, anote aqui embaixo a data e o link, e comente na atividade.

## Publicados

| Reel | Data | Link |
| --- | --- | --- |
| Preço | | |
| Van | | |
