# Roteiro C - Jornada do consumidor: da busca ao PIX confirmado

Prova a jornada completa de quem reserva: home, busca, detalhe da unidade, escolha do tipo de
vaga, checkout, PIX e "Minhas reservas".

- **Baseline:** 21/07/2026, commit `ad8266c`.
- **Alvo:** produção (`hub.movepark.co` + projeto `mgaigbezdalbyuqiofcf`). Não existe staging do Hub.
- **Usuário:** `peu+teste1@fera.ag` (papel `customer`, já existe, não criar outro).
- **Automação:** `e2e/consumer/`, project `e2e-consumer` do Playwright.

Status de cada caso é **derivado de evidência**, nunca declarado. Quem revisar este arquivo
reconfere no código antes de mexer em qualquer linha de status.

## Sumário dos status

| Caso | O que prova | Status |
|---|---|---|
| C-01 | Vitrine da home agrupa por estacionamento | PRONTO |
| C-02 | Card da busca separa benefício de tipo de vaga | **FALHA** |
| C-03 | Contador da busca conta estacionamento, não vaga | **FALHA** |
| C-04 | Detalhe informa corretamente coberto ou descoberto | **FALHA** |
| C-05 | Detalhe permite escolher o tipo de vaga | **NÃO EXISTE** |
| C-06 | Escolher datas cria a reserva e segura a vaga | PRONTO |
| C-07 | Checkout passo 1: identidade e contato | PRONTO |
| C-08 | Checkout passo 2: veículo | PRONTO |
| C-09 | Checkout passo 3: gerar o QR do PIX | PRONTO |
| C-10 | PIX pago confirma a reserva e avança pro passo 4 | PRONTO |
| C-11 | "Minhas reservas" mostra a reserva com o tipo de vaga | PRONTO |
| C-12 | Pagamento pago não volta pra pendente | **FALHA GRAVE** (corrida, 25% dos pagamentos) |
| C-13 | Hold expirado libera a vaga e trava o checkout | PRONTO |
| C-14 | Baixar o voucher em PDF | PRONTO |
| C-15 | Voucher não existe antes da confirmação | PRONTO |
| C-16 | Upgrade de tarifa: Básica para Superflex | PRONTO |
| C-17 | Upgrade: downgrade e prazo bloqueados | PRONTO |
| C-18 | Upgrade respeita o preço da unidade | **FALHA** |
| C-19 | Cancelar dentro da janela devolve 100% | PRONTO |
| C-20 | Cancelar fora da janela é bloqueado | PRONTO |
| C-21 | Superflex cancela até 1 minuto antes | PRONTO |
| C-22 | Estorno de PIX fecha de forma assíncrona | PRONTO |
| C-23 | Copy da política de cancelamento bate com a tarifa | **FALHA** |

## Fixtures deste roteiro

Escolhidas por terem mais de um tipo de vaga, que é o eixo do roteiro.

| Papel na prova | Unidade | Tipos | Amenidade `covered`? |
|---|---|---|---|
| Caso da contradição | `abbapark / aeroporto-afonso-pena` | `covered`, `uncovered`, `premium` | **sim** |
| Caso de controle | `maxi-park / maxi-park` | `covered`, `uncovered`, `valet` | não |
| Caso mais barato | `motion-park` | `uncovered`, `covered` | não |

O par Abbapark e Maxi Park é o que separa causa de sintoma: os dois têm vaga coberta e
descoberta, mas só o Abbapark tem a **amenidade** `covered` marcada na location. Se o defeito
aparecer nos dois, a causa é o tipo de vaga; se aparecer só no Abbapark, a causa é a amenidade
vazando pra dentro do tipo. Confirmado: aparece só no Abbapark.

Consulta que reconstrói a lista quando a fixture mudar:

```sql
select c.slug as operator_slug, l.slug as location_slug,
       count(*) as tipos,
       string_agg(pt.code, ', ' order by pt.code) as codigos,
       exists(select 1 from location_amenity la
              where la.location_id = l.id and la.amenity_code = 'covered') as amenidade_covered
from location_parking_type lpt
join location l on l.id = lpt.location_id
join company c on c.id = l.company_id
join company_parking_type cpt on cpt.id = lpt.company_parking_type_id
join parking_type pt on pt.id = cpt.parking_type_id
where l.deleted_at is null and lpt.is_active
group by c.slug, l.slug, l.name, l.id
having count(*) > 1;
```

Uma unidade só aparece na busca pública com recebedor ativo (gate `is_listed`, commit `fd2f5a0`).
Fixture que sumir da busca sem motivo aparente: confira o `is_listed` antes de suspeitar do código.

## Efeitos colaterais de rodar este roteiro

Roda contra produção. Quem executar precisa saber disto antes, não depois.

- **C-06 em diante cria reserva de verdade** na unidade fixture, com `booking` e hold de capacidade.
- **C-09 e C-10 criam cobrança real no Pagar.me.** Na conta atual o PIX liquida sozinho em 1 a 3
  segundos, então a cobrança **é paga**, não fica pendurada. Use sempre a diária mais barata.
- **C-10 dispara e-mail de confirmação** para `peu+teste1@fera.ag`.
- **C-13 espera o hold expirar**, o que consome o tempo de `hold_minutes` do `app_setting`.

## Limpeza

`booking.location_id` é **RESTRICT** de propósito. As reservas criadas aqui não podem ser apagadas
para "limpar" o roteiro: elas nasceram numa unidade de parceiro real e apagá-las falsearia o
faturamento dele. A limpeza correta é **cancelar e estornar pelo produto**, não por `delete`.

