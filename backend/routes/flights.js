// backend/routes/flights.js
import express from 'express';
import fetch from 'node-fetch';
import { authenticateToken } from '../middleware/auth.js';
import supabase from '../supabaseClient.js';

const router = express.Router();

// Search for flights using SerpAPI Google Flights
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { departure_id, arrival_id, outbound_date, return_date, type } = req.query;
    const flightType = type || '1'; // Default to round trip if not specified

    // Validate required parameters
    if (!departure_id || !arrival_id || !outbound_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: departure_id, arrival_id, outbound_date'
      });
    }

    // Only require return_date for round trip flights
    if (flightType === '1' && !return_date) {
      return res.status(400).json({
        success: false,
        message: 'return_date is required for round trip flights'
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
      engine: 'google_flights',
      api_key: SERPAPI_KEY,
      departure_id: departure_id,
      arrival_id: arrival_id,
      outbound_date: outbound_date,
      currency: 'USD'
    });

    // Set type: 2 for one-way, 1 for round trip
    if (flightType === '0') {
      params.append('type', '2'); // One-way flight
    } else {
      params.append('type', '1'); // Round trip
      if (return_date) {
        params.append('return_date', return_date);
      }
    }

    const serpApiUrl = `https://serpapi.com/search?${params.toString()}`;
    console.log('Calling SerpAPI:', serpApiUrl.replace(SERPAPI_KEY, '***'));

    // Fetch from SerpAPI
    const response = await fetch(serpApiUrl);
    const data = await response.json();

    console.log('SerpAPI response status:', response.status);
    console.log('SerpAPI response keys:', Object.keys(data));

    if (!response.ok) {
      console.error('SerpAPI error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error || 'Failed to fetch flight data from SerpAPI',
        error: data
      });
    }

    // Extract best_flights array (may not always be present)
    const bestFlights = data.best_flights || [];
    const otherFlights = data.other_flights || [];

    console.log(`Found ${bestFlights.length} best flights and ${otherFlights.length} other flights`);
    
    // Log structure of first flight to understand return flight format
    if (bestFlights.length > 0) {
      console.log('First flight option structure:', JSON.stringify(bestFlights[0], null, 2));
      console.log('First flight option keys:', Object.keys(bestFlights[0]));
      if (bestFlights[0].flights) {
        console.log('Outbound flights count:', bestFlights[0].flights.length);
      }
      if (bestFlights[0].return_flights) {
        console.log('Return flights found:', bestFlights[0].return_flights.length);
      }
      if (bestFlights[0].return) {
        console.log('Return object found:', Object.keys(bestFlights[0].return));
      }
      if (bestFlights[0].departure_token) {
        console.log('Departure token found:', bestFlights[0].departure_token);
      }
    }

    res.status(200).json({
      success: true,
      best_flights: bestFlights,
      other_flights: otherFlights,
      raw_data: data // Include raw data for debugging
    });
  } catch (error) {
    console.error('Error fetching flights:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching flights',
      error: error.message
    });
  }
});

// Get return flights using departure_token
router.get('/return', authenticateToken, async (req, res) => {
  try {
    const { departure_id, arrival_id, outbound_date, return_date, departure_token } = req.query;

    // Validate required parameters
    if (!departure_id || !arrival_id || !outbound_date || !return_date || !departure_token) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: departure_id, arrival_id, outbound_date, return_date, departure_token'
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

    // Build the SerpAPI URL with departure_token
    // Keep same departure_id and arrival_id - SerpAPI uses departure_token to identify return flights
    const params = new URLSearchParams({
      engine: 'google_flights',
      api_key: SERPAPI_KEY,
      departure_id: departure_id,
      arrival_id: arrival_id,
      outbound_date: outbound_date,
      return_date: return_date,
      type: '1', // Round trip
      departure_token: departure_token, // Key parameter for return flights
      currency: 'USD'
    });

    const serpApiUrl = `https://serpapi.com/search?${params.toString()}`;
    console.log('Calling SerpAPI for return flights:', serpApiUrl.replace(SERPAPI_KEY, '***'));

    // Fetch from SerpAPI
    const response = await fetch(serpApiUrl);
    const data = await response.json();

    console.log('SerpAPI return response status:', response.status);

    if (!response.ok) {
      console.error('SerpAPI error:', data);
      return res.status(response.status).json({
        success: false,
        message: data.error || 'Failed to fetch return flight data from SerpAPI',
        error: data
      });
    }

    // Extract best_flights array for return flights
    const bestFlights = data.best_flights || [];
    const otherFlights = data.other_flights || [];

    console.log(`Found ${bestFlights.length} best return flights and ${otherFlights.length} other return flights`);

    res.status(200).json({
      success: true,
      best_flights: bestFlights,
      other_flights: otherFlights
    });
  } catch (error) {
    console.error('Error fetching return flights:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching return flights',
      error: error.message
    });
  }
});

