// backend/routes/chat.js
import express from 'express';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

const GOOGLE_CUSTOM_SEARCH_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const GOOGLE_CUSTOM_SEARCH_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX || '80b87ce61302c4f86';

function normalizeDestinationName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchDestinationImage(destination) {
  if (!destination) return null;
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY) {
    console.warn('GOOGLE_CUSTOM_SEARCH_API_KEY is not set. Chat-created trips will have no image_url.');
    return null;
  }

  try {
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
      console.error('Google Custom Search API error (chat):', response.status, text);
      return null;
    }

    const data = await response.json();
    const firstItem = Array.isArray(data.items) && data.items.length > 0 ? data.items[0] : null;

    if (!firstItem) {
      return null;
    }

  // Get the link from the first item
  return firstItem.link || (firstItem.image && firstItem.image.thumbnailLink) || null;
  } catch (error) {
    console.error('Error fetching destination image (chat):', error);
    return null;
  }
}

// Helper function to load conversation history from database
async function loadConversationHistory(userId, tripId = null) {
  try {
    let query = supabase
      .from('chat_message')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50); // Limit to last 50 messages for context

    // If tripId is provided, filter by trip_id, otherwise get general chat
    if (tripId) {
      query = query.eq('trip_id', tripId);
    } else {
      query = query.is('trip_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading conversation history:', error);
      return [];
    }

    // Filter out system messages (they're added separately)
    return (data || []).filter(msg => msg.role !== 'system').map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  } catch (error) {
    console.error('Error loading conversation history:', error);
    return [];
  }
}

// Helper function to save message to database
async function saveMessage(userId, role, content, tripId = null) {
  try {
    const messageData = {
      user_id: userId,
      role: role,
      content: content
    };

    if (tripId !== null && tripId !== undefined) {
      messageData.trip_id = tripId;
    }

    console.log(`Saving ${role} message:`, { userId, role, contentLength: content.length, tripId });

    const { data, error } = await supabase
      .from('chat_message')
      .insert([messageData])
      .select();

    if (error) {
      console.error('Error saving message:', error);
      throw error;
    } else {
      console.log(`Successfully saved ${role} message with trip_id:`, data[0]?.trip_id || 'NULL');
    }
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

// Helper function to extract trip information from a message using LLM
async function extractTripInfo(message) {
  try {
    const extractionPrompt = `Extract trip information from the following user message. Respond ONLY with valid JSON in this exact format (use null for missing values):
{
  "destination": "destination name or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "num_travelers": number or null,
  "total_budget": number or null,
  "is_trip_request": true or false
}

Message: "${message}"

If the message is clearly about creating a new trip (ex., "I want to go to X", "plan a trip to Y", "I'd like to visit Z"), set is_trip_request to true. Otherwise false.`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a travel information extraction assistant. Extract trip details from user messages and return only valid JSON.'
        },
        {
          role: 'user',
          content: extractionPrompt
        }
      ],
      temperature: 0.3
    });

    const response = completion.choices[0]?.message?.content || '{}';

    // Try to parse JSON, handling cases where response might have extra text
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from response if wrapped in markdown or other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    }

    if (parsed && parsed.destination) {
      parsed.destination = normalizeDestinationName(parsed.destination);
    }
    return parsed;
  } catch (error) {
    console.error('Error extracting trip info:', error);
    // Fallback: try to extract destination manually
    const destinationMatch = message.match(/\bto\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/i);
    const normalized = destinationMatch ? normalizeDestinationName(destinationMatch[1]) : null;
    return {
      destination: normalized,
      start_date: null,
      end_date: null,
      num_travelers: null,
      total_budget: null,
      is_trip_request: destinationMatch !== null || /want.*go|plan.*trip|visit|travel/i.test(message)
    };
  }
}

