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
/** Post do blog. O `slug` é herdado do WordPress e é contrato de URL (docs/specs/blog.md). */
export type BlogPost = Tables<"blog_post">;
/** Post com o destino embarcado, para o CTA e o rótulo de aeroporto. */
export type BlogPostWithDestination = BlogPost & {
  destination: Pick<Destination, "id" | "name" | "short_name" | "slug"> | null;
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
