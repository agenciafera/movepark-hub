---
name: pagina-cinematica
description: >
  Método para criar página ou seção "cinematográfica" no site da Movepark: um conceito em uma
  frase (objeto do mundo do estacionamento + ação presa ao scroll ou ao cursor + desfecho que vira
  conteúdo), um único efeito "uau" por página, especificação com números, dados finais travados,
  checklist observável e prints em pontos do scroll, tudo dentro do DESIGN.md, do SSG e do GSAP do
  projeto. Também cobre componente interativo (carrossel, dock, card 3D, rodapé, bento) descrito
  por metáfora física. Use SEMPRE que o pedido for página de marca ou campanha com animação de
  scroll, hero com efeito, "página no estilo Profitize", "landing com efeito 3D", "deixa a página
  mais viva", "quero um uau na /seja-parceiro", "faz um storytelling no scroll", "seção que anda
  com a rolagem", "componente com mola/arraste", ou quando for escrever o prompt de uma página
  dessas para outra IA. NÃO se aplica a busca, single da unidade, checkout, account, manager nem
  operator (funil e painel não ganham efeito), nem a copy (use copy-lp-queiroz e revisar-texto) e
  nem ao contrato de tipografia e container (use harmonizar-paginas, que esta skill obedece).
user-invocable: true
---

# Página cinematográfica

Origem: análise da biblioteca da ProfitizeBuild em 13/11/2026 (115 itens, um prompt lido por
inteiro). O estudo completo, com a anatomia dos prompts deles, a tabela de conflitos com o
projeto e as ideias de conceito, está em
[`docs/design-system/paginas-cinematicas.md`](../../../docs/design-system/paginas-cinematicas.md).
Leia antes da primeira vez.

O que faz uma página "não parecer feita por IA" não é o efeito, é a **especificidade**: um
conceito só, dados reais, cada movimento com número e um checklist que se confere olhando a tela.
Prompt vago gera página genérica.

## 0. Portão: esta página pode ter efeito?

| Pode | Não pode |
|---|---|
| `/sobre`, `/como-funciona`, `/seja-parceiro`, `/grupo`, campanha, seção de marca da home, página de destino (com moderação, um efeito só) | `/search`, `/p/...`, `/checkout`, `/bookings`, `/account`, `/manager`, `/operator`, `/login` |

Motivo: o consumidor quer reservar em menos de 2 minutos, no celular, no 4G (PRODUCT.md). Efeito
no funil é o "barulho gratuito" das anti-referências. Se o pedido cair na coluna da direita, diga
isso e proponha um ajuste de hierarquia em vez de animação.

## 1. Perguntar antes de desenhar

Uma pergunta por vez, em linguagem simples:

1. **Qual página e qual objetivo?** (vender o modelo, atrair parceiro, campanha de feriado...)
2. **Que material real existe?** Fotos de lotes parceiros, vídeo, números do banco. Foto gerada
   por IA serve para clima (céu, estrada, aeroporto genérico) e **nunca posa como pátio de
   parceiro** (ver `docs/procedencia-imagens.md` e a direção de foto na memória do projeto).
3. **Página inteira ou só uma peça** numa página que já existe?

## 2. O conceito em uma frase

Antes de qualquer pixel, escreva:

> **[página/negócio]**: **[um objeto concreto do mundo do estacionamento]** + **[uma ação presa ao
> scroll ou ao cursor]** + **[um desfecho que vira o conteúdo da página]**

Regras:

- **Um objeto só**, concreto: tíquete, cancela, vaga, pátio visto de cima, chave, voucher, van do
  traslado, cartão de embarque, linha do caminho até o terminal. Nada de blob ou gradiente abstrato.
- **Uma transformação que conta o serviço**: papel para celular, pátio vazio para pátio cheio,
  incerteza para vaga garantida.
- **O fim da animação é útil**: vira o voucher, o painel do parceiro, o preço, a lista de destinos.
  Se o efeito termina e o conteúdo começa do zero, o conceito está errado.
- Não copie conceito do catálogo da Profitize (janelas de avião, drone, carro 3D...). Use como
  régua de qualidade, não como fonte.

Proponha 2 ou 3 frases ao usuário e espere a escolha.

## 3. Especificar com números

Escreva a especificação (para você mesmo ou para outra IA) no esqueleto da seção 9 do estudo.
O que não pode faltar:

- **Faixa da página** pela `harmonizar-paginas` (quase sempre "hero de marketing", com `PageHero`
  ou faixa full-bleed) e o loader SSG.
- **Dados finais em tabela, com fonte.** Preço sai do `simulate_price`, distância do banco
  (ADR-001), contagens de query. Nada de número inventado; o que faltar fica `[preencher]` e entra
  na lista do fim.
