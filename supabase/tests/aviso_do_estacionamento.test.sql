-- pgTAP: aviso do estacionamento por unidade (`location.partner_notice_md`).
-- Spec: docs/specs/aviso-do-estacionamento.md
--
-- O que este arquivo protege:
--   1. a coluna existe, nasce nula e aceita Markdown restrito;
--   2. HTML cru e texto acima de 2.000 caracteres são recusados pelo banco (23514);
--   3. quem edita é quem tem `locations:write` (Dono e Gerente); Operação não;
--   4. o trigger de republicação do site continua na tabela (a ficha é pré-renderizada).

begin;
select plan(10);

-- ── fixtures (como postgres; RLS não se aplica) ────────────────────────────
do $$
declare
  v_gerente uuid := gen_random_uuid();
  v_operacao uuid := gen_random_uuid();
  v_company uuid;
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','aviso-gerente@ex.com',now(),now()),
    (v_operacao,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','aviso-operacao@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_gerente,'company_operator'), (v_operacao,'company_operator')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug) values ('Aviso Parceiro','aviso-parceiro')
    returning id into v_company;
  insert into public.profile_company(profile_id, company_id, role) values
    (v_gerente, v_company, 'manager'), (v_operacao, v_company, 'operator');
  insert into public.location(company_id, name, slug)
    values (v_company, 'Aviso Unidade', 'aviso-unidade') returning id into v_loc;

  perform set_config('test.gerente', v_gerente::text, false);
  perform set_config('test.operacao', v_operacao::text, false);
  perform set_config('test.loc', v_loc::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_column('public','location','partner_notice_md','location.partner_notice_md existe');
select is(
  (select partner_notice_md from public.location where id = current_setting('test.loc')::uuid),
  null, 'unidade nasce sem aviso'
);
select has_trigger('public','location','location_site_rebuild','a ficha pré-renderizada republica quando a unidade muda');

-- ── formato ────────────────────────────────────────────────────────────────
select lives_ok(
  format($$ update public.location set partner_notice_md = E'**Malas extras** são cobradas pelo estacionamento.\n\n- Até 2 malas por pessoa\n- [Regras](https://exemplo.com/regras)' where id = %L $$, current_setting('test.loc')),
  'Markdown restrito (negrito, lista, link) entra'
);
select throws_ok(
  format($$ update public.location set partner_notice_md = 'Aviso <b>cru</b>' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'HTML cru é recusado pelo banco'
);
select throws_ok(
  format($$ update public.location set partner_notice_md = '<script>alert(1)</script>' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'script também'
);
select lives_ok(
  format($$ update public.location set partner_notice_md = 'Van a cada 15 min, saída < 20 minutos' where id = %L $$, current_setting('test.loc')),
  '"<" solto (menor que) continua valendo: só tag é recusada'
);
select throws_ok(
  format($$ update public.location set partner_notice_md = repeat('a', 2001) where id = %L $$, current_setting('test.loc')),
  '23514', null, 'acima de 2.000 caracteres é recusado'
);

-- ── quem edita (ADR-005: escopo locations:write) ───────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.gerente'));
select lives_ok(
  format($$ update public.location set partner_notice_md = 'Aviso do gerente' where id = %L $$, current_setting('test.loc')),
  'Gerente (locations:write) edita o aviso'
);
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.operacao'));
-- A policy de UPDATE não casa a linha: o comando passa sem erro e não muda nada.
update public.location set partner_notice_md = 'Aviso da operação' where id = current_setting('test.loc')::uuid;
reset role;
select is(
  (select partner_notice_md from public.location where id = current_setting('test.loc')::uuid),
  'Aviso do gerente', 'Operação (só locations:read) não altera o aviso'
);

select * from finish();
rollback;
