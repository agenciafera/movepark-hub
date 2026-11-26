# Ações do cliente no painel do operador (26/11/2026)

**Pedido do Kallef em 26/11/2026:** o que o cliente faz na própria reserva (upgrade de plano, alterar
datas cobrando ou devolvendo a diferença) também precisa estar com o operador, que atende o cliente
no balcão e no telefone. Decisões tomadas na mesma conversa, todas na opção recomendada.

Specs afetadas: [`booking-modifications.md`](../../specs/booking-modifications.md),
[`operator-panel.md`](../../specs/operator-panel.md), [`permissions.md`](../../specs/permissions.md),
[`fares.md`](../../specs/fares.md), [`assistente-do-operador.md`](../../specs/assistente-do-operador.md).

## 1. Levantamento (medido em 26/11/2026)

| Ação | Cliente | Operador antes desta entrega |
|---|---|---|
| Cancelar com estorno | dentro da janela do plano | já fazia, em qualquer plano, até a entrada |
| Trocar placa | Flex e Superflex | já fazia ("Trocar placa") |
| Proteção de voo | Superflex | já acionava pelo cliente |
| Alterar datas (cobra ou devolve) | Flex e Superflex, até a entrada | sem botão; só pela Mia, liberada só para a Agência Fera |
| Upgrade de plano | qualquer plano, PIX, até a entrada | não tinha: a Edge só aceitava o dono |
| Estender com o carro no pátio | ninguém | só o card "Dias a mais", informativo |

Números do banco: 191 vendas no Hub, 114 na Básica (60%), 57 Flex, 20 Superflex. 13 trocas de data
(12 do cliente), só uma com diferença (+R$ 18,90), nenhum estorno por troca. 1 upgrade pago. Das
104 reservas concluídas, 3 têm entrada registrada e 1 tem saída: o parceiro quase não registra
entrada e saída, e o `cron_complete_bookings` marca `completed` uma hora depois da saída prevista
mesmo com o carro no pátio.

**Falha achada no levantamento:** `cancel-booking`, `change-booking-vehicle`, `change-booking-dates`,
`change-booking-dates-paid` e `extend-booking` tratam como equipe qualquer pessoa com linha em
`profile_company`, sem olhar o escopo. O papel Financeiro (só `bookings:read`) cancelava com estorno
chamando a Edge, e a tela do operador mostrava "Cancelar" para ele (`canCancel` liberava toda a
audiência `operator`). Fere o ADR-005.

## 2. Decisões

| # | Pergunta | Decisão | Por quê |
|---|---|---|---|
| D1 | Operador altera datas de reserva Básica | **Cobra o upgrade para Flex junto** | 60% das vendas são Básica; troca de graça no balcão ensina o cliente a pular o Flex (R$ 12,90, receita da Movepark) |
| D2 | Estender com o carro no pátio | **Sim, cobrando pelo Hub** | É o caso mais comum do balcão (a volta atrasou) e hoje ninguém resolve pelo Hub |
| D3 | Como o cliente paga a diferença gerada pelo operador | **Só PIX do Hub** | Única forma de o Hub ter prova do pagamento; divide com comissão e entra no extrato |
| D4 | Saiu antes, depois da entrada | **Não devolve** | Igual ao cliente: depois da entrada a estadia é devida. Antes da entrada, encurtar segue devolvendo |
| D5 | Extensão no pátio de reserva Básica | **Sem upgrade** | Proposta minha, aprovada: é cobrança de dias a mais, não troca de reserva |
| D6 | Equipe da Movepark (Manager) na Básica | **Pode dispensar o upgrade, com motivo** | A receita do upgrade é da Movepark; o parceiro não dispensa o que não é dele |

Cartão pelo operador **não existe**: o PAN nunca passa pelo backend (ADR-004), então o operador não
digita o cartão do cliente. O cliente segue pagando no cartão quando ele mesmo troca as datas.

