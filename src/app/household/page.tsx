import { Suspense } from 'react';
import { BabysitterView } from '../babysitter/BabysitterView';

export const metadata = {
  title: 'Household Reference',
  description: 'Emergency contacts, house info, allergies, and rules — for the family.',
};

export default function HouseholdPage() {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<HouseholdSkeleton />}>
        <BabysitterView title="Household Reference" showModeToggle={false} />
      </Suspense>
    </main>
  );
}

function HouseholdSkeleton() {
  return (
    <div className="h-screen flex flex-col p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-10 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-32 bg-muted/50 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
