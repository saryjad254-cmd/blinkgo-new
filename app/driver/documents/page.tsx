'use client';

import { useState, useEffect, useCallback } from 'react';
import Upload from 'lucide-react/dist/esm/icons/upload';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Shield from 'lucide-react/dist/esm/icons/shield';
import IdCard from 'lucide-react/dist/esm/icons/id-card';
import Car from 'lucide-react/dist/esm/icons/car';
import FileCheck from 'lucide-react/dist/esm/icons/file-check';
import UserCheck from 'lucide-react/dist/esm/icons/user-check';
import HeartPulse from 'lucide-react/dist/esm/icons/heart-pulse';
import ReceiptText from 'lucide-react/dist/esm/icons/receipt-text';
import Landmark from 'lucide-react/dist/esm/icons/landmark';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import X from 'lucide-react/dist/esm/icons/x';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

const DOC_TYPES = [
  {
    key: 'license',
    icon: IdCard,
    color: 'text-brand-red-500',
    bg: 'bg-brand-red-500/15',
    label: { de: 'Führerschein', ar: 'رخصة القيادة', en: 'Driver\'s License' },
    desc: { de: 'Gültiger Führerschein Klasse B oder höher', ar: 'رخصة قيادة سارية المفعول', en: 'Valid Class B license or higher' },
  },
  {
    key: 'insurance',
    icon: Shield,
    color: 'text-info',
    bg: 'bg-info/15',
    label: { de: 'Versicherung', ar: 'التأمين', en: 'Insurance' },
    desc: { de: 'Kfz-Haftpflichtversicherung', ar: 'تأمين على المركبة', en: 'Vehicle liability insurance' },
  },
  {
    key: 'vehicle_registration',
    icon: Car,
    color: 'text-violet',
    bg: 'bg-violet/15',
    label: { de: 'Fahrzeugschein', ar: 'تسجيل المركبة', en: 'Vehicle Registration' },
    desc: { de: 'Zulassungsbescheinigung Teil I', ar: 'شهادة التسجيل', en: 'Vehicle registration document' },
  },
  {
    key: 'id_proof',
    icon: UserCheck,
    color: 'text-success',
    bg: 'bg-success/15',
    label: { de: 'Ausweis', ar: 'الهوية', en: 'ID Proof' },
    desc: { de: 'Personalausweis oder Reisepass', ar: 'بطاقة الهوية أو جواز السفر', en: 'National ID or passport' },
  },
  {
    key: 'employment_contract',
    icon: FileCheck,
    color: 'text-brand-yellow-500',
    bg: 'bg-brand-yellow-500/15',
    label: { de: 'Arbeitsvertrag', ar: 'عقد العمل', en: 'Employment Contract' },
    desc: { de: 'Von BlinkGo und Fahrer unterzeichneter Arbeitsvertrag', ar: 'عقد العمل الموقّع من بلينك جو والسائق', en: 'Employment contract signed by BlinkGo and the driver' },
  },
  {
    key: 'health_insurance',
    icon: HeartPulse,
    color: 'text-success',
    bg: 'bg-success/15',
    label: { de: 'Krankenkasse / Versicherung', ar: 'التأمين الصحي', en: 'Health Insurance' },
    desc: { de: 'Gewählte Krankenkasse oder privater Versicherungsnachweis', ar: 'بيانات صندوق التأمين الصحي أو إثبات التأمين الخاص', en: 'Chosen statutory insurer or private insurance proof' },
  },
  {
    key: 'tax_id_confirmation',
    icon: ReceiptText,
    color: 'text-info',
    bg: 'bg-info/15',
    label: { de: 'Steuer-ID (ELStAM)', ar: 'الرقم الضريبي', en: 'Tax ID (ELStAM)' },
    desc: { de: 'Nachweis der steuerlichen Identifikationsnummer für die Lohnabrechnung', ar: 'إثبات رقم التعريف الضريبي المطلوب للرواتب', en: 'Tax identification evidence for payroll' },
  },
  {
    key: 'payout_account_verification',
    icon: Landmark,
    color: 'text-brand-red-500',
    bg: 'bg-brand-red-500/15',
    label: { de: 'Auszahlungskonto (IBAN)', ar: 'حساب تحويل الراتب (IBAN)', en: 'Payout Account (IBAN)' },
    desc: { de: 'Banknachweis für Gehaltszahlungen – keine Karten-, PIN- oder CVV-Daten', ar: 'إثبات حساب لتحويل الراتب — بدون صورة بطاقة أو PIN أو CVV', en: 'Bank proof for salary payments — no card, PIN or CVV data' },
  },
  {
    key: 'social_insurance_number_proof',
    icon: Shield,
    color: 'text-violet',
    bg: 'bg-violet/15',
    label: { de: 'Renten-/Sozialversicherungsnummer', ar: 'الرقم التقاعدي (رقم التأمين الاجتماعي)', en: 'Pension / Social Insurance Number' },
    desc: { de: 'Nachweis der Rentenversicherungsnummer (Sozialversicherungsnummer); falls unbekannt, kann die Lohnstelle sie sicher abfragen', ar: 'إثبات الرقم التقاعدي الألماني (رقم التأمين الاجتماعي)؛ ويمكن لقسم الرواتب الاستعلام عنه بأمان إذا لم يكن معروفاً', en: 'German pension insurance number proof (social insurance number); payroll can retrieve it securely if unknown' },
  },
];

