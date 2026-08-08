# Espelhamento de preço do white-label (E0.13)

> **Épico:** E0.13 · **Fase:** 0 · **D vinculado:** D-008
> **Status:** implementado em 08/08/2026. Migrations `*_pricing_mirror.sql` e
> `*_pricing_mirror_cron.sql`, Edge `wl-price-mirror`, cron diário às 07:00 UTC.

Reconstrói no Hub a tabela de preço de uma unidade externa **amostrando** a API de cálculo do
parceiro. Sem consulta em tempo real.

## Por quê tempo real está fora

A busca do Hub ficaria refém do uptime do backend do parceiro, e página lenta mata o orgânico
que é a alavanca de +R$ 13,11 por reserva, a maior que existe hoje. Além do risco de
divergência entre o preço exibido e o cobrado, que é grave justamente porque o checkout
acontece no destino.

## O que a amostragem descobriu (Virapark, 03/08/2026)

Endpoint: `GET {wl_domain}/api/v3/cart/calculation-price?initial_date=&final_date=&category_slug=&product_slug=`

| Duração | price | R$/dia | old_price | R$/dia balcão |
|---|---|---|---|---|
| 12 horas | 40,00 | n/a | 40 | n/a |
| 1 dia | 40,00 | 40,00 | 40 | 40 |
| 1 dia 30 min | 40,00 | 40,00 | 40 | 40 |
| 1 dia 6 horas | 65,80 | n/a | 80 | 40 |
| 2 a 6 dias | n/a | 32,90 | n/a | 40 |
| 7 a 31 dias | n/a | 24,90 | n/a | 40 |

**Fatos:** preço é diária **uniforme por faixa**, não progressivo (3 dias = 32,90 × 3 = 98,70;
progressivo daria 105,80). `old_price` é sempre 40,00/dia, tabela de balcão própria, **não
multiplicador**. Tolerância de fração é **exatamente 60 minutos**; 61 min promove para a
diária seguinte **e reprecifica tudo na faixa nova**.

O campo `offer.code` (`1_1_i{min}_h{h}_d{d}_m{m}_y{y}`) informa como o WL decompôs a duração.

## Mapeamento para o schema do Hub: validado, 39/39

```
pricing_rule:
  strategy                 = 'uniform_by_duration'
  fractional_day_policy    = 'hour_tolerance'
  fractional_day_tolerance = 1.0
  old_price_strategy       = 'own_table'

pricing_tier (is_old_price = false):
  (from_day 1, to_day 1,    unit_price 40.00)
  (from_day 2, to_day 6,    unit_price 32.90)
  (from_day 7, to_day null, unit_price 24.90)

pricing_tier (is_old_price = true):
  (from_day 1, to_day null, unit_price 40.00)
```

Teste diferencial: 31 durações inteiras + 8 casos fracionados (12h, 1d+30/60/61min, 1d+6h,
6d+45/90min, 14d+30min). **Todos batem ao centavo.** O modelo do Hub reproduz a curva sem
aproximação, e nenhum conceito precisou ser forçado.

## O job

Cron determinístico. **Nunca modelo em runtime**: se alucinar uma célula, vende-se vaga com
preço errado e tem que honrar. Skill serve para construir o job e ler o relatório.

1. **Dias 1 a 31 nas bordas exatas** ⇒ agrupa faixas onde o `unit_price` muda. Sem chute,
   inclusive na fronteira do dia 6 para o 7.
2. **Busca binária de 0 a 24h** num dia fixo ⇒ `fractional_day_tolerance` (11 sondagens).
3. `old_price / dias` ⇒ tabela de balcão.
4. Gravar em `pricing_rule` + `pricing_tier` **com carimbo da amostragem**.
5. **Verificação diária:** reamostrar 4 ou 5 durações e comparar com o motor do Hub.
   Divergiu ⇒ alarme e a vitrine cai automaticamente para "a partir de" até alguém olhar.

**Custo:** 42 chamadas para reconstruir a tabela inteira de uma vaga, uns 40 segundos.

## Amostrar nas bordas, não em grade

O perigo está nas viradas: tolerância, virada de diária, faixas de 6-7, 15 e 30 dias. Grade
uniforme passa por cima de um degrau e interpola errado exatamente onde o preço muda.

## O passo 5 é teste diferencial

