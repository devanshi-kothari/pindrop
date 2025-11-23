// backend/routes/trips.js
import express from 'express';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { saveMessage, extractTripInfo, fetchDestinationImage } from './chat.js';

const router = express.Router();

// Initialize Groq client (OpenAI-compatible API) for itinerary generation
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const GOOGLE_CUSTOM_SEARCH_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const GOOGLE_CUSTOM_SEARCH_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX;

async function generateTripTitleFromMessage(message) {
  if (!message || typeof message !== 'string') return null;
  try {
    const completion = await groqClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise travel assistant. Given a user message about a trip they want to plan, respond ONLY with a short, human-friendly trip title in at most 6 words. Do not include quotes or extra commentary. Never invent a destination or country that the user did not explicitly mention. If the user does not clearly name a specific place, keep the title generic (for example, "Spring Break Trip", "Summer Road Trip with Friends"). Only include a city, region, or country name in the title if it appears clearly in the user message.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.4,
      max_tokens: 32,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const cleaned = String(raw).trim().replace(/^["'\s]+|["'\s]+$/g, '');
    return cleaned || null;
  } catch (error) {
    console.error('Error generating trip title from message:', error);
    return null;
  }
}

function normalizeDestinationName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchActivitySearchResults(query, num = 5) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    console.warn('Google Custom Search API env vars are not set. Activity generation will be disabled.');
    return [];
  }

  const params = new URLSearchParams({
    key: GOOGLE_CUSTOM_SEARCH_API_KEY,
    cx: GOOGLE_CUSTOM_SEARCH_CX,
    q: query,
    num: String(num),
    safe: 'active',
  });

  const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    console.error('Google Custom Search API error (activities):', response.status, text);
    return [];
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) {
    return [];
  }

  return data.items;
}

