# Roteiro de testes: MCP de parceiro e Public API

> Escrito em 29/07/2026. Cobre as duas superfícies B2B que **nunca foram executadas**: as 33 tools do
> MCP de parceiro e as 34 operações da Public API. Ver `docs/specs/mcp.md`, `docs/specs/public-api.md`
> e o roteiro do assistente em `docs/specs/customer/agent-test-scenarios.md`.

## 1. Por que este roteiro existe

O consumidor está coberto: 20 das 21 tools com evidência, mais 73 casos de contrato automatizados. O
parceiro não. O levantamento de 29/07 mediu o buraco:

| O que | Situação medida |
|---|---|
| 33 tools de parceiro | **nenhuma executada**. O gate de escopo tem 10 testes (deno), a execução tem zero |
| 33 funções `api_*` que elas chamam | **4 com pgTAP** (`api_create_booking`, `api_set_pricing`, `api_set_date_blocked`, `api_wps_event`). **29 sem nenhum** |
| 34 operações da Public API | só o **401** testado. Nenhuma chamada com chave válida |
| Chaves `mp_` no projeto | **zero, desde sempre**. O caminho de criar chave também nunca rodou |

Ou seja: sabemos que ninguém entra sem permissão, e não sabemos se, entrando, funciona. Metade dessas
tools **escreve** dado que o cliente final enxerga (cupom, desconto, preço, bloqueio de data).

## 2. Antes de começar: três armadilhas

**`mp_test_` não é sandbox.** A chave tem ambiente `live` ou `test`, mas o gateway só **carrega** esse
campo, não ramifica nele (`supabase/functions/api/index.ts`). Uma chave `test` escreve no **mesmo banco
de produção** que uma `live`. O nome engana; trate as duas como produção.

**Não use um parceiro real.** Aerovalet e Plenty Park são parceiros de verdade. Cupom, desconto e
preço aparecem na busca do consumidor. Crie uma **empresa de teste dedicada** (§3) e faça todas as
escritas nela.

**Não existe empresa "Mercy" hoje.** O `CLAUDE.md` cita `peu+mercy@fera.ag` como parceiro em
onboarding, mas a empresa foi limpa: a consulta de 29/07 não achou nenhuma. Quem for rodar precisa
criar a empresa de teste, não assumir que ela está lá.

## 3. Preparação (passo 0)

**3.1 Empresa e unidade de teste.** Crie uma company dedicada (por exemplo `qa-parceiro`) com uma
location e ao menos um `location_parking_type` ativo. Só assim as escritas ficam isoladas do que o
consumidor vê.

**3.2 A chave.** Nasce pela RPC `operator_create_api_key(p_company_id, p_name, p_environment,
p_scopes, p_expires_at)` (`supabase/migrations/20260624000000_public_api.sql:107`). Ela exige
`api_key_assert_company_access`, então o chamador tem que ser `hub_admin` ou membro da empresa. O
segredo completo é devolvido **uma única vez**, no campo `key`; depois só fica o `key_prefix` e o hash.

Crie **duas** chaves, porque parte do roteiro é justamente provar que o escopo limita:
- `qa-full`: todos os 21 escopos, para exercitar as tools.
- `qa-somente-leitura`: só os escopos `*:read`, para provar que as de escrita são recusadas.

> **Cuidado ao guardar:** o segredo é credencial de escrita da empresa. Não commite, não cole em
> issue. Se vazar, revogue por `operator_revoke_api_key`.

**3.3 Registre o baseline** antes de qualquer escrita, para a limpeza saber ao que voltar:

```sql
select
  (select count(*) from coupon    where company_id = '<QA_COMPANY_ID>') as cupons,
  (select count(*) from discount_rule where company_id = '<QA_COMPANY_ID>') as descontos,
  (select count(*) from add_on_service where company_id = '<QA_COMPANY_ID>') as addons,
  (select count(*) from booking b join location l on l.id=b.location_id
     where l.company_id = '<QA_COMPANY_ID>' and b.deleted_at is null) as reservas;
```

## 4. Frente A · Leitura (11 tools, risco zero)

Rode primeiro: não muda nada e já pega bug de contrato. Chamada padrão:

