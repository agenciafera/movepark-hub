-- Dica de e-mail no checkout (16/09/2026). Espelho do `set_phone_hint` (20260820000000).
--
-- Quem entra por WhatsApp não tem e-mail na conta e digita um no passo 1 do checkout. Ele ia só
-- para o snapshot do booking, e na compra seguinte o campo voltava vazio: parecia que "não salvou".
-- Agora fica guardado como DICA de pré-preenchimento em `profiles.preferences`, keyed em
-- `auth.uid()`. Não é credencial (ADR-006): não escreve `auth.users.email`, não mescla conta.
-- Virar login de e-mail continua exigindo verificação por OTP (tela de identidade).

create or replace function public.set_email_hint(p_email text) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if v_email = '' then
    return; -- nada a guardar; não é erro
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  update public.profiles
     set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{unverified_email_hint}', to_jsonb(v_email)),
         updated_at = now()
   where id = v_uid;
end;
$$;

comment on function public.set_email_hint(text) is
  'Guarda o e-mail digitado no checkout como dica de pré-preenchimento (não credencial). ADR-006.';

alter function public.set_email_hint(text) owner to postgres;
revoke all on function public.set_email_hint(text) from public, anon;
grant execute on function public.set_email_hint(text) to authenticated, service_role;
