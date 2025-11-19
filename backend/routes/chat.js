// backend/routes/chat.js
import express from 'express';
import OpenAI from 'openai';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize Groq client (OpenAI-compatible API)
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

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

If the message is clearly about creating a new trip (e.g., "I want to go to X", "plan a trip to Y", "I'd like to visit Z"), set is_trip_request to true. Otherwise false.`;

    const completion = await groqClient.chat.completions.create({
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

    return parsed;
  } catch (error) {
    console.error('Error extracting trip info:', error);
    // Fallback: try to extract destination manually
    const destinationMatch = message.match(/\bto\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/i);
    return {
      destination: destinationMatch ? destinationMatch[1].trim() : null,
      start_date: null,
      end_date: null,
      num_travelers: null,
      total_budget: null,
      is_trip_request: destinationMatch !== null || /want.*go|plan.*trip|visit|travel/i.test(message)
    };
  }
}

// Helper function to create a trip
async function createTrip(userId, tripInfo, imageUrl = null) {
  try {
    // Build trip data only from fields we actually have, and let the
    // database schema decide which fields can be null or have defaults.
    const tripData = {
      user_id: userId,
      trip_status: 'draft',
      // Title is required by the schema, so always provide at least a generic one
      title: tripInfo.destination ? `Trip to ${tripInfo.destination}` : 'My Trip',
    };

    if (tripInfo.destination) {
      tripData.destination = tripInfo.destination;
    }

    if (tripInfo.start_date) {
      tripData.start_date = tripInfo.start_date;
    }
    if (tripInfo.end_date) {
      tripData.end_date = tripInfo.end_date;
    }
    if (tripInfo.num_travelers !== null && tripInfo.num_travelers !== undefined) {
      tripData.num_travelers = tripInfo.num_travelers;
    }
    if (tripInfo.total_budget !== null && tripInfo.total_budget !== undefined) {
      tripData.total_budget = parseFloat(tripInfo.total_budget);
    }
    if (imageUrl) {
      tripData.image_url = imageUrl;
    }

    // First attempt: insert with all fields (including image_url)
    let { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    // If the error is specifically about image_url not existing in the schema,
    // retry the insert without the image_url field so that trip creation
    // still succeeds even if the database schema is older.
    if (error && error.message && error.message.includes('image_url')) {
      console.warn('⚠️ trip.image_url column missing in DB schema. Retrying trip insert without image_url.');
      const { image_url, ...tripDataWithoutImage } = tripData;

      const retryResult = await supabase
        .from('trip')
        .insert([tripDataWithoutImage])
        .select()
        .single();

      if (retryResult.error) {
        console.error('Error creating trip on retry without image_url:', retryResult.error);
        throw retryResult.error;
      }

      return retryResult.data;
    }

    if (error) {
      console.error('Error creating trip:', error);
      throw error;
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
    const { message, model, tripId } = req.body;

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

    // If no tripId provided, always create a new trip record for this chat "session"
    // so that chat-created trips always have a corresponding row in the trip table.
    if (!parsedTripId) {
      console.log('🔍 No tripId provided, extracting trip info from message to create a new trip...');
      const tripInfo = await extractTripInfo(message);
      console.log('📋 Extracted trip info for new trip:', tripInfo);

      // Generate image URL for destination using Unsplash Source API when we have one
      let imageUrl = null;
      if (tripInfo.destination) {
        imageUrl = `https://source.unsplash.com/800x450/?${encodeURIComponent(tripInfo.destination)},travel`;
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

    // Load conversation history from database (filtered by tripId if provided)
    const conversationHistory = await loadConversationHistory(userId, parsedTripId);
    console.log(`📚 Loaded ${conversationHistory.length} messages from history for tripId: ${parsedTripId}`);

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array from conversation history + new message
    const messages = [
      // System prompt for travel assistant
      {
        role: 'system',
        content: 'You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.'
      },
      // Add conversation history from database
      ...conversationHistory,
      // Add current message
      {
        role: 'user',
        content: message
      }
    ];

    console.log(`📝 Built messages array with ${messages.length} total messages (including system)`);

    // Save user message to database (with tripId if provided or created)
    // Note: parsedTripId may have been set by trip creation above
    console.log(`💾 Saving user message with tripId: ${parsedTripId} for user ${userId}`);
    await saveMessage(userId, 'user', message, parsedTripId);

    // Call Groq API
    console.log(`🤖 Calling Groq API with model: ${chatModel}`);
    let assistantMessage;
    try {
      const completion = await groqClient.chat.completions.create({
        model: chatModel,
        messages: messages,
      });

      assistantMessage = completion.choices[0]?.message?.content || 'Sorry, I did not receive a response.';
      console.log(`✅ Received response from Groq (${assistantMessage.length} characters)`);
    } catch (groqError) {
      console.error('❌ Groq API error:', groqError);
      throw groqError;
    }

    // Save assistant response to database (with tripId if provided or created)
    console.log(`💾 Saving assistant message with tripId: ${parsedTripId} for user ${userId}`);
    await saveMessage(userId, 'assistant', assistantMessage, parsedTripId);

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
    console.error('Groq chat error:', error);

    // Check if it's an authentication error
    if (error.status === 401 || error.message?.includes('API key')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Groq API key. Please check your configuration.',
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

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.'
      },
      ...conversationHistory,
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

      // Stream the response from Groq
      const stream = await groqClient.chat.completions.create({
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
    console.error('Groq stream chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to stream response from LLM',
        error: error.message
      });
    }
  }
});

export default router;

