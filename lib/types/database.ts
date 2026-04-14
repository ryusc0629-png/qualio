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
      bookings: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          deleted_at: string | null
          duration_minutes: number
          final_price: number
          id: string
          memo: string | null
          quote_id: string | null
          scheduled_at: string
          selected_tier: string
          service_address: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          deleted_at?: string | null
          duration_minutes?: number
          final_price?: number
          id?: string
          memo?: string | null
          quote_id?: string | null
          scheduled_at: string
          selected_tier?: string
          service_address: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          deleted_at?: string | null
          duration_minutes?: number
          final_price?: number
          id?: string
          memo?: string | null
          quote_id?: string | null
          scheduled_at?: string
          selected_tier?: string
          service_address?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          kakao_channel_id: string | null
          logo_url: string | null
          name: string
          naver_place_url: string | null
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kakao_channel_id?: string | null
          logo_url?: string | null
          name: string
          naver_place_url?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kakao_channel_id?: string | null
          logo_url?: string | null
          name?: string
          naver_place_url?: string | null
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_id: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_tiers: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          highlight: boolean
          id: string
          label: string
          price_multiplier: number
          sort_order: number
          tier: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          highlight?: boolean
          id?: string
          label: string
          price_multiplier?: number
          sort_order?: number
          tier: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          highlight?: boolean
          id?: string
          label?: string
          price_multiplier?: number
          sort_order?: number
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_tiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          best_price: number | null
          better_price: number | null
          business_id: string
          cleaning_type: string | null
          created_at: string
          expires_at: string
          extra_notes: string | null
          good_price: number | null
          id: string
          preferred_date: string | null
          space_size: number | null
          status: string
          updated_at: string
          utm_source: string | null
        }
        Insert: {
          best_price?: number | null
          better_price?: number | null
          business_id: string
          cleaning_type?: string | null
          created_at?: string
          expires_at?: string
          extra_notes?: string | null
          good_price?: number | null
          id?: string
          preferred_date?: string | null
          space_size?: number | null
          status?: string
          updated_at?: string
          utm_source?: string | null
        }
        Update: {
          best_price?: number | null
          better_price?: number | null
          business_id?: string
          cleaning_type?: string | null
          created_at?: string
          expires_at?: string
          extra_notes?: string | null
          good_price?: number | null
          id?: string
          preferred_date?: string | null
          space_size?: number | null
          status?: string
          updated_at?: string
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      report_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          report_id: string
          sort_order: number
          type: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          report_id: string
          sort_order?: number
          type: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          report_id?: string
          sort_order?: number
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          booking_id: string
          business_id: string
          created_at: string
          id: string
          kakao_sent_at: string | null
          notes: string | null
          review_request_sent_at: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          business_id: string
          created_at?: string
          id?: string
          kakao_sent_at?: string | null
          notes?: string | null
          review_request_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          business_id?: string
          created_at?: string
          id?: string
          kakao_sent_at?: string | null
          notes?: string | null
          review_request_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          base_price: number
          business_id: string
          category: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          business_id: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          business_id?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_id: string | null
          plan: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_id?: string | null
          plan?: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_id?: string | null
          plan?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      surcharge_rules: {
        Row: {
          amount: number
          amount_type: string
          business_id: string
          condition_type: string
          condition_value: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_type?: string
          business_id: string
          condition_type: string
          condition_value?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_type?: string
          business_id?: string
          condition_type?: string
          condition_value?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surcharge_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_business_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
