-- Termos de Uso v7: itens 4.3 (permanência além do período) e 6.3 (alteração de data) e o rodapé.
--
-- Desde 26/11/2026 o estacionamento estende a reserva de quem já entrou pelo Hub, pela tabela do dia
-- da compra, com a diferença paga por PIX (docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md
-- §4). A v6 dizia, no 4.3, que passar da tolerância "gera cobrança de diária adicional pelo
-- estacionamento, pela tabela dele, na retirada": as duas formas continuam valendo e o texto passa
-- a dizer as duas. O 6.3 ganha a frase de que depois do check-in a saída só se estende pelo
-- estacionamento. Sair antes do combinado não devolve nada, o que o 7.3 já dizia. O texto aceito numa
-- reserva é imutável, por isso é versão nova.
--
-- Publicar junto com o código (ADR-009): a v7 entra no ar com a Edge que estende a saída.
--
-- Trava: só roda se a vigente for a v6 com o conteúdo conferido (md5) e se a v7 ainda não existir.
do $$
declare
  v_old_43 constant text :=
    '<p>4.3. O período reservado começa e termina nos horários que você informou. Cada estacionamento tem uma tolerância de saída, informada na página da unidade e no voucher (hoje 60 minutos em todas as unidades). Sair dentro da tolerância não gera cobrança. Passar da tolerância gera cobrança de diária adicional pelo estacionamento, pela tabela dele, na retirada.</p>';
  v_new_43 constant text :=
    '<p>4.3. O período reservado começa e termina nos horários que você informou. Cada estacionamento tem uma tolerância de saída, informada na página da unidade e no voucher (hoje 60 minutos em todas as unidades). Sair dentro da tolerância não gera cobrança. Passar da tolerância gera cobrança de diária adicional, de um destes jeitos: o estacionamento cobra na retirada, pela tabela dele, ou estende a sua reserva pela Movepark, pela tabela do dia da sua compra, e você paga a diferença por PIX. Sair antes do horário combinado não gera devolução (item 7.3).</p>';
  v_old_63_fim constant text :=
    'O prazo de cancelamento passa a contar da nova data.</p>';
  v_new_63_fim constant text :=
    'O prazo de cancelamento passa a contar da nova data. Depois do check-in, a saída só pode ser estendida pelo estacionamento, conforme o item 4.3.</p>';
  v_old_footer constant text :=
    '<p>Termos de Uso, versão 6, publicados em 17/11/2026. A versão anterior (v5, 17/11/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_new_footer constant text :=
    '<p>Termos de Uso, versão 7, publicados em 26/11/2026. A versão anterior (v6, 17/11/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_content text;
  v_id uuid;
begin
  if exists (
    select 1 from public.legal_document_version where document_slug = 'terms' and version = 7
  ) then
    raise notice 'Termos v7 já existem; nada a fazer.';
    return;
  end if;

  select v.content into v_content
    from public.legal_document d
    join public.legal_document_version v on v.id = d.current_version_id
   where d.slug = 'terms' and v.version = 6;

  if v_content is null then
    -- Banco local do db reset não tem a v6 (ela nasceu no banco vivo, não em seed).
    raise notice 'Termos v6 não são a vigente neste banco; nada a fazer.';
    return;
  end if;

  if md5(v_content) <> '8bce29291a60c0077cc25d1cc1f30d99' then
    raise exception 'Termos v6 mudaram desde a conferência (md5 %); revise antes de publicar a v7.',
      md5(v_content);
  end if;
  if position(v_old_43 in v_content) = 0 then
    raise exception 'Item 4.3 antigo não encontrado nos Termos v6.';
  end if;
  -- O fim do 6.3 aparece uma vez só: é a última frase do item.
  if (length(v_content) - length(replace(v_content, v_old_63_fim, ''))) / length(v_old_63_fim) <> 1 then
    raise exception 'Fim do item 6.3 não é único nos Termos v6.';
  end if;
  if position(v_old_footer in v_content) = 0 then
    raise exception 'Rodapé antigo não encontrado nos Termos v6.';
  end if;

  insert into public.legal_document_version (document_slug, version, content)
  values ('terms', 7,
          replace(replace(replace(v_content, v_old_43, v_new_43), v_old_63_fim, v_new_63_fim),
                  v_old_footer, v_new_footer))
  returning id into v_id;

  update public.legal_document set current_version_id = v_id where slug = 'terms';
end $$;
