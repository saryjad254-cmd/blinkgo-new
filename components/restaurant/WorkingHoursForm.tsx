'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import { Clock, Save } from 'lucide-react';

interface WorkingHour {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  is_open: boolean;
  open_time: string;
  close_time: string;
}

const DEFAULT_HOURS: WorkingHour[] = [
  { day: 'monday', is_open: true, open_time: '09:00', close_time: '22:00' },
  { day: 'tuesday', is_open: true, open_time: '09:00', close_time: '22:00' },
  { day: 'wednesday', is_open: true, open_time: '09:00', close_time: '22:00' },
  { day: 'thursday', is_open: true, open_time: '09:00', close_time: '22:00' },
  { day: 'friday', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'saturday', is_open: true, open_time: '10:00', close_time: '23:00' },
  { day: 'sunday', is_open: true, open_time: '10:00', close_time: '22:00' },
];

export function WorkingHoursForm({ initial }: { initial?: WorkingHour[] }) {
  const t = useT();
  const [hours, setHours] = useState<WorkingHour[]>(initial && initial.length === 7 ? initial : DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dayLabels = {
    monday: t.restaurantSettings.monday,
    tuesday: t.restaurantSettings.tuesday,
    wednesday: t.restaurantSettings.wednesday,
    thursday: t.restaurantSettings.thursday,
    friday: t.restaurantSettings.friday,
    saturday: t.restaurantSettings.saturday,
    sunday: t.restaurantSettings.sunday,
  };

  const updateDay = (day: WorkingHour['day'], patch: Partial<WorkingHour>) => {
    setHours((h) => h.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/restaurant/working-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-racing-red" />
        <h3 className="font-bold text-ink-1 dark:text-zinc-100">
          {t.restaurantSettings.workingHours}
        </h3>
      </div>

      <div className="space-y-2">
        {hours.map((entry) => (
          <div
            key={entry.day}
            className="grid grid-cols-12 items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="col-span-3 font-semibold text-ink-1 dark:text-zinc-100">
              {dayLabels[entry.day]}
            </div>
            <div className="col-span-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={entry.is_open}
                  onChange={(e) => updateDay(entry.day, { is_open: e.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-racing-red"
                />
                <span className="text-sm">{entry.is_open ? t.restaurantSettings.open : t.restaurantSettings.closed}</span>
              </label>
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs text-zinc-500">{t.restaurantSettings.openTime}</label>
              <input
                type="time"
                value={entry.open_time}
                onChange={(e) => updateDay(entry.day, { open_time: e.target.value })}
                disabled={!entry.is_open}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs text-zinc-500">{t.restaurantSettings.closeTime}</label>
              <input
                type="time"
                value={entry.close_time}
                onChange={(e) => updateDay(entry.day, { close_time: e.target.value })}
                disabled={!entry.is_open}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-racing-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-racing-red/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? '...' : t.common.save}
        </button>
        {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
      </div>
    </div>
  );
}
