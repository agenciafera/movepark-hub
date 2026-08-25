# Apresentações

Decks gerados a partir do conteúdo das specs. O deck é código: o HTML é montado por
script e renderizado em PDF, então atualizar um número é editar o script e rodar de novo,
sem abrir editor de slides.

## Plano de conteúdo dos aeroportos

| Arquivo | O que é |
|---|---|
| `plano-conteudo-aeroportos.pdf` | O deck, 31 slides em 1920x1080 |
| `build-deck.mjs` | Gerador do HTML do deck (conteúdo, layout e CSS) |
| `assets-3d/` | As 10 imagens 3D usadas no deck, geradas no Higgsfield |

Spec de origem: [`../specs/plano-conteudo-aeroportos.md`](../specs/plano-conteudo-aeroportos.md).
Dados brutos de cauda longa: [`../specs/dados/cauda-longa-aeroportos.json`](../specs/dados/cauda-longa-aeroportos.json).

### Como regerar

O script espera as imagens em `img/deck<N>.jpg` e a fonte Inter embutida em
`fonts/inter-embed.css`, no mesmo diretório em que roda. O fluxo usado na geração:

1. Baixar Inter (latin e latin-ext) do Google Fonts e converter em `@font-face` com base64.
2. Redimensionar as imagens para 1300px de largura em JPEG.
3. `node build-deck.mjs` gera o `deck.html` autocontido.
4. Renderizar com o Chromium do Playwright em `page.pdf()`, 1920x1080, sem margem,
   `printBackground: true` e `emulateMedia("screen")`.

### Padrão visual

Violeta `#5D5FEF`, navy `#29263F`, branco e lavanda `#EEEEFD`. Inter, peso 800 nos títulos.
Título de capa em 126px, título de seção em 104px, título de conteúdo em 66 a 76px.
As imagens 3D nasceram com prompt de clay render isométrico travado nessa paleta, sem
nenhum texto na arte, porque o texto é sempre tipografia sobreposta.

Cuidado ao mexer no CSS: o conteúdo de cada slide precisa terminar antes do rodapé
(que fica em `top: 989px`). Existe um script de conferência no fluxo de geração que mede
o `bottom` de cada elemento e acusa slide estourado.
