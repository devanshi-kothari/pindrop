// backend/routes/trips.js
import express from 'express';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { saveMessage, extractTripInfo, fetchDestinationImage } from './chat.js';

const router = express.Router();

// Initialize OpenAI client for itinerary generation
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

const GOOGLE_CUSTOM_SEARCH_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const GOOGLE_CUSTOM_SEARCH_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function generateTripTitleFromMessage(message) {
  if (!message || typeof message !== 'string') return null;
  try {
    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise travel assistant. Given a user message about a trip they want to plan, respond ONLY with a short, human-friendly trip title in at most 6 words. Do not include quotes or extra commentary. Never invent a destination or country that the user did not explicitly mention. If the user does not clearly name a specific place, keep the title generic (for example, "Spring Break Trip", "Summer Road Trip with Friends"). Only include a city, region, or country name in the title if it appears clearly in the user message.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.4,
      max_tokens: 32,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const cleaned = String(raw).trim().replace(/^["'\s]+|["'\s]+$/g, '');
    return cleaned || null;
  } catch (error) {
    console.error('Error generating trip title from message:', error);
    return null;
  }
}

function normalizeDestinationName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to check if a URL is from a low-quality or irrelevant domain
function isLowQualityLink(url) {
  if (!url || typeof url !== 'string') return true;

  const urlLower = url.toLowerCase();
  const badDomains = [
    'facebook.com',
    'fb.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'linkedin.com',
    'pinterest.com',
    'reddit.com',
    'nih.gov',
    'cdc.gov',
    'wikipedia.org',
    'youtube.com',
    'tiktok.com',
    'snapchat.com',
    'tumblr.com',
    'flickr.com',
    'imgur.com',
  ];

  return badDomains.some(domain => urlLower.includes(domain));
}

// Helper function to check if a link appears to be a collection/list page
function isCollectionLink(url, title, snippet) {
  if (!url || typeof url !== 'string') return false;

  const urlLower = url.toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const snippetLower = (snippet || '').toLowerCase();

  // Check URL patterns
  const collectionUrlPatterns = [
    /\/list\//,
    /\/top-?\d+/,
    /\/best-?\d+/,
    /\/things-to-do/,
    /\/activities/,
    /\/attractions/,
    /\/guide/,
    /\/blog/,
    /\/article/,
  ];

  if (collectionUrlPatterns.some(pattern => pattern.test(urlLower))) {
    return true;
  }

  // Check title/snippet patterns
  const collectionTextPatterns = [
    /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see)/i,
    /\b(list|guide|blog|article)\b/i,
  ];

  const combinedText = `${titleLower} ${snippetLower}`;
  if (collectionTextPatterns.some(pattern => pattern.test(combinedText))) {
    return true;
  }

  return false;
}

// Function to find a better link for a specific activity
async function findBetterActivityLink(activityName, destination) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    return null;
  }

  if (!activityName || activityName.length < 3) {
    return null;
  }

  try {
    // Create a specific search query for this activity
    const cleanActivityName = activityName
      .replace(/^(visit|explore|see|tour|experience|go to|check out)\s+/i, '')
      .trim();

    const query = destination
      ? `"${cleanActivityName}" ${destination} official website`
      : `"${cleanActivityName}" official website`;

    const params = new URLSearchParams({
      key: GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: GOOGLE_CUSTOM_SEARCH_CX,
      q: query,
      num: '5', // Get a few results to find a good one
      safe: 'active',
    });

    const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return null;
    }

    // Find the first result that:
    // 1. Is not a low-quality link
    // 2. Is not a collection page
    // 3. Appears to be about the specific activity
    for (const item of data.items) {
      const itemLink = item.link || '';
      const itemTitle = item.title || '';
      const itemSnippet = item.snippet || '';

      // Skip low-quality links
      if (isLowQualityLink(itemLink)) {
        continue;
      }

      // Skip collection pages
      if (isCollectionLink(itemLink, itemTitle, itemSnippet)) {
        continue;
      }

      // Check if the title/snippet mentions the activity name
      const combinedText = `${itemTitle} ${itemSnippet}`.toLowerCase();
      const activityNameLower = cleanActivityName.toLowerCase();
      const activityWords = activityNameLower.split(/\s+/).filter(w => w.length > 3);

      // If at least one significant word from the activity name appears, it's likely relevant
      if (activityWords.length > 0 && activityWords.some(word => combinedText.includes(word))) {
        return itemLink;
      }
    }

    // If no perfect match, return the first non-low-quality, non-collection link
    for (const item of data.items) {
      const itemLink = item.link || '';
      if (!isLowQualityLink(itemLink) && !isCollectionLink(itemLink, item.title, item.snippet)) {
        return itemLink;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding better activity link:', error);
    return null;
  }
}

async function generateRefinedSearchQuery(trip, preferences, userProfile, activityPreferences) {
  // Improved query generation with category diversification
  try {
    const destination = trip?.destination || '';

    // Derive season/month context from preferences.start_date if available
    let seasonalQualifier = '';
    if (preferences?.start_date) {
      const date = new Date(preferences.start_date);
      if (!Number.isNaN(date.getTime())) {
        const month = date.getMonth() + 1; // 1-12
        const monthName = date.toLocaleString('default', { month: 'long' });
        let season = '';
        if (month >= 12 || month <= 2) season = 'winter';
        else if (month >= 3 && month <= 5) season = 'spring';
        else if (month >= 6 && month <= 8) season = 'summer';
        else season = 'fall';

        // e.g. "winter (December)" or "summer (July)"
        seasonalQualifier = `${season} (${monthName})`;
      }
    }

    // Build queries that diversify categories
    let queries = [];

    // Get activity categories to include
    const includeCategories = Array.isArray(preferences?.activity_categories)
      ? preferences.activity_categories
      : [];

    // Get categories to avoid
    const avoidCategories = Array.isArray(preferences?.avoid_activity_categories)
      ? preferences.avoid_activity_categories
      : [];

    // If we have specific categories, create separate queries for each to ensure diversity
    if (includeCategories.length > 0) {
      // Create one query per category to ensure we get diverse results
      for (const category of includeCategories.slice(0, 5)) { // Limit to 5 categories max
        if (destination) {
          if (seasonalQualifier) {
            // e.g. "winter things to do in New York, museums"
            queries.push(`${seasonalQualifier} ${category} ${destination}`);
          } else {
            queries.push(`${category} ${destination}`);
          }
        } else {
          queries.push(category);
        }
      }
    }

    // If no specific categories, create a general query
    if (queries.length === 0) {
      if (destination) {
        if (seasonalQualifier) {
          queries.push(`${seasonalQualifier} things to do ${destination}`);
        } else {
          queries.push(`things to do ${destination}`);
        }
      } else {
        queries.push('travel activities');
      }
    }

    // For now, return the first query (we'll handle multiple queries in the caller)
    // This ensures we get diverse results by making multiple search calls
    const query = queries[0];
    console.log('[activities] Generated Google query:', query, '| Categories to avoid:', avoidCategories);

    return { query, avoidCategories, allQueries: queries };
  } catch (error) {
    console.error('Error generating refined search query:', error);
    // Fallback to very simple query
    if (trip?.destination) {
      return { query: `things to do ${trip.destination}`, avoidCategories: [], allQueries: [] };
    }
    return { query: 'travel activities', avoidCategories: [], allQueries: [] };
  }
}

async function fetchActivitySearchResults(query, num = 10) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    console.warn('Google Custom Search API env vars are not set. Activity generation will be disabled.');
    return [];
  }

  // Google Custom Search only allows num between 1 and 10
  const safeNum = Math.max(1, Math.min(num, 10));

  console.log('[activities] Calling Google Custom Search with query:', query, 'num:', safeNum);

  const params = new URLSearchParams({
    key: GOOGLE_CUSTOM_SEARCH_API_KEY,
    cx: GOOGLE_CUSTOM_SEARCH_CX,
    q: query,
    num: String(safeNum),
    safe: 'active',
  });

  const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
  console.log('[activities] Google Custom Search URL:', url);

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    console.error('Google Custom Search API error (activities):', response.status, text);
    return [];
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) {
    console.log('[activities] Google Custom Search returned no items.');
    return [];
  }

  console.log('[activities] Google Custom Search returned', data.items.length, 'items.');
  return data.items;
}

