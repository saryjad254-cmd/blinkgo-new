'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Database, Trash2, Archive, History } from 'lucide-react';

type PreviewData = {
  orders_today: number;
  pending: number;
  delivered: number;
  revenue_today: number;
};

type DailyStat = {
  date: string;
  total_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_revenue: number;
};

export default function AdminResetPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const { locale } = useI18n();
  const [history, setHistory] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [previewRes, historyRes] = await Promise.all([
        fetch('/api/admin/daily-reset'),
        fetch('/api/admin/daily-reset/history'),
      ]);

      if (previewRes.ok) {
        const d = await previewRes.json();
        setPreview(d.preview);
      }

      if (historyRes.ok) {
        const d = await historyRes.json();
        setHistory(d.history || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function performReset() {
    if (confirmation !== 'RESET TODAY') {
      setResult({ ok: false, message: locale === 'ar' ? 'يجب أن تكون التأكيدات مطابقة لـ RESET TODAY' : locale === 'en' ? 'Confirmation must match RESET TODAY exactly' : 'Die Bestätigung muss genau RESET TODAY lauten' });
      return;
    }

    setResetting(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/daily-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, message: data.message });
        setConfirmation('');
        setShowConfirmDialog(false);
        loadData();
      } else {
        setResult({ ok: false, message: data.error || (locale === 'ar' ? 'فشل في إعادة التعيين' : locale === 'en' ? 'Reset failed' : 'Fehler beim Reset') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message });
    } finally {
      setResetting(false);
    }
  }

  const formatEUR = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const formatDateDE = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -m-2 text-text-secondary hover:text-white rounded-md hover:bg-surface-elevated transition-all"
            aria-label="Zurück"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{locale === 'ar' ? 'إعادة التعيين اليومي' : locale === 'en' ? 'Daily Reset' : 'Täglicher Reset'}</h1>
            <p className="text-sm text-text-muted mt-1">
              {locale === 'ar' ? 'يعيد تعيين طلبات اليوم وأرشفة الإحصائيات' : locale === 'en' ? "Resets today's orders and archives statistics" : 'Setzt die heutigen Bestellungen zurück und archiviert die Statistiken'}
            </p>
          </div>
        </div>

        {/* What gets reset / What stays */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card glass-card p-5">
            <h3 className="font-bold text-danger mb-3 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              {locale === 'ar' ? 'سينحذف' : locale === 'en' ? 'Will be deleted' : 'Wird gelöscht'}
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                {locale === 'ar' ? 'طلبات اليوم' : locale === 'en' ? "Today's orders" : 'Heutige Bestellungen'}
              </li>
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                {locale === 'ar' ? 'عناصر الطلبات' : locale === 'en' ? 'Order items' : 'Zugehörige Bestellpositionen'}
              </li>
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                {locale === 'ar' ? 'حالة الطلبات الجارية' : locale === 'en' ? 'Live status of current orders' : 'Live-Status laufender Bestellungen'}
              </li>
            </ul>
          </div>

          <div className="card glass-card p-5">
            <h3 className="font-bold text-success mb-3 flex items-center gap-2">
              <Archive className="w-5 h-5" />
              {locale === 'ar' ? 'سينأرشف' : locale === 'en' ? 'Will be archived' : 'Wird archiviert'}
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {locale === 'ar' ? 'إيرادات اليوم' : locale === 'en' ? "Today's revenue" : 'Tagesumsatz'} ({formatEUR(preview?.revenue_today ?? 0)})
              </li>
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {locale === 'ar' ? 'عدد الطلبات والتوصيلات' : locale === 'en' ? 'Number of orders & deliveries' : 'Anzahl Bestellungen & Lieferungen'}
              </li>
              <li className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Stornierungen
              </li>
            </ul>
          </div>

          <div className="card glass-card p-5 md:col-span-2">
            <h3 className="font-bold text-info mb-3 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Bleibt unverändert
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Kundenkonten
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Restaurants
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Fahrer
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Speisekarten
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Coupons & Angebote
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Adressen
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Favoriten
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <CheckCircle className="w-4 h-4 text-success" />
                Bewertungen
              </div>
            </div>
          </div>
        </div>

        {/* Today's Stats */}
        <div className="card glass-card p-5">
          <h2 className="font-bold text-white mb-4">Vorschau — heute</h2>
          {loading ? (
            <div className="text-text-muted text-sm">Lade Statistiken…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-surface-elevated rounded-md p-3">
                <p className="text-xs text-text-muted">{locale === 'ar' ? 'الطلبات' : locale === 'en' ? 'Orders' : 'Bestellungen'}</p>
                <p className="text-2xl font-extrabold text-white mt-1">{preview?.orders_today ?? 0}</p>
              </div>
              <div className="bg-surface-elevated rounded-md p-3">
                <p className="text-xs text-text-muted">{locale === 'ar' ? 'قيد المعالجة' : locale === 'en' ? 'In progress' : 'In Bearbeitung'}</p>
                <p className="text-2xl font-extrabold text-warning mt-1">{preview?.pending ?? 0}</p>
              </div>
              <div className="bg-surface-elevated rounded-md p-3">
                <p className="text-xs text-text-muted">{locale === 'ar' ? 'تم التوصيل' : locale === 'en' ? 'Delivered' : 'Geliefert'}</p>
                <p className="text-2xl font-extrabold text-success mt-1">{preview?.delivered ?? 0}</p>
              </div>
              <div className="bg-surface-elevated rounded-md p-3">
                <p className="text-xs text-text-muted">Umsatz</p>
                <p className="text-2xl font-extrabold text-brand-red-500 mt-1">{formatEUR(preview?.revenue_today ?? 0)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Result banner */}
        {result && (
          <div className={`card glass-card p-4 border-s-4 ${result.ok ? 'border-l-success' : 'border-l-danger'}`}>
            <div className="flex items-center gap-3">
              {result.ok ? (
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />
              )}
              <p className={result.ok ? 'text-white' : 'text-danger'}>{result.message}</p>
            </div>
          </div>
        )}

        {/* Reset button */}
        <div className="card glass-card p-5">
          <h2 className="font-bold text-white mb-2">Reset durchführen</h2>
          <p className="text-sm text-text-muted mb-4">
            {locale === 'ar' ? 'لا يمكن التراجع. سيتم حذف طلبات اليوم.' : locale === 'en' ? "Cannot be undone. Today's orders will be deleted." : 'Diese Aktion kann nicht rückgängig gemacht werden. Die heutigen Bestellungen werden gelöscht.'}
          </p>
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={(preview?.orders_today ?? 0) === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-danger text-white font-bold rounded-md hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCw className="w-5 h-5" />
            Heute zurücksetzen
          </button>
        </div>

        {/* History */}
        <div className="card glass-card p-5">
          <h2 className="font-bold text-white mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-info" />
            {locale === 'ar' ? 'الأرشيف (آخر ٣٠ يوم)' : locale === 'en' ? 'Archive (last 30 days)' : 'Archiv (letzte 30 Tage)'}
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-text-muted">{locale === 'ar' ? 'لا توجد بيانات مؤرشفة بعد.' : locale === 'en' ? 'No archived data yet.' : 'Noch keine archivierten Daten vorhanden.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted border-b border-edge-light">
                    <th className="text-start py-2 px-2 font-semibold">{locale === 'ar' ? 'التاريخ' : locale === 'en' ? 'Date' : 'Datum'}</th>
                    <th className="text-end py-2 px-2 font-semibold">{(locale === 'ar' ? 'الطلبات' : locale === 'en' ? 'Orders' : 'Bestellungen')}</th>
                    <th className="text-end py-2 px-2 font-semibold">{(locale === 'ar' ? 'موصّل' : locale === 'en' ? 'Delivered' : 'Geliefert')}</th>
                    <th className="text-end py-2 px-2 font-semibold">Storniert</th>
                    <th className="text-end py-2 px-2 font-semibold">{(locale === 'ar' ? 'الإيرادات' : locale === 'en' ? 'Revenue' : 'Umsatz')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.date} className="border-b border-edge-light/50 hover:bg-surface-elevated/50">
                      <td className="py-2 px-2 text-white">{formatDateDE(h.date)}</td>
                      <td className="py-2 px-2 text-end text-white">{h.total_orders}</td>
                      <td className="py-2 px-2 text-end text-success">{h.delivered_orders}</td>
                      <td className="py-2 px-2 text-end text-danger">{h.cancelled_orders}</td>
                      <td className="py-2 px-2 text-end text-brand-red-500 font-bold">{formatEUR(Number(h.total_revenue))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="card glass-card p-6 max-w-md w-full animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Bestätigung erforderlich</h3>
                <p className="text-sm text-text-muted">{locale === 'ar' ? 'سيتم حذف كل طلبات اليوم.' : locale === 'en' ? 'This will delete all today\'s orders.' : 'Diese Aktion löscht alle heutigen Bestellungen.'}</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="bg-surface-elevated rounded-md p-3 text-sm">
                <p className="text-text-muted mb-2">Gib <strong className="text-white">RESET TODAY</strong> ein, um zu bestätigen:</p>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder='Tippe "RESET TODAY"'
                  className="w-full px-3 py-2 bg-bg border border-edge rounded-md text-white placeholder:text-text-muted focus:outline-none focus:border-brand-red-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmation('');
                }}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 bg-surface-elevated text-white font-semibold rounded-md hover:bg-surface transition-all disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={performReset}
                disabled={resetting || confirmation !== 'RESET TODAY'}
                className="flex-1 px-4 py-2.5 bg-danger text-white font-bold rounded-md hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Läuft…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Jetzt zurücksetzen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}