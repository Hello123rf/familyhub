-- Recipe Inbox: a review_status field on the existing recipes table rather
-- than a second table, so the Inbox reuses the same recipes CRUD, the same
-- meal-planner link (recipeId), and the same shopping-list ingredient flow
-- unmodified. Existing rows default to 'saved' (today's behavior), so this
-- is fully backward compatible with any existing installation's data.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'saved';
CREATE INDEX IF NOT EXISTS recipes_review_status_idx ON recipes (review_status);
