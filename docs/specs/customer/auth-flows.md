# Fluxos de autenticação — Customer

> Login passwordless. Três métodos: **Google**, **OTP por e-mail**, **OTP por WhatsApp**.
> Auth provider: **Supabase Auth** (e-mail OTP nativo; WhatsApp via Send SMS Hook customizado).

> **Backoffice (manager/operator)** continua com **e-mail + senha** em `/login` — escopo separado, não muda nesta fase.

---

## 1. Princípios

- **Sem senhas pro cliente.** Reduz fricção e elimina classe inteira de bugs (esqueci senha, força, vazamento).
- **Guest checkout** continua first-class. Conta só vira obrigatória ao confirmar reserva.
- **Google OAuth** como atalho. Quem prefere senha social não precisa pegar OTP.
- **Tela única `/entrar`.** Não tem mais "signup" vs "login" — a primeira verificação cria a conta automaticamente.
- **Pós-login**, se o profile ainda não tem `first_name + tax_id`, redireciona pra `/account/complete-profile` antes de liberar checkout.

---

## 2. Rotas e estado

```
/entrar                      tela única customer (público)
/login                       login backoffice (e-mail+senha, manager/operator)
/auth/callback               retorno OAuth Google
/account/complete-profile    onboarding pós-OTP (customer)
/logout                      action — redireciona pra /

# Removidas
/signup                      ← redireciona pra /entrar
/forgot-password             ← removida (sem senha p/ esquecer)
/reset-password              ← removida
```

Query param `?next=/rota/protegida` é preservado e usado pós-login.

---

## 3. `/entrar` — máquina de estados

```
choice → email → email-code → ✓
       → phone → phone-code → ✓
       → google → callback → ✓
```

### 3.1 Modo `choice`

```
┌──────────────────────────────────────┐
│        [Wordmark Movepark]           │
│              Hub                     │
├──────────────────────────────────────┤
│  Entre na Movepark                   │  display-md
│  Reserve em segundos.                │  body-md muted
│                                      │
│  [G  Continuar com Google ]          │  primary
│                                      │
│  ── ou ──                            │
│                                      │
│  [✉   Entrar com e-mail   ]          │  secondary
│  [📱  Entrar com WhatsApp ]          │  secondary
│                                      │
│  Ao continuar, aceita os Termos e a  │
│  Política de privacidade.            │  caption muted
└──────────────────────────────────────┘
```

### 3.2 Modo `email`

```
← Voltar

E-mail
[                                    ]

[       Enviar código        ]
```

- Submit: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- Avança pra `email-code`.

### 3.3 Modo `email-code`

```
← Voltar

Digite o código que mandamos pra
maria@email.com

┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
│  ││  ││  ││  ││  ││  │      6 inputs auto-advance
└──┘└──┘└──┘└──┘└──┘└──┘

[      Verificar       ]

Não chegou? Reenviar em 30s
```

- Submit: `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
- Sucesso → trigger no banco cria `profiles` (se primeiro acesso). Avança pra `/account/complete-profile` se incompleto, ou destino (`next` / `/`).
- Reenvio: botão habilita após 30s.

### 3.4 Modo `phone`

```
← Voltar

WhatsApp
[+55] [(11) 99999-9999          ]

[       Enviar código        ]

Você vai receber um código pelo WhatsApp.
```

- Input com máscara BR (padrão). Aceita formato livre, normaliza pra E.164 antes do submit.
- Submit: `supabase.auth.signInWithOtp({ phone: '+55...', options: { shouldCreateUser: true, channel: 'whatsapp' } })`.
- Avança pra `phone-code`.

### 3.5 Modo `phone-code`

Mesmo layout do `email-code`, texto: "Digite o código que mandamos pelo WhatsApp pra +55…".

- Submit: `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`.

### 3.6 Google

- Botão único no modo `choice`. Vai pra `/auth/callback` igual hoje.

---

## 4. Envio de OTP — backend

### 4.1 E-mail
- **Nativo do Supabase.** Configurar SMTP custom em Dashboard → Authentication → Emails → SMTP.
- Template do e-mail OTP customizado em Dashboard → Authentication → Email Templates → "Magic Link" (mesmo template, conteúdo passa `{{ .Token }}`).
- Variáveis necessárias: nenhuma do nosso lado. Supabase gerencia geração, expiração (1h default, podemos reduzir), validação.

### 4.2 WhatsApp
- Supabase **Send SMS Hook** (Dashboard → Authentication → Hooks → Send SMS Hook).
- Webhook aponta pra Edge Function `send-whatsapp-otp`.
- Quando o cliente chama `signInWithOtp({ phone })`, Supabase gera OTP e dispara POST pra Edge Function com payload:

```json
{
  "user": { "id": "uuid", "phone": "5511999999999" },
  "sms": { "otp": "123456" }
}
```

- A Edge Function chama a **WhatsApp Business Cloud API** (Meta) com template OTP aprovado:

```
POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {ACCESS_TOKEN}