async function extractActivityNameFromSearchResult(item, destination, preferences, userProfile) {
  const title = item.title || '';
  const snippet = item.snippet || '';
  const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;

  // Determine season/context from dates
  let seasonalContext = '';
  let dateContext = '';
  if (preferences?.start_date) {
    const date = new Date(preferences.start_date);
    const month = date.getMonth() + 1; // 1-12
    const monthName = date.toLocaleString('default', { month: 'long' });
    if (month >= 12 || month <= 2) seasonalContext = 'winter';
    else if (month >= 3 && month <= 5) seasonalContext = 'spring';
    else if (month >= 6 && month <= 8) seasonalContext = 'summer';
    else seasonalContext = 'fall';
    dateContext = `${monthName} ${date.getFullYear()}`;
  }

  // Try LLM extraction, but be very lenient with fallbacks
  try {
    const prompt = `You are a travel activity extraction expert. Given a search result from Google, extract the SPECIFIC ACTIVITY NAME that is located at or near the destination, not the article title.

SEARCH RESULT:
Title: ${title}
Snippet: ${snippet}
Destination: ${destination || 'not specified'}
Travel Dates: ${dateContext || 'not specified'}
Season: ${seasonalContext || 'not specified'}

USER CONTEXT:
- Activity interests: ${Array.isArray(preferences?.activity_categories) && preferences.activity_categories.length > 0 ? preferences.activity_categories.join(', ') : 'not specified'}
- Group type: ${preferences?.group_type || 'not specified'}
- Travel style: ${userProfile?.travel_style || 'not specified'}
- Liked tags: ${Array.isArray(userProfile?.liked_tags) && userProfile.liked_tags.length > 0 ? userProfile.liked_tags.join(', ') : 'none'}

INSTRUCTIONS:
1. Extract ANY activity name from the search result that could be at "${destination}".
2. If it's a list article, extract the FIRST activity mentioned in the snippet or title.
3. If the title looks like an activity name, use it (even if it's not perfect).
4. **When season or dates are specified, strongly prefer activities, events, or experiences that are especially relevant to that time of year** (for example, winter villages, holiday markets, seasonal light shows, cherry blossom festivals, summer-only rooftop events).
5. Be very lenient - it's better to extract something than return "SKIP".
6. Keep it 2-10 words.
7. Only return "SKIP" if the search result is completely unrelated to activities or travel.

Examples of good extractions:
- "10 Best Things to Do in Paris" → "Eiffel Tower" or "Visit the Eiffel Tower"
- "Paris Museums Guide" → "Louvre Museum" or "Explore Paris Museums"
- "Things to Do in Paris in December" → "Christmas market at Champs-Élysées" or another clearly seasonal December activity
- "Winter in New York City: What to Do" → "Bryant Park Winter Village" or "Rockefeller Center Christmas Tree"

Return ONLY the activity name or "SKIP", nothing else. No quotes, no explanations.`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting specific travel activity names from search results. Extract the actual activity name from the search result, even if it comes from a list article. Focus on finding real activities at the destination. Only return "SKIP" if absolutely no activity can be found.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 50,
    });

    const extractedName = completion.choices[0]?.message?.content?.trim() || '';
    let cleaned = extractedName.replace(/^["']|["']$/g, '').trim();

    // If the model accidentally returned an article-style title (e.g. "10 Best Things to Do in Paris"),
    // treat it as unusable and fall back to snippet-based extraction instead.
    const articleLikePattern =
      /\b(top|best|\d+)\b.*\b(things to do|activities|places|attractions|guide|blog|list)\b/i;
    if (cleaned && articleLikePattern.test(cleaned)) {
      cleaned = '';
    }

    // If LLM says to skip, returns an empty/bad string, or we flagged it as article-like,
    // try aggressive fallback extraction from the snippet/title.
    if (cleaned === 'SKIP' || !cleaned || cleaned.length < 3) {
      // Try to extract from snippet using multiple patterns (from most specific to most general)
      const activityPatterns = [
        // Pattern 1: Action verb + "the" + capitalized place name
        /(?:visit|explore|see|tour|experience|check out|go to|walk|hike|climb|swim|sail|ride|enjoy|discover)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
        // Pattern 2: "the" + capitalized name
        /(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
        // Pattern 3: Any capitalized phrase (2-5 words) - most lenient fallback
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/,
      ];

      // Try snippet first, then title
      const textsToSearch = [snippet, title];
      for (const text of textsToSearch) {
        if (!text) continue;
        for (const pattern of activityPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const extracted = match[1].trim();
            // Verify it's a reasonable length
            if (extracted.length > 2 && extracted.length < 80) {
              return extracted;
            }
          }
        }
      }

      // Aggressive fallback: clean the title and use it
      if (title && title.length > 3 && title.length < 100) {
        // Remove list indicators and common prefixes
        let cleanedTitle = title
          .replace(/^(top|best|\d+|the|a|an)\s+/i, '')
          .replace(/\s+(in|at|near|around|guide|list|article|blog|website|click|read|more|here|now)\s*$/i, '')
          .trim();

        // If we have something reasonable, use it
        if (cleanedTitle.length > 3 && cleanedTitle.length < 80) {
          return cleanedTitle;
        }
        // Even if cleaning didn't help much, use the original title if it's not obviously bad
        if (!pureListPattern.test(title) && !/(\.com|\.org|\.net|www\.|http|https)/i.test(title)) {
          return title.trim();
        }
      }

      // Last resort: use destination + generic activity
      if (destination) {
        return `Activities in ${destination}`;
      }

      // Final fallback: just use a cleaned version of the title
      return title.trim() || 'Activity';
    }

    // Very lenient validation - only filter out the most obvious non-activities
    // Allow most things through
    const urlPattern = /(\.com|\.org|\.net|www\.|http|https)/i;
    if (urlPattern.test(cleaned)) {
      // If it's a URL, try to extract something from the title instead
      if (title && title.length > 3) {
        const cleanedTitle = title.replace(/^(top|best|\d+)\s+/i, '').trim();
        if (cleanedTitle.length > 3) {
          return cleanedTitle;
        }
      }
      return null; // Skip URLs only if we can't extract anything
    }

    // Only filter out if it's clearly just "Top X Things to Do" with nothing else
    const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;
    if (pureListPattern.test(cleaned)) {
      // Try to extract from snippet or use a generic name
      if (destination) {
        return `Activities in ${destination}`;
      }
      return null; // Skip pure list titles only as last resort
    }

    return cleaned;
  } catch (error) {
    console.error('Error extracting activity name from search result:', error);
    return null;
  }
}

async function extractActivityDetails(name, snippet, link) {
  // Extract price information from snippet
  let priceRange = null;
  let costEstimate = null;
  const pricePatterns = [
    /(\$[\d,]+(?:-\$[\d,]+)?)/, // $50-$100
    /(free|no cost|no charge)/i,
    /(\d+)\s*(?:usd|dollars?)/i,
    /(budget|affordable|expensive|luxury)/i,
  ];

  const fullText = `${name} ${snippet}`.toLowerCase();
  for (const pattern of pricePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      if (match[0].includes('free') || match[0].includes('no cost')) {
        priceRange = 'Free';
        costEstimate = 0;
      } else if (match[0].includes('budget') || match[0].includes('affordable')) {
        priceRange = 'Budget-friendly';
        costEstimate = 25;
      } else if (match[0].includes('expensive') || match[0].includes('luxury')) {
        priceRange = 'Expensive';
        costEstimate = 100;
      } else {
        const priceMatch = match[0].match(/\$?(\d+)/);
        if (priceMatch) {
          const price = parseInt(priceMatch[1]);
          if (price < 20) priceRange = 'Budget-friendly';
          else if (price < 50) priceRange = 'Moderate';
          else if (price < 100) priceRange = 'Expensive';
          else priceRange = 'Luxury';
          costEstimate = price;
        }
      }
      break;
    }
  }

  // Extract duration if mentioned
  let duration = null;
  const durationPatterns = [
    /(\d+)\s*(?:hours?|hrs?)/i,
    /(\d+)\s*(?:days?)/i,
    /(half\s*day|full\s*day)/i,
  ];
  for (const pattern of durationPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      duration = match[0];
      break;
    }
  }

  return { priceRange, costEstimate, duration };
}

// Fallback: ask the LLM for typical price/duration when snippet parsing fails
async function refineActivityDetailsWithLLM(name, destination, snippet, existing) {
  try {
    // Only call the model if we are actually missing something important
    const needsCost = existing.costEstimate === null || existing.costEstimate === undefined;
    const needsDuration = !existing.duration;

    if (!needsCost && !needsDuration) {
      return existing;
    }

    const where = destination ? `${name} in ${destination}` : name;
    const questionParts = [];
    if (needsCost) {
      questionParts.push(
        '1. A realistic average price per person in USD (tickets/entry/typical spend).'
      );
    }
    if (needsDuration) {
      questionParts.push(
        '2. A realistic typical visit duration (for example "90 minutes", "2 hours", "half day").'
      );
    }

    const prompt = `You are helping plan a real-world trip. I need practical, grounded estimates for this specific activity so an itinerary and budget can be built.

Activity: "${name}"
Location context: "${destination || 'unknown'}"
Snippet/context from search results (may be incomplete): "${snippet || ''}"

Please provide:
${questionParts.join('\n')}

Rules:
- Base your answer on typical, up-to-date real-world prices and visit times for this kind of activity.
- If you are unsure, give your best conservative estimate instead of saying you don't know.
- Always respond ONLY with valid JSON, no prose, in this exact shape (include both fields, use null if absolutely no estimate is possible):
{
  "average_price_usd": number | null,
  "typical_duration": "string or null, e.g. \\"2 hours\\""
}`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a structured data assistant for travel planning. You return ONLY JSON, never explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 200,
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';

    let parsed = null;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return existing;
    }

    const refined = { ...existing };

    if (needsCost && typeof parsed.average_price_usd === 'number' && parsed.average_price_usd >= 0) {
      refined.costEstimate = parsed.average_price_usd;
    }

    if (needsDuration && typeof parsed.typical_duration === 'string' && parsed.typical_duration.trim()) {
      refined.duration = parsed.typical_duration.trim();
    }

    return refined;
  } catch (error) {
    console.error('Error refining activity details with LLM:', error);
    return existing;
  }
}

// Use Google Places Text Search to get a precise street address for an activity
async function fetchActivityAddress(name, destination) {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const parts = [];
    if (name) parts.push(name);
    if (destination) parts.push(destination);
    if (parts.length === 0) return null;

    const query = encodeURIComponent(parts.join(' '));
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('Failed to fetch activity address from Google Places:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const place = data?.results && data.results[0];
    if (!place) return null;

    return place.formatted_address || null;
  } catch (err) {
    console.error('Error fetching activity address from Google Places:', err);
    return null;
  }
}

async function fetchActivityImage(activityName, destination) {
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY || !GOOGLE_CUSTOM_SEARCH_CX) {
    return null;
  }

  try {
    // Create a more specific image query that combines activity name and destination
    // Remove common verbs to make the query more image-search friendly
    const cleanActivityName = activityName
      .replace(/^(visit|explore|see|tour|experience|go to|check out)\s+/i, '')
      .trim();

    const imageQuery = destination
      ? `${cleanActivityName} ${destination}`
      : cleanActivityName;

    const params = new URLSearchParams({
      key: GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: GOOGLE_CUSTOM_SEARCH_CX,
      q: imageQuery,
      num: '3', // Get a few results to find the best one
      safe: 'active',
      searchType: 'image',
      imgSize: 'large',
      imgType: 'photo', // Prefer photos over illustrations
    });

    const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        // Return the first result (Google usually ranks best images first)
        return data.items[0].link || null;
      }
    }
  } catch (error) {
    console.error('Error fetching activity image:', error);
  }

  return null;
}

// Helper function to check if an activity matches avoid categories
function matchesAvoidCategory(activityName, activityCategory, snippet, avoidCategories) {
  if (!avoidCategories || !Array.isArray(avoidCategories) || avoidCategories.length === 0) {
    return false;
  }

  const combinedText = `${activityName} ${activityCategory} ${snippet}`.toLowerCase();

  for (const avoidCategory of avoidCategories) {
    if (!avoidCategory || typeof avoidCategory !== 'string') continue;

    const avoidLower = avoidCategory.toLowerCase();

    // Direct category match
    if (activityCategory && activityCategory.toLowerCase() === avoidLower) {
      return true;
    }

    // Check if avoid category appears in the activity text
    if (combinedText.includes(avoidLower)) {
      return true;
    }

    // Check for common synonyms
    const synonyms = {
      'nightlife': ['club', 'bar', 'nightclub', 'party', 'drinking'],
      'shopping': ['mall', 'market', 'store', 'retail'],
      'food': ['restaurant', 'cafe', 'dining', 'eatery'],
      'outdoors': ['hiking', 'camping', 'nature', 'park'],
      'museums': ['museum', 'gallery', 'exhibition'],
    };

    if (synonyms[avoidLower]) {
      const hasSynonym = synonyms[avoidLower].some(syn => combinedText.includes(syn));
      if (hasSynonym) {
        return true;
      }
    }
  }

  return false;
}

