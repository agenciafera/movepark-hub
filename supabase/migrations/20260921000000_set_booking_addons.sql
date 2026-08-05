-- Adicionais escolhidos no checkout, com preço vindo do servidor.
--
-- O passo de adicionais acontece com a reserva já criada (o hold nasce na página
-- da vaga), então o cliente precisa de um caminho pra trocar os add-ons depois.
-- Esse caminho NÃO pode ser um insert direto em `booking_item`: a policy
-- `booking_item_owner_write` deixa o dono escrever, e escrever ali significa
-- escolher o próprio `unit_price` e mexer no `total_amount`. Preço é do servidor.
--
-- A função troca o conjunto inteiro de add-ons (não incrementa), porque é isso que
-- a tela faz: o cliente marca e desmarca até seguir.

create or replace function public.set_booking_addons(
  p_code text,
  p_add_on_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_booking record;
  v_antigo numeric := 0;
  v_novo numeric := 0;
  v_id uuid;
  v_nome text;
  v_preco numeric;
  v_itens jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  select id, status, location_id, total_amount, profile_id
    into v_booking
    from public.booking
   where code = p_code;

  if v_booking.id is null then raise exception 'reserva não encontrada'; end if;
  if v_booking.profile_id is distinct from v_uid then
    raise exception 'reserva de outro cliente';
  end if;
  -- Só antes de pagar: mexer no total depois do pagamento deixaria o valor pago e
  -- o valor devido diferentes, sem cobrança nem estorno pra fechar a conta.
  if v_booking.status <> 'pending' then
    raise exception 'os adicionais só podem mudar antes do pagamento';
  end if;

  -- Tira os add-ons atuais do total antes de trocar.
  select coalesce(sum(subtotal), 0) into v_antigo
    from public.booking_item
   where booking_id = v_booking.id and item_type = 'add_on';

  delete from public.booking_item
   where booking_id = v_booking.id and item_type = 'add_on';

  if p_add_on_ids is not null and array_length(p_add_on_ids, 1) > 0 then
    foreach v_id in array p_add_on_ids loop
      -- O preço sai do catálogo da UNIDADE da reserva. O filtro por
      -- `las.location_id` importa: o mesmo serviço pode ser oferecido em várias
      -- unidades da empresa com override diferente, e sem ele o preço escolhido
      -- seria arbitrário.
      select a.name, coalesce(las.price_override, a.base_price)
        into v_nome, v_preco
        from public.add_on_service a
        join public.location_add_on_service las
          on las.add_on_service_id = a.id
         and las.location_id = v_booking.location_id
         and las.is_active = true
       where a.id = v_id
         and a.is_active = true;

      -- Serviço que a unidade não oferece é ignorado em silêncio, não vira erro:
      -- o catálogo pode ter mudado entre a tela carregar e o cliente seguir.
      if v_nome is not null then
        insert into public.booking_item
          (booking_id, item_type, add_on_service_id, quantity, unit_price, subtotal)
        values (v_booking.id, 'add_on', v_id, 1, v_preco, v_preco);

        v_novo := v_novo + v_preco;
        v_itens := v_itens || jsonb_build_object(
          'add_on_service_id', v_id, 'name', v_nome, 'unit_price', v_preco);
      end if;
    end loop;
  end if;

  update public.booking
     set total_amount = total_amount - v_antigo + v_novo,
         updated_at = now()
   where id = v_booking.id;

  return jsonb_build_object(
    'code', p_code,
    'add_ons', v_itens,
    'add_ons_total', v_novo,
    'total_amount', v_booking.total_amount - v_antigo + v_novo
  );
end;
$$;

comment on function public.set_booking_addons(text, uuid[]) is
  'Troca os adicionais de uma reserva pendente do próprio cliente. Preço vem do catálogo da unidade, nunca do cliente.';

-- `anon` não entra: a função depende de auth.uid() e só faz sentido logado.
revoke execute on function public.set_booking_addons(text, uuid[]) from public, anon;
grant execute on function public.set_booking_addons(text, uuid[]) to authenticated;
