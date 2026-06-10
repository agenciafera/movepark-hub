import type { Tables, Enums } from "./database";

export type BookingStatus = Enums<"booking_status">;
export type PaymentStatus = Enums<"payment_status">;
export type EntityStatus = Enums<"entity_status">;
export type UserRole = Enums<"user_role">;
export type OnboardingStatus = Enums<"onboarding_status">;

export type Booking = Tables<"booking">;
export type Company = Tables<"company">;
export type Location = Tables<"location">;
export type Profile = Tables<"profiles">;
export type Vehicle = Tables<"vehicle">;
export type Payment = Tables<"payment">;
export type ParkingType = Tables<"parking_type">;
export type CompanyOnboarding = Tables<"company_onboarding">;
export type Destination = Tables<"destination">;
export type AddOnService = Tables<"add_on_service">;
export type LocationAddOnService = Tables<"location_add_on_service">;
export type Coupon = Tables<"coupon">;
export type DiscountType = Enums<"discount_type">;

/** Cupom + os tipos de vaga aos quais está restrito (vazio = vale para todos). */
export type CouponWithRestrictions = Coupon & {
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
  location: (Pick<Location, "id" | "name" | "slug" | "timezone"> & {
    company: Pick<Company, "id" | "name" | "slug">;
  }) | null;
  vehicle: Pick<Vehicle, "id" | "license_plate" | "model" | "color"> | null;
};

export type Session = {
  userId: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  companyIds: string[];
};
