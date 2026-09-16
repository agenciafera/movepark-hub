-- pgTAP: rascunho explícito (`location.is_draft`, 16/09/2026). Rascunho nunca é listado pelos
-- gatilhos, marcar deslista na hora, desmarcar devolve o comportamento normal.
-- Transação com rollback.

begin;
select plan(7);

select has_column('public', 'location', 'is_draft', 'location.is_draft existe');
select col_default_is('public', 'location', 'is_draft', 'false', 'nasce fora do rascunho');

do $$
declare cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug, status, onboarding_status)
    values (cid, 'Draft Empresa', 'draft-empresa', 'active', 'active');
  -- Recebedor ativo: a empresa PODE receber, então o gate listaria sozinho.
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_draft', 'active');
  -- Nasce como rascunho, com foto e ativa: tudo que o gate quer, menos a permissão.
  insert into public.location(id, company_id, name, slug, status, photos, is_draft)
    values (loc, cid, 'Draft Unidade', 'draft-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, true);
  perform set_config('test.loc', loc::text, false);
end $$;

select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false,
  'rascunho com foto, ativa e empresa apta continua NÃO listada');

-- update de photos/status (o que o formulário grava) não relista
update public.location set photos = photos, status = 'active' where id = current_setting('test.loc')::uuid;
select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false,
  'salvar o formulário (update de photos/status) não relista um rascunho');

-- desmarcar o rascunho: o gate volta a listar
update public.location set is_draft = false where id = current_setting('test.loc')::uuid;
select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), true,
  'sair do rascunho lista de novo (foto + ativa + empresa apta)');

-- marcar de novo deslista na hora
update public.location set is_draft = true where id = current_setting('test.loc')::uuid;
select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false,
  'marcar rascunho deslista na hora');

-- recebedor ficando ativo também não lista rascunho
update public.payout_recipient set status = 'pending' where company_id = (select company_id from public.location where id = current_setting('test.loc')::uuid);
update public.payout_recipient set status = 'active'  where company_id = (select company_id from public.location where id = current_setting('test.loc')::uuid);
select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false,
  'recebedor virando ativo não lista rascunho');

select * from finish();
rollback;
