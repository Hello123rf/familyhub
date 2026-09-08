'use client';

import { useState, useCallback } from 'react';
import type { ShoppingItem } from '@/types';

/**
 * Drag an item row onto a different category card to recategorize it.
 * Separate from useShoppingDragReorder (which drags whole category cards to
 * reorder the lanes) — the two never collide because a native HTML5 drag
 * only ever has one source, and this hook's state (draggedItem) only gets
 * set when the drag actually starts on an item row, not the card chrome.
 *
 * Desktop/mouse only, same as category-lane reordering: touch devices keep
 * the existing tap-to-edit modal, which already lets you change category.
 */
interface UseShoppingItemDragToCategoryProps {
  onMoveItemToCategory: (item: ShoppingItem, newCategory: string) => void;
}

export function useShoppingItemDragToCategory({ onMoveItemToCategory }: UseShoppingItemDragToCategoryProps) {
  const [draggedItem, setDraggedItem] = useState<ShoppingItem | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const handleItemDragStart = useCallback((e: React.DragEvent, item: ShoppingItem) => {
    // Stops the category-card's own onDragStart (for lane reordering) from
    // also firing for the same gesture — the browser resolves nested
    // draggables to the innermost one already, this just makes it explicit.
    e.stopPropagation();
    setDraggedItem(item);
  }, []);

  const handleItemDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverCategory(null);
  }, []);

  const handleItemDragOverCategory = useCallback((e: React.DragEvent, category: string) => {
    if (!draggedItem) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOverCategory !== category) setDragOverCategory(category);
  }, [draggedItem, dragOverCategory]);

  const handleItemDropOnCategory = useCallback((e: React.DragEvent, category: string) => {
    if (!draggedItem) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem.category !== category) {
      onMoveItemToCategory(draggedItem, category);
    }
    setDraggedItem(null);
    setDragOverCategory(null);
  }, [draggedItem, onMoveItemToCategory]);

  return {
    draggedItem,
    dragOverCategory,
    handleItemDragStart,
    handleItemDragEnd,
    handleItemDragOverCategory,
    handleItemDropOnCategory,
  };
}
