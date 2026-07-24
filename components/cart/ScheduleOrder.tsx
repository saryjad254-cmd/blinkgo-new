'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';

import { Clock, Calendar, ChevronDown } from 'lucide-react';

interface ScheduleOrderProps {
  value: string | null; // ISO timestamp or null for ASAP
  onChange: (value: string | null) => void;
}

export function ScheduleOrder({ value, onChange }: ScheduleOrderProps) {
  const t = useT();
  const [mode, setMode] = useState<'asap' | 'scheduled'>(value ? 'scheduled' : 'asap');
  const [date, setDate] = useState<string>(() => {
    if (value) return value.slice(0, 10);
    return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
  });
  const [time, setTime] = useState<string>(() => {
    if (value) return value.slice(11, 16);
    return '19:00';
  });

  useEffect(() => {
    if (mode === 'asap') {
      onChange(null);
    } else {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      onChange(iso);
    }
  }, [mode, date, time, onChange]);

  // Min date: 30 min from now
  const minDate = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5 text-ink-2" />
        <span className="font-semibold text-ink-1 dark:text-zinc-100">
          {t.scheduling.title}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('asap')}
          className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
            mode === 'asap'
              ? 'border-racing-red bg-racing-red text-white'
              : 'border-zinc-200 bg-white text-ink-1 hover:border-ink-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
          }`}
        >
          {t.scheduling.asap}
        </button>
        <button
          type="button"
          onClick={() => setMode('scheduled')}
          className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
            mode === 'scheduled'
              ? 'border-racing-red bg-racing-red text-white'
              : 'border-zinc-200 bg-white text-ink-1 hover:border-ink-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
          }`}
        >
          {t.scheduling.schedule}
        </button>
      </div>

      <AnimatePresence>
        {mode === 'scheduled' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t.scheduling.selectDate}
                </label>
                <input
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-ink-1 outline-none focus:border-ink-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t.scheduling.selectTime}
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-ink-1 outline-none focus:border-ink-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {t.scheduling.scheduledFor} {new Date(`${date}T${time}:00`).toLocaleString()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
