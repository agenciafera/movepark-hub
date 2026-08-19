# Auditoria de endereço das unidades

> Status: ✅ Implementado em 19/08/2026. Migrations `20261101090000_location_address_audit.sql`,
> `20261101091000_location_address_audit_record.sql`, `20261101092000_location_address_door.sql`
> e `20261101093000_location_address_audit_cron.sql`; Edge `location-address-audit`; painel em
> `/manager/auditoria-enderecos`.
> **Pendente:** a `GOOGLE_PLACES_SERVER_KEY` e o `LOCATION_AUDIT_KEY` ainda não existem como
> secret da Edge, então a camada 2 responde 500 com a explicação e o cron mensal leva 401. A
> camada 1 (triagem) já roda.
>
> Lê-se junto de [location-destination-proximity.md](./location-destination-proximity.md)
> (DAT-04, o vínculo lote↔destino), [distance-display.md](./distance-display.md) (onde a
> distância aparece) e [place-id-lote-mapeado.md](./place-id-lote-mapeado.md) (o método de
> match no Google, e os erros que ele já custou).

## Por que existe

A refação da página de destinos encontrou uma unidade com o endereço errado. Endereço e pino de
unidade parceira não são enfeite: a distância ao aeroporto sai de `ST_Distance` sobre
`location.geog` (**ADR-001**) e alimenta a ordenação da busca, o badge "mais perto do Tx", a
página do destino, o JSON-LD e o índice de preço. Um pino a 4 km de onde deveria estar reordena
a vitrine inteira e manda o cliente para a porta errada às 5h da manhã.

Até aqui não havia processo nenhum: o endereço entrava por formulário e ninguém conferia depois.
As 20 unidades vivas mostravam, na primeira varredura, 18 sem `google_place_id`, uma sem
coordenada, uma com endereço em São Paulo e pino em Guarulhos, e duas declarando a mesma porta
com os pinos a quilômetros de distância.

## Desenho: duas camadas, correção sempre humana

```
                        ┌──────────────────────────────┐
   cron semanal ───────►│ 1. Triagem  (SQL, custo zero)│──► location_address_audit.flags
                        └──────────────────────────────┘
                        ┌──────────────────────────────┐
   cron mensal  ───────►│ 2. Verificação (Places API)  │──► match_* + drift_m + verify_status
   botão do Manager ───►└──────────────────────────────┘
                                      │
                                      ▼
                        ┌──────────────────────────────┐
                        │ 3. Revisão humana (hub_admin)│──► manager_location_address_apply
                        └──────────────────────────────┘
```

A camada 2 **propõe**; quem grava é `hub_admin` pela tela. O E0.17-i já pagou para aprender que
um match errado é pior que nenhum: publica o nome de um lugar com o pino de outro. Aqui o
estrago seria maior, porque estas unidades vendem.

### Camada 1: triagem (`location_address_scan`)

SQL puro sobre o próprio banco, sem chamada externa e sem custo. Marca em
`location_address_audit.flags`:

| Sinal | O que pegou |
|---|---|
| `sem_geo` | unidade sem latitude/longitude. Não aparece em busca por distância nem tem pino. |
| `sem_destino` | tem geo mas nenhum destino ancorado. |
| `sem_place_id` | sem `google_place_id`, então a verificação depende de busca textual. |
| `place_id_nao_e_estabelecimento` | `google_place_id` que não começa por `ChIJ`. Os codificados longos (prefixo `E`) são de endereço/rota: resolvem uma porta genérica, não o negócio. |
| `longe_do_destino` | acima de 15 km do aeroporto ancorado (12 km para outros tipos de destino). |
| `endereco_incompleto` | endereço com menos de 12 caracteres. |
| `endereco_sem_numero` | endereço sem número nenhum, normalmente o endereço do aeroporto copiado. |
| `endereco_duplicado` | outra unidade declara a mesma porta. |
| `pino_duplicado` | outra unidade a menos de 50 m. |

