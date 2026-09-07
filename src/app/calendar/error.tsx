'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('calendar.errors');

  useEffect(() => {
    console.error('Calendar error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
        <p className="text-muted-foreground">
          {process.env.NODE_ENV === 'development'
            ? error.message
            : t('pageBody')}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            {t('tryAgain')}
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-90"
          >
            {t('backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
