# Multilíngue: inglês e espanhol

Nasceu da auditoria de 24/09/2026. A Bandeira Park publica 84 páginas em inglês e 84
em espanhol e a Movepark não tinha nenhuma; LLM responde na língua da pergunta, e
consulta em inglês sobre estacionamento em GRU não tinha versão nossa para citar. O
detalhe que abre espaço: eles publicam as duas línguas e **não declaram `hreflang` em
página nenhuma**, então cada versão vive sozinha, sem o buscador saber que são a mesma
página.

## As regras que não se negociam

**1. Português é a fonte, não uma tradução.** O pt-BR mora nas colunas originais e na
URL sem prefixo. `en` e `es` moram nas tabelas `*_i18n` e ganham prefixo. Tratar o
português como mais um idioma abriria o estado de existirem duas versões do texto
canônico.

**2. O segmento do caminho é traduzido, não só prefixado.** `/en/airport-parking/...`,
e não `/en/estacionamentos/...`. A palavra do caminho é a que se busca naquele idioma,
e é onde o concorrente deixa valor na mesa. O mapa é `SEGMENTO` em
[`src/lib/i18n.ts`](../../src/lib/i18n.ts), mantido à mão porque tradução de URL é
decisão editorial.

**3. Toda página se autocanonicaliza.** Num cluster de `hreflang` o Google exige o
ciclo fechado: canônica cruzada diz "não indexe esta, indexe aquela". Em 26/09/2026 as
44 páginas de destino traduzidas subiram com a canônica apontando para a URL
portuguesa, o que apagaria todas elas do índice. A regra mora em `canonicalDoIdioma`.

**4. O cluster é recíproco.** A página portuguesa declara as traduzidas e vice-versa.
Metade do par não é meio caminho: cluster que não fecha o Google descarta inteiro.

**5. Só entra idioma que existe.** O portão é o `is_published` da linha de tradução, na
RLS. Uma entrada de `hreflang` apontando para tradução não publicada é 404 ou, pior,
página portuguesa servida como inglesa.

**6. A barra final NÃO se estende aos idiomas traduzidos.** `/blog/<slug>/` com barra é
contrato herdado do WordPress e só vale em português. `normalizaBarraFinal` no worker só
abre exceção para caminho que **começa** em `/blog/`, então `/en/blog/x/` é 301 para
`/en/blog/x`. URL nova não tem legado para honrar. Quem monta caminho de índice usa
`caminhoDoIndice`, e não `caminhoLocalizado` com slug vazio.

## O que existe em cada idioma

| Superfície | pt-BR | en | es |
|---|---|---|---|
| Home | `/` | `/en` | `/es` |
| Destino | `/estacionamentos/<slug>` | `/en/airport-parking/<slug>` | `/es/estacionamiento-aeropuerto/<slug>` |
| Índice da FAQ | `/faq` | `/en/faq` | `/es/preguntas-frecuentes` |
| Pergunta | `/faq/<slug>` | `/en/faq/<slug>` | `/es/preguntas-frecuentes/<slug>` |
| Índice do blog | `/blog/` | `/en/blog` | `/es/blog` |
| Post | `/blog/<slug>/` | `/en/blog/<slug>` | `/es/blog/<slug>` |

## O que ainda é só português, e por quê

- **Busca (`/search`) e ficha da unidade (`/estacionamentos/<destino>/<lote>`).** São as
  duas rotas do funil de reserva, e nenhuma tem versão localizada. É o que impede
  traduzir a home portuguesa fiel: ela abre com a barra de busca e com cards de unidade,
  então a casca em inglês entregaria uma página cujo primeiro clique cai no português.
- **Os 78 FAQ de escopo `location`.** Dependem da ficha da unidade ter rota localizada:
  traduzir a resposta sem ter onde publicá-la não entrega página nenhuma.
- **Checkout.** Consequência das duas acima.
- **Arquivos de taxonomia do blog** (`/blog/categoria/<slug>`, tag, autor, aeroporto).
  Os eixos não têm tradução e as páginas são `noindex, follow` de qualquer jeito.

### A home traduzida não é a tradução da portuguesa

Por causa do item acima, `/en` e `/es` são **porta de entrada**, não cópia: funilam para
o que existe no idioma (as páginas de aeroporto, as perguntas e os guias) e declaram em
voz alta, no corpo da página, que os passos finais da reserva estão em português. Quando
a unidade e a busca ganharem rota localizada, o funil cresce sem nada para desfazer. Ver
[`src/routes/home-idioma.tsx`](../../src/routes/home-idioma.tsx).

### O índice do blog traduzido lista SÓ o que está traduzido

Completar com os posts em português daria ao leitor de inglês uma lista
majoritariamente portuguesa e ao buscador uma página que se declara inglesa com
conteúdo em outra língua. Índice curto e honesto é melhor que índice cheio e misturado,
e a página diz isso, com link para o arquivo completo em português.

## Onde cada coisa mora

| Assunto | Arquivo |
|---|---|
| Locales, segmentos, caminho, canônica, cluster | [`src/lib/i18n.ts`](../../src/lib/i18n.ts) |
| Dicionário da casca (3 idiomas, paridade obrigada pelo tipo) | [`src/lib/i18nTextos.ts`](../../src/lib/i18nTextos.ts) |
| Leitura das traduções de destino, FAQ e post | `src/features/*/i18nApi.ts` |
| Rotas e loaders localizados | [`src/routes.tsx`](../../src/routes.tsx) |
| Seletor de idioma do rodapé | [`src/components/shared/SeletorDeIdioma.tsx`](../../src/components/shared/SeletorDeIdioma.tsx) |
| Sitemap (seção `idiomas`) | [`vite.config.ts`](../../vite.config.ts) |
| Barra final por idioma no sitemap | [`scripts/canonicalize-sitemap.mjs`](../../scripts/canonicalize-sitemap.mjs) |

## Os guards que reprovam o build

- **`scripts/check-internal-links.mjs`** cruza todo link de conteúdo com o
  `paths-manifest.json`. Foi ele que pegou, em 30/09/2026, as 14 páginas de destino
  traduzidas linkando `/blog/<slug-traduzido>/`: funciona no `curl` (o worker faz 301) e
  quebra no clique, que é navegação do React Router.
- **`scripts/audit-structured-data.mjs`** reprova `ItemList` sem `itemListElement`. Pegou
  a página 2 do índice traduzido saindo vazia, porque o componente fatiava de novo o que
  o loader já tinha fatiado.
- **`scripts/canonicalize-sitemap.mjs`** reprova URL de blog em português sem barra **e**
  URL traduzida com barra.
- **`src/lib/i18nTextos.test.ts`** reprova chave faltando, chave vazia e chave de `en`/`es`
  igual ao português (cópia crua), com allowlist nomeada para o que coincide de propósito.

## Ao adicionar um idioma ou uma família

1. `LOCALES_TRADUZIDOS` e `SEGMENTO` em `i18n.ts`.
2. Dicionário completo em `i18nTextos.ts` (o tipo obriga a paridade).
3. Rota + loader em `routes.tsx`, com `getStaticPaths` filtrando pelo prefixo do idioma.
4. Índice novo entra em `INDICE_TRADUZIDO` no seletor de idioma, senão o rodapé segue
   mostrando só o rótulo na página que já tem as três versões.
5. Seção do sitemap em `vite.config.ts`.
6. Conferir em produção **canônica e `hreflang` juntos**. Um sem o outro não prova nada.
