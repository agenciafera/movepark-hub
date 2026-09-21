-- E3.3: cupom de plataforma, teto, audiência e carteira.
--
-- O que estes casos protegem, e que uma leitura do código não garante:
--   1. o TETO do percentual, que é o que impede a campanha bancada pela Movepark de sangrar;
--   2. a AUDIÊNCIA, que decide quem ganha desconto e portanto quanto a campanha custa;
--   3. a PRECEDÊNCIA empresa > plataforma, que resolve código repetido;
--   4. o gate do ADR-009, que é regra de banco e não de tela;
--   5. os grants dos ajudantes internos, que vazariam histórico de terceiro se afrouxarem.

begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
create temporary table t_ids (k text primary key, v uuid);

insert into t_ids (k, v)
select 'loc_hub', l.id from public.location l
where l.checkout_mode = 'hub' and l.deleted_at is null limit 1;

insert into t_ids (k, v)
select 'company_hub', l.company_id from public.location l
join t_ids t on t.k = 'loc_hub' and t.v = l.id;

-- Perfil sem nenhuma reserva paga: é o "primeira compra" do teste. Nasce aqui, e não de um
-- `select ... limit 1` sobre o seed: no stack limpo do CI não havia perfil sem compra, a linha não
-- entrava em t_ids e toda avaliação com audiência caía em `login_required`.
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'cupom-perfil-novo@ex.com',now(),now());
  -- O perfil nasce por gatilho junto com auth.users; o insert cobre o stack sem o gatilho.
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  insert into t_ids (k, v) values ('perfil_novo', u);
end $$;

-- Unidade externa própria. Virar a `loc_hub` do seed com um update não serve: o pré-voo do
-- checkout externo (location_checkout_mode_guard) cobra o white-label da empresa e o mapa das
-- vagas, e a unidade do seed não tem nenhum dos dois. Com a empresa configurada e sem vaga ativa
-- a unidade já nasce externa, que é o mesmo caminho da fixture de external_exit_click.
do $$
declare v_co uuid; v_loc uuid;
begin
  insert into public.company(name, slug, wl_public_domain, wl_domain, wl_tenant_key, wl_sync_enabled)
    values ('Cupom Parceiro Externo','cupom-parceiro-externo',
            'https://cupom-externo.movepark.co/','cupom-externo-app.movepark.co','cupomexterno', false)
    returning id into v_co;
  insert into public.location(company_id, name, slug, checkout_mode)
    values (v_co, 'Cupom Unidade Externa','cupom-unidade-externa','external')
    returning id into v_loc;
  insert into t_ids (k, v) values ('loc_external', v_loc);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select col_is_null('public', 'coupon', 'company_id',
  'coupon.company_id aceita NULL: é isso que permite cupom da Movepark');

select has_table('public', 'coupon_wallet', 'a carteira de cupom resgatado existe');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'coupon' and policyname = 'catalog_read_coupon'),
  0,
  'catalog_read_coupon saiu: ela expunha todo código ativo para anon');

-- ---------------------------------------------------------------------------
-- 2. As quatro campanhas entraram como cupom de plataforma
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.coupon
   where company_id is null and funded_by = 'platform'
     and code in ('BEMVINDO30','SEGUNDA15','VOLTA20','LONGA25')),
  4,
  'as quatro campanhas de lançamento existem e são bancadas pela Movepark');

select is(
  (select count(*)::int from public.coupon
   where company_id is null and discount_type = 'percent' and max_discount_amount is null),
  0,
  'nenhum cupom percentual de plataforma sem teto: sem teto a Movepark paga a diferença');

-- ---------------------------------------------------------------------------
-- 3. Teto do percentual
-- ---------------------------------------------------------------------------
select is(
  (select e.discount from t_ids t, lateral public.coupon_evaluate(
     'BEMVINDO30', t.v, (select v from t_ids where k = 'perfil_novo'), 100, 3, null) e
   where t.k = 'loc_hub'),
  30.00::numeric,
  'abaixo do teto, o percentual sai cheio (30% de 100)');

