# URL e nome do estacionamento

**Status:** virada feita (27/08/2026) · **Migrations:** `20261102090000`, `20261102091500`, `20261103090000`, `20261103091500`, `20261104090000`, `20261104091500` · **Teste:** `supabase/tests/url_publica_estacionamentos.test.sql`
**Relacionado:** [seo-indexacao.md](./seo-indexacao.md) (cutover do domínio), [lote-mapeado-vitrine.md](./lote-mapeado-vitrine.md) (ADR-010, conversão), [borda-cloudflare.md](./borda-cloudflare.md) (worker)

A fase 1 gravou nome e slug canônicos no banco, sem tocar em rota. A virada das URLs veio depois, num evento único, e está registrada abaixo com o que ficou de fora.

## Decisão

Uma gramática só para as duas famílias de ficha, uma página por estacionamento:

```
/estacionamentos                                      índice dos destinos
/estacionamentos/aeroporto-guarulhos                  hub do aeroporto
/estacionamentos/aeroporto-guarulhos/aeropark         ficha, parceira ou mapeada
/estacionamentos/aeroporto-guarulhos/aeropark?vaga=covered
/estacionamentos/aeroporto-guarulhos/precos
/estacionamentos/aeroporto-guarulhos/mais-barato
```

E um formato único de nome, que alimenta H1, `<title>`, card e `name` do JSON-LD:

```
{marca} - Estacionamento {destino}
"Virapark - Estacionamento Aeroporto Viracopos"
```

## Por que

Medido em produção em 27/08/2026, com o site já servindo o `movepark.co`:

| Sintoma | Número |
|---|---|
| URLs de unidade parceira | 17, para **9** estacionamentos físicos |
| URLs de lote mapeado | 43 |
| Palavra-chave na URL da unidade | nenhuma (`/p/`, mais `covered`/`uncovered`/`valet` em inglês) |
| Repetições do aeroporto no slug do lote mapeado | até 3 (`econopark-aeroporto-de-guarulhos-aeroporto-guarulhos`) |

Cinco problemas, em ordem de custo:

1. **O tipo de vaga como terceiro segmento quebra um lote em até três páginas quase idênticas.** Endereço, fotos, mapa, traslado, FAQ e avaliações são os mesmos; muda o preço e um parágrafo. O sintoma foi tratado em [`src/lib/seo.ts`](../../src/lib/seo.ts), que diferencia title e H1 das três, mas a duplicação continua dividindo link e autoridade.
2. **O inventário que não fatura tem a URL boa.** Os 43 lotes mapeados moram em `/estacionamentos/<aeroporto>/<lote>` e os 9 parceiros atrás de um prefixo de uma letra.
3. **Converter parceiro joga o ranking fora.** Pelo ADR-010 a ficha reivindicada responde 301 para `/p/...`, ou seja, a página que ganhou posição é abandonada no momento em que começa a faturar.
4. **A URL depende da empresa, não do lugar.** `/p/<empresa>/<unidade>/` quebra quando o lote troca de operador. Para o Google é um 301; para LLM é pior, porque índice e treino ficam com a URL velha por meses.
5. **O slug do destino contradiz o próprio título.** O título diz "Aeroporto Guarulhos" (a forma medida no Search Console, que virou `destination.seo_label`) e a URL diz `aeroporto-internacional-de-sao-paulo-guarulhos`.

### Por que pasta e não raiz

A alternativa avaliada foi `/estacionamento-aeroporto-guarulhos/virapark`, com a frase exata num segmento só. O ganho de correspondência é praticamente nulo, porque o Google separa tanto em `/` quanto em `-`, e a pasta ganha em três pontos práticos: a raiz do domínio não é ocupada por 27 aeroportos que viram 50 (e não precisa de lista de palavras reservadas para sempre), a hierarquia serve trilha, sitemap e filtro por caminho no Search Console, e `/estacionamentos/` é a pasta que o WordPress usava, onde os 43 lotes mapeados já moram.

## O formato do nome

O destino sai de `destination.seo_label`, a mesma fonte do `<title>` e do H1, recortado pela primeira forma (sem código IATA e sem variante secundária). Curitiba entra como "Aeroporto Curitiba" e não "Afonso Pena"; o Tietê como "Rodoviária Tietê".

A marca é editorial e passou por três limpezas, porque o padrão já traz as três palavras:

