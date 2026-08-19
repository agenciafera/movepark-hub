## 🔒 REGRA DE ARQUITETURA: vale para todo o projeto (não violar)
> Claude Code: trate este bloco como regra fixa do projeto (ADR), não como sugestão.
> Se algo conflitar, siga esta regra e sinalize.
> **ADR-009 · Promessa de transação renderiza por capacidade, nunca por template:** nenhum bloco que prometa cancelamento, alteração, tarifa, cupom, serviço extra, avaliação ou vaga garantida pode renderizar incondicionalmente. Todos leem de `getLocationCapabilities(location)`, cuja fonte primária é `location.checkout_mode`. Fato da unidade (endereço, fotos, amenidades, shuttle) renderiza sempre. Asterisco ou disclaimer que contradiga bloco visível é proibido: se a unidade não entrega, o bloco não existe.
> Canônico: gestao/regras-arquitetura.md

# Capacidades da unidade (E0.15)

> **Épico:** E0.15 · **Fase:** 0 · **ADR:** 009 · **Q vinculados:** Q-017, Q-018, Q-019

## O problema

A casca da página de unidade promete cancelamento, tarifa flexível, cupom, avaliação, vaga
garantida e responde FAQ genérica. Para unidade própria é verdade. Para unidade de saída
externa, não é, e quem anunciou foi a Movepark.

**O problema não é o discurso, é onde a promessa mora.** Uma promessa que existe por default
é uma promessa que não se consegue desligar por unidade.

## A linha que organiza

**Fato da unidade** fica sempre: endereço, fotos, distância, shuttle, coberto ou descoberto,
24 horas, amenidades. Descreve o lugar e é verdade independente de onde a reserva fecha.

**Promessa de transação** sai quando o checkout é externo: quem cumpre é o parceiro.

## Mapa bloco a bloco

| Bloco | Própria | Externa | Modelagem |
|---|---|---|---|
| Amenidades, fotos, endereço, shuttle | mostra | **mostra** | `amenity`, `location` |
| Preço | motor do Hub | tabela espelhada, com data | `pricing_rule` / `pricing_tier` (E0.13) |
| Tarifas Flex e Superflex | mostra | **não renderiza** | `fare` |
| Cancelamento e alteração | mostra | **não renderiza** | benefícios da `fare` |
| Cupom de desconto | mostra | **não renderiza** | `coupon.company_id` |
| Serviços extras | mostra | **não renderiza** | `location_add_on_service` |
| Avaliações e nota | mostra | **não renderiza** | `review.booking_id` |
| Avaliações do Google | mostra | **mostra** | `google_place_snapshot` |
| Transfer com rastreio ao vivo (Go2Park) | mostra | **mostra** | `location.go2park_enabled` (ver [go2park-transfer-ao-vivo.md](./go2park-transfer-ao-vivo.md)) |
| Vaga garantida | mostra | **não renderiza** | depende de o Hub controlar disponibilidade |
| FAQ | global + da unidade | **só escopo da unidade** | `faq.scope` + `location_id` |

**A avaliação do Google é fato da unidade, não promessa de transação.** Reputação descreve o
lugar e é verdade independente de onde a reserva fecha, igual a endereço, foto e amenidade. Por
isso o bloco renderiza também na unidade externa, e é assim que ele preenche o vazio que a linha
acima deixa. `LocationCapabilities` não ganha capacidade nova, porque não há promessa a declarar.
A nota continua fora do `aggregateRating` do JSON-LD. Ver
[avaliacoes-google.md](./avaliacoes-google.md).

Dois detalhes que economizam trabalho:

**O FAQ já é escopável.** `faq_scope` tem `global`, `location`, `destination`. Basta excluir
o escopo global nas externas. Zero mudança de schema.

**As avaliações se resolvem sozinhas.** `review` está amarrado a `booking_id`, e unidade
externa não gera booking no Hub. O cuidado é a casca não renderizar bloco vazio nem chip de
nota, senão parece nota zero.

**Vaga garantida é inegociável.** É promessa de desempenho sobre capacidade que o Hub não
controla. Cliente chega, não tem vaga, e a página dizia garantida.

## Como ficou (05/08/2026)

| Peça | Onde |
|---|---|
| Lista canônica | `src/features/listing/capabilities.ts` (`LocationCapabilities`, `getLocationCapabilities`) |
| Link de saída com as datas | `src/features/listing/externalCheckout.ts` (`withSearchDates`) |
| Consumo bloco a bloco | `src/routes/listing.tsx` e `src/features/listing/ReservationCard.tsx` |
| Trava do ADR | `src/routes/listing.capabilities.test.tsx` (render real da página, nos dois modos) |