async function upsertReusableActivityFromSearchItem(item, destination, preferences = null, userProfile = null) {
  // Keep location as the broader trip destination (e.g. "Paris, France")
  // and store precise street address separately in the "address" column.
  const location = destination || null;
  let address = null;
  const snippet = item.snippet || '';
  const originalLink = item.link || '';

  // Extract the actual activity name from the search result (not just the article title)
  let name = await extractActivityNameFromSearchResult(item, destination, preferences, userProfile);

  // If we couldn't extract a valid activity name, fall back to a generic but usable one
  if (!name || name === 'SKIP') {
    if (item.title && item.title.length > 3) {
      name = item.title.trim();
    } else if (destination) {
      name = `Activity in ${destination}`;
    } else {
      name = 'Activity';
    }
  }

  // Very lenient validation - only filter out the most obvious non-activities
  // Filter out website URLs
  const urlPattern = /(\.com|\.org|\.net|www\.|http|https)/i;
  if (urlPattern.test(name)) {
    // If name contains URL, try to clean it or use destination
    let cleanedName = name.replace(urlPattern, '').trim();
    if (cleanedName.length <= 3 && destination) {
      cleanedName = `Activity in ${destination}`;
    }
    if (cleanedName.length > 3) {
      name = cleanedName;
    } else if (destination) {
      name = `Activity in ${destination}`;
    } else {
      name = 'Activity';
    }
  }

  // Only filter out if it's clearly just "Top X Things to Do" with nothing else
  const pureListPattern = /^(top|best|\d+)\s+(things to do|activities|places|attractions|must-see|guide|list)\s*$/i;
  if (pureListPattern.test(name)) {
    // Turn list-style titles into something more activity-like instead of skipping
    if (destination) {
      name = `Activities in ${destination}`;
    } else {
      name = 'Things to do';
    }
  }

  // At this point, we ALWAYS have some non-empty name string

  // Extract additional details from snippet/title first
  let details = await extractActivityDetails(name, snippet, originalLink);
  let { priceRange, costEstimate, duration } = details;

  // If snippet parsing left us without cost/duration, ask the LLM once for typical values
  if ((costEstimate === null || costEstimate === undefined) || !duration) {
    const refined = await refineActivityDetailsWithLLM(name, destination, snippet, {
      priceRange,
      costEstimate,
      duration,
    });
    priceRange = refined.priceRange;
    costEstimate = refined.costEstimate;
    duration = refined.duration;
  }

  // Normalize details so final itinerary has concrete values
  // If we still don't get a numeric estimate, infer a rough cost from priceRange or fall back to a default.
  if (costEstimate === null || costEstimate === undefined) {
    const lower = (priceRange || '').toLowerCase();
    if (lower.includes('free') || lower.includes('no cost')) {
      costEstimate = 0;
    } else if (lower.includes('budget')) {
      costEstimate = 20;
    } else if (lower.includes('moderate')) {
      costEstimate = 50;
    } else if (lower.includes('expensive') || lower.includes('luxury')) {
      costEstimate = 100;
    } else {
      // Generic fallback so activities always have a non-null cost for budgeting
      costEstimate = 30;
    }
  }

  if (!duration) {
    // Provide a reasonable default specific duration for mapping / calendar views
    duration = '2 hours';
  }

  // Make address more specific so maps and distances work better:
  // Prefer an exact street address from Google Places; fall back to "Activity Name, Destination".
  if (destination && name) {
    const preciseAddress = await fetchActivityAddress(name, destination);
    if (preciseAddress) {
      address = preciseAddress;
    } else if (!address) {
      address = `${name}, ${destination}`;
    }
  }

  // Use LLM to accurately categorize the activity
  let category = 'other';
  try {
    const categoryPrompt = `Categorize this travel activity into ONE of these categories: museums, outdoors, food, nightlife, shopping, music, cultural, relaxing, adventure, arts, other.

Activity Name: "${name}"
Description: "${snippet}"

Respond with ONLY the category name (lowercase, one word). Examples:
- "Louvre Museum" → museums
- "Art Gallery" → museums or arts
- "Hiking Trail" → outdoors
- "Restaurant" → food
- "Nightclub" → nightlife
- "Shopping Mall" → shopping
- "Concert Hall" → music
- "Beach" → relaxing
- "Zipline" → adventure

Category:`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at categorizing travel activities. Return only the category name, nothing else.',
        },
        {
          role: 'user',
          content: categoryPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 10,
    });

    const llmCategory = (completion.choices[0]?.message?.content || '').trim().toLowerCase();

    // Map LLM response to our category system
    const categoryMap = {
      'museums': 'museums',
      'museum': 'museums',
      'arts': 'museums',
      'art': 'museums',
      'cultural': 'museums',
      'outdoors': 'outdoors',
      'outdoor': 'outdoors',
      'nature': 'outdoors',
      'food': 'food',
      'dining': 'food',
      'restaurant': 'food',
      'nightlife': 'nightlife',
      'shopping': 'shopping',
      'music': 'music',
      'relaxing': 'relaxing',
      'adventure': 'adventure',
      'other': 'other',
    };

    category = categoryMap[llmCategory] || 'other';

    // Fallback to simple heuristic if LLM returns something unexpected
    if (category === 'other') {
      const lower = `${name} ${snippet}`.toLowerCase();
      // More specific patterns to avoid false matches
      if (/\bmuseum\b|\bart\s+gallery\b|\bart\s+museum\b/.test(lower)) category = 'museums';
      else if (/\bhike|\btrail|\bpark\b|\bnational\s+park\b|\bnature\b|\boutdoor\b/.test(lower)) category = 'outdoors';
      else if (/\brestaurant\b|\bcafe\b|\bfood\b|\bdining\b/.test(lower) && !/\bnightclub\b|\bclub\b/.test(lower)) category = 'food';
      else if (/\bnightlife\b|\bnightclub\b|\bclub\b|\bbar\b/.test(lower) && !/\brestaurant\b|\bcafe\b/.test(lower)) category = 'nightlife';
      else if (/\bshopping\b|\bmarket\b|\bmall\b/.test(lower)) category = 'shopping';
      else if (/\bconcert\b|\bmusic\b|\blive\s+music\b/.test(lower)) category = 'music';
    }
  } catch (error) {
    console.error('Error categorizing activity with LLM, using fallback:', error);
    // Fallback to simple heuristic
    const lower = `${name} ${snippet}`.toLowerCase();
    if (/\bmuseum\b|\bart\s+gallery\b|\bart\s+museum\b/.test(lower)) category = 'museums';
    else if (/\bhike|\btrail|\bpark\b|\bnational\s+park\b|\bnature\b/.test(lower)) category = 'outdoors';
    else if (/\brestaurant\b|\bcafe\b|\bfood\b/.test(lower) && !/\bnightclub\b|\bclub\b/.test(lower)) category = 'food';
    else if (/\bnightlife\b|\bnightclub\b|\bclub\b/.test(lower)) category = 'nightlife';
    else if (/\bshopping\b|\bmarket\b|\bmall\b/.test(lower)) category = 'shopping';
    else if (/\bconcert\b|\bmusic\b/.test(lower)) category = 'music';
  }

  // Check if this activity matches any avoid categories
  const avoidCategories = Array.isArray(preferences?.avoid_activity_categories)
    ? preferences.avoid_activity_categories
    : [];

  if (matchesAvoidCategory(name, category, snippet, avoidCategories)) {
    console.log(`[activities] Skipping activity "${name}" - matches avoid category:`, avoidCategories);
    return null; // Skip this activity
  }

  const tags = [];
  if (category !== 'other') {
    tags.push(category);
  }
  if (destination) {
    tags.push(destination);
  }

  // Find a better link for this specific activity
  let finalLink = originalLink;

  // If the original link is low-quality or a collection, try to find a better one
  if (isLowQualityLink(originalLink) || isCollectionLink(originalLink, item.title, snippet)) {
    console.log(`[activities] Original link is low-quality or collection, searching for better link for: ${name}`);
    const betterLink = await findBetterActivityLink(name, destination);
    if (betterLink) {
      finalLink = betterLink;
      console.log(`[activities] Found better link: ${betterLink}`);
    } else {
      // If we can't find a better link, only use the original if it's not low-quality
      if (isLowQualityLink(originalLink)) {
        finalLink = null; // Don't use low-quality links
      }
    }
  }

  if (finalLink) {
    tags.push('web');
  }

  // Always fetch a new image based on the extracted activity name (not the search result)
  // This ensures we get a good image for the actual activity
  let finalImageUrl = await fetchActivityImage(name, destination);

  // Fallback to search result image only if we couldn't get one from activity name
  if (!finalImageUrl) {
    finalImageUrl = item.pagemap?.cse_image?.[0]?.src || item.pagemap?.metatags?.[0]?.['og:image'] || null;
  }

  // Try to find an existing reusable activity with the same name/location/source
  const { data: existing, error: existingError } = await supabase
    .from('activity')
    .select('*')
    .eq('name', name)
    .eq('location', location)
    .eq('source', 'google-search')
    .maybeSingle();

  if (existingError) {
    console.error('Error checking for existing activity:', existingError);
  }

  if (existing) {
    // Update existing activity with new data if available
    const updateData = {};
    // image_url and price_range are omitted here because the current Supabase schema cache for 'activity' does not include them

    if (costEstimate !== null && existing.cost_estimate === null) updateData.cost_estimate = costEstimate;
    if (duration && !existing.duration) updateData.duration = duration;
    if (address && !existing.address) updateData.address = address;
    // Update source_url if we found a better link
    if (finalLink && finalLink !== existing.source_url && !isLowQualityLink(finalLink)) {
      updateData.source_url = finalLink;
    }

    if (Object.keys(updateData).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('activity')
        .update(updateData)
        .eq('activity_id', existing.activity_id)
        .select()
        .single();

      if (!updateError && updated) {
        // Attach the runtime image URL (from the article or Google Images) for the client,
        // without relying on a DB column.
        return { ...updated, image_url: finalImageUrl || null };
      }
    }
    return { ...existing, image_url: finalImageUrl || null };
  }

  const { data, error } = await supabase
    .from('activity')
    .insert([
      {
        name,
        location,
        address,
        category,
        duration: duration || null,
        cost_estimate: costEstimate,
        rating: null,
        tags,
        source: 'google-search',
        source_url: finalLink || null
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error inserting activity from search:', error);
    throw error;
  }

  // Attach the runtime image URL (from the article or Google Images) for the client,
  // without relying on a DB column.
  return { ...data, image_url: finalImageUrl || null };
}

// Get all trips for user, optionally filtered by status
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query; // 'draft', 'planned', 'archived'

    let query = supabase
      .from('trip')
      .select(
        `
        *,
        trip_preference (
          start_date,
          end_date
        )
      `
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('trip_status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      trips: data || []
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trips',
      error: error.message
    });
  }
});

// Get single trip by ID
router.get('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const { data, error } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Trip not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      trip: data
    });
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip',
      error: error.message
    });
  }
});