const COPY = {
  de: {
    title: 'Dokumente',
    subtitle: 'Laden Sie Ihre Fahrerdokumente hoch',
    status: {
      approved: 'Genehmigt',
      pending: 'Wird geprüft',
      rejected: 'Abgelehnt',
      expired: 'Abgelaufen',
      missing: 'Fehlt',
    },
    upload: 'Hochladen',
    uploading: 'Wird hochgeladen...',
    expires: 'Gültig bis',
    rejectionReason: 'Ablehnungsgrund',
    completeProfile: 'Profil vervollständigen',
    allRequired: 'Alle Dokumente erforderlich',
    requestLookup: 'Nummer unbekannt? Lohnstelle soll sie abfragen',
    requestingLookup: 'Anfrage wird gesendet...',
    lookupRequested: 'Die Lohnstelle wurde mit der Abfrage beauftragt.',
  },
  ar: {
    title: 'المستندات',
    subtitle: 'قم بتحميل مستندات السائق الخاصة بك',
    status: {
      approved: 'موافق عليه',
      pending: 'قيد المراجعة',
      rejected: 'مرفوض',
      expired: 'منتهي',
      missing: 'مفقود',
    },
    upload: 'تحميل',
    uploading: 'جاري التحميل...',
    expires: 'صالح حتى',
    rejectionReason: 'سبب الرفض',
    completeProfile: 'إكمال الملف الشخصي',
    allRequired: 'جميع المستندات مطلوبة',
    requestLookup: 'الرقم غير معروف؟ اطلب من قسم الرواتب الاستعلام عنه',
    requestingLookup: 'جارٍ إرسال الطلب...',
    lookupRequested: 'تم إرسال طلب الاستعلام إلى قسم الرواتب.',
  },
  en: {
    title: 'Documents',
    subtitle: 'Upload your driver documents',
    status: {
      approved: 'Approved',
      pending: 'Under review',
      rejected: 'Rejected',
      expired: 'Expired',
      missing: 'Missing',
    },
    upload: 'Upload',
    uploading: 'Uploading...',
    expires: 'Valid until',
    rejectionReason: 'Rejection reason',
    completeProfile: 'Complete profile',
    allRequired: 'All documents required',
    requestLookup: 'Number unknown? Ask payroll to retrieve it',
    requestingLookup: 'Sending request...',
    lookupRequested: 'Payroll lookup has been requested.',
  },
};

interface Document {
  id: string;
  document_type: string;
  document_number?: string;
  expires_at?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejection_reason?: string;
  uploaded_at: string;
  submission_kind?: 'file' | 'employer_lookup';
}

