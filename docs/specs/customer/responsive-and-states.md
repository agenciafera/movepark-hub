# Responsividade e estados — Customer App

> Como cada tela se comporta nas três classes de viewport,
> e como tratamos loading, empty, error.

---

## 1. Breakpoints

Já definidos no [design-tokens.md](../design-tokens.md):

| Nome | Largura | Comportamento dominante |
|---|---|---|
| **Mobile** | < 744 px | 1 coluna, bottom-nav, sheets full-screen, sticky bottom bar |
| **Tablet** | 744 – 1128 px | 2 colunas onde fizer sentido, sidebar colapsa em ícones |
| **Desktop** | > 1128 px | Layout completo, sidebar 240px, drawers 480px |
| **Wide** | > 1440 px | Conteúdo limita em 1280 px (1080 no listing detail) |

---

## 2. Por tela — comportamento responsivo

### Home (`/`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Hero | 4:5 photo, h1 18px line | 16:9 photo | 21:9 photo, h1 28px |
| Search bar | Pill colapsada (1 campo) → sheet full-screen | Pill expandida 2 segmentos por linha | Pill horizontal 4 segmentos |
| Categorias | Scroll horizontal nativo + snap | Idem | Idem |
| Aeroportos populares | 1 col grid | 2 col | 4 col |
| Trust band | empilhado vertical | 2x2 grid | 4 col horizontal |
| "Como funciona" | vertical | vertical | 3 col horizontal |
| Footer | 1 col empilhado | 3 col | 3 col |

### Search results (`/search`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Sticky topbar | mini pill | pill compacta | pill com 4 segmentos visíveis |
| Filtros | bottom sheet via `[Filtros]` | bottom sheet | sidebar 280px fixa esquerda |
| Cards | 1 col | 2 col | 3 col |
| Mapa | full-screen com lista em bottom sheet drag-up | 50/50 split | 50/50 split |
| Toggle list/map | botão flutuante FAB sticky bottom-right | botão no header | botão no header |

### Listing detail (`/p/:o/:l/:pt`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Photo grid | carrossel horizontal 4:5 | grid 2x2 | grid 5 fotos (1 grande + 4 pequenas) |
| Reservation card | **bottom bar fixo** (preço + CTA) → expande full-screen sheet | side drawer 60vw | sticky right 360px |
| Amenidades | 1 col | 2 col | 2 col |
| Reviews | 1 col | 2 col | 2 col |
| Mapa | inline 200px | inline 256px | inline 256px |

### Checkout (`/checkout/:code`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Stepper | horizontal no topo | horizontal no topo | vertical à esquerda 200px |
| Summary | bottom bar compacto + sheet expandível | drawer collapse | sticky right 360px |
| Forms | 1 col | 2 col onde aplicável | 2 col |
| Countdown | banner sticky topo | idem | idem |

### Account (`/account/*`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Sidebar | vira lista no `/account` raiz; sub-rotas são tela cheia com "‹ Voltar" | sidebar 64px ícones | sidebar 240px |
| Forms | 1 col | 2 col | 2 col |
| Listas (veículos, cartões) | 1 col stack | 1 col | 1 col |

### Bookings (`/bookings/*`)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Tabs | scroll horizontal | linha completa | linha completa |
| Cards | 1 col | 1 col | 1 col (~max 800px) |
| Detalhe — voucher | primeira seção no topo do scroll | sticky right 360px | sticky right 360px |
| Detalhe — corpo | full-width | width 700 + voucher | width 64% + voucher 32% |

### Auth (`/login`, `/signup`, …)
| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Card | full-width minus 16px gutter | 480px centered | 480px centered |
| Topbar | só wordmark | idem | idem |
| Fundo | `bg-soft-gradient` | idem | idem |

---

## 3. Touch targets

Mínimo **44 × 44 px** pra qualquer elemento clicável. Aplicação:
- Botões primários: `h-12 px-6` (48 × ≥ 96 px). ✓
- Heart save: `h-8 w-8` (32 × 32) — abaixo do mínimo, **mas** padding generoso no card compensa. Considerar 36×36 em mobile.
- Date picker day: 40×40. ✓
- Search orb: 48×48. ✓
- Pin do mapa: 32×40 (formato gota). ✓
- Bottom nav itens: 64px altura, target full-width da célula. ✓

---

## 4. Estados de carregamento

### Skeleton por componente

