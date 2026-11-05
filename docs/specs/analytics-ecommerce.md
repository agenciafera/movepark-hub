# Analytics de e-commerce (GA4 via dataLayer)

> **Status:** implementado e **validado com compra real em 05/11/2026** (reserva `MP-19DFA0`, Abbapark, PIX em produção, com adicional e Tarifa Flex): os sete eventos saíram na ordem, uma vez cada, e recarregar a confirmação não repetiu o `purchase`. Falta a configuração das tags no GTM (`GTM-KHBBZT9`, §6) e a conferência no DebugView do GA4.
>
> **Back-ref:** substitui o componente `DataLayer` do `movepark-nextjs` (white-label), que disparava `view_item`, `add_to_cart`, `begin_checkout` e `purchase`. Referência do Google: [eventos recomendados, seção "Online sales"](https://support.google.com/analytics/answer/9267735#online-sales).

## 1. Por que existe

O GA4 só monta funil de compra, receita por item e relatório de cupom quando o evento chega com o nome que ele conhece e com um objeto `ecommerce` no schema dele. O white-label já fazia isso; a jornada inteira agora vive no Hub e precisava do mesmo contrato, para o relatório não ficar cego no dia em que a venda muda de casa.

O GTM já está carregado em `index.html` (container `GTM-KHBBZT9`), com opt-out de medição (`mp_no_measure`) e CSP liberada para os coletores. Esta spec só define **o que** é empurrado no `dataLayer` e **quando**. A tag GA4 que lê isso é configurada no GTM (§6).

## 2. O que o front antigo fazia, e o que ficou para trás

O `movepark-nextjs` tinha um componente `<DataLayer event="..." />` renderizado em JSX, que empurrava o evento num `useEffect` com o estado do carrinho. Na tradução, ficaram de fora cinco hábitos que distorciam o relatório:

| Hábito antigo | Problema | Aqui |
|---|---|---|
| `view_item` e `add_to_cart` renderizados juntos na página do produto, e os três (`+ begin_checkout`) de novo na página de pagamento | O funil contava "adicionou ao carrinho" sem clique nenhum, e cada etapa inflava a anterior | Cada evento tem um momento só (§3) |
| O efeito reexecutava a cada mudança de preço (debounce de total) | O mesmo evento saía várias vezes na mesma visita | Dedupe por ref (lista, oferta, reserva) e por `localStorage` no `purchase` |
| `email`, `phone`, `user_id` e `new_customer` **dentro** de `ecommerce` | O GA4 não aceita PII, e ignora o que não conhece dentro do objeto | `user_id`, `new_customer` e `user_data` ficam fora de `ecommerce` (§4) |
| `tax: '0.00'`, `shipping: '0.00'` como string; `item_variant` igual ao `item_name`; `price` do item = total do carrinho | Campos que o GA4 descarta ou soma errado | Números, variante = tipo de vaga, `price` = valor do item |
| Nenhum `{ ecommerce: null }` entre pushes | O GTM mescla pushes consecutivos e os itens de um evento vazavam para o seguinte | `trackEcommerce` limpa antes de cada evento |
| `purchase` em duas páginas (`Finished` e `success`), sem dedupe | Recarregar a confirmação comprava de novo | Uma vez por reserva e por navegador, só até 24h depois do pagamento |

O que o antigo tinha e **ficou**: `affiliation: "Movepark"`, `coupon`, `currency`, `transaction_id` = código do pedido, e o contato do pedido para conversão otimizada (agora em `user_data`).

## 3. A jornada e os eventos (a maquete)

Sete eventos da lista "Online sales" do GA4, mais um nosso. Fora da lista, de propósito: `view_cart` (não há carrinho persistente, a reserva pendente é o carrinho), `add_shipping_info` (não há frete), `remove_from_cart` (desistir é a reserva expirar) e `refund` (o estorno é decisão de backoffice, e entraria por Measurement Protocol, não pelo navegador).

| # | Momento | Evento | Onde dispara | Dedupe |
|---|---|---|---|---|
| 1 | A lista de resultados aparece (`/search`, ou a vitrine de `/estacionamentos/<destino>`) | `view_item_list` | `src/routes/search.tsx`, `src/routes/destino.tsx` | Assinatura da lista (id + ids dos lotes, sem ordem): refetch da mesma lista não repete; filtro novo é lista nova |
| 2 | Clique num card | `select_item` | `ResultCard` → `ParkingCard.onClick` | Por clique |
| 3 | A ficha da unidade abre (`/estacionamentos/<destino>/<lote>`) | `view_item` | `src/routes/listing.tsx` | Uma vez por oferta (`listing.id`), e espera o "a partir de" do motor para sair com preço |
| 4 | "Reservar" cria a reserva pendente | `add_to_cart` | `ReservationCard.handleReserve`, após o `create-booking` responder | Por reserva criada |
| 4b | "Reservar no site do estacionamento" (unidade externa) | `external_checkout_click` (nosso) | `ReservationCard`, junto do `recordExitClick` | Por clique |
| 5 | O checkout abre com a reserva pendente | `begin_checkout` | `useCheckoutTracking` (em `src/routes/checkout.tsx`) | Uma vez por reserva, e só dentro do prazo do hold |
| 6 | O cliente escolhe o meio e manda pagar: "Gerar PIX" ou o submit do cartão | `add_payment_info` | `Step4Payment` (`trackPayment`) | Por tentativa (uma recusa seguida de nova tentativa conta duas) |
| 7 | A reserva confirma | `purchase` | `useCheckoutTracking` | `localStorage` (`mp_ga_purchase:<código>`) + janela de 24h sobre `paid_at` |

O que **não** dispara evento: o passo de adicionais (os adicionais entram como itens em `begin_checkout`, `add_payment_info` e `purchase`), o Clube, a conta do cliente e qualquer tela do Manager ou do Operator.

**Onde o `purchase` pode faltar.** Ele sai no navegador, quando a página do checkout vê a reserva confirmada. Quem gera o PIX, fecha a aba e paga depois só dispara o `purchase` se voltar ao link do checkout em até 24h. Para fechar esse buraco de vez o caminho é o Measurement Protocol do GA4, disparado pelo webhook de pagamento, com o mesmo `transaction_id` (o GA4 deduplica). Fica como evolução; hoje o número de referência para conciliar é a tabela `booking`, não o GA4.

## 4. O formato

Cada push é precedido de `{ ecommerce: null }`. O evento:

```js
{
  event: "purchase",
  ecommerce: {
    transaction_id: "MP-A8K7P2",      // código da reserva, o mesmo que o cliente vê
    value: 170.4,                      // total pago (com cupom e tarifa)
    currency: "BRL",
    coupon: "FERA10",                  // só quando há
    payment_type: "pix",               // pix | card
    tax: 0,
    shipping: 0,
    items: [
      {
        item_id: "aerovalet/guarulhos:covered",   // <empresa>/<unidade>:<tipo de vaga>
        item_name: "Aerovalet - Estacionamento Guarulhos",
        affiliation: "Movepark",
        item_brand: "Aerovalet",                  // empresa parceira
        item_category: "GRU",                     // destino (IATA quando aeroporto)
        item_category2: "estacionamento",         // estacionamento | adicional | tarifa
        item_variant: "Vaga coberta",             // tipo de vaga
        price: 151.4,                             // subtotal da vaga (antes do cupom)
        quantity: 1,
        stay_days: 2,                             // nosso: diárias
        fare_tier: "flex"                         // nosso: Básica/Flex/Superflex
      },
      {
        item_id: "adicional:<add_on_service_id>",
        item_name: "Lavagem simples",
        item_category2: "adicional",
        price: 17.07,
        quantity: 2
      },
      {
        item_id: "tarifa:flex",                   // a tarifa paga é item próprio; a Básica (grátis) não vira item
        item_name: "Tarifa Flex",
        item_category2: "tarifa",
        price: 12.9,
        quantity: 1,
        fare_tier: "flex"
      }
    ]
  },
  // Fora de ecommerce, para o GTM mapear em variável própria:
  user_id: "<auth.uid>",
  new_customer: true,                  // nenhuma outra reserva paga antes desta
  user_data: { email_address: "...", phone_number: "+55..." }   // conversão otimizada do Ads
}
```

Regras por evento:

- `view_item_list` e `select_item` levam `item_list_id`/`item_list_name` (`search` · "Resultados da busca"; `destino_<slug>` · "Destino <nome>") e cada item com `index` (posição na tela). Sem `value`.
- `view_item`, `add_to_cart` e `external_checkout_click` levam `currency`, `value` (o total da estadia, ou o "a partir de" quando não há datas) e o item da vaga. `add_to_cart` leva `coupon` quando aplicado, `fare_tier`, e o item da tarifa quando ela custa.
- `begin_checkout`, `add_payment_info` e `purchase` são montados do snapshot da reserva (`BookingForCheckout`): o `value` é `total_amount`, os itens vêm de `booking_item` mais a tarifa de `price_breakdown.fare`. `add_payment_info` leva `payment_type` e, no cartão, `installments`.
- **A soma de `price × quantity` dos itens bate com `value`** (menos o cupom, que o GA4 trata à parte). É por isso que a tarifa é item e não parte do preço da vaga: na validação de 05/11 o `begin_checkout` saía com a vaga a R$ 89,70 e o total a R$ 102,60, com a Flex invisível.
- `user_id` vai em todo evento de quem está logado. `new_customer` e `user_data` só no `purchase`.

**PII.** E-mail e telefone saem do snapshot da reserva (contato operacional, ADR-006), em `user_data`, fora de `ecommerce`. Esse objeto só sai do navegador se o GTM tiver uma tag que o leia (conversão otimizada do Google Ads, que faz hash antes de enviar). A tag GA4 não envia.

**Opt-out.** Com `mp_no_measure = "1"` o `gtm.js` não é injetado; os pushes continuam acontecendo num `dataLayer` que ninguém lê. Nada precisa mudar aqui.

## 5. Onde mora no código

| Arquivo | O quê |
|---|---|
| `src/lib/analytics.ts` | `trackEcommerce(event, ecommerce, extra)`: o push com reset; a união fechada `EcommerceEvent` |
| `src/lib/analytics-ecommerce.ts` | Os builders puros: item da busca, da ficha, da reserva; `purchaseEcommerce`; dedupe (`resultsSignature`, `wasPurchaseTracked`); `isNewCustomer`; `isFreshPurchase` |
| `src/features/checkout/useCheckoutTracking.ts` | `begin_checkout` e `purchase` a partir da reserva; `shouldTrack*` puros |
| `src/features/checkout/api.ts` | O select do checkout passou a trazer `public_name`, `destination(code, name)` e `payment.method` |
| `src/features/search/ParkingCard.tsx` | Ganhou `onClick` no link, que o `ResultCard` usa para o `select_item` |

Testes: `src/lib/analytics-ecommerce.test.ts`, `src/lib/analytics.test.ts`, `src/features/checkout/useCheckoutTracking.test.ts`.

**Evento novo passa por aqui.** A união `EcommerceEvent` é fechada e esta tabela é o contrato com o GTM. Adicionar um evento é: linha na §3, builder em `analytics-ecommerce.ts` com teste, e a tag no GTM.

## 6. O que configurar no GTM (`GTM-KHBBZT9`)

1. **Variáveis**: `user_id`, `new_customer` e `user_data` como variáveis de camada de dados (versão 2).
2. **Acionador**: evento personalizado com regex `^(view_item_list|select_item|view_item|add_to_cart|begin_checkout|add_payment_info|purchase)$`.
3. **Tag GA4 › Evento**: nome do evento = `{{Event}}`, "Enviar dados de e-commerce" ligado com fonte "Camada de dados", `user_id` mapeado nas propriedades do usuário.
4. `external_checkout_click`: tag GA4 própria (evento personalizado); registrar o nome em Administrador › Eventos para virar conversão se fizer sentido.
5. **Conversão otimizada do Ads** (opcional): a tag de conversão lê `user_data` do dataLayer.
6. Dimensões personalizadas de item no GA4: `stay_days` e `fare_tier` (escopo item), se quiser cruzar receita por tarifa.

## 7. Como validar

- **Local**: com `bun run dev`, o GTM carrega normalmente. No console, `window.dataLayer` mostra os pushes; o Tag Assistant (modo de visualização do GTM) mostra o que a tag montou.
- **Compra de teste**: unidade com `checkout_mode = hub` (a da Agência Fera, `peu+agenciafera@fera.ag`), cliente `peu+teste1@fera.ag`, cupom `FERA10`. O gateway está em sandbox: o PIX liquida sozinho em segundos e a confirmação dispara o `purchase`.
- **GA4 › DebugView**: com o parâmetro de depuração do Tag Assistant ligado, os sete eventos aparecem em tempo real com os itens expandidos. Os relatórios de monetização só consolidam no dia seguinte.
