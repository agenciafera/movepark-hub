# Selo de parceiro (backlink do rodapé do parceiro)

**Rota:** `/selo` · **Código:** `src/routes/selo.tsx`, `src/features/selo/`
**Status:** implementado em 11/09/2026

## O problema

A autoridade de domínio de `movepark.co` não tem de onde crescer sozinha. Os
estacionamentos parceiros têm site próprio, com domínio antigo e tráfego local, e
nenhum deles aponta para a Movepark. Cada parceiro que põe um link no rodapé é um
domínio de terceiro referenciando o nosso, que é o sinal que o Google usa para
decidir quanto confia num site.

O obstáculo não é convencer o parceiro. É que os sites deles estão em plataformas
diferentes (HTML na mão, WordPress, Wix, Shopify) e ninguém quer abrir um chamado
para instalar um link. A página `/selo` existe para transformar isso em copiar e
colar.

## O que a página entrega

Um gerador que monta o HTML do selo a partir de quatro escolhas: a frase, o
formato (com moldura, sem moldura, só texto), a cor do rodapé do parceiro e,
opcionalmente, o nome do estacionamento. A prévia e o código saem da **mesma
função** (`gerarSnippet`), então a prévia não tem como divergir do que é copiado.

Abaixo do gerador, as instruções por plataforma e quatro regras de uso.

## Decisões

### O link nunca é `nofollow`

É a decisão que justifica a página inteira. Um selo com `rel="nofollow"` não
transfere autoridade nenhuma, e a regressão seria invisível: o selo continuaria
bonito no rodapé do parceiro e não faria nada. O guard está em
`selo.logic.test.ts`, varrendo `nofollow`, `sponsored` e `ugc` em todas as
combinações.

O `rel="noopener"` fica, porque é segurança de `target="_blank"` e não afeta o
tratamento do link.

### A âncora é sempre a marca, nunca palavra-chave

Toda frase do catálogo termina em "Movepark", e é essa palavra que vai dentro do
`<strong>` do link. Nenhuma variação oferece âncora de palavra-chave do tipo
"estacionamento barato em Confins".

O motivo é risco, não gosto: rodapé repetido em dezenas de sites com a mesma
âncora otimizada é exatamente o padrão que a documentação do Google descreve como
esquema de links, e a penalidade cairia sobre o nosso domínio, não sobre o do
parceiro. Âncora de marca em rodapé de parceiro comercial é o uso legítimo do
mesmo mecanismo. O guard de escrita da marca (`MovePark`, `MOVEPARK`, `Move
Park`) também roda no teste.

### "Desenvolvido por" só existe se for verdade

O catálogo traz `desenvolvido` e `feito` porque a Movepark faz o site de alguns
parceiros, mas as duas frases vêm rotuladas com a condição na própria interface, e
a regra está escrita na página. Selo que afirma autoria falsa é afirmação sobre
fato verificável, e ela vale para o visitante do parceiro tanto quanto para o
buscador.

### Estilo inline, não classe

O selo cai dentro do CSS de outra pessoa. Classe herda o que o tema do parceiro
tiver definido para `a`, `strong` e `span`; `style` inline não. Por isso o
snippet carrega a tipografia, a cor e o espaçamento inteiros, e por isso ele não
tem `:hover` (não há onde declarar sem exigir uma tag `<style>` a mais, que é
justamente a parte que quebra em construtor visual).

### O símbolo troca de cor pelo rodapé, e a moldura escura é transparente

O símbolo da marca tem dois triângulos em `#29263F`. Em rodapé escuro eles somem,
então o gerador troca esse navy por branco. A moldura da versão escura é
transparente, e não navy: o rodapé do parceiro pode ser preto, grafite ou uma
foto, e um retângulo navy chapado apareceria como remendo. Na versão clara o
fundo branco fica, porque ali ele é o que separa o selo do cinza do rodapé.

### O destino é a ficha do parceiro, e a home só no gerador público

**Mudou em 27/10/2026 (Conteúdo 70).** Até então o link apontava sempre para `/`,
com o argumento de que é o domínio que precisa da autoridade e de que a home é a
única URL que não muda. O plano de autoridade mostrou o contrário: a home já tem
171 domínios de referência, e a página de Guarulhos, o maior mercado, tem 17
([plano-autoridade-backlinks.md](./plano-autoridade-backlinks.md) §2.2). O Google
ranqueia página, não domínio.

Agora `gerarSnippet` e `montarUrl` aceitam `pagina`: a ficha do parceiro
(`/estacionamentos/<aeroporto>/<unidade>`) ou a página do aeroporto. A ficha é a
escolha padrão para parceiro, por dois motivos. Ela chega à página do aeroporto
pela trilha, e quem clica no selo cai na unidade que já estava olhando, e não numa
lista com os concorrentes do parceiro. Caminho fora desses dois formatos volta
para a home, para não virar link quebrado no rodapé alheio.

O gerador público de `/selo` continua gerando para a home, porque não sabe quem é o
parceiro. Quem monta o selo de um parceiro conhecido passa a ficha.

O nome do parceiro, quando preenchido, vira `utm_source` (mais `utm_medium=selo`,
`utm_campaign=parceiros`), que permite medir o tráfego sem prejudicar o link,
porque a URL canônica da página consolida os sinais.

O host nunca é escrito à mão: vem de `siteUrl()` (ver `src/lib/site.ts`).

### Construtor visual não recebe o snippet

