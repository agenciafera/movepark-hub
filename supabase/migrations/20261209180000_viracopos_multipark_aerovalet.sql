-- Viracopos: MultiPark e Aerovalet entram na página do destino. Conferido em 27/11/2026.
--
-- A migration 20261209150000 deixou as duas de fora por dividirem o pátio do Bandeira Park
-- (R. Antônio Luchiari, 1100). A decisão foi revista: são marcas diferentes, com site próprio,
-- reserva própria e tabela própria, e quem busca pela marca precisa achar a marca. Fica uma linha
-- por marca, com a mesma coordenada do Bandeira.
--
-- Preço: o site de cada uma encaminha a reserva para o mesmo sistema (xpark), que devolve o total
-- por período. Cotado para entrada em 01/12/2026 às 12h, vaga descoberta:
--
--   MultiPark   1 = R$ 24,99   7 = R$ 125,93   15 = R$ 233,87   30 = R$ 323,82  (coberta R$ 37,49)
--               O site multipark.com.br anuncia "R$ 24,99 por dia" e "R$ 13,31 a partir da 7ª
--               diária"; o segundo número não aparece na reserva e não entra.
--   Aerovalet   1 = R$ 18,49   7 = R$ 93,18    15 = R$ 173,06   30 = R$ 239,62
--               O site aerovalet.com.br publica a tabela por dia (18,49 / 13,31 / 10,18 / 7,98),
--               e o total da reserva bate com ela.
--
-- A Aerovalet é parceira Movepark em Guarulhos, Congonhas e Tietê, mas a unidade de Viracopos não
-- faz parte do contrato (não há `location` dela aqui), então entra como lote mapeado (ADR-010).
--
-- A FAQ "quanto custa" ganha as duas linhas e a nota de que as três marcas dividem o pátio, com
-- trava de md5. Idempotente: insert com `on conflict (slug) do nothing`.

do $vcp$
declare
  v_dest uuid;
begin
  select id into v_dest from public.destination where slug = 'aeroporto-de-viracopos';
  -- Guarda de replay: o banco do CI não tem o acervo.
  if v_dest is null then
    raise notice 'viracopos: destino ausente, nada a fazer';
    return;
  end if;

  insert into public.prospect_location (
    destination_id, name, slug, public_slug, public_name, address, latitude, longitude,
    data_source, is_published,
    researched_daily_brl, researched_weekly_brl, researched_biweekly_brl, researched_monthly_brl,
    researched_at, research_source, last_reviewed_at
  ) values
  (v_dest, 'MultiPark Viracopos', 'multipark-viracopos', 'multipark',
   'MultiPark - Estacionamento Aeroporto Viracopos',
   'R. Antônio Luchiari, 1100 - Distrito Industrial, Campinas - SP, 13054-700',
   -22.991637, -47.1119593, 'manual', true,
   24.99, 125.93, 233.87, 323.82, date '2026-11-27',
   'Sistema de reserva para onde o site multipark.com.br encaminha (xpark), consultado em 27/11/2026 para entrada em 01/12/2026, vaga descoberta: 1 = R$ 24,99, 7 = R$ 125,93, 15 = R$ 233,87, 30 = R$ 323,82; coberta R$ 37,49 a diária. No balcão, R$ 29,99 por dia (site). Mesmo pátio do Bandeira Park e da Aerovalet.',
   now()),
  (v_dest, 'Aerovalet Viracopos', 'aerovalet-viracopos', 'aerovalet',
   'Aerovalet - Estacionamento Aeroporto Viracopos',
   'R. Antônio Luchiari, 1100 - Distrito Industrial, Campinas - SP, 13030-150',
   -22.991637, -47.1119593, 'manual', true,
   18.49, 93.18, 173.06, 239.62, date '2026-11-27',
   'Site aerovalet.com.br (tabela por dia: R$ 18,49 em 1 dia, R$ 13,31 em 7, R$ 10,18 em 17, R$ 7,98 em 30) e o sistema de reserva para onde ele encaminha (xpark), consultado em 27/11/2026 para entrada em 01/12/2026, vaga descoberta: 1 = R$ 18,49, 7 = R$ 93,18, 15 = R$ 173,06, 30 = R$ 239,62. A unidade de Viracopos não faz parte do contrato da Aerovalet com a Movepark. Mesmo pátio do Bandeira Park e da MultiPark.',
   now())
  on conflict (slug) do nothing;
end
$vcp$;

-- FAQ "quanto custa" de Viracopos: entram Aerovalet e MultiPark.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Viracopos (VCP):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Virapark (parceiro Movepark)** | R$ 40,00 | Vaga coberta com traslado 24h; R$ 29,90 por dia a partir de 7 diárias |
| **Garageinn (parceiro Movepark)** | R$ 59,99 | A 979 m do terminal, preço fechado na reserva online |
| Ouro Park | R$ 13,99 | Descoberta, self park, mesma diária em qualquer duração; a coberta sai R$ 25,99 |
| Bandeira Park | R$ 18,49 | Descoberta com reserva online; a diária cai para R$ 13,31 a partir de 7 dias |
| Aerovalet Viracopos | R$ 18,49 | Descoberta com reserva online; 30 diárias por R$ 239,62 |
| MultiPark Viracopos | R$ 24,99 | Descoberta com reserva online; 7 diárias por R$ 125,93 e coberta a R$ 37,49 |
| Yellow Parking | R$ 24,99 | Descoberta; de 13 a 17 diárias, R$ 260,00 fechados |
| Viracopos Aeroparking | R$ 29,70 | Descoberta com reserva online; no local, R$ 33,00 |
| Estacionamento oficial (Estapar) | R$ 31,00 | Bolsão econômico F, descoberto; o edifício garagem sai R$ 83,00 |
| BR Parking | R$ 40,00 | Só vaga coberta, com reserva online; no local, R$ 45,00 |

Os valores dos estacionamentos sem reserva online vêm do site de cada um e do sistema de reserva para onde ele encaminha, conferidos entre 26 e 27 de novembro de 2026, e podem mudar sem aviso. Bandeira Park, Aerovalet e MultiPark dividem o mesmo pátio, na R. Antônio Luchiari, 1100, e cada marca cobra a sua tabela. O Ouro Park ocupa o endereço onde funcionava o KM64. Quatro pátios do entorno (JF Parking, Aero Viracopos, Pórtico e Eco22) não divulgam tarifa em canal nenhum, por isso não aparecem com número. O preço do parceiro Movepark sai do motor de reservas e fica sempre atualizado na [tabela de preços de Viracopos](/estacionamentos/aeroporto-viracopos/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Viracopos](/estacionamentos/aeroporto-viracopos).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-viracopos'
  and scope = 'destination'
  and md5(body_md) = '1e737e349d75fae31c2d2126c9bbf895';
