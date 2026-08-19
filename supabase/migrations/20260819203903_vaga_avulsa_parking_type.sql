-- Vaga Avulsa: novo tipo de vaga no catálogo + Garageinn reatribuída + RLS de escrita.
--
-- A Garageinn (única unidade: Aeroporto de Viracopos) tinha o único company_parking_type
-- dela apontando pro catálogo "uncovered"/"Vaga Descoberta" — uma promessa física que
-- ninguém verificou. Na prática a Garageinn vende vaga avulsa: sem local fixo reservado,
-- sujeita à lotação do pátio, não uma vaga comprovadamente descoberta. Renomear a linha
-- global "uncovered" quebraria as outras ~20 empresas que usam coberto/descoberto como
-- produtos reais e distintos, então o tipo ganha linha própria no catálogo.
--
-- Pra continuar aparecendo quando o cliente filtra "Descoberto" (decisão de produto: a
-- Garageinn não garante cobertura, mas também não é incorreta ali), o filtro de busca
-- (supabase/functions/search/facets.ts, filterByCategory) trata "avulsa" como equivalente
-- de "uncovered" na hora de casar o filtro. O code aqui no catálogo continua distinto —
-- é isso que permite editar e filtrar os dois tipos em separado.
--
-- Editar QUAL tipo uma empresa vende (não só preço/capacidade, que já era editável via
-- location_parking_type) não tinha caminho nenhum: nem UI, nem RLS de escrita em
-- company_parking_type — só existiam as duas policies de leitura (catalog_read_company_
-- parking_type, cpt_select). Fecha os dois lados: a policy (mesmo escopo parking-
-- types:write que já vale pra location_parking_type, ADR-005) e os dados da Garageinn.
--
-- Bônus: location_parking_type tinha a mesma lacuna do lado do insert (só existia
-- lpt_operator_update) — "Novo tipo" no admin (useCreateLocationParkingType) nunca
-- funcionou fora do onboarding, que passa por onboarding_set_parking_types (SECURITY
-- DEFINER). Fecha com o mesmo escopo, resolvido a partir da location.

-- 1. Novo tipo no catálogo global.
insert into public.parking_type (code, name, description)
values (
  'avulsa',
  'Vaga Avulsa',
  'Vaga sem local fixo: fica sujeita à lotação do pátio no momento da chegada.'
);

-- 2. Garageinn reatribuída de "uncovered" pra "avulsa" (único company_parking_type dela).
update public.company_parking_type
set parking_type_id = (select id from public.parking_type where code = 'avulsa')
where id = '69462a09-e46d-4fc3-af0f-29536426af95'
  and company_id = '2783dc63-0ece-47c9-aeeb-e7ea44e7c7dc';

-- 3. RLS de escrita em company_parking_type — hoje só existia leitura.
drop policy if exists "cpt_operator_update" on public.company_parking_type;
create policy "cpt_operator_update" on public.company_parking_type for update
  using (
    public.is_hub_admin() or public.member_has_scope(company_id, 'parking-types:write')
  );

drop policy if exists "cpt_operator_insert" on public.company_parking_type;
create policy "cpt_operator_insert" on public.company_parking_type for insert
  with check (
    public.is_hub_admin() or public.member_has_scope(company_id, 'parking-types:write')
  );

-- 4. location_parking_type: fecha o insert que faltava (update já existia, lpt_operator_update).
drop policy if exists "lpt_operator_insert" on public.location_parking_type;
create policy "lpt_operator_insert" on public.location_parking_type for insert
  with check (
    public.is_hub_admin()
    or public.member_has_scope(
      (select l.company_id from public.location l where l.id = location_id),
      'parking-types:write'
    )
  );

-- 5. FAQ da unidade explicando o que é vaga avulsa (ADR-002, scope location).
-- Categoria "Reservas": é sobre o que o cliente está reservando, não sobre check-in.
insert into public.faq (scope, location_id, category_id, question, answer, sort_order)
values (
  'location',
  'c82d2dc0-7304-4bb3-9989-bf99886cd698', -- Garageinn · Aeroporto de Viracopos
  '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', -- categoria "Reservas"
  'O que é uma vaga avulsa?',
  'Na vaga avulsa, você não tem um lugar fixo marcado no pátio. Sua vaga fica garantida '
  || 'dentro da capacidade contratada, mas a posição exata varia com a lotação no momento '
  || 'da sua chegada.',
  10
);
