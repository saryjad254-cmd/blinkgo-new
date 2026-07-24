'use client';

import { BlinkLogo, BlinkButton, BlinkCard, BlinkInput, BlinkTextarea, BlinkBadge, BlinkStatusBadge, BlinkAvatar, BlinkMapMarker, BlinkStat } from '@/components/brand';
import { Search, Heart, MapPin, Store, ShoppingBag, Truck, Star, Bell, Plus, ArrowRight, Mail, Lock, User, Phone, Calendar, Zap, Shield, Clock, CreditCard } from 'lucide-react';

export default function BrandShowcasePage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* ═══════ HERO ═══════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-yellow via-brand-yellow-hover to-brand-yellow-active">
        {/* Speed lines decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[20%] -left-10 w-[120%] h-1 bg-gradient-to-r from-transparent via-brand-red/30 to-brand-red/50 rotate-12" />
          <div className="absolute top-1/2 -left-10 w-[120%] h-1 bg-gradient-to-r from-transparent via-brand-red/25 to-brand-red/45 rotate-12" />
          <div className="absolute top-[80%] -left-10 w-[120%] h-1 bg-gradient-to-r from-transparent via-brand-red/20 to-brand-red/40 rotate-12" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-20 sm:py-28 text-center">
          <div className="flex justify-center mb-6">
            <BlinkLogo size="2xl" variant="mark" />
          </div>

          <h1 className="text-5xl sm:text-7xl font-black italic tracking-tighter text-brand-black">
            Blink<span className="text-brand-red">Go</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg font-bold tracking-[0.25em] text-brand-black/80 uppercase">
            Schnell. Zuverlässig. Für Dich.
          </p>
          <p className="mt-8 text-lg sm:text-xl max-w-2xl mx-auto text-brand-black/70">
            The official BlinkGo Design System — premium, fast, modern, reliable.
            Every component in this page is the source of truth for the entire application.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <BlinkButton variant="primary" size="lg" icon={<Zap className="w-5 h-5" />}>
              Get Started
            </BlinkButton>
            <BlinkButton variant="outlined" size="lg" icon={<ArrowRight className="w-5 h-5" />}>
              View Tokens
            </BlinkButton>
          </div>
        </div>
      </section>

      {/* ═══════ OFFICIAL COLORS ═══════ */}
      <Section title="01 — Official Colors" subtitle="Extracted directly from the logo">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <ColorSwatch
            name="Brand Yellow"
            hex="#F5B819"
            cssVar="--brand-yellow"
            description="Primary background of the logo. Used for highlights, accents, and the brand mark background."
            variant="yellow"
          />
          <ColorSwatch
            name="Brand Red"
            hex="#DC2626"
            cssVar="--brand-red"
            description="Primary CTA, 'Go' text, 'B' mark accent. Energy, urgency, action."
            variant="red"
          />
          <ColorSwatch
            name="Brand Black"
            hex="#0A0A0A"
            cssVar="--brand-black"
            description="'Blink' text, premium dark surfaces, primary text. Professionalism, depth."
            variant="black"
          />
        </div>

        <h3 className="text-lg font-extrabold text-text-primary mt-12 mb-4">Semantic Colors</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ColorChip name="Success" hex="#10B981" />
          <ColorChip name="Warning" hex="#F5B819" />
          <ColorChip name="Info"    hex="#3B82F6" />
          <ColorChip name="Danger"  hex="#DC2626" />
        </div>
      </Section>

      {/* ═══════ TYPOGRAPHY ═══════ */}
      <Section title="02 — Typography" subtitle="Inter (DE/EN) + Cairo (AR). One scale, 13 sizes.">
        <div className="space-y-6">
          <TypeRow label="Display · 72px / 900" className="text-7xl font-black italic tracking-tighter">
            Blink<span className="text-brand-red">Go</span>
          </TypeRow>
          <TypeRow label="H1 · 36px / 800" className="text-4xl font-extrabold tracking-tight">Schnelle Lieferung</TypeRow>
          <TypeRow label="H2 · 30px / 800" className="text-3xl font-extrabold tracking-tight">Premium Quality</TypeRow>
          <TypeRow label="H3 · 24px / 700" className="text-2xl font-bold tracking-tight">Best Restaurants</TypeRow>
          <TypeRow label="Body · 16px / 400" className="text-base font-normal">The quick brown fox jumps over the lazy dog.</TypeRow>
          <TypeRow label="Caption · 12px / 600 uppercase" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Tagline · SCHNELL. ZUVERLÄSSIG. FÜR DICH.
          </TypeRow>
        </div>
      </Section>

      {/* ═══════ SPACING ═══════ */}
      <Section title="03 — Spacing" subtitle="8pt grid. Every padding, margin, and gap uses these values.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
            <div key={n} className="bg-surface border border-edge rounded-xl p-3">
              <div className="text-xs font-bold text-text-muted mb-2">spacing-{n} · {n * 4}px</div>
              <div className="h-2 rounded bg-gradient-to-r from-brand-red to-brand-yellow" style={{ width: `${n * 4}px` }} />
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════ RADIUS ═══════ */}
      <Section title="04 — Border Radius" subtitle="From subtle to bold. Used consistently across components.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'sm', size: 'rounded-md',  value: '8px'  },
            { name: 'md', size: 'rounded-xl',  value: '12px' },
            { name: 'lg', size: 'rounded-2xl', value: '16px' },
            { name: 'xl', size: 'rounded-3xl', value: '24px' },
          ].map((r) => (
            <div key={r.name} className="bg-surface border border-edge p-4 text-center">
              <div className={`w-16 h-16 mx-auto mb-2 ${r.size} bg-brand-red`} />
              <div className="text-xs font-bold text-text-primary">rounded-{r.name}</div>
              <div className="text-xs text-text-muted">{r.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════ BUTTONS ═══════ */}
      <Section title="05 — Buttons" subtitle="8 variants. Always branded. Always tactile.">
        <div className="space-y-6">
          <ComponentRow label="Primary (Red CTA)">
            <BlinkButton variant="primary" icon={<Zap />}>Bestellen</BlinkButton>
            <BlinkButton variant="primary" loading>Senden</BlinkButton>
            <BlinkButton variant="primary" disabled>Disabled</BlinkButton>
            <BlinkButton variant="primary" size="sm" icon={<Plus />}>Add</BlinkButton>
            <BlinkButton variant="primary" size="lg" iconRight={<ArrowRight />}>Continue</BlinkButton>
          </ComponentRow>

          <ComponentRow label="Secondary (Black)">
            <BlinkButton variant="secondary">Speichern</BlinkButton>
            <BlinkButton variant="secondary" icon={<Heart />}>Favorit</BlinkButton>
          </ComponentRow>

          <ComponentRow label="Accent (Yellow)">
            <BlinkButton variant="accent">Upgrade</BlinkButton>
            <BlinkButton variant="accent" icon={<Star />}>Premium</BlinkButton>
          </ComponentRow>

          <ComponentRow label="Outlined · Ghost">
            <BlinkButton variant="outlined">Abbrechen</BlinkButton>
            <BlinkButton variant="ghost">Mehr Info</BlinkButton>
          </ComponentRow>

          <ComponentRow label="Danger · Success">
            <BlinkButton variant="danger">Löschen</BlinkButton>
            <BlinkButton variant="success">Bestätigen</BlinkButton>
          </ComponentRow>

          <ComponentRow label="Glass (over images)">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-brand-red to-brand-yellow relative overflow-hidden">
              <div className="absolute top-1/4 -left-10 w-full h-0.5 bg-white/30 rotate-12" />
              <div className="absolute top-1/2 -left-10 w-full h-0.5 bg-white/30 rotate-12" />
              <BlinkButton variant="glass" icon={<Zap />}>Glass Button</BlinkButton>
            </div>
          </ComponentRow>

          <ComponentRow label="Sizes">
            <BlinkButton size="xs">XS</BlinkButton>
            <BlinkButton size="sm">SM</BlinkButton>
            <BlinkButton size="md">MD</BlinkButton>
            <BlinkButton size="lg">LG</BlinkButton>
            <BlinkButton size="xl">XL</BlinkButton>
          </ComponentRow>
        </div>
      </Section>

      {/* ═══════ CARDS ═══════ */}
      <Section title="06 — Cards" subtitle="5 variants for every content type">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <BlinkCard variant="default" hoverable>
            <h3 className="text-lg font-extrabold mb-1">Default Card</h3>
            <p className="text-sm text-text-secondary">Subtle border, soft shadow. The workhorse.</p>
          </BlinkCard>
          <BlinkCard variant="elevated" hoverable>
            <h3 className="text-lg font-extrabold mb-1">Elevated</h3>
            <p className="text-sm text-text-secondary">More depth, no border. Premium feel.</p>
          </BlinkCard>
          <BlinkCard variant="brand" brandAccent="red" hoverable>
            <h3 className="text-lg font-extrabold mb-1">Brand Accent</h3>
            <p className="text-sm text-text-secondary">Red bar on top. Highlighted content.</p>
          </BlinkCard>
          <BlinkCard variant="dark" hoverable>
            <h3 className="text-lg font-extrabold mb-1 text-white">Dark Premium</h3>
            <p className="text-sm text-white/70">Black with white text. Hero sections.</p>
          </BlinkCard>
          <BlinkCard variant="outline" hoverable>
            <h3 className="text-lg font-extrabold mb-1">Outline</h3>
            <p className="text-sm text-text-secondary">Just a border. Low-emphasis.</p>
          </BlinkCard>
          <BlinkCard variant="flat" hoverable>
            <h3 className="text-lg font-extrabold mb-1">Flat</h3>
            <p className="text-sm text-text-secondary">No border, no shadow. Minimal.</p>
          </BlinkCard>
        </div>
      </Section>

      {/* ═══════ INPUTS ═══════ */}
      <Section title="07 — Inputs" subtitle="Forms that feel premium. Always validated. Always accessible.">
        <div className="max-w-2xl space-y-4">
          <BlinkInput
            label="Email Address"
            type="email"
            placeholder="you@blinkgo.de"
            leftIcon={<Mail className="w-4 h-4" />}
            required
            hint="We'll never share your email"
          />
          <BlinkInput
            label="Password"
            type="password"
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            required
          />
          <BlinkInput
            label="Email"
            value="invalid@"
            readOnly
            error="Please enter a valid email address"
            leftIcon={<Mail className="w-4 h-4" />}
          />
          <BlinkInput
            label="Search"
            placeholder="Find restaurants, dishes, drivers…"
            leftIcon={<Search className="w-4 h-4" />}
            rightIcon={<button type="button" aria-label="Search"><ArrowRight className="w-4 h-4" /></button>}
          />
          <BlinkTextarea
            label="Delivery Instructions"
            placeholder="e.g. Ring the doorbell, leave at door…"
            hint="Helps your driver find you faster"
          />
        </div>
      </Section>

      {/* ═══════ BADGES ═══════ */}
      <Section title="08 — Badges & Status" subtitle="8 variants. With optional dot for live indicators.">
        <div className="space-y-4">
          <ComponentRow label="Static">
            <BlinkBadge variant="red">Aktion</BlinkBadge>
            <BlinkBadge variant="yellow">Beliebt</BlinkBadge>
            <BlinkBadge variant="black">Neu</BlinkBadge>
            <BlinkBadge variant="success">Verfügbar</BlinkBadge>
            <BlinkBadge variant="warning">Verspätet</BlinkBadge>
            <BlinkBadge variant="info">Info</BlinkBadge>
            <BlinkBadge variant="neutral">Standard</BlinkBadge>
            <BlinkBadge variant="outline">Outline</BlinkBadge>
          </ComponentRow>
          <ComponentRow label="Live (with dot)">
            <BlinkBadge variant="success" dot>Online</BlinkBadge>
            <BlinkBadge variant="red" dot>Live</BlinkBadge>
            <BlinkBadge variant="warning" dot>Pending</BlinkBadge>
            <BlinkBadge variant="info" dot>Syncing</BlinkBadge>
          </ComponentRow>
          <ComponentRow label="Order Status">
            <BlinkStatusBadge status="preparing" />
            <BlinkStatusBadge status="ready" />
            <BlinkStatusBadge status="on-the-way" />
            <BlinkStatusBadge status="delivered" />
            <BlinkStatusBadge status="cancelled" />
            <BlinkStatusBadge status="vip" />
            <BlinkStatusBadge status="new" />
          </ComponentRow>
        </div>
      </Section>

      {/* ═══════ AVATARS ═══════ */}
      <Section title="09 — Avatars" subtitle="Always branded. With online status + tier badge.">
        <div className="flex flex-wrap items-end gap-6">
          <BlinkAvatar name="Anna Schmidt" size="sm" online tier="gold" />
          <BlinkAvatar name="Max Mueller" size="md" online tier="silver" />
          <BlinkAvatar name="Sara Khoury" size="lg" online={false} tier="vip" />
          <BlinkAvatar name="Karim Berlin" size="xl" online tier="platinum" ring />
          <BlinkAvatar name="Lina Test" size="2xl" online tier="bronze" />
          <BlinkAvatar name="Tom B." size="lg" />
        </div>
      </Section>

      {/* ═══════ STATS ═══════ */}
      <Section title="10 — Stats / KPIs" subtitle="Dashboard-ready. With trends, icons, and variants.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BlinkStat
            label="Today's Revenue"
            value="€2,847"
            icon={<CreditCard className="w-5 h-5" />}
            change={12.4}
            changeLabel="vs yesterday"
          />
          <BlinkStat
            label="Active Orders"
            value={47}
            icon={<ShoppingBag className="w-5 h-5" />}
            change={-3.2}
          />
          <BlinkStat
            label="Avg Delivery"
            value="28"
            suffix="min"
            icon={<Clock className="w-5 h-5" />}
            change={5.1}
            changeLabel="faster"
          />
          <BlinkStat
            label="Driver Online"
            value="12/15"
            icon={<Truck className="w-5 h-5" />}
          />
          <BlinkStat
            label="Premium Card"
            value="€1,250"
            icon={<Star className="w-5 h-5" />}
            variant="brand"
            change={18.7}
          />
          <BlinkStat
            label="Success Metric"
            value="98.5"
            suffix="%"
            icon={<Shield className="w-5 h-5" />}
            variant="success"
          />
        </div>
      </Section>

      {/* ═══════ MAP MARKERS ═══════ */}
      <Section title="11 — Map Markers" subtitle="7 marker types. Pulsing for active. Brand-consistent.">
        <div className="bg-gradient-to-br from-surface-light to-surface rounded-3xl p-8 border border-edge">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-6 items-end justify-items-center">
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="restaurant" isActive label="Burger King" />
              <span className="text-xs text-text-muted">Restaurant</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="market" label="REWE" />
              <span className="text-xs text-text-muted">Market</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="pharmacy" label="Apotheke" />
              <span className="text-xs text-text-muted">Pharmacy</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="customer" isActive label="You" />
              <span className="text-xs text-text-muted">Customer</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="driver" isActive rotation={45} label="Max" />
              <span className="text-xs text-text-muted">Driver</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="pickup" label="Pickup" />
              <span className="text-xs text-text-muted">Pickup</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlinkMapMarker type="destination" label="Home" />
              <span className="text-xs text-text-muted">Destination</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════ ICONOGRAPHY ═══════ */}
      <Section title="12 — Iconography" subtitle="Lucide React. Rounded, minimal, elegant. 24×24 base, stroke 2.">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {[
            Search, Heart, MapPin, Store, ShoppingBag, Truck, Star, Bell,
            Plus, ArrowRight, Mail, Lock, User, Phone, Calendar, Zap,
            Shield, Clock, CreditCard,
          ].map((Icon, i) => (
            <div key={i} className="aspect-square bg-surface border border-edge rounded-xl flex flex-col items-center justify-center gap-1.5 hover:border-brand-red hover:shadow-md transition-all cursor-pointer">
              <Icon className="w-6 h-6 text-brand-red" />
              <span className="text-[10px] text-text-muted truncate max-w-full px-1">{Icon.displayName || 'icon'}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════ RESTAURANT CARD EXAMPLE ═══════ */}
      <Section title="13 — Real Component Examples" subtitle="Used in production. Future pages MUST follow these patterns.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Restaurant card example */}
          <BlinkCard variant="elevated" padding="none" hoverable className="overflow-hidden">
            <div className="h-32 bg-gradient-to-br from-brand-red to-brand-red-hover relative">
              <div className="absolute top-2 end-2">
                <BlinkBadge variant="yellow" rounded="md" size="sm">⭐ 4.8</BlinkBadge>
              </div>
              <div className="absolute top-2 start-2">
                <BlinkBadge variant="success" dot rounded="md" size="sm">Open</BlinkBadge>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand-yellow flex items-center justify-center text-2xl">🍔</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-text-primary truncate">Burger Meister</h3>
                  <p className="text-xs text-text-secondary truncate">American · $$ · 1.2 km</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                <Clock className="w-3.5 h-3.5" />
                <span>25-35 min</span>
                <span>·</span>
                <span>Free delivery</span>
              </div>
              <div className="mt-4 flex gap-2">
                <BlinkButton variant="primary" size="sm" fullWidth>Bestellen</BlinkButton>
                <BlinkButton variant="outlined" size="sm" icon={<Heart className="w-4 h-4" />} aria-label="Favorite" />
              </div>
            </div>
          </BlinkCard>

          {/* Order tracking card example */}
          <BlinkCard variant="brand" brandAccent="red">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-text-secondary uppercase font-bold tracking-wider">Live Tracking</p>
                <h3 className="font-extrabold text-text-primary">On the way</h3>
              </div>
            </div>
            <div className="text-3xl font-black text-text-primary">12 <span className="text-lg font-bold text-text-secondary">min away</span></div>
            <div className="mt-3 flex items-center gap-2">
              <BlinkAvatar name="Max M" size="sm" online />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary">Max Mueller</p>
                <p className="text-xs text-text-secondary">⭐ 4.9 · 247 deliveries</p>
              </div>
              <BlinkButton variant="primary" size="sm">Call</BlinkButton>
            </div>
          </BlinkCard>

          {/* Driver earnings example */}
          <BlinkCard variant="dark">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/70 uppercase tracking-wider font-bold">Today</span>
              <BlinkBadge variant="success" dot size="sm">Online</BlinkBadge>
            </div>
            <div className="text-4xl font-black text-white">€142</div>
            <div className="text-sm text-white/70 mt-1">8 deliveries</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/10 rounded-lg p-2">
                <p className="text-white/60">This week</p>
                <p className="font-extrabold text-white">€842</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2">
                <p className="text-white/60">Tips</p>
                <p className="font-extrabold text-white">€28</p>
              </div>
            </div>
          </BlinkCard>
        </div>
      </Section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="border-t border-edge bg-surface-light py-12 px-6 mt-20">
        <div className="max-w-7xl mx-auto text-center">
          <BlinkLogo size="md" variant="horizontal" className="justify-center mb-4" />
          <p className="text-sm text-text-secondary">
            BlinkGo Design System v2.0 · Last updated July 2026
          </p>
          <p className="text-xs text-text-muted mt-2">
            Single source of truth for every screen, component, and future page.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ═══════ Helper Components ═══════

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="max-w-7xl mx-auto px-6 py-16 border-b border-edge">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">{title}</h2>
        <p className="text-text-secondary mt-1">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ColorSwatch({ name, hex, cssVar, description, variant }: { name: string; hex: string; cssVar: string; description: string; variant: 'red' | 'yellow' | 'black' }) {
  return (
    <div className="bg-surface border border-edge rounded-2xl overflow-hidden shadow-sm">
      <div
        className="h-32 flex items-end p-4"
        style={{ background: variant === 'red' ? 'linear-gradient(135deg, #DC2626, #991B1B)' :
                          variant === 'yellow' ? 'linear-gradient(135deg, #F5B819, #D97706)' :
                          'linear-gradient(135deg, #0A0A0A, #404040)' }}
      >
        <span className="font-black text-2xl tracking-tight" style={{ color: variant === 'yellow' ? '#0A0A0A' : '#FFFFFF' }}>
          {name}
        </span>
      </div>
      <div className="p-4 space-y-1">
        <div className="font-mono text-sm font-bold">{hex}</div>
        <div className="font-mono text-xs text-text-muted">{cssVar}</div>
        <p className="text-xs text-text-secondary mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function ColorChip({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex items-center gap-3 bg-surface border border-edge rounded-xl p-3">
      <div className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0" style={{ background: hex }} />
      <div>
        <div className="text-sm font-bold text-text-primary">{name}</div>
        <div className="text-xs font-mono text-text-muted">{hex}</div>
      </div>
    </div>
  );
}

function TypeRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-baseline border-b border-edge pb-4">
      <div className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</div>
      <div className={`col-span-2 text-text-primary ${className ?? ''}`}>{children}</div>
    </div>
  );
}

function ComponentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
      <div className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</div>
      <div className="col-span-3 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
