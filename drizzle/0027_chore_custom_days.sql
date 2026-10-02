-- Chores: a new 'custom_days' frequency lets a chore be due on any set of
-- specific weekdays (e.g. Mon/Wed/Sat) rather than just one day (weekly) or
-- every day (daily). days_of_week is unused/null for every other frequency.
ALTER TABLE chores ADD COLUMN IF NOT EXISTS days_of_week JSONB;
