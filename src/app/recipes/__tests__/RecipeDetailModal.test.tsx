/**
 * @jest-environment jsdom
 */
/**
 * "Add to Shopping List" must exclude ingredients the user has ticked off
 * (already have it). Ticking an ingredient only struck it through visually;
 * handleAddToList still sent the full, unfiltered ingredient list.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecipeDetailModal } from '../RecipeDetailModal';
import type { Recipe } from '@/lib/hooks/useRecipes';

// RecipeDetailModal renders AddToMealPlanSection, which needs useAuth.
jest.mock('@/components/providers', () => ({
  useAuth: () => ({ requireAuth: jest.fn().mockResolvedValue({ id: 'parent-1' }) }),
}));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const recipe = {
  id: 'r1',
  name: 'Chicken Korma',
  servings: 4,
  ingredients: [
    { text: '650 g chicken breast' },
    { text: '25 g plain flour' },
    { text: '4 tsp mild curry powder' },
    { text: 'pinch of dried chilli flakes' },
    { text: '1/2 tsp sea salt' },
  ],
} as unknown as Recipe;

describe('RecipeDetailModal — Add to Shopping List respects checked-off ingredients', () => {
  it('sends every ingredient when none are checked off', async () => {
    const onAddToShoppingList = jest.fn().mockResolvedValue(undefined);
    render(
      <RecipeDetailModal
        recipe={recipe}
        shoppingLists={[{ id: 'list-1', name: 'Grocery' }]}
        onClose={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onToggleFavorite={jest.fn()} onRate={jest.fn()} onMarkAsMade={jest.fn()}
        onAddToShoppingList={onAddToShoppingList}
      />,
    );

    fireEvent.click(screen.getByText('Add to Shopping List'));
    fireEvent.click(screen.getByText('Grocery'));

    await waitFor(() => expect(onAddToShoppingList).toHaveBeenCalledTimes(1));
    expect(onAddToShoppingList.mock.calls[0][1]).toHaveLength(5);
  });

  it('excludes ingredients ticked off as already-have-it', async () => {
    const onAddToShoppingList = jest.fn().mockResolvedValue(undefined);
    render(
      <RecipeDetailModal
        recipe={recipe}
        shoppingLists={[{ id: 'list-1', name: 'Grocery' }]}
        onClose={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onToggleFavorite={jest.fn()} onRate={jest.fn()} onMarkAsMade={jest.fn()}
        onAddToShoppingList={onAddToShoppingList}
      />,
    );

    // Tick off flour, curry powder, and chilli flakes — same as the reported case.
    fireEvent.click(screen.getByText('25 g plain flour'));
    fireEvent.click(screen.getByText('4 tsp mild curry powder'));
    fireEvent.click(screen.getByText('pinch of dried chilli flakes'));

    fireEvent.click(screen.getByText('Add to Shopping List'));
    fireEvent.click(screen.getByText('Grocery'));

    await waitFor(() => expect(onAddToShoppingList).toHaveBeenCalledTimes(1));
    const sent = onAddToShoppingList.mock.calls[0][1] as Array<{ text: string }>;
    expect(sent.map((i) => i.text)).toEqual(['650 g chicken breast', '1/2 tsp sea salt']);
  });

  it('does not call the API at all when every ingredient is checked off', async () => {
    const onAddToShoppingList = jest.fn().mockResolvedValue(undefined);
    render(
      <RecipeDetailModal
        recipe={recipe}
        shoppingLists={[{ id: 'list-1', name: 'Grocery' }]}
        onClose={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onToggleFavorite={jest.fn()} onRate={jest.fn()} onMarkAsMade={jest.fn()}
        onAddToShoppingList={onAddToShoppingList}
      />,
    );

    for (const ing of recipe.ingredients as Array<{ text: string }>) {
      fireEvent.click(screen.getByText(ing.text));
    }

    fireEvent.click(screen.getByText('Add to Shopping List'));
    fireEvent.click(screen.getByText('Grocery'));

    await waitFor(() => expect(screen.queryByText('Grocery')).toBeNull()); // list picker closes either way
    expect(onAddToShoppingList).not.toHaveBeenCalled();
  });
});