{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "template",
  "template": {
    "name": "movepark_otp",
    "language": { "code": "pt_BR" },
    "components": [
      { "type": "body", "parameters": [{ "type": "text", "text": "123456" }] },
      { "type": "button", "sub_type": "url", "index": "0",
        "parameters": [{ "type": "text", "text": "123456" }] }
    ]
  }
}
```

- Secrets esperadas (Supabase Edge Function → secrets):
  - `META_PHONE_NUMBER_ID`
  - `META_ACCESS_TOKEN` (System User Token permanente)
  - `META_TEMPLATE_NAME` (ex: `movepark_otp`)
  - `META_TEMPLATE_LANGUAGE` (ex: `pt_BR`)
  - `SEND_SMS_HOOK_SECRET` (HMAC pra verificar que o request veio do Supabase)

- Verificação da assinatura: Supabase assina o payload com HMAC SHA-256 do header `x-supabase-signature`. Edge Function valida antes de chamar Meta.

### 4.3 Template OTP no Meta
Categoria: **Authentication**. Tipo: **One-time password**. Texto sugerido:

```
Body:
{{1}} é seu código Movepark. Não compartilhe com ninguém.
O código expira em 5 minutos.

Button (Copy code): {{1}}
```

Meta aprova em geral em ~30 minutos pra templates Authentication.

---

## 5. `/account/complete-profile`

Gate que aparece pós-primeiro-login se `profiles.first_name = null OR profiles.tax_id = null`.

```
Falta pouco

Conta nome e CPF pra emitir notas das suas reservas.

Nome                     Sobrenome
[                  ]     [                  ]

CPF
[                                  ]

[        Continuar         ]
```

- `RequireRole(['customer'])` + verificação de `profile.first_name && profile.tax_id`; se incompleto, redireciona pra cá com `?next=` preservando destino original.
- Pula esta tela só se ambos os campos estiverem preenchidos (caso o Google já tenha populado `first_name`).

---

## 6. Logout

Mesmo de antes: `supabase.auth.signOut()` + limpa caches + redireciona pra `/`.

---

## 7. Sessão e segurança

- Token JWT padrão Supabase (1h, refresh automático).
- OTP expira em **5 minutos** (configurável em Auth → Email/Phone settings).
- Rate limit nativo Supabase: 1 OTP por minuto por destino, 5 tentativas por hora.
- Sair de todos os dispositivos: `/account/security` chama `signOut({ scope: 'global' })`.

---

## 8. Acessibilidade

- 6 inputs OTP têm `aria-label="Dígito N"` e `inputMode="numeric" pattern="[0-9]*"`.
- Auto-advance focar próximo input ao digitar; backspace volta um.
- Paste no primeiro input distribui pelos seis.
- Telefone com máscara visível (display) mas valor real em E.164.

---

## 9. Open points

- [ ] **2FA pra customer**: ainda faz sentido com OTP sendo o método primário? Talvez só pra Google (que pula OTP).
- [ ] **Refresh do token de WhatsApp**: token permanente do Meta + monitorar Webhook de "account_update" caso revogue.
- [ ] **Fallback se WhatsApp falhar**: hoje retorna erro; futuramente cair pra SMS como backup (precisa Twilio).
- [ ] **Anti-bot**: hCaptcha ou Turnstile na tela `/entrar` se virar alvo de scraping.
- [ ] **i18n dos templates**: criar variantes `movepark_otp_en`, `movepark_otp_pt_PT` quando for ativar outros locales.

---

## 10. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.text-input}` | Forms |
| `{component.button-primary}` | "Enviar código" |
| `{component.button-secondary}` | Botões de método e Voltar |
| `OtpInputGroup` (novo) | 6 dígitos auto-advance |
| `PhoneInput` (novo) | Input com prefixo +55 + máscara |
| Card | Wrapper |
| Wordmark + Monogram | Header |
