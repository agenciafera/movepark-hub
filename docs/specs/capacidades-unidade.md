## 🔒 REGRA DE ARQUITETURA: vale para todo o projeto (não violar)
> Claude Code: trate este bloco como regra fixa do projeto (ADR), não como sugestão.
> Se algo conflitar, siga esta regra e sinalize.
> **ADR-009 · Promessa de transação renderiza por capacidade, nunca por template:** nenhum bloco que prometa cancelamento, alteração, tarifa, cupom, serviço extra, avaliação ou vaga garantida pode renderizar incondicionalmente. Todos leem de `getLocationCapabilities(location)`, cuja fonte primária é `location.checkout_mode`. Fato da unidade (endereço, fotos, amenidades, shuttle) renderiza sempre. Asterisco ou disclaimer que contradiga bloco visível é proibido: se a unidade não entrega, o bloco não existe.
> Canônico: gestao/regras-arquitetura.md

# Capacidades da unidade (E0.15)

> **Épico:** E0.15 · **Fase:** 0 · **ADR:** 009 · **Q vinculados:** Q-017, Q-018, Q-019

## O problema

A casca da página de unidade promete cancelamento, tarifa flexível, cupom, avaliação, vaga
garantida e responde FAQ genérica. Para unidade própria é verdade. Para unidade de saída
externa, não é, e quem anunciou foi a Movepark.

**O problema não é o discurso, é onde a promessa mora.** Uma promessa que existe por default
é uma promessa que não se consegue desligar por unidade.

## A linha que organiza

**Fato da unidade** fica sempre: endereço, fotos, distância, shuttle, coberto ou descoberto,
24 horas, amenidades. Descreve o lugar e é verdade independente de onde a reserva fecha.

**Promessa de transação** sai quando o checkout é externo: quem cumpre é o parceiro.

## Mapa bloco a bloco

| Bloco | Própria | Externa | Modelagem |
|---|---|---|---|
| Amenidades, fotos, endereço, shuttle | mostra | **mostra** | `amenity`, `location` |
| Preço | motor do Hub | tabela espelhada, com data | `pricing_rule` / `pricing_tier` (E0.13) |
| Tarifas Flex e Superflex | mostra | **não renderiza** | `fare` |
| Cancelamento e alteração | mostra | **não renderiza** | benefícios da `fare` |
| Cupom de desconto | mostra | **não renderiza** | `coupon.company_id` |
| Serviços extras | mostra | **não renderiza** | `location_add_on_service` |
| Avaliações e nota | mostra | **não renderiza** | `review.booking_id` |
| Vaga garantida | mostra | **não renderiza** | depende de o Hub controlar disponibilidade |
| FAQ | global + da unidade | **só escopo da unidade** | `faq.scope` + `location_id` |

Dois detalhes que economizam trabalho:

**O FAQ já é escopável.** `faq_scope` tem `global`, `location`, `destination`. Basta excluir
o escopo global nas externas. Zero mudança de schema.

**As avaliações se resolvem sozinhas.** `review` está amarrado a `booking_id`, e unidade
externa não gera booking no Hub. O cuidado é a casca não renderizar bloco vazio nem chip de
nota, senão parece nota zero.

**Vaga garantida é inegociável.** É promessa de desempenho sobre capacidade que o Hub não
controla. Cliente chega, não tem vaga, e a página dizia garantida.

## Implementação

Um objeto tipado, fonte única, não booleanos espalhados:

```ts
getLocationCapabilities(location) → {
  fares, cancellation, dateChange, coupons, addOns,
  reviews, guaranteedSpot, globalFaq, hubCheckout
}
```

`checkout_mode = 'external'` derruba o conjunto de uma vez, com espaço para exceção explícita
(uma unidade própria pode não aceitar cupom).

**Trava contra decaimento:** um teste que falha se um bloco de promessa renderizar sem
consultar a capacidade. Sem isso, em três sprints alguém adiciona um selo direto na casca e o
problema volta calado.

## Declaração de responsabilidade

Não é asterisco nem rodapé. É informação positiva no ponto de decisão, perto do CTA.
**Texto pendente de revisão jurídica (Q-017).** Rascunho em avaliação:

> **A reserva desta unidade é feita e administrada por [Nome].** As condições de
> cancelamento, alteração e o atendimento durante a estadia são definidos por ela.

Isso é diferente de "você está saindo do Movepark": não cria fricção nem tela intermediária.
A regra é **silêncio na transição, clareza na política**.

## Base legal (não é parecer; levar ao jurídico)

Oferta vincula o fornecedor (CDC art. 30); omissão relevante é publicidade enganosa (art. 37
§3); cláusula restritiva exige destaque, não rodapé (art. 54 §4); solidariedade na cadeia
(art. 7 § único e art. 25 §1). Asterisco não transfere responsabilidade: documenta que se
sabia da divergência.

