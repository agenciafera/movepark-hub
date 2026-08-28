-- O corpo da FAQ ficou de fora da reescrita anterior (20261104090000), que só tratou blog e
-- base de conhecimento. São 40 perguntas com link para `/destinos/<slug>` e 8 para preços ou
-- mais barato. Achado ao varrer o `dist` do build: as páginas de `/faq/<slug>` saíam com
-- link para o endereço velho, e cada uma é uma página indexada.
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
    update public.faq
    set body_md = replace(
          replace(
            replace(body_md, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug),
            '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos'),
          '/estacionamento-mais-barato/' || d.slug,
          '/estacionamentos/' || d.public_slug || '/mais-barato')
    where body_md like '%/destinos/' || d.slug || '%'
       or body_md like '%/precos/' || d.slug || '%'
       or body_md like '%/estacionamento-mais-barato/' || d.slug || '%';

    update public.faq
    set answer = replace(
          replace(
            replace(answer, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug),
            '/precos/' || d.slug, '/estacionamentos/' || d.public_slug || '/precos'),
          '/estacionamento-mais-barato/' || d.slug,
          '/estacionamentos/' || d.public_slug || '/mais-barato')
    where answer like '%/destinos/' || d.slug || '%'
       or answer like '%/precos/' || d.slug || '%'
       or answer like '%/estacionamento-mais-barato/' || d.slug || '%';
  end loop;
end $$;

update public.faq
set body_md = replace(body_md, '](/destinos)', '](/estacionamentos)')
where body_md like '%](/destinos)%';
