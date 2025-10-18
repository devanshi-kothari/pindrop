// backend/db/reset.js
import pool from './connection.js';

export async function resetDB() {
  try {
    console.log('Resetting database...');
    
    // Drop all tables in reverse dependency order
    const dropQueries = [
      'DROP TABLE IF EXISTS user_activity_feedback CASCADE;',
      'DROP TABLE IF EXISTS itinerary_activity CASCADE;',
      'DROP TABLE IF EXISTS activity CASCADE;',
      'DROP TABLE IF EXISTS itinerary CASCADE;',
      'DROP TABLE IF EXISTS trip CASCADE;',
      'DROP TABLE IF EXISTS app_user CASCADE;',
    ];

    // Drop custom types
    const dropTypes = [
      'DROP TYPE IF EXISTS feedback_type_enum CASCADE;',
      'DROP TYPE IF EXISTS activity_source_enum CASCADE;',
      'DROP TYPE IF EXISTS activity_category_enum CASCADE;',
      'DROP TYPE IF EXISTS itinerary_progress_enum CASCADE;',
      'DROP TYPE IF EXISTS trip_status_enum CASCADE;',
      'DROP TYPE IF EXISTS travel_style_enum CASCADE;',
    ];

    for (const query of [...dropTypes, ...dropQueries]) {
      await pool.query(query);
    }

    console.log('Database reset complete.');
  } catch (err) {
    console.error('Error resetting database:', err);
    throw err;
  }
}

// Allow running this file directly
if (process.argv[1].includes('reset.js')) {
  resetDB().then(() => {
    console.log('Database reset complete.');
    process.exit(0);
  }).catch((err) => {
    console.error('Failed to reset database:', err);
    process.exit(1);
  });
}

// the reset.js file only runs when you manually execute it, like this:
// node backend/db/reset.js

