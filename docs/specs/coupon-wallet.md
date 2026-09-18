# Área de descontos do cliente, carteira de cupons (E3.3)

> **Status:** ✅ implementado nas migrations `20260918160052_coupon_platform_wallet.sql`,
> `20260918160252_coupon_campanhas_lancamento.sql`, `20260918160600_coupon_evaluate_lock_internal.sql`
> e `20260918161025_coupon_wallet_por_reserva.sql`. Front em `src/features/customer-coupons/`, rota
> `/account/descontos`, painel no resumo do checkout.
>
> **Carimbo:** os quatro nomes batem com o `schema_migrations` do banco vivo. O repo está dezenas de
> migrations atrás do banco (há entradas até `20261121` lá que não existem aqui), então inventar
> carimbo alto colidiria: `20261030093000` já é de `destination_price_index_photo`. Confira o banco
> antes de numerar migration nova, e não só o `ls` do diretório.

O motor de cupom ([coupon-rules.md](./coupon-rules.md)) já resolvia código digitado, janela, limite
por usuário e restrição por tipo de vaga. O que faltava para virar uma **área de descontos** como a
do iFood e do 99: cupom que a Movepark oferece na rede inteira, uma carteira onde ele aparece sem o
cliente digitar nada, e a escolha na hora de pagar.

Relacionado: [coupon-rules.md](./coupon-rules.md) · [discount-rules.md](./discount-rules.md) ·
[payment-split.md](./payment-split.md) · [marketing-rfm.md](./marketing-rfm.md) ·
[capacidades-unidade.md](./capacidades-unidade.md)

## As quatro mudanças de base

| # | Mudança | Por quê |
|---|---|---|
| 1 | `coupon.company_id` aceita NULL = cupom da Movepark | Sem isso não existe campanha de rede, só promoção de um parceiro |
| 2 | `coupon.funded_by` (`platform` \| `company`) | Quem banca o desconto muda o repasse. Ver §3 |
| 3 | `coupon.max_discount_amount` | Teto do percentual, o "Até R$ 40 OFF" da referência. É o que impede a campanha de sangrar |
| 4 | `coupon.audience` + `coupon_wallet` | O cupom aparece na carteira sem código digitado |

### Precedência de código

Cupom de empresa vence cupom de plataforma com o mesmo código, porque é o mais específico. Sem essa
regra, um parceiro criando `BEMVINDO30` tornaria ambíguo qual desconto sai. O unique `(company_id,
code)` não alcança as linhas de plataforma (NULL não colide com NULL no Postgres), então existe um
índice parcial `coupon_platform_code_idx` sobre `lower(code) where company_id is null`.

## 1. Audiência: por que não é segmento de RFM

A audiência é **determinística**: contagem de reservas pagas e dias parado.

| `audience` | Quem vê |
|---|---|
| `code_only` | ninguém, só quem digita o código. É o **default**, então nenhum cupom existente mudou de comportamento |
| `public` | qualquer cliente logado |
| `first_purchase` | zero reservas pagas |
| `second_purchase` | exatamente uma reserva paga |
| `winback` | tem reserva paga e passou de `audience_inactive_days` sem voltar |

O [marketing-rfm.md](./marketing-rfm.md) já entrega 14 segmentos, e eles seriam o alvo natural. Não
são, por uma razão que a própria spec do RFM escreve: **o score é quintil sobre a base**, e o
quintil sempre preenche as cinco faixas. A base media, em setembro de 2026, **uma reserva**. Um
cupom mirando "campeões" iria para quem fosse o melhor entre um. `MINIMO_PARA_RFM_CONFIAVEL` é 25.

"Nunca comprou" e "está há 60 dias sem voltar" são verdade em qualquer tamanho de base. Quando a
base passar dos 25 clientes com compra, segmento de RFM entra como audiência nova, sem tocar em
nada disto.

**Audiência decide se o cupom APARECE; `coupon_evaluate` decide se ele VALE.** Cupom resgatado cujo
dono saiu da audiência continua aparecendo na carteira, com o motivo. Sumir sem explicação seria
pior para quem guardou.

## 2. As quatro campanhas de lançamento

Todas `funded_by = 'platform'`, `company_id = null`.

