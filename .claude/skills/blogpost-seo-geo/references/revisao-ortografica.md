# Revisão ortográfica e gramatical (pt-BR)

O analisador pega palavra duplicada, espaço duplo e pontuação torta. O resto é
leitura. Esta lista existe porque erro de português em texto que quer ser
autoridade custa caro duas vezes: o leitor desconfia, e o modelo que citar o
trecho reproduz o erro com o nome da Movepark junto.

Leia o post inteiro **uma vez só procurando erro**, sem editar conteúdo no mesmo
passe. Revisão misturada com reescrita deixa passar as duas coisas.

## Os erros que mais passam batido

**Crase.** Antes de palavra masculina não tem crase ("a partir de", nunca "à
partir de"). Cidade que não pede artigo não leva crase: "vou a Guarulhos", mas
"vou à Guarulhos dos anos 80". Teste prático: troque por uma cidade que pede
artigo ("vou ao Rio" indica crase, "vou a Belo Horizonte" não). "Às 6h" com crase,
"a 30 km" sem.

**"Mas" e "mais".** "Mas" é oposição, "mais" é quantidade. O erro aparece quase
sempre em frase longa, depois de uma vírgula.

**"A" e "há" no tempo.** Tempo decorrido leva "há" ("há dois anos o terminal
mudou"). Tempo futuro ou distância leva "a" ("a dois quilômetros do terminal",
"daqui a duas horas"). Nunca "há dois anos atrás", que é redundante.

**"Onde" e "aonde".** "Onde" é lugar fixo ("o estacionamento onde você deixa o
carro"). "Aonde" pede movimento ("aonde você vai").

**"Por que", "porque", "por quê", "porquê".** Pergunta separado ("por que o preço
sobe?"), resposta junto ("porque a demanda cresce"), fim de frase separado com
acento ("sobe por quê?"), substantivo junto com acento ("o porquê da alta").

**Concordância em frase longa.** O verbo concorda com o sujeito, não com a palavra
mais perto. "A maioria dos estacionamentos oferece" (não "oferecem", embora o
plural seja aceito). Frase com mais de 25 palavras é onde isso quebra: se a
concordância ficou duvidosa, quebre a frase em duas.

**Hífen pós-acordo.** "Micro-ondas", "autoatendimento", "antessala",
"infraestrutura", "semiaberto", "extraoficial". Na dúvida, procure a palavra em
vez de chutar pelo som.

**Números e unidades.** "R$ 89,90" com espaço depois do cifrão e vírgula decimal.
"12 km", "20 min", "3 h" com espaço. Hora sem minuto é "6h", com minuto é "6h30".
Data por extenso em texto ("agosto de 2026"), numérica só em tabela.

**Plural de sigla.** "os CNPJs", "as FAQs", sem apóstrofo.

## Nomes próprios do projeto

Confira um a um. Nome errado é o erro mais visível e o mais fácil de evitar.

| Certo | Errado que aparece |
|---|---|
| Movepark | MovePark, Move Park, MOVEPARK |
| Aeroporto Internacional de São Paulo/Guarulhos | Aeroporto de Cumbica, Guarulhos Airport |
| Aeroporto Internacional de Viracopos | Viracopos Campinas, aeroporto de Campinas (aceitável no corpo, não no título) |
| Aeroporto Internacional Tancredo Neves (Confins) | Aeroporto de BH |
| Aeroporto Internacional Afonso Pena | Aeroporto de Curitiba (aceitável, mas cite o oficial uma vez) |
| Aeroporto Humberto Delgado | Aeroporto de Lisboa (aceitável, mas cite o oficial uma vez) |
| Aeroporto Internacional de Navegantes | Aeroporto de Itajaí |

Código IATA em maiúscula, sem ponto: GRU, VCP, CNF, CWB, LIS, NVT, CGH, REC, GIG,
BSB, POA, SDU. Cite o código pelo menos uma vez junto do nome por extenso, porque
é assim que a entidade fica sem ambiguidade para o Google e para os modelos.

## O que a revisão também confere

- **Coerência de número entre blocos.** Preço na tabela e preço no parágrafo
  precisam bater. Contradição interna é o pior defeito possível: o modelo escolhe
  um dos dois e você não controla qual.
- **Data presente e correta.** Todo valor em R$ e todo dado de movimento ou
  capacidade carrega quando foi apurado.
- **Link abre.** Cada link externo, testado. Cada link interno, conferido contra
  o slug real (consulte `blog_post` no banco, não arquivo do repo).
- **Alt descreve a imagem.** Alt é texto lido por quem não vê a imagem, não campo
  de palavra-chave. Um alt com a frase-chave basta, o resto descreve.
- **Título e meta description sem promessa.** O que está na SERP é a primeira
  oferta que o consumidor lê, e vincula o fornecedor (CDC art. 30).

## Ferramenta opcional

Se a máquina tiver `hunspell` com dicionário pt-BR instalado, uma varredura rápida
pega erro de digitação que o olho pula:

```bash
hunspell -d pt_BR -l < rascunho.md | sort -u | head -40
```

Ela devolve muito falso positivo (nome próprio, sigla, termo do setor), então
serve como lista de suspeitos para conferir, nunca como veredito.
