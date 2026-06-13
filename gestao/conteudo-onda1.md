# Conteúdo — Onda 1 (Conversão & Confiança)

Fonte da verdade do **conteúdo manual** da Onda 1. A engenharia (schema, render,
admin, JSON-LD) está pronta; aqui mora o texto que pessoas escrevem.

> **FAQ em camadas (ADR-002):** a `global` (cancelamento, PIX, como reservar…) é
> escrita uma vez no admin central de FAQ e referenciada em toda página. Esta seção
> cobre a camada **`destination`** — específica do aeroporto. Edite no Hub em
> **Manager → Destinos → (linha do aeroporto) → FAQ**.

## 2. FAQ por aeroporto (`scope = destination`)

As respostas abaixo são uma **baseline** — propositalmente seguras (apontam para o
dado por estacionamento, que varia por lote) e válidas para qualquer unidade do
aeroporto. **Parceiro/operação devem revisar e especializar** antes de tratar como
definitivo. `is_published` é a moderação: publique quando validado.

### 2.1 Aeroporto de Viracopos (VCP) — `aeroporto-de-viracopos`

| # | Pergunta | Categoria |
|---|---|---|
| 1 | O estacionamento em Viracopos oferece traslado até o terminal? | Check-in / Acesso |
| 2 | E se meu voo atrasar ou eu voltar antes do previsto? | Reservas |
| 3 | As vagas em Viracopos são cobertas ou descobertas? | Veículos |
| 4 | Tem valet ou é self-park (você mesmo estaciona)? | Check-in / Acesso |
| 5 | Os estacionamentos de Viracopos são seguros? Têm monitoramento? | Veículos |
| 6 | Existe limite de altura (gabarito) para SUVs, vans ou furgões? | Veículos |

**1. O estacionamento em Viracopos oferece traslado até o terminal?**
Depende do estacionamento. Em Viracopos os lotes ficam a poucos minutos do terminal e
muitos oferecem traslado (transfer) de ida e volta — em vários casos já incluído na
diária. Na página de cada estacionamento você vê se o traslado está incluso, o horário
e a distância até o terminal. Reserve o que melhor encaixa no seu voo.

**2. E se meu voo atrasar ou eu voltar antes do previsto?**
Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro
depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda
mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do
próprio estacionamento.

**3. As vagas em Viracopos são cobertas ou descobertas?**
Varia por estacionamento e por tipo de vaga. Há opções cobertas (protegidas de sol e
chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades
aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.

**4. Tem valet ou é self-park (você mesmo estaciona)?**
Os dois modelos existem em Viracopos. No valet, a equipe estaciona o carro por você; no
self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as
comodidades (traslado, lavagem, etc.).

**5. Os estacionamentos de Viracopos são seguros? Têm monitoramento?**
Os estacionamentos parceiros listam suas comodidades de segurança — como monitoramento
por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os
itens de cada estacionamento antes de reservar.

**6. Existe limite de altura (gabarito) para SUVs, vans ou furgões?**
Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito.
Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e
observações do estacionamento ou fale com a unidade antes de reservar para garantir o
encaixe.

### 2.2 Aeroporto de Guarulhos (GRU) — `aeroporto-internacional-de-sao-paulo-guarulhos`

Mesmo gabarito de 6 perguntas; Q1 especializada (3 terminais T1/T2/T3).

**1. O estacionamento em Guarulhos oferece traslado até o terminal?**
Depende do estacionamento. O GRU tem três terminais (T1, T2 e T3) e os estacionamentos
parceiros costumam ficar a poucos minutos deles, a maioria com traslado (transfer) de ida
e volta — em vários casos já incluído na diária. A página de cada estacionamento mostra se
o traslado está incluso, o horário e para qual terminal ele leva. Confira o do seu voo
antes de reservar.

**2–6.** Iguais ao gabarito (voo atrasado/voltar antes, coberto×descoberto, valet×self-park,
segurança/monitoramento, gabarito), com "Guarulhos" no lugar do aeroporto.

### 2.3 Aeroporto de Congonhas (CGH) — `aeroporto-de-congonhas`

**1. O estacionamento em Congonhas oferece traslado até o terminal?**
Depende do estacionamento. Congonhas fica dentro de São Paulo, então os lotes parceiros
costumam ser bem próximos do terminal — muitos com traslado (transfer) de ida e volta, em
vários casos já incluso na diária. A página de cada estacionamento mostra se o traslado
está incluído, o horário e a distância até o terminal.

**2–6.** Gabarito padrão com "Congonhas".

### 2.4 Aeroporto Santos Dumont (SDU) — `aeroporto-santos-dumont`

**1. O estacionamento no Santos Dumont oferece traslado até o terminal?**
Depende do estacionamento. O Santos Dumont fica no centro do Rio, junto à orla, e os lotes
parceiros costumam ser bem próximos — muitos com traslado (transfer) de ida e volta, às
vezes já incluso na diária. Veja na página de cada estacionamento se o traslado está
incluído, o horário e a distância até o terminal.

**2–6.** Gabarito padrão com "Santos Dumont".

### 2.5 Aeroporto do Galeão (GIG) — `aeroporto-do-galeao`

**1. O estacionamento no Galeão oferece traslado até o terminal?**
Depende do estacionamento. O Galeão tem dois terminais (T1 e T2) e os lotes parceiros ficam
a poucos minutos deles, a maioria com traslado (transfer) de ida e volta — em vários casos
já incluído na diária. A página de cada estacionamento mostra se o traslado está incluso, o
horário e para qual terminal ele leva.

**2–6.** Gabarito padrão com "Galeão".

---

_Próximos aeroportos (CWB, BSB, CNF, POA, LIS, OPO, FAO…) seguem o mesmo gabarito de 6
perguntas, especializando traslado/segurança/gabarito conforme a realidade de cada um._
