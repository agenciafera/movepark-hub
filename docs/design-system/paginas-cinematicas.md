# Páginas cinematográficas: o que aprendemos com a ProfitizeBuild

Análise feita em 13/11/2026 sobre a biblioteca de prompts da ProfitizeBuild
(`profitize.com.br/build/templates`). Objetivo: entender como eles descrevem
landing pages e componentes que "não parecem feitos por IA" e traduzir o método
para páginas da Movepark, sem copiar conceito nem texto deles.

Fonte: o catálogo inteiro (115 itens, descrição de cada um), as prévias em vídeo
e **um prompt lido por inteiro** (Margem, landing page de estúdio de design,
item grátis, liberado com a cópia grátis da conta). O texto do prompt é
material licenciado; aqui está só a estrutura e os princípios, com palavras
nossas.

## 1. O que é a biblioteca

| Tipo | Quantos | Exemplos |
|---|---|---|
| Landing page | ~65 | pet shop, barbearia, imobiliária, SaaS, fintech, turismo, automotivo, condomínio |
| Componente | ~30 | carrossel, dock, rodapé, card 3D, bento de dashboard, sidebar, login, seletor de preço |
| Shader / ASCII | ~12 | aurora, cromo líquido, mapa topográfico, fumaça em caracteres |
| Motion (vídeo) | 5 | lançamento de feature, demo de IA, sobrevoo de landing page |

Cada item vem como um **bundle**: o prompt (3 a 4 mil tokens), um `CLAUDE.md`
(ou `AGENTS.md`) para a raiz do projeto, um checklist de ajuste e um zip com
fotos, wordmark e dados. As fotos da demo são geradas por IA e vêm com as
receitas para refazer.

## 2. A fórmula do conceito

Toda descrição do catálogo cabe numa frase com a mesma forma:

> **negócio** + **um objeto que é o símbolo dele** + **uma ação presa ao scroll ou ao cursor** + **um desfecho que vira conteúdo**

Exemplos do catálogo, resumidos:

- Pizzaria: a mesma pizza atravessa o site, se parte, gira no cardápio, entra no forno e fecha na caixa.
- Ótica: a página nasce desfocada e só fica nítida através da lente dos óculos.
- Estética automotiva: o carro visto de cima chega sujo, sai limpo e vira desenho técnico com cada serviço aceso.
- Banco para empresas: o cartão inclina com o cursor e, no scroll, vira e encaixa na tela do app.
- SaaS: o painel do produto nasce de trás de uma paisagem e sobe com o scroll.

O que se repete:

- **Um objeto só**, concreto, do mundo do cliente (nunca abstração tipo "blob" ou "gradiente").
- **Uma transformação** que conta o serviço: sujo para limpo, bruto para lapidado, papel para app.
- **O fim da animação é útil**: vira o cardápio, o produto, o app, o case. O "uau" entrega a página.
- **Recursos recorrentes**: voo de drone preso ao scroll, objeto 3D que gira com a rolagem, palavra gigante atrás do objeto, vidro fosco, retícula/halftone, foto que segue o cursor.

## 3. Anatomia do prompt de landing page

Ordem do prompt da Margem, que é o molde de todos:

1. **Perguntar antes de codar**, uma pergunta por vez, em linguagem de leigo: montar a demo, fazer o site da marca com esta estrutura, ou levar só algumas peças. Já avisa o que depende de material (fotos reais).
2. **Montar a demo completa primeiro**, conferir que roda, e só então personalizar. A demo é o caminho testado e vira referência.
3. **Parte A, o site:**
   - **Marca:** nome, cidade, números concretos e poucos, tom em uma linha. Paleta em hex com papel de cada cor (fundo, texto, secundário, fio) e **acento limitado a um detalhe por seção**. Uma família tipográfica, pesos, tracking.
   - **Nav:** medidas em px, comportamento ao rolar (some descendo, volta subindo, com véu atrás).
   - **Seções numeradas**, cada uma com **uma ideia de layout própria** (túnel, página de livro com notas na margem, tira de filme, índice tipográfico, céu de fotos). A seção 1 é marcada como a peça "uau".
   - **Especificação numérica de tudo que move:** quantas alturas de tela o pin dura, tamanho em `clamp()`, entrelinha, easing, duração, stagger, distância em px, opacidade, lerp do cursor. Nada fica "uma animação suave".
   - **Dados em tabela** (cases, projetos, depoimento), com texto final, para a IA não inventar.
   - **Linha do tempo em passos** para a sequência principal do scroll.
   - **Movimento e acessibilidade:** scroll suave, `prefers-reduced-motion` com o que desliga e o que continua, mobile descrito seção a seção.
