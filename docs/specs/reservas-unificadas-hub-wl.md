# Reservas unificadas: Hub e white-label numa lista só

> **Status:** fases 1 a 6 implementadas em 09/10/2026 (fase 6: ver § 4.5) (migrations
> `20261129100000_reservas_unificadas_lista.sql`, `20261129110000_wl_booking_detalhe.sql`,
> `20261129120000_wl_booking_ficha_completa.sql` e `20261129130000_wl_faturamento_por_origem.sql`,
> pgTAP `bookings_list_page`, `wl_booking_detail`, `wl_booking_ficha_completa` e
> `wl_faturamento_por_origem`; legado agenciafera/movepark-backoffice#620). Substitui a direção de tela de `reservas-wl-no-hub.md`
> (aba separada "Pelo seu site"), que fica como registro da integração de dados (importação,
> ações no legado, segurança). Decisões de 09/10/2026 em § 9.
> **Base:** telas do backoffice do white-label enviadas pelo Kallef (lista de pedidos, detalhe,
> troca de placa), código e banco do legado (`movepark-backoffice-v4`), telas do Hub.

## 1. A visão

Hoje são duas plataformas. A integração existe para o Hub **absorver o white-label aos poucos**,
até o backoffice antigo poder ser desligado e tudo ficar nesta plataforma.

A classificação continua existindo para sempre: um estacionamento é **Hub** (se cadastrou e vende
pelo Hub) ou tem **white-label** (site próprio com a marca dele, trabalho dedicado da Movepark),
e pode ter os dois. Absorver o white-label quer dizer trazer as reservas, os dados e as
funcionalidades dele para cá, não acabar com a categoria.

Três regras guiam tudo abaixo:

1. **Uma lista só.** Reservas do Hub e do white-label aparecem juntas, com uma etiqueta de origem
   (Hub / White-label). Não existe aba separada.
2. **Faturamento separado por origem.** Relatórios e indicadores sempre distinguem o que é
   faturamento do Hub e o que é do white-label.
3. **Quem não tem white-label não vê nada dele.** Nem etiqueta, nem filtro, nem coluna, nem linha de
   relatório, nem texto. Para esse estacionamento é como se o white-label nunca tivesse existido.

## 2. Quem "tem white-label"

Uma regra só, usada em todo lugar: **a empresa tem white-label quando `company.wl_domain` está
preenchido.** O parceiro já consegue ler essa coluna (está em `COMPANY_COLUMNS`). O front ganha um
helper único (`useCompanyHasWl(companyId)` ou equivalente no `useAuth`) e todo elemento ligado ao
white-label passa por ele. No servidor, as RPCs que devolvem reservas do site conferem o mesmo.

Hoje isso não é cumprido em todos os lugares. O que vaza ou pode vazar para quem não tem
white-label, medido em 09/10/2026:

| Onde | O que aparece | Situação |
|---|---|---|
| Ocupação (`OccupancyCalendar.tsx:149`) | tooltip "Hub: N / White-label: 0" em todo dia | **vaza hoje para todo parceiro** |
| Lista de reservas (`BookingTable.tsx:79,90`) | rótulo "White-label" quando `booking.origin='white_label'` | sem trava; não dispara porque não há reserva com essa origem |
| Comissão da reserva (`BookingCommissionCard.tsx`) | "Onde reservou: Site white-label do estacionamento" | sem trava; idem |
| Canais de venda (`PartnerChannelsCard.tsx:76`) | selo "vale também no seu site Movepark" | depende de regra com `match_white_label`, que não exige `wl_domain` |
| Escopo `wl-bookings:read` | dado aos 4 papéis de **toda** empresa | não distingue quem tem white-label; a trava real é o dado |

Todos passam a usar a regra do § 2.

## 3. Passo 1: a lista unificada

### 3.1 Como juntar

As reservas do white-label já estão copiadas no Hub (`wl_booking`, 133 mil, atualizada a cada 15
minutos pela rota `GET backend/orders` do legado). A lista não consulta o legado em tempo real.

A junção é uma RPC (`bookings_list_page`) que faz `UNION ALL` entre `booking` e `wl_booking` num formato
comum, com uma coluna `source` (`hub` | `wl`). As duas tabelas continuam separadas, pelo mesmo
motivo do estudo anterior: 68 funções e 11 triggers leem `booking` (dinheiro, e-mail, WhatsApp,
cashback, capacidade), e uma reserva do site entrando ali dispararia tudo isso. A união é só de
leitura e só na tela.

Para empresa sem white-label, a RPC nem consulta `wl_booking`: a lista é exatamente a de hoje.

**Como ficou (09/10/2026).** `bookings_list_page` é `SECURITY INVOKER`: a RLS de quem chama vale
nas duas tabelas. A parte do site fica presa a `wl_visible_company_ids()` (empresa com
`wl_domain` em que quem chama é hub_admin ou tem `wl-bookings:read`), que é também a policy de
leitura de `wl_booking`; a linha de site de uma empresa sem white-label não aparece nem lendo a
tabela. A RPC filtra, ordena pela data da compra, pagina e devolve o total e o resumo do recorte
inteiro, separado por origem. A reserva do Hub volta só com o id e o front a monta com o select de
sempre (`useBookingsPage`), então a linha do Hub é a mesma de antes. O status do site sai traduzido
por `wl_booking_hub_status` (D2) e o normalizado segue em `site_status`, que é o que o detalhe e as
ações usam. Filtros só do Hub (forma de pagamento, canal) tiram o site do resultado. A visão do
estacionamento (`p_partner_view`) é a mesma regra de `partnerSeesBooking`: no Hub, só o que virou
venda; no site, pedido pago (`confirmed`, `refund_requested`, `refunded`). Tempo medido no banco
vivo: admin na rede inteira em 30 dias, 353 ms; dono da Garageinn, tudo, 622 ms.

No front, "tem white-label" é `useHasWl()` (`src/features/companies/useHasWl.ts`, regra pura em
`hasWl.logic.ts`): hub_admin sem impersonar sempre tem; os demais olham `wl_domain` das empresas
que enxergam. Etiqueta, filtro de origem, tooltip da ocupação, origem no card de comissão e o selo
"vale também no seu site" passam por ele.

### 3.2 Formato comum (o que a lista mostra)

| Coluna da lista | Reserva do Hub (`booking`) | Reserva do white-label (`wl_booking`) |
|---|---|---|
| Origem | etiqueta **Hub** | etiqueta **White-label** |
| Reserva | `code` (ex.: MP-8C497E) | `wl_order_number` (ex.: 261009-0025) |
| Criada em | `created_at` | `wl_created_at` |
| Canal | `origin` (site, WhatsApp, API) | `origin` do legado (reserva online, WhatsApp bot) |
| Cliente | snapshot `customer_name` | `customer_name` |
| Telefone | `customer_phone` | `customer_phone` |
| Unidade / Vaga | `location`, tipo de vaga | via De/Para (`location_parking_type_id`); 32 sem vaga |
| Estadia | `check_in_at` → `check_out_at` | `check_in_at` → `check_out_at` (convertidas de hora local) |
| Placa | `vehicle.license_plate` | `license_plate` |
| Pagamento | método do `payment` | **falta**: forma de pagamento do legado (ver § 5) |
| Valor | diárias (Operator) / total (Manager) | `paid_total_cents` (ver D3) |
| Status | `booking.status` | status traduzido + comparecimento (ver D2) |

### 3.3 Filtros

Os filtros de hoje continuam. Para quem tem white-label entra **Origem: Todas / Hub / White-label**.
Os filtros que só fazem sentido para um lado (ex.: Comparecimento, Com troca de placa, Afiliado do
legado) aparecem para quem tem white-label e se aplicam onde o dado existe.

### 3.4 Abrir uma reserva

Reserva do Hub abre a tela de hoje (`/operator/bookings/:code`). Reserva do white-label abre uma
tela de detalhe **no mesmo layout**, com os blocos que existem para ela (ver D1), e as ações que o
Hub já consegue gravar no legado: marcar comparecimento, no-show, troca de placa com motivo.

## 4. Passo 2: o que cada lado tem

Comparação ponto a ponto entre o backoffice do white-label (telas enviadas e código) e o Hub.

### 4.1 Lista

| Funcionalidade | White-label | Hub hoje | Proposta |
|---|---|---|---|
| Paginação | 25 por página, 12.528 páginas | sem paginação (100 no Operator, 500 no Manager) | **paginar** (com 133 mil reservas é obrigatório) |
| Busca | id, número, nome, e-mail, telefone, placa (inclusive a anterior), modelo | código, nome, e-mail, telefone | somar placa e número do pedido do site |
| KPIs no topo | Total de pedidos, Receita total, Ticket médio, Receita afiliados, donut afiliados | Manager: reservas, pagas, valor pago, não pagaram; Operator: nada | KPIs no topo nos dois painéis, **com Hub e White-label separados** (§ 6) |
| Ações em massa | marcar comparecimento, no-show, limpar | não tem | trazer (Hub: check-in/no-show; site: comparecimento) |
| Exportar | CSV com 25 colunas, por e-mail acima de 6 meses | Operator só em Relatórios; Manager não | exportar a lista unificada, com a coluna Origem |
| Colunas exclusivas do site | Forma de pagamento, Afiliado, Produtos (adicionais), Voucher, UTM | parte existe no Hub com outro nome | ver § 5 |
| Filtros exclusivos do site | Site (multisite), Forma de pagamento, Data entrada/saída, Unidade, Produtos, Origem, UTM Source/Campaign, 1º toque, PCD, Afiliado, Comparecimento, Com troca de placa | Status, período, busca (Operator); + pagamento, canal (Manager) | trazer Data entrada/saída, Unidade, Produtos, Origem, Forma de pagamento, PCD, Comparecimento; UTM/afiliado depois |

### 4.2 Detalhe

| Funcionalidade | White-label | Hub hoje | Proposta |
|---|---|---|---|
| Voucher: baixar | PDF por pedido pago | só na conta do cliente | botão Voucher no detalhe (Hub: Edge `voucher-pdf`; site: `voucher_url` do legado) |
| Voucher: gerar novo | sim | não | site: chamar o legado (rota nova); Hub: o PDF já é gerado sob demanda |
| Comparecimento / No-show | botões no topo | Hub: check-in, check-out, não compareceu | unificar o vocabulário (D2) |
| Trocar placa | modal com consulta de placa (marca/modelo/cor), motivo obrigatório, regenera voucher | Hub: troca simples, sem consulta nem motivo | **trazer a consulta de placa e o motivo para o Hub** nos dois tipos |
| Veículo e passageiros | marca, modelo, cor, passageiros | veículo (placa, modelo, cor) | importar marca/modelo/cor e passageiros do site |
| Cards do topo | pedido + id do gateway, valor, status, tipo de vaga (Normal/PCD), placa, unidade, check-in, check-out | cabeçalho, card Reserva, dinheiro, comissão | mesmo layout do Hub para os dois |
| Itens (Offer list) | vaga + adicionais com preço | linhas do `price_breakdown` | importar os itens do pedido do site |
| Comprador (Buyer) | nome, sobrenome, e-mail, telefone | card Reserva | igual |
| Dados do pagamento | JSON enviado e recebido do gateway | trilha do gateway (só hub_admin) | site: só hub_admin, se trouxermos |
| Dados extra | `extra_data` | não existe | só hub_admin, se trouxermos |
| Histórico | linha do tempo (status, pagamento, voucher, comparecimento, troca de placa, quem fez) | linha do tempo montada de colunas; `booking_modification` existe e não é mostrada | **linha do tempo nos dois**, com quem fez |
| Duplicatas | marca duplicata e liga ao original | não existe | mostrar o aviso de duplicata nas reservas do site |

### 4.3 O que o Hub tem e o site não

Plano de flexibilidade (Básica/Flex/Superflex) e proteção de voo, cancelamento com estorno pelo
gateway, mudança de data, divisão do dinheiro (diárias, comissão, "você recebe"), chamados do
cliente, cupons e descontos do Hub, avaliações. Nada disso existe para a reserva do site: na tela
dela esses blocos simplesmente não aparecem.

### 4.4 Como ficou o detalhe (fase 3, 09/10/2026)

Rota própria, `/operator/bookings/site/:id` e `/manager/bookings/site/:id` (pelo id do Hub, porque o
número do pedido se repete entre sites). A tela (`WlBookingDetailView`) segue o layout da reserva do
Hub: cabeçalho com o status traduzido e a etiqueta White-label, um aviso de que pagamento e
cancelamento são do site, o card Reserva (cliente, contato, placa, vaga com PCD, passageiros,
estadia, valor pago no site, comparecimento, status no site, canal e campanha), a linha do tempo e
o card Operação. Plano, dinheiro destrinchado, comissão, estorno, mudança de data, proteção de voo e
chamados não aparecem. Pedido marcado como duplicado no site ganha um aviso.

A leitura é a RPC `wl_booking_detail(p_id)`, com o mesmo recorte da lista
(`wl_visible_company_ids`). Ela é SECURITY DEFINER só para dar nome a quem fez cada ação da linha
do tempo (`wl_booking_action_log` + `profiles`): o parceiro não lê o perfil de outra pessoa pela
RLS. Ação da equipe da Movepark aparece para o parceiro como "Equipe Movepark". A leitura direta do
log passou a seguir a mesma regra da `wl_booking`. Ação recusada pelo site ou que não chegou fica na
linha do tempo, em vermelho, como "Não gravou: ...", com o motivo devolvido pelo site.

A linha do tempo ainda é só o que o Hub fez mais a compra e o comparecimento marcado no site: o
histórico completo do site (status, pagamento, voucher, trocas de placa feitas lá, quem fez) é dado
da fase 4 (§ 5, D5).

### 4.5 Como ficou (fase 6, 09/10/2026)

| Funcionalidade | Como ficou |
|---|---|
| Exportar | Botão "Exportar" na lista do Operator e do Manager. O arquivo sai da mesma consulta da tela (`bookings_list_page`, de 500 em 500, até 10 mil linhas), então segue os filtros. Coluna Origem só para quem tem white-label; Empresa só no Manager; valor como na tela. CSV no formato do Excel em português (`src/lib/csv.ts`). |
| Ação em massa | Na lista do Operator, para quem tem `bookings:checkin` ou `bookings:write`: seleciona e marca "Cliente chegou" ou "Não veio". Hub só confirmada; site só pedido pago, com as ações ligadas e, para chegada, a partir do horário de entrada (`planBulkAttendance`). O que não se aplica é pulado e contado por motivo. A seleção é da página na tela. |
| Histórico | Migration `20261129140500_historico_da_reserva.sql`: check-in, check-out e no-show passam a registrar quem marcou (`booking_modification`, tipo `status_change`, por gatilho, com `clock_timestamp`). RPC `booking_history` dá nome a quem fez; para o parceiro, equipe Movepark e cliente aparecem sem nome. A tela da reserva do Hub junta o histórico na linha do tempo (`buildHubTimeline`), sem repetir o check-in. De carona, a leitura de `booking_modification` por membro passa a exigir `bookings:read`. |
| Consulta e troca de placa | Formulário único (`PlateChangeForm`) para Hub e site: placa nova, "Consultar" preenche modelo e cor pela Edge `lookup-vehicle-plate` (a mesma do cadastro do cliente), motivo obrigatório. No Hub, a Edge `change-booking-vehicle` aceita modelo, cor e motivo, exige motivo quando é a equipe e grava no histórico a placa de antes e a de depois. No site, marca, modelo e cor vão para o legado pela `wl-booking-action`. |
| Duplicatas | Feito na fase 4 (aviso e link para o pedido original). O Hub não tem duplicata própria. |

## 5. Dados que faltam trazer do site

A cópia de hoje (`wl_booking`) traz o essencial. Para a lista e o detalhe acima, a rota
`GET backend/orders` do legado e a tabela precisam de:

| Dado | Fonte no legado |
|---|---|
| Forma de pagamento | `payment_method.name` / `code` |
| Itens do pedido (vaga + adicionais, com preço) | `order_positions` + `offer` + `product.is_spot` |
| Veículo | `property.brand`, `model`, `color`, `fipe_modelo.custom_name` |
| Voucher | `property.voucher_url` (só pedido pago) |
| Link público do pedido | `secret_key` → `/voucher/{secret_key}` do site |
| Afiliado | `users.affiliated_at` e a regra de data |
| Atribuição completa | `property.utm_*`, `first_utm_*`, `click_id_type` |
| Troca de placa | `movepark_general_order_plate_changes` (de → para, motivo, quem) |
| Histórico | `system_revisions` do pedido (entradas manuais e de status) |
| Duplicata | `is_duplicate`, `duplicate_of` |
| Id do gateway | `transaction_id` (só hub_admin) |

Os quatro primeiros entram na mesma leitura incremental. Histórico e trocas de placa são listas por
pedido: entram numa tabela filha (`wl_booking_event`) ou numa leitura sob demanda ao abrir o
detalhe (ver D5).

### 5.1 Como ficou (fase 4, 09/10/2026)

**Legado** (agenciafera/movepark-backoffice#620): a linha de `GET backend/orders` ganhou
`payment_method`, `items` (preço unitário gravado na posição), `vehicle`, `voucher_url` (só pedido
pago), `is_affiliated` (mesma regra do export), `utm` completo, `duplicate_of`, `transaction_id`,
`plate_changes` e `history`. As listas saem em uma consulta por página. O histórico leva só a nota
legível, nunca o `old_value`/`new_value` cru do `property`. Não existe rota pública de voucher por
`secret_key` no legado: o link é o `voucher_url` gravado no pedido.

**Hub** (migration `20261129120000`): colunas novas em `wl_booking` e a tabela filha
`wl_booking_event` (histórico e trocas de placa, lista trocada inteira a cada leitura, RLS pela
mesma regra). Linha sem os campos novos não apaga o que já foi copiado, por isso a migration foi
antes do deploy do legado. O id do gateway só sai para hub_admin. A lista mostra a forma de
pagamento do site; o filtro de forma de pagamento continua só do Hub (os códigos variam por site).

**Linha do tempo:** a fonte é o histórico copiado do site, que já anota o que o Hub gravou lá. Do
log do Hub entram só a tentativa que não gravou e a ação posterior à última cópia
(`buildWlTimeline`), para nada aparecer duas vezes.

**Releitura:** depois do deploy do legado, o cursor de cada empresa volta para a janela
(`update wl_booking_sync_state set cursor_updated_since = '1970-01-01 00:00:00', cursor_after_id = 0`)
e a importação relê os pedidos da janela, preenchendo a ficha das reservas que já existiam.

## 6. Faturamento por origem

"Receita" hoje quer dizer coisas diferentes em cada tela. Ao juntar as origens, cada indicador
passa a dizer de onde vem e qual base usa:

| Indicador | Hub | White-label |
|---|---|---|
| Receita (bruta) | `booking.total_amount` das pagas | `paid_total_price` dos pedidos pagos (`complete`), a mesma base dos relatórios do legado |
| Diárias (Operator) | `price_breakdown` sem o plano | `paid_total_price` (o site não separa plano) |
| "Você recebe" | dinheiro real do split | **não se aplica**: o dinheiro do site cai na conta Pagar.me do próprio parceiro, com o split configurado lá |
| Comissão da Movepark | pacote congelado por reserva | `paid_total_price × company.wl_take_rate_bps` (D4b), só no Manager |

Telas afetadas: dashboard do Operator, Relatórios do Operator, dashboard do Manager, Faturamento e
Comissões do Manager. Para empresa sem white-label, nenhuma muda.

Detalhe do legado a respeitar: a lista do backoffice mostra o valor calculado (`total_price_value`),
o placar do topo usa `paid_total_price` e os relatórios só contam pedido `complete`. A base do Hub
para o site é `paid_total_price` de pedido pago, que é o que o relatório do legado considera receita.

### 6.1 Como ficou (fase 5, 09/10/2026)

**Servidor** (migration `20261129130000`):

- `company.wl_take_rate_bps` (D4b), nula = não combinada. Fora do grant do `authenticated`, como
  a do Hub; o hub_admin lê por `manager_company_restricted` e grava por `set_company_wl_take_rate`
  (só empresa com white-label).
- `wl_revenue(p_from, p_to, p_location_ids, p_company_ids, p_date_field)`: total, por dia e por
  empresa, com o recorte de `wl_visible_company_ids`. "Pagas" conta também o reembolsado (o dinheiro
  entrou) e o valor soma só o pago não devolvido, igual ao Hub em `bookings_list_page`. A comissão
  é calculada na leitura e só sai para o hub_admin. Medido no banco vivo: 30 dias da rede, 43 ms;
  um ano, 375 ms (com o predicado de data dentro de um CASE eram 2 s e 9 s, porque o índice não
  valia).
- De carona: `set_company_take_rate` devolvia a linha inteira de `company`, com o segredo do WPS.
  Passou a devolver só `{id, take_rate_bps}`.

**Telas:**

| Tela | O que mudou |
|---|---|
| Dashboard do Operator | Receita do período = diárias do Hub + pago no site, com a quebra; gráfico empilhado; o site na Origem das reservas. A meta e o RevPAR medem a soma (a vaga vendida no site ocupa a mesma capacidade). |
| Relatórios do Operator | Card "Vendido no white-label"; "Você recebe" e "Reservas" passam a dizer "pela Movepark"; gráfico empilhado; CSV ganha as colunas do site. |
| Dashboard do Manager | Receita da rede com a quebra, comissão do white-label à parte do repasse, gráfico empilhado. Os outros indicadores (ranking, permanência, tarifas, clientes) seguem só do Hub. |
| Faturamento | Total e comissão com a quebra; por empresa, colunas do site e da comissão do site; aviso de empresa que vendeu no site sem taxa combinada. |
| Comissões | Coluna "White-label (%)" só para empresa com site; vazio = não combinada. |
| Atribuição | "Reservas via white-label" virou "Pela API e agentes"; o site do parceiro entra como "No site white-label" (pedidos criados no recorte). |

Tudo o que é de white-label passa por `useHasWl`: quem não tem site não chama a RPC nem vê
etiqueta, card ou linha. No dashboard do Operator a contagem do site vale para todo papel; o dinheiro
continua atrás de `finance:read`.

**Herdado e não mexido** (anotado para não se perder): as telas do Hub usam bases diferentes de
"receita" (diárias no Operator, total com plano no Manager e no Faturamento, pago menos devolvido
no relatório por canal), a comissão do dashboard e do Faturamento usa a taxa atual da empresa e não
a congelada na reserva, e os Relatórios do Operator não têm teto de data (entram check-ins futuros).
O site segue a base de cada tela onde ela existe e o teto dos Relatórios, para as duas origens
falarem do mesmo recorte.

## 7. Manager

O Manager vê a lista unificada de toda a rede, com o filtro Origem e as empresas sem white-label
aparecendo só com reservas do Hub. A tela `/manager/white-label` (saúde da integração) continua.

O indicador "Reservas via white-label" de `/manager/attribution` conta chamadas de API e bots, não o
site do parceiro: troca de nome para "Pela API e agentes", e o white-label de verdade entra como
origem própria.

## 8. Fases

| Fase | Entrega |
|---|---|
| 1 | Regra única de "tem white-label" e correção dos vazamentos do § 2 (**feita 09/10/2026**) |
| 2 | RPC `bookings_list_page` (Hub + site, paginada) e a lista unificada no Operator e no Manager, com etiqueta e filtro de origem; sai a aba "Pelo seu site" (**feita 09/10/2026**) |
| 3 | Detalhe da reserva do site no layout do Hub, com as ações que já funcionam (comparecimento, no-show, troca de placa) (**feita 09/10/2026**, ver § 4.4) |
| 4 | Dados que faltam (§ 5) na rota do legado e na cópia; voucher, itens, veículo, forma de pagamento (**feita 09/10/2026**, ver § 5.1) |
| 5 | Faturamento por origem nos dashboards e relatórios (§ 6) (**feita 09/10/2026**, ver § 6.1) |
| 6 | Funcionalidades do site que o Hub não tem: consulta de placa, ações em massa, exportar, histórico, duplicatas (**feita 09/10/2026**, ver § 4.5) |

## 9. Decisões (09/10/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Layout do detalhe da reserva do site | **Mesmo layout do Hub**, com os blocos que existem para ela. O que só existe no Hub (plano, estorno, divisão do dinheiro) não aparece |
| D2 | Status do site na lista | **Traduzido para o vocabulário do Hub**: pago → Confirmada; pago com comparecimento → Concluída; no-show → Não compareceu; pendente → Pendente; cancelado, expirado e reembolsado iguais. O status cru do site fica no detalhe |
| D3 | Valor da reserva do site para o parceiro | o pago no site (`paid_total_price`). Sem "você recebe": o dinheiro cai direto na conta do parceiro |
| D4 | Faturamento | **Total com a quebra Hub / White-label** e filtro de origem, nos dois painéis |
| D4b | Comissão da Movepark sobre o site | **Existe e aparece no Manager.** Cálculo: **percentual próprio de white-label por empresa** (`company.wl_take_rate_bps`, separado do `take_rate_bps` do Hub), aplicado sobre o valor pago no site, editável no Manager. Fica de fora das telas do parceiro, como a comissão do Hub hoje |
| D5 | Histórico e trocas de placa do site | **copiar para o Hub** (adotado como recomendado): quando o backoffice antigo for desligado, o histórico precisa já estar aqui |
| D6 | Dashboard da rede no Manager | **mesma regra do D4**: total com a quebra por origem (adotado como recomendado) |

Consequência do D4b no § 6: a linha "Comissão da Movepark" do white-label deixa de ser "não existe"
e passa a ser `paid_total_price × wl_take_rate_bps` por pedido pago, calculada na hora da leitura
(não congelada por reserva, porque a reserva do site não passa pelo motor de comissão do Hub). Se
um dia a taxa mudar, o histórico recalcula: se for preciso congelar, a coluna vai para `wl_booking`.
