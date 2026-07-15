# Carteira Movepark / Movepark Wallet (Motor de Crescimento · dinheiro de volta)

> **Status:** base de **crédito** implementada e coberta por testes. O **débito** (gastar o saldo no
> checkout) e a **reversão** (devolver saldo em cancelamento/estorno) ainda não existem: são a próxima
> fase e dependem do fluxo de pagamento (ADR-004). Esta spec fixa o que existe e o **contrato de
> reversão** que o trabalho de cancelamento/reembolso/alteração de data vai ter que respeitar.

> **Moeda:** a carteira guarda **real (BRL), 1 para 1**, em centavos. Não é moeda de pontos nem tem
> conversão. Cashback e indicação creditam dinheiro de verdade; o débito (fase seguinte) abate a
> cobrança na mesma proporção.
>
> **Nomenclatura:** o produto se chama **carteira Movepark** (Movepark Wallet); o nome "MoveCoins"
> foi descontinuado. Os objetos técnicos usam o prefixo `wallet_` (`wallet_ledger`, `wallet_expiry_days`,
> índice `wallet_cashback_once`), renomeados na migration `20260819000000_wallet_rename_movecoins`.

## Por que esta spec existe

O schema do Motor de Crescimento (níveis, indicação, carteira) nasceu direto no banco vivo e foi
capturado em duas migrations (`20260723500000_growth_engine_membership_referral` e
`20260724000000_movecoins_wallet`), sem spec. Antes de mexer em cancelamento, reembolso e alteração
de data (que vão passar a debitar e estornar saldo), a carteira precisa ser um alicerce confiável:
validado, testado e com o contrato de reversão escrito.

## Modelo

| Tabela / coluna | Papel |
|---|---|
| `wallet_ledger` | Ledger append-only. Saldo = soma dos lançamentos não expirados, em centavos de real. `amount_cents > 0` crédito, `< 0` débito. `kind in ('cashback','referral','debit','expire','adjust')`. Trancada por RLS (0 policies): acesso só por RPC/trigger `SECURITY DEFINER`. |
| `membership` / `membership_tier` | Nível do cliente (Ignição 2% → Turbo 3% → Nitro 5% → Pódio invite-only). `cashback_bps` mora no catálogo, calibrável no Manager. |
| `referral` / `referral_code` | Indicação (quem indicou quem) e código por perfil. |
| `app_setting.wallet_expiry_days` | Validade do crédito em dias (default 90). |

**Idempotência:** índice parcial `wallet_cashback_once (booking_id) where kind = 'cashback'`
garante no máximo um cashback por reserva.

## Créditos (o que existe hoje)

| Gatilho | Trigger / RPC | Regra |
|---|---|---|
| Reserva vira `completed` | `tg_booking_completed_cashback` | Credita `round(total_amount * cashback_bps / 100)` centavos. Recomputa o nível antes de ler o bps (independe da ordem dos triggers). Não credita se total 0, bps 0 ou `profile_id` nulo. |
| 1ª reserva concluída do indicado | `tg_booking_completed_referral` | Credita `reward_amount` (default R$25) nos dois lados e fecha a indicação como `rewarded`. |
| Atribuição da indicação | `redeem_referral_code(code)` | Guardas: código existe, não é o próprio (`self`), cliente ainda sem reserva concluída (`not_new`), uma indicação por conta (`already`). |
| Leitura | `get_my_wallet()` | Saldo (só créditos válidos), próximos a expirar (janela de 60 dias) e extrato (últimos 20). Filtra `expires_at is null or expires_at > now()`. |

**Observação de dados:** créditos que expiram somem do saldo pelo filtro de leitura; não há evento
`expire` materializado no ledger (o `kind = 'expire'` existe no enum mas não é usado hoje).

## Contrato de reversão (o que o cancelamento/reembolso/alteração de data precisa respeitar)

Isto é a razão desta spec. Quando o débito de saldo entrar no checkout, os fluxos que mexem numa
reserva já paga passam a ter obrigação sobre a carteira.

1. **Invariante atual (limpa):** cashback e indicação só creditam em `completed`. Cancelamento e
   estorno acontecem em `pending`/`confirmed`, antes de `completed`, então **não há crédito para
   estornar** nesses fluxos hoje. Nenhuma mudança de carteira é necessária no cancelamento enquanto o
   débito não existir.
2. **Débito (fase seguinte):** gastar saldo abate a cobrança e é **server-authoritative** (a Edge de
   pagamento revalida o valor, o cliente nunca informa quanto gastou). Cada débito registra uma linha
   `kind = 'debit'` (`amount_cents < 0`) vinculada ao `booking_id`.
3. **Reversão do débito:** cancelar ou estornar uma reserva que gastou saldo **tem que devolver** o
   débito. A reversão precisa ser **idempotente por reserva** (uma devolução por booking, no mesmo
   padrão do `cancel_booking_with_release`, que já é a fonte única de cancelamento e libera capacidade
   no máximo uma vez). Devolve como estorno do débito (`kind = 'adjust'` positivo, ou o simétrico do
   `debit`), preservando a validade original quando fizer sentido.
4. **Alteração de data:** se a reserva reprecifica e havia saldo gasto, a Edge que aplica a mudança
   revalida o débito com o novo valor (ajusta a diferença), sem recriar o débito do zero.
5. **Clawback de cashback em estorno de reserva concluída (em aberto):** hoje não existe reversão de
   cashback já creditado. Se um dia uma reserva `completed` for estornada, decidir se o cashback é
   revertido. Registrado como questionamento (Q-012) no backlog; fora do escopo até o débito existir.

Enquanto a fase de débito não chega, o cancelamento/reembolso **não toca** a carteira, e isso é
correto pela invariante 1. O trabalho novo só herda obrigação de carteira quando o débito for
implementado.

## Segurança

- Ledger trancado por RLS (0 policies): só RPC/trigger `SECURITY DEFINER`.
- Hardening (`20260818000000_wallet_rpc_hardening`): `get_my_wallet()` e `redeem_referral_code(text)`
  deixam de ser executáveis por `anon` (nasceram sem o `revoke` porque a migration da carteira veio
  depois da `growth_engine_rpc_hardening`). As duas exigem sessão; `anon` nunca deveria alcançá-las.
  Zera o advisor `anon_security_definer_function_executable`.

## Testes

`supabase/tests/wallet.test.sql` (pgTAP): estrutura + RLS + hardening (anon barrado),
cashback na conclusão (valor por bps + idempotência + guarda de valor 0), indicação (crédito dos dois
lados + `rewarded` + guardas do redeem), saldo e exclusão de crédito expirado em `get_my_wallet`.
Valores conferidos contra o banco vivo. Front (lógica pura) em `src/features/growth/growth.logic.test.ts`.