### Camada 2: verificação no Google (Edge `location-address-audit`)

Resolve o lugar na Places API (New) e grava a resposta como proposta. Com `google_place_id` de
estabelecimento, vai direto ao Place Details; sem ele, faz `searchText` de "nome, endereço" com
viés na coordenada atual e raio de 20 km. O raio é generoso de propósito: com o pino errado, um
raio apertado esconderia justamente o lugar certo.

O critério de aceite é o do E0.17-i, e cada regra existe por causa de um erro real:

- `businessStatus` precisa ser `OPERATIONAL` (o `Arai Park` estava fechado e anunciado).
- O tipo precisa incluir `parking_lot`, `parking_garage` **ou** `park_and_ride` (sem o terceiro,
  o `Connect Park` caía fora; um hotel chegou a resolver como estacionamento).
- Similaridade de nome ≥ 0,60. Nome forte (≥ 0,85) tolera 15 km de distância; nome fraco, 3 km.
  A folga do nome forte não é frouxidão: quando `Park Confins` e `Decolar Park` foram recusados
  por distância, quem estava errado era o nosso pino.

**A distância nunca é calculada em TS.** A Edge repassa a coordenada que o Google devolveu e
quem mede é a RPC `location_address_audit_record`, com `ST_Distance` (ADR-001). O resultado é o
`drift_m`, a distância entre o nosso pino e o dele, que é o sinal forte de pino errado.

Classificação:

| `verify_status` | Quando |
|---|---|
| `ok` | pino do Google a menos de 250 m do nosso **e** mesma porta. |
| `divergent` | pino distante, porta diferente, ou unidade sem pino para comparar. |
| `no_match` | nenhum candidato passou no critério de aceite. O motivo fica em `fetch_error`. |
| `error` | falha de rede ou de API. **Preserva o veredito anterior**, igual ao `google-place-refresh`: erro de rede não apaga prova. |

### Comparação de endereço: a porta, não a string

Duas unidades escrevem a mesma porta de jeitos diferentes ("Cidade Industrial Satélite" contra
"Cidade Industrial Satélite de São Paulo"), e o Google escreve de um terceiro jeito. O que
identifica o endereço é **logradouro + número**; bairro, cidade e CEP são onde a variação mora.

`location_address_door()` normaliza o texto até o primeiro número, inclusive:

```
"Av. Novo Brasil, 954 - Cidade Industrial Satélite"           -> avnovobrasil954
"Av. Novo Brasil, 954 - Cidade Industrial de São Paulo, ..."  -> avnovobrasil954
"Rod. Santos Dumont, km 66 - Vila Aeroporto, Campinas - SP"   -> rodsantosdumontkm66
"Av. Rocha Pombo, s/n - Águas Belas"                          -> null
```

A primeira versão comparava os 18 primeiros caracteres normalizados e o teste reprovou: "Rua
Teste, 100 - Bairro" contra "Rua Teste, 100 - Outro Bairro" virava divergência falsa. Divergência
falsa é pior que inútil, porque enche a fila de coisa certa e o revisor para de ler a lista.

Endereço sem número devolve `null`, e aí quem fala é a flag `endereco_sem_numero`. Sem isso,
dois lotes que copiaram o endereço do aeroporto ("Av. Rocha Pombo, s/n") virariam duplicados.

## O que a correção arrasta junto

Esta é a parte que justifica uma RPC em vez de um `UPDATE`.

**Mudar lat/lng não re-vincula o destino sozinho.** A trigger `location_set_destination_trg` só
age em `INSERT`, de propósito, para nunca pisar num override manual (DAT-04). Sem re-vínculo,
uma coordenada corrigida através da fronteira de outro aeroporto deixaria a unidade ancorada no
destino antigo, exibindo a distância certa até o aeroporto errado.

`manager_location_address_apply` faz tudo numa transação:

