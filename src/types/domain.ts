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

export type Booking = Tables<"booking">;
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
  profile: Pick<Profile, "id" | "full_name" | "phone" | "tax_id"> | null;
  location:
    | (Pick<Location, "id" | "name" | "slug" | "timezone"> & {
        company: Pick<Company, "id" | "name" | "slug">;
      })
    | null;
  vehicle: Pick<Vehicle, "id" | "license_plate" | "model" | "color"> | null;
};

export type Session = {
  userId: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  companyIds: string[];
  /** Papel do usuário em cada empresa vinculada (E1.6). */
  companyRoles: Record<string, CompanyRole>;
};

/** Membro de uma empresa (retorno de company_list_members). */
export type CompanyMember = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role: CompanyRole;
  created_at: string;
};
