# Identidade unificada (E0.10 · ADR-006)

> Status: 🚧 Planejado/em implementação. Hardening da autenticação **que já existe** (Google OAuth +
> e-mail OTP + WhatsApp OTP custom) — não é auth do zero. Objetivo: **uma pessoa = uma conta**, com
> e-mail e telefone como identificadores **verificados** na mesma conta e **merge determinístico**
> entre os dois fluxos.

## Diagnóstico (staging)

- `auth.users` já garante e-mail único e telefone único, **mas cada conta tende a ter só um dos dois**
  (19 usuários: 15 só e-mail, 4 só telefone, 0 com ambos).
- **`profiles` driftou:** `profiles.phone` sem unicidade, sem coluna de e-mail. 8 telefones no
  `profiles` vs 4 no `auth.users` → 4 números órfãos (usuários Google que digitaram no "complemento"),
  **não-verificados** e desconectados da identidade.
- O furo mora no "complemento" (`src/features/checkout/Step1Identity.tsx`): telefone do usuário Google
  vai pro `profiles.phone` (não sobe pro `auth.users`); e-mail do usuário WhatsApp vai só pro
  `booking.customer_email`. Nada verificado, nenhum merge.

## Modelo (ADR-006)

- **Credencial no `auth.users`:** `email` e `phone`, verificados e únicos. O GoTrue garante a
  unicidade → colisão vira erro capturado → dispara o fluxo de merge. O provider `phone` (WhatsApp via
  Send SMS Hook) é agnóstico de backend — `auth.users.phone` **é** o identificador de login do WhatsApp.
- **`profiles` sem `email`/`phone`:** dropar `profiles.phone`, não introduzir `email`. `profiles` segue
  com `full_name`, `tax_id`, `birth_date`, `avatar_url`, `preferences`, `role`.
- **Leituras:** próprio contato → JWT (`session.email`/`session.phone`); contato de terceiros →
  snapshot da `booking` (operacional) ou RPC security-definer sobre `auth.users` (vivo). Nunca cópia
  editável no `profiles`.

## Furos a fechar

1. **Assimetria de verificação (segurança):** merge **só sobre identificador recém-verificado** — nunca
   por igualdade crua (evita sequestro de conta alheia).
2. **Ordem dos fluxos:** o telefone do usuário Google precisa subir pro `auth.users` (verificado), senão
   o login WhatsApp cria conta nova.
3. **Colisão ao anexar:** identificador já pertence a outra conta → regra determinística (abaixo).
4. **Conflito no merge:** reservas/veículos/salvos da conta perdedora reapontados; precedência de campos.
5. **Normalização:** telefone **E.164**, e-mail **lowercase**.

## Anexar identificador verificado (o "complemento" vira passo verificado)

- **Google → telefone:** `updateUser({ phone })` dispara o OTP (WhatsApp) → `verifyOtp({ type: "phone_change" })` → anexa ao `auth.users`.
- **WhatsApp → e-mail:** `updateUser({ email })` (magic-link/OTP) → confirma → anexa; ou "conectar Google" via `linkIdentity`.
- O `booking.customer_*` continua sendo só o **snapshot operacional** (inclui "reserva para outra pessoa").

## Decisão de merge (ponto único, ao anexar identificador verificado X)

| Situação | Ação |
|---|---|
| X livre | anexa direto |
| X pertence a conta B **sem histórico** | funde B→A silenciosamente |
| X pertence a conta B **com histórico** (**Q-006 — decidido**) | **confirmação explícita "conectar contas"**: como o usuário provou controle de A (sessão) e de X (OTP de B), mostra um resumo do que será unificado (reservas/veículos/salvos) e confirma → funde B→A |

## Função de merge (server-side, service_role — idempotente e transacional)

- **Sobrevivente:** a conta em sessão (A). No caso canônico (A=Google, B=WhatsApp) A mantém o OAuth e
  ganha o `phone`; B é absorvida.
- **Reaponta FKs** loser→survivor: `address`, `vehicle`, `payment_method`, `profile_saved`, `review`,
  `booking`, `api_key.created_by`. **Dedupe** onde há PK/único composto (`profile_saved`,
  `profile_company`, placa de veículo). `faq.created_by/updated_by` seguem `SET NULL`.
- **Precedência de campos** (`profiles`): verificado > não-verificado, não-nulo vence
  (`full_name`/`tax_id`/`birth_date`/`avatar_url`).
- **Auth:** seta em A a credencial que faltava (`admin.updateUserById`) e deleta B
  (`admin.auth.admin.deleteUser`) — o profile de B (já sem dados) cai por CASCADE.
- **Auditoria:** `account_merge_log` (sobrevivente, perdedor, contagens, timestamp).
- ⚠️ **Risco (prototipar em staging):** mover/juntar `auth.identities` quando B tem um provider OAuth
  que A não tem. O caso comum **não** cai nisso; se cair, usar `linkIdentity` ou bloquear com mensagem.

## Editar identificador pós-login + "Meus logins" (Q-004 — incluído)

- **`/account/security` → "Meus logins":** lista identidades (Google / e-mail / WhatsApp+telefone) via
  RPC `get_my_identities()` (a `auth.identities` não é exposta por RLS); anexar/remover (guarda: nunca
  remover o último método de login).
- **Editar identificador:** trocar telefone/e-mail sempre por **reverificação** + **checagem de colisão**
  (reusa os mesmos fluxos de anexar/merge).

## Ordem de migração (não quebrar produção nem o E0.9)

1. **Prep** (não dropa nada): atualiza `anonymize_own_account()` (E0.9) removendo `phone = null`; para
   os triggers `handle_new_auth_user`/`handle_auth_user_updated` de escreverem `profiles.phone`; cria
   `merge_accounts` + `account_merge_log` + `get_my_identities`; move telefones órfãos não-verificados
   pra `preferences.unverified_phone_hint` (a UI oferece verificar — **sem** promoção silenciosa).
2. **Código** (front + edges) deixa de ler `profiles.phone` (`session.phone`, snapshot da `booking`,
   fallback via `admin.getUserById`). Deploy.
3. **Drop** `profiles.phone` (migration separada, por último).

## Pontos que dependem de `profiles.phone` hoje (a migrar)

`profile.tsx`/`complete-profile.tsx` (edita) · `Step1Identity.tsx` (checkout) · `BookingModal.tsx`/
`BookingDrawer.tsx` (staff → `booking.customer_phone`) · `bookings/api.ts` `baseSelect` + `domain.ts`
`BookingWithRelations.profile` (remove `phone`) · Edges `pagarme-webhook`/`extend-booking` (fallback →
snapshot ou `admin.getUserById`). `session` ganha `phone`.

## Conecta com

E2.9 (auth WhatsApp) · E2.2.1 (checkout+login) · E2.3 (conta do cliente) · E0.9 (exclusão/anonimização —
a RPC deixa de tocar `profiles.phone`) · Q-004 · Q-006 (decidido). ADR: **ADR-006**.