| Limpeza | Antes | Depois |
|---|---|---|
| Razão social entre parênteses sai | Airport Park (Supera Park Estacionamento Ltda) | Airport Park |
| Aeroporto que já está no nome sai | Econopark Aeroporto de Guarulhos | Econopark |
| "Estacionamento" genérico sai | Nikkey Estacionamento | Nikkey |

Três exceções, porque tirar deixaria o nome sem sentido: **Park Confins** e **Congonhas Park** carregam o aeroporto no nome de batismo, e **Estapar Oficial** precisa do "Oficial", que é o que separa o lote do próprio aeroporto dos vizinhos.

O nome mais longo do acervo com o sufixo da marca fica em 61 caracteres ("Moveparking - Estacionamento Centro de Nova Iguaçu | Movepark"), dentro do que o Google mostra.

## O formato da URL

**Aeroporto.** `public_slug` derivado do `seo_label`. A maioria só perde o "de/do/internacional". Três mudam de nome:

| Antes | Agora |
|---|---|
| `aeroporto-afonso-pena` | `aeroporto-curitiba` |
| `aeroporto-salgado-filho` | `aeroporto-porto-alegre` |
| `terminal-rodoviario-tiete` | `rodoviaria-tiete` |

Sete destinos estavam sem `seo_label` (Campo Grande, Florianópolis, Fortaleza, Goiânia, Salvador, Teresina, Vitória) e caíam para `short_name`, o que produzia `salvador` e `fortaleza`, sem a palavra "aeroporto". A migration preencheu os sete no formato padrão.

**Ficha.** O último segmento é a marca, único dentro do destino. Para o acervo atual a marca da empresa basta, porque nenhuma tem duas unidades no mesmo destino. Quando tiver, o slug precisa de qualificador (bairro ou via), e o índice único é quem avisa.

| Antes (17 URLs) | Agora (9 URLs) |
|---|---|
| `/p/aeropark/aeroporto-guarulhos/{covered,uncovered,valet}` | `/estacionamentos/aeroporto-guarulhos/aeropark` |
| `/p/aerovalet/aeroporto-guarulhos/{covered,uncovered,valet}` | `/estacionamentos/aeroporto-guarulhos/aerovalet` |
| `/p/abbapark/aeroporto-afonso-pena/{covered,uncovered,premium}` | `/estacionamentos/aeroporto-curitiba/abbapark` |
| `/p/nationpark/aeroporto-afonso-pena/{covered,uncovered,premium}` | `/estacionamentos/aeroporto-curitiba/nationpark` |
| `/p/aerovalet/aeroporto-congonhas/covered` | `/estacionamentos/aeroporto-congonhas/aerovalet` |
| `/p/plenty/aeroporto-congonhas/covered` | `/estacionamentos/aeroporto-congonhas/plenty-park` |
| `/p/virapark/virapark/covered` | `/estacionamentos/aeroporto-viracopos/virapark` |
| `/p/garageinn/aeroporto-viracopos/uncovered` | `/estacionamentos/aeroporto-viracopos/garageinn` |
| `/p/aerovalet/terminal-rodoviario-tiete/covered` | `/estacionamentos/rodoviaria-tiete/aerovalet` |

**Tipo de vaga sai da URL** e vira seção com âncora (`#vaga-coberta`), com `?vaga=coberta` aceito para o deep link vindo da busca e canonical na URL limpa. O schema passa a `Product` + `AggregateOffer` (menor e maior preço), e a tabela com todos os tipos numa página só responde melhor "quanto custa" do que três páginas magras.

## O que a fase 1 gravou

Migration `20261102090000_url_publica_estacionamentos.sql`:

- **`destination.seo_label`** preenchido nos sete que faltavam.
- **`seo_label_primary(text)`**, o recorte que espelha `seoLabelPrimary` de [`src/lib/seo.ts`](../../src/lib/seo.ts). As duas implementações precisam continuar dando o mesmo resultado.
- **`destination.public_slug`**, derivado do rótulo, com trigger para destino novo nascer com ele e unique parcial.
- **`unit_public_name(marca, destino)`**, o compositor do nome. O padrão mora nele, não espalhado pelo backfill: se um destino mudar de rótulo, um `UPDATE` recompõe os nomes de todas as fichas dele.
- **`location.public_name/public_slug`** e **`prospect_location.public_name/public_slug`**, preenchidos nas 19 unidades com destino e nos 67 lotes mapeados. A unidade do Peu Park ficou de fora: não tem destino, e sem destino não há URL pública.
- **Unicidade do slug por destino**, dentro de cada tabela (índice parcial) e entre as duas (trigger dos dois lados). Ficha convertida sai dos dois checks, porque é ela que empresta o slug para a unidade que nasceu da conversão.
- **Nome e slug só de `hub_admin`** (`20261102091500`, achado na revisão de segurança da primeira). A policy `location_operator_update` autoriza por linha, com escopo `locations:write`, e RLS não corta coluna: sem a guarda, o parceiro reescreveria a própria URL depois da virada (canonical, sitemap e mapa de 301 perseguindo endereço que muda sozinho) e poderia tomar o slug do vizinho no mesmo aeroporto, já que o namespace é compartilhado. A mensagem de erro da guarda de unicidade também vira sonda, porque responde se existe lote mapeado com aquele slug ali, inclusive rascunho, que a RLS esconde. Mesma regra e mesmo formato de `checkout_mode` e `go2park_*`. `prospect_location` não precisa: ali a escrita já é só de `hub_admin` (ADR-010).

`slug` e `name` continuam intocados nas três tabelas: são o contrato de URL em produção e o rótulo que o parceiro edita. As colunas novas nascem inertes de propósito, porque a virada precisa do dado revisado antes de existir rota.

### Por que trigger e não tabela de registro

O desenho alternativo era uma tabela `public_slug_registry(destination_id, slug, ...)` com unique, alimentada por trigger nas duas pontas. Ela dá a garantia num constraint só, mas cria uma terceira cópia do dado que pode divergir, e o repo já resolve exatamente este problema com trigger em `prospect_location_guard_slug` (slug único também contra `location.slug`). Duas guardas simétricas seguem a casa e têm menos peça para envelhecer. O que se abre mão é a corrida entre dois inserts simultâneos nas duas tabelas, que aqui é escrita de admin, rara e revisada.

## O que a fase 2 já tem pronto, sem mudar URL nenhuma

`20261103090000` e `20261103091500`. Tudo aditivo: as URLs de hoje continuam iguais.

- **`location_public_path(location)` e `prospect_public_path(prospect_location)`**, campos computados do PostgREST. `select=id,name,location_public_path` funciona em qualquer consulta, e o mesmo corpo serve dentro das RPCs. Existe porque quem monta link para a ficha são doze arquivos do front, cada um com uma fonte diferente (RPC de preço, RPC da vitrine, select direto, Edge de busca): sem isso a gramática da URL passaria a existir em doze lugares, e a primeira divergência só apareceria no Search Console.
- **Segmentos reservados.** `precos` e `mais-barato` são páginas do destino e o roteador resolve estático antes de dinâmico, então um lote com esse slug não daria erro em lugar nenhum: ficaria inalcançável. As duas guardas recusam (`23514`).
- **`url_legacy_map()`**, o mapa de 301 da virada: 139 linhas vistas pelo `anon` (17 URLs de unidade, 26 destinos mais o índice, 43 lotes mapeados, 26 de preços e 26 de mais barato). O worker busca a tabela inteira uma vez por isolate, em vez de consultar por requisição como o `prospect_redirect_target` faz hoje, que não escalaria para a rota principal do site. **Linha onde origem e destino coincidem fica de fora por construção**, e é o caso do `br-parking-viracopos`, que ficou em loop de 301 em produção.
- **`security definer` no mapa, com os gates escritos por extenso.** A primeira versão era invoker, para a RLS decidir o que é público, e morria em `42501`: `prospect_location` teve o `select` revogado de `anon` e concedido por coluna (Q-021, o telefone que a página não mostra), e o mapa lê `converted_at`. Chamado pelo worker com a anon key, o mapa viria vazio e a virada responderia 404 em toda URL antiga.
- **As RPCs de vitrine devolvem o caminho pronto:** `home_featured_offers`, `destination_prospect_cards` (que agora aceita o slug antigo e o novo) e `destination_price_index` ganharam `public_path`, mais `public_slug` no destino.

## A virada, feita em 27/08/2026

Tudo num evento só, porque URL nova sem 301 e link interno velho apontando para ela são o
mesmo problema visto de dois lados.

