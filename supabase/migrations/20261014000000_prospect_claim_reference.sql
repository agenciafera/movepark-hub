-- E0.17-g (versão curta): a reivindicação carrega de qual lote mapeado ela veio.
--
-- O link assinado com HMAC e o OTP no telefone ficam para depois. O valor deles é impedir
-- que o concorrente reivindique o lote alheio, e com aprovação humana no board isso é
-- defesa em profundidade, não o único portão. Passa a valer quando o volume tornar a
-- triagem manual cara.
--
-- O que NÃO dá para adiar é o carimbo da procedência, e é o miolo desta migration: sem
-- ele, no dia em que o lead vira parceiro, a ficha mapeada e a unidade nova passam a
-- renderizar as duas, disputando a mesma busca. É exatamente o estado que o filtro
-- `converted_at is null` da RLS foi feito para impedir, e ele só funciona se alguém
-- escrever o carimbo.
--
-- Três razões para carregar a referência, e nenhuma delas é encurtar o processo (o
-- estacionamento passa pelo funil inteiro do mesmo jeito):
--   1. atribuição: qual página de lote converteu um dono, que é o espelho B2B do ranking
--      de demanda do viajante;
--   2. a procedência, que responde "quantos dos mapeados viraram parceiro" num select em
--      vez de num palpite;
--   3. preenchimento: nome, endereço e telefone já foram resolvidos na Places API, e
--      fazer um lead B2B frio digitar tudo de novo é atrito de graça.
--
-- Ver docs/specs/lote-mapeado-vitrine.md.

-- ── 1. Onde a referência mora ────────────────────────────────────────────────────────
-- Em `company_onboarding`, e não em `partner_lead`: quem cria empresa é o
-- `submit_partner_lead`, e ele grava contato, cidade e UTM aqui. A referência é a mesma
-- família de dado (de onde veio este lead), então mora junto.
--
-- `on delete set null` preserva a propriedade que o ADR-010 comprou: excluir um lote
-- mapeado continua sendo `delete` de verdade, sem linha órfã travando a exclusão.
alter table public.company_onboarding
  add column if not exists prospect_location_id uuid
    references public.prospect_location (id) on delete set null;

comment on column public.company_onboarding.prospect_location_id is
  'Lote mapeado de onde esta reivindicação partiu (E0.17-g). Atribuição da página + origem do carimbo de procedência em prospect_location.';

create index if not exists company_onboarding_prospect_idx
  on public.company_onboarding (prospect_location_id)
  where prospect_location_id is not null;

-- ── 2. O lead carrega a referência ───────────────────────────────────────────────────
-- Dropa a assinatura antiga em vez de somar uma sobrecarga: duas funções com o mesmo nome
-- onde uma tem parâmetro em default deixam a chamada ambígua no PostgREST, que é o defeito
-- que hoje trava o pgTAP do `_apply_pricing`. Não repetir o padrão.
drop function if exists public.submit_partner_lead(
  text, text, text, text, text, text, text, text, integer, text, text, text, text, text);

create function public.submit_partner_lead(
  p_company_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_tax_id text default null,
  p_contact_role text default null,
  p_city text default null,
  p_state text default null,
  p_estimated_spots integer default null,
  p_message text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_referrer text default null,
  p_prospect_location_id uuid default null
) returns uuid
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_prospect_id uuid;
begin
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório.' using errcode = 'P0001';
  end if;

  -- A referência é validada, não confiada: ela chega de um parâmetro de URL, e um uuid
  -- inventado (ou de ficha já convertida) viraria atribuição falsa e, pior, carimbo
  -- errado lá na frente. Referência que não resolve simplesmente não é gravada, e o lead
  -- segue: perder atribuição é aceitável, recusar um parceiro real não é.
  if p_prospect_location_id is not null then
    select p.id into v_prospect_id
    from public.prospect_location p
    where p.id = p_prospect_location_id
      and p.converted_at is null;
  end if;

  insert into public.company (name, slug, tax_id, status, onboarding_status)
  values (trim(p_company_name), public.generate_unique_company_slug(p_company_name),
    nullif(trim(coalesce(p_tax_id, '')), ''), 'inactive', 'pending_review')
  returning id into v_company_id;

  insert into public.company_onboarding (
    company_id, contact_name, contact_email, contact_phone, contact_role,
    city, state, estimated_spots, message, utm_source, utm_medium, utm_campaign, referrer,
    prospect_location_id)
  values (v_company_id, trim(p_contact_name), lower(trim(p_contact_email)), trim(p_contact_phone), p_contact_role,
    p_city, p_state, p_estimated_spots, p_message, p_utm_source, p_utm_medium, p_utm_campaign, p_referrer,
    v_prospect_id);

  return v_company_id;
