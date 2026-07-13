-- pgTAP: quebra de profiles.full_name em first_name / last_name (migration 20260804000000).
-- Cobre: (1) o helper split_person_name; (2) a coluna gerada full_name (compõe, recompõe no update,
-- vira null quando ambos são null, e não aceita escrita direta); (3) precedência do merge_accounts
-- em first_name/last_name. O trigger de auth.users é gerido pelo Supabase Cloud (não existe no stack
-- local), então a lógica de split dele é coberta pelo helper que ele usa.
-- Roda com: supabase test db (stack local — ver README.md). Transação + rollback.

begin;
select plan(13);

-- ── (1) split_person_name ────────────────────────────────────────────────────
select is((select first_name from public.split_person_name('João da Silva')), 'João',
          'split: primeiro token vira first_name');
select is((select last_name from public.split_person_name('João da Silva')), 'da Silva',
          'split: o resto vira last_name');
select is((select first_name from public.split_person_name('Leonardo')), 'Leonardo',
          'split: nome único vira first_name');
select is((select last_name from public.split_person_name('Leonardo')), null::text,
          'split: nome único deixa last_name null');
select is((select first_name from public.split_person_name('   ')), null::text,
          'split: string em branco → first_name null');
select is((select last_name from public.split_person_name(null)), null::text,
          'split: null → last_name null');

-- ── (2) coluna gerada full_name ──────────────────────────────────────────────
do $$
declare
  u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-gen@ex.com',now(),now());
  insert into public.profiles(id, role, first_name, last_name) values (u,'customer','Maria','Silva');
  perform set_config('test.gen', u::text, true);
end $$;

select is((select full_name from public.profiles where id = current_setting('test.gen')::uuid),
          'Maria Silva', 'full_name gerada compõe first + last');

update public.profiles set last_name = null where id = current_setting('test.gen')::uuid;
select is((select full_name from public.profiles where id = current_setting('test.gen')::uuid),
          'Maria', 'full_name recompõe quando last_name some');

update public.profiles set first_name = null where id = current_setting('test.gen')::uuid;
select is((select full_name from public.profiles where id = current_setting('test.gen')::uuid),
          null::text, 'full_name vira null quando first e last são null');

select throws_ok(
  $$ update public.profiles set full_name = 'Hackeado' where id = current_setting('test.gen')::uuid $$,
  null, null, 'escrever direto na coluna gerada full_name é rejeitado');

-- ── (3) merge_accounts: precedência em first_name/last_name ───────────────────
do $$
declare
  surv uuid := gen_random_uuid();
  lose uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (surv,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-surv@ex.com',now(),now()),
    (lose,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-lose@ex.com',now(),now());
  -- Sobrevivente tem só o first_name; perdedor tem last_name (que o sobrevivente deve herdar).
  insert into public.profiles(id, role, first_name, last_name) values
    (surv,'customer','Ana', null),
    (lose,'customer','Zzz','Prado');
  perform public.merge_accounts(surv, lose);
  perform set_config('test.surv', surv::text, true);
end $$;

select is((select first_name from public.profiles where id = current_setting('test.surv')::uuid),
          'Ana', 'merge: first_name não-nulo do sobrevivente vence');
select is((select last_name from public.profiles where id = current_setting('test.surv')::uuid),
          'Prado', 'merge: last_name nulo do sobrevivente herda do perdedor');
select is((select full_name from public.profiles where id = current_setting('test.surv')::uuid),
          'Ana Prado', 'merge: full_name gerada reflete o resultado');

select * from finish();
rollback;
