# Permissões por escopo + papéis fixos (ADR-005)

Fonte da verdade do controle de acesso dentro de uma empresa. Unifica **UI, RLS/RPC e chaves de
API** num único vocabulário: **o escopo**. "A mesma permissão = o mesmo escopo."

## Modelo

Duas camadas, independentes:

- **`user_role`** (`hub_admin` / `company_operator` / `customer`) — define a **área** do app
  (`/manager`, `/operator`, consumidor). Inalterada como modelo, mas **a coluna deixou de ser
  gravável pelo próprio usuário** (ver abaixo).
- **`company_role`** — papel **dentro da empresa** (`profile_company.role`). 4 presets fixos:

| Papel (enum) | Rótulo | Resumo |
|---|---|---|
| `owner` | Dono | Acesso total: tudo + gerir usuários e chaves + mover dinheiro |
| `manager` | Gerente | Tudo operacional, financeiro (leitura) e catálogo/preços; **não** gere usuários/chaves nem saca |
| `operator` | Operação | Reservas, check-in e ocupação. Sem preços, financeiro ou usuários |
| `finance` | Financeiro | Financeiro/repasses (leitura) + reservas (leitura). Sem operação ou catálogo |

> O enum reusa `operator` como "Operação" (sem migração de dados); `manager`/`finance` foram
> adicionados (migration `20260712000000`). Presets **fixos**: não há construtor de regras na UI.

> **Fora deste modelo — ações self-service do consumidor.** Operações do próprio usuário sobre a
> própria conta (ex.: **exclusão da conta**, E0.9) **não** são company-scoped e **não** têm escopo
> no catálogo. A autorização é `auth.uid() = alvo` (a RPC só toca a linha do próprio usuário). Ver
> [account-deletion.md](./customer/account-deletion.md).

### `profiles.role` não é gravável por quem ele autoriza (13/08/2026)

> **Autorização não pode ser escrita por quem ela autoriza.** É o mesmo princípio que o ADR-006
> aplica à credencial, pela mesma razão.

Até 13/08/2026 qualquer pessoa criava conta no `/login` (passwordless, aberto) e virava
`hub_admin` com um `PATCH /rest/v1/profiles?id=eq.<próprio uuid>` mandando `{"role":"hub_admin"}`.
Daí em diante passava em todo gate `is_hub_admin()` do produto: o `/manager` inteiro, as RLS de
escrita de `location` e `company`, cupons, blog e as RPCs `manager_*`.

**Por que a RLS não segurava:** policy corta **linha**, não **coluna**. As duas policies de UPDATE
de `profiles` dizem "o dono edita a própria linha", e isso está certo; faltava alguém dizer
**quais colunas**. Como o baseline concede `ALL ON TABLES` a `authenticated` por default
privilege, o dono editava a linha inteira.

**A correção** (`20261017103000_profiles_role_not_self_writable.sql`) é a mesma de Q-021, onde o
telefone do lote mapeado já tinha provado que RLS não resolve corte de coluna:

| Camada | O que ficou |
|---|---|
| Grant | `revoke update on profiles from anon, authenticated`, e regrant por coluna só em `first_name`, `last_name`, `full_name`, `avatar_url`, `birth_date`, `tax_id` e `preferences` |
| RPC | `admin_set_user_role(p_user_id, p_role)`, `SECURITY DEFINER`, gate `is_hub_admin()` |
| Teste | `supabase/tests/profiles_role_guard.test.sql`, com `has_column_privilege` como guard de regressão contra um regrant futuro |

Ficam de fora do regrant `role` e `deleted_at` (apagar conta é a RPC de anonimização), mais `id`,
`created_at` e `updated_at`.

**Ninguém altera o próprio papel**, nem para cima nem para baixo. Para cima é a falha em si. Para
baixo é o jeito mais fácil de trancar o painel: o último admin se rebaixa, não sobra quem promova
ninguém, e sair disso exige acesso direto ao banco. Papel é mudança de duas pessoas.

