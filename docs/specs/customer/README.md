# Move Park Hub — Consumer App

> Frontend voltado para o cliente final que reserva uma vaga.
> Linguagem visual: **Movepark + Airbnb** (ver [design-tokens.md](../design-tokens.md)).

---

## 1. Visão geral

O **Consumer App** é o site/aplicativo público onde qualquer pessoa pode:

1. **Buscar** uma vaga de estacionamento próxima a um aeroporto/cidade, **a partir de datas e horários** (não a partir de um estacionamento específico).
2. **Comparar** opções de múltiplas operadoras (Aerovalet, Plenty, Nationpark, …) num único feed unificado, com mapa + lista.
3. **Reservar e pagar** uma vaga, opcionalmente adicionando serviços extras (Capa Protetora, AutoStart, Seguro de cancelamento etc.).
4. **Gerenciar** suas reservas, veículos, cartões salvos e dados pessoais.
5. **Acessar o voucher** com QR code no dia da reserva.

A grande mudança em relação ao legado é que o usuário **não escolhe mais um tenant/operadora primeiro** (`aerovalet.movepark.co`, `plenty.movepark.co` etc.). O Hub aceita uma busca por **destino + datas** e devolve resultados de **todas as operadoras** que servem aquele ponto.

---

## 2. Audiência

| Persona | Perfil | Comportamento típico |
|---|---|---|
| Viajante de aeroporto BR | Brasileiro, 30-55a, viaja a trabalho/lazer, posta veículo até 30 dias | Busca por aeroporto + datas, prioriza preço e distância |
| Viajante PT | Portugal/Europa, dirige até Lisboa/Faro pra voar | Mesma mecânica, geralmente em EN ou PT-PT |
| Operador de PME | Pequena empresa, reserva pra colaboradores | Vai pra reservas em lote (futuro v2) |
| Curta permanência | Usuário urbano (Nine, Moveparking) que precisa de horas | Busca por endereço + horário, paga por hora |

> Idiomas: **pt-BR** (padrão), **pt-PT**, **EN** (Airpark/Redpark/Skypark).
> Moedas: **BRL** (BR), **EUR** (PT — futuro).

---

## 3. Princípios

1. **Search-first.** A home é uma busca, não uma lista de operadoras.
2. **Photography-led.** Toda vaga tem foto. Sem foto, sem destaque. (Placeholder genérico até as fotos chegarem.)
3. **Confiança visível.** Rating + avaliações + selos ("Vaga favorita", "Operador verificado") no card. O número de rating é o único momento tipográfico "alto" do sistema (64 px / 900 — ver [design-tokens.md](../design-tokens.md)).
4. **Uma cor de marca.** Vermelho `#DA455E` carrega CTA, save (coração), search orb. Não tem outras cores compitindo.
5. **Sem jargão técnico.** "Vaga coberta com café" não vira "covered_with_breakfast". Mensagens são feitas pro cliente, não pro dev.
6. **Mobile-first.** 60%+ do tráfego vai vir de mobile. Bottom bar de reserva, search overlay full-screen, drawer lateral pra perfil.

---

## 4. Index das specs

| Arquivo | Escopo |
|---|---|
| [README.md](README.md) | Esta página — visão geral + voz/tone + index |
| [information-architecture.md](information-architecture.md) | Sitemap, rotas, navegação global, footer, mobile bottom-nav |
| [home-and-search.md](home-and-search.md) | Home pública, hero, pill search bar, categorias, recentes |
| [search-results.md](search-results.md) | Página de resultados — lista + mapa + filtros + ordenação |
| [listing-detail.md](listing-detail.md) | Página de detalhe de uma vaga (operadora + localização + tipo) |
| [checkout.md](checkout.md) | Fluxo de checkout (identificação → veículo → pagamento → confirmação) |
| [account-area.md](account-area.md) | Área logada — perfil, veículos, cartões, endereços |
| [my-bookings.md](my-bookings.md) | Lista e detalhe das reservas do cliente, voucher QR |
| [auth-flows.md](auth-flows.md) | Login, signup, recuperação de senha, verificação de e-mail |
| [responsive-and-states.md](responsive-and-states.md) | Comportamento mobile/tablet/desktop, estados de loading/erro/empty |

---

## 5. Voz e tom

### Tom
Direto, brasileiro, formal-amigável. Verbos no infinitivo nos CTAs (**"Reservar agora"**, não "Reservar minha vaga agora!"). Sentence case sempre — só `NEW` e `OPERADOR VERIFICADO` em caixa alta com 0.4px tracking.

