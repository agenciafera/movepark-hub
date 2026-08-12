-- A descrição do tipo Valet carregava um travessão, proibido em texto do projeto (CLAUDE.md).
--
-- "Operação valet — manobrista recebe e entrega o veículo" aparece na single da unidade, logo
-- abaixo da contagem de vagas, então é texto que o cliente lê. Dois-pontos diz a mesma coisa.
--
-- A linha veio do seed do catálogo (`20260525143531_seed_parking_type_catalog`), então o
-- `supabase/seed.sql` foi corrigido no mesmo commit. Aqui o UPDATE existe para o banco VIVO, que
-- não roda seed; no stack local ele é no-op, porque migration roda antes do seed e a tabela ainda
-- está vazia.
update public.parking_type
set description = 'Operação valet: manobrista recebe e entrega o veículo'
where code = 'valet'
  and description = 'Operação valet — manobrista recebe e entrega o veículo';