**O que não mudou:** as Edges `invite-company-member` e `approve-partner` promovem a
`company_operator` com o client de `service_role`, então nunca dependeram do grant de
`authenticated` e seguem iguais. O trigger de `auth.users` cria o perfil com o default `customer`.

### As policies de `profiles`, consolidadas (13/08/2026)

Eram quatro onde duas bastam (`20261017110000_profiles_policies_consolidadas.sql`). Não era a
falha, porque policy nenhuma corta coluna, mas é a confusão que ajudou a escondê-la: com quatro
policies permissivas sobre a mesma tabela, ler "quem pode o quê" exige unir predicados de cabeça,
e foi assim que a pergunta "mas a RLS não protege?" passou a ter uma resposta que parecia sim.

As duas que saíram estavam **inteiramente contidas** nas que ficaram, então o comportamento
efetivo não mudou:

| Saiu | Estava contida em |
|---|---|
| `profile_owner_select` `USING (id = auth.uid())` | `profiles_select` `USING (id = auth.uid() OR is_hub_admin())` |
| `profile_owner_update` `USING/CHECK (id = auth.uid())` | `profiles_update` `USING (id = auth.uid() OR is_hub_admin())` |

Ficaram `profiles_select` e `profiles_update`, agora com `TO authenticated` e com o `WITH CHECK`
escrito em vez de herdado do `USING`. Nenhuma das duas mudanças altera efeito: o anônimo já lia
zero linha (`auth.uid()` é nulo sem sessão) e `service_role` tem BYPASSRLS, então as Edges que
leem `profiles` com o client de admin não sentem. As duas coisas foram conferidas no vivo antes de
mexer, e as seis leituras e escritas foram conferidas de novo depois.

**Continua faltando de propósito:** não existe policy de INSERT nem de DELETE. Perfil nasce pelo
trigger de `auth.users` e some por `anonymize_own_account()`, os dois `SECURITY DEFINER`, então
`authenticated` não cria nem apaga linha aqui. A ausência é a regra.

**A divisão de trabalho, que é o resumo dos dois consertos:** a policy diz **qual linha**, o grant
diz **qual coluna**. Confundir os dois foi a falha.

## Vocabulário de escopos

O catálogo é a tabela **`api_scope`** (mesma da Public API). A coluna **`assignable_to_api_key`**
separa o que pode ir pra uma chave de API (escritas de catálogo) do que é **só-interno** (equipe,
chaves, financeiro). Escopos in-app adicionados (migration `20260713000000`): `pricing:write`
(atribuível), `finance:read`, `payouts:read`, `payouts:write`, `team:read`, `team:write`,
`api-keys:write` (só-internos).

### Escopo de plataforma (`is_platform_scope = true`)

Terceira categoria, ortogonal a `assignable_to_api_key`: pertence à **Movepark**, não à empresa nem
ao parceiro. Não entra em `company_role_scope` (o trigger `company_role_scope_no_platform` recusa) e
não conta na invariante "o Dono tem todos", que vale sobre o catálogo de empresa.

| Escopo | Atribuível a chave | Para quê |
|---|---|---|
| `checkout:link` | ✔ | Tool que gera link de checkout, concedida só à chave do bot interno |
| `identity:assert` | ✔ | Tool que afirma telefone já verificado pelo WhatsApp e devolve a sessão do cliente sem OTP, concedida só à chave do bot interno |
| `fares:write` | – | Editar plano de cancelamento (Básica/Flex/Superflex) por tipo de vaga |
| `blog:write` | ✔ | Criar, publicar e excluir post pelas rotas internas do blog |
| `wl:read` | ✔ | Ler o mapeamento unidade → slug do white-label, para o agente de WhatsApp |
| `marketing:read` | ✔ | Ler a Automação inteira pelo MCP do Manager: análises, contatos com dados completos, segmentos, campanhas, leads, cupons e configuração do disparo ([marketing-mcp.md](./marketing-mcp.md)) |
| `marketing:write` | ✔ | Criar e editar segmento, campanha, cupom e lead; trocar destinatário de ensaio e teto diário |
| `marketing:dispatch` | ✔ | Executar campanha e ligar ou desligar a chave geral do disparo. Separado do de edição para uma chave de edição nunca enviar nada |

