# Critérios de análise (padrão Yoast, adaptados ao Movepark)

Referência de `scripts/analisar-post.mjs`. Cada critério traz o limite, a origem
no Yoast e o que fazer quando falha. Leia quando um resultado parecer injusto,
antes de torcer o texto para agradar a métrica.

Índice:
1. Front matter esperado
2. SEO
3. Sintaxe e render
4. Preço e ADR-009
5. Legibilidade
6. GEO
7. Onde o analisador difere do Yoast

---

## 1. Front matter esperado

| Campo | Obrigatório | Observação |
|---|---|---|
| `slug` | sim | kebab-case sem acento. Publicado, nunca muda |
| `title` | sim | H1 do post |
| `meta_title` | não | Título da SERP. Sem ele, cai no `title` |
| `meta_description` | sim | 120 a 156 caracteres |
| `keyphrase` | sim | Uma por post |
| `sinonimos` | recomendado | 2 a 4 variações reais |
| `category`, `tags`, `author`, `destination` | recomendado | Slugs dos catálogos |
| `cover_image_url`, `cover_alt` | recomendado | A capa é o nome do link no índice |

## 2. SEO

**Densidade da frase-chave.** Verde entre 0,5% e 3%. Zero é vermelho, acima de 3%
é vermelho (o Google lê como stuffing). O Yoast usa a mesma faixa. A contagem
casa por palavra de conteúdo, ignorando as preposições da própria frase e
tolerando plural, então "estacionamento no aeroporto de Confins" conta também em
"estacionamentos do aeroporto de Confins". Densidade baixa quase nunca se resolve
repetindo a frase: se resolve escrevendo mais sobre o assunto dela.

**Sinônimos.** O Yoast Premium mede "distribuição de frases-chave relacionadas".
Aqui, sinônimo declarado e não usado é laranja. Serve para o texto variar sem
perder o assunto, que é como o Google entende tema, não só string.

**Frase-chave na primeira frase.** Verde na primeira frase, laranja no primeiro
parágrafo, vermelho fora dele. O Yoast checa o primeiro parágrafo; aqui o critério
é mais duro porque a primeira frase é também o trecho que a IA cita.

**Frase-chave no título.** Vermelho se ausente. Laranja se estiver na segunda
metade: quanto mais à esquerda, mais peso, e o título trunca em ~60 caracteres.

**Tamanho do título de SERP.** Verde entre 30 e 60 caracteres. O Yoast mede em
pixel (400 a 580px); caractere é a aproximação prática.

**Meta description.** Verde entre 120 e 156 caracteres, com a frase-chave dentro
(ela fica em negrito na SERP e sobe o CTR). O Yoast mede em pixel, teto ~920px.

**Frase-chave no slug.** Vermelho se ausente. O slug é o único elemento que não
dá para corrigir depois: publicado, ele é contrato.

**Frase-chave nos títulos internos.** Verde entre 30% e 75% dos H2/H3, contando
sinônimos. O Yoast usa a mesma faixa. Acima de 75% soa repetitivo para leitor e
para robô.

**Contagem de palavras.** Mínimo de 3.000, regra do projeto. O default do Yoast é
300, o que serve para post genérico; aqui o alvo é liderar uma busca disputada,
e cobertura de tema é sinal.

**Alt das imagens.** Toda imagem precisa de alt, e pelo menos um alt precisa da
frase-chave. Todos os alts com a mesma frase é laranja: alt descreve a imagem,
não é campo de keyword. Vale para a capa, que no card do índice é o nome do link.
Alt é acessibilidade antes de ser SEO: é o que o leitor de tela anuncia.

**Formato das imagens.** Toda imagem (capa incluída) em `.webp`; qualquer outra
extensão é vermelho. É regra do projeto (Passo 5 da skill): a imagem nasce no
Higgsfield em PNG/JPEG e é convertida antes de subir ao Storage.

**Frase-chave no nome do arquivo.** Todo arquivo de imagem carrega as palavras de
conteúdo da frase-chave em kebab-case (a capa é `<palavra-chave>.webp`, as demais
ganham sufixo do que mostram). Nome genérico (`capa.webp`, `hero.webp`, hash) é
vermelho: o nome do arquivo é sinal de SEO de imagem que o Google Imagens lê.

**Link interno.** Pelo menos um, e pelo menos um para `/estacionamentos/<slug>`. O link
para o destino é vermelho quando falta: sem ele o post preserva ranking e
desperdiça a visita. Link para outros posts é laranja quando falta, e o acervo
tem 93 para escolher. O analisador ainda aceita `/destinos/<slug>`, que hoje
redireciona 301 na borda; post novo usa o caminho novo.

**Link externo.** Pelo menos um, com rótulo que diz o que é. "Clique aqui" é
laranja. Concorrente é vermelho. Ver `links-e-fontes.md`.

**Distribuição da frase-chave.** Janelas de 600 palavras sem a frase nem sinônimo
viram laranja. Equivale ao "keyphrase distribution" do Yoast Premium, e existe
para pegar o post que concentra tudo na abertura e some no meio.

