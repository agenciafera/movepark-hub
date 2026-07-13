-- Quebra booking.customer_name (snapshot de contato do pedido) em customer_first_name / customer_last_name,
-- pra bater com o checkout (que coleta Nome + Sobrenome) e com o modelo de first_name/last_name do profiles.
--
-- customer_name CONTINUA coluna real e é o contrato da Public API/MCP (partomos mandam UMA string). Em vez
-- de forçar todos os writers a mudar, um TRIGGER bidirecional reconcilia: quem escreve customer_name (RPCs
-- create_booking/api_create_booking, WL sync) tem o nome FATIADO em first/last; quem escreve first/last
-- (checkout) tem o customer_name RECOMPOSTO. Assim nenhuma RPC nem o contrato da API muda.
-- Usa o helper public.split_person_name (migration 20260804000000).

------------------------------------------------------------------------------------------------
-- (1) Colunas novas + backfill dos nomes existentes (fatia por espaço).
------------------------------------------------------------------------------------------------
alter table public.booking
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name  text;

update public.booking
set customer_first_name = nullif((regexp_split_to_array(btrim(customer_name), '\s+'))[1], ''),
    customer_last_name  = nullif(array_to_string((regexp_split_to_array(btrim(customer_name), '\s+'))[2:], ' '), '')
where customer_name is not null;

------------------------------------------------------------------------------------------------
-- (2) Trigger de reconciliação. BEFORE INSERT/UPDATE:
--   - first/last preenchidos (ou mudaram no update) → customer_name = first + last;
--   - senão, customer_name preenchido (ou mudou no update) → fatia em first/last.
-- Anonimização (que faz customer_name = null) cai no 2º ramo: split(null) zera first/last também.
------------------------------------------------------------------------------------------------
create or replace function public.booking_reconcile_customer_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_first_changed boolean;
  v_name_changed  boolean;
  v_use_parts     boolean;
begin
  if tg_op = 'INSERT' then
    v_use_parts := new.customer_first_name is not null or new.customer_last_name is not null;
  else
    v_first_changed := new.customer_first_name is distinct from old.customer_first_name
                    or new.customer_last_name  is distinct from old.customer_last_name;
    v_name_changed  := new.customer_name is distinct from old.customer_name;
    -- first/last mandam quando mudaram; senão, se o customer_name mudou, ele manda.
    if v_first_changed then
      v_use_parts := true;
    elsif v_name_changed then
      v_use_parts := false;
    else
      return new; -- nada de nome mudou
    end if;
  end if;

  if v_use_parts then
    new.customer_name := nullif(
      btrim(coalesce(new.customer_first_name, '') || ' ' || coalesce(new.customer_last_name, '')),
      ''
    );
  else
    select first_name, last_name
      into new.customer_first_name, new.customer_last_name
    from public.split_person_name(new.customer_name);
  end if;

  return new;
end;
$$;

drop trigger if exists booking_reconcile_customer_name on public.booking;
create trigger booking_reconcile_customer_name
  before insert or update on public.booking
  for each row execute function public.booking_reconcile_customer_name();

comment on column public.booking.customer_name is
  'Snapshot de contato do pedido (contrato da Public API). Reconciliado com customer_first_name/last_name pelo trigger booking_reconcile_customer_name; pode ser de terceiro (reserva para outra pessoa).';
