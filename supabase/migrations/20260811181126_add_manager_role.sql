-- Align the database enum with the application's canonical RBAC hierarchy.
-- manager is an operations role below admin and above non-admin portals.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager' AFTER 'admin';
