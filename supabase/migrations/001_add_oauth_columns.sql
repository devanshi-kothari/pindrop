-- OAuth support for app_user
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- THIS WAS ALREADY RUN IN THE SUPABASE SQL EDITOR AND THE CHANGES ARE IMPLEMENTED!!! (AS OF 3/19/2026)

ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_oauth
  ON app_user(oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;