```sql
-- reservas criadas pelo roteiro nas últimas 24h
select b.code, b.status, b.check_in_at, p.status as payment_status, p.amount
from booking b
left join payment p on p.booking_id = b.id
where b.customer_email = 'peu+teste1@fera.ag'
  and b.created_at > now() - interval '24 hours'
order by b.created_at desc;
```

Cada reserva confirmada por este roteiro é cancelada pela conta do cliente (`/bookings/:code`), o
que dispara o estorno pelo caminho de produção e ainda exercita o fluxo de cancelamento. Reserva
que ficar pendente expira sozinha pelo job de expiração, sem intervenção.

---

## C-01 · Vitrine da home agrupa por estacionamento  [PRONTO · sem cobertura E2E · `src/features/search/api.ts:265` (`dedupePopularOffers`)]

- **Antes:** home carregada em `/`, sem sessão.
- **Passos:** rolar até a seção de estacionamentos populares.
- **Depois:** nenhum estacionamento aparece em dois cards. Cada card leva a
  `/p/:operator/:location/:type`.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:** o dedupe da home guarda **só a oferta mais barata** por location
  (`api.ts:266-272`) e descarta as outras. O card fica preso a um tipo de vaga
  (`PopularParkingLots.tsx:55`), então uma unidade que só tem vaga premium some da vitrine se a
  descoberta dela ficar inativa. Passar neste caso não prova que os outros tipos existem, só que
  não há card repetido.

## C-02 · Card da busca separa benefício de tipo de vaga  [**FALHA** · verificado 21/07/2026 · `GroupedResultCard.tsx:222` e `:236-247`]

Este é o caso que originou o roteiro. O agrupamento **funciona**: a suspeita inicial de card
duplicado não se confirmou (`groupResultsByLocation`, `useSearchResults.ts:120`). O defeito é outro.

- **Antes:** `/search?destination=<destino do Abbapark>`, com a fixture Abbapark visível.
- **Passos:** localizar o card do Abbapark e ler a linha cinza abaixo do nome e os pills.
- **Depois esperado:** os tipos de vaga aparecem como **elemento próprio e clicável** (badge ou
  seletor), separados visualmente dos benefícios, e nenhum conceito aparece duas vezes.
- **Depois observado (21/07/2026):**
  - os tipos vêm como texto solto concatenado na linha de endereço:
    `Aeroporto Afonso Pena · Vaga Descoberta · Vaga Coberta · Vaga Premium`;
  - a linha é `line-clamp-1` e disputa espaço com nome da unidade e distância, então trunca;
  - o pill de benefício **`Coberto`** aparece no mesmo card, ao lado de tipos que incluem
    `Vaga Descoberta`.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:** `covered` existe como código de **amenidade** (`location_amenity`) e como código
  de **tipo de vaga** (`parking_type`). São tabelas diferentes renderizadas lado a lado, e é isso
  que dá a impressão de duplicação. Quem for corrigir precisa tratar os dois, não só um. O caso de
  controle é o Maxi Park: mesmos tipos, sem a amenidade, e lá o pill não aparece.

## C-03 · Contador da busca conta estacionamento, não vaga  [**FALHA** · verificado 21/07/2026 · `supabase/functions/search/index.ts:346-349`]

- **Antes:** `/search` com resultados.
- **Passos:** comparar o número do topo com a quantidade de cards na tela.
- **Depois esperado:** o contador reflete o que o cliente vê, ou deixa explícito que conta vagas.
- **Depois observado:** o topo diz `36 vagas em destino` e a lista mostra 18 cards. A Edge pagina
  por `location_parking_type`, não por location, então `total`, `limit` e `offset` contam vagas.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:** o efeito grave não é o número, é a **paginação**. Como o agrupamento acontece no
  cliente (`useSearchResults.ts:120`) e a página vem paginada por vaga, dois tipos da mesma unidade
  podem cair em páginas diferentes. Aí a mesma unidade **aparece em duas páginas**, cada uma
  mostrando parte dos tipos. Para reproduzir, use um destino com mais tipos que o `limit` e vá até
  a última página. Este é o único cenário em que a suspeita original de card duplicado se realiza.

## C-04 · Detalhe informa corretamente coberto ou descoberto  [**FALHA** · verificado 21/07/2026 · `src/routes/listing.tsx:291-292` vs bloco de amenidades]

- **Antes:** `/p/abbapark/aeroporto-afonso-pena/uncovered`.
- **Passos:** ler o subtítulo, a descrição do tipo e a seção "O que essa vaga oferece".
- **Depois esperado:** nada na página contradiz o tipo escolhido.
- **Depois observado:** a página diz `Vaga Descoberta` e `Vaga em área aberta, sem cobertura`, e
  três linhas abaixo lista **`Coberto`** entre os benefícios. Contradição direta, no exato ponto em
  que o cliente decide.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:** o título da seção é "O que essa **vaga** oferece", mas o conteúdo vem de
  `location_amenity`, que é da **unidade**. Essa é a causa raiz, e ela é a mesma do C-02: amenidade
  da location sendo apresentada como atributo do tipo de vaga. Corrigir só o card da busca deixa
  esta página quebrada. Repita em `/maxi-park/maxi-park/uncovered` para confirmar que sem a
  amenidade a contradição some.

## C-05 · Detalhe permite escolher o tipo de vaga  [**NÃO EXISTE** · verificado 21/07/2026 · `git log --since="60 days ago" -- src/routes/listing.tsx src/features/listing/` sem commit relacionado]

