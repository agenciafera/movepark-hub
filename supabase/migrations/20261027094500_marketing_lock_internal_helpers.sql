-- E3.1 · Fecha os ajudantes internos do marketing para o cliente logado.
--
-- Achado do `get_advisors` logo depois da 20261027093000: `marketing_contact_metrics` e
-- `marketing_contact_doc` são `security definer` e NÃO têm gate de `is_hub_admin()` dentro, porque
-- nasceram para ser chamadas de dentro das RPCs do painel (que gateiam). Só que o Supabase concede
-- `execute` a `authenticated` por privilégio padrão, e o `revoke ... from public, anon` da
-- migration anterior não alcança essa concessão explícita.
--
-- Efeito prático do buraco: qualquer cliente logado podia chamar
-- `/rest/v1/rpc/marketing_contact_metrics` e baixar a base inteira, com e-mail, telefone, gasto
-- total e modelo do carro de todo mundo. É vazamento de base de clientes, não de métrica agregada.
--
-- Revogar não quebra as RPCs do painel: dentro de uma função `security definer` quem executa é o
-- dono da função, e o dono continua com `execute`. As seis RPCs de tela (`marketing_profile_matrix`,
-- `marketing_conversion_funnel`, `marketing_segment_preview`, `marketing_leads`,
-- `marketing_move_lead`, `marketing_sync_contacts`) seguem chamando normalmente e continuam
-- gateadas por `is_hub_admin()` na primeira linha.

set search_path = public, extensions;

revoke execute on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz)
  from authenticated, anon, public;

revoke execute on function public.marketing_contact_doc(uuid[])
  from authenticated, anon, public;

revoke execute on function public.marketing_contact_key(text, text, uuid)
  from authenticated, anon, public;

revoke execute on function public.marketing_eval_rule(jsonb, jsonb)
  from authenticated, anon, public;

revoke execute on function public.marketing_eval_definition(jsonb, jsonb)
  from authenticated, anon, public;

comment on function public.marketing_contact_metrics(uuid[], timestamptz, timestamptz) is
  'Ajudante INTERNO: sem gate próprio, chamado de dentro das RPCs do painel. Não conceder execute a authenticated (vazaria a base de clientes).';
comment on function public.marketing_contact_doc(uuid[]) is
  'Ajudante INTERNO: sem gate próprio. Não conceder execute a authenticated.';
