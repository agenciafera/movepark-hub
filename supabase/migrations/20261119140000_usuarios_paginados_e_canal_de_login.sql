-- Manager › Usuários paginado no servidor, com contato e último canal de login (16/09/2026).
--
-- A tela carregava os 200 perfis mais novos de uma vez e filtrava no navegador; com o site
-- crescendo isso vira lista truncada e busca cega. E identificava a pessoa só por nome e pelos
-- oito primeiros caracteres do id, o que não serve para achar um cliente. O e-mail e o telefone
-- moram em `auth.users` (ADR-006: contato de terceiros só por RPC security definer, nunca cópia
-- editável em `profiles`), então a leitura vai por RPC de hub_admin, que também pagina e busca.
--
-- Último canal de login: o Supabase não guarda por sessão se o OTP foi e-mail ou WhatsApp, e
-- `auth.identities.last_sign_in_at` não acompanha cada login (medido: developer@ entrou por OTP
-- em 16/09 e a identidade de e-mail marca 27/05). Então o front registra o canal a cada login
-- (`record_login_channel`), e para quem ainda não entrou depois disto a RPC cai num palpite
-- honesto: sessão OAuth = Google; OTP com uma identidade só = ela; senão fica em branco.

alter table public.profiles
  add column if not exists last_login_channel text
    check (last_login_channel in ('email', 'whatsapp', 'google')),
  add column if not exists last_login_at timestamptz;

comment on column public.profiles.last_login_channel is
  'Canal do último login registrado pelo front (email, whatsapp, google). Não é credencial.';

-- ── record_login_channel ──
create or replace function public.record_login_channel(p_channel text) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if p_channel not in ('email', 'whatsapp', 'google') then
    raise exception 'Canal de login desconhecido: %', p_channel using errcode = '22023';
  end if;
  update public.profiles
     set last_login_channel = p_channel, last_login_at = now(), updated_at = now()
   where id = v_uid;
end;
$$;
alter function public.record_login_channel(text) owner to postgres;
revoke all on function public.record_login_channel(text) from public, anon;
grant execute on function public.record_login_channel(text) to authenticated, service_role;

-- ── admin_list_users ──
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit int default 25,
  p_offset int default 0
) returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Só hub_admin lista usuários.' using errcode = 'P0001';
  end if;

  -- A mesma condição nas duas consultas (contagem e página): função stable não cria tabela
  -- temporária, e a contagem precisa existir mesmo quando o offset passa do fim.
  select count(*) into v_total
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.deleted_at is null
     and (
       v_q is null
       or p.full_name ilike '%' || v_q || '%'
       or u.email ilike '%' || v_q || '%'
       or p.id::text ilike v_q || '%'
       or (v_digits is not null and length(v_digits) >= 4 and u.phone like '%' || v_digits || '%')
     );

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) into v_rows
    from (
      select p.id, p.full_name, p.role, p.created_at, u.email, u.phone,
             coalesce(p.last_login_at, u.last_sign_in_at) as last_login_at,
             coalesce(
               p.last_login_channel,
               -- Palpite para quem não entrou desde a coluna existir.
               (select case a.authentication_method
                         when 'oauth' then 'google'
                         when 'otp' then (
                           select case i.provider when 'phone' then 'whatsapp' when 'email' then 'email' end
                             from auth.identities i
                            where i.user_id = p.id and i.provider in ('email', 'phone')
                            order by i.last_sign_in_at desc nulls last
                            limit 1)
                       end
                  from auth.sessions s
                  join auth.mfa_amr_claims a on a.session_id = s.id
                 where s.user_id = p.id
                 order by s.created_at desc
                 limit 1)
             ) as last_login_channel,
             exists (select 1 from public.tester_user tu where tu.user_id = p.id) as is_tester,
             coalesce((
               select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                 from public.profile_company pc
                 join public.company c on c.id = pc.company_id
                where pc.profile_id = p.id), '[]'::jsonb) as companies
        from public.profiles p
        join auth.users u on u.id = p.id
       where p.deleted_at is null
         and (
           v_q is null
           or p.full_name ilike '%' || v_q || '%'
           or u.email ilike '%' || v_q || '%'
           or p.id::text ilike v_q || '%'
           or (v_digits is not null and length(v_digits) >= 4 and u.phone like '%' || v_digits || '%')
         )
       order by p.created_at desc
       limit v_limit offset v_offset
    ) r;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;
alter function public.admin_list_users(text, int, int) owner to postgres;
revoke all on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated, service_role;