// Create new trip
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      destination,
      start_date,
      end_date,
      total_budget,
      num_travelers,
      image_url,
      raw_message,
      raw_title_message,
    } = req.body;

    // If destination is not explicitly provided but we have a free-form
    // description of the trip, reuse the same extraction logic as the
    // chat flow to infer destination/dates/budget and name the trip
    // accordingly (ex. "Trip to Brazil").
    let extractedInfo = null;
    if (!destination && raw_message && typeof raw_message === 'string') {
      try {
        extractedInfo = await extractTripInfo(raw_message);
      } catch (extractionError) {
        console.error('Error extracting trip info from raw_message:', extractionError);
      }
    }

    const rawDestination = destination || extractedInfo?.destination || null;
    const finalDestination = rawDestination ? normalizeDestinationName(rawDestination) : null;
    const finalStartDate = start_date || extractedInfo?.start_date || null;
    const finalEndDate = end_date || extractedInfo?.end_date || null;
    const finalNumTravelers =
      num_travelers ||
      (extractedInfo?.num_travelers !== null && extractedInfo?.num_travelers !== undefined
        ? extractedInfo.num_travelers
        : 1);
    const finalTotalBudget =
      total_budget !== undefined && total_budget !== null
        ? total_budget
        : extractedInfo?.total_budget ?? null;

    // If no image_url provided but we have a destination, try to fetch
    // a representative travel photo using Google Custom Search (same
    // logic as chat-created trips).
    let finalImageUrl = image_url || null;
    if (!finalImageUrl && finalDestination) {
      try {
        finalImageUrl = await fetchDestinationImage(finalDestination);
      } catch (imageError) {
        console.error('Error fetching destination image (trips):', imageError);
      }
    }

    let generatedTitle = null;
    if (!title && raw_title_message && typeof raw_title_message === 'string') {
      generatedTitle = await generateTripTitleFromMessage(raw_title_message);
    }

    const tripData = {
      user_id: userId,
      title: title || generatedTitle || (finalDestination ? `Trip to ${finalDestination}` : 'My Trip'),
      trip_status: 'draft',
      ...(finalDestination && { destination: finalDestination }),
      ...(finalImageUrl && { image_url: finalImageUrl }),
    };

    const { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Seed trip_preference with any structured fields we extracted or received
    if (data?.trip_id && (finalStartDate || finalEndDate)) {
      const preferenceData = {
        trip_id: data.trip_id,
        start_date: finalStartDate,
        end_date: finalEndDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: prefError } = await supabase
        .from('trip_preference')
        .insert([preferenceData]);

      if (prefError) {
        console.error('Error seeding trip_preference for new trip:', prefError);
      }
    }

    res.status(201).json({
      success: true,
      trip: data,
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create trip',
      error: error.message,
    });
  }
});

// Update trip
router.put('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const { title, destination, trip_status, image_url } = req.body;

    // First verify the trip belongs to the user
    const { data: existingTrip, error: checkError } = await supabase
      .from('trip')
      .select('trip_id, user_id, destination, image_url')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    const updateData = {};

    // If a title is explicitly provided, respect it.
    if (title !== undefined) {
      updateData.title = title;
    }

    // Normalize destination capitalization, and if no explicit title was sent
    // but we now have a destination, automatically set "Trip to {Destination}".
    if (destination !== undefined) {
      const finalDestination = normalizeDestinationName(destination);
      updateData.destination = finalDestination;
      if (finalDestination && title === undefined) {
        updateData.title = `Trip to ${finalDestination}`;
      }

      // If we didn't explicitly get an image_url in this request and the trip
      // doesn't already have one, try to fetch a representative destination image.
      if ((image_url === undefined || image_url === null) && !existingTrip.image_url && finalDestination) {
        try {
          const fetchedImage = await fetchDestinationImage(finalDestination);
          if (fetchedImage) {
            updateData.image_url = fetchedImage;
          }
        } catch (err) {
          console.error('Error fetching destination image on trip update:', err);
        }
      }
    }

    if (trip_status !== undefined) updateData.trip_status = trip_status;
    if (image_url !== undefined) updateData.image_url = image_url;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('trip')
      .update(updateData)
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      trip: data
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update trip',
      error: error.message
    });
  }
});

// Delete trip
router.delete('/:tripId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const { error } = await supabase
      .from('trip')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete trip',
      error: error.message
    });
  }
});

// Get trip-specific preferences
router.get('/:tripId/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: preferences, error } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preferences: preferences || null,
    });
  } catch (error) {
    console.error('Error fetching trip preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip preferences',
      error: error.message,
    });
  }
});

// Create or update trip-specific preferences
router.put('/:tripId/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    const {
      num_days,
      start_date,
      end_date,
      min_budget,
      max_budget,
      pace,
      accommodation_type,
      activity_categories,
      avoid_activity_categories,
      group_type,
      safety_notes,
      accessibility_notes,
      custom_requests,
    } = req.body;

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: existingPreference, error: prefError } = await supabase
      .from('trip_preference')
      .select('trip_preference_id')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    const preferenceData = {
      trip_id: tripId,
      updated_at: new Date().toISOString(),
    };

    if (num_days !== undefined) preferenceData.num_days = num_days;
    if (start_date !== undefined) preferenceData.start_date = start_date;
    if (end_date !== undefined) preferenceData.end_date = end_date;

    // If the request explicitly includes both dates, treat them as the
    // source of truth and derive num_days from the range. This avoids
    // conflicts between a manually entered "rough number of days" and
    // the actual dates.
    if (start_date !== undefined && end_date !== undefined && start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start_date or end_date. Please provide valid ISO date strings (YYYY-MM-DD).',
        });
      }

      if (end < start) {
        return res.status(400).json({
          success: false,
          message: 'end_date must be on or after start_date.',
        });
      }

      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      preferenceData.num_days = diffDays;
    }

    if (min_budget !== undefined && min_budget !== null) {
      preferenceData.min_budget = parseFloat(min_budget);
    }
    if (max_budget !== undefined && max_budget !== null) {
      preferenceData.max_budget = parseFloat(max_budget);
    }
    if (pace !== undefined) preferenceData.pace = pace;
    if (accommodation_type !== undefined) preferenceData.accommodation_type = accommodation_type;
    if (activity_categories !== undefined) preferenceData.activity_categories = activity_categories;
    if (avoid_activity_categories !== undefined)
      preferenceData.avoid_activity_categories = avoid_activity_categories;
    if (group_type !== undefined) preferenceData.group_type = group_type;
    if (safety_notes !== undefined) preferenceData.safety_notes = safety_notes;
    if (accessibility_notes !== undefined) preferenceData.accessibility_notes = accessibility_notes;
    if (custom_requests !== undefined) preferenceData.custom_requests = custom_requests;

    let result;

    if (existingPreference) {
      result = await supabase
        .from('trip_preference')
        .update(preferenceData)
        .eq('trip_id', tripId)
        .select()
        .single();
    } else {
      preferenceData.created_at = new Date().toISOString();
      result = await supabase.from('trip_preference').insert([preferenceData]).select().single();
    }

    const { data, error } = result;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preferences: data,
    });
  } catch (error) {
    console.error('Error saving trip preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save trip preferences',
      error: error.message,
    });
  }
});

