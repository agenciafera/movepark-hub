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

## Checklist da migração para o `movepark.co`

O `noindex` sai sozinho, mas o resto **não**. Nenhum item abaixo é opcional: cada um, se esquecido, tira páginas do índice ou expõe o que não devia.

- [ ] **Host canônico hardcoded.** `https://hub.movepark.co` está escrito à mão em ~20 pontos: `canonical` e `og:url` de [`home.tsx`](../../src/routes/home.tsx), [`sobre.tsx`](../../src/routes/sobre.tsx), [`faq.tsx`](../../src/routes/faq.tsx), [`ajuda.tsx`](../../src/routes/ajuda.tsx), [`contato.tsx`](../../src/routes/contato.tsx), [`cancelamento.tsx`](../../src/routes/cancelamento.tsx), [`como-funciona.tsx`](../../src/routes/como-funciona.tsx), [`docs.tsx`](../../src/routes/docs.tsx), mais as consts `SITE_URL` de [`jsonld.ts`](../../src/lib/jsonld.ts), [`destino.tsx`](../../src/routes/destino.tsx), [`destinos.tsx`](../../src/routes/destinos.tsx), [`listing.tsx`](../../src/routes/listing.tsx), [`unit-preview.tsx`](../../src/routes/operator/unit-preview.tsx), [`LegalDocumentPage.tsx`](../../src/features/legal/LegalDocumentPage.tsx), [`api-worker.ts`](../../src/api-worker.ts) e [`vite.config.ts`](../../vite.config.ts). Um canonical apontando para um subdomínio desativado tira o site novo do índice. **Centralizar numa const única antes de migrar.**
- [ ] **Hostname do sitemap.** `SITE_URL` em [`vite.config.ts`](../../vite.config.ts) define o host de todas as `<loc>`. Sitemap com host errado é ignorado.
- [ ] **`Sitemap:` do [`robots.txt`](../../public/robots.txt)** aponta para `hub.movepark.co/sitemap.xml`.
- [ ] **Rotas privadas precisam de `noindex` próprio.** Hoje `/manager`, `/operator`, `/account`, `/checkout` e `/bookings` só estão fora do Google porque o host inteiro está bloqueado. Quando a regra de host desligar, elas ficam indexáveis. Precisam de um `noindex` por rota, independente de host, **antes** da migração.
- [ ] **Exclusões do sitemap.** [`vite.config.ts`](../../vite.config.ts) só exclui rotas de auth. Um build local gera `dist/sitemap.xml` com `/manager`, `/operator`, `/finance`, `/account`, `/bookings`, `/api-keys` e `/onboarding` dentro.
- [ ] **Arquivos de rascunho em `public/`.** [`public/images/arco-iris.html`](../../public/images/arco-iris.html) é um preview do gerador de imagens que virou página pública e entrou no sitemap como `/images/arco-iris`. Varrer `public/` atrás de HTML solto antes de migrar.
- [ ] **301 do WordPress para o Hub.** Cada URL de `/estacionamentos/*` que sair precisa de redirect permanente para a página equivalente do Hub, senão a autoridade acumulada é perdida.
- [ ] **`llms.txt` e cards MCP** citam `hub.movepark.co` ([`public/llms.txt`](../../public/llms.txt), `.well-known/mcp/*`). Ver ADR-003.
- [ ] **`api.movepark.co` não muda.** A Public API fica onde está, fora da superfície de SEO.
