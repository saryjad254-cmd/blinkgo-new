'use client';

import { useState } from 'react';
import { Loader2, MapPin, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Result = {
  ok: boolean;
  mode: 'batch';
  updated: number;
  skipped: number;
  failed: number;
  failures: Array<{ id: string; reason: string }>;
} | null;

const LABELS = {
  de: {
    title: 'Geocoder-Tool',
    subtitle: 'Lädt GPS-Koordinaten für Bestellungen ohne Lat/Lng',
    run: 'Geocodierung starten',
    running: 'Geocodierung läuft…',
    summary: 'Fertig: {updated} aktualisiert, {skipped} übersprungen, {failed} fehlgeschlagen',
    lastRun: 'Letzte Ausführung',
    neverRun: 'Noch keine Ausführung',
    error: 'Fehler beim Ausführen',
  },
  ar: {
    title: 'أداة الترميز الجغرافي',
    subtitle: 'تحمّل إحداثيات GPS للطلبات بدون Lat/Lng',
    run: 'ابدأ الترميز',
    running: 'جاري الترميز…',
    summary: 'انتهى: {updated} محدّث، {skipped} تم تخطّيه، {failed} فشل',
    lastRun: 'آخر تشغيل',
    neverRun: 'لم يتم التشغيل بعد',
    error: 'فشل في التنفيذ',
  },
  en: {
    title: 'Geocoder Tool',
    subtitle: 'Loads GPS coordinates for orders without lat/lng',
    run: 'Start geocoding',
    running: 'Geocoding…',
    summary: 'Done: {updated} updated, {skipped} skipped, {failed} failed',
    lastRun: 'Last run',
    neverRun: 'Never run',
    error: 'Run failed',
  },
};

export function GeocodeTool() {
  const { locale } = useI18n();
  const L = LABELS[locale as keyof typeof LABELS] || LABELS.de;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBatch() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/orders/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: true }),
      });
      const data = await r.json();
      if (!data?.ok) {
        setError(data?.error || L.error);
        return;
      }
      setResult(data);
    } catch (e: any) {
      setError(e?.message || L.error);
    } finally {
      setRunning(false);
    }
  }

  const ar = locale === 'ar';

  return (
    <div className="bg-surface-elevated border border-edge-light rounded-md p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-white">{L.title}</h3>
          <p className="text-xs text-text-muted mt-0.5">{L.subtitle}</p>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={runBatch}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {L.running}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {L.run}
                </>
              )}
            </button>

            {result && (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-success font-bold">
                  {L.summary
                    .replace('{updated}', String(result.updated))
                    .replace('{skipped}', String(result.skipped))
                    .replace('{failed}', String(result.failed))}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                <span className="text-danger font-bold">{error}</span>
              </div>
            )}
          </div>

          {result && result.failed > 0 && (
            <details className="mt-3 text-xs">
              <summary className="text-text-muted cursor-pointer hover:text-white transition-colors">
                {ar ? `الطلبات التي فشلت (${result.failed})` : `Failed orders (${result.failed})`}
              </summary>
              <ul className="mt-2 space-y-1 text-text-muted">
                {result.failures.slice(0, 5).map((f) => (
                  <li key={f.id} className="font-mono">
                    • {f.id.slice(0, 8)}… — {f.reason}
                  </li>
                ))}
                {result.failures.length > 5 && (
                  <li className="text-text-muted">… {result.failures.length - 5} more</li>
                )}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
