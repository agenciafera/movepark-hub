-- Rascunho e post excluído vazavam para o `anon`.
--
-- `blog_post_select` era `USING (true)`, copiado do molde de `destination` para o
-- Manager enxergar rascunho pela mesma policy. Em destino isso é inofensivo: um
-- destino não publicado é só um aeroporto sem página. Em post é conteúdo que
-- ainda não devia existir para ninguém, e o `anon` lia título, corpo e meta com a
-- chave pública, consultando o PostgREST direto.
--
-- Verificado em 11/08/2026: um rascunho recém-criado apareceu em
-- `GET /rest/v1/blog_post?is_published=eq.false` usando só a anon key. As
-- superfícies de produto não vazavam (a API, o MCP e o SSG filtram na query),
-- mas a tabela estava aberta por baixo delas, e é a policy que tem que segurar.
--
-- A leitura pública agora é só do que está publicado e não foi excluído. O
-- Manager continua vendo tudo, pela segunda condição.

drop policy if exists blog_post_select on public.blog_post;

create policy blog_post_select on public.blog_post
  for select using (
    (is_published and deleted_at is null) or public.is_hub_admin()
  );

comment on table public.blog_post is
  'Posts do blog. O slug é herdado do WordPress e é contrato de URL: ver docs/specs/blog.md. Leitura pública só do publicado; hub_admin vê rascunho.';
