# Inventário de URLs do WordPress legado

**Status:** exportado em 18/08/2026 · **Fonte:** sitemap do Yoast SEO + tabela `ko1_redirects`, direto do WordPress em produção (`gate.paas.saveincloud.net.br`, banco `movepark_gXuunjs9`)

## O que tem aqui

`docs/specs/wp-inventory/` guarda o inventário bruto usado para montar os mapas de 301 da migração. Cada arquivo:

| Arquivo | Conteúdo | Contagem |
|---|---|---|
| `post-sitemap.xml` | Posts do blog (Yoast) | 93 URLs |
| `page-sitemap.xml` | Páginas institucionais + índices de aeroporto (`/estacionamentos/<slug>/`) | 24 URLs |
| `estacionamento-sitemap.xml` | Fichas de estacionamento (custom post type `estacionamento`) | 39 URLs |
| `category-sitemap.xml` | Categorias do blog | 8 URLs |
| `post_tag-sitemap.xml` | Tags do blog | 9 URLs |
| `filiacao-sitemap.xml` | Taxonomia "filiação" | 1 URL |
| `regiao-sitemap.xml` | Taxonomia "região" (aeroporto do post) | 11 URLs |
| `author-sitemap.xml` | Autor do blog | 1 URL |
| `todas-urls-sitemap.txt` | União ordenada e sem duplicata de `post` + `page` + `estacionamento` (as três taxonomias com maior valor de migração) | 156 URLs |
| `ko1_redirects.csv` | Dump bruto da tabela `ko1_redirects` (plugin de redirect, invisível no Search Console porque o clique é atribuído ao destino) | 40 redirects |
| `ko1_redirects_resolvido.csv` | O mesmo, com `url_to` (que no banco é ID de post, não URL) resolvido para o link real via REST API | 40 redirects |

## Achado que precisa de atenção manual antes do mapa de 301

**A URL com mais clique de toda a tabela de redirects está quebrada no próprio WordPress.** `estacionamento/ponce-park-guarulhos/` acumula **110.196 + 688 hits** (de longe o maior volume do arquivo — o segundo lugar tem 7.986). Ela aponta para o post 695 (`ponce-park-estacionamento-aeroporto-guarulhos`, sobre o **Ponce Park no Aeroporto de Guarulhos**), que existe e está `publish` no banco. Mas o **permalink ao vivo desse post redireciona (301) para `/estacionamentos/aeroporto-navegantes/prime-estacionamento-aeroporto-navegantes/`** — aeroporto errado (Navegantes/SC em vez de Guarulhos/SP) e empresa errada (Prime em vez de Ponce Park).

Isso não é um problema do Hub: é um bug (provavelmente slug/redirect mal configurado) que já existe no WordPress. Mas como é a URL de maior tráfego de toda a migração, **não dá pra confiar no redirect ao vivo para montar o mapa 301**. Quem for preencher o mapa de `/estacionamentos/aeroporto-guarulhos/` (tarefa "Mapa 301 das 39 páginas de estacionamento") precisa mapear `estacionamento/ponce-park-guarulhos/` manualmente para a unidade certa de Guarulhos no Hub, não para o que o WordPress devolve hoje.

## O que não foi possível exportar

**16 meses de Google Search Console não estão nesta pasta.** Não há, entre as ferramentas que tenho acesso, nenhuma integração com a API do Search Console (ela exige OAuth de uma conta Google com a propriedade verificada). Alguém com acesso ao GSC do `movepark.co` precisa exportar manualmente: Performance → Páginas, últimos 16 meses, cliques + impressões por URL, e cruzar com `todas-urls-sitemap.txt` + `ko1_redirects_resolvido.csv` para achar URL com clique que não esteja coberta por nenhum dos dois. É esse cruzamento que fecha "cobrir 100% do que tem clique ou backlink" — sem o CSV do GSC, a cobertura desta exportação é só sitemap + redirects.

## Como usar

O critério do checklist de migração é: **o que não estiver nesta lista (mais o CSV do Search Console, quando alguém exportar) vira 404 silencioso.** `todas-urls-sitemap.txt` e `ko1_redirects_resolvido.csv` juntos são a base de partida das tarefas de mapa 301 (institucionais, estacionamentos, aeroportos).
