# Simulação de Preços — Hub vs Produção

Gerado em: **2026-05-26**  
Endpoint Hub: `https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/simulate-price`

> **ℹ️ Atenção:** Células marcadas com `⚠️` indicam *inversão de faixa* — o preço de N dias é **maior** que o de N+k dias. Isso é esperado em estratégias `uniform_by_duration` (o cliente deveria escolher a faixa maior para economizar).

---

## Metadados Legados

| Hub slug | Legacy tenant key | app_name | db_schema | backend_domain | Slugs de produto (legacy) |
|---|---|---|---|---|---|
| aerovalet | `aerovalet` | Aerovalet | `aerovalet_x9j4k2m1` | aerovalet-app.movepark.co | vaga-coberta-cgh, vaga-coberta-gru, vaga-descoberta-gru, valet-gru, vaga-coberta-tiete |
| aeropark | `aeropark` | Aeropark | `bandeirapark_h7k9m4n2` | aeropark-app.movepark.co | vaga-coberta, vaga-descoberta, valet |
| abbapark | `abbapark` | Abba Park | `abbapark_f84hafds` | abbapark-app.movepark.co | vaga-coberta, vaga-descoberta, vaga-max |
| garageinn | `garageinn_cev` | garageinn | `garageinn_cev_neae3qkm` | garageinn-app.movepark.co | vaga-avulsa |
| virapark | `garageinn_virapark` | virapark | `garageinn_virapark_wg7j2ra7` | virapark-app.movepark.co | vaga-coberta |
| nationpark | `nationpark` | Nation Park | `nationpark_lgf7qrje` | nationpark-app.movepark.co | vaga-coberta, vaga-descoberta, vaga-max |
| plenty | `plenty` | Plenty | `plenty_p8k3m7j4` | plenty-app.movepark.co | vaga-coberta |

> **ℹ️ Coluna "Produção":** Para produtos sem desconto promocional (`has_discount: false`) usa-se `price`. Para produtos com desconto (`has_discount: true`) em tipos não-valet usa-se `price` — o Hub já calcula o preço correto e não aplica desconto adicional. Para valet (surcharge / fixed_bracket com desconto em produção) usa-se `old_price` para comparar a tabela-base; o preço final vendido em produção é 80% do old_price (has_discount: true, 20% de desconto promocional aplicado no checkout).

---

## Resumo de Divergências

Todos os 225 cenários: **✓ Hub = Produção**.

---

## Aerovalet

### Aeroporto de Congonhas — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1-6d = R$ 31,90/d | 7-14d = R$ 28,90/d | 15+d = R$ 24,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 31,90 | 31,90 | ✓ |
| 2 | 63,80 | 63,80 | ✓ |
| 3 | 95,70 | 95,70 | ✓ |
| 4 | 127,60 | 127,60 | ✓ |
| 5 | 159,50 | 159,50 | ✓ |
| 6 | 191,40 ⚠️ | 191,40 | ✓ |
| 7 | 202,30 | 202,30 | ✓ |
| 10 | 289,00 | 289,00 | ✓ |
| 14 | 404,60 ⚠️ | 404,60 | ✓ |
| 15 | 373,50 | 373,50 | ✓ |
| 17 | 423,30 | 423,30 | ✓ |
| 18 | 448,20 | 448,20 | ✓ |
| 20 | 498,00 | 498,00 | ✓ |
| 30 | 747,00 | 747,00 | ✓ |
| 35 | 871,50 | 871,50 | ✓ |

> ⚠️ O flip real é 14d (R$ 404,60) > 15d (R$ 373,50): **15 dias sai mais barato que 14**.

---

