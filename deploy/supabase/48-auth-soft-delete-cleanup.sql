-- ============================================================
-- BlinkGo v79.2 — Migration 48: Auth Soft-Delete Cleanup
-- ============================================================
--
-- PURPOSE
-- -------
-- On this Supabase project, `auth.users.email` is guarded by a
-- UNIQUE INDEX that covers ALL rows in the table (not partial).
-- GoTrue's `deleteUser` is a SOFT delete — it sets
-- `deleted_at = now()` but leaves the row in place. That means
-- once an email has been used and soft-deleted, the row physically
-- blocks any new insert with the same email. The Admin API
-- `createUser` then returns:
--
--   "duplicate key value violates unique constraint users_email_key"
--
-- even though the user is invisible to `listUsers` (which filters
-- by `deleted_at IS NULL`).
--
-- This migration un-deletes any pre-existing soft-deleted operator
-- rows, re-assigns them to the canonical UUIDs the rest of the
-- system references, marks the email as confirmed, and writes
-- display-name + provenance into `raw_user_meta_data`.
--
-- PASSWORD HANDLING
-- -----------------
-- PostgreSQL cannot bcrypt. We DO NOT touch `encrypted_password`
-- from SQL. After this migration runs, the operator must execute:
--
--   node scripts/setup-operator-accounts.mjs
--
-- which calls the Supabase Admin API to set a fresh password
-- on each canonical UUID. (The Admin API performs the bcrypt
-- server-side.)
--
-- HOW TO RUN
-- ----------
-- Open the Supabase SQL editor at
--   https://supabase.com/dashboard/project/rhdaffhlrglyknxtucux/sql
-- and paste the entire contents of this file, then click "Run".
--
-- IDEMPOTENT
-- ----------
-- Safe to re-run. The final SELECT at the bottom shows the
-- canonical UUIDs and their state.
-- ============================================================

DO $$
DECLARE
  v_email text;
  v_canonical_id uuid;
  v_display_name text;
  v_old_id uuid;
  v_deleted_at timestamptz;
BEGIN
  FOR v_email, v_canonical_id, v_display_name IN
    VALUES
      ('admin@blinkgo.de',      '00000000-0000-0000-0000-0000000000a1', 'BlinkGo Admin'),
      ('restaurant@blinkgo.de', '00000000-0000-0000-0000-0000000000a2', 'BlinkGo Restaurant Owner'),
      ('driver@blinkgo.de',     '00000000-0000-0000-0000-0000000000a3', 'BlinkGo Driver')
  LOOP
    -- Find any existing row (including soft-deleted) for this email.
    SELECT u.id, u.deleted_at
      INTO v_old_id, v_deleted_at
      FROM auth.users u
     WHERE u.email = v_email
     ORDER BY (u.deleted_at IS NULL) DESC, u.created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_old_id IS NULL THEN
      RAISE NOTICE '[migration 48] % — no existing row, Admin API will create', v_email;
      CONTINUE;
    END IF;

    RAISE NOTICE '[migration 48] % — found id=%, deleted_at=%', v_email, v_old_id, v_deleted_at;

    -- Step 1: un-delete
    IF v_deleted_at IS NOT NULL THEN
      UPDATE auth.users SET deleted_at = NULL, updated_at = now() WHERE id = v_old_id;
      RAISE NOTICE '[migration 48]   un-deleted';
    END IF;

    -- Step 2: re-ID to canonical if needed
    IF v_old_id <> v_canonical_id THEN
      DELETE FROM auth.identities      WHERE user_id = v_old_id;
      DELETE FROM auth.sessions        WHERE user_id = v_old_id;
      DELETE FROM auth.mfa_factors     WHERE user_id = v_old_id;
      DELETE FROM auth.one_time_tokens WHERE user_id = v_old_id;
      DELETE FROM auth.refresh_tokens  WHERE user_id = v_old_id;
      UPDATE auth.users SET id = v_canonical_id, updated_at = now() WHERE id = v_old_id;
      RAISE NOTICE '[migration 48]   re-id: % -> %', v_old_id, v_canonical_id;
    END IF;

    -- Step 3: confirm email + meta-data
    UPDATE auth.users
       SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                             || jsonb_build_object(
                                  'name', v_display_name,
                                  'source', 'v79.2-operator-setup',
                                  'pre_launch', true
                                ),
           updated_at = now()
     WHERE id = v_canonical_id;
    RAISE NOTICE '[migration 48]   email confirmed, meta updated';
  END LOOP;
END
$$;

-- Final state of the canonical operator UUIDs.
SELECT
  u.id::text                    AS canonical_id,
  u.email,
  (u.deleted_at IS NULL)        AS is_active,
  (u.email_confirmed_at IS NOT NULL) AS is_confirmed,
  u.created_at
FROM auth.users u
WHERE u.id IN (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3'
)
ORDER BY u.email;