// Helper function to create a trip plus an initial preference row
async function createTrip(userId, tripInfo, imageUrl = null) {
  try {
    const tripData = {
      user_id: userId,
      trip_status: 'draft',
      title: tripInfo.destination ? `Trip to ${tripInfo.destination}` : 'My Trip',
      ...(tripInfo.destination && { destination: tripInfo.destination }),
      ...(imageUrl && { image_url: imageUrl }),
    };

    const { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Seed trip_preference with any structured fields we managed to extract
    if (data?.trip_id && (tripInfo.start_date || tripInfo.end_date)) {
      const preferenceData = {
        trip_id: data.trip_id,
        start_date: tripInfo.start_date || null,
        end_date: tripInfo.end_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: prefError } = await supabase
        .from('trip_preference')
        .insert([preferenceData]);

      if (prefError) {
        console.error('Error seeding trip_preference from chat-created trip:', prefError);
      }
    }

    return data;
  } catch (error) {
    console.error('Error creating trip:', error);
    throw error;
  }
}

// Get conversation history endpoint
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.query.tripId ? parseInt(req.query.tripId) : null;
    const history = await loadConversationHistory(userId, tripId);

    res.status(200).json({
      success: true,
      messages: history
    });
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load conversation history',
      error: error.message
    });
  }
});

