// backend/routes/hotels.js
import express from 'express';
import fetch from 'node-fetch';
import { authenticateToken } from '../middleware/auth.js';
import supabase from '../supabaseClient.js';

const router = express.Router();

// Helper function to extract city from activities in a day
function getMostCommonCity(cities) {
  if (!cities || cities.length === 0) return null;
  
  // Count occurrences
  const cityCount = {};
  cities.forEach(city => {
    if (city) {
      const normalized = city.trim();
      cityCount[normalized] = (cityCount[normalized] || 0) + 1;
    }
  });
  
  // Return most common city
  let maxCount = 0;
  let mostCommon = null;
  Object.entries(cityCount).forEach(([city, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = city;
    }
  });
  
  return mostCommon || cities[0] || null;
}

// Helper function to extract cities per day from itinerary
async function extractCitiesPerDay(tripId) {
  try {
    const { data: itineraryDays, error } = await supabase
      .from('itinerary')
      .select(`
        itinerary_id,
        day_number,
        date,
        city,
        itinerary_activity (
          activity:activity (
            location
          )
        )
      `)
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) {
      console.error('Error fetching itinerary for city extraction:', error);
      return new Map();
    }

    const cityMap = new Map(); // day_number -> city
    
    itineraryDays?.forEach(day => {
      // If city is already set in itinerary, use it
      if (day.city) {
        cityMap.set(day.day_number, day.city);
        return;
      }
      
      // Otherwise, extract from activities
      const activities = day.itinerary_activity || [];
      const cities = activities
        .map(ia => ia.activity?.location)
        .filter(Boolean);
      
      if (cities.length > 0) {
        const city = getMostCommonCity(cities);
        if (city) {
          cityMap.set(day.day_number, city);
          
          // Update itinerary table with city
          supabase
            .from('itinerary')
            .update({ city })
            .eq('itinerary_id', day.itinerary_id)
            .then(({ error: updateError }) => {
              if (updateError) {
                console.error(`Error updating city for day ${day.day_number}:`, updateError);
              }
            });
        }
      }
    });
    
    return cityMap;
  } catch (error) {
    console.error('Error extracting cities per day:', error);
    return new Map();
  }
}

// Helper function to group consecutive days by city
function groupDaysByCity(cityMap) {
  const groups = []; // Array of { city, startDay, endDay }
  let currentCity = null;
  let startDay = null;
  
  const sortedDays = Array.from(cityMap.entries()).sort((a, b) => a[0] - b[0]);
  
  sortedDays.forEach(([dayNumber, city]) => {
    if (city !== currentCity) {
      // Save previous group if exists
      if (currentCity !== null && startDay !== null) {
        groups.push({
          city: currentCity,
          startDay: startDay,
          endDay: dayNumber - 1
        });
      }
      // Start new group
      currentCity = city;
      startDay = dayNumber;
    }
  });
  
  // Save last group
  if (currentCity !== null && startDay !== null) {
    const lastDay = sortedDays[sortedDays.length - 1][0];
    groups.push({
      city: currentCity,
      startDay: startDay,
      endDay: lastDay
    });
  }
  
  return groups;
}

// Search for hotels using SerpAPI Google Hotels
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { location, check_in_date, check_out_date } = req.query;

    // Validate required parameters
    if (!location || !check_in_date || !check_out_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: location, check_in_date, check_out_date'
      });
    }

    // Get SerpAPI key from environment
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    if (!SERPAPI_KEY) {
      return res.status(500).json({
        success: false,
        message: 'SerpAPI key not configured'
      });
    }

    // Build the SerpAPI URL
    const params = new URLSearchParams({
      engine: 'google_hotels',
      api_key: SERPAPI_KEY,
      q: location,
      check_in_date: check_in_date,
      check_out_date: check_out_date,
      currency: 'USD'
    });

    const serpApiUrl = `https://serpapi.com/search?${params.toString()}`;
    console.log('Calling SerpAPI for hotels:', serpApiUrl.replace(SERPAPI_KEY, '***'));

    // Fetch from SerpAPI
    const response = await fetch(serpApiUrl);
    const data = await response.json();

    console.log('SerpAPI hotels response status:', response.status);
    console.log('SerpAPI hotels response keys:', Object.keys(data));

    if (!response.ok) {
      console.error('SerpAPI error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error || 'Failed to fetch hotel data from SerpAPI',
        error: data
      });
    }

    // Extract properties array
    const properties = data.properties || [];

    console.log(`Found ${properties.length} hotel properties`);

    res.status(200).json({
      success: true,
      properties: properties
    });
  } catch (error) {
    console.error('Error fetching hotels:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching hotels',
      error: error.message
    });
  }
});

