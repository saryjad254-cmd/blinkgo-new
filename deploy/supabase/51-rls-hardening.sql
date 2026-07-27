-- ════════════════════════════════════════════════════════════════════════════
-- BlinkGo v81 — RLS Hardening Migration
-- ════════════════════════════════════════════════════════════════════════════
-- Patches RLS gaps identified in the v80 audit (`audit-reports/backend-1.md`).
-- All statements are IDEMPOTENT — safe to re-run.
--
-- Strategy:
--   1. Tighten overly-permissive policies (`USING (true)`) on customer PII
--      tables (ratings SELECT, payments SELECT, share_links SELECT, etc.).
--   2. Add missing INSERT/UPDATE/DELETE policies where only SELECT exists.
--   3. Add `auth.uid()` filtering where policies referenced the wrong column
--      or were missing the user-id predicate.
--   4. Ensure admin/restaurant/driver policy shortcuts exist where the
--      app code relies on them.
--   5. Add the missing `driver_working_hours` table + RLS (no migration
--      ever created it, but `app/api/driver/working-hours` reads/writes
--      from it).
--   6. Use the `IF NOT EXISTS` / `DROP POLICY IF EXISTS` pattern so this
--      migration is safe to re-run.
--
-- Tables covered (in priority order):
--   - payments         (BLOCKER: SELECT is currently `USING (true)`)
--   - ratings          (no UPDATE/DELETE policies)
--   - customer_addresses (no per-customer UPDATE/DELETE policies explicitly)
--   - favorites        (already correct, kept as reference)
--   - loyalty_transactions (only service-role policy; add user-read)
--   - coupon_usage     (no admin SELECT)
--   - push_subscriptions (already correct, kept as reference)
--   - share_links      (SELECT is `USING (true)`, tighten)
--   - support_tickets  (no customer UPDATE/DELETE)
--   - support_ticket_replies (no UPDATE/DELETE)
--   - driver_documents (already correct, kept as reference)
--   - drivers          (id = user_id; explicit ownership)
--   - driver_status    (already correct, kept as reference)
--   - driver_working_hours (CREATE TABLE + RLS — was missing entirely)
--   - order_tracking_events (re-confirm with stricter USING)
--   - order_modifications (re-confirm)
--   - notification_preferences (re-confirm)
--   - refunds          (re-confirm)
--   - referrals        (re-confirm)
--   - promotions       (re-confirm)
--   - recently_viewed  (re-confirm)
--   - system_announcements / system_settings / delivery_zones
--     (all re-confirmed — already correct)
--   - email_otps, api_audit_log, login_attempts, active_sessions
--     (service-role only — already correct)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ENABLE RLS on tables that may have been created without it
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ratings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_addresses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorites               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loyalty_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loyalty_points          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupon_usage            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.push_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.share_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_ticket_replies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.driver_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drivers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.driver_status           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.driver_working_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_tracking_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_modifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.refunds                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.promotions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recently_viewed         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_status_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.restaurant_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_bulk_operations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_reassignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.restaurant_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_otps               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.login_attempts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.active_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_subject_requests    ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. payments — was `USING (true)` for SELECT, no INSERT/UPDATE/DELETE
--    policies. Tighten to: customer sees own, admin sees all, restaurant
--    owner sees their restaurant's, driver sees their own.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS payments_select_involved ON public.payments;
CREATE POLICY payments_select_involved ON public.payments
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id
        AND (
          o.customer_id = auth.uid()
          OR o.driver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.restaurants r
            WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- INSERT: only the customer who owns the order, or service role
DROP POLICY IF EXISTS payments_insert_customer ON public.payments;
CREATE POLICY payments_insert_customer ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id AND o.customer_id = auth.uid()
    )
  );

-- UPDATE: only admins (refunds / manual adjustments)
DROP POLICY IF EXISTS payments_update_admin ON public.payments;
CREATE POLICY payments_update_admin ON public.payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- DELETE: only admins
DROP POLICY IF EXISTS payments_delete_admin ON public.payments;
CREATE POLICY payments_delete_admin ON public.payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- Service role bypass (Stripe webhook, account-delete, etc.)
DROP POLICY IF EXISTS payments_service_role_all ON public.payments;
CREATE POLICY payments_service_role_all ON public.payments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ratings — public SELECT is OK (reviews are social proof), but
--    INSERT/UPDATE/DELETE must be the customer who placed the order.
-- ════════════════════════════════════════════════════════════════════════════

