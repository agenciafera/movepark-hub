-- Preço pesquisado de CGH, GRU, VCP, CWB e Tietê reconferido em 09/10/2026 (Marés 06,
-- quadro de concorrência por praça antes da virada de 20/10).
--
-- Mesma regra da releitura de Confins (20261128180000): a linha descreve UMA leitura, os quatro
-- valores são gravados juntos com a data, e duração que o pátio NÃO publica fica nula. Duração
-- derivada de REGRA publicada pelo próprio pátio continua (Park 222 "de 20 a 30 diárias vale 20",
-- FlyPark "congela na 10ª diária", Bandeira por faixa, CallPark "tabela fixa por diária").
--
-- O que mudou, por praça (trecho literal em `prospect_price_research`):
--
--   CGH  Grand Parking   Ficha dizia R$ 25,00, número de um post de blog antigo. O motor oficial
--                        cobra R$ 34,00 por dia mais 20% de taxa com teto de R$ 50,00.
--        Arai Park       Operação suspensa desde 15/05/2026, segundo o próprio site. Sai o preço;
--                        a ficha continua publicada (despublicar exige mexer no mapa de 301 do
--                        worker, que aponta arai-park-cgh para ela).
--        Congonhas Park  Ganha preço: R$ 40,00 pelo WhatsApp.
--        MultiPark       R$ 40,00 virou R$ 39,00 online.
--        The Parking, Express, One Parking: diária igual; saem as durações que eram diária x N.
--   GRU  Urban Park      R$ 14,00 virou R$ 26,90 (o 14,00 vinha de um pop-up antigo do site).
--        Decolar, Ponce, Park 222, FlyPark, Airport Park: o mês passa a ser o teto que cada um
--                        publica, não a diária x 30. ServParking e Econopark não publicam pacote.
--        MultiPark GRU   R$ 13,31 por dia a partir da 7ª diária, como a página diz.
--   VCP  KM64, Estapar oficial e Viracopos Aeroparking: só publicam diária; sai a diária x N.
--        A diária do Aeroparking não foi trocada: o site monta o número por CSS e a leitura de
--        09/10 não conseguiu separar descoberta de coberta com segurança.
--   CWB  Best Park e Express Park: 30 diárias custam R$ 550,00 no motor, não R$ 840,00.
--        Nikkey          Publica faixa fechada (7d R$ 160, 15d R$ 305, 30d R$ 430).
--        Hangar VIP      Só publica diária.
--   Tietê Bandeira       15 dias caem na faixa de 7+ (R$ 16,27): R$ 244,05, não R$ 186,60.
--
-- A FAQ "quanto custa" de Congonhas acompanha: dizia que o Grand Parking não publica tarifa e
-- tratava o Arai como pátio ativo.
--
-- Idempotente: grava valor fixo e só registra histórico se ainda não houver leitura do lote no dia.

