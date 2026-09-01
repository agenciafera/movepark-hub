import type { Tables, Enums, Json } from "./database";

/** Reexportado para as features não precisarem tocar em `database.ts` (que é gerado). */
export type { Json };

export type BookingStatus = Enums<"booking_status">;
export type PaymentStatus = Enums<"payment_status">;
export type EntityStatus = Enums<"entity_status">;
export type UserRole = Enums<"user_role">;
/** Papel DENTRO de uma empresa (E1.6): dono vs. operacional. */
export type CompanyRole = Enums<"company_role">;
export type OnboardingStatus = Enums<"onboarding_status">;
/** Ciclo da ficha do recebedor no gateway de pagamento (E0.1.1, ADR-004). */
export type PayoutRecipientStatus = Enums<"payout_recipient_status">;
/** Tarifa de flexibilidade da reserva (E2.8): Básica / Flex / Superflex. */
export type FareTier = Enums<"fare_tier">;

export type Booking = Tables<"booking">;
/** Histórico de alterações da reserva (cancelar, trocar data/veículo, upgrade, estorno), E2.8. */
export type BookingModification = Tables<"booking_modification">;
export type BookingModificationType = Enums<"booking_modification_type">;
/** Catálogo de Tarifas (preço/janela/benefícios por nível), E2.8. */
export type Fare = Tables<"fare">;
export type Company = Tables<"company">;
export type Location = Tables<"location">;
export type Profile = Tables<"profiles">;
export type Vehicle = Tables<"vehicle">;
export type Payment = Tables<"payment">;
export type ParkingType = Tables<"parking_type">;
export type CompanyOnboarding = Tables<"company_onboarding">;
/** Recebedor do parceiro no gateway (id externo, status, link de KYC, pendências). */
export type PayoutRecipient = Tables<"payout_recipient">;
/** Dados de repasse (banco/KYC) do parceiro — agnóstico ao gateway. */
export type CompanyPayoutAccount = Tables<"company_payout_account">;
/** Saque real (transferência recebedor → banco do parceiro), E0.3.3. */
export type PayoutWithdrawal = Tables<"payout_withdrawal">;
export type Destination = Tables<"destination">;
/**
 * Lote que a Movepark mapeou e que NÃO tem contrato (E0.17 · ADR-010). Não tem preço,
 * `checkout_mode` nem FK de `booking`: nada aqui pode virar reserva. Vira `Location` só
 * pela conversão da reivindicação.
 */
export type ProspectLocation = Tables<"prospect_location">;

/**
 * Card de lote mapeado na página de destino (RPC `destination_prospect_cards`, E0.17-d).
 *
 * Escrito à mão em vez de derivado de `Database[...]["Returns"]` porque o gerador não
 * marca nulidade em retorno de função, e aqui quase tudo é nulo de verdade: lote sem
 * endereço e sem descrição é o caso comum enquanto a ficha não foi revisada.
 * `reference_name` é o terminal quando o destino tem um cadastrado, e nulo quando a
 * referência é o próprio destino. `phone` NÃO existe aqui por desenho (Q-021).
 *
 * `google_rating` vem do snapshot fresco do Google e é nulo na maioria das fichas: só
 * existe depois que o refresh passou naquele place_id. `google_place_id` está aqui porque
 * a ficha do lote usa ele para carregar o snapshot inteiro no loader do SSG, e porque já é
 * público no `google_maps_url` do mesmo card.
 *
 * `google_fetched_at` é a data da coleta, e ela viaja junto porque este card sai no HTML do
 * build: a RPC filtra os 30 dias na hora da consulta, e esse filtro não alcança uma página
 * que foi construída há 40 dias e continua servida na borda. O componente confere de novo.
 */
