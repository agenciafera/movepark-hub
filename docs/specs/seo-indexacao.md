# Indexação e domínio canônico

**Status:** implementado (regra de host no worker) · **Fonte da verdade:** `INDEXABLE_HOSTS` em [`src/worker.ts`](../../src/worker.ts)

## Decisão

O domínio canônico de SEO é o **`movepark.co`**. O `hub.movepark.co` é endereço técnico e **não deve aparecer no Google**.

O Hub vai substituir o `movepark.co`. No estado final só o `movepark.co` existe: o Hub passa a responder no apex e o WordPress sai. Até lá os dois convivem, e é essa convivência que precisa ser gerenciada.

## Por que

O `movepark.co` (WordPress + Yoast) e o `hub.movepark.co` (este projeto) publicam conteúdo que disputa a mesma intenção de busca:

| Intenção | `movepark.co` | `hub.movepark.co` |
|---|---|---|
| Estacionamento específico | 39 páginas em `/estacionamentos/<aeroporto>/<nome>/` | 41 páginas em `/p/<company>/<location>/<tipo>` |
| Aeroporto / destino | 24 páginas em `/estacionamentos/<aeroporto>/` | 16 páginas em `/destinos/<slug>` |

Dois domínios competindo pelo mesmo termo dividem sinal e se canibalizam. Enquanto o WordPress for o que rankeia, o Hub fica fora do índice.

## Como funciona

`applyIndexPolicy` no [`src/worker.ts`](../../src/worker.ts) acrescenta **`X-Robots-Tag: noindex, follow`** a toda resposta cujo host não esteja em `INDEXABLE_HOSTS`.

Três decisões importam, e mexer nelas quebra a coisa:

1. **É allowlist, não blocklist.** Só `movepark.co` é indexável. Quando o Hub assumir o apex, o host já está na lista e a indexação volta sozinha, sem ninguém precisar lembrar de remover um bloqueio. De quebra, `*.pages.dev`, `*.workers.dev` e qualquer staging futuro nascem fora do índice.

2. **A regra mora no worker, não em arquivo estático.** `public/_headers`, meta tag no HTML e `robots.txt` são todos cegos a host: viajariam junto na migração e apagariam o site novo do índice. Só a borda enxerga o hostname da requisição.

3. **O `robots.txt` continua liberando o crawl.** O Google só respeita `noindex` na página que ele consegue abrir. `Disallow: /` faria o oposto do esperado: o crawler pararia de entrar, nunca leria o `noindex`, e as URLs já indexadas ficariam presas como "indexada, porém bloqueada pelo robots.txt", sem descrição e sem previsão de saída.

O `follow` preserva o rastreio dos links, então a autoridade que o Hub aponta para fora não é descartada.

Cobertura garantida por teste em [`src/worker.test.ts`](../../src/worker.test.ts), incluindo o caso que protege a migração (`NÃO marca noindex no domínio canônico`).

## Operação

O `movepark.co` já é uma **propriedade de domínio** (`sc-domain:movepark.co`) no Search Console, então cobre todos os subdomínios. Não existe propriedade separada do `hub.` nem é preciso criar uma.

Remoção temporária do prefixo `https://hub.movepark.co/` enviada em **04/08/2026** (vale ~6 meses, reversível a qualquer momento). Ela apenas esconde; a saída definitiva vem do recrawl lendo o `noindex`, o que leva de dias a semanas.

Baseline medido em 04/08/2026, antes do `noindex` propagar: **233 páginas indexadas no domínio, 18 delas no `hub.movepark.co`**. Duas eram rotas de painel: `/operator` e `/operator/api-keys`. Também apareceram `/search?dest=POA` e uma listagem com query string (`?from=&to=&src=home-popular`), ou seja, URL parametrizada indexada como duplicata.

Nenhum sitemap do `hub.` chegou a ser submetido: a propriedade só tem os dois do WordPress (`movepark.co/sitemap.xml` e `page-sitemap.xml`). O sitemap do Hub só era descoberto pelo `robots.txt`.

### Outros subdomínios indexados

A mesma propriedade de domínio revelou dois subdomínios fora do `hub.` no índice, ambos fora deste repositório:

| Subdomínio | O que é | Situação |
|---|---|---|
| `n8n.movepark.co` | instância n8n de automação | indexado; ferramenta interna exposta na busca |
| `virapark.movepark.co` | white-label do parceiro Virapark (Vercel) | indexado; pode ser intencional para o SEO do parceiro |

> **A borda tem spec própria.** Comportamento do worker, configuração de assets e a regra de
> 404 estão em [`borda-cloudflare.md`](./borda-cloudflare.md), com as medições de produção.

## Checklist da migração para o `movepark.co`

O `noindex` sai sozinho, mas o resto **não**. Nenhum item abaixo é opcional: cada um, se esquecido, tira páginas do índice ou expõe o que não devia.

