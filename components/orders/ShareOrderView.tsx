'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useT } from '@/lib/i18n/I18nProvider';

import { CheckCircle2, ChefHat, Bike, MapPin, Package, Clock } from 'lucide-react';

interface ShareOrderViewProps {
  order: any;
}

const STATUS_FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'delivered'];

export function ShareOrderView({ order }: ShareOrderViewProps) {
  const t = useT();
  const idx = STATUS_FLOW.indexOf(order.status);
  const steps = [
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
    { key: 'preparing', label: 'Preparing', icon: ChefHat },
    { key: 'ready', label: 'Ready', icon: Package },
    { key: 'picked_up', label: 'Picked up', icon: Bike },
    { key: 'delivered', label: 'Delivered', icon: MapPin },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-racing-red to-golden-yellow text-white shadow-lg">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="mt-3 text-2xl font-black text-ink-1 dark:text-zinc-100">
          {t.share.shareTracking}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          #{order.order_number}
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            {'Restaurant'}
          </div>
          <div className="mt-1 text-lg font-bold text-ink-1 dark:text-zinc-100">
            {order.restaurants?.name ?? '—'}
          </div>
          <div className="text-sm text-zinc-500">{order.restaurants?.address}</div>
        </div>

        {/* Status stepper */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const stepIdx = STATUS_FLOW.indexOf(step.key);
            const passed = stepIdx <= idx;
            const current = stepIdx === idx;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                    passed
                      ? 'bg-emerald-500 text-white'
                      : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800'
                  } ${current ? 'ring-4 ring-racing-red/30' : ''}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className={`flex-1 text-sm font-semibold ${passed ? 'text-ink-1 dark:text-zinc-100' : 'text-zinc-400'}`}>
                  {step.label}
                </div>
                {current && (
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="rounded-full bg-racing-red px-3 py-1 text-xs font-bold text-white"
                  >
                    ●
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>

        {order.status === 'cancelled' && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {'Cancelled'}
          </div>
        )}
      </div>
    </div>
  );
}
