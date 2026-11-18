-- O id de conversão do Google Ads passa a ser guardado sem o `AW-`.
--
-- O que estava errado: a migration `20261201220000` fechou o formato da coluna em
-- `^AW-[0-9]{6,}$`, com o raciocínio de que o id da conta "tem a forma `AW-` + dígitos". Tem, mas
-- esse é o **id da tag do Google** (o id de destino, o que aparece como `AW-17302388529` na tela
-- do Google e no `gtag('config', ...)`). O **id de conversão**, que é o que a tag de Acompanhamento
-- de conversões do Google Ads pede no campo "Código de conversão", é só a parte numérica:
-- `17302388529`.
--
-- Por que ninguém viu: o campo do GTM aceita só inteiro positivo e recusa `AW-...` na cara, com
-- "O valor precisa ser um número inteiro positivo ou 0". Mas o valor chega por variável de camada
-- de dados (`{{partner.ads_conversion_id}}`), e o GTM só valida o campo quando o valor é fixo. A
-- tag salvou sem reclamar, dispara em toda compra e a conversão nunca chega ao Google Ads: sem
-- erro no console, sem aviso no GTM, sem nada no relatório. As duas unidades configuradas (Pare
-- Seguro e Virapark) ficaram assim desde que entraram.
--
-- A correção é nas duas pontas, e esta migration é a do banco: a constraint passa a exigir só
-- dígitos e as linhas existentes perdem o prefixo. O formulário do Manager normaliza na entrada
-- (aceita `17302388529`, `AW-17302388529` e o `send_to` inteiro, grava só o número), e no GTM a
-- condição do acionador `CE | purchase - com conta de Ads do parceiro`, que hoje casa `^AW-`,
-- precisa passar a casar `^[0-9]{6,}$`. Enquanto as duas pontas não estiverem alinhadas a tag não
-- dispara, que é melhor do que disparar sem registrar: não há janela de piora, porque a conversão
-- já valia zero.
--
-- Ver docs/specs/analytics-ecommerce.md §3.1.

-- ──────────────────── Diagnóstico ────────────────────
-- Para conferir antes e depois (o `select` que lista o que está fora do formato novo):
--
--   select l.id, c.slug as empresa, l.slug as unidade, l.ads_conversion_id
--   from public.location l
--   join public.company c on c.id = l.company_id
--   where l.ads_conversion_id is not null
--     and l.ads_conversion_id !~ '^[0-9]{6,}$';
--
-- Em 18/11/2026 esse select devolvia as duas linhas existentes, as duas com o prefixo:
--   pare-seguro / aeroporto-guarulhos → AW-17302388529
--   virapark    / virapark            → AW-326904374

-- ──────────────────── Normalização ────────────────────
-- A constraint antiga sai primeiro: ela exige o prefixo que o update abaixo remove.
alter table public.location
  drop constraint if exists location_ads_conversion_id_format;

-- `regexp_replace` com âncora em vez de `ltrim`: `ltrim(x, 'AW-')` comeria qualquer A, W ou -
-- do começo, e `AW-326904374` não tem, mas um id que começasse com os mesmos caracteres teria.
update public.location
set ads_conversion_id = regexp_replace(ads_conversion_id, '^AW-', '', 'i')
where ads_conversion_id is not null
  and ads_conversion_id ~* '^AW-';

alter table public.location
  add constraint location_ads_conversion_id_format
  check (ads_conversion_id is null or ads_conversion_id ~ '^[0-9]{6,}$');

comment on column public.location.ads_conversion_id is
  'Id de conversão do Google Ads que recebe a conversão de compra desta unidade: só a parte '
  'numérica, SEM o `AW-`. O `AW-17302388529` é o id da tag do Google (id de destino), e o campo '
  '"Código de conversão" da tag do GTM aceita só inteiro positivo. Vai no bloco `partner` do '
  'evento `purchase` e a tag genérica do GTM lê daqui. Nulo = nenhuma conta de parceiro recebe '
  'conversão desta unidade (a da Movepark recebe sempre). Só hub_admin escreve (trigger '
  'location_ads_conversion_guard).';

-- O par e o rótulo não mudam: `location_ads_conversion_pair` e
-- `location_ads_conversion_label_format` seguem como a migration `20261201220000` deixou.