- **Rotas.** `/estacionamentos` (índice), `/estacionamentos/:destino`,
  `/estacionamentos/:destino/precos`, `/estacionamentos/:destino/mais-barato` e
  `/estacionamentos/:destino/:lote`. O React Router resolve segmento estático antes de
  dinâmico, que é por que `precos` e `mais-barato` são reservados no banco.
- **Uma ficha por estacionamento, nas duas famílias.** O loader resolve unidade parceira ou
  lote mapeado e o componente decide qual página renderizar. O tipo de vaga virou seleção
  dentro da ficha (`?vaga=`, com âncora `#vaga-<code>`), e o canonical ignora a query.
- **301 na borda pelo `url_legacy_map()`**, carregado uma vez por isolate. O
  `prospectRedirect`, que consultava o banco por URL, saiu: depois da virada
  `/estacionamentos/*` é a rota principal do site.
- **O mapa do WordPress encolheu de 18 para 6 entradas de aeroporto.** Doze URLs do
  WordPress (`/estacionamentos/aeroporto-guarulhos`, `/estacionamentos/aeroporto-confins`…)
  passaram a ser o nosso próprio endereço, então não há o que redirecionar. As que sobraram
  são as que mudaram de nome (Afonso Pena, Salgado Filho, Santos Dumont, Galeão, Tietê e o
  caso ambíguo do Rio). **Achado no caminho:** o mapa tinha uma entrada apontando para ela
  mesma (`/estacionamentos/aeroporto-de-viracopos/br-parking-viracopos`), que era o loop de
  301 medido em produção. Ela caiu junto.
- **Conteúdo reescrito no mesmo deploy:** 77 posts, 63 trechos da base de conhecimento e 40
  perguntas de FAQ deixaram de linkar para `/destinos/*`, `/precos/*` e
  `/estacionamento-mais-barato/*`.
- **Sitemap, gêmeo Markdown, `llms.txt` e manifesto de caminhos** seguem a mesma pasta. O
  `.md` responde no mesmo endereço da página (`dist/estacionamentos/<destino>/precos.md`).
- **Título e H1 saem do `public_name`.** "Aeropark - Estacionamento Aeroporto Guarulhos",
  sem o tipo de vaga, que não descreve mais uma página.

Medido no build: **439 páginas, 371 URLs no sitemap** (9 de unidade, contra 17 antes, para os
mesmos 9 estacionamentos), schema sem erro nem aviso, e **zero link para a gramática antiga
em todo o `dist`**.

### O que a virada esqueceu, e o conserto de 29/08/2026

O "zero link para a gramática antiga" media os links do corpo, mas não o `<head>`. Dois dias
depois da virada, medido em produção: a página do destino, o índice `/estacionamentos`, a
página de preços do destino e a ficha de lote mapeado declaravam **canonical, `og:url` e
JSON-LD na forma antiga** (`/destinos/<slug interno>`, `/precos/<slug interno>`), que agora
responde 301 de volta para a própria página. Canonical em loop faz o Google descartar a
declaração e escolher por conta, e foi por isso que `/estacionamentos/aeroporto-fortaleza`
ficou fora do índice enquanto a página de FAQ equivalente ranqueava.

O conserto trocou a montagem dessas URLs pelos helpers de `src/lib/urls.ts` com
`public_slug ?? slug`, incluiu o `public_slug` no select do loader de `/precos` (sem ele o
`AirportMeta` caía no slug interno) e ganhou guarda permanente: o contract test
`src/lib/urls.contract.test.ts` reprova qualquer `${SITE_URL}/destinos`, `${SITE_URL}/precos/`
ou `${SITE_URL}/p/` emitido por código de `src/`. Depois do deploy, pedir reindexação das
páginas de destino no Search Console encurta a recuperação.

### O que ficou de fora

- **A Edge `search` precisava de deploy: feito em 29/08/2026.** O código já devolvia
  `public_path` por resultado, mas a máquina da virada não tinha a CLI linkada. Deployada
  junto com o conserto do canonical; medido em produção, o resultado da busca traz
  `location.public_path` na pasta nova.
- **Prova de titularidade da reivindicação** (HMAC + OTP) segue adiada, como já estava.
- **Copiar o `public_slug` na conversão** de lote mapeado para unidade, que é o que faz a
  ficha reivindicada manter o endereço. Sem conversão nenhuma no acervo hoje, não havia o que
  migrar; a função de conversão ainda não existe.

### Risco

