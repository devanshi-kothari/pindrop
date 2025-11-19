-- Supabase schema for Pindrop
CREATE TABLE IF NOT EXISTS app_user (
    user_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    home_location VARCHAR(255),
    budget_preference DECIMAL(10, 2),
    travel_style VARCHAR(50),
    liked_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS trip (
    trip_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255),
    start_date DATE,
    end_date DATE,
    total_budget DECIMAL(10, 2),
    num_travelers INT DEFAULT 1,
    trip_status VARCHAR(50) DEFAULT 'draft',
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS activity (
    activity_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    category VARCHAR(100),
    duration VARCHAR(50),
    cost_estimate DECIMAL(10, 2),
    rating DECIMAL(3, 1),
    tags TEXT[] DEFAULT '{}',
    source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS itinerary (
    itinerary_id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trip(trip_id) ON DELETE CASCADE,
    day_number INT NOT NULL,
    date DATE,
    summary TEXT,
    progress VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS itinerary_activity (
    itinerary_activity_id BIGSERIAL PRIMARY KEY,
    itinerary_id BIGINT NOT NULL REFERENCES itinerary(itinerary_id) ON DELETE CASCADE,
    activity_id BIGINT NOT NULL REFERENCES activity(activity_id) ON DELETE CASCADE,
    order_index INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS chat_message (
    message_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    trip_id BIGINT REFERENCES trip(trip_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_trip_user_id ON trip(user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_trip_id ON itinerary(trip_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_activity_ids ON itinerary_activity(itinerary_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_user_id ON chat_message(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_trip_id ON chat_message(trip_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_status ON trip(user_id, trip_status);