export type ProspectCard = {
  id: string;
  name: string;
  slug: string;
  /** Nome canônico da ficha ("{marca} - Estacionamento {destino}"). */
  public_name: string | null;
  /** Último segmento da URL pública, no mesmo namespace da unidade parceira. */
  public_slug: string | null;
  /** `/estacionamentos/<destino>/<lote>`, montado no banco. Nulo enquanto faltar slug. */
  public_path: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  amenities: string[];
  description: string | null;
  distance_km: number | null;
  reference_name: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_rating_count: number;
  google_fetched_at: string | null;
  /**
   * Preço PESQUISADO por nós, em reais, nunca oferta (ADR-009/ADR-010). Só existe com
   * `researched_at`, por constraint: preço de terceiro sem data é afirmação sem lastro.
   */
  researched_daily_brl: number | null;
  researched_weekly_brl: number | null;
  researched_biweekly_brl: number | null;
  researched_monthly_brl: number | null;
  /** Data em que o valor foi conferido (ISO). Renderizada junto do preço. */
  researched_at: string | null;
};

/**
 * Uma linha do painel de curadoria de lotes mapeados (RPC `manager_prospect_locations`,
 * E0.17-h).
 *
 * Escrita à mão pelo mesmo motivo do `ProspectCard`: o gerador não marca nulidade em
 * retorno de função, e aqui o campo vazio é o assunto da tela. Endereço nulo é o que
 * trava a publicação, e `notified_owner_at`/`last_reviewed_at` nulos são a fila de
 * trabalho da campanha B2B.
 *
 * `state` é derivado no banco em uma palavra só, para a lista não recombinar
 * `is_published` com `converted_at` na tela e errar a ordem de precedência: ficha
 * convertida é convertida mesmo que continue publicada.
 *
 * `place_id_conflict_name` é o nome da unidade viva que já usa o mesmo `google_place_id`.
 * Preenchido, é sinal de parceiro ativo mapeado por engano (D-009). O `phone` aparece
 * aqui porque a RPC é `security definer` e o painel é interno; ele continua fora do
 * `ProspectCard`, que é o que vai para a página pública (Q-021).
 */
