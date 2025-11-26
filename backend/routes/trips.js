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

async function generateRefinedSearchQuery(trip, preferences, userProfile, activityPreferences) {
  // Simple, straightforward query generation - don't overthink it
  try {
    const destination = trip?.destination || '';
    
    // Build a simple query: destination + basic activity interests
    let queryParts = [];
    
    // Always include destination
    if (destination) {
      queryParts.push(destination);
    }
    
    // Add activity interests if specified (limit to 1-2 to keep it simple)
    if (Array.isArray(preferences?.activity_categories) && preferences.activity_categories.length > 0) {
      const topInterests = preferences.activity_categories.slice(0, 2);
      queryParts.push(...topInterests);
    }
    
    // Add "things to do" or "activities" to make it a proper search query
    if (queryParts.length === 0) {
      queryParts.push('things to do');
    } else {
      queryParts.push('activities');
    }
    
    const simpleQuery = queryParts.join(' ');
    console.log('[activities] Generated Google query:', simpleQuery);

    // That's it - keep it simple!
    return simpleQuery;
  } catch (error) {
    console.error('Error generating refined search query:', error);
    // Fallback to very simple query
    if (trip?.destination) {
      return `things to do ${trip.destination}`;
    }
    return 'travel activities';
  }
}

async function fetchActivitySearchResults(query, num = 10) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    console.warn('Google Custom Search API env vars are not set. Activity generation will be disabled.');
    return [];
  }

  // Google Custom Search only allows num between 1 and 10
  const safeNum = Math.max(1, Math.min(num, 10));

  console.log('[activities] Calling Google Custom Search with query:', query, 'num:', safeNum);

  const params = new URLSearchParams({
    key: GOOGLE_CUSTOM_SEARCH_API_KEY,
    cx: GOOGLE_CUSTOM_SEARCH_CX,
    q: query,
    num: String(safeNum),
    safe: 'active',
  });

  const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
  console.log('[activities] Google Custom Search URL:', url);

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    console.error('Google Custom Search API error (activities):', response.status, text);
    return [];
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) {
    console.log('[activities] Google Custom Search returned no items.');
    return [];
  }

  console.log('[activities] Google Custom Search returned', data.items.length, 'items.');
  return data.items;
}