// Phase 3: Generate a small, reusable catalog of activities for this trip
// using Google Custom Search, and attach them to the trip with a pending
// preference so the user can swipe to like / dislike.
router.post('/:tripId/generate-activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const { testMode } = req.body || {};

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    if (!trip.destination) {
      return res.status(400).json({
        success: false,
        message: 'Destination is required before generating activities.',
      });
    }

    // Load user profile & trip preferences to enrich the search query
    const { data: userProfile } = await supabase
      .from('app_user')
      .select('home_location, budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: tripPreferences } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    // TEST MODE: instead of calling Google Custom Search, reuse existing activities
    // from the trip's destination when possible, with a Rome fallback.
    if (testMode) {
      console.log('[activities] TEST MODE enabled – selecting existing activities from DB');

      const destinationName = (trip.destination || '').trim();
      let baseActivities = [];

      // 1) Try to use activities for the current trip destination, if we have enough.
      if (destinationName) {
        const { data: destActivities, error: destError } = await supabase
          .from('activity')
          .select('activity_id, name, location, address, category, duration, cost_estimate, rating, tags')
          .ilike('location', `%${destinationName}%`);

        if (destError) {
          console.error('[activities][testMode] Error loading destination activities:', destError);
        } else if (destActivities && destActivities.length > 0) {
          console.log(
            `[activities][testMode] Found ${destActivities.length} activities for destination "${destinationName}"`,
          );
          baseActivities = destActivities;
        }
      }

      // 2) If there are not enough activities for this destination, fall back to Rome
      if (!baseActivities || baseActivities.length < 5) {
        console.log(
          `[activities][testMode] Not enough activities for destination ("${destinationName}" count=${baseActivities?.length || 0}). Falling back to Rome with addresses.`,
        );

        const { data: romeActivities, error: romeError } = await supabase
          .from('activity')
          .select('activity_id, name, location, address, category, duration, cost_estimate, rating, tags')
          .ilike('location', '%Rome%')
          .not('address', 'is', null);

        if (romeError) {
          console.error('[activities][testMode] Error loading Rome activities for fallback:', romeError);
        } else if (romeActivities && romeActivities.length > 0) {
          console.log(
            `[activities][testMode] Found ${romeActivities.length} Rome activities with addresses for fallback.`,
          );
          baseActivities = [...(baseActivities || []), ...romeActivities];
        }
      }

      if (!baseActivities || baseActivities.length === 0) {
        console.warn('[activities][testMode] No suitable activities found for destination or Rome fallback.');
        return res.status(200).json({
          success: true,
          activities: [],
          message: 'No existing activities found in test mode for this destination or Rome fallback.',
        });
      }

      // Randomize and take a small batch (e.g., 10) so swipe UI behaves like normal
      const shuffled = [...baseActivities].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 10);

      // Ensure we have per-trip preference rows (pending) for these activities
      const activitiesWithPrefs = [];
      for (const act of selected) {
        try {
          const { data: existingPref, error: prefError } = await supabase
            .from('trip_activity_preference')
            .select('*')
            .eq('trip_id', tripId)
            .eq('activity_id', act.activity_id)
            .maybeSingle();

          if (prefError) {
            console.error('Error checking existing preference in test mode:', prefError);
          }

          if (!existingPref) {
            const { error: insertError } = await supabase
              .from('trip_activity_preference')
              .insert({
                trip_id: tripId,
                activity_id: act.activity_id,
                preference: 'pending',
              });

            if (insertError) {
              console.error('Error inserting preference in test mode:', insertError);
            }
          }

          activitiesWithPrefs.push({
            // We don't strictly need the preference row id on the frontend,
            // but include it when available for consistency.
            trip_activity_preference_id: existingPref?.trip_activity_preference_id || null,
            activity_id: act.activity_id,
            name: act.name,
            location: act.location,
            category: act.category,
            duration: act.duration,
            cost_estimate: act.cost_estimate,
            rating: act.rating,
            tags: act.tags,
            source: 'test-mode',
            // Ensure the swipe UI sees these as *pending* so the user can choose.
            preference: 'pending',
          });
        } catch (e) {
          console.error('Error processing test-mode activity:', e);
        }
      }

      return res.status(200).json({
        success: true,
        activities: activitiesWithPrefs,
        message:
          'Loaded test activities from existing records (trip destination when available, otherwise Rome fallback, no Google API used).',
      });
    }

    // Load previously liked/disliked activities for this trip to understand patterns
    const { data: activityPreferences } = await supabase
      .from('trip_activity_preference')
      .select(`
        preference,
        activity:activity (
          activity_id,
          name,
          category,
          tags
        )
      `)
      .eq('trip_id', tripId)
      .in('preference', ['liked', 'disliked']);

    // Use LLM to generate refined, highly relevant search queries with category diversification
    let queryResult = null;
    try {
      queryResult = await generateRefinedSearchQuery(trip, tripPreferences, userProfile, activityPreferences || []);
    } catch (error) {
      console.error('Error generating refined search query:', error);
    }

    // Extract queries and avoid categories
    let queries = [];
    let avoidCategories = [];

    if (queryResult && queryResult.query) {
      queries = queryResult.allQueries && queryResult.allQueries.length > 0
        ? queryResult.allQueries
        : [queryResult.query];
      avoidCategories = queryResult.avoidCategories || [];
    }

    // Fallback to basic query if LLM fails
    if (queries.length === 0) {
      const likedTags = Array.isArray(userProfile?.liked_tags) ? userProfile.liked_tags : [];
      const activityCategories = Array.isArray(tripPreferences?.activity_categories)
        ? tripPreferences.activity_categories
        : [];

      const interestPhrases = [...likedTags, ...activityCategories]
        .filter(Boolean)
        .map((t) => String(t))
        .slice(0, 5)
        .join(' ');

      const rawDestination = String(trip.destination).trim();
      const destinationQuery =
        rawDestination && rawDestination.includes(' ') ? `"${rawDestination}"` : rawDestination;

      // Build a more contextual fallback query
      let queryParts = [`things to do in ${destinationQuery}`];

      if (interestPhrases) {
        queryParts.push(interestPhrases);
      }

      if (tripPreferences?.group_type) {
        queryParts.push(`for ${tripPreferences.group_type}`);
      }

      queries = [queryParts.join(' ')];
    }

    // Get avoid categories from preferences if not already set
    if (avoidCategories.length === 0 && Array.isArray(tripPreferences?.avoid_activity_categories)) {
      avoidCategories = tripPreferences.avoid_activity_categories;
    }

    // Fetch results from multiple queries to ensure category diversification
    const allItems = [];
    const itemsPerQuery = Math.max(5, Math.floor(15 / Math.max(1, queries.length)));

    for (const query of queries.slice(0, 5)) { // Limit to 5 queries max
      try {
        const items = await fetchActivitySearchResults(query, itemsPerQuery);

        // Filter out low-quality links before processing
        const filteredItems = items.filter(item => {
          const link = item.link || '';
          return !isLowQualityLink(link);
        });

        allItems.push(...filteredItems);
        console.log(`[activities] Query "${query}" returned ${filteredItems.length} items (after filtering)`);
      } catch (error) {
        console.error(`[activities] Error fetching results for query "${query}":`, error);
      }
    }

    if (allItems.length === 0) {
      return res.status(200).json({
        success: true,
        activities: [],
        message: 'No activities were found from search.',
      });
    }

    console.log(`[activities] Total items collected: ${allItems.length} (from ${queries.length} queries)`);

    // Filter and prioritize results, then take top 8 with strong category diversification
    const suggestions = [];
    const processedActivityIds = new Set();
    const categoryCounts = new Map(); // Track category diversity
    const categorySeen = new Set(); // Track which categories we've seen at least once

    // Get preferred categories from user preferences
    const preferredCategories = Array.isArray(tripPreferences?.activity_categories)
      ? tripPreferences.activity_categories.map(c => c.toLowerCase())
      : [];

    console.log(`Processing ${allItems.length} search results for destination: ${trip.destination}`);
    console.log(`Preferred categories: ${preferredCategories.join(', ') || 'none'}`);

    // First pass: Collect activities, prioritizing diversity
    const activityCandidates = [];

    for (const item of allItems) {
      try {
        const activity = await upsertReusableActivityFromSearchItem(item, trip.destination, tripPreferences, userProfile);

        // Skip if activity extraction failed or returned null
        if (!activity) {
          console.log(`Skipped activity from: ${item.title?.substring(0, 50)}`);
          continue;
        }

        // Skip duplicates
        if (processedActivityIds.has(activity.activity_id)) {
          continue;
        }
        processedActivityIds.add(activity.activity_id);

        activityCandidates.push(activity);
      } catch (innerError) {
        console.error('Error processing search item into activity:', innerError);
      }
    }

    console.log(`[activities] Collected ${activityCandidates.length} unique activity candidates`);

    // Second pass: Select activities with strong diversification
    // Priority: 1) New categories (especially preferred ones), 2) Categories we haven't seen yet, 3) Balance

    for (const activity of activityCandidates) {
      try {
        const category = activity.category || 'other';
      const categoryLower = category.toLowerCase();
      const currentCount = categoryCounts.get(category) || 0;
      const isPreferred = preferredCategories.length > 0 && preferredCategories.includes(categoryLower);
      const isNewCategory = !categorySeen.has(category);

      // If we already have 8 activities, check if we should replace one
      if (suggestions.length >= 8) {
        // Always accept if it's a preferred category we haven't seen yet
        if (isPreferred && isNewCategory) {
          // Remove the most over-represented category
          const sortedCategories = Array.from(categoryCounts.entries())
            .sort((a, b) => {
              const aPreferred = preferredCategories.includes(a[0].toLowerCase());
              const bPreferred = preferredCategories.includes(b[0].toLowerCase());
              if (aPreferred && !bPreferred) return 1; // Keep preferred
              if (!aPreferred && bPreferred) return -1; // Remove non-preferred
              return b[1] - a[1]; // Remove most common
            });

          const categoryToRemove = sortedCategories[0]?.[0];
          if (categoryToRemove && categoryToRemove !== category) {
            const indexToRemove = suggestions.findIndex(a => a.category === categoryToRemove);
            if (indexToRemove !== -1) {
              suggestions.splice(indexToRemove, 1);
              const removedCount = categoryCounts.get(categoryToRemove) || 0;
              categoryCounts.set(categoryToRemove, Math.max(0, removedCount - 1));
              if (removedCount <= 1) {
                categorySeen.delete(categoryToRemove);
              }
            }
          }
        } else if (isNewCategory && !isPreferred) {
          // New non-preferred category - only add if we have space or can replace a duplicate
          if (currentCount === 0) {
            // Find a category with 2+ items to replace
            const categoryToRemove = Array.from(categoryCounts.entries())
              .filter(([cat, count]) => count >= 2 && cat !== category)
              .sort((a, b) => b[1] - a[1])[0]?.[0];

            if (categoryToRemove) {
              const indexToRemove = suggestions.findIndex(a => a.category === categoryToRemove);
              if (indexToRemove !== -1) {
                suggestions.splice(indexToRemove, 1);
                categoryCounts.set(categoryToRemove, categoryCounts.get(categoryToRemove) - 1);
              }
            } else {
              continue; // Skip if we can't make room
            }
          } else {
            continue; // Skip duplicates of non-preferred categories
          }
        } else if (currentCount >= 2) {
          // Already have 2+ of this category, skip unless it's preferred and we have few preferred categories
          if (isPreferred && preferredCategories.length <= 3 && currentCount < 3) {
            // Allow up to 3 of preferred categories if there are few preferred categories
          } else {
            continue; // Skip duplicates
          }
        } else if (currentCount >= 1 && !isPreferred) {
          // Already have 1 of this non-preferred category, skip
          continue;
        }
      }

      // Add the activity
      categorySeen.add(category);
      categoryCounts.set(category, currentCount + 1);

      // Ensure we have a per-trip preference row (pending by default)
      const { data: existingPref, error: prefError } = await supabase
        .from('trip_activity_preference')
        .select('*')
        .eq('trip_id', tripId)
        .eq('activity_id', activity.activity_id)
        .maybeSingle();

      if (prefError) {
        console.error('Error checking existing trip_activity_preference:', prefError);
        continue;
      }

      let prefRow = existingPref;

      if (!prefRow) {
        const { data: inserted, error: insertError } = await supabase
          .from('trip_activity_preference')
          .insert([
            {
              trip_id: tripId,
              activity_id: activity.activity_id,
              preference: 'pending',
            },
          ])
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting trip_activity_preference:', insertError);
          continue;
        }

        prefRow = inserted;
      }

      suggestions.push({
        ...activity,
        trip_activity_preference_id: prefRow.trip_activity_preference_id,
        preference: prefRow.preference,
      });

      console.log(`[activities] Added: ${activity.name} (${category}) - Total: ${suggestions.length}, Categories seen: ${Array.from(categorySeen).join(', ')}`);

      if (suggestions.length >= 8) {
        break;
      }
      } catch (innerError) {
        console.error('Error processing activity candidate:', innerError);
      }
    }

    res.status(200).json({
      success: true,
      activities: suggestions,
    });
  } catch (error) {
    console.error('Error generating activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate activities',
      error: error.message,
    });
  }
});

// Phase 3 helper: fetch current activity suggestions + preferences for a trip
router.get('/:tripId/activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // First, fetch per-trip activity preferences without relying on FK-based joins
    const { data: prefs, error: prefsError } = await supabase
      .from('trip_activity_preference')
      .select('trip_activity_preference_id, trip_id, activity_id, preference')
      .eq('trip_id', tripId);

    if (prefsError) {
      throw prefsError;
    }

    if (!prefs || prefs.length === 0) {
      return res.status(200).json({
        success: true,
        activities: [],
      });
    }

    // Fetch corresponding activities in a separate query
    const activityIds = Array.from(
      new Set(
        prefs
          .map((p) => p.activity_id)
          .filter((id) => typeof id === 'number' || typeof id === 'string')
      )
    );

    const { data: activitiesRaw, error: activitiesError } = await supabase
      .from('activity')
      .select(
        'activity_id, name, location, category, duration, cost_estimate, rating, tags, source, source_url'
      )
      .in('activity_id', activityIds);

    if (activitiesError) {
      throw activitiesError;
    }

    const activityMap = new Map();
    (activitiesRaw || []).forEach((a) => {
      activityMap.set(a.activity_id, a);
    });

    const activities = (prefs || []).map((row) => ({
      trip_activity_preference_id: row.trip_activity_preference_id,
      trip_id: row.trip_id,
      activity_id: row.activity_id,
      preference: row.preference,
      ...(activityMap.get(row.activity_id) || {}),
    }));

    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error('Error fetching trip activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trip activities',
      error: error.message,
    });
  }
});

// Phase 3 swipe: update preference for a specific activity suggestion
router.post('/:tripId/activities/:activityId/preference', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);
    const activityId = parseInt(req.params.activityId);
    const { preference } = req.body;

    if (!['liked', 'disliked', 'maybe', 'pending'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid preference value.',
      });
    }

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('trip_activity_preference')
      .select('*')
      .eq('trip_id', tripId)
      .eq('activity_id', activityId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let result;

    if (existing) {
      result = await supabase
        .from('trip_activity_preference')
        .update({ preference })
        .eq('trip_activity_preference_id', existing.trip_activity_preference_id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('trip_activity_preference')
        .insert([
          {
            trip_id: tripId,
            activity_id: activityId,
            preference,
          },
        ])
        .select()
        .single();
    }

    const { data, error } = result;

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      preference: data,
    });
  } catch (error) {
    console.error('Error updating activity preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity preference',
      error: error.message,
    });
  }
});

