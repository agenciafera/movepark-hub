# Rascunhos de post do blog

Texto de post que ainda não está no banco. O post publicado vive em `blog_post`, e o gêmeo
Markdown dele (`/blog/<slug>.md`) é gerado do banco no build.

Por isso rascunho **não** vai em `public/blog/`: tudo em `public/` é servido no ar, e o
`scripts/check-internal-links.mjs` reprova o build quando acha `.md` ali sem post vivo. Foi o
que travou o deploy em 06/10/2026, com os nove guias master da onda 3 (movidos para cá).

Para publicar, importe o post no banco (Manager ou `scripts/import-wp-blog.mjs`) e apague o
rascunho daqui.
