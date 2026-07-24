'use client';

import { useState, useEffect } from 'react';
import {
  FileText, Upload, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronLeft, Shield, IdCard, Car, FileCheck, UserCheck, RefreshCw, Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

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
    key: 'background_check',
    icon: FileCheck,
    color: 'text-brand-yellow-500',
    bg: 'bg-brand-yellow-500/15',
    label: { de: 'Führungszeugnis', ar: 'سجل العدلية', en: 'Background Check' },
    desc: { de: 'Polizeiliches Führungszeugnis', ar: 'شهادة حسن السيرة', en: 'Police clearance certificate' },
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
  },
};

interface Document {
  id: string;
  document_type: string;
  document_url: string;
  document_number?: string;
  expires_at?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejection_reason?: string;
  uploaded_at: string;
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await fetch('/api/driver/documents');
      const json = await res.json();
      if (json.ok) setDocuments(json.data.documents ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getDoc = (type: string) => documents.find((d) => d.document_type === type);

  const handleUpload = async (type: string) => {
    const url = window.prompt(
      locale === 'de' ? 'URL des hochgeladenen Dokuments:' :
      locale === 'ar' ? 'رابط المستند المحمّل:' :
      'URL of uploaded document:',
    );
    if (!url) return;

    const number = window.prompt(
      locale === 'de' ? 'Dokumentennummer (optional):' :
      locale === 'ar' ? 'رقم المستند (اختياري):' :
      'Document number (optional):',
    ) || undefined;

    const expiry = window.prompt(
      locale === 'de' ? 'Ablaufdatum (YYYY-MM-DD, optional):' :
      locale === 'ar' ? 'تاريخ الانتهاء (YYYY-MM-DD، اختياري):' : 'Expiry date (YYYY-MM-DD, optional):',
    ) || undefined;

    setUploading(type);
    try {
      const res = await fetch('/api/driver/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: type,
          document_url: url,
          document_number: number,
          expires_at: expiry,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ type: 'success', message: locale === 'de' ? 'Dokument hochgeladen' : locale === 'ar' ? 'تم التحميل' : 'Document uploaded' });
        await load();
      } else {
        toast({ type: 'error', message: json.error?.message || 'Failed' });
      }
    } catch (e: any) {
      toast({ type: 'error', message: e.message });
    } finally {
      setUploading(null);
    }
  };

  const approved = documents.filter((d) => d.status === 'approved').length;
  const total = DOC_TYPES.length;
  const completion = Math.round((approved / total) * 100);

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

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
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-bg-elevated animate-pulse" />
            ))}
          </div>
        ) : (
          DOC_TYPES.map((docType) => {
            const doc = getDoc(docType.key);
            const Icon = docType.icon;
            const status = doc?.status || 'missing';
            const statusLabel = copy.status[status as keyof typeof copy.status];
            const isExpiringSoon = doc?.expires_at && new Date(doc.expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

            return (
              <Card key={docType.key} variant="glass" padding="md" className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', docType.bg)}>
                    <Icon className={cn('w-5 h-5', docType.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-text">{(docType.label as any)[locale] || docType.label.en}</p>
                        <p className="text-xs text-text-muted leading-snug mt-0.5">{(docType.desc as any)[locale] || docType.desc.en}</p>
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
                  </div>
                )}

                <Button
                  variant={status === 'approved' ? 'outline' : status === 'rejected' ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  loading={uploading === docType.key}
                  icon={status === 'approved' ? <RefreshCw className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  onClick={() => handleUpload(docType.key)}
                >
                  {uploading === docType.key ? copy.uploading : copy.upload}
                </Button>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const config: Record<string, { bg: string; text: string; icon: any }> = {
    approved: { bg: 'bg-success/15', text: 'text-success', icon: CheckCircle2 },
    pending:  { bg: 'bg-warning/15', text: 'text-warning', icon: Clock },
    rejected: { bg: 'bg-danger/15',  text: 'text-danger',  icon: XCircle },
    expired:  { bg: 'bg-danger/15',  text: 'text-danger',  icon: AlertTriangle },
    missing:  { bg: 'bg-surface-light', text: 'text-text-muted', icon: AlertTriangle },
  };
  const c = config[status] || config.missing;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full text-2xs font-bold border border-edge', c.bg, c.text)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