## 3. Sintaxe e render

Todos vermelhos, porque não são estética: são coisas que aparecem cruas na tela.

| Achado | O que acontece na página |
|---|---|
| Tag HTML no corpo | O parser não interpreta HTML, imprime a tag |
| Entidade (`&nbsp;`, `&amp;`) | Sai literal |
| Bloco de código (``` ou ~~~) | Não existe bloco de código no parser |
| `#` de nível 1, ou `#####` em diante | Só `##`, `###` e `####` renderizam |
| Link com destino inválido | Vira link quebrado |
| Travessão `—` ou traço `–` | Proibido no projeto inteiro (`CLAUDE.md`) |

Laranjas: crase inline, `~~riscado~~`, sublista com mais de um nível (achatada),
salto de hierarquia de título, palavra repetida colada, espaço antes de pontuação,
espaço duplo.

O escopo fechado do parser está documentado no topo de
`src/features/blog/markdown.logic.ts`. Bloco novo exige mudar o parser, o render e
o teste, e isso é decisão de código, não de conteúdo.

## 4. Preço e ADR-009

**Tabela.** Post que fala de preço em prosa e não tem tabela é vermelho.
Comparativo em parágrafo não é lido nem por humano nem por modelo. 32 dos 93 posts
herdados já usam tabela, quase sempre para comparar preço, traslado e diferencial.

**Data do preço.** Todo R$ precisa de data de referência no texto ("praticado em
agosto de 2026", "consultado em 08/2026"). Sem data, vermelho: o ADR-009 trata
tarifa fixa no corpo como dívida, porque no dia em que a unidade mudar de
`checkout_mode` o texto vira promessa falsa que o código não consegue retirar.
Com data e link para `/estacionamentos/<slug>`, o número é um retrato datado e o preço
vivo fica a um clique.

**Preço vivo.** R$ no corpo sem link para `/estacionamentos/`, `/precos/` ou
`/destinos/` é vermelho, pelo mesmo motivo.

**Promessa de transação.** "Vaga garantida", "cancelamento grátis", "cancele
quando quiser", "reembolso garantido", "preço fixo" são vermelhos. Post não
declara capacidade; quem declara é a unidade, via `getLocationCapabilities`.
Descrever o lugar (endereço, cobertura, traslado, distância) é sempre permitido,
porque é fato do lugar e não promessa da transação.

## 5. Legibilidade

Mesmos limites do Yoast, adaptados ao português.

| Critério | Limite |
|---|---|
| Frases acima de 20 palavras | no máximo 25% |
| Parágrafo acima de 150 palavras | nenhum |
| Trecho sem subtítulo | no máximo 300 palavras |
| Voz passiva | no máximo 10% das frases |
| Palavras de transição | pelo menos 30% das frases |
| Três frases seguidas com a mesma abertura | nenhuma |
| Flesch pt-BR | 40 ou mais |

O Flesch usa a adaptação para português (`248.835 - 1.015 * palavras/frase - 84.6
* sílabas/palavra`). Em pt-BR a escala é mais baixa que em inglês: 40 a 50 já é
texto acessível, e post técnico raramente passa de 60. A contagem de sílabas é por
grupo de vogais, então subconta ditongo de forma consistente, o que importa é a
comparação entre versões do mesmo texto.

## 6. GEO

**Resposta direta.** Abertura de até 90 palavras. Acima disso, laranja: o bloco
que os motores generativos citam é curto e precisa se sustentar sozinho.

**Títulos em pergunta.** Pelo menos um H2 em forma de pergunta. É por pergunta
que o modelo casa o trecho com o que o usuário digitou.

**Bloco de FAQ.** Seção de perguntas frequentes presente. É o formato com maior
taxa de citação e o que alimenta rich result.

**Dados citáveis.** Pelo menos 5 números com unidade (%, km, min, R$, dias,
vagas). Modelo cita número com contexto, não adjetivo.

**Listas.** Pelo menos 8 itens no post inteiro. Lista e tabela são o que o modelo
consegue extrair inteiro sem reescrever.

**Entidade do destino.** `destination` no front matter. É o que liga o post ao
aeroporto no grafo do site e ao CTA que converte.

## 7. Onde o analisador difere do Yoast

- **Mínimo de 3.000 palavras** em vez de 300. Regra do projeto.
- **Ortografia não é medida.** O script pega palavra duplicada, espaço duplo e
  pontuação torta, e nada além disso. Erro de crase, concordância e acentuação
  continua sendo leitura humana. Ver `revisao-ortografica.md`.
- **Não existe nota de 0 a 100.** O Yoast entrega uma bolinha verde; aqui o
  resultado é a lista, porque bolinha verde esconde qual critério passou raspando.
- **Regras que o Yoast não tem:** HTML cru, travessão, ADR-009, concorrente no
  link, link obrigatório para o destino, taxonomia do projeto.
- **O que nenhum dos dois mede:** se o texto é verdadeiro, se é útil e se é
  melhor que o que já ranqueia. Isso é leitura, pesquisa e julgamento.
