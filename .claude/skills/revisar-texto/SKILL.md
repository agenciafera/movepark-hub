---
name: revisar-texto
description: >-
  Portão de revisão obrigatório para TODO texto voltado ao usuário antes de ser
  gravado no projeto Movepark — headlines, CTAs, hero, cards, textos de página,
  FAQ, e-mails, mensagens de estado/erro, meta description, og:title, seed de
  conteúdo, microcopy de UI, notificações. Use SEMPRE que for escrever, editar,
  traduzir ou colar qualquer string que um humano vai LER na interface, no site
  ou numa mensagem — mesmo que o pedido não diga "revisar" e mesmo que o texto
  pareça pequeno (um botão, um placeholder, um título). A skill faz duas coisas
  antes de o texto entrar no código: (1) se for texto publicitário/marketeiro
  (venda, oferta, landing page, hero de conversão), chama a skill
  copy-lp-queiroz para elevar a copy; (2) varre o texto atrás de vícios de
  escrita de IA (travessão em excesso, prolixidade, palavras fora do comum,
  construção "não é X, é Y", regra de três, eyebrows em CAIXA ALTA, superlativo
  vazio) e reescreve para soar humano e na voz da Movepark. Só depois de passar
  nessa revisão o texto final é gravado. NÃO se aplica a identificadores de
  código, nomes de variável, chaves de i18n, mensagens de commit ou comentários
  técnicos internos.
---

# Revisar texto antes de gravar (portão anti-IA + copy)

Neste projeto, **nenhum texto que um humano vai ler entra no código cru**. Todo
texto voltado ao usuário — da headline do hero ao placeholder de um input —
passa por este portão de revisão **antes** de ser escrito no arquivo. O objetivo
é duplo: garantir que copy de venda seja de fato persuasiva (via
`copy-lp-queiroz`) e garantir que **nada** soe como texto gerado por IA. A voz
da Movepark é a do navegador confiante — direto, humano, sem superlativo vazio
(ver `PRODUCT.md` e `DESIGN.md`). Um texto com cara de IA quebra essa voz na
hora.

## Quando este portão dispara

Dispara para **qualquer string que um humano lê** e que você está prestes a
gravar/editar num arquivo do projeto:

- Copy de marketing: hero, headline, subheadline, proposta de valor, CTA,
  benefícios, prova social, oferta, FAQ de venda.
- Conteúdo de página: textos de destino (`/destinos/...`), descrições de lote,
  blocos institucionais, texto de checkout.
- Microcopy de UI: labels, placeholders, tooltips, botões, títulos de seção,
  estados vazios, mensagens de sucesso/erro, toasts, notificações.
- Comunicação: e-mails, WhatsApp/OTP templates, PDFs de voucher.
- SEO/meta: `title`, `meta description`, `og:title`, `og:description`, JSON-LD
  com texto legível, alt de imagem.
- Seeds/fixtures de conteúdo que viram texto visível (FAQ, destinos, etc.).

**Não dispara** para: nomes de variável/função, chaves de i18n (`checkout.cta`),
mensagens de commit, comentários de código internos, logs de debug, nomes de
tabela/coluna. Esses são identificadores técnicos, não prosa para humano.

## O fluxo (siga nesta ordem)

```
texto rascunho
   │
   ▼
1. CLASSIFICAR  →  publicitário/marketeiro?  ──sim──►  2. copy-lp-queiroz
   │                        │
   │                        └──não──►  segue direto
   ▼
3. VARRER vícios de IA  (checklist abaixo)
   │
   ▼
4. REESCREVER até passar  (voz Movepark, sem tics)
   │
   ▼
5. GRAVAR o texto final no arquivo   ◄── só aqui o texto entra no código
```

Nunca grave o rascunho e "arrume depois". A revisão acontece **antes** da
escrita — é isso que torna isto um portão, não uma sugestão.

### 1. Classificar: é copy de venda ou texto funcional?

Pergunte-se: **este texto existe para persuadir/converter, ou para orientar?**

- **Publicitário/marketeiro** → hero, landing page de venda, proposta de valor,
  oferta, CTA de conversão, headline que vende um benefício, bloco de prova
  social, seção "por que reservar com a Movepark". Vai para o passo 2.
- **Funcional/informativo** → label de campo, mensagem de erro, confirmação de
  reserva, instrução de check-in, FAQ operacional, texto de status. **Pula** o
  passo 2 e vai direto para o passo 3 (a copy-lp-queiroz é para venda, não para
  microcopy funcional — não force um briefing de landing page num placeholder).