O 301 preserva sinal, e o Google não deprecia mais PageRank em redirect permanente. O que machuca é execução: corrente de saltos, link interno esquecido, sitemap fora de sincronia com o canonical. São 98 URLs num único evento, gerenciável, com oscilação esperada de dias a poucas semanas no recrawl.

O momento é o mais barato que vai existir: as páginas `/p/*` viveram sob `noindex` no `hub.` até a migração de agosto, então quase não têm equity acumulado, e o clique que importa mora nas URLs do WordPress e no mapa de redirect, que são nossos.

## Decisões em aberto

1. **"Estapar Oficial"** (VCP): o nome real é "Estacionamento Oficial de Viracopos (Estapar)". Se o time preferir só "Estapar", é um UPDATE.
2. **"AeroPark"** em Confins colide com a marca do parceiro **Aeropark** em Guarulhos. Destinos diferentes, então não há conflito de URL nem de página, mas numa lista global aparecem dois.
3. **"RL"** (Galeão) e **"JR"** (Cuiabá) ficaram curtos depois de tirar "Estacionamentos". Podem voltar ao nome cheio como exceção.
4. **Cinco parceiros ativos e listados ficam fora do `sitemap-unidades.xml`** (Lisboa Park, Gaita Park, Motion Park, Moveparking, Agência Fera). São empresas com `status` fora de `active`, o mesmo grupo que a `20261029100000` já tratou. Confirmar se é demo antes de dar URL pública a eles.

## O 301 do Worker não salva link interno (30/08/2026)

A lista de distância da página de destino montava o caminho da ficha do lote mapeado com o
slug **legado dos dois lados** em vez de usar o `public_path` que a RPC já devolve. Eram 131
links, um por lote mapeado, em todos os 26 destinos.

**Por que ninguém viu por dois dias.** No `curl` a URL responde 301, porque o Worker tem o
mapa de URL legada (`url_legacy_map()`) e o alvo é 200. Só que clique dentro do app é
navegação do React Router: **não existe requisição HTTP**, o Worker não roda, o roteador casa
`/estacionamentos/:destino/:lote` com os slugs errados, `fichaMapeadaLoader` não acha o lote
pelo `public_slug` e a tela mostra "Vaga não encontrada". Quem só testa com `curl` vê tudo
verde.

**Por que o teste não pegou.** Ele existia e cravava a URL errada: `expect(links[0])
.toHaveAttribute("href", "/estacionamentos/aeroporto-de-guarulhos/talentos-park-aeroporto-recife")`.
A fixture do destino também não tinha `public_slug`, então media um mundo onde a virada de URL
não aconteceu.

### A regra

**Link para a ficha sai de `public_path`.** A RPC monta, o front repassa. Onde houver fallback,
ele usa slug **público** dos dois lados, nunca o legado. Loader que enxuga a linha da RPC
(`prospects.map(...)`) tem que carregar `public_path` junto: foi assim que o caminho se perdeu
em três lugares (a lista de distância, a gaveta da calculadora e o índice de preços).

### O guarda

`scripts/check-internal-links.mjs` roda no `bun run build`, depois do `write-paths-manifest`.
Cruza todo `href="/estacionamentos/..."` do `dist` com o `paths-manifest.json` e **reprova o
build** quando o alvo não existe. Escopo estreito de propósito: só essa família, que é a que
tem slug legado e slug público convivendo. Rota de app sem HTML pré-renderizado (`/search`,
`/checkout/:code`) fica fora e continua sendo assunto do worker.

Na primeira execução ele achou 16 alvos quebrados além dos 131 links. Todos do mesmo formato,
"alguém leu `slug` onde devia ler `public_slug`":

| Onde | O que estava errado |
|---|---|
| `destino.tsx` → lista de distância | não repassava `public_path` ao `proximityRanking` |
| `destino.tsx` → "Ver a tabela completa" | passava `destination.slug` para a tabela de preço |
| `routes.tsx` → loader da FAQ | montava `precos.destino` sem copiar `public_slug` |
| `routes.tsx` → `BLOG_SELECT` | não trazia `public_slug` do destino, e o CTA da sidebar caía no legado |
| `routes.tsx` → loaders de `/precos` e `/calculadora` | descartavam `public_path` do lote |
| `sobre.tsx` | dois ladrilhos fixos apontando para Lisboa e Faro, que não têm página |
| conteúdo (8 posts, 5 trechos, 2 FAQ) | link para `/estacionamentos/aeroporto-lisboa`, que não existe em endereço nenhum |

