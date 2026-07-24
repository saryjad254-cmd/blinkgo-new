'use client';

import { useState, useEffect } from 'react';
import { Users, Mail, Phone, CheckCircle2, XCircle, Power, PowerOff, Edit, Trash2, Check, X, UserX, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Benutzer-Verwaltung',
    subtitle: 'Alle registrierten Benutzer anzeigen und verwalten',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    role: 'Rolle',
    status: 'Status',
    created: 'Erstellt',
    actions: 'Aktionen',
    search: 'Name, E-Mail oder Telefon suchen...',
    active: 'Aktiv',
    blocked: 'Gesperrt',
    verified: 'Verifiziert',
    unverified: 'Nicht verifiziert',
    block: 'Sperren',
    unblock: 'Entsperren',
    delete: 'Löschen',
    confirmDelete: 'Diesen Benutzer wirklich löschen?',
    noUsers: 'Keine Benutzer gefunden',
    selectAll: 'Alle auswählen',
    deselectAll: 'Auswahl aufheben',
    selectedCount: (n: number) => `${n} ausgewählt`,
    bulkSuspend: 'Massenhaft sperren',
    bulkUnsuspend: 'Massenhaft entsperren',
    bulkDelete: 'Massenhaft löschen',
    confirmBulk: (n: number) => `${n} Benutzer wirklich ändern?`,
    lastActivity: 'Letzte Aktivität',
  },
  ar: {
    title: 'إدارة المستخدمين',
    subtitle: 'عرض وإدارة جميع المستخدمين المسجلين',
    name: 'الاسم',
    email: 'البريد',
    phone: 'الهاتف',
    role: 'الدور',
    status: 'الحالة',
    created: 'تاريخ الإنشاء',
    actions: 'الإجراءات',
    search: 'ابحث بالاسم أو البريد أو الهاتف...',
    active: 'نشط',
    blocked: 'محظور',
    verified: 'موثق',
    unverified: 'غير موثق',
    block: 'حظر',
    unblock: 'إلغاء الحظر',
    delete: 'حذف',
    confirmDelete: 'هل تريد فعلاً حذف هذا المستخدم؟',
    noUsers: 'لا يوجد مستخدمون',
    selectAll: 'تحديد الكل',
    deselectAll: 'إلغاء التحديد',
    selectedCount: (n: number) => `${n} محدد`,
    bulkSuspend: 'إيقاف جماعي',
    bulkUnsuspend: 'إلغاء الإيقاف الجماعي',
    bulkDelete: 'حذف جماعي',
    confirmBulk: (n: number) => `هل تريد فعلاً تعديل ${n} مستخدم؟`,
    lastActivity: 'آخر نشاط',
  },
  en: {
    title: 'User Management',
    subtitle: 'View and manage all registered users',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    role: 'Role',
    status: 'Status',
    created: 'Created',
    actions: 'Actions',
    search: 'Search name, email or phone...',
    active: 'Active',
    blocked: 'Blocked',
    verified: 'Verified',
    unverified: 'Unverified',
    block: 'Block',
    unblock: 'Unblock',
    delete: 'Delete',
    confirmDelete: 'Really delete this user?',
    noUsers: 'No users found',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    selectedCount: (n: number) => `${n} selected`,
    bulkSuspend: 'Bulk suspend',
    bulkUnsuspend: 'Bulk unsuspend',
    bulkDelete: 'Bulk delete',
    confirmBulk: (n: number) => `Really modify ${n} users?`,
    lastActivity: 'Last activity',
  },
};

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-cyan-500/15 text-cyan-400',
  driver: 'bg-emerald-500/15 text-emerald-400',
  restaurant: 'bg-brand-yellow-500/15 text-brand-yellow-400',
  admin: 'bg-brand-500/15 text-brand-500',
  super_admin: 'bg-pink-500/15 text-pink-400',
  manager: 'bg-violet-500/15 text-violet-400',
};