| Código | Audiência | Desconto | Objetivo |
|---|---|---|---|
| `BEMVINDO30` | `first_purchase` | 30%, teto R$ 40 | Ativação |
| `SEGUNDA15` | `second_purchase` | R$ 15 | Taxa de 1ª para 2ª reserva, a métrica que a apresentação nomeia (pág. 14) |
| `VOLTA20` | `winback` 60 dias | 20%, teto R$ 30 | Recuperação antes do churn |
| `LONGA25` | `public`, `min_days = 7` | R$ 25 | Ticket médio |
| `ACIMA200` | `public`, `min_amount = 200` | R$ 30 | Ticket, por piso de valor |
| `QUINZENA15` | `public`, `min_days = 15` | 15%, teto R$ 60 | Estadia longa |
| `AGORA10` | `public`, com prazo | 10%, teto R$ 25 | Conversão por urgência |

`VOLTA20` não tem `per_user_limit`: quem sumiu de novo e voltou de novo merece o mesmo convite.
`BEMVINDO30` e `SEGUNDA15` têm limite 1, o que é redundante com a audiência mas fecha a janela
entre criar a reserva e pagar, quando a contagem ainda não mudou.

## 3. Quem banca, e como isso chega no repasse

**Decisão do negócio: a Movepark banca a campanha dela.** O parceiro recebe o mesmo repasse que
receberia se o cupom não existisse, e o desconto sai da comissão.

Antes do E3.3, `buildSplit` calculava a comissão sobre o preço já descontado, então **o parceiro
absorvia qualquer cupom proporcionalmente**. Isso está certo para um cupom que o parceiro criou, e
errado para uma campanha da Movepark: seria o parceiro pagando marketing que não pediu.

```
Sem cupom, reserva de R$ 100, take rate 15%:
  parceiro 8500 · Movepark 1500

Com R$ 10 de cupom da MOVEPARK (cliente paga 9000):
  parceiro 8500 (inalterado) · Movepark 500   ← a comissão absorve

Com R$ 10 de cupom do PARCEIRO (cliente paga 9000):
  parceiro 7650 · Movepark 1350               ← comportamento de sempre, os dois caem
```

Implementação: `buildSplit` ganhou `platformFundedCents`, que volta para a base do repasse do
parceiro. As Edges `create-pix-charge` e `create-card-charge` leem
`price_breakdown.coupon.funded_by`.

**Por isso o teto é obrigatório.** Se o cupom de plataforma passar da comissão, pagar o parceiro
exigiria a Movepark pôr dinheiro do bolso e o gateway não aceita perna negativa: `buildSplit` recusa
com uma mensagem que aponta o `max_discount_amount`. `manager_upsert_platform_coupon` exige teto em
todo cupom percentual, para o erro não chegar no pagamento.

## 4. Onde o cliente aplica

**No checkout, não na página da unidade.** A página da unidade perdeu o campo de digitar cupom: a
escolha mora onde o cliente vê o total que vai pagar. Um link de campanha (`?cupom=`) continua
valendo e chega ao checkout já aplicado.

| Superfície | O que faz |
|---|---|
| `/account/descontos` | A carteira, acionável. Ver §4.1 |
| Resumo do checkout | Linha "Usar cupom" que abre a carteira no contexto da reserva, com veredito, motivo e valor |
| `/descontos` | **Vitrine pública**, sem login. Ver §4.2 |
| `/manager/marketing/cupons` | Onde a Movepark cria e pausa a campanha. Separada de `/operator/coupons`, onde o parceiro cria a dele e banca o desconto |

`apply_coupon_to_booking` / `remove_coupon_from_booking` mexem no total de reserva **`pending`** do
próprio cliente. Depois do pagamento a porta fecha: mudar o total quebraria o split já enviado.

### 4.1 A tela de descontos tem dois modos

Listar cupom sem poder fazer nada com ele é catálogo, não carteira. A tela olha se o cliente tem
**reserva em andamento** (`status = 'pending'` e `expires_at > now()`, a mais recente) e muda de
comportamento:

| Estado | O cartão oferece | O que acontece |
|---|---|---|
| Com reserva aberta | **Usar** | Aplica naquela reserva por `apply_coupon_to_booking` e leva para `/checkout/<code>` |
| Sem reserva aberta | **Guardar** | Grava o código na sessão (`storeCoupon`) e ele entra sozinho na próxima reserva |

