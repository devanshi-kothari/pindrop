// backend/db/init_db.js
// Run this script to initialize the Supabase database with the schema
// Usage: docker compose exec backend node backend/db/init_db.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase database connection (using pooler connection string for IPv4 compatibility)
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL environment variable is required!');
  console.error('');
  console.error('Get your database connection string from:');
  console.error('  Supabase Dashboard > Settings > Database > Connection String');
  console.error('  Use the "Transaction" mode pooler connection string (IPv4 compatible)');
  console.error('');
  console.error('Then add it to your .env file:');
  console.error('  SUPABASE_DB_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres');
  process.exit(1);
}

async function executeSQLFile(pool, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Executing ${path.basename(filePath)}...`);

  try {
    await pool.query(sql);
    console.log(`SUCCESS: ${path.basename(filePath)} executed successfully.`);
  } catch (error) {
    console.error(`ERROR: Failed to execute ${path.basename(filePath)}:`, error.message);
    throw error;
  }
}

async function initializeDatabase() {
  // Use pooler connection string (IPv4 compatible)
  const pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false, // Supabase requires SSL
    },
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected to Supabase database.');

    // Get path to schema SQL file (relative to project root)
    const projectRoot = path.resolve(__dirname, '../..');
    const schemaSQLPath = path.join(projectRoot, 'supabase', 'schema.sql');

    // Check if file exists
    if (!fs.existsSync(schemaSQLPath)) {
      throw new Error(`Schema SQL file not found: ${schemaSQLPath}`);
    }

    console.log('Initializing database with schema.sql...');
    await executeSQLFile(pool, schemaSQLPath);

    console.log('COMPLETE: Database initialization complete!');
  } catch (error) {
    console.error('FAILED: Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the initialization
initializeDatabase();

