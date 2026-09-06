'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Camera from 'lucide-react/dist/esm/icons/camera';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Eye from 'lucide-react/dist/esm/icons/eye';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import Plus from 'lucide-react/dist/esm/icons/plus';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Send from 'lucide-react/dist/esm/icons/send';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import X from 'lucide-react/dist/esm/icons/x';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

type IssueType = 'missing_item' | 'wrong_order' | 'damaged_item' | 'quality_issue' | 'late_delivery' | 'payment_issue' | 'account_issue' | 'technical_issue' | 'safety_issue' | 'other';
type NextAction = 'waiting_support' | 'waiting_customer' | 'refund_review' | 'merchant_review' | 'driver_review' | 'resolved';

const ISSUES: Array<{ key: IssueType; de: string; ar: string; en: string; photo: boolean; order: boolean }> = [
  { key: 'missing_item', de: 'Artikel fehlt', ar: 'عنصر ناقص', en: 'Missing item', photo: false, order: true },
  { key: 'wrong_order', de: 'Falsche Bestellung', ar: 'طلب خاطئ', en: 'Wrong order', photo: true, order: true },
  { key: 'damaged_item', de: 'Beschädigter Artikel', ar: 'منتج متضرر', en: 'Damaged item', photo: true, order: true },
  { key: 'quality_issue', de: 'Qualitätsproblem', ar: 'مشكلة جودة', en: 'Quality issue', photo: true, order: true },
  { key: 'late_delivery', de: 'Verspätete Lieferung', ar: 'توصيل متأخر', en: 'Late delivery', photo: false, order: true },
  { key: 'payment_issue', de: 'Zahlungsproblem', ar: 'مشكلة دفع', en: 'Payment issue', photo: true, order: false },
  { key: 'account_issue', de: 'Kontoproblem', ar: 'مشكلة حساب', en: 'Account issue', photo: true, order: false },
  { key: 'technical_issue', de: 'Technisches Problem', ar: 'مشكلة تقنية', en: 'Technical issue', photo: true, order: false },
  { key: 'safety_issue', de: 'Sicherheitsproblem', ar: 'مشكلة سلامة', en: 'Safety issue', photo: true, order: false },
  { key: 'other', de: 'Sonstiges', ar: 'أخرى', en: 'Other', photo: true, order: false },
];

const STATUS = {
  open: { color: 'border-info/30 bg-info/15 text-info', de: 'Offen', ar: 'مفتوحة', en: 'Open' },
  in_progress: { color: 'border-warning/30 bg-warning/15 text-warning', de: 'In Bearbeitung', ar: 'قيد المعالجة', en: 'In progress' },
  waiting_user: { color: 'border-brand-yellow/30 bg-brand-yellow/15 text-brand-yellow', de: 'Wartet auf dich', ar: 'بانتظارك', en: 'Waiting for you' },
  resolved: { color: 'border-success/30 bg-success/15 text-success', de: 'Gelöst', ar: 'تم الحل', en: 'Resolved' },
  closed: { color: 'border-border bg-surface-3 text-text-muted', de: 'Geschlossen', ar: 'مغلقة', en: 'Closed' },
} as const;