// Get detailed property information using serpapi_property_details_link
// First checks the database for cached booking options, then makes API call if not found
router.get('/details', authenticateToken, async (req, res) => {
  try {
    const { serpapi_link, hotel_id } = req.query;

    // Validate required parameters
    if (!serpapi_link) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: serpapi_link'
      });
    }

    // If hotel_id is provided, check database first for cached booking options
    if (hotel_id) {
      try {
        const { data: cachedOptions, error: cacheError } = await supabase
          .from('hotel_booking_options')
          .select('booking_options_data, fetched_at')
          .eq('hotel_id', parseInt(hotel_id))
          .eq('serpapi_link', serpapi_link)
          .maybeSingle();

        if (!cacheError && cachedOptions) {
          console.log(`Found cached booking options for hotel ${hotel_id}, fetched at ${cachedOptions.fetched_at}`);
          // Return cached data
          return res.status(200).json({
            success: true,
            property: cachedOptions.booking_options_data,
            cached: true,
            fetched_at: cachedOptions.fetched_at
          });
        } else if (cacheError) {
          console.error('Error checking cache for booking options:', cacheError);
          // Continue to API call if cache check fails
        } else {
          console.log(`No cached booking options found for hotel ${hotel_id}, fetching from API`);
        }
      } catch (cacheCheckError) {
        console.error('Error checking cache:', cacheCheckError);
        // Continue to API call if cache check fails
      }
    }

    // Get SerpAPI key from environment
    const SERPAPI_KEY = process.env.SERPAPI_KEY?.trim();
    if (!SERPAPI_KEY || SERPAPI_KEY.length === 0) {
      console.error('SERPAPI_KEY is missing or empty in property details');
      return res.status(500).json({
        success: false,
        message: 'SerpAPI key not configured'
      });
    }

    // Use the serpapi_property_details_link but replace the API key with ours
    let serpApiUrl;
    try {
      const url = new URL(serpapi_link);
      url.searchParams.set('api_key', SERPAPI_KEY);
      serpApiUrl = url.toString();
      console.log('Calling SerpAPI for property details:', serpApiUrl.replace(SERPAPI_KEY, '***'));
    } catch (urlError) {
      console.error('Invalid serpapi_link URL:', serpapi_link);
      return res.status(400).json({
        success: false,
        message: 'Invalid serpapi_link URL format'
      });
    }

    // Fetch from SerpAPI
    let response;
    try {
      response = await fetch(serpApiUrl);
    } catch (fetchError) {
      console.error('Network error fetching property details from SerpAPI:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Network error while connecting to SerpAPI',
        error: fetchError.message
      });
    }

    console.log('SerpAPI property details response status:', response.status);

    // Parse response body
    let data;
    try {
      const text = await response.text();
      console.log('SerpAPI property details raw response (first 500 chars):', text.substring(0, 500));
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse SerpAPI property details response as JSON:', parseError);
      return res.status(500).json({
        success: false,
        message: 'Invalid response format from SerpAPI',
        error: parseError.message
      });
    }

    // Check for SerpAPI errors (they can return errors even with 200 status)
    if (data.error) {
      console.error('SerpAPI error in property details response:', data.error);
      return res.status(response.ok ? 400 : response.status).json({
        success: false,
        message: data.error || 'Failed to fetch property details from SerpAPI',
        error: data
      });
    }

    if (!response.ok) {
      console.error('SerpAPI HTTP error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error || 'Failed to fetch property details from SerpAPI',
        error: data
      });
    }

    // The response should contain property details
    console.log('Property details response keys:', Object.keys(data));

    // Save to database cache if hotel_id is provided
    if (hotel_id) {
      try {
        const { error: saveError } = await supabase
          .from('hotel_booking_options')
          .upsert([{
            hotel_id: parseInt(hotel_id),
            serpapi_link: serpapi_link,
            booking_options_data: data,
            fetched_at: new Date().toISOString()
          }], {
            onConflict: 'hotel_id,serpapi_link'
          });

        if (saveError) {
          console.error('Error saving booking options to cache:', saveError);
          // Don't fail the request if cache save fails
        } else {
          console.log(`Successfully cached booking options for hotel ${hotel_id}`);
        }
      } catch (saveCacheError) {
        console.error('Error saving booking options to cache:', saveCacheError);
        // Don't fail the request if cache save fails
      }
    }

    res.status(200).json({
      success: true,
      property: data,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching property details:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching property details',
      error: error.message
    });
  }
});

