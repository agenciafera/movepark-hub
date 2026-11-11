-- Preferência de tela por usuário (11/11/2026): colunas e ordem da lista de reservas.
--
-- Quem usa o Operator, o balcão e a equipe do Manager escolhe quais colunas aparecem na lista de
-- reservas e em que ordem. A escolha é da PESSOA, não do navegador: tem que valer no computador do
-- balcão e no celular do dono, e sobreviver a limpar o cache. Por isso mora no banco, em
-- `profiles.preferences.ui.<chave>`, e não em localStorage.
--
-- Por que RPC e não `PATCH profiles`: o `update` do PostgREST troca a coluna `preferences` INTEIRA.
-- Com a tela de reservas e o checkout escrevendo chaves diferentes do mesmo JSON, quem gravasse por
-- último apagaria a dica de telefone ou o endereço de cobrança que o outro guardou. A RPC mexe só no
-- caminho `ui.<chave>`, no próprio servidor, keyed em `auth.uid()` (mesmo desenho de
-- `set_phone_hint` e `set_email_hint`).
--
-- Preferência de tela não é credencial nem autorização (ADR-006): é só como a pessoa quer ver.

set search_path = public, pg_temp;

create or replace function public.set_my_ui_preference(p_key text, p_value jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  -- A chave vira caminho de JSON: só o alfabeto de identificador, para não abrir caminho aninhado.
  if p_key is null or p_key !~ '^[a-z0-9_.:-]{1,64}$' then
    raise exception 'Chave de preferência inválida.' using errcode = '22023';
  end if;
  -- Preferência de tela é pequena; o teto evita usar o perfil como depósito.
  if p_value is not null and octet_length(p_value::text) > 8192 then
    raise exception 'Preferência grande demais.' using errcode = '22023';
  end if;

  update public.profiles
     set preferences = case
           when p_value is null or p_value = 'null'::jsonb then
             jsonb_set(
               coalesce(preferences, '{}'::jsonb),
               '{ui}',
               coalesce(preferences->'ui', '{}'::jsonb) - p_key
             )
           else
             jsonb_set(
               coalesce(preferences, '{}'::jsonb),
               '{ui}',
               coalesce(preferences->'ui', '{}'::jsonb) || jsonb_build_object(p_key, p_value)
             )
         end,
         updated_at = now()
   where id = v_uid
  returning preferences->'ui' into v_prefs;

  return coalesce(v_prefs, '{}'::jsonb);
end;
$$;

comment on function public.set_my_ui_preference(text, jsonb) is
  'Grava (ou apaga, com null) uma preferência de tela do próprio usuário em profiles.preferences.ui, sem tocar o resto do JSON.';

alter function public.set_my_ui_preference(text, jsonb) owner to postgres;
-- Default privilege do Supabase dá execute a anon: revoga nominal, não só de public.
revoke all on function public.set_my_ui_preference(text, jsonb) from public, anon;
grant execute on function public.set_my_ui_preference(text, jsonb) to authenticated, service_role;
