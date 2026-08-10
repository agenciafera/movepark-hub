# Blog

> **Status:** ✅ implementado em 10/08/2026. Migrations `20260929000000_blog_post.sql` e
> `20260930000000_blog_taxonomy.sql`, importador `scripts/import-wp-blog.mjs`, taxonomia derivada
> em `scripts/blog-taxonomy.mjs`, rotas SSG do índice, dos arquivos e do post, política de URL em
> `src/worker.ts`, admin em `/manager/blog`. Os 93 posts estão no banco e no build, com categoria,
> autor e tag.
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

## Taxonomia

Dois eixos, de propósito.

**Aeroporto** continua sendo `blog_post.destination_id`, que já existia e já alimenta o CTA e a
página `/destinos/<slug>`. **Categoria** é tema editorial: Preços, Comparativos, Guias, Dicas de
viagem e Como reservar. Fazer da categoria mais um nome para aeroporto criaria duas páginas
disputando a mesma busca, que é a canibalização que a [spec de indexação](./seo-indexacao.md)
existe para evitar.

O WordPress não tinha o que importar aqui: das 11 categorias, 8 eram aeroporto, e 84 dos 93 posts
não tinham tag nenhuma. A classificação é derivada do próprio texto por regras determinísticas em
`scripts/blog-taxonomy.mjs`, versionadas: rodar de novo dá o mesmo resultado, e mudar a
classificação é mudar a regra, não o banco.

Tag exige sinal forte (assunto no título, ou cinco ocorrências no corpo). A primeira versão casava
qualquer menção e punha "Segurança" em 82 dos 93 posts; tag que cobre 88% do acervo não filtra
nada. Distribuição final: 2,0 tags por post, nenhum post sem tag, nenhuma tag cobrindo o acervo.

Autores vieram do WordPress (4 pessoas, 93 posts), com nome de exibição editável no Manager. O
`slug` não muda no rename, porque ele é a URL da página do autor.

## Rotas e renderização

| Rota | Descrição |
|---|---|
| `/blog/` | Índice, 12 posts por página |
| `/blog/page/<n>/` | Paginação do índice |
| `/blog/categoria/<slug>/` | Arquivo por tema editorial |
| `/blog/tag/<slug>/` | Arquivo por tag |
| `/blog/autor/<slug>/` | Arquivo por autor |
| `/blog/aeroporto/<slug>/` | Arquivo por aeroporto, dentro do blog |
| `/blog/<slug>/` | Post |

Todos os arquivos aceitam `/page/<n>/`. A página 1 é sempre a raiz do arquivo, nunca `/page/1/`:
duas URLs com o mesmo conteúdo é duplicata.

**Arquivo e paginação respondem `noindex, follow`.** Página de arquivo é lista de links, não
conteúdo próprio, e a de aeroporto ainda disputaria a busca com `/destinos/<slug>`, que é a página
que converte. O `follow` mantém o rastreio, e o sitemap continua listando os 93 posts direto, então
nenhum post depende de arquivo para ser descoberto.

A busca roda no cliente, sobre o acervo completo, e só puxa a lista inteira quando há termo. Ela
casa título, resumo, categoria, aeroporto e tag, ignora acento e exige todos os termos: com 93
posts sobre o mesmo assunto, busca com OU devolveria quase tudo.

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

## O que a execução mudou em relação ao desenho

Três desvios, todos deliberados, e o motivo de cada um.

**As imagens ficaram no Storage, em `assets-public/blog/<slug>/`.** São 131 objetos em 93 pastas,
17 MB. O original somava 58,6 MB e foi convertido para WebP (qualidade 82, largura máxima de
1600px) antes de subir. Dez imagens hotlinkadas do Bing foram descartadas: já vinham quebrando e
carregavam risco de direito autoral.

O bucket é o destino certo por dois motivos que valem mais que a conveniência do repositório: post
novo criado pelo Manager sobe imagem pelo painel, e ninguém deveria precisar commitar arquivo para
publicar; e o endpoint de render dá resize sob demanda, que é o que alimenta o `srcset` das
páginas. Medido na capa de 217 KB: 31 KB em 400px e 95 KB em 800px, com o formato negociado pelo
header `Accept`.

