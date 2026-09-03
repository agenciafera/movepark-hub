-- O robô de pesquisa de preço de concorrente: propõe, nunca publica.
--
-- Por que existe. A `20261107090000` abriu as colunas de preço pesquisado e a
-- `20261111091500` deu validade de 90 dias a elas. As duas juntas descrevem um ciclo que
-- hoje ninguém fecha: são **4 fichas com preço entre 145 mapeadas**, todas conferidas à mão
-- em 28 e 29/08/2026, e no dia 27/11/2026 as quatro vencem e a página de destino volta a não
-- responder "quanto custa" em 21 dos 26 destinos. Reconferir 145 sites à mão, de 90 em 90
-- dias, não acontece. O que não tem robô não tem cadência.
--
-- ── A regra que decide o desenho inteiro ──────────────────────────────────────────────
--
-- O robô NÃO escreve em `prospect_location`. Ele escreve numa fila de propostas, e um
-- hub_admin aplica. Isso não é excesso de zelo: o número publicado é uma afirmação da
-- Movepark sobre o preço de outra empresa, e quem responde por ela é uma pessoa. Um modelo
-- lendo HTML confunde diária com mensalidade, pega preço de moto, pega promoção expirada e
-- pega o preço de outra unidade da mesma rede. Qualquer um desses erros publicado sozinho é
-- exatamente o processo que a validade de 90 dias existe para evitar.
--
-- O que o robô entrega, então, não é o preço: é o trabalho braçal de achar a fonte, abrir a
-- página e destacar o trecho. A decisão continua humana, e passa a levar segundos em vez de
-- uma tarde.
--
-- ── A prova viaja junto ───────────────────────────────────────────────────────────────
--
-- Cada proposta guarda a URL, o instante do acesso e o TRECHO LITERAL da página de onde os
-- números saíram. É isso que transforma "achamos que o Park Confins cobra R$ 35" em "em
-- 12/11/2026 o site do Park Confins publicava esta frase". Se a reclamação vier do
-- concorrente, a resposta é o trecho, não a memória de quem digitou.
--
-- Ao aplicar, os QUATRO valores são substituídos pelos da proposta, inclusive os nulos. A
-- linha inteira passa a descrever uma leitura só, de uma fonte só, numa data só. Misturar
-- diária de novembro com semanal de agosto sob um único `researched_at` seria publicar uma
-- data que não vale para metade dos números.
--
-- ── O que este arquivo NÃO faz ────────────────────────────────────────────────────────
--
-- Não afrouxa o ADR-010: nenhuma coluna nova em `prospect_location` (a tabela de propostas é
-- separada, e o site nunca a lê), nada vira `Offer` no JSON-LD, nada toca `booking`, `fare`,
-- cupom ou payout. Não guarda o site do concorrente em `prospect_location`: a URL é
-- redescoberta a cada passada pelo `google_place_id`, porque endereço de site do concorrente
-- não aparece na página de destino e a regra de crescimento do ADR-010 não o autorizaria.
--
-- Ver docs/specs/pesquisa-de-preco-concorrente.md.

-- ── 1. A fila de propostas ───────────────────────────────────────────────────────────

create table if not exists public.prospect_price_research (
  id uuid primary key default gen_random_uuid(),
  prospect_location_id uuid not null
    references public.prospect_location(id) on delete cascade,

  -- `failed` existe para a passada que não conseguiu ler nada guardar o motivo: sem isso, um
  -- lote cujo site morreu voltaria à fila toda semana e ninguém saberia por quê.
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'failed')),

  -- De onde veio. `source_url` é a URL exata que foi lida, não o domínio.
  source_url text,
  fetched_at timestamptz,

  -- O que o modelo extraiu. Nulo é resposta legítima: quer dizer "a página não publica esta
  -- duração", e é melhor que um número inventado por simetria.
  daily_brl numeric(10, 2),
  weekly_brl numeric(10, 2),
  biweekly_brl numeric(10, 2),
  monthly_brl numeric(10, 2),

  -- A prova. Trecho literal copiado da página, o que sustenta os números acima.
  evidence text,
  model text,
  -- O que o robô tem a dizer quando não achou preço, quando o site caiu ou quando o
  -- robots.txt recusou. É o que a tela mostra no lugar dos números.
  notes text,

  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz not null default now(),

  -- Zero num campo de preço é campo mal preenchido, aqui pelo mesmo motivo da
  -- `prospect_researched_price_positive` na tabela de destino.
  constraint price_research_positive check (
    coalesce(daily_brl, 1) > 0
    and coalesce(weekly_brl, 1) > 0
    and coalesce(biweekly_brl, 1) > 0
    and coalesce(monthly_brl, 1) > 0
  ),
  -- Proposta aplicável precisa de fonte e de instante: é o par que vira `research_source` e
  -- `researched_at` do outro lado, e a constraint de lá recusa preço sem eles.
  constraint price_research_pending_needs_source check (
    status <> 'pending'
    or (daily_brl is null and weekly_brl is null and biweekly_brl is null and monthly_brl is null)
    or (source_url is not null and fetched_at is not null)
  )
);