// Fetch the generated day-by-day itinerary and attached activities for a trip
router.get('/:tripId/itinerary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id, destination')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data, error } = await supabase
      .from('itinerary')
      .select(
        `
        itinerary_id,
        day_number,
        date,
        summary,
        itinerary_activity (
          order_index,
          activity:activity (
            activity_id,
            name,
            location,
            address,
            category,
            duration
          )
        )
      `
      )
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) {
      throw error;
    }

    const days =
      data?.map((row) => {
        const acts = Array.isArray(row.itinerary_activity)
          ? row.itinerary_activity
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((ia) => ia.activity || {})
          : [];

        return {
          day_number: row.day_number,
          date: row.date,
          summary: row.summary,
          activities: acts,
        };
      }) || [];

    // Attach saved flight + hotel selections to the itinerary response
    const { data: tripFlights } = await supabase
      .from('trip_flight')
      .select(
        `
        flight_id,
        is_selected,
        flight:flight(*)
      `
      )
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedOutboundFlight = tripFlights?.find(
      (tf) => tf.flight?.flight_type === 'outbound'
    )?.flight || null;
    const selectedReturnFlight = tripFlights?.find(
      (tf) => tf.flight?.flight_type === 'return'
    )?.flight || null;

    const { data: tripHotels } = await supabase
      .from('trip_hotel')
      .select(
        `
        hotel_id,
        is_selected,
        hotel:hotel(*)
      `
      )
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedHotel = tripHotels?.[0]?.hotel || null;

    if (days.length > 0) {
      const lastDayIndex = days.length - 1;
      if (selectedOutboundFlight) {
        days[0].outbound_flight = {
          departure_id: selectedOutboundFlight.departure_id,
          arrival_id: selectedOutboundFlight.arrival_id,
          price: selectedOutboundFlight.price,
          total_duration: selectedOutboundFlight.total_duration,
          flights: selectedOutboundFlight.flights,
          layovers: selectedOutboundFlight.layovers,
        };
      }

      if (selectedReturnFlight) {
        days[lastDayIndex].return_flight = {
          departure_id: selectedReturnFlight.departure_id,
          arrival_id: selectedReturnFlight.arrival_id,
          price: selectedReturnFlight.price,
          total_duration: selectedReturnFlight.total_duration,
          flights: selectedReturnFlight.flights,
          layovers: selectedReturnFlight.layovers,
        };
      }

      if (selectedHotel) {
        days.forEach((day) => {
          day.hotel = {
            hotel_id: selectedHotel.hotel_id,
            name: selectedHotel.name,
            location: selectedHotel.location,
            rate_per_night: selectedHotel.rate_per_night_lowest,
            rate_per_night_formatted: selectedHotel.rate_per_night_formatted,
            link: selectedHotel.link,
            overall_rating: selectedHotel.overall_rating,
            check_in_time: selectedHotel.check_in_time,
            check_out_time: selectedHotel.check_out_time,
          };
        });
      }
    }

    res.status(200).json({
      success: true,
      days,
    });
  } catch (error) {
    console.error('Error fetching itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch itinerary',
      error: error.message,
    });
  }
});

// Add a manual activity to a specific day in the itinerary
router.post('/:tripId/itinerary/:dayNumber/activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId, 10);
    const dayNumber = parseInt(req.params.dayNumber, 10);

    if (!Number.isFinite(tripId) || !Number.isFinite(dayNumber) || dayNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip or day number.',
      });
    }

    const { name, location, description, source_url } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Activity name is required.',
      });
    }

    // Ensure the trip belongs to the user and get destination for sensible defaults
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id, destination')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // Find or create the itinerary row for this day
    let { data: itineraryRow, error: itineraryError } = await supabase
      .from('itinerary')
      .select('itinerary_id, day_number, date')
      .eq('trip_id', tripId)
      .eq('day_number', dayNumber)
      .maybeSingle();

    if (itineraryError) {
      throw itineraryError;
    }

    if (!itineraryRow) {
      // Try to infer a reasonable date from trip preferences, if available
      let inferredDate = null;
      const { data: tripPreferences } = await supabase
        .from('trip_preference')
        .select('start_date')
        .eq('trip_id', tripId)
        .maybeSingle();

      if (tripPreferences && tripPreferences.start_date) {
        const start = new Date(tripPreferences.start_date);
        if (!Number.isNaN(start.getTime())) {
          const dateForDay = new Date(start);
          dateForDay.setDate(start.getDate() + (dayNumber - 1));
          inferredDate = dateForDay.toISOString().split('T')[0];
        }
      }

      const { data: createdItinerary, error: createItineraryError } = await supabase
        .from('itinerary')
        .insert({
          trip_id: tripId,
          day_number: dayNumber,
          date: inferredDate,
        })
        .select()
        .single();

      if (createItineraryError) {
        throw createItineraryError;
      }

      itineraryRow = createdItinerary;
    }

    // Create the manual activity
    const { data: activity, error: activityError } = await supabase
      .from('activity')
      .insert({
        name: name.trim(),
        // Keep location as the trip destination for high-level grouping
        location: trip.destination || null,
        // Store the user-entered place/address separately
        address: location && location.trim() ? location.trim() : null,
        category: null,
        duration: null,
        cost_estimate: null,
        rating: null,
        tags: [],
        source: 'manual-itinerary',
        source_url: source_url && source_url.trim() ? source_url.trim() : null,
        description: description && description.trim() ? description.trim() : null,
      })
      .select()
      .single();

    if (activityError) {
      throw activityError;
    }

    // Determine next order index for this day
    const { data: existingLinks, error: linksError } = await supabase
      .from('itinerary_activity')
      .select('order_index')
      .eq('itinerary_id', itineraryRow.itinerary_id);

    if (linksError) {
      throw linksError;
    }

    const maxIndex =
      existingLinks && existingLinks.length > 0
        ? Math.max(
            ...existingLinks.map((row) =>
              typeof row.order_index === 'number' ? row.order_index : 0
            )
          )
        : -1;
    const nextIndex = maxIndex + 1;

    const { data: linkRow, error: linkError } = await supabase
      .from('itinerary_activity')
      .insert({
        itinerary_id: itineraryRow.itinerary_id,
        activity_id: activity.activity_id,
        order_index: nextIndex,
      })
      .select()
      .single();

    if (linkError) {
      throw linkError;
    }

    res.status(201).json({
      success: true,
      activity,
      itinerary_activity: linkRow,
    });
  } catch (error) {
    console.error('Error adding itinerary activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add activity to itinerary',
      error: error.message,
    });
  }
});

// Remove a manual activity from a specific day in the itinerary
router.delete('/:tripId/itinerary/:dayNumber/activities/:activityId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId, 10);
    const dayNumber = parseInt(req.params.dayNumber, 10);
    const activityId = parseInt(req.params.activityId, 10);

    if (
      !Number.isFinite(tripId) ||
      !Number.isFinite(dayNumber) ||
      !Number.isFinite(activityId) ||
      dayNumber <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip, day number, or activity id.',
      });
    }

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // Find the itinerary row for this day
    const { data: itineraryRow, error: itineraryError } = await supabase
      .from('itinerary')
      .select('itinerary_id')
      .eq('trip_id', tripId)
      .eq('day_number', dayNumber)
      .maybeSingle();

    if (itineraryError) {
      throw itineraryError;
    }

    if (!itineraryRow) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary day not found.',
      });
    }

    // Delete the link between this itinerary day and the activity
    const { error: deleteError } = await supabase
      .from('itinerary_activity')
      .delete()
      .eq('itinerary_id', itineraryRow.itinerary_id)
      .eq('activity_id', activityId);

    if (deleteError) {
      throw deleteError;
    }

    res.status(200).json({
      success: true,
      message: 'Activity removed from itinerary.',
    });
  } catch (error) {
    console.error('Error removing itinerary activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove activity from itinerary',
      error: error.message,
    });
  }
});

// Fetch the final itinerary (persisted day-by-day itinerary + selected flights/hotel)
router.get('/:tripId/final-itinerary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Ensure the trip belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('trip_id, user_id, title, destination')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    const { data: tripPreferences, error: prefError } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    const { data, error } = await supabase
      .from('itinerary')
      .select(
        `
        itinerary_id,
        day_number,
        date,
        summary,
        itinerary_activity (
          order_index,
          activity:activity (
            activity_id,
            name,
            location,
            address,
            category,
            duration,
            cost_estimate,
            source_url,
            image_url,
            description,
            source
          )
        )
      `
      )
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) {
      throw error;
    }

    const days =
      data?.map((row) => {
        const acts = Array.isArray(row.itinerary_activity)
          ? row.itinerary_activity
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((ia) => ia.activity || {})
          : [];

        return {
          day_number: row.day_number,
          date: row.date,
          summary: row.summary,
          activities: acts,
        };
      }) || [];

    if (days.length === 0) {
      return res.status(200).json({
        success: true,
        itinerary: null,
      });
    }

    const { data: tripFlights } = await supabase
      .from('trip_flight')
      .select(
        `
        flight_id,
        is_selected,
        flight:flight(*)
      `
      )
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedOutboundFlight = tripFlights?.find(
      (tf) => tf.flight?.flight_type === 'outbound'
    )?.flight || null;
    const selectedReturnFlight = tripFlights?.find(
      (tf) => tf.flight?.flight_type === 'return'
    )?.flight || null;

    const { data: tripHotels } = await supabase
      .from('trip_hotel')
      .select(
        `
        hotel_id,
        is_selected,
        hotel:hotel(*)
      `
      )
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedHotel = tripHotels?.[0]?.hotel || null;

    if (days.length > 0) {
      const lastDayIndex = days.length - 1;
      if (selectedOutboundFlight) {
        days[0].outbound_flight = {
          departure_id: selectedOutboundFlight.departure_id,
          arrival_id: selectedOutboundFlight.arrival_id,
          price: selectedOutboundFlight.price,
          total_duration: selectedOutboundFlight.total_duration,
          flights: selectedOutboundFlight.flights,
          layovers: selectedOutboundFlight.layovers,
        };
      }

      if (selectedReturnFlight) {
        days[lastDayIndex].return_flight = {
          departure_id: selectedReturnFlight.departure_id,
          arrival_id: selectedReturnFlight.arrival_id,
          price: selectedReturnFlight.price,
          total_duration: selectedReturnFlight.total_duration,
          flights: selectedReturnFlight.flights,
          layovers: selectedReturnFlight.layovers,
        };
      }

      if (selectedHotel) {
        days.forEach((day) => {
          day.hotel = {
            hotel_id: selectedHotel.hotel_id,
            name: selectedHotel.name,
            location: selectedHotel.location,
            rate_per_night: selectedHotel.rate_per_night_lowest,
            rate_per_night_formatted: selectedHotel.rate_per_night_formatted,
            link: selectedHotel.link,
            overall_rating: selectedHotel.overall_rating,
            check_in_time: selectedHotel.check_in_time,
            check_out_time: selectedHotel.check_out_time,
          };
        });
      }
    }

    const itinerary = {
      trip_id: tripId,
      trip_title: trip.title,
      destination: trip.destination,
      start_date: tripPreferences?.start_date || null,
      end_date: tripPreferences?.end_date || null,
      num_days: tripPreferences?.num_days || days.length,
      total_budget: tripPreferences?.max_budget || null,
      days,
    };

    res.status(200).json({
      success: true,
      itinerary,
    });
  } catch (error) {
    console.error('Error fetching final itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch final itinerary',
      error: error.message,
    });
  }
});