| Tela | Skeleton |
|---|---|
| `/` (home) | Hero `Skeleton h-[480px]` + cards `Skeleton h-[240px]` grid |
| `/search` (lista) | 6 cards skeleton (h-[360px] cada) + filtros skeleton lateral |
| `/search` (mapa) | Mapa cinza com spinner central; lista 4 skeletons |
| `/p/:…` | Photo `Skeleton h-[400px]` + h1 skeleton + paragraphs + reservation card skeleton |
| `/checkout` | Stepper estático + form skeleton (3-4 inputs) + summary skeleton |
| `/account/*` | Forms vazios com `Skeleton h-12` em cada campo |
| `/bookings` | 4 cards skeleton |
| `/bookings/:code` | Resumo skeleton + voucher skeleton |

### Loading global
Barra de **2px** no topo da viewport (`bg-mp-primary`), animação de progresso indeterminado. Aparece quando uma navegação client-side leva > 300ms.

### Re-fetch inline (sem skeleton)
Ao mudar filtros, datas etc. — não bota skeleton; mostra leve **opacity 60%** no container e cursor `wait`. Atualiza in-place.

---

## 5. Empty states

Cada empty tem: ícone outline 64×64, título `display-sm`, descrição `body-md muted` (1-2 linhas), CTA opcional.

| Contexto | Ícone | Título | Descrição | CTA |
|---|---|---|---|---|
| Sem reservas (Próximas) | Calendário | "Você ainda não tem reservas futuras." | "Que tal procurar uma vaga agora?" | `[Buscar vaga]` |
| Sem reservas (Histórico) | Histórico | "Seu histórico está vazio." | "Reservas concluídas aparecem aqui." | — |
| Sem veículos | Carro | "Cadastre um veículo." | "Adicione veículos pra agilizar suas reservas." | `[Adicionar]` |
| Sem cartões | Cartão | "Adicione um método de pagamento." | "Salve cartões pra checkouts mais rápidos." | `[Adicionar]` |
| Sem resultados de busca | Mapa | "Nenhuma vaga disponível pra esse período." | "Tente outras datas ou remova filtros." | `[Limpar filtros]` |
| Sem avaliações | Estrela | "Ainda sem avaliações." | "Seja o primeiro a avaliar." | — |
| Sem fotos | Câmera | "Foto em breve." | (placeholder em cards) | — |

---

## 6. Error states

### Categorias
| Tipo | Quando ocorre | UI |
|---|---|---|
| **Rede** | Sem conexão / timeout | Banner `bg-badge-cancelled-bg` + "Sem conexão. [Tentar de novo]" |
| **Servidor** | 5xx do backend | "Algo deu errado por aqui. Já estamos olhando. [Tentar novamente]" |
| **Validação** | 422 / inputs inválidos | Inline em cada campo (`text-error` abaixo) |
| **Permissão** | 401 / 403 | Redirect pra `/login?next=…` se 401; 403 mostra "Você não tem acesso a esta área." |
| **Não encontrado** | 404 | Tela 404 com CTA "Voltar pra home" |
| **Capacidade** | Sem mais vaga durante checkout | Mensagem específica (ver checkout.md §9) |
| **Pagamento** | Recusado pelo gateway | Banner amarelo no checkout step 3 + mensagem do gateway |

### Padrão visual
```
┌─────────────────────────────────────────────────┐
│  ⚠️  Algo deu errado por aqui.                  │  bg-badge-cancelled-bg
│      Já estamos olhando. [Tentar novamente]     │  text-error
└─────────────────────────────────────────────────┘
```

### Toast vs banner
- **Toast** (sonner bottom-right, 4s auto-dismiss): operações específicas (salvou, copiou, etc.).
- **Banner inline**: bloqueia o uso da tela; usuário precisa lidar.
- **Modal**: ações destrutivas / decisões críticas (cancelar reserva).

---

## 7. Mensagens — voz e tom

| Categoria | Padrão |
|---|---|
| Sucesso | "Pronto!" / "Salvo." / "Reserva confirmada." — direto, sem pontos de exclamação |
| Erro | Explica o problema + sugere ação. "Não conseguimos salvar agora. Tente daqui a alguns segundos." |
| Confirmação | Pergunta clara + opções óbvias: "Tem certeza que quer cancelar?" / `[Manter]` `[Cancelar]` |
| Ajuda inline | Curta. "Use 8 caracteres ou mais, com pelo menos um número." |
| Vazio | Encorajador. "Comece buscando um aeroporto." |

