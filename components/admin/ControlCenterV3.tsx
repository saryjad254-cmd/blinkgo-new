'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Store, Truck, ShoppingBag, MapPin, Image as ImageIcon, Tag, Bell, CreditCard, Settings, BarChart3, History, Activity, Search, Plus, Edit, Ban, Check, ChevronRight, ChevronLeft, TrendingUp, FileText, DollarSign,
} from 'lucide-react';

type Section =
  | 'dashboard'
  | 'users' | 'customers' | 'drivers' | 'restaurants' | 'admins'
  | 'live-orders'
  | 'marketplace' | 'content' | 'promotions' | 'notifications' | 'payments'
  | 'settings' | 'analytics' | 'audit' | 'health'
  | 'customer-analytics' | 'driver-analytics' | 'restaurant-analytics'
  | 'marketplace-health' | 'revenue-optimization' | 'forecast' | 'reports';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
  group: string;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, group: 'core' },
  { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, group: 'people' },
  { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" />, group: 'people' },
  { id: 'drivers', label: 'Drivers', icon: <Truck className="w-4 h-4" />, group: 'people' },
  { id: 'restaurants', label: 'Restaurants', icon: <Store className="w-4 h-4" />, group: 'people' },
  { id: 'live-orders', label: 'Live Orders', icon: <ShoppingBag className="w-4 h-4" />, group: 'operations' },
  { id: 'marketplace', label: 'Marketplace', icon: <MapPin className="w-4 h-4" />, group: 'operations' },
  { id: 'content', label: 'Content', icon: <ImageIcon className="w-4 h-4" />, group: 'operations' },
  { id: 'promotions', label: 'Promotions', icon: <Tag className="w-4 h-4" />, group: 'operations' },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, group: 'operations' },
  { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" />, group: 'finance' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, group: 'intelligence' },
  { id: 'customer-analytics', label: 'Customer Analytics', icon: <Users className="w-4 h-4" />, group: 'intelligence' },
  { id: 'driver-analytics', label: 'Driver Analytics', icon: <Truck className="w-4 h-4" />, group: 'intelligence' },
  { id: 'restaurant-analytics', label: 'Restaurant Analytics', icon: <Store className="w-4 h-4" />, group: 'intelligence' },
  { id: 'marketplace-health', label: 'Marketplace Health', icon: <Activity className="w-4 h-4" />, group: 'intelligence' },
  { id: 'revenue-optimization', label: 'Revenue Optimization', icon: <DollarSign className="w-4 h-4" />, group: 'intelligence' },
  { id: 'forecast', label: 'Forecast', icon: <TrendingUp className="w-4 h-4" />, group: 'intelligence' },
  { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" />, group: 'intelligence' },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, group: 'system' },
  { id: 'audit', label: 'Audit', icon: <History className="w-4 h-4" />, group: 'system' },
  { id: 'health', label: 'Health', icon: <Activity className="w-4 h-4" />, group: 'system' },
];

const GROUP_LABELS: Record<string, string> = {
  core: 'Overview',
  people: 'People',
  operations: 'Operations',
  finance: 'Finance',
  intelligence: 'Intelligence',
  system: 'System',
};

export default function ControlCenterV3() {
  const [section, setSection] = useState<Section>('dashboard');
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const g: Record<string, NavItem[]> = {};
    for (const item of NAV) {
      if (!g[item.group]) g[item.group] = [];
      g[item.group].push(item);
    }
    return g;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return null;
    const lo = search.toLowerCase();
    return NAV.filter((i) => i.label.toLowerCase().includes(lo));
  }, [search]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50">
      <aside className="w-64 bg-white border-e border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full ps-8 pe-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {filtered ? (
            <div className="space-y-0.5">
              {filtered.map((item) => (
                <NavBtn key={item.id} item={item} active={section === item.id} onClick={() => setSection(item.id)} />
              ))}
            </div>
          ) : (
            <>
              {Object.entries(groups).map(([g, items]) => (
                <div key={g} className="mb-4">
                  <div className="px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {GROUP_LABELS[g] || g}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavBtn key={item.id} item={item} active={section === item.id} onClick={() => setSection(item.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <SectionContent section={section} onNavigate={setSection} />
      </main>
    </div>
  );
}

function NavBtn({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition ${
        active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className={active ? 'text-blue-600' : 'text-gray-400'}>{item.icon}</span>
      <span className="flex-1 min-w-0 text-start truncate">{item.label}</span>
      {active && <ChevronRight className="w-3 h-3" />}
    </button>
  );
}

function SectionContent({ section, onNavigate }: { section: Section; onNavigate: (s: Section) => void }) {
  switch (section) {
    case 'dashboard': return <DashboardSection />;
    case 'users': return <UsersSection />;
    case 'customers': return <UsersSection role="customer" />;
    case 'drivers': return <UsersSection role="driver" />;
    case 'restaurants': return <RestaurantsSection />;
    case 'live-orders': return <SimpleSection title="Live Orders" desc="Real-time order management" />;
    case 'marketplace': return <SimpleSection title="Marketplace" desc="Zones, fees, surge settings" />;
    case 'content': return <SimpleSection title="Content" desc="Banners, categories, FAQ" />;
    case 'promotions': return <SimpleSection title="Promotions" desc="Coupons, campaigns, referrals" />;
    case 'notifications': return <SimpleSection title="Notifications" desc="Push, email, SMS" />;
    case 'payments': return <SimpleSection title="Payments" desc="Providers, commissions, payouts" />;
    case 'settings': return <SimpleSection title="Settings" desc="Branding, languages, currency" />;
    case 'audit': return <SimpleSection title="Audit" desc="Activity log, change history" />;
    case 'health': return <SimpleSection title="System Health" desc="Live status of all services" />;
    case 'analytics': return <AnalyticsHub onNavigate={onNavigate} />;
    case 'customer-analytics': return <AnalyticsSection endpoint="customer" title="Customer Analytics" />;
    case 'driver-analytics': return <AnalyticsSection endpoint="driver" title="Driver Analytics" />;
    case 'restaurant-analytics': return <AnalyticsSection endpoint="restaurant" title="Restaurant Analytics" />;
    case 'marketplace-health': return <AnalyticsSection endpoint="marketplace" title="Marketplace Health" />;
    case 'revenue-optimization': return <AnalyticsSection endpoint="revenue" title="Revenue Optimization" />;
    case 'forecast': return <ForecastView />;
    case 'reports': return <ReportsView />;
    case 'admins': return <SimpleSection title="Admins" desc="Administrative users" />;
    default: return <DashboardSection />;
  }
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3 sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

function DashboardSection() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch('/api/analytics/executive?period=30d').then((r) => r.json()).then(setData);
  }, []);
  if (!data?.current) return <div className="p-6 text-gray-500">Loading…</div>;
  const k = data.current;
  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle="Top-level business KPIs" />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'GMV', value: `€${k.gmv.toFixed(0)}`, color: 'emerald' },
          { label: 'Net Revenue', value: `€${k.net_revenue.toFixed(0)}`, color: 'blue' },
          { label: 'Active Customers', value: k.active_customers.toLocaleString(), color: 'purple' },
          { label: 'Orders', value: k.completed_orders.toLocaleString(), color: 'orange' },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-gray-500">{m.label}</div>
            <div className={`text-3xl font-bold text-${m.color}-600 mt-2`}>{m.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

interface UserRow {
  id: string;
  email: string;
  full_name?: string;
  name?: string;
  role: string;
  is_active?: boolean;
  is_verified?: boolean;
  phone?: string | null;
}

function UsersSection({ role }: { role?: string }) {
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50', offset: String(page * 50) });
    if (role) params.append('role', role);
    if (search) params.append('search', search);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await res.json();
    setItems(json.users || []);
    setLoading(false);
  }, [page, role, search]);

  useEffect(() => { load(); }, [load]);

  async function suspend(id: string) {
    await fetch(`/api/admin/users/${id}/suspend`, { method: 'POST' });
    load();
  }
  async function unsuspend(id: string) {
    await fetch(`/api/admin/users/${id}/unsuspend`, { method: 'POST' });
    load();
  }

  return (
    <>
      <PageHeader
        title={role ? `Users (${role})` : 'Users'}
        actions={
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md flex items-center gap-1.5 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create
          </button>
        }
      />
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-3 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-80 px-3 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-start px-4 py-2">Name</th>
                <th className="text-start px-4 py-2">Email</th>
                <th className="text-start px-4 py-2">Role</th>
                <th className="text-start px-4 py-2">Status</th>
                <th className="text-start px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No users</td></tr>
              ) : items.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{u.full_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{u.role}</span></td>
                  <td className="px-4 py-2">
                    {!u.is_active ? <span className="text-red-600">Suspended</span> :
                     !u.is_active ? <span className="text-red-800">Banned</span> :
                     !u.is_verified ? <span className="text-brand-yellow-600">Pending</span> :
                     <span className="text-green-600">Active</span>}
                  </td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => setEditing(u)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-3.5 h-3.5" /></button>
                    {!!u.is_active && !!u.is_active && (
                      <button onClick={() => suspend(u.id)} className="p-1 text-brand-yellow-600 hover:bg-yellow-50 rounded"><Ban className="w-3.5 h-3.5" /></button>
                    )}
                    {!u.is_active && (
                      <button onClick={() => unsuspend(u.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 border-t border-gray-200 flex items-center justify-between">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="text-sm text-gray-600 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4 inline" /> Prev
            </button>
            <span className="text-sm text-gray-500">Page {page + 1}</span>
            <button disabled={items.length < 50} onClick={() => setPage(page + 1)} className="text-sm text-gray-600 disabled:opacity-30">
              Next <ChevronRight className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </div>
      {(showCreate || editing) && (
        <UserModal user={editing} role={role} onClose={() => { setShowCreate(false); setEditing(null); }} onSaved={load} />
      )}
    </>
  );
}

function UserModal({ user, role, onClose, onSaved }: { user: UserRow | null; role?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
    role: user?.role || role || 'customer',
    phone: user?.phone || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const url = user ? `/api/admin/users/${user.id}` : '/api/admin/users';
    const method = user ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h2 className="text-lg font-bold mb-4">{user ? 'Edit User' : 'Create User'}</h2>
        <div className="space-y-3">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full px-3 py-2 border rounded-md" />
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" className="w-full px-3 py-2 border rounded-md" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border rounded-md">
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="restaurant">Restaurant</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
          </select>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-md disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RestaurantRow {
  id: string;
  name: string;
  category: string;
  rating: number;
  total_orders: number;
  is_active: boolean;
  is_featured: boolean;
  address: string;
  phone: string;
}

function RestaurantsSection() {
  const [items, setItems] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RestaurantRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/restaurants?limit=100');
    const json = await res.json();
    setItems(json.restaurants || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        title="Restaurants"
        actions={
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md flex items-center gap-1.5 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create
          </button>
        }
      />
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-start px-4 py-2">Name</th>
                <th className="text-start px-4 py-2">Category</th>
                <th className="text-start px-4 py-2">Rating</th>
                <th className="text-start px-4 py-2">Orders</th>
                <th className="text-start px-4 py-2">Status</th>
                <th className="text-start px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : items.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.category || '—'}</td>
                  <td className="px-4 py-2">{r.rating?.toFixed(1) || '—'} ⭐</td>
                  <td className="px-4 py-2">{r.total_orders || 0}</td>
                  <td className="px-4 py-2">
                    {r.is_featured && <span className="px-2 py-0.5 bg-yellow-100 text-brand-yellow-700 text-xs rounded me-1">Featured</span>}
                    {r.is_active ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}
                  </td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => setEditing(r)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(showCreate || editing) && <RestaurantModal restaurant={editing} onClose={() => { setShowCreate(false); setEditing(null); }} onSaved={load} />}
    </>
  );
}

function RestaurantModal({ restaurant, onClose, onSaved }: { restaurant: RestaurantRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: restaurant?.name || '',
    category: restaurant?.category || 'general',
    description: '',
    address: restaurant?.address || '',
    phone: restaurant?.phone || '',
    delivery_radius_km: 5,
    commission_pct: 15,
    is_active: restaurant?.is_active ?? true,
    is_featured: restaurant?.is_featured ?? false,
  });

  async function save() {
    const url = restaurant ? `/api/admin/restaurants/${restaurant.id}` : '/api/admin/restaurants';
    const method = restaurant ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">{restaurant ? 'Edit Restaurant' : 'Create Restaurant'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="col-span-2 px-3 py-2 border rounded-md" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border rounded-md">
            {['general', 'pizza', 'burger', 'sushi', 'asian', 'italian', 'german', 'healthy', 'dessert', 'drinks'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 border rounded-md" />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="col-span-2 px-3 py-2 border rounded-md" />
          <input type="number" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: Number(e.target.value) })} placeholder="Delivery radius (km)" className="px-3 py-2 border rounded-md" />
          <input type="number" step="0.5" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: Number(e.target.value) })} placeholder="Commission %" className="px-3 py-2 border rounded-md" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Featured</label>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-600">Cancel</button>
          <button onClick={save} className="px-3 py-1.5 bg-blue-600 text-white rounded-md">Save</button>
        </div>
      </div>
    </div>
  );
}

