# Autoridade: revisão de 30 dias (Conteúdo 73), 05/11/2026

Retrato congelado. Fonte: Semrush logado (plano gratuito, projeto `17618451`) em 05/11/2026,
`bun run seo:posicao` (janela 06/10 a 02/11, [gsc-posicao-2026-11-02](../gsc-posicao-2026-11-02/RESUMO.md))
e conferência de cada URL da [planilha de controle](../backlinks-controle.csv).

## Semrush, painel do projeto e visão geral do domínio

| Métrica | 29/09/2026 | 05/11/2026 | Leitura |
|---|---|---|---|
| Authority Score | 25 | **26** | Primeiro movimento em 12 meses, de um ponto |
| Domínios de ref. | 762 (Análise de backlinks) | 2,3 mil (painel e Visão geral) | **Não comparável**: base diferente. A Análise de backlinks voltou a mostrar o valor borrado no plano gratuito |
| Backlinks | 2,4 milhões | 6,9 mil (Visão geral) | Idem. Não é queda de verdade |
| Tráfego orgânico (estimado) | 2,6 mil | **4,4 mil** (painel) / 4,7 mil (Visão geral) | +70% |
| Palavras orgânicas | 5,7 mil | **6 mil** (painel) / 6,4 mil (Visão geral) | +5% a +12% |
| Saúde do site | 76% sobre 100 páginas | **82%** (13 erros, 204 avisos) | Auditoria de 02/10, não rodou de novo (plano gratuito) |
| Monitoramento de posição (Semrush, 10 termos) | 1 no top 3, 5 no top 10 | **3 no top 3, 6 no top 10** | Congonhas, Curitiba e `virapark` em 1º |
| Visibilidade em IA | 17 | **18** (painel) / 16 (Visão geral) | Estável |
| Menções em IA | 8 | **29** (painel) / 33 (Visão geral) | ChatGPT 5 para 16 a 20, Gemini 0 para 2 |
| Páginas citadas em IA | 117 | **263** (painel) / 161 (Visão geral) | Os dois painéis divergem; vale a direção, não o número |
| Backlink Audit | toxicidade Alta (05/10) | **Igual, parado em 05/10** | 378 domínios, 217 tóxicos. O disavow de 73 domínios é de 13/10 e o Semrush não reauditou |

A base de domínios de referência mudou entre os dois retratos, então **o Authority Score é o
único número de autoridade que dá para comparar**. A Análise de backlinks aparece com os
números borrados no plano gratuito, então não há print dela para comparar com o de 29/09.

## Search Console, posição (59 termos da meta, Brasil)

| Grupo | 04/10 | 02/11 |
|---|---|---|
| Termos da meta no top 10 | 9 de 59 | **14 de 59** |
| GRU, posição média dos 14 termos com dado (simples / ponderada por impressão) | 33,4 / 29,2 | **27,7 / 25,8** |
| GRU no top 10 | 0 | 0 |
| VCP no top 10 | n/d | 4 de 14 |
| CNF no top 10 | n/d | 3 de 16 |
| CWB no top 10 | n/d | 7 de 14 |

Dos 14 termos de GRU com dado, 11 subiram e 3 caíram (de -0,8 a -1,8). O maior ganho
foi "estacionamento próximo ao aeroporto de guarulhos" (+19,9 posições). Nenhum chegou ao top 10:
o melhor é "diaria estacionamento guarulhos", em 14,4.

## Links da planilha de controle (47 com URL, conferidos em 05/11/2026)

- **44 no ar** com link para `movepark.co` ou `virapark.com.br` (curl, e navegador nos dois que
  bloqueiam robô). Datas de `conferido_em` atualizadas.
- **2 perdidos**, já marcados em 13/10: `egobrazil.ig.com.br` (sem resposta) e
  `atendimentoaocliente.app.br` (404). Nada mudou.
- **2 não verificáveis**, como em 13/10: `dropsdejogos.uai.com.br` ("Indisponível no Brasil",
  geobloqueio) e `agendaculturalporto.org` (desafio do Cloudflare).
- **1 pedido sem URL**: `viagensecaminhos.com` (pedido 1887783, Conteúdo 75, R$ 1.610,00). O
  prazo do publicador era 19/10 e há 17 dias sem publicação. **Cobrar no WhitePress.**
- Os 7 sites de parceiros que linkam o `movepark.co` (Conteúdo 70) seguem no ar.
- `jornadageek.ig.com.br` e `followthecolours.com.br` respondem 406 a robô, mas no navegador o
  link está lá e é dofollow (`rel="noopener"`).

## Não medido nesta revisão

- **Domínios de ref. de `/estacionamentos/aeroporto-guarulhos` e do Brasil:** só saem do
  relatório de Links do Search Console (não tem API) e a sessão do Google pediu nova
  verificação de identidade. O Semrush gratuito não abre essa visão. Ficam para a Conteúdo 74
  ou para quando o Diego estiver com a conta logada.
- **Domínios novos com AS ≥ 20 por mês:** segue sem linha de base no plano gratuito.