### Chave de plataforma (`api_key.company_id is null`)

`company_id` era NOT NULL, então uma chave da Movepark teria que ser pendurada em algum parceiro, e
aquele parceiro a veria e poderia revogá-la em `/operator/api-keys`. Agora a coluna é nula para
chave de plataforma, e o trigger `api_key_assert_ownership` fecha os dois lados: chave com empresa
recusa escopo de plataforma, chave sem empresa recusa escopo de empresa. Vale para qualquer caminho
de escrita, inclusive `service_role`, porque é trava de tabela e não de RPC.

Emissão, listagem e revogação passam por `hub_create_platform_api_key`,
`hub_list_platform_api_keys` e `hub_revoke_platform_api_key`, todas abrindo com `is_hub_admin()` e
com revoke nominal de `anon`. A tela é `/manager/api-interna`. Migration
`20261005000000_platform_api_keys.sql`.

É o gate certo quando a resposta para "quem manda nisso?" é a Movepark. No front sai de graça: o
`hasScope` devolve `true` para `hub_admin` (inclusive impersonando) e `false` para todo membro de
empresa, então o mesmo escopo esconde o item do menu, tira a rota do alcance e barra a ação, sem um
`if` de papel espalhado pela UI. Migration `20260905000000_fares_write_platform_scope.sql`.

## Matriz papel → escopo (seed `company_role_scope`)

`owner` = catálogo inteiro. Não-Dono:

| Escopo \ Papel | manager | operator | finance |
|---|:--:|:--:|:--:|
| `*:read` de catálogo/preço/disp./ocupação/faq | ✔ | ✔ | ✔ |
| `locations:write` · `parking-types:write` · `pricing:write` | ✔ | – | – |
| `bookings:read` | ✔ | ✔ | ✔ |
| `wl-bookings:read` (reservas feitas no site white-label, só leitura) | ✔ | ✔ | ✔ |
| `bookings:write` · `cancel` · `checkin` | ✔ | ✔ | – |
| `coupons:*` · `discounts:*` · `addons:*` · `reviews:write` · `webhooks:write` | ✔ | – | – |
| `reviews:read` | ✔ | ✔ | – |
| `wps:write` | ✔ | ✔ | – |
| `finance:read` · `payouts:read` | ✔ | – | ✔ |
| `payouts:write` | – | – | – |
| `team:read` | ✔ | ✔ | ✔ |
| `team:write` · `api-keys:write` | – | – | – |
| `bookings:recovery` (não concluídas com contato, 12/11/2026) | ✔ | – | – |

`payouts:write` (saque/KYC bancário) é **exclusivo do Dono**.

## Enforcement (server-authoritative)

Três pontos, todos a partir dos helpers `member_has_scope(company_id, scope)` e
`current_member_scopes(company_id)` (SECURITY DEFINER; **hub_admin e dono → todos os escopos**):

1. **RPC** — cada `operator_*`/`payout_*`/`company_*` de escrita exige o escopo
   (`if not member_has_scope(...) then raise … errcode 42501`). Cupons/descontos/serviços/chaves
   funilam pelo respectivo `*_assert_company_access`; preço/ocupação/avaliações/financeiro/equipe
   checam inline. Migration `20260714000000`.
2. **RLS** — as escritas diretas de `location`/`location_parking_type` (sem RPC) têm o escopo na
   policy de UPDATE (`locations:write` / `parking-types:write`).
