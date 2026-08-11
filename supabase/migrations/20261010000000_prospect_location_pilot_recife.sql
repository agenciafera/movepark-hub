-- E0.17-c · o piloto: Talentos Park, no Aeroporto do Recife.
--
-- Uma linha, uma tabela. Antes desta entidade, o mesmo cadastro exigiria empresa →
-- unidade → tipo de vaga, três entidades e 64 colunas para guardar dez fatos sobre um
-- lote que só precisa aparecer numa página de destino.
--
-- Recife é o destino certo para o piloto: acabou de ser criado e tem ZERO unidades
-- vendáveis, então não há parceiro pagante para canibalizar enquanto a seção nova é
-- validada.
--
-- Por que um piloto antes do volume: carregar 41 de uma vez sem ter validado um é como
-- se descobre, em produção, que faltou um campo. Se este renderiza certo na página do
-- Recife e não tem nenhum caminho para reserva, o resto é repetição.
--
-- Procedência dos dados: Places API (Text Search) em 11/08/2026, com viés de 2 km na geo
-- da spec. O CID devolvido bate com o da spec (4598899734266939223), o que confirma que
-- é o mesmo lugar. `address`, `phone` e `google_place_id` foram RESOLVIDOS, não chutados:
-- deixar nulo é informação, preencher errado é dívida.
--
--   place_id  ChIJyRH1jmMfqwcRV4eeOvGS0j8
--   endereço  R. Projetada, 169 - Boa Viagem, Recife - PE, 51150-650
--   telefone  +55 81 98692-9632   (guardado e não exibido, Q-021)
--   status    OPERATIONAL
--
-- Três decisões de gravação:
--   * `name` é 'Talentos Park', não o "Talentos Park Aeroporto - Estacionamento" do
--     Google. O nome de exibição é copy nossa, e a página já diz onde fica e o que é.
--   * `google_maps_url` guarda a forma com CID, que é estável e não expira, e não a URL
--     que a API devolve com parâmetro de rastreio da consulta.
--   * `phone` em E.164, que é o formato que o OTP da reivindicação (E0.17-g) vai usar.
--     Formatar para leitura humana é trabalho de tela.
--
-- `is_published` fica FALSE: a ficha nasce rascunho e só é publicada depois de revisada,
-- e publicar antes de existir a seção da página de destino (E0.17-d) não mostraria nada
-- a ninguém. O hábito é o que protege quando forem dezenas.
--
-- `description` fica nula de propósito. O texto tem que ser escrito por nós, factual:
-- copiar o marketing do site do lote é obra protegida (Lei 9.610/98) e duplicate content
-- ao mesmo tempo, e é o que o WordPress faz hoje.
--
-- Lookup por `code = 'REC'` em vez do uuid cravado: o destino não existe no seed local,
-- então no stack do CI isto é um no-op silencioso em vez de uma FK quebrada.
-- ⚠️ Nunca mapear lote em Viracopos: vale zero e ofende o dono de ~80% da receita.

insert into public.prospect_location (
  destination_id,
  name,
  slug,
  address,
  phone,
  latitude,
  longitude,
  google_place_id,
  google_maps_url,
  data_source,
  is_published
)
select
  d.id,
  'Talentos Park',
  'talentos-park-aeroporto-recife',
  'R. Projetada, 169 - Boa Viagem, Recife - PE, 51150-650',
  '+5581986929632',
  -8.1309368,
  -34.9156297,
  'ChIJyRH1jmMfqwcRV4eeOvGS0j8',
  'https://maps.google.com/?cid=4598899734266939223',
  'google_places',
  false
from public.destination d
where d.code = 'REC'
on conflict (slug) do nothing;