// Generate day-by-day itinerary and activities for a trip using the LLM
// DISABLED: Skipping itinerary generation, going straight to flight/hotel booking
router.post('/:tripId/generate-itinerary', authenticateToken, async (req, res) => {
  // Temporarily disabled - skip itinerary generation, proceed directly to booking
  return res.status(200).json({
    success: true,
    message: 'Your trip preferences have been saved.',
    days_count: 0,
    itineraries: [],
  });

  /* DISABLED CODE - Uncomment to re-enable itinerary generation
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Load trip and ensure it belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // Load user profile
    const { data: userProfile, error: userError } = await supabase
      .from('app_user')
      .select('user_id, name, home_location, budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .single();

    if (userError || !userProfile) {
      throw userError || new Error('User profile not found');
    }

    // Load trip-specific preferences (optional)
    const { data: tripPreferences, error: prefError } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    // Load liked activities to incorporate into itinerary
    // Load liked activities to incorporate into itinerary (without relying on FK-based joins)
    const { data: likedPrefs, error: likedPrefsError } = await supabase
      .from('trip_activity_preference')
      .select('activity_id, preference')
      .eq('trip_id', tripId)
      .eq('preference', 'liked');

    if (likedPrefsError) {
      throw likedPrefsError;
    }

    let likedActivities = [];
    if (likedPrefs && likedPrefs.length > 0) {
      const likedActivityIds = Array.from(
        new Set(
          likedPrefs
            .map((p) => p.activity_id)
            .filter((id) => typeof id === 'number' || typeof id === 'string')
        )
      );

      const { data: likedActivitiesRaw, error: likedActivitiesError } = await supabase
        .from('activity')
        .select(
          'activity_id, name, location, category, duration, cost_estimate, rating, tags'
        )
        .in('activity_id', likedActivityIds);

      if (likedActivitiesError) {
        throw likedActivitiesError;
      }

      likedActivities = likedActivitiesRaw || [];
    }

    // Clear existing itinerary for this trip (activities remain as a shared catalog)
    const { error: deleteItineraryError } = await supabase
      .from('itinerary')
      .delete()
      .eq('trip_id', tripId);

    if (deleteItineraryError) {
      throw deleteItineraryError;
    }

    // If we have liked activities, use them directly and minimize LLM usage
    const numDays = tripPreferences?.num_days ||
                    (tripPreferences?.start_date && tripPreferences?.end_date
                      ? Math.ceil((new Date(tripPreferences.end_date) - new Date(tripPreferences.start_date)) / (1000 * 60 * 60 * 24)) + 1
                      : 3);

    let days = [];

    if (likedActivities.length > 0) {
      // Use liked activities directly - distribute them across days
      const activitiesPerDay = Math.ceil(likedActivities.length / numDays);

      for (let i = 0; i < numDays; i++) {
        const dayActivities = likedActivities.slice(i * activitiesPerDay, (i + 1) * activitiesPerDay);
        if (dayActivities.length > 0) {
          days.push({
            day_number: i + 1,
            date: tripPreferences?.start_date
              ? new Date(new Date(tripPreferences.start_date).getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              : null,
            summary: `Day ${i + 1} featuring ${dayActivities.map(a => a.name).join(', ')}`,
            activities: dayActivities.map(a => ({
              activity_id: a.activity_id,
              name: a.name,
              location: a.location,
              category: a.category,
              duration: a.duration,
            })),
          });
        }
      }

      // Use minimal LLM to just refine day summaries and add any missing activities
      const plannerPrompt = `You are an expert travel planner. Given a list of liked activities already selected by the user, create a day-by-day itinerary that:
- Distributes the liked activities across the days naturally
- Adds 1-2 complementary activities per day if needed (based on preferences)
- Creates engaging day summaries
- Respects pace, safety notes, and custom requests

Liked activities to incorporate: ${JSON.stringify(likedActivities.map(a => ({ name: a.name, category: a.category, location: a.location })))}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "summary": "Short engaging overview",
      "activities": [
        {
          "name": "Activity name (use exact names from liked activities when possible)",
          "location": "Neighborhood or area",
          "category": "outdoors | relaxing | cultural | music | arts | museums | food | nightlife | shopping | nature | adventure | other",
          "duration": "Approximate duration"
        }
      ]
    }
  ]
}`;

      const llmInput = {
        trip,
        user_profile: userProfile,
        trip_preferences: tripPreferences || null,
        liked_activities: likedActivities.map(a => ({
          name: a.name,
          category: a.category,
          location: a.location,
        })),
        preliminary_days: days,
      };

      try {
        const completion = await openaiClient.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: plannerPrompt,
            },
            {
              role: 'user',
              content: JSON.stringify(llmInput),
            },
          ],
          temperature: 0.5,
          max_tokens: 2000,
        });

        const rawContent = completion.choices[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (e) {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        }

        if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
          // Merge LLM suggestions with our liked activities
          days = parsed.days.map((day, idx) => {
            const existingDay = days[idx];
            return {
              ...day,
              day_number: day.day_number || idx + 1,
              date: day.date || existingDay?.date || null,
              activities: [
                ...(existingDay?.activities || []),
                ...(day.activities || []).filter(a =>
                  !existingDay?.activities?.some(ea => ea.name === a.name)
                ),
              ],
            };
          });
        }
      } catch (llmError) {
        console.error('Error refining itinerary with LLM:', llmError);
        // Continue with the basic distribution
      }
    } else {
      // No liked activities - use full LLM generation (original behavior)
      const plannerPrompt = `You are an expert travel planner creating a realistic, safe, and fun itinerary.
You are given structured data about:
- the trip (destination, dates, budget, travelers)
- the traveler's general profile and interests
- this specific trip's preferences (pace, categories, safety notes, custom requests).

Use this to generate a day-by-day itinerary that strongly respects:
- requested activity categories and things to avoid
- safety notes (ex. safe for a group of girls)
- accessibility notes and any custom constraints
- realistic pacing (do not overload days beyond the requested "pace").

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "summary": "Short overview of the day tailored to their preferences.",
      "activities": [
        {
          "name": "Activity name",
          "location": "Neighborhood or area in the destination",
          "category": "outdoors | relaxing | cultural | music | arts | museums | food | nightlife | shopping | nature | adventure | other",
          "duration": "Approximate duration, ex. '2-3 hours'",
          "cost_estimate": 0,
          "rating": 4.5,
          "tags": ["string", "string"]
        }
      ]
    }
  ]
}

If dates or number of days are missing, infer a reasonable number of days (3-5) for a first draft.`;

      const llmInput = {
        trip,
        user_profile: userProfile,
        trip_preferences: tripPreferences || null,
      };

      const completion = await openaiClient.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: plannerPrompt,
          },
          {
            role: 'user',
            content: JSON.stringify(llmInput),
          },
        ],
        temperature: 0.6,
      });

      const rawContent = completion.choices[0]?.message?.content || '{}';

      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch (e) {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse itinerary JSON from LLM response');
        }
      }

      days = Array.isArray(parsed.days) ? parsed.days : [];
    }

    const createdItineraries = [];

    // Insert itineraries and activities
    for (let i = 0; i < days.length; i++) {
      const day = days[i] || {};
      const dayNumber = day.day_number || i + 1;
      const date = day.date || null;
      const summary = day.summary || `Day ${dayNumber} in ${trip.destination || 'your destination'}`;

      const { data: itineraryRow, error: itineraryError } = await supabase
        .from('itinerary')
        .insert([
          {
            trip_id: tripId,
            day_number: dayNumber,
            date,
            summary,
          },
        ])
        .select()
        .single();

      if (itineraryError || !itineraryRow) {
        throw itineraryError || new Error('Failed to insert itinerary day');
      }

      createdItineraries.push(itineraryRow);

      const activities = Array.isArray(day.activities) ? day.activities : [];

      for (let j = 0; j < activities.length; j++) {
        const act = activities[j] || {};
        let activityRow = null;

        // If this activity has an activity_id, it's a liked activity - use it directly
        if (act.activity_id) {
          const { data: existingActivity } = await supabase
            .from('activity')
            .select('*')
            .eq('activity_id', act.activity_id)
            .single();

          if (existingActivity) {
            activityRow = existingActivity;
          }
        }

        // If not found or no activity_id, create/insert new activity
        if (!activityRow) {
          const { data: newActivity, error: activityError } = await supabase
            .from('activity')
            .insert([
              {
                name: act.name || 'Activity',
                location: act.location || trip.destination || null,
                category: act.category || 'other',
                duration: act.duration || null,
                cost_estimate:
                  act.cost_estimate !== undefined && act.cost_estimate !== null
                    ? parseFloat(act.cost_estimate)
                    : null,
                rating:
                  act.rating !== undefined && act.rating !== null
                    ? parseFloat(act.rating)
                    : null,
                tags: Array.isArray(act.tags) ? act.tags : [],
                source: 'llm-itinerary',
              },
            ])
            .select()
            .single();

          if (activityError || !newActivity) {
            throw activityError || new Error('Failed to insert activity');
          }
          activityRow = newActivity;
        }

        const { error: linkError } = await supabase.from('itinerary_activity').insert([
          {
            itinerary_id: itineraryRow.itinerary_id,
            activity_id: activityRow.activity_id,
            order_index: j,
          },
        ]);

        if (linkError) {
          throw linkError;
        }
      }
    }

    const assistantSummary = days.length
      ? `I've created a ${days.length}-day itinerary for your trip to ${
          trip.destination || 'your destination'
        }. You can review it in your trip details.`
      : `I wasn't able to generate a detailed itinerary, but I've saved your preferences for this trip.`;

    // Save a concise assistant message into the chat history for this trip
    await saveMessage(userId, 'assistant', assistantSummary, tripId);

    res.status(200).json({
      success: true,
      message: assistantSummary,
      days_count: days.length,
      itineraries: createdItineraries,
    });
  } catch (error) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate itinerary',
      error: error.message,
    });
  }
  */ // End of disabled code
});

