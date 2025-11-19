// backend/routes/trips.js
import express from 'express';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all trips for user, optionally filtered by status
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query; // 'draft', 'planned', 'archived'

    let query = supabase
      .from('trip')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('trip_status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      trips: data || []
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trips',
      error: error.message
    });
  }
});

// Get single trip by ID
router.get('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const { data, error } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Trip not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      trip: data
    });
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip',
      error: error.message
    });
  }
});

// Create new trip
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      destination,
      start_date,
      end_date,
      total_budget,
      num_travelers,
      image_url,
    } = req.body;

    const tripData = {
      user_id: userId,
      title: title || (destination ? `Trip to ${destination}` : 'My Trip'),
      trip_status: 'draft',
      num_travelers: num_travelers || 1,
      ...(destination && { destination }),
      ...(start_date && { start_date }),
      ...(end_date && { end_date }),
      ...(total_budget !== undefined &&
        total_budget !== null && {
          total_budget: parseFloat(total_budget),
        }),
      ...(image_url && { image_url }),
    };

    const { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      success: true,
      trip: data,
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create trip',
      error: error.message,
    });
  }
});

// Update trip
router.put('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const { title, destination, start_date, end_date, total_budget, num_travelers, trip_status, image_url } = req.body;

    // First verify the trip belongs to the user
    const { data: existingTrip, error: checkError } = await supabase
      .from('trip')
      .select('trip_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (destination !== undefined) updateData.destination = destination;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (total_budget !== undefined) updateData.total_budget = total_budget ? parseFloat(total_budget) : null;
    if (num_travelers !== undefined) updateData.num_travelers = num_travelers;
    if (trip_status !== undefined) updateData.trip_status = trip_status;
    if (image_url !== undefined) updateData.image_url = image_url;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('trip')
      .update(updateData)
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      trip: data
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update trip',
      error: error.message
    });
  }
});

// Delete trip
router.delete('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const { error } = await supabase
      .from('trip')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete trip',
      error: error.message
    });
  }
});

export default router;

