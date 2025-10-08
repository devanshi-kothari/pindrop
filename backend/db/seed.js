// backend/db/seed.js
import pool from './connection.js';
import bcrypt from 'bcryptjs';

export async function seedDB() {
  try {
    console.log('Seeding database...');

    // Create sample user
    const hashedPassword = await bcrypt.hash('password123', 12);
    const userResult = await pool.query(`
      INSERT INTO app_user (name, email, password_hash, home_location, budget_preference, travel_style, liked_tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING user_id
    `, [
      'John Doe',
      'john@example.com',
      hashedPassword,
      'New York, NY',
      5000.00,
      'adventure',
      ['hiking', 'photography', 'local-food']
    ]);

    const userId = userResult.rows[0].user_id;

    // Create sample trip
    const tripResult = await pool.query(`
      INSERT INTO trip (user_id, title, destination, start_date, end_date, total_budget, num_travelers, trip_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING trip_id
    `, [
      userId,
      'Tokyo Adventure',
      'Tokyo, Japan',
      '2024-06-01',
      '2024-06-10',
      3000.00,
      2,
      'draft'
    ]);

    const tripId = tripResult.rows[0].trip_id;

    // Create sample activities
    const activities = [
      ['Tokyo Skytree', 'Tokyo, Japan', 'sightseeing', '2 hours', 25.00, 4.5, ['landmark', 'view'], 'manual'],
      ['Sushi Making Class', 'Tokyo, Japan', 'food', '3 hours', 80.00, 4.8, ['cooking', 'cultural'], 'manual'],
      ['Senso-ji Temple', 'Tokyo, Japan', 'sightseeing', '1 hour', 0.00, 4.3, ['temple', 'cultural'], 'manual'],
      ['Shibuya Crossing', 'Tokyo, Japan', 'sightseeing', '30 minutes', 0.00, 4.2, ['landmark', 'urban'], 'manual']
    ];

    for (const activity of activities) {
      await pool.query(`
        INSERT INTO activity (name, location, category, duration, cost_estimate, rating, tags, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, activity);
    }

    // Create sample itinerary for first day
    const itineraryResult = await pool.query(`
      INSERT INTO itinerary (trip_id, day_number, date, summary, progress)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING itinerary_id
    `, [
      tripId,
      1,
      '2024-06-01',
      'Arrival and first day exploration',
      'in_progress'
    ]);

    console.log('Database seeded successfully.');
  } catch (err) {
    console.error('Error seeding database:', err);
    throw err;
  }
}

// Allow running this file directly
if (process.argv[1].includes('seed.js')) {
  seedDB().then(() => {
    console.log('🎉 Database seeding complete.');
    process.exit(0);
  }).catch((err) => {
    console.error('Failed to seed database:', err);
    process.exit(1);
  });
}

// seed.jsruns when you manually execute it:
// node backend/db/seed.js