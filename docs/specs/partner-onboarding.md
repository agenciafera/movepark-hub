# Partner Onboarding — Spec

> Cadastro de novos estacionamentos parceiros na plataforma, em **duas etapas**:
> captura de lead (público) → aprovação manual (Manager) → onboarding de configuração (parceiro).
> Design base: Airbnb design system (recolorido com brand MovePark).

---

## 1. Visão Geral

O onboarding de parceiro é o fluxo disparado pelo botão **"Cadastre seu estacionamento"** (CTA público no site). Ele é dividido em dois momentos separados por uma **aprovação manual** da equipe MovePark:

| Etapa | Quem faz | O que acontece |
|---|---|---|
| **Stage 1 — Lead Capture** | Visitante (dono do estacionamento) | Cadastro básico da empresa. Cria o registro de `company` marcado como **pendente de aprovação**. Tela de agradecimento. |
| **Aprovação** | `hub_admin` (Manager Panel) | Equipe valida o lead, entra em contato, e **aprova** ou **rejeita**. Aprovar libera o Stage 2 e dispara o convite. |
| **Stage 2 — Setup Onboarding** | Parceiro (futuro `company_operator`) | Wizard de configuração: completa dados da empresa, cadastra localização(ões), tipos de vaga, capacidade e precificação. Ao final, a empresa fica pronta para ativação. |

**Princípio:** o Stage 1 é otimizado para conversão (curto, baixo atrito). Toda a complexidade de configuração mora no Stage 2, atrás da aprovação — só investimos esforço de setup em leads qualificados.

---

## 2. Estados & Ciclo de Vida

A empresa nasce no Stage 1 e progride por uma máquina de estados de onboarding, **independente** do `status` operacional (`entity_status`: active/inactive/suspended).

```
                  ┌─────────────┐
   Stage 1  ───►  │ pending_    │
   (lead)         │ review      │
                  └──────┬──────┘
                         │ hub_admin aprova        │ hub_admin rejeita
                         ▼                         ▼
                  ┌─────────────┐           ┌─────────────┐
                  │ approved    │           │ rejected    │ (terminal)
                  │ (convite    │           └─────────────┘
                  │  enviado)   │
                  └──────┬──────┘
                         │ parceiro inicia Stage 2
                         ▼
                  ┌─────────────┐
                  │ in_progress │ ◄─── parceiro salva wizard (rascunho)
                  └──────┬──────┘
                         │ parceiro envia setup completo
                         ▼
                  ┌─────────────┐
                  │ submitted   │ ─── (opcional) revisão final do hub_admin
                  └──────┬──────┘
                         │ aprovação final / go-live
                         ▼
                  ┌─────────────┐
                  │ active      │ (company.status → active)
                  └─────────────┘
```

| Estado | Significado | Visível ao parceiro | `company.status` |
|---|---|---|---|
| `pending_review` | Lead capturado, aguardando triagem da equipe | "Recebemos seu cadastro" | `inactive` |
| `approved` | Aprovado; convite enviado, aguardando parceiro iniciar | "Acesse para continuar" | `inactive` |
| `in_progress` | Parceiro preenchendo o wizard (rascunho salvo) | wizard | `inactive` |
| `submitted` | Setup enviado, aguardando revisão final (opcional) | "Em análise final" | `inactive` |
| `active` | Empresa publicada e operando | painel completo | `active` |
| `rejected` | Lead recusado (terminal, com motivo registrado) | e-mail de recusa | `inactive` |

