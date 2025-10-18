// backend/db/init.js
import fs from 'fs';
import path from 'path';
import pool from './connection.js';

export async function initializeDB() {
  try {
    const schemaPath = path.join(process.cwd(), 'backend/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Initializing database schema...');
    await pool.query(schema);

    console.log('Database schema ensured.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Optional: allow running this file directly
if (process.argv[1].includes('init.js')) {
  initializeDB().then(() => {
    console.log('Database setup complete.');
    process.exit(0);
  });
}
