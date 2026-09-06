-- A driver must never enter dispatch before the required documents are approved.
ALTER TABLE IF EXISTS public.drivers
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Recalculate from evidence instead of trusting legacy user flags.
UPDATE public.drivers d
SET is_approved = CASE
  WHEN d.vehicle_type IN ('scooter', 'motorcycle', 'car') THEN
    9 = (SELECT COUNT(DISTINCT dd.document_type) FROM public.driver_documents dd
         WHERE dd.driver_id = d.id AND dd.status = 'approved'
           AND dd.document_type IN ('id_proof', 'employment_contract', 'health_insurance', 'tax_id_confirmation', 'social_insurance_number_proof', 'payout_account_verification', 'license', 'insurance', 'vehicle_registration'))
  ELSE
    6 = (SELECT COUNT(DISTINCT dd.document_type) FROM public.driver_documents dd
         WHERE dd.driver_id = d.id AND dd.status = 'approved'
           AND dd.document_type IN ('id_proof', 'employment_contract', 'health_insurance', 'tax_id_confirmation', 'social_insurance_number_proof', 'payout_account_verification'))
END;

UPDATE public.users u
SET is_verified = d.is_approved
FROM public.drivers d
WHERE u.id = d.id AND u.role = 'driver';

UPDATE public.driver_status ds
SET is_online = false,
    is_on_delivery = false,
    current_order_id = NULL,
    updated_at = NOW()
FROM public.drivers d
WHERE ds.driver_id = d.id AND d.is_approved = false;

UPDATE public.drivers
SET is_online = false, is_available = false, status = 'pending'
WHERE is_approved = false;

CREATE INDEX IF NOT EXISTS idx_drivers_dispatch_approved
  ON public.drivers (is_approved, is_online, is_available);

COMMENT ON COLUMN public.drivers.is_approved IS
  'Operational approval after all required identity and vehicle documents have passed admin review.';