## 3. Parte 1: permissões, alterar datas e upgrade antes da entrada

### 3.1 Permissões por escopo (ADR-005)

Helper `_shared/staff.ts` · `staffAccess(admin, userClient, userId, companyId, scope)`: devolve
`{ isOwner, isStaff, isHubAdmin, seesMoney }`. Equipe só com `member_has_scope(company, scope)`
chamado com o JWT do usuário (a função lê `auth.uid()`); `seesMoney` = dono, hub_admin ou
`finance:read`.

| Edge | Escopo da equipe |
|---|---|
| `cancel-booking` | `bookings:cancel` |
| `change-booking-vehicle` | `bookings:write` |
| `change-booking-dates` / `change-booking-dates-paid` | `bookings:write` |
| `extend-booking` (proteção de voo) | `bookings:write` |
| `create-fare-upgrade` | `bookings:write` (novo: antes só o dono) |

Sem o escopo: 403 "Seu papel não permite …". O dono da reserva continua passando pelos gates de
cliente, como hoje. Na tela, `canCancel` passa a exigir `hasScope("bookings:cancel")` também no
Operator, e os botões novos exigem `bookings:write`.

### 3.2 Alterar datas (Edge `change-booking-dates-paid`)

Mesma Edge e mesma cotação (`reprice_booking_dates`, tabela da compra) do cliente. O que muda para a
equipe:

- **Básica (sem `date_change`) e equipe que não é hub_admin:** a cotação ganha
  `fare_upgrade = { tier: "flex", cents }`, com `cents = preço do Flex − fare_price_cents`.
  - **Diferença das diárias > 0:** um PIX só, `kind = date_change` com `fare_target_tier = flex`,
    valor = diferença + upgrade. Split: `buildSplit` com `chargedCents = diferença + upgrade` e
    `baseCents = diferença`, então o estacionamento recebe a parte dele nas diárias e a Movepark a
    comissão mais o upgrade inteiro. No webhook, ramo `date_change`: **primeiro**
    `apply_paid_date_change` (que grava o total da cotação), **depois** `apply_fare_upgrade` (que
    soma o upgrade ao total e recalcula a janela de cancelamento pela entrada nova). A ordem inversa
    apagaria o upgrade do total.
  - **Diferença ≤ 0:** dois passos na mesma janela. Primeiro o PIX do upgrade (Edge
    `create-fare-upgrade`, 100% Movepark). Quando ele entra, a reserva vira Flex e a janela segue
    para a troca, que agora vale na hora e estorna a diferença pelo caminho de sempre. Se o operador
    fechar a janela, a reserva fica Flex e a troca pode ser feita depois.
- **hub_admin:** pode mandar `waive_fare_upgrade: true` com `reason` obrigatório; a troca sai sem
  upgrade e o motivo vai para `booking_modification.reason`. Operador mandando o campo: 403.
- **Sem `finance:read`:** a resposta (prévia e aplicação) sai sem `current_total`, `new_total` e
  `total_amount`. Fica a diferença das diárias, o upgrade e o efeito, que é preço de tabela (mesma
  exceção do card "Dias a mais", 26/11/2026).
- A Mia do operador usa a mesma Edge, então herda a regra da Básica sem código próprio; o texto do
  `quote_date_change` passa a citar o upgrade.

### 3.3 Upgrade pelo operador (Edge `create-fare-upgrade`)

Aceita a equipe com `bookings:write`, além do dono. Mesmas regras (antes da entrada, `pending` ou
`confirmed`, sem downgrade), mesmo PIX 100% Movepark. O pagador continua sendo o snapshot da reserva.

### 3.4 Tela (Operator e Manager, `BookingDetailView`)

Bloco **Operação**, reserva do Hub, `confirmed`, antes da entrada, com `bookings:write`:

- **Alterar datas** → `StaffChangeDatesDialog`: novas entrada e saída, prévia do servidor, confirmar.
  Na Básica a prévia mostra a linha "Upgrade para Flex (exigido para alterar datas)". No Manager,
  caixa "Não cobrar o upgrade" com motivo.
- **Fazer upgrade** (plano abaixo de Superflex) → `StaffFareUpgradeDialog`: Flex ou Superflex e o
  valor.
- PIX nos dois: `PixChargePanel` com QR, "Copiar código", validade e o texto para mandar no
  WhatsApp. Enquanto a janela está aberta, a reserva é relida a cada 3 segundos; quando as datas ou o
  plano mudam, a janela mostra "Pagamento recebido" (não precisa de RPC nova: o detalhe já é lido
  pelas RPCs do balcão).
- Reserva do site (white-label) não ganha os botões: as trocas do site são do site.

## 4. Parte 2: estender a saída com o carro no pátio

- **Quando:** depois do horário de entrada, reserva `confirmed`, `checked_in` ou `completed` sem
  `checked_out_at` e com a saída prevista há no máximo 30 dias (o alcance da tabela). Só a equipe
  com `bookings:write`.
- **Conta:** só a saída muda. Cotação nova `quote_booking_extension(booking, nova_saida)`: diárias da
  nova saída com a tolerância, preço pela `price_by_days` (ou `simulate_price` de hoje), diferença
  com piso zero (D4: saída menor não devolve) e checagem de vaga só nos dias acrescentados. A
  entrada no passado não é recusada, porque não muda. Qualquer plano, sem upgrade (D5).
- **Cobrança:** PIX `kind = date_change` com o marcador de extensão, dividido como a reserva, vaga
  dos dias novos segura até o PIX vencer. No webhook, aplica a saída nova; se a reserva estava
  `completed` e a saída nova é futura, volta para `checked_in` (o cron conclui de novo depois).
- **Tela:** o card "Dias a mais" ganha **Cobrar pelo Hub** para a saída escolhida, com o mesmo
  `PixChargePanel`. O valor cobrado é o da cotação do servidor, que pode diferir do preço de tabela
  do card quando a reserva tem cupom (3 reservas em 192 têm cupom, nenhuma ativa).
- **Termos v7:** o item 6.3 ganha a frase de que, depois da entrada, a saída é estendida pelo
  estacionamento, pela tabela do dia da compra, e paga por PIX.
- **Gate G-CP (Cloudpark):** Nationpark e Abbapark (Afonso Pena) mandam as reservas do Hub para a
  Cloudpark, e o QR de lá tem a saída antiga mais 1h. Antes de ligar a extensão nessas unidades,
  confirmar com o parceiro como a cancela trata a saída depois do horário, para o cliente não pagar
  duas vezes. Até a resposta, nas unidades com `integration_connection` ativa, a tela mostra
  "Ajuste a saída deste cartão na Cloudpark" ao lado do botão.

## 5. Fora do escopo

- Devolver diárias de quem sai antes depois da entrada (D4).
- Cobrança no balcão registrada no Hub sem PIX (D3).
- Cartão pelo operador (ADR-004).
- Troca de datas pelo próprio cliente depois da entrada: os Termos seguem "até o horário do
  check-in" para o cliente.

## 6. Testes

- `deno test`: `staffAccess` (escopo, dono, hub_admin, Financeiro barrado); `change-booking-dates-paid`
  (Básica com upgrade nos dois ramos, `waive_fare_upgrade` só hub_admin, totais escondidos sem
  `finance:read`); split da diferença com upgrade; `create-fare-upgrade` aceitando equipe.
- pgTAP: `quote_booking_extension` (entrada no passado, piso zero, vaga só dos dias novos, papel).
- Vitest: `StaffChangeDatesDialog`, `StaffFareUpgradeDialog`, `PixChargePanel` (detecção do pago),
  gate de escopo dos botões e do Cancelar, card "Dias a mais" com "Cobrar pelo Hub".
