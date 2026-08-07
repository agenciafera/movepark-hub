# Checkout externo por local (E0.14)

> **Épico:** E0.14 · **Fase:** 0 · **Q vinculados:** Q-017, Q-018
> **Status:** implementado em 04/08/2026 (migration `20260921000000_checkout_mode_external.sql`).
> Nada virou `external` ou `silent` na base: os defaults preservam o comportamento atual e a
> virada é ato de `hub_admin`, unidade por unidade.

Permite que uma unidade apareça na vitrine do Hub e feche a reserva no white-label do
parceiro, **sem que o parceiro saiba ou precise fazer nada**.

## Por quê

Trazer para o Hub uma reserva que já entra como afiliado rende **+R$ 3,65** por reserva
(de R$ 27,37 para R$ 31,02) e custa renegociação de contrato, dois painéis para o dono,
voucher novo e o risco de pagamento, suporte e cancelamento passando a ser nossos. Mover
uma reserva de entrada direta para o nosso canal rende **+R$ 13,11** e não exige nada disso.
Logo: base instalada aponta para fora, lote novo nasce no Hub.

## O que JÁ existe (reaproveita, não reescreve)

| Camada | Onde |
|---|---|
| Conexão com o WL | `company.wl_domain` (backend), `wl_tenant_key`, `wl_sync_enabled` |
| De/Para de vaga | `location_parking_type.wl_category_slug` + `wl_product_slug` |
| Admin do De/Para | `src/routes/parking-types.tsx`, alimentado por `useWlCatalog` (dropdown) |
| Catálogo do parceiro | `wlGetCatalog()` em `supabase/functions/_shared/wl/client.ts` |
| Sync / reconciliação | `wl-sync`, `wl-reconcile`, `wl-deliver`; `wl_reconcile_log` |

⚠️ `checkout_handoff` **NÃO é isso**: é sessão para reserva feita por agente (`#ht=`).
Nome parecido, propósito diferente. Não reaproveitar.

## Schema novo

```sql
alter table public.location
  add column checkout_mode text not null default 'hub'
    check (checkout_mode in ('hub','external')),
  add column checkout_mode_changed_at timestamptz,
  add column checkout_mode_changed_by uuid references profiles(id);

alter table public.company
  add column hub_relationship text not null default 'onboarded'
    check (hub_relationship in ('silent','onboarded')),
  add column wl_public_domain text;
```

**São dois níveis para duas perguntas diferentes.** Empresa responde "o parceiro sabe que
existe no Hub?"; local responde "onde a reserva fecha?". Hoje toda empresa `silent` tem
todos os locais `external`, mas quando começarmos a negociar a migração vai existir o caso
intermediário: parceiro já onboardado com um local ainda externo. Um campo só obrigaria a
reescrever nessa hora.

**Por que `checkout_mode` em `location` e não em `company`:** o Aerovalet tem três locais em
três aeroportos, e GRU pode ir nativo enquanto os outros seguem externos. **E não em
`location_parking_type`:** a página é por local e o objeto de capacidades é lido uma vez por
página. Modo por tipo de vaga obrigaria a mesma single a prometer e negar cancelamento ao
mesmo tempo, que é exatamente o que o ADR-009 proíbe.

`location.is_listed` é outro eixo e não se mistura: aparecer na vitrine e onde a reserva
fecha são independentes.

## URL de saída: compor, não guardar

```
https://{company.wl_public_domain}/{lpt.wl_category_slug}/{lpt.wl_product_slug}?utm_source=...&utm_medium=organic&utm_campaign=afiliado-movepark
```

Exemplo real: `https://virapark.movepark.co/virapark/vaga-coberta?utm_campaign=afiliado-movepark`

**Composição no servidor, nunca no front.** A marcação de afiliado é o que separa 17% de 9%
de participação; se um link sair sem ela, a receita cai quase pela metade naquela venda e
**nenhum relatório avisa**. Entra como teste automatizado, não como item de checklist.

⚠️ **Dois domínios distintos:** `virapark-app.movepark.co` é o backend (é o que está em
`wl_domain`); `virapark.movepark.co` é o frontend e é quem recebe a tag. **Não derivar** um do
outro removendo o `-app`, que quebra no dia em que um parceiro usar domínio próprio.

**O UTM do botão prevalece sobre o que veio de fora (decidido em 04/08/2026).** Se o cliente
chegou ao Hub com `?utm_source=google&utm_campaign=black-friday`, esses valores **não** entram no
link de saída: a tripla sai sempre fixa. Os dois conjuntos respondem perguntas diferentes em
sistemas diferentes. O UTM de entrada responde "o que trouxe essa pessoa até a Movepark?", é
capturado em `src/lib/utm.ts` (last-touch em `sessionStorage`), vira `booking.utm_*` e alimenta o
`/manager/attribution`. O UTM de saída responde "quem mandou esse visitante pra você?" no Analytics
do parceiro, e a resposta é sempre a mesma: a Movepark, como afiliado.

