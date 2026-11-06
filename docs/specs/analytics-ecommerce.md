# Analytics de e-commerce (GA4 via dataLayer)

> **Status:** implementado e **validado com compra real em 05/11/2026** (reserva `MP-19DFA0`, Abbapark, PIX em produção, com adicional e Tarifa Flex): os sete eventos saíram na ordem, uma vez cada, e recarregar a confirmação não repetiu o `purchase`. No mesmo dia o `purchase` ganhou a via do servidor (Measurement Protocol, §3), disparada pelo webhook de pagamento. Falta a configuração das tags no GTM (`GTM-KHBBZT9`, §6), o segredo da API do Measurement Protocol nas Edges (§6) e a conferência no DebugView do GA4.
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
| 7 | A reserva confirma | `purchase` | `useCheckoutTracking` (navegador) **e** `_shared/ga4.ts` (servidor, pelo webhook) | Navegador: `localStorage` (`mp_ga_purchase:<código>`) + janela de 24h sobre `paid_at`. Servidor: `booking.ga_purchase_sent_at`. Entre os dois: o GA4 deduplica pelo `transaction_id` |

O que **não** dispara evento: o passo de adicionais (os adicionais entram como itens em `begin_checkout`, `add_payment_info` e `purchase`), o Clube, a conta do cliente e qualquer tela do Manager ou do Operator.

**O `purchase` sai por duas vias, e o GA4 fica com uma.** No navegador ele sai quando a página do checkout vê a reserva confirmada, e isso deixava um buraco: quem gera o PIX, fecha a aba e paga depois só voltava ao checkout por acaso, e a venda sumia do GA4. Desde 05/11/2026 o ponto de confirmação do pagamento (o webhook da Pagar.me e, quando o webhook se perde, a reconciliação `reconcile-confirmations`) manda o mesmo evento pelo **Measurement Protocol** (`supabase/functions/_shared/ga4.ts`, `sendPurchase`), com o mesmo `transaction_id` (código da reserva), e o GA4 deduplica as duas vias em até 72h. O disparo do navegador **continua**: é ele que carrega o `user_data` da conversão otimizada e a sessão inteira; o servidor é a rede de segurança.

Como o servidor casa o hit com a sessão de quem comprou: o `ReservationCard` manda no `create-booking` o `client_id` (cookie `_ga`) e o `session_id` (cookie `_ga_<stream>`), lidos por `src/lib/ga-cookie.ts`, e a Edge grava os dois na reserva (`booking.ga_client_id`, `booking.ga_session_id`), depois de conferir o formato. Sem cookie (opt-out, bloqueador, reserva criada por agente), o servidor manda com o `user_id` como `client_id`: o evento entra, a receita conta, mas o GA4 não liga esse hit à sessão do navegador e o cliente aparece como usuário novo. O corpo leva `timestamp_micros` com o `paid_at` quando o pagamento tem menos de 72h (o GA4 descarta carimbo mais velho), `engagement_time_msec` para o hit contar como atividade, `new_customer` como parâmetro do evento (no navegador ele fica fora de `ecommerce`) e `event_source: "server"` para separar as duas vias num relatório.

O envio é **best-effort por contrato**: `sendPurchase` nunca lança, roda pós-resposta e nunca na frente da confirmação (mesmo espírito do ADR-011). A guarda `booking.ga_purchase_sent_at` é reivindicada antes do POST, para a reentrega do webhook não mandar de novo, e liberada se o GA4 ou a rede falharem, para a próxima tentativa valer. Sem os segredos `GA4_MEASUREMENT_ID` e `GA4_API_SECRET` nas Edges (§6) o módulo não faz nada e avisa no log. O que não vai pelo servidor: `user_data` (a conversão otimizada do Ads exige hash e consentimento que só o navegador tem) e qualquer outro evento da jornada. O número de referência para conciliar continua sendo a tabela `booking`, não o GA4.

### 3.1 O bloco `partner`: conversão do Google Ads por unidade