Na dúvida entre os dois, trate hero e seções de conversão da home/destino como
publicitário; trate qualquer coisa dentro de um fluxo (checkout, conta,
operator) como funcional.

### 2. Elevar a copy de venda com `copy-lp-queiroz`

Quando o texto for publicitário, **invoque a skill `copy-lp-queiroz`** (via a
ferramenta Skill: `anthropic-skills:copy-lp-queiroz`) para elevar a persuasão —
ela aplica frameworks de Cialdini, Hormozi, Schwartz e cia.

- Para uma **página de venda / landing inteira** (vários blocos): rode a
  copy-lp-queiroz no fluxo dela (briefing → copy nos 15 blocos). Passe o
  contexto do Movepark no briefing (registro da marca, público, oferta) para ela
  não pedir tudo do zero.
- Para um **fragmento** de marketing (uma headline, um CTA, um único bloco de
  benefício): você não precisa do briefing completo de 15 blocos. Aplique os
  **princípios** da copy-lp-queiroz ao fragmento (clareza do benefício, prova,
  quebra de objeção, especificidade sobre superlativo) e siga. Se o fragmento
  crescer para uma seção inteira, aí sim rode a skill completa.

O resultado da copy-lp-queiroz **ainda passa pelo passo 3** — copy persuasiva
também pode vir com tics de IA.

### 3. Varrer vícios de escrita de IA (o coração da skill)

Leia o texto procurando os padrões abaixo. Cada ocorrência é um alerta; um texto
com vários é reprovado e volta para reescrita. Não é sobre banir toda vírgula —
é sobre remover a **gramática de IA** que denuncia a máquina.

**A. Travessão (—) em excesso.** O tique número um. IA usa travessão para
emendar orações em quase toda frase. Regra prática: **no máximo um travessão por
parágrafo**, e só quando um ponto, dois-pontos, vírgula ou parênteses não
servirem melhor. Se o texto tem travessão em três frases seguidas, reescreva.

**B. Construção antitética "não é X, é Y".** Fortíssimo marcador de IA em
pt-BR: *"Não é só um estacionamento — é tranquilidade."* / *"Não se trata de
preço, e sim de confiança."* / *"Mais do que uma vaga, é uma promessa."* Corte.
Diga a coisa diretamente: *"Sua vaga fica garantida."*

**C. Regra de três decorativa.** Trios rítmicos vazios: *"rápido, simples e
seguro"*, *"reserve, chegue e viaje"*, *"sem filas, sem estresse, sem
surpresas"*. Um trio pontual pode ter força; trio em toda seção é fôrma. Quebre o
ritmo, corte um dos três, ou troque por uma frase concreta.

**D. Prolixidade e enchimento.** Frases que rodeiam antes de dizer. Expressões
de enchimento para caçar e cortar: *"vale ressaltar que"*, *"é importante
notar"*, *"por meio de"*, *"no que diz respeito a"*, *"a fim de"*, *"de modo a"*,
*"em um mundo onde"*, *"imagine poder"*, *"seja você..."*. Prefira a frase curta
que já entrega a informação. Se dá para cortar metade das palavras sem perder
sentido, corte.

**E. Palavras fora do comum / rebuscadas.** IA alcança sinônimos pomposos onde a
palavra simples serve. Suspeitos: *"outrossim"*, *"ademais"*, *"destarte"*,
*"proporcionar"* (→ dar/oferecer), *"realizar uma reserva"* (→ reservar),
*"efetuar o pagamento"* (→ pagar), *"utilizar"* (→ usar), *"possibilitar"*,
*"otimizar sua experiência"*, *"elevar a outro patamar"*, *"jornada"* como
metáfora. Use a palavra que a pessoa usaria no aeroporto.

**F. Superlativo vazio e hype.** `PRODUCT.md` proíbe superlativo vazio.
Bandeiras: *"revolucionário"*, *"incrível"*, *"a melhor experiência"*,
*"simplesmente perfeito"*, *"o futuro do estacionamento"*, *"nunca foi tão
fácil"*. Troque por fato específico: *"reserve em menos de 2 minutos"*,
*"pague exatamente o que está escrito"*.