- **Antes:** `/p/abbapark/aeroporto-afonso-pena/uncovered`, unidade com três tipos ativos.
- **Passos:** procurar, na página, um controle que troque de descoberta para coberta.
- **Depois esperado:** um seletor de tipo de vaga que atualize preço, capacidade e descrição sem
  perder as datas já escolhidas.
- **Depois observado:** não existe. O tipo é o próprio recurso da rota
  (`/p/:operator/:location/:parkingTypeCode`, `src/routes.tsx:182`) e a página inteira é de um único
  `location_parking_type`. Os seletores do card de reserva são datas, tarifa, add-ons, passageiros e
  cupom. Nenhum troca o tipo.
- **Efeitos colaterais:** nenhum.
- **Armadilhas:** o card da busca **sempre** linka para o tipo mais barato
  (`cheapest_type.code`, `GroupedResultCard.tsx:100`). Somado à ausência do seletor, isso significa
  que **não há caminho pela UI para comprar vaga coberta** numa unidade onde a descoberta é mais
  barata. Só editando a URL na mão. É o achado de maior impacto comercial deste roteiro: o tipo mais
  caro fica inalcançável exatamente nas unidades onde ele existe.
  Não confunda com falha de dado: `item.parking_types` já chega completo no card, a lista está lá e
  não é usada.

## C-06 · Escolher datas cria a reserva e segura a vaga  [PRONTO · sem cobertura E2E · `src/features/listing/ReservationCard.tsx:283-296`]

- **Antes:** logado como `peu+teste1@fera.ag`, na página da fixture mais barata.
  ```sql
  select capacity from location_parking_type where id = '<lpt_id>';
  ```
- **Passos:** escolher check-in e check-out de 1 diária, manter a tarifa Básica, confirmar.
- **Depois:** navegou para `/checkout/:code`, e no banco:
  ```sql
  select status, expires_at, total_amount from booking where code = '<code>';
  -- status = 'pending', expires_at no futuro
  ```
- **Efeitos colaterais:** cria `booking` real e consome capacidade até expirar.
- **Armadilhas:**
  - Sem datas escolhidas a página mostra `A partir de R$ 0,00` e `Total R$ 0,00`. Zero aqui é
    "ainda não calculado", não "de graça". Não registre isso como erro de preço.
  - Sem sessão o fluxo desvia para `/login?next=...` (`ReservationCard.tsx:274-275`). A reserva
    **não** é criada nesse caminho, e a intenção é retomada depois do login (commit `064b57e`).
  - A tarifa (Básica, Flex, Superflex) muda o total e é fácil trocar sem perceber ao clicar perto.
    Confirme o total na tela contra `booking.total_amount`.
  - Data de entrada retroativa é bloqueada (commit `4eeae96`). Ao rodar o roteiro num dia diferente,
    ajuste as datas em vez de reclamar do bloqueio.

## C-07 · Checkout passo 1: identidade e contato  [PRONTO · sem cobertura E2E · `src/features/checkout/Step1Identity.tsx`]

- **Antes:** em `/checkout/:code`, passo 1.
- **Passos:** preencher nome, e-mail, telefone e CPF do pagador. Confirmar.
- **Depois:** avança para o passo 2, e no banco `booking.customer_first_name`,
  `customer_last_name`, `customer_email` e `customer_phone` estão preenchidos.
- **Efeitos colaterais:** grava a dica de telefone em `profiles.preferences.unverified_phone_hint`.
- **Armadilhas:**
  - **O telefone tem dois campos** (seletor de país e número). Mirar no errado deixa o número vazio
    e o passo trava sem mensagem clara.
  - O telefone digitado aqui é **contato do pedido, não credencial** (ADR-006). Ele não vira login e
    não escreve em `auth.users.phone`. Não registre "o telefone não virou login" como defeito.
  - O CPF é exigido só no passo do PIX, não aqui. CPF inválido passa batido no passo 1 e só estoura
    depois (`create-pix-charge/index.ts:162-167`), o que faz parecer erro de pagamento.

## C-08 · Checkout passo 2: veículo  [PRONTO · sem cobertura E2E · `src/features/checkout/Step2Vehicle.tsx`]

- **Antes:** passo 2 do checkout.
- **Passos:** informar placa, modelo e cor. Confirmar.
- **Depois:** avança para o passo 3 com os dados do veículo no resumo.
- **Efeitos colaterais:** pode salvar o veículo na conta do cliente.
- **Armadilhas:** o cliente de teste acumula veículos a cada execução. Antes de reportar
  "veículo duplicado", confira se não é resíduo de rodada anterior.

## C-09 · Checkout passo 3: gerar o QR do PIX  [PRONTO · sem cobertura E2E · `supabase/functions/create-pix-charge/index.ts`]

- **Antes:** passo 3, reserva `pending` e não expirada.
- **Passos:** aceitar os Termos, clicar em "Gerar PIX".
- **Depois:** QR na tela e, no banco:
  ```sql
  select provider, method, status, amount, expires_at, split
  from payment where booking_id = '<id>';
  -- provider = 'pagarme', method = 'pix'
  ```
- **Efeitos colaterais:** **cria cobrança real no Pagar.me.**
- **Armadilhas:**
  - O aceite de Termos é **server-authoritative** (`create-pix-charge/index.ts:88-94`): sem ele a
    Edge devolve 422 mesmo que a UI pareça ter deixado passar.
  - Gerar o PIX **renova o hold** da reserva (`:232-237`). O relógio recomeça, então o tempo restante
    que você anotou no C-06 deixa de valer.
  - A Tarifa fica **fora do split** com o parceiro (`_shared/payments/split.ts`). Ao conferir valores,
    compare o split contra o total menos a tarifa, não contra o total.
  - O código de mock (`useMockPayment`, Edge `mock-payment`) ainda existe no repo mas está **órfão**.
    Não há caminho de produção que o use. Não teste por ali achando que é o fluxo.