// Save hotels to database
// This endpoint is called after the hotel search API returns results.
// It saves each hotel option to:
// 1. The 'hotel' table (individual hotel records)
// 2. The 'trip_hotel' table (associates hotels with trips)
// Now supports multi-city trips with city and day range
router.post('/save', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { trip_id, properties, search_params, city, start_day, end_day } = req.body;

    if (!trip_id || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: trip_id and properties array'
      });
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', trip_id)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    const savedHotelIds = [];
    const searchParamsObj = search_params || {};

    console.log(`Starting to save ${properties.length} hotel options to database for trip ${trip_id}`);

    // Save each hotel option
    for (let i = 0; i < properties.length; i++) {
      const hotelProperty = properties[i];
      console.log(`Processing hotel option ${i + 1} of ${properties.length}: ${hotelProperty.name}`);

      // Extract known fields from hotel property
      const hotelData = {
        name: hotelProperty.name || null,
        type: hotelProperty.type || null,
        description: hotelProperty.description || null,
        link: hotelProperty.link || null,
        logo: hotelProperty.logo || null,
        sponsored: hotelProperty.sponsored || false,
        eco_certified: hotelProperty.eco_certified || false,
        // Location information
        location: searchParamsObj.location || null,
        latitude: hotelProperty.gps_coordinates?.latitude || null,
        longitude: hotelProperty.gps_coordinates?.longitude || null,
        // Check-in/out times
        check_in_time: hotelProperty.check_in_time || null,
        check_out_time: hotelProperty.check_out_time || null,
        // Pricing information
        rate_per_night_lowest: hotelProperty.rate_per_night?.extracted_lowest || null,
        rate_per_night_formatted: hotelProperty.rate_per_night?.lowest || null,
        total_rate_lowest: hotelProperty.total_rate?.extracted_lowest || null,
        total_rate_formatted: hotelProperty.total_rate?.lowest || null,
        // Hotel classification
        hotel_class: hotelProperty.hotel_class || null,
        extracted_hotel_class: hotelProperty.extracted_hotel_class || null,
        // Ratings and reviews
        overall_rating: hotelProperty.overall_rating || null,
        reviews: hotelProperty.reviews || null,
        location_rating: hotelProperty.location_rating || null,
        // Complex nested structures stored as JSONB
        prices: hotelProperty.prices || null,
        nearby_places: hotelProperty.nearby_places || null,
        images: hotelProperty.images || null,
        ratings: hotelProperty.ratings || null,
        reviews_breakdown: hotelProperty.reviews_breakdown || null,
        health_and_safety: hotelProperty.health_and_safety || null,
        // Arrays
        amenities: hotelProperty.amenities || [],
        excluded_amenities: hotelProperty.excluded_amenities || [],
        essential_info: hotelProperty.essential_info || [],
        // SerpAPI specific fields
        property_token: hotelProperty.property_token || null,
        serpapi_property_details_link: hotelProperty.serpapi_property_details_link || null,
        // Search parameters
        search_location: searchParamsObj.location || null,
        check_in_date: searchParamsObj.check_in_date ? new Date(searchParamsObj.check_in_date).toISOString().split('T')[0] : null,
        check_out_date: searchParamsObj.check_out_date ? new Date(searchParamsObj.check_out_date).toISOString().split('T')[0] : null,
        currency: searchParamsObj.currency || 'USD',
        // Additional hotel data that doesn't fit in columns
        additional_data: {} // Can store any other fields if needed
      };

      console.log(`Saving hotel: ${hotelData.name}, price: ${hotelData.total_rate_formatted || hotelData.rate_per_night_formatted}`);

      // Insert hotel into hotel table
      const { data: hotel, error: hotelError } = await supabase
        .from('hotel')
        .insert([hotelData])
        .select('hotel_id')
        .single();

      if (hotelError) {
        console.error('Error inserting hotel into hotel table:', hotelError);
        console.error('Hotel data that failed:', JSON.stringify(hotelData, null, 2));
        continue; // Skip this hotel but continue with others
      }

      if (hotel?.hotel_id) {
        savedHotelIds.push(hotel.hotel_id);
        console.log(`Successfully saved hotel ${i + 1} to hotel table with hotel_id: ${hotel.hotel_id}`);

        // Associate hotel with trip in trip_hotel table
        // Use upsert to handle duplicates (if hotel already associated with trip)
        // Include city and day range for multi-city support
        const tripHotelData = {
          trip_id: trip_id,
          hotel_id: hotel.hotel_id,
          is_selected: false
        };
        
        // Add city and day range if provided (for multi-city trips)
        if (city) {
          tripHotelData.city = city;
        }
        if (start_day !== undefined && start_day !== null) {
          tripHotelData.start_day = parseInt(start_day);
        }
        if (end_day !== undefined && end_day !== null) {
          tripHotelData.end_day = parseInt(end_day);
        }
        
        const { error: tripHotelError } = await supabase
          .from('trip_hotel')
          .upsert([tripHotelData], {
            onConflict: 'trip_id,hotel_id'
          });

        if (tripHotelError) {
          console.error(`Error associating hotel ${i + 1} with trip in trip_hotel table:`, tripHotelError);
          console.error('trip_id:', trip_id, 'hotel_id:', hotel.hotel_id);
        } else {
          console.log(`Successfully associated hotel ${i + 1} (hotel_id: ${hotel.hotel_id}) with trip ${trip_id} in trip_hotel table`);
        }
      } else {
        console.error(`Hotel ${i + 1} was inserted but no hotel_id was returned`);
      }
    }

    console.log(`Completed saving hotels. Successfully saved ${savedHotelIds.length} out of ${properties.length} hotel options`);

    res.status(200).json({
      success: true,
      message: `Saved ${savedHotelIds.length} hotels`,
      hotel_ids: savedHotelIds,
      total_hotels: properties.length,
      saved_count: savedHotelIds.length
    });
  } catch (error) {
    console.error('Error saving hotels:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving hotels',
      error: error.message
    });
  }
});