**G. Eyebrows em CAIXA ALTA e Title Case.** `DESIGN.md` rejeita eyebrow em
uppercase com tracking largo acima de cada seção (*"COMO FUNCIONA"*, *"SOBRE
NÓS"*). Uma vez, deliberada, é voz; em toda seção é gramática de IA de 2023.
Também evite Title Case em português (*"Reserve Sua Vaga Agora"* → *"Reserve sua
vaga agora"*). Português capitaliza só a primeira letra e nomes próprios.

**H. Conectores de redação escolar em sequência.** *"Além disso... Ademais...
Por fim... Em suma... Vale destacar..."* empilhados abrem cada parágrafo. Corte
os conectores; deixe as frases se sustentarem.

**I. Fecho motivacional genérico.** *"No fim das contas, o que importa é..."*,
*"Afinal, sua tranquilidade não tem preço"*, *"Porque você merece..."*. Fecho de
IA. Termine no fato ou no CTA concreto.

**J. Emoji como bullet e pontuação decorativa.** ✨🚀✅ pontuando frases, ou
reticências dramáticas para criar suspense. Fora, salvo se o design pedir
explicitamente um ícone (aí é ícone de UI, não emoji no meio da prosa).

### 4. Reescrever até passar

Reescreva na **voz da Movepark**: direto, humano, confiante, sem gritar. Modelos
de referência do próprio projeto: *"Vaga garantida. Boa viagem."* / *"Sua
reserva está segura."* / *"Pague exatamente o que está escrito."* Frase curta,
verbo concreto, benefício específico. Marca **Movepark** sempre grafada assim
(uma palavra, `M` maiúsculo). Português brasileiro.

Faça uma segunda leitura com olhos frescos: se ainda "soa a IA", provavelmente
sobrou um travessão, um trio ou um superlativo. Ajuste antes de gravar.

### 5. Gravar o texto final

Só agora escreva o texto no arquivo (componente, seed, migration de conteúdo,
Edge, meta tag). O que entra no código é a **versão revisada** — nunca o
rascunho. Se você reescreveu bastante, vale mostrar ao usuário o "de → para"
para ele referendar antes/depois de gravar, especialmente em copy de venda.

## Autoavaliação rápida (checklist antes de gravar)

Antes de gravar qualquer texto, confirme:

1. **Travessões:** no máximo um por parágrafo, e cada um é a melhor escolha ali?
2. **"não é X, é Y":** zero ocorrências?
3. **Regra de três:** nenhum trio decorativo/vazio?
4. **Enchimento:** cortei "vale ressaltar", "por meio de", "a fim de" e cia.?
5. **Palavra simples:** troquei "realizar/efetuar/utilizar/proporcionar" pelo
   verbo do dia a dia?
6. **Superlativo:** troquei hype por fato específico?
7. **CAIXA ALTA / Title Case:** sem eyebrow repetido, capitalização pt-BR?
8. **Voz Movepark:** direto, humano, "Movepark" grafado certo, pt-BR?
9. **Copy de venda:** passou pela copy-lp-queiroz (skill completa ou princípios)?

Se algum item falha, o texto **não** está pronto para gravar — volte ao passo 3.

## Exemplos (de → para)

**Ex. 1 — hero de conversão (publicitário):**
Input (rascunho com cara de IA):
> Não é apenas um estacionamento — é a tranquilidade que você merece. Reserve de
> forma rápida, simples e segura, e otimize sua jornada rumo ao aeroporto.

Output (revisado, voz Movepark):
> Sua vaga garantida no aeroporto. Reserve em menos de 2 minutos e pague
> exatamente o que está escrito.

**Ex. 2 — mensagem de confirmação (funcional, pula copy-lp-queiroz):**
Input:
> Sua reserva foi realizada com sucesso! Vale ressaltar que você receberá todos
> os detalhes por e-mail em breve.

Output:
> Reserva confirmada. Enviamos os detalhes no seu e-mail.

**Ex. 3 — CTA (fragmento publicitário, aplica princípios sem briefing completo):**
Input:
> Clique aqui e embarque nessa jornada conosco!

Output:
> Reservar minha vaga

## Escopo e confirmação

Revisar e gravar texto de conteúdo é parte normal do trabalho — não precisa de
confirmação extra. Peça referendo do usuário quando a reescrita mudar
significativamente o **sentido** de uma copy de venda, ou quando o texto for
publicado em algo externo (e-mail em massa, meta de página indexada). Ao concluir
uma tarefa que gravou texto, siga o checklist do `CLAUDE.md` (typecheck, lint,
test, `git status` limpo).
