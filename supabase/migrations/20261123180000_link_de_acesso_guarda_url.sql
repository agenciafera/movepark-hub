-- Link de acesso ao Recebimento: o Manager precisa copiar a URL de novo depois de gerar
-- (23/09/2026, pedido do Kallef). Guardar só o hash obrigava a gerar outro link a cada vez.
-- O segredo fica na linha, legível só por hub_admin (policy de select) e pelo service_role;
-- anon e o próprio dono não enxergam a tabela. O hash continua sendo o que o resgate compara.
alter table public.company_access_link add column if not exists token_secret text;
comment on column public.company_access_link.token_secret is
  'Segredo do link, para o Manager copiar a URL de novo. Só hub_admin lê (RLS).';
