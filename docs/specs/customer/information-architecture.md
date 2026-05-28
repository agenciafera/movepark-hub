# Information Architecture — Consumer App

> Como o cliente navega pelo Hub. Rotas, navegação global, footer, bottom-nav.

---

## 1. Sitemap

```
/                                                  Home pública
├─ /search?dest=…&from=…&to=…&…                    Resultados
├─ /p/:operatorSlug/:locationSlug/:parkingTypeCode Listing detail
│  └─ /p/:o/:l/:pt/checkout                        Checkout (mesma URL, modal/sheet)
│
├─ /login                                          Login
├─ /signup                                         Cadastro
├─ /forgot-password                                Recuperar senha
├─ /reset-password?token=…                         Reset com token
├─ /verify-email?token=…                           Confirmação de e-mail
│
├─ /account                                        Perfil (logado)
│  ├─ /account/profile                             Dados pessoais
│  ├─ /account/vehicles                            Meus veículos
│  ├─ /account/cards                               Cartões salvos
│  ├─ /account/addresses                           Endereços (nota fiscal)
│  ├─ /account/preferences                         Notificações e idioma
│  └─ /account/security                            Senha + 2FA
│
├─ /bookings                                       Minhas reservas (logado)
│  ├─ /bookings/upcoming                           Próximas (default)
│  ├─ /bookings/active                             Em uso
│  ├─ /bookings/history                            Histórico
│  └─ /bookings/:code                              Detalhe + voucher
│
├─ /voucher/validate?code=:code                    Validação operacional (público)
│
├─ /seja-parceiro                                  LP de aquisição B2B
├─ /sobre                                          Quem somos
├─ /ajuda                                          Central de ajuda
├─ /termos                                         Termos de uso
├─ /privacidade                                    Política de privacidade
│
├─ /manager/*                                      Painel admin Hub (existente, role hub_admin)
└─ /operator/*                                     Painel operadora (existente, role company_operator)
```

---

## 2. Tabela de rotas

| Rota | Auth | SEO | Render | Observações |
|---|---|---|---|---|
| `/` | público | indexável | SSG/SSR | Hero + busca + cidades em destaque |
| `/search` | público | indexável (params canônicos) | SSR | URL é shareable; back-button preserva estado |
| `/p/:o/:l/:pt` | público | indexável | SSR | Schema.org `Product` + `Offer` |
| `/p/:o/:l/:pt/checkout` | público com fallback | noindex | client | Aceita checkout como guest |
| `/login`, `/signup` | público | noindex | client | |
| `/account/*` | obrigatório | noindex | client | Redirect para `/login?next=…` se anônimo |
| `/bookings`, `/bookings/:code` | obrigatório | noindex | client | Idem |
| `/voucher/validate` | público | noindex | client | Usado por operadora pra check-in |
| `/seja-parceiro` | público | indexável | SSG | LP B2B |
| `/manager/*`, `/operator/*` | role-gated | noindex | client | Já implementadas |

> **SSR/SSG**: Vite atual é SPA puro. Pra SEO, considerar migração futura pra Next.js OU usar `vite-plugin-ssr` / `@react-router/server`. **Por ora**, marcar tarefa pra revisitar.

---

## 3. Topbar pública (não-logado)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Wordmark Movepark]   [pill busca: Aeroporto · Datas · Veículo]  │
│                                          [PT-BR ▾] [Entrar] [≡]  │
└──────────────────────────────────────────────────────────────────┘
```

| Posição | Componente | Comportamento |
|---|---|---|
| Esquerda | Wordmark Movepark | Click → `/` |
| Centro | `{component.search-bar-pill}` | Mostrado quando rolado pra baixo na home. Em listing/checkout, aparece sempre |
| Direita | Language picker · "Seja parceiro" link · `[Entrar]` button | Em mobile, vira sheet via ≡ |

Hairline `1px` inferior, sem shadow. Altura **80 px** (`--nav-height`).

### Topbar logada (cliente)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Wordmark]   [pill busca]              [PT-BR ▾] [♡] [🔔] [👤▾]  │
└──────────────────────────────────────────────────────────────────┘
```

| Item | Função |
|---|---|
| ♡ (heart) | Lista de favoritos (futuro v2) |
| 🔔 | Notificações (badge com contador) |
| 👤 ▾ | Avatar dropdown: Minhas reservas, Perfil, Veículos, Cartões, Configurações, Sair |

---

## 4. Footer

3 colunas no desktop, 1 coluna empilhada no mobile.

