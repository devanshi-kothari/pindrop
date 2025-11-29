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

--CREATE TYPE trip_status_type AS ENUM ('draft', 'planned', 'archived');

CREATE TABLE IF NOT EXISTS trip (
    trip_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255),
    trip_status trip_status_type DEFAULT 'draft',
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
    source_url TEXT,
    image_url TEXT,
    description TEXT,
    price_range VARCHAR(50),
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

-- Trip-specific preferences to guide planning and itinerary generation
CREATE TABLE IF NOT EXISTS trip_preference (
    trip_preference_id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL UNIQUE REFERENCES trip(trip_id) ON DELETE CASCADE,
    -- Core structure
    num_days INT,
    start_date DATE,
    end_date DATE,
    -- Budget expectations per trip or per day
    min_budget DECIMAL(10, 2),
    max_budget DECIMAL(10, 2),
    -- How full each day should feel: 'slow', 'balanced', 'packed'
    pace VARCHAR(50),
    -- Where they prefer to stay: 'hotel', 'airbnb', 'hostel', etc.
    accommodation_type VARCHAR(50),
    -- Multi-select activity interests for this trip
    activity_categories TEXT[] DEFAULT '{}',
    -- Things to avoid on this trip
    avoid_activity_categories TEXT[] DEFAULT '{}',
    -- Who is travelling: 'solo', 'couple', 'family', 'friends', 'girls_trip', etc.
    group_type VARCHAR(50),
    -- Safety and access notes (ex. \"safe for a group of girls\")
    safety_notes TEXT,
    accessibility_notes TEXT,
    -- Free-form extra requests or constraints
    custom_requests TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Trip-level feedback on reusable activities (for swipe-style selection)
CREATE TABLE IF NOT EXISTS trip_activity_preference (
    trip_activity_preference_id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trip(trip_id) ON DELETE CASCADE,
    activity_id BIGINT NOT NULL REFERENCES activity(activity_id) ON DELETE CASCADE,
    preference VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (preference IN ('pending', 'liked', 'disliked', 'maybe')),
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

-- Individual flight options (similar to activity table)
-- Each row represents one flight option (either outbound or return)
CREATE TABLE IF NOT EXISTS flight (
    flight_id BIGSERIAL PRIMARY KEY,
    flight_type VARCHAR(20) NOT NULL CHECK (flight_type IN ('outbound', 'return')),
    -- Extracted from flight_data JSONB
    price DECIMAL(10, 2),
    departure_token VARCHAR(255), -- Used to fetch return flights for this outbound flight
    total_duration INT, -- Duration in minutes
    -- Complex nested structures stored as JSONB
    flights JSONB, -- Array of flight legs
    layovers JSONB, -- Array of layover information
    -- Additional flight data that doesn't fit in columns
    additional_data JSONB, -- For any other flight data fields
    -- Extracted from search_params JSONB
    departure_id VARCHAR(100), -- Airport code for departure
    arrival_id VARCHAR(100), -- Airport code for arrival
    outbound_date DATE,
    return_date DATE,
    currency VARCHAR(10) DEFAULT 'USD',
    -- Additional search parameters that don't fit in columns
    additional_search_params JSONB, -- For any other search parameters
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Maps flights to trips (similar to itinerary_activity or trip_activity_preference)
-- Tracks which flights are associated with which trips and their selection status
CREATE TABLE IF NOT EXISTS trip_flight (
    trip_id BIGINT NOT NULL REFERENCES trip(trip_id) ON DELETE CASCADE,
    flight_id BIGINT NOT NULL REFERENCES flight(flight_id) ON DELETE CASCADE,
    -- Whether this flight is selected for the trip (only one outbound and one return should be selected per trip)
    is_selected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    -- Composite primary key
    PRIMARY KEY (trip_id, flight_id)
);

-- Maps departing flights to their available return flights
-- When a departing flight is selected, return flights are fetched via API using departure_token
-- This table stores which return flights are available for which departing flight within a specific trip
-- Note: Application logic should ensure departing_flight_id references an 'outbound' flight
-- and return_flight_id references a 'return' flight
CREATE TABLE IF NOT EXISTS flight_return_mapping (
    trip_id BIGINT NOT NULL REFERENCES trip(trip_id) ON DELETE CASCADE,
    departing_flight_id BIGINT NOT NULL REFERENCES flight(flight_id) ON DELETE CASCADE,
    return_flight_id BIGINT NOT NULL REFERENCES flight(flight_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    -- Composite primary key ensures uniqueness per trip
    PRIMARY KEY (trip_id, departing_flight_id, return_flight_id),
    -- Prevent a flight from being mapped to itself
    CONSTRAINT check_different_flights CHECK (departing_flight_id != return_flight_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_user_id ON trip(user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_trip_id ON itinerary(trip_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_activity_ids ON itinerary_activity(itinerary_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_trip_preference_trip_id ON trip_preference(trip_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_user_id ON chat_message(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_trip_id ON chat_message(trip_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_status ON trip(user_id, trip_status);
CREATE INDEX IF NOT EXISTS idx_trip_activity_preference_trip_id ON trip_activity_preference(trip_id);
CREATE INDEX IF NOT EXISTS idx_flight_type ON flight(flight_type);
CREATE INDEX IF NOT EXISTS idx_flight_departure_token ON flight(departure_token) WHERE departure_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_flight_trip_id ON trip_flight(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_flight_flight_id ON trip_flight(flight_id);
-- Note: Application logic should ensure only one selected outbound and one selected return flight per trip
-- This can be enforced via a trigger or application-level checks
CREATE INDEX IF NOT EXISTS idx_trip_flight_selected ON trip_flight(trip_id, is_selected) WHERE is_selected = TRUE;
CREATE INDEX IF NOT EXISTS idx_flight_return_mapping_trip_id ON flight_return_mapping(trip_id);
CREATE INDEX IF NOT EXISTS idx_flight_return_mapping_departing ON flight_return_mapping(departing_flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_return_mapping_return ON flight_return_mapping(return_flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_return_mapping_trip_departing ON flight_return_mapping(trip_id, departing_flight_id);