const COPY = {
  de: {
    title: 'Support', newTicket: 'Neue Anfrage', noTickets: 'Noch keine Anfragen', noTicketsDesc: 'Erstelle eine nachvollziehbare Anfrage mit Status und Antwortfrist.', loading: 'Anfragen werden geladen…', loadFailed: 'Anfragen konnten nicht geladen werden.', retry: 'Erneut versuchen', createTitle: 'Support-Anfrage erstellen', subject: 'Betreff', subjectPlaceholder: 'Kurze Zusammenfassung', issue: 'Was ist passiert?', message: 'Beschreibung', messagePlaceholder: 'Beschreibe, was passiert ist und welche Lösung du erwartest…', relatedOrder: 'Bestell-ID', relatedOrderRequired: 'Für dieses Problem ist eine zugehörige Bestellung erforderlich.', cancel: 'Abbrechen', submit: 'Anfrage senden', required: 'Betreff und Beschreibung sind erforderlich.', created: 'Anfrage wurde erstellt.', createFailed: 'Anfrage konnte nicht erstellt werden.', back: 'Zurück', replyPlaceholder: 'Antwort schreiben…', send: 'Senden', replySent: 'Antwort wurde gesendet.', replyFailed: 'Antwort konnte nicht gesendet werden.', conversationFailed: 'Unterhaltung konnte nicht geladen werden.', support: 'BlinkGo Support', you: 'Du', reference: 'Vorgangsnummer', due: 'Antwort bis', overdue: 'Antwortfrist überschritten', next: 'Nächster Schritt', addPhoto: 'Foto hinzufügen', replacePhoto: 'Foto ersetzen', removePhoto: 'Foto entfernen', photoHint: 'Privat · JPG/PNG/WebP · max. 5 MB · Löschung nach 180 Tagen', invalidPhoto: 'Bitte wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.', viewPhoto: 'Foto anzeigen', emergency: 'Akute Gefahr? Ruf sofort 112 an. Der BlinkGo-Support ersetzt keinen Notruf.', original: 'Ursprüngliche Anfrage', order: 'Bestellung', noOrder: 'Optional', attachment: 'Anhang', slaMet: 'Innerhalb der Antwortfrist', resolution: 'Lösung',
  },
  ar: {
    title: 'الدعم', newTicket: 'طلب جديد', noTickets: 'لا توجد طلبات دعم', noTicketsDesc: 'أنشئ طلبًا موثقًا مع حالة وموعد استجابة واضح.', loading: 'جارٍ تحميل الطلبات…', loadFailed: 'تعذر تحميل طلبات الدعم.', retry: 'إعادة المحاولة', createTitle: 'إنشاء طلب دعم', subject: 'الموضوع', subjectPlaceholder: 'ملخص قصير', issue: 'ماذا حدث؟', message: 'التفاصيل', messagePlaceholder: 'اشرح ما حدث والحل الذي تتوقعه…', relatedOrder: 'رقم الطلب', relatedOrderRequired: 'هذا النوع من المشاكل يحتاج إلى طلب مرتبط.', cancel: 'إلغاء', submit: 'إرسال الطلب', required: 'الموضوع والتفاصيل مطلوبان.', created: 'تم إنشاء طلب الدعم.', createFailed: 'تعذر إنشاء طلب الدعم.', back: 'رجوع', replyPlaceholder: 'اكتب ردك…', send: 'إرسال', replySent: 'تم إرسال الرد.', replyFailed: 'تعذر إرسال الرد.', conversationFailed: 'تعذر تحميل المحادثة.', support: 'دعم BlinkGo', you: 'أنت', reference: 'رقم التذكرة', due: 'موعد الاستجابة', overdue: 'تجاوز موعد الاستجابة', next: 'الخطوة التالية', addPhoto: 'إضافة صورة', replacePhoto: 'استبدال الصورة', removePhoto: 'حذف الصورة', photoHint: 'خاصة · JPG/PNG/WebP · حتى 5MB · تحذف بعد 180 يومًا', invalidPhoto: 'اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5MB.', viewPhoto: 'عرض الصورة', emergency: 'خطر فوري؟ اتصل بالرقم 112 فورًا. دعم BlinkGo لا يحل محل خدمات الطوارئ.', original: 'الطلب الأصلي', order: 'الطلب', noOrder: 'اختياري', attachment: 'مرفق', slaMet: 'ضمن موعد الاستجابة', resolution: 'الحل',
  },
  en: {
    title: 'Support', newTicket: 'New request', noTickets: 'No support requests yet', noTicketsDesc: 'Create a traceable request with a clear status and response deadline.', loading: 'Loading requests…', loadFailed: 'We could not load your support requests.', retry: 'Try again', createTitle: 'Create support request', subject: 'Subject', subjectPlaceholder: 'Short summary', issue: 'What happened?', message: 'Description', messagePlaceholder: 'Describe what happened and the outcome you expect…', relatedOrder: 'Order ID', relatedOrderRequired: 'This issue type requires a related order.', cancel: 'Cancel', submit: 'Send request', required: 'Subject and description are required.', created: 'Support request created.', createFailed: 'We could not create the support request.', back: 'Back', replyPlaceholder: 'Write a reply…', send: 'Send', replySent: 'Reply sent.', replyFailed: 'We could not send the reply.', conversationFailed: 'We could not load the conversation.', support: 'BlinkGo Support', you: 'You', reference: 'Reference', due: 'Response due', overdue: 'Response deadline exceeded', next: 'Next step', addPhoto: 'Add photo', replacePhoto: 'Replace photo', removePhoto: 'Remove photo', photoHint: 'Private · JPG/PNG/WebP · max 5 MB · deleted after 180 days', invalidPhoto: 'Choose a JPG, PNG or WebP image up to 5 MB.', viewPhoto: 'View photo', emergency: 'Immediate danger? Call 112 now. BlinkGo support does not replace emergency services.', original: 'Original request', order: 'Order', noOrder: 'Optional', attachment: 'Attachment', slaMet: 'Within response deadline', resolution: 'Resolution',
  },
} satisfies Record<Locale, Record<string, string>>;

