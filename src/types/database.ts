export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          sort_order: number
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
          sort_order?: number
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
          sort_order?: number
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
      address: {
        Row: {
          city: string
          complement: string | null
          country: string
          created_at: string
          district: string | null
          id: string
          is_default: boolean
          label: string | null
          number: string | null
          postal_code: string | null
          profile_id: string
          state: string | null
          street: string
          updated_at: string
        }
        Insert: {
          city: string
          complement?: string | null
          country?: string
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          number?: string | null
          postal_code?: string | null
          profile_id: string
          state?: string | null
          street: string
          updated_at?: string
        }
        Update: {
          city?: string
          complement?: string | null
          country?: string
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          number?: string | null
          postal_code?: string | null
          profile_id?: string
          state?: string | null
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity: {
        Row: {
          category: string
          code: string
          description: string | null
          icon: string | null
          name: string
          sort_order: number
        }
        Insert: {
          category: string
          code: string
          description?: string | null
          icon?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          description?: string | null
          icon?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      api_key: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          environment: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          environment: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log: {
        Row: {
          api_key_id: string | null
          company_id: string | null
          created_at: string
          id: string
          ip: string | null
          latency_ms: number | null
          method: string | null
          path: string | null
          request_id: string | null
          scope: string | null
          status: number | null
          surface: string
        }
        Insert: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string | null
          path?: string | null
          request_id?: string | null
          scope?: string | null
          status?: number | null
          surface: string
        }
        Update: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string | null
          path?: string | null
          request_id?: string | null
          scope?: string | null
          status?: number | null
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_request_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_key"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      api_scope: {
        Row: {
          description: string
          module: string
          scope: string
        }
        Insert: {
          description: string
          module: string
          scope: string
        }
        Update: {
          description?: string
          module?: string
          scope?: string
        }
        Relationships: []
      }
      app_setting: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      booking: {
        Row: {
          check_in_at: string
          check_out_at: string
          checked_in_at: string | null
          checked_out_at: string | null
          code: string
          created_at: string
          created_via_api_key_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          deleted_at: string | null
          expires_at: string | null
          external_id: string | null
          has_pcd: boolean
          id: string
          idempotency_key: string | null
          location_id: string
          notes: string | null
          origin: string | null
          passenger_count: number | null
          price_breakdown: Json | null
          profile_id: string | null
          review_request_sent_at: string | null
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
          created_via_api_key_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          has_pcd?: boolean
          id?: string
          idempotency_key?: string | null
          location_id: string
          notes?: string | null
          origin?: string | null
          passenger_count?: number | null
          price_breakdown?: Json | null
          profile_id?: string | null
          review_request_sent_at?: string | null
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
          created_via_api_key_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          has_pcd?: boolean
          id?: string
          idempotency_key?: string | null
          location_id?: string
          notes?: string | null
          origin?: string | null
          passenger_count?: number | null
          price_breakdown?: Json | null
          profile_id?: string | null
          review_request_sent_at?: string | null
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
            foreignKeyName: "booking_created_via_api_key_id_fkey"
            columns: ["created_via_api_key_id"]
            isOneToOne: false
            referencedRelation: "api_key"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "booking_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
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
        Row: {
          booking_id: string
          coupon_id: string
          created_at: string
          discount_applied: number
        }
        Insert: {
          booking_id: string
          coupon_id: string
          created_at?: string
          discount_applied: number
        }
        Update: {
          booking_id?: string
          coupon_id?: string
          created_at?: string
          discount_applied?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_coupon_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_coupon_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupon"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_discount: {
        Row: {
          booking_id: string
          created_at: string
          discount_applied: number
          discount_rule_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          discount_applied: number
          discount_rule_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          discount_applied?: number
          discount_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_discount_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discount_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rule"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "booking_item_add_on_service_id_fkey"
            columns: ["add_on_service_id"]
            isOneToOne: false
            referencedRelation: "add_on_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_item_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_item_parking_type_id_fkey"
            columns: ["parking_type_id"]
            isOneToOne: false
            referencedRelation: "parking_type"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          take_rate_bps: number
          tax_id: string | null
          updated_at: string
          wl_domain: string | null
          wl_sync_enabled: boolean
          wl_tenant_key: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          take_rate_bps?: number
          tax_id?: string | null
          updated_at?: string
          wl_domain?: string | null
          wl_sync_enabled?: boolean
          wl_tenant_key?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          take_rate_bps?: number
          tax_id?: string | null
          updated_at?: string
          wl_domain?: string | null
          wl_sync_enabled?: boolean
          wl_tenant_key?: string | null
        }
        Relationships: []
      }
      company_onboarding: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          city: string | null
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role: string | null
          created_at: string
          current_step: number
          estimated_spots: number | null
          internal_note: string | null
          message: string | null
          referrer: string | null
          rejected_at: string | null
          rejection_reason: string | null
          setup_submitted_at: string | null
          state: string | null
          submitted_at: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          went_live_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          company_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role?: string | null
          created_at?: string
          current_step?: number
          estimated_spots?: number | null
          internal_note?: string | null
          message?: string | null
          referrer?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          setup_submitted_at?: string | null
          state?: string | null
          submitted_at?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          went_live_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          company_id?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          contact_role?: string | null
          created_at?: string
          current_step?: number
          estimated_spots?: number | null
          internal_note?: string | null
          message?: string | null
          referrer?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          setup_submitted_at?: string | null
          state?: string | null
          submitted_at?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          went_live_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "company_parking_type_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_parking_type_parking_type_id_fkey"
            columns: ["parking_type_id"]
            isOneToOne: false
            referencedRelation: "parking_type"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payout_account: {
        Row: {
          account_check_digit: string | null
          account_number: string | null
          account_type: string | null
          bank_code: string | null
          branch_check_digit: string | null
          branch_number: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          document: string | null
          document_type: string | null
          holder_document: string | null
          holder_name: string | null
          kyc_details: Json
          legal_name: string | null
          updated_at: string
        }
        Insert: {
          account_check_digit?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_code?: string | null
          branch_check_digit?: string | null
          branch_number?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          document?: string | null
          document_type?: string | null
          holder_document?: string | null
          holder_name?: string | null
          kyc_details?: Json
          legal_name?: string | null
          updated_at?: string
        }
        Update: {
          account_check_digit?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_code?: string | null
          branch_check_digit?: string | null
          branch_number?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          document?: string | null
          document_type?: string | null
          holder_document?: string | null
          holder_name?: string | null
          kyc_details?: Json
          legal_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_payout_account_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_amount: number | null
          min_days: number | null
          per_user_limit: number | null
          sort_order: number
          times_used: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_amount?: number | null
          min_days?: number | null
          per_user_limit?: number | null
          sort_order?: number
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_amount?: number | null
          min_days?: number | null
          per_user_limit?: number | null
          sort_order?: number
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_parking_type: {
        Row: {
          company_parking_type_id: string
          coupon_id: string
        }
        Insert: {
          company_parking_type_id: string
          coupon_id: string
        }
        Update: {
          company_parking_type_id?: string
          coupon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_parking_type_company_parking_type_id_fkey"
            columns: ["company_parking_type_id"]
            isOneToOne: false
            referencedRelation: "company_parking_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_parking_type_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupon"
            referencedColumns: ["id"]
          },
        ]
      }
      destination: {
        Row: {
          city: string
          code: string
          country: string
          created_at: string
          geog: unknown
          hero_image_url: string | null
          id: string
          intro: string | null
          is_popular: boolean
          is_published: boolean
          latitude: number
          longitude: number
          meta_description: string | null
          meta_title: string | null
          name: string
          short_name: string | null
          slug: string
          sort_order: number
          state: string | null
          type: string
          updated_at: string
        }
        Insert: {
          city: string
          code: string
          country?: string
          created_at?: string
          geog?: unknown
          hero_image_url?: string | null
          id?: string
          intro?: string | null
          is_popular?: boolean
          is_published?: boolean
          latitude: number
          longitude: number
          meta_description?: string | null
          meta_title?: string | null
          name: string
          short_name?: string | null
          slug: string
          sort_order?: number
          state?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          city?: string
          code?: string
          country?: string
          created_at?: string
          geog?: unknown
          hero_image_url?: string | null
          id?: string
          intro?: string | null
          is_popular?: boolean
          is_published?: boolean
          latitude?: number
          longitude?: number
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          sort_order?: number
          state?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      destination_point: {
        Row: {
          created_at: string
          destination_id: string
          geog: unknown
          id: string
          latitude: number
          longitude: number
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_id: string
          geog?: unknown
          id?: string
          latitude: number
          longitude: number
          name: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_id?: string
          geog?: unknown
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_point_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destination"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rule: {
        Row: {
          advance_days: number | null
          allow_coupon_stack: boolean
          company_id: string
          created_at: string
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          location_id: string | null
          min_amount: number | null
          min_days: number | null
          name: string
          priority: number
          sort_order: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          advance_days?: number | null
          allow_coupon_stack?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          min_amount?: number | null
          min_days?: number | null
          name: string
          priority?: number
          sort_order?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          advance_days?: number | null
          allow_coupon_stack?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          min_amount?: number | null
          min_days?: number | null
          name?: string
          priority?: number
          sort_order?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_rule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_rule_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_rule_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "discount_rule_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
        ]
      }
      discount_rule_parking_type: {
        Row: {
          company_parking_type_id: string
          discount_rule_id: string
        }
        Insert: {
          company_parking_type_id: string
          discount_rule_id: string
        }
        Update: {
          company_parking_type_id?: string
          discount_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rule_parking_type_company_parking_type_id_fkey"
            columns: ["company_parking_type_id"]
            isOneToOne: false
            referencedRelation: "company_parking_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_rule_parking_type_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rule"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          answer: string
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          destination_id: string | null
          id: string
          is_published: boolean
          location_id: string | null
          question: string
          scope: Database["public"]["Enums"]["faq_scope"]
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answer: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_id?: string | null
          id?: string
          is_published?: boolean
          location_id?: string | null
          question: string
          scope: Database["public"]["Enums"]["faq_scope"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answer?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_id?: string | null
          id?: string
          is_published?: boolean
          location_id?: string | null
          question?: string
          scope?: Database["public"]["Enums"]["faq_scope"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faq_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "faq_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faq_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faq_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destination"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faq_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faq_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "faq_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "faq_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_category: {
        Row: {
          created_at: string
          id: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      location: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          destination_id: string | null
          directions_text: string | null
          email: string | null
          geog: unknown
          has_notice: boolean
          has_passenger_quantity: boolean
          has_pcd_config: boolean
          id: string
          is_popular: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notice: string | null
          phone: string | null
          photos: Json
          popular_sort_order: number
          reservation_policy: string | null
          review_avg: number | null
          review_count: number
          shuttle_frequency_minutes: number | null
          shuttle_to_terminal_minutes: number | null
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
          destination_id?: string | null
          directions_text?: string | null
          email?: string | null
          geog?: unknown
          has_notice?: boolean
          has_passenger_quantity?: boolean
          has_pcd_config?: boolean
          id?: string
          is_popular?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notice?: string | null
          phone?: string | null
          photos?: Json
          popular_sort_order?: number
          reservation_policy?: string | null
          review_avg?: number | null
          review_count?: number
          shuttle_frequency_minutes?: number | null
          shuttle_to_terminal_minutes?: number | null
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
          destination_id?: string | null
          directions_text?: string | null
          email?: string | null
          geog?: unknown
          has_notice?: boolean
          has_passenger_quantity?: boolean
          has_pcd_config?: boolean
          id?: string
          is_popular?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notice?: string | null
          phone?: string | null
          photos?: Json
          popular_sort_order?: number
          reservation_policy?: string | null
          review_avg?: number | null
          review_count?: number
          shuttle_frequency_minutes?: number | null
          shuttle_to_terminal_minutes?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destination"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "location_add_on_service_add_on_service_id_fkey"
            columns: ["add_on_service_id"]
            isOneToOne: false
            referencedRelation: "add_on_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_add_on_service_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_add_on_service_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_add_on_service_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_amenity: {
        Row: {
          amenity_code: string
          location_id: string
          notes: string | null
        }
        Insert: {
          amenity_code: string
          location_id: string
          notes?: string | null
        }
        Update: {
          amenity_code?: string
          location_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_amenity_amenity_code_fkey"
            columns: ["amenity_code"]
            isOneToOne: false
            referencedRelation: "amenity"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "location_amenity_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_amenity_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_amenity_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_parking_availability: {
        Row: {
          blocked: boolean
          booked_count: number
          date: string
          id: string
          location_parking_type_id: string
        }
        Insert: {
          blocked?: boolean
          booked_count?: number
          date: string
          id?: string
          location_parking_type_id: string
        }
        Update: {
          blocked?: boolean
          booked_count?: number
          date?: string
          id?: string
          location_parking_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_parking_availability_location_parking_type_id_fkey"
            columns: ["location_parking_type_id"]
            isOneToOne: false
            referencedRelation: "location_parking_type"
            referencedColumns: ["id"]
          },
        ]
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
          minimum_stay_unit:
            | Database["public"]["Enums"]["minimum_stay_unit"]
            | null
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
          minimum_stay_unit?:
            | Database["public"]["Enums"]["minimum_stay_unit"]
            | null
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
          minimum_stay_unit?:
            | Database["public"]["Enums"]["minimum_stay_unit"]
            | null
          minimum_stay_value?: number | null
          near_capacity_message?: string | null
          near_capacity_threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_parking_type_company_parking_type_id_fkey"
            columns: ["company_parking_type_id"]
            isOneToOne: false
            referencedRelation: "company_parking_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_parking_type_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_parking_type_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_parking_type_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_photo: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          location_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_photo_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_photo_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_photo_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
        ]
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
          expires_at: string | null
          id: string
          installments: number | null
          method: string | null
          paid_at: string | null
          pix_qr_code: string | null
          pix_qr_code_url: string | null
          provider: string
          provider_charge_id: string | null
          provider_payment_id: string | null
          refund_reason: string | null
          refunded_amount: number | null
          refunded_at: string | null
          split: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          installments?: number | null
          method?: string | null
          paid_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_url?: string | null
          provider: string
          provider_charge_id?: string | null
          provider_payment_id?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          split?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          installments?: number | null
          method?: string | null
          paid_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_url?: string | null
          provider?: string
          provider_charge_id?: string | null
          provider_payment_id?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          split?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method: {
        Row: {
          brand: string
          created_at: string
          deleted_at: string | null
          expiry_month: number | null
          expiry_year: number | null
          holder_name: string | null
          id: string
          is_default: boolean
          last4: string
          profile_id: string
          provider: string
          provider_token: string | null
        }
        Insert: {
          brand: string
          created_at?: string
          deleted_at?: string | null
          expiry_month?: number | null
          expiry_year?: number | null
          holder_name?: string | null
          id?: string
          is_default?: boolean
          last4: string
          profile_id: string
          provider?: string
          provider_token?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          deleted_at?: string | null
          expiry_month?: number | null
          expiry_year?: number | null
          holder_name?: string | null
          id?: string
          is_default?: boolean
          last4?: string
          profile_id?: string
          provider?: string
          provider_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_event: {
        Row: {
          id: string
          provider: string
          received_at: string
          type: string | null
        }
        Insert: {
          id: string
          provider?: string
          received_at?: string
          type?: string | null
        }
        Update: {
          id?: string
          provider?: string
          received_at?: string
          type?: string | null
        }
        Relationships: []
      }
      payout_recipient: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          external_recipient_id: string | null
          id: string
          kyc_url: string | null
          last_provider_status: string | null
          provider: string
          requirements: Json
          status: Database["public"]["Enums"]["payout_recipient_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          external_recipient_id?: string | null
          id?: string
          kyc_url?: string | null
          last_provider_status?: string | null
          provider?: string
          requirements?: Json
          status?: Database["public"]["Enums"]["payout_recipient_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          external_recipient_id?: string | null
          id?: string
          kyc_url?: string | null
          last_provider_status?: string | null
          provider?: string
          requirements?: Json
          status?: Database["public"]["Enums"]["payout_recipient_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_recipient_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_recipient_event: {
        Row: {
          created_at: string
          http_status: number | null
          id: string
          kind: string
          payout_recipient_id: string
          request: Json | null
          response: Json | null
        }
        Insert: {
          created_at?: string
          http_status?: number | null
          id?: string
          kind: string
          payout_recipient_id: string
          request?: Json | null
          response?: Json | null
        }
        Update: {
          created_at?: string
          http_status?: number | null
          id?: string
          kind?: string
          payout_recipient_id?: string
          request?: Json | null
          response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_recipient_event_payout_recipient_id_fkey"
            columns: ["payout_recipient_id"]
            isOneToOne: false
            referencedRelation: "payout_recipient"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_withdrawal: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          deleted_at: string | null
          external_recipient_id: string | null
          external_transfer_id: string
          fee_cents: number
          id: string
          paid_at: string | null
          provider: string
          raw: Json | null
          requested_at: string | null
          status: Database["public"]["Enums"]["payout_withdrawal_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          deleted_at?: string | null
          external_recipient_id?: string | null
          external_transfer_id: string
          fee_cents?: number
          id?: string
          paid_at?: string | null
          provider?: string
          raw?: Json | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["payout_withdrawal_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          external_recipient_id?: string | null
          external_transfer_id?: string
          fee_cents?: number
          id?: string
          paid_at?: string | null
          provider?: string
          raw?: Json | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["payout_withdrawal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_withdrawal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pricing_hourly_bracket_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rule"
            referencedColumns: ["id"]
          },
        ]
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
        Insert: {
          advance_booking_minutes?: number | null
          created_at?: string
          fractional_day_policy?: string
          fractional_day_tolerance?: number | null
          hourly_daily_rate?: number | null
          hourly_fraction_rate?: number | null
          hourly_hours_per_day?: number | null
          hourly_initial_rate?: number | null
          hourly_one_hour_rate?: number | null
          id?: string
          incremental_base?: number | null
          incremental_multiplier?: number | null
          incremental_one_day_price?: number | null
          incremental_two_days_price?: number | null
          location_parking_type_id: string
          monthly_daily_rate?: number | null
          monthly_fixed_price?: number | null
          old_price_multiplier?: number | null
          old_price_strategy?: string
          operating_hours?: Json | null
          strategy: string
          surcharge_multiplier?: number | null
          surcharge_source_id?: string | null
          updated_at?: string
        }
        Update: {
          advance_booking_minutes?: number | null
          created_at?: string
          fractional_day_policy?: string
          fractional_day_tolerance?: number | null
          hourly_daily_rate?: number | null
          hourly_fraction_rate?: number | null
          hourly_hours_per_day?: number | null
          hourly_initial_rate?: number | null
          hourly_one_hour_rate?: number | null
          id?: string
          incremental_base?: number | null
          incremental_multiplier?: number | null
          incremental_one_day_price?: number | null
          incremental_two_days_price?: number | null
          location_parking_type_id?: string
          monthly_daily_rate?: number | null
          monthly_fixed_price?: number | null
          old_price_multiplier?: number | null
          old_price_strategy?: string
          operating_hours?: Json | null
          strategy?: string
          surcharge_multiplier?: number | null
          surcharge_source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_location_parking_type_id_fkey"
            columns: ["location_parking_type_id"]
            isOneToOne: true
            referencedRelation: "location_parking_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rule_surcharge_source_id_fkey"
            columns: ["surcharge_source_id"]
            isOneToOne: false
            referencedRelation: "location_parking_type"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pricing_tier_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rule"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_company: {
        Row: {
          company_id: string
          created_at: string
          profile_id: string
          role: Database["public"]["Enums"]["company_role"]
        }
        Insert: {
          company_id: string
          created_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["company_role"]
        }
        Update: {
          company_id?: string
          created_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["company_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_company_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_saved: {
        Row: {
          created_at: string
          location_parking_type_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          location_parking_type_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          location_parking_type_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_saved_location_parking_type_id_fkey"
            columns: ["location_parking_type_id"]
            isOneToOne: false
            referencedRelation: "location_parking_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_saved_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          preferences: Json
          role: Database["public"]["Enums"]["user_role"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          preferences?: Json
          role?: Database["public"]["Enums"]["user_role"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          preferences?: Json
          role?: Database["public"]["Enums"]["user_role"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      review: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          is_published: boolean
          location_id: string
          owner_response: string | null
          owner_response_at: string | null
          profile_id: string
          rating: number
          rating_access: number | null
          rating_cleanliness: number | null
          rating_service: number | null
          rating_value: number | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          location_id: string
          owner_response?: string | null
          owner_response_at?: string | null
          profile_id: string
          rating: number
          rating_access?: number | null
          rating_cleanliness?: number | null
          rating_service?: number | null
          rating_value?: number | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          location_id?: string
          owner_response?: string | null
          owner_response_at?: string | null
          profile_id?: string
          rating?: number
          rating_access?: number | null
          rating_cleanliness?: number | null
          rating_service?: number | null
          rating_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_point_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "review_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_proximity"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "review_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
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
          is_default?: boolean
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
          is_default?: boolean
          license_plate?: string
          model?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      location_point_proximity: {
        Row: {
          destination_id: string | null
          destination_point_id: string | null
          distance_km: number | null
          is_nearest: boolean | null
          location_id: string | null
          point_name: string | null
          point_type: string | null
          sort_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "location_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destination"
            referencedColumns: ["id"]
          },
        ]
      }
      location_proximity: {
        Row: {
          destination_code: string | null
          destination_id: string | null
          destination_name: string | null
          destination_short_name: string | null
          destination_type: string | null
          distance_km: number | null
          location_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destination"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _apply_pricing:
        | {
            Args: {
              p_days?: number
              p_source_strategy?: string
              p_source_tiers?: Json
              p_strategy: string
              p_surcharge_multiplier?: number
              p_tiers: Json
            }
            Returns: number
          }
        | {
            Args: {
              p_days?: number
              p_hourly_daily?: number
              p_inc_base?: number
              p_inc_mult?: number
              p_inc_one_day?: number
              p_inc_two_days?: number
              p_monthly_daily?: number
              p_monthly_fixed?: number
              p_source_strategy?: string
              p_source_tiers?: Json
              p_strategy: string
              p_surcharge_multiplier?: number
              p_tiers: Json
            }
            Returns: number
          }
      _create_booking_core: {
        Args: {
          p_add_on_ids: string[]
          p_check_in_at: string
          p_check_out_at: string
          p_coupon_code: string
          p_created_via_api_key_id: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_has_pcd: boolean
          p_location_parking_type_id: string
          p_origin: string
          p_passenger_count: number
          p_profile_id: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      addon_assert_company_access: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      api_assert_lpt_company: {
        Args: { p_company_id: string; p_lpt_id: string }
        Returns: undefined
      }
      api_assert_scopes: { Args: { p_scopes: string[] }; Returns: undefined }
      api_cancel_booking: {
        Args: { p_booking_id: string; p_company_id: string; p_reason?: string }
        Returns: Json
      }
      api_checkin_booking: {
        Args: { p_booking_id: string; p_company_id: string }
        Returns: Json
      }
      api_checkout_booking: {
        Args: { p_booking_id: string; p_company_id: string }
        Returns: Json
      }
      api_create_booking: {
        Args: {
          p_add_on_ids?: string[]
          p_api_key_id: string
          p_check_in_at: string
          p_check_out_at: string
          p_company_id: string
          p_coupon_code?: string
          p_customer_email?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_has_pcd?: boolean
          p_idempotency_key?: string
          p_location_parking_type_id: string
          p_origin?: string
          p_passenger_count?: number
        }
        Returns: Json
      }
      api_delete_addon: {
        Args: { p_add_on_service_id: string; p_company_id: string }
        Returns: undefined
      }
      api_delete_coupon: {
        Args: { p_company_id: string; p_coupon_id: string }
        Returns: undefined
      }
      api_delete_discount: {
        Args: { p_company_id: string; p_discount_rule_id: string }
        Returns: undefined
      }
      api_get_booking: {
        Args: { p_booking_id: string; p_company_id: string }
        Returns: Json
      }
      api_get_location: {
        Args: { p_company_id: string; p_location_id: string }
        Returns: Json
      }
      api_key_assert_company_access: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      api_key_verify: {
        Args: { p_key_hash: string; p_key_prefix: string }
        Returns: Json
      }
      api_list_addons: { Args: { p_company_id: string }; Returns: Json }
      api_list_bookings: {
        Args: {
          p_company_id: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      api_list_coupons: { Args: { p_company_id: string }; Returns: Json }
      api_list_discounts: { Args: { p_company_id: string }; Returns: Json }
      api_list_locations: {
        Args: { p_company_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      api_list_parking_types: {
        Args: { p_company_id: string; p_location_id: string }
        Returns: Json
      }
      api_list_reviews: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: Json
      }
      api_location_occupancy: {
        Args: {
          p_company_id: string
          p_from: string
          p_location_id: string
          p_to: string
        }
        Returns: Json
      }
      api_respond_review: {
        Args: { p_company_id: string; p_response: string; p_review_id: string }
        Returns: undefined
      }
      api_set_coupon_active: {
        Args: {
          p_company_id: string
          p_coupon_id: string
          p_is_active: boolean
        }
        Returns: undefined
      }
      api_set_discount_active: {
        Args: {
          p_company_id: string
          p_discount_rule_id: string
          p_is_active: boolean
        }
        Returns: undefined
      }
      api_set_location_addon: {
        Args: {
          p_add_on_service_id: string
          p_company_id: string
          p_is_active: boolean
          p_location_id: string
          p_price_override: number
        }
        Returns: undefined
      }
      api_simulate_price: {
        Args: {
          p_company_id: string
          p_days: number
          p_location_parking_type_id: string
        }
        Returns: Json
      }
      api_update_location: {
        Args: {
          p_address?: string
          p_company_id: string
          p_email?: string
          p_has_notice?: boolean
          p_location_id: string
          p_name?: string
          p_notice?: string
          p_phone?: string
          p_reservation_policy?: string
        }
        Returns: Json
      }
      api_update_parking_type: {
        Args: {
          p_capacity?: number
          p_company_id: string
          p_has_minimum_date?: boolean
          p_has_minimum_stay?: boolean
          p_is_active?: boolean
          p_location_parking_type_id: string
          p_minimum_date?: string
          p_minimum_stay_unit?: string
          p_minimum_stay_value?: number
          p_near_capacity_message?: string
          p_near_capacity_threshold?: number
        }
        Returns: Json
      }
      api_upsert_addon: {
        Args: {
          p_base_price: number
          p_code: string
          p_company_id: string
          p_description: string
          p_id: string
          p_is_active: boolean
          p_name: string
          p_sort_order: number
        }
        Returns: string
      }
      api_upsert_coupon: {
        Args: {
          p_code: string
          p_company_id: string
          p_description: string
          p_discount_type: string
          p_discount_value: number
          p_id: string
          p_is_active: boolean
          p_max_uses: number
          p_min_amount: number
          p_min_days: number
          p_parking_type_ids: string[]
          p_per_user_limit: number
          p_sort_order: number
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      api_upsert_discount: {
        Args: {
          p_advance_days: number
          p_allow_coupon_stack: boolean
          p_company_id: string
          p_description: string
          p_discount_type: string
          p_discount_value: number
          p_id: string
          p_is_active: boolean
          p_location_id: string
          p_min_amount: number
          p_min_days: number
          p_name: string
          p_parking_type_ids: string[]
          p_priority: number
          p_sort_order: number
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      availability_batch: {
        Args: {
          p_check_in_at: string
          p_check_out_at: string
          p_lpt_ids: string[]
        }
        Returns: {
          capacity: number
          location_parking_type_id: string
          near_capacity: boolean
          near_capacity_message: string
          remaining: number
          sold_out: boolean
        }[]
      }
      cancel_booking_with_release: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      check_availability: {
        Args: {
          p_check_in_at: string
          p_check_out_at: string
          p_company: string
          p_location: string
          p_parking_type: string
        }
        Returns: Json
      }
      company_list_members: {
        Args: { p_company_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          profile_id: string
          role: Database["public"]["Enums"]["company_role"]
        }[]
      }
      company_remove_member: {
        Args: { p_company_id: string; p_profile_id: string }
        Returns: undefined
      }
      company_set_member_role: {
        Args: {
          p_company_id: string
          p_profile_id: string
          p_role: Database["public"]["Enums"]["company_role"]
        }
        Returns: undefined
      }
      coupon_assert_company_access: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      coupon_evaluate: {
        Args: {
          p_code: string
          p_company_parking_type_id: string
          p_days: number
          p_location_id: string
          p_profile_id: string
          p_subtotal: number
        }
        Returns: {
          coupon_id: string
          discount: number
          error_code: string
        }[]
      }
      create_booking_atomic: {
        Args: {
          p_add_on_ids?: string[]
          p_check_in_at: string
          p_check_out_at: string
          p_coupon_code?: string
          p_has_pcd?: boolean
          p_location_parking_type_id: string
          p_origin?: string
          p_passenger_count?: number
          p_profile_id: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      cron_complete_bookings: { Args: never; Returns: number }
      cron_expire_pending_bookings: { Args: never; Returns: number }
      cron_prune_api_request_log: { Args: never; Returns: number }
      current_company_ids: { Args: never; Returns: string[] }
      current_owner_company_ids: { Args: never; Returns: string[] }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      discount_assert_company_access: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      discount_evaluate: {
        Args: {
          p_base_price: number
          p_check_in_at: string
          p_company_parking_type_id: string
          p_days: number
          p_location_id: string
        }
        Returns: {
          allow_coupon_stack: boolean
          discount: number
          discount_rule_id: string
          label: string
        }[]
      }
      generate_unique_company_slug: {
        Args: { p_name: string }
        Returns: string
      }
      generate_unique_location_slug: {
        Args: { p_company_id: string; p_name: string }
        Returns: string
      }
      get_pricing_data: {
        Args: {
          p_company: string
          p_location?: string
          p_parking_type?: string
        }
        Returns: {
          company_name: string
          company_slug: string
          hourly_daily_rate: number
          hourly_hours_per_day: number
          incremental_base: number
          incremental_multiplier: number
          incremental_one_day_price: number
          incremental_two_days_price: number
          location_name: string
          location_slug: string
          monthly_daily_rate: number
          monthly_fixed_price: number
          old_price_multiplier: number
          old_price_strategy: string
          parking_type_code: string
          parking_type_name: string
          source_strategy: string
          source_tiers: Json
          strategy: string
          surcharge_multiplier: number
          tiers: Json
        }[]
      }
      is_company_owner: { Args: { p_company_id: string }; Returns: boolean }
      is_hub_admin: { Args: never; Returns: boolean }
      locations_proximity: {
        Args: { p_destination_id?: string; p_lat: number; p_lng: number }
        Returns: {
          distance_km: number
          location_id: string
          nearest_terminal_distance_km: number
          nearest_terminal_name: string
        }[]
      }
      min_stay_satisfied: {
        Args: {
          p_days: number
          p_total_minutes: number
          p_unit: Database["public"]["Enums"]["minimum_stay_unit"]
          p_value: number
        }
        Returns: boolean
      }
      nearest_destination: {
        Args: { p_lat: number; p_lng: number; p_max_km?: number }
        Returns: string
      }
      nearest_destination_point: {
        Args: { p_destination_id: string; p_lat: number; p_lng: number }
        Returns: string
      }
      onboarding_assert_editable: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      onboarding_bump_step: {
        Args: { p_company_id: string; p_step: number }
        Returns: undefined
      }
      onboarding_set_addons: {
        Args: { p_company_id: string; p_items: Json; p_location_id: string }
        Returns: undefined
      }
      onboarding_set_parking_types: {
        Args: { p_company_id: string; p_items: Json; p_location_id: string }
        Returns: undefined
      }
      onboarding_set_pricing: {
        Args: {
          p_company_id: string
          p_location_parking_type_id: string
          p_strategy: string
          p_tiers: Json
        }
        Returns: undefined
      }
      onboarding_submit: { Args: { p_company_id: string }; Returns: undefined }
      onboarding_update_company: {
        Args: {
          p_company_id: string
          p_legal_name?: string
          p_logo_url?: string
          p_name: string
          p_tax_id?: string
        }
        Returns: undefined
      }
      onboarding_upsert_location: {
        Args: {
          p_address?: string
          p_company_id: string
          p_email?: string
          p_latitude?: number
          p_location_id: string
          p_longitude?: number
          p_name: string
          p_phone?: string
          p_photos?: Json
          p_reservation_policy?: string
          p_timezone?: string
        }
        Returns: string
      }
      onboarding_upsert_payout_account: {
        Args: { p_account: Json; p_company_id: string }
        Returns: undefined
      }
      operator_api_usage: {
        Args: { p_company_id: string; p_limit?: number; p_since?: string }
        Returns: Json
      }
      operator_create_api_key: {
        Args: {
          p_company_id: string
          p_environment: string
          p_expires_at?: string
          p_name: string
          p_scopes: string[]
        }
        Returns: Json
      }
      operator_delete_addon: {
        Args: { p_add_on_service_id: string }
        Returns: undefined
      }
      operator_delete_coupon: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      operator_delete_discount: {
        Args: { p_discount_rule_id: string }
        Returns: undefined
      }
      operator_list_api_keys: { Args: { p_company_id: string }; Returns: Json }
      operator_location_occupancy: {
        Args: { p_from: string; p_location_id: string; p_to: string }
        Returns: {
          blocked: boolean
          booked_count: number
          capacity: number
          date: string
          location_parking_type_id: string
          parking_type_name: string
        }[]
      }
      operator_respond_review: {
        Args: { p_response: string; p_review_id: string }
        Returns: undefined
      }
      operator_revoke_api_key: {
        Args: { p_api_key_id: string }
        Returns: undefined
      }
      operator_rotate_api_key: { Args: { p_api_key_id: string }; Returns: Json }
      operator_set_coupon_active: {
        Args: { p_coupon_id: string; p_is_active: boolean }
        Returns: undefined
      }
      operator_set_date_blocked: {
        Args: {
          p_blocked: boolean
          p_date: string
          p_location_parking_type_id: string
        }
        Returns: undefined
      }
      operator_set_discount_active: {
        Args: { p_discount_rule_id: string; p_is_active: boolean }
        Returns: undefined
      }
      operator_set_location_addon: {
        Args: {
          p_add_on_service_id: string
          p_is_active: boolean
          p_location_id: string
          p_price_override: number
        }
        Returns: undefined
      }
      operator_set_pricing: {
        Args: {
          p_base_price: number
          p_location_parking_type_id: string
          p_rule: Json
          p_tiers?: Json
        }
        Returns: undefined
      }
      operator_update_api_key_scopes: {
        Args: { p_api_key_id: string; p_scopes: string[] }
        Returns: undefined
      }
      operator_upsert_addon: {
        Args: {
          p_base_price: number
          p_code: string
          p_company_id: string
          p_description: string
          p_id: string
          p_is_active: boolean
          p_name: string
          p_sort_order: number
        }
        Returns: string
      }
      operator_upsert_coupon: {
        Args: {
          p_code: string
          p_company_id: string
          p_description: string
          p_discount_type: string
          p_discount_value: number
          p_id: string
          p_is_active: boolean
          p_max_uses: number
          p_min_amount: number
          p_min_days: number
          p_parking_type_ids: string[]
          p_per_user_limit: number
          p_sort_order: number
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      operator_upsert_discount: {
        Args: {
          p_advance_days: number
          p_allow_coupon_stack: boolean
          p_company_id: string
          p_description: string
          p_discount_type: string
          p_discount_value: number
          p_id: string
          p_is_active: boolean
          p_location_id: string
          p_min_amount: number
          p_min_days: number
          p_name: string
          p_parking_type_ids: string[]
          p_priority: number
          p_sort_order: number
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      payout_balance: {
        Args: { p_company_id: string; p_provider?: string }
        Returns: Json
      }
      payout_statement: {
        Args: {
          p_company_id?: string
          p_from: string
          p_include_lines?: boolean
          p_to: string
        }
        Returns: Json
      }
      release_booking_capacity: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      review_recompute_location: {
        Args: { p_location_id: string }
        Returns: undefined
      }
      simulate_price: {
        Args: {
          p_company: string
          p_days?: number
          p_location?: string
          p_parking_type?: string
        }
        Returns: Json
      }
      slugify: { Args: { p_text: string }; Returns: string }
      submit_partner_lead: {
        Args: {
          p_city?: string
          p_company_name: string
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_contact_role?: string
          p_estimated_spots?: number
          p_message?: string
          p_referrer?: string
          p_state?: string
          p_tax_id?: string
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: string
      }
      submit_review: {
        Args: {
          p_access: number
          p_booking_id: string
          p_cleanliness: number
          p_comment: string
          p_rating: number
          p_service: number
          p_value: number
        }
        Returns: string
      }
      validate_coupon: {
        Args: {
          p_check_in_at: string
          p_check_out_at: string
          p_code: string
          p_location_parking_type_id: string
        }
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
      company_role: "owner" | "operator"
      discount_type: "percent" | "fixed"
      entity_status: "active" | "inactive" | "suspended"
      faq_scope: "global" | "location" | "destination"
      minimum_stay_unit: "minutes" | "hours" | "days" | "months"
      onboarding_status:
        | "pending_review"
        | "approved"
        | "in_progress"
        | "active"
        | "rejected"
      payment_status:
        | "pending"
        | "authorized"
        | "paid"
        | "refunded"
        | "failed"
        | "cancelled"
      payout_recipient_status:
        | "draft"
        | "pending"
        | "action_required"
        | "active"
        | "refused"
        | "suspended"
      payout_withdrawal_status:
        | "created"
        | "processing"
        | "paid"
        | "failed"
        | "canceled"
      user_role: "hub_admin" | "company_operator" | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_item_type: ["parking", "add_on"],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
      ],
      company_role: ["owner", "operator"],
      discount_type: ["percent", "fixed"],
      entity_status: ["active", "inactive", "suspended"],
      faq_scope: ["global", "location", "destination"],
      minimum_stay_unit: ["minutes", "hours", "days", "months"],
      onboarding_status: [
        "pending_review",
        "approved",
        "in_progress",
        "active",
        "rejected",
      ],
      payment_status: [
        "pending",
        "authorized",
        "paid",
        "refunded",
        "failed",
        "cancelled",
      ],
      payout_recipient_status: [
        "draft",
        "pending",
        "action_required",
        "active",
        "refused",
        "suspended",
      ],
      payout_withdrawal_status: [
        "created",
        "processing",
        "paid",
        "failed",
        "canceled",
      ],
      user_role: ["hub_admin", "company_operator", "customer"],
    },
  },
} as const