// Chat endpoint
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message, model, tripId, suppressTripCreation } = req.body;

    console.log('📨 Chat endpoint called:', { userId, message: message?.substring(0, 50), model, tripId });

    if (!message) {
      console.error('❌ No message provided');
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    let parsedTripId = tripId ? parseInt(tripId) : null;
    let createdTrip = null;
    let tripCreationError = null;

    // If no tripId provided and we are not explicitly in "explore" mode,
    // create a new trip record for this chat "session" so that
    // chat-created trips always have a corresponding row in the trip table.
    if (!parsedTripId && !suppressTripCreation) {
      console.log('🔍 No tripId provided, extracting trip info from message to create a new trip...');
      const tripInfo = await extractTripInfo(message);
      console.log('📋 Extracted trip info for new trip:', tripInfo);

      // Generate image URL for destination using Google Custom Search when we have one
      let imageUrl = null;
      if (tripInfo.destination) {
        imageUrl = await fetchDestinationImage(tripInfo.destination);
      }

      // Always attempt to create a trip row for chat-initiated trips.
      // createTrip only sends fields it actually has, and lets the DB
      // decide which columns can be null or use defaults.
      try {
        console.log('🏗️ Creating trip (chat-initiated) with info:', tripInfo);
        createdTrip = await createTrip(userId, tripInfo, imageUrl);
        parsedTripId = createdTrip.trip_id;
        console.log(`✅ Created new trip ${parsedTripId} for user ${userId} from chat`);
      } catch (tripError) {
        console.error('❌ Error creating trip from chat:', tripError);
        // Capture error so the frontend can surface it during debugging
        tripCreationError = tripError.message || 'Unknown trip creation error';
        // Continue with chat even if trip creation fails
      }
    }

    // Load conversation history from database (filtered by tripId if provided),
    // unless we're in destination exploration mode (suppressTripCreation),
    // where each session should start fresh.
    let conversationHistory = [];
    if (!suppressTripCreation) {
      conversationHistory = await loadConversationHistory(userId, parsedTripId);
    }
    console.log(
      `📚 Loaded ${conversationHistory.length} messages from history for tripId: ${parsedTripId} (suppressTripCreation=${!!suppressTripCreation})`
    );

    // To avoid hitting TPM / context limits on the model, only send the
    // most recent slice of the conversation to the LLM.
    const MAX_CONTEXT_MESSAGES = 12;
    const trimmedHistory =
      conversationHistory.length > MAX_CONTEXT_MESSAGES
        ? conversationHistory.slice(-MAX_CONTEXT_MESSAGES)
        : conversationHistory;

    // Load user profile so the LLM can ground recommendations in their preferences
    let userProfileContext = 'No saved profile preferences.';
    try {
      const { data: userProfile } = await supabase
        .from('app_user')
        .select('home_location, budget_preference, travel_style, liked_tags')
        .eq('user_id', userId)
        .maybeSingle();

      if (userProfile) {
        const likedTags = Array.isArray(userProfile.liked_tags)
          ? userProfile.liked_tags.join(', ')
          : '';
        const budget =
          userProfile.budget_preference !== null && userProfile.budget_preference !== undefined
            ? `$${userProfile.budget_preference}`
            : 'not specified';
        const travelStyle = userProfile.travel_style || 'not specified';
        const home = userProfile.home_location || 'not specified';

        userProfileContext = `Home base: ${home}. Approximate budget preference: ${budget}. Travel style: ${travelStyle}. Saved interest tags: ${likedTags || 'none'}.`;
      }
    } catch (profileError) {
      console.error('Error loading user profile for chat context:', profileError);
    }

    // Optionally load trip context if we're chatting inside an existing trip
    let tripContext = 'No specific trip is currently selected.';
    let tripDestination = null;
    let tripPreferenceContext = 'No trip-specific preferences are saved for this trip.';
    if (parsedTripId) {
      try {
        const [{ data: tripData }, { data: tripPrefs }] = await Promise.all([
          supabase
            .from('trip')
            .select('title, destination')
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
          supabase
            .from('trip_preference')
            .select(
              'start_date, end_date, num_days, min_budget, max_budget, pace, accommodation_type, activity_categories, avoid_activity_categories, selected_cities, group_type, safety_notes, accessibility_notes, custom_requests'
            )
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
        ]);

        if (tripData) {
          tripDestination = tripData.destination || null;
          const title = tripData.title || 'Your trip';
          tripContext = `Current trip: ${title}. Destination: ${tripData.destination || 'not specified'}.`;
        }

        if (tripPrefs) {
          const lines = [];
          if (tripPrefs.start_date || tripPrefs.end_date) {
            lines.push(
              `Dates: ${tripPrefs.start_date || 'unspecified'} to ${tripPrefs.end_date || 'unspecified'}.`
            );
          }
          if (tripPrefs.num_days) {
            lines.push(`Approximate trip length: ${tripPrefs.num_days} days.`);
          }
          if (tripPrefs.min_budget || tripPrefs.max_budget) {
            lines.push(
              `Trip budget range: ${
                tripPrefs.min_budget ? `$${tripPrefs.min_budget}` : 'unspecified'
              } to ${tripPrefs.max_budget ? `$${tripPrefs.max_budget}` : 'unspecified'}.`
            );
          }
          if (tripPrefs.pace) {
            lines.push(`Preferred pace: ${tripPrefs.pace} (slow / balanced / packed).`);
          }
          if (tripPrefs.accommodation_type) {
            lines.push(`Preferred accommodation: ${tripPrefs.accommodation_type}.`);
          }
          if (Array.isArray(tripPrefs.selected_cities) && tripPrefs.selected_cities.length) {
            lines.push(`Selected cities: ${tripPrefs.selected_cities.join(', ')}.`);
          }
          if (Array.isArray(tripPrefs.activity_categories) && tripPrefs.activity_categories.length) {
            lines.push(
              `Wants more of: ${tripPrefs.activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (
            Array.isArray(tripPrefs.avoid_activity_categories) &&
            tripPrefs.avoid_activity_categories.length
          ) {
            lines.push(
              `Wants to avoid: ${tripPrefs.avoid_activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (tripPrefs.group_type) {
            lines.push(`Group type: ${tripPrefs.group_type}.`);
          }
          if (tripPrefs.safety_notes) {
            lines.push(`Safety notes: ${tripPrefs.safety_notes}.`);
          }
          if (tripPrefs.accessibility_notes) {
            lines.push(`Accessibility notes: ${tripPrefs.accessibility_notes}.`);
          }
          if (tripPrefs.custom_requests) {
            lines.push(`Custom requests: ${tripPrefs.custom_requests}.`);
          }

          if (lines.length) {
            tripPreferenceContext = lines.join(' ');
          }
        }
      } catch (tripLoadError) {
        console.error('Error loading trip context/preferences for chat:', tripLoadError);
      }
    }

    // Build system prompt differently depending on whether we're exploring destinations
    // or chatting inside a specific trip.
    let systemPrompt;
    if (parsedTripId) {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop.

The user is already planning a specific trip. ${tripContext}

Your job is to answer concrete questions and help refine THIS trip only (activities, logistics, tips, neighborhoods, safety, etc.).

- Do NOT suggest alternative destinations unless the user explicitly says they want to change where they are going.
- Do NOT use any "Destination Idea 1/2/3" style format or propose multiple destination ideas.
- Treat the destination above as fixed and answer the user's specific question as directly and practically as possible.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

Here are the specific preferences for this trip (from trip_preference):
${tripPreferenceContext}

When you recommend activities, explain briefly why they fit these preferences.`;
    } else {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

When the user is exploring where to go, suggest up to three concrete destination ideas at a time (never more than three). Present them in this exact structured format so the UI can parse them:

Destination Idea 1: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 2: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 3: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

When you recommend activities, also explain briefly why they fit these preferences.`;
    }

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array from conversation history + new message
    const messages = [
      // System prompt for travel assistant (varies based on trip context)
      {
        role: 'system',
        content: systemPrompt,
      },
      // Add conversation history from database
      ...trimmedHistory,
      // Add current message
      {
        role: 'user',
        content: message
      }
    ];

    console.log(`📝 Built messages array with ${messages.length} total messages (including system)`);

    // Save user message to database (with tripId if provided or created),
    // but skip persistence in exploration-only chats so that each new
    // destination search starts clean.
    if (!suppressTripCreation) {
      console.log(`💾 Saving user message with tripId: ${parsedTripId} for user ${userId}`);
      await saveMessage(userId, 'user', message, parsedTripId);
    } else {
      console.log('💾 Skipping user message persistence due to suppressTripCreation=true');
    }

    // Call OpenAI API
    console.log(`🤖 Calling OpenAI API with model: ${chatModel}`);
    let assistantMessage;
    try {
      const completion = await openaiClient.chat.completions.create({
        model: chatModel,
        messages: messages,
      });

      assistantMessage = completion.choices[0]?.message?.content || 'Sorry, I did not receive a response.';
      console.log(`✅ Received response from OpenAI (${assistantMessage.length} characters)`);
    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
      throw openaiError;
    }

    // Save assistant response to database (with tripId if provided or created),
    // again skipping in pure exploration mode.
    if (!suppressTripCreation) {
      console.log(`💾 Saving assistant message with tripId: ${parsedTripId} for user ${userId}`);
      await saveMessage(userId, 'assistant', assistantMessage, parsedTripId);
    } else {
      console.log('💾 Skipping assistant message persistence due to suppressTripCreation=true');
    }

    // Return the response with trip info if trip was created
    const response = {
      success: true,
      message: assistantMessage,
      model: chatModel,
      // Debug info to help understand why a tripId might be missing
      tripCreationError,
      hasIncomingTripId: !!tripId,
      parsedTripId: parsedTripId || null,
    };

    if (createdTrip) {
      response.tripId = createdTrip.trip_id;
      response.trip = createdTrip;
    } else if (parsedTripId) {
      response.tripId = parsedTripId;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('OpenAI chat error:', error);

    // Check if it's an authentication error
    if (error.status === 401 || error.message?.includes('API key')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid OpenAI API key. Please check your configuration.',
        error: error.message
      });
    }

    // Check if it's a model not found or decommissioned error
    if (error.status === 404 || error.status === 400 || error.code === 'model_decommissioned' || error.message?.includes('model')) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Model error. Please check the model configuration.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to get response from LLM',
      error: error.message
    });
  }
});

