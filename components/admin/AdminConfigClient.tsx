'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';

interface ConfigItem {
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
}

export function AdminConfigClient({
  initialConfig,
  user,
  locale,
}: {
  initialConfig: ConfigItem[];
  user: AdminUser;
  locale?: Locale;
}) {
  const t = useT();
  const isAr = locale === 'ar';
  const [config, setConfig] = useState(initialConfig);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const save = async (key: string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      let parsed: any = edits[key];
      try { parsed = JSON.parse(edits[key]); } catch { parsed = edits[key]; }
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: parsed }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c) => c.map((item) => item.key === key ? { ...item, value: parsed, updated_at: new Date().toISOString() } : item));
        setSavedFlash(key);
        setTimeout(() => setSavedFlash(null), 2000);
      }
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const renderEditor = (item: ConfigItem) => {
    const val = edits[item.key] ?? JSON.stringify(item.value);
    return (
      <div key={item.key} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-mono text-sm font-bold text-ink-1 dark:text-zinc-100">{item.key}</div>
            {item.description && (
              <div className="mt-0.5 text-xs text-zinc-500">{item.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={val}
            onChange={(e) => setEdits((ed) => ({ ...ed, [item.key]: e.target.value }))}
            className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            onClick={() => save(item.key)}
            disabled={saving[item.key]}
            className="flex items-center gap-1 rounded-xl bg-racing-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {t.admin.saveSettings}
          </button>
        </div>
        {savedFlash === item.key && (
          <div className="mt-1 text-xs text-emerald-600">✓ {t.admin.settingsSaved}</div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <Settings className="h-7 w-7 text-ink-2" />
        <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">
          {t.admin.configuration}
        </h1>
      </div>

      <div className="rounded-2xl border border-brand-yellow-200 bg-brand-yellow-50 p-4 dark:border-brand-yellow-800 dark:bg-brand-yellow-950/30">
        <div className="flex items-start gap-2 text-sm text-brand-yellow-800 dark:text-brand-yellow-200">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>Changes here affect the entire platform. Edit values carefully — invalid JSON will be saved as string.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {config.length === 0 ? (
          <div className="col-span-full text-center text-zinc-500">No configuration items found.</div>
        ) : (
          config.map(renderEditor)
        )}
      </div>
    </div>
    </AdminLayout>
  );
}