**Unidade externa opera na Básica, e o seletor não aparece.** A Tarifa efetiva é fixada na
grátis quando `caps.fares` é falso, e não é o acréscimo que é zerado em cada consumidor. A
diferença importa: o seletor sumiu antes de a Tarifa sumir, o default `flex` continuou somando,
e a single do Virapark mostrou Estacionamento R$ 161,10 com Total R$ 174,00. Fixar a tarifa
fecha isso na origem, para a próxima tela que ler a tarifa não repetir o erro.

**O card de reserva é podado, não substituído.** Datas, preço e a tabela por duração **ficam**
na unidade externa: preço é informação da unidade (espelhada da tabela do parceiro, E0.13) e é o
que faz a pessoa decidir. Some o que a Movepark não cumpre: seletor de tarifa, cupom, extras,
passageiros, PCD e o selo de cancelamento. O botão vira link de saída e só destrava com as datas
escolhidas, para o link nunca sair pela metade.

A primeira versão desta entrega trocava o card inteiro por um card de saída enxuto, e isso
estava errado: jogava fora o seletor de datas e o preço, que o mapa manda manter.

**A trava é de render, não de leitura de código.** O que vincula a Movepark é o que o cliente
vê, então o teste monta a página inteira nos dois modos e afirma que nenhuma promessa sobrevive
na externa. Selo novo posto direto na casca quebra ali, mesmo que o código pareça correto.

**O JSON-LD acompanha a tela.** Nota e FAQ global saem do schema junto com os blocos. Sem isso o
Google exibiria no resultado de busca uma avaliação que a página não mostra, e o ADR-009 vale
para o que a Movepark publica, não só para o que renderiza.

> ⚠️ **Isto valeu só pela metade até 12/08/2026, e a correção está descrita no fim deste
> arquivo.** O array `review[]` era gateado; o `aggregateRating`, a `offers` e a `description`
> não eram.

**O upsell de upgrade de vaga sai também.** Ele empurra para outro tipo de vaga que igualmente
fecha fora, com preço que o Hub não cobra.

**Default permissivo.** `checkout_mode` ausente lê como `hub`. A coluna nasceu com esse default
e quase toda unidade é nativa; ler ausência como "sem capacidade" apagaria a página delas no
primeiro select que esquecesse o campo.

**O que ficou fora desta entrega:** o marcador no card de busca (o `search` não devolve
`checkout_mode` hoje, e mexer nele é escopo próprio), a delimitação da copy de plataforma (card
próprio) e o prazo de validade da exceção.

## Implementação

Um objeto tipado, fonte única, não booleanos espalhados:

```ts
getLocationCapabilities(location) → {
  fares, cancellation, dateChange, coupons, addOns,
  reviews, guaranteedSpot, globalFaq, hubCheckout
}
```

`checkout_mode = 'external'` derruba o conjunto de uma vez, com espaço para exceção explícita
(uma unidade própria pode não aceitar cupom).

**Trava contra decaimento:** um teste que falha se um bloco de promessa renderizar sem
consultar a capacidade. Sem isso, em três sprints alguém adiciona um selo direto na casca e o
problema volta calado.

## Declaração de responsabilidade

Não é asterisco nem rodapé. É informação positiva no ponto de decisão, perto do CTA.

**Texto escolhido em 05/08/2026, ainda para validação jurídica (Q-017):**

> A reserva desta unidade é feita e administrada pelo [Nome], no site dele. Cancelamento,
> alteração e atendimento durante a estadia seguem as condições do [Nome]. As garantias da
> Movepark não se aplicam a esta reserva.

Foi preferida à versão curta, que parava em "as condições são definidas por ele", porque
**nomear o que deixa de valer é o que o art. 54 §4 pede**: cláusula restritiva exige destaque.
Deixar o cliente inferir sozinho que a garantia lida na home não vale aqui é a omissão que o
art. 37 §3 trata como enganosa. Custa mais comercialmente e é a escolha certa.

Isso é diferente de "você está saindo do Movepark": não cria fricção nem tela intermediária.
A regra é **silêncio na transição, clareza na política**.

## A promessa também mora fora da single

