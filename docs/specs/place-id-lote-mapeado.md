# Place ID dos lotes mapeados (E0.17-i)

> **Épico:** [E0.17](https://app.clickup.com/t/86ajyp580) · **Fase:** 0 · **Relacionado:** D-009, ADR-010
> **Status:** executado em 14/08/2026. 53 de 63 fichas com `google_place_id`, 39 publicadas.
> Este arquivo é o registro do método e dos achados. Repetir daqui quando entrar um lote novo em volume.

## Por quê

62 fichas entraram em `prospect_location` a partir de uma pesquisa de prospecção, com coordenada
geocodificada pelo OpenStreetMap em vez da Places API. Precisão de rua, não de porta: `The Parking`
(CGH) ficou a 5,5 km do Congonhas e `Foco Park` (REC) a ~2 km do endereço real. Nenhuma tinha
`google_place_id`, que é a chave de que a deduplicação do D-009 depende.

## A trava de credencial

A chave do projeto (`VITE_GOOGLE_MAPS_API_KEY`) é **restrita por referrer HTTP** e recusa chamada de
servidor:

```
403 · API_KEY_HTTP_REFERRER_BLOCKED · "Requests from referer <empty> are blocked"
```

Isso está **correto** e não deve ser mudado: a chave vai no bundle do navegador, então o referrer é
a única proteção que ela tem.

**O que funcionou:** rodar as buscas **a partir de uma aba em `https://hub.movepark.co`**, que é
origem autorizada. Sem chave nova, sem mudar restrição, sem `Referer` forjado (que anularia o
controle). Para repetir, é colar o script no console da página.

Alternativa se o volume crescer: chave separada com restrição por IP, usada por um script Node e
apagada em seguida.

## O contrato

Places API (New), `searchText`, com `locationBias` na coordenada provisória:

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-Api-Key: <KEY>
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,
                  places.businessStatus,places.primaryType,places.rating,places.userRatingCount

{ "textQuery": "<nome>, <endereço>", "languageCode": "pt-BR", "regionCode": "BR",
  "maxResultCount": 3,
  "locationBias": { "circle": { "center": {...}, "radius": 5000 } } }
```

## Critério de aceite

Um match errado é pior que nenhum: publica um lote com o nome de um lugar e o pino de outro.
Aceitar só com `businessStatus == "OPERATIONAL"`, tipo de estacionamento, e:

| Similaridade de nome | Distância tolerada |
|---|---|
| ≥ 0.85 (contém ou idêntico) | ≤ 15 km |
| ≥ 0.60 | ≤ 3 km |

**A tolerância larga para nome forte não é folga, é correção de premissa.** Na primeira passada,
`Park Confins`, `Decolar Park` e `Connect Park` foram rejeitados por distância — e quem estava
errado era o pino do OSM, não o Google. Distância só vale como sinal quando o nome é fraco.

`primaryType` precisa incluir **`park_and_ride`** além de `parking_lot` e `parking_garage`. O
Connect Park (CWB) foi rejeitado por um regex `/parking/` que não pegava esse valor.

Quando o match é aceito, **o endereço do Google substitui o nosso** (o do Talentos Park que tínhamos
estava errado). O **nome, não**: o Google traz "Fulano Park - Estacionamento Aeroporto", que polui a
listagem. Nome é decisão editorial.

## Resultado

**53 de 63 com Place ID · 39 publicadas · 14 retidas · 10 sem match.**

A verificação se pagou. Achados que só apareceram por causa dela:

- **`Arai Park` (CGH) está `CLOSED_TEMPORARILY`.** Tem página no WordPress hoje, ou seja, havia um
  lote fechado sendo anunciado.
- **`Facility` (CGH)** resolveu para "Estapar estacionamento aeroporto": é o **pátio oficial**, não
  um lote privado.
- **`Market Park` (VIX)** resolveu para "Quality Hotel Aeroporto Vitória". O diretório de origem
  listou um hotel como estacionamento.
- **Os três leads de Brasília falharam.** "Big Estacionamento" é o Urban Mall, "Aero Park" trouxe um
  DF Park a 12 km, "DF Park" trouxe um estacionamento público. BSB ficou com zero publicado, o que é
  coerente com a suspeita de que aqueles nomes eram ruído de diretório.
- **`MultiPark` e `Bandeira Park` (GRU) têm coordenada idêntica** com Place IDs distintos. O Bandeira
  ficou retido para não renderizar dois cards no mesmo pino.

## ⚠️ A guarda do D-009 está cega

A checagem de colisão contra `location.google_place_id` rodou e voltou vazia — **porque nenhuma das
20 unidades parceiras tem `google_place_id` preenchido**. Zero de 20.

Enquanto isso não mudar, nada impede mapear um lote que já é parceiro: a chave existe dos dois lados
mas só um lado está populado. **Preencher o Place ID das unidades parceiras é pré-requisito real do
D-009**, não melhoria. Ver a atividade `feat(location): Place ID do Google como componente apartado
do endereço`.

## O que ficou retido, e por quê

Publicar exige match aceito **e** confirmação de que o lugar guarda carro e leva ao terminal. Place
ID resolve coordenada e duplicidade; não resolve o serviço.

| Aeroporto | Retidas | Nota |
|---|---|---|
| CGB | EBr, Estacione Aki, Estet Car, Aviação Park, Jr | os cinco voltaram como `parking_lot` real, com nota e avaliações, a 566–680 m do terminal. A existência está confirmada; falta saber do traslado, e a essa distância talvez nem precise |
| THE | Smartpark, Forno & Brasa | Forno & Brasa tem nome de restaurante |
| FOR | Prime, Atacadão | Atacadão provavelmente é estacionamento de loja |
| REC | All Park, Carcará | traslado não confirmado |
| VIX | Braspark | telefone com DDD de Curitiba na origem |
| GYN | Aero Parking | o próprio site não menciona traslado |
| GRU | Bandeira Park | coordenada idêntica à do MultiPark |

## As 10 sem match

`ViajePark`, `Central Park 24h`, `Mobiciti` (GRU) · `Stay Park`, `Facility` (CGH) · `Vision Park`
(CGB) · `Executive Park` (SSA) · `Market Park`, `Park | Day by Day` (VIX) · `Big Estacionamento`,
`Aero Park`, `DF Park` (BSB) · `Arai Park` (CGH, fechado).

Além dessas, **22 fichas nunca chegaram a ser importadas** porque o OSM não achou coordenada e a
coluna é `NOT NULL`. Com a Places API elas entram normalmente pelo painel. Prioridade: **`MJR` e
`DR Park` (GYN)** e **`Indústrias Park` (POA)** são os melhores leads da pesquisa inteira, com site
próprio confirmando traslado. Goiânia hoje tem uma ficha só, e é justamente a que não confirma.

Fonte: `gestao/Movepark_Prospeccao_Aeroportos_Capitais.xlsx`.

## O que mudou no código junto

O formulário do lote mapeado pedia latitude, longitude e Place ID **digitados**, enquanto o cadastro
de unidade parceira usa `AddressField` + Google Places. Era a origem do problema. Agora os dois usam
o mesmo componente (`withComplement={false}`, porque `prospect_location` não tem essa coluna), o
Place ID é somente-leitura preenchido pela busca, e `data_source` vira `google_places` sozinho. O
painel ganhou o filtro **"Sem Place ID"**, que é a fila de curadoria.