/**
 * Driver Documents page — manage license, insurance, vehicle registration.
 *
 * Features:
 * - View status of all required documents
 * - Upload missing documents
 * - Re-upload rejected documents
 * - See expiry dates
 * - Get notified when documents are expiring soon
 */
export default function DriverDocumentsPage() {
  const { locale } = useI18n();
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const { toast } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [requiredTypes, setRequiredTypes] = useState<string[]>(DOC_TYPES.map((type) => type.key));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [requestingLookup, setRequestingLookup] = useState(false);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [referenceTime] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/driver/documents');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error?.message || 'Failed to load documents');
      setDocuments(json.data.documents ?? []);
      setRequiredTypes(json.data.required_documents ?? DOC_TYPES.map((type) => type.key));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const getDoc = (type: string) => documents.find((d) => d.document_type === type);

  const closeUpload = () => {
    setUploadType(null);
    setUploadFile(null);
    setDocumentNumber('');
    setExpiresAt('');
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadType || !uploadFile) {
      toast({ type: 'error', message: locale === 'de' ? 'Bitte eine Datei auswählen' : locale === 'ar' ? 'يرجى اختيار ملف' : 'Choose a file' });
      return;
    }

    setUploading(uploadType);
    try {
      const form = new FormData();
      form.set('document_type', uploadType);
      form.set('file', uploadFile);
      if (documentNumber.trim()) form.set('document_number', documentNumber.trim());
      if (expiresAt) form.set('expires_at', expiresAt);
      const res = await fetch('/api/driver/documents', {
        method: 'POST',
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        toast({ type: 'success', message: locale === 'de' ? 'Dokument hochgeladen' : locale === 'ar' ? 'تم التحميل' : 'Document uploaded' });
        closeUpload();
        await load();
      } else {
        toast({ type: 'error', message: json.error?.message || 'Failed' });
      }
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Upload failed' });
    } finally {
      setUploading(null);
    }
  };

  const requestInsuranceNumberLookup = async () => {
    setRequestingLookup(true);
    try {
      const res = await fetch('/api/driver/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_social_insurance_lookup' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(extractErrorMessage(json, 'Request failed'));
      toast({ type: 'success', message: copy.lookupRequested });
      await load();
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Request failed' });
    } finally {
      setRequestingLookup(false);
    }
  };

  const visibleDocumentTypes = DOC_TYPES.filter((type) => requiredTypes.includes(type.key));
  const approved = visibleDocumentTypes.filter((type) => getDoc(type.key)?.status === 'approved').length;
  const total = visibleDocumentTypes.length;
  const completion = total > 0 ? Math.round((approved / total) * 100) : 0;
  const showsDocumentNumber = uploadType === 'license' || uploadType === 'insurance' || uploadType === 'vehicle_registration' || uploadType === 'id_proof';
  const showsExpiry = uploadType === 'license' || uploadType === 'insurance' || uploadType === 'vehicle_registration' || uploadType === 'id_proof' || uploadType === 'health_insurance';

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} back backHref="/driver/settings" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Progress card */}
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold text-text">{copy.completeProfile}</p>
              <p className="text-xs text-text-muted">{approved}/{total} {copy.allRequired}</p>
            </div>
            <div className="text-2xl font-black text-brand-red-500 tabular-nums">{completion}%</div>
          </div>
          <div className="h-2 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active transition-all duration-500"
              style={{ width: `${completion}%` }}
            />
          </div>
        </Card>

        {/* Document list */}
        {loading ? (
          <div className="space-y-3">
            {visibleDocumentTypes.map((type) => (
              <div key={type.key} className="h-24 rounded-2xl bg-bg-elevated animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <Card variant="glass" padding="md" className="text-center">
            <AlertTriangle className="mx-auto mb-2 size-8 text-warning" />
            <p className="font-bold text-white">{locale === 'de' ? 'Dokumente konnten nicht geladen werden' : locale === 'ar' ? 'تعذر تحميل المستندات' : 'Documents could not be loaded'}</p>
            <p className="mt-1 text-xs text-text-muted">{locale === 'de' ? 'Bitte prüfe die Verbindung und versuche es erneut.' : locale === 'ar' ? 'تحقق من الاتصال وحاول مجددًا.' : 'Check your connection and try again.'}</p>
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-4 text-sm font-bold text-white"><RefreshCw className="size-4" />{locale === 'de' ? 'Erneut versuchen' : locale === 'ar' ? 'إعادة المحاولة' : 'Try again'}</button>
          </Card>
        ) : (
          visibleDocumentTypes.map((docType) => {
            const doc = getDoc(docType.key);
            const Icon = docType.icon;
            const status = doc?.status || 'missing';
            const statusLabel = copy.status[status as keyof typeof copy.status];
            const isExpiringSoon = doc?.expires_at && new Date(doc.expires_at).getTime() - referenceTime < 30 * 24 * 60 * 60 * 1000;

            return (
              <Card key={docType.key} variant="glass" padding="md" className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', docType.bg)}>
                    <Icon className={cn('w-5 h-5', docType.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-[1_1_12rem]">
                        <p className="break-words text-sm font-bold text-text [overflow-wrap:anywhere]">{docType.label[locale] || docType.label.en}</p>
                        <p className="text-xs text-text-muted leading-snug mt-0.5">{docType.desc[locale] || docType.desc.en}</p>
                      </div>
                      <StatusBadge status={status} label={statusLabel} />
                    </div>
                  </div>
                </div>

                {doc && (
                  <div className="space-y-2 text-xs">
                    {doc.expires_at && (
                      <div className="flex items-center gap-2 text-text-muted">
                        <Clock className="w-3 h-3" />
                        <span>{copy.expires}: {new Date(doc.expires_at).toLocaleDateString(locale)}</span>
                        {isExpiringSoon && status === 'approved' && (
                          <span className="text-warning font-bold">
                            ({locale === 'de' ? 'läuft bald ab' : locale === 'ar' ? 'ينتهي قريباً' : 'expires soon'})
                          </span>
                        )}
                      </div>
                    )}
                    {doc.rejection_reason && (
                      <div className="p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger">
                        <strong>{copy.rejectionReason}:</strong> {doc.rejection_reason}
                      </div>
                    )}
                    {doc.submission_kind === 'employer_lookup' && doc.status === 'pending' && (
                      <div className="rounded-lg border border-info/30 bg-info/10 p-2 font-bold text-info" role="status">
                        {copy.lookupRequested}
                      </div>
                    )}
                  </div>
                )}

                {docType.key === 'social_insurance_number_proof' && doc?.status !== 'approved' && !(doc?.submission_kind === 'employer_lookup' && doc.status === 'pending') && (
                  <button
                    type="button"
                    disabled={requestingLookup}
                    onClick={() => void requestInsuranceNumberLookup()}
                    className="min-h-11 w-full rounded-xl border border-info/40 bg-info/10 px-3 text-xs font-black text-info transition hover:bg-info/15 disabled:opacity-50"
                  >
                    {requestingLookup ? copy.requestingLookup : copy.requestLookup}
                  </button>
                )}

                <Button
                  variant={status === 'approved' ? 'outline' : status === 'rejected' ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  loading={uploading === docType.key}
                  icon={status === 'approved' ? <RefreshCw className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  onClick={() => setUploadType(docType.key)}
                >
                  {uploading === docType.key ? copy.uploading : copy.upload}
                </Button>
              </Card>
            );
          })
        )}
      </div>

      {uploadType && (
        <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={closeUpload} role="presentation">
          <form className="w-full max-w-md rounded-3xl border border-edge bg-bg-elevated p-5 shadow-2xl" onSubmit={handleUpload} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="document-upload-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="document-upload-title" className="text-lg font-black text-white">
                  {locale === 'de' ? 'Dokument hochladen' : locale === 'ar' ? 'رفع مستند' : 'Upload document'}
                </h2>
                <p className="text-xs text-text-muted">{DOC_TYPES.find((item) => item.key === uploadType)?.label[locale]}</p>
              </div>
              <button type="button" onClick={closeUpload} className="grid size-11 place-items-center rounded-xl bg-ink-700 text-text-secondary" aria-label={locale === 'de' ? 'Schließen' : locale === 'ar' ? 'إغلاق' : 'Close'}><X className="size-5" /></button>
            </div>

            <label className="block text-sm font-bold text-white">
              {locale === 'de' ? 'Datei' : locale === 'ar' ? 'الملف' : 'File'}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required onChange={(event) => setUploadFile(event.target.files?.[0] || null)} className="mt-2 block min-h-12 w-full rounded-xl border border-edge bg-ink-700 p-2 text-sm text-text-secondary file:me-3 file:rounded-lg file:border-0 file:bg-brand-red file:px-3 file:py-2 file:font-bold file:text-white" />
            </label>
            <p className="mt-1 text-xs text-text-muted">{locale === 'de' ? 'PDF, JPG, PNG oder WebP · max. 10 MB' : locale === 'ar' ? 'PDF أو JPG أو PNG أو WebP · بحد أقصى 10 MB' : 'PDF, JPG, PNG or WebP · max. 10 MB'}</p>

            {uploadType === 'payout_account_verification' && (
              <div className="mt-4 rounded-xl border border-warning/35 bg-warning/10 p-3 text-xs leading-relaxed text-warning" role="note">
                {locale === 'de'
                  ? 'Nur einen Banknachweis mit Kontoinhaber und IBAN hochladen. Niemals Kartenfoto, Kartennummer, PIN oder CVV senden.'
                  : locale === 'ar'
                    ? 'ارفع فقط إثبات الحساب الذي يظهر اسم صاحب الحساب وIBAN. لا ترسل أبداً صورة البطاقة أو رقمها أو PIN أو CVV.'
                    : 'Upload only bank proof showing the account holder and IBAN. Never send a card photo, card number, PIN or CVV.'}
              </div>
            )}

            {showsDocumentNumber && (
              <label className="mt-4 block text-sm font-bold text-white">
                {locale === 'de' ? 'Dokumentennummer (optional)' : locale === 'ar' ? 'رقم المستند (اختياري)' : 'Document number (optional)'}
                <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} maxLength={100} className="mt-2 h-12 w-full rounded-xl border border-edge bg-ink-700 px-3 text-white" autoComplete="off" />
              </label>
            )}

            {showsExpiry && (
              <label className="mt-4 block text-sm font-bold text-white">
                {locale === 'de' ? 'Gültig bis (optional)' : locale === 'ar' ? 'صالح حتى (اختياري)' : 'Valid until (optional)'}
                <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} min={new Date(referenceTime).toISOString().slice(0, 10)} className="mt-2 h-12 w-full rounded-xl border border-edge bg-ink-700 px-3 text-white" />
              </label>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={closeUpload} className="h-12 rounded-xl bg-ink-700 font-bold text-text-secondary">{locale === 'de' ? 'Abbrechen' : locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button type="submit" disabled={!uploadFile || Boolean(uploading)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-red font-bold text-white disabled:opacity-50">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {copy.upload}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const config: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
    approved: { bg: 'bg-success/15', text: 'text-success', icon: CheckCircle2 },
    pending:  { bg: 'bg-warning/15', text: 'text-warning', icon: Clock },
    rejected: { bg: 'bg-danger/15',  text: 'text-danger',  icon: XCircle },
    expired:  { bg: 'bg-danger/15',  text: 'text-danger',  icon: AlertTriangle },
    missing:  { bg: 'bg-surface-light', text: 'text-text-muted', icon: AlertTriangle },
  };
  const c = config[status] || config.missing;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full border border-edge px-2 text-2xs font-bold', c.bg, c.text)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
