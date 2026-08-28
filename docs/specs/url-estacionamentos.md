# URL e nome do estacionamento

**Status:** fase 1 no ar (27/08/2026); fase 2 com a base pronta no banco, sem virada de URL ainda · **Migrations:** `20261102090000`, `20261102091500`, `20261103090000`, `20261103091500` · **Teste:** `supabase/tests/url_publica_estacionamentos.test.sql`
**Relacionado:** [seo-indexacao.md](./seo-indexacao.md) (cutover do domínio), [lote-mapeado-vitrine.md](./lote-mapeado-vitrine.md) (ADR-010, conversão), [borda-cloudflare.md](./borda-cloudflare.md) (worker)

A fase 1 grava nome e slug canônicos no banco, sem tocar em rota. A fase 2 é a virada das URLs, que é um evento único e ainda não aconteceu. Quem for implementar a fase 2 encontra o checklist inteiro no fim deste arquivo.

## Decisão

Uma gramática só para as duas famílias de ficha, uma página por estacionamento:

```
/estacionamentos/aeroporto-guarulhos                  hub do aeroporto (hoje /destinos/<slug>)
/estacionamentos/aeroporto-guarulhos/aeropark         ficha, parceira ou mapeada
/estacionamentos/aeroporto-guarulhos/aeropark#vaga-coberta
/estacionamentos/aeroporto-guarulhos/precos           hoje /precos/<slug>
/estacionamentos/aeroporto-guarulhos/mais-barato      hoje /estacionamento-mais-barato/<slug>
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

| Hoje | Alvo |
|---|---|
| `aeroporto-afonso-pena` | `aeroporto-curitiba` |
| `aeroporto-salgado-filho` | `aeroporto-porto-alegre` |
| `terminal-rodoviario-tiete` | `rodoviaria-tiete` |

Sete destinos estavam sem `seo_label` (Campo Grande, Florianópolis, Fortaleza, Goiânia, Salvador, Teresina, Vitória) e caíam para `short_name`, o que produzia `salvador` e `fortaleza`, sem a palavra "aeroporto". A migration preencheu os sete no formato padrão.

**Ficha.** O último segmento é a marca, único dentro do destino. Para o acervo atual a marca da empresa basta, porque nenhuma tem duas unidades no mesmo destino. Quando tiver, o slug precisa de qualificador (bairro ou via), e o índice único é quem avisa.

| Hoje (17 URLs) | Alvo (9 URLs) |
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

## Fase 2: a virada (ainda não feita)

Nenhum item é opcional; cada um, esquecido, tira página do índice ou quebra link.

- [ ] **Colapsar o tipo de vaga.** Uma rota por lote, âncora por tipo, `?vaga=` preservando o deep link da busca, canonical na URL limpa, `AggregateOffer` no schema. Mexe no funil, não só em redirect: o card da busca precisa cair na âncora certa com o preço do filtro.
- [ ] **Rotas.** `/estacionamentos/:destino/:lote` resolve as duas famílias; `/destinos/:slug` vira `/estacionamentos/:slug`; `precos` e `mais-barato` viram segmento reservado dentro do destino.
- [ ] **76 posts do blog** têm link para `/destinos/` no `body_md` (69 publicados). `UPDATE` no mesmo deploy, senão todo link interno do acervo vira salto de 301.
- [ ] **308 ocorrências de `/destinos` no código** fora de teste: worker, [`sitemapRoutes.ts`](../../src/lib/sitemapRoutes.ts) e o teste que reprova rota fora do sitemap, [`jsonld.ts`](../../src/lib/jsonld.ts) (BreadcrumbList), `ogImage`, topbar e menu mobile, `ProspectCard`, `destinoPrices`, `useSearchResults`.
- [ ] **Worker:** ligar o `url_legacy_map()` (já pronto no banco) como 301 na borda, mais `ROTAS_DE_APP` e `BLOG_CATEGORY_TO_DESTINATION` (14 categorias legadas apontam para `/destinos/<slug>`). O `prospectRedirect` por requisição sai: ele consulta o banco a cada URL nova de isolate, e a partir da virada isso seria a rota principal do site.
- [x] **Banco:** `prospect_redirect_target` já devolve a gramática nova. Com as duas famílias na mesma URL, a conversão deixa de precisar de 301 quando a unidade herda o `public_slug`, e a RPC fica só com o caso de ficha convertida sem oferta publicada (302 para o destino).
- [ ] **Descoberta:** `public/llms.txt` e `.well-known/mcp/server-card.json` citam `/destinos`.
- [ ] **Mapa de 301 do WordPress** reescrito para o alvo final, sem corrente de dois saltos.
- [ ] **`public/Estacionamentos`** (com E maiúsculo, pasta de fotos) colide com a rota no macOS, que é case-insensitive, e não colide no Linux. Já documentado em [`src/worker.ts`](../../src/worker.ts). Renomear ou mover para `public/images/` antes de jogar mais páginas nesse prefixo.
- [ ] **Copiar `public_slug` na conversão** de lote mapeado para unidade, que é o ganho inteiro do namespace compartilhado.

### Risco

O 301 preserva sinal, e o Google não deprecia mais PageRank em redirect permanente. O que machuca é execução: corrente de saltos, link interno esquecido, sitemap fora de sincronia com o canonical. São 98 URLs num único evento, gerenciável, com oscilação esperada de dias a poucas semanas no recrawl.

O momento é o mais barato que vai existir: as páginas `/p/*` viveram sob `noindex` no `hub.` até a migração de agosto, então quase não têm equity acumulado, e o clique que importa mora nas URLs do WordPress e no mapa de redirect, que são nossos.

## Decisões em aberto

1. **"Estapar Oficial"** (VCP): o nome real é "Estacionamento Oficial de Viracopos (Estapar)". Se o time preferir só "Estapar", é um UPDATE.
2. **"AeroPark"** em Confins colide com a marca do parceiro **Aeropark** em Guarulhos. Destinos diferentes, então não há conflito de URL nem de página, mas numa lista global aparecem dois.
3. **"RL"** (Galeão) e **"JR"** (Cuiabá) ficaram curtos depois de tirar "Estacionamentos". Podem voltar ao nome cheio como exceção.
4. **Cinco parceiros ativos e listados ficam fora do `sitemap-unidades.xml`** (Lisboa Park, Gaita Park, Motion Park, Moveparking, Agência Fera). São empresas com `status` fora de `active`, o mesmo grupo que a `20261029100000` já tratou. Confirmar se é demo antes de dar URL pública a eles.
