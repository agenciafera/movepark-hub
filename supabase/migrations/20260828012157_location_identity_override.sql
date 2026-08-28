-- Identidade legal por unidade: o Aerovalet tem um CNPJ por praça (CGH e Tietê são
-- B.M.L., GRU é L.B.M.), então empresa não é a granularidade da identidade. As colunas
-- são override: quando nulas, vale company.legal_name/company.tax_id.
alter table public.location
  add column legal_name text,
  add column tax_id text;

comment on column public.location.legal_name is
  'Razão social da operação desta unidade, quando difere da empresa. Nula = herda company.legal_name.';
comment on column public.location.tax_id is
  'CNPJ da operação desta unidade, quando difere da empresa. Nulo = herda company.tax_id.';