end; $$;

revoke all on function public.submit_partner_lead(
  text, text, text, text, text, text, text, text, integer, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_partner_lead(
  text, text, text, text, text, text, text, text, integer, text, text, text, text, text, uuid)
  to service_role;

-- ── 3. O carimbo da procedência ──────────────────────────────────────────────────────
-- Entra onde a unidade NASCE, que é o único ponto em que existe um `location.id` para
-- apontar. Só no ramo de INSERT, e só uma vez: `converted_at is null` no WHERE torna o
-- carimbo idempotente e faz a ficha converter para a PRIMEIRA unidade criada, que é o
-- comportamento certo quando o parceiro cadastra mais de uma depois.
--
-- Converter aqui NÃO publica oferta: a `location` nasce `inactive` e sem tipo de vaga, e
-- quem publica é o `onboarding_publish`. O que o carimbo faz é tirar a ficha da página de
-- destino, para o lote não aparecer duas vezes enquanto o parceiro monta a oferta.
create or replace function public.onboarding_upsert_location(
  p_company_id uuid,
  p_location_id uuid,
  p_name text,
  p_address text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_timezone text default 'America/Sao_Paulo',
  p_phone text default null,
  p_email text default null,
  p_reservation_policy text default null,
  p_photos jsonb default '[]'::jsonb,
  p_destination_id uuid default null,
  p_has_shuttle boolean default null
) returns uuid
  language plpgsql security definer
  set search_path to 'public'
as $$
declare v_location_id uuid := p_location_id;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if v_location_id is null then
    insert into public.location (
      company_id, name, slug, address, latitude, longitude, timezone, status,
      phone, email, reservation_policy, photos, destination_id, has_shuttle)
    values (
      p_company_id, trim(p_name), public.generate_unique_location_slug(p_company_id, p_name),
      p_address, p_latitude, p_longitude, coalesce(nullif(trim(coalesce(p_timezone,'')),''), 'America/Sao_Paulo'),
      'inactive', p_phone, p_email, p_reservation_policy, coalesce(p_photos, '[]'::jsonb),
      p_destination_id, coalesce(p_has_shuttle, false))
    returning id into v_location_id;

    update public.prospect_location p
       set converted_location_id = v_location_id,
           converted_at = now()
     where p.id = (
             select co.prospect_location_id
             from public.company_onboarding co
             where co.company_id = p_company_id
           )
       and p.converted_at is null;
  else
    update public.location set
      name = coalesce(nullif(trim(p_name), ''), name),
      address = p_address,
      latitude = p_latitude,
      longitude = p_longitude,
      timezone = coalesce(nullif(trim(coalesce(p_timezone,'')),''), timezone),
      phone = p_phone,
      email = p_email,
      reservation_policy = p_reservation_policy,
      photos = coalesce(p_photos, photos),
      destination_id = coalesce(p_destination_id, destination_id),
      has_shuttle = coalesce(p_has_shuttle, has_shuttle)
    where id = v_location_id and company_id = p_company_id;
    if not found then
      raise exception 'Localização não encontrada para esta empresa.' using errcode = 'P0001';
    end if;
  end if;
  perform public.onboarding_bump_step(p_company_id, 2);
  return v_location_id;
end; $$;
