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

export default router;

