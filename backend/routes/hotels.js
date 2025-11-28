// backend/routes/hotels.js
import express from 'express';
import fetch from 'node-fetch';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

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
router.get('/details', authenticateToken, async (req, res) => {
  try {
    const { serpapi_link } = req.query;

    // Validate required parameters
    if (!serpapi_link) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: serpapi_link'
      });
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

    res.status(200).json({
      success: true,
      property: data
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

export default router;