export function AdminUsersClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/users', window.location.origin);
      url.searchParams.set('limit', '100');
      if (search) url.searchParams.set('q', search);
      if (roleFilter !== 'all') url.searchParams.set('role', roleFilter);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.ok) setUsers(data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleActive = async (u: any) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, is_active: !x.is_active } : x)),
      );
    }
  };

  const deleteUser = async (u: any) => {
    if (!confirm(t.confirmDelete)) return;
    const res = await fetch(`/api/admin/users?id=${u.id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } else {
      const data = await res.json();
      alert(data.error || 'Delete failed');
    }
  };

  const handleBulk = async (action: 'suspend' | 'unsuspend' | 'delete') => {
    if (selected.size === 0) return;
    if (!confirm(t.confirmBulk(selected.size))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkAction: action, userIds: Array.from(selected) }),
      });
      if (res.ok) {
        if (action === 'delete') {
          setUsers((prev) => prev.filter((u) => !selected.has(u.id)));
        } else {
          setUsers((prev) => prev.map((u) => selected.has(u.id) ? { ...u, is_active: action === 'suspend' ? false : true } : u));
        }
        setSelected(new Set());
      } else {
        const data = await res.json();
        alert(data.error || 'Bulk action failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map((u) => u.id)));
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            className="flex-1 min-w-[200px] h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            dir="ltr"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="all">{isAr ? 'كل الأدوار' : 'Alle Rollen'}</option>
            <option value="customer">{t.role}: Customer</option>
            <option value="driver">{t.role}: Driver</option>
            <option value="restaurant">{t.role}: Restaurant</option>
            <option value="admin">{t.role}: Admin</option>
          </select>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="rounded-2xl bg-brand-gradient-soft p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">{t.selectedCount(selected.size)}</span>
            <div className="flex-1" />
            <button
              onClick={() => handleBulk('suspend')}
              disabled={busy}
              className="h-10 px-3 rounded-lg bg-brand-yellow-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50 touch-manipulation"
            >
              <UserX className="w-3.5 h-3.5" />
              {t.bulkSuspend}
            </button>
            <button
              onClick={() => handleBulk('unsuspend')}
              disabled={busy}
              className="h-10 px-3 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50 touch-manipulation"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t.bulkUnsuspend}
            </button>
            <button
              onClick={() => handleBulk('delete')}
              disabled={busy}
              className="h-10 px-3 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50 touch-manipulation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.bulkDelete}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="h-10 w-10 rounded-lg bg-ink-700 text-white flex items-center justify-center touch-manipulation"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">{t.noUsers}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-700/40">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === users.length && users.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-brand-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.name}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.email}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.phone}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.role}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.status}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.lastActivity}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.created}</th>
                    <th className="px-4 py-3 text-end text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {users.map((u) => (
                    <tr key={u.id} className={`hover:bg-surface transition-colors ${selected.has(u.id) ? 'bg-brand-500/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          className="w-4 h-4 rounded accent-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-extrabold text-white">
                        {u.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary" dir="ltr">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary" dir="ltr">
                        {u.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider',
                            ROLE_COLORS[u.role] ?? 'bg-ink-700 text-text-secondary',
                          )}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              {t.active}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-extrabold">
                              <XCircle className="w-2.5 h-2.5" />
                              {t.blocked}
                            </span>
                          )}
                          {u.is_verified && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 text-[10px] font-extrabold">
                              {t.verified}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted tabular-nums">
                        {new Date(u.created_at).toLocaleDateString(
                          locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted tabular-nums">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString(
                          locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                          { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            className="w-8 h-8 rounded-lg bg-ink-700 hover:bg-ink-600 flex items-center justify-center text-text-secondary hover:text-white"
                            title={u.is_active ? t.block : t.unblock}
                          >
                            {u.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(u)}
                            className="w-8 h-8 rounded-lg bg-red-500/15 hover:bg-red-500/25 flex items-center justify-center text-red-400"
                            title={t.delete}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
