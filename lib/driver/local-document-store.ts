export interface LocalDriverDocument {
  id: string;
  driver_id: string;
  document_type: string;
  document_url: string;
  document_number: string | null;
  expires_at: string | null;
  submission_kind: 'file' | 'employer_lookup';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by?: string | null;
}

const localGlobal = globalThis as typeof globalThis & {
  __blinkgoLocalDriverDocuments?: Map<string, LocalDriverDocument>;
};

export const localDriverDocuments = localGlobal.__blinkgoLocalDriverDocuments
  ?? (localGlobal.__blinkgoLocalDriverDocuments = new Map<string, LocalDriverDocument>());

export function listLocalDriverDocuments(driverId?: string) {
  return Array.from(localDriverDocuments.values())
    .filter((document) => !driverId || document.driver_id === driverId)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export function reviewLocalDriverDocument(
  documentId: string,
  driverId: string,
  decision: 'approved' | 'rejected',
  reason: string | null,
  reviewerId: string,
) {
  const document = localDriverDocuments.get(documentId);
  if (!document || document.driver_id !== driverId) return null;
  const reviewed = {
    ...document,
    status: decision,
    rejection_reason: decision === 'rejected' ? reason : null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  } satisfies LocalDriverDocument;
  localDriverDocuments.set(documentId, reviewed);
  return reviewed;
}
