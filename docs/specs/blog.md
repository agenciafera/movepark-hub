# Blog

> **Status:** ✅ implementado em 10/08/2026. Migrations `20260929000000_blog_post.sql` e
> `20260930000000_blog_taxonomy.sql`, importador `scripts/import-wp-blog.mjs`, taxonomia derivada
> em `scripts/blog-taxonomy.mjs`, rotas SSG do índice, dos arquivos e do post, política de URL em
> `src/worker.ts`, admin em `/manager/blog`. Os 93 posts estão no banco e no build, com categoria,
> autor e tag. O acervo cresce daí para cima com post novo escrito no Hub; o fixture de contrato
> continua congelado nos 93 slugs herdados, porque é ele que guarda o tráfego do WordPress.
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
| `aeroporto-navegantes` | 2 | `aeroporto-internacional-de-navegantes` |
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

SSG significa que o HTML do post nasce no build, mas publicar não espera o deploy: o worker
confirma no banco o slug que o manifesto ainda não tem e serve a casca, e o cliente renderiza.
Ver "Publicar sem esperar o deploy" abaixo. O HTML pré-renderizado (e a entrada no sitemap)
chega no build seguinte, que roda sozinho a cada push na `main`.

## Testes

| Camada | O que cobre |
|---|---|
| `src/worker.test.ts` | O contrato de URL inteiro: os 93 slugs respondem 200 com barra, a versão sem barra devolve 301, as 11 categorias e os 17 redirects legados apontam para o alvo certo |
| pgTAP | RLS de `blog_post`: anônimo lê publicado, não escreve; `hub_admin` escreve |
| Vitest | Conversão HTML para Markdown e mapeamento de categoria para destino no importador |
| Vitest | Render do markdown: rótulo de link, título dentro de item de lista, continuação indentada e sublista |
| Vitest | Página do post e índice, incluindo o caso de post sem `destination_id` |

O teste do worker se apoia num **fixture versionado com os 93 slugs**, congelado a partir do
`post-sitemap.xml`. É ele que impede alguém renomear um slug sem perceber que quebrou uma URL
que o Google conhece.

## Sequência de execução

1. Schema, rotas, worker e Manager. O blog sobe vazio, invisível, porque o `hub.` responde `noindex`
2. Importa os 93 posts e valida com o teste de contrato ainda no `hub.`
3. **Dá inventário aos destinos que existem sem unidade** (Confins, Recife e Navegantes primeiro)
4. Corrige no WordPress os dois redirects defeituosos, para não migrar defeito
5. Vira o domínio: o `movepark.co` passa a apontar para o Hub e as 93 URLs seguem respondendo no mesmo endereço
6. Consolidação das duplicatas vira projeto separado, medido com o Hub já rodando

O passo 3 não bloqueia o passo 5 tecnicamente. Mas o post mais clicado do blog é sobre
Navegantes e o tema Recife puxa 2.627 cliques, e nenhum dos dois destinos tem unidade listada:
a visita chega, lê e não encontra o que reservar. Medido em 11/08/2026, **7 destinos publicados
têm zero unidade** (CNF, REC, NVT, GIG, BSB, POA, SDU) e o Porto tem uma unidade não listada.
Falta oferta, não falta cadastro: todos os aeroportos que o blog cita já existem como destino,
e os 94 posts estão vinculados.

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

### Hierarquia da listagem

A listagem era doze cards do mesmo tamanho, e uma página onde nada é mais importante que nada não
tem ponto de entrada: o leitor varre e sai. São dois pesos, em `features/blog/PostCard.tsx`:

| | `FeaturedPostCard` | `PostCard` |
|---|---|---|
| Layout | duas colunas, capa ao lado do texto | capa acima do texto |
| Manchete | `display-xl` (28px) | `display-sm` (20px) |
| Resumo | inteiro, `body-md` | cortado em 3 linhas, `body-md` |

A manchete do destaque **empata** com o h1 da página, e esse é o teto: o contrato do consumer não
deixa nenhum h2 pesar mais que o h1. Na referência (o blog técnico do QuintoAndar no Medium) o
destaque tem o tamanho do nome da publicação, e é essa proporção que faz o bloco abrir a página
em vez de só ocupar espaço.

