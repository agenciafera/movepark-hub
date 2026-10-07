-- Apaga as flags has_pcd_config e has_passenger_quantity de location (07/10/2026).
--
-- Vieram do backoffice legado (config da `category`) e só serviam para o card de reserva da página
-- da unidade repetir duas perguntas que o passo 2 do checkout já faz para toda unidade
-- (passageiros no transfer e assistência especial, gravados em booking.passenger_count e
-- booking.has_pcd, que continuam). Nenhuma tela do Hub editava as flags, e só a BePark tinha as
-- duas ligadas, sem ninguém saber por quê.
--
-- Antes de apagar foi conferido no banco vivo: nenhuma função, view, matview ou policy cita as
-- colunas, e pg_stat_statements só mostrava o select da página da unidade, que saiu do front no
-- mesmo commit e foi ao ar antes desta migration ser aplicada.

alter table public.location
  drop column if exists has_pcd_config,
  drop column if exists has_passenger_quantity;
