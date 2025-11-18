// run node backend/db/load_dummy_data.js to test

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import supabase from '../supabaseClient.js';

dotenv.config();

export async function loadDummyData() {
  try {
    // Generate bcrypt hash for password "password123"
    const passwordHash = await bcrypt.hash('password123', 10);

    const dummyUser = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password_hash: passwordHash,
      home_location: 'New York, NY',
      budget_preference: 5000.0,
      travel_style: 'adventure',
      liked_tags: ['beaches', 'mountains', 'hiking', 'photography'],
    };

    const { data, error } = await supabase
      .from('app_user')
      .upsert(dummyUser, { onConflict: 'email' })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('SUCCESS: Dummy user data inserted/updated successfully:');
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (err) {
    console.error('ERROR: Error loading dummy data:', err);
    throw err;
  }
}

// Allow running this file directly
if (process.argv[1] && process.argv[1].includes('load_dummy_data.js')) {
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
