-- pgTAP: trava de cobrança por reserva (payment_charge_lock_claim / _release).
-- Regressão da MP-07DAE9 (17/10/2026): dois cliques no cartão viraram duas cobranças aprovadas.
-- Cobre: só uma reivindicação vale por vez, outra reserva não é afetada, soltar exige o token
-- certo, trava vencida pode ser retomada, só service_role executa e ninguém lê a tabela pela API.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(13);

select has_function('public', 'payment_charge_lock_claim', array['uuid', 'integer'], 'claim existe');
select has_function('public', 'payment_charge_lock_release', array['uuid', 'uuid'], 'release existe');
select ok(
  not has_function_privilege('anon', 'public.payment_charge_lock_claim(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.payment_charge_lock_claim(uuid, integer)', 'execute'),
  'cliente não reivindica a trava'
);
select ok(
  not has_function_privilege('anon', 'public.payment_charge_lock_release(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.payment_charge_lock_release(uuid, uuid)', 'execute'),
  'cliente não solta a trava'
);

-- Duas reservas próprias do teste.
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at)
select v.id, v.code, (select id from public.profiles order by created_at limit 1),
       (select id from public.location order by created_at limit 1),
       now() + interval '10 day', now() + interval '12 day'
  from (values ('00000000-0000-4000-8000-00000000c101'::uuid, 'QA-LOCK-1'),
               ('00000000-0000-4000-8000-00000000c102'::uuid, 'QA-LOCK-2')) as v(id, code);

create temp table _t(name text primary key, token uuid);
insert into _t values ('a', public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c101', 120));

select isnt((select token from _t where name = 'a'), null, '1ª cobrança leva a trava');
select is(
  public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c101', 120),
  null,
  '2ª cobrança da mesma reserva, com a 1ª em andamento, não leva (o segundo clique)'
);
select isnt(
  public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c102', 120),
  null,
  'outra reserva não é afetada'
);

select is(
  public.payment_charge_lock_release('00000000-0000-4000-8000-00000000c101', gen_random_uuid()),
  false,
  'token errado não solta a trava de outra chamada'
);
select is(
  public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c101', 120),
  null,
  'continua travada depois do release com token errado'
);
select is(
  public.payment_charge_lock_release('00000000-0000-4000-8000-00000000c101', (select token from _t where name = 'a')),
  true,
  'o dono da trava solta'
);
select isnt(
  public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c101', 120),
  null,
  'depois de soltar, a próxima tentativa (cliente trocou de cartão) leva a trava'
);

-- Trava vencida (Edge morreu sem soltar) é retomada.
update public.payment_charge_lock
   set locked_until = now() - interval '1 second'
 where booking_id = '00000000-0000-4000-8000-00000000c101';
select isnt(
  public.payment_charge_lock_claim('00000000-0000-4000-8000-00000000c101', 120),
  null,
  'trava vencida é retomada'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_charge_lock'::regclass)
  and not has_table_privilege('authenticated', 'public.payment_charge_lock', 'select')
  and not has_table_privilege('anon', 'public.payment_charge_lock', 'select'),
  'RLS ligada e ninguém lê a tabela pela API'
);

select * from finish();
rollback;