async function extractActivityNameFromSearchResult(item, destination, preferences, userProfile) {
  const title = item.title || '';
  const snippet = item.snippet || '';
  const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;
  
  // Determine season/context from dates
  let seasonalContext = '';
  let dateContext = '';
  if (preferences?.start_date) {
    const date = new Date(preferences.start_date);
    const month = date.getMonth() + 1; // 1-12
    const monthName = date.toLocaleString('default', { month: 'long' });
    if (month >= 12 || month <= 2) seasonalContext = 'winter';
    else if (month >= 3 && month <= 5) seasonalContext = 'spring';
    else if (month >= 6 && month <= 8) seasonalContext = 'summer';
    else seasonalContext = 'fall';
    dateContext = `${monthName} ${date.getFullYear()}`;
  }

  // Try LLM extraction, but be very lenient with fallbacks
  try {
    const prompt = `You are a travel activity extraction expert. Given a search result from Google, extract the SPECIFIC ACTIVITY NAME that is located at or near the destination, not the article title.

SEARCH RESULT:
Title: ${title}
Snippet: ${snippet}
Destination: ${destination || 'not specified'}
Travel Dates: ${dateContext || 'not specified'}
Season: ${seasonalContext || 'not specified'}

USER CONTEXT:
- Activity interests: ${Array.isArray(preferences?.activity_categories) && preferences.activity_categories.length > 0 ? preferences.activity_categories.join(', ') : 'not specified'}
- Group type: ${preferences?.group_type || 'not specified'}
- Travel style: ${userProfile?.travel_style || 'not specified'}
- Liked tags: ${Array.isArray(userProfile?.liked_tags) && userProfile.liked_tags.length > 0 ? userProfile.liked_tags.join(', ') : 'none'}

INSTRUCTIONS:
1. Extract ANY activity name from the search result that could be at "${destination}"
2. If it's a list article, extract the FIRST activity mentioned in the snippet or title
3. If the title looks like an activity name, use it (even if it's not perfect)
4. Be very lenient - it's better to extract something than return "SKIP"
5. Keep it 2-10 words
6. Only return "SKIP" if the search result is completely unrelated to activities or travel

Examples of good extractions:
- "10 Best Things to Do in Paris" → "Eiffel Tower" or "Visit the Eiffel Tower"
- "Paris Museums Guide" → "Louvre Museum" or "Explore Paris Museums"
- "Things to Do in Paris" → "Paris Activities" or extract first activity from snippet

Return ONLY the activity name or "SKIP", nothing else. No quotes, no explanations.`;

    const completion = await groqClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting specific travel activity names from search results. Extract the actual activity name from the search result, even if it comes from a list article. Focus on finding real activities at the destination. Only return "SKIP" if absolutely no activity can be found.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 50,
    });

    const extractedName = completion.choices[0]?.message?.content?.trim() || '';
    let cleaned = extractedName.replace(/^["']|["']$/g, '').trim();

    // If the model accidentally returned an article-style title (e.g. "10 Best Things to Do in Paris"),
    // treat it as unusable and fall back to snippet-based extraction instead.
    const articleLikePattern =
      /\b(top|best|\d+)\b.*\b(things to do|activities|places|attractions|guide|blog|list)\b/i;
    if (cleaned && articleLikePattern.test(cleaned)) {
      cleaned = '';
    }
    
    // If LLM says to skip, returns an empty/bad string, or we flagged it as article-like,
    // try aggressive fallback extraction from the snippet/title.
    if (cleaned === 'SKIP' || !cleaned || cleaned.length < 3) {
      // Try to extract from snippet using multiple patterns (from most specific to most general)
      const activityPatterns = [
        // Pattern 1: Action verb + "the" + capitalized place name
        /(?:visit|explore|see|tour|experience|check out|go to|walk|hike|climb|swim|sail|ride|enjoy|discover)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
        // Pattern 2: "the" + capitalized name
        /(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
        // Pattern 3: Any capitalized phrase (2-5 words) - most lenient fallback
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/,
      ];
      
      // Try snippet first, then title
      const textsToSearch = [snippet, title];
      for (const text of textsToSearch) {
        if (!text) continue;
        for (const pattern of activityPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const extracted = match[1].trim();
            // Verify it's a reasonable length
            if (extracted.length > 2 && extracted.length < 80) {
              return extracted;
            }
          }
        }
      }
      
      // Aggressive fallback: clean the title and use it
      if (title && title.length > 3 && title.length < 100) {
        // Remove list indicators and common prefixes
        let cleanedTitle = title
          .replace(/^(top|best|\d+|the|a|an)\s+/i, '')
          .replace(/\s+(in|at|near|around|guide|list|article|blog|website|click|read|more|here|now)\s*$/i, '')
          .trim();
        
        // If we have something reasonable, use it
        if (cleanedTitle.length > 3 && cleanedTitle.length < 80) {
          return cleanedTitle;
        }
        // Even if cleaning didn't help much, use the original title if it's not obviously bad
        if (!pureListPattern.test(title) && !/(\.com|\.org|\.net|www\.|http|https)/i.test(title)) {
          return title.trim();
        }
      }
      
      // Last resort: use destination + generic activity
      if (destination) {
        return `Activities in ${destination}`;
      }
      
      // Final fallback: just use a cleaned version of the title
      return title.trim() || 'Activity';
    }
    
    // Very lenient validation - only filter out the most obvious non-activities
    // Allow most things through
    const urlPattern = /(\.com|\.org|\.net|www\.|http|https)/i;
    if (urlPattern.test(cleaned)) {
      // If it's a URL, try to extract something from the title instead
      if (title && title.length > 3) {
        const cleanedTitle = title.replace(/^(top|best|\d+)\s+/i, '').trim();
        if (cleanedTitle.length > 3) {
          return cleanedTitle;
        }
      }
      return null; // Skip URLs only if we can't extract anything
    }
    
    // Only filter out if it's clearly just "Top X Things to Do" with nothing else
    const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;
    if (pureListPattern.test(cleaned)) {
      // Try to extract from snippet or use a generic name
      if (destination) {
        return `Activities in ${destination}`;
      }
      return null; // Skip pure list titles only as last resort
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error extracting activity name from search result:', error);
    return null;
  }
}

async function extractActivityDetails(name, snippet, link) {
  // Extract price information from snippet
  let priceRange = null;
  let costEstimate = null;
  const pricePatterns = [
    /(\$[\d,]+(?:-\$[\d,]+)?)/, // $50-$100
    /(free|no cost|no charge)/i,
    /(\d+)\s*(?:usd|dollars?)/i,
    /(budget|affordable|expensive|luxury)/i,
  ];
  
  const fullText = `${name} ${snippet}`.toLowerCase();
  for (const pattern of pricePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      if (match[0].includes('free') || match[0].includes('no cost')) {
        priceRange = 'Free';
        costEstimate = 0;
      } else if (match[0].includes('budget') || match[0].includes('affordable')) {
        priceRange = 'Budget-friendly';
        costEstimate = 25;
      } else if (match[0].includes('expensive') || match[0].includes('luxury')) {
        priceRange = 'Expensive';
        costEstimate = 100;
      } else {
        const priceMatch = match[0].match(/\$?(\d+)/);
        if (priceMatch) {
          const price = parseInt(priceMatch[1]);
          if (price < 20) priceRange = 'Budget-friendly';
          else if (price < 50) priceRange = 'Moderate';
          else if (price < 100) priceRange = 'Expensive';
          else priceRange = 'Luxury';
          costEstimate = price;
        }
      }
      break;
    }
  }

  // Extract duration if mentioned
  let duration = null;
  const durationPatterns = [
    /(\d+)\s*(?:hours?|hrs?)/i,
    /(\d+)\s*(?:days?)/i,
    /(half\s*day|full\s*day)/i,
  ];
  for (const pattern of durationPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      duration = match[0];
      break;
    }
  }

  return { priceRange, costEstimate, duration };
}