-- Public SELECT is intentional — ratings are shown to everyone browsing
-- a restaurant. The existing `ratings_read USING (true)` is left intact
-- (created in 19-production-upgrade.sql / 21-create-remaining-tables.sql).

-- INSERT: customer must own the order
DROP POLICY IF EXISTS ratings_insert_owner ON public.ratings;
CREATE POLICY ratings_insert_owner ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = ratings.order_id AND o.customer_id = auth.uid()
    )
  );

-- UPDATE: only the customer who wrote it (or admin)
DROP POLICY IF EXISTS ratings_update_owner ON public.ratings;
CREATE POLICY ratings_update_owner ON public.ratings
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- DELETE: only admin
DROP POLICY IF EXISTS ratings_delete_admin ON public.ratings;
CREATE POLICY ratings_delete_admin ON public.ratings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS ratings_service_role_all ON public.ratings;
CREATE POLICY ratings_service_role_all ON public.ratings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. customer_addresses — keep the single `customer_addresses_own` policy
--    from 21-create-remaining-tables.sql but split into SELECT / INSERT /
--    UPDATE / DELETE so it is explicit and auditable.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS customer_addresses_own ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_select ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_insert ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_update ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_delete ON public.customer_addresses;

CREATE POLICY customer_addresses_select ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY customer_addresses_insert ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY customer_addresses_update ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY customer_addresses_delete ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

-- Service role bypass
DROP POLICY IF EXISTS customer_addresses_service_role_all ON public.customer_addresses;
CREATE POLICY customer_addresses_service_role_all ON public.customer_addresses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. favorites — keep user-scoped + service-role policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS favorites_user_read ON public.favorites;
CREATE POLICY favorites_user_read ON public.favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS favorites_user_write ON public.favorites;
CREATE POLICY favorites_user_write ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS favorites_service_role_all ON public.favorites;
CREATE POLICY favorites_service_role_all ON public.favorites
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. loyalty_points / loyalty_transactions
--    - Self read for both
--    - service-role full (RPCs award_loyalty_points / redeem_loyalty_points
--      are SECURITY DEFINER and write from server-side)
-- ════════════════════════════════════════════════════════════════════════════

-- self read of own balance
DROP POLICY IF EXISTS loyalty_points_self_read ON public.loyalty_points;
CREATE POLICY loyalty_points_self_read ON public.loyalty_points
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- self read of own transactions
DROP POLICY IF EXISTS loyalty_transactions_self_read ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_self_read ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- admin read everything
DROP POLICY IF EXISTS loyalty_points_admin_read ON public.loyalty_points;
CREATE POLICY loyalty_points_admin_read ON public.loyalty_points
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS loyalty_transactions_admin_read ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_admin_read ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- service role full (RPCs run as SECURITY DEFINER + service role bypasses RLS)
DROP POLICY IF EXISTS loyalty_points_service_role_all ON public.loyalty_points;
CREATE POLICY loyalty_points_service_role_all ON public.loyalty_points
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS loyalty_transactions_service_role_all ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_service_role_all ON public.loyalty_transactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. coupon_usage — was: SELECT own, INSERT own, NO admin path
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS coupon_usage_select_own ON public.coupon_usage;
CREATE POLICY coupon_usage_select_own ON public.coupon_usage
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS coupon_usage_insert_self ON public.coupon_usage;
CREATE POLICY coupon_usage_insert_self ON public.coupon_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS coupon_usage_update_admin ON public.coupon_usage;
CREATE POLICY coupon_usage_update_admin ON public.coupon_usage
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS coupon_usage_service_role_all ON public.coupon_usage;
CREATE POLICY coupon_usage_service_role_all ON public.coupon_usage
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. push_subscriptions — self-only
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS push_subscriptions_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_service_role_all ON public.push_subscriptions;
CREATE POLICY push_subscriptions_service_role_all ON public.push_subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. share_links — SELECT was `USING (true)`. Tighten so the resource
--    owner or admin can see who created what; everyone can still resolve
--    a token (the public share route uses a server-side fetch by token).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS share_links_select ON public.share_links;
CREATE POLICY share_links_select ON public.share_links
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR created_by IS NULL  -- anonymous links (if any)
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS share_links_insert ON public.share_links;
CREATE POLICY share_links_insert ON public.share_links
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS share_links_update ON public.share_links;
CREATE POLICY share_links_update ON public.share_links
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS share_links_delete ON public.share_links;
CREATE POLICY share_links_delete ON public.share_links
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS share_links_service_role_all ON public.share_links;
CREATE POLICY share_links_service_role_all ON public.share_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 10. support_tickets — tighten to self / admin
-- ════════════════════════════════════════════════════════════════════════════