O container GTM do site é um só para todos os parceiros, e uma tag de conversão do Google Ads pertence a **uma** conta (`AW-xxx`) e a **uma** ação (o rótulo). Até 05/11/2026 a tag `[Virapark] Purchase` disparava em toda compra do site, de qualquer parceiro, porque o acionador não tinha condição: a conta do Virapark contava venda da Abbapark como conversão própria.

A decisão (Q de 05/11/2026): o de para entre unidade e conta de Ads mora **no cadastro da unidade**, não numa tabela do GTM nem numa tag por parceiro. `location.ads_conversion_id` e `location.ads_conversion_label` (migration `20261201220000`), editados no Manager na seção **"Conversão e mídia paga"** do formulário da unidade, só por `hub_admin` (trigger `location_ads_conversion_guard`, mesma régua de `location_checkout_mode_guard`). Os dois têm formato fechado por constraint e andam juntos: metade preenchida é recusada, porque metade configurada não dispara nada e a tela pareceria pronta.

Os três eventos do checkout (`begin_checkout`, `add_payment_info`, `purchase`) saem com o bloco **fora** de `ecommerce`:

```js
partner: {
  company_slug: "virapark",          // identifica a unidade: location.slug só é único por empresa
  location_slug: "virapark",
  destination_code: "VCP",
  ads_conversion_id: "AW-326904374", // null quando a unidade não tem conta própria
  ads_conversion_label: "EaA6CMu82aYbELbU8JsB",
}
```

No GTM é **uma tag só**, "Compra - Parceiro" (conversão do Google Ads), com o id e o rótulo lidos de variáveis de camada de dados (`partner.ads_conversion_id`, `partner.ads_conversion_label`) e acionador `purchase` **quando** `partner.ads_conversion_id` não está vazio. A tag da Movepark (`AW-11286871587`) segue fixa, disparando em toda compra. Parceiro novo é dois campos preenchidos na ficha da unidade; ninguém abre o GTM. Unidade sem os campos não dispara conversão de parceiro nenhuma.

Por unidade, e não por empresa, porque o parceiro pode ter uma conta de Ads por praça; empresa com uma conta só repete os valores em cada unidade. Os dois valores não são segredo (já aparecem no código-fonte de qualquer página com a tag), por isso ficam na `location` e saem no `dataLayer`. O mesmo bloco serve mais tarde para pixel da Meta e remarketing por parceiro, acrescentando campos, sem mexer no formato dos eventos.

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
| `src/lib/analytics-ecommerce.ts` | Os builders puros: item da busca, da ficha, da reserva; `purchaseEcommerce`; `partnerFromBooking` (§3.1); dedupe (`resultsSignature`, `wasPurchaseTracked`); `isNewCustomer`; `isFreshPurchase` |
| `src/features/locations/useLocationForm.ts`, `LocationSections.tsx` | Seção "Conversão e mídia paga" do formulário da unidade (só Manager): `splitAdsSnippet` (colar o snippet inteiro preenche os dois), `validateAdsConversion` (espelha as constraints) |
| `supabase/migrations/20261201220000_location_ads_conversion.sql` | `location.ads_conversion_id`/`ads_conversion_label`, constraints de formato e do par, trigger `location_ads_conversion_guard` (só `hub_admin`), seed do Virapark. pgTAP: `supabase/tests/location_ads_conversion.test.sql` |
| `src/features/checkout/useCheckoutTracking.ts` | `begin_checkout` e `purchase` a partir da reserva; `shouldTrack*` puros |
| `src/features/checkout/api.ts` | O select do checkout passou a trazer `public_name`, `destination(code, name)` e `payment.method` |
| `src/features/search/ParkingCard.tsx` | Ganhou `onClick` no link, que o `ResultCard` usa para o `select_item` |
| `src/lib/ga-cookie.ts` | Lê `client_id` e `session_id` dos cookies do GA4; `gaIdsPayload()` entra no corpo do `create-booking` (`ReservationCard`) |
| `supabase/functions/create-booking/logic.ts` | `decidirGa`: confere o formato dos dois ids e monta o patch de `booking.ga_client_id`/`ga_session_id` |
| `supabase/functions/_shared/ga4.ts` | `sendPurchase`: o `purchase` pelo Measurement Protocol; `purchaseItems` espelha `itemsFromBooking`, `tituloDaUnidade` espelha `parkingName.ts` |
| `supabase/functions/pagarme-webhook/index.ts`, `reconcile-confirmations/index.ts` | Chamam `sendPurchase` depois da confirmação, pós-resposta |
| `supabase/migrations/20261201210000_booking_ga_client.sql` | `booking.ga_client_id`, `ga_session_id`, `ga_purchase_sent_at` |

