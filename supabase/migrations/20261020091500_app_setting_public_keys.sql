-- Prova social na home: número de clientes atendidos, editável sem deploy.
--
-- O `app_setting` guarda config sensível (remetente de e-mail, recebedor master
-- do split, política de parcelamento). Abrir a tabela inteira para `anon` só
-- para publicar um número na home entregaria tudo isso junto, então a leitura
-- pública é por chave marcada, não por tabela.
--
-- `is_public` nasce `false`: chave nova continua privada até alguém decidir o
-- contrário, e o default protege quem adicionar config depois sem ler isto.

alter table public.app_setting
  add column if not exists is_public boolean not null default false;

comment on column public.app_setting.is_public is
  'Quando true, a chave é legível por anon (site do consumidor). Escrita segue só de hub_admin.';

-- Leitura pública, restrita às chaves marcadas. A policy é só de SELECT: a
-- escrita continua no `app_setting_admin_all`, que exige hub_admin. `anon` tem
-- GRANT na tabela mas nenhuma policy de escrita, então segue sem escrever.
drop policy if exists app_setting_public_read on public.app_setting;
create policy app_setting_public_read on public.app_setting
  for select
  to anon, authenticated
  using (is_public);

-- Total de clientes atendidos na base do white label. Guardado cru, em número
-- inteiro, porque a formatação ("300 mil") é decisão de UI e muda sem migration.
insert into public.app_setting (key, value, is_public)
values ('social_proof_customers', '300000', true)
on conflict (key) do update set is_public = true;