export type ProspectLocationAdminRow = {
  id: string;
  destination_id: string;
  destination_name: string;
  destination_slug: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  google_place_id: string | null;
  google_maps_url: string | null;
  amenities: string[];
  description: string | null;
  data_source: string;
  is_published: boolean;
  notified_owner_at: string | null;
  last_reviewed_at: string | null;
  converted_location_id: string | null;
  converted_at: string | null;
  converted_location_name: string | null;
  converted_company_id: string | null;
  state: "draft" | "published" | "converted";
  distance_m: number;
  place_id_conflict_name: string | null;
  /** Preço PESQUISADO por nós, nunca oferta. Só existe com data e fonte (constraint). */
  researched_daily_brl: number | null;
  researched_weekly_brl: number | null;
  researched_biweekly_brl: number | null;
  researched_monthly_brl: number | null;
  researched_at: string | null;
  /** Onde o valor foi conferido. Auditoria: fica no painel, não vai para a página. */
  research_source: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Pré-checagem do formulário de lote mapeado (RPC `manager_prospect_location_precheck`).
 *
 * Tudo aqui é aviso, nunca decisão automática (D-009): dois lotes vizinhos existem de
 * verdade em aeroporto, então proximidade não pode barrar sozinha. `suggested_destination`
 * vem do `nearest_destination()`, o mesmo caminho do trigger, porque preencher destino à
 * mão em dezenas de fichas é onde entra erro.
 */
export type ProspectLocationPrecheck = {
  suggested_destination: { id: string; name: string; distance_m: number } | null;
  place_id_conflict: { kind: "location" | "prospect"; name: string } | null;
  slug_conflict: { kind: "location" | "prospect"; name: string } | null;
  nearby: { kind: "location" | "prospect"; name: string; distance_m: number }[];
};

/**
 * O que o formulário do painel manda para `manager_prospect_location_save` (E0.17-h).
 *
 * `id` nulo cria, preenchido edita. Latitude e longitude não são opcionais porque são
 * elas que resolvem o destino e a distância ao terminal (ADR-001).
 */
export type ProspectLocationInput = {
  id: string | null;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  destinationId: string | null;
  address: string | null;
  phone: string | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  description: string | null;
  amenities: string[];
  dataSource: string;
  isPublished: boolean;
  researchedDailyBrl: number | null;
  researchedWeeklyBrl: number | null;
  researchedBiweeklyBrl: number | null;
  researchedMonthlyBrl: number | null;
  researchedAt: string | null;
  researchSource: string | null;
};

/** Post do blog. O `slug` é herdado do WordPress e é contrato de URL (docs/specs/blog.md). */
export type BlogPost = Tables<"blog_post">;
/** Tema editorial do post. Aeroporto não entra aqui: ele é `destination_id`. */
export type BlogCategory = Tables<"blog_category">;
export type BlogTag = Tables<"blog_tag">;
export type BlogAuthor = Tables<"blog_author">;
/** O que a listagem precisa. Sem `body_md`, que é o grosso do payload. */
export type BlogPostListItem = Pick<
  BlogPost,
  "id" | "slug" | "title" | "excerpt" | "cover_image_url" | "published_at"
> & {
  destination: Pick<
    Destination,
    "id" | "name" | "short_name" | "slug" | "public_slug" | "is_published"
  > | null;
  category: Pick<BlogCategory, "id" | "name" | "slug"> | null;
  author: Pick<BlogAuthor, "id" | "name" | "slug" | "avatar_url"> | null;
  tags: Pick<BlogTag, "id" | "name" | "slug">[];
};
/** Post com as relações que a listagem e a página usam. */
export type BlogPostWithDestination = BlogPost & {
  destination: Pick<
    Destination,
    "id" | "name" | "short_name" | "slug" | "public_slug" | "is_published"
  > | null;
  category: Pick<BlogCategory, "id" | "name" | "slug"> | null;
  author: Pick<BlogAuthor, "id" | "name" | "slug" | "avatar_url"> | null;
  tags: Pick<BlogTag, "id" | "name" | "slug">[];
};
/** Ponto físico de um destino (terminal/píer/plataforma). DAT-05. */
export type DestinationPoint = Tables<"destination_point">;
/** Proximidade lote → destino-âncora (view location_proximity, haversine em SQL). */
export type LocationProximity = Tables<"location_proximity">;
/** Proximidade lote → cada ponto do destino (view location_point_proximity). DAT-05. */
export type LocationPointProximity = Tables<"location_point_proximity">;
/** Location com a relação destination embarcada (subset de campos de geo/rotulagem). */
export type LocationWithDestination = Location & {
  destination: Pick<
    Destination,
    "id" | "code" | "name" | "short_name" | "type" | "latitude" | "longitude"
  > | null;
};
export type AddOnService = Tables<"add_on_service">;
export type LocationAddOnService = Tables<"location_add_on_service">;
export type Coupon = Tables<"coupon">;
export type DiscountType = Enums<"discount_type">;
export type MinimumStayUnit = Enums<"minimum_stay_unit">;
export type LocationParkingType = Tables<"location_parking_type">;

/**
 * Onde a reserva da unidade fecha (E0.14): no checkout do Hub ou no white-label do
 * parceiro. O banco guarda como texto com CHECK; aqui o tipo é fechado.
 */
export type CheckoutMode = "hub" | "external";

/** O parceiro sabe que existe no Hub? (E0.14) `silent` liga as guardas de silêncio. */
export type HubRelationship = "silent" | "onboarded";

/** Pré-voo do modo externo (RPC `location_external_readiness`). */
export type LocationExternalReadiness = {
  ready: boolean;
  /** Campos que faltam na empresa: wl_public_domain, wl_domain, wl_tenant_key. */
  missing_company: string[];
  /** Quantos tipos de vaga ativos estão sem De/Para com o white-label. */
  unmapped_count: number;
  unmapped_names: string[];
};

/** Linha de ocupação por data (retorno de operator_location_occupancy). */
export type LocationOccupancyRow = {
  location_parking_type_id: string;
  parking_type_name: string;
  date: string;
  capacity: number;
  booked_count: number;
  blocked: boolean;
};

/** Cupom + os tipos de vaga aos quais está restrito (vazio = vale para todos). */
export type CouponWithRestrictions = Coupon & {
  parking_type_ids: string[];
};

export type Review = Tables<"review">;

/** Review publicado + nome do autor (p/ o bloco na página da unidade). */
export type ReviewWithAuthor = Review & {
  author_name: string | null;
};

export type DiscountRule = Tables<"discount_rule">;

/** Regra de desconto automático + restrição por tipo de vaga (vazio = todos). */
export type DiscountRuleWithRestrictions = DiscountRule & {
  parking_type_ids: string[];
};

/** Serviço adicional + sua disponibilidade/preço em cada unidade da empresa. */
export type AddOnServiceWithAvailability = AddOnService & {
  availability: LocationAddOnService[];
};

/** Lead/onboarding + dados básicos da empresa, como exibido no Manager. */
export type PartnerApplication = CompanyOnboarding & {
  company: Pick<Company, "id" | "name" | "slug" | "onboarding_status" | "status"> | null;
};

export type BookingWithRelations = Booking & {
  profile: Pick<Profile, "id" | "full_name" | "first_name" | "last_name" | "tax_id"> | null;
  location:
    | (Pick<Location, "id" | "name" | "slug" | "timezone"> & {
        company: Pick<Company, "id" | "name" | "slug">;
      })
    | null;
  vehicle: Pick<Vehicle, "id" | "license_plate" | "model" | "color"> | null;
  /** Pagamentos da reserva (para gatear/exibir o estado de estorno no painel). */
  payments?: Pick<Payment, "id" | "status" | "refunded_at" | "created_at">[] | null;
};

export type Session = {
  userId: string;
  email: string | null;
  /** Telefone verificado da credencial (auth.users.phone), E.164. ADR-006: contato próprio via JWT. */
  phone: string | null;
  role: UserRole;
  /** Nome completo derivado (coluna gerada profiles.full_name). Para exibição/iniciais. */
  fullName: string | null;
  /** Primeiro nome (profiles.first_name). Para saudações e marketing. */
  firstName: string | null;
  /** Sobrenome (profiles.last_name). */
  lastName: string | null;
  companyIds: string[];
  /** Papel do usuário em cada empresa vinculada (E1.6). */
  companyRoles: Record<string, CompanyRole>;
  /** Escopos efetivos do usuário em cada empresa (ADR-005). Dono → todos. */
  companyScopes: Record<string, string[]>;
};

/** Membro de uma empresa (retorno de company_list_members). */
export type CompanyMember = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role: CompanyRole;
  created_at: string;
};

