-- Reset script for Pindrop database
-- This script drops all tables and indexes to clear the database
-- WARNING: This will delete all existing data in the database!
--
-- IMPORTANT: After running this script, you must run schema.sql to recreate the tables.
-- Use the provided reset-db.sh script or run both files in sequence:
--   cat supabase/reset.sql supabase/schema.sql | psql ...

-- Drop tables in reverse dependency order to handle foreign key constraints
DROP TABLE IF EXISTS chat_message CASCADE;
DROP TABLE IF EXISTS itinerary_activity CASCADE;
DROP TABLE IF EXISTS itinerary CASCADE;
DROP TABLE IF EXISTS trip CASCADE;
DROP TABLE IF EXISTS activity CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Drop indexes if they exist (usually dropped with tables, but included for safety)
DROP INDEX IF EXISTS idx_trip_user_id;
DROP INDEX IF EXISTS idx_itinerary_trip_id;
DROP INDEX IF EXISTS idx_itinerary_activity_ids;
DROP INDEX IF EXISTS idx_chat_message_user_id;
DROP INDEX IF EXISTS idx_chat_message_created_at;

-- Tables dropped. Now run schema.sql to recreate them with the initial schema.