async function upsertReusableActivityFromSearchItem(item, destination) {
  const name = item.title || 'Activity';
  const location = destination || null;
  const snippet = item.snippet || '';
  const link = item.link || '';

  // Use a simple heuristic to infer a high-level category from text
  const lower = `${name} ${snippet}`.toLowerCase();
  let category = 'other';
  if (/\bmuseum|\bart\b/.test(lower)) category = 'museums';
  else if (/\bhike|\btrail|\bpark|\bnational park\b|\bnature\b/.test(lower)) category = 'outdoors';
  else if (/\bfood|\brestaurant|\bcafe\b|\bbar\b|\bcoffee\b/.test(lower)) category = 'food';
  else if (/\bnightlife|\bclub\b|\bbar\b/.test(lower)) category = 'nightlife';
  else if (/\bshopping|\bmarket\b|\bmall\b/.test(lower)) category = 'shopping';
  else if (/\bconcert|\bmusic\b|\blive music\b/.test(lower)) category = 'music';

  const tags = [];
  if (category !== 'other') {
    tags.push(category);
  }
  if (destination) {
    tags.push(destination);
  }
  if (link) {
    tags.push('web');
  }

  // Try to find an existing reusable activity with the same name/location/source
  const { data: existing, error: existingError } = await supabase
    .from('activity')
    .select('*')
    .eq('name', name)
    .eq('location', location)
    .eq('source', 'google-search')
    .maybeSingle();

  if (existingError) {
    console.error('Error checking for existing activity:', existingError);
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('activity')
    .insert([
      {
        name,
        location,
        category,
        duration: null,
        cost_estimate: null,
        rating: null,
        tags,
        source: 'google-search',
        source_url: link || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error inserting activity from search:', error);
    throw error;
  }

  return data;
}

// Get all trips for user, optionally filtered by status
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query; // 'draft', 'planned', 'archived'

    let query = supabase
      .from('trip')
      .select(
        `
        *,
        trip_preference (
          start_date,
          end_date
        )
      `
      )
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
      raw_message,
      raw_title_message,
    } = req.body;

    // If destination is not explicitly provided but we have a free-form
    // description of the trip, reuse the same extraction logic as the
    // chat flow to infer destination/dates/budget and name the trip
    // accordingly (ex. "Trip to Brazil").
    let extractedInfo = null;
    if (!destination && raw_message && typeof raw_message === 'string') {
      try {
        extractedInfo = await extractTripInfo(raw_message);
      } catch (extractionError) {
        console.error('Error extracting trip info from raw_message:', extractionError);
      }
    }

    const rawDestination = destination || extractedInfo?.destination || null;
    const finalDestination = rawDestination ? normalizeDestinationName(rawDestination) : null;
    const finalStartDate = start_date || extractedInfo?.start_date || null;
    const finalEndDate = end_date || extractedInfo?.end_date || null;
    const finalNumTravelers =
      num_travelers ||
      (extractedInfo?.num_travelers !== null && extractedInfo?.num_travelers !== undefined
        ? extractedInfo.num_travelers
        : 1);
    const finalTotalBudget =
      total_budget !== undefined && total_budget !== null
        ? total_budget
        : extractedInfo?.total_budget ?? null;

    // If no image_url provided but we have a destination, try to fetch
    // a representative travel photo using Google Custom Search (same
    // logic as chat-created trips).
    let finalImageUrl = image_url || null;
    if (!finalImageUrl && finalDestination) {
      try {
        finalImageUrl = await fetchDestinationImage(finalDestination);
      } catch (imageError) {
        console.error('Error fetching destination image (trips):', imageError);
      }
    }

    let generatedTitle = null;
    if (!title && raw_title_message && typeof raw_title_message === 'string') {
      generatedTitle = await generateTripTitleFromMessage(raw_title_message);
    }

    const tripData = {
      user_id: userId,
      title: title || generatedTitle || (finalDestination ? `Trip to ${finalDestination}` : 'My Trip'),
      trip_status: 'draft',
      ...(finalDestination && { destination: finalDestination }),
      ...(finalImageUrl && { image_url: finalImageUrl }),
    };

    const { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Seed trip_preference with any structured fields we extracted or received
    if (data?.trip_id && (finalStartDate || finalEndDate)) {
      const preferenceData = {
        trip_id: data.trip_id,
        start_date: finalStartDate,
        end_date: finalEndDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: prefError } = await supabase
        .from('trip_preference')
        .insert([preferenceData]);

      if (prefError) {
        console.error('Error seeding trip_preference for new trip:', prefError);
      }
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
    const { title, destination, trip_status, image_url } = req.body;

    // First verify the trip belongs to the user
    const { data: existingTrip, error: checkError } = await supabase
      .from('trip')
      .select('trip_id, user_id, destination, image_url')
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

    // If a title is explicitly provided, respect it.
    if (title !== undefined) {
      updateData.title = title;
    }

    // Normalize destination capitalization, and if no explicit title was sent
    // but we now have a destination, automatically set "Trip to {Destination}".
    if (destination !== undefined) {
      const finalDestination = normalizeDestinationName(destination);
      updateData.destination = finalDestination;
      if (finalDestination && title === undefined) {
        updateData.title = `Trip to ${finalDestination}`;
      }

      // If we didn't explicitly get an image_url in this request and the trip
      // doesn't already have one, try to fetch a representative destination image.
      if ((image_url === undefined || image_url === null) && !existingTrip.image_url && finalDestination) {
        try {
          const fetchedImage = await fetchDestinationImage(finalDestination);
          if (fetchedImage) {
            updateData.image_url = fetchedImage;
          }
        } catch (err) {
          console.error('Error fetching destination image on trip update:', err);
        }
      }
    }

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

// Get trip-specific preferences
router.get('/:tripId/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: preferences, error } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preferences: preferences || null,
    });
  } catch (error) {
    console.error('Error fetching trip preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip preferences',
      error: error.message,
    });
  }
});

