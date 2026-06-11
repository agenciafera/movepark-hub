# Avaliações (PRD-08) — Spec de Engenharia

> Sistema de avaliações por estacionamento: coleta pós-estadia, agregado, exibição e
> JSON-LD (rich snippet de estrela + citação por IA). **Ao mudar uma regra, atualize esta
> spec no mesmo PR.**

**Status:** ✅ Fase 1 (PRD-08.1–08.4) na migration `20260613000000_reviews_engine.sql` +
✅ Fase 2 (08.5 moderação no Manager, 08.6 curadoria "Mais bem avaliados") — só UI/reuso, sem
migration nova. Coleta por **e-mail** (WhatsApp = fast-follow). Moderação **pós-publicação**.

Relacionado: [booking-flow.md](./booking-flow.md) · [customer/listing-detail.md](./customer/listing-detail.md) ·
[customer/search-results.md](./customer/search-results.md) · [customer/my-bookings.md](./customer/my-bookings.md) ·
[operator-panel.md](./operator-panel.md) · [agent-readiness-seo.md](./agent-readiness-seo.md).

---

## 1. Modelo de dados
- `review` (baseline): `booking_id` UNIQUE (1 review/reserva), `profile_id`, `location_id`,
  `rating` 1-5, sub-notas `rating_cleanliness/service/value/access` (1-5, opcionais), `comment`,
  `is_published` (default true), **`owner_response`/`owner_response_at`** (resposta do dono).
- `location.review_avg` (numeric 2,1) + `location.review_count` — **agregado cacheado** (só publicados),
  recomputado pelo trigger `review_bump_rating` a cada insert/update/delete de review.
- `booking.review_request_sent_at` — idempotência da coleta.

## 2. Escala & exibição
- **5 estrelas**, estrela em **ink** (não amarela), número com vírgula (`formatRating`).
- Card de busca e topo do detalhe: selo `★ 4,8 · 248 avaliações` (`RatingBadge`). **Some sem avaliações**.
- Bloco na unidade (`ReviewsBlock`): grid 2-col (autor, data, nota, comentário, resposta do dono) + modal "ver todas".
- Busca: `sort=rating_desc` e filtro `min_rating` (edge `search` lê `location.review_avg/count`).

## 3. Coleta pós-estadia
- **pg_cron** `complete-bookings-hourly` → `cron_complete_bookings()` marca reservas
  `confirmed`/`checked_in` com `check_out_at < now()` como `completed`.
- Edge **`review-request`** (chamada por cron via pg_net) envia e-mail (`tplReviewRequest`, SES)
  para reservas `completed` sem review e com `review_request_sent_at` nulo; carimba o envio.
  Link → `/bookings/:code` (CTA "Avaliar"). **One-time op:** segredo Vault `review_request_key`
  (service-role JWT) p/ o cron chamar a edge.
- Submissão: RPC **`submit_review`** (`SECURITY DEFINER`) valida reserva própria `completed`,
  1 por reserva; UI `ReviewForm` no detalhe da reserva (`completed`).

## 4. Resposta do dono
- RPC **`operator_respond_review`** (`SECURITY DEFINER` + guard `profile_company`/hub_admin).
- UI `/operator/reviews` (nav "Avaliações"): lista reviews das unidades + responder.
- A resposta aparece publicamente no `ReviewsBlock`.

## 5. Moderação (pós-publicação) — ✅ 08.5
- `is_published=true` por padrão. `hub_admin` modera em **`/manager/reviews`** (nav "Avaliações"):
  lista todas as reviews (RLS deixa o hub_admin ver até as despublicadas), com toggle
  **Publicar/Despublicar** (UPDATE direto gateado pela RLS `review_admin_moderate`; o trigger
  recomputa o agregado). Filtro "só despublicadas".
- Antifraude: 1 review por reserva (UNIQUE `booking_id`) + só reserva própria `completed`
  (RLS `review_insert` + RPC `submit_review`) — sem código adicional.

## 5b. Curadoria "Mais bem avaliados em [aeroporto]" — ✅ 08.6
- Módulo na página de destino (`/destinos/:slug`) que reusa a busca (`sort=rating_desc` +
  `min_rating`, edge `search`) filtrando `review_count > 0` (`topRated()`); mostra os 4 mais bem
  avaliados perto do aeroporto, acima da lista geral. Cross-sell + prova social citável por IA.
  Some quando não há unidades avaliadas.

## 6. JSON-LD (SEO/GEO)
- `productOfferSchema` (Product/Offer — regra "self-serving" do Google) ganha **`aggregateRating`**
  (ratingValue/reviewCount/bestRating 5) + **`review[]`** (top N), **só quando `review_count > 0`**.
  Habilita rich snippet de estrela e alimenta citação por IA.

## 7. Testes
- pgTAP `reviews_rpc.test.sql`: submit (rejeita não-completed/de outro; 1/reserva), agregado
  (só publicados; recomputa em despublicação/delete), resposta do dono (guard 42501), cron.
- Vitest: `reviews.logic.ts`, `jsonld.test.ts` (aggregateRating/review só com count>0).
- Edge `review-request`: `deno test` (template + honeypot via `review_request_sent_at`).

## 8. Deploy / ops — ✅ feito em staging
- Edge `search` redeployada (v13, `verify_jwt=false`) e `review-request` deployada (`verify_jwt=false`,
  função interna de cron, idempotente via `review_request_sent_at`).
- Cron ativo: `complete-bookings-hourly` (marca `completed`) + `review-request-hourly` (pg_net →
  `review-request` com a anon key) — coleta por e-mail rodando (SES já configurado via `app_setting`).
- **Hardening (follow-up):** a `review-request` é pública (`verify_jwt=false`); o risco é baixo
  (idempotente, só envia 1 e-mail por reserva). Para produção, proteger com um header-segredo
  (`x-cron-secret` validado na função + guardado p/ o cron) ou usar o service-role via Vault.
