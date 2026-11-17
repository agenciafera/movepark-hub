-- Termos de Uso v5: só o item 18 (rodapé da versão).
--
-- A v4 (09/11/2026, parcelamento por regra de repasse) herdou da v3 o rodapé
-- "versão 3, publicados em 27/09/2026", então a página dizia uma versão e o
-- banco outra. O texto aceito numa reserva é imutável (terms_acceptance aponta
-- para a versão), por isso a correção vira versão nova em vez de editar a v4.
--
-- Trava: só roda se a vigente for a v4 com o conteúdo conferido (md5) e se a
-- v5 ainda não existir. Idempotente para o db push que reaplica arquivos.
do $$
declare
  v_old_footer constant text :=
    '<p>Termos de Uso, versão 3, publicados em 27/09/2026. A versão anterior (v2, 18/08/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_new_footer constant text :=
    '<p>Termos de Uso, versão 5, publicados em 17/11/2026. A versão anterior (v4, 09/11/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_content text;
  v_id uuid;
begin
  if exists (
    select 1 from public.legal_document_version where document_slug = 'terms' and version = 5
  ) then
    raise notice 'Termos v5 já existem; nada a fazer.';
    return;
  end if;

  select v.content into v_content
    from public.legal_document d
    join public.legal_document_version v on v.id = d.current_version_id
   where d.slug = 'terms' and v.version = 4;

  if v_content is null then
    -- Banco local do db reset não tem a v4 (ela nasceu no Manager, não em seed).
    raise notice 'Termos v4 não são a vigente neste banco; nada a fazer.';
    return;
  end if;

  if md5(v_content) <> '928195342037e6f145f421356647bb17' then
    raise exception 'Termos v4 mudaram desde a conferência (md5 %); revise antes de publicar a v5.',
      md5(v_content);
  end if;

  if position(v_old_footer in v_content) = 0 then
    raise exception 'Rodapé antigo não encontrado nos Termos v4.';
  end if;

  insert into public.legal_document_version (document_slug, version, content)
  values ('terms', 5, replace(v_content, v_old_footer, v_new_footer))
  returning id into v_id;

  update public.legal_document set current_version_id = v_id where slug = 'terms';
end $$;
