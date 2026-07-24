'use client';

import { useTheme } from './ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ThemeToggleProps {
  variant?: 'icon' | 'dropdown' | 'switch';
  className?: string;
}

/**
 * Theme toggle — three modes: Light / Dark / System.
 *
 * Variants:
 *  - icon:   just a sun/moon button (toggles light/dark)
 *  - switch: 3-segment pill switch
 *  - dropdown: with menu
 */
export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggle } = useTheme();

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center',
          'bg-surface-light hover:bg-surface text-text',
          'border border-edge transition-all active:scale-95',
          'hover:shadow-md',
          className,
        )}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-5 h-5 text-brand-yellow" />
        ) : (
          <Moon className="w-5 h-5 text-brand-red" />
        )}
      </button>
    );
  }

  if (variant === 'switch') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-0.5 p-1 rounded-full',
          'bg-surface-light border border-edge',
          className,
        )}
        role="radiogroup"
        aria-label="Theme"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          role="radio"
          aria-checked={theme === 'light'}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            theme === 'light'
              ? 'bg-brand-red text-white shadow-sm'
              : 'text-text-secondary hover:text-text',
          )}
          title="Light"
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          role="radio"
          aria-checked={theme === 'dark'}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            theme === 'dark'
              ? 'bg-brand-red text-white shadow-sm'
              : 'text-text-secondary hover:text-text',
          )}
          title="Dark"
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('system')}
          role="radio"
          aria-checked={theme === 'system'}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            theme === 'system'
              ? 'bg-brand-red text-white shadow-sm'
              : 'text-text-secondary hover:text-text',
          )}
          title="System"
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // dropdown
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-light hover:bg-surface text-text border border-edge"
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-5 h-5 text-brand-yellow" />
        ) : (
          <Moon className="w-5 h-5 text-brand-red" />
        )}
      </button>
    </div>
  );
}
