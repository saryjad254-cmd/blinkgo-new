'use client';

import Image from 'next/image';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Check from 'lucide-react/dist/esm/icons/check';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Mail from 'lucide-react/dist/esm/icons/mail';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Search from 'lucide-react/dist/esm/icons/search';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Store from 'lucide-react/dist/esm/icons/store';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Users from 'lucide-react/dist/esm/icons/users';
import { BlinkButton, BlinkCard, BlinkInput, BlinkLogo } from '@/components/brand';

const roles = [
  { title: 'Customer', description: 'Discover, order and track', icon: Users },
  { title: 'Driver', description: 'Deliver safely and earn', icon: Truck },
  { title: 'Restaurant', description: 'Manage orders and menu', icon: Store },
  { title: 'Admin', description: 'Operate the whole platform', icon: ShieldCheck },
];

const colors = [
  { name: 'Jet Black', value: '#08090B', className: 'bg-canvas', light: false },
  { name: 'Vivid Red', value: '#E10600', className: 'bg-brand', light: false },
  { name: 'Golden Yellow', value: '#FFC107', className: 'bg-brand-yellow', light: true },
  { name: 'Warm White', value: '#F7F7F5', className: 'bg-ink', light: true },
];

export default function BrandShowcasePage() {
  return (
    <main dir="ltr" className="min-h-screen overflow-hidden bg-canvas text-text-primary">
      <section className="relative border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(225,6,0,.25),transparent_34%),radial-gradient(circle_at_10%_55%,rgba(255,193,7,.12),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-2 text-xs font-extrabold uppercase tracking-[.18em] text-brand-hover">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
              BlinkGo Design System 4.0
            </div>
            <h1 className="max-w-3xl text-5xl font-black italic leading-[.94] tracking-[-.06em] sm:text-7xl">
              Built for speed.<br />
              <span className="text-brand">Designed for trust.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-text-secondary sm:text-lg">
              The shared visual language for every BlinkGo customer, driver, restaurant and admin experience.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BlinkButton size="lg" iconRight={<ArrowRight className="h-5 w-5" />}>Explore components</BlinkButton>
              <BlinkButton size="lg" variant="outlined">Accessibility: AA</BlinkButton>
            </div>
          </div>
          <div className="relative min-h-[340px] overflow-hidden rounded-[2rem] border border-border bg-surface-1 shadow-2xl sm:min-h-[460px]">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-brand-yellow to-brand" />
            <Image src="/brand/blinkgo-discovery-hero-v2.webp" alt="BlinkGo courier riding through a modern German city" fill priority className="object-cover object-center" sizes="(min-width: 1024px) 45vw, 100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/15 bg-black/55 p-4 backdrop-blur-md sm:inset-x-7 sm:bottom-7">
              <BlinkLogo variant="horizontal" size="lg" />
              <p className="mt-2 text-sm font-semibold text-white/75">Schnell. Zuverlässig. Für dich.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-5 py-14 sm:px-8 lg:py-20">
        <Section eyebrow="01 / Foundations" title="One identity. Four products." subtitle="The official palette is fixed across light, dark and role-based experiences.">
          <div className="mb-6 grid gap-3 rounded-[2rem] border border-border bg-surface-1 p-5 sm:grid-cols-3 sm:p-7">
            <div className="flex min-h-32 items-center justify-center rounded-2xl bg-canvas"><BlinkLogo variant="mark" size="xl" /></div>
            <div className="flex min-h-32 items-center justify-center rounded-2xl bg-canvas"><BlinkLogo variant="wordmark" size="xl" /></div>
            <div className="flex min-h-32 items-center justify-center rounded-2xl bg-canvas"><BlinkLogo variant="full" size="lg" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {colors.map((color) => (
              <div key={color.name} className={`${color.className} min-h-44 rounded-2xl border border-white/10 p-5 ${color.light ? 'text-canvas' : 'text-white'}`}>
                <p className="font-black">{color.name}</p>
                <p className={`mt-1 font-mono text-sm ${color.light ? 'text-canvas/65' : 'text-white/65'}`}>{color.value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="02 / Components" title="Controls that feel unmistakably BlinkGo" subtitle="Clear hierarchy, 44px minimum targets and visible keyboard focus are built in.">
          <div className="grid gap-5 lg:grid-cols-2">
            <BlinkCard padding="lg" className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">Buttons</p>
                <h3 className="mt-2 text-2xl font-black">Action hierarchy</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <BlinkButton>Primary action</BlinkButton>
                <BlinkButton variant="accent">Highlight</BlinkButton>
                <BlinkButton variant="outlined">Secondary</BlinkButton>
                <BlinkButton variant="ghost">Quiet action</BlinkButton>
              </div>
              <BlinkButton loading fullWidth>Processing</BlinkButton>
            </BlinkCard>

            <BlinkCard padding="lg" className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-yellow">Inputs</p>
                <h3 className="mt-2 text-2xl font-black">Fast and forgiving</h3>
              </div>
              <BlinkInput label="Search" placeholder="Restaurants, dishes, groceries…" leftIcon={<Search className="h-5 w-5" />} />
              <BlinkInput label="Email address" placeholder="name@example.com" hint="We never share your email." leftIcon={<Mail className="h-5 w-5" />} />
            </BlinkCard>
          </div>
        </Section>

        <Section eyebrow="03 / Product states" title="Every state has a clear next step" subtitle="Success, progress and errors use semantic colour without losing the BlinkGo identity.">
          <div className="grid gap-4 md:grid-cols-3">
            <StateCard icon={Check} tone="success" label="Success" title="Order confirmed" text="The restaurant has received the order." />
            <StateCard icon={Clock3} tone="warning" label="In progress" title="Driver is on the way" text="Live ETA and tracking stay visible." />
            <StateCard icon={CircleAlert} tone="error" label="Needs attention" title="Payment failed" text="Explain the issue and offer a safe retry." />
          </div>
        </Section>

        <Section eyebrow="04 / Product family" title="Shared DNA, role-specific focus" subtitle="Each portal keeps the same navigation, states and interaction rules.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map(({ title, description, icon: Icon }) => (
              <BlinkCard key={title} hoverable padding="lg" className="group">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white"><Icon className="h-6 w-6" /></div>
                <h3 className="mt-6 text-xl font-black">{title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{description}</p>
                <div className="mt-5 flex items-center gap-2 text-sm font-bold text-brand">View pattern <ArrowRight className="h-4 w-4" /></div>
              </BlinkCard>
            ))}
          </div>
        </Section>

        <Section eyebrow="05 / Installed identity" title="The same BlinkGo before the app even opens" subtitle="Installation, home-screen and notification assets now use the official black-rider identity with safe platform cropping.">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.25fr]">
            <BlinkCard padding="lg" className="flex flex-col items-center text-center">
              <div className="relative size-40 overflow-hidden rounded-[2.2rem] shadow-[0_24px_70px_rgba(0,0,0,.55)] ring-1 ring-white/10">
                <Image src="/brand/blinkgo-app-icon-512-v2.png" alt="BlinkGo installed app icon" fill sizes="160px" className="object-cover" />
              </div>
              <h3 className="mt-6 text-xl font-black">Installed app</h3>
              <p className="mt-2 text-sm text-text-secondary">192px · 512px · maskable safe area</p>
            </BlinkCard>

            <BlinkCard padding="lg" className="flex flex-col items-center text-center">
              <div className="grid size-40 place-items-center rounded-[2.2rem] bg-white shadow-[0_24px_70px_rgba(0,0,0,.35)]">
                <Image src="/brand/blinkgo-notification-badge-96-v2.png" alt="BlinkGo monochrome notification badge" width={96} height={96} className="h-24 w-24 object-contain invert" />
              </div>
              <h3 className="mt-6 flex items-center gap-2 text-xl font-black"><Bell className="size-5 text-brand" /> Notification badge</h3>
              <p className="mt-2 text-sm text-text-secondary">Monochrome B mark for Android status surfaces</p>
            </BlinkCard>

            <BlinkCard padding="lg" className="flex flex-col justify-center overflow-hidden bg-[radial-gradient(circle_at_70%_25%,rgba(225,6,0,.2),transparent_45%)]">
              <BlinkLogo variant="horizontal" size="xl" priority />
              <p className="mt-6 max-w-sm text-sm leading-6 text-text-secondary">One transparent lockup across customer, driver, restaurant, admin, tracking and startup surfaces.</p>
              <div className="mt-6 h-1 w-full rounded-full bg-gradient-to-r from-brand via-brand-yellow to-transparent" />
            </BlinkCard>
          </div>
        </Section>

        <section className="overflow-hidden rounded-[2rem] border border-brand/30 bg-gradient-to-br from-brand/20 via-surface-2 to-brand-yellow/10 p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-brand-yellow"><MapPin className="h-5 w-5" /><span className="text-sm font-black uppercase tracking-widest">Ready for the road</span></div>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">Fast. Reliable. Made for you.</h2>
              <p className="mt-3 max-w-2xl text-text-secondary">This page is now the canonical reference used while upgrading every BlinkGo screen.</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand text-white shadow-[0_18px_50px_rgba(225,6,0,.35)]"><ShoppingBag className="h-9 w-9" /></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section><p className="text-xs font-black uppercase tracking-[.22em] text-brand">{eyebrow}</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2><p className="mb-8 mt-3 max-w-2xl text-text-secondary">{subtitle}</p>{children}</section>;
}

function StateCard({ icon: Icon, tone, label, title, text }: { icon: typeof Check; tone: 'success' | 'warning' | 'error'; label: string; title: string; text: string }) {
  const styles = { success: 'bg-status-success/15 text-status-success border-status-success/25', warning: 'bg-status-warning/15 text-status-warning border-status-warning/25', error: 'bg-status-error/15 text-status-error border-status-error/25' }[tone];
  return <BlinkCard padding="lg"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${styles}`}><Icon className="h-5 w-5" /></div><p className="mt-5 text-xs font-black uppercase tracking-widest text-text-muted">{label}</p><h3 className="mt-2 text-xl font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p></BlinkCard>;
}