- **Seções numeradas, uma ideia de layout por seção.** Se uma seção virou grade de cards igual às
  outras, refaça. Só a seção marcada como "uau" tem o efeito pesado; as demais são calmas e
  tipográficas, com no máximo uma entrada simples (`useGsapReveal`).
- **Cada movimento com número:** quantas alturas de tela o pin dura, `start`/`end`, easing,
  duração, stagger, deslocamento em px, opacidade, escala.
- **Linha do tempo em passos** para a sequência do scroll (1. ... 2. ... 3. ...).
- **Celular (390 px) descrito seção a seção.** Mobile não é versão reduzida, mas pode trocar o
  efeito por um mais leve.
- **Movimento reduzido:** o que desliga e o que continua. A página fica inteira e navegável.

## 4. Regras técnicas do projeto

- **Conteúdo no HTML do build.** Todo texto, preço e FAQ sai do SSG no estado final e visível. A
  animação é camada que monta no cliente, em `useEffect`. Crawler de IA não roda JS.
- **GSAP via `@/lib/gsap`**, sempre dentro de `gsap.context(() => {...}, ref)` com
  `return () => ctx.revert()`. Gabaritos: `src/features/home/Hero.tsx`, `HowItWorks.tsx`,
  `DestinationsGallery.tsx`.
- **Movimento reduzido lido direto do `matchMedia`** no início do efeito e, se reduzido, `return`
  sem montar o GSAP (o hook de estado começa `false` e faria o texto piscar). Ver o comentário em
  `Hero.tsx` e em `src/hooks/useGsapReveal.ts`.
- **Vídeo e mídia pesada condicionados** à rede e ao movimento (`deveCarregarVideo` no `Hero.tsx`:
  `saveData`, `effectiveType`). O LCP é texto e imagem estática; o efeito chega depois.
- **Three.js, Lenis, R3F não estão no projeto.** Prefira GSAP + ScrollTrigger, CSS 3D
  (`perspective`, `transform`), SVG com `stroke-dashoffset`, vídeo preso ao scroll e sequência de
  imagens. Dependência nova só com motivo forte, `bun add` com `package.json` e `bun.lock`
  commitados juntos, import dinâmico e fora do bundle inicial. Se usar canvas/WebGL: render só
  quando algo muda, pixel ratio até 2, sem pós-processamento.
- **Pins:** valores que dependem da tela como função com `invalidateOnRefresh: true`, e
  `ScrollTrigger.refresh()` depois que fontes e imagens do pin carregam.
- **Tokens do `DESIGN.md`, sempre.** Inter, violeta (`mp-primary`) como ação e destaque de número,
  botão de 48 px, `mp-*`. Da Profitize importamos coreografia e conceito, não paleta, fonte nem
  pílula. Gradiente só como fundo.
- **ADR-009:** nenhuma animação promete cancelamento, preço, cupom ou vaga que a unidade não
  entrega. Promessa de transação só com capacidade declarada.
- **Copy** passa por `copy-lp-queiroz` (se for venda) e `revisar-texto`. Sem travessão. Título com
  `text-balance`, corpo com `text-pretty`, sem teto em `ch` no heading.
- **Testes:** lógica do efeito (cálculo de progresso, escolha de clipe, gate de rede) vai para um
  `*.logic.ts` com Vitest. Componente com teste de render que confirma o conteúdo no estado final
  sem JS de animação. Teardown do ScrollTrigger já é tratado em `src/test/gsap-teardown.ts`.

## 5. Componente interativo

Para carrossel, dock, card 3D, rodapé, bento e parentes, descreva assim:

- **Metáfora física** em vez de nome técnico (as vagas de um pátio, os tíquetes num espeto, os
  cartões de embarque em leque).
- **Física declarada:** mola (quanto passa do ponto), inércia do arraste, resposta à velocidade.
- **Os três gestos:** hover, arraste, clique. E teclado: foco visível, setas, Esc.
- **Bordas:** o que acontece além do limite, como fecha, como vira no celular (sem hover).
- Toque: alvo mínimo de 44 px, nada que dependa só de hover.

## 6. Conferir

1. `preview_start` com `vite-dev`, abra a rota.
2. Prints em **pontos do scroll** definidos na especificação (início, meio do pin, fim do efeito,
   cada seção), em **1440 x 840** e **390 x 844**.
3. Ligue movimento reduzido (emulação) e confira que a página está inteira.
4. Passe o **checklist de aceitação observável**: cada item é algo que se vê ("parado no meio do
   pin, o voucher está inteiro na tela e o QR legível"), nunca "a animação está boa".
5. `bun run typecheck`, `bun run lint`, `bun run test`. Passada final por "—" e "–".
6. No fim, liste para o usuário o que ainda é material provisório (foto gerada, `[preencher]`) e
   o que falta ele mandar.
