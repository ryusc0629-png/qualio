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
  public: {
    Tables: {
      academy_inquiries: {
        Row: {
          academy_name: string
          contact_name: string
          contacted: boolean
          created_at: string
          id: string
          message: string | null
          phone: string
          program_type: string | null
          region: string | null
          source: string | null
          student_scale: string | null
        }
        Insert: {
          academy_name: string
          contact_name: string
          contacted?: boolean
          created_at?: string
          id?: string
          message?: string | null
          phone: string
          program_type?: string | null
          region?: string | null
          source?: string | null
          student_scale?: string | null
        }
        Update: {
          academy_name?: string
          contact_name?: string
          contacted?: boolean
          created_at?: string
          id?: string
          message?: string | null
          phone?: string
          program_type?: string | null
          region?: string | null
          source?: string | null
          student_scale?: string | null
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          business_id: string
          created_at: string
          id: string
          path: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          path: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_crawler_hits: {
        Row: {
          bot: string
          business_id: string
          created_at: string
          hit_date: string
          hits: number
          id: string
        }
        Insert: {
          bot: string
          business_id: string
          created_at?: string
          hit_date: string
          hits?: number
          id?: string
        }
        Update: {
          bot?: string
          business_id?: string
          created_at?: string
          hit_date?: string
          hits?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_crawler_hits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_quotes: {
        Row: {
          amount_mode: string | null
          business_id: string
          conditions: string | null
          contract_content: string | null
          created_at: string
          customer_id: string | null
          discount_type: string | null
          discount_value: number
          first_viewed_at: string | null
          frequency: string | null
          id: string
          items: Json
          job_type: string
          last_viewed_at: string | null
          lead_id: string | null
          public_token: string | null
          quote_number: string | null
          site_address: string | null
          site_area: string | null
          site_name: string | null
          spec_content: string | null
          tax_included: boolean
          title: string | null
          total_amount: number
          updated_at: string
          valid_until: string | null
          view_alert_sent_at: string | null
          view_count: number
          worker_count: number | null
        }
        Insert: {
          amount_mode?: string | null
          business_id: string
          conditions?: string | null
          contract_content?: string | null
          created_at?: string
          customer_id?: string | null
          discount_type?: string | null
          discount_value?: number
          first_viewed_at?: string | null
          frequency?: string | null
          id?: string
          items?: Json
          job_type?: string
          last_viewed_at?: string | null
          lead_id?: string | null
          public_token?: string | null
          quote_number?: string | null
          site_address?: string | null
          site_area?: string | null
          site_name?: string | null
          spec_content?: string | null
          tax_included?: boolean
          title?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          view_alert_sent_at?: string | null
          view_count?: number
          worker_count?: number | null
        }
        Update: {
          amount_mode?: string | null
          business_id?: string
          conditions?: string | null
          contract_content?: string | null
          created_at?: string
          customer_id?: string | null
          discount_type?: string | null
          discount_value?: number
          first_viewed_at?: string | null
          frequency?: string | null
          id?: string
          items?: Json
          job_type?: string
          last_viewed_at?: string | null
          lead_id?: string | null
          public_token?: string | null
          quote_number?: string | null
          site_address?: string | null
          site_area?: string | null
          site_name?: string | null
          spec_content?: string | null
          tax_included?: boolean
          title?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          view_alert_sent_at?: string | null
          view_count?: number
          worker_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_quotes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      biz_posts: {
        Row: {
          after_image_urls: string[] | null
          ai_generated: boolean
          before_image_urls: string[] | null
          business_id: string
          channel_posted_at: string | null
          content: string
          created_at: string
          daangn_content: string | null
          daangn_title: string | null
          id: string
          image_url: string | null
          image_urls: string[]
          instagram_content: string | null
          instagram_hashtags: string[] | null
          naver_content: string | null
          naver_tags: string[] | null
          naver_title: string | null
          post_type: string
          published: boolean
          published_at: string
          reel_error: string | null
          reel_queued_at: string | null
          reel_render_id: string | null
          reel_status: string
          reel_url: string | null
          slug: string
          source_report_id: string | null
          summary: string | null
          title: string
          updated_at: string
          work_clip_durations: number[] | null
          work_clip_urls: string[] | null
        }
        Insert: {
          after_image_urls?: string[] | null
          ai_generated?: boolean
          before_image_urls?: string[] | null
          business_id: string
          channel_posted_at?: string | null
          content: string
          created_at?: string
          daangn_content?: string | null
          daangn_title?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          instagram_content?: string | null
          instagram_hashtags?: string[] | null
          naver_content?: string | null
          naver_tags?: string[] | null
          naver_title?: string | null
          post_type?: string
          published?: boolean
          published_at?: string
          reel_error?: string | null
          reel_queued_at?: string | null
          reel_render_id?: string | null
          reel_status?: string
          reel_url?: string | null
          slug: string
          source_report_id?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          work_clip_durations?: number[] | null
          work_clip_urls?: string[] | null
        }
        Update: {
          after_image_urls?: string[] | null
          ai_generated?: boolean
          before_image_urls?: string[] | null
          business_id?: string
          channel_posted_at?: string | null
          content?: string
          created_at?: string
          daangn_content?: string | null
          daangn_title?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          instagram_content?: string | null
          instagram_hashtags?: string[] | null
          naver_content?: string | null
          naver_tags?: string[] | null
          naver_title?: string | null
          post_type?: string
          published?: boolean
          published_at?: string
          reel_error?: string | null
          reel_queued_at?: string | null
          reel_render_id?: string | null
          reel_status?: string
          reel_url?: string | null
          slug?: string
          source_report_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          work_clip_durations?: number[] | null
          work_clip_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "biz_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biz_posts_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          amount: number
          booking_id: string
          business_id: string
          created_at: string
          id: string
          name: string
          quantity: number
          sort_order: number
          unit: string
          unit_price: number
        }
        Insert: {
          amount?: number
          booking_id: string
          business_id: string
          created_at?: string
          id?: string
          name: string
          quantity?: number
          sort_order?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          amount?: number
          booking_id?: string
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          quantity?: number
          sort_order?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_price_changes: {
        Row: {
          booking_id: string
          business_id: string
          change_type: string
          changed_by: string
          changed_by_name: string | null
          created_at: string
          id: string
          item_name: string | null
          new_amount: number | null
          old_amount: number | null
          reason: string | null
        }
        Insert: {
          booking_id: string
          business_id: string
          change_type: string
          changed_by?: string
          changed_by_name?: string | null
          created_at?: string
          id?: string
          item_name?: string | null
          new_amount?: number | null
          old_amount?: number | null
          reason?: string | null
        }
        Update: {
          booking_id?: string
          business_id?: string
          change_type?: string
          changed_by?: string
          changed_by_name?: string | null
          created_at?: string
          id?: string
          item_name?: string | null
          new_amount?: number | null
          old_amount?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_changes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_changes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_workers: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          is_lead: boolean
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          is_lead?: boolean
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          is_lead?: boolean
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_workers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          auto_review_followup_sent_at: string | null
          auto_review_sent_at: string | null
          business_id: string
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel: string | null
          checkin_acc: number | null
          checkin_at: string | null
          checkin_lat: number | null
          checkin_lng: number | null
          checklist_photos: Json | null
          checkout_acc: number | null
          checkout_at: string | null
          checkout_lat: number | null
          checkout_lng: number | null
          confirm_alimtalk_sent_at: string | null
          contract_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          customer_request: string | null
          customer_request_done_at: string | null
          deleted_at: string | null
          duration_minutes: number
          final_price: number
          id: string
          lockup_alert_sent_at: string | null
          lockup_photo_urls: string[] | null
          memo: string | null
          memo_updated_at: string | null
          memo_updated_by: string | null
          needs_review: boolean
          on_my_way_sent_at: string | null
          open_photo_urls: string[] | null
          paid_amount: number
          quote_id: string | null
          reminder_sent_at: string | null
          report_skipped_at: string | null
          reschedule_note: string | null
          reschedule_requested_at: string | null
          reschedule_requested_for: string | null
          review_reason: string | null
          scheduled_at: string
          selected_tier: string
          service_address: string
          service_label: string | null
          site_lat: number | null
          site_lng: number | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          auto_review_followup_sent_at?: string | null
          auto_review_sent_at?: string | null
          business_id: string
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel?: string | null
          checkin_acc?: number | null
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checklist_photos?: Json | null
          checkout_acc?: number | null
          checkout_at?: string | null
          checkout_lat?: number | null
          checkout_lng?: number | null
          confirm_alimtalk_sent_at?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          customer_request?: string | null
          customer_request_done_at?: string | null
          deleted_at?: string | null
          duration_minutes?: number
          final_price?: number
          id?: string
          lockup_alert_sent_at?: string | null
          lockup_photo_urls?: string[] | null
          memo?: string | null
          memo_updated_at?: string | null
          memo_updated_by?: string | null
          needs_review?: boolean
          on_my_way_sent_at?: string | null
          open_photo_urls?: string[] | null
          paid_amount?: number
          quote_id?: string | null
          reminder_sent_at?: string | null
          report_skipped_at?: string | null
          reschedule_note?: string | null
          reschedule_requested_at?: string | null
          reschedule_requested_for?: string | null
          review_reason?: string | null
          scheduled_at: string
          selected_tier?: string
          service_address: string
          service_label?: string | null
          site_lat?: number | null
          site_lng?: number | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          auto_review_followup_sent_at?: string | null
          auto_review_sent_at?: string | null
          business_id?: string
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel?: string | null
          checkin_acc?: number | null
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checklist_photos?: Json | null
          checkout_acc?: number | null
          checkout_at?: string | null
          checkout_lat?: number | null
          checkout_lng?: number | null
          confirm_alimtalk_sent_at?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          customer_request?: string | null
          customer_request_done_at?: string | null
          deleted_at?: string | null
          duration_minutes?: number
          final_price?: number
          id?: string
          lockup_alert_sent_at?: string | null
          lockup_photo_urls?: string[] | null
          memo?: string | null
          memo_updated_at?: string | null
          memo_updated_by?: string | null
          needs_review?: boolean
          on_my_way_sent_at?: string | null
          open_photo_urls?: string[] | null
          paid_amount?: number
          quote_id?: string | null
          reminder_sent_at?: string | null
          report_skipped_at?: string | null
          reschedule_note?: string | null
          reschedule_requested_at?: string | null
          reschedule_requested_for?: string | null
          review_reason?: string | null
          scheduled_at?: string
          selected_tier?: string
          service_address?: string
          service_label?: string | null
          site_lat?: number | null
          site_lng?: number | null
          status?: string
          updated_at?: string
          worker_id?: string | null
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
            foreignKeyName: "bookings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_memo_updated_by_fkey"
            columns: ["memo_updated_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          admin_note: string | null
          app_version: string | null
          business_id: string | null
          created_at: string
          id: string
          media_urls: string[] | null
          message: string
          page_url: string | null
          reporter_name: string | null
          resolved_at: string | null
          status: string
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          admin_note?: string | null
          app_version?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          media_urls?: string[] | null
          message: string
          page_url?: string | null
          reporter_name?: string | null
          resolved_at?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          admin_note?: string | null
          app_version?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          media_urls?: string[] | null
          message?: string
          page_url?: string | null
          reporter_name?: string | null
          resolved_at?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_mrr_snapshots: {
        Row: {
          business_id: string
          captured_at: string
          mrr: number
          period: string
          plan: string
          status: string
        }
        Insert: {
          business_id: string
          captured_at?: string
          mrr?: number
          period: string
          plan?: string
          status?: string
        }
        Update: {
          business_id?: string
          captured_at?: string
          mrr?: number
          period?: string
          plan?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_mrr_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_requests: {
        Row: {
          admin_note: string | null
          business_id: string
          created_at: string
          done_at: string | null
          id: string
          kind: string
          note: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          business_id: string
          created_at?: string
          done_at?: string | null
          id?: string
          kind: string
          note?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          business_id?: string
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_roadmaps: {
        Row: {
          business_id: string
          result: Json
          saved_at: string
          summary: string
          updated_at: string
        }
        Insert: {
          business_id: string
          result: Json
          saved_at?: string
          summary?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          result?: Json
          saved_at?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_roadmaps_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          acquisition_detail: string | null
          acquisition_referrer: string | null
          acquisition_source: string | null
          acquisition_utm: string | null
          active_review_platform: string
          address: string | null
          auto_image_generation: boolean
          auto_post_lock_until: string | null
          beta_number: number | null
          brand_color: string | null
          brand_color_secondary: string | null
          business_number: string | null
          certifications: Json
          created_at: string
          custom_domain: string | null
          custom_domain_connected_at: string | null
          custom_domain_status: string
          danggeun_business_url: string | null
          danggeun_review_url: string | null
          description: string | null
          domain_pitch_at: string | null
          experience_years: number | null
          favicon_url: string | null
          gbp_checklist: Json | null
          google_place_url: string | null
          google_site_verification: string | null
          hero_image_url: string | null
          hero_style: string
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          instagram_url: string | null
          kakao_channel_id: string | null
          kakao_place_url: string | null
          legal_name: string | null
          lifetime_discount_rate: number
          logo_url: string | null
          monthly_post_target: number
          name: string
          naver_blog_api_key: string | null
          naver_blog_id: string | null
          naver_place_url: string | null
          naver_site_verification: string | null
          owner_greeting: string | null
          owner_id: string
          owner_name: string | null
          owner_photo_url: string | null
          owner_video_url: string | null
          payment_account: string | null
          phone: string | null
          portfolio: Json
          post_plan: Json | null
          post_plan_month: string | null
          previous_slugs: string[]
          proposal_settings: Json | null
          review_google_first: boolean
          review_reward_description: string | null
          review_reward_type: string
          seo_description: string | null
          seo_faqs: Json | null
          seo_generated_at: string | null
          seo_keywords: string | null
          seo_keywords_edited_at: string | null
          seo_stale_at: string | null
          seo_title: string | null
          service_areas: string[]
          slug: string | null
          strengths: Json | null
          target_customer: string
          testimonials: Json | null
          topic_suggestions: Json | null
          topic_suggestions_month: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          acquisition_detail?: string | null
          acquisition_referrer?: string | null
          acquisition_source?: string | null
          acquisition_utm?: string | null
          active_review_platform?: string
          address?: string | null
          auto_image_generation?: boolean
          auto_post_lock_until?: string | null
          beta_number?: number | null
          brand_color?: string | null
          brand_color_secondary?: string | null
          business_number?: string | null
          certifications?: Json
          created_at?: string
          custom_domain?: string | null
          custom_domain_connected_at?: string | null
          custom_domain_status?: string
          danggeun_business_url?: string | null
          danggeun_review_url?: string | null
          description?: string | null
          domain_pitch_at?: string | null
          experience_years?: number | null
          favicon_url?: string | null
          gbp_checklist?: Json | null
          google_place_url?: string | null
          google_site_verification?: string | null
          hero_image_url?: string | null
          hero_style?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram_url?: string | null
          kakao_channel_id?: string | null
          kakao_place_url?: string | null
          legal_name?: string | null
          lifetime_discount_rate?: number
          logo_url?: string | null
          monthly_post_target?: number
          name: string
          naver_blog_api_key?: string | null
          naver_blog_id?: string | null
          naver_place_url?: string | null
          naver_site_verification?: string | null
          owner_greeting?: string | null
          owner_id: string
          owner_name?: string | null
          owner_photo_url?: string | null
          owner_video_url?: string | null
          payment_account?: string | null
          phone?: string | null
          portfolio?: Json
          post_plan?: Json | null
          post_plan_month?: string | null
          previous_slugs?: string[]
          proposal_settings?: Json | null
          review_google_first?: boolean
          review_reward_description?: string | null
          review_reward_type?: string
          seo_description?: string | null
          seo_faqs?: Json | null
          seo_generated_at?: string | null
          seo_keywords?: string | null
          seo_keywords_edited_at?: string | null
          seo_stale_at?: string | null
          seo_title?: string | null
          service_areas?: string[]
          slug?: string | null
          strengths?: Json | null
          target_customer?: string
          testimonials?: Json | null
          topic_suggestions?: Json | null
          topic_suggestions_month?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          acquisition_detail?: string | null
          acquisition_referrer?: string | null
          acquisition_source?: string | null
          acquisition_utm?: string | null
          active_review_platform?: string
          address?: string | null
          auto_image_generation?: boolean
          auto_post_lock_until?: string | null
          beta_number?: number | null
          brand_color?: string | null
          brand_color_secondary?: string | null
          business_number?: string | null
          certifications?: Json
          created_at?: string
          custom_domain?: string | null
          custom_domain_connected_at?: string | null
          custom_domain_status?: string
          danggeun_business_url?: string | null
          danggeun_review_url?: string | null
          description?: string | null
          domain_pitch_at?: string | null
          experience_years?: number | null
          favicon_url?: string | null
          gbp_checklist?: Json | null
          google_place_url?: string | null
          google_site_verification?: string | null
          hero_image_url?: string | null
          hero_style?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram_url?: string | null
          kakao_channel_id?: string | null
          kakao_place_url?: string | null
          legal_name?: string | null
          lifetime_discount_rate?: number
          logo_url?: string | null
          monthly_post_target?: number
          name?: string
          naver_blog_api_key?: string | null
          naver_blog_id?: string | null
          naver_place_url?: string | null
          naver_site_verification?: string | null
          owner_greeting?: string | null
          owner_id?: string
          owner_name?: string | null
          owner_photo_url?: string | null
          owner_video_url?: string | null
          payment_account?: string | null
          phone?: string | null
          portfolio?: Json
          post_plan?: Json | null
          post_plan_month?: string | null
          previous_slugs?: string[]
          proposal_settings?: Json | null
          review_google_first?: boolean
          review_reward_description?: string | null
          review_reward_type?: string
          seo_description?: string | null
          seo_faqs?: Json | null
          seo_generated_at?: string | null
          seo_keywords?: string | null
          seo_keywords_edited_at?: string | null
          seo_stale_at?: string | null
          seo_title?: string | null
          service_areas?: string[]
          slug?: string | null
          strengths?: Json | null
          target_customer?: string
          testimonials?: Json | null
          topic_suggestions?: Json | null
          topic_suggestions_month?: string | null
          updated_at?: string
          youtube_url?: string | null
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
      claims: {
        Row: {
          assigned_worker_id: string | null
          booking_id: string | null
          business_id: string
          content: string | null
          created_at: string
          created_by_worker_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          is_urgent: boolean
          photo_urls: string[]
          resolution: string | null
          resolution_photo_urls: string[]
          resolved_at: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_worker_id?: string | null
          booking_id?: string | null
          business_id: string
          content?: string | null
          created_at?: string
          created_by_worker_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          is_urgent?: boolean
          photo_urls?: string[]
          resolution?: string | null
          resolution_photo_urls?: string[]
          resolved_at?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_worker_id?: string | null
          booking_id?: string | null
          business_id?: string
          content?: string | null
          created_at?: string
          created_by_worker_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          is_urgent?: boolean
          photo_urls?: string[]
          resolution?: string | null
          resolution_photo_urls?: string[]
          resolved_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_created_by_worker_id_fkey"
            columns: ["created_by_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          business_id: string
          channel: string | null
          checklist_items: Json | null
          contract_price: number
          created_at: string
          customer_id: string
          default_worker_id: string | null
          end_date: string | null
          expected_duration_minutes: number | null
          frequency: string
          id: string
          last_generated_until: string | null
          notes: string | null
          onboarding_report_pinged_at: string | null
          price_history: Json | null
          requires_lockup: boolean
          send_visit_reminder: boolean
          service_type: string
          skip_holidays: boolean
          start_date: string
          status: string
          updated_at: string
          visit_time: string | null
        }
        Insert: {
          business_id: string
          channel?: string | null
          checklist_items?: Json | null
          contract_price: number
          created_at?: string
          customer_id: string
          default_worker_id?: string | null
          end_date?: string | null
          expected_duration_minutes?: number | null
          frequency: string
          id?: string
          last_generated_until?: string | null
          notes?: string | null
          onboarding_report_pinged_at?: string | null
          price_history?: Json | null
          requires_lockup?: boolean
          send_visit_reminder?: boolean
          service_type: string
          skip_holidays?: boolean
          start_date: string
          status?: string
          updated_at?: string
          visit_time?: string | null
        }
        Update: {
          business_id?: string
          channel?: string | null
          checklist_items?: Json | null
          contract_price?: number
          created_at?: string
          customer_id?: string
          default_worker_id?: string | null
          end_date?: string | null
          expected_duration_minutes?: number | null
          frequency?: string
          id?: string
          last_generated_until?: string | null
          notes?: string | null
          onboarding_report_pinged_at?: string | null
          price_history?: Json | null
          requires_lockup?: boolean
          send_visit_reminder?: boolean
          service_type?: string
          skip_holidays?: boolean
          start_date?: string
          status?: string
          updated_at?: string
          visit_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_default_worker_id_fkey"
            columns: ["default_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rewards: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          customer_phone: string
          expires_at: string | null
          id: string
          issued_at: string
          reward_type: string
          reward_value: number
          source: string
          source_id: string | null
          used_at: string | null
          used_booking_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          customer_phone: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          reward_type: string
          reward_value: number
          source?: string
          source_id?: string | null
          used_at?: string | null
          used_booking_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          customer_phone?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          reward_type?: string
          reward_value?: number
          source?: string
          source_id?: string | null
          used_at?: string | null
          used_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_rewards_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rewards_used_booking_id_fkey"
            columns: ["used_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_id: string
          category: string | null
          created_at: string
          id: string
          lead_id: string | null
          name: string
          notes: string | null
          notify_on_my_way: boolean
          phone: string
          reengagement_sent_at: string | null
          sales_stage: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          category?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          name: string
          notes?: string | null
          notify_on_my_way?: boolean
          phone: string
          reengagement_sent_at?: string | null
          sales_stage?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          category?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          name?: string
          notes?: string | null
          notify_on_my_way?: boolean
          phone?: string
          reengagement_sent_at?: string | null
          sales_stage?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          entry_date: string
          id: string
          memo: string | null
          source: string
          source_key: string | null
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          category?: string
          created_at?: string
          entry_date: string
          id?: string
          memo?: string | null
          source?: string
          source_key?: string | null
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          memo?: string | null
          source?: string
          source_key?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_costs: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          id: string
          monthly_amount: number
          name: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          id?: string
          monthly_amount: number
          name: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          monthly_amount?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_checks: {
        Row: {
          business_id: string
          checked_at: string
          cited: number
          detail: Json
          engine: string
          id: string
          share_pct: number
          total: number
        }
        Insert: {
          business_id: string
          checked_at?: string
          cited: number
          detail?: Json
          engine?: string
          id?: string
          share_pct: number
          total: number
        }
        Update: {
          business_id?: string
          checked_at?: string
          cited?: number
          detail?: Json
          engine?: string
          id?: string
          share_pct?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "geo_checks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_questions: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          created_month: string | null
          id: string
          question: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          created_month?: string | null
          id?: string
          question: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          created_month?: string | null
          id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_questions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_expenses: {
        Row: {
          amount: number
          amount_krw: number
          category: string
          created_at: string
          currency: string
          id: string
          memo: string | null
          name: string
          spent_on: string
        }
        Insert: {
          amount: number
          amount_krw: number
          category: string
          created_at?: string
          currency?: string
          id?: string
          memo?: string | null
          name: string
          spent_on?: string
        }
        Update: {
          amount?: number
          amount_krw?: number
          category?: string
          created_at?: string
          currency?: string
          id?: string
          memo?: string | null
          name?: string
          spent_on?: string
        }
        Relationships: []
      }
      hq_settings: {
        Row: {
          cash_balance: number | null
          id: number
          updated_at: string
          usd_krw_rate: number
        }
        Insert: {
          cash_balance?: number | null
          id?: number
          updated_at?: string
          usd_krw_rate?: number
        }
        Update: {
          cash_balance?: number | null
          id?: number
          updated_at?: string
          usd_krw_rate?: number
        }
        Relationships: []
      }
      hq_subscriptions: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          currency: string
          cycle: string
          id: string
          memo: string | null
          name: string
          next_billing_date: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          category: string
          created_at?: string
          currency?: string
          cycle?: string
          id?: string
          memo?: string | null
          name: string
          next_billing_date?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          cycle?: string
          id?: string
          memo?: string | null
          name?: string
          next_billing_date?: string | null
        }
        Relationships: []
      }
      kcp_payment_orders: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          kcp_tno: string | null
          ordr_idxx: string
          paid_at: string | null
          plan_id: string
          status: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          kcp_tno?: string | null
          ordr_idxx: string
          paid_at?: string | null
          plan_id: string
          status?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          kcp_tno?: string | null
          ordr_idxx?: string
          paid_at?: string | null
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kcp_payment_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_at: string
          business_id: string
          content: string | null
          created_at: string
          id: string
          lead_id: string
          photos: Json
          transcript: string | null
          type: string
        }
        Insert: {
          activity_at?: string
          business_id: string
          content?: string | null
          created_at?: string
          id?: string
          lead_id: string
          photos?: Json
          transcript?: string | null
          type?: string
        }
        Update: {
          activity_at?: string
          business_id?: string
          content?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          photos?: Json
          transcript?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          business_id: string
          category: string | null
          channel: string | null
          company_name: string
          contact_name: string | null
          contact_title: string | null
          created_at: string
          customer_type: string
          email: string | null
          id: string
          monthly_budget: number | null
          next_follow_up_date: string | null
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          category?: string | null
          channel?: string | null
          company_name: string
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          customer_type?: string
          email?: string | null
          id?: string
          monthly_budget?: number | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          category?: string | null
          channel?: string | null
          company_name?: string
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          customer_type?: string
          email?: string | null
          id?: string
          monthly_budget?: number | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_consents: {
        Row: {
          business_id: string
          created_at: string
          id: string
          phone: string
          source: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          phone: string
          source?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          phone?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_optouts: {
        Row: {
          business_id: string
          created_at: string
          id: string
          phone: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          phone: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_optouts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_snapshots: {
        Row: {
          active_contracts: number
          captured_at: string
          contract_mrr: number
          data: Json
          mrr: number
          paying_businesses: number
          period: string
          realized_gmv: number
          total_businesses: number
          total_leads: number
        }
        Insert: {
          active_contracts?: number
          captured_at?: string
          contract_mrr?: number
          data?: Json
          mrr?: number
          paying_businesses?: number
          period: string
          realized_gmv?: number
          total_businesses?: number
          total_leads?: number
        }
        Update: {
          active_contracts?: number
          captured_at?: string
          contract_mrr?: number
          data?: Json
          mrr?: number
          paying_businesses?: number
          period?: string
          realized_gmv?: number
          total_businesses?: number
          total_leads?: number
        }
        Relationships: []
      }
      monthly_report_dispatches: {
        Row: {
          business_id: string
          charge_amount: number | null
          completed_visits: number
          created_at: string
          customer_id: string
          id: string
          period: string
          sent_at: string | null
          status: string
        }
        Insert: {
          business_id: string
          charge_amount?: number | null
          completed_visits?: number
          created_at?: string
          customer_id: string
          id?: string
          period: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          charge_amount?: number | null
          completed_visits?: number
          created_at?: string
          customer_id?: string
          id?: string
          period?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_report_dispatches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_report_dispatches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_reports: {
        Row: {
          alimtalk_sent_at: string | null
          before_note: string | null
          business_id: string
          contract_id: string | null
          created_at: string
          customer_id: string
          id: string
          items: Json
          management_note: string | null
          public_token: string
          shared_at: string | null
          spec_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          alimtalk_sent_at?: string | null
          before_note?: string | null
          business_id: string
          contract_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          items?: Json
          management_note?: string | null
          public_token?: string
          shared_at?: string | null
          spec_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          alimtalk_sent_at?: string | null
          before_note?: string | null
          business_id?: string
          contract_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          items?: Json
          management_note?: string | null
          public_token?: string
          shared_at?: string | null
          spec_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_reports_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_lessons: {
        Row: {
          created_at: string
          description: string | null
          duration_label: string | null
          id: string
          is_free: boolean
          published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          vimeo_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          is_free?: boolean
          published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          vimeo_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          is_free?: boolean
          published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          vimeo_id?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          business_id: string
          channel: string | null
          id: string
          page_type: string
          source: string
          viewed_at: string
        }
        Insert: {
          business_id: string
          channel?: string | null
          id?: string
          page_type: string
          source?: string
          viewed_at?: string
        }
        Update: {
          business_id?: string
          channel?: string | null
          id?: string
          page_type?: string
          source?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_views_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_funnel_events: {
        Row: {
          amount: number | null
          booking_id: string | null
          business_id: string | null
          created_at: string
          event_type: string
          id: string
          installment_months: number | null
          meta: Json
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          installment_months?: number | null
          meta?: Json
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          installment_months?: number | null
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payment_funnel_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          business_id: string
          id: string
          post_id: string
          source: string
          viewed_at: string
        }
        Insert: {
          business_id: string
          id?: string
          post_id: string
          source?: string
          viewed_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          post_id?: string
          source?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "biz_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_registrations: {
        Row: {
          contacted: boolean
          created_at: string
          id: string
          name: string
          owner_status: string
          phone: string
          source: string | null
        }
        Insert: {
          contacted?: boolean
          created_at?: string
          id?: string
          name: string
          owner_status: string
          phone: string
          source?: string | null
        }
        Update: {
          contacted?: boolean
          created_at?: string
          id?: string
          name?: string
          owner_status?: string
          phone?: string
          source?: string | null
        }
        Relationships: []
      }
      pricing_benchmarks: {
        Row: {
          all_arpu: number | null
          all_better_uplift_pct: number | null
          computed_at: string
          id: string
          sample_biz: number
          top_arpu: number | null
          top_best_uplift_pct: number | null
          top_better_uplift_pct: number | null
          top_biz: number
          top_items: Json
        }
        Insert: {
          all_arpu?: number | null
          all_better_uplift_pct?: number | null
          computed_at?: string
          id?: string
          sample_biz?: number
          top_arpu?: number | null
          top_best_uplift_pct?: number | null
          top_better_uplift_pct?: number | null
          top_biz?: number
          top_items?: Json
        }
        Update: {
          all_arpu?: number | null
          all_better_uplift_pct?: number | null
          computed_at?: string
          id?: string
          sample_biz?: number
          top_arpu?: number | null
          top_best_uplift_pct?: number | null
          top_better_uplift_pct?: number | null
          top_biz?: number
          top_items?: Json
        }
        Relationships: []
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
      prospects_directory: {
        Row: {
          addr_jibun: string | null
          addr_road: string | null
          branch: string | null
          building: string | null
          cat_major: string | null
          cat_mid: string | null
          cat_sub: string | null
          dong: string | null
          id: number
          lat: number | null
          lng: number | null
          name: string
          sido: string | null
          sigungu: string | null
          store_id: string | null
          target: string | null
          updated_at: string
        }
        Insert: {
          addr_jibun?: string | null
          addr_road?: string | null
          branch?: string | null
          building?: string | null
          cat_major?: string | null
          cat_mid?: string | null
          cat_sub?: string | null
          dong?: string | null
          id?: never
          lat?: number | null
          lng?: number | null
          name: string
          sido?: string | null
          sigungu?: string | null
          store_id?: string | null
          target?: string | null
          updated_at?: string
        }
        Update: {
          addr_jibun?: string | null
          addr_road?: string | null
          branch?: string | null
          building?: string | null
          cat_major?: string | null
          cat_mid?: string | null
          cat_sub?: string | null
          dong?: string | null
          id?: never
          lat?: number | null
          lng?: number | null
          name?: string
          sido?: string | null
          sigungu?: string | null
          store_id?: string | null
          target?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          business_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          auth: string
          business_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          auth?: string
          business_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_autofill_logs: {
        Row: {
          business_id: string
          created_at: string
          extracted: Json
          id: string
          lead_id: string | null
          quote_id: string | null
          saved: Json | null
          saved_at: string | null
          source_chars: number | null
        }
        Insert: {
          business_id: string
          created_at?: string
          extracted: Json
          id?: string
          lead_id?: string | null
          quote_id?: string | null
          saved?: Json | null
          saved_at?: string | null
          source_chars?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string
          extracted?: Json
          id?: string
          lead_id?: string | null
          quote_id?: string | null
          saved?: Json | null
          saved_at?: string | null
          source_chars?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_autofill_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_funnel_events: {
        Row: {
          business_id: string
          channel: string | null
          created_at: string
          event_type: string
          id: string
          meta: Json
          session_id: string
          step: string | null
        }
        Insert: {
          business_id: string
          channel?: string | null
          created_at?: string
          event_type: string
          id?: string
          meta?: Json
          session_id: string
          step?: string | null
        }
        Update: {
          business_id?: string
          channel?: string | null
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json
          session_id?: string
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_funnel_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          ai_pitch: Json | null
          best_price: number | null
          better_price: number | null
          business_id: string
          channel: string | null
          cleaning_type: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          expires_at: string
          extra_notes: string | null
          followup_sent_at: string | null
          followup2_sent_at: string | null
          good_price: number | null
          id: string
          is_test: boolean
          preferred_date: string | null
          space_size: number | null
          status: string
          updated_at: string
          utm_source: string | null
          view_alert_sent_at: string | null
        }
        Insert: {
          ai_pitch?: Json | null
          best_price?: number | null
          better_price?: number | null
          business_id: string
          channel?: string | null
          cleaning_type?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string
          extra_notes?: string | null
          followup_sent_at?: string | null
          followup2_sent_at?: string | null
          good_price?: number | null
          id?: string
          is_test?: boolean
          preferred_date?: string | null
          space_size?: number | null
          status?: string
          updated_at?: string
          utm_source?: string | null
          view_alert_sent_at?: string | null
        }
        Update: {
          ai_pitch?: Json | null
          best_price?: number | null
          better_price?: number | null
          business_id?: string
          channel?: string | null
          cleaning_type?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string
          extra_notes?: string | null
          followup_sent_at?: string | null
          followup2_sent_at?: string | null
          good_price?: number | null
          id?: string
          is_test?: boolean
          preferred_date?: string | null
          space_size?: number | null
          status?: string
          updated_at?: string
          utm_source?: string | null
          view_alert_sent_at?: string | null
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
      rate_limits: {
        Row: {
          count: number
          key: string
          reset_at: string
        }
        Insert: {
          count?: number
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      reel_charges: {
        Row: {
          amount: number
          billed_at: string | null
          billed_order_id: string | null
          business_id: string
          created_at: string
          id: string
          report_id: string
        }
        Insert: {
          amount?: number
          billed_at?: string | null
          billed_order_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          report_id: string
        }
        Update: {
          amount?: number
          billed_at?: string | null
          billed_order_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_charges_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_charges_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reengagement_dispatches: {
        Row: {
          approved_at: string | null
          business_id: string
          channel: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          due_at: string | null
          fail_reason: string | null
          id: string
          last_booking_id: string | null
          last_service: string | null
          last_serviced_at: string | null
          message: string
          months_since: number | null
          notified_at: string | null
          reason: string | null
          report_id: string | null
          sent_at: string | null
          service_name: string | null
          source: string
          status: string
          worker_id: string | null
        }
        Insert: {
          approved_at?: string | null
          business_id: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          due_at?: string | null
          fail_reason?: string | null
          id?: string
          last_booking_id?: string | null
          last_service?: string | null
          last_serviced_at?: string | null
          message: string
          months_since?: number | null
          notified_at?: string | null
          reason?: string | null
          report_id?: string | null
          sent_at?: string | null
          service_name?: string | null
          source?: string
          status?: string
          worker_id?: string | null
        }
        Update: {
          approved_at?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          due_at?: string | null
          fail_reason?: string | null
          id?: string
          last_booking_id?: string | null
          last_service?: string | null
          last_serviced_at?: string | null
          message?: string
          months_since?: number | null
          notified_at?: string | null
          reason?: string | null
          report_id?: string | null
          sent_at?: string | null
          service_name?: string | null
          source?: string
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_dispatches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_dispatches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_dispatches_last_booking_id_fkey"
            columns: ["last_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_dispatches_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_dispatches_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
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
          ai_report_data: Json | null
          booking_id: string
          business_id: string
          care_advice: string | null
          care_due_at: string | null
          care_notified_at: string | null
          created_at: string
          id: string
          is_public: boolean
          kakao_sent_at: string | null
          notes: string | null
          preventive_note: string | null
          reel_error: string | null
          reel_queued_at: string | null
          reel_render_id: string | null
          reel_status: string
          reel_url: string | null
          review_request_sent_at: string | null
          updated_at: string
          work_clip_durations: number[] | null
          work_clip_urls: string[] | null
        }
        Insert: {
          ai_report_data?: Json | null
          booking_id: string
          business_id: string
          care_advice?: string | null
          care_due_at?: string | null
          care_notified_at?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kakao_sent_at?: string | null
          notes?: string | null
          preventive_note?: string | null
          reel_error?: string | null
          reel_queued_at?: string | null
          reel_render_id?: string | null
          reel_status?: string
          reel_url?: string | null
          review_request_sent_at?: string | null
          updated_at?: string
          work_clip_durations?: number[] | null
          work_clip_urls?: string[] | null
        }
        Update: {
          ai_report_data?: Json | null
          booking_id?: string
          business_id?: string
          care_advice?: string | null
          care_due_at?: string | null
          care_notified_at?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kakao_sent_at?: string | null
          notes?: string | null
          preventive_note?: string | null
          reel_error?: string | null
          reel_queued_at?: string | null
          reel_render_id?: string | null
          reel_status?: string
          reel_url?: string | null
          review_request_sent_at?: string | null
          updated_at?: string
          work_clip_durations?: number[] | null
          work_clip_urls?: string[] | null
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
      review_claims: {
        Row: {
          booking_id: string
          business_id: string
          claimed_at: string | null
          clicked_at: string | null
          customer_phone: string
          id: string
          is_followup: boolean
          platform: string | null
          reward_sent_at: string | null
          sent_at: string
          token: string
          worker_id: string | null
        }
        Insert: {
          booking_id: string
          business_id: string
          claimed_at?: string | null
          clicked_at?: string | null
          customer_phone: string
          id?: string
          is_followup?: boolean
          platform?: string | null
          reward_sent_at?: string | null
          sent_at?: string
          token: string
          worker_id?: string | null
        }
        Update: {
          booking_id?: string
          business_id?: string
          claimed_at?: string | null
          clicked_at?: string | null
          customer_phone?: string
          id?: string
          is_followup?: boolean
          platform?: string | null
          reward_sent_at?: string | null
          sent_at?: string
          token?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_claims_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_claims_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string | null
          business_id: string
          claim_id: string | null
          comment: string | null
          created_at: string
          customer_name: string | null
          id: string
          is_public: boolean
          rating: number
          routed_to: string | null
        }
        Insert: {
          booking_id?: string | null
          business_id: string
          claim_id?: string | null
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          is_public?: boolean
          rating: number
          routed_to?: string | null
        }
        Update: {
          booking_id?: string | null
          business_id?: string
          claim_id?: string | null
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          is_public?: boolean
          rating?: number
          routed_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "review_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          ac_type_prices: Json | null
          base_price: number
          business_id: string
          category: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          photos: string[] | null
          show_in_quote: boolean
          sort_order: number
          tier_best_discount_amount: number
          tier_best_discount_rate: number
          tier_best_items: string[] | null
          tier_best_price: number | null
          tier_better_discount_amount: number
          tier_better_discount_rate: number
          tier_better_items: string[] | null
          tier_better_price: number | null
          tier_good_discount_amount: number
          tier_good_discount_rate: number
          tier_good_items: string[] | null
          tier_good_price: number | null
          unit: string
          unit_prices: Json | null
          unit_variants: Json | null
          updated_at: string
          volume_tiers: Json | null
        }
        Insert: {
          ac_type_prices?: Json | null
          base_price?: number
          business_id: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          photos?: string[] | null
          show_in_quote?: boolean
          sort_order?: number
          tier_best_discount_amount?: number
          tier_best_discount_rate?: number
          tier_best_items?: string[] | null
          tier_best_price?: number | null
          tier_better_discount_amount?: number
          tier_better_discount_rate?: number
          tier_better_items?: string[] | null
          tier_better_price?: number | null
          tier_good_discount_amount?: number
          tier_good_discount_rate?: number
          tier_good_items?: string[] | null
          tier_good_price?: number | null
          unit?: string
          unit_prices?: Json | null
          unit_variants?: Json | null
          updated_at?: string
          volume_tiers?: Json | null
        }
        Update: {
          ac_type_prices?: Json | null
          base_price?: number
          business_id?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          photos?: string[] | null
          show_in_quote?: boolean
          sort_order?: number
          tier_best_discount_amount?: number
          tier_best_discount_rate?: number
          tier_best_items?: string[] | null
          tier_best_price?: number | null
          tier_better_discount_amount?: number
          tier_better_discount_rate?: number
          tier_better_items?: string[] | null
          tier_better_price?: number | null
          tier_good_discount_amount?: number
          tier_good_discount_rate?: number
          tier_good_items?: string[] | null
          tier_good_price?: number | null
          unit?: string
          unit_prices?: Json | null
          unit_variants?: Json | null
          updated_at?: string
          volume_tiers?: Json | null
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
          billing_key: string | null
          business_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          next_plan: string | null
          payment_id: string | null
          plan: string
          status: string
          toss_order_id: string | null
          toss_payment_key: string | null
          updated_at: string
        }
        Insert: {
          billing_key?: string | null
          business_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          next_plan?: string | null
          payment_id?: string | null
          plan?: string
          status?: string
          toss_order_id?: string | null
          toss_payment_key?: string | null
          updated_at?: string
        }
        Update: {
          billing_key?: string | null
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          next_plan?: string | null
          payment_id?: string | null
          plan?: string
          status?: string
          toss_order_id?: string | null
          toss_payment_key?: string | null
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
      workers: {
        Row: {
          business_id: string
          color: string
          contract_data: Json | null
          contract_signed_at: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          pay_rate: number | null
          pay_type: string | null
          phone: string | null
          type: string
        }
        Insert: {
          business_id: string
          color?: string
          contract_data?: Json | null
          contract_signed_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pay_rate?: number | null
          pay_type?: string | null
          phone?: string | null
          type?: string
        }
        Update: {
          business_id?: string
          color?: string
          contract_data?: Json | null
          contract_signed_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pay_rate?: number | null
          pay_type?: string | null
          phone?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_business_id_fkey"
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
      assign_beta_number: {
        Args: { p_business_id: string; p_cap: number; p_rate: number }
        Returns: number
      }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_sec: number }
        Returns: boolean
      }
      get_leads_for_pipeline: {
        Args: { p_business_id: string }
        Returns: {
          address: string
          company_name: string
          contact_name: string
          contact_title: string
          created_at: string
          customer_type: string
          email: string
          id: string
          monthly_budget: number
          next_follow_up_date: string
          notes: string
          phone: string
          status: string
        }[]
      }
      get_my_business_id: { Args: never; Returns: string }
      insert_lead: {
        Args: {
          p_address?: string
          p_business_id: string
          p_company_name: string
          p_contact_name?: string
          p_contact_title?: string
          p_email?: string
          p_monthly_budget?: number
          p_next_follow_up_date?: string
          p_notes?: string
          p_phone?: string
        }
        Returns: string
      }
      prospect_search: {
        Args: {
          p_limit?: number
          p_sido: string
          p_sigungu: string
          p_target: string
        }
        Returns: {
          address: string
          lat: number
          lng: number
          name: string
        }[]
      }
      prospect_sido_list: {
        Args: never
        Returns: {
          cnt: number
          sido: string
        }[]
      }
      prospect_sigungu_list: {
        Args: { p_sido: string }
        Returns: {
          cnt: number
          sigungu: string
        }[]
      }
      record_ai_crawler_hit: {
        Args: { p_bot: string; p_business_id: string; p_date: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_lead: {
        Args: {
          p_address?: string
          p_business_id: string
          p_company_name: string
          p_contact_name?: string
          p_contact_title?: string
          p_email?: string
          p_id: string
          p_monthly_budget?: number
          p_next_follow_up_date?: string
          p_notes?: string
          p_phone?: string
        }
        Returns: undefined
      }
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
  public: {
    Enums: {},
  },
} as const
