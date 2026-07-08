# Exclusão de conta + anonimização (E0.9 · LGPD art. 18)

> Status: 🚧 Em implementação — migration `20260729000000_account_anonymization.sql`,
> Edge `delete-account`, UI em `/account/security`. Testes: `supabase/tests/account_deletion.test.sql`
> (pgTAP) + `supabase/functions/delete-account/logic.test.ts` (deno) + `DeleteAccountDialog.test.tsx` (Vitest).

O cliente final pode **excluir a própria conta**. A LGPD art. 18 garante o direito de eliminação;
reter PII sem base é risco legal. A decisão de negócio é **anonimizar mantendo a venda**: o usuário
some (vira anônimo), mas os registros de reserva/pagamento ficam preservados (obrigação fiscal ~5 anos).

## Por que anonimizar in-place (e não hard-delete)

O esquema **força** essa escolha:

- `booking.profile_id → profiles.id` é **ON DELETE RESTRICT** → reservas travam a exclusão do perfil.
- `profiles.id → auth.users.id` é **ON DELETE CASCADE** → deletar o `auth.users` de quem tem reserva
  **falharia** (a cascata bateria no RESTRICT do booking).

Logo, não há hard-delete do perfil. Faz-se **scrub da PII in-place**, mantendo as linhas de
`profiles`/`auth.users`/`booking` e banindo o login.

## Decisões (E0.9)

| # | Decisão |
|---|---|
| Modelo | **Anonimizar in-place** — mantém linhas, scrub da PII, `deleted_at`, ban do login |
| Janela | **Imediato** — irreversível na confirmação (sem carência de 30 dias) |
| Público | **Só consumidor** — se o usuário for membro/dono de empresa (`profile_company`), **bloqueia** e orienta a sair/transferir antes |
| Export | **Fora do escopo** — "Baixar meus dados" (portabilidade) vira atividade irmã |

> **Autorização:** é ação *self-service* do próprio usuário — **fora** do modelo de escopos
> company-scoped da ADR-005 (não existe escopo `account:delete`). A verdade é `auth.uid() = alvo`:
> a RPC só toca `auth.uid()`.

## O que acontece a cada dado (regra canônica)

| Tabela / recurso | Ação | Detalhe |
|---|---|---|
| `profiles` (uid) | **scrub + `deleted_at`** | `full_name = '(Conta excluída)'`; `phone/tax_id/birth_date/avatar_url = null`; `preferences = '{}'` |
| `booking` (profile_id = uid) | **scrub, mantém a linha** | `customer_name/customer_email/customer_phone/notes/voucher_url = null`. **Mantém** `profile_id`, preço, datas, status, utm |
| `vehicle`, `address`, `payment_method`, `profile_saved` (profile_id = uid) | **hard-delete** | dados puramente pessoais. `booking.vehicle_id` é `ON DELETE SET NULL` → a referência histórica se desliga sozinha |
| `review` (profile_id = uid) | **mantém** | rating/comentário têm valor pro local; o autor fica anônimo via `profiles.full_name` |
| `auth.users` (uid) | **scrub + ban permanente** | `email → deleted-<uid>@anonymized.movepark.invalid`; metadata limpa; `ban_duration ≈ 100 anos` |
| Storage `vouchers/<booking_id>.pdf` | **delete objects** | PDF com placa/nome (privado). Foto de perfil: hoje **não** há bucket dedicado — basta nulificar `avatar_url` |

**Reservas ativas** (status `pending`/`confirmed` com check-out no futuro) são **canceladas +
estornadas** conforme a política vigente antes do scrub, **reusando** `refundDecision` +
`gateway.refundCharge` + `cancel_booking_with_release` (o mesmo motor do `cancel-booking`,
E0.3.2). Reservas passadas/concluídas ficam (só sofrem scrub).

## Arquitetura

Dois pontos, server-authoritative:

1. **RPC `public.anonymize_own_account()`** (`SECURITY DEFINER`, `search_path=public`, opera sobre
   `auth.uid()`, `revoke from anon`) — faz a guarda de operador + o scrub/delete atômico no banco.
2. **Edge `delete-account`** — orquestra o que precisa de `service_role`:
   valida o JWT → guarda operador → cancela/estorna reservas ativas → chama a RPC (com o JWT do
   usuário) → apaga vouchers no Storage → scrub + ban no `auth.users`. Retorna
   `{ ok: true, cancelled, refunded }`.

**Front:** `/account/security` → seção "Zona de perigo" → `DeleteAccountDialog` (confirmação por
digitação do e-mail da sessão). No sucesso: `signOut()` + volta pra `/` + toast de despedida.
Hook `useDeleteAccount()` em `src/features/account/api.ts`.

## Idempotência e falhas

- A RPC é idempotente (re-scrub não faz mal; a guarda de empresa continua valendo).
- Estorno falhou → **nunca** cancela sem estornar; aborta e o usuário repete.
- Scrub/ban do `auth.users` falhou depois do scrub do banco → retorna erro pra retry (banco já
  anônimo; o login segue até o retry banir).

## Fora do escopo (tarefas irmãs)

- **Baixar meus dados** (export JSON — portabilidade, LGPD art. 18).
- **Exclusão de conta de operador** (saída/transferência de empresa, KYC do recebedor).
- Retenção/expurgo de logs (`api_request_log.ip`) e backups do Supabase.