## C-10 · PIX pago confirma a reserva e avança pro passo 4  [PRONTO · sem cobertura E2E · `supabase/functions/pagarme-webhook/index.ts:369-372`]

- **Antes:** QR gerado no C-09, `payment.status = 'pending'`.
- **Passos:** aguardar. Na conta Pagar.me atual o PIX liquida sozinho. Medido no histórico de
  produção: 1 a 3 segundos entre `created_at` e `paid_at`.
- **Depois:** a tela avança sozinha para o passo 4 (polling de 2s, `checkout/api.ts:174-179`), e:
  ```sql
  select p.status, p.paid_at, b.status
  from payment p join booking b on b.id = p.booking_id
  where b.code = '<code>';
  -- payment.status = 'paid', paid_at preenchido, booking.status = 'confirmed'
  ```
- **Efeitos colaterais:** cobrança liquidada de verdade e e-mail de confirmação enviado.
- **Armadilhas:**
  - Quem confirma **não** é a `create-pix-charge`, é o **webhook**. Se a reserva não confirmar, o
    suspeito é a entrega do webhook, não a geração do QR. Comece por
    `get_logs` da função `pagarme-webhook`.
  - A confirmação passa por `confirm_or_refund_booking`: se a capacidade acabou entre a geração e o
    pagamento, a reserva é **estornada em vez de confirmada** (`:387` grava `refunded_at`). Isso é
    comportamento correto, não falha. Confira `refunded_at` antes de abrir bug.
  - A liquidação automática é característica da conta atual do gateway. Se um dia a conta virar
    produção real com PIX pago por humano, este caso deixa de ser automatizável e vira manual.

## C-11 · "Minhas reservas" mostra a reserva com o tipo de vaga  [PRONTO · sem cobertura E2E · `src/features/bookings/CustomerBookingCard.tsx:31-32`]

- **Antes:** reserva confirmada no C-10.
- **Passos:** abrir `/bookings`, aba "Próximas".
- **Depois:** a reserva aparece com o código, as datas e o **nome do tipo de vaga** contratado,
  batendo com o que foi escolhido no C-04.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:**
  - A rota é **`/bookings`**, não `/account/bookings`. O `AccountSidebar` não tem item de reservas
    (`AccountSidebar.tsx:19-26`), então quem procurar pelo menu da conta não acha e conclui, errado,
    que a funcionalidade sumiu.
  - São 4 abas (Próximas, Em uso, Histórico, Canceladas) com estado em `?tab=`. Reserva com check-in
    no passado não está na aba padrão. Antes de reportar "a reserva sumiu", confira as outras abas.

## C-12 · Pagamento pago não volta pra pendente  [**FALHA GRAVE E VIVA** · reproduzido em 21/07/2026 · corrida no `pagarme-webhook`]

> **Terceira versão deste caso.** A primeira acertou que havia defeito, mas errou o mecanismo. A
> segunda concluiu que estava **corrigido**, com base em datar as linhas contra o commit da guarda.
> Essa conclusão era **falsa**: a rodada transacional de 21/07 produziu **2 ocorrências novas em 8
> pagamentos**. O que faltava não era um dado, era executar. Análise de dado parado não substitui
> rodar o fluxo.

- **Antes:** reserva com PIX gerado, prestes a liquidar.
- **Passos:** deixar o PIX liquidar normalmente. Não é preciso forçar nada.
- **Depois esperado:** `payment.status = 'paid'`, e assim permanece.
- **Depois observado:** em 2 dos 8 pagamentos da rodada, o status terminou **`pending`** com
  `paid_at` preenchido e `updated_at` **posterior** ao `paid_at`, prova de uma segunda escrita.

### A causa: corrida, não guarda furada

O Pagar.me manda **três eventos quase simultâneos** para a mesma cobrança, e eles são processados em
paralelo. Registro real de `payment_webhook_event`:

```
MP-DF8B57
charge.pending  recebido 17:13:51.847   processado 17:13:53.458   <- terminou por ULTIMO
charge.paid     recebido 17:13:51.958   processado 17:13:52.657
charge.created  recebido 17:13:52.001   processado 17:13:53.324
```

A guarda de `index.ts:314-318` **lê o status e depois escreve, sem trava**. O handler do
`charge.pending` leu `pending` (antes do `charge.paid` gravar), passou pela guarda porque naquele
instante o pagamento ainda não era terminal, e no fim sobrescreveu o `paid`. É perda de atualização
clássica, não falha de lógica da guarda.

Por isso a análise por data enganou: a guarda **reduz** a janela, não a fecha. E o defeito só
aparece quando alguém de fato paga, o que quase não aconteceu entre 14/07 e 21/07.

### O dano, observado nesta rodada

O **MP-DF8B57** é o caso completo, e é sério:

1. cliente pagou R$ 33,90, `paid_at` gravado;
2. a corrida rebaixou o `payment` para `pending`;
3. o cliente cancelou dentro da janela da Superflex;
4. a `cancel-booking` leu `status = 'pending'`, concluiu que não havia pagamento e decidiu
   **`cancel_no_refund`**;
5. resultado: reserva cancelada, **R$ 33,90 cobrados e não devolvidos**, sem `refunded_at`.

Foi assim que o teste C-21a falhou: ele esperava `refunded: true`. **A falha do teste é o produto,
não o spec.**

