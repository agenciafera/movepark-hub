# Área da conta — `/account/*`

> Onde o cliente gerencia seus dados, veículos e métodos de pagamento.
> Auth obrigatória — redireciona pra `/login?next=/account` se anônimo.

---

## 1. Estrutura

```
/account                       redirect para /account/profile
├─ /account/profile            dados pessoais
├─ /account/vehicles           meus veículos
├─ /account/cards              cartões salvos
├─ /account/addresses          endereços (NF / cobrança)
├─ /account/preferences        notificações e idioma
└─ /account/security           senha e 2FA
```

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar normal (logada)                                       │
├──────────────────────────────────────────────────────────────┤
│  Conta                                                       │  display-lg
├──────────────────┬───────────────────────────────────────────┤
│                  │                                           │
│  Sidebar 240px   │  Conteúdo da sub-rota                     │
│                  │                                           │
│  👤 Perfil       │                                           │
│  🚗 Veículos     │                                           │
│  💳 Cartões      │                                           │
│  📍 Endereços    │                                           │
│  🔔 Preferências │                                           │
│  🔒 Segurança    │                                           │
│  ──              │                                           │
│  Sair            │                                           │
└──────────────────┴───────────────────────────────────────────┘
```

**Mobile**: a sidebar vira a própria página `/account` (lista de links com chevron à direita). Cada link abre a sub-rota como tela cheia com botão "‹ Voltar".

---

## 3. `/account/profile`

### Campos
| Campo | Tipo | Editável | Validação |
|---|---|---|---|
| Foto | upload | sim | jpg/png, max 5MB, recorte para quadrado |
| Nome completo | text | sim | obrigatório, mín 3 chars |
| CPF | masked text | **não** após criação | exibido com máscara, primeiros 3 dígitos visíveis |
| Data de nascimento | date picker | sim | >= 18 anos |
| E-mail | email | sim (com confirmação) | requer verificação ao alterar |
| Telefone | masked text | sim | máscara BR/PT conforme país |
| Idioma preferido | select | sim | pt-BR, pt-PT, en |

### Layout
2 colunas no desktop, 1 coluna no mobile.

### Ações
- Botão `[Salvar alterações]` (primary) — desabilitado se não houver dirty.
- Botão `[Excluir minha conta]` (danger) — abre o modal de confirmação por digitação do **e-mail**
  (auth é passwordless, não há senha). Fluxo em [account-deletion.md](./account-deletion.md).

### Verificação de e-mail
Alterar e-mail dispara:
1. Envia e-mail de verificação pro novo endereço.
2. Mostra banner: "Verificamos o novo e-mail. Clique no link enviado para confirmar."
3. Até confirmar, e-mail oficial continua sendo o antigo. Próxima visita mostra:
   ```
   📧 Pendente: confirme o novo e-mail (novo@email.com).
   [Reenviar verificação] [Cancelar]
   ```

---

## 4. `/account/vehicles`

### Lista
Cards horizontais, um por veículo:

```
┌─────────────────────────────────────────────────┐
│ [icon]  ABC-1D23                          [⋮]   │
│         Honda Civic 2020 · Prata                │
│         Cadastrado em 12/03/2026                │
└─────────────────────────────────────────────────┘
```

Menu `⋮` (dropdown): Editar · Excluir · Tornar padrão.

Botão sticky bottom-right `[+ Novo veículo]` (FAB no mobile).

### Form de criação/edição
- **Placa** (obrigatório, máscara `AAA-0A00` / Mercosul ou antiga; valida formato)
- **Marca** — combobox autocomplete com FIPE (req `GET /fipe/brands`)
- **Modelo** — combobox dependente de marca (req `GET /fipe/brands/:id/models`)
- **Ano modelo** — select (opcional)
- **Cor** — select (Branco · Preto · Prata · Cinza · Vermelho · Azul · Outro)
- **Veículo padrão** — toggle

Salvar → `INSERT/UPDATE vehicle` (auth.uid() = profile_id via RLS).

### Veículo padrão
Marcado com badge "Padrão" no card. Pre-selecionado no checkout. Apenas 1 pode ser padrão por usuário.

### Estados
- **Empty**: ilustração simples (carro outline) + "Você ainda não cadastrou veículos. Adicione um pra agilizar suas reservas."
- **Loading**: 2 skeletons.
- **Veículo associado a reserva ativa**: bloqueia exclusão; tooltip "Veículo em uso na reserva MP-…"

---

## 5. `/account/cards`

### Lista
```
┌─────────────────────────────────────────────────┐
│ [Visa logo]  •••• •••• •••• 4242       [⋮]      │
│              Maria Silva · Vence 12/27          │
│              [Padrão]                           │
└─────────────────────────────────────────────────┘
```

Menu `⋮`: Tornar padrão · Excluir.

Botão `[+ Adicionar cartão]`.

### Form de adição
- Número, validade (MM/AA), CVV, nome impresso, CPF do titular.
- Tokeniza via gateway (jamais armazena PAN no nosso DB).
- Tipo de cartão detectado (`Visa`, `Mastercard`, `Elo`, `Amex`, `Hipercard`).

Salvar → tabela `payment_method (profile_id, provider, provider_token, last4, brand, expiry, is_default)`.

### Considerações
- Cartão expirado → badge "Expirado" + ação "Atualizar".
- Excluir cartão associado a reserva pendente: bloqueado.

---

## 6. `/account/addresses`

Endereços usados pra emitir **nota fiscal** ou cobrança de boleto.

### Lista
```
┌─────────────────────────────────────────────────┐
│ [home icon]  Casa                       [⋮]    │
│              Rua Tito, 153 · Perdizes           │
│              São Paulo · SP · 05129-901         │
│              [Padrão]                           │
└─────────────────────────────────────────────────┘
```

### Form
- Apelido (Casa, Trabalho, etc.) — texto livre.
- CEP (busca automática via `cep-promise` ou ViaCEP).
- Logradouro, número, complemento, bairro, cidade, estado, país.
- Toggle "Endereço padrão".

---

## 7. `/account/preferences`

### Notificações
Toggles agrupados:

```
E-mail
□ Confirmação de reserva
□ Lembrete pré-check-in
□ Ofertas e promoções