// Create or update trip-specific preferences
router.put('/:tripId/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const {
      num_days,
      start_date,
      end_date,
      min_budget,
      max_budget,
      pace,
      accommodation_type,
      activity_categories,
      avoid_activity_categories,
      group_type,
      safety_notes,
      accessibility_notes,
      custom_requests,
    } = req.body;

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: existingPreference, error: prefError } = await supabase
      .from('trip_preference')
      .select('trip_preference_id')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    const preferenceData = {
      trip_id: tripId,
      updated_at: new Date().toISOString(),
    };

    if (num_days !== undefined) preferenceData.num_days = num_days;
    if (start_date !== undefined) preferenceData.start_date = start_date;
    if (end_date !== undefined) preferenceData.end_date = end_date;

    // If the request explicitly includes both dates, treat them as the
    // source of truth and derive num_days from the range. This avoids
    // conflicts between a manually entered "rough number of days" and
    // the actual dates.
    if (start_date !== undefined && end_date !== undefined && start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start_date or end_date. Please provide valid ISO date strings (YYYY-MM-DD).',
        });
      }

      if (end < start) {
        return res.status(400).json({
          success: false,
          message: 'end_date must be on or after start_date.',
        });
      }

      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      preferenceData.num_days = diffDays;
    }

    if (min_budget !== undefined && min_budget !== null) {
      preferenceData.min_budget = parseFloat(min_budget);
    }
    if (max_budget !== undefined && max_budget !== null) {
      preferenceData.max_budget = parseFloat(max_budget);
    }
    if (pace !== undefined) preferenceData.pace = pace;
    if (accommodation_type !== undefined) preferenceData.accommodation_type = accommodation_type;
    if (activity_categories !== undefined) preferenceData.activity_categories = activity_categories;
    if (avoid_activity_categories !== undefined)
      preferenceData.avoid_activity_categories = avoid_activity_categories;
    if (group_type !== undefined) preferenceData.group_type = group_type;
    if (safety_notes !== undefined) preferenceData.safety_notes = safety_notes;
    if (accessibility_notes !== undefined) preferenceData.accessibility_notes = accessibility_notes;
    if (custom_requests !== undefined) preferenceData.custom_requests = custom_requests;

    let result;

    if (existingPreference) {
      result = await supabase
        .from('trip_preference')
        .update(preferenceData)
        .eq('trip_id', tripId)
        .select()
        .single();
    } else {
      preferenceData.created_at = new Date().toISOString();
      result = await supabase.from('trip_preference').insert([preferenceData]).select().single();
    }

    const { data, error } = result;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preferences: data,
    });
  } catch (error) {
    console.error('Error saving trip preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save trip preferences',
      error: error.message,
    });
  }
});

// Phase 3: Generate a small, reusable catalog of activities for this trip
// using Google Custom Search, and attach them to the trip with a pending
// preference so the user can swipe to like / dislike.
router.post('/:tripId/generate-activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    if (!trip.destination) {
      return res.status(400).json({
        success: false,
        message: 'Destination is required before generating activities.',
      });
    }

    // Load user profile & trip preferences to enrich the search query
    const { data: userProfile } = await supabase
      .from('app_user')
      .select('budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: tripPreferences } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    const likedTags = Array.isArray(userProfile?.liked_tags) ? userProfile.liked_tags : [];
    const activityCategories = Array.isArray(tripPreferences?.activity_categories)
      ? tripPreferences.activity_categories
      : [];

    const interestPhrases = [...likedTags, ...activityCategories]
      .filter(Boolean)
      .map((t) => String(t))
      .slice(0, 5)
      .join(' ');

    // Build a Google query that explicitly anchors on the trip's destination,
    // so we don't accidentally get results for a different place with a
    // similar name. Wrap multi-word destinations in quotes.
    const rawDestination = String(trip.destination).trim();
    const destinationQuery =
      rawDestination && rawDestination.includes(' ') ? `"${rawDestination}"` : rawDestination;

    const queryBase = `things to do in ${destinationQuery}`;
    const query =
      interestPhrases.length > 0 ? `${queryBase} ${interestPhrases}` : `${queryBase} best activities`;

    const items = await fetchActivitySearchResults(query, 5);

    if (!items.length) {
      return res.status(200).json({
        success: true,
        activities: [],
        message: 'No activities were found from search.',
      });
    }

    const suggestions = [];

    for (const item of items) {
      try {
        const activity = await upsertReusableActivityFromSearchItem(item, trip.destination);

        // Ensure we have a per-trip preference row (pending by default)
        const { data: existingPref, error: prefError } = await supabase
          .from('trip_activity_preference')
          .select('*')
          .eq('trip_id', tripId)
          .eq('activity_id', activity.activity_id)
          .maybeSingle();

        if (prefError) {
          console.error('Error checking existing trip_activity_preference:', prefError);
          continue;
        }

        let prefRow = existingPref;

        if (!prefRow) {
          const { data: inserted, error: insertError } = await supabase
            .from('trip_activity_preference')
            .insert([
              {
                trip_id: tripId,
                activity_id: activity.activity_id,
                preference: 'pending',
              },
            ])
            .select()
            .single();

          if (insertError) {
            console.error('Error inserting trip_activity_preference:', insertError);
            continue;
          }

          prefRow = inserted;
        }

        suggestions.push({
          ...activity,
          trip_activity_preference_id: prefRow.trip_activity_preference_id,
          preference: prefRow.preference,
        });
      } catch (innerError) {
        console.error('Error processing search item into activity:', innerError);
      }
    }

    res.status(200).json({
      success: true,
      activities: suggestions,
    });
  } catch (error) {
    console.error('Error generating activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate activities',
      error: error.message,
    });
  }
});

