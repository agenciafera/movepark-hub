# Apresentações

Decks gerados a partir do conteúdo das specs. O deck é código: o HTML é montado por
script e renderizado em PDF, então atualizar um número é editar o script e rodar de novo,
sem abrir editor de slides.

## Plano de conteúdo dos aeroportos

| Arquivo | O que é |
|---|---|
| `plano-conteudo-aeroportos.pdf` | O deck, 32 slides em 1920x1080 |
| `build-deck.mjs` | Gerador do HTML do deck (conteúdo, layout e CSS) |
| `assets-3d/` | As 10 artes 3D do deck, geradas no Higgsfield, **em WebP com fundo transparente** |

Spec de origem: [`../specs/plano-conteudo-aeroportos.md`](../specs/plano-conteudo-aeroportos.md).
Dados brutos de cauda longa: [`../specs/dados/cauda-longa-aeroportos.json`](../specs/dados/cauda-longa-aeroportos.json).

### Como regerar

O script espera as imagens em `img/deck<N>.jpg` e a fonte Inter embutida em
`fonts/inter-embed.css`, no mesmo diretório em que roda. O fluxo usado na geração:

1. Baixar Inter (latin e latin-ext) do Google Fonts e converter em `@font-face` com base64.
2. Passar as artes pelo `remove_background` do Higgsfield e redimensionar para 900px, em WebP
   com canal alfa. Transparente é o que permite a arte sentar direto sobre o navy da capa sem
   caixa branca em volta, e WebP com alfa segura as dez em 376 KB.
3. `node build-deck.mjs` gera o `deck.html` autocontido.
4. Renderizar com o Chromium do Playwright em `page.pdf()`, 1920x1080, sem margem,
   `printBackground: true` e `emulateMedia("screen")`.

### Padrão visual

Violeta `#5D5FEF`, navy `#29263F`, branco e lavanda `#EEEEFD`. Inter, peso 800 nos títulos.
Título de capa em 126px, título de seção em 104px, título de conteúdo em 66 a 76px.
As artes 3D nasceram com prompt de clay render isométrico travado nessa paleta, sem nenhum texto,
porque o texto é sempre tipografia sobreposta. O fundo é transparente, então cada arte ganha um
brilho radial atrás quando senta sobre faixa escura, e uma sombra projetada quando senta sobre branco.

Cuidado ao mexer no CSS: o conteúdo de cada slide precisa terminar antes do rodapé
(que fica em `top: 989px`). Existe um script de conferência no fluxo de geração que mede
o `bottom` de cada elemento e acusa slide estourado.
