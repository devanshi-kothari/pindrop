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

    if (tripId) {
      messageData.trip_id = tripId;
    }

    const { error } = await supabase
      .from('chat_message')
      .insert([messageData]);

    if (error) {
      console.error('Error saving message:', error);
    }
  } catch (error) {
    console.error('Error saving message:', error);
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

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const parsedTripId = tripId ? parseInt(tripId) : null;

    // Load conversation history from database (filtered by tripId if provided)
    const conversationHistory = await loadConversationHistory(userId, parsedTripId);

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

    // Save user message to database (with tripId if provided)
    await saveMessage(userId, 'user', message, parsedTripId);

    // Call Groq API
    const completion = await groqClient.chat.completions.create({
      model: chatModel,
      messages: messages,
    });

    const assistantMessage = completion.choices[0]?.message?.content || 'Sorry, I did not receive a response.';

    // Save assistant response to database (with tripId if provided)
    await saveMessage(userId, 'assistant', assistantMessage, parsedTripId);

    // Return the response
    res.status(200).json({
      success: true,
      message: assistantMessage,
      model: chatModel
    });
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