> **Decisão de design (confirmada):** o registro de `company` é criado **já no Stage 1**, conforme pedido — não há tabela de "lead" separada. Os metadados de lead/onboarding ficam em `company_onboarding` (1:1). Alternativa (tabela `partner_application` separada que só "promove" para `company` na aprovação) está registrada em [Open Points](#11-open-points).

---

## 3. Stage 1 — Lead Capture

### 3.1 Rota & Acesso

- **Rota:** `/parceiros/cadastro` (público, sem auth)
- **Entrada:** CTA "Cadastre seu estacionamento" no top-nav e footer do site do cliente
- **Objetivo:** máxima conversão — formulário curto, uma tela (ou 2 passos leves)

### 3.2 Formulário

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `contact_name` | texto | ✅ | Nome do responsável |
| `contact_email` | e-mail | ✅ | Vira login do parceiro no Stage 2 |
| `contact_phone` | telefone | ✅ | Contato para validação (WhatsApp) |
| `company_name` | texto | ✅ | Nome do estacionamento/empresa |
| `tax_id` (CNPJ) | texto | ⬜ | Opcional no lead; exigido no Stage 2 |
| `city` / `state` | texto/select | ✅ | Qualificação geográfica |
| `estimated_spots` | número | ⬜ | Porte do estacionamento (qualificação) |
| `message` | textarea | ⬜ | Observações livres do parceiro |
| `accept_terms` | checkbox | ✅ | Aceite de termos/LGPD |

**Campos ocultos (tracking):** `utm_source`, `utm_medium`, `utm_campaign`, `referrer` — capturados para atribuição de canal.

### 3.3 Validações

- E-mail válido e **não pertencente a uma empresa já ativa** (evita duplicidade). Se já houver lead com o mesmo e-mail em `pending_review`, mostrar "já recebemos seu cadastro".
- CNPJ (se informado) válido e único entre empresas.
- Telefone com máscara BR.

### 3.4 O que é criado

Ao submeter:

1. `company` — registro básico: `name`, `slug` (auto-gerado de `company_name`), `tax_id` (se informado), `status = inactive`, `onboarding_status = pending_review`.
2. `company_onboarding` — registro 1:1 com os dados de contato/lead/UTM e `submitted_at = now()`.
3. **Nenhuma** conta de autenticação ainda — o `auth.user` é criado na aprovação (ver §4.3). *(Open Point: criar conta já aqui vs. na aprovação.)*

### 3.5 Tela de confirmação

Após submeter → tela de agradecimento (não redireciona para login):

> **"Recebemos seu cadastro! 🎉"**
> Nossa equipe vai analisar as informações e entrar em contato em até **2 dias úteis** para validar e liberar a próxima etapa.

- Sem CTA de login (a conta ainda não existe).
- E-mail automático de confirmação para o parceiro + notificação interna para a equipe (ver §7).

---

## 4. Aprovação (Manager Panel)

### 4.1 Nova tela — Solicitações de Parceria

- **Rota:** `/manager/partners/applications`
- **Acesso:** `hub_admin`
- Adicionar item **"Parceiros → Solicitações"** na sidebar do [manager-panel.md](./manager-panel.md).

#### Lista

Tabela: `Empresa` · `Responsável` · `E-mail` · `Telefone` · `Cidade` · `Vagas (est.)` · `Canal (UTM)` · `Recebido em` · `Status` · `Ações`

- Filtros: status (`pending_review` / `approved` / `in_progress` / `submitted` / `rejected`) · cidade · canal · período
- Badge de status (mesma paleta de §2)
- Click na linha → drawer de detalhe

#### 4.1.1 Drawer — Detalhe do Lead

- Todos os dados do `company_onboarding`
- Ações:
  - **Aprovar** → transição `pending_review → approved`, dispara convite (§4.3)
  - **Rejeitar** → modal com `rejection_reason` (obrigatório) → `pending_review → rejected`, dispara e-mail de recusa
  - **Adicionar nota interna** (campo livre)
  - **Reenviar convite** (se `approved` e o parceiro ainda não iniciou)

### 4.2 Ação de aprovação

Ao aprovar, o `hub_admin`:
- registra `approved_at`, `approved_by` em `company_onboarding`;
- transita `onboarding_status → approved`;
- (opcional) pode pré-preencher/ajustar dados antes de liberar.

### 4.3 Criação de acesso do parceiro

Na aprovação:
1. Cria `auth.user` (Supabase Auth) com o `contact_email` via **convite por e-mail** (magic link / set-password).
2. Trigger `on_auth_user_created` popula `profiles`.
3. Cria vínculo `company_member` (`company_id`, `profile_id`, `role = company_operator`). *(Depende do modelo de staff — ver §6.4 e Open Points.)*
4. E-mail de convite com link para o Stage 2.

---

## 5. Stage 2 — Setup Onboarding (Wizard)

### 5.1 Rota & Acesso

- **Rota:** `/onboarding` (autenticado; redireciona para cá enquanto `onboarding_status ∈ {approved, in_progress, submitted}`)
- **Acesso:** `company_operator` da empresa recém-aprovada
- **Persistência:** cada passo salva rascunho (`onboarding_status = in_progress`, `current_step` atualizado). O parceiro pode sair e voltar.

### 5.2 Passos do Wizard

```
[1] Dados da empresa → [2] Localização → [3] Tipos de vaga →
[4] Precificação → [5] Serviços adicionais (opcional) → [6] Revisão & Envio
```

#### Step 1 — Dados da Empresa
Confirma/completa o que veio do lead.
- `name`, `legal_name`, `tax_id` (CNPJ) **agora obrigatório**, logo (upload)
- Dados de contato/financeiro de cobrança (se aplicável)

#### Step 2 — Localização
Cria a primeira `location` (permitir adicionar mais de uma).
- `name`, `address`, `latitude`/`longitude` (geocoding do endereço), `timezone`
- Horários de funcionamento, instruções de acesso, fotos
- Cria `location` com `status = inactive` (publica só no go-live)

#### Step 3 — Tipos de Vaga
Para a empresa: habilita os `parking_type` do catálogo global e, por localização, define capacidade.
- Seleciona `parking_type` (covered/uncovered/valet/premium/...) → cria `company_parking_type` (`base_price` placeholder, `default_capacity`)
- Por localização → cria `location_parking_type` com `capacity`
- Validação: ao menos **1 tipo de vaga** com capacidade > 0

#### Step 4 — Precificação
Por `location_parking_type`, define a estratégia (MVP: `fixed_daily` / `fixed_bracket`) — ver [pricing-engine.md](./pricing-engine.md).
- `fixed_daily`: `price_per_day`
- `fixed_bracket`: tabela de faixas (`dias_de` · `dias_ate` · `preco_total`)
- Cria `pricing_rule` (+ `pricing_tier`) por tipo de vaga

#### Step 5 — Serviços Adicionais (opcional)
- Cadastra `add_on_service` da empresa (ex: lava-jato) e habilita por localização (`location_add_on_service`)
- Pode pular

#### Step 6 — Revisão & Envio
- Resumo de tudo cadastrado (empresa, localizações, vagas, preços)
- Botão **"Enviar para análise"** → `onboarding_status → submitted`, `submitted_at = now()`
- Notifica a equipe MovePark (§7)

### 5.3 Go-Live

Após `submitted`, a equipe MovePark faz a revisão final no Manager:
- **Aprovar go-live** → `onboarding_status → active`, `company.status → active`, `location.status → active`. Empresa passa a aparecer na busca pública.
- **Devolver para ajustes** → volta a `in_progress` com comentários.

> *(Open Point: revisão final é obrigatória, ou `submitted` já publica automaticamente?)*

---

## 6. Modelo de Dados (proposta)

> ⚠️ **Proposta — não aplicada.** Migrations só após confirmação do schema (mesma regra das demais specs). Tudo em inglês.

### 6.1 Novo enum

```sql
create type onboarding_status as enum (
  'pending_review',
  'approved',
  'in_progress',
  'submitted',
  'active',
  'rejected'
);
```

### 6.2 Coluna em `company`

```
company
└── + onboarding_status: onboarding_status  (default 'pending_review')
```

> `company.status` (entity_status) permanece como estado **operacional**; `onboarding_status` é o estado de **cadastro**. Só vira `active` no go-live.

### 6.3 Nova tabela `company_onboarding` (1:1 com `company`)

```
company_onboarding
├── company_id → company  (PK, unique)
├── contact_name, contact_email, contact_phone, contact_role
├── city, state, estimated_spots, message
├── utm_source, utm_medium, utm_campaign, referrer
├── current_step              (int, progresso do wizard)
├── submitted_at              (lead enviado — Stage 1)
├── approved_at, approved_by → auth.users   (aprovação do hub_admin)
├── rejected_at, rejection_reason
├── setup_submitted_at        (Stage 2 enviado)
├── went_live_at
└── created_at, updated_at
```

### 6.4 Vínculo usuário ↔ empresa

O Stage 2 exige que o parceiro autenticado seja `company_operator` da sua empresa. Isso depende do **modelo de staff/membership** ainda pendente ([database-schema.md](./database-schema.md) → Pendências). Proposta mínima:

```
company_member
├── id, company_id → company, profile_id → profiles
├── role: company_role  (ex: 'company_operator')
├── status, invited_at, accepted_at
└── unique(company_id, profile_id)
```

> O JWT do parceiro carrega `company_id` (citado em [operator-panel.md](./operator-panel.md) §2). Esse claim deve ser populado a partir de `company_member`.

---

## 7. Notificações (e-mail)

| Evento | Destinatário | Conteúdo |
|---|---|---|
| Lead recebido (Stage 1) | Parceiro | "Recebemos seu cadastro, entraremos em contato" |
| Lead recebido (Stage 1) | Equipe MovePark | Alerta interno com dados do lead + link para o drawer |
| Aprovação | Parceiro | Convite com link para criar senha + iniciar Stage 2 |
| Rejeição | Parceiro | Recusa educada (com/sem motivo) |
| Setup enviado (Stage 2) | Equipe MovePark | "Empresa X enviou o setup para revisão" |
| Go-live aprovado | Parceiro | "Sua empresa está no ar! 🚗" + link para o Operator Panel |
| Devolvido para ajustes | Parceiro | Comentários do que corrigir |

> Templates devem ser configuráveis (alinhar com Manager → Configurações → Notificações).

---

## 8. RLS & Segurança

- **Stage 1 (`/parceiros/cadastro`):** inserção pública controlada — não expor `INSERT` direto em `company`/`company_onboarding` para `anon`. Preferir **Edge Function** (`submit-partner-lead`) que valida, faz rate-limit/anti-spam (honeypot + verificação de duplicidade) e grava com `service_role`.
- **Aprovação:** apenas `hub_admin` pode transitar estados e ler `company_onboarding`.
- **Stage 2:** parceiro só lê/escreve a **própria** `company` e entidades-filhas (via `company_member`); RLS por `company_id`.
- Empresas com `onboarding_status != 'active'` **não** aparecem nas leituras públicas da busca (filtro em todas as policies de leitura pública já existentes).

---

## 9. Estados de UI

- **Stage 1:** validação inline; loading no submit; tela de sucesso dedicada; erro amigável (e-mail duplicado → "já recebemos seu cadastro").
- **Wizard (Stage 2):** stepper no topo (passos concluídos ✓), autosave com indicador "rascunho salvo", botão "Salvar e sair", bloqueio de avanço com campos obrigatórios pendentes.
- **Empty/Pending:** se o parceiro acessa antes de aprovado → tela "Seu cadastro está em análise".
- **Toast** de sucesso bottom-right, auto-dismiss 4s.

---

## 10. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile < 744px | Stage 1 em coluna única; wizard com stepper horizontal scrollável; um passo por tela |
| Tablet 744–1128px | Form centralizado (max-width); wizard com stepper lateral colapsável |
| Desktop > 1128px | Form centralizado; wizard com stepper lateral fixo + preview |

---

## 11. Open Points

- [ ] **Conta de auth no Stage 1 ou na aprovação?** Default proposto: criar `auth.user` só na aprovação (lead não autenticado). Alternativa: criar já no Stage 1 (permite o parceiro "voltar", mas gera contas órfãs de leads não aprovados).
- [ ] **`company` no Stage 1 vs. tabela `partner_application` separada.** Default (pedido do usuário): cria `company` já no lead. Alternativa registrada caso queira manter `company` "limpa" só com parceiros aprovados.
- [ ] **Revisão final (go-live) obrigatória?** Ou `submitted` publica automaticamente?
- [ ] **Multi-localização no Stage 2:** obrigar 1 e permitir adicionar depois no Operator Panel, ou cadastrar todas já no onboarding?
- [ ] **SLA de resposta** exibido ao parceiro (2 dias úteis?) — confirmar com o negócio.
- [ ] **Anti-spam do lead:** honeypot + captcha? rate-limit por IP/e-mail?
- [ ] **Reaproveitar dono já cadastrado:** se o e-mail já é `company_operator` de outra empresa, permitir cadastrar uma segunda empresa?
- [ ] **Preço placeholder vs. obrigatório no Step 4** antes de permitir `submit`.

---

## 12. Implementação (entregue 2026-06-03)

> Reconciliações em relação à proposta original, decididas na execução.

- **Modelo de acesso reutilizado:** descartado o `company_member`/`company_role` da §6.4. O vínculo usa o que já existe: `profiles.role` (enum `user_role`) + a junção `profile_company`. As policies reaproveitam os helpers `is_hub_admin()` / `current_company_ids()`.
- **Estado de cadastro:** enum `onboarding_status` = `pending_review → approved → in_progress → active` (+ `rejected`). Coluna em `company`, ortogonal a `company.status`.
- **Go-live automático:** `onboarding_submit` publica direto (`active` + `company/location/cpt/lpt` ativos). Não há etapa de revisão final do hub_admin.
- **Escritas do wizard:** via RPCs `SECURITY DEFINER` (`onboarding_update_company`, `onboarding_upsert_location`, `onboarding_set_parking_types`, `onboarding_set_pricing`, `onboarding_set_addons`, `onboarding_submit`), padrão `create_booking_atomic`. Operador não tem INSERT direto.
- **Captura de lead:** Edge Function `submit-partner-lead` (pública, honeypot, dedup) → RPC `submit_partner_lead` (service_role). Aprovação/recusa: Edge Function `approve-partner` (hub_admin) com convite via `auth.admin.generateLink`.
- **E-mails:** AWS SES via **SMTP** (`supabase/functions/_shared/email.ts`, `denomailer`), **porta 465 (TLS implícito)** — testado e funcionando (a porta 25 é bloqueada na Edge; 465/587/2587 abrem; 587/STARTTLS dá problema no cliente, por isso 465). Envio roda em **background** (`EdgeRuntime.waitUntil`), nunca bloqueia/derruba o cadastro/aprovação; o resultado do último envio fica em `app_setting.partner_email_last_result`. Secrets sensíveis: `SES_SMTP_HOST`, `SES_SMTP_PORT` (465), `SES_SMTP_USER`, `SES_SMTP_PASS`, `PUBLIC_SITE_URL`. O **remetente** (`partner_email_from`, default `hub@movepark.co`) e a **caixa interna de leads** (`partner_leads_inbox`, default vazio) ficam em `app_setting`, **editáveis no Manager → Configurações → Parceiros**.
- **Mídia:** bucket `partner-assets` (logo da empresa + fotos da unidade em `location.photos`). **Sem geocoding** — lat/lng manuais no MVP.
- **Rotas:** `/seja-parceiro` (pública), `/manager/partners` (hub_admin), `/onboarding` (company_operator, wizard de 6 passos).
- **Precificação MVP:** Step 4 emite `uniform_by_duration` (preço fixo por dia) ou `fixed_bracket` (valor fixo por faixa) — ver [pricing-engine.md](./pricing-engine.md).
