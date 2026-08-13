-- Quatro destinos novos: Maceió (MCZ), Cuiabá (CGB), João Pessoa (JPA) e Londrina (LDB).
--
-- Catálogo de busca + página SEO /destinos/<slug> (ver docs/specs/destinations.md).
-- Nascem publicados e sem lote vinculado, igual REC e NVT: a página renderiza o
-- conteúdo e a lista de estacionamentos aparece quando houver `location` ancorada
-- (location.destination_id) ou lote mapeado (prospect_location).
--
-- `geog` é coluna gerada (STORED) a partir de latitude/longitude, então não se insere.
-- O hero mora em assets-public/destinations/<CODE>/ (convenção de src/lib/storage.ts).
-- sort_order 91..94 ocupa a faixa livre entre POA (90) e REC (95), mantendo o bloco
-- Brasil antes dos destinos de Portugal (LIS 100, FAO 110, OPO 120).

insert into public.destination (
  code, name, short_name, slug, type, city, state, country,
  latitude, longitude, is_popular, sort_order, is_published,
  meta_title, meta_description, intro, hero_image_url
) values
  (
    'MCZ',
    'Aeroporto de Maceió',
    'Maceió (MCZ)',
    'aeroporto-de-maceio',
    'airport',
    'Rio Largo',
    'AL',
    'BR',
    -9.5108,
    -35.7917,
    false,
    91,
    true,
    'Estacionamento no Aeroporto de Maceió (MCZ) | Movepark',
    'Estacionamento perto do Aeroporto de Maceió (MCZ), em Rio Largo. Compare opções com traslado ao terminal e reserve a sua vaga pela Movepark.',
    'O Aeroporto Internacional Zumbi dos Palmares, o MCZ, é a porta de entrada aérea de Alagoas. Fica no município de Rio Largo, a cerca de 22 km do centro de Maceió e da orla de Pajuçara. É operado pela Aena desde 2020 e recebeu cerca de 2,7 milhões de passageiros em 2024, o que o coloca entre os cinco mais movimentados do Nordeste.

Como Maceió é destino de praia o ano inteiro, o movimento sobe muito nas férias, no carnaval e nos feriados prolongados. Quem chega de carro do interior de Alagoas ou de Sergipe costuma preferir deixar o veículo em um estacionamento próximo com traslado ao terminal, em vez de pagar a diária do pátio oficial. Nas datas de pico, reservar antes é o que garante a vaga.',
    'https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/destinations/MCZ/hero-b86f182.webp'
  ),
  (
    'CGB',
    'Aeroporto de Cuiabá',
    'Cuiabá (CGB)',
    'aeroporto-de-cuiaba',
    'airport',
    'Várzea Grande',
    'MT',
    'BR',
    -15.6529,
    -56.1175,
    false,
    92,
    true,
    'Estacionamento no Aeroporto de Cuiabá (CGB) | Movepark',
    'Estacionamento perto do Aeroporto de Cuiabá (CGB), em Várzea Grande. Veja opções com traslado ao terminal e reserve a sua vaga pela Movepark.',
    'O Aeroporto Internacional Marechal Rondon, o CGB, atende Cuiabá e a região metropolitana. Fica em Várzea Grande, do outro lado do rio Cuiabá, a cerca de 8 km do centro da capital, então o trajeto é curto mesmo em horário de pico. É operado pela concessionária Centro-Oeste Airports e movimenta perto de 2,7 milhões de passageiros por ano, o terceiro maior do Centro-Oeste.

Por ser o principal ponto de conexão de Mato Grosso, o CGB recebe muita gente que chega de carro das cidades do agronegócio, como Rondonópolis, Sinop, Sorriso e Primavera do Leste. Para uma viagem de alguns dias, deixar o carro em um estacionamento próximo com traslado ao terminal costuma sair mais barato do que o pátio oficial, e reservar com antecedência garante a vaga.',
    'https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/destinations/CGB/hero-7a9b754.webp'
  ),
  (
    'JPA',
    'Aeroporto de João Pessoa',
    'João Pessoa (JPA)',
    'aeroporto-de-joao-pessoa',
    'airport',
    'Bayeux',
    'PB',
    'BR',
    -7.1483,
    -34.9506,
    false,
    93,
    true,
    'Estacionamento no Aeroporto de João Pessoa (JPA) | Movepark',
    'Estacionamento perto do Aeroporto de João Pessoa (JPA), em Bayeux. Compare opções com traslado ao terminal e reserve a sua vaga pela Movepark.',
    'O Aeroporto Internacional Presidente Castro Pinto, o JPA, atende João Pessoa e o litoral da Paraíba. Fica no município vizinho de Bayeux, a cerca de 11 km do centro da capital e a menos de meia hora das praias de Tambaú e do Cabo Branco. É operado pela Aena desde 2020 e recebeu cerca de 1,9 milhão de passageiros em 2025.

O terminal é compacto e o pátio oficial fica disputado no verão, no carnaval e nas festas de fim de ano, quando o litoral paraibano enche. Quem viaja por alguns dias e chega de carro de Campina Grande ou do interior costuma preferir um estacionamento próximo com traslado ao terminal. Na alta temporada, reservar antes é o que garante a vaga.',
    'https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/destinations/JPA/hero-860c61e.webp'
  ),
  (
    'LDB',
    'Aeroporto de Londrina',
    'Londrina (LDB)',
    'aeroporto-de-londrina',
    'airport',
    'Londrina',
    'PR',
    'BR',
    -23.3303,
    -51.1367,
    false,
    94,
    true,
    'Estacionamento no Aeroporto de Londrina (LDB) | Movepark',
    'Estacionamento perto do Aeroporto de Londrina (LDB), no norte do Paraná. Veja opções com traslado ao terminal e reserve a sua vaga pela Movepark.',
    'O Aeroporto Governador José Richa, o LDB, atende Londrina e o norte do Paraná. Fica dentro da malha urbana, a poucos quilômetros do centro, com acesso rápido de qualquer bairro da cidade. É operado pela CCR Aeroportos desde 2021 e concentra a maior parte dos voos de uma região puxada pelo agronegócio e por um polo universitário e de saúde.

Boa parte de quem embarca em Londrina vem de carro de Maringá, Apucarana, Cambé, Rolândia ou do interior paulista ali perto. Para quem viaja alguns dias, deixar o carro em um estacionamento próximo com traslado ao terminal costuma sair mais barato do que o pátio oficial, e dá para comparar preço e distância antes de reservar.',
    'https://mgaigbezdalbyuqiofcf.supabase.co/storage/v1/object/public/assets-public/destinations/LDB/hero-16c5f5a.webp'
  )
on conflict (slug) do nothing;