No Wix e no Google Sites, o bloco de incorporar HTML renderiza o conteúdo dentro
de um **iframe**. Um link dentro de um iframe pertence ao documento do iframe, não
à página que o hospeda, então ele não transfere autoridade do domínio do parceiro
para o nosso. O selo ficaria visível e não valeria nada. O Squarespace e o Webflow
inserem o embed no próprio DOM e recebem o snippet normalmente.

Para o Wix, a página tem seção própria (`PassoAPassoWix`) com dois caminhos, os
dois com link de verdade:

1. **Caixa e texto do editor** (recomendado). O parceiro reproduz o desenho com os
   elementos nativos, e o link é aplicado no texto. A âncora continua sendo texto,
   que é o que mais conta.
2. **O selo como imagem**, com o link aplicado nela. O desenho sai idêntico, mas
   quem faz o papel da âncora passa a ser o `alt`, que vale menos.

A ficha com os valores do desenho (cor, borda, raio, respiro, corpo, peso) é
publicada na página a partir de `ESPECIFICACAO`, `RAIO`, `CORPO` e `RESPIRO`, as
mesmas constantes que montam o CSS do snippet. Com duas listas, a do código e a da
instrução, a segunda envelheceria calada.

### Os PNGs são gerados, nunca desenhados

`scripts/gerar-selo-png.ts` (`bun run gen:selo`) renderiza o HTML de
`gerarSnippet` num Chromium do Playwright e fotografa o elemento, em 3x e com fundo
transparente fora da moldura. São 10 arquivos em `public/selo/` (5 frases x 2
fundos).

O motivo de não abrir o Figma: uma imagem desenhada à mão seria a segunda verdade
do selo, livre para divergir do código na primeira vez que alguém mudasse uma cor,
e ninguém notaria. `PassoAPassoWix.test.tsx` reprova se uma frase nova entrar no
catálogo sem o PNG correspondente.

Nada de README ou nota dentro de `public/selo/`: a pasta é servida, e a nota
interna viraria uma URL pública.

O símbolo solto, para quem monta a caixa à mão, reusa os PNGs que já existiam para
os e-mails (`/brand/simbolo-movepark-email.png` e `-white-email.png`).

## Onde a página vive

Indexável (`SITEMAP_STATIC_ROUTES`), mas fora da navegação do site: saiu do
rodapé e do menu mobile em 28/09/2026, onde ficava sob "Para donos de
estacionamento". Os dois saíram juntos porque o menu espelha o rodapé item por
item, e o `ConsumerMobileMenu.test.tsx` reprova quando as listas divergem.
Nenhuma página do site aponta para `/selo`: ela abre pelo endereço direto.

Ela é a única página de conteúdo do consumer que **não** fecha com o `CtaBanner`.
O banner chama o viajante para buscar vaga, e quem abre `/selo` é o parceiro
mexendo no rodapé do próprio site. O fechamento aqui é o canal de suporte. É
exceção consciente ao padrão da skill `harmonizar-paginas`.

## Testes

| Arquivo                                  | Cobre                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/features/selo/selo.logic.test.ts`   | ausência de `nofollow`, âncora de marca, grafia da marca, estilo inline, troca de cor do símbolo, slug do UTM |
| `src/features/selo/SeloGerador.test.tsx` | prévia e código com o mesmo link, troca de frase, UTM ao nomear o parceiro, formato sem símbolo               |
| `e2e/windup/selo.json`                   | cenário de leitura da página no navegador                                                                     |

## Adoção (Conteúdo 70)

O levantamento de 27/10/2026, parceiro a parceiro, com o endereço novo de cada link
e as mensagens de pedido, está em
[dados/selo-parceiros-2026-10-27.md](./dados/selo-parceiros-2026-10-27.md). O
resumo: os 8 parceiros com unidade listada têm site, e 6 já linkam o `movepark.co`
sem `nofollow`, todos para a home. Dois com o selo (BePark, desde 18/09, e
Aeropark) e quatro com o crédito "Desenvolvido por" ou "Feito por Movepark" (Abbapark,
Aerovalet, Nationpark e Virapark, sites que a Movepark fez no Wix). Garageinn e
Plenty Park não linkam. No mesmo dia, os cinco que a Movepark mantém passaram para
a ficha: a BePark no repo `agenciafera/bepark-website` (`src/config/selo.ts`,
travado com a constante `FICHA_NA_MOVEPARK` do `llms.txt` dela) e os quatro do Wix
no editor, na conta Wix Studio da Agência Fera.

**Armadilha do editor do Wix Studio:** ao abrir o painel de link de um texto que
já tem link, o editor às vezes seleciona a frase inteira, e confirmar transforma o
crédito todo em link. Selecione só a palavra "Movepark" e confira a seleção antes
de clicar em OK.

Os links instalados entram na planilha de controle
([dados/backlinks-controle.csv](./dados/backlinks-controle.csv)) com o projeto
"Parceiro", para a revisão de 30 dias conferir se seguem no ar.

## Em aberto

- Não há contagem automática de quantos parceiros instalaram o selo. A conta é a
  da planilha de controle, conferida à mão; no analytics só aparece como tráfego
  por `utm_source`. O selo do bepark.com.br usava UTMs próprias
  (`utm_campaign=selo-parceiro-rodape`) até 21/10/2026. Ver
  [ataque-cnf-bepark.md](./ataque-cnf-bepark.md) §2.3.5.
- O passo a passo do Wix foi escrito a partir da interface do editor, e não
  verificado numa conta real. Se o Wix renomear um menu, o texto envelhece sem
  quebrar teste nenhum.