**Card sem moldura.** Havia um retângulo com borda e canto arredondado em volta de cada post, e
doze molduras iguais na tela viram grade de caixas, não lista de leitura. A capa, o título e o
resumo delimitam o item sozinhos. Sem a moldura quem separa uma linha da outra é o espaço, então
o respiro vertical do grid (`gap-y-12`) é o dobro do horizontal (`gap-x-6`).

**A assinatura tem rosto.** Avatar do autor (`blog_author.avatar_url`), com as iniciais do mesmo
helper da topbar quando não há foto cadastrada. Post é assinado por gente, e o rosto separa a
assinatura de mais uma linha de metadado cinza. O `listSelect` traz `avatar_url` junto do nome.

**O destaque só existe na abertura do blog**, ou seja, `kind === "index"`, página 1, sem busca
ativa. Em arquivo de categoria, página 2 e resultado de busca o leitor já sabe o que procura, e
promover o primeiro da lista dá a ele um peso que a ordem por data não justifica.

Categoria e destino saíram da linha da data e viraram eyebrow (`text-mp-indigo`, 11px, caixa
alta). Na linha da data eles tinham o mesmo peso dela, então era preciso ler para descobrir do
que o post tratava. O eyebrow **não** usa `mp-primary`: violeta é reservado a elemento
acionável, e o rótulo não é clicável.

### Capas não são recortadas

As capas do WordPress vêm em proporções que vão de 1:1 a 2,12:1, e boa parte é banner com a
manchete gravada dentro da imagem. Uma caixa fixa com `object-cover` cortava esse texto: medido
em 16/9, **104 das 131 imagens perdiam 15% ou mais**, e as 8 quadradas perdiam 43,8%.

A página do post e o card do índice usam o mesmo `CoverImage`: caixa 3:2 com a imagem inteira
por cima de uma cópia minúscula desfocada, que preenche a sobra. Não há corte nem tarja.

### Largura e hierarquia do post

O post usa o container de conteúdo (`max-w-[1080px]`), o mesmo das páginas de `ContentPageView`,
e não o de leitura (720). Com 720 no container inteiro o desktop entregava 656px de texto e uma
capa do mesmo tamanho, sobrando 360px de branco de cada lado.

**O cabeçalho abre em duas colunas no desktop**, capa à esquerda e bloco de título à direita.
Empilhado, a capa era uma faixa de 520px entre a manchete e a primeira linha do texto, e quem
chegava de busca via título e imagem, rolava, e só então descobria do que o post tratava. No
mobile a ordem do DOM manda (título, capa, texto), que é a ordem de leitura certa; a capa só vai
para a esquerda quando há duas colunas (`desktop:order-first`).

**O corpo divide a linha com uma coluna lateral** de 300px (`PostSidebar`), que leva o CTA do
destino e o "Leia também" com miniatura. Os dois viviam no rodapé, ou seja, depois de seis
minutos de leitura, que é onde o leitor já foi embora.

Dentro do container as larguras são:

| Bloco | Largura | Por quê |
|---|---|---|
| Corpo e tags | coluna `minmax(0,1fr)` da grade, ~676px | Cai na mesma medida de leitura de 68ch. **Alinhado à esquerda**: centralizado, dava à página um terceiro eixo, entre a borda da capa e a do título |
| Capa | metade da grade do cabeçalho (~512px) | Ao lado do título, não acima dele |
| Lateral | 300px | CTA e relacionados acompanhando a leitura |

Sem lateral (post sem destino **e** sem relacionado) o corpo volta para `max-w-[68ch]`, senão o
parágrafo se esticaria pelos 1016px do container. Hoje **nenhum post publicado cai nesse caso**,
porque todos têm destino; o caminho é coberto por teste, não por inspeção na tela.

O `sizes` da capa acompanha a coluna (`(min-width: 1144px) 512px, 100vw`): errar esse valor faz
o browser baixar o candidato errado do `srcset`.