// Phase 3 helper: fetch current activity suggestions + preferences for a trip
router.get('/:tripId/activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data, error } = await supabase
      .from('trip_activity_preference')
      .select(
        `
        trip_activity_preference_id,
        trip_id,
        activity_id,
        preference,
        activity:activity (
          activity_id,
          name,
          location,
          category,
          duration,
          cost_estimate,
          rating,
          tags,
          source
        )
      `
      )
      .eq('trip_id', tripId);

    if (error) {
      throw error;
    }

    const activities =
      data?.map((row) => ({
        trip_activity_preference_id: row.trip_activity_preference_id,
        trip_id: row.trip_id,
        activity_id: row.activity_id,
        preference: row.preference,
        ...row.activity,
      })) || [];

    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error('Error fetching trip activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip activities',
      error: error.message,
    });
  }
});

// Phase 3 swipe: update preference for a specific activity suggestion
router.post('/:tripId/activities/:activityId/preference', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const activityId = parseInt(req.params.activityId);
    const { preference } = req.body;

    if (!['liked', 'disliked', 'maybe', 'pending'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid preference value.',
      });
    }

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('trip_activity_preference')
      .select('*')
      .eq('trip_id', tripId)
      .eq('activity_id', activityId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let result;

    if (existing) {
      result = await supabase
        .from('trip_activity_preference')
        .update({ preference })
        .eq('trip_activity_preference_id', existing.trip_activity_preference_id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('trip_activity_preference')
        .insert([
          {
            trip_id: tripId,
            activity_id: activityId,
            preference,
          },
        ])
        .select()
        .single();
    }

    const { data, error } = result;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preference: data,
    });
  } catch (error) {
    console.error('Error updating activity preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity preference',
      error: error.message,
    });
  }
});

// Fetch the generated day-by-day itinerary and attached activities for a trip
router.get('/:tripId/itinerary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id, destination')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data, error } = await supabase
      .from('itinerary')
      .select(
        `
        itinerary_id,
        day_number,
        date,
        summary,
        itinerary_activity (
          order_index,
          activity:activity (
            activity_id,
            name,
            location,
            category,
            duration
          )
        )
      `
      )
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) {
      throw error;
    }

    const days =
      data?.map((row) => {
        const acts = Array.isArray(row.itinerary_activity)
          ? row.itinerary_activity
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((ia) => ia.activity || {})
          : [];

        return {
          day_number: row.day_number,
          date: row.date,
          summary: row.summary,
          activities: acts,
        };
      }) || [];

    res.status(200).json({
      success: true,
      days,
    });
  } catch (error) {
    console.error('Error fetching itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch itinerary',
      error: error.message,
    });
  }
});

