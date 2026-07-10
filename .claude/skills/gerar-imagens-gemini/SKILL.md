---
name: gerar-imagens-gemini
description: >-
  Gera, edita ou descreve imagens usando SEMPRE o MCP gemini-image (Google
  Gemini / Nano Banana Pro). Use esta skill toda vez que o usuário pedir para
  criar, gerar, desenhar, ilustrar, produzir ou editar qualquer imagem, foto,
  banner, hero, ícone, ilustração, mockup visual, thumbnail, textura ou arte —
  mesmo que ele não cite "gemini" nem diga a palavra "imagem" explicitamente
  (ex.: "faz um desenho de...", "preciso de uma foto de...", "cria um banner
  pra..."). É o provedor de imagem oficial deste projeto: NUNCA use outro gerador
  de imagens (nem SVG à mão, nem outro serviço de IA) quando o pedido for uma
  imagem rasterizada. Para diagramas/gráficos vetoriais simples, prefira as
  ferramentas de visualização normais; esta skill é para imagens geradas por IA.
---

# Gerar imagens com o MCP gemini-image

Neste projeto, **toda imagem gerada por IA sai do MCP `gemini-image`** (pacote
`@houtini/gemini-mcp`, que roda o Google Gemini / Nano Banana Pro). A config e a
chave já vivem no `.mcp.json` do projeto, no servidor `gemini-image`. Não troque
de provedor, não invente chave, não gere a imagem "na mão".

## Como chamar

Há dois caminhos. **Prefira o caminho A**; caia no B quando o A não estiver
disponível.

### A) Tool MCP direta (quando registrada na sessão)

Se as tools `mcp__gemini-image__*` estiverem disponíveis, use `generate_image`
diretamente. Parâmetros úteis:

- `prompt` — descrição da imagem (capriche; veja "Escrevendo o prompt").
- `aspectRatio` — `1:1`, `16:9`, `9:16`, `4:3`, `3:4`…
- `imageSize` — `1K`, `2K`, `4K`.
- `outputPath` — caminho absoluto pra salvar o `.png` full-res.
- `images` — imagens de entrada (base64) para variação/composição.

Para editar imagem existente use `edit_image`; para analisar/descrever use
`describe_image`.

> As tools não aparecem por busca? Carregue pelo nome exato antes de chamar:
> `ToolSearch` com `select:mcp__gemini-image__generate_image`.

### B) Driver via stdio (fallback confiável)

O servidor `gemini-image` **às vezes não termina de conectar na sessão** e suas
tools nunca registram (some da lista, fica "connecting"). Quando isso acontecer,
**não desista nem troque de provedor** — suba o mesmo servidor via stdio com o
script empacotado, que reusa a config/chave do `.mcp.json`:

```bash
# a partir da raiz do projeto (onde está o .mcp.json)
node .claude/skills/gerar-imagens-gemini/scripts/gemini-image.mjs generate \
  --out "public/images/<nome-descritivo>.png" \
  --prompt "<prompt detalhado em inglês>" \
  --aspect 16:9 --size 2K
```

Outros comandos do driver:

```bash
# editar imagem(ns) existente(s)
node .claude/skills/gerar-imagens-gemini/scripts/gemini-image.mjs edit \
  --out "saida.png" --prompt "troque o fundo para azul" --image "entrada.png"

# descrever/analisar uma imagem
node .claude/skills/gerar-imagens-gemini/scripts/gemini-image.mjs describe \
  --image "foto.png" --prompt "o que há nesta imagem?"

# conferir as tools que o servidor expõe
node .claude/skills/gerar-imagens-gemini/scripts/gemini-image.mjs list-tools
```

O script imprime o caminho do PNG salvo. A primeira execução pode demorar
(download do pacote via `npx`) — o timeout é de 180s, então aguarde.

**Nunca** passe a `GEMINI_API_KEY` na linha de comando (vaza no histórico do
shell e é bloqueado pelo classificador). O driver já lê a chave do `.mcp.json`.

## Escrevendo o prompt

Gemini/Nano Banana responde melhor a prompts descritivos, geralmente **em
inglês**, cobrindo: assunto, enquadramento, estilo, iluminação e nível de
detalhe. Ex.: em vez de "uma bola no campo", peça "a classic black-and-white
soccer ball resting on freshly cut striped grass, white boundary line, golden
hour light, shallow depth of field, photorealistic, high detail". Se o usuário
deu poucos detalhes, enriqueça o prompt com escolhas sensatas em vez de
devolver algo genérico.

## Onde salvar e o fluxo de entrega

1. Se a imagem for **asset do projeto** (vai aparecer no site/app), salve em
   `public/images/` com nome descritivo em kebab-case e, ao concluir, **commite
   o arquivo junto** — o CLAUDE.md exige que assets referenciados pelo código
   sejam versionados no mesmo commit (rode `git status` e não deixe o PNG como
   untracked).
2. Se for só um rascunho/experimento, salve no diretório de scratchpad da sessão.
3. Depois de gerar, **abra o PNG com a ferramenta Read** para conferir
   visualmente o resultado antes de entregar, e descreva ao usuário o que saiu.
4. Ofereça variações (outro aspecto, sem fundo, ângulo diferente) quando fizer
   sentido.

## Confirmação e escopo

Gerar e salvar um arquivo local não precisa de confirmação. Só peça autorização
se o pedido implicar publicar a imagem em algo externo, sobrescrever um asset
existente importante, ou custo/efeito difícil de reverter.