- [ ] **Host canônico hardcoded.** `https://hub.movepark.co` está escrito à mão em ~20 pontos: `canonical` e `og:url` de [`home.tsx`](../../src/routes/home.tsx), [`sobre.tsx`](../../src/routes/sobre.tsx), [`faq.tsx`](../../src/routes/faq.tsx), [`ajuda.tsx`](../../src/routes/ajuda.tsx), [`contato.tsx`](../../src/routes/contato.tsx), [`cancelamento.tsx`](../../src/routes/cancelamento.tsx), [`como-funciona.tsx`](../../src/routes/como-funciona.tsx), [`docs.tsx`](../../src/routes/docs.tsx), mais as consts `SITE_URL` de [`jsonld.ts`](../../src/lib/jsonld.ts), [`destino.tsx`](../../src/routes/destino.tsx), [`destinos.tsx`](../../src/routes/destinos.tsx), [`listing.tsx`](../../src/routes/listing.tsx), [`unit-preview.tsx`](../../src/routes/operator/unit-preview.tsx), [`LegalDocumentPage.tsx`](../../src/features/legal/LegalDocumentPage.tsx), [`api-worker.ts`](../../src/api-worker.ts) e [`vite.config.ts`](../../vite.config.ts). Um canonical apontando para um subdomínio desativado tira o site novo do índice. **Centralizar numa const única antes de migrar.**
- [ ] **Hostname do sitemap.** `SITE_URL` em [`vite.config.ts`](../../vite.config.ts) define o host de todas as `<loc>`. Sitemap com host errado é ignorado.
- [ ] **`Sitemap:` do [`robots.txt`](../../public/robots.txt)** aponta para `hub.movepark.co/sitemap.xml`.
- [x] **404 real.** Resolvido em 13/08/2026. URL inexistente responde 404 com corpo, em vez de 200 com o HTML da home. A regra vive no worker, com fail-open, e as rotas de app que não têm HTML próprio (`/checkout/:code`, `/operator/*`, `/manager/*`) continuam em 200 por padrão declarado. Ver [`borda-cloudflare.md`](./borda-cloudflare.md).
- [ ] **Rotas privadas precisam de `noindex` próprio.** Hoje `/manager`, `/operator`, `/account`, `/checkout` e `/bookings` só estão fora do Google porque o host inteiro está bloqueado. Quando a regra de host desligar, elas ficam indexáveis. Precisam de um `noindex` por rota, independente de host, **antes** da migração.
- [x] **Exclusões do sitemap.** Resolvido em 13/08/2026. A lista de exclusão do [`vite.config.ts`](../../vite.config.ts) passou a derivar de [`src/lib/sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts): opt-out declarado com motivo, mais os prefixos de área logada. Medido no `dist/` depois da mudança: 149 URLs, zero de `/manager`, `/operator`, `/account`, `/checkout`, `/bookings`, `/onboarding`, `/docs`, `/search` ou `/design-system`.
- [x] **Arquivos de rascunho em `public/`.** `public/images/arco-iris.html` foi apagado em 13/08/2026. Varrer `public/` atrás de HTML solto continua valendo antes de migrar.
- [ ] **301 do WordPress para o Hub.** Cada URL de `/estacionamentos/*` que sair precisa de redirect permanente para a página equivalente do Hub, senão a autoridade acumulada é perdida.
- [ ] **`llms.txt` e cards MCP** citam `hub.movepark.co` ([`public/llms.txt`](../../public/llms.txt), `.well-known/mcp/*`). Ver ADR-003.
- [ ] **`api.movepark.co` não muda.** A Public API fica onde está, fora da superfície de SEO.

## Sitemap: o que entra e por quê

O `vite-plugin-sitemap` roda no `closeBundle`, **antes** de o `vite-react-ssg` pré-renderizar.
Naquele instante o `dist/` só tem o `index.html` do build de cliente, então o plugin não
descobre sozinho que `/sobre` e `/faq` existem: tudo vem da lista montada no
[`vite.config.ts`](../../vite.config.ts). Foi por isso que o sitemap publicado em 13/08/2026
tinha 135 URLs e **nenhuma página institucional**, mesmo com as nove pré-renderizadas no
`dist/`.

A lista estática mora em [`src/lib/sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts), que
**não pode importar nada**: o Vite empacota o config com esbuild antes de o alias `@` existir,
então qualquer import em cadeia (por exemplo `@/routes`, que puxa `RequireRole` e o client do
Supabase) quebra o build inteiro. Foi a primeira tentativa e ela não compila.

Quem impede a lista de envelhecer é [`src/lib/sitemapRoutes.test.ts`](../../src/lib/sitemapRoutes.test.ts):
lê o `routes.tsx` como texto e reprova qualquer rota que não esteja no sitemap, no opt-out com
motivo escrito, ou sob prefixo de área logada. Rota nova sem decisão deixa o CI vermelho.

**Pendente:** a taxonomia e a paginação do blog (48 arquivos no `dist/`: `/blog/page/N`,
`/blog/categoria/*`, `/blog/tag/*`, `/blog/autor/*`, `/blog/aeroporto/*`) ainda ficam de fora.
Cada uma precisa de consulta própria de slugs e de contagem de páginas. Está declarada em
`SITEMAP_BLOG_TAXONOMY_PENDING` para o débito ficar visível em vez de virar esquecimento.

**Nomes das páginas legais.** As rotas do Hub são `/termos` e `/privacidade`; o WordPress
publica `/termos-de-uso/` e `/politica-de-privacidade/`. São nomes diferentes, então a
migração precisa de 301 e não de URL igual. Um teste trava os dois nomes.
