# Base de conhecimento do atendimento (RAG próprio)

Inventário e de-para das bases de conhecimento do atendimento (hoje no Notion, servidas pelo agente de WhatsApp no Dify) contra o que o Hub já guarda: a **FAQ em camadas** (ADR-002) e os **campos estruturados** da `location`.

Fonte do trabalho: tarefa [Base de conhecimento do atendimento dentro do Hub (RAG próprio)](https://app.clickup.com/t/86ajp4560), sob o épico [E3.3 - Chatbot / WhatsApp do hub (MCP Movepark)](https://app.clickup.com/t/86ahur63g). Specs relacionadas: [destinations.md](./destinations.md) (ADR-002), [public-api.md](./public-api.md) (ADR-003), [mcp.md](./mcp.md), [chatbot.md](./chatbot.md), [pricing-engine.md](./pricing-engine.md).

## Objetivo

Saber se a base do Hub está preparada para servir as respostas do atendimento, achando os pontos comuns entre as bases. Este documento cobre os entregáveis 1 e 2 da tarefa (inventário de-para + marcação do que é dado estruturado, o que é conteúdo novo e o que se descarta). A **decisão de vetorização** (pgvector no Supabase) e as **tools do agente** (ADR-003) ficam na tarefa 86ajp4560.

## Veredito

A base do Hub está em grande parte preparada. As 10 bases do Notion seguem quase o mesmo gabarito, com respostas quase idênticas entre unidades, o que encaixa direto no modelo em camadas do ADR-002 (`global` -> `destination` -> `location`, mais a camada `auto` que a Edge `get-faq` gera dos dados da unidade). O trabalho restante é: criar 3 campos estruturados (Place ID, horário de funcionamento, tolerância), semear as FAQs por camada, higienizar o conteúdo legado e decidir a vetorização.

## As bases inventariadas

Bases no Notion (pai: "Bases de conhecimento" > "Movepark"):

| Base | Aeroporto/destino | Traslado | Cobertura | Self-park |
|---|---|---|---|---|
| Virapark | Viracopos (VCP) | Sim (go2park) | 100% coberta | Sim |
| Garageinn | Viracopos (VCP) | Sim (go2park) | avulsa/rotativa | Não |
| Nationpark | Afonso Pena (CWB) | Sim (2 vans) | coberta + descoberta | Sim |
| Abbapark | Afonso Pena (CWB) | Sim (2 vans) | coberta + descoberta | Sim |
| Aeropark | Guarulhos (GRU) | Sim (2 vans) | coberta + descoberta | Sim (com ressalva) |
| Aerovalet | Terminal Tietê | Não | coberta + descoberta | Sim |
| Aerovalet | Congonhas (CGH) | Não | coberta + descoberta | Sim |
| Move Parking | Nova Iguaçu (RJ) | Não | 100% coberta | Sim |
| Plenty Park | Congonhas (CGH) | Não | 100% coberta | Não |
| Movepark (institucional) | (nenhum) | (pitch B2B de vendas, **descartar** do RAG de atendimento) | | |

Divergências que quebram premissas de resposta automática: nem toda unidade tem traslado (Aerovalet Tietê/Congonhas e Plenty não têm van); Move Parking (Nova Iguaçu) não é aeroporto e tem **horário comercial**, não 24h.

## Regras de negócio confirmadas (mudam o mapeamento)

- **Cancelamento é `global`.** A Movepark monetiza a flexibilidade na Tarifa (ver [fares.md](./fares.md)). A unidade não define janela de cancelamento.
- **Formas de pagamento são `global`**, definidas pelo gateway (PIX + cartão, ADR-004). Unidade/empresa **não** define meio de pagamento. Nada de tags (Veloe/Sem Parar) nem dinheiro na plataforma. Não existe (nem deve existir) campo de "formas de pagamento" por unidade.
- **Place ID separado do endereço.** O componente de "negócio" do Google (Place ID / Google Meu Negócio) é apartado do endereço. Pré-preenchível pelo autocomplete do Places, mas aditivo e refinável sem interferir no endereço.
- **Tolerância não existe no cálculo.** Confirmado que a engine de cálculo da `location` não guarda a tolerância de saída. Vira campo novo, em minutos.
- **Reclassificação para `location`:** ordem de embarque na van, prioridade para idoso/gestante/PCD e itens perdidos (guarda 15 dias) são responsabilidade da **unidade**, não `global`, mesmo com texto hoje idêntico.

## De-para: pergunta recorrente -> onde mora no Hub

### Grupo A: já respondido por dado estruturado (não precisa de FAQ escrita)

| Pergunta na base | Campo no Hub | Status |
|---|---|---|
| Onde fica / endereço | `location.address` (+ `address_complement`) | Existe (string única) |
| Distância até o terminal | derivado PostGIS (`location.geog` + `destination_id`, view `location_proximity`) | Existe (calculado) |
| Tem traslado? | `location.has_shuttle` | Existe |
| Quanto tempo o transfer leva | `location.shuttle_to_terminal_minutes` | Existe |
| De quanto em quanto tempo sai a van | `location.shuttle_frequency_minutes` | Existe |
| Vagas cobertas / descobertas | `parking_type` -> `location_parking_type` | Existe |
| Posso levar a chave (self-park / valet) | amenidade `self_park` / `valet` | Existe |
| Wi-fi, lavagem, tomada, câmeras, seguro | tabela `amenity` (18 itens) + `location_amenity.notes` | Existe |
| Valor da diária / simular 7 dias | motor de preço (`pricing_rule`/tier) + busca | Existe (dinâmico) |
| E-mail de contato | `location.email` | Existe |
| Como chegar (passo a passo) | `location.directions_text` | Existe |

### Grupo B: resposta idêntica em quase todas -> FAQ `global` (escrever uma vez)

| Pergunta | Situação |
|---|---|
| Preciso imprimir o voucher? | Coberto (auto/global check-in no seed) |
| Cancelamento / reembolso | Existe no seed global (regra de negócio: global) |
| Formas de pagamento (PIX + cartão) | Existe no seed global (regra de negócio: global) |
| Benefícios da reserva antecipada | Novo global |
| Meu carro não liga / suporte mecânico | Novo global (exceção Autostart vira `location`) |

### Grupo C: varia por aeroporto -> FAQ `destination`

| Pergunta | Observação |
|---|---|
| Onde espero a van no desembarque | Viracopos = "Rua do Meio"; Afonso Pena = "portão B e C"; GRU = calçadas por terminal (T1/T2/T3). Igual entre unidades do mesmo aeroporto, com override `location` quando a van da unidade para em outro ponto |
| Tempo típico do transfer | Genérico por destino; o valor exato da unidade fica em `shuttle_to_terminal_minutes` |
| Voo atrasou, e agora | Já existe seed `destination` genérico |

### Grupo D: específico da unidade -> FAQ `location` ou campo/amenidade

| Pergunta | Destino |
|---|---|
| Ordem de embarque na van | FAQ `location` (reclassificado) |
| Prioridade idoso / gestante / PCD | FAQ `location` (reclassificado) |
| Itens perdidos, guarda 15 dias | FAQ `location` (reclassificado) |
| Quantas vans / como aciono a van (link go2park) | FAQ `location` |
| Autostart (Nation, Abba) | amenidade `battery_service` (já existe) |
| Convênio com Azul / eSuites | FAQ `location` |
| Altura máxima de entrada (Plenty: 2m) | `location.notice` (aviso crítico) |
| Qual a seguradora (Bradesco / Porto) | `location_amenity.notes` na amenidade `insured` |

## Gaps: o que falta criar no Hub

Campos que não existem hoje e aparecem em quase toda base:

| Info | Hoje | Ação | Tarefa |
|---|---|---|---|
| Link do Google Maps / Meu Negócio | **Feito.** `location.google_place_id` + `google_maps_url`, apartados do endereço. O autocomplete do Places captura o `place_id` e pré-preenche o link de forma aditiva; a camada `auto` do `get-faq` devolve o link na resposta de endereço | [86ajp6vhh](https://app.clickup.com/t/86ajp6vhh) ✅ |
| Horário de funcionamento | Só existe `timezone` | Criar campo de horário (24h vs comercial; Nova Iguaçu não é 24h) | [86ajp6vnf](https://app.clickup.com/t/86ajp6vnf) |
| Tolerância de saída | Não existe no cálculo | Criar `tolerance_minutes` na engine de cálculo | [86ajp6vrq](https://app.clickup.com/t/86ajp6vrq) |

Parciais que valem endurecer (sem tarefa dedicada por ora): `location.phone` é usado como WhatsApp da unidade (ver [spot-guarantee.md](./spot-guarantee.md)); confirmar e padronizar. A `reservation_policy` é texto livre, mas a regra de cancelamento é `global`, então não vira campo por unidade.

## O que se descarta

- **Base institucional "Movepark"**: pitch B2B de vendas ("demita sua agência", "o Movepark investe no seu estacionamento"). Não é atendimento ao cliente final. Fora do RAG de atendimento; se útil, base separada de vendas/parceiro.
- Prefixos "Resposta:", emojis decorativos e perguntas duplicadas.
- **Dados sujos/legados** a corrigir antes da ingestão: GRU/Aeropark aponta reservas para `bandeirapark.movepark.co` (slug/marca divergente); Nationpark e Abbapark mostram o número (19) 98801-3420, que é o do Virapark, em "van atrasar"; dependência de `wa.go2park.com.br/call/<slug>` (sistema externo de chamada de van).

## Camada por seção da base (resumo)

| Seção no Notion | Camada no Hub |
|---|---|
| Dados gerais (endereço, mapa, contato, site) | campo estruturado + `auto` |
| Translado / Vans (existência, frequência, tempo) | campo (`has_shuttle`/`shuttle_*`) + `auto`; instruções em `directions_text` |
| Ponto de encontro no desembarque | `destination` (override `location`) |
| Localização / distância | PostGIS (`auto`) |
| Contato e atendimento | `location.phone`/`email` (`auto`) + horário (campo novo) |
| Voucher | `global` (já coberto) |
| Fila e organização do transporte | `location` (reclassificado) |
| Itens perdidos | `location` (reclassificado) |
| Suporte ao veículo (bateria/Autostart) | `global` (padrão) + amenidade `battery_service` (`location`) |
| Formas de pagamento e reembolso | `global` (regra de negócio) |
| Condições e infraestrutura (cobertura, self-park, segurança, convênios) | `parking_type` + amenidades + `location` (convênios/altura) |
| Horários de funcionamento | campo novo + `auto` |
| Reserva online (valor, simular) | motor de preço + busca |
| Veículos permitidos (motos, altura) | `parking_type` (`motorcycle`) + `location.notice` |

## Atividades criadas (subitens do E3.3, no Kallef)

Schema/campo:
- [feat(location): Place ID do Google apartado do endereço](https://app.clickup.com/t/86ajp6vhh)
- [feat(location): Horário de funcionamento da unidade](https://app.clickup.com/t/86ajp6vnf)
- [feat(pricing/location): Tolerância de saída em minutos](https://app.clickup.com/t/86ajp6vrq)

Conteúdo/FAQ:
- [content(faq): Semear FAQ global](https://app.clickup.com/t/86ajp6vx9)
- [content(faq): Semear FAQ destination (ponto de encontro por aeroporto)](https://app.clickup.com/t/86ajp6w0c)
- [content(faq): Migrar FAQ por unidade (location)](https://app.clickup.com/t/86ajp6w36)

Higienização (bloqueia as migrações de FAQ):
- [chore(faq): Higienizar o conteúdo legado das bases](https://app.clickup.com/t/86ajp6w69)

Fora deste escopo (fica na tarefa-mãe [86ajp4560](https://app.clickup.com/t/86ajp4560)): decisão de vetorização (pgvector no Supabase) e tools do agente documentadas (ADR-003).
