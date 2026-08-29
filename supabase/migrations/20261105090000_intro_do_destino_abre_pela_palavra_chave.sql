-- A página de destino passa a abrir pela consulta que ela responde.
--
-- As 26 intros abriam com um parágrafo enciclopédico sobre o aeroporto ("O Aeroporto
-- Internacional de Viracopos, o VCP, fica em Campinas...") e nenhuma citava "estacionamento"
-- nos primeiros 200 caracteres. O título, o H1 e os H2 já falavam "Estacionamento Aeroporto
-- Viracopos"; o corpo respondia outra pergunta, e o primeiro parágrafo é onde o leitor (e o
-- extrator de IA) decide do que a página trata. Medido em 29/08/2026 no HTML publicado do
-- VCP: 1.991 palavras visíveis e a frase exata aparecendo 4 vezes, nenhuma delas na abertura.
--
-- O que muda: entra um parágrafo de abertura com a palavra-chave na primeira frase, dizendo o
-- que a página entrega, e o fecho genérico ("Nesta página você conhece melhor o aeroporto e a
-- região atendida pela Movepark") vira uma frase que também carrega o termo. O miolo factual
-- de cada aeroporto fica intacto: é pesquisa boa e é o que sustenta a página depois da
-- abertura.
--
-- A abertura não promete condição de transação (ADR-009). Ela fala do que a PÁGINA tem
-- (preço, distância, tipo de vaga), não do que a reserva garante, porque na mesma lista
-- convivem unidade que fecha no Hub e lote que nem vende reserva online.
--
-- Ver docs/specs/destinations.md e src/lib/seo.ts.

with texto(slug, abertura, fecho) as (values

('aeroporto-guarulhos',
 'Estacionamento no Aeroporto Guarulhos: esta página reúne as opções da região por preço da diária, distância até o terminal e tipo de vaga, das que aceitam reserva online às que só recebem na hora. São 25 km até o centro de São Paulo, e a viagem costuma deixar o carro parado por dias.',
 'Abaixo estão os estacionamentos Aeroporto Guarulhos que a Movepark acompanha, com endereço, distância medida até o terminal e o preço de quem fecha reserva online.'),

('aeroporto-viracopos',
 'Estacionamento no Aeroporto Viracopos: esta página compara as opções perto do VCP por preço da diária, distância até o terminal e tipo de vaga. Quem sai de Campinas ou da Grande São Paulo costuma chegar de carro, e o pátio oficial raramente é a conta mais barata para uma viagem de alguns dias.',
 'Os estacionamentos Aeroporto Viracopos da lista abaixo trazem endereço, distância até o terminal e preço fechado quando a unidade aceita reserva online.'),

('aeroporto-congonhas',
 'Estacionamento no Aeroporto Congonhas: aqui você compara as opções da zona sul de São Paulo por preço da diária, distância até o terminal e tipo de vaga. Como o aeroporto fica dentro da cidade, a diferença entre um lote e outro costuma ser de poucos minutos de carro.',
 'A lista abaixo traz os estacionamentos Aeroporto Congonhas com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-curitiba',
 'Estacionamento no Aeroporto Curitiba: esta página compara as opções perto do Afonso Pena por preço da diária, distância até o terminal e tipo de vaga. O aeroporto fica em São José dos Pinhais, e a meia hora de trajeto pesa na conta de quem pensa em ir e voltar de carro no dia da viagem.',
 'Abaixo estão os estacionamentos Aeroporto Curitiba com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-confins',
 'Estacionamento no Aeroporto Confins: esta página compara as opções da região por preço da diária, distância até o terminal e tipo de vaga. São 40 km entre o centro de Belo Horizonte e o CNF, e é essa distância que faz a maioria escolher deixar o carro perto do aeroporto.',
 'A lista abaixo tem os estacionamentos Aeroporto Confins com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-galeao',
 'Estacionamento no Aeroporto Galeão: esta página compara as opções da Ilha do Governador e do entorno por preço da diária, distância até o terminal e tipo de vaga. Como o GIG concentra voo internacional, a estadia costuma passar de uma semana, e aí a diária do pátio oficial pesa.',
 'Abaixo estão os estacionamentos Aeroporto Galeão com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-santos-dumont',
 'Estacionamento no Aeroporto Santos Dumont: esta página compara as opções do centro do Rio por preço da diária, distância até o terminal e tipo de vaga. O SDU fica à beira da Baía de Guanabara, dentro da área central, e quem chega de carro disputa vaga com o movimento do bairro.',
 'A lista abaixo traz os estacionamentos Aeroporto Santos Dumont com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-porto-alegre',
 'Estacionamento no Aeroporto Porto Alegre: esta página compara as opções perto do Salgado Filho por preço da diária, distância até o terminal e tipo de vaga. O aeroporto fica a menos de 10 km do centro, e boa parte de quem embarca chega dirigindo.',
 'Abaixo estão os estacionamentos Aeroporto Porto Alegre com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-recife',
 'Estacionamento no Aeroporto Recife: esta página compara as opções da região por preço da diária, distância até o terminal e tipo de vaga. O REC recebe muita viagem longa, e é nesse tipo de estadia que a diária do pátio oficial vira o maior gasto antes do embarque.',
 'A lista abaixo tem os estacionamentos Aeroporto Recife com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-salvador',
 'Estacionamento no Aeroporto Salvador: esta página compara as opções da região por preço da diária, distância até o terminal e tipo de vaga. São cerca de 28 km até o centro, distância que costuma decidir entre voltar de carro ou deixar o carro parado perto do aeroporto.',
 'Abaixo estão os estacionamentos Aeroporto Salvador com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-fortaleza',
 'Estacionamento no Aeroporto Fortaleza: esta página compara as opções perto do Pinto Martins por preço da diária, distância até o terminal e tipo de vaga. Na alta temporada a vaga fica disputada, e reservar antes é o que evita rodar atrás de lugar com a mala no carro.',
 'A lista abaixo traz os estacionamentos Aeroporto Fortaleza com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-brasilia',
 'Estacionamento no Aeroporto Brasília: esta página compara as opções perto do BSB por preço da diária, distância até o terminal e tipo de vaga. Viagem de trabalho de três ou quatro dias já é o suficiente para a diária do pátio oficial passar do preço de um lote vizinho.',
 'Abaixo estão os estacionamentos Aeroporto Brasília com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-florianopolis',
 'Estacionamento no Aeroporto Florianópolis: esta página compara as opções do sul da ilha por preço da diária, distância até o terminal e tipo de vaga. No verão o Hercílio Luz bate recorde de movimento, e é quando estacionar fica mais difícil e mais caro.',
 'A lista abaixo tem os estacionamentos Aeroporto Florianópolis com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-navegantes',
 'Estacionamento no Aeroporto Navegantes: esta página compara as opções da região por preço da diária, distância até o terminal e tipo de vaga. Quem embarca no NVT costuma vir de Balneário Camboriú, Itajaí e Blumenau de carro, e volta pelo mesmo caminho dias depois.',
 'Abaixo estão os estacionamentos Aeroporto Navegantes com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-cuiaba',
 'Estacionamento no Aeroporto Cuiabá: esta página compara as opções perto do Marechal Rondon por preço da diária, distância até o terminal e tipo de vaga. Muita gente chega dirigindo de Rondonópolis, Sinop e Sorriso, e deixa o carro parado a viagem inteira.',
 'A lista abaixo traz os estacionamentos Aeroporto Cuiabá com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-campo-grande',
 'Estacionamento no Aeroporto Campo Grande: esta página compara as opções perto do CGR por preço da diária, distância até o terminal e tipo de vaga. Viagem para Bonito ou para o Pantanal costuma passar de uma semana, e é aí que a diária do pátio oficial vira o gasto que mais surpreende na volta.',
 'Abaixo estão os estacionamentos Aeroporto Campo Grande com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-goiania',
 'Estacionamento no Aeroporto Goiânia: esta página compara as opções perto do Santa Genoveva por preço da diária, distância até o terminal e tipo de vaga. São 8 km até o centro, e quem embarca costuma preferir o próprio carro a depender de aplicativo na madrugada.',
 'A lista abaixo tem os estacionamentos Aeroporto Goiânia com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-vitoria',
 'Estacionamento no Aeroporto Vitória: esta página compara as opções da região por preço da diária, distância até o terminal e tipo de vaga. O terminal fica a 10 km do centro da capital, distância curta o bastante para ir de carro e longa o bastante para não valer duas corridas de aplicativo.',
 'Abaixo estão os estacionamentos Aeroporto Vitória com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-maceio',
 'Estacionamento no Aeroporto Maceió: esta página compara as opções perto do Zumbi dos Palmares por preço da diária, distância até o terminal e tipo de vaga. São 22 km até a orla, e a viagem de férias costuma deixar o carro parado por uma semana ou mais.',
 'A lista abaixo traz os estacionamentos Aeroporto Maceió com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-joao-pessoa',
 'Estacionamento no Aeroporto João Pessoa: esta página compara as opções perto do Castro Pinto por preço da diária, distância até o terminal e tipo de vaga. O aeroporto fica em Bayeux, a poucos minutos da capital, e recebe muita viagem de veraneio de vários dias.',
 'Abaixo estão os estacionamentos Aeroporto João Pessoa com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('aeroporto-teresina',
 'Estacionamento no Aeroporto Teresina: esta página compara as opções perto do Petrônio Portella por preço da diária, distância até o terminal e tipo de vaga. São 4 km até o centro, então ir de carro é o caminho natural de quem embarca cedo.',
 'A lista abaixo tem os estacionamentos Aeroporto Teresina com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('aeroporto-londrina',
 'Estacionamento no Aeroporto Londrina: esta página compara as opções perto do José Richa por preço da diária, distância até o terminal e tipo de vaga. O aeroporto fica dentro da malha urbana, e a vaga por perto disputa espaço com o movimento do bairro.',
 'Abaixo estão os estacionamentos Aeroporto Londrina com endereço, distância até o terminal e preço de quem fecha reserva online.'),

('rodoviaria-tiete',
 'Estacionamento na Rodoviária Tietê: esta página compara as opções da zona norte de São Paulo por preço da diária, distância até o terminal e tipo de vaga. Quem pega ônibus de madrugada costuma chegar de carro, e a vaga na região é disputada a qualquer hora.',
 'A lista abaixo traz os estacionamentos Rodoviária Tietê com endereço, distância até o terminal e o preço de quem aceita reserva online.'),

('centro-de-sao-paulo',
 'Estacionamento no Centro de São Paulo: esta página compara as opções da região por preço da diária, distância até o destino e tipo de vaga. Entre a Sé, a República e o Anhangabaú, a vaga na rua é escassa e a rotativa cobra caro pelo dia inteiro.',
 'Abaixo estão os estacionamentos do Centro de São Paulo com endereço, distância medida e preço de quem fecha reserva online.'),

('centro-de-nova-iguacu',
 'Estacionamento no Centro de Nova Iguaçu: esta página compara as opções da região por preço da diária, distância até o destino e tipo de vaga. O centro concentra comércio, serviços e órgãos públicos, e quem passa o dia por lá precisa de vaga que não cobre por hora.',
 'A lista abaixo tem os estacionamentos do Centro de Nova Iguaçu com endereço, distância medida e o preço de quem aceita reserva online.'),

('jardim-paulista',
 'Estacionamento no Jardim Paulista: esta página compara as opções do bairro por preço da diária, distância até o destino e tipo de vaga. Entre a Avenida Paulista e a Oscar Freire, a vaga na rua acaba cedo e a rotativa limita o tempo.',
 'Abaixo estão os estacionamentos do Jardim Paulista com endereço, distância medida e preço de quem fecha reserva online.')

)
update public.destination d
set intro =
  t.abertura
  || E'\n\n'
  -- Tira o fecho genérico ("Nesta página você conhece melhor...") antes de acrescentar o novo.
  || btrim(regexp_replace(d.intro, '\s*Nesta página[^.]*\.', '', 'g'))
  || ' '
  || t.fecho
from texto t
where d.public_slug = t.slug;
