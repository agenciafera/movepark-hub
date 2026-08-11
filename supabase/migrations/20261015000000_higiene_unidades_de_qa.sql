-- E0.17-b · higiene dos registros mortos em `location`.
--
-- A spec chamava isto de "prospecção morta". A apuração no banco vivo (11/08/2026) mostrou
-- outra coisa, e a diferença importa: **os 11 registros são execuções de QA do wizard de
-- onboarding que ficaram em produção.** Todos têm dono `leo.henrique+NN@fera.ag` ou
-- `peu+...@fera.ag`, com plus-address incrementando a cada rodada (+00, +11, +19, +44,
-- +56, +77, +88, +109, +321), e `company_onboarding` preenchido.
--
-- Duas consequências:
--   1. limpar é mais seguro do que a spec supunha: não há contato comercial real para
--      queimar, porque não há dono real do outro lado;
--   2. `Max Park`, `Maxi Park` e `Maxxi Park` NÃO são três grafias do mesmo lote. São três
--      rodadas de teste do mesmo dia (16/07), em três destinos diferentes (OPO,
--      jardim-paulista, centro-sp). O **Maxipark** de verdade é uma rede com várias
--      unidades, incluindo uma em Guarulhos, e **não está no banco**: ele é candidato a
--      `prospect_location`, não a exclusão. Confirmado com o time em 11/08/2026, que era
--      exatamente o que a spec mandava não resolver por conta própria.
--
-- O que estava em produção por causa disso: `Maxi Park`, uma rodada de QA, aparecia no
-- catálogo público (`is_listed = true`, 1 foto, 3 tipos de vaga ativos, capacidade 208)
-- ao lado de Abbapark, Aeropark, Aerovalet, Garageinn, Nationpark, Plenty e Virapark. Um
-- cliente conseguia encontrar e tentar reservar uma vaga que ninguém prometeu.
--
-- A regra, uniforme, como a spec pede:
--   * SEM reserva  → `deleted_at` (soft delete). Some de toda consulta que filtra
--     `deleted_at is null`, que é a convenção do repo, e libera o slug para a ficha
--     mapeada reusar a mesma URL quando o lote for remapeado.
--   * COM reserva  → `status = 'inactive'`, nunca delete: é histórico financeiro, e a
--     reserva precisa continuar resolvendo a unidade dela.
--
-- `is_listed = false` entra junto por segurança: soft delete já tira da vitrine (a policy
-- `catalog_read_location` exige `deleted_at is null`), mas se alguém um dia limpar o
-- `deleted_at` para investigar, o registro não volta publicado.
--
-- **Fora desta migration, de propósito:** `Agência Fera` (fixture do E2E, 4 reservas),
-- `Peu Park` (já `inactive`), e as outras três empresas de QA que também estão listadas
-- publicamente e NÃO constam da lista da spec: `Gaita Park` (1 reserva), `Lisboa Park`
-- (0) e `Motion Park` (**65 reservas**, claramente fixture ativa de alguém). Mexer nelas
-- sem confirmar quebraria roteiro de teste em uso. Ver a spec para o encaminhamento.

-- Sem reserva: soft delete.
update public.location l
set deleted_at = now(),
    is_listed = false
from (values
  ('Max Park',        'max-park'),
  ('Maxi Park',       'maxi-park'),
  ('Maxxi Park',      'maxxi-park'),
  ('Vita Park',       'vita-park'),
  ('PER Park',        'per-park'),
  ('Botuquara Park',  'botuquara-park'),
  ('Eco Park',        'eco-park'),
  ('Pare Park',       'pare-park'),
  ('Jaragua Park',    'jaragua-park'),
  ('COW Lapa',        'cow-lapa'),
  ('Nine',            'estacionamento')
) as alvo(empresa, slug)
join public.company c on c.name = alvo.empresa
where l.company_id = c.id
  and l.slug = alvo.slug
  and l.deleted_at is null
  -- Trava de segurança, não decoração: se alguma dessas ganhou reserva entre a apuração e
  -- a aplicação, ela cai no ramo de baixo em vez de sumir com o histórico junto.
  and not exists (select 1 from public.booking b where b.location_id = l.id);

-- Com reserva: inativa, nunca apaga.
update public.location l
set status = 'inactive',
    is_listed = false
from (values
  ('Ferapark', 'unidade-aeroporto')
) as alvo(empresa, slug)
join public.company c on c.name = alvo.empresa
where l.company_id = c.id
  and l.slug = alvo.slug
  and l.deleted_at is null;
