-- Complemento / ponto de referência do endereço da unidade.
--
-- O Google Places devolve o endereço formatado (rua, número, bairro, cidade, UF)
-- e as coordenadas, mas NÃO sabe do complemento operacional ("entrada pela rua
-- lateral", "bloco B", "portão dos fundos"). Esse texto livre é do parceiro.
-- O endereço em si continua na coluna `address` (string formatada do Places) +
-- lat/lng; aqui só entra o complemento, opcional.

alter table public.location
  add column if not exists address_complement text;

comment on column public.location.address_complement is
  'Complemento/ponto de referência do endereço, informado pelo parceiro (o Places não fornece). Opcional.';