// Update hotel selection status
// Now supports multi-city: when selecting a hotel for a city, only unselects other hotels for that same city
router.put('/select', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { trip_id, hotel_id, is_selected, city } = req.body;

    if (!trip_id || !hotel_id || typeof is_selected !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: trip_id, hotel_id, and is_selected'
      });
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', trip_id)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Get the hotel's city if not provided (for backward compatibility)
    let hotelCity = city;
    if (!hotelCity) {
      const { data: tripHotel } = await supabase
        .from('trip_hotel')
        .select('city')
        .eq('trip_id', trip_id)
        .eq('hotel_id', hotel_id)
        .maybeSingle();
      
      hotelCity = tripHotel?.city || null;
    }

    // If selecting this hotel, unselect other hotels for this city (or entire trip if no city)
    if (is_selected) {
      console.log(`Selecting hotel ${hotel_id} for trip ${trip_id}${hotelCity ? ` in city ${hotelCity}` : ''}`);
      
      // Build unselect query - unselect hotels for the same city, or all hotels if no city specified
      let unselectQuery = supabase
        .from('trip_hotel')
        .update({ 
          is_selected: false, 
          updated_at: new Date().toISOString() 
        })
        .eq('trip_id', trip_id)
        .neq('hotel_id', hotel_id);
      
      // If city is specified, only unselect hotels for that city
      if (hotelCity) {
        unselectQuery = unselectQuery.eq('city', hotelCity);
      }
      
      const { error: unselectError } = await unselectQuery;

      if (unselectError) {
        console.error('Error unselecting other hotels:', unselectError);
      } else {
        console.log(`Successfully unselected other hotels for ${hotelCity ? `city ${hotelCity}` : 'this trip'}`);
      }
    }

    // Update the selected hotel in trip_hotel table
    const { error: updateError } = await supabase
      .from('trip_hotel')
      .update({
        is_selected: is_selected,
        updated_at: new Date().toISOString()
      })
      .eq('trip_id', trip_id)
      .eq('hotel_id', hotel_id);

    if (updateError) {
      console.error('Error updating hotel selection in trip_hotel:', updateError);
      throw updateError;
    }

    console.log(`Successfully ${is_selected ? 'selected' : 'unselected'} hotel ${hotel_id} for trip ${trip_id}`);

    res.status(200).json({
      success: true,
      message: `Hotel selection ${is_selected ? 'updated' : 'cleared'}`,
      hotel_id: hotel_id,
      is_selected: is_selected
    });
  } catch (error) {
    console.error('Error updating hotel selection:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating hotel selection',
      error: error.message
    });
  }
});

