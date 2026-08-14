import type { Tables, Enums } from "./database";

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
 */
export type ProspectCard = {
  id: string;
  name: string;
  slug: string;
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
  destination: Pick<Destination, "id" | "name" | "short_name" | "slug"> | null;
  category: Pick<BlogCategory, "id" | "name" | "slug"> | null;
  author: Pick<BlogAuthor, "id" | "name" | "slug" | "avatar_url"> | null;
  tags: Pick<BlogTag, "id" | "name" | "slug">[];
};
/** Post com as relações que a listagem e a página usam. */
export type BlogPostWithDestination = BlogPost & {
  destination: Pick<Destination, "id" | "name" | "short_name" | "slug"> | null;
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
