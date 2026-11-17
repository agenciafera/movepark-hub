-- Termos de Uso v6: item 6.3 (alteração de data) e o rodapé da versão.
--
-- Regra nova da troca de datas de reserva paga (17/11/2026, docs/specs/booking-modifications.md §8):
-- a diferença sai da tabela que valia no dia da compra (mudar só o dia não custa nada), encurtar
-- pode custar mais quando a tabela tem pacote, a tarifa não muda, o cupom continua e a diferença
-- pode ser paga por PIX ou cartão. A v5 dizia "recalcula pela tabela vigente" e "cupom não é
-- reaplicado". O texto aceito numa reserva é imutável, por isso é versão nova.
--
-- Publicar junto com o código (ADR-009): a v6 só entra no ar quando o site já mostra o valor antes
-- de confirmar e aceita cartão na diferença.
--
-- Trava: só roda se a vigente for a v5 com o conteúdo conferido (md5) e se a v6 ainda não existir.
do $$
declare
  v_old_63 constant text :=
    '<p>6.3. Troca de veículo e alteração de data (Flex e Superflex) são feitas na sua conta, até o horário do check-in. Alteração de data recalcula o preço pela tabela vigente do estacionamento e o prazo de cancelamento pela nova data. Em reserva já paga, a Movepark mostra o novo valor antes de você confirmar: se ficar mais caro, você paga a diferença (por PIX ou cartão) e a alteração só vale depois desse pagamento; se ficar mais barato, a diferença volta pelo mesmo meio de pagamento, nos prazos do item 7.5. Cupom aplicado na reserva original não é reaplicado no recálculo.</p>';
  v_new_63 constant text :=
    '<p>6.3. Troca de veículo e alteração de data (Flex e Superflex) são feitas na sua conta, até o horário do check-in. Na alteração de data, a diferença de preço sai da tabela do estacionamento que valia no dia da sua compra. Mudar só o dia, com a mesma quantidade de diárias, não custa nada. Aumentar ou diminuir a estadia muda o valor conforme essa tabela; se ela tiver pacote (preço fechado a partir de certo número de diárias), encurtar a estadia pode custar mais. O valor da Tarifa não muda. Em reserva já paga, a Movepark mostra o novo valor antes de você confirmar: se ficar mais caro, você paga a diferença por PIX ou cartão e a alteração só vale depois desse pagamento; se ficar mais barato, a diferença volta pelo mesmo meio de pagamento, nos prazos do item 7.5. O cupom aplicado na reserva continua valendo: o de percentual é refeito sobre o novo valor e o de valor fixo se mantém. O prazo de cancelamento passa a contar da nova data.</p>';
  v_old_footer constant text :=
    '<p>Termos de Uso, versão 5, publicados em 17/11/2026. A versão anterior (v4, 09/11/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_new_footer constant text :=
    '<p>Termos de Uso, versão 6, publicados em 17/11/2026. A versão anterior (v5, 17/11/2026) fica disponível no histórico. Reserva aceita a versão vigente na data da compra.</p>';
  v_content text;
  v_id uuid;
begin
  if exists (
    select 1 from public.legal_document_version where document_slug = 'terms' and version = 6
  ) then
    raise notice 'Termos v6 já existem; nada a fazer.';
    return;
  end if;

  select v.content into v_content
    from public.legal_document d
    join public.legal_document_version v on v.id = d.current_version_id
   where d.slug = 'terms' and v.version = 5;

  if v_content is null then
    -- Banco local do db reset não tem a v5 (ela nasceu no banco vivo, não em seed).
    raise notice 'Termos v5 não são a vigente neste banco; nada a fazer.';
    return;
  end if;

  if md5(v_content) <> 'ed805603f27aa0dc7dfb0dbc25ef8c54' then
    raise exception 'Termos v5 mudaram desde a conferência (md5 %); revise antes de publicar a v6.',
      md5(v_content);
  end if;
  if position(v_old_63 in v_content) = 0 then
    raise exception 'Item 6.3 antigo não encontrado nos Termos v5.';
  end if;
  if position(v_old_footer in v_content) = 0 then
    raise exception 'Rodapé antigo não encontrado nos Termos v5.';
  end if;

  insert into public.legal_document_version (document_slug, version, content)
  values ('terms', 6, replace(replace(v_content, v_old_63, v_new_63), v_old_footer, v_new_footer))
  returning id into v_id;

  update public.legal_document set current_version_id = v_id where slug = 'terms';
end $$;
