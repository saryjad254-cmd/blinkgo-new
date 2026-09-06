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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string | null
          device_info: string | null
          expires_at: string
          id: string
          ip_address: string | null
          is_revoked: boolean | null
          last_used_at: string | null
          refresh_token_hash: string
          revoked_at: string | null
          revoked_reason: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          is_revoked?: boolean | null
          last_used_at?: string | null
          refresh_token_hash: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_revoked?: boolean | null
          last_used_at?: string | null
          refresh_token_hash?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          apartment: string | null
          building: string | null
          city: string | null
          created_at: string | null
          floor: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          label: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          street: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apartment?: string | null
          building?: string | null
          city?: string | null
          created_at?: string | null
          floor?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          street: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apartment?: string | null
          building?: string | null
          city?: string | null
          created_at?: string | null
          floor?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          street?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_action_log: {
        Row: {
          action: string
          admin_email: string | null
          admin_user_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: number
          ip: unknown
          reason: string | null
          request_id: string | null
          resolution_notes: string | null
          resource_id: string
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_user_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: number
          ip?: unknown
          reason?: string | null
          request_id?: string | null
          resolution_notes?: string | null
          resource_id: string
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_user_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: number
          ip?: unknown
          reason?: string | null
          request_id?: string | null
          resolution_notes?: string | null
          resource_id?: string
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_name: string | null
          actor_role: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: []
      }
      admin_daily_reset_log: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          orders_reset: number | null
          reset_by: string | null
          reset_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          orders_reset?: number | null
          reset_by?: string | null
          reset_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          orders_reset?: number | null
          reset_by?: string | null
          reset_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_daily_reset_log_reset_by_fkey"
            columns: ["reset_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          severity: string
          source: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          severity?: string
          source?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          severity?: string
          source?: string
          title?: string
        }
        Relationships: []
      }
      api_audit_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          id: string
          ip_address: string | null
          method: string | null
          path: string | null
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          method?: string | null
          path?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          method?: string | null
          path?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string | null
          actor_email: string | null
          actor_id: string | null
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          resource: string | null
          resource_id: string | null
          severity: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action?: string | null
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          severity?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string | null
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          severity?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          duration_ms: number
          error: string | null
          executed_actions: string[]
          executed_at: string
          id: string
          rule_id: string | null
          rule_name: string
          triggered: boolean
        }
        Insert: {
          duration_ms?: number
          error?: string | null
          executed_actions?: string[]
          executed_at?: string
          id?: string
          rule_id?: string | null
          rule_name: string
          triggered?: boolean
        }
        Update: {
          duration_ms?: number
          error?: string | null
          executed_actions?: string[]
          executed_at?: string
          id?: string
          rule_id?: string | null
          rule_name?: string
          triggered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          aggregate: Json | null
          conditions: Json
          cooldown_minutes: number | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          max_executions_per_hour: number | null
          name: string
          time_window_minutes: number | null
          trigger: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          aggregate?: Json | null
          conditions?: Json
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          max_executions_per_hour?: number | null
          name: string
          time_window_minutes?: number | null
          trigger: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          aggregate?: Json | null
          conditions?: Json
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          max_executions_per_hour?: number | null
          name?: string
          time_window_minutes?: number | null
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          badge_name: string | null
          badge_type: string
          description: string | null
          earned_at: string | null
          icon: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_name?: string | null
          badge_type: string
          description?: string | null
          earned_at?: string | null
          icon?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_name?: string | null
          badge_type?: string
          description?: string | null
          earned_at?: string | null
          icon?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          extra_ids: string[]
          id: string
          notes: string | null
          product_id: string
          quantity: number
          restaurant_id: string | null
          updated_at: string
          user_id: string
          variant_ids: string[]
        }
        Insert: {
          created_at?: string
          extra_ids?: string[]
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          restaurant_id?: string | null
          updated_at?: string
          user_id: string
          variant_ids?: string[]
        }
        Update: {
          created_at?: string
          extra_ids?: string[]
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          restaurant_id?: string | null
          updated_at?: string
          user_id?: string
          variant_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          restaurant_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          restaurant_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          restaurant_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          receiver_id: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          receiver_id?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          receiver_id?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          action: string
          categories: Json
          consent_version: string
          created_at: string
          id: string
          source: string
        }
        Insert: {
          action: string
          categories: Json
          consent_version: string
          created_at?: string
          id: string
          source?: string
        }
        Update: {
          action?: string
          categories?: Json
          consent_version?: string
          created_at?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          created_at: string
          customer_id: string
          discount_amount: number
          id: string
          order_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_id: string
          discount_amount?: number
          id?: string
          order_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_id?: string
          discount_amount?: number
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          current_uses: number | null
          deleted_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean | null
          max_discount: number | null
          max_uses: number | null
          metadata: Json | null
          min_order: number | null
          min_order_amount: number | null
          name: string | null
          restaurant_id: string | null
          start_date: string | null
          type: string | null
          updated_at: string
          usage_count: number | null
          usage_limit: number | null
          user_limit: number | null
          valid_from: string | null
          valid_until: string | null
          value: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          current_uses?: number | null
          deleted_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          metadata?: Json | null
          min_order?: number | null
          min_order_amount?: number | null
          name?: string | null
          restaurant_id?: string | null
          start_date?: string | null
          type?: string | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          user_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
          value?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          current_uses?: number | null
          deleted_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          metadata?: Json | null
          min_order?: number | null
          min_order_amount?: number | null
          name?: string | null
          restaurant_id?: string | null
          start_date?: string | null
          type?: string | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          user_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: string
          created_at: string | null
          customer_id: string
          details: string | null
          id: string
          is_default: boolean | null
          label: string | null
          latitude: number
          longitude: number
        }
        Insert: {
          address: string
          created_at?: string | null
          customer_id: string
          details?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude: number
          longitude: number
        }
        Update: {
          address?: string
          created_at?: string | null
          customer_id?: string
          details?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude?: number
          longitude?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          created_at: string | null
          id: string
          reward_amount: number | null
          streak: number | null
          user_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string | null
          id?: string
          reward_amount?: number | null
          streak?: number | null
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string | null
          id?: string
          reward_amount?: number | null
          streak?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_stats: {
        Row: {
          cancelled_orders: number | null
          created_at: string
          date: string
          delivered_orders: number | null
          id: string
          total_commission: number | null
          total_delivery_fees: number | null
          total_orders: number | null
          total_revenue: number | null
        }
        Insert: {
          cancelled_orders?: number | null
          created_at?: string
          date: string
          delivered_orders?: number | null
          id?: string
          total_commission?: number | null
          total_delivery_fees?: number | null
          total_orders?: number | null
          total_revenue?: number | null
        }
        Update: {
          cancelled_orders?: number | null
          created_at?: string
          date?: string
          delivered_orders?: number | null
          id?: string
          total_commission?: number | null
          total_delivery_fees?: number | null
          total_orders?: number | null
          total_revenue?: number | null
        }
        Relationships: []
      }
      data_subject_requests: {
        Row: {
          account_email: string | null
          created_at: string
          details: string | null
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          ip: string | null
          name: string
          status: string
          type: string
          user_agent: string | null
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          details?: string | null
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id: string
          ip?: string | null
          name: string
          status?: string
          type: string
          user_agent?: string | null
        }
        Update: {
          account_email?: string | null
          created_at?: string
          details?: string | null
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip?: string | null
          name?: string
          status?: string
          type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_proofs: {
        Row: {
          delivered_at: string
          driver_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          photo_url: string | null
          signature: string | null
        }
        Insert: {
          delivered_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          photo_url?: string | null
          signature?: string | null
        }
        Update: {
          delivered_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          photo_url?: string | null
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          created_at: string
          delivery_fee: number
          description: string | null
          id: string
          is_active: boolean
          min_order_amount: number | null
          name: string
          polygon: Json
          priority: number
          radius_km: number | null
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          delivery_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number | null
          name: string
          polygon: Json
          priority?: number
          radius_km?: number | null
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          delivery_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number | null
          name?: string
          polygon?: Json
          priority?: number
          radius_km?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          document_number: string | null
          document_type: string
          document_url: string
          driver_id: string
          expires_at: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submission_kind: string
          uploaded_at: string
        }
        Insert: {
          document_number?: string | null
          document_type: string
          document_url: string
          driver_id: string
          expires_at?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_kind?: string
          uploaded_at?: string
        }
        Update: {
          document_number?: string | null
          document_type?: string
          document_url?: string
          driver_id?: string
          expires_at?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_kind?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_earnings: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          delivery_fee_cents: number
          driver_id: string
          earned_at: string
          id: string
          metadata: Json
          order_id: string
          tip_cents: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          delivery_fee_cents?: number
          driver_id: string
          earned_at?: string
          id?: string
          metadata?: Json
          order_id: string
          tip_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          delivery_fee_cents?: number
          driver_id?: string
          earned_at?: string
          id?: string
          metadata?: Json
          order_id?: string
          tip_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          driver_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
        }
        Insert: {
          driver_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
        }
        Update: {
          driver_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
        }
        Relationships: []
      }
      driver_payouts: {
        Row: {
          created_at: string | null
          driver_id: string
          id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: string | null
          total_base: number | null
          total_orders: number | null
          total_payout: number | null
          total_tips: number | null
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          id?: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string | null
          total_base?: number | null
          total_orders?: number | null
          total_payout?: number | null
          total_tips?: number | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          total_base?: number | null
          total_orders?: number | null
          total_payout?: number | null
          total_tips?: number | null
        }
        Relationships: []
      }
      driver_status: {
        Row: {
          accuracy: number | null
          active_order_id: string | null
          bearing: number | null
          current_lat: number | null
          current_lng: number | null
          current_order_id: string | null
          driver_id: string
          heading: number | null
          is_active: boolean
          is_on_delivery: boolean
          is_online: boolean
          last_location_at: string | null
          last_location_lat: number | null
          last_location_lng: number | null
          last_seen: string | null
          latitude: number | null
          longitude: number | null
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          active_order_id?: string | null
          bearing?: number | null
          current_lat?: number | null
          current_lng?: number | null
          current_order_id?: string | null
          driver_id: string
          heading?: number | null
          is_active?: boolean
          is_on_delivery?: boolean
          is_online?: boolean
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          active_order_id?: string | null
          bearing?: number | null
          current_lat?: number | null
          current_lng?: number | null
          current_order_id?: string | null
          driver_id?: string
          heading?: number | null
          is_active?: boolean
          is_on_delivery?: boolean
          is_online?: boolean
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_status_active_order_id_fkey"
            columns: ["active_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_status_current_order_id_fkey"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_status_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_working_hours: {
        Row: {
          created_at: string
          day_of_week: number
          driver_id: string
          end_time: string
          id: string
          is_enabled: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          driver_id: string
          end_time: string
          id?: string
          is_enabled?: boolean
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          driver_id?: string
          end_time?: string
          id?: string
          is_enabled?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          city: string | null
          created_at: string | null
          current_lat: number | null
          current_latitude: number | null
          current_lng: number | null
          current_longitude: number | null
          full_name: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          is_available: boolean | null
          is_online: boolean | null
          last_active_at: string | null
          last_location_update: string | null
          last_seen_at: string | null
          license_number: string | null
          metadata: Json | null
          rating: number | null
          status: string | null
          total_deliveries: number
          total_earnings: number | null
          total_trips: number | null
          updated_at: string | null
          user_id: string | null
          vehicle_plate: string | null
          vehicle_type: string | null
          zone_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          current_lat?: number | null
          current_latitude?: number | null
          current_lng?: number | null
          current_longitude?: number | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_approved?: boolean
          is_available?: boolean | null
          is_online?: boolean | null
          last_active_at?: string | null
          last_location_update?: string | null
          last_seen_at?: string | null
          license_number?: string | null
          metadata?: Json | null
          rating?: number | null
          status?: string | null
          total_deliveries?: number
          total_earnings?: number | null
          total_trips?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
          zone_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          current_lat?: number | null
          current_latitude?: number | null
          current_lng?: number | null
          current_longitude?: number | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          is_available?: boolean | null
          is_online?: boolean | null
          last_active_at?: string | null
          last_location_update?: string | null
          last_seen_at?: string | null
          license_number?: string | null
          metadata?: Json | null
          rating?: number | null
          status?: string | null
          total_deliveries?: number
          total_earnings?: number | null
          total_trips?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_otps: {
        Row: {
          code_hash: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          purpose: string
          used_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          ip_address?: string | null
          purpose: string
          used_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          purpose?: string
          used_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      expansion_requests: {
        Row: {
          address: string
          city: string
          created_at: string
          distance_km: number | null
          email: string | null
          id: string
          lat: number
          lng: number
          name: string | null
          notes: string | null
          postal_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          distance_km?: number | null
          email?: string | null
          id?: string
          lat: number
          lng: number
          name?: string | null
          notes?: string | null
          postal_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          distance_km?: number | null
          email?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string | null
          notes?: string | null
          postal_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          created_at: string
          expires_at: string
          query: string
          query_hash: string
          result: Json
          source: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          query: string
          query_hash: string
          result: Json
          source: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          query?: string
          query_hash?: string
          result?: Json
          source?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          key: string
          response_body: Json | null
          response_status: number | null
          scope: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          key: string
          response_body?: Json | null
          response_status?: number | null
          scope: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          key?: string
          response_body?: Json | null
          response_status?: number | null
          scope?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          completed_at: string
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          job_id: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at: string
          created_at?: string
          duration_ms: number
          error?: string | null
          id?: string
          job_id: string
          result?: Json | null
          started_at: string
          status: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          job_id?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          avg_duration_ms: number | null
          created_at: string
          description: string | null
          enabled: boolean
          failure_count: number
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          payload: Json
          run_count: number
          schedule: string
          updated_at: string
        }
        Insert: {
          avg_duration_ms?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          failure_count?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          payload?: Json
          run_count?: number
          schedule: string
          updated_at?: string
        }
        Update: {
          avg_duration_ms?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          failure_count?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          payload?: Json
          run_count?: number
          schedule?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          created_at: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          created_at?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          created_at?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      loyalty_config: {
        Row: {
          earn_rate_eur_per_point: number
          enabled: boolean
          id: string
          min_redeem_points: number
          program_name: string
          redeem_rate_points_per_eur: number
          terms_url: string
          updated_at: string
        }
        Insert: {
          earn_rate_eur_per_point?: number
          enabled?: boolean
          id: string
          min_redeem_points?: number
          program_name?: string
          redeem_rate_points_per_eur?: number
          terms_url?: string
          updated_at?: string
        }
        Update: {
          earn_rate_eur_per_point?: number
          enabled?: boolean
          id?: string
          min_redeem_points?: number
          program_name?: string
          redeem_rate_points_per_eur?: number
          terms_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_points: {
        Row: {
          balance: number
          created_at: string
          id: string
          tier: string
          total_earned: number
          total_redeemed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          tier?: string
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          tier?: string
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      magic_link_tokens: {
        Row: {
          created_at: string | null
          created_ip: string | null
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_ip?: string | null
          email: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_ip?: string | null
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      manual_recovery_queue: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          draft_id: string
          id: number
          payment_intent_id: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_id: string
          draft_id: string
          id?: number
          payment_intent_id: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string
          draft_id?: string
          id?: number
          payment_intent_id?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      notification_delivery_log: {
        Row: {
          attempted_at: string
          channel: string
          error: string | null
          id: string
          notification_id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          channel: string
          error?: string | null
          id?: string
          notification_id: string
          success: boolean
        }
        Update: {
          attempted_at?: string
          channel?: string
          error?: string | null
          id?: string
          notification_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "v_unacked_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          delivery_updates: boolean
          email_enabled: boolean
          in_app_enabled: boolean
          new_features: boolean
          order_updates: boolean
          payouts: boolean
          promotions: boolean
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reviews: boolean
          sms_enabled: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_updates?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          new_features?: boolean
          order_updates?: boolean
          payouts?: boolean
          promotions?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reviews?: boolean
          sms_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_updates?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          new_features?: boolean
          order_updates?: boolean
          payouts?: boolean
          promotions?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reviews?: boolean
          sms_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          image_url: string | null
          is_read: boolean | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          image_url?: string | null
          is_read?: boolean | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          image_url?: string | null
          is_read?: boolean | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_drafts: {
        Row: {
          confirmed_by: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          draft: Json
          environment: string | null
          expected_currency: string
          expires_at: string
          id: string
          last_payment_event_at: string | null
          last_payment_event_id: string | null
          last_payment_event_type: string | null
          livemode: boolean | null
          order_creation_attempts: number
          payment_intent_id: string | null
          payment_status: string
          restaurant_id: string
          signature: string
          total_cents: number | null
          total_hash: string | null
          updated_at: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          draft: Json
          environment?: string | null
          expected_currency?: string
          expires_at: string
          id: string
          last_payment_event_at?: string | null
          last_payment_event_id?: string | null
          last_payment_event_type?: string | null
          livemode?: boolean | null
          order_creation_attempts?: number
          payment_intent_id?: string | null
          payment_status?: string
          restaurant_id: string
          signature: string
          total_cents?: number | null
          total_hash?: string | null
          updated_at?: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          draft?: Json
          environment?: string | null
          expected_currency?: string
          expires_at?: string
          id?: string
          last_payment_event_at?: string | null
          last_payment_event_id?: string | null
          last_payment_event_type?: string | null
          livemode?: boolean | null
          order_creation_attempts?: number
          payment_intent_id?: string | null
          payment_status?: string
          restaurant_id?: string
          signature?: string
          total_cents?: number | null
          total_hash?: string | null
          updated_at?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category: string | null
          created_at: string
          extra_ids: string[]
          id: string
          name: string | null
          notes: string | null
          order_id: string
          price: number | null
          product_id: string | null
          product_name: string
          product_price: number
          quantity: number
          subtotal: number
          unit_price: number | null
          variant_ids: string[]
        }
        Insert: {
          category?: string | null
          created_at?: string
          extra_ids?: string[]
          id?: string
          name?: string | null
          notes?: string | null
          order_id: string
          price?: number | null
          product_id?: string | null
          product_name: string
          product_price: number
          quantity?: number
          subtotal: number
          unit_price?: number | null
          variant_ids?: string[]
        }
        Update: {
          category?: string | null
          created_at?: string
          extra_ids?: string[]
          id?: string
          name?: string | null
          notes?: string | null
          order_id?: string
          price?: number | null
          product_id?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          subtotal?: number
          unit_price?: number | null
          variant_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_modifications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          delta: number | null
          details: Json
          id: string
          modification_type: string
          modified_by: string
          new_total: number | null
          order_id: string
          previous_total: number | null
          rejection_reason: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delta?: number | null
          details: Json
          id?: string
          modification_type: string
          modified_by: string
          new_total?: number | null
          order_id: string
          previous_total?: number | null
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delta?: number | null
          details?: Json
          id?: string
          modification_type?: string
          modified_by?: string
          new_total?: number | null
          order_id?: string
          previous_total?: number | null
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_modifications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_modifications_modified_by_fkey"
            columns: ["modified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_modifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reassignments: {
        Row: {
          created_at: string | null
          from_driver_id: string | null
          id: string
          order_id: string
          reason: string | null
          reassigned_by: string
          to_driver_id: string
        }
        Insert: {
          created_at?: string | null
          from_driver_id?: string | null
          id?: string
          order_id: string
          reason?: string | null
          reassigned_by: string
          to_driver_id: string
        }
        Update: {
          created_at?: string | null
          from_driver_id?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          reassigned_by?: string
          to_driver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_reassignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string | null
          created_at: string | null
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_tracking_events: {
        Row: {
          created_at: string | null
          driver_id: string | null
          event_type: string
          id: string
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          order_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id?: string | null
          event_type: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          order_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string | null
          event_type?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          order_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_tracking_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_tracking_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          amount_refunded_cents: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string | null
          currency: string
          customer_geocoded_at: string | null
          customer_id: string
          customer_latitude: number | null
          customer_longitude: number | null
          customer_notes: string | null
          delivered_at: string | null
          delivery_address: Json
          delivery_fee: number | null
          delivery_instructions: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          discount: number | null
          driver_accuracy: number | null
          driver_id: string | null
          driver_speed: number | null
          estimated_delivery: string | null
          estimated_ready_at: string | null
          id: string
          items: Json
          last_location_update: string | null
          last_refund_at: string | null
          last_refund_status: string | null
          last_status_change_at: string | null
          metadata: Json | null
          order_number: string
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_status: string | null
          picked_up_at: string | null
          points_redeemed: number | null
          prepared_at: string | null
          promotion_id: string | null
          rating: number | null
          referral_id: string | null
          refund_amount: number | null
          refunded_at: string | null
          restaurant_id: string
          restaurant_latitude: number | null
          restaurant_longitude: number | null
          review: string | null
          scheduled_for: string | null
          service_fee: number
          status: Database["public"]["Enums"]["order_status"] | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number | null
          tax: number | null
          tip: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount_refunded_cents?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string | null
          currency?: string
          customer_geocoded_at?: string | null
          customer_id: string
          customer_latitude?: number | null
          customer_longitude?: number | null
          customer_notes?: string | null
          delivered_at?: string | null
          delivery_address: Json
          delivery_fee?: number | null
          delivery_instructions?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          discount?: number | null
          driver_accuracy?: number | null
          driver_id?: string | null
          driver_speed?: number | null
          estimated_delivery?: string | null
          estimated_ready_at?: string | null
          id?: string
          items?: Json
          last_location_update?: string | null
          last_refund_at?: string | null
          last_refund_status?: string | null
          last_status_change_at?: string | null
          metadata?: Json | null
          order_number: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          picked_up_at?: string | null
          points_redeemed?: number | null
          prepared_at?: string | null
          promotion_id?: string | null
          rating?: number | null
          referral_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          restaurant_id: string
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          review?: string | null
          scheduled_for?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number | null
          tax?: number | null
          tip?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount_refunded_cents?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string | null
          currency?: string
          customer_geocoded_at?: string | null
          customer_id?: string
          customer_latitude?: number | null
          customer_longitude?: number | null
          customer_notes?: string | null
          delivered_at?: string | null
          delivery_address?: Json
          delivery_fee?: number | null
          delivery_instructions?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          discount?: number | null
          driver_accuracy?: number | null
          driver_id?: string | null
          driver_speed?: number | null
          estimated_delivery?: string | null
          estimated_ready_at?: string | null
          id?: string
          items?: Json
          last_location_update?: string | null
          last_refund_at?: string | null
          last_refund_status?: string | null
          last_status_change_at?: string | null
          metadata?: Json | null
          order_number?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          picked_up_at?: string | null
          points_redeemed?: number | null
          prepared_at?: string | null
          promotion_id?: string | null
          rating?: number | null
          referral_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          restaurant_id?: string
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          review?: string | null
          scheduled_for?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number | null
          tax?: number | null
          tip?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_address?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      payment_audit_log: {
        Row: {
          created_at: string
          customer_id: string
          draft_id: string
          error_reason: string | null
          id: number
          idempotency_key: string
          ip: unknown
          metadata: Json | null
          order_id: string | null
          payment_intent_id: string | null
          status: string
          stripe_event_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          draft_id: string
          error_reason?: string | null
          id?: number
          idempotency_key: string
          ip?: unknown
          metadata?: Json | null
          order_id?: string | null
          payment_intent_id?: string | null
          status: string
          stripe_event_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          draft_id?: string
          error_reason?: string | null
          id?: number
          idempotency_key?: string
          ip?: unknown
          metadata?: Json | null
          order_id?: string | null
          payment_intent_id?: string | null
          status?: string
          stripe_event_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      payment_binding: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          draft_id: string
          environment: string
          expected_amount_cents: number
          livemode: boolean
          payment_intent_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          draft_id: string
          environment?: string
          expected_amount_cents: number
          livemode?: boolean
          payment_intent_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          draft_id?: string
          environment?: string
          expected_amount_cents?: number
          livemode?: boolean
          payment_intent_id?: string
          restaurant_id?: string
        }
        Relationships: []
      }
      payment_intent_history: {
        Row: {
          customer_id: string | null
          draft_id: string | null
          event_id: string
          event_type: string
          id: number
          ip: unknown
          metadata: Json | null
          payment_intent_id: string
          payment_state_after_event: string | null
          payment_state_at_event: string
          received_at: string
          transitioned: boolean
          user_agent: string | null
        }
        Insert: {
          customer_id?: string | null
          draft_id?: string | null
          event_id: string
          event_type: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          payment_intent_id: string
          payment_state_after_event?: string | null
          payment_state_at_event: string
          received_at?: string
          transitioned: boolean
          user_agent?: string | null
        }
        Update: {
          customer_id?: string | null
          draft_id?: string | null
          event_id?: string
          event_type?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          payment_intent_id?: string
          payment_state_after_event?: string | null
          payment_state_at_event?: string
          received_at?: string
          transitioned?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          provider: string
          provider_payment_method_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          provider?: string
          provider_payment_method_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          provider?: string
          provider_payment_method_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_rate_limit_buckets: {
        Row: {
          bucket_key: string
          last_refill_at: string
          limit_count: number
          tokens: number
          updated_at: string
          window_seconds: number
        }
        Insert: {
          bucket_key: string
          last_refill_at?: string
          limit_count: number
          tokens?: number
          updated_at?: string
          window_seconds: number
        }
        Update: {
          bucket_key?: string
          last_refill_at?: string
          limit_count?: number
          tokens?: number
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      payment_reconciliation_queue: {
        Row: {
          customer_id: string | null
          details: Json | null
          detected_at: string
          draft_id: string | null
          id: number
          issue_type: string
          order_id: string | null
          payment_intent_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          customer_id?: string | null
          details?: Json | null
          detected_at?: string
          draft_id?: string | null
          id?: number
          issue_type: string
          order_id?: string | null
          payment_intent_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          customer_id?: string | null
          details?: Json | null
          detected_at?: string
          draft_id?: string | null
          id?: number
          issue_type?: string
          order_id?: string | null
          payment_intent_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      payment_refunds: {
        Row: {
          charge_id: string | null
          completed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          internal_note: string | null
          metadata: Json
          order_id: string
          payment_intent_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          refunded_amount_cents: number
          requested_amount_cents: number
          requested_by: string
          status: Database["public"]["Enums"]["refund_status"]
          stripe_event_id: string | null
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          charge_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency: string
          customer_id: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          internal_note?: string | null
          metadata?: Json
          order_id: string
          payment_intent_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          refunded_amount_cents?: number
          requested_amount_cents: number
          requested_by: string
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_event_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          charge_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          internal_note?: string | null
          metadata?: Json
          order_id?: string
          payment_intent_id?: string
          reason?: Database["public"]["Enums"]["refund_reason"]
          refunded_amount_cents?: number
          requested_amount_cents?: number
          requested_by?: string
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_event_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_security_events: {
        Row: {
          created_at: string
          draft_id: string | null
          event_type: string
          id: number
          ip: unknown
          metadata: Json | null
          payment_intent_id: string | null
          reason: string
          request_id: string | null
          route: string | null
          severity: string
          stripe_event_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          event_type: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          payment_intent_id?: string | null
          reason: string
          request_id?: string | null
          route?: string | null
          severity: string
          stripe_event_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          event_type?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          payment_intent_id?: string | null
          reason?: string
          request_id?: string | null
          route?: string | null
          severity?: string
          stripe_event_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          customer_id: string
          failed_reason: string | null
          id: string
          metadata: Json | null
          method: string
          order_id: string
          paid_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          customer_id: string
          failed_reason?: string | null
          id?: string
          metadata?: Json | null
          method: string
          order_id: string
          paid_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          failed_reason?: string | null
          id?: string
          metadata?: Json | null
          method?: string
          order_id?: string
          paid_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bulk_operations: {
        Row: {
          affected_count: number
          created_at: string | null
          filters: Json | null
          id: string
          operation: string
          performed_by: string | null
          restaurant_id: string
        }
        Insert: {
          affected_count: number
          created_at?: string | null
          filters?: Json | null
          id?: string
          operation: string
          performed_by?: string | null
          restaurant_id: string
        }
        Update: {
          affected_count?: number
          created_at?: string | null
          filters?: Json | null
          id?: string
          operation?: string
          performed_by?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bulk_operations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_extras: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_choices: number
          name: string
          price_adjustment: number
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_choices?: number
          name: string
          price_adjustment?: number
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_choices?: number
          name?: string
          price_adjustment?: number
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_extras_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_requests: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          product_data: Json
          rejection_reason: string | null
          requested_by: string
          restaurant_id: string
          resulting_product_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_price: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          product_data?: Json
          rejection_reason?: string | null
          requested_by: string
          restaurant_id: string
          resulting_product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_price: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          product_data?: Json
          rejection_reason?: string | null
          requested_by?: string
          restaurant_id?: string
          resulting_product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_resulting_product_id_fkey"
            columns: ["resulting_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          is_required: boolean
          name: string
          price_adjustment: number
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_required?: boolean
          name: string
          price_adjustment?: number
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_required?: boolean
          name?: string
          price_adjustment?: number
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_views: {
        Row: {
          id: string
          product_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          product_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_views_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          badge: string | null
          badges: string[] | null
          calories: number | null
          category: string
          category_id: string | null
          compare_price: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          description_ar: string | null
          discount_price: number | null
          display_order: number | null
          emoji: string | null
          extras: Json | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          in_stock: boolean | null
          ingredients: string[] | null
          is_active: boolean | null
          is_available: boolean
          is_featured: boolean | null
          market_section: string | null
          metadata: Json | null
          modifiers: Json
          name: string
          name_ar: string | null
          options: Json | null
          pharmacy_category: string | null
          prep_time: number | null
          preparation_time: number | null
          price: number
          rating: number | null
          requires_prescription: boolean | null
          restaurant_id: string | null
          sizes: Json | null
          sold_count: number | null
          sort_order: number
          stock: number | null
          stock_count: number | null
          total_reviews: number | null
          track_stock: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          badge?: string | null
          badges?: string[] | null
          calories?: number | null
          category: string
          category_id?: string | null
          compare_price?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          discount_price?: number | null
          display_order?: number | null
          emoji?: string | null
          extras?: Json | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          in_stock?: boolean | null
          ingredients?: string[] | null
          is_active?: boolean | null
          is_available?: boolean
          is_featured?: boolean | null
          market_section?: string | null
          metadata?: Json | null
          modifiers?: Json
          name: string
          name_ar?: string | null
          options?: Json | null
          pharmacy_category?: string | null
          prep_time?: number | null
          preparation_time?: number | null
          price: number
          rating?: number | null
          requires_prescription?: boolean | null
          restaurant_id?: string | null
          sizes?: Json | null
          sold_count?: number | null
          sort_order?: number
          stock?: number | null
          stock_count?: number | null
          total_reviews?: number | null
          track_stock?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          badge?: string | null
          badges?: string[] | null
          calories?: number | null
          category?: string
          category_id?: string | null
          compare_price?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_ar?: string | null
          discount_price?: number | null
          display_order?: number | null
          emoji?: string | null
          extras?: Json | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          in_stock?: boolean | null
          ingredients?: string[] | null
          is_active?: boolean | null
          is_available?: boolean
          is_featured?: boolean | null
          market_section?: string | null
          metadata?: Json | null
          modifiers?: Json
          name?: string
          name_ar?: string | null
          options?: Json | null
          pharmacy_category?: string | null
          prep_time?: number | null
          preparation_time?: number | null
          price?: number
          rating?: number | null
          requires_prescription?: boolean | null
          restaurant_id?: string | null
          sizes?: Json | null
          sold_count?: number | null
          sort_order?: number
          stock?: number | null
          stock_count?: number | null
          total_reviews?: number | null
          track_stock?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string
          id: string
          image_url: string | null
          is_active: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          restaurant_id: string | null
          starts_at: string
          title: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value: number
          ends_at: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          restaurant_id?: string | null
          starts_at: string
          title: string
        }
        Update: {
          code?: string | null
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          restaurant_id?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_info: string | null
          endpoint: string
          id: string
          is_active: boolean
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_info?: string | null
          endpoint: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_info?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          count: number
          endpoint: string
          id: string
          identifier: string
          window_start: string
        }
        Insert: {
          count?: number
          endpoint: string
          id?: string
          identifier: string
          window_start?: string
        }
        Update: {
          count?: number
          endpoint?: string
          id?: string
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          driver_id: string | null
          driver_rating: number | null
          food_rating: number | null
          id: string
          order_id: string | null
          restaurant_id: string | null
          restaurant_rating: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          driver_rating?: number | null
          food_rating?: number | null
          id?: string
          order_id?: string | null
          restaurant_id?: string | null
          restaurant_rating?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          driver_rating?: number | null
          food_rating?: number | null
          id?: string
          order_id?: string | null
          restaurant_id?: string | null
          restaurant_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          id: string
          product_id: string | null
          restaurant_id: string | null
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          restaurant_id?: string | null
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          restaurant_id?: string | null
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_viewed_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string
          id: string
          referee_email: string
          referee_id: string | null
          referee_reward_value: number | null
          referrer_id: string
          reward_type: string | null
          reward_value: number | null
          status: string
        }
        Insert: {
          code: string
          completed_at?: string | null
          created_at?: string
          id?: string
          referee_email: string
          referee_id?: string | null
          referee_reward_value?: number | null
          referrer_id: string
          reward_type?: string | null
          reward_value?: number | null
          status?: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          referee_email?: string
          referee_id?: string | null
          referee_reward_value?: number | null
          referrer_id?: string
          reward_type?: string | null
          reward_value?: number | null
          status?: string
        }
        Relationships: []
      }
      refund_audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          amount_cents: number | null
          created_at: string
          currency: string | null
          id: string
          idempotency_key: string | null
          internal_note: string | null
          metadata: Json
          new_status: Database["public"]["Enums"]["refund_status"] | null
          order_id: string
          payment_intent_id: string
          previous_status: Database["public"]["Enums"]["refund_status"] | null
          reason: string | null
          refund_id: string
          request_id: string | null
          stripe_event_id: string | null
          stripe_refund_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          idempotency_key?: string | null
          internal_note?: string | null
          metadata?: Json
          new_status?: Database["public"]["Enums"]["refund_status"] | null
          order_id: string
          payment_intent_id: string
          previous_status?: Database["public"]["Enums"]["refund_status"] | null
          reason?: string | null
          refund_id: string
          request_id?: string | null
          stripe_event_id?: string | null
          stripe_refund_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          idempotency_key?: string | null
          internal_note?: string | null
          metadata?: Json
          new_status?: Database["public"]["Enums"]["refund_status"] | null
          order_id?: string
          payment_intent_id?: string
          previous_status?: Database["public"]["Enums"]["refund_status"] | null
          reason?: string | null
          refund_id?: string
          request_id?: string | null
          stripe_event_id?: string | null
          stripe_refund_id?: string | null
        }
        Relationships: []
      }
      refund_operation_locks: {
        Row: {
          expires_at: string
          locked_at: string
          locked_by: string
          order_id: string
        }
        Insert: {
          expires_at?: string
          locked_at?: string
          locked_by: string
          order_id: string
        }
        Update: {
          expires_at?: string
          locked_at?: string
          locked_by?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_operation_locks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          status: string
          status_new: Database["public"]["Enums"]["refund_status"] | null
          stripe_refund_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          status_new?: Database["public"]["Enums"]["refund_status"] | null
          stripe_refund_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          status_new?: Database["public"]["Enums"]["refund_status"] | null
          stripe_refund_id?: string | null
        }
        Relationships: []
      }
      restaurant_activity: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          restaurant_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          restaurant_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          restaurant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_activity_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_announcements: {
        Row: {
          body: string | null
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          restaurant_id: string
          starts_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          restaurant_id: string
          starts_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          restaurant_id?: string
          starts_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_announcements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payouts: {
        Row: {
          created_at: string | null
          id: string
          paid_at: string | null
          period_end: string
          period_start: string
          restaurant_id: string
          status: string | null
          total_commission: number | null
          total_orders: number | null
          total_payout: number | null
          total_subtotal: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          period_end: string
          period_start: string
          restaurant_id: string
          status?: string | null
          total_commission?: number | null
          total_orders?: number | null
          total_payout?: number | null
          total_subtotal?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          restaurant_id?: string
          status?: string | null
          total_commission?: number | null
          total_orders?: number | null
          total_payout?: number | null
          total_subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_verifications: {
        Row: {
          business_document_ref: string
          city: string
          contact_email: string
          contact_phone: string
          country_code: string
          created_at: string
          identity_document_ref: string
          legal_form: string | null
          legal_name: string
          payout_account_last4: string
          postal_code: string
          rejection_reason: string | null
          representative_name: string
          restaurant_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          self_certified_at: string
          status: string
          street_address: string
          submitted_at: string | null
          tax_number: string | null
          trade_register_name: string
          trade_register_number: string
          updated_at: string
          vat_id: string | null
        }
        Insert: {
          business_document_ref: string
          city: string
          contact_email: string
          contact_phone: string
          country_code?: string
          created_at?: string
          identity_document_ref: string
          legal_form?: string | null
          legal_name: string
          payout_account_last4: string
          postal_code: string
          rejection_reason?: string | null
          representative_name: string
          restaurant_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          self_certified_at: string
          status?: string
          street_address: string
          submitted_at?: string | null
          tax_number?: string | null
          trade_register_name: string
          trade_register_number: string
          updated_at?: string
          vat_id?: string | null
        }
        Update: {
          business_document_ref?: string
          city?: string
          contact_email?: string
          contact_phone?: string
          country_code?: string
          created_at?: string
          identity_document_ref?: string
          legal_form?: string | null
          legal_name?: string
          payout_account_last4?: string
          postal_code?: string
          rejection_reason?: string | null
          representative_name?: string
          restaurant_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          self_certified_at?: string
          status?: string
          street_address?: string
          submitted_at?: string | null
          tax_number?: string | null
          trade_register_name?: string
          trade_register_number?: string
          updated_at?: string
          vat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_verifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accepting_orders: boolean | null
          address: string | null
          avg_prep_minutes: number
          avg_preparation_minutes: number | null
          busy_mode: boolean | null
          busy_mode_until: string | null
          category: string | null
          city: string | null
          cover_url: string | null
          created_at: string | null
          cuisine: string[] | null
          delivery_fee: number | null
          delivery_time: number | null
          delivery_zones: Json
          description: string | null
          description_ar: string | null
          email: string | null
          estimated_delivery_time: string
          id: string
          image_url: string | null
          is_24_7: boolean | null
          is_active: boolean | null
          is_featured: boolean | null
          is_hidden: boolean
          is_online: boolean
          is_open_now: boolean | null
          is_paused: boolean | null
          is_promoted: boolean | null
          is_verified: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_concurrent_orders: number | null
          metadata: Json | null
          min_order: number | null
          min_order_amount: number
          name: string
          name_ar: string | null
          opening_hours: Json | null
          owner_id: string | null
          pause_message: string | null
          phone: string | null
          prep_variance_minutes: number
          promoted_until: string | null
          rating: number | null
          review_count: number
          total_orders: number
          total_reviews: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          accepting_orders?: boolean | null
          address?: string | null
          avg_prep_minutes?: number
          avg_preparation_minutes?: number | null
          busy_mode?: boolean | null
          busy_mode_until?: string | null
          category?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string | null
          cuisine?: string[] | null
          delivery_fee?: number | null
          delivery_time?: number | null
          delivery_zones?: Json
          description?: string | null
          description_ar?: string | null
          email?: string | null
          estimated_delivery_time?: string
          id?: string
          image_url?: string | null
          is_24_7?: boolean | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_hidden?: boolean
          is_online?: boolean
          is_open_now?: boolean | null
          is_paused?: boolean | null
          is_promoted?: boolean | null
          is_verified?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_concurrent_orders?: number | null
          metadata?: Json | null
          min_order?: number | null
          min_order_amount?: number
          name: string
          name_ar?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          pause_message?: string | null
          phone?: string | null
          prep_variance_minutes?: number
          promoted_until?: string | null
          rating?: number | null
          review_count?: number
          total_orders?: number
          total_reviews?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          accepting_orders?: boolean | null
          address?: string | null
          avg_prep_minutes?: number
          avg_preparation_minutes?: number | null
          busy_mode?: boolean | null
          busy_mode_until?: string | null
          category?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string | null
          cuisine?: string[] | null
          delivery_fee?: number | null
          delivery_time?: number | null
          delivery_zones?: Json
          description?: string | null
          description_ar?: string | null
          email?: string | null
          estimated_delivery_time?: string
          id?: string
          image_url?: string | null
          is_24_7?: boolean | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_hidden?: boolean
          is_online?: boolean
          is_open_now?: boolean | null
          is_paused?: boolean | null
          is_promoted?: boolean | null
          is_verified?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_concurrent_orders?: number | null
          metadata?: Json | null
          min_order?: number | null
          min_order_amount?: number
          name?: string
          name_ar?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          pause_message?: string | null
          phone?: string | null
          prep_variance_minutes?: number
          promoted_until?: string | null
          rating?: number | null
          review_count?: number
          total_orders?: number
          total_reviews?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          customer_id: string
          driver_id: string | null
          id: string
          images: string[] | null
          is_visible: boolean | null
          metadata: Json | null
          order_id: string | null
          product_id: string | null
          rating: number
          restaurant_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          customer_id: string
          driver_id?: string | null
          id?: string
          images?: string[] | null
          is_visible?: boolean | null
          metadata?: Json | null
          order_id?: string | null
          product_id?: string | null
          rating: number
          restaurant_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          customer_id?: string
          driver_id?: string | null
          id?: string
          images?: string[] | null
          is_visible?: boolean | null
          metadata?: Json | null
          order_id?: string | null
          product_id?: string | null
          rating?: number
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics_aggregates: {
        Row: {
          count: number
          event_type: string
          last_seen: string
          query: string
        }
        Insert: {
          count?: number
          event_type: string
          last_seen?: string
          query: string
        }
        Update: {
          count?: number
          event_type?: string
          last_seen?: string
          query?: string
        }
        Relationships: []
      }
      search_analytics_events: {
        Row: {
          created_at: string
          filter_cuisine: string | null
          filter_sort: string | null
          id: number
          query: string
          result_count: number | null
          result_id: string | null
          result_type: string | null
          session_id: string
          type: string
        }
        Insert: {
          created_at?: string
          filter_cuisine?: string | null
          filter_sort?: string | null
          id?: number
          query: string
          result_count?: number | null
          result_id?: string | null
          result_type?: string | null
          session_id: string
          type: string
        }
        Update: {
          created_at?: string
          filter_cuisine?: string | null
          filter_sort?: string | null
          id?: number
          query?: string
          result_count?: number | null
          result_id?: string | null
          result_type?: string | null
          session_id?: string
          type?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          id: string
          query: string
          result_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          result_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          result_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          resource_id: string
          resource_type: string
          token: string
          view_count: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          resource_id: string
          resource_type: string
          token: string
          view_count?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          resource_id?: string
          resource_type?: string
          token?: string
          view_count?: number | null
        }
        Relationships: []
      }
      stripe_payment_intents: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string
          customer_id: string | null
          draft_id: string | null
          id: string
          metadata: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          draft_id?: string | null
          id: string
          metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          draft_id?: string | null
          id?: string
          metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          error_message: string | null
          event_id: string
          event_type: string
          payment_intent_id: string | null
          processed_at: string
          result: string
        }
        Insert: {
          error_message?: string | null
          event_id: string
          event_type: string
          payment_intent_id?: string | null
          processed_at?: string
          result: string
        }
        Update: {
          error_message?: string | null
          event_id?: string
          event_type?: string
          payment_intent_id?: string | null
          processed_at?: string
          result?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachments: Json
          body: string | null
          created_at: string
          id: string
          message: string
          status: string | null
          subject: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          body?: string | null
          created_at?: string
          id?: string
          message: string
          status?: string | null
          subject?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          body?: string | null
          created_at?: string
          id?: string
          message?: string
          status?: string | null
          subject?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_replies: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          message: string
          order_id: string | null
          priority: string
          resolution: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          user_role: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          id?: string
          message: string
          order_id?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          user_role: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          link_label: string | null
          link_url: string | null
          message: string
          starts_at: string
          title: string
          type: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          message: string
          starts_at?: string
          title: string
          type?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          message?: string
          starts_at?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          last_seen: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          addresses: Json | null
          auth_provider: string | null
          avatar_url: string | null
          city: string | null
          created_at: string | null
          email: string
          failed_login_count: number | null
          id: string
          is_active: boolean | null
          is_online: boolean | null
          is_verified: boolean
          language: string | null
          last_failed_login_at: string | null
          last_location_lat: number | null
          last_location_lng: number | null
          last_location_updated_at: string | null
          last_login_at: string | null
          locked_until: string | null
          metadata: Json | null
          name: string | null
          oauth_provider_id: string | null
          phone: string | null
          rating: number
          referral_code: string | null
          referred_by: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          addresses?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email: string
          failed_login_count?: number | null
          id: string
          is_active?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean
          language?: string | null
          last_failed_login_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          last_location_updated_at?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          metadata?: Json | null
          name?: string | null
          oauth_provider_id?: string | null
          phone?: string | null
          rating?: number
          referral_code?: string | null
          referred_by?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          addresses?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email?: string
          failed_login_count?: number | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean
          language?: string | null
          last_failed_login_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          last_location_updated_at?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          metadata?: Json | null
          name?: string | null
          oauth_provider_id?: string | null
          phone?: string | null
          rating?: number
          referral_code?: string | null
          referred_by?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          error: string | null
          event: string
          id: string
          idempotency_key: string
          next_attempt_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          source: string
          status: string
          updated_at: string
          url: string
          webhook_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event: string
          id?: string
          idempotency_key: string
          next_attempt_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          source?: string
          status?: string
          updated_at?: string
          url: string
          webhook_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event?: string
          id?: string
          idempotency_key?: string
          next_attempt_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          source?: string
          status?: string
          updated_at?: string
          url?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          events: string[]
          id: string
          name: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          events?: string[]
          id?: string
          name: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          events?: string[]
          id?: string
          name?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      driver_daily_stats: {
        Row: {
          avg_delivery_minutes: number | null
          cancelled_deliveries: number | null
          completed_deliveries: number | null
          day: string | null
          driver_id: string | null
          total_delivery_fees: number | null
          total_tips: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_daily_stats: {
        Row: {
          avg_prep_minutes: number | null
          cancelled_orders: number | null
          completed_orders: number | null
          day: string | null
          restaurant_id: string | null
          total_delivery_fees: number | null
          total_orders: number | null
          total_revenue: number | null
          total_tips: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_unacked_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_product_request: {
        Args: { p_edits?: Json; p_request_id: string }
        Returns: string
      }
      auth_role: { Args: never; Returns: string }
      award_loyalty_points: {
        Args: {
          p_order_id?: string
          p_points: number
          p_reason: string
          p_user_id: string
        }
        Returns: {
          new_balance: number
          new_earned: number
          user_id: string
        }[]
      }
      burn_order_draft: {
        Args: { p_confirmed_by: string; p_draft_id: string }
        Returns: boolean
      }
      check_password_strength: { Args: { password: string }; Returns: boolean }
      cleanup_expired_magic_links: { Args: never; Returns: undefined }
      cleanup_expired_reset_tokens: { Args: never; Returns: number }
      cleanup_idempotency_keys: { Args: never; Returns: number }
      cleanup_login_attempts: { Args: never; Returns: undefined }
      cleanup_old_rate_limit_buckets: {
        Args: { retention_hours?: number }
        Returns: number
      }
      create_order_atomic: {
        Args: {
          p_customer_id: string
          p_customer_latitude: number
          p_customer_longitude: number
          p_delivery_address: Json
          p_delivery_fee: number
          p_discount: number
          p_items: Json
          p_order_number: string
          p_payment_method: string
          p_restaurant_id: string
          p_restaurant_latitude: number
          p_restaurant_longitude: number
          p_scheduled_for: string
          p_service_fee: number
          p_subtotal: number
          p_tip: number
          p_total: number
        }
        Returns: {
          order_id: string
          order_number: string
        }[]
      }
      dispatch_scheduled_orders: {
        Args: never
        Returns: {
          customer_id: string
          dispatch_lag_sec: number
          order_id: string
          order_number: string
          restaurant_id: string
          scheduled_for: string
        }[]
      }
      gc_expired_order_drafts: { Args: never; Returns: number }
      get_active_drivers_nearby: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number }
        Returns: {
          current_order_id: string
          distance_km: number
          driver_id: string
          is_on_delivery: boolean
          is_online: boolean
          last_seen: string
          latitude: number
          longitude: number
        }[]
      }
      get_active_order_draft: {
        Args: { p_customer_id: string }
        Returns: {
          created_at: string
          customer_id: string
          draft: Json
          expires_at: string
          id: string
          restaurant_id: string
          signature: string
          used: boolean
        }[]
      }
      get_nearby_drivers_v2: {
        Args: { lat: number; lng: number; radius_km?: number }
        Returns: {
          current_order_id: string
          distance_km: number
          driver_id: string
          is_on_delivery: boolean
          is_online: boolean
          latitude: number
          longitude: number
        }[]
      }
      get_payment_intent_history: {
        Args: { p_limit?: number; p_payment_intent_id: string }
        Returns: {
          event_id: string
          event_type: string
          payment_state_after_event: string
          payment_state_at_event: string
          received_at: string
          transitioned: boolean
        }[]
      }
      get_restaurant_stats_v2: {
        Args: { rest_id: string }
        Returns: {
          avg_prep_min: number
          cancelled: number
          completed: number
          today_orders: number
          today_revenue: number
          total_orders: number
          total_revenue: number
        }[]
      }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      payment_rate_limit_check: {
        Args: {
          p_bucket_key: string
          p_burst?: number
          p_limit: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
          tokens_remaining: number
        }[]
      }
      recompute_order_payment_status: {
        Args: { p_order_id: string }
        Returns: string
      }
      redeem_loyalty_points: {
        Args: { p_order_id?: string; p_points: number; p_user_id: string }
        Returns: {
          discount_eur: number
          new_balance: number
          new_redeemed: number
          user_id: string
        }[]
      }
      refund_max_amount_cents: {
        Args: { p_order_id: string }
        Returns: {
          already_refunded_cents: number
          can_full_refund: boolean
          currency: string
          max_refundable_cents: number
          pending_cents: number
          received_cents: number
        }[]
      }
      update_draft_payment_state: {
        Args: {
          p_draft_id: string
          p_expected_status: string
          p_last_event_at: string
          p_last_event_id: string
          p_last_event_type: string
          p_new_status: string
        }
        Returns: {
          expires_at: string
          id: string
          payment_intent_id: string
          payment_status: string
          used: boolean
        }[]
      }
    }
    Enums: {
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "assigned"
        | "picked_up"
        | "delivering"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "could_not_deliver"
      refund_reason:
        | "order_canceled"
        | "item_unavailable"
        | "incorrect_item"
        | "missing_item"
        | "quality_issue"
        | "delivery_failure"
        | "duplicate_charge"
        | "customer_support_adjustment"
        | "recovery_unmatched_payment"
        | "other"
      refund_status:
        | "requested"
        | "validating"
        | "submitted"
        | "pending"
        | "succeeded"
        | "failed"
        | "canceled"
        | "requires_review"
      user_role: "customer" | "driver" | "restaurant" | "admin" | "super_admin"
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
    Enums: {
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "assigned",
        "picked_up",
        "delivering",
        "delivered",
        "cancelled",
        "refunded",
        "could_not_deliver",
      ],
      refund_reason: [
        "order_canceled",
        "item_unavailable",
        "incorrect_item",
        "missing_item",
        "quality_issue",
        "delivery_failure",
        "duplicate_charge",
        "customer_support_adjustment",
        "recovery_unmatched_payment",
        "other",
      ],
      refund_status: [
        "requested",
        "validating",
        "submitted",
        "pending",
        "succeeded",
        "failed",
        "canceled",
        "requires_review",
      ],
      user_role: ["customer", "driver", "restaurant", "admin", "super_admin"],
    },
  },
} as const

