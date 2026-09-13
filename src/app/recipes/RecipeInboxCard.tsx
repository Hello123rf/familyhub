'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Clock, Users, ListChecks, Check, CalendarPlus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AddToMealPlanSection } from '@/app/recipes/AddToMealPlanSection';
import type { Recipe } from '@/lib/hooks/useRecipes';

function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export interface RecipeInboxCardProps {
  recipe: Recipe;
  onSave: () => void;
  onDiscard: () => void;
  /** Fires once the recipe has been promoted (either by Save, or automatically inside AddToMealPlanSection). */
  onPromoted: () => void;
}

export function RecipeInboxCard({ recipe, onSave, onDiscard, onPromoted }: RecipeInboxCardProps) {
  const [showAddToWeek, setShowAddToWeek] = useState(false);
  const host = sourceHost(recipe.url);
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        {recipe.imageUrl && (
          <div className="relative w-28 sm:w-40 shrink-0 bg-muted overflow-hidden">
            <Image src={recipe.imageUrl} alt={recipe.name} fill unoptimized className="object-cover" />
          </div>
        )}
        <CardContent className={cn('p-4 flex-1 min-w-0', !recipe.imageUrl && 'pt-4')}>
          <h3 className="font-semibold line-clamp-2">{recipe.name}</h3>
          {host && <p className="text-xs text-muted-foreground mt-0.5">{host}</p>}

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            {totalTime > 0 && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{totalTime} min</span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>
            )}
            {recipe.ingredients.length > 0 && (
              <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" />{recipe.ingredients.length} ingredients</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={onSave}>
              <Check className="h-4 w-4 mr-1" />Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddToWeek((v) => !v)}>
              <CalendarPlus className="h-4 w-4 mr-1" />Add to Week
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDiscard}>
              <X className="h-4 w-4 mr-1" />Discard
            </Button>
          </div>

          {showAddToWeek && (
            <div className="mt-3">
              <AddToMealPlanSection recipe={recipe} onPromoted={onPromoted} />
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
