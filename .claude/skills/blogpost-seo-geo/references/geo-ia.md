# GEO: ser encontrado e citado pelas IAs

SEO clássico disputa uma posição numa lista de links. GEO (Generative Engine
Optimization) disputa outra coisa: ser o **trecho que o modelo copia** para dentro
da resposta, com o nome da Movepark junto. São mecânicas diferentes e o mesmo post
precisa ganhar as duas.

## Como o post chega até a IA

Três caminhos, e o projeto já tem os três montados. Saber qual é qual evita
otimizar o que não é lido.

**1. O arquivo markdown.** Crawler de IA não executa JavaScript, e o site é SSG
com render no cliente. Se o agente pedir a página e receber a casca, ele não lê
nada. Por isso cada post existe também como `/blog/<slug>.md`, servido pelo
`src/worker.ts` por content negotiation quando o `Accept` é `text/markdown`.
**Esse gêmeo é o post, na prática, para toda IA.** Desde 01/09/2026 ele nasce do
banco: o `scripts/generate-geo-artifacts.mjs` lê `blog_post` no build e escreve
`dist/blog/<slug>.md` para todo post publicado. Ou seja, o que você escreve no
`body_md` é o que a IA lê, e não existe arquivo separado para manter.

**2. A busca em tempo real.** ChatGPT com busca, Perplexity e Gemini consultam o
índice na hora. Aqui o que vale é o SEO clássico: ranquear bem, ter título claro
e trecho que responde. Um post fora do índice não existe para eles.

**3. As tools de MCP.** `search_blog` e `get_blog_post` estão no MCP consumidor,
então um agente conectado lê o acervo direto, sem passar pelo Google. É o caminho
mais confiável e o menos disputado. O post é encontrado por título, resumo,
categoria, aeroporto e tag, o que torna o front matter parte da descoberta.

Nota sobre o presente: o `hub.movepark.co` responde `X-Robots-Tag: noindex,
follow` de propósito, para não canibalizar o `movepark.co` antes da migração. Isso
significa que hoje o caminho 2 está fechado, e os caminhos 1 e 3 funcionam. Post
publicado agora é investimento que ativa no dia do corte de domínio.

## O que faz um trecho ser citado

Modelo não cita página, cita **bloco autossuficiente**. Um parágrafo que começa
com "além disso, ele também" não vira citação, porque perdeu o referente. Escreva
como se cada bloco fosse ser lido fora do texto, que é exatamente o que acontece.

**Abertura que responde em até 90 palavras.** Sem preâmbulo, sem "neste artigo
você vai descobrir". A pergunta é respondida, e o resto do post detalha. Isso
serve ao AI Overview, ao featured snippet e ao leitor apressado ao mesmo tempo.

**H2 em forma de pergunta, com resposta imediatamente abaixo.** O casamento entre
o que o usuário digita e o que está escrito acontece no título da seção. "Quanto
custa estacionar em Confins?" casa; "Sobre valores" não casa.

**Número com unidade e data.** "12 minutos de traslado", "R$ 89,90 a diária em
agosto de 2026", "400 vagas cobertas". Modelo prefere afirmação verificável, e
número datado é o que ele consegue repetir sem inventar. Adjetivo ("rápido",
"barato", "seguro") não sobrevive à extração.

**Tabela.** É a estrutura que o modelo lê inteira e reproduz sem reescrever.
Preço por faixa de diárias, comparativo de opções, distância e tempo. Uma tabela
bem montada vale mais que três parágrafos descrevendo a mesma comparação.

**Lista com item autoexplicativo.** "Cobertura: protege o carro do sol e do
granizo, e costuma custar de 10% a 20% a mais" funciona. "Cobertura" sozinho, não.

**FAQ de 5 a 8 perguntas, respostas de 40 a 60 palavras.** É o formato de maior
taxa de citação, porque já vem no formato pergunta e resposta que o modelo produz.

**Entidades nomeadas por extenso, pelo menos uma vez.** "Aeroporto Internacional
Tancredo Neves, em Confins, na região metropolitana de Belo Horizonte (código
CNF)". O modelo desambigua por entidade, e sigla solta é ambígua.

**Autoria e data visíveis.** Quem escreveu e quando. Sinal de confiança para o
Google (E-E-A-T) e um dos critérios que os motores generativos usam para escolher
entre fontes que dizem a mesma coisa.

## O que atrapalha

- **Prometer o que a página não entrega.** Além de quebrar o ADR-009, gera a pior
  citação possível: a IA repete a promessa, o usuário chega e não encontra.
- **Texto que só faz sentido em sequência.** Cada bloco precisa se sustentar.
- **Enchimento.** Modelo resume, e resumo de texto inflado descarta o miolo junto.
- **Contradição interna.** Preço num lugar, outro preço em outro. O modelo escolhe
  um dos dois, e você não controla qual.
- **Data ausente.** Sem data, o conteúdo é tratado como possivelmente velho, e na
  dúvida entre duas fontes o modelo pega a datada.

## Checagem prática

Depois de escrever, leia o post inteiro fazendo uma pergunta: **se eu tivesse que
responder "qual o melhor estacionamento em X" usando só este texto, qual parágrafo
eu copiaria?** Se a resposta for "nenhum inteiro, eu juntaria pedaços de três",
o post ainda não está citável. Reescreva até existir o bloco que responde sozinho.

Segunda checagem, quando o post já estiver publicado e o `.md` no ar:

```bash
curl -sH "Accept: text/markdown" https://hub.movepark.co/blog/<slug>/ | head -20
```

Se voltar o post, o caminho das IAs está aberto. Se voltar o `llms.txt` genérico,
o build ainda não rodou depois da publicação: o gêmeo só existe a partir do
próximo `bun run build`, e é aí que vale conferir se o deploy do Cloudflare saiu.
