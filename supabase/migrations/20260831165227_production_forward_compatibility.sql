-- Forward-only compatibility layer for the legacy BlinkGo production schema.
-- Generated from a read-only production/staging contract diff on 2026-08-31.
-- This migration adds missing columns only. It deliberately preserves legacy
-- tables and legacy columns and does not copy, delete, or expose user data.
-- Apply on a production-derived rehearsal first. Do not run directly in
-- production without the launch maintenance approval and backup gate.

do $$ begin
  create type public.user_role as enum ('customer','driver','restaurant','admin','manager','super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('pending','confirmed','preparing','ready','assigned','picked_up','delivering','delivered','cancelled','refunded','could_not_deliver','cancel_refund_pending');
exception when duplicate_object then null; end $$;

alter table public."categories" add column if not exists "sort_order" integer default 0;
alter table public."coupons" add column if not exists "name" text;
alter table public."coupons" add column if not exists "description" text;
alter table public."coupons" add column if not exists "discount_type" text;
alter table public."coupons" add column if not exists "discount_value" numeric(10,2);
alter table public."coupons" add column if not exists "min_order" numeric(10,2) default 0;
alter table public."coupons" add column if not exists "user_limit" integer default 1;
alter table public."coupons" add column if not exists "valid_from" timestamp with time zone;
alter table public."coupons" add column if not exists "valid_until" timestamp with time zone;
alter table public."coupons" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."coupons" add column if not exists "max_uses" integer;
alter table public."coupons" add column if not exists "current_uses" integer;
alter table public."coupons" add column if not exists "updated_at" timestamp with time zone default now() not null;
alter table public."coupons" add column if not exists "deleted_at" timestamp with time zone;
alter table public."customer_addresses" add column if not exists "address" text;
alter table public."customer_addresses" add column if not exists "details" text;
alter table public."delivery_zones" add column if not exists "surge_multiplier" numeric(4,2) default 1 not null;
alter table public."delivery_zones" add column if not exists "surge_days" smallint[] default '{}'::smallint[] not null;
alter table public."delivery_zones" add column if not exists "surge_start_local" time without time zone;
alter table public."delivery_zones" add column if not exists "surge_end_local" time without time zone;
alter table public."delivery_zones" add column if not exists "surge_timezone" text default 'Europe/Berlin'::text not null;
alter table public."delivery_zones" add column if not exists "version" integer default 1 not null;
alter table public."delivery_zones" add column if not exists "effective_from" timestamp with time zone default now() not null;
alter table public."delivery_zones" add column if not exists "effective_to" timestamp with time zone;
alter table public."driver_earnings" add column if not exists "currency" text default 'EUR'::text not null;
alter table public."driver_status" add column if not exists "heading" double precision;
alter table public."driver_status" add column if not exists "accuracy" double precision;
alter table public."driver_status" add column if not exists "last_seen" timestamp with time zone default now();
alter table public."driver_status" add column if not exists "active_order_id" uuid;
alter table public."driver_status" add column if not exists "current_lat" numeric;
alter table public."driver_status" add column if not exists "current_lng" numeric;
alter table public."driver_status" add column if not exists "last_location_lat" numeric;
alter table public."driver_status" add column if not exists "last_location_lng" numeric;
alter table public."driver_status" add column if not exists "last_location_at" timestamp with time zone;
alter table public."driver_status" add column if not exists "is_active" boolean default true not null;
alter table public."drivers" add column if not exists "vehicle_plate" text;
alter table public."drivers" add column if not exists "license_number" text;
alter table public."drivers" add column if not exists "rating" numeric(3,2) default 5.0;
alter table public."drivers" add column if not exists "total_trips" integer default 0;
alter table public."drivers" add column if not exists "total_earnings" numeric(10,2) default 0;
alter table public."drivers" add column if not exists "current_latitude" numeric(10,7);
alter table public."drivers" add column if not exists "current_longitude" numeric(10,7);
alter table public."drivers" add column if not exists "last_location_update" timestamp with time zone;
alter table public."drivers" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."drivers" add column if not exists "updated_at" timestamp with time zone default now();
alter table public."drivers" add column if not exists "is_approved" boolean default false not null;
alter table public."drivers" add column if not exists "user_id" uuid;
alter table public."drivers" add column if not exists "total_deliveries" integer default 0 not null;
alter table public."drivers" add column if not exists "current_lat" numeric;
alter table public."drivers" add column if not exists "current_lng" numeric;
alter table public."drivers" add column if not exists "last_seen_at" timestamp with time zone;
alter table public."drivers" add column if not exists "last_active_at" timestamp with time zone;
alter table public."drivers" add column if not exists "zone_id" uuid;
alter table public."notifications" add column if not exists "image_url" text;
alter table public."order_items" add column if not exists "name" text;
alter table public."order_items" add column if not exists "price" numeric(10,2);
alter table public."order_items" add column if not exists "unit_price" numeric(10,2);
alter table public."order_items" add column if not exists "notes" text;
alter table public."order_items" add column if not exists "category" text;
alter table public."order_items" add column if not exists "configuration" jsonb default '{}'::jsonb not null;
alter table public."order_tracking_events" add column if not exists "status" text;
alter table public."order_tracking_events" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."orders" add column if not exists "items" jsonb default '[]'::jsonb not null;
alter table public."orders" add column if not exists "coupon_code" text;
alter table public."orders" add column if not exists "delivery_latitude" numeric(10,7);
alter table public."orders" add column if not exists "delivery_longitude" numeric(10,7);
alter table public."orders" add column if not exists "customer_notes" text;
alter table public."orders" add column if not exists "estimated_delivery" timestamp with time zone;
alter table public."orders" add column if not exists "cancellation_reason" text;
alter table public."orders" add column if not exists "rating" integer;
alter table public."orders" add column if not exists "review" text;
alter table public."orders" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."orders" add column if not exists "paid_at" timestamp with time zone;
alter table public."orders" add column if not exists "driver_speed" real;
alter table public."orders" add column if not exists "driver_accuracy" real;
alter table public."orders" add column if not exists "last_location_update" timestamp with time zone;
alter table public."orders" add column if not exists "coupon_id" uuid;
alter table public."orders" add column if not exists "promotion_id" uuid;
alter table public."orders" add column if not exists "referral_id" uuid;
alter table public."orders" add column if not exists "points_redeemed" integer default 0;
alter table public."orders" add column if not exists "refund_amount" numeric(10,2) default 0;
alter table public."orders" add column if not exists "customer_geocoded_at" timestamp with time zone;
alter table public."orders" add column if not exists "cancelled_by" text;
alter table public."orders" add column if not exists "last_status_change_at" timestamp with time zone default now();
alter table public."orders" add column if not exists "estimated_ready_at" timestamp with time zone;
alter table public."orders" add column if not exists "currency" text default 'EUR'::text not null;
alter table public."orders" add column if not exists "fulfillment_type" text default 'delivery'::text not null;
alter table public."orders" add column if not exists "pickup_code" text;
alter table public."orders" add column if not exists "notes" text;
alter table public."payments" add column if not exists "amount" numeric(10,2);
alter table public."payments" add column if not exists "method" text;
alter table public."payments" add column if not exists "stripe_charge_id" text;
alter table public."product_extras" add column if not exists "sort_order" integer default 0 not null;
alter table public."product_extras" add column if not exists "is_active" boolean default true not null;
alter table public."product_extras" add column if not exists "updated_at" timestamp with time zone default now() not null;
alter table public."product_variants" add column if not exists "sort_order" integer default 0 not null;
alter table public."product_variants" add column if not exists "is_active" boolean default true not null;
alter table public."product_variants" add column if not exists "updated_at" timestamp with time zone default now() not null;
alter table public."products" add column if not exists "name_ar" text;
alter table public."products" add column if not exists "description_ar" text;
alter table public."products" add column if not exists "category" text;
alter table public."products" add column if not exists "compare_price" numeric(10,2);
alter table public."products" add column if not exists "image_url" text;
alter table public."products" add column if not exists "emoji" text;
alter table public."products" add column if not exists "badge" text;
alter table public."products" add column if not exists "in_stock" boolean default true;
alter table public."products" add column if not exists "stock_count" integer default 0;
alter table public."products" add column if not exists "prep_time" integer default 15;
alter table public."products" add column if not exists "rating" numeric(3,2) default 0;
alter table public."products" add column if not exists "total_reviews" integer default 0;
alter table public."products" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."products" add column if not exists "is_active" boolean default true;
alter table public."products" add column if not exists "stock" integer default 0;
alter table public."products" add column if not exists "track_stock" boolean default false;
alter table public."products" add column if not exists "display_order" integer default 0;
alter table public."products" add column if not exists "badges" text[] default '{}'::text[];
alter table public."products" add column if not exists "ingredients" text[] default '{}'::text[];
alter table public."products" add column if not exists "extras" jsonb default '[]'::jsonb;
alter table public."products" add column if not exists "sizes" jsonb default '[]'::jsonb;
alter table public."products" add column if not exists "options" jsonb default '[]'::jsonb;
alter table public."products" add column if not exists "requires_prescription" boolean default false;
alter table public."products" add column if not exists "market_section" text;
alter table public."products" add column if not exists "pharmacy_category" text;
alter table public."products" add column if not exists "approval_status" text default 'approved'::text not null;
alter table public."products" add column if not exists "archived_at" timestamp with time zone;
alter table public."products" add column if not exists "created_by" uuid;
alter table public."products" add column if not exists "updated_by" uuid;
alter table public."products" add column if not exists "approved_by" uuid;
alter table public."products" add column if not exists "approved_at" timestamp with time zone;
alter table public."products" add column if not exists "sort_order" integer default 0 not null;
alter table public."products" add column if not exists "modifiers" jsonb default '[]'::jsonb not null;
alter table public."products" add column if not exists "product_kind" text default 'prepared_food'::text not null;
alter table public."products" add column if not exists "legal_name" text;
alter table public."products" add column if not exists "net_quantity" numeric(12,3);
alter table public."products" add column if not exists "net_quantity_unit" text;
alter table public."products" add column if not exists "base_price_unit" text;
alter table public."products" add column if not exists "base_price" numeric(12,2);
alter table public."products" add column if not exists "ingredients_text" text;
alter table public."products" add column if not exists "allergen_information_reviewed" boolean default false not null;
alter table public."products" add column if not exists "additives" text[] default '{}'::text[] not null;
alter table public."products" add column if not exists "nutrition" jsonb default '{}'::jsonb not null;
alter table public."products" add column if not exists "country_of_origin" text;
alter table public."products" add column if not exists "producer_name" text;
alter table public."products" add column if not exists "producer_address" text;
alter table public."products" add column if not exists "storage_instructions" text;
alter table public."products" add column if not exists "usage_instructions" text;
alter table public."products" add column if not exists "alcohol_percentage" numeric(5,2);
alter table public."products" add column if not exists "minimum_age" integer;
alter table public."products" add column if not exists "legal_information_complete" boolean default false not null;
alter table public."products" add column if not exists "legal_information_updated_at" timestamp with time zone;
alter table public."products" add column if not exists "storefront_vertical" text default 'restaurant'::text not null;
alter table public."push_subscriptions" add column if not exists "device_info" text;
alter table public."ratings" add column if not exists "restaurant_rating" integer;
alter table public."ratings" add column if not exists "driver_rating" integer;
alter table public."ratings" add column if not exists "food_rating" integer;
alter table public."ratings" add column if not exists "comment" text;
alter table public."restaurants" add column if not exists "name_ar" text;
alter table public."restaurants" add column if not exists "description_ar" text;
alter table public."restaurants" add column if not exists "image_url" text;
alter table public."restaurants" add column if not exists "category" text;
alter table public."restaurants" add column if not exists "total_reviews" integer default 0;
alter table public."restaurants" add column if not exists "delivery_time" integer default 30;
alter table public."restaurants" add column if not exists "min_order" numeric(10,2) default 0;
alter table public."restaurants" add column if not exists "city" text;
alter table public."restaurants" add column if not exists "is_featured" boolean default false;
alter table public."restaurants" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."restaurants" add column if not exists "accepting_orders" boolean default true;
alter table public."restaurants" add column if not exists "pause_message" text;
alter table public."restaurants" add column if not exists "type" text default 'restaurant'::text;
alter table public."restaurants" add column if not exists "max_concurrent_orders" integer default 10;
alter table public."restaurants" add column if not exists "avg_preparation_minutes" numeric(5,2) default 0;
alter table public."restaurants" add column if not exists "is_open_now" boolean default true;
alter table public."restaurants" add column if not exists "is_24_7" boolean default false;
alter table public."restaurants" add column if not exists "is_promoted" boolean default false;
alter table public."restaurants" add column if not exists "promoted_until" timestamp with time zone;
alter table public."restaurants" add column if not exists "is_hidden" boolean default false not null;
alter table public."restaurants" add column if not exists "avg_prep_minutes" integer default 20 not null;
alter table public."restaurants" add column if not exists "prep_variance_minutes" integer default 5 not null;
alter table public."restaurants" add column if not exists "total_orders" integer default 0 not null;
alter table public."restaurants" add column if not exists "pickup_enabled" boolean default true not null;
alter table public."restaurants" add column if not exists "pickup_instructions" text;
alter table public."restaurants" add column if not exists "delivery_radius_km" numeric(8,2) default 5 not null;
alter table public."restaurants" add column if not exists "commission_pct" numeric(5,2) default 15 not null;
alter table public."reviews" add column if not exists "customer_id" uuid;
alter table public."reviews" add column if not exists "product_id" uuid;
alter table public."reviews" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."stripe_webhook_events" add column if not exists "payment_intent_id" text;
alter table public."stripe_webhook_events" add column if not exists "result" text;
alter table public."stripe_webhook_events" add column if not exists "error_message" text;
alter table public."support_tickets" add column if not exists "closed_at" timestamp with time zone;
alter table public."support_tickets" add column if not exists "reference_code" text;
alter table public."support_tickets" add column if not exists "issue_type" text default 'other'::text not null;
alter table public."support_tickets" add column if not exists "next_action" text default 'waiting_support'::text not null;
alter table public."support_tickets" add column if not exists "sla_due_at" timestamp with time zone;
alter table public."support_tickets" add column if not exists "first_response_at" timestamp with time zone;
alter table public."support_tickets" add column if not exists "resolution_summary" text;
alter table public."users" add column if not exists "city" text;
alter table public."users" add column if not exists "language" text default 'ar'::text;
alter table public."users" add column if not exists "addresses" jsonb default '[]'::jsonb;
alter table public."users" add column if not exists "wallet_balance" numeric(10,2) default 0;
alter table public."users" add column if not exists "referral_code" text;
alter table public."users" add column if not exists "referred_by" uuid;
alter table public."users" add column if not exists "metadata" jsonb default '{}'::jsonb;
alter table public."users" add column if not exists "is_online" boolean default false;
alter table public."users" add column if not exists "last_location_lat" numeric(10,7);
alter table public."users" add column if not exists "last_location_lng" numeric(10,7);
alter table public."users" add column if not exists "last_location_updated_at" timestamp with time zone;
alter table public."users" add column if not exists "failed_login_count" integer default 0;
alter table public."users" add column if not exists "locked_until" timestamp with time zone;
alter table public."users" add column if not exists "last_failed_login_at" timestamp with time zone;
alter table public."users" add column if not exists "oauth_provider_id" text;
alter table public."users" add column if not exists "rating" numeric(3,2) default 0 not null;

-- Deterministic compatibility backfills for newly-added required columns.
do $$
begin
  if to_regclass('public.coupons') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='coupons' and column_name='type') then
    update public.coupons
       set discount_type = coalesce(discount_type, type),
           discount_value = coalesce(discount_value, value);
    alter table public.coupons alter column discount_type set not null;
    alter table public.coupons alter column discount_value set not null;
  end if;

  if to_regclass('public.customer_addresses') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_addresses' and column_name='street') then
    update public.customer_addresses
       set address = coalesce(
         nullif(btrim(address), ''),
         nullif(concat_ws(', ', nullif(btrim(street), ''), nullif(btrim(postal_code), ''), nullif(btrim(city), ''), nullif(btrim(country), '')), '')
       );
    if not exists (select 1 from public.customer_addresses where address is null) then
      alter table public.customer_addresses alter column address set not null;
    end if;
  end if;

  if to_regclass('public.payments') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='amount_cents') then
    update public.payments
       set amount = coalesce(amount, amount_cents::numeric / 100),
           method = coalesce(nullif(btrim(method), ''), payment_method);
    if not exists (select 1 from public.payments where amount is null or method is null) then
      alter table public.payments alter column amount set not null;
      alter table public.payments alter column method set not null;
    end if;
  end if;

  if to_regclass('public.products') is not null then
    update public.products set category = coalesce(nullif(btrim(category), ''), 'Sonstiges');
    alter table public.products alter column category set not null;
  end if;

  if to_regclass('public.reviews') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='user_id') then
    update public.reviews set customer_id = coalesce(customer_id, user_id);
    if not exists (select 1 from public.reviews where customer_id is null) then
      alter table public.reviews alter column customer_id set not null;
    end if;
  end if;

  if to_regclass('public.stripe_webhook_events') is not null then
    update public.stripe_webhook_events set result = coalesce(result, 'processed');
    alter table public.stripe_webhook_events alter column result set not null;
  end if;

  if to_regclass('public.support_tickets') is not null then
    update public.support_tickets
       set reference_code = coalesce(reference_code, 'BG-' || upper(substr(md5(id::text), 1, 10))),
           sla_due_at = coalesce(sla_due_at, created_at + interval '12 hours');
    alter table public.support_tickets alter column reference_code set not null;
    alter table public.support_tickets alter column sla_due_at set not null;
  end if;
end $$;

-- Keep legacy relations for later data reconciliation, but remove direct
-- client grants. With RLS and no policies this is explicit deny-in-depth.
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.coupon_usage from anon, authenticated;
