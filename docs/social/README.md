# Conteúdo social publicado fora da fila

A fila de `/manager/social` guarda, aprova e publica foto, carrossel e story, com rastro de cada
chamada à Meta ([`instagram-fila-de-publicacao.md`](../specs/instagram-fila-de-publicacao.md)).
O que ela ainda não publica, como reel, sai pelo app do Instagram, à mão, e aí nada fica
registrado na plataforma.

Esta pasta é esse registro. Uma subpasta por atividade, com:

- o rascunho `.md` da skill `instagram` (front matter e legenda), o mesmo que o analisador lê;
- a fonte da arte (as cenas HTML do reel), para o arquivo poder ser refeito com um comando;
- um README com o que falta, como publicar e, depois, a data e o link do que foi ao ar.

O MP4 e a capa não vão para o git: saem da fonte pelo `render-reel.mjs`. As fotos de fundo vão,
porque a fonte precisa delas: as do blog são apontadas em `public/images/blog/`, sem cópia, e as
geradas para o post ficam na subpasta dele em `.webp`, com linha em
[`docs/procedencia-imagens.md`](../procedencia-imagens.md).