4. **Parte B, stack e organização:** dependências com versão exata, onde vai cada arquivo, um arquivo por seção, motion em módulos próprios, dados separados, e **as armadilhas conhecidas** (ordem de inicialização do pin vs scroll suave, refresh quando a fonte carrega, valores que dependem da tela como função, limite de pixel ratio).
5. **Fecha mandando conferir** com prints e o checklist do guia.

## 4. Anatomia do CLAUDE.md que acompanha

O prompt descreve a página; o guia guarda o que vale para sempre, inclusive em
pedidos de mudança meses depois:

- **Design system em tokens** (cor sempre por variável, nunca hex solto), escala tipográfica, margem lateral, forma do botão, e as proibições: sem sombra, sem card, sem ícone de banco de imagem, sem gradiente decorativo.
- **Regras de qualidade:** uma ideia de layout por seção ("se virou grade de cards, refaça"), não inventar número além dos dados, peso controlado do 3D (render só quando algo muda), mobile não é versão reduzida, HTML semântico.
- **Como conferir:** viewports fixos (1440 x 840 e 390 x 844), prints em pontos específicos do scroll, build passando.
- **Checklist de aceitação observável:** cada item é algo que se vê na tela ("parada, a foto cobre a tela inteira sem mostrar borda, mesmo mexendo o mouse"). Nada de "a animação está boa".
- **Personalizar:** tabela "o quê / onde no código / precisa de material novo?", a ordem de caminhos para material (manter o da demo, usar o real, gerar com IA só para clima), especificação de cada foto (proporção, resolução, assunto no centro) e a regra de honestidade: **foto gerada nunca posa como trabalho real**, e o que a pessoa não informou fica `[preencher]` e entra na lista do fim.

## 5. Componentes (as "features")

As descrições de componente seguem um padrão próprio:

- **Metáfora física** em vez de nome técnico: fotos num varal que cede no meio, arara de roupas, esteira de sushi, pasta de vidro com arquivos, cartas abertas em leque.
- **Física declarada:** mola que passa do ponto e volta, inércia do arraste, balanço proporcional à velocidade.
- **Os três gestos descritos:** o que acontece no hover, no arraste e no clique.
- **Estado de borda:** o que acontece quando passa do limite (+N no grupo de avatares), como fecha (Esc, clique fora), como vira no celular (dock vira botão que abre em coluna).
- **Dashboard em bento** com dados que se redesenham ao trocar período, contando os números.

## 6. Princípios que valem para a Movepark

1. **Conceito em uma frase antes de qualquer pixel**, na fórmula da seção 2.
2. **Um "uau" por página**, o resto calmo e tipográfico. Repetir efeito em toda seção é barulho.
3. **Especifique com números.** Prompt vago gera página genérica; é isso que faz parecer "feito por IA".
4. **Dados finais no prompt.** A IA não escolhe número, preço nem depoimento.
5. **Checklist de aceitação observável** e prints em pontos do scroll, em desktop e 390 px.
6. **Peso sob controle:** render sob demanda, pixel ratio até 2, lazy no que está fora da dobra, sem pós-processamento.
7. **Movimento reduzido** desliga suavização e entradas, mas a página continua inteira.
8. **Honestidade de material:** imagem gerada serve para clima, nunca para posar como pátio de parceiro.

## 7. Onde o método bate de frente com as regras do projeto