- **Frequência medida:** 2 em 8 pagamentos, **25%**. Não é canto raro.
- **Efeitos colaterais:** nenhum ao investigar.
- **Armadilhas:**
  - **`refunded` com `paid_at` preenchido não é defeito, é projeto.** O código preserva a data do
    pagamento de propósito, para a reconciliação por período (`index.ts:329-331`).
  - **Não confunda com o C-22.** Lá, `status = 'paid'` com `refunded_at` preenchido é o estado
    correto logo após cancelar. Aqui é `paid_at` preenchido com status `pending`, que nunca é
    correto.
  - Ao corrigir, cuidado com o fix óbvio demais: **bloquear qualquer saída de `paid` quebra o
    estorno**, que precisa levar `paid` para `refunded`. Há teste ativo guardando esse caminho.
  - Guarda em memória não resolve. O conserto tem que ser **atômico no banco**: `UPDATE ... WHERE`
    condicional no status atual, ou `SELECT ... FOR UPDATE`, ou serialização por `provider_charge_id`.
  - Segundo caminho suspeito, ainda não investigado: quando o match por `provider_payment_id` falha,
    o fallback pega o **payment mais recente do booking** (`index.ts:259-267`), que pode ser outra
    cobrança (upgrade, troca de datas).
  - A cobertura de regressão é **`deno test` do webhook** para a lógica, mas a corrida só aparece de
    ponta a ponta. O C-21a serve de detector.

## C-13 · Hold expirado libera a vaga e trava o checkout  [PRONTO · sem cobertura E2E · `src/routes/checkout.tsx:168` e commit `7c37329`]

- **Antes:** reserva criada e deixada sem pagar até passar `expires_at`.
- **Passos:** deixar o contador zerar sem gerar PIX. Recarregar `/checkout/:code`.
- **Depois:** o checkout mostra estado explícito de reserva expirada, não tela muda. No banco a
  reserva sai de `pending` e a capacidade volta.
- **Efeitos colaterais:** consome o tempo de `hold_minutes` (configurável no Manager, commit `2942f93`).
- **Armadilhas:**
  - O modal keep-alive renova o hold. Se ele aparecer e alguém clicar por reflexo, o caso não prova
    nada. Ignore o modal de propósito.
  - Gerar o PIX **reinicia** o relógio (ver C-09). Este caso só vale sem gerar PIX.

---

# Parte 2 - Pós-pagamento: voucher, upgrade e cancelamento

## As tarifas, com os números reais

Antes dos casos, os números que o roteiro assume. Fonte: `supabase/migrations/20260717000000_fare_tiers.sql:46-70`.

| Tarifa | Preço | `cancel_window_minutes` | Cancela até |
|---|---|---|---|
| Básica | R$ 0,00 | `1440` | 24h antes do check-in |
| Flex | R$ 12,90 | `1440` | 24h antes do check-in |
| Superflex | R$ 24,90 | `1` | **1 minuto** antes do check-in |

Três coisas que contrariam a expectativa natural e precisam estar claras antes de alguém executar:

1. **Não existe reembolso parcial.** A regra é binária: dentro da janela devolve **100%**; fora da janela **não cancela**, o botão nem aparece e a Edge devolve 403 `cancel_window_closed`. Não procure faixa de 50% ou multa, não existe (`cancel-booking/logic.ts:38-70`).
2. **Básica e Flex têm a mesma janela de cancelamento.** A Flex não se diferencia por cancelamento, e sim por permitir alterar datas e trocar veículo (`bookings-detail.tsx:209` e `:256`). Quem executar o roteiro comparando só o cancelamento vai concluir, errado, que a Flex não entrega nada.
3. **Staff sempre cancela com estorno**, em qualquer horário (`logic.ts` no ramo `actor === "staff"`). Testar cancelamento fora da janela logado como admin não prova o gate do cliente.

## Armadilha central: `fare_cancel_until` é snapshot, não cálculo

Você pediu para simular datas. Este é o ponto onde isso dá errado em silêncio.

A janela **não é recalculada** no momento do cancelamento. Ela é congelada na criação da reserva
(`20260717000000_fare_tiers.sql:162-163`):

```sql
v_fare_cancel_until := p_check_in_at - (v_fare.cancel_window_minutes || ' minutes')::interval;
```

Quem tentar simular a janela mudando `booking.check_in_at` direto no banco **não muda nada**: o gate
lê `fare_cancel_until`, que continua com o valor antigo. O teste passa ou falha pelo motivo errado, e
a conclusão vai para o lado oposto do real.

As duas formas honestas de simular:

- **Preferida:** criar a reserva com o `check_in_at` que você quer testar. Para o C-20 (fora da
  janela) reserve com check-in para daqui a poucas horas; para o C-21 (Superflex) reserve com
  check-in para daqui a poucos minutos.
- **Aceitável, se precisar mexer no banco:** mover `check_in_at` **e** `fare_cancel_until` juntos, na
  mesma transação. Mover só um dos dois é o erro.

`fare_cancel_until` também é recalculado na mudança de datas e no upgrade de tarifa
(`20260720000000_fare_upgrade.sql:38-46`). Reserva que passou por qualquer um dos dois tem janela
diferente da que nasceu com ela.

---

## C-14 · Baixar o voucher em PDF  [PRONTO · sem cobertura E2E · `supabase/functions/voucher-pdf/index.ts`]

- **Antes:** reserva `confirmed` vinda do C-10.
- **Passos:** em `/bookings/:code`, clicar em "Baixar PDF". Repetir no passo 4 do checkout, que usa o
  mesmo hook (`Step4Confirmation.tsx:18,72`).
