-- Comodidade nova no catálogo: máquina de snacks e bebidas.
--
-- Várias unidades têm uma máquina de autoatendimento na recepção, e hoje não há
-- onde registrar isso: o parceiro que oferece o benefício aparece igual ao que
-- não oferece. `amenity` é catálogo fechado (só hub_admin escreve, e a RPC
-- `operator_set_location_amenities` recusa código fora dele), então incluir a
-- linha aqui é o que habilita o parceiro a marcar a caixinha e a busca a filtrar.
--
-- Categoria `extras`: é conveniência de quem espera, junto de banheiro, Wi-Fi e
-- área de espera. `sort_order` 35 encaixa depois de `lounge` (30) sem renumerar
-- o resto do grupo.
--
-- Ícone: `Coffee`, que existe com o mesmo nome no lucide e no Phosphor, então não
-- precisa de entrada nova em `src/lib/icon-aliases.ts`. Nenhuma das duas
-- bibliotecas tem ícone de máquina de venda.

insert into public.amenity (code, name, description, icon, category, sort_order)
values (
  'vending_machine',
  'Máquina de snacks e bebidas',
  'Snacks e bebidas à venda no local',
  'Coffee',
  'extras',
  35
)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  category    = excluded.category,
  sort_order  = excluded.sort_order;
