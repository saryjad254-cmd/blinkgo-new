'use client';

import { useState, useEffect } from 'react';
import { Shield, Mail, Plus, X, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Administratoren',
    subtitle: '3-stufiges Admin-System: Super-Admin > Admin > Manager',
    name: 'Name',
    email: 'E-Mail',
    role: 'Rolle',
    status: 'Status',
    lastLogin: 'Letzter Login',
    actions: 'Aktionen',
    search: 'Administrator suchen...',
    newAdmin: 'Neuer Admin',
    createAdmin: 'Neuen Administrator erstellen',
    name2: 'Name',
    email2: 'E-Mail',
    role2: 'Rolle',
    password: 'Passwort',
    cancel: 'Abbrechen',
    create: 'Erstellen',
    active: 'Aktiv',
    disabled: 'Deaktiviert',
    block: 'Sperren',
    unblock: 'Entsperren',
    noAdmins: 'Keine Administratoren',
    superAdmin: 'Super-Admin',
    admin: 'Admin',
    manager: 'Manager',
    noAccess: 'Nur Administratoren',
  },
  ar: {
    title: 'المشرفون',
    subtitle: 'نظام 3 مستويات: سوبر آدمن > مشرف > مدير',
    name: 'الاسم',
    email: 'البريد',
    role: 'الدور',
    status: 'الحالة',
    lastLogin: 'آخر دخول',
    actions: 'الإجراءات',
    search: 'ابحث عن مشرف...',
    newAdmin: 'مشرف جديد',
    createAdmin: 'إنشاء مشرف جديد',
    name2: 'الاسم',
    email2: 'البريد',
    role2: 'الدور',
    password: 'كلمة المرور',
    cancel: 'إلغاء',
    create: 'إنشاء',
    active: 'نشط',
    disabled: 'معطل',
    block: 'حظر',
    unblock: 'إلغاء الحظر',
    noAdmins: 'لا يوجد مشرفون',
    superAdmin: 'سوبر آدمن',
    admin: 'مشرف',
    manager: 'مدير',
    noAccess: 'للمشرفين فقط',
  },
  en: {
    title: 'Administrators',
    subtitle: '3-tier admin system: Super-Admin > Admin > Manager',
    name: 'Name',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    lastLogin: 'Last login',
    actions: 'Actions',
    search: 'Search admin...',
    newAdmin: 'New admin',
    createAdmin: 'Create new administrator',
    name2: 'Name',
    email2: 'Email',
    role2: 'Role',
    password: 'Password',
    cancel: 'Cancel',
    create: 'Create',
    active: 'Active',
    disabled: 'Disabled',
    block: 'Block',
    unblock: 'Unblock',
    noAdmins: 'No administrators',
    superAdmin: 'Super-Admin',
    admin: 'Admin',
    manager: 'Manager',
    noAccess: 'Admins only',
  },
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white',
  admin: 'bg-brand-yellow-500 text-white',
  manager: 'bg-cyan-500 text-white',
};

export function AdminAdminsClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [admins, setAdmins] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'manager',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isSuperAdmin = user.role === 'super_admin';

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/admins', window.location.origin);
      url.searchParams.set('limit', '100');
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.ok) setAdmins(data.admins);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchAdmins, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed');
        return;
      }
      setForm({ name: '', email: '', password: '', role: 'manager' });
      setShowCreate(false);
      fetchAdmins();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (a: any) => {
    const res = await fetch('/api/admin/admins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
    });
    if (res.ok) {
      setAdmins((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, is_active: !x.is_active } : x)),
      );
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-sm font-extrabold hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              {t.newAdmin}
            </button>
          )}
        </header>

        {/* Create modal */}
        {showCreate && isSuperAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <form
              onSubmit={handleCreate}
              className="w-full max-w-md bg-surface-elevated rounded-2xl border border-edge p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-white">{t.createAdmin}</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-text-secondary hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {createError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                  {createError}
                </div>
              )}
              <input
                type="text"
                placeholder={t.name2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <input
                type="email"
                placeholder={t.email2}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <input
                type="password"
                placeholder={t.password}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              >
                <option value="manager">{t.manager}</option>
                <option value="admin">{t.admin}</option>
                <option value="super_admin">{t.superAdmin}</option>
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 h-11 rounded-xl bg-ink-700 text-text-secondary font-bold">
                  {t.cancel}
                </button>
                <button type="submit" disabled={creating} className="flex-1 h-11 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold disabled:opacity-50">
                  {t.create}
                </button>
              </div>
            </form>
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.search}
          className="w-full h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
          dir="ltr"
        />

        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : admins.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">{t.noAdmins}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-700/40">
                  <tr>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.name}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.email}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.role}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.status}</th>
                    <th className="px-4 py-3 text-end text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {admins.map((a) => (
                    <tr key={a.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-sm font-extrabold text-white">
                        {a.name}
                        {a.id === user.id && (
                          <span className="ms-2 text-[10px] text-text-muted font-normal">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary" dir="ltr">{a.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider',
                            ROLE_COLORS[a.role] ?? 'bg-ink-700 text-text-secondary',
                          )}
                        >
                          {a.role === 'super_admin' ? t.superAdmin : a.role === 'admin' ? t.admin : t.manager}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {a.is_active ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {t.active}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-extrabold">
                            <XCircle className="w-2.5 h-2.5" />
                            {t.disabled}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {a.id !== user.id && (
                          <button
                            type="button"
                            onClick={() => toggleActive(a)}
                            className="h-8 px-3 rounded-lg bg-ink-700 hover:bg-ink-600 text-text-secondary hover:text-white text-[10px] font-extrabold uppercase tracking-wider"
                          >
                            {a.is_active ? t.block : t.unblock}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