**A página é uma pilha de faixas**, não um container só. O `<article>` empilha três, e cada uma
repete o container por dentro: cabeçalho (`surface-soft`, sangrando na largura toda), corpo
(branco) e "Últimos posts" (`surface-soft`). Faixa nova tem que repetir o container, senão sai
desalinhada das outras; um teste percorre os filhos do `<article>` e cobra isso.

A referência de design traz a faixa do cabeçalho em lavanda. Ficou em `surface-soft`, o mesmo
cinza do `ContentPageView`, porque violeta pálido não existe no catálogo de tokens e o cinza já
cumpre o papel estrutural de separar cabeçalho de corpo. Trocar exige token novo e edição no
`DESIGN.md`.

**Ordem da lateral: relacionados, depois o CTA.** Quem está no meio da leitura procura o próximo
texto, não a busca de vaga. O CTA é violeta preenchido (`bg-mp-primary`), a única exceção
deliberada à regra de que violeta só pinta elemento acionável: o card inteiro é o elemento de
conversão da página, e o botão dentro dele usa a variante clara para não sumir no fundo.

**"Últimos posts" é diferente do "Leia também".** Na lateral são posts do mesmo destino; na faixa
do rodapé são os mais recentes do blog inteiro, com `useLatestPosts`. Sem ela, o fim do artigo é
um beco: o leitor termina e a única saída é o botão de voltar. A consulta é própria, com `limit`,
em vez de reaproveitar o acervo enxuto de 240 KB da listagem.

**`sticky` na lateral exige `self-start`.** Por padrão o item da grade estica até a altura da
linha, e um elemento do tamanho da própria linha nunca tem por onde grudar: o `sticky` fica no
CSS sem efeito nenhum. Encolhido ao conteúdo, ele volta a ter espaço. O teto
`max-h-[calc(100dvh-7rem)]` é o seguro para tela baixa: grudado, um bloco mais alto que a janela
deixaria o último relacionado fora de alcance pelo artigo inteiro, já que o `sticky` só solta
quando a linha da grade acaba.

### O raio do blog é o `rounded-md`

