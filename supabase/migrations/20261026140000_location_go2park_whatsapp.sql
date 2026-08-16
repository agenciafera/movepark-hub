-- Número da van da Go2Park, por unidade.
--
-- Cada estacionamento tem o SEU número para chamar a van, e esses números são configurados no
-- painel da Go2Park, não aqui. Sem esta coluna o Hub não tem como oferecer "salve o contato da
-- van" na página da unidade, que é o passo que falta entre mostrar o diferencial e o cliente
-- conseguir usar. Enquanto a integração com a Go2Park não existe, o número é copiado à mão pelo
-- Manager: três unidades, três números.
--
-- Por que não reusar `location.phone`: aquele é o telefone da PORTARIA (é o canal da garantia de
-- vaga, ver spot-guarantee.md), e a base legada já registra confusão nessa linha, com Nationpark
-- e Abbapark exibindo o número do Virapark. Misturar os dois faria o cliente ligar para a
-- portaria quando quer a van, e faria o Manager sobrescrever um com o outro. Nas três unidades
-- com Go2Park a `phone` está nula hoje, então nem serviria de ponto de partida.
--
-- Sem invariante amarrando o número ao `go2park_enabled`: desligar o contrato não deve obrigar a
-- apagar o número (o contrato pode voltar), e quem decide a exibição é a renderização, que exige
-- os dois. O estado "número guardado, selo desligado" é silencioso de propósito.

alter table public.location
  add column if not exists go2park_whatsapp text;

-- E.164, a mesma régua de `normalizePhoneE164` no cliente. Texto livre aqui viraria link wa.me
-- quebrado no momento em que o cliente pousa e precisa da van.
alter table public.location
  drop constraint if exists location_go2park_whatsapp_e164;
alter table public.location
  add constraint location_go2park_whatsapp_e164
  check (go2park_whatsapp is null or go2park_whatsapp ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.location.go2park_whatsapp is
  'WhatsApp da van desta unidade (E.164), copiado do painel da Go2Park. Só hub_admin escreve '
  '(trigger location_go2park_guard). Nulo enquanto ninguém preencheu: a página omite o CTA em '
  'vez de oferecer um número errado.';

-- A guarda passa a cobrir os dois campos da Go2Park: um número de van é tão comercial quanto o
-- selo, e o parceiro com `locations:write` apontaria a van para o próprio celular.
create or replace function public.location_go2park_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     and not new.go2park_enabled
     and new.go2park_whatsapp is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.go2park_enabled is not distinct from old.go2park_enabled
     and new.go2park_whatsapp is not distinct from old.go2park_whatsapp then
    return new;
  end if;

  -- Sem JWT = backend (service role, migration, seed). Com JWT, só hub_admin.
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'os campos da Go2Park só podem ser alterados por hub_admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.location_go2park_guard() from public, anon, authenticated;

drop trigger if exists location_go2park_guard on public.location;
create trigger location_go2park_guard
  before insert or update of go2park_enabled, go2park_whatsapp on public.location
  for each row execute function public.location_go2park_guard();