1. grava os campos informados (parâmetro nulo não toca no campo);
2. recalcula `destination_id` por `nearest_destination` quando a coordenada mudou;
3. registra o antes e o depois em `location_address_change`, com destino e distância dos dois lados;
4. devolve `{destination_before, destination_after, destination_changed, distance_km_before, distance_km_after}`,
   que a tela mostra no toast.

Latitude e longitude só entram juntas: meia coordenada produz um pino em lugar nenhum, que é pior
que o pino errado que se queria corrigir.

**O que se corrige sozinho depois disso:** a distância não tem cache. Ela é view/RPC PostGIS
sobre a coluna gerada `geog`, então busca, card, terminais mais próximos e JSON-LD passam a usar
o número novo na hora. O HTML do SSG é cache, e a trigger `location_site_rebuild` já republica o
site no `UPDATE`.

## Edição por fora reabre a verificação

Alguém editou o endereço ou o pino pelo formulário da unidade: o veredito do Google que estava
ali passou a ser sobre outro endereço. A trigger `location_address_audit_invalidate_trg` devolve
a linha para `pending` em vez de continuar exibindo um "ok" vencido.

O guard `app.address_audit_apply` existe porque a própria RPC de aplicar faz esse `UPDATE`, e
sem ele a correção apagaria o registro da correção.

## Modelo de dados

```
location_address_audit          (1 linha por unidade, o veredito corrente)
├── location_id  PK → location(id) ON DELETE CASCADE
├── scanned_at, flags[]                         ← camada 1
├── verified_at, verify_status, fetch_error     ← camada 2
├── match_place_id/name/address/latitude/longitude/maps_url/business_status
├── name_similarity, drift_m
└── decision (pending|applied|dismissed), decision_note, reviewed_at, reviewed_by

location_address_change         (histórico: o rastro da auditoria)
├── location_id, changed_at, changed_by
├── address_before/after, latitude_before/after, longitude_before/after
├── destination_before/after, distance_km_before/after
└── source, note
```

Uma linha por unidade na primeira tabela porque a pergunta da tela é "o que está errado agora".
Quem guarda o histórico é a segunda.

**RLS:** as duas concedem `select` só a `hub_admin`, e **nenhuma escrita por PostgREST**. Quem
grava é a Edge (service_role) e as RPCs `security definer`. O veredito diz "esta unidade pode
estar no lugar errado", que não é informação para o parceiro nem para o cliente antes de alguém
conferir.

## Superfície

| Função | Quem chama | O que faz |
|---|---|---|
| `location_address_scan()` | cron, Edge, botão | camada 1. Devolve quantas unidades varreu. |
| `location_address_audit_queue(p_limit)` | Edge | fila da verificação: nunca verificadas ou vencidas (`verify_after_days`, 90 dias). |
| `location_address_audit_record(...)` | Edge | grava o veredito, mede o `drift_m` e classifica. |
| `location_address_door(text)` / `location_address_key(text)` | interno | normalização do endereço. |
| `manager_location_address_audit(p_only_flagged)` | Manager | a lista, com o estado atual, o veredito e para onde a coordenada proposta ancoraria. |
| `manager_location_address_apply(...)` | Manager | aplica a correção e re-vincula o destino. |
| `manager_location_address_dismiss(...)` | Manager | conferido e mantido. |
| `manager_location_address_scan()` | Manager | roda a triagem na hora. |

## Configuração (`app_setting.location_address_audit_policy`)

Limiar é config, não código, seguindo `card_installment_policy` e `site_rebuild_policy`:

```json
{
  "max_km_airport": 15,
  "max_km_other": 12,
  "pin_dup_meters": 50,
  "drift_alert_meters": 250,
  "name_similarity_strong": 0.85,
  "name_similarity_weak": 0.60,
  "max_km_strong": 15,
  "max_km_weak": 3,
  "verify_after_days": 90
}
```

## Agendamento