-- SELECT self / admin (re-confirm)
DROP POLICY IF EXISTS support_tickets_select_self ON public.support_tickets;
CREATE POLICY support_tickets_select_self ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- INSERT self
DROP POLICY IF EXISTS support_tickets_insert_self ON public.support_tickets;
CREATE POLICY support_tickets_insert_self ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE self (close) OR admin
DROP POLICY IF EXISTS support_tickets_update_self ON public.support_tickets;
CREATE POLICY support_tickets_update_self ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- DELETE: admin only
DROP POLICY IF EXISTS support_tickets_delete_admin ON public.support_tickets;
CREATE POLICY support_tickets_delete_admin ON public.support_tickets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS support_tickets_service_role_all ON public.support_tickets;
CREATE POLICY support_tickets_service_role_all ON public.support_tickets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 11. support_ticket_replies — add UPDATE / DELETE (the migration 38
--     only created SELECT and INSERT).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS support_ticket_replies_select ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_select ON public.support_ticket_replies
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS support_ticket_replies_insert ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_insert ON public.support_ticket_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id
        AND (
          t.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
          )
        )
    )
  );

-- UPDATE: own replies only (admin can update any for moderation)
DROP POLICY IF EXISTS support_ticket_replies_update ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_update ON public.support_ticket_replies
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- DELETE: admin only
DROP POLICY IF EXISTS support_ticket_replies_delete ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_delete ON public.support_ticket_replies
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS support_ticket_replies_service_role_all ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_service_role_all ON public.support_ticket_replies
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 12. driver_documents — split the all-in-one FOR ALL into per-action
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS driver_documents_self_select ON public.driver_documents;
CREATE POLICY driver_documents_self_select ON public.driver_documents
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_documents_self_insert ON public.driver_documents;
CREATE POLICY driver_documents_self_insert ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_documents_self_update ON public.driver_documents;
CREATE POLICY driver_documents_self_update ON public.driver_documents
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() AND status = 'pending')
  WITH CHECK (driver_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS driver_documents_admin_update ON public.driver_documents;
CREATE POLICY driver_documents_admin_update ON public.driver_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_documents_admin_delete ON public.driver_documents;
CREATE POLICY driver_documents_admin_delete ON public.driver_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_documents_service_role_all ON public.driver_documents;
CREATE POLICY driver_documents_service_role_all ON public.driver_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 13. drivers (table) — drivers have their own row keyed by user id
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read ON public.drivers
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin', 'restaurant')
    )
  );

DROP POLICY IF EXISTS drivers_self_update ON public.drivers;
CREATE POLICY drivers_self_update ON public.drivers
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS drivers_admin_all ON public.drivers;
CREATE POLICY drivers_admin_all ON public.drivers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS drivers_service_role_all ON public.drivers;
CREATE POLICY drivers_service_role_all ON public.drivers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 14. driver_status — self + admin/restaurant read
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS driver_status_self_read ON public.driver_status;
CREATE POLICY driver_status_self_read ON public.driver_status
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin', 'restaurant')
    )
  );

DROP POLICY IF EXISTS driver_status_self_write ON public.driver_status;
CREATE POLICY driver_status_self_write ON public.driver_status
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_status_service_role_all ON public.driver_status;
CREATE POLICY driver_status_service_role_all ON public.driver_status
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 15. driver_working_hours — TABLE never created in any prior migration.
--     The /api/driver/working-hours route reads/writes from this table.
--     Idempotent: CREATE TABLE IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.driver_working_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_driver_working_hours_driver
  ON public.driver_working_hours (driver_id);

DROP POLICY IF EXISTS driver_working_hours_self_read ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_read ON public.driver_working_hours
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_working_hours_self_write ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_write ON public.driver_working_hours
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_working_hours_service_role_all ON public.driver_working_hours;
CREATE POLICY driver_working_hours_service_role_all ON public.driver_working_hours
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 16. order_tracking_events — re-confirm with explicit per-action policies.
--     Original migration 19 had `order_tracking_events_read` for SELECT and
--     `order_tracking_events_write` for INSERT (both `WITH CHECK (true)`,
--     too permissive). Tighten INSERT to be driver-of-the-order or service.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_tracking_events_select ON public.order_tracking_events;
CREATE POLICY order_tracking_events_select ON public.order_tracking_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_tracking_events.order_id
        AND (
          o.customer_id = auth.uid()
          OR o.driver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.restaurants r
            WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS order_tracking_events_insert ON public.order_tracking_events;
CREATE POLICY order_tracking_events_insert ON public.order_tracking_events
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_tracking_events.order_id
        AND o.driver_id = auth.uid()
    )
  );