Com reserva aberta a carteira roda em contexto de pedido, então cada cartão vem com veredito,
motivo e o desconto real: é o mesmo seletor do checkout, alcançado por outra porta.

Sem reserva aberta **não existe pedido para julgar**, e prometer "disponível" ali seria mentira: o
desconto depende do preço, do tipo de vaga e de a unidade fechar a reserva no Hub. Por isso o
cartão mostra condições e o botão fala em guardar, não em usar.

### 4.2 A vitrine pública, para quem ainda não tem conta

A carteira exige login, e `BEMVINDO30` é campanha de **aquisição**: quem nunca reservou, que é o
alvo, nunca via que o desconto existia. `/descontos` fecha esse furo.

Duas defesas moram no servidor, não na tela:

**`coupon.is_advertised`** separa "existe" de "é anunciado". Campanha de retenção pode continuar
funcionando sem virar cartaz. O nome não é `is_public` para não colidir com `audience = 'public'`:
um diz QUEM pode usar, o outro se vira propaganda. Um `CHECK` impede cupom de parceiro de entrar,
porque a página é da rede e dar holofote a uma empresa seria desigual.

**A página ainda NÃO é linkada para o cliente.** Ela ficou fora do rodapé, do menu do celular e
do sitemap (está em `SITEMAP_OPT_OUT` com o motivo escrito). Isso é o que sustenta o ADR-009 hoje:
cupom só vale onde a reserva fecha no Hub, e **nenhuma unidade vendável é `checkout_mode = 'hub'`**
(as 18 com preço são todas `external`). Sem público, não há promessa; com público, haveria.

`public_coupon_offers()` devolve **todas** as campanhas anunciadas, sem esconder nada, para o time
ver o catálogo como o cliente verá. O guard não sumiu, mudou de lugar: a RPC continua devolvendo
**`honored_by_units`**, e ele é a condição de religar os links.

> **Checklist para tornar a página pública:** confira `public_coupon_offers().honored_by_units`.
> Enquanto for zero, nenhuma reserva aceita cupom e anunciar violaria o ADR-009. Quando passar de
> zero, mova `/descontos` de `SITEMAP_OPT_OUT` para `SITEMAP_STATIC_ROUTES` e devolva o link ao
> rodapé e ao menu do celular (o contrato de paridade entre os dois vai cobrar os dois juntos).

A contagem usa os **mesmos filtros do `get_pricing_data`**, que é a definição de unidade que
realmente vende. Contar `pricing_rule` sozinho mentiria: as 20 unidades hub têm regra e nenhuma é
vendável. A RPC não roda `simulate_price` de propósito, porque a chamada é anônima e o `anon` tem
`statement_timeout` curto.

### O cartão em formato de ticket

O desenho segue a referência: selo de audiência, valor grande, condição e um canhoto com o código,
separado por picote. Três detalhes só apareceram medindo no navegador, e cada um estava silencioso:

- `overflow-hidden` no cartão **cortava os dois furos** laterais, que ficam de propósito para fora
  da borda. O cartão não pode ter overflow escondido, e o canhoto arredonda os próprios cantos.
- As classes `-left-2.5` / `-right-2.5` **não geram CSS** neste projeto (computed vinha `left: 0`),
  e os dois furos empilhavam no canto esquerdo. O deslocamento foi para `style` inline.
- `[writing-mode:vertical-rl]` como classe arbitrária **também não gera regra**: o computed ficava
  `horizontal-tb` e o código transbordava (82px de texto num canhoto de 56px). Também foi para
  inline.

O `terms` **não** é renderizado no ticket: as condições saem dos campos, e o texto livre repetia as
mesmas frases, deixando cada cartão dizendo "Vale na primeira reserva" duas vezes. O `terms`
continua servindo à carteira.

O canal do "guardar" é o **mesmo do link de campanha** (`?cupom=`): a página da unidade já lê
`getStoredCoupon()` e passa o código ao criar a reserva. Não há caminho novo para manter, e o
cupom escolhido na carteira entra pelo trilho que já era testado.

`expires_at > now()` filtra no servidor porque reserva vencida continua `pending` na tabela (quem
muda o status é a rotina de expiração), e oferecer cupom para ela mandaria o cliente a um checkout
morto.