async function fetchActivityImage(activityName, destination) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    return null;
  }

  try {
    // Create a more specific image query that combines activity name and destination
    // Remove common verbs to make the query more image-search friendly
    const cleanActivityName = activityName
      .replace(/^(visit|explore|see|tour|experience|go to|check out)\s+/i, '')
      .trim();
    
    const imageQuery = destination 
      ? `${cleanActivityName} ${destination}`
      : cleanActivityName;
    
    const params = new URLSearchParams({
      key: GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: GOOGLE_CUSTOM_SEARCH_CX,
      q: imageQuery,
      num: '3', // Get a few results to find the best one
      safe: 'active',
      searchType: 'image',
      imgSize: 'large',
      imgType: 'photo', // Prefer photos over illustrations
    });

    const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        // Return the first result (Google usually ranks best images first)
        return data.items[0].link || null;
      }
    }
  } catch (error) {
    console.error('Error fetching activity image:', error);
  }
  
  return null;
}

async function upsertReusableActivityFromSearchItem(item, destination, preferences = null, userProfile = null) {
  const location = destination || null;
  const snippet = item.snippet || '';
  const link = item.link || '';

  // Extract the actual activity name from the search result (not just the article title)
  let name = await extractActivityNameFromSearchResult(item, destination, preferences, userProfile);
  
  // If we couldn't extract a valid activity name, fall back to a generic but usable one
  if (!name || name === 'SKIP') {
    if (item.title && item.title.length > 3) {
      name = item.title.trim();
    } else if (destination) {
      name = `Activity in ${destination}`;
    } else {
      name = 'Activity';
    }
  }

  // Very lenient validation - only filter out the most obvious non-activities
  // Filter out website URLs
  const urlPattern = /(\.com|\.org|\.net|www\.|http|https)/i;
  if (urlPattern.test(name)) {
    // If name contains URL, try to clean it or use destination
    let cleanedName = name.replace(urlPattern, '').trim();
    if (cleanedName.length <= 3 && destination) {
      cleanedName = `Activity in ${destination}`;
    }
    if (cleanedName.length > 3) {
      name = cleanedName;
    } else if (destination) {
      name = `Activity in ${destination}`;
    } else {
      name = 'Activity';
    }
  }
  
  // Only filter out if it's clearly just "Top X Things to Do" with nothing else
  const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;
  if (pureListPattern.test(name)) {
    // Turn list-style titles into something more activity-like instead of skipping
    if (destination) {
      name = `Activities in ${destination}`;
    } else {
      name = 'Things to do';
    }
  }
  
  // At this point, we ALWAYS have some non-empty name string

  // Extract additional details
  const { priceRange, costEstimate, duration } = await extractActivityDetails(name, snippet, link);

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

  // Always fetch a new image based on the extracted activity name (not the search result)
  // This ensures we get a good image for the actual activity
  let finalImageUrl = await fetchActivityImage(name, destination);
  
  // Fallback to search result image only if we couldn't get one from activity name
  if (!finalImageUrl) {
    finalImageUrl = item.pagemap?.cse_image?.[0]?.src || item.pagemap?.metatags?.[0]?.['og:image'] || null;
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
    // Update existing activity with new data if available
    const updateData = {};
    // image_url and price_range are omitted here because the current Supabase schema cache for 'activity' does not include them

    if (costEstimate !== null && existing.cost_estimate === null) updateData.cost_estimate = costEstimate;
    if (duration && !existing.duration) updateData.duration = duration;

    if (Object.keys(updateData).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('activity')
        .update(updateData)
        .eq('activity_id', existing.activity_id)
        .select()
        .single();
      
      if (!updateError && updated) {
        // Attach the runtime image URL (from the article or Google Images) for the client,
        // without relying on a DB column.
        return { ...updated, image_url: finalImageUrl || null };
      }
    }
    return { ...existing, image_url: finalImageUrl || null };
  }

  const { data, error } = await supabase
    .from('activity')
    .insert([
      {
        name,
        location,
        category,
        duration: duration || null,
        cost_estimate: costEstimate,
        rating: null,
        tags,
        source: 'google-search',
        source_url: link || null
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error inserting activity from search:', error);
    throw error;
  }

  // Attach the runtime image URL (from the article or Google Images) for the client,
  // without relying on a DB column.
  return { ...data, image_url: finalImageUrl || null };
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
      .select('home_location, budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: tripPreferences } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    // Load previously liked/disliked activities for this trip to understand patterns
    const { data: activityPreferences } = await supabase
      .from('trip_activity_preference')
      .select(`
        preference,
        activity:activity (
          activity_id,
          name,
          category,
          tags
        )
      `)
      .eq('trip_id', tripId)
      .in('preference', ['liked', 'disliked']);

    // Use LLM to generate a refined, highly relevant search query
    let query = null;
    try {
      query = await generateRefinedSearchQuery(trip, tripPreferences, userProfile, activityPreferences || []);
    } catch (error) {
      console.error('Error generating refined search query:', error);
    }

    // Fallback to basic query if LLM fails
    if (!query || query.length < 5) {
      const likedTags = Array.isArray(userProfile?.liked_tags) ? userProfile.liked_tags : [];
      const activityCategories = Array.isArray(tripPreferences?.activity_categories)
        ? tripPreferences.activity_categories
        : [];

      const interestPhrases = [...likedTags, ...activityCategories]
        .filter(Boolean)
        .map((t) => String(t))
        .slice(0, 5)
        .join(' ');

      const rawDestination = String(trip.destination).trim();
      const destinationQuery =
        rawDestination && rawDestination.includes(' ') ? `"${rawDestination}"` : rawDestination;

      // Build a more contextual fallback query
      let queryParts = [`things to do in ${destinationQuery}`];
      
      if (interestPhrases) {
        queryParts.push(interestPhrases);
      }
      
      if (tripPreferences?.group_type) {
        queryParts.push(`for ${tripPreferences.group_type}`);
      }
      
      query = queryParts.join(' ');
    }

    // Fetch more results to have better selection (fetch more since we'll filter out invalid ones)
    const items = await fetchActivitySearchResults(query, 15);

    if (!items.length) {
      return res.status(200).json({
        success: true,
        activities: [],
        message: 'No activities were found from search.',
      });
    }

    // Filter and prioritize results, then take top 8
    const suggestions = [];
    const processedActivityIds = new Set();

    console.log(`Processing ${items.length} search results for destination: ${trip.destination}`);
    
    for (const item of items) {
      try {
        const activity = await upsertReusableActivityFromSearchItem(item, trip.destination, tripPreferences, userProfile);
        
        // Skip if activity extraction failed or returned null
        if (!activity) {
          console.log(`Skipped activity from: ${item.title?.substring(0, 50)}`);
          continue;
        }
        
        console.log(`Successfully extracted activity: ${activity.name}`);
        
        // Skip duplicates
        if (processedActivityIds.has(activity.activity_id)) {
          continue;
        }
        processedActivityIds.add(activity.activity_id);

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
        
        // Limit to 8 activities for better UX
        if (suggestions.length >= 8) {
          break;
        }
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

    // First, fetch per-trip activity preferences without relying on FK-based joins
    const { data: prefs, error: prefsError } = await supabase
      .from('trip_activity_preference')
      .select('trip_activity_preference_id, trip_id, activity_id, preference')
      .eq('trip_id', tripId);

    if (prefsError) {
      throw prefsError;
    }

    if (!prefs || prefs.length === 0) {
      return res.status(200).json({
        success: true,
        activities: [],
      });
    }

    // Fetch corresponding activities in a separate query
    const activityIds = Array.from(
      new Set(
        prefs
          .map((p) => p.activity_id)
          .filter((id) => typeof id === 'number' || typeof id === 'string')
      )
    );

    const { data: activitiesRaw, error: activitiesError } = await supabase
      .from('activity')
      .select(
        'activity_id, name, location, category, duration, cost_estimate, rating, tags, source, source_url'
      )
      .in('activity_id', activityIds);

    if (activitiesError) {
      throw activitiesError;
    }

    const activityMap = new Map();
    (activitiesRaw || []).forEach((a) => {
      activityMap.set(a.activity_id, a);
    });

    const activities = (prefs || []).map((row) => ({
      trip_activity_preference_id: row.trip_activity_preference_id,
      trip_id: row.trip_id,
      activity_id: row.activity_id,
      preference: row.preference,
      ...(activityMap.get(row.activity_id) || {}),
    }));

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

    // Load liked activities to incorporate into itinerary
    // Load liked activities to incorporate into itinerary (without relying on FK-based joins)
    const { data: likedPrefs, error: likedPrefsError } = await supabase
      .from('trip_activity_preference')
      .select('activity_id, preference')
      .eq('trip_id', tripId)
      .eq('preference', 'liked');

    if (likedPrefsError) {
      throw likedPrefsError;
    }

    let likedActivities = [];
    if (likedPrefs && likedPrefs.length > 0) {
      const likedActivityIds = Array.from(
        new Set(
          likedPrefs
            .map((p) => p.activity_id)
            .filter((id) => typeof id === 'number' || typeof id === 'string')
        )
      );

      const { data: likedActivitiesRaw, error: likedActivitiesError } = await supabase
        .from('activity')
        .select(
          'activity_id, name, location, category, duration, cost_estimate, rating, tags'
        )
        .in('activity_id', likedActivityIds);

      if (likedActivitiesError) {
        throw likedActivitiesError;
      }

      likedActivities = likedActivitiesRaw || [];
    }

    // Clear existing itinerary for this trip (activities remain as a shared catalog)
    const { error: deleteItineraryError } = await supabase
      .from('itinerary')
      .delete()
      .eq('trip_id', tripId);

    if (deleteItineraryError) {
      throw deleteItineraryError;
    }

    // If we have liked activities, use them directly and minimize LLM usage
    const numDays = tripPreferences?.num_days || 
                    (tripPreferences?.start_date && tripPreferences?.end_date 
                      ? Math.ceil((new Date(tripPreferences.end_date) - new Date(tripPreferences.start_date)) / (1000 * 60 * 60 * 24)) + 1
                      : 3);

    let days = [];
    
    if (likedActivities.length > 0) {
      // Use liked activities directly - distribute them across days
      const activitiesPerDay = Math.ceil(likedActivities.length / numDays);
      
      for (let i = 0; i < numDays; i++) {
        const dayActivities = likedActivities.slice(i * activitiesPerDay, (i + 1) * activitiesPerDay);
        if (dayActivities.length > 0) {
          days.push({
            day_number: i + 1,
            date: tripPreferences?.start_date 
              ? new Date(new Date(tripPreferences.start_date).getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              : null,
            summary: `Day ${i + 1} featuring ${dayActivities.map(a => a.name).join(', ')}`,
            activities: dayActivities.map(a => ({
              activity_id: a.activity_id,
              name: a.name,
              location: a.location,
              category: a.category,
              duration: a.duration,
            })),
          });
        }
      }

      // Use minimal LLM to just refine day summaries and add any missing activities
      const plannerPrompt = `You are an expert travel planner. Given a list of liked activities already selected by the user, create a day-by-day itinerary that:
- Distributes the liked activities across the days naturally
- Adds 1-2 complementary activities per day if needed (based on preferences)
- Creates engaging day summaries
- Respects pace, safety notes, and custom requests

Liked activities to incorporate: ${JSON.stringify(likedActivities.map(a => ({ name: a.name, category: a.category, location: a.location })))}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "summary": "Short engaging overview",
      "activities": [
        {
          "name": "Activity name (use exact names from liked activities when possible)",
          "location": "Neighborhood or area",
          "category": "outdoors | relaxing | cultural | music | arts | museums | food | nightlife | shopping | nature | adventure | other",
          "duration": "Approximate duration"
        }
      ]
    }
  ]
}`;

      const llmInput = {
        trip,
        user_profile: userProfile,
        trip_preferences: tripPreferences || null,
        liked_activities: likedActivities.map(a => ({
          name: a.name,
          category: a.category,
          location: a.location,
        })),
        preliminary_days: days,
      };

      try {
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
          temperature: 0.5,
          max_tokens: 2000,
        });

        const rawContent = completion.choices[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (e) {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        }

        if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
          // Merge LLM suggestions with our liked activities
          days = parsed.days.map((day, idx) => {
            const existingDay = days[idx];
            return {
              ...day,
              day_number: day.day_number || idx + 1,
              date: day.date || existingDay?.date || null,
              activities: [
                ...(existingDay?.activities || []),
                ...(day.activities || []).filter(a => 
                  !existingDay?.activities?.some(ea => ea.name === a.name)
                ),
              ],
            };
          });
        }
      } catch (llmError) {
        console.error('Error refining itinerary with LLM:', llmError);
        // Continue with the basic distribution
      }
    } else {
      // No liked activities - use full LLM generation (original behavior)
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

      days = Array.isArray(parsed.days) ? parsed.days : [];
    }

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
        let activityRow = null;

        // If this activity has an activity_id, it's a liked activity - use it directly
        if (act.activity_id) {
          const { data: existingActivity } = await supabase
            .from('activity')
            .select('*')
            .eq('activity_id', act.activity_id)
            .single();
          
          if (existingActivity) {
            activityRow = existingActivity;
          }
        }

        // If not found or no activity_id, create/insert new activity
        if (!activityRow) {
          const { data: newActivity, error: activityError } = await supabase
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

          if (activityError || !newActivity) {
            throw activityError || new Error('Failed to insert activity');
          }
          activityRow = newActivity;
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