// Load all hotels for a trip (for restoring state when user returns)
router.get('/trip/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip_id'
      });
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Get all hotels associated with this trip
    const { data: tripHotels, error: tripHotelsError } = await supabase
      .from('trip_hotel')
      .select(`
        hotel_id,
        is_selected,
        hotel:hotel(*)
      `)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (tripHotelsError) {
      throw tripHotelsError;
    }

    // Reconstruct hotel properties from database columns
    const hotels = [];
    const hotelIdMap = {}; // Map index to hotel_id
    let selectedHotelIndex = null;
    let selectedHotelId = null;

    tripHotels?.forEach((th, index) => {
      if (th.hotel) {
        // Reconstruct hotel property from database columns
        const hotelProperty = {
          name: th.hotel.name,
          type: th.hotel.type,
          description: th.hotel.description,
          link: th.hotel.link,
          logo: th.hotel.logo,
          sponsored: th.hotel.sponsored,
          eco_certified: th.hotel.eco_certified,
          gps_coordinates: th.hotel.latitude && th.hotel.longitude ? {
            latitude: th.hotel.latitude,
            longitude: th.hotel.longitude
          } : null,
          check_in_time: th.hotel.check_in_time,
          check_out_time: th.hotel.check_out_time,
          rate_per_night: th.hotel.rate_per_night_lowest ? {
            extracted_lowest: th.hotel.rate_per_night_lowest,
            lowest: th.hotel.rate_per_night_formatted
          } : null,
          total_rate: th.hotel.total_rate_lowest ? {
            extracted_lowest: th.hotel.total_rate_lowest,
            lowest: th.hotel.total_rate_formatted
          } : null,
          hotel_class: th.hotel.hotel_class,
          extracted_hotel_class: th.hotel.extracted_hotel_class,
          overall_rating: th.hotel.overall_rating,
          reviews: th.hotel.reviews,
          location_rating: th.hotel.location_rating,
          prices: th.hotel.prices,
          nearby_places: th.hotel.nearby_places,
          images: th.hotel.images,
          ratings: th.hotel.ratings,
          reviews_breakdown: th.hotel.reviews_breakdown,
          amenities: th.hotel.amenities || [],
          excluded_amenities: th.hotel.excluded_amenities || [],
          essential_info: th.hotel.essential_info || [],
          health_and_safety: th.hotel.health_and_safety,
          property_token: th.hotel.property_token,
          serpapi_property_details_link: th.hotel.serpapi_property_details_link,
          ...(th.hotel.additional_data || {})
        };

        hotels.push(hotelProperty);
        hotelIdMap[index] = th.hotel_id;
        if (th.is_selected) {
          selectedHotelId = th.hotel_id;
          selectedHotelIndex = index;
        }
      }
    });

    res.status(200).json({
      success: true,
      hotels: hotels,
      hotel_ids: hotelIdMap,
      selected_hotel_index: selectedHotelIndex,
      selected_hotel_id: selectedHotelId
    });
  } catch (error) {
    console.error('Error loading hotels for trip:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while loading hotels',
      error: error.message
    });
  }
});

