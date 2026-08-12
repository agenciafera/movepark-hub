-- Resumo do post, para o bloco recolhível no topo do corpo.
--
-- Coluna separada de `excerpt` de propósito. O `excerpt` dos 93 posts migrados é o
-- resumo automático do WordPress, ou seja, o começo do próprio corpo cortado em
-- "[...]", e é ele que alimenta o card da listagem e a meta description. Reusar
-- aquela coluna para o resumo do topo faria uma edição estragar a outra
-- superfície, e não haveria como saber qual das duas versões está lá.
--
-- Nasce nula em todo post. Enquanto está nula, a página mostra o índice das
-- seções no lugar, então a coluna vazia não deixa buraco na tela.
alter table public.blog_post
  add column if not exists ai_summary text;

comment on column public.blog_post.ai_summary is
  'Resumo do post exibido no bloco recolhível da página. Nulo enquanto ninguém '
  'escreveu ou gerou um; nesse caso a página mostra o índice das seções. '
  'Separado de excerpt, que é o resumo automático herdado do WordPress e '
  'alimenta o card da listagem e a meta description.';