3. **UI** — `useAuth().hasScope(scope)` gateia rota (`<RequireScope>` em `routes.tsx`), itens da
   sidebar (`filterNavByScopes`) e ações na página (botões/seletor de papel). hub_admin → sempre
   `true`. Os escopos vêm no `loadSession` (cruza `company_role_scope` com o papel do usuário).

> **Exceção de leitura com escopo no servidor: `wl-bookings:read` (08/10/2026).** As reservas do
> site white-label (`wl_booking`) não têm RLS de membro: o único caminho do parceiro é a RPC
> `bookings_list_page` (recorte de `wl_visible_company_ids`, que exige o escopo; a antiga `operator_wl_bookings` saiu em 13/10/2026). É dado do cliente do parceiro vindo de outro sistema
> (contrato v2, Anexo A), e o escopo deixa explícito quem o lê. Não é atribuível a chave de API.
> Ver `reservas-wl-no-hub.md` § 9.

> **Outra exceção de leitura: `bookings:recovery` (12/11/2026).** A lista de reservas não
> concluídas que ainda dá para recuperar traz nome, telefone e e-mail de quem **não** comprou, dado
> que quem recebeu foi a Movepark. Só sai pela RPC `operator_recoverable_bookings` (SECURITY
> DEFINER, porque a expirada tem `deleted_at`), que exige o escopo. Dono e Gerente têm; Operação e
> Financeiro não. Não é atribuível a chave de API. Cada download fica em `booking_recovery_export`.
> Ver `booking-flow.md` (Recuperável) e `operator-panel.md` § 4.2b.

> **Leitura vs. escrita:** o gating de **escrita** é server-authoritative (RPC + RLS). A **leitura** de
> dados da própria empresa segue a RLS por associação (qualquer membro lê), com **uma exceção de
> dinheiro**, a seção seguinte: `booking` e `payment` só saem da tabela para quem tem `finance:read`.
> A UI continua escondendo as seções por escopo, mas agora para o dinheiro da reserva ela é espelho,
> não a barreira.

## Dinheiro da reserva: `booking` e `payment` só com `finance:read` (23/11/2026)

> **Exceção (26/11/2026): o balcão vê preço de tabela no card "Dias a mais".** Para cobrar quem sai depois do combinado, a reserva mostra a tabela da estadia e de cada dia a mais (RPC `booking_extra_days_table`, migration `20261208110000`, `hub_admin` ou membro com `bookings:read` na empresa). É preço de TABELA, o mesmo da vitrine: a RPC nunca devolve o que a reserva pagou, comissão ou repasse, e `counter_booking_json` não mudou. Ver `operator-panel.md` §4.2.
>
> **Exceção (24/11/2026): o balcão vê o total pago.** A lista de reservas do balcão (`operator_bookings_by_ids` e, no site, `paid_total_cents` de `bookings_list_page`) devolve só o total que o cliente pagou, para conferir a reserva sem abrir o detalhe (migration `20261206170000`). Diárias, comissão, repasse, taxas e o detalhe seguem sem valor.

Até 23/11/2026 as policies `booking_select` e `payment_select` liberavam toda linha da empresa a
**qualquer membro** (`current_company_ids()`), e `authenticated` lê a tabela inteira. O papel
Operação (o balcão) não tem `finance:read`, mas lia `booking.total_amount`, `price_breakdown`,
`price_by_days`, `fare_price_cents`, as colunas `commission_*`, e em `payment` o `amount`, `split`,
`gateway_fee_cents`, `refunded_amount`, `anticipation_*`, `debt_*` e `refund_*`, direto pelo
PostgREST. A tela escondia só o gráfico de receita; a lista e o detalhe de reservas mostravam o valor
das diárias, o "Você recebe" e a comissão ao balcão.

