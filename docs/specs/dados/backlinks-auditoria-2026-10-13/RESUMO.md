# Auditoria de backlinks - 2026-10-13 (Conteúdo 63)

Retrato congelado. A leitura e as decisões estão na seção 2.7 e na seção 4.2 de
[`plano-autoridade-backlinks.md`](../../plano-autoridade-backlinks.md).

| Arquivo | O que tem | Fonte |
|---|---|---|
| `disavow.txt` | Os 73 domínios enviados ao Search Console em 13/10/2026, 14:14, na propriedade `https://movepark.co/` | Montado a partir dos dois arquivos abaixo |
| `semrush-dominios-revisados.csv` | Os 96 domínios das listas "100 maiores" e "tóxicos" do Backlink Audit, mais 7 da rede 2 vistos na amostra de backlinks, com título da página de origem, âncora, AS, IP, data e a classe de cada um | Semrush, Backlink Audit (plano gratuito) |
| `semrush-ancoras.csv` | As 30 âncoras mais usadas, com a rede a que cada template pertence | Semrush, Backlink Audit |
| `gsc-dominios.csv` | Os 60 domínios que o Google lista, com classe e decisão | Search Console, relatório de Links |
| `gsc-paginas-origem.csv` | A página de origem de cada link desses 60 domínios | Search Console, relatório de Links |
| `gsc-links-ao-vivo.csv` | Se o link ainda está na página de origem, com `rel` e âncora | Leitura das páginas em 13/10/2026 |
| `whitepress-compras.csv` | As 37 compras do projeto Movepark (33 publicações e 4 inserções), com status do link, destino final, AS e tráfego do Semrush | Painel do anunciante do WhitePress e leitura das páginas |

Como as classes se leem: `rede1_venda_pbn` e `rede2_aged_domains` foram para o disavow;
`estatistica_nofollow` ficou de fora porque é `nofollow`; `parceiro`, `agencia`, `editorial` e
`compra_whitepress` nunca entram em disavow.