Testes: `src/lib/analytics-ecommerce.test.ts`, `src/lib/analytics.test.ts`, `src/features/checkout/useCheckoutTracking.test.ts`, `src/lib/ga-cookie.test.ts`; no Deno, `supabase/functions/_shared/ga4.test.ts` (payload, guarda, erro engolido) e `create-booking/logic.test.ts` (`decidirGa`).

**Os itens têm duas cópias de propósito.** `purchaseItems` (Deno) e `itemsFromBooking` (front) montam o mesmo schema a partir da mesma reserva, porque Deno não importa do `src/`. Mudou um campo de item, muda nos dois e nos dois testes.

**Evento novo passa por aqui.** A união `EcommerceEvent` é fechada e esta tabela é o contrato com o GTM. Adicionar um evento é: linha na §3, builder em `analytics-ecommerce.ts` com teste, e a tag no GTM.

## 6. O que configurar no GTM (`GTM-KHBBZT9`)

**Como o container está hoje (visto em produção em 05/11/2026):** o GA4 sai por tagueamento server-side em `stape.movepark.co`, para duas propriedades (`G-L99117RGEY` e `G-X75P1WZBTM`), ao lado de três contas do Google Ads (`AW-17259932016`, `AW-326904374`, `AW-11286871587`) e do Clarity. Só `page_view` chega ao GA4: o `view_item_list` já está no `dataLayer` em produção e nenhum hit com `en=view_item_list` sai, porque não há tag para os eventos de e-commerce. É o que os passos abaixo criam. Sendo server-side, a tag GA4 do contêiner web manda para o contêiner do Stape, e a tag de lá repassa ao GA4; o objeto `ecommerce` passa inteiro.

