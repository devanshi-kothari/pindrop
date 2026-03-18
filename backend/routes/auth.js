// backend/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../supabaseClient.js';

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      home_location,
      budget_preference,
      travel_style,
      liked_tags,
      restaurant_meals_per_day,
      restaurant_meal_types,
      restaurant_cuisine_types,
      restaurant_dietary_restrictions,
      restaurant_min_price_range,
      restaurant_max_price_range,
      restaurant_custom_requests,
    } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('app_user')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    // Handle any unexpected errors
    if (checkError) {
      console.error('Error checking existing user:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error checking user existence'
      });
    }

    // If user exists
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Prepare user data
    const userData = {
      name,
      email,
      password_hash: passwordHash,
    };

    // Add optional fields if provided
    if (home_location) userData.home_location = home_location;
    if (budget_preference !== undefined && budget_preference !== null) {
      userData.budget_preference = parseFloat(budget_preference);
    }
    if (travel_style) userData.travel_style = travel_style;
    if (liked_tags && Array.isArray(liked_tags)) {
      userData.liked_tags = liked_tags;
    }

    // Restaurant preference fields (flat columns)
    if (restaurant_meals_per_day !== undefined && restaurant_meals_per_day !== null) {
      userData.restaurant_meals_per_day =
        typeof restaurant_meals_per_day === 'number'
          ? restaurant_meals_per_day
          : parseInt(restaurant_meals_per_day, 10);
    }
    if (Array.isArray(restaurant_meal_types)) {
      userData.restaurant_meal_types = restaurant_meal_types;
    }
    if (Array.isArray(restaurant_cuisine_types)) {
      userData.restaurant_cuisine_types = restaurant_cuisine_types;
    }
    if (Array.isArray(restaurant_dietary_restrictions)) {
      userData.restaurant_dietary_restrictions = restaurant_dietary_restrictions;
    }
    if (restaurant_min_price_range !== undefined) {
      userData.restaurant_min_price_range =
        restaurant_min_price_range === null || restaurant_min_price_range === ''
          ? null
          : restaurant_min_price_range;
    }
    if (restaurant_max_price_range !== undefined) {
      userData.restaurant_max_price_range =
        restaurant_max_price_range === null || restaurant_max_price_range === ''
          ? null
          : restaurant_max_price_range;
    }
    if (restaurant_custom_requests !== undefined) {
      userData.restaurant_custom_requests =
        typeof restaurant_custom_requests === 'string' && restaurant_custom_requests.trim().length > 0
          ? restaurant_custom_requests.trim()
          : null;
    }

    const { data: newUser, error: insertError } = await supabase
      .from('app_user')
      .insert([userData])
      .select(
        'user_id, name, email, home_location, budget_preference, travel_style, liked_tags, restaurant_meals_per_day, restaurant_meal_types, restaurant_cuisine_types, restaurant_dietary_restrictions, restaurant_min_price_range, restaurant_max_price_range, restaurant_custom_requests, created_at'
      )
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user account',
        error: insertError.message
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.user_id, email: newUser.email },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: newUser,
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during signup',
      error: error.message
    });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const { data: user, error: fetchError } = await supabase
      .from('app_user')
      .select(
        'user_id, name, email, password_hash, home_location, budget_preference, travel_style, liked_tags, restaurant_meals_per_day, restaurant_meal_types, restaurant_cuisine_types, restaurant_dietary_restrictions, restaurant_min_price_range, restaurant_max_price_range, restaurant_custom_requests, created_at'
      )
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login',
      error: error.message
    });
  }
});

export default router;

