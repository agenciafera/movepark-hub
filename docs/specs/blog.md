# Blog

> **Status:** especificado, não implementado. O Hub não tem rota de blog hoje.
>
> **Objetivo:** substituir o blog WordPress em `movepark.co/blog/` preservando as 93 URLs
> byte a byte, para não perder os 4.598 cliques que o blog responde em 16 meses.
>
> **Levantamento:** planilha "Migração movepark.co para o Hub" (29/07/2026) mais inspeção
> do WordPress vivo por REST API e SSH em 10/08/2026.
>
> Conecta com [seo-indexacao.md](./seo-indexacao.md) (política de host e o corte de domínio),
> [destinations.md](./destinations.md) (molde de conteúdo e alvo dos CTAs) e o ADR-009
> (promessa de transação renderiza por capacidade).

## Por que existe

O blog é o **segundo maior bloco de tráfego orgânico** do `movepark.co`, atrás só das páginas
de unidade:

| Recorte | Valor |
|---|---|
| URLs de blog no Search Console | 103 |
| Cliques em 16 meses | 4.598, ou **22,62% do site** |
| Posts publicados hoje no WordPress | 93 (mais 1 rascunho) |
| Post mais clicado | `top-3-estacionamentos-do-aeroporto-de-navegantes`, 896 cliques, 6ª página do site |
| Backlinks apontando para posts | **zero** |

O último número orienta todo o resto. Das 22 URLs do domínio que recebem links externos,
nenhuma é post: a autoridade está nos hubs de aeroporto, na home, em três páginas de unidade
e nos subdomínios de parceiro. O risco do blog é ranqueamento próprio, não transferência de
autoridade. Na prática: o que importa é a URL responder 200 com o mesmo conteúdo, e não uma
cadeia de 301 preservando link juice.

## Decisões tomadas

| # | Decisão | Alternativa descartada |
|---|---|---|
| 1 | Conteúdo em tabela no Supabase, com CRUD no Manager | MDX no repo (só quem mexe em git publica); WordPress headless (mantém viva a dependência que o projeto quer matar) |
| 2 | Migração 1:1 dos 93 posts, consolidação depois | Consolidar duplicatas já na entrada (mistura duas variáveis no mesmo corte e impede diagnosticar uma queda) |
| 3 | Corpo do post em Markdown | HTML do WordPress (carrega shortcode e wrapper de bloco que ninguém consegue editar depois) |
| 4 | Política de URL do blog no `src/worker.ts` | Cloudflare Bulk Redirects (não é versionado nem testável em PR) |

## O contrato de URL

O permalink do WordPress é `/blog/%postname%/`. Comportamento medido em 10/08/2026:

| Requisição | WordPress hoje | Hub deve responder |
|---|---|---|
| `/blog/` | 200, índice | 200, índice |
| `/blog/page/N/` | 200, paginação | 200, paginação |
| `/blog/<slug>/` | 200 | **200, sem salto** |
| `/blog/<slug>` | 301 para a versão com barra | 301 para a versão com barra |
| `/blog/<categoria>/` | 301 para `/estacionamentos/<aeroporto>/` | 301 para `/destinos/<slug>` |
| `/blog/categoria/<categoria>/` | 301 para `/estacionamentos/<aeroporto>/` | 301 para `/destinos/<slug>` |

### A barra final é o ponto delicado

O site legado inteiro canoniza **com** barra final. O Hub hoje faz o oposto: `/destinos/`
devolve `307` para `/destinos`, comportamento padrão do Cloudflare Pages, porque o
`vite-react-ssg` emite arquivos planos (`dist/destinos/aeroporto-de-confins.html`) em vez de
`index.html` por diretório.

Deixar como está custaria um salto extra em cada uma das 93 URLs, e ainda um **307, que é
temporário**, quando o correto para mudança definitiva é 301. Então o `/blog/` recebe política
própria no worker: a URL com barra responde 200 direto, buscando o asset interno sem redirect.

