'use client';

import { useState, useMemo } from 'react';
import type { Recipe } from '@/lib/hooks/useRecipes';

export type RecipeSortBy = 'name' | 'rating' | 'lastMade' | 'category';

export function useRecipesFilters(recipes: Recipe[]) {
  const [search, setSearch] = useState('');
  const [filterCuisine, setFilterCuisine] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<RecipeSortBy>('name');

  const cuisines = useMemo(() => {
    const unique = new Set(recipes.map(r => r.cuisine).filter(Boolean));
    return Array.from(unique).sort() as string[];
  }, [recipes]);

  const categories = useMemo(() => {
    const unique = new Set(recipes.map(r => r.category).filter(Boolean));
    return Array.from(unique).sort() as string[];
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    let result = recipes;
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(s) ||
        r.description?.toLowerCase().includes(s) ||
        r.cuisine?.toLowerCase().includes(s) ||
        r.category?.toLowerCase().includes(s)
      );
    }
    if (filterCuisine) result = result.filter(r => r.cuisine === filterCuisine);
    if (filterCategory) result = result.filter(r => r.category === filterCategory);
    return result;
  }, [recipes, search, filterCuisine, filterCategory]);

  const sortedRecipes = useMemo(() => {
    const result = [...filteredRecipes];
    switch (sortBy) {
      case 'rating':
        // Highest rated first; unrated recipes sink to the bottom.
        result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        break;
      case 'lastMade':
        // Most recently cooked first; never-made recipes sink to the bottom.
        result.sort((a, b) => {
          const aTime = a.lastMadeAt ? new Date(a.lastMadeAt).getTime() : -Infinity;
          const bTime = b.lastMadeAt ? new Date(b.lastMadeAt).getTime() : -Infinity;
          return bTime - aTime;
        });
        break;
      case 'category':
        // "Main ingredient" (chicken, pasta, fish, ...) is stored in the
        // free-text category field - there's no separate column for it.
        result.sort((a, b) => (a.category || '￿').localeCompare(b.category || '￿'));
        break;
      case 'name':
      default:
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return result;
  }, [filteredRecipes, sortBy]);

  const clearFilters = () => { setFilterCuisine(null); setFilterCategory(null); };

  return {
    search, setSearch,
    filterCuisine, setFilterCuisine,
    filterCategory, setFilterCategory,
    sortBy, setSortBy,
    cuisines, categories, filteredRecipes: sortedRecipes,
    clearFilters,
    hasActiveFilters: !!(filterCuisine || filterCategory),
  };
}
