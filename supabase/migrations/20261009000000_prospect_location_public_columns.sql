-- Q-021 · E0.17: o telefone do lote mapeado é guardado, não exibido.
--
-- Decidido em 11/08/2026. O número entra no banco porque é a prova de titularidade mais
-- barata que existe para a reivindicação (E0.17-g é OTP no telefone mapeado), e NÃO
-- aparece na página nem no JSON-LD, pela mesma razão que a single não linka o site do
-- lote: quem liga direto vira cliente dele de graça, e a venda dos 20% morre ali.
--
-- Só que "não exibir" no React não é permissão. A RLS de `prospect_location` devolve a
-- LINHA INTEIRA quando a ficha está publicada, então bastava um
-- `GET /rest/v1/prospect_location?select=*` com a anon key (que vai embutida no bundle do
-- front) para ler o telefone que a tela não mostra. RLS corta por linha; quem corta por
-- coluna é o grant.
--
-- A partir daqui a leitura pública da tabela é EXATAMENTE o que a página de destino
-- renderiza. Todo o resto (telefone, place_id, estado da campanha B2B, procedência da
-- conversão) só é alcançável por `service_role` ou por função `SECURITY DEFINER`, ou
-- seja, exige um ato deliberado de quem escreve a RPC. Mesmo espírito do ADR-009: o que
-- não deve aparecer não fica dependendo de alguém lembrar de escondê-lo no layout.
--
-- Duas consequências, as duas de propósito:
--   1. `select=*` como `anon` passa a falhar com "permission denied for column". O
--      caminho público é a RPC do E0.17-d, não a tabela crua.
--   2. `authenticated` cai junto. Não dá para separar hub_admin de cliente logado por
--      grant de coluna (é o mesmo papel do Postgres; quem separa os dois é a RLS, que é
--      por linha). Então o painel do E0.17-h lê o telefone por RPC `SECURITY DEFINER`
--      gateada em `is_hub_admin()`, no molde de `manager_external_exit_clicks`, e não
--      por PostgREST direto. Escrita não muda: INSERT e UPDATE seguem por RLS.

revoke select on public.prospect_location from anon, authenticated;

-- O que a página de destino mostra, mais as duas colunas que os filtros precisam
-- (`is_published`, `converted_at`): no Postgres, filtrar por uma coluna também exige
-- SELECT nela, então tirá-las daqui quebraria a consulta em vez de protegê-la.
grant select (
  id,
  destination_id,
  name,
  slug,
  address,
  latitude,
  longitude,
  geog,
  google_maps_url,
  amenities,
  description,
  is_published,
  converted_at
) on public.prospect_location to anon, authenticated;

comment on column public.prospect_location.phone is
  'Telefone do lote. Guardado, NUNCA exibido (Q-021, 11/08/2026): serve de prova de titularidade no OTP da reivindicação (E0.17-g). Sem SELECT para anon/authenticated, por grant de coluna. Exibir exige decisão nova, não um select a mais.';