Repassar seria entregar a marcação comercial para o tráfego controlar: o relatório do parceiro
diria que a visita veio do Google, a comissão daquela venda cairia quase pela metade, e cairia em
silêncio, só nos links de quem chegou por campanha. **Mesclar UTM de entrada na URL de saída é
proibido**, inclusive "só no `utm_content`". O pgTAP compara a URL inteira, então a tentativa
quebra o teste antes de quebrar a receita.

Efeito colateral aceito: não dá para responder "qual campanha da Movepark gerou este clique de
saída?" olhando só a URL. Quando essa pergunta importar, a resposta é o evento da E0.16, que é
nosso e não trafega no link do parceiro.

✅ Verificado em 03/08/2026: o frontend aceita o **mesmo** slug da API
(`/virapark/vaga-coberta` carrega). Não precisa de campo de slug público; `/vaga-avulsa` é
alias antigo.

## Contexto da busca viaja no link (E0.15)

Sem as datas, quem clica recomeça a seleção no site do parceiro, e a desistência acontece bem
no ponto de saída. O white-label aceita as datas na query e **mantém a seleção**:

```
?startDateTime=2026-08-12T16%3A00%3A00.000Z&endDateTime=2026-08-21T16%3A00%3A00.000Z
```

ISO 8601 em **UTC**, com milissegundos, e os dois-pontos percent-encoded.

⚠️ **Converta pelo fuso da unidade, não pelo do navegador.** `location.timezone` existe na
tabela justamente para isso. Um check-in de 13:00 em São Paulo é `16:00:00.000Z`; se a conta
sair pelo relógio de quem navega, o cliente que abre o link de outro fuso chega ao parceiro com
outro horário, e a divergência aparece só no balcão.

**Quem monta o quê.** A URL base, com a marcação de afiliado, continua vindo pronta do servidor
(`external_checkout_url`). O front **só acrescenta** `startDateTime` e `endDateTime` no fim, num
helper único e testado. Acrescentar no fim é seguro porque não toca nos parâmetros que já vieram;
**reescrever ou remontar a query no cliente é proibido**, pelo mesmo motivo do UTM: é assim que a
marcação de afiliado some sem ninguém notar. O teste do helper afirma que os três `utm_*`
sobrevivem intactos depois do append.

## Prazo de validade da exceção

**Data de revisão: 20/01/2027**, quando a negociação com os estacionamentos acontece.

A exceção é nominal e tem prazo por desenho: sem data, ela vira o caminho padrão por inércia e o
checkout do Hub nunca é exercitado em produção, que é o risco levantado quando o modelo foi
proposto. A data serve para **forçar a revisão**, não para desligar a venda sozinha: expirar em
silêncio derrubaria uma unidade viva sem ninguém olhando. O comportamento no vencimento é avisar
e destacar no Manager, mantendo a decisão de reverter com gente.

## Permissão

Super admin é `user_role = 'hub_admin'`. Parceiro é `company_operator` (com `company_role`
owner/operator/manager/finance) e **nenhum deles pode encostar em `checkout_mode`**.

- **Esconder o campo no React não é permissão.** Sob `locations:write`, um operador muda por
  API sem ver a tela. Precisa de regra de RLS: coluna gravável só por `hub_admin`.
- **Não criar scope novo em `api_scope`.** Aquela tabela é para chave de API de parceiro, e
  nunca se quer que uma chave de parceiro mude onde a reserva acontece. Regra dura, não
  escopo delegável.

## Validação de pré-voo

Não deixa ligar `external` se:
- a empresa não tiver `wl_public_domain`, `wl_domain` e `wl_tenant_key`; ou
- algum `location_parking_type` **ativo** do local estiver sem `wl_product_slug`.

O toggle fica desabilitado **com o motivo na tela** ("3 tipos de vaga sem mapeamento"), não
apenas cinza.

## Guardas de silêncio (empresa `hub_relationship = 'silent'`)

Não por convenção, por regra. Um único e-mail automático derruba a estratégia inteira.

- **Zero comunicação de saída.** Filtro na origem da fila, não no template.
- **Sem fluxo de onboarding.** Não entra em `company_onboarding` nem muda `onboarding_status`.
- **Sem recebedor de repasse.** Guard que impede criar split enquanto `silent`.
  ⚠️ Virapark já tem `payout_recipient` e `company_payout_account`; Garageinn tem conta.
  Hoje `pagarme_split_enabled = false`, mas ao ligar para as nativas isso vira caminho aberto.
- **Sem usuários.** Convite bloqueado; perfis existentes têm que ser internos.

