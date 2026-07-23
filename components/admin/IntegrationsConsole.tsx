'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard, Bell, Mail, MessageSquare, Database, Webhook, Activity, Settings, Play, Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, Zap
} from 'lucide-react';

interface ProviderInfo {
  name: string;
  enabled: boolean;
  status?: string;
}

interface IntegrationStatus {
  timestamp: string;
  categories: {
    payments: { providers: ProviderInfo[]; configured: number };
    push: { providers: ProviderInfo[]; configured: number };
    email: { providers: ProviderInfo[]; configured: number };
    sms: { providers: ProviderInfo[]; configured: number };
    storage: { providers: ProviderInfo[]; configured: number };
  };
  webhooks: {
    recent_deliveries: any[];
    dead_letter_count: number;
  };
}

interface Rule {
  id?: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: string;
  conditions: any[];
  actions: any[];
  max_executions_per_hour?: number;
  cooldown_minutes?: number;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  description?: string;
}

export default function IntegrationsConsole() {
  const [tab, setTab] = useState<'overview' | 'payments' | 'push' | 'email' | 'sms' | 'storage' | 'webhooks' | 'automation'>('overview');
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, r, w] = await Promise.all([
        fetch('/api/integrations/status').then((x) => x.json()),
        fetch('/api/automation/rules').then((x) => x.json()),
        fetch('/api/webhooks').then((x) => x.json()),
      ]);
      if (s.ok) setStatus(s);
      if (r.ok) setRules(r.rules || []);
      if (w.ok) setWebhooks(w.webhooks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRule(rule: Rule) {
    if (!rule.id) return;
    await fetch(`/api/automation/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    });
    loadAll();
  }

  async function testWebhook(id: string) {
    const res = await fetch('/api/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    setTestResults({ ...testResults, [id]: data });
  }

  if (loading || !status) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Integrations & Automation</h1>
        <p className="text-sm text-gray-500 mt-1">Manage payment providers, push, email, SMS, storage, webhooks, and automation rules</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
            { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
            { id: 'push', label: 'Push', icon: <Bell className="w-4 h-4" /> },
            { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
            { id: 'sms', label: 'SMS', icon: <MessageSquare className="w-4 h-4" /> },
            { id: 'storage', label: 'Storage', icon: <Database className="w-4 h-4" /> },
            { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4" /> },
            { id: 'automation', label: 'Automation', icon: <Zap className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === 'overview' && <OverviewTab status={status} />}
      {tab === 'payments' && <ProvidersTab title="Payment Providers" providers={status.categories.payments.providers} docs="https://dashboard.stripe.com" />}
      {tab === 'push' && <ProvidersTab title="Push Notification Providers" providers={status.categories.push.providers} docs="https://console.firebase.google.com" />}
      {tab === 'email' && <ProvidersTab title="Email Providers" providers={status.categories.email.providers} docs="https://resend.com/api-keys" />}
      {tab === 'sms' && <ProvidersTab title="SMS Providers" providers={status.categories.sms.providers} docs="https://console.twilio.com" />}
      {tab === 'storage' && <ProvidersTab title="Storage Providers" providers={status.categories.storage.providers} docs="https://supabase.com/dashboard" />}
      {tab === 'webhooks' && (
        <WebhooksTab
          webhooks={webhooks}
          testResults={testResults}
          onTest={testWebhook}
          onRefresh={loadAll}
        />
      )}
      {tab === 'automation' && <AutomationTab rules={rules} onToggle={toggleRule} />}
    </div>
  );
}

function OverviewTab({ status }: { status: IntegrationStatus }) {
  const cats = status.categories;
  const total = Object.values(cats).reduce((s, c) => s + c.providers.length, 0);
  const configured = Object.values(cats).reduce((s, c) => s + c.configured, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Providers" value={total} />
        <KPI label="Configured" value={configured} color="text-green-600" />
        <KPI label="Pending Setup" value={total - configured} color="text-brand-yellow-600" />
        <KPI label="Webhooks" value={status.webhooks.recent_deliveries.length} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(cats).map(([name, info]) => (
          <div key={name} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500">{name}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{info.configured}/{info.providers.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">configured</div>
              </div>
              {info.configured === info.providers.length && info.providers.length > 0 ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : info.configured > 0 ? (
                <AlertCircle className="w-6 h-6 text-brand-yellow-500" />
              ) : (
                <XCircle className="w-6 h-6 text-gray-300" />
              )}
            </div>
            <div className="mt-3 space-y-1">
              {info.providers.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{p.name}</span>
                  <span className={p.enabled ? 'text-green-600' : 'text-gray-400'}>
                    {p.enabled ? '✓ Enabled' : '○ Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold mb-3">Recent Webhook Deliveries</h3>
        {status.webhooks.recent_deliveries.length === 0 ? (
          <div className="text-sm text-gray-500">No webhook deliveries yet</div>
        ) : (
          <div className="space-y-1">
            {status.webhooks.recent_deliveries.slice(0, 10).map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-2">
                <span className={`w-2 h-2 rounded-full ${d.status === 'success' ? 'bg-green-500' : d.status === 'failed' ? 'bg-red-500' : 'bg-brand-yellow-500'}`} />
                <span className="font-mono text-xs text-gray-500 flex-1">{d.event}</span>
                <span className="text-xs text-gray-400">{d.attempts} attempts</span>
                <span className="text-xs text-gray-600">{d.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProvidersTab({ title, providers, docs }: { title: string; providers: ProviderInfo[]; docs: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-start px-4 py-2">Provider</th>
              <th className="text-start px-4 py-2">Status</th>
              <th className="text-start px-4 py-2">Configure</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.name} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">
                  {p.enabled ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Enabled
                    </span>
                  ) : (
                    <span className="text-gray-400 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <a href={docs} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">
                    Get credentials →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        <p className="font-semibold">To enable a provider:</p>
        <ol className="list-decimal list-inside mt-1 space-y-0.5">
          <li>Create an account with the provider (e.g., Stripe, Resend)</li>
          <li>Get your API keys from their dashboard</li>
          <li>Add to .env: <code className="bg-blue-100 px-1 rounded">PROVIDER_ENABLED=true</code> and <code className="bg-blue-100 px-1 rounded">PROVIDER_SECRET_KEY=...</code></li>
          <li>Restart the server</li>
        </ol>
      </div>
    </div>
  );
}

function WebhooksTab({ webhooks, testResults, onTest, onRefresh }: { webhooks: Webhook[]; testResults: Record<string, any>; onTest: (id: string) => void; onRefresh: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Webhooks</h2>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {webhooks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No webhooks configured. Click "Add Webhook" to create one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-start px-4 py-2">Name</th>
                <th className="text-start px-4 py-2">URL</th>
                <th className="text-start px-4 py-2">Events</th>
                <th className="text-start px-4 py-2">Status</th>
                <th className="text-start px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{w.name}</td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-600 max-w-md truncate">{w.url}</td>
                  <td className="px-4 py-2">{(w.events || []).join(', ')}</td>
                  <td className="px-4 py-2">
                    {w.enabled ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}
                  </td>
                  <td className="px-4 py-2 flex gap-1">
                    <button onClick={() => onTest(w.id)} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                      <Play className="w-3 h-3" /> Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {Object.entries(testResults).map(([id, result]) => (
        <div key={id} className="bg-gray-50 border rounded-lg p-3 text-sm">
          <div className="font-semibold">Test Result for {id}:</div>
          <pre className="text-xs mt-1 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ))}
      {showCreate && <WebhookCreateModal onClose={() => setShowCreate(false)} onSaved={onRefresh} />}
    </div>
  );
}

function WebhookCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    url: '',
    secret: '',
    events: '*',
    description: '',
  });

  async function save() {
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, events: form.events.split(',').map((e) => e.trim()) }),
    });
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h2 className="text-lg font-bold mb-4">Add Webhook</h2>
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full px-3 py-2 border rounded-md" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-endpoint.com/webhook" className="w-full px-3 py-2 border rounded-md" />
          <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Signing secret" type="password" className="w-full px-3 py-2 border rounded-md" />
          <input value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} placeholder="Events (comma-separated, * for all)" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-gray-600">Cancel</button>
          <button onClick={save} className="px-3 py-1.5 bg-blue-600 text-white rounded-md">Save</button>
        </div>
      </div>
    </div>
  );
}

function AutomationTab({ rules, onToggle }: { rules: Rule[]; onToggle: (rule: Rule) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Automation Rules</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No automation rules configured</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-start px-4 py-2">Name</th>
                <th className="text-start px-4 py-2">Trigger</th>
                <th className="text-start px-4 py-2">Actions</th>
                <th className="text-start px-4 py-2">Rate Limit</th>
                <th className="text-start px-4 py-2">Status</th>
                <th className="text-start px-4 py-2">Toggle</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id || r.name || i} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{r.trigger}</td>
                  <td className="px-4 py-2 text-xs">{(r.actions || []).map((a: any) => a.type).join(', ')}</td>
                  <td className="px-4 py-2 text-xs">{r.max_executions_per_hour || '∞'}/hr</td>
                  <td className="px-4 py-2">
                    {r.enabled ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => onToggle(r)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                      {r.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
