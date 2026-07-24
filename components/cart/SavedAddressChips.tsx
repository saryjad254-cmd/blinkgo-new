'use client';

import { Home, Briefcase, MapPin, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AddressKind = 'home' | 'work' | 'other';

export interface SavedAddress {
  id: string;
  kind: AddressKind;
  label: string;       // override label, e.g. "Mama's house"
  street: string;
  city: string;
  postal?: string;
  lat?: number;
  lng?: number;
}

interface SavedAddressChipsProps {
  addresses: SavedAddress[];
  selectedId: string | null;
  onSelect: (addr: SavedAddress) => void;
  onAddNew?: () => void;
  t?: {
    savedAddresses?: string;
    selectAddress?: string;
    home?: string;
    work?: string;
    other?: string;
    addNew?: string;
    emptyHint?: string;
  };
}

/**
 * Saved address chips — Careem/Uber pattern.
 * 3 quick-select chips: Home/Work/Other.
 * Each shows an icon, label, and street. Active chip has brand color + glow.
 * Falls back to "+ add new address" CTA if no saved.
 */
export function SavedAddressChips({
  addresses,
  selectedId,
  onSelect,
  onAddNew,
  t,
}: SavedAddressChipsProps) {
  if (addresses.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddNew}
        className={cn(
          'w-full h-14 rounded-2xl flex items-center justify-center gap-2',
          'bg-surface-elevated border border-dashed border-edge-strong',
          'text-text-secondary hover:text-white hover:border-brand-red-500 hover:bg-surface-light',
          'transition-all active:scale-[0.99]',
        )}
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-bold">{t?.addNew ?? 'Adresse speichern'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
          {t?.savedAddresses ?? 'Gespeicherte Adressen'}
        </p>
        <button
          type="button"
          onClick={onAddNew}
          className="text-[10px] font-bold text-brand-red-500 hover:text-brand-red-400 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          {t?.addNew ?? 'Neu'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {addresses.map((addr) => {
          const isActive = addr.id === selectedId;
          return (
            <button
              key={addr.id}
              type="button"
              onClick={() => onSelect(addr)}
              aria-pressed={isActive}
              className={cn(
                'h-auto min-h-[72px] rounded-2xl flex items-start gap-3 p-3 text-start',
                'border transition-all duration-200 ease-silk',
                'active:scale-[0.98]',
                isActive
                  ? 'bg-gradient-to-br from-brand-red-500/20 to-brand-yellow-500/10 border-brand-red-500/60 shadow-glow'
                  : 'bg-surface-elevated border-edge hover:border-edge-strong hover:bg-surface-light',
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                  isActive
                    ? addressBg(addr.kind)
                    : 'bg-surface text-text-secondary',
                )}
              >
                {addressIcon(addr.kind, isActive)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-xs font-extrabold uppercase tracking-wider', isActive ? 'text-brand-red-400' : 'text-text-muted')}>
                    {kindLabel(addr.kind, t)}
                  </span>
                  {isActive && (
                    <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-brand-red-500 text-white">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-white truncate mt-0.5">{addr.label}</p>
                <p className="text-xs text-text-secondary truncate">{addr.street}</p>
              </div>

              <ChevronRight className={cn('w-4 h-4 flex-shrink-0 mt-1', isActive ? 'text-brand-red-500' : 'text-text-muted')} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function kindLabel(kind: AddressKind, t?: SavedAddressChipsProps['t']): string {
  switch (kind) {
    case 'home': return t?.home ?? 'Zuhause';
    case 'work': return t?.work ?? 'Arbeit';
    case 'other': return t?.other ?? 'Andere';
  }
}

function addressIcon(kind: AddressKind, active: boolean) {
  const cls = cn('w-4.5 h-4.5', active ? 'text-white' : 'text-text-secondary');
  switch (kind) {
    case 'home': return <Home className={cls} />;
    case 'work': return <Briefcase className={cls} />;
    case 'other': return <MapPin className={cls} />;
  }
}

function addressBg(kind: AddressKind): string {
  switch (kind) {
    case 'home': return 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active';
    case 'work': return 'bg-live-gradient';
    case 'other': return 'bg-premium-gradient';
  }
}