const NEXT_ACTION: Record<NextAction, Record<Locale, string>> = {
  waiting_support: { de: 'BlinkGo prüft deine Anfrage', ar: 'فريق BlinkGo يراجع طلبك', en: 'BlinkGo is reviewing your request' },
  waiting_customer: { de: 'Deine Antwort wird benötigt', ar: 'نحتاج إلى ردك', en: 'Your reply is needed' },
  refund_review: { de: 'Erstattung wird geprüft', ar: 'تتم مراجعة الاسترداد', en: 'Refund eligibility is under review' },
  merchant_review: { de: 'Restaurant wird kontaktiert', ar: 'سيتم التواصل مع المطعم', en: 'The merchant is being contacted' },
  driver_review: { de: 'Lieferverlauf wird geprüft', ar: 'تتم مراجعة مسار التوصيل', en: 'The delivery timeline is under review' },
  resolved: { de: 'Vorgang abgeschlossen', ar: 'تم إغلاق المعالجة', en: 'Request completed' },
};

interface Ticket {
  id: string;
  user_id: string;
  reference_code?: string;
  subject: string;
  message: string;
  category: string;
  issue_type?: IssueType;
  priority: string;
  status: keyof typeof STATUS;
  next_action?: NextAction;
  order_id?: string | null;
  sla_due_at?: string;
  resolution_summary?: string | null;
  created_at: string;
  updated_at: string;
}

interface Reply { id: string; user_id: string; message: string; is_internal: boolean; created_at: string; users?: { name?: string; role?: string } | null }
interface Attachment { id: string; name: string; mime_type: string; byte_size: number; reply_id: string | null; created_at: string }
type PendingAttachment = { name: string; data_url: string; preview: string };
type View = 'list' | 'new' | 'detail';

async function readApi(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || 'Request failed');
  return payload?.data ?? payload;
}

async function readPhoto(file: File): Promise<PendingAttachment> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('invalid_photo');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid_photo'));
    reader.onerror = () => reject(new Error('invalid_photo'));
    reader.readAsDataURL(file);
  });
  return { name: file.name.slice(0, 120), data_url: dataUrl, preview: dataUrl };
}

