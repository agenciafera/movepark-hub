-- FAQ por destino (scope='destination', GEO-07 / ADR-002).
-- Conteúdo baseline de gestao/conteudo-onda1.md §2 — Viracopos + GRU/CGH/SDU/GIG.
-- Idempotente (não duplica): rode no SQL editor do projeto de produção.
-- Resolve destino por slug e categoria por slug; publica (is_published=true).

with cat as (select slug, id from public.faq_category),
rows(dest_slug, sort_order, cat_slug, question, answer) as (
  values
  ('aeroporto-de-viracopos', 1, 'check-in', 'O estacionamento em Viracopos oferece traslado até o terminal?',
   'Depende do estacionamento. Em Viracopos os lotes ficam a poucos minutos do terminal e muitos oferecem traslado (transfer) de ida e volta — em vários casos já incluído na diária. Na página de cada estacionamento você vê se o traslado está incluso, o horário e a distância até o terminal. Reserve o que melhor encaixa no seu voo.'),
  ('aeroporto-de-viracopos', 2, 'reservas', 'E se meu voo atrasar ou eu voltar antes do previsto?',
   'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.'),
  ('aeroporto-de-viracopos', 3, 'veiculos', 'As vagas em Viracopos são cobertas ou descobertas?',
   'Varia por estacionamento e por tipo de vaga. Há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.'),
  ('aeroporto-de-viracopos', 4, 'check-in', 'Tem valet ou é self-park (você mesmo estaciona)?',
   'Os dois modelos existem em Viracopos. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).'),
  ('aeroporto-de-viracopos', 5, 'veiculos', 'Os estacionamentos de Viracopos são seguros? Têm monitoramento?',
   'Os estacionamentos parceiros listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.'),
  ('aeroporto-de-viracopos', 6, 'veiculos', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?',
   'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.'),

  ('aeroporto-internacional-de-sao-paulo-guarulhos', 1, 'check-in', 'O estacionamento em Guarulhos oferece traslado até o terminal?',
   'Depende do estacionamento. O GRU tem três terminais (T1, T2 e T3) e os estacionamentos parceiros costumam ficar a poucos minutos deles, a maioria com traslado (transfer) de ida e volta — em vários casos já incluído na diária. A página de cada estacionamento mostra se o traslado está incluso, o horário e para qual terminal ele leva. Confira o do seu voo antes de reservar.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 2, 'reservas', 'E se meu voo atrasar ou eu voltar antes do previsto?',
   'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 3, 'veiculos', 'As vagas em Guarulhos são cobertas ou descobertas?',
   'Varia por estacionamento e por tipo de vaga. Em Guarulhos há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 4, 'check-in', 'Tem valet ou é self-park (você mesmo estaciona)?',
   'Os dois modelos existem em Guarulhos. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 5, 'veiculos', 'Os estacionamentos de Guarulhos são seguros? Têm monitoramento?',
   'Os estacionamentos parceiros em Guarulhos listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 6, 'veiculos', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?',
   'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.'),

  ('aeroporto-de-congonhas', 1, 'check-in', 'O estacionamento em Congonhas oferece traslado até o terminal?',
   'Depende do estacionamento. Congonhas fica dentro de São Paulo, então os lotes parceiros costumam ser bem próximos do terminal — muitos com traslado (transfer) de ida e volta, em vários casos já incluso na diária. A página de cada estacionamento mostra se o traslado está incluído, o horário e a distância até o terminal.'),
  ('aeroporto-de-congonhas', 2, 'reservas', 'E se meu voo atrasar ou eu voltar antes do previsto?',
   'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.'),
  ('aeroporto-de-congonhas', 3, 'veiculos', 'As vagas em Congonhas são cobertas ou descobertas?',
   'Varia por estacionamento e por tipo de vaga. Em Congonhas há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.'),
  ('aeroporto-de-congonhas', 4, 'check-in', 'Tem valet ou é self-park (você mesmo estaciona)?',
   'Os dois modelos existem em Congonhas. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).'),
  ('aeroporto-de-congonhas', 5, 'veiculos', 'Os estacionamentos de Congonhas são seguros? Têm monitoramento?',
   'Os estacionamentos parceiros em Congonhas listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.'),
  ('aeroporto-de-congonhas', 6, 'veiculos', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?',
   'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.'),

  ('aeroporto-santos-dumont', 1, 'check-in', 'O estacionamento no Santos Dumont oferece traslado até o terminal?',
   'Depende do estacionamento. O Santos Dumont fica no centro do Rio, junto à orla, e os lotes parceiros costumam ser bem próximos — muitos com traslado (transfer) de ida e volta, às vezes já incluso na diária. Veja na página de cada estacionamento se o traslado está incluído, o horário e a distância até o terminal.'),
  ('aeroporto-santos-dumont', 2, 'reservas', 'E se meu voo atrasar ou eu voltar antes do previsto?',
   'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.'),
  ('aeroporto-santos-dumont', 3, 'veiculos', 'As vagas no Santos Dumont são cobertas ou descobertas?',
   'Varia por estacionamento e por tipo de vaga. No Santos Dumont há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.'),
  ('aeroporto-santos-dumont', 4, 'check-in', 'Tem valet ou é self-park (você mesmo estaciona)?',
   'Os dois modelos existem no Santos Dumont. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).'),
  ('aeroporto-santos-dumont', 5, 'veiculos', 'Os estacionamentos do Santos Dumont são seguros? Têm monitoramento?',
   'Os estacionamentos parceiros do Santos Dumont listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.'),
  ('aeroporto-santos-dumont', 6, 'veiculos', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?',
   'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.'),

  ('aeroporto-do-galeao', 1, 'check-in', 'O estacionamento no Galeão oferece traslado até o terminal?',
   'Depende do estacionamento. O Galeão tem dois terminais (T1 e T2) e os lotes parceiros ficam a poucos minutos deles, a maioria com traslado (transfer) de ida e volta — em vários casos já incluído na diária. A página de cada estacionamento mostra se o traslado está incluso, o horário e para qual terminal ele leva.'),
  ('aeroporto-do-galeao', 2, 'reservas', 'E se meu voo atrasar ou eu voltar antes do previsto?',
   'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.'),
  ('aeroporto-do-galeao', 3, 'veiculos', 'As vagas no Galeão são cobertas ou descobertas?',
   'Varia por estacionamento e por tipo de vaga. No Galeão há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.'),
  ('aeroporto-do-galeao', 4, 'check-in', 'Tem valet ou é self-park (você mesmo estaciona)?',
   'Os dois modelos existem no Galeão. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).'),
  ('aeroporto-do-galeao', 5, 'veiculos', 'Os estacionamentos do Galeão são seguros? Têm monitoramento?',
   'Os estacionamentos parceiros do Galeão listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.'),
  ('aeroporto-do-galeao', 6, 'veiculos', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?',
   'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.')
)
insert into public.faq (scope, destination_id, category_id, question, answer, sort_order, is_published)
select 'destination', d.id, cat.id, r.question, r.answer, r.sort_order, true
from rows r
join public.destination d on d.slug = r.dest_slug
left join cat on cat.slug = r.cat_slug
where not exists (
  select 1 from public.faq f
  where f.scope = 'destination' and f.destination_id = d.id
    and f.question = r.question and f.deleted_at is null
);
