-- Per-person recipe ratings (e.g. each kid rates a recipe separately),
-- replacing the single rating star row. recipes.rating becomes a
-- server-computed average across these rows rather than directly settable.
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_in_meal_ratings BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS recipe_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recipe_ratings_recipe_user_unique ON recipe_ratings (recipe_id, user_id);
