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

Três unidades têm o contrato hoje:

| Empresa | Unidade | Destino | `checkout_mode` |
|---|---|---|---|
| Nationpark | `aeroporto-afonso-pena` | Afonso Pena (CWB) | `external` |
| Virapark | `virapark` | Viracopos (VCP) | `external` |
| Garageinn | `aeroporto-viracopos` | Viracopos (VCP) | `external` |

Nenhum vizinho de aeroporto oferece o mesmo, então este é o diferencial comparativo dessas
unidades na vitrine: quem escolhe entre quatro cards no mesmo aeroporto vê um só com o selo.

## Modelo

`location.go2park_enabled boolean not null default false` (migration
`20261026090000_location_go2park.sql`).

**Por que coluna e não amenidade.** Amenidade sairia no card como pílula cinza entre "Câmeras" e
"24 horas", que é o oposto do destaque que o diferencial pede; e amenidade é editável pelo
parceiro (`operator_set_location_amenities`), enquanto o contrato com a Go2Park é comercial da
Movepark.

**Quem liga.** Só `hub_admin`. A regra mora no banco, no trigger `location_go2park_guard`, pela
mesma razão de `location_checkout_mode_guard`: com `locations:write` o parceiro ligaria o selo
por PostgREST sem passar por tela nenhuma. Sem JWT (service role, migration, seed) passa, que é
como o próprio seed das três unidades roda.

## ADR-009: é fato, não promessa

O rastreio da van **não** passa por `getLocationCapabilities`. Ele descreve o serviço do lote,
como endereço, foto e frequência do transfer, e continua verdadeiro independentemente de onde a
reserva fecha. Passar o bloco pelo gate de capacidade apagaria o diferencial exatamente das três
unidades que o têm, porque as três são de checkout externo.

O teste que trava isso é `src/routes/listing.capabilities.test.tsx` (bloco "Go2Park na single"):
um caso exige o bloco na unidade externa, o outro exige a ausência dele na unidade sem contrato.

## Superfícies

| Onde | Componente | O que aparece |
|---|---|---|
| Card de busca, home e destino | `Go2ParkLiveBadge` | Faixa navy no corpo do card, acima das amenidades: ponto pulsante, "Transfer ao vivo · Go2Park" e "Acompanhe a van pelo celular" |
| Página da unidade, cabeçalho | `Go2ParkLiveChip` | Chip navy na linha de metadados, ao lado do tempo de transfer |
| Página da unidade, "Como chegar" | `Go2ParkLiveBlock` | Painel navy depois da frequência do transfer e antes do mapa: título, explicação e os três pontos do serviço |

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
| `/p/<empresa>/<unidade>/<tipo>` | PostgREST em `fetchListing` | `location.go2park_enabled` |

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
- **Chamar a van pela página.** Existe um `wa.go2park.com.br/call/<slug>` no fluxo legado de
  atendimento (ver [knowledge-base-rag.md](./knowledge-base-rag.md)), mas o slug não está
  modelado no Hub e um link quebrado no momento do embarque custa mais do que o link resolve.
- **Interruptor no Manager.** Hoje o campo se liga por migration ou SQL. Com três unidades e um
  time que fecha o contrato caso a caso, a tela ainda não se paga; a permissão já está no banco
  para quando ela existir.
