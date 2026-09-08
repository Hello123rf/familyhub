/**
 * Keyword fallback for guessing a grocery category from an item name, used
 * when there's no purchase history to match against (see
 * src/app/api/tasks/[id]/move-to-shopping/route.ts). Ids match
 * GROCERY_CATEGORIES in src/lib/constants/shoppingPresets.ts.
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  produce: [
    'apple', 'banana', 'orange', 'grape', 'berry', 'strawberr', 'blueberr',
    'raspberr', 'lemon', 'lime', 'avocado', 'lettuce', 'spinach', 'kale',
    'tomato', 'cucumber', 'onion', 'garlic', 'potato', 'carrot', 'celery',
    'pepper', 'broccoli', 'cauliflower', 'mushroom', 'zucchini', 'squash',
    'corn', 'melon', 'peach', 'pear', 'plum', 'mango', 'pineapple', 'herbs',
    'cilantro', 'parsley', 'basil', 'ginger',
  ],
  bakery: [
    'bread', 'bun', 'bagel', 'muffin', 'croissant', 'tortilla', 'baguette',
    'roll', 'cake', 'pastry', 'donut', 'pita',
  ],
  meat: [
    'chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'steak',
    'ground beef', 'mince', 'lamb', 'fish', 'salmon', 'shrimp', 'tuna', 'cod',
    'meatball',
  ],
  dairy: [
    'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg',
    'sour cream', 'cottage cheese',
  ],
  frozen: [
    'ice cream', 'frozen', 'pizza', 'fries', 'popsicle', 'waffle',
  ],
  pantry: [
    'rice', 'pasta', 'noodle', 'bean', 'cereal', 'flour', 'sugar', 'oil',
    'sauce', 'soup', 'cracker', 'chip', 'coffee', 'tea', 'spice', 'salt',
    'ketchup', 'mustard', 'mayo', 'jam', 'honey', 'peanut butter', 'nut',
    'cookie', 'chocolate', 'snack', 'can of',
  ],
};

/** Returns a GROCERY_CATEGORIES id, or null if no keyword matches. */
export function guessShoppingCategory(itemName: string): string | null {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}
