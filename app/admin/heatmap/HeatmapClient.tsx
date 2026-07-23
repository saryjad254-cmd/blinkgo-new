'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Loader2, MapPin, Activity } from 'lucide-react';


const HeatmapMap = dynamic(() => import('./HeatmapMap'), { ssr: false });

interface Driver {
  id: string;
  name: string;
  rating: number;
  lat: number;
  lng: number;
  last_update: string;
}

export default function HeatmapClient() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch('/api/admin/heatmap', { credentials: 'include' });
        if (!res.ok) {
          setError('Failed to load heatmap');
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (!mounted) return;
        if (json.ok && json.data) {
          setDrivers(json.data.drivers ?? []);
        }
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError('Network error');
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Driver Heat Map"
        subtitle="Real-time active drivers in your area"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Activity className="w-4 h-4" />
            Active drivers
          </div>
          <div className="text-2xl font-bold text-brand mt-1">{drivers.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <MapPin className="w-4 h-4" />
            Avg rating
          </div>
          <div className="text-2xl font-bold text-success mt-1">
            {drivers.length > 0
              ? (drivers.reduce((sum, d) => sum + d.rating, 0) / drivers.length).toFixed(1)
              : '—'}
          </div>
        </Card>
      </div>

      <Card className="p-2 h-[600px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-danger">
            {error}
          </div>
        ) : (
          <HeatmapMap drivers={drivers} />
        )}
      </Card>
    </div>
  );
}