### Aeroporto de Guarulhos — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1-5d = R$ 26,90/d | 6-14d = R$ 22,90/d | 15+d = R$ 19,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 26,90 | 26,90 | ✓ |
| 2 | 53,80 | 53,80 | ✓ |
| 3 | 80,70 | 80,70 | ✓ |
| 4 | 107,60 | 107,60 | ✓ |
| 5 | 134,50 | 134,50 | ✓ |
| 6 | 137,40 | 137,40 | ✓ |
| 7 | 160,30 | 160,30 | ✓ |
| 10 | 229,00 | 229,00 | ✓ |
| 14 | 320,60 ⚠️ | 320,60 | ✓ |
| 15 | 298,50 | 298,50 | ✓ |
| 17 | 338,30 | 338,30 | ✓ |
| 18 | 358,20 | 358,20 | ✓ |
| 20 | 398,00 | 398,00 | ✓ |
| 30 | 597,00 | 597,00 | ✓ |
| 35 | 696,50 | 696,50 | ✓ |

> ⚠️ **14d (R$ 320,60) > 15d (R$ 298,50)**: 15 dias é mais barato que 14.

---

### Aeroporto de Guarulhos — Vaga Descoberta
Estratégia: `uniform_by_duration` · Faixas: 1-5d = R$ 18,90/d | 6-14d = R$ 15,90/d | 15+d = R$ 13,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 18,90 | 18,90 | ✓ |
| 2 | 37,80 | 37,80 | ✓ |
| 3 | 56,70 | 56,70 | ✓ |
| 4 | 75,60 | 75,60 | ✓ |
| 5 | 94,50 | 94,50 | ✓ |
| 6 | 95,40 | 95,40 | ✓ |
| 7 | 111,30 | 111,30 | ✓ |
| 10 | 159,00 | 159,00 | ✓ |
| 14 | 222,60 ⚠️ | 222,60 | ✓ |
| 15 | 208,50 | 208,50 | ✓ |
| 17 | 236,30 | 236,30 | ✓ |
| 18 | 250,20 | 250,20 | ✓ |
| 20 | 278,00 | 278,00 | ✓ |
| 30 | 417,00 | 417,00 | ✓ |
| 35 | 486,50 | 486,50 | ✓ |

---

### Aeroporto de Guarulhos — Valet (Surcharge 1× Aeropark)
Estratégia: `surcharge` (multiplier = 1,0 sobre Aeropark Valet) · `fixed_bracket`

> ℹ️ Comparação usa `old_price` da produção (preço-base dos brackets). Em produção o preço final tem 20% de desconto aplicado (`has_discount: true`): ex. 1d = R$ 119,20 vendido vs R$ 149,00 old_price.

| Dias | Hub (R$) | Prod. old_price (R$) | OK? |
|-----:|--------:|--------------------:|-----|
| 1 | 149,00 | 149,00 | ✓ |
| 2 | 198,00 | 198,00 | ✓ |
| 3 | 297,00 | 297,00 | ✓ |
| 4 | 396,00 | 396,00 | ✓ |
| 5 | 495,00 | 495,00 | ✓ |
| 6 | 594,00 | 594,00 | ✓ |
| 7 | 594,00 | 594,00 | ✓ |
| 10 | 594,00 | 594,00 | ✓ |
| 14 | 693,00 | 693,00 | ✓ |
| 15 | 693,00 | 693,00 | ✓ |
| 17 | 693,00 | 693,00 | ✓ |
| 18 | 792,00 | 792,00 | ✓ |
| 20 | 792,00 | 792,00 | ✓ |
| 30 | 792,00 | 792,00 | ✓ |
| 35 | 924,00 | 924,00 | ✓ |

---

### Terminal Rodoviário Tietê — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixa única: R$ 24,99/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 24,99 | 24,99 | ✓ |
| 2 | 49,98 | 49,98 | ✓ |
| 3 | 74,97 | 74,97 | ✓ |
| 4 | 99,96 | 99,96 | ✓ |
| 5 | 124,95 | 124,95 | ✓ |
| 6 | 149,94 | 149,94 | ✓ |
| 7 | 174,93 | 174,93 | ✓ |
| 10 | 249,90 | 249,90 | ✓ |
| 14 | 349,86 | 349,86 | ✓ |
| 15 | 374,85 | 374,85 | ✓ |
| 17 | 424,83 | 424,83 | ✓ |
| 18 | 449,82 | 449,82 | ✓ |
| 20 | 499,80 | 499,80 | ✓ |
| 30 | 749,70 | 749,70 | ✓ |
| 35 | 874,65 | 874,65 | ✓ |

