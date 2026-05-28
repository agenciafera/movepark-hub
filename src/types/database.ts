export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      add_on_service: {
        Row: {
          base_price: number
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          base_price: number
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_on_service_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      booking: {
        Row: {
          check_in_at: string
          check_out_at: string
          checked_in_at: string | null
          checked_out_at: string | null
          code: string
          created_at: string
          currency: string
          deleted_at: string | null
          expires_at: string | null
          external_id: string | null
          has_pcd: boolean
          id: string
          location_id: string
          notes: string | null
          origin: string | null
          passenger_count: number | null
          profile_id: string
          status: Database["public"]["Enums"]["booking_status"]
          total_amount: number
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          vehicle_id: string | null
          voucher_url: string | null
        }
        Insert: {
          check_in_at: string
          check_out_at: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          code: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          has_pcd?: boolean
          id?: string
          location_id: string
          notes?: string | null
          origin?: string | null
          passenger_count?: number | null
          profile_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          vehicle_id?: string | null
          voucher_url?: string | null
        }
        Update: {
          check_in_at?: string
          check_out_at?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          code?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          has_pcd?: boolean
          id?: string
          location_id?: string
          notes?: string | null
          origin?: string | null
          passenger_count?: number | null
          profile_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          vehicle_id?: string | null
          voucher_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_coupon: {
        Row: { booking_id: string; coupon_id: string; created_at: string; discount_applied: number }
        Insert: { booking_id: string; coupon_id: string; created_at?: string; discount_applied: number }
        Update: { booking_id?: string; coupon_id?: string; created_at?: string; discount_applied?: number }
        Relationships: []
      }
      booking_item: {
        Row: {
          add_on_service_id: string | null
          booking_id: string
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["booking_item_type"]
          parking_type_id: string | null
          quantity: number
          subtotal: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          add_on_service_id?: string | null
          booking_id: string
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["booking_item_type"]
          parking_type_id?: string | null
          quantity?: number
          subtotal: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          add_on_service_id?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["booking_item_type"]
          parking_type_id?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      company: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          legal_name: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_parking_type: {
        Row: {
          base_price: number
          company_id: string
          created_at: string
          default_capacity: number
          id: string
          is_active: boolean
          parking_type_id: string
          updated_at: string
        }
        Insert: {
          base_price: number
          company_id: string
          created_at?: string
          default_capacity: number
          id?: string
          is_active?: boolean
          parking_type_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          company_id?: string
          created_at?: string
          default_capacity?: number
          id?: string
          is_active?: boolean
          parking_type_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon: {
        Row: {
          code: string
          company_id: string
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          times_used: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      location: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          has_notice: boolean
          has_passenger_quantity: boolean
          has_pcd_config: boolean
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notice: string | null
          phone: string | null
          reservation_policy: string | null
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          has_notice?: boolean
          has_passenger_quantity?: boolean
          has_pcd_config?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notice?: string | null
          phone?: string | null
          reservation_policy?: string | null
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          has_notice?: boolean
          has_passenger_quantity?: boolean
          has_pcd_config?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notice?: string | null
          phone?: string | null
          reservation_policy?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      location_add_on_service: {
        Row: {
          add_on_service_id: string
          created_at: string
          id: string
          is_active: boolean
          location_id: string
          price_override: number | null
          updated_at: string
        }
        Insert: {
          add_on_service_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id: string
          price_override?: number | null
          updated_at?: string
        }
        Update: {
          add_on_service_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string
          price_override?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      location_parking_availability: {
        Row: {
          booked_count: number
          date: string
          id: string
          location_parking_type_id: string
        }
        Insert: {
          booked_count?: number
          date: string
          id?: string
          location_parking_type_id: string
        }
        Update: {
          booked_count?: number
          date?: string
          id?: string
          location_parking_type_id?: string
        }
        Relationships: []
      }
      location_parking_type: {
        Row: {
          capacity: number
          company_parking_type_id: string
          created_at: string
          has_minimum_date: boolean
          has_minimum_stay: boolean
          id: string
          is_active: boolean
          location_id: string
          minimum_date: string | null
          minimum_stay_unit: Database["public"]["Enums"]["minimum_stay_unit"] | null
          minimum_stay_value: number | null
          near_capacity_message: string | null
          near_capacity_threshold: number | null
          updated_at: string
        }
        Insert: {
          capacity: number
          company_parking_type_id: string
          created_at?: string
          has_minimum_date?: boolean
          has_minimum_stay?: boolean
          id?: string
          is_active?: boolean
          location_id: string
          minimum_date?: string | null
          minimum_stay_unit?: Database["public"]["Enums"]["minimum_stay_unit"] | null
          minimum_stay_value?: number | null
          near_capacity_message?: string | null
          near_capacity_threshold?: number | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          company_parking_type_id?: string
          created_at?: string
          has_minimum_date?: boolean
          has_minimum_stay?: boolean
          id?: string
          is_active?: boolean
          location_id?: string
          minimum_date?: string | null
          minimum_stay_unit?: Database["public"]["Enums"]["minimum_stay_unit"] | null
          minimum_stay_value?: number | null
          near_capacity_message?: string | null
          near_capacity_threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      parking_type: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          provider: string
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider: string
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pricing_hourly_bracket: {
        Row: {
          from_minutes: number
          id: string
          is_old_price: boolean
          price: number
          pricing_rule_id: string
          to_minutes: number | null
        }
        Insert: {
          from_minutes: number
          id?: string
          is_old_price?: boolean
          price: number
          pricing_rule_id: string
          to_minutes?: number | null
        }
        Update: {
          from_minutes?: number
          id?: string
          is_old_price?: boolean
          price?: number
          pricing_rule_id?: string
          to_minutes?: number | null
        }
        Relationships: []
      }
      pricing_rule: {
        Row: {
          advance_booking_minutes: number | null
          created_at: string
          fractional_day_policy: string
          fractional_day_tolerance: number | null
          hourly_daily_rate: number | null
          hourly_fraction_rate: number | null
          hourly_hours_per_day: number | null
          hourly_initial_rate: number | null
          hourly_one_hour_rate: number | null
          id: string
          incremental_base: number | null
          incremental_multiplier: number | null
          incremental_one_day_price: number | null
          incremental_two_days_price: number | null
          location_parking_type_id: string
          monthly_daily_rate: number | null
          monthly_fixed_price: number | null
          old_price_multiplier: number | null
          old_price_strategy: string
          operating_hours: Json | null
          strategy: string
          surcharge_multiplier: number | null
          surcharge_source_id: string | null
          updated_at: string
        }
        Insert: Partial<Database["public"]["Tables"]["pricing_rule"]["Row"]> & {
          location_parking_type_id: string
          strategy: string
        }
        Update: Partial<Database["public"]["Tables"]["pricing_rule"]["Row"]>
        Relationships: []
      }
      pricing_tier: {
        Row: {
          from_day: number
          id: string
          is_old_price: boolean
          pricing_rule_id: string
          to_day: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          from_day: number
          id?: string
          is_old_price?: boolean
          pricing_rule_id: string
          to_day?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          from_day?: number
          id?: string
          is_old_price?: boolean
          pricing_rule_id?: string
          to_day?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: []
      }
      profile_company: {
        Row: { company_id: string; created_at: string; profile_id: string }
        Insert: { company_id: string; created_at?: string; profile_id: string }
        Update: { company_id?: string; created_at?: string; profile_id?: string }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vehicle: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          license_plate: string
          model: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          license_plate: string
          model?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          license_plate?: string
          model?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      current_user_role: { Args: never; Returns: Database["public"]["Enums"]["user_role"] }
      current_company_ids: { Args: never; Returns: string[] }
      is_hub_admin: { Args: never; Returns: boolean }
      simulate_price: {
        Args: { p_company: string; p_days?: number; p_location?: string; p_parking_type?: string }
        Returns: Json
      }
    }
    Enums: {
      booking_item_type: "parking" | "add_on"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
        | "no_show"
      discount_type: "percent" | "fixed"
      entity_status: "active" | "inactive" | "suspended"
      minimum_stay_unit: "minutes" | "hours" | "days" | "months"
      payment_status: "pending" | "authorized" | "paid" | "refunded" | "failed" | "cancelled"
      user_role: "hub_admin" | "company_operator" | "customer"
    }
    CompositeTypes: Record<never, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
