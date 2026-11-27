-- Preço pesquisado de Curitiba (Afonso Pena) reconferido em 27/11/2026 (rotina semanal de busca e
-- IA, item 2: docs/specs/rotina-semanal-busca-e-ia.md). Os 4 lotes publicam hoje o mesmo que em
-- 09/10/2026: Best Park e Express Park simulados no motor da rede (reservefacilaeroporto.com.br)
-- com entrada em 01/12/2026, Nikkey pela tabela fechada por período e Hangar VIP pela página de
-- valores. Só a data da leitura e a fonte mudam; nenhum texto publicado precisa de reescrita.
--
-- Achado da passada: o mesmo motor vende o Executive Park (R$ 30,00 / 210,00 / 450,00 / 600,00 para
-- carro pequeno), que não está entre os lotes mapeados de Curitiba. Fica como candidato.
--
-- Idempotente: só registra histórico se ainda não houver leitura do lote no dia.

with leitura(slug, url, evidencia) as (
  values
  ('best-park', 'https://reservefacilaeroporto.com.br/',
   'BEST PARK AEROPORTO, entrada 01/12/2026: VEÍCULO PEQUENO R$ 28,00 (1 dia), R$ 196,00 (7), R$ 420,00 (15), R$ 550,00 (30); VEÍCULO GRANDE R$ 30,00 / 210,00 / 450,00 / 600,00'),
  ('express-park', 'https://reservefacilaeroporto.com.br/',
   'EXPRESS PARK, entrada 01/12/2026: VEÍCULO PEQUENO R$ 28,00 (1 dia), R$ 196,00 (7), R$ 420,00 (15), R$ 550,00 (30); VEÍCULO GRANDE R$ 30,00 / 210,00 / 450,00 / 600,00'),
  ('nikkey', 'https://www.nikkeyestacionamento.com.br/tarifas/',
   '1d 5min R$ 28,00 | 7d 5min R$ 160,00 | 15d 5min R$ 305,00 | 30d 5min R$ 430,00'),
  ('hangar-vip', 'https://www.hangarvip.com.br/valores/',
   '1ª Hora R$ 18,00 Diária R$ 36,00 Mensalidade (mediante a contrato) R$ 320,00')
),
lote as (
  select p.id, p.researched_daily_brl d1, p.researched_weekly_brl d7,
         p.researched_biweekly_brl d15, p.researched_monthly_brl d30, l.*
  from leitura l
  join public.destination d on d.slug = 'aeroporto-afonso-pena'
  join public.prospect_location p on p.destination_id = d.id and p.public_slug = l.slug
),
historico as (
  insert into public.prospect_price_research (
    prospect_location_id, status, source_url, fetched_at,
    daily_brl, weekly_brl, biweekly_brl, monthly_brl,
    evidence, model, notes, decided_at, decision_note
  )
  select id, 'applied', url,
         (date '2026-11-27' + time '18:00') at time zone 'America/Sao_Paulo',
         d1, d7, d15, d30,
         evidencia, 'claude-opus-5-5', 'Releitura manual de CWB, rotina semanal', now(),
         'Aplicado na migration 20261208210000: valores iguais aos de outubro, só a data da leitura muda.'
  from lote
  where not exists (
    select 1 from public.prospect_price_research r
    where r.prospect_location_id = lote.id
      and (r.fetched_at at time zone 'America/Sao_Paulo')::date = date '2026-11-27'
      and r.notes = 'Releitura manual de CWB, rotina semanal'
  )
  returning 1
)
update public.prospect_location p
set researched_at    = date '2026-11-27',
    research_source  = replace(replace(replace(p.research_source,
                         'cotado em 09/10/2026', 'cotado em 27/11/2026'),
                         'consultada em 09/10/2026', 'consultada em 27/11/2026'),
                         'Estadias em 20/12, 27/12 e 10/01 deram o mesmo valor.',
                         'Simulado de novo em 27/11/2026 com entrada em 01/12: mesmo valor.'),
    last_reviewed_at = now()
from lote l
where p.id = l.id;