Isso deixa o site com duas convenções (`/blog/x/` com barra, `/destinos/x` sem). É deliberado.
As URLs do blog são herdadas e valem tráfego; as do Hub nasceram sem barra e ainda não valem
nada, porque o `hub.movepark.co` responde `noindex`. **Vale reabrir como política do site
inteiro antes do corte das páginas de unidade**, já que `/estacionamentos/<x>/` também usa
barra, mas isso não bloqueia o blog.

### As 11 categorias

As categorias moram dentro do namespace `/blog/`, então a rota `/blog/:slug` precisa
distingui-las de post, senão viram 404 no dia do corte. O mapa é estático:

| Categoria no WordPress | Posts | Destino no Hub |
|---|---|---|
| `aeroporto-guarulhos` | 35 | `aeroporto-internacional-de-sao-paulo-guarulhos` |
| `aeroporto-viracopos` | 26 | `aeroporto-de-viracopos` |
| `aeroporto-afonso-pena` | 14 | `aeroporto-afonso-pena` |
| `aeroporto-lisboa` | 9 | `aeroporto-humberto-delgado` |
| `aeroporto-confins` | 3 | `aeroporto-de-confins` |
| `aeroporto-congonhas` | 3 | `aeroporto-de-congonhas` |
| `dica-de-viagem` | 3 | `/blog/` (não é aeroporto) |
| `aeroporto-navegantes` | 2 | **não existe no Hub** |
| `duvidas`, `rio-de-janeiro`, `uncategorized` | 0 | `/blog/` |

> O Yoast emite a base da taxonomia como um ponto, gerando `/blog/./<categoria>/`. São 8 URLs
> inválidas, 4 já em 404. Elas morrem junto com o WordPress e não precisam ser reproduzidas.

## Os redirects que a planilha não capturou

O plugin `eps-301-redirects` mantém **40 redirects ativos numa tabela do banco**
(`ko1_redirects`). O Search Console atribui o clique ao destino, então nenhuma dessas URLs de
origem aparece no levantamento de tráfego. Sem migrar essa tabela, elas viram 404 em silêncio.

O `url_to` é **ID de post**, não URL, resolvido em tempo de execução. A migração tem que
resolver cada ID para o permalink antes de escrever a regra.

### Escopo do blog (17 regras)

Nove delas revelam que **os posts já moraram na raiz do domínio**, antes do prefixo `/blog/`:

| Origem legada | Destino | Acessos |
|---|---|---|
| `aeroporto-guarulhos/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes` | `/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/` | 1.152 |
| `blog/campinas/` | `/destinos/aeroporto-de-viracopos` | 548 |
| `blog/guarulhos/` | `/destinos/aeroporto-internacional-de-sao-paulo-guarulhos` | 484 |
| `blog/aeroporto-guarulhos/` | idem | 475 |
| `blog/aeroporto-viracopos/` | `/destinos/aeroporto-de-viracopos` | 396 |
| `blog/viracopos/` | idem | 365 |
| `estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/` | `/blog/estacionamento-proximo.../` | 359 |
| `blog/ponce-park-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/` | `/blog/aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/` | 289 |
| `qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022/` | `/blog/qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022/` | 224 |
| `qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023/` | `/blog/qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023/` | 149 |
| `estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos/` | `/blog/<mesmo slug>/` | 142 |
| `quanto-custa-para-estacionar-no-aeroporto-viracopos/` | `/blog/<mesmo slug>/` | 134 |
| `conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023/` | `/blog/<mesmo slug>/` | 124 |
| `estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online/` | `/blog/<mesmo slug>/` | 24 |
| `como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos/` | `/blog/<mesmo slug>/` | 20 |
| `encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos/` | `/blog/<mesmo slug>/` | 18 |
| `blog/categoria/aeroporto-viracopos/` | `/destinos/aeroporto-de-viracopos` | 0 |

### Fora do escopo do blog (23 regras)

Apontam para páginas de unidade e hubs de aeroporto. **Não entram nesta entrega**, mas ficam
registradas aqui porque foram descobertas junto e não existem em nenhum outro lugar. Elas
pertencem à spec de corte do `/estacionamentos/`, que ainda não existe.

Dois defeitos merecem correção no WordPress antes do corte, porque migrar defeito é caro:

- **`/estacionamento/ponce-park-guarulhos/` está quebrado.** É a regra com mais acessos do
  site (109.999) e aponta para o post ID 695, que foi deletado. Hoje devolve 301 com
  `Location` vazio. É o "Erro de redirecionamento: 1" do relatório de indexação.
  `/estacionamento-aeroporto-guarulhos/ponce-park-guarulhos/` (685 acessos) tem o mesmo alvo.
- **`/estacionamento/garage-inn-aeroporto-viracopos/` faz cadeia dupla.** 7.965 acessos, e
  redireciona para `https://movepark.co/?p=694`, que só então resolve para a URL canônica.

A tabela completa é reproduzível a qualquer momento:

```bash
ssh -p 3022 <user>@gate.paas.saveincloud.net.br 'cd /var/www/webroot/ROOT && php wp-cli.phar db query "SELECT url_from, url_to, count FROM ko1_redirects ORDER BY count DESC" --skip-column-names'
```

## Modelo de dados

Tabela `public.blog_post`, espelhando `destination`, que já é o molde de conteúdo do projeto.

```
blog_post
├── id                uuid pk
├── slug              text unique not null   // idêntico ao do WordPress, é o contrato
├── title             text not null
├── excerpt           text|null
├── body_md           text not null          // markdown
├── cover_image_url   text|null              // assets-public/blog/<slug>/
├── meta_title        text|null              // de _yoast_wpseo_title
├── meta_description  text|null              // de _yoast_wpseo_metadesc
├── destination_id    uuid|null → destination(id)
├── author_name       text|null
├── published_at      timestamptz not null
├── is_published      bool not null default false
├── legacy_wp_id      int|null unique        // idempotência do importador
├── legacy_url        text|null              // auditoria da migração
└── created_at, updated_at, deleted_at
```

Índices: `blog_post_published_idx (is_published, published_at desc)` para o caminho de leitura
pública, e `blog_post_destination_idx (destination_id)` para listar posts na página do destino.

### RLS

| Política | Regra |
|---|---|
| `blog_post_select` | `SELECT USING (true)`. Conteúdo publicado é público |
| `blog_post_admin_write` | `ALL USING/WITH CHECK is_hub_admin()` |

Igual a `destination`: `is_published` não é filtrado na RLS, e sim na camada de query
(`.eq("is_published", true)` nos fetchers públicos e no `getStaticPaths`). O Manager precisa
enxergar rascunho pela mesma policy.

### Por que `destination_id` importa

É a coluna que transforma post em conversão. Sem ela o post preserva o ranking e desperdiça a
visita, porque não tem para onde mandar o leitor. Com ela, o CTA e os cards de unidade são
derivados, e o post passa a apontar para `/destinos/<slug>` sem ninguém reescrever conteúdo.

O mapeamento na importação sai de `_yoast_wpseo_primary_category`, presente nos 93 posts.

## Importador

Script `scripts/import-wp-blog.mjs`, idempotente, com `--dry-run`. A REST API do WordPress
está aberta e expõe tudo que é necessário, incluindo `yoast_head_json` (meta de SEO) e `acf`.
O SSH não é necessário para o conteúdo; ele serve para a tabela de redirects e para baixar
mídia em lote se a API engasgar.

1. Puxa os 93 posts de `/wp-json/wp/v2/posts?per_page=100&status=publish`
2. Converte o HTML do corpo para Markdown, limpando shortcode e wrapper de bloco
3. Baixa a mídia referenciada, sobe em `assets-public/blog/<slug>/` e reescreve os caminhos
4. Mapeia `_yoast_wpseo_primary_category` para `destination_id`
5. Faz upsert por `legacy_wp_id`

O rascunho ID 1302 ("Os 10 principais blogs para viagens em 2024") fica de fora: nunca foi
publicado, não tem slug definido e não tem URL a preservar.

**Cuidado com a mídia.** São 311 itens no acervo, mas nem todos pertencem a post. O importador
só move o que é referenciado pelos 93 posts, e reporta o que ficou para trás em vez de copiar
o diretório inteiro.

## Rotas e renderização

| Rota | Shell | Descrição |
|---|---|---|
| `/blog` | `ConsumerAppShell` | Índice paginado, SSG via `loader` |
| `/blog/:slug` | `ConsumerAppShell` | Post, SSG via `getStaticPaths` + `loader` |