**Regra.** O membro de empresa só lê a linha de `booking` e de `payment` se tiver `finance:read` na
empresa da unidade (Dono, Gerente e Financeiro; hub_admin sempre). O dono da reserva (o cliente) e o
hub_admin leem como antes. Migrations `20261206140000` (RPCs do balcão) e `20261206140100`
(policies), teste `supabase/tests/leitura_dinheiro_por_escopo.test.sql`.

**Por que policy por linha e RPC para o balcão, e não corte por coluna.** RLS escolhe linha, não
coluna. Tirar o SELECT das colunas de dinheiro de `authenticated` (como se fez em `company`) valeria
para o cliente, o hub_admin e o Dono também, porque no Postgres os três são o mesmo papel
`authenticated`: quebraria o checkout, a conta do cliente, o Manager e todo `select("*")`, cerca de
15 pontos do front. Apertar a policy para `finance:read` e servir só o balcão por RPC quebra apenas
quem já não tem o escopo: no banco vivo eram 10 vínculos de Operação (8 pessoas). Um view sem as
colunas de dinheiro foi descartado: view definer é regressão no advisor (`security_definer_view`) e
view invoker herda a policy da tabela.

**O que o balcão usa no lugar** (SECURITY DEFINER, `search_path` fixo, `revoke` de `anon`, escopo
`bookings:read` conferido por dentro via `counter_company_ids()`; nenhuma devolve dinheiro):

| RPC | Para quê |
|---|---|
| `operator_bookings_by_ids(p_ids)` | hidrata a lista de reservas (a forma do `baseSelect`, com os valores nulos e o pagamento só com situação e forma) |
| `operator_booking_by_code(p_code, p_only_active, p_items)` | detalhe da reserva e voucher do portão |
| `operator_day_agenda(p_from, p_to, p_location_ids, p_statuses)` | agenda do dia |
| `operator_booking_facts(p_from, p_to, p_location_ids, p_statuses, p_to_inclusive)` | datas, status e canal para contar (dashboard, funil, próximas reservas) |
| `operator_set_booking_status(...)` | confirmar, check-in, check-out, não compareceu, notas: o `UPDATE ... where` também passa pela policy de SELECT, então a escrita direta deixou de servir ao balcão. Exige `bookings:write` ou `bookings:checkin`, grava só as quatro colunas que o gatilho de allowlist aceita |
| `counter_can_open_booking(p_code)` | a Edge `voucher-pdf` pergunta, com o JWT da pessoa, se ela pode abrir o código; só então lê com a service role |

`bookings_list_page`, `bookings_filter_options` e `admin_search` eram INVOKER e dependiam da RLS
para recortar por empresa; viraram DEFINER com a visibilidade escrita na função (hub_admin, a própria
reserva, ou empresa em que a pessoa tem `bookings:read`). O resumo da lista e o total do site
(`total_cents`, `paid_total_cents`) só somam empresa em que a pessoa tem `finance:read`.

**No front** o hook `useSeesMoney()` (`src/auth/useSeesMoney.ts`) decide o caminho: com
`finance:read`, a leitura é a de sempre; sem, os hooks passam `counter: true` e saem pelas RPCs
acima, e a tela some com o valor (coluna "Diárias" da lista, "Valor das diárias", o card de Valores
e o de comissão no detalhe). Quem tem o escopo não muda nada.

**Mudou para o balcão (Operação), de propósito:** deixou de ver na lista e no detalhe de reservas o
valor das diárias, o "Você recebe", a comissão e a taxa do gateway. Segue vendo cliente, placa,
datas, situação e forma do pagamento, as operações (check-in, check-out, não compareceu, trocar
placa) e o excedente da proteção de voo, que é o que ele cobra no balcão.

**Limites que ficam (decididos, não esquecidos):**
- O voucher em PDF (`voucher-pdf`) leva o total pago ao cliente. Para quem o lê pela RLS (dono da
  reserva, hub_admin, `finance:read`) nada muda. O balcão não lê a tabela: a Edge confere o acesso por
  `counter_can_open_booking` e gera o voucher **sem a linha "Valor"**, em `<id>-balcao.pdf`, sem
  trocar o `voucher_url` (o PDF do cliente, com o valor, não é sobrescrito). Achado da revisão de
  segurança de 23/11/2026, fechado na mesma entrega.