- **Depois:** abre um PDF com os dados da reserva e o QR de validação. No banco,
  `booking.voucher_url` está preenchido e o arquivo existe em `vouchers/<booking_id>.pdf`.
- **Efeitos colaterais:** grava arquivo no Storage de produção. É idempotente, reexecutar não duplica.
- **Armadilhas:**
  - O voucher **já existe antes de você clicar**. Quem gera é o webhook, no evento de pagamento
    (`pagarme-webhook/index.ts:397-401`), e a reconciliação repete se o webhook se perder. O botão só
    assina uma URL. Se o PDF não existir, o suspeito é o webhook, não o botão.
  - A URL assinada **vale 1 hora** (`voucher-pdf/index.ts:96-98`). Link guardado de uma execução
    anterior dá erro de acesso, o que parece bug de permissão e não é.
  - O bucket é **privado** (`public = false`). Tentar abrir a URL pública direto falha, e isso é o
    comportamento correto.
  - O QR do PDF e o QR da tela são gerados por caminhos diferentes: o da tela vem do cliente
    (`Voucher.tsx:20-22`), o do PDF vem da Edge. Divergência entre os dois é defeito de verdade,
    e é o único jeito de pegá-la é comparando os dois.

## C-15 · Voucher não existe antes da confirmação  [PRONTO · sem cobertura E2E · `_shared/voucher/fields.ts:63`]

- **Antes:** reserva `pending`, PIX ainda não pago.
- **Passos:** tentar baixar o voucher pela Edge, com o JWT do dono da reserva.
- **Depois:** HTTP 422, "Voucher disponível só após a confirmação do pagamento".
  `VOUCHER_BOOKING_STATUSES` aceita só `confirmed`, `checked_in` e `completed`.
- **Efeitos colaterais:** criar a reserva pendente consome capacidade até expirar. Não gera cobrança.
- **Armadilhas:**
  - **`pending` é o único status que produz 422.** A Edge filtra `.is("deleted_at", null)` na
    consulta, **antes** do gate de status. O cancelamento grava `deleted_at` junto com o status
    (`cancel_booking_with_release`), então reserva cancelada some da consulta e devolve **404**.
    Medido em produção com a MP-449353. Não use o 422 para detectar reserva cancelada; o que chega
    é 404. Vale o mesmo para `expired` e `no_show`, se também forem soft-deletados.
  - Provar este caso **exige criar uma reserva**, porque reserva pendente expira sozinha e o cliente
    de teste não costuma ter nenhuma parada. O spec cria a sua e para no passo 1 do checkout: tem o
    custo do C-06, sem cobrança.
  - Divergência conhecida entre servidor e tela: o servidor aceita `completed`, mas a UI só mostra o
    card com `confirmed` ou `checked_in` (`bookings-detail.tsx:99`). Reserva já concluída **tem**
    voucher válido e **não** mostra o botão. É inconsistência real, não erro de execução. Registre,
    não force.

## C-16 · Upgrade de tarifa: Básica para Superflex  [PRONTO · sem cobertura E2E · `supabase/migrations/20260720000000_fare_upgrade.sql:14-55`]

- **Antes:** reserva `confirmed` na tarifa Básica, com check-in no futuro.
  ```sql
  select fare_tier, fare_price_cents, fare_cancel_until, total_amount
  from booking where code = '<code>';
  ```
- **Passos:** em `/bookings/:code`, "Fazer upgrade de Tarifa", escolher Superflex, pagar o PIX do delta.
- **Depois:** `fare_tier = 'superflex'`, `fare_price_cents = 2490`, `total_amount` somado do delta, e
  **`fare_cancel_until` recalculado** para 1 minuto antes do check-in.
- **Efeitos colaterais:** cria uma **segunda cobrança PIX real**, separada da reserva.
- **Armadilhas:**
  - **Pular etapas é permitido:** Básica direto para Superflex funciona, não precisa passar pela
    Flex. Coberto por pgTAP (`fare_upgrade.test.sql:31-42`).
  - O upgrade é **só PIX** (`create-fare-upgrade/index.ts:142`). Não existe caminho de cartão. Não
    registre a ausência do cartão como defeito.
  - O split do upgrade é **100% Movepark**, não vai nada pro parceiro (`:96-104`). Ao conferir
    repasse, não espere ver esse valor no extrato da unidade.
  - O QR do upgrade expira em **1 hora**, diferente do hold da reserva (`:28`).
  - O webhook trata o upgrade num ramo que **retorna cedo** (`pagarme-webhook/index.ts:336-344`):
    não confirma reserva e não gera voucher. Voucher que não se atualiza sozinho depois do upgrade é
    esperado pelo código atual. Vale decidir se é o comportamento desejado.

## C-17 · Upgrade: downgrade e prazo bloqueados  [PRONTO · sem cobertura E2E · `create-fare-upgrade/index.ts:77-93`]

- **Antes:** uma reserva já em Superflex e outra com check-in no passado.
- **Passos:** tentar baixar de Superflex para Flex. Depois, tentar qualquer upgrade numa reserva cujo
  check-in já passou.
- **Depois:** downgrade devolve 400 (`deltaCents <= 0`), e a RPC ainda é noop idempotente como
  segunda barreira (`fare_upgrade.sql:34-36`). Upgrade após o check-in devolve 400.