```bash
curl -s https://mcp.movepark.co/partner \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $MP_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<TOOL>","arguments":{}}}'
```

| # | Tool | Escopo | Obrigatórios | Passa quando |
|---|---|---|---|---|
| A-01 | `list_locations` | `locations:read` | nenhum | só unidades da empresa da chave |
| A-02 | `get_location` | `locations:read` | `location_id` | devolve a unidade; **id de outra empresa recusa** |
| A-03 | `list_parking_types` | `parking-types:read` | `location_id` | tipos daquela unidade, com capacidade |
| A-04 | `get_availability` | `availability:read` | `location_parking_type_id`, `from`, `to` | disponibilidade por data bate com a `location_parking_availability` |
| A-05 | `simulate_price` | `pricing:read` | `location_parking_type_id` | valor bate com o motor (cruzar com `docs/simulacao-precos.md`) |
| A-06 | `list_bookings` | `bookings:read` | nenhum | só reservas da empresa |
| A-07 | `get_booking` | `bookings:read` | `booking_id` | **reserva de outra empresa recusa** |
| A-08 | `list_coupons` | `coupons:read` | nenhum | só cupons da empresa |
| A-09 | `list_discounts` | `discounts:read` | nenhum | idem |
| A-10 | `list_addons` | `addons:read` | nenhum | idem |
| A-11 | `list_reviews` | `reviews:read` | nenhum | idem |
| A-12 | `get_occupancy` | `occupancy:read` | ver schema | números batem com a `booking` |

**A-13 · isolamento entre empresas (o caso mais importante da frente).** Pegue um `location_id` e um
`booking_id` de **outra** empresa (Aerovalet serve, é só leitura) e chame `get_location` e
`get_booking` com a chave da QA.
**Passa:** recusa. **Bug grave:** devolver o dado. É o `api_assert_lpt_company` fazendo seu trabalho.

**A-14 · escopo limita de verdade.** Com a chave `qa-somente-leitura`, chame `upsert_coupon`.
**Passa:** a tool não aparece no `tools/list` **e** a chamada é recusada. Esconder não é barrar.

## 5. Frente B · Escrita (22 tools, com limpeza)

> **Efeito colateral real:** cupom, desconto, add-on, preço e bloqueio de data são dados que o
> consumidor enxerga. Faça tudo na empresa de teste. `wps_event` dispara integração externa: rode por
> último e confira o outbox (`wps_delivery`).

Ordem sugerida, do menos ao mais consequente. Cada caso: **antes** (SQL), **ação** (tool), **depois**
(SQL), e desfazer.

### B.1 Cupom (`coupons:write`)
| # | Tool | Asserção |
|---|---|---|
| B-01 | `upsert_coupon` | linha nova em `coupon` com o código e o desconto enviados |
| B-02 | `set_coupon_active` | `is_active` alterna; cupom inativo **não** aplica no checkout |
| B-03 | `delete_coupon` | some (ou `deleted_at`, conferir se é soft) |

**Armadilha:** cupom é validado no checkout do consumidor. Um cupom de teste ativo pode ser usado por
alguém. Crie com código improvável (`QA-2607-XYZ`) e **desative antes de apagar**.

### B.2 Desconto (`discounts:write`)
`upsert_discount` (B-04), `set_discount_active` (B-05), `delete_discount` (B-06). Mesma estrutura.
**Armadilha:** desconto automático entra no preço da busca sem ninguém digitar nada. É o mais
perigoso da frente: confirme que a regra criada tem janela de data que **não** pega hoje, ou desative
imediatamente após a asserção.

### B.3 Add-on (`addons:write`)
`upsert_addon` (B-07), `set_location_addon` (B-08), `delete_addon` (B-09).

### B.4 Preço e agenda (`pricing:write`, `parking-types:write`, `locations:write`)
| # | Tool | Asserção |
|---|---|---|
| B-10 | `update_pricing_rule` | `simulate_price` (A-05) devolve o valor novo |
| B-11 | `set_date_blocked` | a data some da `get_availability`; **desbloqueie no fim** |
| B-12 | `update_parking_type` | capacidade/ativo mudam; capacidade **menor que as reservas ativas** deve ser recusada |
| B-13 | `update_location` | nome/endereço mudam; **restaure o valor original** |

