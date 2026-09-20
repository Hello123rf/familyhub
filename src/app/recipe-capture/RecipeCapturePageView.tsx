'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookmarkPlus, Link2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/components/providers';

/**
 * Destination for the laptop bookmarklet (see docs/features/RECIPE_CAPTURE.md).
 *
 * The bookmarklet does a plain top-level navigation here — window.open(this
 * page's URL + ?url=<current page>) — rather than fetching the capture API
 * directly from the recipe site's own tab. A cross-origin fetch from an
 * https:// recipe site to Prism's http:// LAN address is blocked by browsers
 * as mixed content (and would additionally hit Private Network Access /
 * CORS restrictions even same-scheme), so there is no reliable way to POST
 * straight from the recipe page. Navigating to this normal, session-
 * authenticated Prism page sidesteps all of that — it's just a link.
 */
export function RecipeCapturePageView() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') || '';
  const { requireAuth } = useAuth();

  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCapture = async () => {
    if (!await requireAuth('Save Recipe', 'Please log in to save a recipe')) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/recipe-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error || 'Could not save this recipe');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setErrorMessage('Could not reach FamilyHub');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BookmarkPlus className="h-5 w-5 text-primary" />
            Save recipe to FamilyHub
          </div>

          {!url ? (
            <p className="text-sm text-muted-foreground">
              No page URL was provided. Use the "Save to FamilyHub" bookmarklet
              from a recipe page — see Settings for setup instructions.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2 text-sm text-muted-foreground break-all">
                <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
                {url}
              </div>

              {status === 'idle' && (
                <Button className="w-full" onClick={handleCapture}>
                  Save Recipe
                </Button>
              )}

              {status === 'saving' && (
                <Button className="w-full" disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…
                </Button>
              )}

              {status === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />Saved to your recipes
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/recipes">View Recipes</Link>
                  </Button>
                </div>
              )}

              {status === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />{errorMessage}
                  </div>
                  <Button className="w-full" variant="outline" onClick={handleCapture}>
                    Try again
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