1. **Variáveis**: `user_id`, `new_customer` e `user_data` como variáveis de camada de dados (versão 2).
2. **Acionador**: evento personalizado com regex `^(view_item_list|select_item|view_item|add_to_cart|begin_checkout|add_payment_info|purchase)$`.
3. **Tag GA4 › Evento**: nome do evento = `{{Event}}`, "Enviar dados de e-commerce" ligado com fonte "Camada de dados", `user_id` mapeado nas propriedades do usuário.
4. `external_checkout_click`: tag GA4 própria (evento personalizado); registrar o nome em Administrador › Eventos para virar conversão se fizer sentido.
5. **Conversão otimizada do Ads** (opcional): a tag de conversão lê `user_data` do dataLayer.
5b. **Conversão por parceiro (§3.1)**: variáveis de camada de dados `partner.ads_conversion_id` e `partner.ads_conversion_label`; acionador "evento personalizado `purchase`" com a condição `partner.ads_conversion_id` *não é igual a* vazio (`undefined` também não passa); uma tag "Conversão do Google Ads" com *ID de conversão* = `{{partner.ads_conversion_id}}`, *Rótulo* = `{{partner.ads_conversion_label}}`, *Valor* = `{{ecommerce.value}}`, *ID da transação* = `{{ecommerce.transaction_id}}`, *Moeda* = `{{ecommerce.currency}}`. Depois de publicada e conferida no Visualizar, a tag `[Virapark] Purchase` é **pausada** (não apagada): o par do Virapark já está na unidade. **Feito em 06/11/2026, versão 31 do container** (`Conversão por parceiro + e-commerce GA4`, publicada por google@coffeecup.cc): tag `[Parceiro] Compra - Google Ads` com acionador `CE | purchase - com conta de Ads do parceiro` (`partner.ads_conversion_id` casando `^AW-`), tag `🟠GA4 - E-commerce (7 eventos)` com acionador `CE | e-commerce GA4 (7 eventos)` (regex dos sete nomes, dados de e-commerce da camada de dados, propriedade de usuário `user_id`), variáveis `partner.ads_conversion_id`, `partner.ads_conversion_label`, `ecommerce.value`, `ecommerce.transaction_id`, `ecommerce.currency`, `user_id`. Pausadas na mesma versão: as quatro `🟠GA4 - *` antigas (mandariam cada evento duas vezes), `[Virapark] Purchase` e `🍪| Set Cookie`. Conferido no Tag Assistant: `view_item` chega ao `G-L99117RGEY` com itens e valor; um `purchase` simulado (R$ 0, `PREVIEW-GTM-*`, conta fictícia `AW-000000000`) disparou a tag do parceiro com id, rótulo, valor, moeda e transação certos. A limpeza do resto (tags do Google duplicadas, pixels da Meta extras, variáveis mortas) fica para uma versão à parte, item a item.
6. Dimensões personalizadas de item no GA4: `stay_days` e `fare_tier` (escopo item), se quiser cruzar receita por tarifa. Dimensões de evento, se quiser: `event_source` (navegador vs servidor) e `new_customer`.
7. **Measurement Protocol (o `purchase` do servidor).** No GA4: Administrador › Fluxos de dados › o fluxo web do site › *Chaves secretas da API do Measurement Protocol* › Criar. Depois, nas Edges do Supabase (projeto `mgaigbezdalbyuqiofcf`), os dois segredos:

   ```bash
   supabase secrets set GA4_MEASUREMENT_ID=G-XXXXXXXXXX GA4_API_SECRET=<chave criada no GA4>
   ```

   O `GA4_MEASUREMENT_ID` é o id do fluxo (`G-...`), o mesmo que a tag GA4 do GTM usa. Como o site alimenta duas propriedades (`G-L99117RGEY` e `G-X75P1WZBTM`, acima), os dois segredos aceitam lista separada por vírgula, pareada pela posição (`G-L99117RGEY,G-X75P1WZBTM` com `segredo1,segredo2`); cada propriedade precisa da própria chave, criada nela. O servidor manda o mesmo corpo às duas, direto ao Google, sem passar pelo Stape. Lista desparelhada desliga o envio. Sem os dois, o servidor não manda nada e o log das Edges avisa `GA4_MEASUREMENT_ID/GA4_API_SECRET ausentes`. Se o contêiner do Stape passar a guardar o id do cliente em cookie `FPID` (HttpOnly) em vez de `_ga`, o navegador deixa de conseguir ler o `client_id` e o servidor cai no `user_id`; o evento continua entrando, só não casa com a sessão. Para conferir antes de confiar, o endpoint de depuração (`/debug/mp/collect`, mesma query) devolve o que o GA4 acharia do corpo; o de produção responde 204 para qualquer coisa.

### 6.1 Limpeza do container (plano para a versão 32, item a item)

Levantado em 06/11/2026 a partir do export do container e do Tag Assistant. Regra: nada é apagado antes de uma semana pausado; o que já está pausado há meses pode sair. Cada item é aprovado em separado.

**A. Pausar agora (dado de todo o site indo para a conta de um parceiro)**

| Tag | O que faz hoje | Por quê pausar |
|---|---|---|
| `[Google Ads] Remarketing` | Remarketing `AW-326904374` (Virapark) em toda página | Todo visitante do movepark.co entra nas listas de remarketing do Virapark, inclusive quem procura Guarulhos |
| `Tag do Google AW-326904374` | Google tag do Virapark na inicialização de toda página (entrou em 09/09/2026) | Alimenta a conta de Ads do Virapark com o tráfego inteiro do site. A conversão do Virapark, quando ele fechar no Hub, vem pela tag `[Parceiro]`, que carrega o gtag sozinha |