// Generate day-by-day itinerary and activities for a trip using the LLM
router.post('/:tripId/generate-itinerary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Load trip and ensure it belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // Load user profile
    const { data: userProfile, error: userError } = await supabase
      .from('app_user')
      .select('user_id, name, home_location, budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .single();

    if (userError || !userProfile) {
      throw userError || new Error('User profile not found');
    }

    // Load trip-specific preferences (optional)
    const { data: tripPreferences, error: prefError } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    // Clear existing itinerary for this trip (activities remain as a shared catalog)
    const { error: deleteItineraryError } = await supabase
      .from('itinerary')
      .delete()
      .eq('trip_id', tripId);

    if (deleteItineraryError) {
      throw deleteItineraryError;
    }

    const plannerPrompt = `You are an expert travel planner creating a realistic, safe, and fun itinerary.
You are given structured data about:
- the trip (destination, dates, budget, travelers)
- the traveler's general profile and interests
- this specific trip's preferences (pace, categories, safety notes, custom requests).

Use this to generate a day-by-day itinerary that strongly respects:
- requested activity categories and things to avoid
- safety notes (ex. safe for a group of girls)
- accessibility notes and any custom constraints
- realistic pacing (do not overload days beyond the requested "pace").

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "summary": "Short overview of the day tailored to their preferences.",
      "activities": [
        {
          "name": "Activity name",
          "location": "Neighborhood or area in the destination",
          "category": "outdoors | relaxing | cultural | music | arts | museums | food | nightlife | shopping | nature | adventure | other",
          "duration": "Approximate duration, ex. '2-3 hours'",
          "cost_estimate": 0,
          "rating": 4.5,
          "tags": ["string", "string"]
        }
      ]
    }
  ]
}

If dates or number of days are missing, infer a reasonable number of days (3-5) for a first draft.`;

    const llmInput = {
      trip,
      user_profile: userProfile,
      trip_preferences: tripPreferences || null,
    };

    const completion = await groqClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: plannerPrompt,
        },
        {
          role: 'user',
          content: JSON.stringify(llmInput),
        },
      ],
      temperature: 0.6,
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse itinerary JSON from LLM response');
      }
    }

    const days = Array.isArray(parsed.days) ? parsed.days : [];

    const createdItineraries = [];

    // Insert itineraries and activities
    for (let i = 0; i < days.length; i++) {
      const day = days[i] || {};
      const dayNumber = day.day_number || i + 1;
      const date = day.date || null;
      const summary = day.summary || `Day ${dayNumber} in ${trip.destination || 'your destination'}`;

      const { data: itineraryRow, error: itineraryError } = await supabase
        .from('itinerary')
        .insert([
          {
            trip_id: tripId,
            day_number: dayNumber,
            date,
            summary,
          },
        ])
        .select()
        .single();

      if (itineraryError || !itineraryRow) {
        throw itineraryError || new Error('Failed to insert itinerary day');
      }

      createdItineraries.push(itineraryRow);

      const activities = Array.isArray(day.activities) ? day.activities : [];

      for (let j = 0; j < activities.length; j++) {
        const act = activities[j] || {};

        const { data: activityRow, error: activityError } = await supabase
          .from('activity')
          .insert([
            {
              name: act.name || 'Activity',
              location: act.location || trip.destination || null,
              category: act.category || 'other',
              duration: act.duration || null,
              cost_estimate:
                act.cost_estimate !== undefined && act.cost_estimate !== null
                  ? parseFloat(act.cost_estimate)
                  : null,
              rating:
                act.rating !== undefined && act.rating !== null
                  ? parseFloat(act.rating)
                  : null,
              tags: Array.isArray(act.tags) ? act.tags : [],
              source: 'llm-itinerary',
            },
          ])
          .select()
          .single();

        if (activityError || !activityRow) {
          throw activityError || new Error('Failed to insert activity');
        }

        const { error: linkError } = await supabase.from('itinerary_activity').insert([
          {
            itinerary_id: itineraryRow.itinerary_id,
            activity_id: activityRow.activity_id,
            order_index: j,
          },
        ]);

        if (linkError) {
          throw linkError;
        }
      }
    }

    const assistantSummary = days.length
      ? `I've created a ${days.length}-day itinerary for your trip to ${
          trip.destination || 'your destination'
        }. You can review it in your trip details.`
      : `I wasn't able to generate a detailed itinerary, but I've saved your preferences for this trip.`;

    // Save a concise assistant message into the chat history for this trip
    await saveMessage(userId, 'assistant', assistantSummary, tripId);

    res.status(200).json({
      success: true,
      message: assistantSummary,
      days_count: days.length,
      itineraries: createdItineraries,
    });
  } catch (error) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate itinerary',
      error: error.message,
    });
  }
});

export default router;