Sem emoji, sem caixa alta gritando.

---

## 8. Animações e motion

Tudo em [design-tokens.md §motion](../design-tokens.md). Recap:
- **Fade only**, sem bounces.
- 120ms hover, 200ms menus, 320ms modais.
- Easing `cubic-bezier(0.2, 0, 0, 1)`.
- Skeletons com `animate-pulse` (Tailwind padrão).

### Animações específicas
- **Card hover**: aparece `shadow-tier` em 120ms. Sem scale.
- **Modal/Sheet open**: fade backdrop + slide content.
- **Tab switch**: fade-only entre paineis (sem slide).
- **Toggle list/map**: cross-fade 200ms entre lista e mapa.
- **Skeleton → real content**: fade 200ms.
- **Countdown banner**: pulse leve quando < 5 min.

---

## 9. Performance budget

Targets de Lighthouse mobile (4G simulado):
| Métrica | Target | Crítica |
|---|---|---|
| LCP | < 2.5s | < 4s |
| FID / INP | < 100ms | < 200ms |
| CLS | < 0.1 | < 0.25 |
| TTI | < 5s | < 7.3s |

Bundle JS inicial: **< 250KB gzipped**. Code-split por rota.

Imagens: WebP com fallback JPEG. Lazy load tudo abaixo do fold.

---

## 10. Acessibilidade — checklist global

- [ ] Contraste mínimo AA (4.5:1 para texto pequeno).
- [ ] Navegação por teclado em 100% dos componentes interativos.
- [ ] Focus ring visível (`shadow-focus-ring`).
- [ ] Skip link "Pular pro conteúdo" no início do `<body>`.
- [ ] Labels associados a inputs (htmlFor + id).
- [ ] Estado de erro lido por screen reader (`aria-invalid`, `aria-describedby`).
- [ ] Mudanças dinâmicas anunciadas (`aria-live`).
- [ ] Ícones decorativos com `aria-hidden="true"`; ícones funcionais com `aria-label`.
- [ ] Imagens com `alt` descritivo (ou `alt=""` se puramente decorativas).
- [ ] Botão vs link: usar `<button>` pra ação, `<a>` pra navegação.

---

## 11. Estados específicos por jornada

### Logado vs anônimo
| Tela | Logado | Anônimo |
|---|---|---|
| Topbar | Avatar + dropdown + sininho + heart | Botões "Entrar" e "Seja parceiro" |
| Listing detail | "Salvar" funcional (heart) | "Salvar" abre modal "Faça login para salvar" |
| Checkout | Pula step 1 (identificação) | Tab "Entrar" + "Continuar como visitante" |
| Bottom nav | 4 ícones (incluindo Conta) | 3 ícones (Buscar, Ajuda, Entrar) |

### Tela cheia em mobile
Sheets e overlays no mobile usam **100vh** e bloqueiam scroll do body. Botão fechar ✕ sticky top-right.

### Reload / cold start
Primeira renderização sem cache:
1. Skeleton aparece em < 300ms (HTML shell).
2. Dados carregam em < 1.5s.
3. Imagens lazy-load conforme entram no viewport.

---

## 12. Dark mode

**Fora do MVP** — design tokens só pra light mode. Document como open point se virar prioridade.

---

## 13. RTL (right-to-left)

Não suportado. Movepark opera no Brasil e Portugal — sem necessidade de árabe/hebraico.

---

## 14. Print styles

- Voucher PDF: gerado server-side (não usa print CSS).
- Recibo: idem.
- Mas página de detalhe da reserva pode imprimir → CSS `@media print` esconde topbar/sidebar, mostra só o card.

---

## 15. Open points

- [ ] Confirmar lib de skeleton (provavelmente `Skeleton` do shadcn já existente).
- [ ] **Image CDN**: Supabase Storage com transforms gratuitos é suficiente até X TB. Acima disso, considerar Cloudinary.
- [ ] Métricas de Web Vitals: enviar pra um provider (Vercel Analytics, Cloudflare RUM, Sentry Performance).
- [ ] Implementar **Service Worker** pra cache offline básico (PWA mínimo).
- [ ] Confirmar lib de animação: Tailwind já faz o suficiente; não precisamos de framer-motion pro MVP.