// Streaming chat endpoint (for real-time responses)
router.post('/chat/stream', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message, model, tripId } = req.body;

    const parsedTripId = tripId ? parseInt(tripId) : null;

    // Load conversation history from database (filtered by tripId if provided)
    const conversationHistory = await loadConversationHistory(userId, parsedTripId);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Load user profile so the LLM can ground recommendations in their preferences
    let userProfileContext = 'No saved profile preferences.';
    try {
      const { data: userProfile } = await supabase
        .from('app_user')
        .select('home_location, budget_preference, travel_style, liked_tags')
        .eq('user_id', userId)
        .maybeSingle();

      if (userProfile) {
        const likedTags = Array.isArray(userProfile.liked_tags)
          ? userProfile.liked_tags.join(', ')
          : '';
        const budget =
          userProfile.budget_preference !== null && userProfile.budget_preference !== undefined
            ? `$${userProfile.budget_preference}`
            : 'not specified';
        const travelStyle = userProfile.travel_style || 'not specified';
        const home = userProfile.home_location || 'not specified';

        userProfileContext = `Home base: ${home}. Approximate budget preference: ${budget}. Travel style: ${travelStyle}. Saved interest tags: ${likedTags || 'none'}.`;
      }
    } catch (profileError) {
      console.error('Error loading user profile for chat stream context:', profileError);
    }

    // Optionally load trip context if we're chatting inside an existing trip
    let tripContext = 'No specific trip is currently selected.';
    let tripPreferenceContext = 'No trip-specific preferences are saved for this trip.';
    if (parsedTripId) {
      try {
        const [{ data: tripData }, { data: tripPrefs }] = await Promise.all([
          supabase
            .from('trip')
            .select('title, destination')
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
          supabase
            .from('trip_preference')
            .select(
              'start_date, end_date, num_days, min_budget, max_budget, pace, accommodation_type, activity_categories, avoid_activity_categories, group_type, safety_notes, accessibility_notes, custom_requests'
            )
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
        ]);

        if (tripData) {
          const title = tripData.title || 'Your trip';
          tripContext = `Current trip: ${title}. Destination: ${tripData.destination || 'not specified'}.`;
        }

        if (tripPrefs) {
          const lines = [];
          if (tripPrefs.start_date || tripPrefs.end_date) {
            lines.push(
              `Dates: ${tripPrefs.start_date || 'unspecified'} to ${tripPrefs.end_date || 'unspecified'}.`
            );
          }
          if (tripPrefs.num_days) {
            lines.push(`Approximate trip length: ${tripPrefs.num_days} days.`);
          }
          if (tripPrefs.min_budget || tripPrefs.max_budget) {
            lines.push(
              `Trip budget range: ${
                tripPrefs.min_budget ? `$${tripPrefs.min_budget}` : 'unspecified'
              } to ${tripPrefs.max_budget ? `$${tripPrefs.max_budget}` : 'unspecified'}.`
            );
          }
          if (tripPrefs.pace) {
            lines.push(`Preferred pace: ${tripPrefs.pace} (slow / balanced / packed).`);
          }
          if (tripPrefs.accommodation_type) {
            lines.push(`Preferred accommodation: ${tripPrefs.accommodation_type}.`);
          }
          if (Array.isArray(tripPrefs.activity_categories) && tripPrefs.activity_categories.length) {
            lines.push(
              `Wants more of: ${tripPrefs.activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (
            Array.isArray(tripPrefs.avoid_activity_categories) &&
            tripPrefs.avoid_activity_categories.length
          ) {
            lines.push(
              `Wants to avoid: ${tripPrefs.avoid_activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (tripPrefs.group_type) {
            lines.push(`Group type: ${tripPrefs.group_type}.`);
          }
          if (tripPrefs.safety_notes) {
            lines.push(`Safety notes: ${tripPrefs.safety_notes}.`);
          }
          if (tripPrefs.accessibility_notes) {
            lines.push(`Accessibility notes: ${tripPrefs.accessibility_notes}.`);
          }
          if (tripPrefs.custom_requests) {
            lines.push(`Custom requests: ${tripPrefs.custom_requests}.`);
          }

          if (lines.length) {
            tripPreferenceContext = lines.join(' ');
          }
        }
      } catch (tripLoadError) {
        console.error('Error loading trip context/preferences for chat stream:', tripLoadError);
      }
    }

    // Build system prompt differently depending on whether we're exploring destinations
    // or chatting inside a specific trip.
    let systemPrompt;
    if (parsedTripId) {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop.

The user is already planning a specific trip. ${tripContext}

Your job is to answer concrete questions and help refine THIS trip only (activities, logistics, tips, neighborhoods, safety, etc.).

- Do NOT suggest alternative destinations unless the user explicitly says they want to change where they are going.
- Do NOT use any "Destination Idea 1/2/3" style format or propose multiple destination ideas.
- Treat the destination above as fixed and answer the user's specific question as directly and practically as possible.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

Here are the specific preferences for this trip (from trip_preference):
${tripPreferenceContext}

When you recommend activities, explain briefly why they fit these preferences.`;
    } else {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

When the user is exploring where to go, suggest up to three concrete destination ideas at a time (never more than three). Present them in this exact structured format so the UI can parse them:

Destination Idea 1: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 2: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 3: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

When you recommend activities, also explain briefly why they fit these preferences.`;
    }

    // To avoid hitting TPM / context limits on the model, only send the
    // most recent slice of the conversation to the LLM.
    const MAX_CONTEXT_MESSAGES = 12;
    const trimmedHistory =
      conversationHistory.length > MAX_CONTEXT_MESSAGES
        ? conversationHistory.slice(-MAX_CONTEXT_MESSAGES)
        : conversationHistory;

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...trimmedHistory,
      {
        role: 'user',
        content: message
      }
    ];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Save user message to database (with tripId if provided)
    await saveMessage(userId, 'user', message, parsedTripId);

    try {
      let fullResponse = '';

      // Stream the response from OpenAI
      const stream = await openaiClient.chat.completions.create({
        model: chatModel,
        messages: messages,
        stream: true,
      });

      // Send each chunk as it arrives
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({
            content: content,
            done: false
          })}\n\n`);
        }
      }

      // Save assistant response to database (with tripId if provided)
      if (fullResponse) {
        await saveMessage(userId, 'assistant', fullResponse, parsedTripId);
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({
        error: streamError.message,
        done: true
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('OpenAI stream chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to stream response from LLM',
        error: error.message
      });
    }
  }
});

// Silent airport code lookup - doesn't save to chat history
// Returns the 3 closest airports to the given location
router.post('/airport-code', authenticateToken, async (req, res) => {
  try {
    const { location } = req.body;
    const userId = req.user.userId;

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    const prompt = `Given the location "${location}", provide the 3 closest airports sorted by distance (closest first).
For each airport, provide the 3-letter IATA airport code in uppercase, the full airport name, and the approximate distance in miles.
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "airports": [
    {"code": "JFK", "name": "John F. Kennedy International Airport", "distance_miles": 15},
    {"code": "LGA", "name": "LaGuardia Airport", "distance_miles": 8},
    {"code": "EWR", "name": "Newark Liberty International Airport", "distance_miles": 18}
  ]
}
If you cannot find 3 airports, return as many as you can find (minimum 1). Only include valid 3-letter IATA codes.`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at finding airports near locations. Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0]?.message?.content || '';
    let airports = [];

    try {
      // Parse JSON response
      const parsed = JSON.parse(response);

      if (parsed.airports && Array.isArray(parsed.airports)) {
        // Extract valid airport codes (3-letter uppercase)
        airports = parsed.airports
          .filter(airport => airport && airport.code && /^[A-Z]{3}$/.test(airport.code))
          .slice(0, 3) // Ensure max 3 airports
          .map(airport => ({
            code: airport.code,
            name: airport.name || '',
            distance_miles: airport.distance_miles || null
          }));
      }
    } catch (parseError) {
      // Fallback: try to extract codes from text using regex
      console.warn('Failed to parse JSON response, attempting regex extraction:', parseError);
      const codeMatches = response.matchAll(/\b([A-Z]{3})\b/g);
      const uniqueCodes = [...new Set(Array.from(codeMatches).map(m => m[1]))]
        .filter(code => code !== 'UNKNOWN')
        .slice(0, 3);

      airports = uniqueCodes.map(code => ({
        code: code,
        name: '',
        distance_miles: null
      }));
    }

    // Ensure we have at least one airport
    if (airports.length === 0) {
      return res.status(200).json({
        success: false,
        airport_code: null,
        airport_codes: [],
        message: "Could not determine airport codes for this location"
      });
    }

    // Extract just the codes for backward compatibility and convenience
    const airportCodes = airports.map(a => a.code);
    const primaryAirportCode = airportCodes[0]; // Closest airport

    res.status(200).json({
      success: true,
      airport_code: primaryAirportCode, // Backward compatibility - returns closest airport
      airport_codes: airportCodes, // Array of all airport codes
      airports: airports, // Full details including names and distances
      message: `Found ${airports.length} airport(s) near ${location}`
    });
  } catch (error) {
    console.error('Error getting airport codes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get airport codes',
      error: error.message
    });
  }
});

// Export helpers so other routes (ex. trip itinerary generation, trip creation)
// can persist chat messages and reuse extraction logic in a consistent way.
export { saveMessage, loadConversationHistory, extractTripInfo, fetchDestinationImage };

export default router;

