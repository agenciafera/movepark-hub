-- BePark: a frequência da van entra na ficha (Conteúdo 51, docs/specs/ataque-cnf-bepark.md §2.3).
--
-- A ficha tinha só o trajeto (`shuttle_to_terminal_minutes = 10`) e a frequência vazia, então a
-- página da unidade, o llms.txt e o bloco de fato das donas de Confins só podiam dizer "traslado de
-- 10 min". O número da frequência vem do mapa de atendimento que os donos da BePark mandaram em
-- 18/09/2026 (SmartTalk/WhatsApp): transfer gratuito, 24 horas, saída a cada 20 minutos, e sai na
-- hora se a van já estiver pronta. É o mesmo que bepark.com.br publica desde então, conferido em
-- 09/10/2026 ("Saídas a cada 20 minutos" e "10 min do terminal").
--
-- O que NÃO entra aqui: `go2park_whatsapp`. O número da van mora no painel da Go2Park e ninguém o
-- copiou ainda. O telefone do balcão (+55 31 99559-0090, em `location.phone`) não serve, pela razão
-- de docs/specs/go2park-transfer-ao-vivo.md: quem acabou de pousar precisa falar com quem dirige.
--
-- A FAQ de destino "dá para acompanhar a van em tempo real em Confins" dizia que o cliente "chama o
-- transfer pelo WhatsApp". Não há WhatsApp da van cadastrado, e a BePark não opera assim: a van sai
-- do ponto fixo a cada 20 minutos. A frase sai e entram os dois números da ficha, em pt, en e es.
--
-- Os posts de Confins que carregam o bloco de fato (`bun run lint:bloco-fato -- --print CNF`)
-- ganham a frequência na linha da BePark, e duas frases que davam a frequência como "só do site"
-- passam a citar os dois números da ficha. O guarda do bloco passa a barrar a divergência se a
-- ficha mudar e o post não.
--
-- Idempotente: grava valor fixo pela chave natural (empresa + unidade, slug da FAQ), e cada troca
-- de texto só roda enquanto o trecho antigo existir.

update public.location l
set shuttle_frequency_minutes = 20
from public.company c
where c.id = l.company_id
  and c.slug = 'bepark'
  and l.slug = 'aeroporto-confins'
  and l.shuttle_frequency_minutes is distinct from 20;

-- ── da-para-acompanhar-a-van-do-estacionamento-em-tempo-real-em-confins ──────────────────

update public.faq set
  answer =
    'Dá. O parceiro Movepark BePark usa a Go2Park, que mostra a van no mapa e o tempo até o ponto '
    || 'de embarque. A van sai a cada 20 minutos e leva cerca de 10 minutos até o terminal, então '
    || 'você acompanha a próxima saída em vez de esperar no meio-fio sem saber quanto falta. Em '
    || 'Confins ele é o único parceiro Movepark com esse recurso.',
  body_md =
    E'## Por que isso importa em Confins?\n\n'
    || E'O BePark fica a 7,6 km do terminal. A van sai a cada 20 minutos e faz o trajeto em cerca '
    || E'de 10. Com esse intervalo, saber se a van já saiu muda a espera de verdade.\n\n'
    || E'Depois de pousar, você acompanha a van no mapa até o ponto de embarque.\n\n'
    || E'O mesmo recurso existe no **Virapark** e no **Garageinn**, em Viracopos.'
where slug = 'da-para-acompanhar-a-van-do-estacionamento-em-tempo-real-em-confins'
  and scope = 'destination';

update public.faq_i18n i set answer = case i.locale
  when 'en' then 'You can. The Movepark partner BePark uses Go2Park, which shows the van on a map '
    || 'and the time until the pickup point. The van leaves every 20 minutes and takes about 10 '
    || 'minutes to the terminal, so you follow the next departure instead of waiting at the kerb '
    || 'with no idea how long is left. At Confins it is the only Movepark partner with this feature.'
  when 'es' then 'Sí. El socio Movepark BePark usa Go2Park, que muestra la combi en el mapa y el '
    || 'tiempo hasta el punto de embarque. La combi sale cada 20 minutos y tarda unos 10 minutos '
    || 'hasta la terminal, así que seguís la próxima salida en vez de esperar en el cordón sin saber '
    || 'cuánto falta. En Confins es el único socio Movepark con ese recurso.'
  else i.answer end
from public.faq f
where f.id = i.faq_id and f.scope = 'destination'
  and f.slug = 'da-para-acompanhar-a-van-do-estacionamento-em-tempo-real-em-confins';

-- ── posts de Confins: bloco de fato e as duas frases da van ──────────────────────────────

update public.blog_post
set body_md = replace(body_md,
  'declara traslado de **10 minutos**, e cobra **R$ 45,00** na diária avulsa',
  'declara traslado de **10 minutos**, com van a cada **20 minutos**, e cobra **R$ 45,00** na diária avulsa')
where slug in (
    'bepark-confins',
    'estacionamento-mais-barato-no-aeroporto-de-confins',
    'guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins',
    'preco-do-estacionamento-no-aeroporto-de-confins',
    'top-3-estacionamentos-do-aeroporto-de-confins'
  )
  and body_md like '%declara traslado de **10 minutos**, e cobra **R$ 45,00** na diária avulsa%';

update public.blog_post
set body_md = replace(body_md,
  'O BePark informa traslado de 10 minutos até o terminal, e é essa a informação que a Movepark publica na página dele.',
  'O BePark informa 10 minutos de traslado até o terminal, com van a cada 20 minutos. São esses os dois números que a Movepark publica na página dele.')
where slug = 'guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins';

update public.blog_post
set body_md = replace(body_md,
  E'| Traslado informado | 10 minutos |\n',
  E'| Traslado informado | 10 minutos |\n| Frequência da van | a cada 20 minutos |\n')
where slug = 'guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins'
  and body_md not like '%| Frequência da van |%';

update public.blog_post
set body_md = replace(body_md,
  'A informação da frequência declarada pela BePark (a cada 20 minutos) e a da ficha (10 minutos de trajeto) são as duas que a Movepark publica.',
  'A ficha da BePark declara os dois números que a Movepark publica: van a cada 20 minutos e 10 minutos de trajeto.')
where slug = 'bepark-confins';