- `booking_fare_extension` (proteção de voo) mantém `partner_credit_cents` visível ao balcão: o
  excedente que ele cobra está na mesma linha. Separar é trabalho à parte.
- `booking_item`, `booking_discount` e `booking_modification` têm policies que consultam `booking`,
  então o membro sem `finance:read` também deixou de lê-las direto (têm preço do item, desconto e
  diferença de troca de datas); o balcão recebe o que precisa (itens do voucher) pelas RPCs. `vehicle`
  (a placa) e `booking_fare_extension` (o excedente da proteção de voo, que o balcão cobra) não são
  dinheiro da reserva e continuam legíveis para quem já lia: as policies passaram a chamar os
  ajudantes `counter_can_see_vehicle()` e `counter_can_see_booking()` (SECURITY DEFINER, mesma regra
  de antes), em vez de depender da RLS de `booking`. Migrations `20261206140100` e `20261206150000`.
- A reserva do white-label (`wl_booking`) ainda tem o detalhe em outra RPC, e a policy de SELECT da
  tabela segue o mesmo predicado de `wl-bookings:read` (que a Operação tem), então `total_cents` e
  `paid_total_cents` ainda podem ser lidos direto por quem tem esse escopo. Nesta rodada só a lista
  (`bookings_list_page`) passou a esconder o valor do site de quem não tem `finance:read`.
- Quem tem `finance:read` numa empresa e não noutra: o front escolhe o caminho pela empresa ativa; o
  servidor é quem decide linha a linha (hoje ninguém no vivo tem papéis diferentes entre empresas).

**Regra para quem mexe:** tabela ou coluna nova com dinheiro de reserva nasce com a policy atrás de
`finance_company_ids()` (a lista de empresas em que a pessoa tem `finance:read`, calculada uma vez
por consulta), e o balcão a lê por RPC definer que não a devolve. `select("*")` em `booking` no
front só vale para quem passou por `useSeesMoney()`.

## Colunas de `company` (08/10/2026)

A policy `catalog_read_company` libera a linha de toda empresa ativa para anon e authenticated
(a vitrine precisa do nome e do slug). Até 08/10/2026 isso liberava também **todas as colunas**:
pela chave pública lia-se o IP de aceite do contrato, a comissão, o tenant do WL e a configuração
de repasse. RLS escolhe linha, não coluna; por isso o corte é de privilégio
(`20261129090500_company_colunas_e_wl_seguranca.sql`):

| Papel | Lê | Escreve |
|---|---|---|
| `anon` | `id, name, slug, legal_name, tax_id, status, created_at, updated_at, deleted_at, onboarding_status, logo_url` | nada |
| `authenticated` | tudo menos `wps_webhook_secret`, `contract_accepted_ip`, `wl_tenant_key`, `take_rate_bps` | INSERT/UPDATE (a RLS exige hub_admin) |
| hub_admin | as quatro restritas pela RPC `manager_company_restricted` (o segredo do WPS só como "existe") | |

Regras para quem mexe:
- **`select("*")` em `company` falha** para o front. Use `COMPANY_COLUMNS` de
  `src/features/companies/api.ts`.
- **Coluna nova não tem leitura para ninguém** até entrar no `grant select (...)` de uma migration e
  em `COMPANY_COLUMNS`. O pgTAP `company_column_privileges.test.sql` compara as listas exatas e
  reprova coluna nova esquecida.
- Função `SECURITY DEFINER` e o service_role não são afetados.

## Convite de usuário (E1.7)