with leitura(dest, slug, url, d1, d7, d15, d30, evidencia, fonte) as (
  values
  -- ===== Congonhas =====
  ('aeroporto-de-congonhas', 'grand-parking', 'https://controle.grandparking.com.br/primeira-reserva',
   40.00, 285.00, 560.00, 1070.00,
   'Diárias Veículo (Passeio) -> R$ 34,00 | Vaga (Descoberta - deixa a chave) -> R$ 0,00 | Taxa de serviço 20% | Valor máximo: R$ 50,00 | Total a pagar R$ 40,00 (1 dia), R$ 285,00 (7 dias), R$ 560,00 (15 dias), R$ 1.070,00 (30 dias)',
   'Motor de reserva oficial do Grand Parking, simulado em 09/10/2026 sem enviar reserva. Vaga descoberta deixando a chave: R$ 34,00 por dia mais taxa de serviço de 20%, limitada a R$ 50,00 por estadia. Coberta custa R$ 10,00 a mais por dia. Simulação para 20/12 e 05/01 deu o mesmo valor.'),
  ('aeroporto-de-congonhas', 'the-parking', 'https://theparking.com.br/aeroporto-congonhas/',
   30.00, null, null, null,
   'Diárias a partir de R$20,00 (moto) e R$30,00 (carro)',
   'Site do The Parking, consultado em 09/10/2026. Diária de carro a partir de R$ 30,00, com reserva pelo WhatsApp e pagamento na saída. Não publica pacote; mensal sob consulta. O pátio abre das 4h às 23h59.'),
  ('aeroporto-de-congonhas', 'express-parking', 'https://expressestacionamento.com.br/',
   40.00, null, 600.00, 600.00,
   'DIÁRIA Vaga Coberta Carro Pequeno R$40,00 … De 15 a 30 dias R$600,00',
   'Site do Express Parking, consultado em 09/10/2026. Vaga coberta, carro pequeno: R$ 40,00 a diária (carro grande R$ 45,00) e R$ 600,00 fixos para qualquer estadia de 15 a 30 dias. Não publica pacote de 7 dias.'),
  ('aeroporto-de-congonhas', 'multipark', 'https://www.multipark.com.br/aeroporto-congonhas-multipark',
   39.00, null, null, null,
   'apenas R$39,00/dia para reservas online e R$50,00/dia no balcão',
   'Site do MultiPark (unidade Congonhas), consultado em 09/10/2026. Vaga coberta: R$ 39,00 por dia com reserva online, por tempo limitado, e R$ 50,00 no balcão. Promoção "compre 4 diárias e a 5ª é gratuita". Não publica pacote.'),
  ('aeroporto-de-congonhas', 'one-parking', 'https://oneparkingcongonhas.com/',
   45.00, null, null, null,
   'cARRO PEQUENO E SUV Diária - R$45,00',
   'Site do One Parking, consultado em 09/10/2026. Carro pequeno e SUV: R$ 45,00 a diária; caminhonete R$ 50,00. Não publica pacote; mensal R$ 300,00.'),
  ('aeroporto-de-congonhas', 'congonhas-park', 'https://congonhaspark.com.br/',
   40.00, null, null, null,
   'WhatsApp Diária: R$ 40 | Diária: R$ 45 | *Exceto para carros grandes.',
   'Site do Congonhas Park, consultado em 09/10/2026. Diária de R$ 40,00 reservando pelo WhatsApp e R$ 45,00 cheia; não vale para carro grande. Não publica pacote.'),
  ('aeroporto-de-congonhas', 'arai-park', 'https://araipark.com.br/',
   null, null, null, null,
   'a partir do dia 15/05/2026, nosso serviço … estará temporariamente inativo',
   'Site do Arai Park, consultado em 09/10/2026: operação temporariamente inativa desde 15/05/2026. A tabela de R$ 35,00 segue no site, mas o pátio não está operando, então nenhum preço é publicado.'),
  -- ===== Guarulhos =====
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'urban-park', 'https://www.urbanparkgru.com.br/',
   26.90, 188.30, null, null,
   'Tarifa Mínima 1 Diária Reserva Online R$26,90',
   'Site do Urban Park, formulário de reserva, consultado em 09/10/2026. Vaga descoberta com reserva online: R$ 26,90 a diária e R$ 188,30 por 7 diárias; coberta R$ 36,90; sem reserva R$ 43,90. A tabela vai até 10 diárias. O R$ 14,00 que aparece num pop-up antigo do site não é cobrado no formulário.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'park-222', 'https://park222.com.br/',
   16.99, 118.93, 254.85, 339.80,
   'De 20 a 30 diárias o valor cobrado será o equivalente a 20 diárias',
   'Site do Park 222, consultado em 09/10/2026. Vaga descoberta R$ 16,99 por dia (coberta R$ 24,99), reserva pelo WhatsApp. De 20 a 30 diárias cobra o equivalente a 20 (R$ 339,80). Avulso sem reserva R$ 30,00.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'servparking', 'https://servparking.com.br/',
   19.90, null, null, null,
   'Pacotes especiais a partir de 7 diárias Fale com',
   'Site do ServParking (unidade GRU), consultado em 09/10/2026. Vaga descoberta R$ 19,90 por dia (era R$ 21,90), coberta R$ 27,90. Pacote a partir de 7 diárias só sob consulta.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'econopark', 'https://www.econoparkaeroporto.com.br/Reservas.aspx',
   20.90, null, null, null,
   'a partir de R$ 20,90* | * Válido para determinados períodos',
   'Página de reservas do Econopark, consultada em 09/10/2026. Diária a partir de R$ 20,90, válida para determinados períodos. Outras durações só aparecem na calculadora.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'gopark', 'https://www.gopark.gru.br/',
   20.90, 146.30, null, null,
   'Estadia mínima de 3 diárias caso utilize a van',
   'Site do GoPark, consultado em 09/10/2026. Vaga descoberta promocional R$ 20,90 (cheia R$ 24,90), 7 diárias R$ 146,30; coberta R$ 31,90. Estadia mínima de 3 diárias para quem usa a van. A tabela vai até 10 diárias.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'decolar-park', 'https://www.decolarpark.com.br/tarifas/',
   20.90, 146.30, 313.50, 376.20,
   'Tarifas - Vagas Descobertas 1 diária (24 horas) R$ 20,90 7 diárias (168 horas) R$146,30 15 diárias (360 horas) R$ 313,50 Até 30 dias (até 720 horas) R$ 376,20',
   'Página de tarifas do Decolar Park, consultada em 09/10/2026. Vaga descoberta: R$ 20,90, R$ 146,30, R$ 313,50 e R$ 376,20 até 30 dias. Coberta R$ 28,90 a diária. A home avisa "Devido a alta temporada, consulte a disponibilidade".'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'ponce-park', 'https://poncepark.com.br/estacionamento-aeroporto-guarulhos/',
   21.99, 153.93, 329.85, 340.00,
   '3 ATÉ 15 DIÁRIAS ... DIÁRIA NORMAL | PACOTES A PARTIR DE 16 DIÁRIAS ... pix: 340.00',
   'Site do Ponce Park, simulador, consultado em 09/10/2026. Vaga descoberta no PIX: R$ 21,99 por dia de 3 a 15 diárias (mínimo de 3) e pacote de R$ 340,00 de 16 a 30 diárias. No cartão R$ 24,90 por dia.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'multipark', 'https://www.multipark.com.br/aeroporto-de-guarulhos-multipark',
   24.99, 93.17, null, null,
   'R$13,31 à partir da 7º diária para Reserva Online e o valor de R$29,99 por dia para cobrança física',
   'Site do MultiPark (unidade GRU), consultado em 09/10/2026. Diária de R$ 24,99 com reserva online e R$ 13,31 por dia a partir da 7ª diária (7 = R$ 93,17); balcão R$ 29,99. Não publica faixa para 15 e 30 dias.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'flypark', 'https://flypark.com.br/tarifas',
   40.80, 285.60, 408.00, 408.00,
   'congelamos o valor acumulado até a 10a diária até completar 30 dias',
   'Página de tarifas do FlyPark, consultada em 09/10/2026. Pátio com sombreador: R$ 40,80 por dia, e o valor acumulado congela na 10ª diária (R$ 408,00) até 30 dias. Coberta R$ 49,20.'),
  ('aeroporto-internacional-de-sao-paulo-guarulhos', 'airport-park', 'https://airportpark.com.br/tarifa-reservas',
   59.90, null, 599.00, 599.00,
   'diária na tarifa local é de R$59,90 | pacotes promocionais de 11 até 30 dias por apenas R$599,00',
   'Página de tarifas do Airport Park, consultada em 09/10/2026. Diária de balcão R$ 59,90 e pacote de R$ 599,00 de 11 a 30 dias. O preço online é anunciado como até 60% menor, sem número.'),
  -- ===== Viracopos =====
  ('aeroporto-de-viracopos', 'km64', 'https://km64.com.br/',
   19.00, null, null, null,
   'Vaga descoberta por apenas R$ 19/dia | Vaga coberta por apenas R$ 24,00/dia',
   'Site do KM64, consultado em 09/10/2026. Vaga descoberta R$ 19,00 e coberta R$ 24,00 por dia, promocional por tempo limitado, reserva pelo WhatsApp. Não publica pacote por duração.'),
  ('aeroporto-de-viracopos', 'estapar-oficial', 'https://www.viracopos.com/pt_br/passageiro/estacionamento.htm',
   31.00, null, null, null,
   'Rotativo bolsão "F" - diária R$ 31,00',
   'Site do Aeroporto de Viracopos, consultado em 09/10/2026. Bolsão F (econômico): R$ 31,00 a diária no balcão; com reserva antecipada no Zul+, a partir de R$ 25,00. Não publica pacote para o bolsão.'),
  -- ===== Afonso Pena =====
  ('aeroporto-afonso-pena', 'best-park', 'https://reservefacilaeroporto.com.br/',
   28.00, 196.00, 420.00, 550.00,
   '"BEST PARK AEROPORTO" ValorNormal 28.0 ValorEspecial 30.0',
   'Motor de reserva oficial da rede (reservefacilaeroporto.com.br), cotado em 09/10/2026. Carro pequeno: R$ 28,00 (1 dia), R$ 196,00 (7), R$ 420,00 (15) e R$ 550,00 (30); carro grande R$ 30,00 a diária. Estadias em 20/12, 27/12 e 10/01 deram o mesmo valor.'),
  ('aeroporto-afonso-pena', 'express-park', 'https://reservefacilaeroporto.com.br/',
   28.00, 196.00, 420.00, 550.00,
   '"EXPRESS PARK" ValorNormal 28.0',
   'Motor de reserva oficial da rede (reservefacilaeroporto.com.br), o mesmo do Best Park, cotado em 09/10/2026. Carro pequeno: R$ 28,00 (1 dia), R$ 196,00 (7), R$ 420,00 (15) e R$ 550,00 (30); carro grande R$ 30,00 a diária.'),
  ('aeroporto-afonso-pena', 'nikkey', 'https://www.nikkeyestacionamento.com.br/tarifas/',
   28.00, 160.00, 305.00, 430.00,
   '1d 5min R$ 28,00 | 7d 5min R$ 160,00 | 15d 5min R$ 305,00 | 30d 5min R$ 430,00',
   'Página de tarifas do Nikkey, consultada em 09/10/2026. Faixa fechada por período: R$ 28,00 (1 dia), R$ 160,00 (7), R$ 305,00 (15) e R$ 430,00 (30).'),
  ('aeroporto-afonso-pena', 'hangar-vip', 'https://www.hangarvip.com.br/valores/',
   36.00, null, null, null,
   'Diária R$ 36,00 Mensalidade (mediante a contrato) R$ 320,00',
   'Página de valores do Hangar VIP, consultada em 09/10/2026. Diária R$ 36,00. Não publica pacote; a mensalidade de R$ 320,00 é por contrato, não estadia de 30 dias.'),
  -- ===== Rodoviária do Tietê =====
  ('terminal-rodoviario-tiete', 'bandeira-park-santana', 'https://bandeirapark.com.br/estacionamento-rodoviaria-tiete',
   18.49, 113.89, 244.05, 292.80,
   'a partir de 7 dias, R$ 16,27/dia; a partir de 17 dias, R$ 12,44/dia; a partir de 30 dias, R$ 9,76/dia. Tabela vigente em junho de 2026.',
   'Site do Bandeira Park (Tietê), consultado em 09/10/2026. Reserva online: R$ 18,49 a diária, R$ 16,27 por dia a partir de 7 dias (7 = R$ 113,89, 15 = R$ 244,05), R$ 12,44 a partir de 17 e R$ 9,76 a partir de 30 (R$ 292,80).')
),
lote as (
  select p.id, l.*
  from leitura l
  join public.destination d on d.slug = l.dest
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, case when d1 is null then 'failed' else 'applied' end, url,
         (date '2026-10-09' + time '12:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual da Marés 06', now(),
         'Aplicado na migration 20261129140000 (Marés 06), leitura conferida na sessão.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-10-09'
      and r.notes = 'Releitura manual da Marés 06'
  )
  returning 1
)
update public.prospect_location p
set researched_daily_brl    = l.d1,
    researched_weekly_brl   = l.d7,
    researched_biweekly_brl = l.d15,
    researched_monthly_brl  = l.d30,
    researched_at           = date '2026-10-09',
    research_source         = l.fonte,
    last_reviewed_at        = now()