Declaração na unidade **não cura** promessa feita antes dela. Quem chega pela home já leu, em
nome da Movepark: "Preço garantido, cancelamento grátis e voucher na hora" (banner de CTA),
"Preço garantido até a saída" (faixa de confiança), "Vaga garantida" (como funciona), além de
`/como-funciona`, `/sobre` e a política inteira em `/cancelamento`. A oferta vincula o
fornecedor como um todo (art. 30), não bloco a bloco.

**Decidido em 05/08/2026:** as páginas de garantia ganham delimitação de escopo, não asterisco.
Asterisco que contradiz bloco visível é o que o ADR-009 proíbe. Texto:

> Estas condições valem para reservas fechadas na Movepark. Algumas unidades fecham a reserva
> no site do próprio estacionamento, e nelas valem as condições do parceiro, informadas na
> página da unidade.

Isso é trabalho de copy de plataforma, **fora do escopo da E0.15**, e precisa de card próprio.

**Uma dessas promessas caiu em 14/08/2026: o diálogo do card de atendimento na faixa de
confiança.** A ilustração do card "Ajuda a qualquer hora" simulava uma conversa em que o suporte
respondia "Sim! Sua vaga fica garantida por 3h após o horário previsto". É vaga garantida com
prazo cravado, a promessa que este documento chama de inegociável, renderizada para toda a base
numa data em que **nenhuma** unidade fecha reserva no Hub. O diálogo agora para em "Te explico
agora as condições da sua reserva", que é o que o próprio card promete no subtítulo.

O `aria-hidden` da ilustração não salvava: ele tira o texto da árvore acessível, não da tela, e
quem enxerga lê. Foi por isso que a trava nova (`src/features/home/TrustBand.test.tsx`) afirma
sobre `container.textContent` em vez de `getByText`. Verificado que ela falha com a copy antiga.

**Resolvido em 19/08/2026: o card de copy de plataforma que faltava.** "Vaga garantida" no popup
de `HowItWorks`, "Preço garantido, cancelamento grátis e voucher na hora" no `CtaBanner`, "Preço
garantido até a saída"/"Cancelamento grátis" na faixa de confiança, os selos do `Hero` e o H1 e a
meta description de `/como-funciona` e `/sobre` saíram do ar. O pedido veio de negócio: hoje 9
unidades publicadas ainda estão em `checkout_mode = 'hub'` (não é mais verdade que a base inteira
é externa), mas a maioria já não é, e prometer sem condição numa página que qualquer busca pode
levar para uma unidade externa é o mesmo problema que este documento já descrevia.

