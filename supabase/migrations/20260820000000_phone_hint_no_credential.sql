-- ADR-006 · Fecha o desvio do "anexo silencioso de telefone" no checkout.
--
-- Antes: o telefone digitado no checkout era promovido a CREDENCIAL de login
-- (auth.users.phone, phone_confirm=true) sem prova de posse, com a Edge
-- attach-phone-silent. A única guarda era checar colisão. Um número digitado
-- errado (que ainda não fosse de ninguém) virava credencial de login da conta
-- de quem digitou. Com login por OTP de WhatsApp como caminho principal do
-- agente, isso vira porta de sequestro de conta.
--
-- Agora: o telefone vira só uma DICA de pré-preenchimento, não credencial. Mora
-- em profiles.preferences.unverified_phone_hint (o campo que a migration de prep
-- do E0.10, 20260730000000, já criou e que o checkout já lê como fallback).
-- Promover telefone a credencial segue exigindo verificação, pela tela "Meus
-- logins" (Edge attach-identifier, com OTP próprio). ADR-006 volta a valer sem
-- exceção.

create or replace function public.set_phone_hint(p_phone text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    return; -- nada a guardar; não é erro
  end if;

  -- jsonb_set preserva as outras chaves de preferences (não clobber).
  update public.profiles
  set preferences = jsonb_set(
        coalesce(preferences, '{}'::jsonb),
        '{unverified_phone_hint}',
        to_jsonb(p_phone)
      ),
      updated_at = now()
  where id = v_uid;
end;
$$;

comment on function public.set_phone_hint(text) is
  'Guarda o telefone digitado como dica de pré-preenchimento (não credencial). ADR-006.';

revoke all on function public.set_phone_hint(text) from public, anon;
grant execute on function public.set_phone_hint(text) to authenticated, service_role;
