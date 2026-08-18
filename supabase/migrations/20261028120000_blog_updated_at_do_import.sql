-- Devolve ao `blog_post.updated_at` o significado de "quando o conteúdo mudou".
--
-- O import do WordPress (10 a 12/08/2026) tocou em todas as linhas, e o trigger
-- `blog_post_set_updated_at` carimbou a data do import em cima da data real de edição. O
-- resultado medido em 17/08/2026: 69 posts publicados com apenas 3 datas distintas de
-- `updated_at`, contra 51 datas distintas de `published_at`, que vão de 22/07/2022 a
-- 12/08/2026.
--
-- Isso não é só cosmético. O `updated_at` alimenta o `dateModified` do BlogPosting
-- (src/lib/jsonld.ts), então cada post declarava ao Google ter sido modificado em agosto de
-- 2026 enquanto o `datePublished` dizia 2022. Passa a alimentar também o `lastmod` do
-- sitemap por seção, e um lastmod que mente é pior que um ausente: o Google aprende a
-- ignorar o sinal do site inteiro.
--
-- Nada se perde: a data do import continua no `created_at`, que não é tocado aqui.
--
-- O trigger é desligado durante o UPDATE porque ele é BEFORE UPDATE e sobrescreveria o
-- valor com `now()`, que é exatamente o defeito que esta migration corrige.
--
-- O trigger `blog_post_knowledge_enqueue` NÃO precisa ser desligado: ele só enfileira
-- resync quando `body_md`, `title` ou `destination_id` mudam, e nenhum deles é tocado.

alter table public.blog_post disable trigger blog_post_set_updated_at;

update public.blog_post
set updated_at = published_at
where deleted_at is null
  -- Só o que o import carimbou. Post editado de verdade depois da janela tem
  -- `updated_at >= 2026-08-13` e fica como está.
  and updated_at < timestamptz '2026-08-13'
  and updated_at > published_at;

alter table public.blog_post enable trigger blog_post_set_updated_at;