| Job | Quando | O quê |
|---|---|---|
| `location-address-scan` | toda segunda, 05:00 UTC | triagem, direto no banco. |
| `location-address-audit` | dia 5 de cada mês, 06:00 UTC | verificação no Google, pela Edge. |

Endereço de estacionamento muda pouco, e o que muda costuma ser o nosso registro. Rodar a parte
paga toda semana gastaria chamada para reconfirmar o mesmo lugar. O que pega correção errada no
dia seguinte é o gatilho de invalidação somado ao botão "Verificar no Google" da tela.

## As duas credenciais que faltam

A Edge não roda sem elas, e nenhuma pode ser criada por aqui.

**1. `GOOGLE_PLACES_SERVER_KEY`** (secret da Edge Function). Chave da Places API restrita por
**IP**, criada no Google Cloud Console. A chave pública do front (`VITE_GOOGLE_MAPS_API_KEY`) é
restrita por **referrer** e recusa chamada de servidor com
`API_KEY_HTTP_REFERRER_BLOCKED`. Isso está correto e não deve ser afrouxado: ela vai no bundle
do navegador, então o referrer é a única proteção que tem. É a mesma chave que a Edge
`google-place-refresh` espera desde 14/08/2026, então configurá-la destrava as duas.

**2. `LOCATION_AUDIT_KEY`** (secret da Edge Function). O par da chave que a migration do cron
criou no vault com o nome `location_audit_key`. Copie o valor do painel do Supabase (Vault) e
grave com o mesmo conteúdo, senão o job mensal bate na porta e leva 401. Sem ela, o botão do
Manager continua funcionando, porque esse caminho autentica por JWT de `hub_admin`.

## Nota de aplicação (carimbo das migrations)

As seis migrations foram aplicadas pelo MCP do Supabase, que registra em
`supabase_migrations.schema_migrations` com o carimbo da **hora real** (`20260819*`), enquanto os
arquivos do repo seguem a numeração adiantada que o projeto usa (`20261101*`). Um `supabase db
push` futuro vai enxergar os arquivos como não aplicados e tentar de novo: todo o SQL é
`create or replace`, `create table if not exists`, `insert on conflict do nothing` e
revoke/grant, então repetir é seguro.

O carimbo escolhido também desviou de uma colisão: `20261031090000` já estava tomado por uma
migration `home_featured_offer` aplicada em paralelo por outra sessão. Dois arquivos com o mesmo
carimbo fazem o `supabase db reset` abortar por PK duplicada e parar de aplicar tudo dali para
frente, que é a armadilha descrita no `CLAUDE.md`.

## Testes

| Camada | Arquivo | Cobre |
|---|---|---|
| Banco (pgTAP) | `supabase/tests/location_address_audit.test.sql` | os sinais da triagem, a classificação por `drift_m` medido em PostGIS, o re-vínculo do destino ao aplicar, o histórico e a invalidação por edição externa. |
| Edge (deno test) | `supabase/functions/location-address-audit/index.test.ts` | o critério de aceite do match, com os casos reais do E0.17-i (lugar fechado, hotel, `park_and_ride`, nome forte contra pino distante). |
| Lógica pura (Vitest) | `src/routes/manager/auditoria-enderecos.logic.test.ts` | rótulo do veredito, precedência da decisão humana, tradução de todo sinal do SQL. |
| Componente (Vitest + RTL) | `src/routes/manager/auditoria-enderecos.test.tsx` | tabela, aviso de troca de aeroporto, botão desligado sem proposta, payload do apply. |

## Escopo

Cobre `location`, as unidades parceiras. Os lotes mapeados (`prospect_location`) passaram pelo
mesmo tipo de verificação no E0.17-i, registrada em
[place-id-lote-mapeado.md](./place-id-lote-mapeado.md), e não entram nesta rotina: são tabelas
separadas por **ADR-010** e a ficha de prospecção não tem pino exibido em vitrine transacional.
Se um dia a curadoria dos mapeados virar recorrente, o desenho aqui serve de molde.
