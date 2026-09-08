# CRM Intelligence: RFM, Growth e descobertas (E3.2)

Implementação da proposta que o time de marketing trouxe em dois documentos: a apresentação
*CRM Intelligence RFM + Growth* (15 slides) e a *Especificação Funcional* (RF-001 a RF-007).

Base: [marketing-automation.md](./marketing-automation.md) (E3.1), que já entregou contatos,
segmentos, campanhas, funil e leads. Aqui entra a camada que **classifica a base sozinha**, que é
o gargalo que os dois documentos apontam: hoje o gestor precisa imaginar o público antes de
conseguir encontrá-lo.

Migration: `supabase/migrations/20261029093000_marketing_rfm_growth.sql`.
Front: `src/features/marketing/{rfm.logic.ts,RfmMatrix.tsx,Discoveries.tsx,RfmContactSheet.tsx}`.

## O que estava pedido e o que foi entregue

| Documento | Item | Estado |
|---|---|---|
| RF-001 | Cálculo R/F/M, 1 a 5, com data do cálculo | `marketing_contact_rfm`, calculado na consulta |
| RF-002 | Recálculo automático | Sai de graça: nada é gravado, então toda leitura já é o valor de agora |
| RF-003 | Segmentos dinâmicos, com entrada e saída automática | 11 segmentos `is_system`, resolvidos ao vivo |
| RF-004 | Janela provável de retorno pelo ciclo individual | Campo `cycle_overdue_days` + segmento "Está na hora de voltar" |
| RF-005 | Novos operadores e campos no construtor | 18 campos novos, mesmos operadores |
| RF-006 | Card clicável abrindo a lista do segmento | Célula da matriz abre `RfmContactSheet` |
| RF-007 | Atribuição de receita da campanha | **Fora desta entrega.** Depende de rastrear reserva por campanha, que o `marketing_message` ainda não faz |
| Apresentação, pág. 10 | Abandono com contexto de viagem | **Parcial.** Ver "O que não dá para entregar honesto hoje" |

## As três decisões que os documentos deixaram para o time de desenvolvimento

### 1. O RFM é calculado, não persistido

A especificação diz explicitamente que persistir ou calcular é decisão de arquitetura (seção 3).
Fica calculado, pela mesma regra do E3.1: **comportamento é derivado da reserva, nunca gravado.**

Uma segunda cópia envelhece calada. Uma reserva cancelada rebaixaria a frequência e a receita da
pessoa, mas a linha gravada continuaria dizendo "campeão" até alguém rodar o recálculo. Aí a
campanha sai para o público errado e ninguém descobre por quê. Calculando, o RF-002 (recálculo
automático) deixa de ser uma rotina para manter e passa a ser uma propriedade.

O custo é honesto: cada consulta varre a base. Enquanto a base for de milhares, isso é barato; o
`staleTime` de 2 minutos no front evita refazer a conta a cada troca de aba. Se um dia a varredura
pesar, o caminho é uma **materialized view com refresh agendado**, e não uma coluna gravada na
tabela do contato: a view mantém uma origem só da verdade.

### 2. Os cortes são quintis, não números fixos

A especificação pede, em letras maiúsculas, para "evitar thresholds arbitrários permanentes"
(seção 4). Então o score sai de `ntile(5)` sobre a própria base.

"R5" quer dizer **"está no quinto mais recente da base"**, uma frase que continua verdadeira
quando a base dobrar. "Menos de 30 dias" não: quando o negócio muda de ritmo, o corte fixo passa a
descrever um mundo que não existe mais, e ninguém percebe porque o número continua saindo.

**A consequência precisa estar escrita, porque ela morde:** o quintil *sempre* preenche as cinco
faixas. Com 6 clientes, alguém vai ser "campeão" por ser o melhor entre 6. Por isso
`marketing_rfm_overview` devolve `totals.eligible` e a tela mostra um aviso enquanto a base for
menor que 25 clientes com compra (`MINIMO_PARA_RFM_CONFIAVEL`). Abaixo disso cada faixa tem menos
de cinco pessoas e o rótulo não se sustenta.

O M entra como terceira dimensão exatamente como a pág. 7 pede: ele não muda a célula, **promove
dentro dela**. Um contato frio com M no topo vira `perdidos_vip`, que é a fila que o dinheiro manda
atender primeiro.

### 3. A janela é parametrizável

`app_setting.marketing_rfm_window_days`, 365 por padrão (seção 11 da especificação). Muda no banco,
sem deploy.

## Marca do veículo: o que o campo é e o que ele não é

O exemplo que o time deu foi "muitos carros importados passaram a dobrar o período de reserva".
Para isso existir, é preciso saber a marca, e o `vehicle.model` é **campo livre digitado**. Na base
real ele chega assim: `PEUGEOT/2008 ALLURE A`, `HONDA/FIT EX FLEX`, `Onix`, `CRETA`,
`VW - VOLKSWAGEN SANTANA CS/CD/CG`.

`split_part(model, ' ', 1)` devolveria `ONIX` como se fosse marca. Então `marketing_vehicle_brand`
casa contra um dicionário de marcas e, quando a marca não foi digitada, contra um dicionário de
modelos conhecidos. Nos 23 veículos da base hoje, acerta 23.