- **Efeitos colaterais:** nenhum, os dois abortam antes de cobrar.
- **Armadilhas:**
  - Reserva **`pending`** aceita upgrade (`:74-76`). Dá para comprar upgrade de uma reserva ainda não
    paga. É intencional pelo código, mas merece confirmação de produto.
  - A **RPC não revalida prazo nem status**, só a Edge valida. Como o QR do upgrade vive 1 hora, um
    PIX gerado antes do check-in e pago depois **aplica o upgrade mesmo assim**. Para reproduzir:
    gerar o QR com o check-in perto, deixar passar, e pagar. É a brecha mais interessante deste caso.

## C-18 · Upgrade respeita o preço da unidade  [**FALHA** · verificado 21/07/2026 · `create-fare-upgrade/index.ts:85-90` vs `20260721000000_location_fare.sql:10`]

- **Antes:** uma unidade com `location_fare.price_cents_override` diferente do catálogo global.
- **Passos:** reservar nessa unidade e pedir upgrade.
- **Depois esperado:** o delta cobrado sai do preço **da unidade**, o mesmo que originou a reserva.
- **Depois observado:** o caminho de upgrade lê o catálogo **global** e ignora o override, em três
  pontos: a Edge (`index.ts:85-90`), a RPC (`fare_upgrade.sql:28`) e o front, que passa `lptId = null`
  (`src/features/fares/api.ts:53-60`).
- **Efeitos colaterais:** cobrança com valor errado.
- **Armadilhas:**
  - O efeito **muda de sinal** conforme o override: numa unidade com override mais barato que o
    global o cliente **paga a mais**; com override mais caro, paga a menos. Testar em uma unidade só
    esconde metade do problema.
  - Caso extremo: se o `fare_price_cents` já gravado for maior que o preço global, a RPC vira noop e
    **o cliente paga sem receber o upgrade**. Este é o cenário a provar primeiro.
  - Pré-requisito: hoje pode não haver unidade com override em produção. Confira antes:
    ```sql
    select lf.*, l.slug from location_fare lf
    join location_parking_type lpt on lpt.id = lf.location_parking_type_id
    join location l on l.id = lpt.location_id
    where lf.price_cents_override is not null;
    ```
    Sem nenhuma linha, o caso fica **não executável** até existir uma. Diga isso em vez de dar por
    passado.

## C-19 · Cancelar dentro da janela devolve 100%  [PRONTO · sem cobertura E2E · `supabase/functions/cancel-booking/index.ts:147-185`]

- **Antes:** reserva `confirmed` e paga, tarifa Básica, com check-in a **mais de 24h**.
  ```sql
  select status, fare_tier, fare_cancel_until, check_in_at from booking where code = '<code>';
  -- fare_cancel_until no futuro
  ```
- **Passos:** em `/bookings/:code`, "Cancelar reserva", confirmar no diálogo.
- **Depois:** `booking.status = 'cancelled'`, capacidade liberada, e no `payment`:
  `refunded_at` preenchido, `refunded_amount` igual ao valor pago. O `status` **ainda pode estar
  `paid`**, e isso é correto: ver C-22.
- **Efeitos colaterais:** **estorno real no Pagar.me.**
- **Armadilhas:**
  - A ordem importa e é proposital: se o estorno falhar no gateway, a Edge **aborta sem tocar na
    reserva** (`:167-171`). Reserva que continua ativa depois de um erro de cancelamento não é bug,
    é a regra "nunca cancelar sem estornar".
  - `cancel_booking_with_release` é idempotente e nunca libera capacidade duas vezes
    (`20260630000000_payment_refund.sql:23-52`). Cancelar de novo é noop, não erro.
  - O cancelamento grava `deleted_at`. Reserva cancelada some das listagens que filtram soft delete,
    e aparece na aba "Canceladas" de `/bookings`. Não conclua que sumiu.

## C-20 · Cancelar fora da janela é bloqueado  [PRONTO · sem cobertura E2E · `bookings-detail.tsx:367-377` e `cancel-booking/index.ts:133-142`]

- **Antes:** reserva `confirmed` e paga, tarifa Básica, com check-in a **menos de 24h**. Leia a
  armadilha do `fare_cancel_until` acima antes de montar esta reserva.
- **Passos:** abrir `/bookings/:code`. Depois, chamar a Edge `cancel-booking` direto, por fora da UI.
- **Depois:** o botão de cancelar **não renderiza**, e no lugar aparece "A janela de cancelamento da
  sua tarifa já encerrou. Para cancelar, fale com o suporte." A chamada direta devolve **403** com
  `code: "cancel_window_closed"` e **nada é escrito no banco**.
- **Efeitos colaterais:** nenhum, o caminho aborta antes de cobrar ou estornar.
- **Armadilhas:**
  - Testar só pela tela **não prova nada**: ausência de botão pode ser CSS. A prova do gate é a
    chamada direta à Edge devolvendo 403. Faça as duas partes.
  - Não existe "cancelar sem reembolso" para o cliente. Foi decisão de produto, não lacuna
    (`logic.ts:17`). Não abra tarefa pedindo essa opção sem antes conversar.
  - Reserva **`pending`** (não paga) cancela em qualquer horário, sem estorno. Não confunda com
    quebra do gate: o gate vale para reserva paga.

## C-21 · Superflex cancela até 1 minuto antes  [PRONTO · sem cobertura E2E · `20260717000000_fare_tiers.sql:46-70`]