A tática variou por superfície, e não é aleatória: **selo curto (badge, pill, estatística,
manchete) não tem como carregar uma ressalva sem virar o asterisco que o ADR-009 proíbe**, então
ali a promessa foi **removida** e trocada por algo verdadeiro para toda a base hoje (comparação,
verificação, "sem taxa da Movepark", que é literal: o cliente nunca paga taxa própria da
Movepark). **Texto longo** (FAQ, `/cancelamento`, a seção "Garantias" de `/como-funciona`) recebeu
a **delimitação de escopo** que este documento já tinha decidido em 05/08/2026 ("Estas condições
valem para reservas fechadas na Movepark…"), porque ali cabe a frase inteira e apagar tudo seria
mentir para o cliente das 9 unidades que ainda reservam no Hub. `JOURNEY_COMPARISON` e
`JOURNEY_STATS` (`src/features/how-it-works/journey.ts`) entraram no primeiro grupo, por serem
selo/linha de tabela, não prosa.

O achado abaixo (48h vs. 24h) foi reconferido nesta mesma revisão e **não reproduziu**: nenhum
texto atual de `/como-funciona` ou `/cancelamento` cita 48h. Ou já tinha sido corrigido antes desta
revisão, ou a citação original já estava desatualizada. Mantido aqui só como histórico.

## Card de busca

Unidade externa aparece nos resultados como qualquer outra. **Decidido: testar um marcador
curto** ("Reserva no site do parceiro"), com a ressalva de que o card já é denso e poluí-lo
custa conversão em todas as unidades, não só nas externas. Se o teste mostrar ruído, o marcador
sai e a declaração da single passa a ser o único ponto de informação.

## Dois pontos que a navegação da single resolveu (05/08/2026)

**Avaliações somem, mesmo as históricas.** O Virapark exibe "5,0 · 1 avaliação", de uma estadia
de julho. Ela é real, mas veio de reserva feita durante os testes do Hub. Quando a single passar
a se comportar como unidade externa, o bloco não renderiza: os componentes de avaliação são de
unidade própria. Não é caso de exceção por histórico.

**O selo "Verificado" é constante, não configuração.** Não existe campo no Manager: em
`src/routes/listing.tsx` ele é `badge: true` fixo, e o `OperatorCard` também renderiza "Operador
verificado" sempre. Como todo parceiro é verificado pela Movepark, hoje é verdade. Pelo critério
do ADR-009 ele **fica**, porque endossa o parceiro e não promete condição de transação. Se um dia
existir parceiro não verificado, isso vira campo antes de virar problema.

## O gate vazou pela superfície que ninguém vê (12/08/2026)

Por um ano as nove unidades externas publicaram, em `<meta name="description">` e no JSON-LD,
exatamente as promessas que a tela ao lado negava:

```
"Vaga Coberta no Virapark, em Virapark. A partir de R$ 0,00 por diária.
 Cancelamento grátis até 24h antes do check-in. Nota 5,0 de 5 em 1 avaliação."
"offers": { "price": "0.00", "availability": "https://schema.org/InStock" }
"aggregateRating": { "ratingValue": 5, "reviewCount": 1 }
```

Quatro afirmações, todas falsas naquela unidade: a Movepark não cancela, a nota é justamente a
que a página esconde (há teste de render para isso desde 05/08), a vaga não é controlada por nós
e R$ 0,00 não é preço nenhum.

**Por que passou:** o teste do gate procura texto **visível**, com `screen.queryAllByText`, e essa
escolha está documentada logo acima como acerto, porque é o que o cliente lê que vincula. O ponto
cego é que promessa publicada vincula sem ser lida na tela. O resumo (`buildListingTldr`) e o
schema (`productOfferSchema`) não renderizam nada, então o gate nunca os alcançou. Pior: o
`review[]` era gateado e o `aggregateRating` não, o que dava um schema com nota agregada e nenhuma
avaliação por trás.

**O que mudou:**

- As duas funções leem `getLocationCapabilities` **por dentro**, da própria `listing`, em vez de
  receber capacidade por parâmetro. Quem chama não tem como esquecer.
- Preço passa por `showcaseFromPrice`, o mesmo helper do card. Sem preço, o resumo omite a frase e
  o schema omite a `offers` inteira, porque `Offer` sem `price` é inválida para o Google e oferta
  muda seria pior que oferta ausente.
- `availability: InStock` virou a capacidade `guaranteedSpot`: afirmar estoque de vaga que o
  parceiro controla é a mesma promessa de vaga garantida, só que em dado estruturado.
- No lugar do que saiu, entra o que é verdade: "A reserva é feita e administrada por X.", que é o
  que o card visível já dizia. Para uma IA que leia só o resumo, é a informação que decide com
  quem a pessoa vai falar se precisar cancelar.

**O teste agora afirma sobre o que a página publica**, não só sobre o que ela mostra: um helper
`publicado()` junta a meta description e todos os blocos de JSON-LD, e os casos rodam nos dois
modos. O contraponto na unidade própria é parte do gate, para que o conserto não vire apagão de
SEO na maioria da base. Verificado que os 12 casos novos falham sem o fix, e que o caso antigo de
texto visível continua passando sem ele, que é a medida exata do ponto cego.

## O conserto deixou a casca, e a casca era inválida (19/08/2026)

O Search Console reprovou `/p/aeropark/aeroporto-guarulhos/covered` com **"Especifique
`offers`, `review` ou `aggregateRating`"**. Não foi o checkout externo que quebrou o formato: foi
o gate acima que tirou as três propriedades e manteve o nó.

O que sobrou na página, palavra por palavra:

```json
{ "@context": "https://schema.org", "@type": "Product",
  "name": "Vaga Coberta · Aeroporto de Guarulhos",
  "description": "...", "image": [...] }
```

`Product` precisa de **uma** entre `offers`, `review` e `aggregateRating` para ser um item válido.
Com as três gateadas, o nó não fica incompleto: fica **inválido**, e o Google descarta a página
do rich result e acusa erro. As duas condições se somam em toda unidade externa:

- **`offers`** sai porque `company_parking_type.base_price = 0` nas dezessete linhas espelhadas, e
  `showcaseFromPrice` recusa zero (decisão de 12/08, correta e mantida).
- **`aggregateRating` e `review`** saem porque `caps.reviews` é falso no checkout externo.

**As dezessete URLs de `sitemap-unidades.xml` são todas de checkout externo**, então o erro valia
para 100% das páginas de unidade indexadas, e não só para a que o Search Console mostrou.

**A correção é não publicar o nó.** `productOfferSchema` devolve `null` quando não sobra nada que
qualifique, e a rota deixa de emitir o `<script>`. Nada de SEO se perde: item inválido já não
rendia rich result nenhum. O que descreve o lugar continua publicado no
`LocalBusiness`/`ParkingFacility` ao lado, que não exige oferta, junto de `BreadcrumbList` e
`FAQPage`. Preencher o campo com preço ou nota do parceiro seria reabrir exatamente o que o
ADR-009 fechou.

Duas instâncias latentes do mesmo defeito foram fechadas junto, antes de aparecerem no relatório:
na vitrine do destino (`destinationOffersSchema`), parceiro sem preço na matriz do build virava
`Product` mudo e agora entra como `ParkingFacility`; na página de preços, linha sem preço em
nenhuma duração saía com `lowPrice: "Infinity"` (`Math.min()` de lista vazia) e agora fica fora
da lista, seguindo visível na tabela.

Dois defeitos vizinhos entraram no mesmo passe: `image` publicava o caminho relativo do legado
(`/Estacionamentos/...`), que o buscador não resolve em JSON-LD, e o `BreadcrumbList` da unidade
chamava a home de **"House"**, resíduo da troca de ícones Lucide→Phosphor que renomeou uma string
junto com os componentes. Todas as outras páginas usam "Início".

## A oferta existia; era o campo que estava errado (19/08/2026)

Apagar o nó consertava o erro do Search Console jogando fora um dado que a Movepark tem. **As
dezessete unidades têm preço**, e o motor devolve os quatro pontos da tabela para todas elas. O
que não tem preço é `company_parking_type.base_price`, campo de catálogo que ninguém preencheu
na unidade espelhada e que **`simulate_price` sequer lê**: o preço mora em `pricing_rule` mais as
faixas. Ler `base_price` para decidir se existe oferta era perguntar para a coluna errada.

**A oferta passou a vir do motor.** `fetchPriceShowcase` consulta `simulate_price` nas durações de
referência (1/7/15/30, as mesmas de `destination_price_index`), converte total em diária e devolve
a faixa. Roda **no loader**, e não só no cliente, pelo mesmo motivo do FAQ: preço que só existe
depois do JS não entra no HTML do build, e nem o schema nem o "a partir de" apareceriam para quem
lê o HTML cru.

**`AggregateOffer`, e não `Offer`.** A tabela é escalonada e a diária varia de verdade: no valet da
Aerovalet em Guarulhos vai de R$ 119,20 em 1 diária a R$ 21,12 em 30. Um preço só cravaria uma
duração e calaria sobre as outras três. Duração sem preço (estadia mínima do parceiro) some da
faixa em vez de derrubá-la: é ausência de oferta naquela janela, não oferta de graça.

**O mesmo número alimenta a tela.** O card lia `base_price` para o "a partir de" e por isso a
unidade espelhada não mostrava preço nenhum antes das datas. Agora a menor diária da faixa manda
e `base_price` é reserva, então a página publica `"lowPrice": "25.90"` e mostra "A partir de
R$ 25,90" no mesmo HTML. O espelho que o ADR-009 pede deixa de depender de disciplina e passa a
ser consequência da fonte única.

**O que continua fora:** `availability: InStock`. Afirmar estoque é prometer vaga garantida, e
quem controla a vaga da unidade externa é o parceiro. Preço é fato da unidade; estoque é promessa
de transação. Verificado no build: as 17 páginas emitem `AggregateOffer` e nenhuma emite `InStock`.

Preencher `base_price` no banco foi considerado e descartado: é seguro para o motor (ele não lê o
campo), mas cria segunda fonte de verdade. O parceiro muda a tabela, o `base_price` fica velho e o
schema passa a mentir sem ninguém ver, que é a forma mais cara desse bug voltar.

O `null` de `productOfferSchema` continua, agora como rede: sem faixa, sem `base_price` e sem nota,
o nó não é publicado.

## Base legal (não é parecer; levar ao jurídico)

Oferta vincula o fornecedor (CDC art. 30); omissão relevante é publicidade enganosa (art. 37
§3); cláusula restritiva exige destaque, não rodapé (art. 54 §4); solidariedade na cadeia
(art. 7 § único e art. 25 §1). Asterisco não transfere responsabilidade: documenta que se
sabia da divergência.

