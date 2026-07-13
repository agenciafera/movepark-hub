# Templates de e-mail do Auth (Supabase)

HTML dos e-mails de autenticação, no mesmo casco de marca das Edge Functions
(`supabase/functions/_shared/email.ts`). São **estáticos**: os e-mails de Auth do
Supabase são configurados no **dashboard**, não em código.

> As imagens apontam para `https://hub.movepark.co/brand/...` (servidas pelo
> Cloudflare Pages a partir de `public/brand/`). Precisam estar publicadas em
> produção para renderizar no e-mail. As variáveis `{{ .Token }}` e
> `{{ .ConfirmationURL }}` são substituídas pelo Supabase no envio.

## Como aplicar

Dashboard do Supabase → **Authentication › Emails › Templates**. Para cada template,
cole o conteúdo do arquivo correspondente no campo **Message body (HTML)**:

| Arquivo | Template no dashboard | Variável | Uso |
|---|---|---|---|
| `auth-otp-codigo.html` | **Magic Link** | `{{ .Token }}` | Login passwordless do consumidor (OTP por e-mail, código de 6 dígitos). É o fluxo atual. |
| `auth-magic-link.html` | **Magic Link** (alternativa) | `{{ .ConfirmationURL }}` | Caso opte por link de 1 clique no lugar do código. Use um OU outro, não os dois. |
| `auth-confirm-signup.html` | **Confirm signup** | `{{ .ConfirmationURL }}` | Confirmação de e-mail no cadastro. |
| `auth-reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` | Recuperação de senha (backoffice). |

O assunto (Subject) de cada template fica no próprio dashboard. Sugestões:

- Magic Link (código): `Seu código de acesso à Movepark`
- Confirm signup: `Confirme seu e-mail na Movepark`
- Reset Password: `Redefina a senha da sua conta Movepark`

## Regenerar

Estes arquivos são gerados a partir do `shell()` de `email.ts` (mesmo casco).
Ao mudar o casco, regenere para manter tudo consistente.