Push (futuro)
□ Confirmação de pagamento
□ Atualizações da reserva

SMS
□ Lembrete de check-in (Premium)
```

### Idioma e moeda
- **Idioma**: select pt-BR (default), pt-PT, en.
- **Moeda preferida**: BRL (default), EUR.

Ambos persistem em `profile` e cookie (`mp-lang`, `mp-currency`).

### Cookies / LGPD
- Banner LGPD inicial: "Aceitar cookies essenciais [✓ obrigatório] / analytics [□] / marketing [□]".
- Página `/account/preferences` permite re-revisar preferências de cookies a qualquer momento.
- Botão "Baixar meus dados" → exporta JSON com todo o histórico (LGPD art. 18).

---

## 8. `/account/security`

### Alterar senha
- Senha atual
- Nova senha (validação visual: 8+ chars, 1 maiúscula, 1 número)
- Confirmar nova senha
- Botão "Alterar senha" → revoga sessões existentes (exceto a atual).

### 2FA
Lista de métodos:
- Aplicativo autenticador (Google Authenticator, Authy) — TOTP.
- SMS — fallback (futuro).

Toggle "Ativar 2FA" → wizard de setup com QR + códigos de recuperação.

### Sessões ativas
Lista de dispositivos logados:

```
🖥 Mac · Chrome · São Paulo · agora    [Sessão atual]
📱 iPhone · Safari · São Paulo · há 2 dias    [Encerrar]
```

Botão "Encerrar todas as outras sessões".

### Log de atividade
Tabela de eventos recentes:
- Login realizado
- Senha alterada
- E-mail alterado
- Cartão adicionado
- Reserva criada/cancelada

Cada linha: ícone + descrição + horário + IP (mascarado).

---

## 9. Excluir minha conta

Modal de confirmação dupla:

```
Tem certeza que quer excluir sua conta?

Isso vai apagar permanentemente:
• Seus dados pessoais
• Seus veículos e cartões salvos
• Seu histórico de reservas (mantido por 5 anos para fins fiscais)

Reservas em andamento serão automaticamente canceladas conforme política.

Para confirmar, digite seu e-mail:
[                                              ]

[Cancelar]                            [Excluir conta]
```

**Anonimização imediata in-place** (não é hard-delete agendado): `profiles.deleted_at = now()` +
scrub da PII (`first_name = '(Conta excluída)', last_name = null`, demais campos nulos; `full_name` é gerada). As reservas mantêm o
`profile_id` (venda preservada por exigência fiscal), apenas com a PII removida; o login é banido.
Só para contas de consumidor. Regra canônica em **[account-deletion.md](./account-deletion.md)**
(E0.9 · LGPD art. 18).

---

## 10. Estados de salvamento

| Estado | UI |
|---|---|
| Idle (form clean) | Botão "Salvar" desabilitado |
| Dirty | Botão "Salvar" habilitado |
| Saving | Botão com spinner + texto "Salvando…" |
| Success | Toast bottom-right "Alterações salvas" |
| Error | Toast vermelho "Não conseguimos salvar — tente novamente" + manter form dirty |

---

## 11. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.text-input}` | Forms |
| `{component.button-primary}` | "Salvar" |
| `{component.button-tertiary-text}` | "Excluir conta" |
| Avatar | Foto de perfil |
| Sidebar | Side-nav |
| `{component.card-base}` | Lista de veículos/cartões/endereços |

---

## 12. Open points

- [ ] **FIPE API**: usar pública do `parallelum.com.br/fipe/api/v1` ou cachear localmente no Hub?
- [ ] **Tokenização de cartão**: depende do gateway escolhido. Stripe + Pagar.me suportam, mas a UI varia.
- [ ] **Tabela `payment_method`**: não existe ainda — falta migration.
- [ ] **Tabela `address`**: não existe ainda — falta migration.
- [ ] **Foto de perfil**: storage no Supabase Storage bucket `profile-photos`, transforms para 64/128/256.
- [ ] **2FA TOTP**: Supabase Auth tem suporte via `mfa.enroll` — usar isso ou implementar manual? Provavelmente usar Supabase.
- [ ] **LGPD compliance**: definir exatamente quais dados são exportáveis. Inicialmente: profile + vehicles + bookings + payments resumidos (sem dados sensíveis de cartão).
- [ ] **Suporte a múltiplos idiomas no front**: i18n key-based, ou markdown por idioma? Provável `react-i18next`.
