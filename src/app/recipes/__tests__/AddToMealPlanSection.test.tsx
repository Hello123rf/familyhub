/**
 * @jest-environment jsdom
 */
/**
 * AddToMealPlanSection's "Add to Week" flow — reused as-is for both the
 * normal Recipe Library and the Recipe Inbox (via RecipeInboxCard).
 *
 * The behavior under test is the Inbox-specific addition: adding an inbox
 * recipe to the meal plan must promote it to reviewStatus 'saved' FIRST,
 * then create the meal (see src/app/recipes/AddToMealPlanSection.tsx). A
 * recipe that is already 'saved' must not trigger an extra PATCH call.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { AddToMealPlanSection } from '../AddToMealPlanSection';
import type { Recipe } from '@/lib/hooks/useRecipes';

jest.mock('@/components/providers', () => ({
  useAuth: () => ({ requireAuth: jest.fn().mockResolvedValue({ id: 'parent-1' }) }),
}));

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const inboxRecipe = { id: 'r1', name: 'Captured Pancakes', reviewStatus: 'inbox' } as unknown as Recipe;
const savedRecipe = { id: 'r2', name: 'Old Favorite', reviewStatus: 'saved' } as unknown as Recipe;

function selectToday() {
  const todayLabel = format(new Date(), 'd');
  const matches = screen.getAllByText(todayLabel);
  fireEvent.click(matches[0]!); // first occurrence = current week, i.e. today
}

describe('AddToMealPlanSection', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('promotes an inbox recipe to saved before creating the meal', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(<AddToMealPlanSection recipe={inboxRecipe} />);
    selectToday();
    fireEvent.click(screen.getByText('Add to Plan'));

    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0]).toBe('/api/recipes/r1');
    expect(calls[1]).toBe('/api/meals');
  });

  it('calls onPromoted once the promotion succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const onPromoted = jest.fn();

    render(<AddToMealPlanSection recipe={inboxRecipe} onPromoted={onPromoted} />);
    selectToday();
    fireEvent.click(screen.getByText('Add to Plan'));

    await waitFor(() => expect(onPromoted).toHaveBeenCalledTimes(1));
  });

  it('does not promote an already-saved recipe — only calls /api/meals', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(<AddToMealPlanSection recipe={savedRecipe} />);
    selectToday();
    fireEvent.click(screen.getByText('Add to Plan'));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toBe('/api/meals');
  });

  it('surfaces a recoverable error if promotion succeeds but meal creation fails', async () => {
    const { toast } = jest.requireMock('@/components/ui/use-toast') as { toast: jest.Mock };
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) return { ok: true, json: async () => ({}) } as Response; // promote succeeds
      return { ok: false, json: async () => ({}) } as Response; // meal creation fails
    });

    render(<AddToMealPlanSection recipe={inboxRecipe} />);
    selectToday();
    fireEvent.click(screen.getByText('Add to Plan'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Saved to your recipes') }),
      ),
    );
  });
});
