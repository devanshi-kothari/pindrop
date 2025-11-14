// backend/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pool from './db/connection.js';
import { initializeDB } from './db/init.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
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
    const result = await pool.query('SELECT NOW()');
    res.status(200).json({
      status: 'OK',
      database: 'Connected',
      timestamp: result.rows[0]
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
      testUsers: '/api/users/test'
    }
  });
});

// Test endpoint to verify dummy data
app.get('/api/users/test', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        user_id,
        name,
        email,
        home_location,
        budget_preference,
        travel_style,
        liked_tags,
        created_at
      FROM app_user
      ORDER BY user_id
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();