function SimpleSection({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={desc} />
      <div className="p-6 text-gray-500">Use the navigation to access this section.</div>
    </>
  );
}

function AnalyticsSection({ endpoint, title }: { endpoint: string; title: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/analytics/${endpoint}`).then((r) => r.json()).then(setData); }, [endpoint]);
  if (!data) return <div className="p-6 text-gray-500">Loading…</div>;
  return (
    <>
      <PageHeader title={title} />
      <div className="p-6">
        <pre className="bg-white border rounded-lg p-4 text-xs overflow-auto max-h-[70vh]">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </>
  );
}

function AnalyticsHub({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const cards: { id: Section; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
    { id: 'customer-analytics', title: 'Customer Analytics', desc: 'LTV, cohorts, churn', icon: <Users className="w-5 h-5" />, color: 'purple' },
    { id: 'driver-analytics', title: 'Driver Analytics', desc: 'Acceptance, earnings, retention', icon: <Truck className="w-5 h-5" />, color: 'blue' },
    { id: 'restaurant-analytics', title: 'Restaurant Analytics', desc: 'SLA, prep, products', icon: <Store className="w-5 h-5" />, color: 'emerald' },
    { id: 'marketplace-health', title: 'Marketplace Health', desc: 'Supply/demand balance', icon: <Activity className="w-5 h-5" />, color: 'orange' },
    { id: 'revenue-optimization', title: 'Revenue Optimization', desc: 'Surge, fees, ROI', icon: <DollarSign className="w-5 h-5" />, color: 'red' },
    { id: 'forecast', title: 'Forecast', desc: 'Demand forecasting', icon: <TrendingUp className="w-5 h-5" />, color: 'indigo' },
    { id: 'reports', title: 'Reports', desc: 'Daily/weekly/monthly', icon: <FileText className="w-5 h-5" />, color: 'pink' },
  ];
  return (
    <>
      <PageHeader title="Analytics" />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <button key={c.id} onClick={() => onNavigate(c.id)} className="bg-white border border-gray-200 rounded-xl p-5 text-start hover:shadow-md transition">
            <div className={`w-10 h-10 bg-${c.color}-100 text-${c.color}-600 rounded-lg flex items-center justify-center mb-3`}>{c.icon}</div>
            <div className="font-semibold text-gray-900">{c.title}</div>
            <div className="text-sm text-gray-500 mt-1">{c.desc}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function ForecastView() {
  const [horizon, setHorizon] = useState<'tomorrow' | 'week' | 'month'>('week');
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/analytics/forecast?horizon=${horizon}`).then((r) => r.json()).then(setData); }, [horizon]);
  return (
    <>
      <PageHeader title="Forecast"
        actions={
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['tomorrow', 'week', 'month'] as const).map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className={`px-3 py-1 rounded text-sm ${horizon === h ? 'bg-white shadow' : 'text-gray-600'}`}>
                {h === 'tomorrow' ? 'Tomorrow' : h === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-6">
        {!data ? <div className="text-gray-500">Loading…</div> : (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase">Total predicted</div>
              <div className="text-3xl font-bold mt-1">{data.total_predicted?.toLocaleString() || 0}</div>
              <div className="text-sm text-gray-600 mt-1">{(data.growth_rate * 100).toFixed(1)}% growth · {(data.confidence * 100).toFixed(0)}% confidence</div>
              <div className="text-xs text-gray-400 mt-2">{data.methodology}</div>
            </div>
            <div className="bg-white border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Predictions</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {(data.predictions || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 w-44">{new Date(p.timestamp).toLocaleString()}</span>
                    <span className="font-mono font-semibold w-16">{p.predicted}</span>
                    <span className="text-xs text-gray-400">[{p.lower_bound} - {p.upper_bound}]</span>
                    <span className="text-xs text-gray-400">{(p.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReportsView() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/analytics/reports?period=${period}`).then((r) => r.json()).then(setData); }, [period]);
  return (
    <>
      <PageHeader title="Executive Reports"
        actions={
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-white shadow' : 'text-gray-600'}`}>
                {p}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-6">
        {!data ? <div className="text-gray-500">Loading…</div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'GMV', value: `€${data.summary?.gmv?.toFixed(0) || 0}` },
                { label: 'Orders', value: data.summary?.orders?.toLocaleString() || 0 },
                { label: 'New Customers', value: data.summary?.new_customers || 0 },
                { label: 'Margin', value: `${((data.summary?.profit_margin || 0) * 100).toFixed(1)}%` },
              ].map((m) => (
                <div key={m.label} className="bg-white border rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase">{m.label}</div>
                  <div className="text-xl font-bold mt-1">{m.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-white border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Highlights</h3>
              <div className="space-y-2">
                {(data.highlights || []).map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      h.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      h.severity === 'warning' ? 'bg-yellow-100 text-brand-yellow-700' :
                      h.severity === 'positive' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{h.severity}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{h.title}</div>
                      <div className="text-sm text-gray-600 mt-0.5">{h.description}</div>
                      {h.action && <div className="text-xs text-blue-600 mt-1">→ {h.action}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
