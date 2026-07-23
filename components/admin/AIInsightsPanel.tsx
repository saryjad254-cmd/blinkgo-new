'use client';

/**
 * AI Insights Panel
 * ────────────────
 * Displays AI-generated insights to admin operators.
 * Auto-refreshes every 60s, with manual refresh option.
 */

import { useEffect, useState, useCallback } from 'react';
import { Brain, AlertTriangle, AlertCircle, Info, TrendingUp, RefreshCw, Sparkles, Users, Store, Truck, Flame, MapPin, Clock } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { apiGet } from '@/lib/api/client';
import { formatEUR } from '@/lib/format';

interface OperationsInsight {
  type: 'demand' | 'shortage' | 'overload' | 'hotspot' | 'sla-risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
  action?: { label: string; href?: string };
}

interface DemandForecast {
  predicted: number;
  range: [number, number];
  confidence: number;
}

export function AIInsightsPanel() {
  const t = useT();
  const [insights, setInsights] = useState<OperationsInsight[]>([]);
  const [forecast, setForecast] = useState<DemandForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetch = useCallback(async () => {
    try {
      const res = await apiGet<any>('/api/intelligence/insights', { cacheTtl: 0 });
      if (res.ok && res.data) {
        setInsights(res.data.insights ?? []);
        setForecast(res.data.demand_forecast ?? null);
        setLastRefresh(new Date());
      }
    } catch {
      // Gracefully degrade
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => clearInterval(interval);
  }, [fetch]);

  const severityConfig = {
    critical: { Icon: AlertCircle, color: 'bg-danger-500/15 text-danger-700 border-danger-500/40', iconColor: 'text-danger-600' },
    warning: { Icon: AlertTriangle, color: 'bg-warning-500/15 text-warning-700 border-warning-500/30', iconColor: 'text-warning-600' },
    info: { Icon: Info, color: 'bg-info-500/15 text-info-700 border-info-500/30', iconColor: 'text-info-600' },
  };

  const typeIcon = {
    demand: TrendingUp,
    shortage: Users,
    overload: Store,
    hotspot: MapPin,
    'sla-risk': Clock,
  };

  return (
    <div className="bg-bg-card border-2 border-ink-3/20 rounded-2xl p-4">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-ink-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-premium" />
          AI Insights
          <span className="text-xs font-normal text-ink-2">
            {lastRefresh && `· aktualisiert ${lastRefresh.toLocaleTimeString('de-DE')}`}
          </span>
        </h2>
        <button
          type="button"
          onClick={fetch}
          className="w-9 h-9 rounded-xl bg-bg-elevated flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Aktualisieren"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      {/* Demand forecast */}
      {forecast && forecast.predicted > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-premium/10 border border-brand-primary/30">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-brand-primary" aria-hidden />
            <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
              Nächste Stunde
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-ink-1">{forecast.predicted}</span>
            <span className="text-sm text-ink-2">
              ({forecast.range[0]}–{forecast.range[1]})
            </span>
            <span className="text-xs text-ink-2 ms-auto">
              {Math.round(forecast.confidence * 100)}% Konfidenz
            </span>
          </div>
        </div>
      )}

      {/* Insights list */}
      {loading && insights.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-6">
          <Brain className="h-10 w-10 text-ink-2 mx-auto mb-2" aria-hidden />
          <p className="text-sm text-ink-2">Alles ruhig ✨</p>
          <p className="text-xs text-ink-2 mt-1">Keine kritischen Probleme erkannt</p>
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((insight, i) => {
            const config = severityConfig[insight.severity];
            const TypeIcon = typeIcon[insight.type] ?? Info;
            const { Icon, color, iconColor } = config;
            return (
              <div
                key={i}
                className={`p-3 rounded-xl border ${color}`}
                role={insight.severity === 'critical' ? 'alert' : 'status'}
                aria-live={insight.severity === 'critical' ? 'assertive' : 'polite'}
              >
                <div className="flex items-start gap-2">
                  <TypeIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${iconColor}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-1 truncate">{insight.title}</span>
                      <span className="text-[10px] text-ink-2 flex-shrink-0">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-ink-2 mt-0.5">{insight.description}</p>
                    <p className="text-xs text-ink-1 mt-1 font-medium">
                      💡 {insight.recommendation}
                    </p>
                    {insight.action && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-brand-primary hover:underline"
                      >
                        {insight.action.label} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
