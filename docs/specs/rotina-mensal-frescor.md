# Rotina mensal de frescor das páginas de cabeça

**Status:** primeira rodada executada em 17/09/2026
**Atividade:** [Conteúdo 38, rotina mensal de carimbo e valores](https://app.clickup.com/t/86ak6hdhe)
**Depende de:** [plano-conteudo-aeroportos.md](./plano-conteudo-aeroportos.md) (Defesa), [canonicalizacao-gru-cwb.md](./canonicalizacao-gru-cwb.md), [baseline-search-console.md](./baseline-search-console.md)

## Por que existe

Conteúdo de preço apodrece, e o modelo trata número sem data como possivelmente velho. A rotina
existe para que o frescor seja fato verificável, e não promessa: toda cifra publicada carrega a data
em que foi apurada, e a data acompanha a revisão do parceiro.

## O que a rodada de 17/09/2026 encontrou

### Passo 1: quem revisou tabela desde a última rodada

`destination_price_freshness(<slug>)` responde isso sem abrir o Manager. Em 17/09/2026:

| Praça | Tabela do parceiro mudou em | Situação |
| --- | --- | --- |
| Guarulhos (GRU) | 11/09/2026 | revisou depois da última rodada |
| Congonhas (CGH) | 11/09/2026 | revisou depois da última rodada |
| Confins (CNF) | 10/09/2026 | revisou depois da última rodada |
| Tietê | 12/08/2026 | sem mudança |
| Afonso Pena (CWB) | 10/08/2026 | sem mudança |
| Viracopos (VCP) | 10/08/2026 | sem mudança |

Praça que não revisou tabela não precisa de texto novo, só de conferência. Praça que revisou tem
todas as cifras do acervo dela vencidas até prova em contrário.

### Passo 2: o que foi corrigido nas páginas que citam R$

Em Guarulhos, seis páginas foram atualizadas para a tabela de 17/09/2026. Quatro já tinham sido
corrigidas na entrega do Conteúdo 31 (preço, barato, proximidade e segurança) e duas entraram
nesta rodada:

| Página | O que estava publicado | O que passou a valer |
| --- | --- | --- |
| `guia-atualizado-5-melhores-opcoes-...-guarulhos-em-2024` | semana descoberta de R$ 132,30 no Aeropark e R$ 111,30 no Aerovalet, coleta de 27/08 | R$ 93,17 nos dois, porque de sete diárias em diante as tabelas ficaram iguais |
| `estacionamento-gru-airport-guia-completo-...` | tarifa do oficial inventada e sem data ("Premium cerca de R$ 120/dia", "Econômico a partir de R$ 70/dia"), mais "quatro terminais" | tabela real do operador por setor, com data, e três terminais |

O segundo caso é o mais grave e vale a regra: **tarifa de terceiro sem data nem fonte é invenção com
cara de dado**, e ela sobreviveu a duas consolidações. A busca por faixa de valor ("R$ 70 a R$ 120
por dia") não existia em nenhuma tabela do aeroporto.

A mesma página ganhou link para as três páginas por terminal, o que resolve o risco de ela disputar
a consulta de terminal com as novas.

### Passo 3: o carimbo automático está de pé

O carimbo do Conteúdo 26 funciona e dispensa trabalho manual. Conferido no ar em 17/09/2026:

- Em post que publica preço, a linha sai como `Preços conferidos no motor de reservas em 11/09/2026`,
  que é a data da revisão do parceiro, e não a data em que o texto foi editado.
- Em post sem cifra (`guia-completo-sobre-o-aeroporto-de-guarulhos`), a linha não aparece.
- O `dateModified` do `BlogPosting` sai como a maior data entre a edição do texto e a tabela.

Ou seja, o passo 3 da rotina deixou de ser editorial. O que resta é conferir se o carimbo aparece,
não escrever a data à mão.

### Passo 4: as páginas que mais caíram de posição

Comparação das duas janelas de 15 dias que já estavam coletadas, 12 a 26/08 contra 31/08 a 14/09,
filtrando páginas com pelo menos 30 impressões na janela anterior (227 páginas comparáveis):

| Página | Posição antes | Posição depois | Impressões | Leitura |
| --- | --- | --- | --- | --- |
| `/p/nationpark/aeroporto-afonso-pena/covered` | 13,1 | 79,0 | 206 para 3 | queda esperada: caminho legado que responde 301 |
| `/estacionamento-mais-barato/<gru>` | 41,9 | 77,1 | 81 para 179 | impressão subiu e posição caiu: passou a aparecer para consulta mais ampla |
| `/blog/aeroporto-afonso-pena-5-melhores-opcoes-...` | 20,1 | 50,0 | 361 para 43 | queda esperada: slug consolidado em 28/08 |
| `/blog/onde-estacionar-proximo-ao-aeroporto-de-viracopos/` | 22,9 | 50,4 | 374 para 63 | queda esperada: slug consolidado |
| `/blog/as-melhores-estrategias-para-economizar-...` | 72,2 | 98,0 | 223 para 1 | queda esperada: slug consolidado |
| `/faq/quanto-custa-estacionar-no-aeroporto-de-guarulhos` | 34,4 | 53,4 | 548 para 770 | página viva, impressão subindo: a analisar na próxima rodada |
| `aeropark.movepark.co/aeroporto-guarulhos/vaga-coberta` | 9,1 | 27,1 | 344 para 41 | subdomínio de white-label, fora da superfície de SEO |
| `/blog/guia-completo-sobre-o-aeroporto-de-guarulhos/` | 12,9 | 28,1 | 211 para 109 | **queda real em página viva**, candidata a revisão |

A leitura que importa: **cinco das oito maiores quedas são de URL que a consolidação mandou para
301**, e isso é a promessa se cumprindo, não um problema. O relatório do `seo:gsc-comparar` mostra o
outro lado da mesma moeda: as donas subiram de 12.649 para 19.660 impressões, e os redirecionados
caíram de 8.288 para 3.222.

Nos 12 clusters de cabeça, 10 ganharam posição. Os dois que perderam:

- **GRU proximidade**, de 43,8 para 51,7, com 247 impressões a menos. É o único cluster de cabeça
  com queda de impressão na janela, e tem dono: a âncora foi reescrita em 17/09 com a tabela nova.
- **CWB barato**, de 9,0 para 11,9, mas com 34 impressões a mais.

### Passo 5: consolidação, e por que ela não foi executada

A rotina pede quatro consolidações por mês. Os quatro pares candidatos existem, mas medi os dois
lados antes de mexer, e **em todos eles o post antigo é o que tem tráfego**:

| Praça | Candidato antigo | Impressões | Candidato novo | Impressões |
| --- | --- | ---: | --- | ---: |
| CGH | `top-3-estacionamentos-do-aeroporto-de-congonhas` | 1.463 | `estacionamento-barato-aeroporto-congonhas` | 115 |
| NVT | `top-3-estacionamentos-do-aeroporto-de-navegantes` | 1.325 | `melhores-precos-de-estacionamento-...-navegantes` | 20 |
| CNF | `top-3-estacionamentos-do-aeroporto-de-confins` | 689 | `estacionamento-mais-barato-no-aeroporto-de-confins` | 262 |
| VCP | `estacionamento-aeroporto-viracopos-vcp-guia-completo-...` | 4.775 | `quais-os-melhores-estacionamentos-...-2024` | 307 |

Consolidar "o antigo no novo", que é o reflexo natural, jogaria fora de 689 a 4.775 impressões por
par. É exatamente a inversão que a revisão de 28/08 apontou em CWB, quando uma dona de 891 cliques
tinha sido absorvida por uma de 1 clique.

Por isso a decisão foi **medir e devolver**: as quatro praças acima são de outras pessoas, e a
eleição do vencedor é delas. O que esta rodada entrega é o número que decide, não o redirect.

## O procedimento, para a próxima rodada

1. `select d.short_name, f.* from destination d cross join lateral public.destination_price_freshness(d.slug) f ...`
   e liste as praças que revisaram tabela desde a última rodada.
2. Para cada praça que revisou, liste os posts que citam R$ e as datas que eles citam
   (`regexp_matches` sobre `body_md` resolve), e corrija os que ficaram para trás.
3. Confira o carimbo no ar em um post de preço e em um sem preço. Se a linha aparecer com a data da
   tabela, o passo está feito.
4. Rode `bun run seo:gsc-comparar -- --antes <janela> --depois <janela>` e compute as quedas por
   página a partir de `paginas.csv` das duas coletas. Separe queda de slug consolidado, que é
   esperada, de queda em página viva, que é trabalho.
5. Antes de consolidar qualquer par, **meça os dois lados na janela mais recente**. O vencedor é o
   que tem impressão, e não o que foi escrito por último.

## Armadilha de coleta, registrada para não repetir

O coletor do Search Console nomeia a pasta pela data final da janela, então duas coletas que terminam
no mesmo dia colidem. Nesta rodada eu rodei `seo:gsc-baseline` sem argumento e sobrescrevi a coleta
de 15 dias que outra sessão havia gravado duas horas antes em
`docs/specs/dados/gsc-baseline-2026-09-14` para o Conteúdo 21. O arquivo foi restaurado com
`git checkout` e nada se perdeu, mas a lição fica: **antes de coletar, olhe se a pasta da data final
já existe**, e passe `--inicio` e `--fim` explícitos quando a janela for diferente.
