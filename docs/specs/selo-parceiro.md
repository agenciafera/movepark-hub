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

### O destino é a home, com UTM opcional

O link aponta para `/`, e não para uma página interna: é o domínio que precisa da
autoridade, e a home é a única URL que não muda quando o site é reorganizado. O
nome do parceiro, quando preenchido, vira `utm_source` (mais `utm_medium=selo`,
`utm_campaign=parceiros`), que permite medir o tráfego sem prejudicar o link,
porque a URL canônica da home consolida os sinais.

O host nunca é escrito à mão: vem de `siteUrl()` (ver `src/lib/site.ts`).

### Construtor visual não recebe o snippet

No Wix e no Google Sites, o bloco de incorporar HTML renderiza o conteúdo dentro
de um **iframe**. Um link dentro de um iframe pertence ao documento do iframe, não
à página que o hospeda, então ele não transfere autoridade do domínio do parceiro
para o nosso. O selo ficaria visível e não valeria nada.

Por isso a página oferece, para esses casos, os dois valores separados (o texto e
a URL) e manda criar um elemento de texto comum com link aplicado. O Squarespace e
o Webflow inserem o embed no próprio DOM e recebem o snippet normalmente.

## Onde a página vive

Indexável (`SITEMAP_STATIC_ROUTES`), linkada no rodapé e no menu mobile dentro do
grupo "Estacionamentos", ao lado de "Seja parceiro".

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

## Em aberto

- Não há contagem de quantos parceiros instalaram o selo. Hoje isso só aparece
  como tráfego por `utm_source` no analytics, e só para quem preencheu o nome.
- O texto do selo não tem versão em imagem. Se algum parceiro pedir, a decisão
  precisa pesar que âncora de imagem vale menos que âncora de texto.