**B. Decidir (precisa de resposta de quem conhece as contas)**

| Item | Situação | Pergunta |
|---|---|---|
| `[Meta] Pixel` (`4580381162192556`, toda página, editado em 30/07/2026) e `🔵00.00 | Page View` (`1303741108059436`, toda página) | Dois pixels recebem PageView; só o `1303741108059436` recebe AddToCart, InitiateCheckout e Purchase. O script `Meta Pixel ID Dinâmico` diz que `1303741108059436` é o da Movepark e `2429370164113369` o do Virapark | De quem é o `4580381162192556`? Se for o pixel novo da Movepark, os eventos 🔵 têm que migrar para ele; se for de outro cliente, pausa |
| `GA4 - Tag` (`G-2TS424EG0E`, pausada) | Propriedade GA4 que não aparece em nenhum outro lugar | É de alguém? Se ninguém reconhece, apaga |
| `FB_CONVERSIONS_API-*` (5 tags, 8 variáveis, 2 acionadores, tudo pausado desde out/2025) | Tentativa de Conversions API da Meta pelo gateway da Amazon, nunca ligada | Apagar, ou alguém ainda pretende ligar? |

**C. Consertar na mesma versão (hoje mandam vazio ou nunca disparam)**

| Item | Problema | Conserto |
|---|---|---|
| `Compra - Google Ads` (Movepark, `AW-11286871587` / `8HiACNmGk80YEKP8_4Uq`) | Pausada: a conta de Ads da **Movepark** não recebe conversão de compra nenhuma hoje | Religar com acionador `purchase` (`🟠AC | Purchase`), valor `{{ecommerce.value}}`, transação `{{ecommerce.transaction_id}}`, moeda `{{ecommerce.currency}}`, e "dados do novo cliente" ligado (o Hub manda `new_customer`) |
| `🔵00.03 | Purchase` (Meta) | Correspondência avançada lê `{{email}}` e `{{Ecommerce.phone}}`, que apontam para `ecommerce.email`/`ecommerce.phone` (schema do site antigo), logo vão vazios | Variáveis novas `user_data.email_address` e `user_data.phone_number` (o Hub manda fora de `ecommerce`, ver §4) e apontar os dois campos para elas |
| `🔵ViewContent` (Meta) | Acionador `🔵AC | View_content` escuta `view_content`, que o Hub não emite | Trocar o acionador para `🟠AC | View_item` |
| `User-Provided Data` | Lê `{{email}}` (vazio) | Apontar para `user_data.email_address`; usar nas tags de conversão do Ads (otimizada) |

**D. Apagar (já pausado há meses ou sem uso; risco zero)**

- Tags pausadas: `Typebot - *` (4), `Google Analytics - G4 (Nova)` (duplica a `🟠GA4 Config`), `Reserva Online - GA4`, `🟠GA4 Configuration - Dinâmico`, `🟢TAG`, `🔵Meta Pixel - Base Code - Dinâmico`.
- Acionadores sem tag: `Transaction Event`, `Single Garageinn CEV`, `Single Nationpark`, `Single Virapark`, `Non single or category pages`, `🔵AC | Checkout`.
- Variáveis mortas: `[Cookie] email`, `[Cookie] name`, `[Cookie] Homephone_meta`, `[Decoded] email`, `[Decoded] homephone_meta`, `[decoded] name` (dependiam da `Set Cookie`), `Detecta Origem`, `GA4 ID Dinâminco`, `Meta Pixel ID Dinâmico`, `🔵Pixel ViraPark` (o valor é o pixel da Movepark, nome errado), `Variavel | Phone`, `Ecommerce.phone`, `email`, `Tipo de Vaga`, `dLv - id` (igual a `ecommerce.transaction_id`).
- Depois de uma semana com a versão 31 estável: as quatro `🟠GA4 - *` antigas, `🍪| Set Cookie`, `[Virapark] Purchase` e os acionadores `🟠AC | *` e `🔵AC | *` que ficarem órfãos.

