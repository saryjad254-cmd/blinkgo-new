'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Save, Clock, Users, Edit3, Loader2, Check, X } from 'lucide-react';

interface Driver {
  id: string;
  email: string;
  name: string;
  is_online: boolean;
}

interface WorkingHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

const DAY_NAMES_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_NAMES_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDefaultHours(): WorkingHour[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    start_time: '08:00:00',
    end_time: '23:00:00',
    is_enabled: true,
  }));
}

export default function AdminDriverHoursPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [editingHours, setEditingHours] = useState<WorkingHour[]>(getDefaultHours());
  const [loading, setLoading] = useState(true);
  const [loadingHours, setLoadingHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');

  useEffect(() => {
    // Get locale from cookie
    const match = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
    if (match) {
      const value = match.split('=')[1]?.trim();
      if (value === 'ar' || value === 'en') setLocale(value as 'ar' | 'en');
    }
    loadDrivers();
  }, []);

  async function loadDrivers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/driver-hours');
      if (res.ok) {
        const data = await res.json();
        const drv = data.drivers || [];
        setDrivers(drv);
        if (drv.length > 0 && !selectedDriver) {
          setSelectedDriver(drv[0].id);
          await loadHoursForDriver(drv[0].id);
        }
      }
    } catch (e) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadHoursForDriver(driverId: string) {
    if (!driverId) {
      setEditingHours(getDefaultHours());
      return;
    }
    setLoadingHours(true);
    try {
      const res = await fetch(`/api/admin/driver-hours?driver_id=${driverId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedHours = (data.hours && data.hours.length === 7) ? data.hours : getDefaultHours();
        setEditingHours(loadedHours);
      } else {
        setEditingHours(getDefaultHours());
      }
    } catch (e) {
      console.error('Load hours error:', e);
      setEditingHours(getDefaultHours());
    } finally {
      setLoadingHours(false);
    }
  }

  function selectDriver(driverId: string) {
    setSelectedDriver(driverId);
    loadHoursForDriver(driverId);
  }

  async function saveHours() {
    if (!selectedDriver) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/driver-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: selectedDriver,
          hours: editingHours,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const storage = data.storage === 'database' ? 'DB' : 'cache';
        setSaveMessage({
          type: 'success',
          text: STRINGS.saved + (storage === 'cache' ? ` (${STRINGS.cached})` : ''),
        });
        setTimeout(() => setSaveMessage(null), 4000);
      } else {
        setSaveMessage({ type: 'error', text: data.error || STRINGS.saveFailed });
      }
    } catch (e: any) {
      setSaveMessage({ type: 'error', text: e.message || STRINGS.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  const dayNames = locale === 'ar' ? DAY_NAMES_AR : locale === 'en' ? DAY_NAMES_EN : DAY_NAMES_DE;

  const STRINGS = {
    title: locale === 'ar' ? 'ساعات عمل السائقين' : locale === 'en' ? 'Driver Working Hours' : 'Fahrer-Arbeitszeiten',
    subtitle: locale === 'ar' ? 'حدد ساعات عمل كل سائق' : locale === 'en' ? 'Set working hours for each driver' : 'Arbeitszeiten für jeden Fahrer festlegen',
    selectDriver: locale === 'ar' ? 'اختر السائق' : locale === 'en' ? 'Select driver' : 'Fahrer auswählen',
    noDrivers: locale === 'ar' ? 'لا يوجد سائقين' : locale === 'en' ? 'No drivers' : 'Keine Fahrer',
    schedule: locale === 'ar' ? 'الجدول الأسبوعي' : locale === 'en' ? 'Weekly schedule' : 'Wochenplan',
    enabled: locale === 'ar' ? 'مفعّل' : locale === 'en' ? 'Enabled' : 'Aktiviert',
    disabled: locale === 'ar' ? 'معطّل' : locale === 'en' ? 'Disabled' : 'Deaktiviert',
    from: locale === 'ar' ? 'من' : locale === 'en' ? 'From' : 'Von',
    to: locale === 'ar' ? 'إلى' : locale === 'en' ? 'To' : 'Bis',
    save: locale === 'ar' ? 'حفظ' : locale === 'en' ? 'Save' : 'Speichern',
    saving: locale === 'ar' ? 'جاري الحفظ...' : locale === 'en' ? 'Saving...' : 'Speichern...',
    saved: locale === 'ar' ? 'تم الحفظ بنجاح' : locale === 'en' ? 'Saved successfully' : 'Erfolgreich gespeichert',
    saveFailed: locale === 'ar' ? 'فشل الحفظ' : locale === 'en' ? 'Save failed' : 'Speichern fehlgeschlagen',
    cached: locale === 'ar' ? 'مؤقت' : locale === 'en' ? 'temporary cache' : 'temporärer Cache',
    backToDashboard: locale === 'ar' ? 'العودة للوحة التحكم' : locale === 'en' ? 'Back to dashboard' : 'Zurück zum Dashboard',
    name: locale === 'ar' ? 'الاسم' : locale === 'en' ? 'Name' : 'Name',
    email: locale === 'ar' ? 'البريد' : locale === 'en' ? 'Email' : 'E-Mail',
    status: locale === 'ar' ? 'الحالة' : locale === 'en' ? 'Status' : 'Status',
    online: locale === 'ar' ? 'متصل' : locale === 'en' ? 'Online' : 'Online',
    offline: locale === 'ar' ? 'غير متصل' : locale === 'en' ? 'Offline' : 'Offline',
    quickPresets: locale === 'ar' ? 'إعدادات سريعة' : locale === 'en' ? 'Quick presets' : 'Schnellauswahl',
    preset247: locale === 'ar' ? '٢٤/٧' : locale === 'en' ? '24/7' : '24/7',
    presetDay: locale === 'ar' ? 'نهاري (٨ص-٦م)' : locale === 'en' ? 'Daytime (8am-6pm)' : 'Tagsüber (8-18)',
    presetNight: locale === 'ar' ? 'ليلي (٦م-٢ص)' : locale === 'en' ? 'Night (6pm-2am)' : 'Nachts (18-2)',
    enableAll: locale === 'ar' ? 'تفعيل الكل' : locale === 'en' ? 'Enable all' : 'Alle aktivieren',
    disableAll: locale === 'ar' ? 'تعطيل الكل' : locale === 'en' ? 'Disable all' : 'Alle deaktivieren',
    applyAll: locale === 'ar' ? 'تطبيق على الكل' : locale === 'en' ? 'Apply to all' : 'Auf alle anwenden',
  };

  function applyPreset(type: '247' | 'day' | 'night') {
    const times = type === '247'
      ? { start: '00:00:00', end: '23:59:00' }
      : type === 'day'
        ? { start: '08:00:00', end: '18:00:00' }
        : { start: '18:00:00', end: '02:00:00' };
    setEditingHours(editingHours.map((h) => ({ ...h, start_time: times.start, end_time: times.end, is_enabled: true })));
  }

  function toggleAll(enabled: boolean) {
    setEditingHours(editingHours.map((h) => ({ ...h, is_enabled: enabled })));
  }

  return (
    <div className="min-h-screen bg-bg p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/dashboard" className="p-2 -m-2 text-text-secondary hover:text-white rounded-sm hover:bg-surface-elevated transition-all" aria-label={STRINGS.backToDashboard}>
            <ArrowLeft className={`w-5 h-5 ${locale === 'ar' ? 'rotate-180' : ''}`} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Calendar className="w-6 h-6 text-brand-red-500" />
              {STRINGS.title}
            </h1>
            <p className="text-sm text-text-muted">{STRINGS.subtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="card glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-text-muted" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="card glass-card p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-text-muted" />
            <p className="text-text-secondary">{STRINGS.noDrivers}</p>
          </div>
        ) : (
          <>
            {/* Driver Selector */}
            <div className="card glass-card p-4 mb-6">
              <label className="block text-sm font-bold text-white mb-2">
                {STRINGS.selectDriver}
              </label>
              <select
                value={selectedDriver}
                onChange={(e) => selectDriver(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md bg-bg border border-edge-light text-white focus:border-brand-red-500 focus:outline-none"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email}) {d.is_online ? `● ${STRINGS.online}` : `○ ${STRINGS.offline}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick presets */}
            <div className="card glass-card p-4 mb-4">
              <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-red-500" />
                {STRINGS.quickPresets}
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => applyPreset('247')}
                  className="px-3 py-1.5 rounded-full bg-brand-red-500/20 text-brand-red-500 hover:bg-brand-red-500/30 text-xs font-bold transition-all"
                >
                  {STRINGS.preset247}
                </button>
                <button
                  onClick={() => applyPreset('day')}
                  className="px-3 py-1.5 rounded-full bg-warning/20 text-warning hover:bg-warning/30 text-xs font-bold transition-all"
                >
                  {STRINGS.presetDay}
                </button>
                <button
                  onClick={() => applyPreset('night')}
                  className="px-3 py-1.5 rounded-full bg-purple/20 text-purple hover:bg-purple/30 text-xs font-bold transition-all"
                >
                  {STRINGS.presetNight}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleAll(true)}
                  className="px-3 py-1.5 rounded-full bg-success/20 text-success hover:bg-success/30 text-xs font-bold transition-all"
                >
                  ✓ {STRINGS.enableAll}
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  className="px-3 py-1.5 rounded-full bg-danger/20 text-danger hover:bg-danger/30 text-xs font-bold transition-all"
                >
                  ✗ {STRINGS.disableAll}
                </button>
              </div>
            </div>

            {/* Schedule Editor */}
            <div className="card glass-card p-6">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-red-500" />
                {STRINGS.schedule}
              </h3>

              {loadingHours ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />
                </div>
              ) : (
                <div className="space-y-3">
                  {editingHours.map((h, idx) => (
                    <div
                      key={h.day_of_week}
                      className={`p-4 rounded-md border transition-all ${
                        h.is_enabled
                          ? 'bg-surface border-edge-light'
                          : 'bg-bg/50 border-edge-light opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-white min-w-[80px]">{dayNames[h.day_of_week]}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            h.is_enabled
                              ? 'bg-success/20 text-success'
                              : 'bg-danger/20 text-danger'
                          }`}>
                            {h.is_enabled ? STRINGS.enabled : STRINGS.disabled}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const updated = [...editingHours];
                            updated[idx] = { ...h, is_enabled: !h.is_enabled };
                            setEditingHours(updated);
                          }}
                          className={`relative w-12 h-6 rounded-full transition-all ${
                            h.is_enabled ? 'bg-brand-red-500' : 'bg-edge-light'
                          }`}
                          aria-label={`Toggle ${dayNames[h.day_of_week]}`}
                        >
                          <div
                            className={`absolute top-0.5 ${
                              h.is_enabled ? 'left-6' : 'left-0.5'
                            } w-5 h-5 rounded-full bg-white transition-all shadow-md`}
                          />
                        </button>
                      </div>

                      {h.is_enabled && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-text-muted block mb-1">{STRINGS.from}</label>
                            <input
                              type="time"
                              value={h.start_time.slice(0, 5)}
                              onChange={(e) => {
                                const updated = [...editingHours];
                                updated[idx] = { ...h, start_time: e.target.value + ':00' };
                                setEditingHours(updated);
                              }}
                              className="w-full px-3 py-2 rounded-md bg-bg border border-edge-light text-white focus:border-brand-red-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-end pb-2 text-text-muted">→</div>
                          <div className="flex-1">
                            <label className="text-xs text-text-muted block mb-1">{STRINGS.to}</label>
                            <input
                              type="time"
                              value={h.end_time.slice(0, 5)}
                              onChange={(e) => {
                                const updated = [...editingHours];
                                updated[idx] = { ...h, end_time: e.target.value + ':00' };
                                setEditingHours(updated);
                              }}
                              className="w-full px-3 py-2 rounded-md bg-bg border border-edge-light text-white focus:border-brand-red-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Save message */}
              {saveMessage && (
                <div
                  className={`mt-4 p-3 rounded-md flex items-center gap-2 ${
                    saveMessage.type === 'success'
                      ? 'bg-success/10 border border-success/30 text-success'
                      : 'bg-danger/10 border border-danger/30 text-danger'
                  }`}
                >
                  {saveMessage.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  <span className="text-sm font-semibold">{saveMessage.text}</span>
                </div>
              )}

              <button
                onClick={saveHours}
                disabled={saving || !selectedDriver}
                className="w-full mt-6 py-3 rounded-full bg-brand-red-500 hover:bg-brand-red-500/90 text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {STRINGS.saving}
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {STRINGS.save}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