select is(
  (select e.discount from t_ids t, lateral public.coupon_evaluate(
     'BEMVINDO30', t.v, (select v from t_ids where k = 'perfil_novo'), 500, 3, null) e
   where t.k = 'loc_hub'),
  40.00::numeric,
  'acima do teto, o desconto para em R$ 40 (e não nos R$ 150 do percentual)');

-- ---------------------------------------------------------------------------
-- 4. Audiência
-- ---------------------------------------------------------------------------
select is(
  (select e.error_code from t_ids t, lateral public.coupon_evaluate(
     'SEGUNDA15', t.v, (select v from t_ids where k = 'perfil_novo'), 100, 3, null) e
   where t.k = 'loc_hub'),
  'not_second_purchase',
  'quem nunca comprou não pega o cupom de segunda reserva');

select is(
  (select e.error_code from t_ids t, lateral public.coupon_evaluate(
     'VOLTA20', t.v, (select v from t_ids where k = 'perfil_novo'), 100, 3, null) e
   where t.k = 'loc_hub'),
  'not_winback',
  'quem nunca comprou não é winback: winback exige ter sumido, não nunca ter vindo');

select is(
  (select e.error_code from t_ids t, lateral public.coupon_evaluate(
     'BEMVINDO30', t.v, null, 100, 3, null) e
   where t.k = 'loc_hub'),
  'login_required',
  'audiência sem sessão é recusada: senão bastava sair da conta para ser "primeira compra" de novo');

select is(
  (select e.error_code from t_ids t, lateral public.coupon_evaluate(
     'LONGA25', t.v, (select v from t_ids where k = 'perfil_novo'), 300, 3, null) e
   where t.k = 'loc_hub'),
  'min_days',
  'LONGA25 exige 7 diárias');

select is(
  (select e.discount from t_ids t, lateral public.coupon_evaluate(
     'LONGA25', t.v, (select v from t_ids where k = 'perfil_novo'), 700, 7, null) e
   where t.k = 'loc_hub'),
  25.00::numeric,
  'com 7 diárias, LONGA25 aplica os R$ 25');

-- ---------------------------------------------------------------------------
-- 5. ADR-009: unidade externa não promete cupom
-- ---------------------------------------------------------------------------
select is(
  (select e.error_code from t_ids t, lateral public.coupon_evaluate(
     'LONGA25', t.v, (select v from t_ids where k = 'perfil_novo'), 700, 7, null) e
   where t.k = 'loc_external'),
  'not_available_here',
  'unidade com checkout_mode=external recusa cupom no BANCO, não só na tela');

-- ---------------------------------------------------------------------------
-- 6. Precedência: cupom da empresa vence o de plataforma com o mesmo código
-- ---------------------------------------------------------------------------
insert into public.coupon (company_id, code, discount_type, discount_value, is_active)
select t.v, 'LONGA25', 'fixed', 99, true from t_ids t where t.k = 'company_hub';

select is(
  (select e.discount from t_ids t, lateral public.coupon_evaluate(
     'LONGA25', t.v, (select v from t_ids where k = 'perfil_novo'), 700, 7, null) e
   where t.k = 'loc_hub'),
  99.00::numeric,
  'com o mesmo código nos dois escopos, o cupom da empresa vence (o mais específico ganha)');

-- ---------------------------------------------------------------------------
-- 7. Constraints que protegem a configuração
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.coupon (company_id, code, discount_type, discount_value, max_discount_amount, is_active)
    values (null, 'TETO_EM_FIXO', 'fixed', 10, 5, true)$$,
  '23514',
  null,
  'teto só existe em percentual: em valor fixo o próprio valor já é o limite');

select throws_ok(
  $$insert into public.coupon (company_id, code, discount_type, discount_value, audience, is_active)
    values (null, 'WINBACK_SEM_PRAZO', 'fixed', 10, 'winback', true)$$,
  '23514',
  null,
  'winback sem audience_inactive_days é recusado: a régua não pode ficar implícita');