from lote l
where p.id = l.id;

-- Viracopos Aeroparking: a diária fica (ver cabeçalho), saem as durações que eram diária x N.
update public.prospect_location p
set researched_weekly_brl   = null,
    researched_biweekly_brl = null,
    researched_monthly_brl  = null
from public.destination d
where d.id = p.destination_id
  and d.slug = 'aeroporto-de-viracopos'
  and p.public_slug = 'viracopos-aeroparking'
  and (p.researched_weekly_brl is not null
    or p.researched_biweekly_brl is not null
    or p.researched_monthly_brl is not null);

-- A proposta do robô para o Decolar Park (27/09) é a mesma leitura que entrou acima.
update public.prospect_price_research r
set status = 'applied',
    decided_at = now(),
    decision_note = 'Coberta pela releitura da Marés 06 (migration 20261129140000), com o mês de R$ 376,20.'
from public.prospect_location p
join public.destination d on d.id = p.destination_id
where r.prospect_location_id = p.id
  and r.status = 'pending'
  and d.slug = 'aeroporto-internacional-de-sao-paulo-guarulhos'
  and p.public_slug = 'decolar-park';

-- FAQ "quanto custa" de Congonhas: tabela e nota com a leitura de 09/10.
update public.faq
set body_md = $faq$Comparativo dos principais estacionamentos perto do Aeroporto de Congonhas (CGH):

