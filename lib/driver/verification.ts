export const DRIVER_DOCUMENT_TYPES = [
  'id_proof',
  'license',
  'insurance',
  'vehicle_registration',
  'employment_contract',
  'health_insurance',
  'tax_id_confirmation',
  'social_insurance_number_proof',
  'payout_account_verification',
  // Legacy only: accepted for historic rows, but no longer required.
  'background_check',
] as const;

export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];
export type DriverDocumentStatus = 'missing' | 'pending' | 'approved' | 'rejected' | 'expired';

const MOTORISED = new Set(['scooter', 'motorcycle', 'car']);

/** BlinkGo's conservative onboarding policy; legal/insurance counsel can tighten it per fleet type. */
export function requiredDriverDocuments(vehicleType: string | null | undefined): DriverDocumentType[] {
  const required: DriverDocumentType[] = [
    'id_proof',
    'employment_contract',
    'health_insurance',
    'tax_id_confirmation',
    'social_insurance_number_proof',
    'payout_account_verification',
  ];
  if (MOTORISED.has(String(vehicleType))) {
    required.push('license', 'insurance', 'vehicle_registration');
  }
  return required;
}

export function latestDocumentStatuses(
  documents: Array<{ document_type: string; status: string; uploaded_at?: string | null }>,
) {
  const sorted = [...documents].sort((a, b) =>
    String(b.uploaded_at ?? '').localeCompare(String(a.uploaded_at ?? '')),
  );
  const statuses = new Map<string, DriverDocumentStatus>();
  for (const document of sorted) {
    if (!statuses.has(document.document_type)) {
      statuses.set(document.document_type, document.status as DriverDocumentStatus);
    }
  }
  return statuses;
}

export function isDriverVerificationComplete(
  vehicleType: string | null | undefined,
  documents: Array<{ document_type: string; status: string; uploaded_at?: string | null }>,
) {
  const statuses = latestDocumentStatuses(documents);
  return requiredDriverDocuments(vehicleType).every((type) => statuses.get(type) === 'approved');
}
