# Logos quadrados e favicons para o Google

Variações 1:1 de Movepark e Virapark para o Google Ads e favicons para o resultado orgânico.
Cada PNG tem o SVG de origem ao lado. Os SVGs foram montados a partir dos arquivos oficiais
(`public/brand/simbolo-movepark.svg`, `public/brand/logo-movepark.svg` e
`public/images/parceiros/logo-virapark.svg`), com as letras e formas originais, sem redesenho.

Simulação na busca (patrocinado e orgânico, claro e escuro, hoje e proposta):
https://claude.ai/artifact/Qsy27c1cj1Gvad46Z63m9S

## O que o Google pede

| Onde | Formato | Como aparece |
|---|---|---|
| Logo da empresa no anúncio | 1:1, PNG ou JPG, 1200 × 1200 (mín. 128), até 5 MB | Círculo de 28px. Conteúdo nos 80% do centro. Tem que funcionar no tema claro e no escuro |
| Favicon no orgânico | Quadrado, múltiplo de 48px ou SVG | Cerca de 18px dentro de um círculo claro |

Sem logo cadastrado no Google Ads, o anúncio mostra o favicon do domínio de destino. O logo do
anúncio precisa aparecer na página de destino, por isso o monograma "vp" fica como favicon e não
como logo do anúncio da Virapark.

## Onde usar

| Arquivo | Uso |
|---|---|
| `movepark/movepark-logo-ads-simbolo-claro.png` | **Recomendado.** Logo da empresa no Google Ads da Movepark |
| `movepark/movepark-logo-ads-simbolo-escuro.png` | Alternativa sobre navy |
| `movepark/movepark-logo-ads-empilhado.png` | Logo quadrado em Performance Max e Display. Em 28px o nome não lê |
| `movepark/favicon/movepark-favicon-escuro*` | Alternativa de favicon. O atual do `movepark.co` já atende e pode ficar |
| `virapark/virapark-logo-ads-empilhado-claro.png` | **Recomendado.** Logo da empresa no Google Ads da Virapark |
| `virapark/virapark-logo-ads-empilhado-escuro.png` | Alternativa sobre navy |
| `virapark/virapark-logo-ads-vp-*.png` | Monograma. Risco de reprovação como logo de anúncio |
| `virapark/favicon/virapark-favicon-escuro*` | **Recomendado.** Favicon do `virapark.com.br` (Wix: use o PNG de 512) e do `virapark.movepark.co` (SVG + PNG 48, 96, 144, 192) |
| `virapark/favicon/virapark-favicon-claro*` | Alternativa de favicon sobre branco |

## O que estava no ar em 09/10/2026

- `virapark.com.br`: favicon é o logo horizontal inteiro reduzido. Em 16px vira mancha.
- `virapark.movepark.co`: favicon é o símbolo da Movepark em branco sobre transparente
  (`movepark_icon.svg` no S3). Some no fundo claro e não é a marca da Virapark.
- `movepark.co`: certo (SVG quadrado com PNG de 96 e 192).