-- Uma proposta aberta por lote. Duas seriam duas verdades esperando decisão, e a segunda
-- passada semanal criaria a segunda sozinha.
create unique index if not exists price_research_uma_pendente_por_lote
  on public.prospect_price_research (prospect_location_id)
  where status = 'pending';

create index if not exists price_research_lote_idx
  on public.prospect_price_research (prospect_location_id, created_at desc);

comment on table public.prospect_price_research is
  'Fila de propostas de preço de concorrente (robô semanal). O robô escreve aqui; só hub_admin aplica em prospect_location. O site nunca lê esta tabela.';
comment on column public.prospect_price_research.evidence is
  'Trecho literal da página que sustenta os valores. É a prova que responde a uma reclamação do concorrente.';

alter table public.prospect_price_research enable row level security;

-- Leitura só de hub_admin, e escrita nenhuma pelo cliente: quem escreve é o robô (service
-- role) e a RPC de decisão, que é definer.
drop policy if exists price_research_admin_read on public.prospect_price_research;
create policy price_research_admin_read on public.prospect_price_research
  for select to authenticated using (public.is_hub_admin());

-- ── 2. A fila que a tela lê ──────────────────────────────────────────────────────────
--
-- Devolve a proposta ao lado do que está publicado hoje, porque a decisão é sempre
-- comparativa: "de R$ 22,90 (29/08) para R$ 24,90 (12/11)" se decide numa olhada, e dois
-- números soltos em telas diferentes, não.
create or replace function public.manager_price_research_pending()
returns table (
  id uuid,
  prospect_location_id uuid,
  prospect_name text,
  destination_name text,
  status text,
  source_url text,
  fetched_at timestamptz,
  daily_brl numeric,
  weekly_brl numeric,
  biweekly_brl numeric,
  monthly_brl numeric,
  evidence text,
  model text,
  notes text,
  created_at timestamptz,
  atual_daily_brl numeric,
  atual_weekly_brl numeric,
  atual_biweekly_brl numeric,
  atual_monthly_brl numeric,
  atual_researched_at date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a pesquisa de preço.' using errcode = '42501';
  end if;

  return query
  select
    r.id, r.prospect_location_id, p.name, d.name, r.status,
    r.source_url, r.fetched_at,
    r.daily_brl, r.weekly_brl, r.biweekly_brl, r.monthly_brl,
    r.evidence, r.model, r.notes, r.created_at,
    p.researched_daily_brl, p.researched_weekly_brl,
    p.researched_biweekly_brl, p.researched_monthly_brl, p.researched_at
  from public.prospect_price_research r
  join public.prospect_location p on p.id = r.prospect_location_id
  join public.destination d on d.id = p.destination_id
  where r.status in ('pending', 'failed')
  order by r.created_at asc;
end;
$$;

revoke all on function public.manager_price_research_pending() from public, anon;
grant execute on function public.manager_price_research_pending() to authenticated, service_role;

-- ── 3. A decisão ─────────────────────────────────────────────────────────────────────

create or replace function public.manager_price_research_decide(
  p_id uuid,
  p_action text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.prospect_price_research;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a pesquisa de preço.' using errcode = '42501';
  end if;

  if p_action not in ('apply', 'reject') then
    raise exception 'Ação inválida: %', p_action using errcode = 'P0001';
  end if;

  select * into r from public.prospect_price_research where id = p_id for update;
  if not found then
    raise exception 'Proposta não encontrada.' using errcode = 'P0001';
  end if;
  if r.status not in ('pending', 'failed') then
    raise exception 'Proposta já decidida (%).', r.status using errcode = 'P0001';
  end if;

  if p_action = 'apply' then
    if coalesce(r.daily_brl, r.weekly_brl, r.biweekly_brl, r.monthly_brl) is null then
      raise exception 'Proposta sem nenhum valor não pode ser aplicada.' using errcode = 'P0001';
    end if;
    if r.source_url is null or r.fetched_at is null then
      raise exception 'Proposta sem fonte e sem data não pode ser aplicada.' using errcode = 'P0001';
    end if;

    -- Os quatro de uma vez, nulos inclusive: a linha passa a descrever UMA leitura, de uma
    -- fonte só, numa data só. Ver o cabeçalho.
    update public.prospect_location
       set researched_daily_brl    = r.daily_brl,
           researched_weekly_brl   = r.weekly_brl,
           researched_biweekly_brl = r.biweekly_brl,
           researched_monthly_brl  = r.monthly_brl,
           researched_at           = (r.fetched_at at time zone 'America/Sao_Paulo')::date,
           research_source         = r.source_url,
           last_reviewed_at        = now()
     where id = r.prospect_location_id;
  end if;

  update public.prospect_price_research
     set status = case when p_action = 'apply' then 'applied' else 'rejected' end,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end;
$$;

revoke all on function public.manager_price_research_decide(uuid, text, text) from public, anon;
grant execute on function public.manager_price_research_decide(uuid, text, text) to authenticated, service_role;

comment on function public.manager_price_research_decide(uuid, text, text) is
  'Aplica ou recusa uma proposta do robô de pesquisa. Aplicar substitui os quatro preços do lote, a data e a fonte de uma vez.';

-- ── 4. A chave do cron, gerada e conferida dentro do banco ───────────────────────────
--
-- Os outros seis crons de Edge deste projeto guardam a chave em dois lugares: no Vault (para
-- o pg_cron mandar no header) e nos secrets da Edge (para a função comparar). Aqui ela mora
-- só no Vault, e a Edge pergunta ao banco se bate.
--
-- Duas razões. O valor nunca precisa ser lido por um humano nem passar por terminal, CLI ou
-- transcrição de sessão: nasce de `gen_random_bytes` aqui dentro. E rotacionar vira um UPDATE
-- no Vault, sem redeploy da função. A função devolve booleano e nunca o segredo, e só
-- `service_role` executa.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'prospect_price_research_key',
  'Header x-price-research-key do robo semanal de pesquisa de preco'
) where not exists (select 1 from vault.secrets where name = 'prospect_price_research_key');

create or replace function public.cron_key_matches(p_name text, p_key text)
returns boolean
language sql
stable
security definer
set search_path = vault, pg_temp
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
     where s.name = p_name
       and nullif(p_key, '') is not null
       and s.decrypted_secret = p_key
  );
$$;

comment on function public.cron_key_matches(text, text) is
  'Confere o header de um cron de Edge contra o segredo do Vault, sem devolver o segredo. Só service_role executa.';

revoke all on function public.cron_key_matches(text, text) from public, anon, authenticated;
grant execute on function public.cron_key_matches(text, text) to service_role;

-- ── 5. O cron ────────────────────────────────────────────────────────────────────────
--
-- Semanal, e não diário: preço de estacionamento não muda toda semana, cada passada custa
-- chamada de Places, download de página e chamada de modelo, e a validade é de 90 dias, o
-- que dá doze passadas de folga antes de um preço vencer. Domingo 05:00 UTC (02:00 em São
-- Paulo) é o buraco entre o espelho de preço (04:00 e 07:00) e o refresh do Google (03:00).
--
-- A chave vem do Vault, criada logo acima.
select cron.unschedule('prospect-price-research')
 where exists (select 1 from cron.job where jobname = 'prospect-price-research');

select cron.schedule(
  'prospect-price-research',
  '0 5 * * 0',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/prospect-price-research',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-price-research-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'prospect_price_research_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