### A carteira avalia contra a reserva, não contra uma simulação nova

`customer_coupon_wallet(p_booking_id => ...)` usa o **subtotal congelado** em
`price_breakdown.subtotal`, que é o mesmo que `apply_coupon_to_booking` usa. Se simulasse o preço de
novo, o valor no botão poderia divergir do total depois de aplicar, porque o preço muda entre criar
a reserva e pagar.

### ADR-009

Cupom é promessa de transação. `coupon_evaluate` recusa com `not_available_here` quando a unidade
tem `checkout_mode = 'external'`, e a regra mora **no banco**, não só na UI, porque
`validate_coupon_public` é chamável direto. No front, `CheckoutCouponRow` não renderiza quando
`getLocationCapabilities(location).coupons` é falso.

## 5. Superfície

| Função | Quem chama | Gate |
|---|---|---|
| `customer_coupon_wallet(lpt, in, out, booking)` | carteira e checkout | `auth.uid()` |
| `coupon_redeem(code)` | botão "Resgatar" | `auth.uid()` |
| `apply_coupon_to_booking(booking, code)` | checkout | dono da reserva + `pending` |
| `remove_coupon_from_booking(booking)` | checkout | dono da reserva + `pending` |
| `manager_upsert_platform_coupon(...)` | Manager | `is_hub_admin()` |
| `manager_list_platform_coupons()` | Manager | `is_hub_admin()` |
| `manager_set_platform_coupon_active(id, ativo)` | Manager | `is_hub_admin()` |
| `coupon_customer_stats(profile)` | interno | sem grant a anon/authenticated |
| `coupon_evaluate(...)` | interno | sem grant a anon/authenticated |

## 6. Duas correções de segurança que vieram junto

Não eram do escopo, mas o escopo as tornou perigosas: o código passou a valer dinheiro da Movepark.

**`catalog_read_coupon` foi removida.** A policy liberava `SELECT` em todo cupom ativo para
qualquer um, inclusive `anon`: a lista de códigos era pública. Nada lê a tabela direto além do
painel do operador, coberto por `coupon_select`; o cliente passa por RPC `SECURITY DEFINER`.

**`coupon_evaluate` perdeu o grant a `anon` e `authenticated`.** A migration original fez `revoke
... from public`, que não alcança o grant que o Supabase dá a esses papéis por privilégio padrão
(mesma lição da `20261027094500`). Além da varredura de códigos, havia um vazamento pior: o
`p_profile_id` vem **do chamador**, então com a audiência nova um anônimo poderia passar o id de
outra pessoa e ler do erro (`not_first_purchase` / `not_second_purchase` / `not_winback`) se aquela
pessoa tem 0, 1 ou mais reservas pagas.

## 7. Testes

| Camada | Onde |
|---|---|
| Lógica pura | `src/features/customer-coupons/couponWallet.logic.test.ts` (21 casos) |
| Lógica do formulário | `src/features/customer-coupons/platformCoupons.logic.test.ts` (21 casos) |
| Os dois modos da tela | `src/routes/account/descontos.test.tsx` (3 casos) |
| Cartão da vitrine | `src/features/customer-coupons/publicOffers.logic.test.ts` (11 casos) |
| Guard da vitrine | `src/routes/descontos.test.tsx` (3 casos) e `coupon_wallet.test.sql` §10 |
| Split | `supabase/functions/_shared/payments/split.test.ts` (3 casos novos, incluindo a recusa por teto estourado) |
| Banco | `supabase/tests/coupon_wallet.test.sql` |
| Navegador | `e2e/windup/account-descontos.json` e `e2e/windup/manager-marketing-cupons.json` |

**O que ainda não dá para automatizar:** a carteira em contexto de pedido precisa de uma unidade
`checkout_mode = 'hub'` **com preço**, e hoje as 20 unidades hub do banco não têm tabela de preço
(as 18 que têm preço são todas externas). O caso E2E do checkout entra quando existir uma.

## 8. Pendências

- **Segmento de RFM como audiência** quando a base passar de 25 clientes com compra.
- **Atribuição:** quantas reservas cada campanha gerou. Depende do RF-007 do
  [marketing-rfm.md](./marketing-rfm.md), que ainda não rastreia reserva por campanha.
