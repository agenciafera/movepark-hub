-- O acervo passa a linkar para a gramática nova, no mesmo deploy da virada de URL.
--
-- São 77 posts com link para `/destinos/<slug>`, 6 para `/precos/<slug>`, 3 para
-- `/estacionamento-mais-barato/<slug>` e 55 trechos da base de conhecimento (o que o
-- chatbot cita). Sem esta reescrita cada link interno do blog passaria a valer um salto de
-- 301: funciona, mas gasta duas requisições por clique, dilui o sinal que o link interno
-- carrega e deixa o acervo apontando para um endereço que a gente mesmo aposentou.
--
-- Substituição por destino, do slug mais longo para o mais curto: slug é único, mas um pode
-- ser prefixo de outro, e trocar o curto primeiro cortaria o longo no meio.
--
-- Ver docs/specs/url-estacionamentos.md.

do $$
declare
  d record;
begin
  for d in
    select slug, public_slug
    from public.destination
    where public_slug is not null
    order by length(slug) desc
  loop
    update public.blog_post
    set body_md = replace(
          replace(
            replace(body_md, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug),
            '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos'),
          '/estacionamento-mais-barato/' || d.slug,
          '/estacionamentos/' || d.public_slug || '/mais-barato')
    where body_md like '%/destinos/' || d.slug || '%'
       or body_md like '%/precos/' || d.slug || '%'
       or body_md like '%/estacionamento-mais-barato/' || d.slug || '%';

    update public.knowledge_chunk
    set content = replace(
          replace(
            replace(content, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug),
            '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos'),
          '/estacionamento-mais-barato/' || d.slug,
          '/estacionamentos/' || d.public_slug || '/mais-barato')
    where content like '%/destinos/' || d.slug || '%'
       or content like '%/precos/' || d.slug || '%'
       or content like '%/estacionamento-mais-barato/' || d.slug || '%';
  end loop;
end $$;

-- O índice, que não tem slug de destino no caminho.
update public.blog_post
set body_md = replace(body_md, '](/destinos)', '](/estacionamentos)')
where body_md like '%](/destinos)%';

update public.knowledge_chunk
set content = replace(content, '](/destinos)', '](/estacionamentos)')
where content like '%](/destinos)%';