export function SupportClient({ initialOrderId = '', startNew = false, showTitle = true }: { userRole: 'customer' | 'driver' | 'restaurant'; initialOrderId?: string; startNew?: boolean; showTitle?: boolean }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>(startNew || initialOrderId ? 'new' : 'list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signedPhotos, setSignedPhotos] = useState<Record<string, string>>({});
  const [threadLoading, setThreadLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [issueType, setIssueType] = useState<IssueType>('other');
  const [orderId, setOrderId] = useState(initialOrderId);
  const [photo, setPhoto] = useState<PendingAttachment | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyPhoto, setReplyPhoto] = useState<PendingAttachment | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const selectedIssue = useMemo(() => ISSUES.find((item) => item.key === issueType) ?? ISSUES.at(-1)!, [issueType]);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(value));
  const issueLabel = (key?: string) => ISSUES.find((item) => item.key === key)?.[locale] ?? key ?? '';
  const statusConfig = (status: string) => STATUS[status as keyof typeof STATUS] ?? STATUS.open;

  const loadTickets = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const data = await readApi(await fetch('/api/support', { credentials: 'include', cache: 'no-store' })); setTickets((data.tickets ?? []) as Ticket[]); }
    catch { setLoadError(copy.loadFailed); }
    finally { setLoading(false); }
  }, [copy.loadFailed]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTickets(), 0); return () => window.clearTimeout(timer); }, [loadTickets]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);

  async function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket); setView('detail'); setReplies([]); setAttachments([]); setSignedPhotos({}); setThreadLoading(true); setLoadError('');
    try {
      const data = await readApi(await fetch(`/api/support?id=${encodeURIComponent(ticket.id)}`, { credentials: 'include', cache: 'no-store' }));
      setSelectedTicket(data.ticket as Ticket); setReplies((data.replies ?? []) as Reply[]); setAttachments((data.attachments ?? []) as Attachment[]);
    } catch { setLoadError(copy.conversationFailed); }
    finally { setThreadLoading(false); }
  }

  async function choosePhoto(file: File | undefined, target: 'new' | 'reply') {
    if (!file) return;
    try { const next = await readPhoto(file); if (target === 'new') setPhoto(next); else setReplyPhoto(next); }
    catch { toast({ type: 'error', message: copy.invalidPhoto }); }
  }

  async function createTicket() {
    if (!subject.trim() || !message.trim()) { toast({ type: 'error', message: copy.required }); return; }
    if (selectedIssue.order && !orderId.trim()) { toast({ type: 'error', message: copy.relatedOrderRequired }); return; }
    setSubmitting(true);
    try {
      const data = await readApi(await fetch('/api/support', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: subject.trim(), message: message.trim(), issue_type: issueType, order_id: orderId.trim() || undefined, attachment: photo ? { name: photo.name, data_url: photo.data_url } : undefined }) }));
      toast({ type: 'success', message: `${copy.created} ${data.ticket?.reference_code ?? ''}`.trim() });
      setSubject(''); setMessage(''); setOrderId(''); setIssueType('other'); setPhoto(null); setView('list'); await loadTickets();
    } catch { toast({ type: 'error', message: copy.createFailed }); }
    finally { setSubmitting(false); }
  }

  async function sendReply() {
    if (!selectedTicket || !replyMessage.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data = await readApi(await fetch(`/api/support?id=${encodeURIComponent(selectedTicket.id)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: replyMessage.trim(), attachment: replyPhoto ? { name: replyPhoto.name, data_url: replyPhoto.data_url } : undefined }) }));
      setReplies((current) => [...current, data.reply as Reply]); if (data.attachment) setAttachments((current) => [...current, data.attachment as Attachment]);
      setReplyMessage(''); setReplyPhoto(null); setSelectedTicket((ticket) => ticket ? { ...ticket, status: 'in_progress', next_action: 'waiting_support' } : ticket); toast({ type: 'success', message: copy.replySent });
    } catch { toast({ type: 'error', message: copy.replyFailed }); }
    finally { setSubmitting(false); }
  }

  async function showAttachment(id: string) {
    if (signedPhotos[id]) { setSignedPhotos((current) => { const next = { ...current }; delete next[id]; return next; }); return; }
    try { const data = await readApi(await fetch(`/api/support/attachments/${encodeURIComponent(id)}`, { cache: 'no-store' })); setSignedPhotos((current) => ({ ...current, [id]: data.attachment.url })); }
    catch { toast({ type: 'error', message: copy.conversationFailed }); }
  }

  if (view === 'new') return <div data-testid="support-new-request" className="mx-auto max-w-2xl space-y-4 px-4 py-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <Button variant="ghost" size="sm" icon={<ArrowLeft className={cn('size-4', locale === 'ar' && 'rotate-180')} />} onClick={() => setView('list')}>{copy.back}</Button>
    <Card variant="glass" padding="lg">
      <h2 className="mb-5 text-xl font-black text-text">{copy.createTitle}</h2>
      <div className="space-y-4">
        <Field label={copy.issue}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ISSUES.map((item) => <button key={item.key} type="button" aria-pressed={issueType === item.key} onClick={() => { setIssueType(item.key); if (!item.photo) setPhoto(null); }} className={cn('min-h-12 rounded-xl px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', issueType === item.key ? 'bg-brand text-white' : 'border border-border bg-surface-2 text-text-secondary hover:bg-surface-3')}>{item[locale]}</button>)}</div></Field>
        {issueType === 'safety_issue' ? <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm font-bold leading-6 text-danger">{copy.emergency}</div> : null}
        <Field label={copy.subject}><input value={subject} onChange={(event) => setSubject(event.target.value.slice(0, 200))} placeholder={copy.subjectPlaceholder} className="min-h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20" /></Field>
        <Field label={`${copy.relatedOrder} · ${selectedIssue.order ? copy.relatedOrderRequired : copy.noOrder}`}><input value={orderId} onChange={(event) => setOrderId(event.target.value.slice(0, 80))} required={selectedIssue.order} className="min-h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></Field>
        <Field label={copy.message}><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 5000))} rows={6} placeholder={copy.messagePlaceholder} className="min-h-32 w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20" /></Field>
        {selectedIssue.photo ? <PhotoPicker photo={photo} copy={copy} onChoose={(file) => void choosePhoto(file, 'new')} onRemove={() => setPhoto(null)} /> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setView('list')}>{copy.cancel}</Button><Button loading={submitting} icon={<Send className="size-4" />} onClick={() => void createTicket()}>{copy.submit}</Button></div>
      </div>
    </Card>
  </div>;

  if (view === 'detail' && selectedTicket) {
    const config = statusConfig(selectedTicket.status); const overdue = Boolean(selectedTicket.sla_due_at && !['resolved', 'closed'].includes(selectedTicket.status) && new Date(selectedTicket.sla_due_at).getTime() < now);
    return <div data-testid="support-ticket-detail" className="mx-auto max-w-2xl space-y-4 px-4 py-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Button variant="ghost" size="sm" icon={<ArrowLeft className={cn('size-4', locale === 'ar' && 'rotate-180')} />} onClick={() => { setView('list'); setSelectedTicket(null); }}>{copy.back}</Button>
      <Card variant="glass" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-brand">{copy.reference} · {selectedTicket.reference_code ?? selectedTicket.id.slice(0, 8)}</p><h2 className="mt-1 text-xl font-black text-text">{selectedTicket.subject}</h2><p className="mt-1 text-xs text-text-muted">{issueLabel(selectedTicket.issue_type)}{selectedTicket.order_id ? ` · ${copy.order} ${selectedTicket.order_id.slice(0, 8)}` : ''}</p></div><span className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', config.color)}>{config[locale]}</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><Info icon={<Clock className="size-4" />} label={overdue ? copy.overdue : copy.due} value={selectedTicket.sla_due_at ? formatDate(selectedTicket.sla_due_at) : '—'} danger={overdue} /><Info icon={<RefreshCw className="size-4" />} label={copy.next} value={NEXT_ACTION[selectedTicket.next_action ?? 'waiting_support'][locale]} /></div>
        <article className="mt-4 rounded-2xl border border-border bg-surface-2 p-4"><p className="mb-2 text-xs font-black uppercase tracking-wider text-text-muted">{copy.original}</p><p className="whitespace-pre-wrap text-sm leading-6 text-text">{selectedTicket.message}</p></article>
        <AttachmentGallery attachments={attachments.filter((item) => !item.reply_id)} signedPhotos={signedPhotos} copy={copy} onShow={showAttachment} />
        {threadLoading ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted"><Loader2 className="size-4 animate-spin" />{copy.loading}</div> : <div className="mt-4 space-y-3">{replies.map((reply) => { const fromCustomer = reply.user_id === selectedTicket.user_id; return <article key={reply.id} className={cn('rounded-2xl p-4', fromCustomer ? 'me-auto max-w-[90%] bg-surface-2' : 'ms-auto max-w-[90%] bg-brand/10')}><p className="mb-1 text-xs font-bold text-text-muted">{fromCustomer ? copy.you : (reply.users?.name ?? copy.support)} · {formatDate(reply.created_at)}</p><p className="whitespace-pre-wrap text-sm leading-6 text-text">{reply.message}</p><AttachmentGallery attachments={attachments.filter((item) => item.reply_id === reply.id)} signedPhotos={signedPhotos} copy={copy} onShow={showAttachment} /></article>; })}</div>}
        {selectedTicket.resolution_summary ? <div className="mt-4 rounded-2xl border border-success/30 bg-success/10 p-4"><p className="text-xs font-black uppercase tracking-wider text-success">{copy.resolution}</p><p className="mt-1 text-sm text-text">{selectedTicket.resolution_summary}</p></div> : null}
      </Card>
      {!['resolved', 'closed'].includes(selectedTicket.status) ? <Card variant="glass" padding="lg"><Field label={copy.replyPlaceholder}><textarea value={replyMessage} onChange={(event) => setReplyMessage(event.target.value.slice(0, 5000))} rows={3} placeholder={copy.replyPlaceholder} className="min-h-24 w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20" /></Field>{selectedTicket.issue_type && ISSUES.find((item) => item.key === selectedTicket.issue_type)?.photo ? <div className="mt-3"><PhotoPicker photo={replyPhoto} compact copy={copy} onChoose={(file) => void choosePhoto(file, 'reply')} onRemove={() => setReplyPhoto(null)} /></div> : null}<div className="mt-3 flex justify-end"><Button loading={submitting} disabled={!replyMessage.trim()} icon={<Send className="size-4" />} onClick={() => void sendReply()}>{copy.send}</Button></div></Card> : null}
    </div>;
  }

  return <div data-testid="support-ticket-list" className="mx-auto max-w-2xl space-y-4 px-4 py-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="flex items-center justify-end gap-3">{showTitle && <h1 className="me-auto text-xl font-black text-text">{copy.title}</h1>}<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setView('new')}>{copy.newTicket}</Button></div>
    {loading ? <div role="status" className="space-y-2" aria-label={copy.loading}>{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-surface-2" />)}</div> : loadError ? <ErrorBox message={loadError} onRetry={() => void loadTickets()} retry={copy.retry} /> : tickets.length === 0 ? <EmptyState icon="MessageCircle" title={copy.noTickets} description={copy.noTicketsDesc} action={<Button icon={<Plus className="size-4" />} onClick={() => setView('new')}>{copy.newTicket}</Button>} /> : <div className="space-y-2">{tickets.map((ticket) => { const config = statusConfig(ticket.status); const overdue = Boolean(ticket.sla_due_at && !['resolved', 'closed'].includes(ticket.status) && new Date(ticket.sla_due_at).getTime() < now); return <Card key={ticket.id} variant="glass" padding="none" hover><button type="button" onClick={() => void openTicket(ticket)} className="w-full rounded-2xl p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`${ticket.subject} — ${config[locale]}`}><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><MessageCircle className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black uppercase tracking-wider text-brand">{ticket.reference_code ?? ticket.id.slice(0, 8)}</p><h3 className="truncate text-sm font-bold text-text">{ticket.subject}</h3></div><span className={cn('shrink-0 rounded-full border px-2 py-1 text-2xs font-bold', config.color)}>{config[locale]}</span></div><p className="mt-1 line-clamp-1 text-xs text-text-muted">{ticket.message}</p><div className={cn('mt-2 flex flex-wrap items-center gap-2 text-2xs', overdue ? 'font-bold text-danger' : 'text-text-muted')}><span>{issueLabel(ticket.issue_type)}</span><span>·</span><Clock className="size-3" /><time>{ticket.sla_due_at ? formatDate(ticket.sla_due_at) : formatDate(ticket.updated_at)}</time>{overdue ? <span>{copy.overdue}</span> : null}</div></div></div></button></Card>; })}</div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">{label}</span>{children}</label>; }
function ErrorBox({ message, retry, onRetry }: { message: string; retry: string; onRetry: () => void }) { return <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"><span className="flex items-center gap-2"><AlertCircle className="size-5 shrink-0" />{message}</span><button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1.5 font-bold"><RefreshCw className="size-4" />{retry}</button></div>; }
function Info({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) { return <div className={cn('rounded-xl border p-3', danger ? 'border-danger/30 bg-danger/10' : 'border-border bg-surface-2')}><p className={cn('flex items-center gap-1 text-xs font-bold', danger ? 'text-danger' : 'text-text-muted')}>{icon}{label}</p><p className="mt-1 text-sm font-extrabold text-text">{value}</p></div>; }
function PhotoPicker({ photo, copy, onChoose, onRemove, compact = false }: { photo: PendingAttachment | null; copy: Record<string, string>; onChoose: (file?: File) => void; onRemove: () => void; compact?: boolean }) { return <div className="rounded-2xl border border-border bg-surface-2 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-text">{photo ? copy.replacePhoto : copy.addPhoto}</p><p className="mt-1 text-2xs text-text-muted">{copy.photoHint}</p></div><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand/10 px-3 text-xs font-bold text-brand hover:bg-brand/20"><Camera className="size-4" />{photo ? copy.replacePhoto : copy.addPhoto}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { onChoose(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div>{photo ? <div className={cn('mt-3 flex items-center gap-3', compact && 'mt-2')}><div className="relative size-20 overflow-hidden rounded-xl border border-border bg-black"><Image src={photo.preview} alt={copy.attachment} fill unoptimized className="object-cover" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-text">{photo.name}</p><button type="button" onClick={onRemove} className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-bold text-danger"><X className="size-4" />{copy.removePhoto}</button></div></div> : null}</div>; }
function AttachmentGallery({ attachments, signedPhotos, copy, onShow }: { attachments: Attachment[]; signedPhotos: Record<string, string>; copy: Record<string, string>; onShow: (id: string) => Promise<void> }) { if (!attachments.length) return null; return <div className="mt-3 space-y-2">{attachments.map((attachment) => <div key={attachment.id} className="overflow-hidden rounded-xl border border-border bg-black/20">{signedPhotos[attachment.id] ? <div className="relative aspect-video"><Image src={signedPhotos[attachment.id]} alt={attachment.name} fill unoptimized className="object-contain" /></div> : null}<button type="button" onClick={() => void onShow(attachment.id)} className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-xs font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ShieldCheck className="size-4 text-success" /><span className="min-w-0 flex-1 truncate">{attachment.name}</span><Eye className="size-4" />{copy.viewPhoto}</button></div>)}</div>; }