**Teste obrigatório:** falha se uma empresa `silent` aparecer em qualquer fila de e-mail de
parceiro. É o tipo de coisa que quebra em produção uma vez, e de forma irreversível.

## Estado em 03/08/2026

Nenhum parceiro real tem login: todos os perfis ligados às empresas são `@fera.ag` (interno)
ou `@teste.com`. A premissa do silêncio se sustenta hoje.

## Como ficou (04/08/2026)

| Peça | Onde |
|---|---|
| Colunas + CHECK | `location.checkout_mode`, `checkout_mode_changed_at/by`; `company.hub_relationship`, `wl_public_domain` |
| URL de saída | `external_checkout_url(location_parking_type)`, campo computado do PostgREST |
| Pré-voo | `location_external_readiness(uuid)` → `{ready, missing_company, unmapped_count, unmapped_names}` |
| Regra dura | trigger `location_checkout_mode_guard` (+ `company_hub_relationship_guard`) |
| Guardas de silêncio | triggers em `company_onboarding`, `payout_recipient`, `profile_company` e no `onboarding_status` da própria empresa |
| Silêncio no e-mail | `sendPartnerEmail()` em `supabase/functions/_shared/email.ts` |
| Manager | coluna e diálogo de Checkout em `/manager/companies/:id/locations`; domínio público e "Relação silenciosa" no cadastro da empresa |
| Testes | pgTAP `checkout_mode_external.test.sql` (24), Deno `_shared/partner-email.test.ts` (5), Vitest `CheckoutModeDialog.test.tsx` + `locations/api.test.tsx` (8) |

**Quem é "backend" para as guardas.** As regras duras deixam passar quem chega **sem JWT**
(service role, migration, seed) e exigem `hub_admin` de quem chega **com** JWT. Não dá para
olhar `current_user` dentro de uma função `SECURITY DEFINER` (lá ele é o dono da função, não
quem chamou), e o anônimo não alcança nenhum desses caminhos: não tem policy de escrita em
`location` nem `EXECUTE` nas RPCs.

**Pré-voo cobre `wl_category_slug` também.** A spec original citava só `wl_product_slug`, mas a
URL precisa das duas partes; faltando qualquer uma, o link sairia quebrado.

**A marcação de afiliado é `?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark`**
e vive dentro da função SQL, num lugar só. O teste pgTAP compara a URL inteira: se alguém tirar a
marcação, o teste cai antes de a receita cair.

**Slug do De/Para é validado (`wl_slug_safe`).** Quem grava `wl_category_slug`/`wl_product_slug` é
o parceiro, pelo escopo `parking-types:write`, e um slug com `?` ou `#` fecharia a URL antes dos
nossos parâmetros: a venda passaria a contar como entrada direta e nenhum relatório acusaria. Fora
do formato `^[a-z0-9][a-z0-9._-]*$`, o pré-voo reprova e a URL sai nula. Sem link é melhor que link
torto. O host não é atacável por esse caminho: fica antes da primeira barra e vem de
`wl_public_domain`, coluna que só `hub_admin` grava.

**As guardas de silêncio são de entrada, e isso é literal.** Enquanto a empresa é `silent`, não
nasce onboarding, recebedor nem vínculo de usuário. Linha que já existe continua sendo atualizada:
a primeira versão pegava `UPDATE` também e teria quebrado o cron `refresh-recipients`, que
sincroniza o status do recebedor com o gateway a cada volta, justamente na empresa recém
silenciada (o Virapark tem recebedor). Só o `UPDATE` que troca a `company_id` para uma empresa
silenciosa é entrada disfarçada, e esse continua barrado. O que já existe também não é apagado:
desmontar recebedor e perfis é decisão de gente, não de migration.

## Virapark ligado em 04/08/2026

Primeira unidade real em modo externo, virada por `developer@fera.ag` (o carimbo em
`checkout_mode_changed_by` registra isso).

- `wl_public_domain = virapark.movepark.co` (o backend segue em `virapark-app.movepark.co`)
- URL de saída: `https://virapark.movepark.co/virapark/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark`, verificada no navegador: o caminho e os UTM chegam inteiros, sem redirect que coma a marcação
- `hub_relationship = silent`, com as guardas conferidas contra o estado real: recebedor novo, usuário novo, onboarding novo e mudança de `onboarding_status` barrados; a reconciliação do recebedor que já existia continua passando
- Os três perfis ligados à empresa são internos (`@fera.ag`), então a premissa do silêncio se sustenta

⚠️ **A página pública ainda não honra isso.** Nenhuma superfície do consumidor lê `checkout_mode`
hoje: quem faz isso é E0.15. Até lá, o Virapark continua vendendo pelo checkout do Hub e o dado
diz "externo" sem que a tela mude. Não é regressão (antes da E0.14 a coluna nem existia), mas é a
razão de E0.15 ser a próxima da fila. Reverter é um `update` de uma linha.

