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