| Estacionamento | Diária a partir de | Como é |
|---|---|---|
| **Plenty Park (parceiro Movepark)** | R$ 26,90 por dia | Vaga coberta a 863 m do terminal, a partir de 7 diárias; o mínimo de reserva é 3 diárias, a R$ 29,90 por dia |
| **Aerovalet (parceiro Movepark)** | R$ 32,54 | Vaga coberta a 738 m do terminal, sem estadia mínima |
| The Parking | R$ 30,00 | Reserva pelo WhatsApp e traslado gratuito; o pátio abre das 4h às 23h59, não é 24 horas |
| MultiPark | R$ 39,00 | Com reserva online; no balcão a mesma diária sai R$ 50,00. Aberto 24 horas |
| Grand Parking | R$ 40,00 | R$ 34,00 por dia mais taxa de serviço de 20%, limitada a R$ 50,00 por estadia. Vaga descoberta, deixando a chave |
| Congonhas Park | R$ 40,00 | Reservando pelo WhatsApp; a diária cheia sai R$ 45,00 |
| Express Parking | R$ 40,00 | Carro pequeno; carro grande sai R$ 45,00. Estadia de 15 a 30 dias por R$ 600,00 fixos |
| Edifício-garagem oficial (Estapar) | R$ 44,90 | Com reserva antecipada; o preço muda conforme a procura |
| One Parking | R$ 45,00 | Carro e SUV. Publica também hora avulsa, R$ 15,00, e o traslado só vale a partir de 2 diárias |

Os valores dos estacionamentos sem reserva pela Movepark vêm do site de cada um, conferidos em 9 de outubro de 2026, e podem mudar sem aviso. O Facility só informa o preço depois de um cadastro, e o Arai Park está com a operação suspensa desde maio de 2026. O preço do parceiro Movepark sai do motor de reservas e fica sempre atualizado na [tabela de preços de Congonhas](/estacionamentos/aeroporto-congonhas/precos).

Para reservar com preço fechado, veja as vagas na página do [Aeroporto de Congonhas](/estacionamentos/aeroporto-congonhas).$faq$
where slug = 'quanto-custa-estacionar-no-aeroporto-de-congonhas' and scope = 'destination';
