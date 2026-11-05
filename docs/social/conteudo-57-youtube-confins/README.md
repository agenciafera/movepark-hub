# Conteúdo 57: vídeo curto no YouTube, estacionamento no aeroporto de Confins

Atividade: [Conteúdo 57 - Vídeo curto no YouTube](https://app.clickup.com/t/86akr8krn).
Spec: [`docs/specs/ataque-cnf-bepark.md`](../../specs/ataque-cnf-bepark.md) §2.3.8. Skill `instagram`
(o render é o mesmo do reel, em 16:9).

**Por que existe.** O vídeo do Canal Brasil na Rota sobre Confins aparece em 3 das 12 buscas de
Confins testadas em 28/09/2026, e o YouTube é fonte frequente do Modo IA. Um vídeo da Movepark com
a pergunta literal no título, os números datados na fala, na tela e na descrição, e a legenda em
português dá ao YouTube (e à IA que lê a transcrição) o mesmo número que o site publica.

| Peça | Onde | Situação |
| --- | --- | --- |
| Vídeo 1920 x 1080, 30 fps, narrado, 89 s | `quanto-custa-estacionar-aeroporto-confins-2026.mp4` (fora do git, sai do comando abaixo) | **Pronto para subir** |
| Miniatura | `miniatura.jpg` (fora do git, sai do mesmo comando) | Pronta |
| Legenda em português | [`legendas.srt`](legendas.srt) | Pronta, sobe junto |
| Título, descrição, capítulos e tags | [`roteiro.md`](roteiro.md) | Pronto, para colar |

## O que o vídeo diz

Dez cenas, dois assuntos. As sete primeiras são o preço (as mesmas cenas do reel de preço do
[Conteúdo 49](../conteudo-49-reels-confins/), reescritas em 16:9); as três últimas são a van da
BePark. Os números são os do post
[`preco-do-estacionamento-no-aeroporto-de-confins`](https://movepark.co/blog/preco-do-estacionamento-no-aeroporto-de-confins/)
e de `prospect_location` (pátios e oficial em 07/10/2026; BePark pelo motor, tabela de 06/10/2026),
relidos no banco em 05/11/2026, sem mudança.

| Duração | Oficial (Econômico 3, balcão) | Particular mais barato | BePark |
| --- | ---: | ---: | ---: |
| 1 diária | R$ 60 (Premium até R$ 105) | R$ 20, Auto Park Brasil | R$ 45 |
| 7 diárias | R$ 420, ou a partir de R$ 189 reservando com 72h | R$ 125,93, Bandeira Park | R$ 200 |
| 30 diárias | R$ 1.800 | R$ 300, Auto Park Brasil | R$ 400 |

A van entra como **fato da unidade** (ADR-009): sai a cada 20 minutos, 24 horas, trajeto de cerca
de 10 minutos, embarque no piso inferior na plataforma da Expresso Unir, rastreio ao vivo pela
Go2Park, tudo da ficha e do site da BePark em 07/10/2026 (§2.3.4 da spec). A exclusividade é
datada ("no levantamento da Movepark de outubro de 2026"). **Nenhuma promessa de transação**: sem
reserva, cancelamento, troca de data ou vaga garantida, porque a unidade vende no sistema dela
desde 19/10/2026. A BePark aparece sem tipo de vaga, pelo motivo do §2.3.5.

**O que não está no vídeo: a gravação da van no mapa.** A atividade sugeria reaproveitar a
gravação do Conteúdo 49, mas ela não aconteceu (o reel da van segue esperando a BePark e a
Go2Park). Montar um mapa seria a prova falsa do único diferencial da BePark, então a van entra em
texto sobre foto, com os números da ficha. Quando a gravação existir, ela substitui as cenas 8 e 9.

## Como o vídeo é feito

Cada cena é um HTML 1920 x 1080 (`cena-01.html` a `cena-10.html`), no mesmo modelo do reel, com
o número escrito uma vez. A narração é um clipe por cena em [`narracao/`](narracao/), gerada no
Higgsfield (`text2speech_v2`, variante ElevenLabs, voz predefinida Andre, 05/11/2026), com o texto
da fala e o texto da legenda em [`cenas.json`](cenas.json). O `montar-narracao.mjs` mede os clipes,
dá a cada cena a duração da fala mais 0,7 s de respiro (acelerando a voz em 12%, sem mudar o tom,
para caber nos 90 s da atividade: sem isso dava 98 s), escreve a trilha e a legenda SRT e devolve
os argumentos do render.

```bash
cd docs/social/conteudo-57-youtube-confins && node ../../../.claude/skills/instagram/scripts/render-reel.mjs \
  quanto-custa-estacionar-aeroporto-confins-2026.mp4 \
  $(node ../../../.claude/skills/instagram/scripts/montar-narracao.mjs cenas.json --trilha trilha.wav --srt legendas.srt) \
  --audio trilha.wav --tamanho 1920x1080 --capa miniatura.jpg
```

(A lista de cenas vai inline no `$(...)`, de propósito: guardada numa variável, o zsh não a
separa em palavras e o render recebe tudo como um nome de arquivo só.)

Precisa de `bun install` (Chromium do Playwright) e do ffmpeg no PATH. O MP4, a trilha e a
miniatura não ficam no git (`.gitignore` da pasta): saem iguais destes arquivos.

As fotos são as capas 16:9 dos posts de Confins em `public/images/blog/`, apontadas por caminho
relativo. A única cópia é [`fotos/bepark-confins-van-ao-vivo-sem-emblema.jpg`](fotos/), a capa do
guia da BePark com o emblema da van apagado (registro em
[`docs/procedencia-imagens.md`](../../procedencia-imagens.md)).

## Publicar no YouTube

1. YouTube Studio, "Criar", "Enviar vídeos", com o MP4.
2. Título, descrição e tags do [`roteiro.md`](roteiro.md). O título traz a pergunta literal e o
   ano; a descrição traz os números datados e o link de `/estacionamentos/aeroporto-confins`.
3. Miniatura: `miniatura.jpg`.
4. Legendas: "Legendas", "Adicionar", idioma Português (Brasil), enviar `legendas.srt` ("Com
   código de tempo"). Não dependa da legenda automática: ela erra número.
5. Público: "não é para crianças". Capítulos vêm dos tempos na descrição.
6. Depois de publicado, anote a data e o link aqui embaixo, e comente na atividade.
7. Na ficha de Confins e no post de preço, o vídeo pode entrar com `VideoObject` (ver
   `docs/specs/seo-indexacao.md`, "vídeo da página de parceiro"). É atividade à parte.

## Publicados

| Vídeo | Data | Link |
| --- | --- | --- |
| Quanto custa estacionar no aeroporto de Confins em 2026 | | |