### B.5 Reserva (`bookings:write`, `bookings:cancel`, `bookings:checkin`)
| # | Tool | Asserção |
|---|---|---|
| B-14 | `create_booking` | reserva criada na unidade da QA, `status=pending` |
| B-15 | `create_booking` com o mesmo `idempotency_key` | **não** cria segunda; devolve a mesma (cruza com a idempotência do consumidor) |
| B-16 | `change_booking_dates` | datas mudam e a capacidade das datas velhas é liberada |
| B-17 | `change_booking_vehicle` | veículo trocado |
| B-18 | `check_in_booking` | `checked_in_at` preenchido; check-in duplicado é recusado |
| B-19 | `check_out_booking` | `checked_out_at` preenchido; sem check-in antes deve recusar |
| B-20 | `cancel_booking` | `status=cancelled`, capacidade devolvida |

### B.6 Avaliação e integração
`respond_review` (B-21) e `wps_event` (B-22, por último).

## 6. Frente C · pgTAP das 29 funções sem teste

**Não depende de chave nenhuma** e é o que protege a longo prazo. As 29 sem cobertura hoje:

```
api_assert_lpt_company   api_cancel_booking       api_change_booking_dates
api_change_booking_vehicle api_checkin_booking    api_checkout_booking
api_delete_addon         api_delete_coupon        api_delete_discount
api_get_booking          api_get_location         api_list_addons
api_list_bookings        api_list_coupons         api_list_discounts
api_list_locations       api_list_parking_types   api_list_reviews
api_location_occupancy   api_respond_review       api_set_coupon_active
api_set_discount_active  api_set_location_addon   api_simulate_price
api_update_location      api_update_parking_type  api_upsert_addon
api_upsert_coupon        api_upsert_discount
```

Prioridade sugerida, por risco:

1. **`api_assert_lpt_company`** primeiro. É a função que garante que uma empresa não toca o recurso de
   outra: quase todas as demais dependem dela. Um teste dela cobre a base de todas.
2. **As de escrita** (`upsert_*`, `delete_*`, `set_*_active`, `update_*`): asserir que recusam
   `company_id` alheio e que gravam o que prometem.
3. **As de leitura**: asserir que o resultado é filtrado por empresa.

Arquivo sugerido: `supabase/tests/api_partner_rpcs.test.sql`, no molde de
`supabase/tests/api_pricing_write.test.sql` (que já cobre duas delas). Fixtures com **duas** empresas,
para o isolamento ser asserido de verdade, e `rollback` no fim.

## 7. Frente D · Public API (34 operações)

Mesma chave da Frente A/B, em `https://api.movepark.co`. O contrato já tem automação parcial em
`test/api/public-api.int.test.ts` (401 sem chave, 401 com chave inválida, descoberta no ar). Falta o
caminho autenticado.

Ordem: as rotas de leitura (`GET /v1/locations`, `/v1/bookings`, …) e depois as de escrita, espelhando
a Frente B. Assertivas obrigatórias em toda rota:
- `request_id` presente na resposta de erro;
- registro em `api_request_log` (é a auditoria da API);
- escopo insuficiente devolve 403, não 200 vazio.

## 8. Limpeza (ordem FK-safe)

Confira as FKs antes de apagar, não suponha:

```sql
select tc.table_name, kcu.column_name, ccu.table_name as referencia, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name in ('company','location','coupon');
```

Ordem que respeita o que já se sabe do consumidor: **reserva antes de unidade, unidade antes de
empresa** (`location.company_id` e `booking.location_id` são RESTRICT). Se o delete travar numa
reserva, **investigue em vez de forçar**: pode ser reserva real.

No fim, confira que voltou ao baseline do §3.3 e revogue as duas chaves
(`operator_revoke_api_key`).

## 9. O que este roteiro não cobre

- **Rate limit** da Public API: precisa de volume, é teste próprio.
- **Webhook do parceiro (WPS)**: `wps_event` enfileira; a entrega tem cron e retry próprios
  (`wps-deliver`), com teste de unidade já existente.
- **Rotação de chave** (`operator_rotate_api_key`) e o fluxo de UI, que não existe hoje.