```
┌─────────────────────────────────────────────────────────────────┐
│ Suporte           │ Operadoras            │ Movepark            │
│ Central de ajuda  │ Seja parceiro         │ Sobre nós           │
│ Como funciona     │ Painel operadora      │ Carreiras           │
│ Política de       │ API parceiros (futuro)│ Imprensa            │
│ cancelamento      │                       │                     │
│ Reembolso         │                       │                     │
│ Fale conosco      │                       │                     │
├─────────────────────────────────────────────────────────────────┤
│ © 2026 Movepark · Termos · Privacidade · Cookies · LGPD         │
│                                              [🌎 PT-BR (R$)] [⬇] │
└─────────────────────────────────────────────────────────────────┘
```

Tipografia: `title-sm` no header das colunas, `body-sm` nos links, `caption-sm muted` no legal-band.

Background **branco** (sem contraste). Hairline superior `1px`. Padding `48px × 80px` desktop, `32px × 24px` mobile.

---

## 5. Mobile bottom navigation

Aparece em telas `< 744 px`. Substitui a topbar reduzida quando logado.

| Ícone | Rota | Quando aparece |
|---|---|---|
| 🔎 Buscar | `/` | sempre |
| ♡ Favoritos | `/account/saved` | logado |
| 🎟 Reservas | `/bookings/upcoming` | logado |
| 👤 Conta | `/account` | logado |

Não logado: 🔎 Buscar · ❓ Ajuda · 👤 Entrar.

Altura `64px`. Hairline superior. `bg-canvas`. Ícone ativo em `ink`, inativos em `muted`.

---

## 6. Estados de rota

### Loading global (route transition)
- Topbar mostra barra de progresso indeterminada de **2px** em `mp-primary` no topo.
- Conteúdo da página renderiza skeleton screens (cada tela tem o seu).

### 404
- Página `/404` com ilustração leve (caminho de carro perdido), título "Não achamos essa página", CTA "Voltar para a home".

### 500
- Página com mensagem "Algo deu errado por aqui. Já estamos olhando.", botão "Tentar de novo" (reload) e link pra `/ajuda`.

---

## 7. Permissões e redirecionamento

```
                     ┌─────────────────────┐
   anonymous  ──────▶│ rotas públicas      │
                     │ /, /search, /p/…    │
                     │ /login, /signup, …  │
                     └─────────┬───────────┘
                               │  acessa rota auth-required
                               ▼
                  ┌────────────────────────────────┐
                  │ Redirect /login?next=…rota… │
                  └─────────┬──────────────────────┘
                            │ após autenticar
                            ▼
                  ┌────────────────────────┐
                  │  Retorna pra rota orig │
                  └────────────────────────┘
```

**Role-based**:
- `customer` → rotas públicas + `/account/*`, `/bookings/*`
- `company_operator` → cai em `/operator` ao logar (já implementado)
- `hub_admin` → cai em `/manager` (já implementado)

Se um `customer` tenta `/manager/…` → 403 (ou redirect pra `/account`).
Se um `company_operator` tenta `/bookings` → 403 com mensagem "Esta área é para clientes finais".

---

## 8. Deep links e shareable URLs

| Padrão | Exemplo |
|---|---|
| Busca compartilhável | `/search?dest=GRU&from=2026-06-10T22:00&to=2026-06-15T08:00&pax=2` |
| Listing direto | `/p/aerovalet/aeroporto-guarulhos/covered` |
| Reserva com voucher | `/bookings/MP-A8K7P2` |
| Validação operacional | `/voucher/validate?code=MP-A8K7P2` |

Slugs **estáveis** (operator + location + parking_type code). Mudança de slug deve gerar 301.

---

## 9. Internacionalização

Estrutura prevista (não obrigatória já):

```
/pt-BR/                  default brasileiro
/pt-PT/                  Portugal
/en/                     inglês
```

OU header `Accept-Language` + cookie de preferência, sem prefixo de rota. **Decisão pendente** — provavelmente cookie + persisted preference, porque o catálogo é pequeno.

---

## 10. Open points

- [ ] SSR vs CSR para SEO de `/`, `/search`, `/p/…`. Decidir antes da fase 1.
- [ ] Estrutura de slug: `operator/location/type` está OK? Conflito quando duas empresas têm aeroporto de mesmo nome (ex: aerovalet/guarulhos vs bandeirapark/guarulhos) — `:operatorSlug` no path resolve.
- [ ] Como diferenciar "Reservas em uso" de "Próximas" no UI? Tab única filtrada por status é OK ou separa rotas?
- [ ] Footer-only legal: precisa de página `/cookies` separada do `/privacidade`? Depende do consentimento LGPD escolhido.
