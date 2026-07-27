import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import Link from 'next/link';
// v82 perf: replace dynamic `require('lucide-react')` with explicit per-icon
// imports. The old code pulled the ENTIRE 5000+ icon library (~545KB
// uncompressed, ~80KB gzipped) into every page that used <EmptyState> with
// a string icon name — which is most customer pages. Static map below
// covers every iconName/icon string actually used in the codebase.
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Search from 'lucide-react/dist/esm/icons/search';
import Inbox from 'lucide-react/dist/esm/icons/inbox';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Heart from 'lucide-react/dist/esm/icons/heart';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Leaf from 'lucide-react/dist/esm/icons/leaf';
import Utensils from 'lucide-react/dist/esm/icons/utensils';
import Wallet from 'lucide-react/dist/esm/icons/wallet';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';

const ICON_REGISTRY: Record<string, any> = {
  ShoppingBag,
  Search,
  Inbox,
  Bell,
  Heart,
  MapPin,
  Store,
  AlertCircle,
  Leaf,
  Utensils,
  Wallet,
  MessageCircle,
};

interface ActionObject {
  label?: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode | ActionObject;
  className?: string;
  compact?: boolean;
  variant?: 'subtle' | 'prominent' | 'card';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  if (Array.isArray(v)) return false;
  // React elements have a $$typeof symbol (REACT_ELEMENT_TYPE or REACT_FORWARD_REF_TYPE)
  if ((v as any).$$typeof) return false;
  // Function components and forwardRef components are functions
  if (typeof v === 'function') return false;
  return true;
}

function isReactElement(v: any): boolean {
  return !!(v && typeof v === 'object' && v.$$typeof);
}

function renderIcon(icon: any): ReactNode {
  if (!icon) return null;
  // If it's already a React element, return as-is
  if (isReactElement(icon)) return icon;
  // If it's a function (forwardRef or function component), call it
  if (typeof icon === 'function') {
    try {
      const Element = icon;
      return <Element className="w-8 h-8" strokeWidth={2} />;
    } catch {
      return null;
    }
  }
  // If a string name was passed (e.g. icon="Wallet"), resolve it via the
  // static ICON_REGISTRY. The old `require('lucide-react')` here pulled
  // the entire icon library into every consumer — see components/shared/EmptyState.tsx header.
  if (typeof icon === 'string') {
    const Cmp = ICON_REGISTRY[icon];
    if (Cmp) return <Cmp className="w-8 h-8" strokeWidth={2} />;
    return null;
  }
  return icon;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className={cn(
          'rounded-2xl bg-brand-red/10 flex items-center justify-center mb-4 text-brand-red',
          compact ? 'w-12 h-12' : 'w-16 h-16',
        )}>
          {renderIcon(icon)}
        </div>
      )}
      <h3 className={cn('font-extrabold text-text-primary mb-1', compact ? 'text-base' : 'text-lg')}>{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm leading-relaxed mb-4">{description}</p>
      )}
      <ActionRenderer action={action} />
    </div>
  );
}

function ActionRenderer({ action }: { action?: ReactNode | ActionObject }) {
  if (action == null) return null;

  // If it's already a ReactNode (element, string, number, boolean, fragment), just return
  if (
    typeof action === 'string' ||
    typeof action === 'number' ||
    typeof action === 'boolean' ||
    isReactElement(action) ||
    !isPlainObject(action)
  ) {
    return <>{action as ReactNode}</>;
  }

  // It's a plain config object — render as Link or button
  const obj = action as ActionObject;
  if (!obj.label) return null;
  const baseCls =
    'inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:translate-y-0 transition-all';
  if (obj.href) {
    return (
      <Link href={obj.href} className={baseCls}>
        {obj.icon}
        {obj.label}
      </Link>
    );
  }
  if (obj.onClick) {
    return (
      <button type="button" onClick={obj.onClick} className={baseCls}>
        {obj.icon}
        {obj.label}
      </button>
    );
  }
  return null;
}
