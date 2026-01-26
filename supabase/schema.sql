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
    address VARCHAR(255),
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

-- Individual hotel options (similar to flight table)
-- Each row represents one hotel option from the search results
CREATE TABLE IF NOT EXISTS hotel (
    hotel_id BIGSERIAL PRIMARY KEY,
    -- Basic hotel information
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100), -- e.g., 'hotel', 'vacation rental'
    description TEXT,
    link TEXT, -- URL of the property's website
    logo TEXT, -- URL of the property's logo
    sponsored BOOLEAN DEFAULT FALSE,
    eco_certified BOOLEAN DEFAULT FALSE,
    -- Location information
    location VARCHAR(255), -- Search location used
    latitude DECIMAL(10, 8), -- From gps_coordinates
    longitude DECIMAL(11, 8), -- From gps_coordinates
    -- Check-in/out times
    check_in_time VARCHAR(50), -- e.g., '3:00 PM'
    check_out_time VARCHAR(50), -- e.g., '12:00 PM'
    -- Pricing information (extracted from rate_per_night and total_rate)
    rate_per_night_lowest DECIMAL(10, 2), -- extracted_lowest from rate_per_night
    rate_per_night_formatted VARCHAR(50), -- lowest formatted string
    total_rate_lowest DECIMAL(10, 2), -- extracted_lowest from total_rate
    total_rate_formatted VARCHAR(50), -- lowest formatted string
    -- Hotel classification
    hotel_class VARCHAR(50), -- e.g., '5-star hotel'
    extracted_hotel_class INT, -- e.g., 5
    -- Ratings and reviews
    overall_rating DECIMAL(3, 2), -- e.g., 4.5
    reviews INT, -- Total number of reviews
    location_rating DECIMAL(3, 2), -- Location rating
    -- Complex nested structures stored as JSONB
    prices JSONB, -- Array of prices from different sources
    nearby_places JSONB, -- Array of nearby places with transportations
    images JSONB, -- Array of image objects (thumbnail, original_image)
    ratings JSONB, -- Array of star ratings breakdown
    reviews_breakdown JSONB, -- Array of review breakdown categories
    amenities TEXT[], -- Array of amenities (e.g., 'Free Wi-Fi', 'Free parking')
    excluded_amenities TEXT[], -- Array of excluded amenities
    health_and_safety JSONB, -- Health and safety information object
    essential_info TEXT[], -- Essential info for vacation rentals
    -- SerpAPI specific fields
    property_token VARCHAR(255), -- Token to retrieve property details
    serpapi_property_details_link TEXT, -- SerpAPI endpoint for property details
    -- Search parameters used to find this hotel
    search_location VARCHAR(255), -- Location searched
    check_in_date DATE, -- Check-in date used in search
    check_out_date DATE, -- Check-out date used in search
    currency VARCHAR(10) DEFAULT 'USD',
    -- Additional hotel data that doesn't fit in columns
    additional_data JSONB, -- For any other hotel data fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Maps hotels to trips (similar to trip_flight)
-- Tracks which hotels are associated with which trips and their selection status
CREATE TABLE IF NOT EXISTS trip_hotel (
    trip_id BIGINT NOT NULL REFERENCES trip(trip_id) ON DELETE CASCADE,
    hotel_id BIGINT NOT NULL REFERENCES hotel(hotel_id) ON DELETE CASCADE,
    -- Whether this hotel is selected for the trip (only one hotel should be selected per trip)
    is_selected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    -- Composite primary key
    PRIMARY KEY (trip_id, hotel_id)
);

-- Indexes for hotel tables
CREATE INDEX IF NOT EXISTS idx_hotel_location ON hotel(location);
CREATE INDEX IF NOT EXISTS idx_hotel_name ON hotel(name);
CREATE INDEX IF NOT EXISTS idx_hotel_property_token ON hotel(property_token) WHERE property_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_search_dates ON hotel(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_trip_hotel_trip_id ON trip_hotel(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_hotel_hotel_id ON trip_hotel(hotel_id);
-- Note: Application logic should ensure only one selected hotel per trip
-- This can be enforced via a trigger or application-level checks
CREATE INDEX IF NOT EXISTS idx_trip_hotel_selected ON trip_hotel(trip_id, is_selected) WHERE is_selected = TRUE;

-- Cache hotel booking options to avoid repeated API calls
-- Stores the booking options (featured_prices) fetched from SerpAPI property details
CREATE TABLE IF NOT EXISTS hotel_booking_options (
    hotel_booking_options_id BIGSERIAL PRIMARY KEY,
    hotel_id BIGINT NOT NULL REFERENCES hotel(hotel_id) ON DELETE CASCADE,
    -- The serpapi_property_details_link used to fetch this data (for identification)
    serpapi_link TEXT NOT NULL,
    -- The full property details response from SerpAPI (or just the booking options part)
    booking_options_data JSONB NOT NULL,
    -- When this data was fetched
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    -- Ensure we don't store duplicate entries for the same hotel and link
    UNIQUE(hotel_id, serpapi_link)
);

-- Indexes for hotel_booking_options
CREATE INDEX IF NOT EXISTS idx_hotel_booking_options_hotel_id ON hotel_booking_options(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_booking_options_serpapi_link ON hotel_booking_options(serpapi_link);
CREATE INDEX IF NOT EXISTS idx_hotel_booking_options_fetched_at ON hotel_booking_options(fetched_at);