// Phase 5: Generate final chronological itinerary with flights, hotels, and activities
router.post('/:tripId/generate-final-itinerary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = parseInt(req.params.tripId);

    // Load trip and ensure it belongs to the user
    const { data: trip, error: tripError } = await supabase
      .from('trip')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found',
      });
    }

    // Load trip preferences
    const { data: tripPreferences, error: prefError } = await supabase
      .from('trip_preference')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (prefError) {
      throw prefError;
    }

    if (!tripPreferences || !tripPreferences.start_date || !tripPreferences.end_date) {
      return res.status(400).json({
        success: false,
        message: 'Trip dates are required to generate the final itinerary',
      });
    }

    // Load user profile
    const { data: userProfile } = await supabase
      .from('app_user')
      .select('home_location, budget_preference, travel_style, liked_tags')
      .eq('user_id', userId)
      .maybeSingle();

    // Get selected flights
    const { data: tripFlights } = await supabase
      .from('trip_flight')
      .select(`
        flight_id,
        is_selected,
        flight:flight(*)
      `)
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedOutboundFlight = tripFlights?.find(tf => tf.flight?.flight_type === 'outbound')?.flight || null;
    const selectedReturnFlight = tripFlights?.find(tf => tf.flight?.flight_type === 'return')?.flight || null;

    // Get selected hotel
    const { data: tripHotels } = await supabase
      .from('trip_hotel')
      .select(`
        hotel_id,
        is_selected,
        hotel:hotel(*)
      `)
      .eq('trip_id', tripId)
      .eq('is_selected', true);

    const selectedHotel = tripHotels?.[0]?.hotel || null;

    // Get liked activities
    const { data: likedActivityPrefs } = await supabase
      .from('trip_activity_preference')
      .select(`
        activity_id,
        activity:activity(*)
      `)
      .eq('trip_id', tripId)
      .eq('preference', 'liked');

    const likedActivities = (likedActivityPrefs || []).map(ap => ap.activity).filter(Boolean);

    // Calculate date range as pure calendar dates (avoid timezone off-by-one issues)
    const parseDateParts = (s) => {
      const [y, m, d] = String(s).split('-').map((part) => parseInt(part, 10));
      return { y, m, d };
    };

    const startParts = parseDateParts(tripPreferences.start_date);
    const endParts = parseDateParts(tripPreferences.end_date);

    const toDateKey = (dateObj) => {
      const mm = String(dateObj.m).padStart(2, '0');
      const dd = String(dateObj.d).padStart(2, '0');
      return `${dateObj.y}-${mm}-${dd}`;
    };

    const nextDay = (dateObj) => {
      // Use JS Date only for day rollover; read back Y/M/D to avoid timezone issues
      const dt = new Date(dateObj.y, dateObj.m - 1, dateObj.d + 1);
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    };

    // Build inclusive list of calendar dates from start to end
    const calendarDates = [];
    let cur = { ...startParts };
    const endKey = toDateKey(endParts);
    while (toDateKey(cur) <= endKey) {
      calendarDates.push(toDateKey(cur));
      cur = nextDay(cur);
    }

    const calculatedNumDays = calendarDates.length;

    // Use num_days from preferences if available, otherwise calculate from dates
    const numDays = tripPreferences.num_days || calculatedNumDays;

    console.log(
      `[final-itinerary] Date calculation: start=${tripPreferences.start_date}, end=${tripPreferences.end_date}, calculated=${calculatedNumDays}, using=${numDays}`,
    );

    // Generate activities for each day
    const dailyActivities = [];
    const budgetPerDay = tripPreferences.max_budget ? tripPreferences.max_budget / numDays : null;

    // Determine target activities per day based on pace
    const targetActivitiesPerDay = tripPreferences.pace === 'packed' ? 4 : tripPreferences.pace === 'balanced' ? 3 : 2;

    for (let day = 0; day < numDays; day++) {
      const dateStr = calendarDates[day] || calendarDates[calendarDates.length - 1];

      // Get activities for this day (distribute liked activities + generate new ones)
      const dayActivities = [];

      // Distribute liked activities across days (but don't rely on them for all days)
      if (likedActivities.length > 0) {
        const activitiesPerDay = Math.ceil(likedActivities.length / numDays);
        const startIdx = day * activitiesPerDay;
        const endIdx = Math.min(startIdx + activitiesPerDay, likedActivities.length);
        const dayLikedActivities = likedActivities.slice(startIdx, endIdx);
        dayActivities.push(...dayLikedActivities.map(a => ({
          ...a,
          source: 'user_selected',
        })));
      }

      // ALWAYS generate activities to reach target, regardless of how many liked activities we have
      // This ensures every day has activities even if user only liked a couple
      const neededActivities = Math.max(0, targetActivitiesPerDay - dayActivities.length);

      if (neededActivities > 0 && trip.destination) {
        // Generate search query for this day - vary it slightly per day for diversity
        const activityCategories = Array.isArray(tripPreferences.activity_categories) && tripPreferences.activity_categories.length > 0
          ? tripPreferences.activity_categories
          : [];

        // Rotate through categories or use different queries per day for variety
        const categoryForDay = activityCategories.length > 0
          ? activityCategories[day % activityCategories.length]
          : 'activities';

        const dayQuery = `${trip.destination} ${categoryForDay} ${day === 0 ? 'must see' : day === numDays - 1 ? 'last day' : 'things to do'}`;

        try {
          const searchItems = await fetchActivitySearchResults(dayQuery, neededActivities * 3); // Get more to have options
          const filteredItems = searchItems.filter(item => !isLowQualityLink(item.link || ''));

          let addedCount = 0;
          for (const item of filteredItems) {
            if (addedCount >= neededActivities) break;

            const activity = await upsertReusableActivityFromSearchItem(
              item,
              trip.destination,
              tripPreferences,
              userProfile
            );

            if (activity && !dayActivities.find(a => a.activity_id === activity.activity_id)) {
              // Check budget if applicable
              if (budgetPerDay && activity.cost_estimate) {
                const dayTotal = dayActivities.reduce((sum, a) => sum + (a.cost_estimate || 0), 0);
                if (dayTotal + activity.cost_estimate <= budgetPerDay * 1.2) { // Allow 20% buffer
                  dayActivities.push({
                    ...activity,
                    source: 'generated',
                  });
                  addedCount++;
                }
              } else {
                dayActivities.push({
                  ...activity,
                  source: 'generated',
                });
                addedCount++;
              }
            }
          }

          // If we still don't have enough activities, try a more general query
          if (dayActivities.length < targetActivitiesPerDay && addedCount < neededActivities) {
            const generalQuery = `${trip.destination} things to do`;
            const generalItems = await fetchActivitySearchResults(generalQuery, (targetActivitiesPerDay - dayActivities.length) * 2);
            const generalFiltered = generalItems.filter(item => !isLowQualityLink(item.link || ''));

            for (const item of generalFiltered) {
              if (dayActivities.length >= targetActivitiesPerDay) break;

              const activity = await upsertReusableActivityFromSearchItem(
                item,
                trip.destination,
                tripPreferences,
                userProfile
              );

              if (activity && !dayActivities.find(a => a.activity_id === activity.activity_id)) {
                dayActivities.push({
                  ...activity,
                  source: 'generated',
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error generating activities for day ${day + 1}:`, error);
        }
      }

      console.log(`[final-itinerary] Day ${day + 1} (${dateStr}): ${dayActivities.length} activities (target: ${targetActivitiesPerDay})`);

      dailyActivities.push({
        day_number: day + 1,
        date: dateStr,
        activities: dayActivities,
      });
    }

    // Redistribute activities evenly across days (round-robin) so later days are not empty
    if (dailyActivities.length > 0) {
      const allActivities = dailyActivities.flatMap((day) => day.activities || []);
      if (allActivities.length > 0) {
        const redistributed = dailyActivities.map((day) => ({
          ...day,
          activities: [],
        }));

        allActivities.forEach((activity, index) => {
          const dayIndex = index % redistributed.length;
          redistributed[dayIndex].activities.push(activity);
        });

        // Replace with redistributed layout
        for (let i = 0; i < dailyActivities.length; i++) {
          dailyActivities[i].activities = redistributed[i].activities;
        }
      }
    }

    // Persist the day-by-day itinerary so we can reuse it later
    const { error: deleteItineraryError } = await supabase
      .from('itinerary')
      .delete()
      .eq('trip_id', tripId);

    if (deleteItineraryError) {
      throw deleteItineraryError;
    }

    for (const dayData of dailyActivities) {
      const activityNames = Array.isArray(dayData.activities)
        ? dayData.activities
            .map((activity) => activity?.name)
            .filter(Boolean)
            .slice(0, 4)
        : [];
      const summary =
        activityNames.length > 0
          ? `Day ${dayData.day_number}: ${activityNames.join(', ')}`
          : `Day ${dayData.day_number} in ${trip.destination || 'your destination'}`;

      const { data: itineraryRow, error: itineraryError } = await supabase
        .from('itinerary')
        .insert({
          trip_id: tripId,
          day_number: dayData.day_number,
          date: dayData.date,
          summary,
        })
        .select()
        .single();

      if (itineraryError || !itineraryRow) {
        throw itineraryError || new Error('Failed to insert itinerary day');
      }

      const activityLinks = Array.isArray(dayData.activities)
        ? dayData.activities
            .map((activity, index) => ({
              activity_id: activity?.activity_id,
              order_index: index,
            }))
            .filter((link) => typeof link.activity_id === 'number')
        : [];

      if (activityLinks.length > 0) {
        const { error: linkError } = await supabase.from('itinerary_activity').insert(
          activityLinks.map((link) => ({
            itinerary_id: itineraryRow.itinerary_id,
            activity_id: link.activity_id,
            order_index: link.order_index,
          }))
        );

        if (linkError) {
          throw linkError;
        }
      }
    }

    // Build final itinerary structure
    const itinerary = {
      trip_id: tripId,
      trip_title: trip.title,
      destination: trip.destination,
      start_date: tripPreferences.start_date,
      end_date: tripPreferences.end_date,
      num_days: numDays,
      total_budget: tripPreferences.max_budget || null,
      days: dailyActivities.map((dayData, index) => {
        const dayItinerary = {
          day_number: dayData.day_number,
          date: dayData.date,
          activities: dayData.activities.map(a => ({
            activity_id: a.activity_id,
            name: a.name,
            location: a.location,
            category: a.category,
            duration: a.duration,
            cost_estimate: a.cost_estimate,
            source_url: a.source_url,
            image_url: a.image_url,
            description: a.description,
            source: a.source || 'generated',
          })),
        };

        // Add flight info for first and last day
        if (index === 0 && selectedOutboundFlight) {
          dayItinerary.outbound_flight = {
            departure_id: selectedOutboundFlight.departure_id,
            arrival_id: selectedOutboundFlight.arrival_id,
            price: selectedOutboundFlight.price,
            total_duration: selectedOutboundFlight.total_duration,
            flights: selectedOutboundFlight.flights,
            layovers: selectedOutboundFlight.layovers,
          };
        }

        // Check if this is the last day by comparing date to end_date (more reliable than index)
        const isLastDay = dayData.date === tripPreferences.end_date || index === dailyActivities.length - 1;
        if (isLastDay && selectedReturnFlight) {
          dayItinerary.return_flight = {
            departure_id: selectedReturnFlight.departure_id,
            arrival_id: selectedReturnFlight.arrival_id,
            price: selectedReturnFlight.price,
            total_duration: selectedReturnFlight.total_duration,
            flights: selectedReturnFlight.flights,
            layovers: selectedReturnFlight.layovers,
          };
        }

        // Add hotel info (same for all days)
        if (selectedHotel) {
          dayItinerary.hotel = {
            hotel_id: selectedHotel.hotel_id,
            name: selectedHotel.name,
            location: selectedHotel.location,
            rate_per_night: selectedHotel.rate_per_night_lowest,
            rate_per_night_formatted: selectedHotel.rate_per_night_formatted,
            link: selectedHotel.link,
            overall_rating: selectedHotel.overall_rating,
            check_in_time: selectedHotel.check_in_time,
            check_out_time: selectedHotel.check_out_time,
          };
        }

        return dayItinerary;
      }),
    };

    res.status(200).json({
      success: true,
      itinerary,
    });
  } catch (error) {
    console.error('Error generating final itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate final itinerary',
      error: error.message,
    });
  }
});

export default router;

