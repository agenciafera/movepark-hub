-- Mia para operadores: liberação por empresa.
--
-- Até aqui a Mia valia para todo parceiro ao mesmo tempo (`app_setting.operator_assistant.enabled`).
-- A partir daqui ela só aparece para a empresa que estiver nesta lista. A chave global continua
-- existindo e continua mandando: com ela desligada, ninguém usa, mesmo empresa liberada. Ela é o
-- desligamento de emergência; a lista é quem tem a Mia.
--
-- A liberação começa só pela Agência Fera, a empresa da unidade de teste. Ligar e desligar as
-- outras é pelo Manager › Mia para operadores › Empresas.
--
-- Quem decide se a bolinha aparece é `operator_assistant_liberado`, e a Edge `operator-assistant`
-- chama a MESMA função, sob o JWT da pessoa, antes de falar com o agente ou executar uma ação.
-- Uma regra só, sem cópia no front. Ver docs/specs/assistente-do-operador.md.

create table if not exists public.operator_assistant_company (
  company_id uuid primary key references public.company(id) on delete cascade,
  enabled_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.operator_assistant_company is
  'Empresas com a Mia para operadores liberada. Sem linha, a bolinha não aparece e a Edge recusa.';

alter table public.operator_assistant_company enable row level security;
revoke all on table public.operator_assistant_company from anon, authenticated;
grant select, insert, delete on table public.operator_assistant_company to authenticated;

-- Só a equipe Movepark liga e desliga. O parceiro não lê a lista: ele só pergunta pela própria
-- empresa, pela função abaixo.
create policy operator_assistant_company_admin on public.operator_assistant_company
  for all to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

-- A Mia está liberada para esta pessoa nesta empresa?
-- Falso quando: a pessoa não é da empresa (e não é hub_admin), a chave global está desligada ou a
-- empresa não está na lista. A config é texto em `app_setting`; JSON torto não derruba a bolinha,
-- vale o padrão (ligada), igual ao `lerConfig` da Edge.
create or replace function public.operator_assistant_liberado(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
begin
  if auth.uid() is null or p_company_id is null then
    return false;
  end if;

  if not (
    public.is_hub_admin()
    or exists (
      select 1 from public.profile_company pc
      where pc.profile_id = auth.uid() and pc.company_id = p_company_id
    )
  ) then
    return false;
  end if;

  begin
    select s.value::jsonb into v_cfg from public.app_setting s where s.key = 'operator_assistant';
  exception when others then
    v_cfg := null;
  end;
  if v_cfg is not null and jsonb_typeof(v_cfg) = 'object' and v_cfg->'enabled' = 'false'::jsonb then
    return false;
  end if;

  return exists (
    select 1 from public.operator_assistant_company oac where oac.company_id = p_company_id
  );
end;
$$;

revoke all on function public.operator_assistant_liberado(uuid) from public, anon;
grant execute on function public.operator_assistant_liberado(uuid) to authenticated;

-- Começa só pela Agência Fera.
insert into public.operator_assistant_company (company_id, enabled_by)
select c.id, null from public.company c where c.slug = 'agencia-fera' and c.deleted_at is null
on conflict (company_id) do nothing;