// Get cities that need hotels for a trip
// Returns list of cities with their day ranges and whether they already have selected hotels
router.get('/trip/:tripId/cities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip_id'
      });
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Extract cities from itinerary
    const cityMap = await extractCitiesPerDay(tripId);
    const cityGroups = groupDaysByCity(cityMap);

    // Get selected hotels per city
    const { data: selectedHotels } = await supabase
      .from('trip_hotel')
      .select('city, start_day, end_day')
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const citiesWithHotels = new Set();
    selectedHotels?.forEach(h => {
      if (h.city) {
        citiesWithHotels.add(h.city);
      }
    });

    // Build response with city info and whether hotels are needed
    const cities = cityGroups.map(group => ({
      city: group.city,
      startDay: group.startDay,
      endDay: group.endDay,
      hasHotel: citiesWithHotels.has(group.city)
    }));

    res.status(200).json({
      success: true,
      cities: cities
    });
  } catch (error) {
    console.error('Error fetching cities for trip:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching cities',
      error: error.message
    });
  }
});

// Get hotels for a specific city/day range
router.get('/trip/:tripId/city/:city', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const city = decodeURIComponent(req.params.city);

    if (!tripId || !city) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip_id or city'
      });
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Get hotels for this city
    const { data: tripHotels, error: tripHotelsError } = await supabase
      .from('trip_hotel')
      .select(`
        hotel_id,
        city,
        start_day,
        end_day,
        is_selected,
        hotel:hotel(*)
      `)
      .eq('trip_id', tripId)
      .eq('city', city)
      .order('created_at', { ascending: true });

    if (tripHotelsError) {
      throw tripHotelsError;
    }

    // Reconstruct hotel properties from database columns
    const hotels = [];
    const hotelIdMap = {};
    let selectedHotelIndex = null;
    let selectedHotelId = null;

    tripHotels?.forEach((th, index) => {
      if (th.hotel) {
        const hotelProperty = {
          name: th.hotel.name,
          type: th.hotel.type,
          description: th.hotel.description,
          link: th.hotel.link,
          logo: th.hotel.logo,
          sponsored: th.hotel.sponsored,
          eco_certified: th.hotel.eco_certified,
          gps_coordinates: th.hotel.latitude && th.hotel.longitude ? {
            latitude: th.hotel.latitude,
            longitude: th.hotel.longitude
          } : null,
          check_in_time: th.hotel.check_in_time,
          check_out_time: th.hotel.check_out_time,
          rate_per_night: th.hotel.rate_per_night_lowest ? {
            extracted_lowest: th.hotel.rate_per_night_lowest,
            lowest: th.hotel.rate_per_night_formatted
          } : null,
          total_rate: th.hotel.total_rate_lowest ? {
            extracted_lowest: th.hotel.total_rate_lowest,
            lowest: th.hotel.total_rate_formatted
          } : null,
          hotel_class: th.hotel.hotel_class,
          extracted_hotel_class: th.hotel.extracted_hotel_class,
          overall_rating: th.hotel.overall_rating,
          reviews: th.hotel.reviews,
          location_rating: th.hotel.location_rating,
          prices: th.hotel.prices,
          nearby_places: th.hotel.nearby_places,
          images: th.hotel.images,
          ratings: th.hotel.ratings,
          reviews_breakdown: th.hotel.reviews_breakdown,
          amenities: th.hotel.amenities || [],
          excluded_amenities: th.hotel.excluded_amenities || [],
          essential_info: th.hotel.essential_info || [],
          health_and_safety: th.hotel.health_and_safety,
          property_token: th.hotel.property_token,
          serpapi_property_details_link: th.hotel.serpapi_property_details_link,
          ...(th.hotel.additional_data || {})
        };

        hotels.push(hotelProperty);
        hotelIdMap[index] = th.hotel_id;
        if (th.is_selected) {
          selectedHotelId = th.hotel_id;
          selectedHotelIndex = index;
        }
      }
    });

    res.status(200).json({
      success: true,
      city: city,
      hotels: hotels,
      hotel_ids: hotelIdMap,
      selected_hotel_index: selectedHotelIndex,
      selected_hotel_id: selectedHotelId
    });
  } catch (error) {
    console.error('Error loading hotels for city:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while loading hotels',
      error: error.message
    });
  }
});

export default router;

