-- Concorrente na página de destino: 3 a 5 por praça, vindos do Google Places.
--
-- A página de destino já tinha a seção de lote mapeado (ADR-010), mas 14 dos 26 destinos
-- exibiam ZERO concorrente e outros 4 exibiam um ou dois: a comparação que a página promete
-- só existia onde alguém tinha mapeado à mão. Sem concorrente a página vira vitrine da
-- Movepark, e é justamente a comparação que faz uma IA citar a página e o leitor confiar nela.
--
-- Duas fontes, nesta ordem:
--   1. Os 24 lotes que já estavam cadastrados como RASCUNHO com endereço, mapeados na
--      curadoria do WordPress e nunca publicados.
--   2. 76 lotes novos, buscados no Google Places (searchText) num raio de 12 km do
--      aeroporto e 1,5 km dos destinos urbanos, filtrados por `types` conter "parking" e
--      por status operacional. Inclui Lisboa, Porto e Faro, que tinham a lista vazia.
--
-- A curadoria do nome foi manual, entrada por entrada: a extração automática produzia
-- "Estacionamento", "Cgb", "Uber (Bolsão)" e endereço no lugar de marca. Ficaram de fora
-- locadora, hotel, estacionamento de universidade, bolsão de aplicativo, o próprio aeroporto
-- (que o Places devolve porque tem pátio) e qualquer nome que não identifique um negócio.
-- Também ficou de fora a Moveparking de Nova Iguaçu, que é parceira e não concorrente.
-- Em Lisboa e Faro ficaram de fora Airpark, Redpark e Skypark pelo mesmo motivo: o Places
-- devolve os três, mas os três são parceiros da Movepark e já têm ficha própria.
--
-- `data_source = 'google_places'` e `google_place_id` preenchidos: a deduplicação futura é
-- por place_id (D-009) e a nota do Google entra pelo snapshot que a página já lê.
--
-- Três praças ficam abaixo de 3, e não é falha da busca. Em Maceió e João Pessoa o Places
-- devolve só o pátio da Estapar; o resto é locadora ou shopping longe dali. Teresina fica com
-- dois: o pátio oficial que a busca trouxe já era a ficha "Smartpark Teresina" que estava em
-- rascunho, mesmo place_id, e o `on conflict` deduplicou. Fica registrado para o time decidir
-- entre pesquisa de campo ou aceitar a lista curta.
--
-- Ver docs/specs/lote-mapeado-vitrine.md e docs/specs/destinations.md.

-- 1. Os rascunhos que já estavam prontos passam a aparecer.
update public.prospect_location
set is_published = true
where not is_published and address is not null and converted_at is null;

