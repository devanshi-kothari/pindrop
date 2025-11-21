// backend/routes/images.js
import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const GOOGLE_CUSTOM_SEARCH_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const GOOGLE_CUSTOM_SEARCH_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX || '80b87ce61302c4f86';

async function fetchImageFromGoogle(destination) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY) {
    console.warn('GOOGLE_CUSTOM_SEARCH_API_KEY is not set. Unable to fetch destination images.');
    return null;
  }

  const query = `${destination} travel landscape photography`;

  const params = new URLSearchParams({
    key: GOOGLE_CUSTOM_SEARCH_API_KEY,
    cx: GOOGLE_CUSTOM_SEARCH_CX,
    q: query,
    searchType: 'image',
    num: '1',
    safe: 'active',
    imgType: 'photo',
  });

  const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    console.error('Google Custom Search API error:', response.status, text);
    return null;
  }

  const data = await response.json();
  const firstItem = Array.isArray(data.items) && data.items.length > 0 ? data.items[0] : null;

  if (!firstItem) {
    return null;
  }

  // Prefer the thumbnail link (more reliably an actual image URL), then fall back to main link
  return (firstItem.image && firstItem.image.thumbnailLink) || firstItem.link || null;
}

// Get image URL for a destination using Google Custom Search JSON API
router.get('/destination', async (req, res) => {
  try {
    const { destination } = req.query;

    if (!destination) {
      return res.status(400).json({
        success: false,
        message: 'Destination parameter is required'
      });
    }

    try {
      const imageUrl = await fetchImageFromGoogle(destination);

      if (!imageUrl) {
        return res.status(200).json({
          success: true,
          imageUrl: null,
          message: 'No image found for this destination.',
        });
      }

      res.status(200).json({
        success: true,
        imageUrl,
      });
    } catch (error) {
      console.error('Error calling Google Custom Search API:', error);
      // Graceful fallback without using Unsplash
      res.status(200).json({
        success: true,
        imageUrl: null,
        message: 'Unable to fetch image at this time.',
      });
    }
  } catch (error) {
    console.error('Error fetching destination image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch destination image',
      error: error.message
    });
  }
});

export default router;