---

## Aeropark

### Aeroporto de Guarulhos — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1-5d = R$ 27,90/d | 6-15d = R$ 23,90/d | 16+d = R$ 20,90/d  
Old price: multiplicador 1,20

| Dias | Hub (R$) | Old price (R$) | Produção (R$) | OK? |
|-----:|--------:|---------------:|-------------:|-----|
| 1 | 27,90 | 33,48 | 27,90 | ✓ |
| 2 | 55,80 | 66,96 | 55,80 | ✓ |
| 3 | 83,70 | 100,44 | 83,70 | ✓ |
| 4 | 111,60 | 133,92 | 111,60 | ✓ |
| 5 | 139,50 | 167,40 | 139,50 | ✓ |
| 6 | 143,40 | 172,08 | 143,40 | ✓ |
| 7 | 167,30 | 200,76 | 167,30 | ✓ |
| 10 | 239,00 | 286,80 | 239,00 | ✓ |
| 14 | 334,60 | 401,52 | 334,60 | ✓ |
| 15 | 358,50 | 430,20 | 358,50 | ✓ |
| 17 | 355,30 ⚠️ | 426,36 | 355,30 | ✓ |
| 18 | 376,20 | 451,44 | 376,20 | ✓ |
| 20 | 418,00 | 501,60 | 418,00 | ✓ |
| 30 | 627,00 | 752,40 | 627,00 | ✓ |
| 35 | 731,50 | 877,80 | 731,50 | ✓ |

> ⚠️ **15d (R$ 358,50) > 17d (R$ 355,30)**: a virada para 16+d=20,90/d deixa 16d e 17d mais baratos que 15d. Ex.: 16×20,90=334,40 < 15×23,90=358,50.

---

### Aeroporto de Guarulhos — Vaga Descoberta
Estratégia: `uniform_by_duration` · Faixas: 1-5d = R$ 19,90/d | 6-15d = R$ 16,90/d | 16+d = R$ 14,90/d  
Old price: multiplicador 1,20

| Dias | Hub (R$) | Old price (R$) | Produção (R$) | OK? |
|-----:|--------:|---------------:|-------------:|-----|
| 1 | 19,90 | 23,88 | 19,90 | ✓ |
| 2 | 39,80 | 47,76 | 39,80 | ✓ |
| 3 | 59,70 | 71,64 | 59,70 | ✓ |
| 4 | 79,60 | 95,52 | 79,60 | ✓ |
| 5 | 99,50 | 119,40 | 99,50 | ✓ |
| 6 | 101,40 | 121,68 | 101,40 | ✓ |
| 7 | 118,30 | 141,96 | 118,30 | ✓ |
| 10 | 169,00 | 202,80 | 169,00 | ✓ |
| 14 | 236,60 | 283,92 | 236,60 | ✓ |
| 15 | 253,50 | 304,20 | 253,50 | ✓ |
| 17 | 253,30 ⚠️ | 303,96 | 253,30 | ✓ |
| 18 | 268,20 | 321,84 | 268,20 | ✓ |
| 20 | 298,00 | 357,60 | 298,00 | ✓ |
| 30 | 447,00 | 536,40 | 447,00 | ✓ |
| 35 | 521,50 | 625,80 | 521,50 | ✓ |

---

### Aeroporto de Guarulhos — Valet
Estratégia: `fixed_bracket` · Faixas fixas por período com overflow 31+d

> ℹ️ Comparação usa `old_price` da produção (preço-base dos brackets). Em produção o preço final tem 20% de desconto (`has_discount: true`): ex. 1d = R$ 119,20 vendido vs R$ 149,00 old_price.

