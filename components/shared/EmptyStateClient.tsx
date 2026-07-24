'use client';

import { memo, type ReactNode } from 'react';
import {
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
  type LucideIcon,
} from 'lucide-react';
import { EmptyState as BaseEmptyState } from './EmptyState';

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
