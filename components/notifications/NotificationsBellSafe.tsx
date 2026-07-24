'use client';

/**
 * NotificationsBellSafe — Error boundary wrapper around NotificationsBell.
 *
 * Use this in production pages where a notification rendering error
 * should never crash the parent layout. Swallows errors and silently
 * renders nothing on failure.
 */

import { Component, type ReactNode } from 'react';
import { NotificationsBell } from './NotificationsBell';

interface Props {
  variant?: 'dropdown' | 'page';
  locale?: 'de' | 'ar' | 'en';
}

interface State {
  hasError: boolean;
}

export class NotificationsBellSafe extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    // Silently swallow — notifications are non-critical
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    const { variant, locale } = this.props;
    return <NotificationsBell variant={variant} locale={locale} />;
  }
}
