# Fluxos de autenticação — Customer

> Login, cadastro, recuperação de senha, verificação de e-mail.
> Auth provider: **Supabase Auth** (já em uso pro Manager/Operator).

---

## 1. Princípios

- **Não obrigar conta no checkout** — guest checkout é first-class.
- **Login social como atalho** — Google e Apple (futuro), nunca obrigar.
- **E-mail + senha** como método base (compatível com a base existente).
- **Magic link** como fallback para "esqueci a senha" (Supabase suporta).

---

## 2. Rotas e estado

```
/login                       login (público)
/signup                      cadastro (público)
/forgot-password             pedir reset
/reset-password?token=…      formar nova senha
/verify-email?token=…        confirmar e-mail
/logout                      action — redireciona pra /
```

Query param `?next=/rota/protegida` é preservado e usado pós-login.

---

## 3. `/login`

### Layout
Centralized card 480px width, fundo `bg-soft-gradient`.

```
┌──────────────────────────────────────┐
│        [Wordmark Movepark]           │
│              Hub                     │
├──────────────────────────────────────┤
│  Entre na sua conta                  │  display-md
│  Continue sua reserva de onde parou. │  body-md muted
│                                      │
│  E-mail                              │
│  [                                 ] │
│                                      │
│  Senha                               │
│  [                              👁 ] │
│                                      │
│  □ Lembrar de mim                    │
│  Esqueceu a senha?         [link]    │
│                                      │
│  [        Entrar          ]          │
│                                      │
│  ── ou ──                            │
│                                      │
│  [G  Continuar com Google ]          │  futuro
│  [   Continuar com Apple  ]          │  futuro
│                                      │
│  Ainda não tem conta? [Cadastre-se]  │
└──────────────────────────────────────┘
```

### Validação
- E-mail: formato.
- Senha: min 6 chars (UI não revela regras complexas pra não-leaker info de produção).

### Submit
- Chama `supabase.auth.signInWithPassword({ email, password })`.
- Erro genérico se credencial inválida: **"E-mail ou senha incorretos."** (sem revelar qual).
- Sucesso: redireciona pra `next` ou `/` (se customer), `/manager` (se hub_admin), `/operator` (se company_operator).

### "Lembrar de mim"
- Marcado: `persistSession: true` (já default no Supabase JS).
- Desmarcado: sessão expira ao fechar o navegador. (Implementar via `sessionStorage` em vez de `localStorage` se possível.)

---

## 4. `/signup`

### Form
- **Nome completo** (obrigatório)
- **CPF** (obrigatório no BR; opcional no PT)
- **E-mail** (obrigatório, validação)
- **Senha** (obrigatório, mín 8 chars, indicador visual de força)
- **Telefone** (opcional)
- **Termos** (checkbox obrigatório com links)
- **Marketing** (checkbox opcional "Quero receber ofertas")

### Indicador de força da senha
Barra horizontal:
- Vazia: cinza.
- Fraca (< 8 chars): vermelho.
- Média (8+ chars): amarelo.
- Forte (8+ chars + número + maiúscula): verde.

### Submit
- Chama `supabase.auth.signUp({ email, password, options: { data: { full_name, phone, tax_id } } })`.
- Trigger no banco (`on_auth_user_created`) cria `profiles` com role `customer` automaticamente.
- Envia e-mail de verificação (Supabase faz).
- Mostra tela "Confirme seu e-mail":

```
Quase lá!
Mandamos um link de confirmação pra maria@email.com.
Cheque sua caixa de entrada (ou spam) e clique no link.

[Reenviar e-mail]    [Mudar e-mail]
```

- Após confirmar (`/verify-email?token=…`), redireciona pra `next` ou `/`.

### Validações inline
- Conforme digita.
- CPF inválido: borda vermelha + helper text "CPF inválido. Confira os números."
- E-mail já cadastrado: helper text "Esse e-mail já tem conta. [Fazer login]".

---

## 5. `/forgot-password`

### Form
```
Esqueceu sua senha?
Sem problemas — vamos te ajudar a recuperar.

E-mail
[                                    ]

[Enviar link de recuperação]
```

### Submit
- Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`.
- Mostra confirmação independente de existir ou não (não vazar info):

```
Pronto.
Se houver uma conta com esse e-mail, você vai receber um link
para criar uma nova senha em alguns minutos.

[Voltar para o login]
```

---

## 6. `/reset-password?token=…`

### Form
```
Crie uma nova senha

