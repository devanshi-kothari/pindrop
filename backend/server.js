// backend/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import supabase from './supabaseClient.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import tripRoutes from './routes/trips.js';
import imageRoutes from './routes/images.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow iframe embedding if needed
  contentSecurityPolicy: false, // Disable CSP to avoid CSRF-like issues in development
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database health check
app.get('/api/health/db', async (req, res) => {
  try {
    const { error } = await supabase
      .from('app_user')
      .select('user_id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      throw error;
    }

    res.status(200).json({
      status: 'OK',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Pindrop Travel API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      dbHealth: '/api/health/db',
      api: '/api',
      testUsers: '/api/users/test',
      auth: {
        signup: 'POST /api/auth/signup',
        login: 'POST /api/auth/login'
      },
      chat: {
        history: 'GET /api/chat/history',
        chat: 'POST /api/chat/chat',
        chatStream: 'POST /api/chat/chat/stream'
      },
      trips: {
        list: 'GET /api/trips?status=draft|planned|archived',
        get: 'GET /api/trips/:tripId',
        create: 'POST /api/trips',
        update: 'PUT /api/trips/:tripId',
        delete: 'DELETE /api/trips/:tripId'
      },
      images: {
        destination: 'GET /api/images/destination?destination=...'
      }
    }
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Chat/LLM routes
app.use('/api/chat', chatRoutes);

// Trip routes
app.use('/api/trips', tripRoutes);

// Image routes
app.use('/api/images', imageRoutes);

// Test endpoint to verify Supabase data
app.get('/api/users/test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_user')
      .select(
        'user_id, name, email, home_location, budget_preference, travel_style, liked_tags, created_at'
      )
      .order('user_id');

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      count: data.length,
      users: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
