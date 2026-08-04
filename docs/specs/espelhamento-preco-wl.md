# Espelhamento de preço do white-label (E0.13)

> **Épico:** E0.13 · **Fase:** 0 · **D vinculado:** D-008

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