/** Atribuição de reservas por origem/UTM (retorno de booking_attribution — E2.4.1). */
export type BookingAttribution = {
  totals: { hub: number; external: number; total: number };
  by_origin: { origin: string; count: number; confirmed: number }[];
  by_utm_source: { utm_source: string; count: number }[];
};

/**
 * Uma linha do funil de saída externa (E0.16, retorno de `manager_external_exit_clicks`).
 *
 * Cliente que clicou para ir reservar no site do parceiro. É o contrário da atribuição de
 * reserva: aqui não há `booking`, porque a venda acontece do outro lado. `sessions` é gente
 * distinta, `clicks` inclui quem voltou depois de olhar (a dedup só junta os 5 minutos).
 */
export type ExternalExitClickRow = {
  company_slug: string;
  company_name: string;
  location_slug: string;
  parking_type_code: string;
  parking_type_name: string;
  clicks: number;
  sessions: number;
  last_click_at: string;
};

/**
 * Resumo do dashboard do Manager no período (retorno de manager_dashboard_overview).
 * Eixo de data = check-in. "Diária" (vehicle_days) é dia-calendário ocupado, a mesma
 * convenção da capacidade.
 */
export type ManagerOverview = {
  current: {
    bookings: number;
    revenue: number;
    ticket: number;
    vehicle_days: number;
    revenue_per_vehicle_day: number;
    avg_stay_days: number;
    passengers: number;
    pcd: number;
    fare_revenue: number;
  };
  previous: { bookings: number; revenue: number; ticket: number; vehicle_days: number };
  statuses: {
    total: number;
    cancelled: number;
    no_show: number;
    expired: number;
    pending: number;
  };
  customers: { new: number; returning: number };
  /** Tamanho da rede no escopo e quantas unidades geraram receita no período. */
  network: { locations_total: number; locations_with_revenue: number };
  /**
   * Comissão retida pela Movepark (take_rate por empresa) e o que sobra pro
   * parceiro. Não confundir com `current.fare_revenue`, que é a tarifa cobrada
   * do cliente: são receitas diferentes.
   */
  money: { commission: number; payout: number };
  by_destination: {
    code: string;
    name: string;
    bookings: number;
    revenue: number;
    vehicle_days: number;
  }[];
  length_of_stay: { sort: number; bookings: number; revenue: number; vehicle_days: number }[];
  /** Receita de tarifa por tier (o que a Movepark ganha). Visão de Super Admin. */
  by_fare: { tier: string; bookings: number; revenue: number }[];
  top_locations: {
    id: string;
    name: string;
    company_name: string;
    bookings: number;
    revenue: number;
    vehicle_days: number;
  }[];
};