Capa, card, CTA, resumo, tabela e imagem do corpo usam **`rounded-md` (14px)**, que é o raio de
container do `DESIGN.md` ("mais arredondado que botões, criando distinção clara entre elemento
interativo e container"). Botão e campo seguem em `rounded-sm` (8px), chip e avatar em
`rounded-full`.

**Cuidado com `rounded-xl` neste projeto: ele é 32px, não 12px.** A escala foi redefinida em
`tailwind.config` (`xs` 4, `sm` 8, `md` 14, `lg` 20, `xl` 32), então o nome que no Tailwind
padrão é discreto aqui é o raio mais forte da escala. A capa do card da listagem foi para 32px
por causa disso e virou o elemento mais arredondado da página.

`rounded-2xl` **não existe** no catálogo: ele passa porque o `borderRadius` do projeto está em
`extend`, e aí o valor padrão do Tailwind (16px) continua respondendo. Ao escrever raio novo,
use um dos cinco nomes da escala.

### Trilho de progresso, compartilhar e ouvir

Três blocos que a página do post ganhou, todos sem serviço externo e sem script de terceiro.

**Trilho de progresso** (`PostProgress`): uma barrinha por seção, fixa na lateral esquerda, a
atual em destaque. Responde onde o leitor está num guia de seis minutos e serve de atalho entre
seções. Cada barra é âncora de verdade, com o título da seção no nome acessível. O estado ativo
vem do mesmo `useActiveSection` do índice das páginas de conteúdo (`IntersectionObserver`, não
listener de scroll). **Só aparece a partir de 1280px**: entre 1128 e 1280 a margem lateral do
container é estreita demais e o trilho encostaria no texto. Medido a 1400px, sobram 138px entre
o fim do trilho e o começo do conteúdo.

**Compartilhar** (`PostShare`): cada rede é um link comum para o endpoint público dela, sem SDK.
Botão de rede social costuma vir com rastreador embutido; aqui o leitor só chega ao site da rede
quando clica, e um teste cobra que nenhum `script` ou `iframe` entre na página. O botão de copiar
depende da Clipboard API, que exige contexto seguro, então some em HTTP em vez de ficar na tela
sem funcionar.

**Ouvir o post** (`PostAudio`): Web Speech API, a voz do próprio navegador. Nada é gerado,
armazenado nem cobrado por post, e vale para o acervo inteiro no dia em que sobe. O custo é a
voz, que é a do sistema e varia de aparelho para aparelho. Um TTS com voz de estúdio (ElevenLabs
e afins) exigiria chave de API, custo por post e um arquivo no bucket, e fica como upgrade.

Três armadilhas da API, todas tratadas:

| Armadilha | Tratamento |
|---|---|
| O Chrome corta a fala perto dos 15s | `falasDe()` quebra o texto em falas de até 180 caracteres, em fim de frase, e um pulso chama `resume()` enquanto fala |
| A lista de vozes carrega assíncrona e vem vazia no primeiro acesso | `voiceschanged` |
| A fala não morre com a página | `cancel()` na limpeza do efeito, senão a voz segue lendo por cima da tela seguinte |

O corte é em fim de frase, não em número de caracteres: quebrar no meio faz a voz baixar o tom
como se tivesse terminado. Frase maior que o teto cai no corte por palavra. O texto lido é o
`plainText` do corpo, porque a marcação do markdown virava "asterisco asterisco" na fala.

Os três só renderizam no cliente e o suporte é checado em efeito, não na renderização: decidir na
primeira renderização faria a árvore divergir do HTML assado no build.

### O bloco recolhível do topo tem duas fontes

`PostSummary` abre o corpo com um bloco fechado, e o que ele mostra depende do que existe:

| Fonte | Rótulo | Quando |
|---|---|---|
| `blog_post.ai_summary` | "Ver resumo" | Há resumo escrito ou gerado |
| `h2` do corpo | "Nesta página" | Não há resumo, e o post tem 2 seções ou mais |

Nasce fechado: aberto por padrão ele empurraria o primeiro parágrafo para fora da tela, que é o
que o cabeçalho em duas colunas acabou de arrumar. Índice de uma seção só não é índice, é o
título repetido, então nesse caso o bloco não existe.

**`ai_summary` é coluna separada de `excerpt` de propósito.** O `excerpt` é o resumo automático do
WordPress e alimenta o card da listagem e a meta description; reusar aquela coluna faria uma
edição estragar a outra superfície. Hoje `ai_summary` é nula em todo post, e a geração por IA
ainda não existe: falta o segredo `ANTHROPIC_API_KEY` no projeto e uma Edge Function que escreva
na coluna. Enquanto isso o índice das seções cobre o bloco.

**As âncoras são contadas nos dois lados.** `sectionsFrom()` numera os `h2` para montar o índice e
o `PostBody` numera os mesmos `h2` para escrever o `id`. Se um dos dois mudar de critério, o
índice aponta para o nada; um teste renderiza o corpo e cobra que todo item ache seu título. O id
leva prefixo `secao-` porque id começando com dígito é HTML válido e seletor CSS inválido, e
título de guia quase sempre começa com número.

### O resumo só vira lead quando alguém escreveu um

O `excerpt` de quase todo post migrado é o resumo automático do WordPress, que é o começo do
próprio corpo cortado em "[...]". Usado como linha fina, o leitor lia o mesmo parágrafo duas
vezes seguidas, com a primeira versão truncada no meio da frase.

`leadFrom()` (em `markdown.logic.ts`) só deixa passar o resumo que **não** é o começo do corpo. A
comparação ignora acento, caixa e pontuação, porque o resumo passou por conversão de entidade
HTML e volta com aspas diferentes das do markdown. Na listagem o `excerpt` continua sendo
mostrado inteiro: ali ele é prévia, e o corpo não está na mesma página.

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

## API e MCP

### Leitura (pública, documentada)

Três rotas no gateway, escopo `blog:read`, publicadas no
[OpenAPI](../../public/openapi.yaml) e na superfície §9 de
[public-api.md](./public-api.md).

| Rota | O que devolve |
|---|---|
| `GET /v1/blog/posts` | Lista, com filtros `q`, `category`, `tag`, `author`, `destination`, `limit`, `offset`. Sem `body_md` |
| `GET /v1/blog/posts/{slug}` | Post completo, com Markdown e meta de SEO |
| `GET /v1/blog/taxonomy` | Categorias, tags e autores, com os slugs que os filtros aceitam |

O blog é a **exceção ao tenant implícito** da API: nada é filtrado por
`company_id`, porque o conteúdo é da Movepark e já é público no site. A resposta é
igual para qualquer chave.

O filtro de `tag` roda depois da consulta, e não no PostgREST. Filtrar a N:N no
servidor devolveria o post com a lista de tags podada, escondendo as outras.

No MCP consumidor (e, pelo mesmo registro, no chat web) entram duas tools:
`search_blog` para achar o post e `get_blog_post` para ler o corpo e citar a URL.

### Escrita (interna, não documentada em superfície pública)

Publicar post é ação de Manager, e **superfície pública não anuncia ação de
Manager**. As rotas abaixo existem, funcionam e ficam fora do OpenAPI e de
qualquer card de MCP. O contrato delas é este trecho.

| Rota | Corpo | Efeito |
|---|---|---|
| `POST /v1/blog/posts` | `slug`, `title`, `body_md` obrigatórios; `excerpt`, `cover_image_url`, `meta_title`, `meta_description`, `category`, `author`, `destination`, `tags[]`, `is_published` | Cria ou atualiza por `slug` |
| `POST /v1/blog/posts/{slug}/publish` | `is_published` (default `true`) | Publica ou despublica |
| `POST /v1/blog/posts/{slug}/delete` | vazio | Soft delete |

As referências entram por **slug, não por uuid**: id interno não é contrato, e
quem escreve um post conhece `precos` e `aeroporto-de-viracopos`. Slug inexistente
devolve 400 dizendo qual campo falhou, em vez de gravar a referência nula.

Três camadas seguram o acesso:

1. **Escopo de plataforma.** `blog:write` tem `is_platform_scope = true`, então o
   trigger `company_role_scope_no_platform` recusa colocá-lo em qualquer papel de
   empresa. Nem o Dono, que tem "todos" os escopos, alcança. Só existe numa chave
   da própria Movepark.
2. **`internalRoute()` no gateway.** A rota carrega a marca de interna, que o
   `matchRoute` propaga.
3. **O guard inverte a asserção.** `lint:openapi` **reprova** se uma rota interna
   aparecer no OpenAPI. Ou seja, o CI protege o sigilo em vez de apenas tolerá-lo.
   Verificado: publicar `POST /v1/blog/posts/{slug}/publish` no contrato quebra o
   build.

Medido contra o banco vivo em 11/08/2026: leitura 200 e filtros corretos; escrita
com chave sem o escopo devolve 403; sem chave, 401; método errado, 405; ciclo de
criar como rascunho, publicar, excluir e sumir da leitura, todo verde.

As mesmas três operações também são **tools de MCP** em `https://mcp.movepark.co/manager`, com a
mesma chave de plataforma e o mesmo `_shared/blog-write.ts` por trás. A superfície é interna: sem
card, e recusa o `tools/list` sem chave. Ver [`mcp.md`](mcp.md) §4.4.

**A credencial e a documentação delas moram em `/manager/api-interna`**, atrás do
`RequireRole hub_admin`. A página traz o catálogo das rotas acima, as três
superfícies de MCP, o motivo de não existir MCP de Manager, e a emissão da chave
de plataforma. `manager-docs.contract.test.ts` casa o catálogo com o
`internalRoute()` do router nos dois sentidos, então rota nova sem documentação
reprova, e documentação sem rota também. Ver
[`permissions.md`](permissions.md) para a chave sem empresa.

## Publicar sem esperar o deploy

O site é SSG, então o HTML de um post nasce no build. Publicar pelo Manager cria
uma URL que o manifesto do build ainda não conhece, e o 404 real do worker (feito
para matar a casca vazia) enterraria justamente o post recém-publicado.

O worker resolve com uma segunda opinião: slug fora do manifesto vira uma consulta
`blog_post?slug=eq.<slug>&is_published=is.true&deleted_at=is.null`. Existe no banco,
serve a casca e o cliente renderiza na hora; não existe, 404. O HTML pré-renderizado
chega no build seguinte, e até lá a URL abre.

O veredicto fica em cache no isolate, **inclusive o negativo**, porque o caso
barulhento é bot varrendo slug inventado e cada varredura sem cache viraria uma
consulta. O cache tem teto (500) para a memória não crescer com entrada que o
visitante escolhe. Banco fora do ar serve a casca em vez de 404, e esse caso não
entra em cache.

A leitura usa a anon key, com as `vars` do `wrangler.jsonc`. Quem decide o que ela
enxerga é a RLS: a policy de SELECT do `blog_post` só devolve publicado e não
excluído para quem não é hub_admin, então rascunho não abre por URL adivinhada.

## O que o markdown do WordPress exigiu do render

O editor clássico gerou construções que um parser ingênuo mostra cru. Medido no acervo e
corrigido em `markdown.logic.ts`:

| Construção | Efeito antes | Tamanho |
|---|---|---|
| `[**Nome**](url)` | os asteriscos iam para a tela | 28 links em 17 posts |
| `1.  ### **Título:**` | o `###` aparecia dentro do item | 12 itens em 3 posts |
| Corpo do item indentado embaixo dele | virava parágrafo solto e reiniciava a numeração | 18 linhas em 5 posts |
| `  - subitem` | a sublista era achatada no mesmo nível | 16 posts |
| `**[Nome](url)**` | o link aparecia literal dentro do negrito | 20 blocos |
| `* * *` | virava um item de lista com o texto "* *" | 105 linhas em 14 posts |
| post que abre em `###` | buraco no outline, sem nenhum `h2` | 9 posts |
| `<table>` do editor clássico | o turndown derramava as células como parágrafos | 32 posts |
| parágrafo que é só negrito | subtítulo com peso de corpo, fora do outline | 27 blocos |
| `1\.`, `\[3, 1\]`, `\*` | a barra invertida do escape ia para a tela | 261 no acervo |

Três decisões que valem registrar. **Todo nó que envolve outro guarda `children`**, não texto:
guardando o miolo como string, ou o negrito dentro do link ou o link dentro do negrito sempre
aparecia cru, dependendo de qual ficasse por fora. **Linha em branco não fecha lista na hora**:
fica pendente e só fecha se o que vier depois não pertencer a ela, porque o WordPress separa os
itens com uma linha de espaços. E o **separador temático é testado antes da lista**, senão
`* * *` casa com o marcador de item.

Sobravam dois casos, e nenhum era do parser. Os dois foram fechados na reimportação de
11/08/2026, junto com o que a revisão do conteúdo achou depois.

**Tabela voltou a ser tabela.** 32 dos 93 posts têm tabela, quase sempre comparativo de preço,
traslado e diferencial. O turndown não converte `<table>` e desmontava cada uma em parágrafos
soltos: o comparativo virava uma coluna alternando número e título. Agora há regra de tabela no
turndown (célula com pipe escapado, linha curta completada até o número de colunas), bloco
`table` no parser e render com `overflow-x-auto`, para a tabela rolar dentro dela mesma em vez de
empurrar a página. São 249 linhas de tabela em 32 páginas.

**Parágrafo que é só negrito virou `h4`.** O critério é estreito de propósito: nó único, negrito,
até 80 caracteres e sem pontuação final. Frase inteira em negrito continua parágrafo. Ficaram 27
títulos, não os 165 que a contagem crua sugeria.

**Link para o site antigo virou link para o Hub.** Eram 165 no corpo dos posts, todos apontando
para um domínio que sai do ar. Cada caminho foi mapeado: `/estacionamentos/<aeroporto>` e
`/estacionamentos/<aeroporto>/<lote>` caem no destino (o Hub não tem página por lote), os posts que
moraram na raiz vão para `/blog/<slug>/`, e o subdomínio de parceiro aponta para o destino onde
aquele lote é vendido hoje. Sobrou zero link legado, e nenhum precisou virar texto.

Em 4 posts o texto visível do link era a própria URL antiga. Trocar só o destino deixaria na tela
um endereço que não existe mais, então o rótulo passa a nomear o destino ("Estacionamentos no
Aeroporto de Guarulhos").

**O regex de link casava com imagem.** Sem checar o `!` antes do colchete, `![alt](src)` entrava na
reescrita e a imagem virava texto: 81 imagens do acervo. O `(?<!!)` é o que separa os dois casos, e
o teste de regressão vive no dry-run, que conta imagem reaproveitada.

**Alt vindo do nome do arquivo.** 8 imagens do WordPress vieram sem `alt`. Os nomes são
descritivos ("estacionamento-aeroporto-viracopos.webp"), então viram legenda. A capa também
passou a exigir `alt`: era o único `<img>` visível do post sem texto alternativo, e no card do
índice ela é o que dá nome ao link.

**A barra invertida do escape parou de aparecer.** O turndown escapa por precaução, sem olhar
o contexto: `1\.` para o número não abrir lista, `\[3, 1\]` para o colchete não virar link,
`\*` para o asterisco não abrir negrito. Dentro de um título ou no meio de uma frase nada disso
podia acontecer, e só a barra chegava ao leitor. Eram 261 no acervo, em 38 posts.

O conserto é dos dois lados, e os dois importam. O parser passou a ler o escape como manda o
markdown, então o que for escrito daqui pra frente já renderiza certo. E a importação tira o
escape desnecessário da origem, porque o `.md` não é só um passo intermediário: ele é servido em
`/blog/<slug>` sob `Accept: text/markdown`, que é o que a Public API e os agentes leem.

Dois casos ganharam tratamento próprio. `\*\* Texto:\*\*` era negrito que o editor digitou com
espaço sobrando, e o WordPress mostrava os asteriscos crus: virou negrito de verdade. E o corte de
célula de tabela passou a ignorar `\|`, que é pipe no texto e não separador, senão uma célula com
pipe vira duas e desalinha a linha.

### Como a reimportação chegou ao banco sem service key

O corpo dos 93 posts soma 384 KB, e não havia `SUPABASE_SERVICE_ROLE_KEY` no ambiente. O caminho
foi pelo que já é público: os `.md` do `public/blog/` são commitados e servidos pelo worker, então
o deploy publicou o conteúdo novo, o Postgres leu de lá com `pg_net` (`Accept: text/markdown`, com
query de cache-bust porque a borda serviu cópia velha na primeira tentativa) e o `UPDATE` saiu de
uma tabela de trabalho descartada logo depois.

A garantia de que nada se perdeu no caminho é uma impressão só: `md5` da concatenação de
`slug || body` em ordem de slug, calculada dos dois lados. Bateu em `4d8d435c…` com 384.309
caracteres, antes e depois da escrita. Vale reusar esse truque em qualquer migração de conteúdo:
uma comparação de um valor prova mais que uma amostragem.

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
- **Blog fora da base vetorizada.** O `knowledge-embed` indexa `faq`,
  `directions_text`, `notice` e `reservation_policy`, e os 93 posts continuam de
  fora. As tools `search_blog`/`get_blog_post` cobrem o caso por busca literal,
  mas a busca semântica do RAG acharia o post por pergunta parafraseada, que é
  como o usuário fala. Entrada natural: `blog_post.body_md` como `source_type`
  novo, reusando o chunking que já existe.
- **HTML pré-renderizado do post novo.** A URL abre na hora (o worker confirma no banco), mas
  até o build seguinte ela chega ao visitante como casca renderizada no cliente, sem HTML servido
  e fora do sitemap. Para post novo isso é irrelevante hoje, porque o `hub.movepark.co` responde
  `noindex`; vira pendência de verdade no dia do corte para o `movepark.co`. A saída completa é
  um gatilho de build a partir do banco, que exige token de API da Cloudflare com escopo de
  Workers Builds (o OAuth do wrangler nesta máquina não alcança `builds/*`).
- **Egress do Storage.** O bucket saiu de 52 para 183 objetos, e as imagens do blog passam a
  contar egress do Supabase a cada visita não cacheada. É exatamente o gatilho de migração para o
  Cloudflare R2 previsto em [storage-buckets.md](./storage-buckets.md). Não pesa neste volume, mas
  entra no radar quando o blog crescer.
