begin;
select plan(3);

-- A função existe
select has_function('public', 'booking_attribution', ARRAY['timestamptz', 'timestamptz'],
  'booking_attribution(timestamptz, timestamptz) existe');

-- anon não executa (revoke do public)
select function_privs_are(
  'public', 'booking_attribution', ARRAY['timestamptz', 'timestamptz'], 'anon', ARRAY[]::text[],
  'anon não tem EXECUTE em booking_attribution'
);

-- Sem ser hub_admin (auth.uid nulo no contexto de teste) → 42501
select throws_ok(
  $$ select public.booking_attribution(now() - interval '30 days', now()) $$,
  '42501',
  null,
  'usuário sem ser hub_admin é barrado'
);

select * from finish();
rollback;