### Portugal

Lisboa, Porto e Faro têm parceiro no ar e `destination.is_published = false`, então o SSG não
gera página para eles. Enquanto for assim, link de conteúdo aponta para `/search?dest=<código>`
(migration `20261108090000`) e o CTA da sidebar do blog não renderiza (`destination.is_published`).
Publicar as três praças resolve os dois e é decisão de produto, não de código.

## Varredura completa de link e sitemap (31/08/2026)

Depois do conserto dos 131 links, uma varredura de tudo: todo `href` do `dist`, todo link
markdown de `blog_post`, `knowledge_chunk`, `faq` e `destination.intro`, todo `<loc>` dos oito
sitemaps, todo `rel="canonical"` e todos os artefatos GEO. O que apareceu:

| Achado | Tamanho | Por que passou |
|---|---|---|
| Posts canibalizados linkados do corpo de outro post | 14 alvos, 21 fontes | O corpo usa `<Link>`: 301 no `curl`, "página não existe" no clique |
| Gramática antiga sobrevivente (`/destinos/`, `/precos/`, `/estacionamento-mais-barato/` de Viracopos) | 3 alvos, 21 fontes | A migration `20261104090000` varreu o slug PÚBLICO; estes tinham o legado |
| Slug de FAQ errado (`...-aceitos`) | 1 | Nunca existiu; ninguém clicou |
| Sitemap anunciando ficha sem página (Lisboa, Porto, Faro) | 14 URLs | `getProspectRoutes` não filtrava `destination.is_published`, ao contrário do `getStaticPaths` |
| Sitemap anunciando URL que o próprio Worker redireciona | 1 (`bandeira-park`) | Entrada do mapa do WordPress escrita quando o lote não era publicado; ele foi publicado em 29/08 e o 301 passou a roubar a própria página |
| Gêmeo markdown de post morto respondendo 200 | 59 arquivos | `blogRedirect` pulava qualquer segmento com extensão, para não quebrar o `feed.xml` |
| `/search?dest=OPO-alegre` | 2 FAQ | `replace` de substring meu, em 30/08: `aeroporto-porto` casou dentro de `aeroporto-porto-alegre` |

Zero canonical divergente, zero canonical com host errado, zero canonical para página
inexistente. Nenhuma página pública fora do sitemap (as 63 de fora são área logada e
opt-out declarado em `SITEMAP_OPT_OUT`).

### O gêmeo markdown é o caso mais caro em GEO

`/blog/<slug>.md` é o que agente de IA busca. Os 59 arquivos eram de posts que a
consolidação de 15/08 tinha fundido: o HTML do slug ia de 301 para o vencedor e o `.md` do
MESMO slug respondia 200 com o artigo antigo. A consolidação valia para o Google e não valia
para a IA, que é justamente quem lê markdown. Os arquivos foram apagados e o `blogRedirect`
passou a levar o `.md` pelo mesmo mapa do HTML.

### O guarda cresceu

`scripts/check-internal-links.mjs` cobria só `/estacionamentos/**` e por isso não viu nada
disso. Agora cobre `/estacionamentos`, `/blog`, `/faq`, `/destinos`, `/precos`,
`/estacionamento-mais-barato` e `/p`, e reprova o build também quando existe gêmeo markdown
sem post vivo.

### Regra que ficou

**Substituição de URL em conteúdo é do ALVO INTEIRO do link (`](x)` e `](x/)`), nunca de
substring.** O `OPO-alegre` custou duas FAQ e foi achado por acaso; a migration
`20261109090000` já usa a forma correta.

### Continua em aberto

- **32 dos 68 posts publicados não têm gêmeo markdown.** Não é regressão (nunca tiveram: os
  36 que existem vieram do import do WordPress), mas é superfície de GEO que o blog não
  ocupa. Gerá-los cabe no `generate-geo-artifacts.mjs`, que já faz isso para FAQ, preço,
  unidade e lote mapeado.
- **Portugal sem página de destino.** Lisboa, Porto e Faro têm parceiro e
  `is_published = false`. Enquanto for assim, os 14 lotes de lá ficam fora do sitemap e do
  build, por desenho.
- **`/seja-parceiro` sem canonical.** Única página pública indexável nessa situação.
