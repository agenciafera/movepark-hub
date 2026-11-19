# Mensalistas: pesquisa de demanda (fase 1 do projeto faseado)

> **Status:** rascunho para revisão do Renato (19/11/2026). Nenhum código nasce desta spec: ela
> define **o que perguntar, para quem, por onde e em que momento**, e o que a resposta precisa
> virar para a fase 2 começar. Quando as perguntas forem aprovadas, a implementação ganha spec e
> atividade próprias.
> **Origem:** reunião de alinhamento com o Renato Baruki em 13/11/2026 (ata no Google Docs,
> "Alinhamento Renato - 2026/11/13") e a atividade
> [Mensalistas: perguntas da pesquisa de demanda para as 3 frentes](https://app.clickup.com/t/17tn9ea20c8)
> (Sprint 9). **Pronto quando:** perguntas aprovadas pelo Renato.
> **Apresentação para o Renato** (14 slides, mesmo conteúdo desta spec, em ordem de conversa):
> <https://claude.ai/artifact/M8teidSGMDAXJuDtorXp2V>. Privada até ser compartilhada pelo menu da
> página; quando a spec mudar, os slides mudam junto.
> **Relacionadas:** [grupo-movepark.md](./grupo-movepark.md) (Coopark, Q-025),
> [marketing-automation.md](./marketing-automation.md) (contato de marketing, consentimento,
> "candidato a assinante"), [reservas-wl-no-hub.md](./reservas-wl-no-hub.md) (`wl_booking`, a base
> de verdade), [agente-whatsapp-wl.md](./agente-whatsapp-wl.md) (a Mia), ADR-006.
> A spec `mensalista-recorrencia.md`, citada no README e em `grupo-movepark.md`, **nunca entrou no
> repositório** (não há commit dela em nenhuma branch). Esta spec não a substitui: aquela era
> análise de escopo do produto; esta é o desenho da pesquisa.

## 1. O acordo da reunião, em uma frase

**Provar que vende antes de desenvolver.** A Movepark levanta o mapa de demanda por polo ("Vila
Olímpia, tenho 100 pessoas"), o Renato leva o mapa às redes de estacionamento e volta com as vagas
("rede tal tem 100 vagas aqui"). Se o casamento fecha, a fase 2 (produto de mensalista, match,
cobrança recorrente) começa com cliente na mão.

Três frentes, meta combinada de **100 nomes por frente** e **300 respostas no total**:

| Frente | Quem é | O que a Movepark já tem | Dono do disparo |
|---|---|---|---|
| **A. Base Movepark** | quem já estacionou com um parceiro, viajando | telefone de 86.811 pessoas em `wl_booking` + 133 no Hub | Movepark |
| **B. Tráfego pago** | quem trabalha nos polos e não é cliente | nada: lista nasce do zero | Movepark monta, Renato aprova a segmentação |
| **C. Base antiga da Copark** | ex-mensalistas da operação que o Renato absorveu | nada no Hub; e-mails com o Renato | Renato |

Cuidado levantado pelo Renato, que vira regra de desenho (§ 3): a pesquisa não pode devolver
micro-regiões espalhadas (BH, Osasco, Interlagos). Ela tem que **puxar para os polos de demanda**
(Vila Olímpia, Itaim, e o entorno Faria Lima e Iguatemi) sem, por isso, deixar de registrar quem
está fora deles.

**O que destrava a fase 2**, nas palavras da reunião (00:43): **três regiões com demanda real**
(um polo só não basta), **vaga na mão** (lotes credenciados, com preço e quantidade acertados) e a
meta de **R$ 100 mil de vendas por mês**. A pesquisa desta fase **não inclui a Garagem** (a rede do
Renato): a demanda dela ele já conhece; o teste é se outras redes também querem. O que vem depois
(match instantâneo, leilão de vaga, cobrança no cartão, cashback por indicação, painel de avisos
para o estacionamento) foi conversado e fica para a fase 2.

## 2. O que a pesquisa precisa provar

Não é pesquisa de satisfação nem de opinião. É contagem de demanda qualificada. Cada resposta tem
que permitir dizer, sem interpretação, quatro coisas sobre a pessoa:

1. **Se já é mensalista hoje** (paga, a empresa paga, ou só queria ser).
2. **Onde** a vaga é ou seria, como ponto no mapa, não como texto livre.
3. **Quanto paga** (faixa), para o Renato negociar preço em bloco com margem conhecida.
4. **Se quer ser avisada** quando houver vaga melhor perto dela, deixando o WhatsApp. Isso é a
   "fila da região" da ata, e é o único sinal de intenção que vale alguma coisa.

Métrica de sucesso da fase 1, por polo: **pessoas que responderam "sim, quero ser avisada", com
ponto no mapa e faixa de preço.** É esse número que vai para a mesa do Renato. Respostas sem os
quatro itens contam como "curiosos" e não entram no mapa.

Hipóteses que a contagem confirma ou derruba:

- **H1.** Existe demanda concentrada (dezenas por polo, não unidades) em Vila Olímpia, Itaim e
  Faria Lima e Pinheiros, suficiente para fechar bloco com uma rede.
- **H2.** O mensalista troca de estacionamento por preço menor **e** por conveniência (mais perto,
  sem multa, poder trocar quando muda de emprego). Qual dos dois pesa mais define a oferta.
- **H3.** Uma parte relevante não paga do próprio bolso (empresa paga ou reembolsa). Para essa
  parte, "pagar menos" não convence; "cashback" e "sem multa" convencem (ideia do Renato na ata).
- **H4.** A base de viajantes de Guarulhos e Congonhas é majoritariamente gente que trabalha na
  capital, então ela rende respostas nos polos. A de Viracopos rende Campinas, e Campinas não é
  polo desta fase.

## 3. Regras de desenho (valem para as três frentes)

**R1. Um formulário só, três portas de entrada.** As três frentes respondem **o mesmo
questionário**, numa única página, com a origem gravada por parâmetro (`origem=base|ads|copark`
mais UTMs). O que muda por frente é a **mensagem que leva até a página**, nunca a pergunta. Três
formulários diferentes dariam três mapas incomparáveis.

**R2. Geografia primeiro, e estruturada.** A pergunta "onde" é respondida com **endereço ou CEP do
local de trabalho** (autocomplete de endereço, como o Hub já faz na busca), que vira ponto no
mapa. Bairro digitado à mão não serve: "Vila Olímpia", "V. Olímpia" e "Faria Lima" são três
respostas para o mesmo lugar. **O polo é atribuído por nós, depois**, pela posição do ponto, com
uma lista fechada de polos (abaixo). Quem cai fora de todos os polos fica em "outro" com o
município registrado, sem ser descartado. É assim que o cuidado do Renato se resolve sem
enviesar: a pessoa não escolhe o polo, o mapa mostra.

Polos desta fase (São Paulo capital): **Vila Olímpia**, **Itaim Bibi**, **Faria Lima e
Pinheiros**, **Berrini e Brooklin**, **Paulista e Jardins**, **Centro**, **outro** (com município).
A lista é do Renato: ele a amplia ou corta antes do disparo.

**R3. Noventa segundos no celular.** Sete perguntas, uma tela, sem login, sem cadastro antes de
responder. Nome e WhatsApp entram **no fim**, só para quem respondeu "quero ser avisada". Quem
desiste no meio ainda deixa as respostas anteriores gravadas (salvamento por pergunta).

**R4. A pergunta de preço é por faixa, e as faixas são do Renato.** Ele mostra a precificação na
próxima reunião (ata, 00:56:42). As faixas abaixo são **placeholder** para ele calibrar. Faixa
errada (larga demais ou fora do mercado) joga todo mundo na mesma caixa e o dado morre. Âncoras
que a própria reunião deu: o mensal da Garagem em Pinheiros é R$ 650 (00:53), e o pacote de 25
vagas vendido ao C6 saiu a R$ 320 por vaga (00:33). As faixas de § 4 cobrem esse intervalo.

**R5. Nenhuma promessa de produto.** A página não diz "a Movepark tem vaga mensal em Vila Olímpia"
porque não tem. Diz o que é verdade: "estamos mapeando onde falta vaga mensal e quanto se paga;
se aparecer algo melhor perto de você, avisamos". A oferta vincula (ADR-009 e CDC art. 30), e a
pesquisa não é oferta. Pelo mesmo motivo, a página **não usa o nome Coopark** enquanto Q-025
(em `grupo-movepark.md`) estiver aberta: fala como Movepark.

**R6. Consentimento explícito, por canal, separado da resposta.** Responder a pesquisa não é
aceitar marketing. Quem quer ser avisada marca a caixa e isso grava `whatsapp_consent` com fonte
`pesquisa-mensalista` (modelo de `marketing_contact`, § 7 de `marketing-automation.md`). Hoje
**zero** contatos da base têm `whatsapp_consent`, então esta pesquisa é também a primeira coleta
de opt-in de WhatsApp da Movepark, e vale tratá-la como tal.

### 3.1 O fluxo ponta a ponta

```
gatilho ─► mensagem ─► página ─► resposta ─► polo ─► fila da região ─► quadro ─► Renato ─► vaga ─► aviso à fila
```

| Passo | O que acontece | Quem | Onde fica o dado |
|---|---|---|---|
| 1. Gatilho | A: saída concluída em GRU ou CGH há 24h. B: pessoa no raio do polo abre o Instagram. C: Renato dispara a lista. | Hub (A), Meta Ads (B), Renato (C) | `wl_booking.check_out_at` (A) |
| 2. Mensagem | A: template de utilidade no WhatsApp ("deu tudo certo na retirada?") com link. B: anúncio com a pergunta 1 na chamada. C: e-mail assinado pelo Renato. | Movepark (A, B), Renato (C) | `notification_log` (A), UTMs (B, C) |
| 3. Página | Uma página só. A frente A abre com a avaliação da estadia; as três seguem para as 7 perguntas. Salva por pergunta. | Movepark | tabela da pesquisa, `origem` + UTMs |
| 4. Resposta | 7 perguntas em 90 segundos; nome e WhatsApp só de quem quer ser avisado. | cliente | idem, com `whatsapp_consent` se marcou |
| 5. Polo | O ponto do endereço do trabalho cai num polo da lista, ou em "outro" com o município. Nunca escolhido pela pessoa. | Hub (PostGIS, ADR-001) | coluna `polo` na tabela |
| 6. Fila da região | Quem respondeu "quero ser avisado" recebe uma confirmação curta ("você está na fila de Vila Olímpia; avisamos quando houver vaga") e entra na lista daquele polo. | Movepark | mesma tabela, `quer_aviso = true` |
| 7. Quadro | Toda semana: respostas por polo, já mensalistas, preço mediano, intenção com contato, estacionamentos citados. | Movepark | § 8 |
| 8. Renato | Leva os três ou quatro polos mais cheios às redes (sem a Garagem) e volta com vaga, preço e quantidade. | Renato | fora do Hub |
| 9. Vaga | Há vaga num polo com demanda: critério "três regiões com demanda real + vaga na mão" atendido. | os dois | decisão de ir para a fase 2 |
| 10. Aviso à fila | A fila do polo recebe a oferta real. É a primeira venda da fase 2, e ela nasce com lista quente, não com anúncio frio. | Movepark | fase 2 |

O passo 6 é o que separa pesquisa de captura: sem a confirmação, a pessoa respondeu a um
formulário morto; com ela, entrou numa fila e sabe por que vai receber a próxima mensagem. É
também o que legitima o aviso do passo 10 meses depois.

## 4. O questionário

Ordem pensada para a pessoa responder o que custa menos primeiro e deixar o contato por último,
quando já entendeu para que serve.

| # | Pergunta (texto para o cliente) | Formato | Para que serve |
|---|---|---|---|
| 1 | **No dia a dia, você paga estacionamento mensal?** | única: Sim, pago eu / Sim, a empresa paga ou reembolsa / Não, pago avulso (diária ou rotativo) / Não, mas queria uma vaga mensal / Não estaciono (transporte, remoto) | separa mensalista de curioso; quem paga (H3) |
| 2 | **Onde fica (ou onde você precisaria) essa vaga?** Digite o endereço ou o CEP do lugar onde você trabalha. | autocomplete de endereço, vira ponto no mapa | o mapa (R2) |
| 3 | **Essa vaga é perto de:** | única: Trabalho ou faculdade / Casa / Outro | mensalista de trabalho é o alvo; de moradia é outro produto |
| 4 | **Quanto você (ou a empresa) paga por mês?** | única, faixas placeholder: até R$ 300 / R$ 301 a 450 / R$ 451 a 600 / R$ 601 a 800 / R$ 801 a 1.000 / acima de R$ 1.000 / Não sei, a empresa paga | preço de referência por polo (R4) |
| 5 | **Quantos dias por semana você vai de carro?** | única: 1 ou 2 / 3 / 4 ou 5 / Todos, inclusive fim de semana | dimensiona o produto (híbrido vs integral); dado que o Renato não tem |
| 6 | **O que te faria trocar de estacionamento?** Escolha até 2. | múltipla: Pagar menos / Ficar mais perto / Não ter multa para sair / Poder trocar de lugar quando mudar de emprego / Pagar no Pix ou cartão em vez de boleto / Vaga coberta e com segurança / Dinheiro de volta por indicar colegas | H2; ordena a proposta de valor da fase 2 |
| 7 | **Se achar uma vaga melhor perto de você, quer que a gente avise?** | única: Sim, pelo WhatsApp / Sim, por e-mail / Não, só respondi | intenção + consentimento (R6) |
| 7a | *(se "sim")* **Seu nome e seu WhatsApp (ou e-mail)** | texto + telefone E.164 | o contato que entra na fila |
| 8 | *(opcional)* **Em qual estacionamento você fica hoje?** | texto curto | inteligência de oferta para o Renato: quais redes já atendem o polo |

Campos gravados sem perguntar: `origem`, UTMs, data e hora, e, na frente A, a chave do contato
(telefone normalizado) para cruzar com `wl_booking`/`booking` sem pedir nada de novo.

**Variações por frente, só na pergunta 1.** Na frente C (ex-Copark), a pergunta 1 ganha uma
opção a mais: "Era mensalista da Copark e hoje não estaciono mais em vaga mensal". É o único lugar
onde o questionário diverge, e diverge para medir perda, não para mudar o mapa.

**O que ficou de fora, de propósito.** Renda, cargo, empresa onde trabalha, modelo do carro,
horário de entrada e saída, "você conhece a Movepark?". Cada uma custa 10 a 15 segundos e nenhuma
muda o que o Renato leva à mesa. Modelo do carro a base já tem (`vehicle`).

## 5. Frente A: base Movepark

### 5.1 Qual base, de verdade

A base do Hub é pequena: 140 reservas pagas, 133 pessoas, 68 em Guarulhos. A base que importa está
em **`wl_booking`**, as reservas dos sites white-label importadas desde 08/10/2026
(`reservas-wl-no-hub.md`). Medido em 19/11/2026, só reservas confirmadas e sem duplicata:

| Destino | Reservas | Pessoas com telefone | Pessoas com telefone e saída nos últimos 12 meses | Saídas nos últimos 90 dias |
|---|---|---|---|---|
| Viracopos | 80.725 | 58.309 | 51.647 | 18.275 |
| **Guarulhos** | 21.122 | 17.540 | 15.804 | 5.275 |
| Afonso Pena | 9.196 | 7.553 | 6.754 | 2.134 |
| **Congonhas** | 3.887 | 3.295 | 3.082 | 971 |
| Confins | 883 | 790 | 676 | 743 |
| Tietê | 598 | 404 | 351 | 70 |
| **Total** | 116.411 | 86.811 | | |

Duas leituras saem daí:

- **O público desta fase é Guarulhos e Congonhas: cerca de 19 mil pessoas com telefone e viagem
  no último ano.** É quem trabalha na capital. Viracopos é a maior base e a mais errada para esta
  pergunta: rende Campinas, Jundiaí e Sorocaba, exatamente a dispersão que o Renato pediu para
  evitar. Afonso Pena e Confins idem. Elas ficam para uma fase em que Curitiba, Campinas ou BH
  sejam polo.
- **Só a saída de Guarulhos e Congonhas gera cerca de 70 pessoas por dia** com reserva recém
  concluída. Com 3% de resposta, os 100 nomes da frente A chegam em uma a duas semanas sem tocar
  no histórico. Com 1%, em um mês. Se o pós-saída não bastar, o histórico de 12 meses é a reserva.

**14.763 pessoas têm duas ou mais reservas nos aeroportos de São Paulo.** Recorrente responde mais
e confia mais; é a primeira fatia do histórico a receber, se o histórico for necessário.

### 5.2 Em que momento interceptar

| Momento | O Hub já fala com o cliente aqui? | Avaliação |
|---|---|---|
| Busca e página da unidade | não (SSG, anônimo) | Não. Pessoa está comprando outra coisa; banner vira ruído e derruba conversão. |
| Checkout | não | **Não.** Cada campo a mais no checkout custa venda, e a pergunta não tem nada a ver com a compra. |
| Confirmação da reserva | sim (e-mail; WhatsApp para quem tem o benefício) | Não. Mensagem de utilidade, lida com pressa; misturar pesquisa confunde. |
| Lembrete de entrada (24h antes) e de retirada (2h antes) | sim (`booking-reminders`) | Não. Ele está dirigindo ou embarcando. |
| **Saída concluída (24 a 48h depois)** | parcialmente: `review-request` manda e-mail pedindo avaliação | **Sim. É o momento.** Viagem acabou, carro em casa, a relação está fresca e a pessoa tem o celular na mão. O Hub sabe a hora exata (`check_out_at`). |
| Conversa com a Mia (WhatsApp) | sim, agente ativo nos WL | **Sim, como complemento.** Quem já está conversando pode receber o link ali, sem template e sem custo, dentro da janela de 24h da Meta. |
| Área da conta (`/account`) | sim | Fraco. Pouca gente volta à conta fora de uma viagem. Vale um card discreto, não como canal principal. |

**Decisão recomendada:** uma mensagem de WhatsApp **24 horas depois da saída**, para reservas de
Guarulhos e Congonhas, com o link da página. E-mail só como queda para quem não tem telefone (e já
existe `review-request` por e-mail: a pesquisa não deve ir num segundo e-mail; ou entra como bloco
nesse, ou não vai por e-mail).

### 5.3 A mensagem e o problema do template

A Meta separa templates em **utilidade** (ligados à transação) e **marketing** (promoção, e exige
opt-in ativo da pessoa). A base tem **zero opt-in de marketing** no WhatsApp. Então o caminho é:

1. **O template é de utilidade e fala da estadia que acabou.** Ele pergunta como foi e dá o link.
   A pergunta de mensalista mora **na página**, depois da avaliação, nunca no template. É também
   o que o cliente aceita melhor: a primeira pergunta é sobre o que ele acabou de viver.
2. A página abre com a avaliação da estadia (uma pergunta, estrelas), agradece, e aí apresenta o
   bloco: "Uma pergunta fora da viagem: no dia a dia, você paga estacionamento mensal?" Quem não
   quiser para ali, e a avaliação já valeu.
3. Se a Meta classificar o template como marketing na aprovação, ele **não sai para a base** sem
   opt-in. Aí a frente A corre pela Mia (janela de 24h), pelo e-mail e pelo card da conta, e a
   coleta de opt-in da pesquisa passa a ser o primeiro objetivo. **Isso é um gate (D-2).**

Rascunho do template (3 variáveis: nome, nome da unidade, link), para revisão pela skill
`revisar-texto` antes de submeter à Meta:

> Oi, {{1}}. Seu carro ficou com a {{2}} nesta viagem. Deu tudo certo na retirada?
> Leva um minuto responder e ajuda a gente a melhorar: {{3}}
> Se não quiser receber mensagens assim, responda SAIR.

Quem manda: o número que já fala com esse cliente. Hoje a reserva do WL é atendida pelo número do
agente (Mia); o Hub tem o envio por template (`_shared/notify.ts`), mas o contato de `wl_booking`
não está em `marketing_contact`. **Por qual número e por qual sistema a frente A dispara é decisão
D-3**, e muda o tamanho da implementação.

### 5.4 Base legal

O telefone foi dado para a reserva. Pedir avaliação da estadia é execução do serviço. Perguntar
sobre vaga mensal é **finalidade nova**: cabe em legítimo interesse por ser uma pesquisa curta,
sem oferta, com opt-out na própria mensagem e com o contato de marketing gravado **só** para quem
marcar a caixa (R6). Nada da resposta entra em `marketing_contact` sem a pergunta 7 respondida com
"sim". Supressão (`SAIR`) respeita `marketing_suppression`, que já existe.

## 6. Frente B: tráfego pago

**Objetivo:** 100 nomes de quem trabalha nos polos e **não** é cliente. É a única frente que mede
demanda fora da bolha de viajante.

**Segmentação:** Meta Ads (Instagram e Facebook) com raio geográfico em "pessoas que estão neste
local" sobre Vila Olímpia, Itaim e Faria Lima, com os pontos que o Renato citou (Rua Funchal,
entorno do Iguatemi). Dia útil, horário comercial, para pegar quem está no escritório. Google
Search entra com termos de intenção ("estacionamento mensal vila olímpia", "mensalista itaim
bibi") porque quem digita isso já está procurando. A segmentação é compartilhada com o Renato
**antes** de ligar (combinado da ata, 01:04).

**O anúncio é a pré-qualificação.** A chamada faz a pergunta 1 por ele: quem clica já se declarou.

Rascunhos de chamada (passam por `revisar-texto` e `copy-lp-queiroz` antes de rodar):

- "Você paga estacionamento mensal na Vila Olímpia? Conta onde e quanto. Se aparecer vaga mais
  barata perto do seu trabalho, a gente avisa."
- "Mensalista no Itaim: está pagando quanto? Em 1 minuto você entra na fila da vaga mais perto e
  mais barata."
- "Sua empresa paga seu estacionamento? Então leia isto: dá para ela pagar menos e você ganhar
  por indicar."

**Destino do clique:** a mesma página da frente A, com `origem=ads`. O formulário nativo da Meta
(Instant Form) converte mais, mas não tem autocomplete de endereço, e sem isso R2 morre. Fica
como plano B se o custo por lead da página estourar.

**Medição:** o container GTM que já existe (`analytics-ecommerce.md`) ganha um evento de lead da
pesquisa; UTMs gravadas no envio. Meta da primeira semana: descobrir o custo por resposta completa
(com ponto no mapa e "quero ser avisada"), não o custo por clique.

## 7. Frente C: base antiga da Copark

**Quem é:** ex-mensalistas de uma operação que faturava R$ 200 mil por mês sem tecnologia (ata,
00:48). É a frente mais quente para "onde e quanto", porque todo mundo ali já foi mensalista.

**Regras:**

- **O remetente é quem tinha a relação.** A base é do Renato (absorvida com a marca). Quem
  escreve é ele, ou a Copark, nunca a Movepark em nome próprio: a pessoa não conhece a Movepark e
  um e-mail de desconhecido pedindo onde ela estaciona vai para o spam ou para o Procon.
- **Nenhum dado da lista entra no Hub por importação.** Quem responde entra pela página, com
  `origem=copark`, e só o que a pessoa digitou fica gravado. A lista em si fica com o Renato.
- **Canal:** e-mail, que é o que o Renato tem ("vou arrumar uns e-mails"). Se houver telefone, o
  WhatsApp exige o mesmo opt-in da frente A, e aqui ele não existe, então e-mail primeiro.
- **Opt-out na mensagem**, como manda a LGPD e como já é regra em `marketing-run`.

Rascunho de e-mail (assinatura do Renato, revisar antes de enviar):

> Assunto: Onde você estaciona hoje?
>
> Oi, {{nome}}. Você foi cliente da Copark, e a Copark está voltando com um jeito novo de
> conseguir vaga mensal pagando menos. Antes de qualquer coisa, queremos entender onde está a
> demanda: onde você estaciona hoje e quanto paga. Leva um minuto: {{link}}
> Se não quiser mais receber nossos e-mails, clique aqui.

A opção extra da pergunta 1 ("era mensalista da Copark e hoje não estaciono mais em vaga mensal")
mede quanto da base antiga ainda é mensalista. Se for pouco, a lista vale menos do que parece.

## 8. O que a resposta vira: o mapa para o Renato

Tudo cai numa tabela só (`origem`, ponto, polo atribuído, respostas 1 a 8, contato se houver,
chave de cruzamento com a base). O entregável da fase 1 é um quadro por polo:

| Polo | Respostas | Já mensalistas | Preço mediano (faixa) | "Quero ser avisada" com WhatsApp | Dias por semana (moda) | Estacionamentos citados |
|---|---|---|---|---|---|---|

mais o mapa de pontos e a lista exportável (nome, WhatsApp, polo, faixa) **só** de quem marcou a
pergunta 7, para o Renato ligar quando tiver vaga. O corte para levar à mesa é dele; a ata sugere
a ordem de grandeza de 100 por polo.

Rastro por frente: respostas, completas, com contato, custo (frente B), para saber de onde a
demanda veio e qual frente repetir.

## 9. Cronograma proposto

| Semana | Entrega | Gate |
|---|---|---|
| 1 (até 21/11) | Questionário aprovado pelo Renato; faixas de preço e lista de polos calibradas; segmentação da frente B compartilhada | G-1 (Renato) |
| 2 | Página no ar; template submetido à Meta; e-mail da Copark redigido; GTM com o evento | D-1, D-2, D-3 |
| 3 e 4 | Disparo pós-saída (A) rodando todo dia; anúncios ligados (B); e-mail da Copark enviado (C) | |
| 5 | Primeiro quadro por polo para o Renato; ele tem "uma semana, alguns dias" para voltar com vagas | |

Se o pós-saída da frente A render menos de 30 respostas em duas semanas, entra o histórico de 12
meses de Guarulhos e Congonhas, começando pelos 14.763 recorrentes.

## 10. Gates e decisões abertas

- **G-1 · Perguntas aprovadas pelo Renato.** Critério de pronto da atividade. Inclui faixas de
  preço (R4) e lista de polos (R2).
- **D-1 · Onde a página mora.** (a) Página no Hub (`/mensalista` ou similar), que reaproveita
  autocomplete de endereço, PostGIS para atribuir polo (ADR-001), GTM e envio por WhatsApp; (b)
  ferramenta de formulário pronta (Typeform ou similar), sem código, mas sem ponto no mapa
  estruturado e com normalização à mão. Recomendação: **(a)**, porque R2 é o coração da pesquisa e
  o Hub já tem tudo que ela precisa. É código, então ganha spec e atividade próprias.
- **D-2 · Categoria do template na Meta.** Submeter como utilidade (§ 5.3). Se voltar como
  marketing, a frente A muda de canal e a coleta de opt-in vira objetivo.
- **D-3 · Por qual número e sistema a frente A dispara.** Mia (agente no WL, número que já fala
  com o cliente) ou Hub (`notify.ts`, precisa trazer o contato do `wl_booking` para o alcance do
  envio). Define o tamanho da implementação.
- **D-4 · Faixas de preço.** Placeholder em § 4; o Renato traz a precificação.
- **D-5 · Lista de polos.** Seis polos mais "outro" em § 3; o Renato confirma.
- **Q-025** (em `grupo-movepark.md`) continua aberta e, enquanto estiver, a pesquisa não usa o
  nome Coopark (R5).

## 11. O que esta spec não decide

Preço de venda, comissão, modelo de cobrança recorrente, match entre demanda e vaga, cashback por
indicação, app ou site do mensalista. Tudo isso é fase 2 e depende do número que sair daqui.