**Executado e publicado em 06/11/2026 como versão 32 (`Consertos de conversão e limpeza do container`; aprovado pelo usuário: B3, C e D; A ficou pendente de decisão; B1 e B2 em investigação pelo time).** Descoberta que mudou o desenho do grupo C: o **white-label legado** (`movepark-nextjs`, os oito `*-app.movepark.co`) carrega **o mesmo container** `GTM-KHBBZT9` e manda `email`, `phone`, `user_id` e `new_customer` **dentro** de `ecommerce`, enquanto o Hub manda `user_data.*`, `user_id` e `new_customer` na raiz. Por isso nenhuma tag lê o `dataLayer` direto: quatro variáveis de JavaScript fazem o fallback (`cv - email` = `user_data.email_address` ou `ecommerce.email`; `cv - phone`, `cv - user_id`, `cv - new_customer` idem), e `email`/`Ecommerce.phone` **ficam** no container por serem a ponta legada do fallback. Feito: `Compra - Google Ads` (Movepark) religada em `purchase` com valor, transação, moeda, dados fornecidos pelo usuário e "novo cliente" = `{{cv - new_customer}}`; as quatro tags da Meta (`🔵00.00` a `🔵00.03`) com e-mail e telefone em `cv - *`; `🔵ViewContent` em `view_item`; `🟠GA4 - E-commerce` com `user_id` = `{{cv - user_id}}`; `User-Provided Data` lendo `cv - email`. Apagados: as 5 tags, 2 acionadores e 8 variáveis `FB_CONVERSIONS_API-*`, 8 tags mortas, 6 acionadores órfãos e 11 variáveis mortas. Conferido no Tag Assistant com um `purchase` simulado em cada formato: no do Hub, `cv - *` vem de `user_data`/raiz e a tag de parceiro dispara; no legado, numa página limpa, `cv - *` vem de `ecommerce.*` e a tag de parceiro não dispara. Ficou para a semana seguinte, junto das tags pausadas: `dLv - id` (referenciada pela `[Virapark] Purchase` pausada). Armadilha para quem testar os dois formatos: o modelo do `dataLayer` do GTM persiste chaves entre pushes da mesma página, então o teste do legado só vale em página recarregada.

Fica como está: `Remarketing - Google Ads` (Movepark), `Vinculador de Conversões`, `🟠GA4 Config`, `🔵00.01`/`🔵00.02`/`🔵00.03` (os acionadores batem com os nomes do Hub), `dLv - total`/`dLv - Ecommerce Product Items` (lêem `ecommerce.value`/`ecommerce.items`, certos), `[Cookie]_ga`/`_fbp`/`_fbc`, `[Confing] Event ID`, `[Dado] event_time_unix`.

## 7. Como validar

- **Local**: com `bun run dev`, o GTM carrega normalmente. No console, `window.dataLayer` mostra os pushes; o Tag Assistant (modo de visualização do GTM) mostra o que a tag montou.
- **Compra de teste**: unidade com `checkout_mode = hub` (a da Agência Fera, `peu+agenciafera@fera.ag`), cliente `peu+teste1@fera.ag`, cupom `FERA10`. O gateway está em sandbox: o PIX liquida sozinho em segundos e a confirmação dispara o `purchase`.
- **GA4 › DebugView**: com o parâmetro de depuração do Tag Assistant ligado, os sete eventos aparecem em tempo real com os itens expandidos. Os relatórios de monetização só consolidam no dia seguinte.
- **A via do servidor**: paga, fecha a aba antes de a confirmação aparecer e confere no GA4 (Tempo real, ou DebugView se o corpo for mandado ao `/debug/mp/collect`) um `purchase` com `event_source = server` e o código da reserva. Na reserva, `booking.ga_purchase_sent_at` preenchido; no log da Edge `pagarme-webhook`, `[ga4] purchase enviado: <código> sessão do navegador`. Para a dedupe: a mesma compra com a aba aberta gera as duas vias e um `purchase` só nos relatórios.
