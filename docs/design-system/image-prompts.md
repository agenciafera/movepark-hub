# Prompts de imagem (gemini-image)

Registro dos prompts usados para gerar os assets de imagem por IA do projeto.
Toda imagem gerada sai do MCP `gemini-image` (regra do projeto, ver `CLAUDE.md` e a
skill `gerar-imagens-gemini`). Guardar o prompt aqui deixa o asset reproduzível: se
precisar regenerar em outra resolução ou variar o enquadramento, o ponto de partida
já está versionado.

Fluxo padrão de entrega:

1. Gerar em PNG full-res (`--aspect 16:9 --size 2K`) via driver stdio da skill.
2. Converter para WebP otimizado com `sharp` (hero: largura 1920, `quality: 72`).
3. Apagar o PNG e o preview HTML; commitar só o `.webp` junto do código que o usa.

---

## `/sobre` — hero (banner de marca)

- **Asset:** `public/images/sobre-hero.webp` (1920×1072, ~41 KB)
- **Onde aparece:** faixa hero full-bleed de `src/routes/sobre.tsx`, sob overlay
  navy em degradê (esquerda escura → direita clara), com a headline branca à esquerda.
- **Comportamento pedido:** igual ao hero da `/seja-parceiro` — o terço esquerdo do
  quadro precisa cair na sombra pra segurar o texto branco legível (contraste AA); o
  interesse visual (terminal iluminado) fica à direita, onde não há texto.
- **Aspecto / tamanho na geração:** `16:9`, `2K`.

Prompt (inglês, como o Gemini responde melhor):

```
Cinematic wide editorial photograph of a modern airport parking area at blue hour,
dusk. A traveler with a small carry-on suitcase walks calmly toward a parked car,
seen from a slight distance and softly out of focus, relaxed and unhurried. In the
background a contemporary airport terminal and a control tower glow with warm
interior lights against a deep navy-blue twilight sky; an airplane climbs far away
on the horizon. The left third of the frame falls into deep shadow and dark empty
twilight sky, intentionally reserving negative space for text; the right side
catches warm golden amber light from terminal lamps and the last of the sun. Calm,
trustworthy, premium and human mood. Dominant deep navy and indigo tones (#29263F)
with warm amber highlights. Realistic documentary photography, 35mm lens, shallow
depth of field, high dynamic range, natural film grain, no people facing camera,
no text, no logos, no watermark, no signage lettering.
```