| Dias | Hub (R$) | Prod. old_price (R$) | OK? |
|-----:|--------:|--------------------:|-----|
| 1 | 149,00 | 149,00 | ✓ |
| 2 | 198,00 | 198,00 | ✓ |
| 3 | 297,00 | 297,00 | ✓ |
| 4 | 396,00 | 396,00 | ✓ |
| 5 | 495,00 | 495,00 | ✓ |
| 6 | 594,00 | 594,00 | ✓ |
| 7 | 594,00 | 594,00 | ✓ |
| 10 | 594,00 | 594,00 | ✓ |
| 14 | 693,00 | 693,00 | ✓ |
| 15 | 693,00 | 693,00 | ✓ |
| 17 | 693,00 | 693,00 | ✓ |
| 18 | 792,00 | 792,00 | ✓ |
| 20 | 792,00 | 792,00 | ✓ |
| 30 | 792,00 | 792,00 | ✓ |
| 35 | 924,00 | 924,00 | ✓ |

> ℹ️ Faixas: 1d=149 | 2d=198 | 3d=297 | 4d=396 | 5d=495 | 6-10d=594 | 11-17d=693 | 18-30d=792 | 31+d = 792 + (d-30)×26,40

---

## Abbapark

### Aeroporto Afonso Pena — Vaga Coberta
Estratégia: `tiered_progressive` · Faixas: 1-6d = R$ 19,90/d | 7-14d = R$ 21,90/d | 15+d = R$ 23,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 19,90 | 19,90 | ✓ |
| 2 | 39,80 | 39,80 | ✓ |
| 3 | 59,70 | 59,70 | ✓ |
| 4 | 79,60 | 79,60 | ✓ |
| 5 | 99,50 | 99,50 | ✓ |
| 6 | 119,40 | 119,40 | ✓ |
| 7 | 141,30 | 141,30 | ✓ |
| 10 | 207,00 | 207,00 | ✓ |
| 14 | 294,60 | 294,60 | ✓ |
| 15 | 318,50 | 318,50 | ✓ |
| 17 | 366,30 | 366,30 | ✓ |
| 18 | 390,20 | 390,20 | ✓ |
| 20 | 438,00 | 438,00 | ✓ |
| 30 | 677,00 | 677,00 | ✓ |
| 35 | 796,50 | 796,50 | ✓ |

> ℹ️ Cálculo progressivo: 7d = 6×19,90 + 1×21,90 = 141,30. Sem inversão de faixa.

---

### Aeroporto Afonso Pena — Vaga Descoberta
Estratégia: `tiered_progressive` · Faixas: 1-6d = R$ 16,90/d | 7-14d = R$ 18,90/d | 15+d = R$ 20,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 16,90 | 16,90 | ✓ |
| 2 | 33,80 | 33,80 | ✓ |
| 3 | 50,70 | 50,70 | ✓ |
| 4 | 67,60 | 67,60 | ✓ |
| 5 | 84,50 | 84,50 | ✓ |
| 6 | 101,40 | 101,40 | ✓ |
| 7 | 120,30 | 120,30 | ✓ |
| 10 | 177,00 | 177,00 | ✓ |
| 14 | 252,60 | 252,60 | ✓ |
| 15 | 273,50 | 273,50 | ✓ |
| 17 | 315,30 | 315,30 | ✓ |
| 18 | 336,20 | 336,20 | ✓ |
| 20 | 378,00 | 378,00 | ✓ |
| 30 | 587,00 | 587,00 | ✓ |
| 35 | 691,50 | 691,50 | ✓ |

---

