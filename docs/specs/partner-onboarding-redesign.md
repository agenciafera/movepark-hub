# Partner Onboarding — Redesenho (rápido + encanta) — Spec

> **Épico:** [E1.9](https://app.clickup.com/t/86ajfvea4) (Fase 1) · **Decisões:** [Q-010](https://app.clickup.com/t/86ajfveeb) (decidido) · **Gate:** [D-003](https://app.clickup.com/t/86ajfveh2) (validar antes de codar)
> **Regra de amarração:** ADR-008 (`gestao/regras-arquitetura.md`) — esta spec no repo é a fonte de contexto de implementação; o ClickUp aponta pra cá.
> **Narrativa/estratégia (gestão, fora do repo):** `gestao/onboarding-parceiro-redesenho.md` · **Protótipo navegável:** artefato `movepark-onboarding-prototype`.
> **Evolui:** o **Stage 2** de [partner-onboarding.md](./partner-onboarding.md) (o wizard). O Stage 1 (lead) e a aprovação pré-moderada **não mudam** aqui, exceto o novo qualificador "já vende online?" no lead.

---

## 1. Objetivo e princípio

Refazer o wizard de `/onboarding` (`src/features/onboarding/*`) num fluxo curto, **split-screen**, que **publica a unidade com o mínimo** e empurra o resto para "deixar redondo depois" num checklist no painel. Hoje são 7 passos com **lat/lng digitada na mão** e **CNPJ/KYC no caminho do go-live** — coleta dado de cadastro, não de negócio, e mata o momentum.

**Régua única — Publicar vs Deixar redondo.** Só é "essencial agora" o que a unidade precisa para **existir, ser descoberta e transacionar**. Todo o resto é opcional e vai para o painel.

| Essencial para PUBLICAR | Por quê | Origem no modelo |
|---|---|---|
| Tipos de vaga + **capacidade** + **preço de balcão** por tipo | É a oferta; o modelo trabalha por vaga | `parking_type` (catálogo) → `location_parking_type` (capacidade) + preço (ver §4) |
| Endereço **geocodificado** (autocomplete → lat/lng) | Coloca a unidade na busca; GEO é o multiplicador (ADR-001) | `location.address` + `latitude`/`longitude` |
| **Destino** confirmado (auto-detectado) | Sem isso não aparece pro público certo | `location.destination_id` via `useNearestDestination` |
| Traslado sim/não | Decisivo em aeroporto, barato de perguntar | `location.shuttle_frequency_minutes` (detalhe fica p/ depois) |

**Deixar redondo depois (painel, checklist de completude "perfil X%"):** comodidades (catálogo `amenity`, checklist — **não** texto livre), fotos, horário/24h, "como chegar" (`directions_text`) + aviso (`notice`), política de reserva/cancelamento (`reservation_policy`), serviços pagos (`add_on_service`), logo, e **dados fiscais (CNPJ/razão) + recebimento (KYC)** — com banner "necessário para receber".

**Fora do wizard (mudança dura):** **remover o passo Empresa/CNPJ e o passo Recebimento/KYC** do onboarding. Eles são "para **receber**", não "para **publicar**" → vão para o painel "Dados fiscais e recebimento" (reaproveitando `StepPayout`/`PayoutKycForm` já existentes, movidos de lugar).

---

## 2. Fluxo proposto (split-screen)

Uma ideia por tela à esquerda; à direita, o **card da unidade se montando ao vivo** + slot de foto reservado. Voz da marca (Nubank-like), violeta reservado à ação (DESIGN.md).

**Etapa A — Essencial (publica):**
1. **Boas-vindas** — o que vamos configurar + "nada de CNPJ/papelada agora".
2. **Tipos de vaga** — chips (coberta / descoberta / coberta premium / van-SUV; catálogo `parking_type`).
3. **Capacidade + preço de balcão** — por tipo selecionado: capacidade (vagas) + preço de balcão/diária (ver §4) + qualificador "já vende online?".
4. **Onde fica** — endereço com autocomplete (→ geo) → "Perto de: *X*" (destino auto-detectado, confirmar/trocar) → traslado sim/não.
5. **Publicar** — resumo curto → **Publicar** → redireciona ao **preview travado** (§5) + mostra o **checklist** da Etapa B.

**Etapa B — Deixe redondo (painel, quando quiser):** os itens da tabela acima, cada um levando a sua tela no painel.

**Saída/"depois":** durante as ~4 telas essenciais **não** oferecer saída proeminente (é um sprint de ~2 min; não há o que pré-visualizar antes de terminá-las). Manter só um "salvar e sair" discreto (a retomada por `current_step` já existe). Tudo além do essencial já é "depois" por padrão.

---

## 3. O que reaproveita (NÃO reescrever)

Descoberta central: o `location` **já modela** quase tudo. O wizard só não expõe. Reusar:

- **Campos de `location`** (ver `LocationForm.tsx`): `destination_id`, `shuttle_frequency_minutes`, `shuttle_to_terminal_minutes`, `directions_text`, `notice`/`has_notice`, `reservation_policy`, `timezone`, `slug`, `photos`, `latitude`/`longitude`.
- **`useNearestDestination(lat, lng)`** (`features/locations/api.ts`) — já detecta o destino mais próximo (PostGIS, ADR-001, `nearest_destination`). O wizard passa a chamar isso após o geocode (o `LocationForm` do admin já tem o botão "Detectar mais próximo").
- **Catálogo de comodidades** — `AmenityList` (`features/listing/AmenityList.tsx`) já **lê** as amenities no detalhe. A Etapa B grava o checklist (ver gate D-003.2 sobre o caminho de escrita).
- **`add_on_service`** — catálogo de serviços pagos (não texto livre; o `Step5AddOns` atual com input livre é legado e sai).
- **RPCs do wizard** — `onboarding_upsert_location`, `onboarding_set_parking_types`, `onboarding_set_pricing`, `onboarding_submit` (`wizardApi.ts`) — reaproveitar; ajustar payload (ver §4 e D-003.1).
- **Payout/KYC** — `StepPayout` + `PayoutKycForm` reaproveitados **no painel**, não no wizard.

> Regra: esta atividade **reaproveita** os campos e hooks acima — **não** cria tabela/fluxo de geo novo, **não** reescreve o modelo de destino, **não** duplica o catálogo de amenities.

---

## 4. Preço — restrição travada (Q-010, decidida 2026-07-10)

**Âncora = preço de balcão, sempre. O dono NÃO define o preço do site — a Movepark calcula (abaixo do balcão) e ele aprova.**

- Por tipo declarado, capturar **1 preço de balcão / diária**. Micro-copy obrigatório: *"É o seu preço de balcão, não o preço do site. A Movepark calcula o online abaixo do balcão — quem reserva antes paga menos — e você aprova antes de publicar."*
- **Qualificador novo:** "Você já vende vagas online hoje? (sim/não)" — idealmente **no lead** (`PartnerLeadModal` / `company_onboarding`); se "sim", campo **opcional** do preço já praticado online (para não atropelar o canal do parceiro).
- **Não** montar tiers/estratégia no onboarding — isso é do motor de preço (E1.4) e da Tábua de Marés (E3.5), com apoio da Movepark. O balcão é o teto/âncora do qual o online é derivado.

> 🔒 Ver bloco ADR na atividade + ADR-008/Q-010. O preço de balcão é a **única** fonte de preço coletada no onboarding.

---

## 5. Recompensa = preview travado

Ao publicar, redirecionar o dono (logado) para a **página de detalhe da unidade em modo preview**, mesmo sem foto/KYC e **não publicada** (flag de preview que faz bypass do gate de status para o dono da `company`). No dashboard da unidade: card "perfil X% completo" + **URL de preview copiável**, revisitável a qualquer momento. **Mobile:** não depender de preview ao vivo dentro do wizard — o mecanismo é preview-no-fim + link no painel (ver D-003.4).

**Implementado (correção do vazamento, 2026-07):** a "flag de preview / não publicada" é `location.is_listed`, separada de `status`/`is_active`. A leitura pública (RLS `catalog_read_location` + filtros explícitos no SSG `fetchAllListingPaths`, `fetchListing` e na edge `search`) passa a exigir `is_listed`; o dono lê o preview pela RLS de dono (`location_select`), que ignora a flag. `is_listed` liga **automaticamente** quando a empresa passa a poder receber (`payout_recipient.status='active'`, ADR-004): no próprio `onboarding_publish` (se já ativo) ou via trigger `list_locations_on_recipient_active`. Publicar deixa a unidade ativa/configurada mas **não listada** até o recebimento ligar; a página pós-publicação (`unit-preview.tsx`) reflete isso (não promete "já está na busca" enquanto `is_listed=false`). Unidades já ativas na virada foram preservadas (grandfather). Migration `20260816000000_public_listing_gate.sql`.

**Etapa 2 (E1.3, fatia implementada):** a tela pós-publicação (`unit-preview.tsx`) deixou de dizer "já está na busca" e passou a empurrar a **etapa 2 = recebimento**. Rota `/operator/recebimento` (`recebimento.tsx`, standalone): o **KYC em etapas** (`PayoutKycWizard` — barra de progresso "Passo X de 3": Sua empresa, Representante legal, Conta bancária, no padrão do PublishWizard; reusa as seções do `PayoutKycForm`) grava o `company_payout_account` pelo **próprio dono** (nova RLS `company_payout_account_owner_write/update`, `is_company_owner`, ADR-005). Fecha com o **contrato de parceria** (assinatura **simulada** por ora: `company.contract_accepted_at` via RPC `operator_accept_contract`, owner-gated). Quando a Movepark aprova o recebedor (`payout_recipient.status='active'`), a unidade entra na busca sozinha (gate acima). Migration `20260817000000_operator_recebimento_contract.sql`. **Refinos de UX:** endereço com **autopreenchimento por CEP** (`lib/cep.ts`, ViaCEP) em todos os campos de endereço; atalho **"mesmo endereço da empresa"** no representante (evita redigitar os 8 campos — redundância); **painel de estímulo** com indicadores de receita rotativos/animados (`RevenueMotivator`) ao lado do form; e **download do contrato** (`contract.ts`, `.txt` client-side). Pendente: criação/aprovação do recebedor no gateway a partir daqui, e o e-sign/PDF real do contrato.

**Jornada visível + foto obrigatória (2026-07):** o onboarding ganhou uma **trilha macro** (`OnboardingJourney`: Publicar, Recebimento, Fotos) deixando claro a fase atual e o próximo passo, com **comemoração** (`ConfettiBurst`, CSS) a cada fase concluída. A trilha é **persistente em toda a jornada pós-aprovação do lead**: aparece no wizard de publicação (`PublishWizard`, fase Publicar), em `unit-preview` e `recebimento`, e como **banner no topo de todo o painel do operador** (`OperatorJourneyBanner` no `AppShell` variante operator) enquanto a jornada não termina. O estágio é **derivado dos dados vivos** (`useOnboardingJourney`/`deriveJourney`): Publicar = tem unidade ativa; Recebimento = `payout_recipient.status='active'` (com estado intermediário "em análise" quando `pending`/`action_required`); Fotos = alguma unidade com foto. Quando as três fases fecham, o banner some (o parceiro virou vendedor normal). Cada fase mostra um **atalho** para a ação seguinte. **Regra de produto:** **foto é obrigatória para vender**: sem **pelo menos 1 foto**, a unidade **não** entra na busca. Isso é um **piso absoluto** no gate `is_listed`: além do recebedor ativo (ADR-004), agora exige-se `location_has_photo(photos)`. Modelagem (migration `20260818000000_photo_required_to_list.sql`): helper `location_has_photo(jsonb)`; `company_can_receive(uuid)`; trigger `enforce_photo_gate_on_location` (BEFORE de `photos`/`status`/`deleted_at`) que **desliga** `is_listed` sem foto e **liga** quando entra a 1ª foto com recebedor ativo; o trigger do recebedor passou a listar só unidades com foto. Backfill desligou só as listadas sem foto (as grandfathered com foto seguem no ar). Comunicação: `PhotosCallout` ("Obrigatório para vender"), nota de erro no `LocationForm` quando sem foto, e o hint da trilha. Teste: `photo_required_to_list.test.sql` (pgTAP).

---

## 6. Gate — VALIDAR ANTES DE CODAR (D-003)

Não iniciar a implementação sem resolver:

1. **Onde mora o "preço de balcão" no schema?** Resolver a dupla fonte `company_parking_type.base_price` × tiers de `pricing_rule`. Definir o campo do balcão (âncora) e como o online é derivado. → toca `onboarding_set_pricing`/`onboarding_set_parking_types`.
2. **Escrita de comodidades:** confirmar tabela `amenity` + `location_amenity` e a RPC de escrita para o checklist (leitura já confirmada em `AmenityList`).
3. **Campo de horário/24h no `location`?** Não aparece no `LocationForm` — pode ser **campo/migration novo**.
4. **Flag de preview** para o dono logado ver o detalhe não publicado (bypass de status na rota de listing / `/destino`). **Resolvido:** `location.is_listed` gateia a leitura pública; a RLS de dono (`location_select`) segue permitindo o preview. Liga com recebedor ativo. Ver §5 e migration `20260816000000_public_listing_gate.sql`.

Cada item resolvido vira decisão registrada (atualizar D-003) antes/junto da atividade correspondente.

---

## 7. Fora de escopo

Estados de moderação `rascunho→análise→publicado` e o painel de aprovação (isso é **E1.2**); back-end de recebimento/KYC (**E1.3**); motor de preço online e tiers (**E1.4** / **E3.5**); ajustes visuais finos e as imagens reais do painel direito (ficam para a fase de UI, com fotos reais — sem ilustração genérica).

---

## 8. Referências

- Estratégia/narrativa: `gestao/onboarding-parceiro-redesenho.md`
- Convenção de amarração: `gestao/regras-arquitetura.md` → **ADR-008**
- Spec atual (evoluída): [partner-onboarding.md](./partner-onboarding.md)
- Proximidade/destino: [location-destination-proximity.md](./location-destination-proximity.md) (ADR-001)
- Preço: [pricing-engine.md](./pricing-engine.md) · Recebimento/KYC: [payment-split.md](./payment-split.md) (ADR-004)

---

## 9. Implementação — Fase 1 "Publicar" (2026-07-10)

Entregue o fluxo essencial (Etapa A). A Etapa B (checklist "deixe redondo depois") e a remoção
dura de CNPJ/KYC do wizard (§1) ficam para a Fase 2.

### 9.1 Gate D-003 — RESOLVIDO (por inspeção do schema)

1. **Preço de balcão →** `company_parking_type.base_price` é a **âncora**; o online é derivado em
   `pricing_rule`/`pricing_tier` (com `old_price_*` para o "riscado"). Resolve a dupla fonte. O
   passo em que o dono definia preço de site (`Step4Pricing`) **sai** do caminho de publicar.
2. **Comodidades →** `amenity` + `location_amenity` confirmadas; **não** existe RPC de onboarding p/
   gravá-las (só `onboarding_set_addons`, que é `add_on_service`). → **RPC nova** (Fase 2):
   `operator_set_location_amenities`.
3. **Horário/24h →** **não existe** em `location` (só `operating_hours` em `pricing_rule`, contexto de
   preço). → **campos novos** `is_24h` + `operating_hours jsonb` (Fase 2).
4. **Preview →** **sem RPC/RLS nova**: as policies de SELECT scopeadas por empresa (`location_select`,
   `lpt_select`, `pricing_rule_select`, `company_select`) já deixam o dono ler a própria unidade
   independente de `is_active`/`status`. O preview reusa isso; o público não enxerga.

### 9.2 O que foi construído

- **Migration `20260802000000`:** `location.has_shuttle`; `onboarding_upsert_location` estendida
  (`p_destination_id`, `p_has_shuttle`); **`onboarding_publish`** — exige capacidade + balcão por
  tipo, **auto-semeia** a `pricing_rule` do balcão (online = balcão como default `uniform_by_duration`)
  e faz go-live sem o passo de preço do dono. `EXECUTE` de `anon` revogado nas RPCs (E0.6).
- **Wizard split-screen** (`features/onboarding/publish/PublishWizard.tsx`) com **preview vivo**
  (`UnitPreviewCard`): endereço → destino (auto) → tipos (capacidade+balcão) → traslado → publicar.
  Reusa `useNearestDestination`, `onboarding_upsert_location`, `onboarding_set_parking_types`.
- **Google Places autocomplete** (`components/shared/GooglePlacesAutocomplete.tsx`) → geo. Usa a
  **Places API (New)** via `PlaceAutocompleteElement` (a `places.Autocomplete` legada foi
  descontinuada para projetos novos em mar/2025 e não retorna resultados neles). `lat/lng` só são
  preenchidos pelo geocoding da seleção (`gmp-select` → `fetchFields`), então a pill "Localização
  confirmada no mapa" só aparece após uma seleção real. Key em `VITE_GOOGLE_MAPS_API_KEY` (pública,
  restrita por HTTP referrer no Google Cloud; em prod, env var no Cloudflare Pages), **degrada** para
  lat/lng manuais sem key.
- **Preview travado** `/operator/preview/:locationId` (`routes/operator/unit-preview.tsx` + `previewApi`)
  via RLS do dono + **URL pública copiável** como recompensa.
- **Testes:** pgTAP de `onboarding_publish` (`onboarding_rpc.test.sql`) + Vitest (`publishLogic`,
  `GooglePlacesAutocomplete`).

> **Nota de reconciliação com §2:** a ordem de telas implementada é
> endereço → destino → tipos(capacidade+balcão) → traslado, coletando os mesmos essenciais do fluxo
> proposto (a ordem "tipos antes de endereço" da §2 pode ser reordenada na fase de UI, sem impacto de
> dado).