/** Um item do array `reviews` do espelho do Google. A atribuição é obrigatória na exibição. */
export type GoogleReviewItem = {
  rating: number;
  text: string;
  publishTime: string;
  relativePublishTimeDescription: string;
  authorName: string;
  authorPhotoUri: string | null;
  authorUri: string | null;
  reviewUri: string | null;
};

/** Espelho do Google Places por place_id. Conteúdo de terceiro, sob cache de 30 dias. */
export type GooglePlaceSnapshot = {
  place_id: string;
  rating: number | null;
  user_rating_count: number;
  maps_uri: string | null;
  reviews: GoogleReviewItem[];
  fetched_at: string;
};

/** Uma hora do fluxo de veículos (retorno de manager_daily_flow). */
export type DailyFlowHour = {
  hour: number;
  vehicles: number;
  passengers: number;
  pcd: number;
};

/** Fluxo de entradas e saídas de um dia, hora a hora, no fuso de cada unidade. */
export type DailyFlow = {
  date: string;
  entries: DailyFlowHour[];
  exits: DailyFlowHour[];
};

// ─── Marketing (E3.1) ────────────────────────────────────────────────────────

/** Coorte comportamental do contato. Derivada das reservas, nunca gravada. */
export type MarketingCohort = Enums<"marketing_cohort">;
/** Estágio de Growth (AARRR) do contato. */
export type MarketingGrowthStage = Enums<"marketing_growth_stage">;
export type MarketingChannel = Enums<"marketing_channel">;
export type MarketingCampaignStatus = Enums<"marketing_campaign_status">;
export type MarketingMessageStatus = Enums<"marketing_message_status">;

export type MarketingContact = Tables<"marketing_contact">;
export type MarketingPipeline = Tables<"marketing_pipeline">;
export type MarketingPipelineStage = Tables<"marketing_pipeline_stage">;
export type MarketingSegment = Tables<"marketing_segment">;
export type MarketingCampaign = Tables<"marketing_campaign">;
export type MarketingMessage = Tables<"marketing_message">;

/** Uma linha do kanban/lista de leads (retorno de marketing_leads). */
export type MarketingLeadRow = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  stage_name: string;
  contact_id: string;
  contact_key: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  location_id: string | null;
  location_name: string | null;
  title: string | null;
  value_cents: number;
  owner_id: string | null;
  source: string;
  tags: string[];
  custom: Json;
  sort_order: number;
  stage_changed_at: string;
  bookings_count: number;
  total_spent: number;
  avg_ticket: number;
  days_since_last: number | null;
  cohort: MarketingCohort | null;
  growth_stage: MarketingGrowthStage | null;
  subscription_candidate: boolean;
  vehicle_model: string | null;
  created_at: string;
  /** Reserva que originou o cartão, quando ele veio do checkout. */
  booking_id: string | null;
  booking_code: string | null;
  booking_status: BookingStatus | null;
  /** Quando o hold da reserva expira. É o relógio do abandono. */
  booking_expires_at: string | null;
  booking_total: number | null;
  /** true = o cartão segue o status da reserva. Arrastar na mão zera. */
  auto_synced: boolean;
};