### Aeroporto Afonso Pena — Vaga Premium
Estratégia: `tiered_progressive` · Faixas: 1d = R$ 38,90 | 2-6d = R$ 20,90/d acumulado | 7-14d = R$ 25,90/d | 15+d = R$ 27,90/d  
Legacy slug: `vaga-max`

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 38,90 | 38,90 | ✓ |
| 2 | 61,80 | 61,80 | ✓ |
| 3 | 80,70 | 80,70 | ✓ |
| 4 | 99,60 | 99,60 | ✓ |
| 5 | 119,50 | 119,50 | ✓ |
| 6 | 143,40 | 143,40 | ✓ |
| 7 | 181,30 | 181,30 | ✓ |
| 10 | 259,00 | 259,00 | ✓ |
| 14 | 362,60 | 362,60 | ✓ |
| 15 | 418,50 | 418,50 | ✓ |
| 17 | 474,30 | 474,30 | ✓ |
| 18 | 502,20 | 502,20 | ✓ |
| 20 | 558,00 | 558,00 | ✓ |
| 30 | 837,00 | 837,00 | ✓ |
| 35 | 976,50 | 976,50 | ✓ |

---

## Garageinn

### Aeroporto de Viracopos — Vaga Descoberta
Estratégia: `uniform_by_duration` · Faixas: 1d = R$ 59,99 | 2+d = R$ 38,00/d  
Legacy slug: `vaga-avulsa`

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 59,99 | 59,99 | ✓ |
| 2 | 76,00 | 76,00 | ✓ |
| 3 | 114,00 | 114,00 | ✓ |
| 4 | 152,00 | 152,00 | ✓ |
| 5 | 190,00 | 190,00 | ✓ |
| 6 | 228,00 | 228,00 | ✓ |
| 7 | 266,00 | 266,00 | ✓ |
| 10 | 380,00 | 380,00 | ✓ |
| 14 | 532,00 | 532,00 | ✓ |
| 15 | 570,00 | 570,00 | ✓ |
| 17 | 646,00 | 646,00 | ✓ |
| 18 | 684,00 | 684,00 | ✓ |
| 20 | 760,00 | 760,00 | ✓ |
| 30 | 1.140,00 | 1.140,00 | ✓ |
| 35 | 1.330,00 | 1.330,00 | ✓ |

---

## Nationpark

### Aeroporto Afonso Pena — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1d=R$ 48,90 | 2d=R$ 74,90 total | 3-5d=R$ 29,90/d | 6-14d=R$ 24,90/d | 15+d=R$ 21,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 48,90 | 48,90 | ✓ |
| 2 | 74,90 | 74,90 | ✓ |
| 3 | 89,70 | 89,70 | ✓ |
| 4 | 119,60 | 119,60 | ✓ |
| 5 | 149,50 ⚠️ | 149,50 | ✓ |
| 6 | 149,40 | 149,40 | ✓ |
| 7 | 174,30 | 174,30 | ✓ |
| 10 | 249,00 | 249,00 | ✓ |
| 14 | 348,60 ⚠️ | 348,60 | ✓ |
| 15 | 373,50 | 373,50 | ✓ |
| 17 | 372,30 ⚠️ | 372,30 | ✓ |
| 18 | 394,20 | 394,20 | ✓ |
| 20 | 438,00 | 438,00 | ✓ |
| 30 | 657,00 | 657,00 | ✓ |
| 35 | 766,50 | 766,50 | ✓ |

---

### Aeroporto Afonso Pena — Vaga Descoberta
Estratégia: `uniform_by_duration` · Faixas: 1d=R$ 38,90 | 2d=R$ 58,90 total | 3-5d=R$ 20,90/d | 6+d=R$ 19,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 38,90 | 38,90 | ✓ |
| 2 | 58,90 | 58,90 | ✓ |
| 3 | 62,70 | 62,70 | ✓ |
| 4 | 83,60 | 83,60 | ✓ |
| 5 | 104,50 | 104,50 | ✓ |
| 6 | 119,40 | 119,40 | ✓ |
| 7 | 139,30 | 139,30 | ✓ |
| 10 | 199,00 | 199,00 | ✓ |
| 14 | 278,60 ⚠️ | 278,60 | ✓ |
| 15 | 298,50 | 298,50 | ✓ |
| 17 | 304,30 | 304,30 | ✓ |
| 18 | 322,20 | 322,20 | ✓ |
| 20 | 358,00 | 358,00 | ✓ |
| 30 | 537,00 | 537,00 | ✓ |
| 35 | 626,50 | 626,50 | ✓ |