-- 2. Os lotes novos.
with novo(destino, marca, slug, public_slug, endereco, lat, lng, place_id, maps) as (values
  ('aeroporto-brasilia', 'Vagas BRB', 'vagas-brb-aeroporto-brasilia', 'vagas-brb', 'Aeroporto de Brasília - Lago Sul, Brasília - DF, 71608-900, Brasil', -15.86971, -47.9220938, 'ChIJ6fzVDv0vWpMRj7CKRy1JFzg', 'https://maps.google.com/?cid=4041779649410936975'),
  ('aeroporto-brasilia', 'Estapar', 'estapar-aeroporto-brasilia', 'estapar', 'Area Especial, S/N - Lago Sul, Brasília - DF, 71608-900, Brasil', -15.8713725, -47.9224891, 'ChIJ6VU_kH0vWpMRg_w36Aku60k', 'https://maps.google.com/?cid=5326401604381310083'),
  ('aeroporto-brasilia', 'VS Park', 'vs-park-aeroporto-brasilia', 'vs-park', 'SHCS EQS 414/415 BL A - Asa Sul, Brasília - DF, 70297-400, Brasil', -15.835513100000002, -47.9163249, 'ChIJ6w59yao6WpMRa0uF3HahKUs', 'https://maps.google.com/?cid=5416037558767668075'),
  ('aeroporto-campo-grande', 'Duque', 'duque-aeroporto-campo-grande', 'duque', 'Rua Ceasa, 70 - Santo Antonio, Campo Grande - MS, 79102-270, Brasil', -20.4566595, -54.6657096, 'ChIJKUWwGFjnhpQRxKYpQROS_Nw', 'https://maps.google.com/?cid=15923762993870513860'),
  ('aeroporto-campo-grande', 'CGR Park', 'cgr-park-aeroporto-campo-grande', 'cgr-park', 'Av. Duque de Caxias, 4198 - Jardim Ima, Campo Grande - MS, 79102-270, Brasil', -20.4560085, -54.666810999999996, 'ChIJry21neLmhpQRSeeR7WRHNWw', 'https://maps.google.com/?cid=7797216828669945673'),
  ('aeroporto-campo-grande', 'Titos', 'titos-aeroporto-campo-grande', 'titos', 'R. dos Guaranís, 96 - Jardim Petropolis, Campo Grande - MS, 79102-070, Brasil', -20.4549505, -54.6673927, 'ChIJpwtSoR3nhpQRbsDSi7Gia04', 'https://maps.google.com/?cid=5650789040905175150'),
  ('aeroporto-cuiaba', 'Aeropark Várzea Grande', 'aeropark-varzea-grande-aeroporto-cuiaba', 'aeropark-varzea-grande', 'Av. João Ponce de Arruda, 1034 - Jardim Aeroporto, Várzea Grande - MT, 78110-375, Brasil', -15.6507949, -56.1221939, 'ChIJta-NfNytnZMRTrqhJP4GJRw', 'https://maps.google.com/?cid=2028034895806315086'),
  ('aeroporto-cuiaba', 'GJ Park', 'gj-park-aeroporto-cuiaba', 'gj-park', 'Av. João Ponce de Arruda, s/n - Jangada, MT, 78110-000, Brasil', -15.650281999999999, -56.1225418, 'ChIJY1D1awGunZMRp4lIewrxeNQ', 'https://maps.google.com/?cid=15310251960566319527'),
  ('aeroporto-florianopolis', 'Oficial do Aeroporto', 'oficial-do-aeroporto-aeroporto-florianopolis', 'oficial-do-aeroporto', 'Rod. Ac. ao Aeroporto - Base Aérea, Florianópolis - SC, 88047-902, Brasil', -27.6762494, -48.545266399999996, 'ChIJS-ZZ1MQ7J5URZKwEMFb2kTI', 'https://maps.google.com/?cid=3643964423552674916'),
  ('aeroporto-florianopolis', 'Garagem Floripa', 'garagem-floripa-aeroporto-florianopolis', 'garagem-floripa', 'R. Antônio Domingos de Souza, 30 - Carianos, Florianópolis - SC, 88047-585, Brasil', -27.663252699999997, -48.54354740000001, 'ChIJ2cmGRDM7J5URJvtXG9u-cuI', 'https://maps.google.com/?cid=16317314248182594342'),
  ('aeroporto-fortaleza', 'Level One', 'level-one-aeroporto-fortaleza', 'level-one', 'R. João Facundo Lopes, 68 - Dias Macêdo, Fortaleza - CE, 60860-070, Brasil', -3.782969, -38.517173199999995, 'ChIJZUKAsCJPxwcRmKIBTgOiajU', 'https://maps.google.com/?cid=3849066966618841752'),
  ('aeroporto-galeao', 'Estapar Terminal 2', 'estapar-terminal-2-aeroporto-galeao', 'estapar-terminal-2', 'Av. Vinte de Janeiro, S/N - Galeão, Rio de Janeiro - RJ, 21941-900, Brasil', -22.8137652, -43.245393799999995, 'ChIJSx7KWol5mQARWRZD5K-6vrg', 'https://maps.google.com/?cid=13312282813165409881'),
  ('aeroporto-goiania', 'MJR', 'mjr-aeroporto-goiania', 'mjr', 'Rua Marabás 568 - Esq - Alameda Aeroporto, Q. 27A - L. 22 - Jardim Guanabara, Goiânia - GO, 74675-840, Brasil', -16.6242423, -49.2186563, 'ChIJeUC2K3bzXpMRYIc9uQznBfI', 'https://maps.google.com/?cid=17439599173895554912'),
  ('aeroporto-goiania', 'Atalaia', 'atalaia-aeroporto-goiania', 'atalaia', 'R. Belo Horizonte, Quadra 31 - Lote 10 - Jardim Guanabara, Goiânia - GO, 74675-080, Brasil', -16.6239331, -49.2199327, 'ChIJq-tjxovyXpMRjDYYICsDUps', 'https://maps.google.com/?cid=11192011507726038668'),
  ('aeroporto-goiania', 'DR Park', 'dr-park-aeroporto-goiania', 'dr-park', 'Alameda Aeroporto, Qd. 51 - Lt. 1 - Jardim Guanabara, Goiânia - GO, 74675-020, Brasil', -16.6245463, -49.216837, 'ChIJPZv8zJjzXpMRRckIFcWUiBM', 'https://maps.google.com/?cid=1407538457735645509'),
  ('aeroporto-goiania', 'Karlog Parking', 'karlog-parking-aeroporto-goiania', 'karlog-parking', 'Alameda Aeroporto Q 1, 1685 - Jardim Guanabara, Goiânia - GO, 74675-020, Brasil', -16.6248418, -49.2151597, 'ChIJAzNIzhvzXpMRcMZsS1Cgh8g', 'https://maps.google.com/?cid=14449694196164773488'),
  ('aeroporto-joao-pessoa', 'Estapar', 'estapar-aeroporto-joao-pessoa', 'estapar', 'Aeroporto Internacional Presidente Castro Pinto S/N - Aeroporto, Bayeux - PB, 58308-901, Brasil', -7.145053700000001, -34.9478471, 'ChIJlVlt-NLorAcROMucuMMfkMs', 'https://maps.google.com/?cid=14668258911822072632'),
  ('aeroporto-londrina', 'Estapar', 'estapar-aeroporto-londrina', 'estapar', 'R. Ten. João Maurício Medeiros, 71 - San Conrado, Londrina - PR, 86039-100, Brasil', -23.3283323, -51.136808099999996, 'ChIJC77Og6BD65QR_n8Obwnh0ws', 'https://maps.google.com/?cid=852272185137332222'),
  ('aeroporto-londrina', 'Royal Park', 'royal-park-aeroporto-londrina', 'royal-park', 'R. Mato Grosso, 407 - Centro, Londrina - PR, 86010-180, Brasil', -23.3122971, -51.1563498, 'ChIJRRUUSWBD65QRJnbvVjIwvp8', 'https://maps.google.com/?cid=11510690690370598438'),
  ('aeroporto-londrina', 'Leste Oeste', 'leste-oeste-aeroporto-londrina', 'leste-oeste', 'Av. Arcebispo Dom Geraldo Fernandes, 1170 - Centro, Londrina - PR, 86026-720, Brasil', -23.3074935, -51.159587699999996, 'ChIJAQBA8qFE65QRrbr9N9B7UiM', 'https://maps.google.com/?cid=2545232873640540845'),
  ('aeroporto-londrina', 'Central Park', 'central-park-aeroporto-londrina', 'central-park', 'R. Pernambuco, 143 - Centro, Londrina - PR, 86020-120, Brasil', -23.3093282, -51.1626866, 'ChIJ9dhPR6FE65QRzeNez5t6Qyw', 'https://maps.google.com/?cid=3189527770726065101'),
  ('aeroporto-londrina', 'Estacenter', 'estacenter-aeroporto-londrina', 'estacenter', 'Av. Ayrton Senna da Silva, 500 - Palhano 1, Londrina - PR, 86050-460, Brasil', -23.329703199999997, -51.1778438, 'ChIJS7JmTUtD65QRd-UBIyrbNEI', 'https://maps.google.com/?cid=4770678879314634103'),
  ('aeroporto-maceio', 'Estapar', 'estapar-aeroporto-maceio', 'estapar', 'Rodovia BR 104, Km 91 - S/N, Maceió - AL, 57100-971, Brasil', -9.516233999999999, -35.7927266, 'ChIJ9Z20LDY3AQcRBUB2EyUwZ3E', 'https://maps.google.com/?cid=8171552984685494277'),
  ('aeroporto-navegantes', 'Zunino', 'zunino-aeroporto-navegantes', 'zunino', 'Centro - R. Alice Hostim, 74 - São Domingos, Navegantes - SC, 88375-000, Brasil', -26.8819457, -48.6503875, 'ChIJ_59gfjDM2JQRFSLT3kiEvCw', 'https://maps.google.com/?cid=3223596881801323029'),
  ('aeroporto-navegantes', 'Econo Park', 'econo-park-aeroporto-navegantes', 'econo-park', 'R. Ver. Osmar Inacio da Silva, 471 - Centro, Navegantes - SC, 88370-240, Brasil', -26.8828186, -48.6500475, 'ChIJXQubJ7vN2JQRsjf7xk7LmV4', 'https://maps.google.com/?cid=6816703050208196530'),
  ('aeroporto-navegantes', 'Litoral', 'litoral-aeroporto-navegantes', 'litoral', 'R. Ver. Nereu Liberato Nunes, 1511 - Centro, Navegantes - SC, 88370-232, Brasil', -26.8831511, -48.6513377, 'ChIJc6QWGVXN2JQRnw2sUGjpRi8', 'https://maps.google.com/?cid=3406666802391682463'),
  ('aeroporto-navegantes', 'Park Sul', 'park-sul-aeroporto-navegantes', 'park-sul', 'R. Osmar Gaya, 765 - Meia Praia, Navegantes - SC, 88370-208, Brasil', -26.880412099999997, -48.6479508, 'ChIJua0T7S_M2JQRjClzaZq0IHk', 'https://maps.google.com/?cid=8728174653131139468'),
  ('aeroporto-navegantes', 'Estapar', 'estapar-aeroporto-navegantes', 'estapar', 'R. Manoel Leopoldo Rocha, 470 - Meia Praia, Navegantes - SC, 88375-000, Brasil', -26.8811976, -48.6491117, 'ChIJ5Tro6dLN2JQROx88V5s3VCc', 'https://maps.google.com/?cid=2833951205845901115'),
  ('aeroporto-porto-alegre', 'Indústrias Park', 'industrias-park-aeroporto-porto-alegre', 'industrias-park', 'Av. das Indústrias, 1132 - Anchieta, Porto Alegre - RS, 90200-290, Brasil', -29.987175599999997, -51.1678522, 'ChIJh57OIbl3GZURZ5xWf21Dwy8', 'https://maps.google.com/?cid=3441668677808069735'),
  ('aeroporto-porto-alegre', 'Estapar Off Site', 'estapar-off-site-aeroporto-porto-alegre', 'estapar-off-site', 'Av. dos Estados, 747 - Anchieta, Porto Alegre - RS, 90200-001, Brasil', -29.9871667, -51.174935999999995, 'ChIJ50n0l7t3GZURDgAIRqqDlgE', 'https://maps.google.com/?cid=114423607887134734'),
  ('aeroporto-recife', 'Estapar', 'estapar-aeroporto-recife', 'estapar', 'Praça Min. Salgado Filho, S/N - Imbiribeira, Recife - PE, 51210-010, Brasil', -8.1310167, -34.9167451, 'ChIJERxwTzceqwcR-Fm5Af9ZPQU', 'https://maps.google.com/?cid=377556895549446648'),
  ('aeroporto-recife', 'Auto Park', 'auto-park-aeroporto-recife', 'auto-park', 'R. Prof. Aloísio Pessoa de Araújo, 75 - Boa Viagem, Recife - PE, 51021-410, Brasil', -8.1291102, -34.901309999999995, 'ChIJ0cr7_8kfqwcRaJCwUuSx5gw', 'https://maps.google.com/?cid=929625967296548968'),
  ('aeroporto-salvador', 'Estapar', 'estapar-aeroporto-salvador', 'estapar', 'Pr. Gago Coutinho, S/N - Aeroporto, Salvador - BA, 41520-970, Brasil', -12.9137208, -38.336659999999995, 'ChIJRer56jUWFgcRzBJgp7m-7K0', 'https://maps.google.com/?cid=12532601567651566284'),
  ('aeroporto-santos-dumont', 'Estapar', 'estapar-aeroporto-santos-dumont', 'estapar', 'Av. Alm. Silvio de Noronha, 365 - Centro, Rio de Janeiro - RJ, 20021-340, Brasil', -22.9147918, -43.1661906, 'ChIJJdOZDN2BmQARMCwR3stkzlA', 'https://maps.google.com/?cid=5822702195003436080'),
  ('aeroporto-santos-dumont', 'BHPark', 'bhpark-aeroporto-santos-dumont', 'bhpark', 'Aeroporto Santos Dumont, 110 - Centro, Rio de Janeiro - RJ, 20021-340, Brasil', -22.913705999999998, -43.1674953, 'ChIJbxTYXdyBmQAR4Ajc3UQMKWc', 'https://maps.google.com/?cid=7433486149871208672'),
  ('aeroporto-santos-dumont', 'Base Santos Dumont', 'base-santos-dumont-aeroporto-santos-dumont', 'base-santos-dumont', 'R. Jardel Jércolis, 291 - Glória, Rio de Janeiro - RJ, 20021-150, Brasil', -22.913443599999997, -43.1708069, 'ChIJMw3Wp12BmQARcdfrL3OZuIs', 'https://maps.google.com/?cid=10067965686991017841'),
  ('aeroporto-santos-dumont', 'PareBem', 'parebem-aeroporto-santos-dumont', 'parebem', 'Av. Pres. Wilson, 231 - Centro, Rio de Janeiro - RJ, 20030-021, Brasil', -22.910226299999998, -43.1726226, 'ChIJZcMCpZiBmQARGc56fPIV974', 'https://maps.google.com/?cid=13760491317668531737'),
  ('aeroporto-santos-dumont', 'Beira Mar Park', 'beira-mar-park-aeroporto-santos-dumont', 'beira-mar-park', 'Av. Beira Mar, s/n - Centro, Rio de Janeiro - RJ, 20021-060, Brasil', -22.9127893, -43.17348810000001, 'ChIJAaMe9O6BmQARvO_bcJZU55M', 'https://maps.google.com/?cid=10657580048310857660'),
  ('aeroporto-viracopos', 'Aero Viracopos', 'aero-viracopos-aeroporto-viracopos', 'aero-viracopos', 'Av. Desembarque - Jardim Aeroporto de Campinas, Campinas - SP, 13055, Brasil', -23.009882899999997, -47.1467794, 'ChIJSdfrDu61yJQRWkp8ypzsWKE', 'https://maps.google.com/?cid=11626302596213131866'),
  ('aeroporto-viracopos', 'Pórtico', 'portico-aeroporto-viracopos', 'portico', 'Av. José Amgarten - Cidade Singer, Campinas - SP, 13053-090, Brasil', -23.021483399999997, -47.130391599999996, 'ChIJrz5S2WnLyJQRfXy67WrOKOg', 'https://maps.google.com/?cid=16728847774517984381'),
  ('aeroporto-viracopos', 'Viracopos Aeroparking', 'viracopos-aeroparking-aeroporto-viracopos', 'viracopos-aeroparking', 'R. Alaíde Macedo da Silva, 442 - Jardim Nova America, Campinas - SP, 13053-040, Brasil', -23.0031009, -47.1108173, 'ChIJN4Q6UkfKyJQR64bcY_-mNMY', 'https://maps.google.com/?cid=14282223934120953579'),
  ('aeroporto-viracopos', 'Eco22', 'eco22-aeroporto-viracopos', 'eco22', 'Av. Embarque, 290 - Jardim Chapadão, Campinas - SP, 13070-051, Brasil', -23.009895, -47.144644899999996, 'ChIJL1c7IvK1yJQR4Kl_IAZxISo', 'https://maps.google.com/?cid=3035831894953404896'),
  ('aeroporto-vitoria', 'Perim', 'perim-aeroporto-vitoria', 'perim', 'Mata da Praia, Vitória - ES, 29062-585, Brasil', -20.273874, -40.2941985, 'ChIJyVtfBRoYuAARFws3usbfIUs', 'https://maps.google.com/?cid=5413854271696734999'),
  ('aeroporto-vitoria', 'Estapar', 'estapar-aeroporto-vitoria', 'estapar', 'Rod. BR-101 Norte - Carapina, Serra - ES, 29176-798, Brasil', -20.237858199999998, -40.278655799999996, 'ChIJK2aM8pIZuAAR77DIi4HePlI', 'https://maps.google.com/?cid=5926418807643484399'),
  ('aeroporto-vitoria', 'Athena Park', 'athena-park-aeroporto-vitoria', 'athena-park', 'Av. Des. Dermeval Lyrio, 75 - Mata da Praia, Vitória - ES, 29065-340, Brasil', -20.2939008, -40.3041014, 'ChIJ21-sjOMXuAARMMns7xuU3oM', 'https://maps.google.com/?cid=9502195111508625712'),
  ('aeroporto-vitoria', 'Vitória Airport', 'vitoria-airport-aeroporto-vitoria', 'vitoria-airport', 'Av. Roza Helena Schorling Albuquerque, 856 - Aeroporto, Vitória - ES, 29075-685, Brasil', -20.266725299999997, -40.284260499999995, 'ChIJZaU6tyEZuAARqVs4Q3fV2CA', 'https://maps.google.com/?cid=2366876312388787113'),
  ('centro-de-nova-iguacu', 'Guarcar', 'guarcar-centro-de-nova-iguacu', 'guarcar', 'R. Otávio Tarquino, 220 - Centro, Nova Iguaçu - RJ, 26210-172, Brasil', -22.758242000000003, -43.4500057, 'ChIJ15R7swBnmQARu_XSArQ6EA4', 'https://maps.google.com/?cid=1013374460974265787'),
  ('centro-de-nova-iguacu', 'Keep Car', 'keep-car-centro-de-nova-iguacu', 'keep-car', 'R. Cel. Francisco Soares, 112 - Centro, Nova Iguaçu - RJ, 26220-032, Brasil', -22.760917799999998, -43.4465297, 'ChIJMau5tAFnmQAR-XdgZKsxpQs', 'https://maps.google.com/?cid=839131517767677945'),
  ('centro-de-nova-iguacu', 'Céu Aberto', 'ceu-aberto-centro-de-nova-iguacu', 'ceu-aberto', 'Av. Mal. Floriano Peixoto, 2494 - Centro, Nova Iguaçu - RJ, 26220-060, Brasil', -22.758344899999997, -43.454662, 'ChIJg6owKwZnmQAR4aE62NJUQLA', 'https://maps.google.com/?cid=12700244213732385249'),
  ('centro-de-nova-iguacu', 'Nanau', 'nanau-centro-de-nova-iguacu', 'nanau', 'Av. Mal. Floriano Peixoto, 1410 - Centro, Nova Iguaçu - RJ, 26220-060, Brasil', -22.762509899999998, -43.44506, 'ChIJKQYeIf5mmQARoR0EutAlZjY', 'https://maps.google.com/?cid=3919862104076852641'),
  ('centro-de-sao-paulo', 'Invictus Park', 'invictus-park-centro-de-sao-paulo', 'invictus-park', 'Praça da Sé, 242 - Centro Histórico de São Paulo, São Paulo - SP, 01001-000, Brasil', -23.5510593, -46.6347169, 'ChIJ7_C8xmdZzpQR0uq1Lt2ydUM', 'https://maps.google.com/?cid=4860988035857509074'),
  ('centro-de-sao-paulo', 'G70 Park', 'g70-park-centro-de-sao-paulo', 'g70-park', 'R. Roberto Simonsen, 70 - Sé, São Paulo - SP, 01017-020, Brasil', -23.5492047, -46.632053299999995, 'ChIJ841FpqZZzpQRDeQqNev0XvA', 'https://maps.google.com/?cid=17320550507960001549'),
  ('centro-de-sao-paulo', 'Albuquerque', 'albuquerque-centro-de-sao-paulo', 'albuquerque', 'Rua Quintino Bocaiúva 261, Centro - Praça Dr. João Mendes - Sé, São Paulo - SP, 01004-010, Brasil', -23.5509773, -46.6353016, 'ChIJCyJIBW9ZzpQRaTIAFQ7HTlw', 'https://maps.google.com/?cid=6651472562968605289'),
  ('centro-de-sao-paulo', 'Estapar', 'estapar-centro-de-sao-paulo', 'estapar', 'Praça Dr. João Mendes, 24 - Centro Histórico de São Paulo, São Paulo - SP, 01501-000, Brasil', -23.5513853, -46.6354804, 'ChIJY0fnyatZzpQRWUbJuBzvZL0', 'https://maps.google.com/?cid=13647295677477766745'),
  ('jardim-paulista', 'BrasilPark Pamplona', 'brasilpark-pamplona-jardim-paulista', 'brasilpark-pamplona', 'R. Pamplona, 1704 - Jardim Paulista, São Paulo - SP, 01405-002, Brasil', -23.5707175, -46.6611936, 'ChIJFV58SdtZzpQRI6jlktobw8s', 'https://maps.google.com/?cid=14682609835739293731'),
  ('jardim-paulista', 'Festa & Park', 'festa-park-jardim-paulista', 'festa-park', 'R. Guarará, 511 - Jardim Paulista, São Paulo - SP, 01425-001, Brasil', -23.5715187, -46.660179299999996, 'ChIJX_iwX8NZzpQRhRi8hhc-X9g', 'https://maps.google.com/?cid=15591248705745590405'),
  ('jardim-paulista', 'Facility Pamplona', 'facility-pamplona-jardim-paulista', 'facility-pamplona', 'Av. Nove de Julho, 3597 - Jardins, São Paulo - SP, 01407-000, Brasil', -23.570756, -46.6623842, 'ChIJD5r8rKNZzpQRROo68lH5wk4', 'https://maps.google.com/?cid=5675372610791860804'),
  ('jardim-paulista', 'GarageInn Paulista Star', 'garageinn-paulista-star-jardim-paulista', 'garageinn-paulista-star', 'Alameda Campinas, 1070 - Jardim Paulista, São Paulo - SP, 01404-001, Brasil', -23.5697026, -46.657132999999995, 'ChIJl1aDbMRZzpQRuqQu3aZJN30', 'https://maps.google.com/?cid=9022761359484298426'),
  ('jardim-paulista', 'AVR Estacione', 'avr-estacione-jardim-paulista', 'avr-estacione', 'Alameda Lorena, 1014 - Cerqueira César, São Paulo - SP, 01424-001, Brasil', -23.5669832, -46.6619701, 'ChIJU0qbcdBZzpQRitpjOlp2lVA', 'https://maps.google.com/?cid=5806677424462879370'),
  ('rodoviaria-tiete', 'Bandeira Park Santana', 'bandeira-park-santana-rodoviaria-tiete', 'bandeira-park-santana', 'R. Voluntários da Pátria, 654 - Santana, São Paulo - SP, 02010-000, Brasil', -23.514579599999998, -46.6261544, 'ChIJSxhoH51ZzpQR4u2A1d4p3sg', 'https://maps.google.com/?cid=14474052289456827874'),
  ('rodoviaria-tiete', 'Metrô Tietê', 'metro-tiete-rodoviaria-tiete', 'metro-tiete', 'Rua Marechal Odylio Denys, 138 - Metrô Tietê, São Paulo - SP, 01142-300, Brasil', -23.5172857, -46.626726999999995, 'ChIJfQTpp4hYzpQRYpVseovtADY', 'https://maps.google.com/?cid=3891371261358282082'),
  ('rodoviaria-tiete', 'Garagem do Terminal', 'garagem-do-terminal-rodoviaria-tiete', 'garagem-do-terminal', 'R. Maria Prestes Maia, 213 - Vila Guilherme, São Paulo - SP, 02047-000, Brasil', -23.5174216, -46.622990699999995, 'ChIJmafmG5BYzpQRm6sj9If6Bts', 'https://maps.google.com/?cid=15782577405989989275'),
  ('aeroporto-lisboa', 'EasyParking', 'easyparking-aeroporto-lisboa', 'easyparking', 'R. Francisco Salgado Zenha 8, 2685-332 Prior Velho, Portugal', 38.7873217, -9.128182599999999, 'ChIJpaNHD3IyGQ0Rh1fURx4kk2Y', 'https://maps.google.com/?cid=7391291125917833095'),
  ('aeroporto-lisboa', 'Aeroportoparque', 'aeroportoparque-aeroporto-lisboa', 'aeroportoparque', 'R. Francisco Sousa Tavares 3, 2685-754 Prior Velho, Portugal', 38.78793100000001, -9.1248908, 'ChIJjaWbmXIyGQ0RwfH28njRuwU', 'https://maps.google.com/?cid=413154108237083073'),
  ('aeroporto-lisboa', 'Park and Trip', 'park-and-trip-aeroporto-lisboa', 'park-and-trip', 'R. Particular, 2680-128 Camarate, Portugal', 38.802538999999996, -9.124423799999999, 'ChIJGf4UPmMzGQ0Rmh4Sx4FePa4', 'https://maps.google.com/?cid=12555295247662456474'),
  ('aeroporto-porto', 'IZI Park', 'izi-park-aeroporto-porto', 'izi-park', 'R. de Paiço 417, 4455-178 Lavra, Portugal', 41.2504249, -8.6869012, 'ChIJWaq0jpZpJA0R_PA4F6u9bQ4', 'https://maps.google.com/?cid=1039695631519117564'),
  ('aeroporto-porto', 'Flypark', 'flypark-aeroporto-porto', 'flypark', 'Av. Mário Brito 5542 4455, 4455-494 Perafita, Portugal', 41.2327516, -8.6718843, 'ChIJfyhsROhpJA0RwL03YU7ysKc', 'https://maps.google.com/?cid=12083424218687454656'),
  ('aeroporto-porto', 'Top Parking', 'top-parking-aeroporto-porto', 'top-parking', 'R. do Barreiro 467, 4470-573 Moreira, Portugal', 41.2327546, -8.666513, 'ChIJ24CNAQBpJA0R5OElBoRpODQ', 'https://maps.google.com/?cid=3762873504427794916'),
  ('aeroporto-porto', 'Boeingpark', 'boeingpark-aeroporto-porto', 'boeingpark', 'R. da Estrada 479 LOTE 3, 4465-679 Maia, Portugal', 41.2340643, -8.6616884, 'ChIJqeT4AohpJA0RVrm5ggbhhRI', 'https://maps.google.com/?cid=1334720282664483158'),
  ('aeroporto-porto', 'Deluxe Park', 'deluxe-park-aeroporto-porto', 'deluxe-park', 'R. Cidres 1570, 4455-442 Perafita, Portugal', 41.2240244, -8.6788223, 'ChIJFdAj4Q5pJA0RXRvBYsLjpP4', 'https://maps.google.com/?cid=18349041205834226525'),
  ('aeroporto-faro', 'Your Park', 'your-park-aeroporto-faro', 'your-park', 'R. Dom Antonio Pereira da Silva 15, 8005-207 Faro, Portugal', 37.0220266, -7.9623977, 'ChIJL8dplbVNBQ0R3GY5uFZdFaM', 'https://maps.google.com/?cid=11751401429732517596'),
  ('aeroporto-faro', 'Park and Travel', 'park-and-travel-aeroporto-faro', 'park-and-travel', 'R. Prof. Dr. Egas Moniz 60, 8005-277 Faro, Portugal', 37.0273981, -7.963159399999999, 'ChIJKQ4NWjtNBQ0RXNUQrX32els', 'https://maps.google.com/?cid=6591852024245048668'),
  ('aeroporto-faro', 'Park and Fly', 'park-and-fly-aeroporto-faro', 'park-and-fly', 'N125 520 A, 8005-412 São Pedro, Portugal', 37.056169, -7.958812999999999, 'ChIJQ5ra5GGtGg0RyjVEFPdodgg', 'https://maps.google.com/?cid=609790209961506250'),
  ('aeroporto-lisboa', 'JetPark', 'jetpark-aeroporto-lisboa', 'jetpark', 'Av. Severiano Falcão 22, 2685-378 Prior Velho, Portugal', 38.7899921, -9.1248843, 'ChIJX-_bXQ0yGQ0ReZgU6EhFGho', 'https://maps.google.com/?cid=1880891973814229113'),
  ('aeroporto-lisboa', 'Check-in Park', 'check-in-park-aeroporto-lisboa', 'check-in-park', 'R. das Oliveiras, 2680-178 Camarate, Portugal', 38.7950279, -9.1389932, 'ChIJMWy5JjUzGQ0R7rI3CaljI_k', 'https://maps.google.com/?cid=17952302117284197102'),
  ('aeroporto-faro', 'Oficial do Aeroporto', 'oficial-do-aeroporto-aeroporto-faro', 'oficial-do-aeroporto', 'Aeroporto Internacional Gago Coutinho, Faro, 8006-901 Faro, Portugal', 37.021435, -7.967114, 'ChIJ1x3ft0RNBQ0Rl20g9T8_rks', 'https://maps.google.com/?cid=5453365742720282007')
)
insert into public.prospect_location
  (destination_id, name, slug, public_slug, public_name, address, latitude, longitude,
   google_place_id, google_maps_url, data_source, is_published)
select d.id, n.marca, n.slug, n.public_slug,
       public.unit_public_name(n.marca, d.id),
       n.endereco, n.lat, n.lng, n.place_id, n.maps, 'google_places', true
from novo n
join public.destination d on d.public_slug = n.destino
on conflict (google_place_id) do nothing;