`marketing_vehicle_origin` é **um proxy por marca**: diz se a marca é premium ou sem fábrica no
Brasil. **Não é o dado fiscal de importação do veículo.** Serve para ler comportamento ("quem anda
de marca premium ficou mais tempo"), e o rótulo na tela diz isso, porque um gestor que leia
"importado" como dado de nacionalização vai tirar a conclusão errada. A lista mora num lugar só,
dentro da função, para ser corrigida sem caçar string pelo código.

## Descobertas: por que existe um estado "sem dados"

A tela de descobertas inverte o fluxo do CRM: em vez de o gestor imaginar o público, o banco varre
a base e diz o que mudou.

Cada detector **declara o dado de que precisa**, e o retorno tem três estados, nunca dois:

| Estado | Quer dizer |
|---|---|
| `achado` | Mudou o suficiente para agir |
| `estavel` | Há dado, e ele não mostra mudança |
| `sem_dados` | Falta histórico ou amostra, e o detector diz exatamente o que falta |

Sem o terceiro estado, um detector de tendência sem histórico voltaria vazio, e **vazio se lê como
"não há nada acontecendo"**. É assim que alguém decide sobre um sinal que nunca foi medido. Com
ele, a tela diz "precisa de 180 dias de histórico, hoje há 31".

Comparação de tendência sempre usa **duas janelas iguais e coladas** (os últimos 90 dias contra os
90 anteriores). Comparar contra "a média de sempre" acusaria mudança toda vez que a empresa cresce.

Os oito detectores: duração da estadia por grupo de veículo, quem reserva todo mês, janela provável
de retorno, antecedência da reserva, taxa de 1ª para 2ª reserva, participação por unidade,
concentração em fim de semana e cancelamento concentrado numa unidade.

## O que a base de hoje permite (setembro de 2026)

Medido na base viva antes de escrever o motor, e o número muda a leitura da tela inteira:

- **31 dias de histórico**, em 2 meses de calendário;
- 6 contatos com compra, dos quais **2 com duas ou mais compras**;
- 2 contatos com intervalo médio calculável;
- 45 reservas com veículo, **nenhuma de marca importada**.

Então, hoje, a maioria dos detectores responde `sem_dados`, e isso está correto: "carros importados
dobraram o período" precisa de duas janelas de 90 dias comparáveis, e "reservando todos os meses"
precisa de 3 meses fechados. O motor está pronto e vai começar a responder sozinho conforme a base
cresce, sem deploy nenhum.

O mesmo vale para o RFM: com 6 elegíveis, o painel mostra o aviso de base pequena.

## O que não dá para entregar honesto hoje

**Abandono com contexto de viagem (pág. 10 da apresentação).** A apresentação quer guardar
estacionamento, datas, valor cotado, momento e canal "mesmo sem concluir a compra". Hoje só existe
`booking` em `pending`, que é carrinho com reserva **já criada**: quem desistiu antes disso não
deixa rastro nenhum. Então `abandoned`/`abandoned_check_in`/`abandoned_check_out` saem do `pending`
com viagem futura, e não de um evento de checkout que ainda não é gravado. Entregar o campo como se
fosse abandono de verdade daria ao time uma régua que mede outra coisa.

Para fechar de verdade é preciso um evento de checkout (E3.3), gravando a cotação antes do
`create-booking`.

**Atribuição de receita da campanha (RF-007).** `marketing_message` registra envio e falha, mas não
abertura, clique nem reserva originada. Sem isso, "receita de CRM" seria um número inventado.

## Segurança

Mesmo desenho do E3.1, com a lição da migration `20261027094500` aplicada desde o início:

- os ajudantes (`marketing_contact_metrics`, `marketing_contact_doc`, `marketing_contact_rfm`,
  `marketing_rfm_window_days`, `marketing_vehicle_*`) são `security definer` **sem gate próprio**,
  então têm `execute` revogado de `anon` **e de `authenticated`** (o Supabase concede a
  `authenticated` por privilégio padrão, e `revoke ... from public, anon` não alcança isso);
- as três RPCs de painel (`marketing_rfm_overview`, `marketing_rfm_contacts`,
  `marketing_discoveries`) são chamáveis por `authenticated` e gateadas por `is_hub_admin()`,
  levantando `42501`. Verificado com JWT de cliente real.

## Testes

| O quê | Onde |
|---|---|
| Geometria da matriz, tom da célula, participação, base mínima | `src/features/marketing/rfm.logic.test.ts` (13 casos) |
| Normalização de marca, quintis, promoção pelo M, guarda do segmento de sistema, gate de `hub_admin` | `supabase/tests/marketing_rfm.test.sql` (14 casos) |

Regressão registrada: `tomDaCelula` rodava a escada de calor antes da checagem de risco, e devolvia
"morno" para F4/R1 e "bom" para F5/R2. Pintava de quente exatamente a célula do cliente frequente
que parou de aparecer, que é a que perde dinheiro. O teste que pegou isso está marcado como
regressão no arquivo.

## Em aberto

- Rastrear reserva originada de campanha, para fechar o RF-007.
- Evento de checkout abandonado (E3.3), para o abandono com contexto de viagem valer.
- Flow builder com espera e condição (o desenho da pág. 13) segue como evolução; o
  `CampaignCanvasEditor` já tem a estrutura de nós preparada.
- Parking Customer Score de 0 a 100: só faz sentido depois que a base sustentar o quintil.
