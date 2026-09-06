'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { AdminMapClient as AdminMapClientType } from './AdminMapClient';

const LazyAdminMapClient = dynamic(
  () => import('./AdminMapClient').then((module) => module.AdminMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg">
        <div className="text-text-muted text-sm">Loading map…</div>
      </div>
    ),
  },
);

type AdminMapLoaderProps = ComponentProps<typeof AdminMapClientType>;

export function AdminMapLoader(props: AdminMapLoaderProps) {
  return <LazyAdminMapClient {...props} />;
}