- **Antes:** reserva `confirmed` e paga na tarifa **Superflex**, com check-in daqui a poucos minutos.
- **Passos:** cancelar faltando mais de 1 minuto. Repetir outra reserva e tentar faltando menos.
- **Depois:** o primeiro cancela com estorno integral; o segundo é bloqueado igual ao C-20.
- **Efeitos colaterais:** estorno real.
- **Armadilhas:**
  - A janela é de **1 minuto**, o que dá pouquíssima margem para clicar. Prefira validar pelo campo
    `fare_cancel_until` e pela resposta da Edge, não pelo cronômetro.
  - Se a reserva chegou à Superflex por **upgrade** (C-16), a janela foi recalculada no upgrade. Se
    nasceu Superflex, veio da criação. Os dois caminhos precisam ser testados: é justamente onde um
    recálculo esquecido apareceria.
  - `check_in_at` muito próximo do agora esbarra no bloqueio de data retroativa da criação da reserva
    (commit `4eeae96`). Deixe alguns minutos de folga.

## C-22 · Estorno de PIX fecha de forma assíncrona  [PRONTO · sem cobertura E2E · `cancel-booking/index.ts:175-184` e `pagarme-webhook/index.ts:424-446`]

Este é o caso que responde ao "o estorno demora um pouco mais". Ele demora, e o roteiro precisa dizer
quanto e por quê, senão alguém abre bug de algo que ainda está no prazo.

- **Antes:** cancelamento feito no C-19, com `refunded_at` já preenchido.
- **Passos:** anotar o horário e acompanhar o `payment`.
- **Depois, em três tempos:**

  | Momento | `payment.status` | `refunded_at` | Quem escreveu |
  |---|---|---|---|
  | logo após cancelar | `paid` | preenchido | Edge `cancel-booking` |
  | webhook `charge.refunded` chega | `refunded` | preservado | `pagarme-webhook` |
  | webhook não chega | `refunded` | preservado | `reconcile-refunds` |

  ```sql
  select status, refunded_at, refunded_amount, refund_reason
  from payment where booking_id = '<id>';
  ```
- **Efeitos colaterais:** nenhum além do estorno já disparado.
- **Armadilhas:**
  - **`status = 'paid'` com `refunded_at` preenchido é o estado normal e correto** logo após o
    cancelamento, não uma inconsistência. É o `refundPending` do `index.ts:175`. Confundir isso com o
    defeito do C-12 é o erro mais provável deste roteiro inteiro. A diferença: no C-12 o problema é
    `paid_at` preenchido com status `pending`; aqui é `refunded_at` preenchido com status `paid`.
  - **Prazo máximo antes de virar bug:** a rede de segurança só olha estornos com `refunded_at`
    de mais de **15 minutos** (`reconcile-refunds/index.ts:23`) e o cron roda **a cada 15 minutos**
    (`20260724000001_reconcile_refunds_cron.sql:7-21`). No pior caso legítimo, o fechamento leva
    perto de **30 minutos**. Só depois disso vale abrir bug.
  - A decisão do webhook é pelo **tipo** do evento, não pelo `data.status`: o PIX manda
    `charge.refunded` carregando `data.status: "paid"` (`pagarme-webhook/index.ts:288`). Ler o status
    cru do payload leva à conclusão errada.
  - Estorno **parcial** feito na mão no painel do Pagar.me é tratado de forma defensiva: registra o
    valor e **não** cancela a reserva (`:293-310`). Não use o painel para "ajudar" o teste.
  - `reconcile-refunds` **não tem nenhum teste** hoje. É o único dos três caminhos de estorno sem
    cobertura, e a lógica está inline no `Deno.serve`, sem `logic.ts` extraído.

## C-23 · Copy da política de cancelamento bate com a tarifa  [**FALHA** · verificado 21/07/2026 · `src/features/bookings/cancellation.logic.ts:64-67`]

- **Antes:** reserva na tarifa **Superflex**.
- **Passos:** ler o bloco "Política de cancelamento" na página da unidade e no detalhe da reserva.
- **Depois esperado:** o texto reflete a janela da tarifa contratada.
- **Depois observado:** `CANCELLATION_POLICY_LINES` é texto fixo em **24 horas** e não reflete a
  Superflex, que cancela até 1 minuto antes. O cliente que pagou R$ 24,90 pelo benefício lê na tela
  que tem 24 horas.
- **Efeitos colaterais:** nenhum, é leitura.
- **Armadilhas:** é **copy estática, não afeta o gate**. O comportamento do sistema está certo; o
  texto é que está errado. Não registre como falha de cancelamento, senão a correção vai para o
  arquivo errado. A regra de copy do projeto manda passar pela skill `revisar-texto`.

---

## O que fica fora da automação, e por quê

| Caso | Motivo |
|---|---|
| C-05 | Não há o que automatizar: o recurso não existe. O spec entra como `test.fixme` e vira teste de aceite quando a tarefa de correção for entregue. |
| C-12 | Depende de reenviar evento no painel do Pagar.me. Cobertura correta é `deno test` do webhook, não navegador. |
| C-13 | Depende de esperar o hold inteiro. Fica manual até existir um jeito de encurtar `hold_minutes` só para a suíte. |
| C-15 | Chamada direta à Edge com JWT, sem navegador. Cobertura correta é `deno test` da `voucher-pdf`, que hoje não existe. |
| C-17 | A brecha do QR de 1 hora depende de esperar o check-in passar. O resto (downgrade, prazo) é automatizável. |
| C-18 | Depende de existir unidade com `price_cents_override`. Enquanto não existir, o caso não é executável. |
| C-21 | Janela de 1 minuto é curta demais para clique confiável em navegador. Automatize pela Edge e pelo banco. |
| C-22 | O fechamento assíncrono pode levar até 30 minutos. Fora do orçamento de tempo de um E2E; vira verificação de banco, feita depois. |
