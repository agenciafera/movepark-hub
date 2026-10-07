-- FAQ sem "vaga garantida" (Conteúdo 44, ADR-009; docs/specs/capacidades-unidade.md).
--
-- 22 FAQs de destino respondiam "E se meu voo atrasar ou eu voltar antes do previsto?" com
-- "Sua vaga fica garantida pelo período reservado" e prometiam a Tarifa Superflex. As duas são
-- promessa de transação, e a FAQ de destino renderiza em toda página do aeroporto, inclusive
-- nas 21 praças sem parceiro e, em Confins, ao lado de 11 pátios sem reserva online. Promessa
-- sem capacidade declarada é o que o ADR-009 proíbe. A BePark passou a vender pelo Hub em
-- 06/10/2026 (`checkout_mode = hub`), e isso não muda a regra: a promessa dela mora na ficha
-- e nas FAQs da unidade, lida de `getLocationCapabilities`, nunca na FAQ do destino.
--
-- O `body_md` dessas FAQs já falava só de fato (o carro segue guardado, a diária a mais é paga
-- na saída, quem volta antes não costuma receber de volta). A `answer`, que vai para o FAQPage,
-- é que divergia. Agora as duas dizem a mesma coisa: o primeiro parágrafo do `body_md` passa a
-- ser a própria `answer`, e o item "Se voltar antes" sai da lista porque entrou na resposta.
--
-- Junto vão as traduções (en, es), as duas FAQs da vaga avulsa da Garageinn em Viracopos
-- (unidade externa, mesma promessa) e a FAQ global de pagamento, que dizia "a vaga é garantida
-- quando o pagamento confirma".
--
-- Idempotente: cada update só pega a linha que ainda tem o texto antigo. Um `db push` posterior
-- reaplica o arquivo (o carimbo local não bate com o remoto) sem desfazer edição do painel.

-- 1. As 22 FAQs de destino (pt). A praça ("Em Confins", "No Galeão") vem do parágrafo atual do
--    body_md, que é a única parte que muda de um aeroporto para outro.
with alvo as (
  select
    f.id,
    split_part(f.body_md, E'\n\n', 1) as titulo,
    substring(f.body_md from '\. ((?:Em|No|Na) [^,]+), boa parte') as praca,
    regexp_replace(
      substring(f.body_md from position(E'\n\n' in f.body_md) + 2),
      E'^[^\n]*\n\n',
      ''
    ) as resto
  from public.faq f
  where f.scope = 'destination'
    and f.deleted_at is null
    and f.answer ilike 'Sua vaga fica garantida%'
    and f.body_md is not null
),
novo as (
  select
    id,
    titulo,
    format(
      'O carro segue guardado e não é removido por causa do atraso. O que muda é a cobrança: '
      || 'cada período a mais vira diária adicional, paga na saída pela tabela do próprio '
      || 'estacionamento. Se voltar antes, a maioria não devolve a diária que sobrou. %s, boa '
      || 'parte dos estacionamentos opera 24h.',
      praca
    ) as resposta,
    regexp_replace(resto, E'\n- Se voltar antes[^\n]*', '') as resto
  from alvo
  where praca is not null
)
update public.faq f
set answer = n.resposta,
    body_md = n.titulo || E'\n\n' || n.resposta || E'\n\n' || n.resto
from novo n
where f.id = n.id;

-- Sem body_md (destino novo criado à mão), a resposta vem sem a frase da praça.
update public.faq
set answer = 'O carro segue guardado e não é removido por causa do atraso. O que muda é a '
          || 'cobrança: cada período a mais vira diária adicional, paga na saída pela tabela do '
          || 'próprio estacionamento. Se voltar antes, a maioria não devolve a diária que sobrou.'
where scope = 'destination'
  and deleted_at is null
  and answer ilike 'Sua vaga fica garantida%';

-- 2. Traduções das mesmas FAQs. O nome da praça sai da resposta em pt já corrigida.
with praca as (
  select
    f.id,
    substring(f.answer from '(?:Em|No|Na) ([^,]+), boa parte') as nome
  from public.faq f
  where f.scope = 'destination'
    and f.deleted_at is null
    and f.answer like 'O carro segue guardado e não é removido por causa do atraso.%'
)
update public.faq_i18n i
set answer = case i.locale
  when 'en' then
    'The car stays parked and is not removed because of the delay. What changes is the bill: '
    || 'each extra period becomes an additional day, paid on exit at the lot''s own rates. If '
    || 'you come back early, most lots don''t refund the unused day.'
    || coalesce(format(' In %s, many lots are open 24 hours.', p.nome), '')
  when 'es' then
    'El auto sigue guardado y no lo retiran por el atraso. Lo que cambia es la cuenta: cada '
    || 'período de más se cobra como día adicional, al salir, según la tarifa del propio '
    || 'estacionamiento. Si volvés antes, la mayoría no devuelve el día que sobró.'
    || coalesce(format(' En %s, buena parte de los estacionamientos abre las 24 horas.', p.nome), '')
  else i.answer
end
from praca p
where i.faq_id = p.id
  and i.locale in ('en', 'es')
  and (i.answer ilike 'Your spot is held%' or i.answer ilike 'Tu plaza queda reservada%');

-- Em espanhol, aeroporto que em pt leva artigo ("No Galeão") leva também ("En el Galeão").
-- Recife é cidade e fica sem artigo, como em "En Recife".
update public.faq_i18n i
set answer = regexp_replace(i.answer, ' En ([^,]+), buena parte', ' En el \1, buena parte')
from public.faq f
where f.id = i.faq_id
  and i.locale = 'es'
  and f.scope = 'destination'
  and f.deleted_at is null
  and f.answer ~ ' No (Galeão|Afonso Pena|Salgado Filho|Santos Dumont), boa parte'
  and i.answer ~ ' En [^,]+, buena parte'
  and i.answer !~ ' En el ';

-- 3. A vaga avulsa da Garageinn em Viracopos (unidade externa): a posição varia, o resto é fato.
update public.faq
set answer = replace(answer, 'Não. Sua vaga está garantida, mas a posição', 'Não. A posição')
where scope = 'location'
  and answer like 'Não. Sua vaga está garantida, mas a posição%';

update public.faq
set answer = replace(
  answer,
  ' Sua vaga fica garantida dentro da capacidade contratada, mas a posição exata varia',
  ' A posição exata varia'
)
where scope = 'location'
  and answer like '%Sua vaga fica garantida dentro da capacidade contratada%';

-- 4. A FAQ global de pagamento: o fato é a confirmação da reserva, não uma garantia de vaga.
update public.faq
set body_md = replace(
  body_md,
  'o QR Code vale por 15 minutos; a vaga é garantida quando o pagamento confirma.',
  'o QR Code vale por 15 minutos, e a reserva só é confirmada quando o pagamento entra.'
)
where scope = 'global'
  and body_md like '%a vaga é garantida quando o pagamento confirma%';
