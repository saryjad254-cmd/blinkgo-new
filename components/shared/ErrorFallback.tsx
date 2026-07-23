'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface ErrorFallbackProps {
  title: string;
  message: string;
  error?: Error;
  onReset?: () => void;
  showHomeButton?: boolean;
}

export function ErrorFallback({
  title,
  message,
  error,
  onReset,
  showHomeButton = true,
}: ErrorFallbackProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-danger/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-danger" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-3">{title}</h1>
        <p className="text-text-secondary mb-6">{message}</p>
        
        {process.env.NODE_ENV === 'development' && error && (
          <details className="text-start mb-6 p-3 bg-bg-elevated rounded-xl">
            <summary className="cursor-pointer text-sm text-text-muted font-medium">
              Error details (dev only)
            </summary>
            <pre className="mt-2 text-xs text-danger overflow-auto">
              {error.message}
              {error.stack && '\n\n' + error.stack}
            </pre>
          </details>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-semibold hover:opacity-90 active:scale-95 transition touch-manipulation"
            >
              <RefreshCw className="w-4 h-4" />
              Erneut versuchen
            </button>
          )}
          {showHomeButton && (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-bg-elevated text-text-primary font-semibold hover:bg-bg-secondary transition touch-manipulation"
            >
              <Home className="w-4 h-4" />
              Startseite
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