// Save outbound flights to database
// This endpoint is called after the flight search API returns results.
// It saves each flight option to:
// 1. The 'flight' table (individual flight records)
// 2. The 'trip_flight' table (associates flights with trips)
router.post('/save-outbound', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { trip_id, flights, search_params } = req.body;

    if (!trip_id || !Array.isArray(flights) || flights.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: trip_id and flights array'
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

    const savedFlightIds = [];
    const searchParamsObj = search_params || {};

    console.log(`Starting to save ${flights.length} outbound flight options to database for trip ${trip_id}`);

    // Save each flight option
    for (let i = 0; i < flights.length; i++) {
      const flightOption = flights[i];
      console.log(`Processing flight option ${i + 1} of ${flights.length}`);
      // Extract known fields from flight option
      const knownFields = {
        price: flightOption.price,
        departure_token: flightOption.departure_token,
        total_duration: flightOption.total_duration,
        flights: flightOption.flights,
        layovers: flightOption.layovers
      };

      // Store any additional fields that aren't in our schema columns
      const additionalData = { ...flightOption };
      // Remove fields we're storing in columns
      delete additionalData.price;
      delete additionalData.departure_token;
      delete additionalData.total_duration;
      delete additionalData.flights;
      delete additionalData.layovers;

      // Extract data from flight option
      const flightData = {
        flight_type: 'outbound',
        price: knownFields.price ? parseFloat(knownFields.price) : null,
        departure_token: knownFields.departure_token || null,
        total_duration: knownFields.total_duration || null,
        flights: knownFields.flights || null,
        layovers: knownFields.layovers || null,
        additional_data: Object.keys(additionalData).length > 0 ? additionalData : {},
        departure_id: searchParamsObj.departure_id || null,
        arrival_id: searchParamsObj.arrival_id || null,
        outbound_date: searchParamsObj.outbound_date ? new Date(searchParamsObj.outbound_date).toISOString().split('T')[0] : null,
        return_date: searchParamsObj.return_date ? new Date(searchParamsObj.return_date).toISOString().split('T')[0] : null,
        currency: searchParamsObj.currency || 'USD',
        additional_search_params: searchParamsObj.additional_search_params || {}
      };

      console.log(`Saving outbound flight option with price: ${flightData.price}, departure_token: ${flightData.departure_token}`);

      // Insert flight into flight table
      const { data: flight, error: flightError } = await supabase
        .from('flight')
        .insert([flightData])
        .select('flight_id')
        .single();

      if (flightError) {
        console.error('Error inserting flight into flight table:', flightError);
        console.error('Flight data that failed:', JSON.stringify(flightData, null, 2));
        continue; // Skip this flight but continue with others
      }

      if (flight?.flight_id) {
        savedFlightIds.push(flight.flight_id);
        console.log(`Successfully saved flight ${i + 1} to flight table with flight_id: ${flight.flight_id}`);

        // Associate flight with trip in trip_flight table
        // Use upsert to handle duplicates (if flight already associated with trip)
        const { error: tripFlightError } = await supabase
          .from('trip_flight')
          .upsert([{
            trip_id: trip_id,
            flight_id: flight.flight_id,
            is_selected: false
          }], {
            onConflict: 'trip_id,flight_id'
          });

        if (tripFlightError) {
          console.error(`Error associating flight ${i + 1} with trip in trip_flight table:`, tripFlightError);
          console.error('trip_id:', trip_id, 'flight_id:', flight.flight_id);
        } else {
          console.log(`Successfully associated flight ${i + 1} (flight_id: ${flight.flight_id}) with trip ${trip_id} in trip_flight table`);
        }
      } else {
        console.error(`Flight ${i + 1} was inserted but no flight_id was returned`);
      }
    }

    console.log(`Completed saving flights. Successfully saved ${savedFlightIds.length} out of ${flights.length} flight options`);

    res.status(200).json({
      success: true,
      message: `Saved ${savedFlightIds.length} outbound flights`,
      flight_ids: savedFlightIds,
      total_flights: flights.length,
      saved_count: savedFlightIds.length
    });
  } catch (error) {
    console.error('Error saving outbound flights:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving outbound flights',
      error: error.message
    });
  }
});

