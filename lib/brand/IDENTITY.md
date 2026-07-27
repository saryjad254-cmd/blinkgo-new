# Official BlinkGo Brand Identity

## The Source of Truth

The official BlinkGo logo (the one uploaded by the project owner) is the **canonical visual identity** of the entire platform. Every component, every page, every animation must derive from it.

**Never redesign, reinterpret, or simplify the logo.**

The logo image is stored at:
- `public/brand/blinkgo-logo.png` — full official logo
- `public/brand/blinkgo-icon.png` — icon-only version
- `public/brand/blinkgo-3d.png` — 3D rendered version
- `public/brand/blinkgo-banner.png` — banner version
- `public/brand/blinkgo-hero.png` — hero version

## Brand Colors (extracted from logo)

| Color | Hex | Use |
|-------|-----|-----|
| **Brand Yellow** | `#F5B819` | Primary highlights, attention, brand mark background |
| **Brand Red** | `#DC2626` | Primary CTA, "Go" text, "B" mark accent, urgency |
| **Brand Black** | `#0A0A0A` | "Blink" text, premium surfaces, primary text |

## Tagline

**SCHNELL. ZUVERLÄSSIG. FÜR DICH.** (Fast. Reliable. For You.)

## Personality

- Fast
- Premium
- Modern
- Reliable
- Professional
- Minimal
- Elegant
- Powerful

## The Logo Components

The official logo contains:
1. **Background**: Diagonal split — red (top-left) / yellow (bottom-right)
2. **Speed lines**: Yellow/orange diagonal lines suggesting motion
3. **Delivery box**: Black with red "B" mark
4. **Rider**: Black silhouette on a scooter
5. **Scooter**: Black with red wheel rims and yellow centers
6. **Wordmark**: "Blink" in black italic + "Go" in red italic
7. **Tagline**: SCHNELL. ZUVERLÄSSIG. FÜR DICH.

## Brand Mark (favicon/avatar)

The simplified brand mark (used in tight spaces) is the **yellow gradient circle with the black "B"** and red speed lines.

## Files

- `public/brand/blinkgo-logo.png` — Full official logo
- `public/brand/blinkgo-logo.svg` — SVG recreation
- `public/brand/blinkgo-icon.png` — Icon only
- `public/brand/blinkgo-3d.png` — 3D rendered
- `public/favicon.svg` — Browser favicon
- `lib/brand/tokens.ts` — All design tokens
- `components/brand/BlinkLogo.tsx` — Logo component (uses official image)

## How to Use

Always use the official image:
```tsx
import { BlinkLogo } from '@/components/brand/BlinkLogo';

<BlinkLogo size="lg" variant="full" />
```

The component uses `<img src="/brand/blinkgo-logo.png" />` — the exact uploaded image. Never modify it.
