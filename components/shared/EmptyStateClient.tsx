'use client';

import { memo, type ReactNode } from 'react';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Search from 'lucide-react/dist/esm/icons/search';
import Inbox from 'lucide-react/dist/esm/icons/inbox';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Heart from 'lucide-react/dist/esm/icons/heart';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import Receipt from 'lucide-react/dist/esm/icons/receipt';
import Wallet from 'lucide-react/dist/esm/icons/wallet';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Star from 'lucide-react/dist/esm/icons/star';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Package from 'lucide-react/dist/esm/icons/package';
import Clock from 'lucide-react/dist/esm/icons/clock';
import History from 'lucide-react/dist/esm/icons/history';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import Coffee from 'lucide-react/dist/esm/icons/coffee';
import Utensils from 'lucide-react/dist/esm/icons/utensils';
import Leaf from 'lucide-react/dist/esm/icons/leaf';
import Tag from 'lucide-react/dist/esm/icons/tag';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import type { ComponentType, SVGProps } from 'react';
import { EmptyState as BaseEmptyState } from './EmptyState';

// v82 perf: use a local structural type instead of `import type { LucideIcon } from 'lucide-react'`.
// The barrel type import was causing webpack to bundle the entire icon library.
type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

type ActionObject =
  | { label?: string; href?: string; onClick?: () => void; icon?: ReactNode }
  | ReactNode
  | null
  | undefined;

const ICONS: Record<string, LucideIcon> = {
  ShoppingBag,
  Search,
  Inbox,
  Bell,
  Heart,
  MapPin,
  Store,
  Receipt,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Star,
  ChefHat,
  Truck,
  Package,
  Clock,
  History,
  XCircle,
  Coffee,
  Utensils,
  Leaf,
  Tag,
  MessageCircle,
};

interface Props {
  iconName?: keyof typeof ICONS | string;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ActionObject | ReactNode;
  action2?: ActionObject;
  className?: string;
  compact?: boolean;
  variant?: 'subtle' | 'prominent' | 'card';
}

export const EmptyStateClient = memo(function EmptyStateClient({
  iconName,
  icon,
  ...rest
}: Props) {
  // Resolve icon to a React element (call the lucide component)
  let resolvedIcon: ReactNode = null;
  if (icon) {
    resolvedIcon = icon;
  } else if (iconName && ICONS[iconName as string]) {
    const IconComponent = ICONS[iconName as string];
    resolvedIcon = <IconComponent className="w-8 h-8" strokeWidth={2} />;
  } else {
    resolvedIcon = <Inbox className="w-8 h-8" strokeWidth={2} />;
  }
  return <BaseEmptyState icon={resolvedIcon} {...(rest as any)} />;
});
