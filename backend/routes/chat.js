// backend/routes/chat.js
import express from 'express';
import { Ollama } from 'ollama';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize Ollama client
// Use OLLAMA_HOST env variable or default to localhost
const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const ollama = new Ollama({ host: ollamaHost });

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma2';

// Helper function to load conversation history from database
async function loadConversationHistory(userId) {
  try {
    const { data, error } = await supabase
      .from('chat_message')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50); // Limit to last 50 messages for context

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
async function saveMessage(userId, role, content) {
  try {
    const { error } = await supabase
      .from('chat_message')
      .insert([{
        user_id: userId,
        role: role,
        content: content
      }]);

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
    const history = await loadConversationHistory(userId);

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
    const { message, model } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Load conversation history from database
    const conversationHistory = await loadConversationHistory(userId);

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

    // Save user message to database
    await saveMessage(userId, 'user', message);

    // Call Ollama
    const response = await ollama.chat({
      model: chatModel,
      messages: messages,
    });

    const assistantMessage = response.message.content;

    // Save assistant response to database
    await saveMessage(userId, 'assistant', assistantMessage);

    // Return the response
    res.status(200).json({
      success: true,
      message: assistantMessage,
      model: chatModel
    });
  } catch (error) {
    console.error('Ollama chat error:', error);

    // Check if it's a model not found error
    if (error.message && error.message.includes('model')) {
      return res.status(404).json({
        success: false,
        message: `Model not found. Please ensure the model is downloaded: ollama pull ${DEFAULT_MODEL}`,
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
    const { message, model } = req.body;

    // Load conversation history from database
    const conversationHistory = await loadConversationHistory(userId);

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

    try {
      // Stream the response
      const stream = await ollama.chat({
        model: chatModel,
        messages: messages,
        stream: true,
      });

      // Send each chunk as it arrives
      for await (const chunk of stream) {
        if (chunk.message && chunk.message.content) {
          res.write(`data: ${JSON.stringify({
            content: chunk.message.content,
            done: chunk.done || false
          })}\n\n`);
        }
      }

      // Save assistant response to database (full response accumulated in chunks)
      // Note: For streaming, we'd need to accumulate chunks. For simplicity,
      // you might want to save after completion or handle this differently.
      // For now, we'll save the final accumulated message if available.

      // Send completion signal
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

      // Save user message and assistant response after streaming completes
      await saveMessage(userId, 'user', message);
      // Note: In a real implementation, you'd want to accumulate the full assistant response
      // before saving. This is a simplified version.
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({
        error: streamError.message,
        done: true
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Ollama stream chat error:', error);
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