/** Contagem de contatos de um segmento (retorno de marketing_segment_counts). */
export type MarketingSegmentCount = {
  segment_id: string;
  total: number;
  reachable_email: number;
  reachable_whatsapp: number;
};

/** Matriz de perfis por estacionamento (retorno de marketing_profile_matrix). */
export type MarketingProfileMatrix = {
  totals: {
    contacts: number;
    customers: number;
    bookings: number;
    revenue: number;
    avg_ticket: number;
    subscription_candidates: number;
  };
  by_cohort: Array<{
    cohort: MarketingCohort;
    contacts: number;
    bookings: number;
    revenue: number;
    avg_ticket: number;
    avg_days_since_last: number | null;
    subscription_candidates: number;
  }>;
  by_growth_stage: Array<{
    stage: MarketingGrowthStage;
    contacts: number;
    revenue: number;
  }>;
  by_location: Array<{
    location_id: string;
    location_name: string;
    contacts: number;
    revenue: number;
    recurring: number;
    subscription_candidates: number;
  }>;
};

/** Funil de conversão (retorno de marketing_conversion_funnel). */
export type MarketingFunnel = {
  steps: Array<{ key: string; label: string; count: number }>;
  losses: { expiradas: number; canceladas: number; no_show: number };
  revenue: number;
  exit_clicks: number;
  new_vs_returning: { new: number; returning: number };
};

/** Contato que casou com um segmento (retorno de marketing_segment_contacts). */
export type MarketingSegmentContact = {
  contact_key: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  bookings_count: number;
  total_spent: number;
  avg_ticket: number;
  days_since_last: number | null;
  cohort: MarketingCohort | null;
  growth_stage: MarketingGrowthStage | null;
  subscription_candidate: boolean;
  vehicle_model: string | null;
};

/** Prévia do segmento antes de salvar (retorno de marketing_segment_preview). */
export type MarketingSegmentPreview = {
  total: number;
  reachable_email: number;
  reachable_whatsapp: number;
  sample: Array<{ contact_key: string; doc: Record<string, unknown> }>;
};

/**
 * Uma linha da auditoria de endereço das unidades (retorno de
 * `manager_location_address_audit`): o estado atual da unidade, o veredito da última
 * verificação e para onde a coordenada proposta ancoraria.
 *
 * Spec: docs/specs/auditoria-enderecos.md
 */
export type LocationAddressAuditRow = {
  location_id: string;
  location_name: string;
  company_name: string;
  slug: string;
  status: string;
  is_listed: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  destination_id: string | null;
  destination_code: string | null;
  destination_name: string | null;
  /** Distância ao destino ancorado hoje, em km (PostGIS). */
  distance_km: number | null;
  flags: string[];
  scanned_at: string | null;
  verified_at: string | null;
  verify_status: LocationAddressVerifyStatus;
  fetch_error: string | null;
  match_place_id: string | null;
  match_name: string | null;
  match_address: string | null;
  match_latitude: number | null;
  match_longitude: number | null;
  match_maps_url: string | null;
  match_business_status: string | null;
  name_similarity: number | null;
  /** Distância entre o pino gravado e o do Google, em metros. */
  drift_m: number | null;
  /** Destino que passaria a ancorar a unidade se o pino do Google for aceito. */
  suggested_destination_code: string | null;
  suggested_distance_km: number | null;
  decision: LocationAddressDecision;
  decision_note: string | null;
  reviewed_at: string | null;
};

export type LocationAddressVerifyStatus = "pending" | "ok" | "divergent" | "no_match" | "error";
export type LocationAddressDecision = "pending" | "applied" | "dismissed";