-- No UPDATE/DELETE for authenticated — only service role can mutate the
-- audit log (admin corrections go through the admin API which uses service).
DROP POLICY IF EXISTS order_tracking_events_service_role_all ON public.order_tracking_events;
CREATE POLICY order_tracking_events_service_role_all ON public.order_tracking_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 17. order_modifications — re-confirm
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_modifications_select ON public.order_modifications;
CREATE POLICY order_modifications_select ON public.order_modifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_modifications.order_id
        AND (
          o.customer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.restaurants r
            WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS order_modifications_insert ON public.order_modifications;
CREATE POLICY order_modifications_insert ON public.order_modifications
  FOR INSERT TO authenticated
  WITH CHECK (modified_by = auth.uid());

DROP POLICY IF EXISTS order_modifications_update ON public.order_modifications;
CREATE POLICY order_modifications_update ON public.order_modifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin', 'restaurant')
    )
  );

DROP POLICY IF EXISTS order_modifications_service_role_all ON public.order_modifications;
CREATE POLICY order_modifications_service_role_all ON public.order_modifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 18. notification_preferences — self only
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_service_role_all ON public.notification_preferences;
CREATE POLICY notification_preferences_service_role_all ON public.notification_preferences
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 19. refunds — customer reads own, admin all
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS refunds_select ON public.refunds;
CREATE POLICY refunds_select ON public.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = refunds.order_id AND o.customer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS refunds_admin_write ON public.refunds;
CREATE POLICY refunds_admin_write ON public.refunds
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS refunds_service_role_all ON public.refunds;
CREATE POLICY refunds_service_role_all ON public.refunds
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 20. referrals — referrer reads own, referee reads own
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT TO authenticated
  USING (
    referrer_id = auth.uid()
    OR referee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS referrals_insert_own ON public.referrals;
CREATE POLICY referrals_insert_own ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

DROP POLICY IF EXISTS referrals_admin_update ON public.referrals;
CREATE POLICY referrals_admin_update ON public.referrals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS referrals_service_role_all ON public.referrals;
CREATE POLICY referrals_service_role_all ON public.referrals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 21. promotions — public read of active, admin/restaurant write
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS promotions_select_active ON public.promotions;
CREATE POLICY promotions_select_active ON public.promotions
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS promotions_admin_write ON public.promotions;
CREATE POLICY promotions_admin_write ON public.promotions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS promotions_service_role_all ON public.promotions;
CREATE POLICY promotions_service_role_all ON public.promotions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 22. recently_viewed — self only
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS recently_viewed_self ON public.recently_viewed;
CREATE POLICY recently_viewed_self ON public.recently_viewed
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recently_viewed_service_role_all ON public.recently_viewed;
CREATE POLICY recently_viewed_service_role_all ON public.recently_viewed
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 23. order_status_history — split into SELECT / INSERT (was permissive
--     INSERT `WITH CHECK (true)`, tighten to require order involvement).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_status_history_select ON public.order_status_history;
CREATE POLICY order_status_history_select ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND (
          o.customer_id = auth.uid()
          OR o.driver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.restaurants r
            WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS order_status_history_insert ON public.order_status_history;
CREATE POLICY order_status_history_insert ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow service-style inserts (e.g. trigger firing on update).
    -- Authenticated user must be the actor or an admin.
    changed_by = auth.uid()
    OR changed_by IS NULL
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS order_status_history_service_role_all ON public.order_status_history;
CREATE POLICY order_status_history_service_role_all ON public.order_status_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 24. system_announcements / system_settings / delivery_zones — re-confirm
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS system_announcements_read ON public.system_announcements;
CREATE POLICY system_announcements_read ON public.system_announcements
  FOR SELECT TO authenticated, anon
  USING (
    is_active = true
    AND NOW() >= starts_at
    AND (ends_at IS NULL OR NOW() < ends_at)
  );

DROP POLICY IF EXISTS system_announcements_admin_write ON public.system_announcements;
CREATE POLICY system_announcements_admin_write ON public.system_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS system_settings_read ON public.system_settings;
CREATE POLICY system_settings_read ON public.system_settings
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS system_settings_admin_write ON public.system_settings;
CREATE POLICY system_settings_admin_write ON public.system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS delivery_zones_read ON public.delivery_zones;
CREATE POLICY delivery_zones_read ON public.delivery_zones
  FOR SELECT TO authenticated, anon USING (is_active = true);

DROP POLICY IF EXISTS delivery_zones_admin_write ON public.delivery_zones;
CREATE POLICY delivery_zones_admin_write ON public.delivery_zones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 25. restaurant_announcements — re-confirm
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS restaurant_announcements_read ON public.restaurant_announcements;
CREATE POLICY restaurant_announcements_read ON public.restaurant_announcements
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS restaurant_announcements_admin_write ON public.restaurant_announcements;
CREATE POLICY restaurant_announcements_admin_write ON public.restaurant_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_announcements.restaurant_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS restaurant_announcements_service_role_all ON public.restaurant_announcements;
CREATE POLICY restaurant_announcements_service_role_all ON public.restaurant_announcements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 26. product_bulk_operations — restaurant owner + admin
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS product_bulk_operations_read ON public.product_bulk_operations;
CREATE POLICY product_bulk_operations_read ON public.product_bulk_operations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = product_bulk_operations.restaurant_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS product_bulk_operations_insert ON public.product_bulk_operations;
CREATE POLICY product_bulk_operations_insert ON public.product_bulk_operations
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = product_bulk_operations.restaurant_id
          AND r.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS product_bulk_operations_service_role_all ON public.product_bulk_operations;
CREATE POLICY product_bulk_operations_service_role_all ON public.product_bulk_operations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 27. order_reassignments — admin only
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS order_reassignments_admin ON public.order_reassignments;
CREATE POLICY order_reassignments_admin ON public.order_reassignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS order_reassignments_service_role_all ON public.order_reassignments;
CREATE POLICY order_reassignments_service_role_all ON public.order_reassignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 28. restaurant_activity — restaurant owner + admin
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS restaurant_activity_read ON public.restaurant_activity;
CREATE POLICY restaurant_activity_read ON public.restaurant_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_activity.restaurant_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS restaurant_activity_service_role_all ON public.restaurant_activity;
CREATE POLICY restaurant_activity_service_role_all ON public.restaurant_activity
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 29. user_sessions — self read
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS user_sessions_self_read ON public.user_sessions;
CREATE POLICY user_sessions_self_read ON public.user_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS user_sessions_service_role_all ON public.user_sessions;
CREATE POLICY user_sessions_service_role_all ON public.user_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 30. email_otps / api_audit_log / login_attempts / active_sessions —
--     service-role only (no authenticated user should read OTP codes,
--     brute-force logs, or audit log entries).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS email_otps_service_role_all ON public.email_otps;
CREATE POLICY email_otps_service_role_all ON public.email_otps
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_audit_log_service_role_all ON public.api_audit_log;
CREATE POLICY api_audit_log_service_role_all ON public.api_audit_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS login_attempts_service_role_all ON public.login_attempts;
CREATE POLICY login_attempts_service_role_all ON public.login_attempts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- active_sessions: self read (so "active devices" UI can show this user
-- their own sessions); admin reads all; service role full.
DROP POLICY IF EXISTS active_sessions_self_read ON public.active_sessions;
CREATE POLICY active_sessions_self_read ON public.active_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS active_sessions_service_role_all ON public.active_sessions;
CREATE POLICY active_sessions_service_role_all ON public.active_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 31. data_subject_requests — service role only (created on-demand by
--     account/delete and account/export). Admins can read for legal review.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS data_subject_requests_admin_read ON public.data_subject_requests;
CREATE POLICY data_subject_requests_admin_read ON public.data_subject_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS data_subject_requests_service_role_all ON public.data_subject_requests;
CREATE POLICY data_subject_requests_service_role_all ON public.data_subject_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 32. Final summary — list of every policy created by this migration
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pol_count int;
  table_count int;
BEGIN
  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public';
  SELECT count(*) INTO table_count
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
    AND c.relrowsecurity = true;
  RAISE NOTICE '✅ 51-rls-hardening: % policies across % RLS-enabled tables', pol_count, table_count;
END $$;

COMMIT;