### Pronome
- **"Você"** para o cliente.
- **"Nós"** para a Movepark, parcimoniosamente — a marca fala pelo produto, não em primeira pessoa.
- **3a pessoa** para operadoras: "Operada por Aerovalet", "Hospedada pelo Nationpark".

### Números, preços, unidades
- `R$ 24 / dia`, `R$ 12 / hora` (espaço antes e depois da barra).
- Rating: `4,81 · 248 avaliações` (vírgula decimal em pt-BR; ponto em EN).
- Distância: `0,8 km do aeroporto · 2 min de shuttle`.

### Sem emoji
A marca é funcional. Substituímos por ícones Lucide ou unicode `·` / `·` como separador.

### Exemplos canônicos

| Surface | Texto |
|---|---|
| Hero h1 | "Estacione com confiança em qualquer aeroporto" |
| Hero sub | "Mais de 12 mil vagas verificadas, com reserva instantânea." |
| Card title | "Vaga coberta · Aeroporto de Congonhas" |
| Card meta | "Operado por Aerovalet · 1,2 km · Shuttle 24h" |
| CTA primário | "Reservar" / "Continuar" |
| Empty | "Ainda nada por aqui. Comece buscando um aeroporto." |
| Erro (rede) | "Não conseguimos buscar agora. Tente de novo em alguns segundos." |
| Erro (sem vaga) | "Esse período já está cheio. Tente outras datas próximas." |

---

## 6. Tecnologia (recomendado)

Já temos uma SPA Vite + React 18 + Tailwind + shadcn/ui + Supabase. O Consumer App deve viver no **mesmo build** sob rotas públicas:

```
/                          → home pública
/search?…                  → resultados
/p/:operatorSlug/:locationSlug/:parkingTypeCode  → listing detail
/checkout/:bookingCode     → checkout
/account/*                 → área logada
/bookings/*                → minhas reservas
/login, /signup, …         → auth
/manager/*, /operator/*    → painéis (existentes — protegidos por role)
```

**Stack adicional necessária**:
- **Mapa**: [`maplibre-gl`](https://maplibre.org/) (cliente open-source, ~200KB gzipped) + [MapTiler Cloud](https://www.maptiler.com/cloud/) (tiles, free tier 100k loads/mês, US$ 0,50/1000 acima). Quando escalar > 100k sessões/mês, migrar tiles pra [Protomaps](https://protomaps.com/) self-hosted em Cloudflare R2 (mesmo client, troca só a URL). Detalhes em [search-results.md §7](search-results.md#stack-do-mapa--decis%C3%A3o-t%C3%A9cnica).
- `react-day-picker` (já temos em deps)
- Server-side image optimization (Supabase Storage transforms)
- LGPD/cookies banner

---

## 7. Roadmap de implementação sugerido

1. **Fase 1 — Estrutura pública**: home, search bar, página de resultados (sem mapa ainda, só lista), listing detail estático.
2. **Fase 2 — Reserva**: checkout completo, integração com `simulate_price` + criação de booking, gateway de pagamento (PIX primeiro).
3. **Fase 3 — Conta e reservas**: área logada, lista de reservas, voucher PDF.
4. **Fase 4 — Mapa + busca avançada**: mapa interativo, filtros, ordenação por distância via PostGIS.
5. **Fase 5 — Reviews + saves**: avaliações pós-reserva, lista de favoritos.
6. **Fase 6 — i18n + PT/EN**: idiomas para Portugal.

---

## 8. Open points

- [ ] Photography library — não existe ainda; usar placeholders neutros (Unsplash) até as fotos reais chegarem.
- [x] Gateway de pagamento: **MVP mockado** via Edge Function `mock-payment` (PIX confirma em ~3s, cartão em ~1s). Gateway real fica pra pós-MVP. Detalhes em [checkout.md §5](checkout.md#5-step-3--pagamento).
- [x] Provider de mapa: **MapLibre GL + MapTiler Cloud** no MVP → migrar tiles pra **Protomaps self-hosted** na escala. Detalhes em [search-results.md §7](search-results.md#stack-do-mapa--decis%C3%A3o-t%C3%A9cnica).
- [ ] Como modelamos reviews? Tabela `review (booking_id, rating, comment, created_at)` ligada a booking pós-uso?
- [ ] "Wishlist / saved" precisa de tabela `profile_saved_parking (profile_id, location_parking_type_id)`.
- [ ] LGPD: cookies banner, consentimento, deletar conta.
- [ ] SEO: server-side rendering de listing detail (Vite SSG ou migração pra Next.js?).