Mesmo padrão de `/destinos` e `/destinos/:slug`. As URLs entram no `dynamicRoutes` do
`vite-plugin-sitemap` em `vite.config.ts`. JSON-LD `BlogPosting` mais `BreadcrumbList` em
`src/lib/jsonld.ts`.

### ADR-009

O post é conteúdo, não vitrine transacional. **Nenhum bloco de post promete preço,
cancelamento, alteração ou vaga garantida.** O CTA leva para o destino ou para a unidade, onde
`getLocationCapabilities` manda. Um post que exiba tarifa fixa no corpo é dívida: no dia em que
a unidade mudar de `checkout_mode`, o texto vira promessa falsa que o código não consegue
retirar.

## Manager

`/manager/blog`, com lista, filtro por destino e status, e editor de markdown. Segue os padrões
descritos em [manager-panel.md](./manager-panel.md). Escrita gateada por `is_hub_admin()`.

## Frescor

SSG significa que publicar post exige rebuild. Falta o **webhook Supabase para o Deploy Hook do
Cloudflare Pages**, pendência já registrada em
[agent-readiness-seo.md](./agent-readiness-seo.md) desde junho. Sem ele, publicar um post vira
tarefa de dev, o que anula o motivo de ter escolhido banco em vez de MDX.

## Testes

| Camada | O que cobre |
|---|---|
| `src/worker.test.ts` | O contrato de URL inteiro: os 93 slugs respondem 200 com barra, a versão sem barra devolve 301, as 11 categorias e os 17 redirects legados apontam para o alvo certo |
| pgTAP | RLS de `blog_post`: anônimo lê publicado, não escreve; `hub_admin` escreve |
| Vitest | Conversão HTML para Markdown e mapeamento de categoria para destino no importador |
| Vitest | Página do post e índice, incluindo o caso de post sem `destination_id` |

O teste do worker se apoia num **fixture versionado com os 93 slugs**, congelado a partir do
`post-sitemap.xml`. É ele que impede alguém renomear um slug sem perceber que quebrou uma URL
que o Google conhece.

## Sequência de execução

1. Schema, rotas, worker e Manager. O blog sobe vazio, invisível, porque o `hub.` responde `noindex`
2. Importa os 93 posts e valida com o teste de contrato ainda no `hub.`
3. **Cria os 6 destinos ausentes**, Navegantes e Recife primeiro
4. Corrige no WordPress os dois redirects defeituosos, para não migrar defeito
5. Vira o domínio: o `movepark.co` passa a apontar para o Hub e as 93 URLs seguem respondendo no mesmo endereço
6. Consolidação das duplicatas vira projeto separado, medido com o Hub já rodando

O passo 3 não bloqueia o passo 5 tecnicamente. Mas o post mais clicado do blog é sobre
Navegantes, que não existe como destino, e o tema Recife puxa 2.627 cliques. Migrar sem eles
preserva o ranking e joga fora a visita.

Como o `hub.movepark.co` já responde `X-Robots-Tag: noindex, follow`, os passos 1 e 2 rodam em
produção sem risco de SEO. A migração deixa de ser um evento e vira uma chave.

## Dívida conhecida

- **Duplicação de conteúdo.** São 35 posts de Guarulhos e 26 de Viracopos, muitos quase
  idênticos. As 94 URLs em "rastreada, mas não indexada" do Search Console são o sintoma.
  Consolidar tem ganho real, mas é decisão de conteúdo com risco próprio, e por isso ficou
  para depois do corte (decisão 2).
- **Diferença de contagem.** O Search Console vê 103 URLs de blog e o sitemap tem 93. A
  diferença deve estar na cauda, em URLs da árvore `/pt/` ou em taxonomia contada como blog.
  Precisa ser reconciliada antes do corte, porque cada URL não explicada é um 404 em potencial.
- **Multisite.** O WordPress é uma rede com três sites (`/`, `/pt/`, `/es/`). O `/es/` tem 0
  redirects e não apareceu no levantamento de tráfego. A árvore `/pt/` é a decisão 4 em aberto
  da planilha e não pertence a esta spec.
