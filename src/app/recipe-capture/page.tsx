import { Suspense } from 'react';
import { RecipeCapturePageView } from './RecipeCapturePageView';

export default function RecipeCapturePage() {
  return (
    <Suspense>
      <RecipeCapturePageView />
    </Suspense>
  );
}
