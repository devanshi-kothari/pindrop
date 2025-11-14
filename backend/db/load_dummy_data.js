// backend/db/load_dummy_data.js
import bcrypt from 'bcryptjs';
import pool from './connection.js';
import dotenv from 'dotenv';

dotenv.config();

export async function loadDummyData() {
  try {
    // Generate bcrypt hash for password "password123"
    const passwordHash = await bcrypt.hash('password123', 10);

    // Insert dummy user data
    const insertQuery = `
      INSERT INTO app_user (
        name,
        email,
        password_hash,
        home_location,
        budget_preference,
        travel_style,
        liked_tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        home_location = EXCLUDED.home_location,
        budget_preference = EXCLUDED.budget_preference,
        travel_style = EXCLUDED.travel_style,
        liked_tags = EXCLUDED.liked_tags
      RETURNING user_id, name, email, home_location, budget_preference, travel_style, liked_tags;
    `;

    const values = [
      'John Doe',
      'john.doe@example.com',
      passwordHash,
      'New York, NY',
      5000.00,
      'adventure',
      ['beaches', 'mountains', 'hiking', 'photography']
    ];

    const result = await pool.query(insertQuery, values);

    console.log('SUCCESS: Dummy user data inserted successfully:');
    console.log(JSON.stringify(result.rows[0], null, 2));

    return result.rows[0];
  } catch (err) {
    console.error('ERROR: Error loading dummy data:', err);
    throw err;
  }
}

// Allow running this file directly
if (process.argv[1].includes('load_dummy_data.js')) {
  loadDummyData()
    .then(() => {
      console.log('COMPLETE: Dummy data loading complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('FAILED: Failed to load dummy data:', err);
      process.exit(1);
    });
}

