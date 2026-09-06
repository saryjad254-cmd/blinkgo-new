-- BlinkGo product governance: admin approval, safe archival and restaurant requests.
-- Existing products remain approved and customer-visible after this migration.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.products
SET approved_at = COALESCE(approved_at, created_at, NOW())
WHERE approval_status = 'approved' AND approved_at IS NULL;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_approval_status_check
    CHECK (approval_status IN ('approved', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_customer_visibility
  ON public.products (restaurant_id, approval_status, is_active, is_available)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.product_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
  suggested_price NUMERIC(10,2) NOT NULL CHECK (suggested_price > 0 AND suggested_price <= 9999),
  image_url TEXT,
  product_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resulting_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_requests_restaurant_status
  ON public.product_requests (restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_requests_admin_queue
  ON public.product_requests (status, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_requests_pending_name
  ON public.product_requests (restaurant_id, lower(name)) WHERE status = 'pending';

ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS products_restaurant_owner ON public.products;
DROP POLICY IF EXISTS products_insert_restaurant ON public.products;
DROP POLICY IF EXISTS products_delete_restaurant ON public.products;
DROP POLICY IF EXISTS products_customer_visible ON public.products;
DROP POLICY IF EXISTS products_admin_insert ON public.products;
DROP POLICY IF EXISTS products_owner_or_admin_update ON public.products;
DROP POLICY IF EXISTS products_admin_delete ON public.products;

CREATE POLICY products_customer_visible ON public.products FOR SELECT USING (
  (approval_status = 'approved' AND archived_at IS NULL AND is_active = TRUE AND is_available = TRUE)
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);

CREATE POLICY products_admin_insert ON public.products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);

CREATE POLICY products_owner_or_admin_update ON public.products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);

CREATE POLICY products_admin_delete ON public.products FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);

CREATE OR REPLACE FUNCTION public.protect_product_governance_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_role TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  SELECT role INTO actor_role FROM public.users WHERE id = auth.uid();
  IF actor_role IN ('admin','super_admin') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = OLD.restaurant_id AND r.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'product_not_owned' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['price','discount_price','is_available','stock','stock_count','track_stock','preparation_time','prep_time','updated_at','updated_by'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['price','discount_price','is_available','stock','stock_count','track_stock','preparation_time','prep_time','updated_at','updated_by']) THEN
    RAISE EXCEPTION 'restaurant_may_only_edit_operational_product_fields' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_product_governance_fields ON public.products;
CREATE TRIGGER trg_protect_product_governance_fields
  BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.protect_product_governance_fields();

DROP POLICY IF EXISTS product_requests_owner_select ON public.product_requests;
DROP POLICY IF EXISTS product_requests_owner_insert ON public.product_requests;
DROP POLICY IF EXISTS product_requests_admin_update ON public.product_requests;

CREATE POLICY product_requests_owner_select ON public.product_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = product_requests.restaurant_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);
CREATE POLICY product_requests_owner_insert ON public.product_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = product_requests.restaurant_id AND r.owner_id = auth.uid())
);
CREATE POLICY product_requests_admin_update ON public.product_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  OR auth.role() = 'service_role'
);

CREATE OR REPLACE FUNCTION public.approve_product_request(p_request_id UUID, p_edits JSONB DEFAULT '{}'::jsonb)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req public.product_requests%ROWTYPE; new_product_id UUID; actor_role TEXT;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id = auth.uid();
  IF actor_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO req FROM public.product_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'request_already_reviewed'; END IF;
  INSERT INTO public.products (
    restaurant_id, name, description, category, price, image_url, image_urls,
    is_active, is_available, approval_status, approved_by, approved_at, created_by, updated_by
  ) VALUES (
    req.restaurant_id,
    COALESCE(NULLIF(p_edits->>'name',''), req.name),
    COALESCE(p_edits->>'description', req.description),
    COALESCE(NULLIF(p_edits->>'category',''), req.category),
    COALESCE(NULLIF(p_edits->>'price','')::NUMERIC, req.suggested_price),
    COALESCE(NULLIF(p_edits->>'image_url',''), req.image_url),
    CASE WHEN COALESCE(NULLIF(p_edits->>'image_url',''), req.image_url) IS NULL THEN '{}'::TEXT[] ELSE ARRAY[COALESCE(NULLIF(p_edits->>'image_url',''), req.image_url)] END,
    TRUE, TRUE, 'approved', auth.uid(), NOW(), req.requested_by, auth.uid()
  ) RETURNING id INTO new_product_id;
  UPDATE public.product_requests SET status='approved', resulting_product_id=new_product_id,
    reviewed_by=auth.uid(), reviewed_at=NOW(), rejection_reason=NULL, updated_at=NOW()
  WHERE id=p_request_id AND status='pending';
  RETURN new_product_id;
END $$;

REVOKE ALL ON FUNCTION public.approve_product_request(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_product_request(UUID, JSONB) TO authenticated;
