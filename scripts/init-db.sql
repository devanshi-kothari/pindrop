-- Initialize the database
CREATE DATABASE IF NOT EXISTS pindrop_db;

-- Create user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pindrop_user') THEN
        CREATE ROLE pindrop_user WITH LOGIN PASSWORD 'pindrop_password';
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pindrop_db TO pindrop_user;
