import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Premium section header with optional icon + action button.
 */
export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-edge flex items-center justify-center text-text-secondary flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-extrabold text-text leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-text-muted leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