---

### Aeroporto Afonso Pena — Vaga Premium
Estratégia: `uniform_by_duration` · Faixa única: R$ 26,90/d  
Legacy slug: `vaga-max`

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 26,90 | 26,90 | ✓ |
| 2 | 53,80 | 53,80 | ✓ |
| 3 | 80,70 | 80,70 | ✓ |
| 4 | 107,60 | 107,60 | ✓ |
| 5 | 134,50 | 134,50 | ✓ |
| 6 | 161,40 | 161,40 | ✓ |
| 7 | 188,30 | 188,30 | ✓ |
| 10 | 269,00 | 269,00 | ✓ |
| 14 | 376,60 | 376,60 | ✓ |
| 15 | 403,50 | 403,50 | ✓ |
| 17 | 457,30 | 457,30 | ✓ |
| 18 | 484,20 | 484,20 | ✓ |
| 20 | 538,00 | 538,00 | ✓ |
| 30 | 807,00 | 807,00 | ✓ |
| 35 | 941,50 | 941,50 | ✓ |

---

## Plenty Park

### Aeroporto de Congonhas — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1-6d=R$ 30,00/d | 7-14d=R$ 25,00/d | 15+d=R$ 20,00/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 30,00 | 30,00 | ✓ |
| 2 | 60,00 | 60,00 | ✓ |
| 3 | 90,00 | 90,00 | ✓ |
| 4 | 120,00 | 120,00 | ✓ |
| 5 | 150,00 | 150,00 | ✓ |
| 6 | 180,00 ⚠️ | 180,00 | ✓ |
| 7 | 175,00 | 175,00 | ✓ |
| 10 | 250,00 | 250,00 | ✓ |
| 14 | 350,00 ⚠️ | 350,00 | ✓ |
| 15 | 300,00 | 300,00 | ✓ |
| 17 | 340,00 | 340,00 | ✓ |
| 18 | 360,00 | 360,00 | ✓ |
| 20 | 400,00 | 400,00 | ✓ |
| 30 | 600,00 | 600,00 | ✓ |
| 35 | 700,00 | 700,00 | ✓ |

---

## Virapark

### Virapark — Vaga Coberta
Estratégia: `uniform_by_duration` · Faixas: 1d=R$ 40,00 | 2-6d=R$ 29,90/d | 7-14d=R$ 17,90/d | 15+d=R$ 19,90/d

| Dias | Hub (R$) | Produção (R$) | OK? |
|-----:|--------:|-------------:|-----|
| 1 | 40,00 | 40,00 | ✓ |
| 2 | 59,80 | 59,80 | ✓ |
| 3 | 89,70 | 89,70 | ✓ |
| 4 | 119,60 | 119,60 | ✓ |
| 5 | 149,50 | 149,50 | ✓ |
| 6 | 179,40 ⚠️ | 179,40 | ✓ |
| 7 | 125,30 | 125,30 | ✓ |
| 10 | 179,00 | 179,00 | ✓ |
| 14 | 250,60 | 250,60 | ✓ |
| 15 | 298,50 | 298,50 | ✓ |
| 17 | 338,30 | 338,30 | ✓ |
| 18 | 358,20 | 358,20 | ✓ |
| 20 | 398,00 | 398,00 | ✓ |
| 30 | 597,00 | 597,00 | ✓ |
| 35 | 696,50 | 696,50 | ✓ |

> ⚠️ **6d (R$ 179,40) > 7d (R$ 125,30)**: virada de faixa agressiva — o pacote semanal (7-14d a R$ 17,90/d) é muito mais barato que 6 dias avulsos. Confirmado em produção — comportamento intencional.
