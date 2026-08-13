-- Rótulo de SEO do destino: uma fonte única para <title>, H1 e H2.
--
-- Motivo, medido no Search Console (export de 13/08/2026, 3 meses, propriedade
-- sc-domain:movepark.co):
--
--   "estacionamento aeroporto <X>" colado ....... 647 cliques / 50.402 impressões
--   "estacionamento <prep> aeroporto <X>" ....... 177 cliques / 14.061 impressões
--
-- O título antigo ("Estacionamento no Aeroporto de Curitiba") quebrava o bigrama com duas
-- preposições e o H1 ("Estacionamento em Afonso Pena") não trazia a palavra "aeroporto",
-- que aparece em 40,6% dos cliques. O `seo_label` guarda a parte variável já na ordem que
-- as pessoas digitam, e o código monta:
--
--   <title>  Estacionamento {seo_label} | Movepark
--   <h1>     Estacionamento {seo_label}
--   <h2>     Estacionamentos {seo_label}
--
-- A variante secundária (a segunda forma de chamar o mesmo aeroporto) entra separada por
-- vírgula, e só quando tem volume real: pelo menos 15% dos cliques do destino e no mínimo
-- 50 cliques no período. Isso deu CWB (Afonso Pena, 108 cliques), VCP (Campinas, 109) e
-- CNF (Belo Horizonte, 56). Nos demais a segunda forma é ruído e só engorda o título.
--
-- `meta_title` continua existindo e continua ganhando quando preenchido: vira a exceção
-- editorial, não a regra. Por isso ele é zerado aqui, para o padrão valer em todo mundo.

alter table public.destination
  add column if not exists seo_label text;

comment on column public.destination.seo_label is
  'Parte variável do título/H1 de SEO, na ordem de busca (ex: "Aeroporto Curitiba, Afonso Pena (CWB)"). O código prefixa "Estacionamento". Quando nulo, cai para short_name/name.';

update public.destination set seo_label = case code
  when 'BSB'  then 'Aeroporto Brasília (BSB)'
  when 'CGB'  then 'Aeroporto Cuiabá (CGB)'
  when 'CGH'  then 'Aeroporto Congonhas (CGH)'
  when 'CNF'  then 'Aeroporto Confins, Belo Horizonte (CNF)'
  when 'CWB'  then 'Aeroporto Curitiba, Afonso Pena (CWB)'
  when 'FAO'  then 'Aeroporto Faro (FAO)'
  when 'GIG'  then 'Aeroporto Galeão (GIG)'
  when 'GRU'  then 'Aeroporto Guarulhos (GRU)'
  when 'JPA'  then 'Aeroporto João Pessoa (JPA)'
  when 'LDB'  then 'Aeroporto Londrina (LDB)'
  when 'LIS'  then 'Aeroporto Lisboa (LIS)'
  when 'MCZ'  then 'Aeroporto Maceió (MCZ)'
  when 'NVT'  then 'Aeroporto Navegantes (NVT)'
  when 'OPO'  then 'Aeroporto Porto (OPO)'
  when 'POA'  then 'Aeroporto Porto Alegre (POA)'
  when 'REC'  then 'Aeroporto Recife (REC)'
  when 'SDU'  then 'Aeroporto Santos Dumont (SDU)'
  when 'VCP'  then 'Aeroporto Viracopos, Campinas (VCP)'
  -- Destinos que não são aeroporto não recebem a palavra "aeroporto". O Tietê é buscado
  -- como "rodoviária tietê" (2.842 impressões somadas), não como "terminal rodoviário",
  -- que era o texto do título antigo.
  when 'tiete'           then 'Rodoviária Tietê, São Paulo'
  when 'centro-sp'       then 'Centro de São Paulo'
  when 'jardim-paulista' then 'Jardim Paulista, São Paulo'
  when 'nova-iguacu'     then 'Centro de Nova Iguaçu (RJ)'
  else seo_label
end;

-- Zera o título escrito à mão para o padrão acima valer. Quem quiser fugir do padrão
-- volta a preencher `meta_title` no Manager.
update public.destination set meta_title = null;