Nova senha
[                              👁 ]
[indicador de força]

Confirmar nova senha
[                              👁 ]

[Salvar nova senha]
```

### Submit
- Valida que as duas senhas batem.
- Chama `supabase.auth.updateUser({ password })`.
- Sucesso → redireciona pra `/login` com toast "Senha alterada. Faça login com a nova senha."

### Token expirado
Banner vermelho "Esse link expirou. [Pedir um novo]".

---

## 7. `/verify-email?token=…`

Endpoint que chama `supabase.auth.verifyOtp({ token_hash, type: 'email' })`.

### Estados
- **Loading**: spinner "Confirmando seu e-mail…".
- **Sucesso**: "E-mail confirmado! Redirecionando…" + redireciona pra `/account/profile` (logado) ou `/login` (caso a sessão tenha caducado).
- **Erro**: "Não conseguimos confirmar. O link pode ter expirado." + `[Reenviar e-mail]`.

---

## 8. Login social (futuro)

### Google
- Botão Google no `/login` e `/signup` (mesmo design).
- `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })`.
- Callback `/auth/callback` (componente que faz `exchangeCodeForSession`).
- Se primeiro login: pede CPF + telefone numa tela de complemento `/account/complete-profile` antes de liberar `/checkout`.

### Apple
- Mesma lógica, provider `apple`.

---

## 9. Logout

`POST /logout`:
- `supabase.auth.signOut()`
- Limpa caches React Query (`queryClient.clear()`)
- Redireciona pra `/`

Disponível em:
- Avatar dropdown da topbar logada.
- `/account/profile` (botão "Sair de todos os dispositivos").

---

## 10. Auth no checkout (guest)

Já documentado em [checkout.md §3](checkout.md#3-step-1--identifica%C3%A7%C3%A3o), mas resumindo:

- Permite continuar sem conta.
- Ao final do checkout (Step 4), oferece **claim**: "Crie uma senha pra acompanhar sua reserva: [campo senha] [Criar conta]". Usa o e-mail que ele já informou + dispara verificação.

---

## 11. Convite "Você foi indicado"

Link compartilhável `/signup?ref=ABC123` populando código de indicação no form. Tracking pra atribuir crédito ao indicador. **Fora do MVP**.

---

## 12. Segurança

### Rate limiting
- 5 tentativas de login por IP em 15 min → bloqueia 30 min com mensagem "Muitas tentativas. Tente novamente em 30 minutos."
- Implementar via Supabase Edge Function ou middleware no gateway.

### Sessão
- Token JWT padrão Supabase (1h, refresh automatico).
- Sessão revogável via `/account/security`.

### Senha
- Hash bcrypt (Supabase já faz).
- Mín 8 chars na criação. Sem rotação obrigatória.

### Auditoria
- Eventos `login_success`, `login_failed`, `signup`, `password_reset_requested`, `password_changed` em `auth.audit_log_entries` (Supabase nativo).
- Lista visível em `/account/security`.

---

## 13. Acessibilidade

- Inputs com `<label>` explícito.
- Show/hide password com `aria-pressed` + `aria-label="Mostrar senha"`.
- Indicador de força com `role="meter"` e `aria-valuenow/min/max`.
- Erro de campo: `aria-invalid="true"` + `aria-describedby="error-{field}"`.
- Anúncio `aria-live="polite"` ao receber resposta do servidor.

---

## 14. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.text-input}` | Forms |
| `{component.button-primary}` | "Entrar" / "Criar conta" |
| `{component.button-tertiary-text}` | Links inline |
| Card | Wrapper |
| Wordmark + Monogram | Header |

---

## 15. Open points

- [ ] **Login social**: priorizar Google ou Apple? Sintaxe difere por provider.
- [ ] **Magic link**: oferecer como método principal junto com senha? Mais simples mas exige acesso a e-mail toda vez.
- [ ] **Telefone com OTP**: Brasil usa muito SMS. Considerar como método de login alternativo? Custos de SMS.
- [ ] **2FA pra customer**: obrigatório ou opt-in? MVP: opt-in (Account → Security).
- [ ] **Recovery codes**: implementar geração de 10 códigos pra fallback do 2FA.
- [ ] **CAPTCHA**: necessário no signup pra evitar bots? hCaptcha ou Turnstile (Cloudflare)?
- [ ] **i18n dos e-mails de auth**: Supabase tem templates editáveis. Customizar pt-BR/pt-PT/en.
