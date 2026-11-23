-- Aviso do estacionamento por unidade (23/11/2026).
-- Spec: docs/specs/aviso-do-estacionamento.md.
--
-- Por quê: a Pare Seguro (Guarulhos) vai cobrar por mala extra, porque cliente chega com 6 a 8
-- malas, a van lota e gente fica sem embarcar. A Movepark não cobra nada; o papel do Hub é dar
-- ciência ao cliente ANTES de ele pagar e de novo antes de ele chegar. O aviso sai na ficha da
-- unidade, no resumo do checkout, no e-mail de confirmação e no voucher, só quando preenchido.
--
-- Por que coluna nova, e não o `notice` que já existe: `notice` é o AVISO CRÍTICO DE ENTRADA
-- ("o GPS erra a entrada"), texto puro, ligado por `has_notice` e mostrado só no bloco "Como
-- chegar" da ficha (PRD-11). Isto aqui é política do parceiro, em Markdown restrito, e viaja
-- com a reserva. Misturar os dois faria o aviso de malas aparecer como erro de GPS.
--
-- Formato: Markdown RESTRITO (negrito, itálico, lista, link). Nada de HTML cru: a constraint
-- recusa `<` seguido de letra, barra ou `!`, e os renderizadores escapam tudo antes de montar
-- o HTML do e-mail. 2.000 caracteres é teto de leitura, não de armazenamento: o voucher em PDF
-- tem uma folha só.
-- Idempotente (o `db push` reaplica arquivos que o remoto registrou com outro carimbo).

alter table public.location add column if not exists partner_notice_md text;

comment on column public.location.partner_notice_md is
  'Aviso do estacionamento (política do parceiro que o cliente precisa saber antes de chegar), em Markdown restrito: negrito, itálico, lista e link. Sai na ficha, no checkout, no e-mail de confirmação e no voucher, só quando preenchido. Nulo = nenhum aviso. Diferente de `notice`, que é o aviso crítico de entrada do bloco Como chegar.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'location_partner_notice_md_tamanho') then
    alter table public.location add constraint location_partner_notice_md_tamanho
      check (partner_notice_md is null or char_length(partner_notice_md) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'location_partner_notice_md_sem_html') then
    alter table public.location add constraint location_partner_notice_md_sem_html
      check (partner_notice_md is null or partner_notice_md !~ '<\s*[A-Za-z/!]');
  end if;
end $$;

-- `location` tem SELECT de tabela para anon e authenticated, então a coluna já sai para a
-- ficha pública e para o checkout. A escrita segue a policy `location_operator_update`
-- (hub_admin, ou membro com `locations:write`: Dono e Gerente), e o trigger de statement
-- `location_site_rebuild` republica a ficha pré-renderizada no UPDATE (nenhum dos dois precisa
-- mudar). A fila da base de conhecimento (Mia) NÃO lê esta coluna ainda: ver a spec.
