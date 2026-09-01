# Go2Park: transfer com rastreio ao vivo

Como o Hub mostra, no card e na página da unidade, que o transfer daquele estacionamento é
rastreado em tempo real pela Go2Park.

Specs relacionadas: [capacidades-unidade.md](./capacidades-unidade.md) (ADR-009),
[checkout-externo-por-local.md](./checkout-externo-por-local.md),
[customer/search-results.md](./customer/search-results.md),
[partner-onboarding.md](./partner-onboarding.md) (§ cross-sell no onboarding).

## O que é

A **Go2Park** ([go2park.com.br](https://go2park.com.br)) é o produto irmão da Movepark para
operação de transporte. Do lado do passageiro ela entrega três coisas: a van no mapa em tempo
real, aviso de proximidade e acesso pelo navegador, sem instalar app nem criar conta.

Quatro unidades têm o contrato hoje:

| Empresa | Unidade | Destino | `checkout_mode` |
|---|---|---|---|
| Nationpark | `aeroporto-afonso-pena` | Afonso Pena (CWB) | `external` |
| Virapark | `virapark` | Viracopos (VCP) | `external` |
| Garageinn | `aeroporto-viracopos` | Viracopos (VCP) | `external` |
| BePark | `aeroporto-confins` | Confins (CNF) | `external` |

Nenhum vizinho de aeroporto oferece o mesmo, então este é o diferencial comparativo dessas
unidades na vitrine: quem escolhe entre quatro cards no mesmo aeroporto vê um só com o selo.

A BePark entrou em 01/09/2026, junto com o cadastro da unidade. Ela é o caso em que o selo
custa menos para ganhar: é a **única** unidade parceira em Confins, um destino que até então só
tinha lote mapeado, então o diferencial não disputa com vizinho nenhum. `go2park_whatsapp`
nasceu nulo, como nas outras três, e o bloco fica sem CTA até alguém copiar o número do painel
da Go2Park.

## Modelo

| Coluna | Para quê | Migration |
|---|---|---|
| `go2park_enabled boolean not null default false` | A unidade tem o contrato: liga o selo e o bloco | `20261026090000_location_go2park.sql` |
| `go2park_whatsapp text` (E.164, nulo por padrão) | Número da van desta unidade: liga o CTA de contato | `20261026140000_location_go2park_whatsapp.sql` |

**Por que coluna e não amenidade.** Amenidade sairia no card como pílula cinza entre "Câmeras" e
"24 horas", que é o oposto do destaque que o diferencial pede; e amenidade é editável pelo
parceiro (`operator_set_location_amenities`), enquanto o contrato com a Go2Park é comercial da
Movepark.

**Quem liga e desliga.** Só `hub_admin`, pelo diálogo **Configuração da unidade** em
`/manager/companies/:id/locations` (botão "Plataforma"), que reúne os dois campos que a Movepark
define sozinha: o modo de checkout (E0.14) e a Go2Park. A coluna **Plataforma** da tabela mostra
os dois selos, então dá para ver quem tem contrato sem abrir nada.

A permissão não depende da tela. O trigger `location_go2park_guard` recusa quem não é `hub_admin`,
pela mesma razão de `location_checkout_mode_guard`: com `locations:write` o parceiro ligaria o selo
por PostgREST sem passar por tela nenhuma. Sem JWT (service role, migration, seed) passa, que é
como o seed das três primeiras unidades roda, e como a BePark foi ligada no cadastro.

**Desligar importa tanto quanto ligar.** Contrato encerrado com o selo no ar vira promessa falsa
no card e na página, então o caminho de desligar é testado junto com o de ligar
(`LocationPlatformDialog.test.tsx`) e o ciclo inteiro, do clique ao selo sumindo da tabela, em
`routes/manager/locations.test.tsx`. Esse teste nasceu de um bug real: o diálogo recebia um
retrato da linha congelado no clique, então gravava no banco e continuava mostrando o valor
velho. Hoje a linha é derivada da lista já carregada, que a mutation invalida.

## O contato da van

Mostrar o diferencial não basta: falta o cliente conseguir chamar a van no dia. O bloco fecha com
dois caminhos, quando há número cadastrado.

**Salvar o contato** (principal) baixa um `.vcf` com o nome "Van &lt;Empresa&gt; · &lt;Unidade&gt;". A pessoa
abre esta página dias antes de viajar e precisa da van quando pousa; salvar agora atravessa essa
distância, porque no aeroporto ela procura "Van" na agenda em vez de procurar a reserva, o e-mail
ou o site. O arquivo é montado no clique (Blob), e não num `data:` URI, que é justamente o que o
Safari do iPhone trata mal. Lógica pura em `vcard.ts`, com teste.

**Abrir no WhatsApp** (secundário) é âncora comum `wa.me`, para quem já está no estacionamento.
Sendo `<a>`, sobrevive a página sem JS.

**Cada unidade tem o seu número, e ele mora no painel da Go2Park.** Até existir integração, alguém
copia de lá para `location.go2park_whatsapp` pelo diálogo do Manager. Enquanto está vazio o bloco
existe sem CTA: mandar quem acabou de pousar para o telefone de outro lote é pior do que não
oferecer botão. O banco recusa qualquer coisa fora do E.164 (constraint
`location_go2park_whatsapp_e164`), porque texto livre aqui vira link quebrado no pior momento.

**Por que não reusar `location.phone`:** aquele é o telefone da portaria, canal da garantia de vaga
([spot-guarantee.md](./spot-guarantee.md)), e a base legada já registra confusão nessa linha, com
Nationpark e Abbapark exibindo o número do Virapark. Nas três primeiras unidades com Go2Park a
`phone` está nula, então nem serviria de ponto de partida. A BePark tem `phone` preenchida
(+55 31 99559-0090, a que o white-label declara), e ainda assim ela não vira o contato da van:
é o número do balcão, e quem acabou de pousar precisa falar com quem dirige.

## ADR-009: é fato, não promessa

O rastreio da van **não** passa por `getLocationCapabilities`. Ele descreve o serviço do lote,
como endereço, foto e frequência do transfer, e continua verdadeiro independentemente de onde a
reserva fecha. Passar o bloco pelo gate de capacidade apagaria o diferencial exatamente das
unidades que o têm, porque todas elas são de checkout externo.

O teste que trava isso é `src/routes/listing.capabilities.test.tsx` (bloco "Go2Park na single"):
um caso exige o bloco na unidade externa, o outro exige a ausência dele na unidade sem contrato.

## Superfícies

| Onde | Componente | O que aparece |
|---|---|---|
| Card de busca, home e destino | `Go2ParkLiveBadge` | Faixa navy no corpo do card, acima das amenidades: ponto pulsante, "Transfer ao vivo · Go2Park" e "Acompanhe a van pelo celular" |
| Página da unidade, cabeçalho | `Go2ParkLiveChip` | Chip navy na linha de metadados, ao lado do tempo de transfer |
| Página da unidade, "Como chegar" | `Go2ParkLiveBlock` | Painel navy depois da frequência do transfer e antes do mapa: título, explicação, os três pontos do serviço e, com número cadastrado, o contato da van |

Tudo em `src/features/go2park/Go2ParkLive.tsx`, com a copy num único objeto `GO2PARK_COPY`.

**Por que a faixa fica no corpo do card, e não sobre a imagem.** O topo da imagem já é dos selos
comparativos ("Mais barato", "Mais perto") e o rodapé é da escassez ("Faltam 2 vagas"). Um
terceiro selo ali viraria ruído e derrubaria o teto de 2 badges de
[search-results.md](./customer/search-results.md). O corpo do card também é onde o fundo navy
mais contrasta, porque o resto é branco com pílula cinza.

O `ParkingCard` ganhou a prop `highlight`, que é o slot genérico desse tipo de destaque. O card
segue puramente apresentacional: quem decide se o destaque existe é o adaptador da superfície
(`ResultCard`, `PopularOfferCard`).

**Cor.** O painel usa `mp-navy` e o ponto de "ao vivo" usa `mp-teal`, dois tokens do sistema. A
identidade da Go2Park (azul `#1A6EF4`, lima `#A4E633`) fica de fora de propósito: o Hub tem uma
marca e três superfícies, e injetar a paleta de outro produto quebraria isso por um bloco só.

## Caminho do dado

| Superfície | Fonte | Campo |
|---|---|---|
| `/search` e `/destinos/<slug>` | Edge `search` | `location.go2park` (mapeado de `go2park_enabled`) |
| Home ("os mais reservados") | PostgREST em `usePopularOffers` | `location.go2park` |
| `/p/<empresa>/<unidade>/<tipo>` | PostgREST em `fetchListing` | `location.go2park_enabled` + `go2park_whatsapp` |

Ausência é lida como `false` nas três: prometer rastreio que a unidade não tem é pior que deixar
de mostrar o que ela tem.

## Copy

Fixada em `GO2PARK_COPY`. O bloco descreve só o que o produto entrega segundo a própria Go2Park:
mapa em tempo real, aviso de proximidade e acesso sem app. Não afirma canal ("você recebe no
WhatsApp"), porque o canal varia por unidade e não está modelado aqui. Também não afirma que
nenhum concorrente tem o mesmo: é verdade hoje, seria falso no dia em que um vizinho contratar, e
a diferença já fica visível pelo card ao lado sem o selo.

O nome do produto se escreve **Go2Park** em toda superfície, e um teste em
`Go2ParkLive.test.tsx` recusa `GO2PARK`, `go2park` e `Go 2 Park` no texto renderizado.

## O que ficou de fora

- **Filtro "transfer ao vivo" na busca.** Com três unidades em dois aeroportos, o filtro
  esvaziaria a lista mais do que ajudaria. Quando virar filtro, o campo já está no resultado da
  Edge.
- **Integração com a Go2Park.** O número é copiado à mão do painel deles. Uma API (ou um
  webhook de mudança) tiraria o passo manual e evitaria número velho no ar quando a unidade trocar
  de linha. Enquanto não existe, o campo é a fonte, e o valor errado é responsabilidade de quem
  copiou.
- **O acionador legado.** Existe um `wa.go2park.com.br/call/<slug>` no fluxo de atendimento (ver
  [knowledge-base-rag.md](./knowledge-base-rag.md)), mas o slug não está modelado no Hub. O número
  em E.164 resolve o mesmo com um dado só, e é o que a integração vai substituir.
