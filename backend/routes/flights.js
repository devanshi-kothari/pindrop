// backend/routes/flights.js
import express from 'express';
import fetch from 'node-fetch';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Search for flights using SerpAPI Google Flights
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { departure_id, arrival_id, outbound_date, return_date } = req.query;

    // Validate required parameters
    if (!departure_id || !arrival_id || !outbound_date || !return_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: departure_id, arrival_id, outbound_date, return_date'
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
      return_date: return_date,
      type: '1', // Round trip
      currency: 'USD'
    });

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

export default router;