Quem tem **`team:write`** (Dono) convida por e-mail na tela **Operador → Usuários**. A Edge
**`invite-company-member`** (com verify-jwt) autoriza pelo `member_has_scope` do convidante,
cria/encontra o `auth.user`, vincula em `profile_company` com o papel escolhido (não rebaixa um
hub_admin) e envia o magic link (`tplTeamInvite`). O Manager também escolhe o papel ao vincular um
usuário a uma empresa. Guarda de **último dono** atualizada: rebaixar o único dono para **qualquer**
papel não-Dono é bloqueado.

Vincular pelo Manager (**Usuários › Vincular empresa**) uma conta que ainda é **Cliente** a promove
a **Operador** no mesmo clique (13/10/2026), como o convite já fazia. Antes ela ganhava o vínculo e
continuava barrada no `/operator`, que pede o papel de plataforma `company_operator`. Quem já é
Operador ou hub_admin não tem o papel tocado.

## Usuário em mais de uma empresa (13/10/2026)

O vínculo é por **empresa** (`profile_company`, chave `profile_id + company_id`) e não por unidade:
quem é membro de uma empresa enxerga todas as unidades dela, e a mesma pessoa pode ser membro de
várias, com um papel em cada. O servidor já respeitava isso, porque cada RPC checa o escopo na
empresa da operação.

O painel do parceiro não respeitava. Ele não tinha como trocar de empresa: as listas juntavam as
duas (a RLS devolve tudo o que a pessoa enxerga) enquanto o nome no menu e o `hasScope` seguiam só
a primeira, sem ordem definida. Quem era Dono numa e Operação na outra podia ver o menu do papel
errado.

**A regra:** o painel mostra **uma empresa de cada vez**.

| Situação | Empresa em escopo no painel |
|---|---|
| Uma empresa só | Ela. Sem seletor, porque não há o que escolher |
| Mais de uma | A **ativa**: a escolhida no aparelho, ou a mais antiga no vínculo se nada foi escolhido ou se o vínculo com a escolhida caiu |
| hub_admin | Não tem empresa ativa. Ele troca de conta por impersonation (seletor do Manager) |

- **Onde troca:** o bloco de contexto da sidebar vira seletor no desktop, e o menu do avatar ganha a
  seção "Empresa" (é o caminho no tablet e no celular, onde a sidebar some ou vira só ícone). Cada
  item mostra o papel da pessoa naquela empresa. Trocar volta ao início do painel, porque a tela
  aberta podia ser de uma unidade ou reserva da empresa anterior.
- **Onde fica a escolha:** `localStorage` (`mp:active-company-id`), como a impersonation. É
  conveniência de aparelho, não autorização: a regra está em `resolveActiveCompanyId`
  (`src/auth/activeCompany.ts`), que descarta empresa da qual a pessoa não é membro.
- **Como o painel recorta:** `effectiveCompanyIds` passa a ser só a ativa, o que cobre as telas que
  já filtravam por empresa. As que confiavam só na RLS usam `scopedCompanyId` (impersonada ou
  ativa): `useScopedLocationIds` (dashboard e relatórios), o `p_company_ids` da lista de reservas e
  a busca rápida (⌘K), que esconde resultado de outra empresa.
- **Empresa sem unidade:** `useScopedLocationIds` devolve um id que não casa com nada
  (`NO_LOCATION_ID`) em vez de lista vazia. Os hooks de relatório leem lista vazia como "sem
  filtro", e a tela mostraria as outras empresas (ou a rede inteira, para o hub_admin impersonando).

## Compatibilidade

A E1.6 fez backfill de `owner` por padrão, então os vínculos existentes seguem com acesso total; só
membros explicitamente `operator`/`manager`/`finance` ficam restritos. Reconfira membros não-Dono ao
ativar.

## Auditoria de isolamento (11/08/2026)

Revisão das três modalidades a pedido do Kallef: Manager, operator e público.
Achou dois furos, os dois corrigidos e travados por pgTAP
(`supabase/tests/blog_isolation.test.sql`).

