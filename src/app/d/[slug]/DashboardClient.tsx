'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { rememberDashboardSlug } from '@/lib/utils/deviceDashboard';

const Dashboard = dynamic(
  () => import('@/components/dashboard').then(mod => ({ default: mod.Dashboard })),
  { loading: () => <div className="min-h-screen bg-background" /> }
);

export function DashboardSlugClient({ slug }: { slug: string }) {
  // Visiting a named dashboard remembers it on this browser, so the next
  // visit to `/` on this same device goes straight back to it.
  useEffect(() => { rememberDashboardSlug(slug); }, [slug]);

  return (
    <Dashboard slug={slug} />
  );
}