// Save return flights to database and create mappings
router.post('/save-return', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { trip_id, departing_flight_id, departure_token, flights, search_params } = req.body;

    if (!trip_id || !Array.isArray(flights) || flights.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: trip_id and flights array'
      });
    }

    if (!departing_flight_id && !departure_token) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: either departing_flight_id or departure_token'
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

    // Find departing flight by ID or departure_token
    let departingFlight = null;
    if (departing_flight_id) {
      const { data, error } = await supabase
        .from('flight')
        .select('flight_id, flight_type')
        .eq('flight_id', departing_flight_id)
        .single();
      
      if (!error && data) {
        departingFlight = data;
      }
    } else if (departure_token) {
      // Look up flight by departure_token - find the one associated with this trip
      const { data: tripFlights, error: tripFlightError } = await supabase
        .from('trip_flight')
        .select('flight_id, flight:flight(flight_id, flight_type, departure_token)')
        .eq('trip_id', trip_id);

      if (!tripFlightError && tripFlights) {
        // Find the flight with matching departure_token
        for (const tf of tripFlights) {
          if (tf.flight && tf.flight.departure_token === departure_token && tf.flight.flight_type === 'outbound') {
            departingFlight = {
              flight_id: tf.flight.flight_id,
              flight_type: tf.flight.flight_type
            };
            break;
          }
        }
      }
    }

    if (!departingFlight) {
      return res.status(404).json({
        success: false,
        message: 'Departing flight not found'
      });
    }

    if (departingFlight.flight_type !== 'outbound') {
      return res.status(400).json({
        success: false,
        message: 'Departing flight must be an outbound flight'
      });
    }

    const finalDepartingFlightId = departingFlight.flight_id;

    const savedFlightIds = [];
    const searchParamsObj = search_params || {};

    // Save each return flight option
    for (const flightOption of flights) {
      const flightData = {
        flight_type: 'return',
        price: flightOption.price ? parseFloat(flightOption.price) : null,
        departure_token: null, // Return flights don't have departure_token
        total_duration: flightOption.total_duration || null,
        flights: flightOption.flights || null,
        layovers: flightOption.layovers || null,
        additional_data: flightOption.additional_data || {},
        departure_id: searchParamsObj.arrival_id || null, // Return flight departs from arrival location
        arrival_id: searchParamsObj.departure_id || null, // Return flight arrives at departure location
        outbound_date: searchParamsObj.outbound_date ? new Date(searchParamsObj.outbound_date).toISOString().split('T')[0] : null,
        return_date: searchParamsObj.return_date ? new Date(searchParamsObj.return_date).toISOString().split('T')[0] : null,
        currency: searchParamsObj.currency || 'USD',
        additional_search_params: searchParamsObj.additional_search_params || {}
      };

      // Insert return flight
      const { data: flight, error: flightError } = await supabase
        .from('flight')
        .insert([flightData])
        .select('flight_id')
        .single();

      if (flightError) {
        console.error('Error inserting return flight:', flightError);
        continue;
      }

      if (flight?.flight_id) {
        savedFlightIds.push(flight.flight_id);

        // Associate return flight with trip
        // Use upsert to handle duplicates (if flight already associated with trip)
        const { error: tripFlightError } = await supabase
          .from('trip_flight')
          .upsert([{
            trip_id: trip_id,
            flight_id: flight.flight_id,
            is_selected: false
          }], {
            onConflict: 'trip_id,flight_id'
          });

        if (tripFlightError) {
          console.error('Error associating return flight with trip:', tripFlightError);
        }

        // Create mapping between departing flight and return flight
        // Use upsert to handle duplicates
        const { error: mappingError } = await supabase
          .from('flight_return_mapping')
          .upsert([{
            trip_id: trip_id,
            departing_flight_id: finalDepartingFlightId,
            return_flight_id: flight.flight_id
          }], {
            onConflict: 'trip_id,departing_flight_id,return_flight_id'
          });

        if (mappingError) {
          console.error('Error creating flight return mapping:', mappingError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Saved ${savedFlightIds.length} return flights`,
      flight_ids: savedFlightIds
    });
  } catch (error) {
    console.error('Error saving return flights:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving return flights',
      error: error.message
    });
  }
});

// Update flight selection status
router.put('/select', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { trip_id, flight_id, is_selected } = req.body;

    if (!trip_id || !flight_id || typeof is_selected !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: trip_id, flight_id, and is_selected'
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

    // Get flight type to ensure only one selected per type
    const { data: flight, error: flightError } = await supabase
      .from('flight')
      .select('flight_type')
      .eq('flight_id', flight_id)
      .single();

    if (flightError || !flight) {
      return res.status(404).json({
        success: false,
        message: 'Flight not found'
      });
    }

    // If selecting this flight, unselect other flights of the same type for this trip
    // Additionally, if selecting an outbound flight, unselect any return flights
    if (is_selected) {
      console.log(`Selecting flight ${flight_id} of type ${flight.flight_type} for trip ${trip_id}`);
      
      // First, get all currently selected flights for this trip
      const { data: selectedFlights, error: selectedError } = await supabase
        .from('trip_flight')
        .select('flight_id')
        .eq('trip_id', trip_id)
        .eq('is_selected', true);

      if (selectedError) {
        console.error('Error fetching selected flights:', selectedError);
      } else if (selectedFlights && selectedFlights.length > 0) {
        // Get flight types for all selected flights
        const selectedFlightIds = selectedFlights.map(tf => tf.flight_id);
        const { data: flightTypes, error: flightTypesError } = await supabase
          .from('flight')
          .select('flight_id, flight_type')
          .in('flight_id', selectedFlightIds);

        if (!flightTypesError && flightTypes) {
          // Find flights that need to be unselected:
          // 1. Flights of the same type (to ensure only one outbound OR one return is selected)
          // 2. If selecting an outbound flight, also unselect any return flights
          const flightsToUnselect = flightTypes
            .filter(f => {
              // Unselect if same type and different flight
              if (f.flight_type === flight.flight_type && f.flight_id !== flight_id) {
                return true;
              }
              // If selecting outbound, also unselect any return flights
              if (flight.flight_type === 'outbound' && f.flight_type === 'return') {
                return true;
              }
              return false;
            })
            .map(f => f.flight_id);

          if (flightsToUnselect.length > 0) {
            console.log(`Unselecting ${flightsToUnselect.length} flight(s):`, flightsToUnselect);
            if (flight.flight_type === 'outbound') {
              console.log('  - Unselecting because a new outbound flight was selected (this will also clear any return flight selection)');
            }
            const { error: unselectError } = await supabase
              .from('trip_flight')
              .update({ 
                is_selected: false, 
                updated_at: new Date().toISOString() 
              })
              .eq('trip_id', trip_id)
              .in('flight_id', flightsToUnselect);

            if (unselectError) {
              console.error('Error unselecting flights:', unselectError);
            } else {
              console.log(`Successfully unselected ${flightsToUnselect.length} flight(s)`);
            }
          }
        }
      }
    }

    // Update the selected flight in trip_flight table
    const { error: updateError } = await supabase
      .from('trip_flight')
      .update({
        is_selected: is_selected,
        updated_at: new Date().toISOString()
      })
      .eq('trip_id', trip_id)
      .eq('flight_id', flight_id);

    if (updateError) {
      console.error('Error updating flight selection in trip_flight:', updateError);
      throw updateError;
    }

    console.log(`Successfully ${is_selected ? 'selected' : 'unselected'} flight ${flight_id} for trip ${trip_id}`);

    res.status(200).json({
      success: true,
      message: `Flight selection ${is_selected ? 'updated' : 'cleared'}`,
      flight_id: flight_id,
      is_selected: is_selected
    });
  } catch (error) {
    console.error('Error updating flight selection:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating flight selection',
      error: error.message
    });
  }
});

// Load all flights for a trip (for restoring state when user returns)
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

    // Get all flights associated with this trip
    const { data: tripFlights, error: tripFlightsError } = await supabase
      .from('trip_flight')
      .select(`
        flight_id,
        is_selected,
        flight:flight(*)
      `)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (tripFlightsError) {
      throw tripFlightsError;
    }

    // Separate outbound and return flights
    const outboundFlights = [];
    const returnFlights = [];
    const outboundFlightIdMap = {}; // Map original index to flight_id
    const returnFlightIdMap = {};
    let outboundIndex = 0;
    let returnIndex = 0;
    let selectedOutboundFlightId = null;
    let selectedReturnFlightId = null;

    tripFlights?.forEach((tf) => {
      if (tf.flight && tf.flight.flight_type === 'outbound') {
        // Reconstruct flight option from database columns
        // Start with additional_data first, then override with explicit columns
        // This ensures departure_token from the column takes precedence
        const additionalData = tf.flight.additional_data || {};
        // Remove any conflicting fields from additional_data to avoid overwriting column values
        const cleanedAdditionalData = { ...additionalData };
        delete cleanedAdditionalData.price;
        delete cleanedAdditionalData.departure_token;
        delete cleanedAdditionalData.total_duration;
        delete cleanedAdditionalData.flights;
        delete cleanedAdditionalData.layovers;
        
        const flightOption = {
          ...cleanedAdditionalData,
          // Explicit columns override anything from additional_data
          price: tf.flight.price,
          departure_token: tf.flight.departure_token, // This must come from the column, not additional_data
          total_duration: tf.flight.total_duration,
          flights: tf.flight.flights,
          layovers: tf.flight.layovers
        };
        console.log(`Reconstructed outbound flight ${outboundIndex}:`, {
          flight_id: tf.flight_id,
          has_departure_token: !!flightOption.departure_token,
          departure_token: flightOption.departure_token,
          price: flightOption.price,
          departure_token_from_column: tf.flight.departure_token,
          departure_token_in_additional: additionalData.departure_token
        });
        outboundFlights.push(flightOption);
        outboundFlightIdMap[outboundIndex] = tf.flight_id;
        if (tf.is_selected) {
          selectedOutboundFlightId = tf.flight_id;
        }
        outboundIndex++;
      } else if (tf.flight && tf.flight.flight_type === 'return') {
        // Reconstruct return flight option from database columns
        const flightOption = {
          price: tf.flight.price,
          total_duration: tf.flight.total_duration,
          flights: tf.flight.flights,
          layovers: tf.flight.layovers,
          ...(tf.flight.additional_data || {})
        };
        returnFlights.push(flightOption);
        returnFlightIdMap[returnIndex] = tf.flight_id;
        if (tf.is_selected) {
          selectedReturnFlightId = tf.flight_id;
        }
        returnIndex++;
      }
    });

    // Find selected indices
    let selectedOutboundIndex = null;
    let selectedReturnIndex = null;

    if (selectedOutboundFlightId) {
      Object.entries(outboundFlightIdMap).forEach(([index, flightId]) => {
        if (flightId === selectedOutboundFlightId) {
          selectedOutboundIndex = parseInt(index);
        }
      });
    }

    if (selectedReturnFlightId) {
      Object.entries(returnFlightIdMap).forEach(([index, flightId]) => {
        if (flightId === selectedReturnFlightId) {
          selectedReturnIndex = parseInt(index);
        }
      });
    }

    // Get return flight mappings to know which return flights belong to which outbound flight
    const { data: returnMappings, error: mappingsError } = await supabase
      .from('flight_return_mapping')
      .select('departing_flight_id, return_flight_id')
      .eq('trip_id', tripId);

    const returnFlightMappings = {}; // Map departing_flight_id to return_flight_ids
    returnMappings?.forEach((mapping) => {
      if (!returnFlightMappings[mapping.departing_flight_id]) {
        returnFlightMappings[mapping.departing_flight_id] = [];
      }
      returnFlightMappings[mapping.departing_flight_id].push(mapping.return_flight_id);
    });

    // Filter return flights to only show those mapped to the selected departing flight
    let filteredReturnFlights = [];
    let filteredReturnFlightIds = {};
    let filteredSelectedReturnIndex = null;

    if (selectedOutboundFlightId && returnFlightMappings[selectedOutboundFlightId]) {
      // Only include return flights that are mapped to the selected departing flight
      const mappedReturnFlightIds = returnFlightMappings[selectedOutboundFlightId];
      let filteredIndex = 0;
      
      // Iterate through return flights using the returnFlightIdMap to get flight_ids
      Object.entries(returnFlightIdMap).forEach(([originalIndexStr, returnFlightId]) => {
        const originalIndex = parseInt(originalIndexStr);
        // Check if this return flight is mapped to the selected departing flight
        if (mappedReturnFlightIds.includes(returnFlightId) && returnFlights[originalIndex]) {
          filteredReturnFlights.push(returnFlights[originalIndex]);
          filteredReturnFlightIds[filteredIndex] = returnFlightId;
          if (returnFlightId === selectedReturnFlightId) {
            filteredSelectedReturnIndex = filteredIndex;
          }
          filteredIndex++;
        }
      });
    }
    // If no selected departing flight, filteredReturnFlights will be empty array

    // Extract departure_id and arrival_id from the first outbound flight (they should be the same for all flights)
    let departureId = null;
    let arrivalId = null;
    if (outboundFlights.length > 0) {
      // Get from the first flight's stored data
      const firstFlightData = tripFlights?.find(tf => tf.flight && tf.flight.flight_type === 'outbound');
      if (firstFlightData?.flight) {
        departureId = firstFlightData.flight.departure_id;
        arrivalId = firstFlightData.flight.arrival_id;
      }
    }

    res.status(200).json({
      success: true,
      outbound_flights: outboundFlights,
      return_flights: filteredReturnFlights.length > 0 ? filteredReturnFlights : returnFlights, // Use filtered if available
      outbound_flight_ids: outboundFlightIdMap,
      return_flight_ids: Object.keys(filteredReturnFlightIds).length > 0 ? filteredReturnFlightIds : returnFlightIdMap, // Use filtered if available
      selected_outbound_index: selectedOutboundIndex,
      selected_return_index: filteredSelectedReturnIndex !== null ? filteredSelectedReturnIndex : selectedReturnIndex,
      return_flight_mappings: returnFlightMappings,
      departure_id: departureId, // Airport code for departure location
      arrival_id: arrivalId // Airport code for arrival location
    });
  } catch (error) {
    console.error('Error loading flights for trip:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while loading flights',
      error: error.message
    });
  }
});

export default router;