Comparar os dois motores nas mesmas entradas valida o motor de cálculo do Hub **inteiro**,
não só as unidades externas. É um motor rodando com dinheiro real há anos servindo de
oráculo. Vale para as nativas também.

## Achado: anomalia comercial (D-008)

6 dias custa R$ 197,40 e 7 dias custa R$ 174,30: ficar um dia a mais sai **R$ 23,10 mais
barato**. Pior no fracionado: 6 dias + 45 min = R$ 197,40 e 6 dias + 90 min = R$ 174,30, ou
seja, atrasar 45 minutos na saída **reduz** a conta. Existe na tabela do parceiro, não é bug
do Hub. O amostrador detecta isso sozinho, o que torna o job também auditoria de tabela.


## Como ficou (08/08/2026)

| Peça | Onde |
|---|---|
| Amostrador (lógica pura, rede injetada) | `supabase/functions/_shared/wl/price-sampler.ts` |
| Cotação no parceiro | `wlGetCalculationPrice` em `_shared/wl/client.ts` |
| Job | Edge `wl-price-mirror`, cron diário 07:00 UTC |
| Carimbo e log | `pricing_rule.mirror_*` + `pricing_mirror_run` |
| Testes | deno 16 (amostrador + lógica do job), pgTAP 20 |

### A chamada, com as três armadilhas

```
GET https://{wl_domain}/api/v3/cart/calculation-price
  ?initial_date=2026-08-19%2021%3A00%3A00&final_date=...&category_slug=...&product_slug=...
Header: X-Tenant: {wl_tenant_key}
```

1. `X-Tenant` é **obrigatório**. Sem ele o October devolve 500 com página de exceção em HTML.
2. Data em `Y-m-d H:i:s`. ISO com `T` ou só a data devolvem 400.
3. `total_price` mora em **`data.cart.total_price`**, não em `data.total_price`.

Não usa Bearer: é o storefront público, não a `/api/v3/backend`.

### O log grava evento, não batimento

Passada que acha o mesmo preço **não gera linha**, só atualiza `mirror_verified_at`. O
`wl_reconcile_log` deste projeto tem 30.834 linhas contra 225 reservas por gravar toda passada,
e essa era a armadilha a evitar. Com 50 vagas e verificação diária, são centenas de linhas por
ano em vez de 18 mil.

A comparação é por texto com escala fixa: comparar jsonb cru faria `40` e `40.00` contarem como
mudança e o log encheria do mesmo jeito.

**O mesmo teste que economiza linha detecta a mudança de tabela do parceiro.** A otimização é o
gatilho do alarme, não duas coisas.

Retenção com régua por natureza da linha: `change` é histórico de preço e não se apaga;
divergência e erro caem em 90 dias, seguindo o precedente do `api_request_log`. A mesma limpeza
leva o `wl_reconcile_log`, que nunca teve retenção.

### Primeira execução em produção

Virapark, 08/08/2026: 42 chamadas, `changed: 1`, `divergent: 0`.

Tabela reconstruída: 1 dia R$ 40,00 · 2 a 6 dias **R$ 28,90** · 7+ R$ 24,90 · balcão R$ 40,00/dia
· tolerância 60 min.

**O parceiro mudou o preço em cinco dias.** A spec registrou 2 a 6 dias a R$ 32,90 em 03/08, e a
medição de 08/08 achou R$ 28,90. É a justificativa do job se provando: import único envelhece em
menos de uma semana.

**A anomalia D-008 sumiu junto.** Com 32,90, seis dias custavam R$ 197,40 e sete custavam
R$ 174,30, e ficar mais tempo saía mais barato. Com 28,90 são R$ 173,40 contra R$ 174,30, e a
curva voltou a subir. O detector continua no código, coberto por teste, porque a anomalia pode
voltar na próxima virada.

Efeito na vitrine: a single do Virapark saiu de R$ 161,10 (tabela velha do Hub) para
**R$ 224,10**, que é o que o parceiro cobra. Os R$ 63 de divergência fecharam.

### Limite conhecido

A amostragem usa **uma âncora só** (30 dias à frente, meio-dia), então assume que o parceiro não
pratica preço sazonal. Se passar a praticar, quem descobre é a verificação diferencial: os
motores divergem nas datas fora da âncora, a regra cai para `divergent` e a vitrine para de
mostrar preço fechado.
