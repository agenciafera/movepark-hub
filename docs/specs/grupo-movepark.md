# Grupo Movepark: a área que explica os produtos

> Página institucional em `/grupo` que diz quais produtos existem sob a marca Movepark, em que
> estágio cada um está e o que os liga. O leitor é metade do alvo. A outra metade é a **entidade**:
> o que Google e LLM respondem quando alguém pergunta o que é a Go2Park e de quem ela é.
>
> Specs relacionadas: [agent-readiness-seo.md](./agent-readiness-seo.md),
> [seo-indexacao.md](./seo-indexacao.md),
> [go2park-transfer-ao-vivo.md](./go2park-transfer-ao-vivo.md),
> [mensalista-recorrencia.md](./mensalista-recorrencia.md),
> [agente-whatsapp-wl.md](./agente-whatsapp-wl.md), [blog.md](./blog.md).
>
> **Estado em 18/09/2026: a página existe e NÃO é divulgada.** Saiu do rodapé, do menu do
> celular, do `/sobre`, do sitemap e do `llms.txt` por decisão do dono ("não pode ser visível
> ainda ao grande público"). Ela continua acessível pelo endereço e continua emitindo o
> dado estruturado dela. O motivo está escrito em `SITEMAP_OPT_OUT["/grupo"]`, e um teste em
> `grupo.test.tsx` impede o link de voltar por descuido. Para lançar: devolver o link nas
> duas navegações, tirar da lista de opt-out e recolocar a seção no `llms.txt`.
>
> Gestão: **E3.11** (Fase 3), com **Q-025**, **Q-026** e **D-011** abertos. Ver §7.

## 1. Por que existe

O site inteiro fala de um produto só. A Go2Park já está no Hub, mas só como **selo de unidade**:
três locais com contrato mostram a van no mapa, e nada mais no site diz o nome dela. Quem não
abrir a página de um desses três lotes não descobre que ela existe.

Nas superfícies de máquina o silêncio é total. O `organizationSchema()` em
[`src/lib/jsonld.ts`](../../src/lib/jsonld.ts) descreve a Movepark como entidade isolada, com
`legalName`, `taxID` e `sameAs`, e nenhuma propriedade que ligue outra marca a ela. O
[`public/llms.txt`](../../public/llms.txt) não cita a Go2Park uma vez sequer, e a frase de
desambiguação afirma hoje que a Movepark "não tem relação com estacionamentos ou empresas de nome
parecido", o que passa a ser incompleto no dia em que a casa assume quatro marcas.

O efeito prático: um LLM perguntado sobre a Go2Park não tem de onde tirar o vínculo, e responde
pelo que achar solto na web ou inventa. A página resolve isso pelo lado humano e pelo lado do dado
estruturado ao mesmo tempo, que é o único jeito de a resposta ficar estável.

## 2. Os quatro produtos

| Produto | O que é | Estágio | Onde já vive no repo |
|---|---|---|---|
| **Movepark Hub** | Reserva de vaga com pagamento, split e preço fechado na tela | No ar | o site inteiro |
| **Go2Park** | Van do traslado no mapa em tempo real, sem instalar app e sem criar conta | No ar, 3 unidades com contrato | `location.go2park_enabled`, [go2park-transfer-ao-vivo.md](./go2park-transfer-ao-vivo.md) |
| **Go2Med** | O mesmo rastreio de van aplicado a transporte de hospital | Em desenvolvimento | nada |
| **Coopark** | Mensalista casando demanda agregada com vaga ociosa, pelo melhor preço ao motorista | Em desenvolvimento | ver Q-025 |

As três unidades com Go2Park são Nationpark (Afonso Pena), Virapark (Viracopos) e Garageinn
(Viracopos). Nenhum vizinho de aeroporto oferece o mesmo, e é por isso que o selo existe na
vitrine. A área do grupo não substitui esse selo: ela dá endereço ao nome que o selo cita.

**A tese que une os quatro**, e que a página precisa dizer numa frase: transformar vaga e van em
coisa reservável, rastreável e com preço fechado antes de o cliente sair de casa. Sem essa frase a
página vira lista de logos, que é o formato que não sustenta entidade nenhuma.

## 3. A situação societária, e a regra que ela impõe

| Fato | Consequência |
|---|---|
| A Movepark tem CNPJ próprio: **Movepark Tecnologia Ltda, 68.183.164/0001-35**, já publicado no `organizationSchema()` e no `llms.txt` | A identificação legal da página-mãe já existe e não precisa ser inventada |
| A **Go2Park fatura hoje pelo CNPJ da Fera** | Não é subsidiária da Movepark no papel, hoje |
| A intenção é trazer **tudo para o guarda-chuva Movepark** mais adiante | A página precisa envelhecer bem, sem reescrita, quando isso acontecer |
| A **Fera fica de fora**, como casa de desenvolvimento e marketing digital | Ela não aparece na página do grupo |

Daí sai a regra que governa a entrega inteira:

> **A copy fala de ecossistema de produtos. O dado estruturado afirma menos do que a copy sugere,
> de propósito, e só sobe de nível quando a reorganização societária acontecer.**

Chamar de "grupo" na tela é linguagem de marca, e é verdade operacional: é o mesmo time, o mesmo
padrão de produto e a mesma casa. Afirmar `subOrganization` em JSON-LD é outra coisa, porque essa
propriedade descreve estrutura organizacional, e enquanto a nota fiscal da Go2Park sai pela Fera a
afirmação é falsa em dado estruturado. O que temos a ganhar com o vínculo não justifica declarar
societariamente algo que o contrato social não sustenta.

### O que o schema afirma em cada momento

| Momento | Propriedade | Por quê |
|---|---|---|
| **Hoje** | `brand: [Movepark Hub, Go2Park, Go2Med, Coopark]` no `Organization` da Movepark | `brand` é "marcas mantidas por uma organização". Não afirma propriedade societária, e é verdade desde já |
| **Hoje** | Um nó por produto com `name`, `url`, `description`, e `sameAs` para `go2park.com.br` | Dá endereço canônico a cada nome, que é o que faz o LLM parar de adivinhar |
| **Gatilho: Go2Park passar para o CNPJ da Movepark** | Troca para `subOrganization` / `parentOrganization` | Uma linha de código. O gatilho está registrado aqui para ninguém precisar redescobrir a regra |

Nada de `owns` enquanto a titularidade não mudar, pela mesma razão.

## 4. Onde a área mora

**Decisão: `/grupo` dentro do Hub, página única com âncora por produto.** Não é site separado, e
não é reforma do `/sobre`.

- **Site separado foi descartado.** O ativo que se quer construir é concentração de entidade. Abrir
  um terceiro domínio institucional divide o sinal entre `movepark.co`, `go2park.com.br` e o novo,
  que é o oposto do objetivo. O Hub já atende o `movepark.co`, host canônico e único da allowlist
  `INDEXABLE_HOSTS` do worker, então a página nasce indexável, sem esperar migração nenhuma.
- **Reformar o `/sobre` foi descartado.** Quem clica "Sobre nós" no rodapé de um site de reserva
  está decidindo se confia na reserva, não conhecendo a holding. O `/sobre` continua sendo do
  marketplace e ganha um bloco curto no fim apontando para `/grupo`.
- **Página por produto (`/grupo/go2park`) fica para depois.** Só a Go2Park tem operação real, e ela
  já tem site próprio. Quatro páginas magras hoje é thin content, e página fina de marca é
  exatamente o tipo de URL que o buscador ignora e o LLM não cita. Cada produto ganha endereço
  próprio quando tiver o que dizer.

A área **não entra no funil**: sem CTA de reserva no topo, sem bloco na home acima da dobra. O link
vive no rodapé, no grupo "Movepark", e no fim do `/sobre`.

## 5. O que a página tem

A primeira versão foi entregue como página de conteúdo, na casca de leitura de
`/cancelamento` e `/metodologia`, e foi recusada: **vitrine de marca não é documento**. A
página existe para fazer quatro logos conviverem e mostrar a estrutura da casa, e nada
disso sobrevive a uma coluna de 68ch onde imagem é acessório. Ela é **hero de marketing**,
registrado na skill `harmonizar-paginas`.

1. **Hero** com a tese em uma frase e a ilustração do ecossistema recortada, flutuando
   sobre o navy.
2. **Mural das quatro marcas**, cada uma com logo, uma linha do que faz e o estágio.
3. **Organograma**: a marca-casa no topo e os quatro produtos abaixo. Ver §5.2.
4. **Timeline centralizada, um item por produto**: a linha desce pelo meio e os itens
   alternam os lados, com o marcador na cor da marca, o logo como heading, o estágio e a
   data de início. Eram quatro cartões soltos, que empilhavam sem dizer que fazem parte de
   um conjunto; a linha é o que costura os quatro como sequência da casa. Ver §5.4.
5. **Desambiguação**, que continua necessária: existe homônima no mercado, e o CNPJ é o
   que resolve.

### 5.1 Os logos, e os dois que não existiam

Só a Movepark tinha marca no repositório. O **Go2Park** tem logo oficial, baixado do site
do produto e versionado em `public/brand/logo-go2park.png` (azul `#1B5FFF`, verde
`#A4E244`, medidos no arquivo).

**Go2Med e Coopark não têm marca fechada**, e a decisão foi dar a eles um **wordmark
provisório** em vez de deixar dois nomes soltos ao lado de dois logos reais. Eles herdam
um único gesto do GO2PARK, o "O" como anel de miolo cheio com o dígito em cor de acento, e
são SVG **inline** porque dependem da Inter da página: um `.svg` servido por `<img>` cai no
fallback do sistema e perde o parentesco.

Duas tentativas anteriores foram descartadas e estão registradas no componente: reproduzir
o glifo inteiro do "G" virou borrão a 24px, e trocá-lo por um anel com seta saindo ficou
nítido e virou **o símbolo de Marte (♂) num produto de transporte de hospital**. Marca
derivada herda gesto; não inventa símbolo sem quem revise.

### 5.2 O que o organograma pode dizer

A caixa de cima é a **marca** Movepark, não uma holding, e os quatro ramos são **produtos**,
não subsidiárias. Os conectores só existem do tablet para cima: em 375px o desenho vira
grade de dois por dois, porque quatro ramos com linha viram um emaranhado de 2px.

**A faixa que nomeava quem fatura cada produto saiu em 18/09/2026**, a pedido do dono, e
com ela o CNPJ e a menção à Agência Fera. Ela era a peça que explicava a estrutura em
palavras; o que continua impedindo a leitura errada é o resto: o desenho fala em marca e
produtos, o texto não usa "empresa do grupo", "controlada" nem "subsidiária", e o JSON-LD
segue emitindo `brand` com o teste que reprova `subOrganization`. **Essa trava passou a ser
a única**, então ela não pode cair junto numa limpeza futura. Se a estrutura societária
precisar voltar à tela, ela volta como esta seção, e não como adjetivo solto no meio de um
parágrafo.

### 5.4 A timeline, e o que aprendemos alinhando texto

Os itens alternam os lados no desktop, mas **só o cabeçalho encosta na linha**: o logo, o
selo e a data acompanham o lado, e o parágrafo fica sempre alinhado à esquerda. A primeira
versão alinhou o item inteiro à direita, que é o padrão clássico da timeline alternada, e
ficou ruim de ler: a borda irregular cai justamente onde a leitura começa, e cada linha do
parágrafo passa a começar num ponto diferente. Simetria que custa legibilidade não vale.

No celular a linha volta para a esquerda e os itens empilham de um lado só. Meia tela para
cada lado em 375px daria cerca de 160px de texto útil, onde "estacionamento" sozinho já
quebra em duas linhas.

**As datas são só do que já está no ar** (`desde` em `marcas.ts`, opcional). A Movepark
opera desde 2016, e o parágrafo dela diz isso com todas as letras, porque o selo sozinho
("Desde 2016") num item chamado "Movepark Hub" faria parecer que a plataforma de reserva
tem dez anos. O que tem dez anos é a marca; o Hub é a fase atual dela. Produto em
desenvolvimento **não** recebe data nem previsão: prazo de coisa que ainda não existe é o
tipo de promessa que volta como cobrança. Um teste guarda as duas metades da regra.

### 5.5 Por que o organograma é preto e branco

O desenho da estrutura é monocromático, logos incluídos (`grayscale`). Ele mostra como a
casa se organiza, e a cor ali competiria com a timeline, que é onde cada marca aparece na
cor dela. Como os selos também ficam cinza, a diferença entre "No ar" e "Em desenvolvimento"
passa a ser só o texto, que já é explícito: nenhuma informação do desenho depende de
enxergar cor.

### 5.3 A ilustração

Gerada no Higgsfield (`gpt_image_2_5`) e recortada pelo `remove_background` do mesmo
provedor, que entrega **alfa de verdade** (conferido pixel a pixel: `a=0` no canto e no
topo). Isso importa porque o provedor oficial de imagem do projeto, o `gemini-image`, não
entrega transparência: ele devolve o xadrez **pintado**. O arquivo final é
`public/images/grupo-ecossistema.webp`, 918x827, 69KB.

**A arte ultrapassa o hero de propósito.** A van desce para fora da faixa navy e passa por
cima da seção clara de baixo, o que dá profundidade e tira o ar de banner recortado. Só do
desktop para cima: em 375px a arte ocupa a largura inteira, e descer só empurraria o
conteúdo. Medido: a arte passa 128px da borda do hero, e nada estoura a largura da tela.

**Duas classes quebram o efeito, e as duas já quebraram.** `overflow-hidden` no hero corta
a arte na borda. E `isolate` no hero cria um contexto de empilhamento que **prende o
`z-index` da imagem dentro do hero**: a seção seguinte, posterior no DOM, passa a pintar por
cima, e o sintoma é idêntico ao do `overflow-hidden`, uma van cortada na linha exata do
navy. A combinação correta é hero `relative z-10` e seção seguinte `relative z-0`.
Verificação que não depende de olho: `document.elementFromPoint` num ponto abaixo da borda
do hero, dentro da área da imagem, tem que devolver a `IMG`; se devolver a `SECTION`, o
efeito está quebrado. Um teste em `grupo.test.tsx` guarda as classes.

**A sombra é `drop-shadow`, não `box-shadow`.** Como o arquivo tem alfa de verdade, o
`drop-shadow` segue o contorno da van, do celular e da plataforma. `box-shadow` desenharia
a sombra do **retângulo** da imagem, e apareceria um bloco escuro no meio do navy.

**A paleta é a da Movepark, e isso é decisão, não estética.** A primeira arte saiu no azul
e no verde do Go2Park, que são as cores de **um** dos quatro produtos: no hero da página da
casa, isso subordina a marca-mãe a uma das filhas. A arte atual usa navy `#29263F`, violeta
`#5D5FEF` e teal `#A6DBDF`, os três do símbolo da Movepark, com um ponto coral `#DA455E` de
acento. A van também mudou de um furgão comum para um elétrico de linha limpa, porque a
ilustração da casa é a que fixa o tom das outras. Conferir a paleta do arquivo final faz
parte da entrega: as cores dominantes têm que ser as da marca, e não as de um produto.

## 6. Superfície de máquina

A página só cumpre o objetivo se sair inteira no HTML do build e tiver gêmeo em Markdown. Crawler
de IA não executa JS, e o padrão do projeto já é esse em `/precos`, `/faq` e no blog.

| Superfície | O que muda |
|---|---|
| `organizationSchema()` | Ganha `brand` com as quatro marcas, conforme §3 |
| `public/llms.txt` | Seção nova do grupo e reescrita do bloco de desambiguação |
| `llms-full.txt` | Conteúdo da `/grupo` inline |
| Sitemap | `/grupo` entra |
| Markdown negotiation | `public/grupo.md`, escrito à mão: o `generate-geo-artifacts.mjs` só cobre FAQ, preços, destinos, unidades e blog, e nenhuma página institucional tem gêmeo gerado. O que impede a divergência é o teste de sincronia em `grupo.test.tsx`, que compara título, data e cada parágrafo |
| Rodapé | Link "O grupo" no bloco Movepark |

## 7. Gates: o que trava a escrita da copy

Nenhum deles trava a estrutura, o schema ou a rota. Todos travam **texto publicado**.

**Q-025 · O Coopark é o produto de [mensalista-recorrencia.md](./mensalista-recorrencia.md)?**
Aquela spec descreve exatamente a tese anunciada para o Coopark, ou seja, demanda agregada contra
vaga ociosa com preço negociado em bloco, e é fruto da reunião de 07/08/2026. Pior: a tabela de
concorrência da própria spec lista **Coopark** na camada B, ao lado de Estapar Mensal e BrasilPark.
Uma das duas leituras está errada, e as duas dão trabalho diferente:
se for o mesmo produto, a spec passa a chamá-lo pelo nome e a linha da tabela sai;
se for homônimo de mercado, a página precisa de outro nome ou de desambiguação própria, porque
nascer com nome de concorrente é dívida de marca permanente.

**Q-026 · Como sustentar os claims de exclusividade.** *A página foi ao ar sem eles.* A copy
descreve o mecanismo (o parceiro recebe a parte dele direto do meio de pagamento; o assistente
devolve o link de pagamento na própria conversa), que é verificável e não depende desta decisão.
Publicar "único do mercado" continua travado até haver levantamento datado. A área nasce com três claims fortes: único
com split de pagamento, transparência total e venda com pagamento pelo WhatsApp com IA.
Recomendação: manter, ancorados em levantamento **datado e com os players comparados nomeados**, no
mesmo padrão que a [`/metodologia`](../../src/routes/metodologia.tsx) já usa para preço. Claim de
superioridade absoluta sem lastro é o que o CDC (art. 37) e o CONAR tratam como enganoso, e o custo
de defender depois é maior que o de datar agora.

O que o repo já sustenta sobre o WhatsApp, para a copy não exagerar nem se encolher: o agente roda
hoje no Dify com n8n na ponte, e uma das sete tools dele é `gerar_link_pagamento`, que chama
`POST /backend/order/quick-pay` no white-label. Ou seja, **a venda fecha na conversa, por link de
pagamento gerado ali**, e a reserva nasce no white-label, não no Hub. A migração do agente para
dentro do Hub está especificada em [agente-whatsapp-wl.md](./agente-whatsapp-wl.md). A copy
descreve o que o cliente vive, sem afirmar que o processamento acontece dentro do Hub.

**D-011 · Quantos minutos leva a compra, de verdade.** *A `/grupo` não cita tempo*, para não
criar uma terceira verdade enquanto a medição não sai. O material de origem diz menos de um minuto;
o site publica **2 min** em três lugares, contando `/sobre`, o `llms.txt` e o `PRODUCT.md`. O número
é medível no banco, então vira medição, não opinião, e o valor apurado passa a valer nos quatro
lugares de uma vez. Dois números publicados ao mesmo tempo é o pior dos mundos.

## 8. O que a entrega obriga

| Obrigação | Onde está escrita |
|---|---|
| Cenário de navegador para a rota nova, no mesmo commit | `src/routes/routes-coverage.contract.test.ts` |
| Contrato visual do consumer (h1, container, tipografia) | skill `harmonizar-paginas` + `consumer-typography.contract.test.ts` |
| Fragmento de Helmet no padrão do projeto | `helmet-fragment.contract.test.ts` |
| Revisão de copy antes de gravar | skill `revisar-texto` |
| Spec atualizada no mesmo PR | ADR-008, este arquivo |

## 8b. O que ficou no ar (18/09/2026)

| Arquivo | Papel |
|---|---|
| `src/features/grupo/marcas.ts` | As quatro marcas como dado. Fonte única da tela, do `brand` no JSON-LD e do gêmeo Markdown |
| `src/features/grupo/Wordmark.tsx` | Os wordmarks provisórios de Go2Med e Coopark, com as duas tentativas descartadas documentadas |
| `src/features/grupo/MarcaLogo.tsx` | Despacha arquivo oficial ou wordmark, com o `alt` saindo do nome da marca |
| `src/features/grupo/Organograma.tsx` | A estrutura, com conectores só onde eles conectam |
| `src/routes/grupo.tsx` | A página, com `AboutPage` + `BreadcrumbList` e a entidade da casa como `mainEntity` |
| `src/lib/jsonld.ts` (`brandSchema`) | As quatro em `brand`, derivadas de `marcas.ts`: o schema espelha a tela |
| `public/brand/logo-go2park.png` | Logo oficial, servido pelo próprio site |
| `public/images/grupo-ecossistema.webp` | A ilustração recortada |
| `public/grupo.md` | Gêmeo Markdown, preso ao dado pelo teste |
| `public/llms.txt` | Seção "Os produtos da casa" e a desambiguação declarando as irmãs |
| `ConsumerFooter` + `ConsumerMobileMenu` | O link nas duas navegações, que o teste do menu exige no mesmo commit |
| `e2e/windup/grupo.json` + trajetória | O cenário de navegador que o `routes-coverage.contract.test.ts` cobra |

**O bloco `link` das páginas de conteúdo foi revertido.** Ele nasceu na primeira versão,
para o endereço do Go2Park virar link dentro de um parágrafo. Com a página fora da casca
de conteúdo ele ficaria sem nenhum uso, e tipo de bloco sem uso é peso morto no sistema.

**A trajetória do Windup é escrita à mão.** O planner com `google:gemini-3.1-flash-lite`
degenerou três vezes nesta página, estourando o teto de 16k tokens de saída (US$ 0,57
queimados). A saída foi calcular o `scenario_sig` pela fórmula do próprio pacote
(`sha256` de `{task, hints, atomic_steps, depends_on, like}`, 16 primeiros caracteres) e
montar o plano no formato do cenário `ajuda`. A prova é o replay real: `cache=hit`,
`llm_calls=0`, `PASS`. O `start_sig` é opcional na validação do cache, então a ausência
dele não causa miss. O cenário afirma o nome **Go2Park** no corpo da página, e não a
headline: headline de marketing muda, nome de marca não.

## 9. Fora de escopo

- Página própria por produto. Ver §4.
- Qualquer alteração no `/selo`, no white-label ou no fluxo de reserva.
- A Fera, que segue fora do guarda-chuva por decisão.
- Versão em inglês. Entra junto do multi-idioma (Q-024), se entrar.