O `scripts/import-wp-blog.mjs` sobe para o bucket quando há `SUPABASE_SERVICE_ROLE_KEY` no
ambiente e cai em `public/images/blog/` quando não há. O render passa por `optimizedImageUrl`, que
transforma URL do Storage e deixa caminho local passar direto, então os dois caminhos funcionam.

**O sitemap ganhou um passo de build.** O `vite-plugin-sitemap` remove a barra final de todo
path e não tem opção para desligar isso, então ele anunciava as 94 URLs do blog na forma que
responde 301. `scripts/canonicalize-sitemap.mjs` roda depois do build e repõe a barra, e falha
o build se sobrar alguma. Sem ele o sitemap entregaria ao Google exatamente a URL não canônica.

**O índice não carrega o corpo dos posts.** Com `body_md` dos 93 posts embarcado no loader, o
HTML de `/blog` saía com 689 KB. O card usa título, resumo, capa e data, então o loader do
índice seleciona só isso: 240 KB, 41 KB comprimido.

### Capas não são recortadas

As capas do WordPress vêm em proporções que vão de 1:1 a 2,12:1, e boa parte é banner com a
manchete gravada dentro da imagem. Uma caixa fixa com `object-cover` cortava esse texto: medido
em 16/9, **104 das 131 imagens perdiam 15% ou mais**, e as 8 quadradas perdiam 43,8%.

A página do post não fixa proporção: limita a altura em 520px e deixa a largura acompanhar a
imagem, então não há corte nem tarja.

O card do índice precisa de caixa fixa para o grid não ficar irregular, e aí `contain` sozinho
deixava 31 das 93 capas com tarja chapada, as 8 quadradas preenchendo só 67%. A solução é a
imagem duas vezes: uma cópia minúscula desfocada preenchendo o fundo (24x16, 392 bytes) e a
imagem inteira por cima. Preenche a caixa, não corta e não chapa.

**Ao pedir transform, mande sempre `resize` e, no `cover`, as duas dimensões.** O render do
Supabase não preserva proporção com só `width`: `?width=400` num original 1600x1067 devolve
400x1067, e `?width=16&resize=cover` devolve uma tira 16x1067 que borrada vira listra. Foi assim
que as capas apareceram achatadas em produção, inclusive fora do blog: o `imageSrcSet` montava
todo candidato só com `width`, e é do `srcset` que o browser escolhe. O helper agora manda
`resize=contain` por padrão, o que também consertou a foto da unidade e o hero do destino.

### GEO

Cada post existe também como `public/blog/<slug>.md`, gerado por
`node scripts/import-wp-blog.mjs --markdown`. A content negotiation que já existia em
`src/worker.ts` passa a servir o post real em `text/markdown`, em vez de cair no `llms.txt`
genérico. O cabeçalho do arquivo traz data, URL canônica e o link do destino. Crawler de IA não
executa JavaScript, então este arquivo é o que faz o conteúdo do blog ser legível por agente.

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
- **Índice sem paginação.** As 93 URLs cabem numa página só hoje (41 KB comprimido). O
  WordPress paginava em `/blog/page/N/`, e essas URLs não têm par no Hub. Elas nunca
  apareceram no Search Console, então ficaram fora; se o acervo crescer, a paginação entra
  junto com a regra de URL.
- **Webhook de rebuild.** Continua pendente. Enquanto não existir, publicar um post pelo
  `/manager/blog` grava no banco mas não aparece no site até o próximo build.
- **Egress do Storage.** O bucket saiu de 52 para 183 objetos, e as imagens do blog passam a
  contar egress do Supabase a cada visita não cacheada. É exatamente o gatilho de migração para o
  Cloudflare R2 previsto em [storage-buckets.md](./storage-buckets.md). Não pesa neste volume, mas
  entra no radar quando o blog crescer.