| Profitize | Movepark | Como resolver |
|---|---|---|
| Vite sem framework, HTML/CSS/JS puros | React 18 + `vite-react-ssg` | O conteúdo sai no HTML do build (crawler de IA não roda JS). Animação é camada por cima, montada em `useEffect`, nunca condição para o texto existir. |
| Three.js e Lenis | Só `gsap` + `ScrollTrigger` (`src/lib/gsap.ts`, `useGsapReveal`) | Preferir GSAP, CSS 3D, vídeo preso ao scroll e imagem. Three.js ou Lenis só com motivo forte, `bun add` com `package.json` e `bun.lock` juntos, e carregamento tardio. |
| Fonte e paleta próprias por página | `DESIGN.md` é normativo: Inter, violeta como ação e destaque, botão de 48 px | Importamos **coreografia e conceito**, não paleta nem tipografia. Tokens `mp-*` sempre. |
| Hero 3D pesado de abertura | Mobile-first, 4G no caminho do aeroporto | O LCP é texto e imagem estática; o efeito chega depois. Nada pesado no funil. |
| Efeito em toda página | Anti-referência "barulho gratuito"; reservar em menos de 2 minutos | Efeito só em página de marca (`/sobre`, `/como-funciona`, `/seja-parceiro`, campanha). Busca, single e checkout ficam como estão. |
| Copy livre do prompt | `copy-lp-queiroz` + `revisar-texto`, sem travessão, `text-balance` no título | Toda copy passa pelas skills. Teto em `ch` proibido em heading. |
| Promessa em qualquer bloco | ADR-009: promessa de transação só com capacidade | Animação não pode prometer cancelamento, preço ou vaga que a unidade não entrega. |
| Pílulas, proibição de card | `harmonizar-paginas`: faixas de página, `PageHero`, container | A página nova escolhe a faixa (hero de marketing) e segue o contrato visual. |

## 8. Ideias de conceito para a Movepark

Rascunhos na fórmula da seção 2, para avaliar. Nenhum copia item do catálogo.

- **Como funciona:** o tíquete de papel do estacionamento comum se dobra com o scroll e vira o voucher com QR no celular. O desfecho é o próprio voucher, com os três passos ao lado.
- **Seja parceiro:** vista aérea de um pátio vazio; rolando, as vagas acendem uma a uma em violeta (reservas chegando) e o pátio encolhe até virar o card do painel do operador com o número do mês.
- **Destino (aeroporto):** a linha do traslado se desenha do lote até o terminal, presa ao scroll, com o tempo e a distância calculados no banco (ADR-001) aparecendo quando a linha chega.
- **Campanha de feriado:** a cancela sobe com o scroll e revela o preço fechado, que fica fixo enquanto o resto da página passa.
- **Sobre:** mapa do Brasil em retícula com os destinos acendendo, e cada ponto abre a foto real do lote parceiro.

## 9. Esqueleto de prompt para página da Movepark

```md
# <Nome da página>: <conceito em uma frase>

## Antes de começar
- Leia CLAUDE.md, DESIGN.md, PRODUCT.md e a skill harmonizar-paginas.
- Faixa da página: hero de marketing | conteúdo. Rota e loader SSG: <...>.

## Conceito
<negócio + objeto + ação no scroll/cursor + desfecho útil>

## Dados finais (não inventar)
| campo | valor | fonte (banco, spec, simulate_price) |

## Seções
### 1. <nome> (a peça "uau")
- Layout: <...>
- Movimento: pin por N telas, clamp(...), easing, duração, stagger.
- Linha do tempo: 1. ... 2. ... 3. ...
- Celular (390 px): <...>
- Movimento reduzido: <o que desliga, o que fica>
### 2. <nome> (layout próprio, sem grade de cards)
...

## Técnico
- GSAP via @/lib/gsap; cleanup no unmount (ver src/test/gsap-teardown.ts).
- Conteúdo no HTML do build; animação montada no cliente.
- Imagens: webp, lazy fora da dobra, proporção e resolução de cada vaga.

## Checklist de aceitação (observável)
- [ ] Em 390 px, <...> está legível sem nada por cima.
- [ ] Parado no meio do pin, <...>.
- [ ] Com movimento reduzido, <...>.
- [ ] Copy revisada, sem travessão, títulos com text-balance.
- [ ] typecheck, lint e test verdes; prints em <pontos do scroll>.
```
