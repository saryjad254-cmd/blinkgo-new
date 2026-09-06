'use client';

import { useState } from 'react';
import Image from 'next/image';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Package from 'lucide-react/dist/esm/icons/package';
import ShoppingBasket from 'lucide-react/dist/esm/icons/shopping-basket';
import { cn } from '@/lib/cn';

type CatalogImageKind = 'restaurant' | 'product' | 'retail';

interface CatalogImageProps {
  src?: string | null;
  alt: string;
  name: string;
  kind?: CatalogImageKind;
  index?: number;
  priority?: boolean;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
}

const PALETTES = [
  'from-[#3A0503] via-[#A30500] to-[#E10600]',
  'from-[#08090B] via-[#251205] to-[#A37C00]',
  'from-[#15181D] via-[#5A0200] to-[#FFC107]',
  'from-[#2A0200] via-[#7F0300] to-[#FF4131]',
] as const;

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIzMCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjMwIiBmaWxsPSIjMTUxODFEIi8+PC9zdmc+';

function shouldBypassOptimizer(src: string) {
  return src.startsWith('data:') || src.startsWith('blob:') || src.includes('supabase.co/storage');
}

/** A resilient, branded image surface for restaurants, products and retail. */
export function CatalogImage({
  src,
  alt,
  name,
  kind = 'product',
  index = 0,
  priority = false,
  sizes,
  className,
  fallbackClassName,
}: CatalogImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usableSrc = typeof src === 'string' && src.trim().length > 0 ? src.trim() : null;
  const failed = usableSrc !== null && failedSrc === usableSrc;
  const loaded = usableSrc !== null && loadedSrc === usableSrc;
  const initial = (name.trim()[0] || 'B').toLocaleUpperCase();
  const Icon = kind === 'restaurant' ? ChefHat : kind === 'retail' ? ShoppingBasket : Package;
  const paletteIndex = index || Array.from(name).reduce((sum, character) => sum + character.codePointAt(0)!, 0);

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-2">
      {usableSrc && !failed ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,#15181D_8%,#22262C_18%,#15181D_33%)] bg-[length:200%_100%] motion-reduce:animate-none" aria-hidden="true" />}
          <Image
            src={usableSrc}
            alt={alt}
            fill
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            sizes={sizes}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            unoptimized={shouldBypassOptimizer(usableSrc)}
            className={cn('object-cover transition-[opacity,transform] duration-500 motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0', className)}
            onLoad={() => setLoadedSrc(usableSrc)}
            onError={() => setFailedSrc(usableSrc)}
          />
        </>
      ) : (
        <div role="img" aria-label={alt} className={cn('absolute inset-0 grid place-items-center overflow-hidden bg-gradient-to-br', PALETTES[Math.abs(paletteIndex) % PALETTES.length], fallbackClassName)}>
          <span className="absolute -end-8 -top-10 text-[9rem] font-black italic leading-none text-white/[0.055]" aria-hidden="true">{initial}</span>
          <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand via-brand-yellow to-brand" aria-hidden="true" />
          <span className="relative grid size-16 place-items-center rounded-2xl border border-white/15 bg-black/25 text-white shadow-2xl backdrop-blur-sm">
            <span className="text-3xl font-black italic leading-none">{initial}</span>
            <Icon className="absolute -bottom-2 -end-2 size-7 rounded-lg border border-white/15 bg-canvas p-1.5 text-brand-yellow" aria-hidden="true" />
          </span>
          <span className="absolute inset-x-4 bottom-4 truncate text-center text-[10px] font-black uppercase tracking-[.14em] text-white/70">{name}</span>
        </div>
      )}
    </div>
  );
}