### 1. Parceiro se dava escopo de plataforma

`api_assert_scopes` guardava a criação e a edição de chave de API, mas só recusava
`assignable_to_api_key = false`. Nunca olhou `is_platform_scope`.

Caminho completo: qualquer membro com `api-keys:write` (o papel Dono tem) chamava
`operator_create_api_key` pedindo `blog:write` ou `checkout:link`, e a chave saía
com o escopo. Com ela, o parceiro escrevia e excluía post do blog da Movepark, ou
gerava link de checkout com a marcação do bot interno. A tela ainda listava esses
escopos, porque `fetchScopes()` lia `api_scope` sem filtro.

`fares:write` escapou por acidente, não por desenho: tem
`assignable_to_api_key = false`, então caía na outra checagem.

Corrigido em `20261002000000`: escopo de plataforma só entra em chave se
`is_hub_admin()`. A Movepark continua emitindo a chave do bot; para membro de
empresa virou recusa explícita com `42501`. O painel também passou a filtrar, como
segunda camada.

**Nenhuma chave viva carregava escopo de plataforma**, então o furo não chegou a
ser explorado.

### 2. Rascunho do blog vazava para o `anon`

`blog_post_select` era `USING (true)`, copiado do molde de `destination` para o
Manager enxergar rascunho pela mesma policy. Em destino é inofensivo; em post é
conteúdo que ainda não devia existir para ninguém, e o `anon` lia título, corpo e
meta consultando o PostgREST direto com a chave pública.

As superfícies de produto não vazavam (API, MCP e SSG filtram na query), mas a
tabela estava aberta por baixo delas. Corrigido em `20261003000000`: leitura
pública só do publicado e não excluído, com `is_hub_admin()` como segunda condição.

### O que a auditoria confirmou como correto

| Verificação | Resultado |
|---|---|
| MCP `/partner` sem chave | Recusa até o `tools/list` |
| MCP público | 12 tools, nenhuma de escrita |
| MCP `/customer` sem sessão | Lista as tools, mas `create_booking` e `cancel_booking` exigem login por OTP |
| API sem chave | 401; método errado, 405 |
| API com chave sem o escopo | 403 |
| `anon` escrevendo em `blog_post` | INSERT recusado pela RLS; UPDATE e DELETE não casam linha, e os 93 posts seguiram intactos |
| Escopo só-interno (`payouts:write`, `team:write`) em chave | Recusado |
| Advisors de segurança | Nenhum de nível ERROR, nenhum citando blog |

## Arquivos

- Migrations: `20260712000000_company_role_add_values.sql`, `20260713000000_permission_scopes.sql`,
  `20260714000000_regate_operator_rpcs.sql`.
- Front: `src/auth/AuthProvider.tsx` (`hasScope`, `companyScopes`, empresa ativa),
  `src/auth/activeCompany.ts`, `src/auth/useScopedLocationIds.ts`, `src/auth/RequireScope.tsx`,
  `src/components/shared/Sidebar.{tsx,logic.ts}`, `src/components/shared/OperatorCompanySwitcher.tsx`,
  `src/components/shared/Topbar.tsx`, `src/features/companies/useCompanySwitch.ts`,
  `src/features/team/{api,team.logic}.ts`, `src/routes/operator/users.tsx`,
  `src/routes/manager/users.tsx`.
- Edge: `supabase/functions/invite-company-member/`.
- Testes: `supabase/tests/permissions.test.sql`, `operator_rpc_scope.test.sql`, `team.logic.test.ts`,
  `Sidebar.logic.test.ts`, `RequireScope.test.tsx`, `operator/users.test.tsx`,
  `invite-company-member/logic.test.ts`, `activeCompany.test.ts`, `Sidebar.test.tsx` e
  `Topbar.test.tsx` (seletor de empresa), `manager/users.test.tsx` (vínculo promove cliente).