-- ---------------------------------------------------------------------------
-- 8. Ajudantes internos continuam fechados
-- ---------------------------------------------------------------------------
-- `coupon_evaluate` recebe p_profile_id do CHAMADOR: aberto a anon, dava para passar o id de outra
-- pessoa e ler do erro se ela tem 0, 1 ou mais reservas pagas.
select ok(
  not has_function_privilege('anon', 'public.coupon_evaluate(text,uuid,uuid,numeric,integer,uuid)', 'execute'),
  'anon não executa coupon_evaluate');

select ok(
  not has_function_privilege('authenticated', 'public.coupon_customer_stats(uuid)', 'execute'),
  'authenticated não executa coupon_customer_stats (o Supabase concede por padrão; foi revogado)');

select ok(
  has_function_privilege('authenticated', 'public.customer_coupon_wallet(uuid,timestamptz,timestamptz,uuid)', 'execute'),
  'a carteira em si é chamável pelo cliente logado');

-- ---------------------------------------------------------------------------
-- 9. Gestão da campanha (Manager)
-- ---------------------------------------------------------------------------
-- Sem JWT, `is_hub_admin()` é falso. As duas RPCs de gestão precisam recusar, e não cair no
-- update: um gate que só existe na tela deixaria qualquer `authenticated` pausar campanha.
select throws_ok(
  $$select public.manager_set_platform_coupon_active(
      (select id from public.coupon where code = 'BEMVINDO30'), false)$$,
  '42501',
  null,
  'pausar campanha sem ser hub_admin é recusado');

-- 19 argumentos desde 20260918231159 (entrou `p_is_advertised`). Com a assinatura velha o erro era
-- 42883 (função não existe), que também "recusa" mas não prova o gate.
select throws_ok(
  $$select public.manager_upsert_platform_coupon(
      null, 'QUALQUER', null, null, null, 'fixed', 10, null, 'public', null,
      null, null, null, null, null, null, true, false, 0)$$,
  '42501',
  null,
  'criar campanha sem ser hub_admin é recusado');

-- A campanha segue ativa: a recusa não pode ter passado pelo update antes de levantar.
select is(
  (select is_active from public.coupon where code = 'BEMVINDO30'),
  true,
  'a recusa acontece ANTES do update, não depois');

-- ---------------------------------------------------------------------------
-- 10. Vitrine de campanhas
-- ---------------------------------------------------------------------------
-- O guard de capacidade saiu da lista em 20260918234249 (a página deixou de ser linkada para o
-- cliente). O que sobra para proteger: a vitrine mostra toda campanha anunciada e vigente, e
-- `honored_by_units` segue no payload, porque é ele que diz se a página pode voltar a ser pública
-- sem ferir o ADR-009.

select ok(
  has_function_privilege('anon', 'public.public_coupon_offers()', 'execute'),
  'anônimo executa a vitrine: a página existe justamente para quem não tem conta');

select cmp_ok(
  (select count(*)::int from public.coupon where company_id is null and is_advertised),
  '>', 0,
  'há campanha anunciada no catálogo');

select is(
  jsonb_array_length(public.public_coupon_offers() -> 'offers'),
  (select count(*)::int from public.coupon c
   where c.company_id is null and c.is_advertised and c.is_active
     and (c.valid_from is null or c.valid_from <= now())
     and (c.valid_until is null or c.valid_until >= now())
     and (c.max_uses is null or c.times_used < c.max_uses)),
  'a vitrine mostra toda campanha de plataforma anunciada e vigente, e só elas');

select is(
  jsonb_typeof(public.public_coupon_offers() -> 'honored_by_units'),
  'number',
  'honored_by_units continua no payload: é o sinal que autoriza religar a página ao cliente');

-- Cupom de parceiro não pode virar cartaz da Movepark.
select throws_ok(
  $$update public.coupon set is_advertised = true
    where company_id is not null$$,
  '23514',
  null,
  'cupom de parceiro não entra na vitrine da plataforma');

select * from finish();
rollback;
