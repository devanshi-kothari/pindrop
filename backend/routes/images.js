// backend/routes/images.js
import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// Get image URL for a destination using Unsplash API
// Note: For production, you should use an Unsplash API key
// For now, we'll use Unsplash's public endpoint
router.get('/destination', async (req, res) => {
  try {
    const { destination } = req.query;

    if (!destination) {
      return res.status(400).json({
        success: false,
        message: 'Destination parameter is required'
      });
    }

    // Use Unsplash API to get a random image for the destination
    // Note: This is a public endpoint with rate limits
    // For production, register at https://unsplash.com/developers and use your access key
    const unsplashUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(destination)}&orientation=landscape&client_id=YOUR_UNSPLASH_ACCESS_KEY`;

    try {
      // For now, use a simple placeholder service or Unsplash Source API
      // Unsplash Source API doesn't require authentication
      const imageUrl = `https://source.unsplash.com/800x450/?${encodeURIComponent(destination)},travel`;

      // Alternative: Use a more reliable service like Lorem Picsum with destination tag
      // For production, use the Unsplash API with proper authentication
      res.status(200).json({
        success: true,
        imageUrl: imageUrl
      });
    } catch (error) {
      // Fallback to a placeholder image service
      const fallbackUrl = `https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80`;

      res.status(200).json({
        success: true,
        imageUrl: fallbackUrl
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

