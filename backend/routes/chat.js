// backend/routes/chat.js
import express from 'express';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import supabase from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default model - can be overridden via env variable
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

const GOOGLE_CUSTOM_SEARCH_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const GOOGLE_CUSTOM_SEARCH_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX || '80b87ce61302c4f86';

function normalizeDestinationName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchDestinationImage(destination) {
  if (!destination) return null;
  if (!GOOGLE_CUSTOM_SEARCH_API_KEY) {
    console.warn('GOOGLE_CUSTOM_SEARCH_API_KEY is not set. Chat-created trips will have no image_url.');
    return null;
  }

  try {
    const query = `${destination} travel landscape photography`;

    const params = new URLSearchParams({
      key: GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: GOOGLE_CUSTOM_SEARCH_CX,
      q: query,
      searchType: 'image',
      num: '1',
      safe: 'active',
      imgType: 'photo',
    });

    const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      console.error('Google Custom Search API error (chat):', response.status, text);
      return null;
    }

    const data = await response.json();
    const firstItem = Array.isArray(data.items) && data.items.length > 0 ? data.items[0] : null;

    if (!firstItem) {
      return null;
    }

  // Get the link from the first item
  return firstItem.link || (firstItem.image && firstItem.image.thumbnailLink) || null;
  } catch (error) {
    console.error('Error fetching destination image (chat):', error);
    return null;
  }
}

// Helper function to load conversation history from database
async function loadConversationHistory(userId, tripId = null) {
  try {
    let query = supabase
      .from('chat_message')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50); // Limit to last 50 messages for context

    // If tripId is provided, filter by trip_id, otherwise get general chat
    if (tripId) {
      query = query.eq('trip_id', tripId);
    } else {
      query = query.is('trip_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading conversation history:', error);
      return [];
    }

    // Filter out system messages (they're added separately)
    return (data || []).filter(msg => msg.role !== 'system').map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  } catch (error) {
    console.error('Error loading conversation history:', error);
    return [];
  }
}

// Helper function to save message to database
async function saveMessage(userId, role, content, tripId = null) {
  try {
    const messageData = {
      user_id: userId,
      role: role,
      content: content
    };

    if (tripId !== null && tripId !== undefined) {
      messageData.trip_id = tripId;
    }

    console.log(`Saving ${role} message:`, { userId, role, contentLength: content.length, tripId });

    const { data, error } = await supabase
      .from('chat_message')
      .insert([messageData])
      .select();

    if (error) {
      console.error('Error saving message:', error);
      throw error;
    } else {
      console.log(`Successfully saved ${role} message with trip_id:`, data[0]?.trip_id || 'NULL');
    }
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

const logisticsMealSlotOrder = ["breakfast", "lunch", "dinner"];

function extractDelayHours(text) {
  if (!text || typeof text !== "string") return null;
  // Supports: "delayed 24 hours", "delayed 24h", "delayed 24 hr"
  const m = text.match(/(\d+)\s*(?:hours?|hrs?|hour)\b/i);
  if (m?.[1]) return Number(m[1]);
  const h = text.match(/(\d+)\s*h\b/i);
  if (h?.[1]) return Number(h[1]);
  return null;
}

/** Plain-text snippets pasted from a Google-style flight status card (or our demo block). */
function looksLikeGoogleFlightStatusSnippet(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return (
    /departing\s+late/.test(lower) ||
    /flight\s+status/.test(lower) ||
    /estimated\s+departure/.test(lower) ||
    /original\s+departure/.test(lower) ||
    /\b(aa|ua|dl|wn|f9|as)\s*\d{2,4}\b/i.test(text)
  );
}

function parseLocalYmdHm(ymd, hourStr, minuteStr) {
  const ymdMatch = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!ymdMatch) return null;
  const y = Number(ymdMatch[1]);
  const mo = Number(ymdMatch[2]);
  const d = Number(ymdMatch[3]);
  const hh = Number(hourStr);
  const mm = Number(minuteStr);
  if (![y, mo, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  const t = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Derive delay length from "Original departure" vs "Estimated departure" lines
 * (same format as the outbound flight details modal: YYYY-MM-DD HH:mm).
 */
function extractDelayHoursFromFlightStatusCard(text) {
  if (!text || typeof text !== "string") return null;
  const orig = text.match(/original\s+departure:?\s*(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/i);
  const est = text.match(/estimated\s+departure:?\s*(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/i);
  if (!orig || !est) return null;
  const t0 = parseLocalYmdHm(orig[1], orig[2], orig[3]);
  const t1 = parseLocalYmdHm(est[1], est[2], est[3]);
  if (t0 == null || t1 == null) return null;
  const hours = Math.round((t1 - t0) / (60 * 60 * 1000));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 96) return null;
  return hours;
}

function inferFlightType(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (/\boutbound\b/.test(lower)) return "outbound";
  if (/\breturn\b/.test(lower)) return "return";
  if (/\bintercity\b/.test(lower) || /\binter-city\b/.test(lower)) return "intercity";
  return null;
}

function inferFlightTypeForModifyLogistics(text) {
  const explicit = inferFlightType(text);
  if (explicit) return explicit;
  if (looksLikeGoogleFlightStatusSnippet(text)) return "outbound";
  return null;
}

function extractDelayHoursForModifyLogistics(text) {
  const fromPhrase = extractDelayHours(text);
  if (fromPhrase != null) return fromPhrase;
  return extractDelayHoursFromFlightStatusCard(text);
}

function isConfirmationMessage(text) {
  if (!text || typeof text !== "string") return false;
  return /\b(confirm|apply|yes|do it)\b/i.test(text.trim());
}

/** Embedded in assistant messages; frontend renders the flight status card between before/after text. */

function extractDelayHoursFromFlightStatusDemoMarker(assistantMessages) {
  const list = Array.isArray(assistantMessages) ? assistantMessages.slice().reverse() : [];
  for (const m of list) {
    const content = String(m.content || "");
    const match = content.match(/\[\[PINDROP_FLIGHT_STATUS_DEMO:(\d+)\]\]/);
    if (match) return Number(match[1]);
  }
  return null;
}

/** User asks to look up outbound flight status (simulated search in modify-logistics). */
function parseOutboundFlightStatusLookupRequest(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (
    !/check|look\s*up|lookup|search|find|pull\s*up|see\s+if|what'?s\s+the\s+status|status\s+of|probe|internet/.test(
      lower
    )
  ) {
    return null;
  }
  const m = text.match(/\b([a-z]{2})\s*(\d{2,4})\b/i);
  if (!m) return null;
  return { airline: m[1].toUpperCase(), number: m[2], full: `${m[1].toUpperCase()}${m[2]}` };
}

/** Demo simulates only this flight (matches mock card). */
const DEMO_FLIGHT_STATUS_LOOKUP_NUMBER = "AA1234";

function canonicalizeCityValue(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  // Match the canonicalization approach used elsewhere in the app:
  // - remove parenthetical suffixes
  // - take the part before a comma (if present)
  const noParens = trimmed.replace(/\(.*?\)/g, " ");
  const primary = noParens.split(",")[0] || noParens;
  return primary
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeCityKey(value) {
  if (!value) return "";
  return canonicalizeCityValue(value).toLowerCase();
}

function parseDateKey(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Fallback: best-effort parse.
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
  return null;
}

function parseDateParts(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toDateKeyFromParts(dateObj) {
  if (!dateObj) return null;
  const mm = String(dateObj.m).padStart(2, "0");
  const dd = String(dateObj.d).padStart(2, "0");
  return `${dateObj.y}-${mm}-${dd}`;
}

function nextDayFromParts(dateObj) {
  if (!dateObj) return null;
  const dt = new Date(Date.UTC(dateObj.y, dateObj.m - 1, dateObj.d + 1));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function buildCalendarDates(startDateKey, endDateKey) {
  const startParts = parseDateParts(startDateKey);
  const endParts = parseDateParts(endDateKey);
  if (!startParts || !endParts) return [];
  const dates = [];
  const endKey = toDateKeyFromParts(endParts);
  let cur = { ...startParts };
  while (toDateKeyFromParts(cur) <= endKey) {
    dates.push(toDateKeyFromParts(cur));
    cur = nextDayFromParts(cur);
  }
  return dates;
}

function addHoursToDateKeyUTC(dateKey, hours) {
  if (!dateKey || typeof dateKey !== "string") return null;
  const parts = parseDateParts(dateKey);
  if (!parts) return null;
  const ms = Date.UTC(parts.y, parts.m - 1, parts.d);
  const next = new Date(ms + hours * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

// Field names that commonly hold departure/arrival datetimes in stored SerpAPI/Google Flights JSON.
const FLIGHT_DATETIME_FIELD_KEYS = new Set([
  "time",
  "date",
  "departure_time",
  "arrival_time",
  "departure_date",
  "arrival_date",
]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Shifts strings like "2026-12-11 16:45" or "2026-12-11T07:05" (final itinerary flight rows)
 * while preserving the same date+time shape for the UI.
 */
function shiftDateTimeString(s, delayHours) {
  if (typeof s !== "string" || !s.trim()) return s;
  const trimmed = s.trim();
  const pure = parseDateParts(trimmed);
  if (pure && trimmed === toDateKeyFromParts(pure)) {
    return addHoursToDateKeyUTC(trimmed, delayHours);
  }

  // ISO-like local: YYYY-MM-DD[ T]HH:mm[:ss] — match what Final Itinerary displays.
  const localIsoLike = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (localIsoLike) {
    const y = Number(localIsoLike[1]);
    const mo = Number(localIsoLike[2]);
    const da = Number(localIsoLike[3]);
    const sep = localIsoLike[4];
    const h = Number(localIsoLike[5]);
    const mi = Number(localIsoLike[6]);
    const sec = localIsoLike[7] != null ? Number(localIsoLike[7]) : 0;
    const base = new Date(y, mo - 1, da, h, mi, sec);
    if (Number.isNaN(base.getTime())) return s;
    const shifted = new Date(base.getTime() + delayHours * 60 * 60 * 1000);
    const datePart = `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`;
    const timeCore = `${pad2(shifted.getHours())}:${pad2(shifted.getMinutes())}`;
    if (localIsoLike[7] != null) {
      return `${datePart}${sep}${timeCore}:${pad2(shifted.getSeconds())}`;
    }
    return `${datePart}${sep}${timeCore}`;
  }

  // Avoid Date.parse on month/day without a year (parses to ~2001 and corrupts the schedule).
  const hasExplicitYear = /\b(19|20)\d{2}\b/.test(trimmed);
  const isoDatePrefix = /^\d{4}-\d{2}-\d{2}/.test(trimmed);
  if (!hasExplicitYear && !isoDatePrefix) return s;

  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return s;
  const d = new Date(ms + delayHours * 60 * 60 * 1000);
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return d.toISOString();
  }
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Shift schedule strings inside flight.legs JSON (not whole-trip blobs like tokens). */
function shiftFlightLegJsonByDelay(value, delayHours) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => shiftFlightLegJsonByDelay(v, delayHours));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && FLIGHT_DATETIME_FIELD_KEYS.has(k)) {
        out[k] = shiftDateTimeString(v, delayHours);
      } else {
        out[k] = shiftFlightLegJsonByDelay(v, delayHours);
      }
    }
    return out;
  }
  return value;
}

/** Same calendar date extraction as trips.js extractArrivalInfo + parseDateKey (local Date parsing). */
function tripsStyleParseDateKey(value) {
  if (!value) return null;
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    const yyyy = asDate.getFullYear();
    const mm = String(asDate.getMonth() + 1).padStart(2, "0");
    const dd = String(asDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

function extractArrivalDateKeyTripsStyle(flight) {
  if (!flight || !Array.isArray(flight.flights) || flight.flights.length === 0) return null;
  const lastLeg = flight.flights[flight.flights.length - 1] || {};
  const arrivalValue =
    lastLeg?.arrival_airport?.time ||
    lastLeg?.arrival_airport?.date ||
    lastLeg?.arrival?.time ||
    lastLeg?.arrival?.date ||
    lastLeg?.arrival_time ||
    lastLeg?.arrival_date ||
    null;
  if (!arrivalValue) return null;
  return tripsStyleParseDateKey(arrivalValue);
}

function computeOutboundActivityStartIndex({ startDateKey, endDateKey, selectedOutboundFlight, maxDays }) {
  const calendarDates =
    startDateKey && endDateKey ? buildCalendarDates(startDateKey, endDateKey) : [];
  let activityStartIndex = 0;
  const arrivalDateKey = extractArrivalDateKeyTripsStyle(selectedOutboundFlight);
  if (arrivalDateKey && calendarDates.length > 0) {
    const calendarIndex = calendarDates.indexOf(arrivalDateKey);
    if (calendarIndex >= 0) {
      activityStartIndex = calendarIndex;
    }
  }
  return Math.max(0, Math.min(activityStartIndex, Math.max(0, maxDays)));
}

function extractCityResolvedCities(trip, tripPreferences) {
  const ordered = Array.isArray(tripPreferences?.ordered_cities) ? tripPreferences.ordered_cities : [];
  const selected = Array.isArray(tripPreferences?.selected_cities) ? tripPreferences.selected_cities : [];

  if (ordered.length > 0) return ordered;
  if (selected.length > 0) return selected;
  if (trip?.destination) return [trip.destination];
  return [];
}

/**
 * When start_date moves later but end_date stays fixed, the trip loses calendar day(s).
 * Those days should come out of the first stop only (intercity / later cities stay aligned).
 * Returns a new city_days object, or null if nothing to change.
 */
function shrinkFirstCityInCityDays(tripPreferences, trip, lostCalendarDays) {
  const lost = Number(lostCalendarDays);
  if (!Number.isFinite(lost) || lost <= 0) return null;
  const raw = tripPreferences?.city_days;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const cities = extractCityResolvedCities(trip, tripPreferences);
  if (cities.length < 1) return null;

  const firstNorm = normalizeCityKey(cities[0]);
  if (!firstNorm) return null;

  const updated = { ...raw };
  for (const [key, value] of Object.entries(raw)) {
    if (normalizeCityKey(key) !== firstNorm) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const next = Math.max(1, Math.round(numeric - lost));
    updated[key] = next;
    return updated;
  }
  return null;
}

/** First calendar day (1-based) assigned to the second city in ordered_cities (intercity / Rome start). */
function firstSecondCityDayNumber(dayCityByIndex, effectiveCities) {
  if (!Array.isArray(dayCityByIndex) || dayCityByIndex.length === 0) return null;
  if (!effectiveCities || effectiveCities.length < 2) return null;
  const firstNorm = normalizeCityKey(effectiveCities[0]);
  if (!firstNorm) return null;
  for (let i = 0; i < dayCityByIndex.length; i += 1) {
    const c = dayCityByIndex[i];
    if (!c) continue;
    if (normalizeCityKey(c) !== firstNorm) return i + 1;
  }
  return null;
}

/**
 * When the second city starts on an earlier day_number after shrinking the first stop,
 * move itinerary_activity and trip_meal so the same calendar days (e.g. intercity on 12/14)
 * stay on the correct absolute dates — without wiping Rome.
 */
async function migrateSecondCityDaysAfterOutboundDelay({
  supabase,
  tripId,
  itinerarySnapshot,
  oldFirstSecondCityDay,
  newFirstSecondCityDay,
  oldTripMaxDayNumber,
  newNumDays,
  nowIso,
}) {
  if (!oldFirstSecondCityDay || !newFirstSecondCityDay) return;
  const delta = newFirstSecondCityDay - oldFirstSecondCityDay;
  if (delta === 0) return;

  const snapshotByDay = new Map((itinerarySnapshot || []).map((r) => [r.day_number, r.itinerary_id]));

  const { data: currentItin, error: curErr } = await supabase
    .from("itinerary")
    .select("itinerary_id, day_number")
    .eq("trip_id", tripId);
  if (curErr) throw curErr;
  const dayToItinId = new Map((currentItin || []).map((r) => [r.day_number, r.itinerary_id]));

  const { data: mealsBefore, error: mealSnapErr } = await supabase
    .from("trip_meal")
    .select("trip_meal_id, day_number, slot, name, location, link, cost, finalized")
    .eq("trip_id", tripId)
    .gte("day_number", oldFirstSecondCityDay);
  if (mealSnapErr) throw mealSnapErr;

  for (let old_d = oldFirstSecondCityDay; old_d <= oldTripMaxDayNumber; old_d += 1) {
    const new_d = old_d + delta;
    if (new_d < 1 || new_d > newNumDays) continue;
    const oldItinId = snapshotByDay.get(old_d);
    const newItinId = dayToItinId.get(new_d);
    if (!oldItinId || !newItinId || oldItinId === newItinId) continue;

    if (new_d >= newFirstSecondCityDay) {
      const { error: clearDestErr } = await supabase
        .from("itinerary_activity")
        .delete()
        .eq("itinerary_id", newItinId);
      if (clearDestErr) throw clearDestErr;
    }

    const { error: moveErr } = await supabase
      .from("itinerary_activity")
      .update({ itinerary_id: newItinId })
      .eq("itinerary_id", oldItinId);
    if (moveErr) throw moveErr;
  }

  const { error: delMealsErr } = await supabase
    .from("trip_meal")
    .delete()
    .eq("trip_id", tripId)
    .gte("day_number", newFirstSecondCityDay);
  if (delMealsErr) throw delMealsErr;

  const mealRows = (mealsBefore || [])
    .map((m) => {
      const nd = m.day_number + delta;
      if (nd < 1 || nd > newNumDays) return null;
      return {
        trip_id: tripId,
        day_number: nd,
        slot: m.slot,
        name: m.name,
        location: m.location,
        link: m.link,
        cost: m.cost,
        finalized: m.finalized ?? false,
        updated_at: nowIso,
        created_at: nowIso,
      };
    })
    .filter(Boolean);

  if (mealRows.length > 0) {
    const { error: insMealErr } = await supabase.from("trip_meal").insert(mealRows);
    if (insMealErr) throw insMealErr;
  }
}

function computeDayCityByIndex({ trip, tripPreferences, selectedOutboundFlight, numDays }) {
  const calendarDates =
    tripPreferences?.start_date && tripPreferences?.end_date
      ? buildCalendarDates(tripPreferences.start_date, tripPreferences.end_date)
      : [];

  const activityStartIndexRaw = (() => {
    if (!selectedOutboundFlight) return 0;
    const arrivalDateKey = extractArrivalDateKeyTripsStyle(selectedOutboundFlight);
    if (!arrivalDateKey) return 0;
    if (calendarDates.length === 0) return 0;
    const calendarIndex = calendarDates.indexOf(arrivalDateKey);
    if (calendarIndex >= 0) return calendarIndex;
    // fallback: if dates didn't align, place at the start.
    return 0;
  })();

  const activityStartIndex = Math.max(0, Math.min(activityStartIndexRaw, Math.max(1, numDays)));
  const dayCityByIndex = Array(numDays).fill(null);

  let effectiveCities = extractCityResolvedCities(trip, tripPreferences);
  if (effectiveCities.length === 0) {
    effectiveCities = [trip?.destination || "Destination"];
  }

  const cityDayAllocations = new Map();
  const cityDaysObj = tripPreferences?.city_days;
  if (cityDaysObj && typeof cityDaysObj === "object" && !Array.isArray(cityDaysObj)) {
    Object.entries(cityDaysObj).forEach(([key, value]) => {
      const normalized = normalizeCityKey(key);
      const numeric = Number(value);
      if (normalized && Number.isFinite(numeric) && numeric > 0) cityDayAllocations.set(normalized, numeric);
    });
  }

  let remainingSlots = Math.max(0, numDays - activityStartIndex);
  let remainingCities = effectiveCities.length;
  const allocations = [];

  effectiveCities.forEach((city, idx) => {
    if (remainingSlots <= 0) {
      allocations.push(0);
      remainingCities--;
      return;
    }
    const normalized = normalizeCityKey(city);
    let desired = cityDayAllocations.get(normalized);
    if (!Number.isFinite(desired) || desired <= 0) desired = Math.floor(remainingSlots / Math.max(1, remainingCities));
    if (idx === effectiveCities.length - 1) desired = Math.max(desired, remainingSlots);
    desired = Math.min(remainingSlots, Math.max(0, Math.round(desired)));
    allocations.push(desired);
    remainingSlots -= desired;
    remainingCities--;
  });

  if (remainingSlots > 0 && allocations.length > 0) {
    allocations[allocations.length - 1] += remainingSlots;
  }

  let pointer = Math.min(activityStartIndex, dayCityByIndex.length);
  allocations.forEach((count, idx) => {
    const city = effectiveCities[idx];
    for (let i = 0; i < count && pointer < dayCityByIndex.length; i += 1) {
      dayCityByIndex[pointer] = city;
      pointer += 1;
    }
  });

  // Fill any remaining nulls with last known city (best-effort)
  while (pointer < dayCityByIndex.length) {
    dayCityByIndex[pointer] = effectiveCities[effectiveCities.length - 1] || trip?.destination || null;
    pointer += 1;
  }

  const firstCityDays = allocations[0] ?? 0;
  const firstCityStartIndex = activityStartIndex;
  const firstCityEndIndexExclusive = Math.min(dayCityByIndex.length, firstCityStartIndex + firstCityDays);
  const firstCityDayNumbers = [];
  for (let i = firstCityStartIndex; i < firstCityEndIndexExclusive; i += 1) {
    firstCityDayNumbers.push(i + 1);
  }

  return { activityStartIndex, dayCityByIndex, firstCityDayNumbers, firstCityDays };
}

const EARTH_RADIUS_KM = 6371;
const coordinateCache = new Map();

const hasValidCoords = (coord) =>
  coord &&
  typeof coord.lat === "number" &&
  typeof coord.lng === "number" &&
  Number.isFinite(coord.lat) &&
  Number.isFinite(coord.lng);

function haversineDistanceKm(a, b) {
  if (!hasValidCoords(a) || !hasValidCoords(b)) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

const centroidOfCoords = (coords) => {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const sum = coords.reduce(
    (acc, coord) => {
      if (!hasValidCoords(coord)) return acc;
      return { lat: acc.lat + coord.lat, lng: acc.lng + coord.lng, count: acc.count + 1 };
    },
    { lat: 0, lng: 0, count: 0 }
  );
  if (!sum.count) return null;
  return { lat: sum.lat / sum.count, lng: sum.lng / sum.count };
};

async function geocodeText(query) {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_MAPS_API_KEY) return null;
  if (!query || typeof query !== "string") return null;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (coordinateCache.has(normalized)) return coordinateCache.get(normalized);

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      normalized
    )}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      coordinateCache.set(normalized, null);
      return null;
    }
    const data = await res.json();
    const location = data?.results?.[0]?.geometry?.location || null;
    coordinateCache.set(normalized, location || null);
    return location || null;
  } catch {
    coordinateCache.set(normalized, null);
    return null;
  }
}

async function resolvePlaceCoordinates({ address, name, city, destination }) {
  const pieces = [];
  if (address) pieces.push(address);
  if (!address && name) pieces.push(name);
  if (city) pieces.push(city);
  if (destination) pieces.push(destination);
  if (pieces.length === 0) return null;
  return geocodeText(pieces.join(", "));
}

async function attachGeoToActivity(activity, { city, destination }) {
  if (!activity) return null;
  if (activity._geo_resolved) return activity._geo || null;
  const coords = await resolvePlaceCoordinates({
    address: activity.address || activity.location || null,
    name: activity.name,
    city,
    destination,
  });
  if (coords) activity._geo = coords;
  activity._geo_resolved = true;
  return activity._geo || null;
}

function clusterActivitiesByCoords(activities, clusterCount) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return Array.from({ length: clusterCount }, () => []);
  }
  if (clusterCount <= 1) return [activities.slice()];

  const entries = activities
    .map((activity) => ({ activity, coord: hasValidCoords(activity._geo) ? activity._geo : null }))
    .filter((e) => e.coord);

  const withoutCoords = activities.filter((activity) => !hasValidCoords(activity._geo));
  if (entries.length === 0) {
    const result = Array.from({ length: clusterCount }, () => []);
    activities.forEach((activity, index) => result[index % clusterCount].push(activity));
    return result;
  }

  const k = Math.min(clusterCount, entries.length);

  // Initial centroids: pick far-apart entries
  const centroids = [];
  centroids.push({ ...entries[0].coord });
  while (centroids.length < k && centroids.length < entries.length) {
    let bestEntry = null;
    let bestDistance = -1;
    for (const entry of entries) {
      const minDistance = centroids.reduce((min, centroid) => Math.min(min, haversineDistanceKm(entry.coord, centroid)), Infinity);
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        bestEntry = entry;
      }
    }
    if (bestEntry) centroids.push({ ...bestEntry.coord });
    else break;
  }

  while (centroids.length < k) centroids.push({ ...entries[0].coord });

  // 5 iterations of centroid reassignment
  for (let iter = 0; iter < 5; iter++) {
    const clusters = Array.from({ length: k }, () => []);
    for (const entry of entries) {
      let bestIdx = 0;
      let bestDistance = Infinity;
      centroids.forEach((centroid, idx) => {
        const dist = haversineDistanceKm(entry.coord, centroid);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIdx = idx;
        }
      });
      clusters[bestIdx].push(entry);
    }
    const nextCentroids = clusters.map((cluster) => (cluster.length ? centroidOfCoords(cluster.map((e) => e.coord)) : null));
    // Stop if centroids don't move much
    let changed = false;
    nextCentroids.forEach((next, idx) => {
      const cur = centroids[idx];
      if (!next || !cur) return;
      if (Math.abs(next.lat - cur.lat) > 0.0001 || Math.abs(next.lng - cur.lng) > 0.0001) changed = true;
    });
    centroids.splice(0, centroids.length, ...nextCentroids.map((c) => c || entries[0].coord));
    if (!changed) break;
  }

  // Final grouping
  const grouped = Array.from({ length: clusterCount }, () => []);
  const finalK = Math.min(clusterCount, entries.length);
  const finalCentroids = centroids.slice(0, finalK);
  for (const entry of entries) {
    let bestIdx = 0;
    let bestDistance = Infinity;
    finalCentroids.forEach((centroid, idx) => {
      const dist = haversineDistanceKm(entry.coord, centroid);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIdx = idx;
      }
    });
    grouped[bestIdx].push(entry.activity);
  }
  withoutCoords.forEach((activity, index) => {
    grouped[index % grouped.length].push(activity);
  });
  return grouped;
}

async function applyOutboundDelayAndReplanFirstCity({ userId, tripId, delayHours }) {
  const nowIso = new Date().toISOString();

  // Load trip + preferences
  const { data: trip, error: tripError } = await supabase
    .from("trip")
    .select("trip_id, user_id, title, destination")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .single();
  if (tripError || !trip) throw new Error("Trip not found");

  const { data: tripPreferences, error: prefError } = await supabase
    .from("trip_preference")
    .select("*")
    .eq("trip_id", tripId)
    .maybeSingle();
  if (prefError) throw prefError;
  if (!tripPreferences?.start_date || !tripPreferences?.end_date) {
    throw new Error("Trip dates are required to apply logistics changes");
  }

  // Load current selected outbound flight
  const { data: selectedTripFlights, error: selectedFlightsError } = await supabase
    .from("trip_flight")
    .select(
      `
        flight_id,
        is_selected,
        finalized,
        flight:flight(*)
      `
    )
    .eq("trip_id", tripId)
    .eq("is_selected", true);
  if (selectedFlightsError) throw selectedFlightsError;

  const selectedOutboundLink = selectedTripFlights?.find((tf) => tf.flight?.flight_type === "outbound") || null;
  if (!selectedOutboundLink?.flight) throw new Error("No selected outbound flight found");

  const oldSelectedOutboundFlight = selectedOutboundLink.flight;
  const oldSelectedOutboundTripFlightId = selectedOutboundLink.flight_id;

  const oldNumDays =
    tripPreferences?.num_days ||
    buildCalendarDates(tripPreferences.start_date, tripPreferences.end_date).length ||
    (tripPreferences ? 1 : 1);

  const oldFirstRange = computeDayCityByIndex({
    trip,
    tripPreferences,
    selectedOutboundFlight: oldSelectedOutboundFlight,
    numDays: oldNumDays,
  });

  // Create NEW delayed outbound flight row (no overwrites)
  const shiftedOutboundDate = oldSelectedOutboundFlight?.outbound_date
    ? addHoursToDateKeyUTC(oldSelectedOutboundFlight.outbound_date, delayHours)
    : tripPreferences.start_date;

  const shiftedFlights = shiftFlightLegJsonByDelay(oldSelectedOutboundFlight.flights, delayHours);

  const { data: newFlightData, error: newFlightInsertError } = await supabase
    .from("flight")
    .insert([
      {
        flight_type: "outbound",
        price: oldSelectedOutboundFlight.price,
        departure_token: oldSelectedOutboundFlight.departure_token,
        total_duration: oldSelectedOutboundFlight.total_duration,
        flights: shiftedFlights,
        layovers: oldSelectedOutboundFlight.layovers,
        additional_data: oldSelectedOutboundFlight.additional_data || {},
        departure_id: oldSelectedOutboundFlight.departure_id,
        arrival_id: oldSelectedOutboundFlight.arrival_id,
        outbound_date: shiftedOutboundDate,
        return_date: oldSelectedOutboundFlight.return_date || null,
        currency: oldSelectedOutboundFlight.currency || "USD",
        additional_search_params: oldSelectedOutboundFlight.additional_search_params || {},
      },
    ])
    .select("flight_id")
    .single();
  if (newFlightInsertError || !newFlightData?.flight_id) {
    throw new Error("Failed to insert delayed outbound flight");
  }
  const newFlightId = newFlightData.flight_id;

  const newOutboundFlightForPlanning = {
    ...oldSelectedOutboundFlight,
    flight_id: newFlightId,
    flights: shiftedFlights,
    outbound_date: shiftedOutboundDate,
  };

  // Update trip_flight selection: old outbound -> unselected, new outbound -> selected
  const { error: unselectError } = await supabase
    .from("trip_flight")
    .update({ is_selected: false, updated_at: nowIso })
    .eq("trip_id", tripId)
    .eq("flight_id", oldSelectedOutboundTripFlightId);
  if (unselectError) throw unselectError;

  const { error: selectError } = await supabase.from("trip_flight").insert([
    {
      trip_id: tripId,
      flight_id: newFlightId,
      is_selected: true,
      finalized: selectedOutboundLink.finalized ?? true,
      updated_at: nowIso,
      created_at: nowIso,
    },
  ]);
  if (selectError) throw selectError;

  // Shift trip start_date forward and keep end_date fixed
  const newStartDateKey = addHoursToDateKeyUTC(tripPreferences.start_date, delayHours);
  if (!newStartDateKey) throw new Error("Failed to compute new trip start_date");

  const newCalendarDates = buildCalendarDates(newStartDateKey, tripPreferences.end_date);
  const oldCalendarDates = buildCalendarDates(tripPreferences.start_date, tripPreferences.end_date);
  const oldCalendarCount = oldCalendarDates.length || oldNumDays;
  const newNumDays = newCalendarDates.length || oldCalendarCount;

  // Losing calendar days at the start should shorten the first stop, not later cities (intercity dates unchanged).
  const lostCalendarDays = Math.max(0, oldCalendarCount - newNumDays);
  const shrunkCityDays = shrinkFirstCityInCityDays(tripPreferences, trip, lostCalendarDays);

  const planningTripPreferences = {
    ...tripPreferences,
    start_date: newStartDateKey,
    num_days: newNumDays,
    end_date: tripPreferences.end_date,
    ...(shrunkCityDays ? { city_days: shrunkCityDays } : {}),
  };

  const oldDayLayout = computeDayCityByIndex({
    trip,
    tripPreferences,
    selectedOutboundFlight: oldSelectedOutboundFlight,
    numDays: oldCalendarCount,
  });
  const newDayLayout = computeDayCityByIndex({
    trip,
    tripPreferences: planningTripPreferences,
    selectedOutboundFlight: newOutboundFlightForPlanning,
    numDays: newNumDays,
  });

  const effectiveCitiesOld = extractCityResolvedCities(trip, tripPreferences);
  const effectiveCitiesNew = extractCityResolvedCities(trip, planningTripPreferences);
  const oldFirstSecondCityDay = firstSecondCityDayNumber(oldDayLayout.dayCityByIndex, effectiveCitiesOld);
  const newFirstSecondCityDay = firstSecondCityDayNumber(newDayLayout.dayCityByIndex, effectiveCitiesNew);

  const { data: itinerarySnapshotRows, error: itinerarySnapErr } = await supabase
    .from("itinerary")
    .select("itinerary_id, day_number, date")
    .eq("trip_id", tripId);
  if (itinerarySnapErr) throw itinerarySnapErr;
  const oldTripMaxDayNumber =
    (itinerarySnapshotRows || []).reduce((m, r) => Math.max(m, r.day_number || 0), 0) || oldCalendarCount;

  const { error: prefUpdateError } = await supabase
    .from("trip_preference")
    .update({
      start_date: newStartDateKey,
      num_days: newNumDays,
      updated_at: nowIso,
      ...(shrunkCityDays ? { city_days: shrunkCityDays } : {}),
    })
    .eq("trip_id", tripId);
  if (prefUpdateError) throw prefUpdateError;

  // Update itinerary day dates/summaries and truncate tail days
  const { error: itineraryDeleteError } = await supabase
    .from("itinerary")
    .delete()
    .eq("trip_id", tripId)
    .gt("day_number", newNumDays);
  if (itineraryDeleteError) throw itineraryDeleteError;

  const { data: itineraryRowsToUpdate, error: itineraryRowsErr } = await supabase
    .from("itinerary")
    .select("itinerary_id, day_number")
    .eq("trip_id", tripId)
    .lte("day_number", newNumDays);
  if (itineraryRowsErr) throw itineraryRowsErr;

  for (const row of itineraryRowsToUpdate || []) {
    const dateKey = newCalendarDates[row.day_number - 1] || null;
    if (!dateKey) continue;
    await supabase
      .from("itinerary")
      .update({
        date: dateKey,
        summary: `Day ${row.day_number}${trip.destination ? ` in ${trip.destination}` : ""}`,
        updated_at: nowIso,
      })
      .eq("itinerary_id", row.itinerary_id);
  }

  await migrateSecondCityDaysAfterOutboundDelay({
    supabase,
    tripId,
    itinerarySnapshot: itinerarySnapshotRows || [],
    oldFirstSecondCityDay,
    newFirstSecondCityDay,
    oldTripMaxDayNumber,
    newNumDays,
    nowIso,
  });

  // Remove activities and meals on travel-only days (matches final-itinerary travel_day logic).
  const outboundActivityStartIndex = computeOutboundActivityStartIndex({
    startDateKey: newStartDateKey,
    endDateKey: tripPreferences.end_date,
    selectedOutboundFlight: newOutboundFlightForPlanning,
    maxDays: newNumDays,
  });
  const travelDayNumbers = [];
  for (let dn = 1; dn <= outboundActivityStartIndex; dn += 1) {
    travelDayNumbers.push(dn);
  }
  if (travelDayNumbers.length > 0) {
    const { data: travelItinRows, error: travelItinErr } = await supabase
      .from("itinerary")
      .select("itinerary_id")
      .eq("trip_id", tripId)
      .in("day_number", travelDayNumbers);
    if (travelItinErr) throw travelItinErr;
    const travelItinIds = (travelItinRows || []).map((r) => r.itinerary_id).filter(Boolean);
    if (travelItinIds.length > 0) {
      const { error: clearTravelActErr } = await supabase
        .from("itinerary_activity")
        .delete()
        .in("itinerary_id", travelItinIds);
      if (clearTravelActErr) throw clearTravelActErr;
    }
    const { error: clearTravelMealsErr } = await supabase
      .from("trip_meal")
      .delete()
      .eq("trip_id", tripId)
      .in("day_number", travelDayNumbers);
    if (clearTravelMealsErr) throw clearTravelMealsErr;
  }

  // Truncate meals beyond newNumDays
  const { error: mealsDeleteError } = await supabase
    .from("trip_meal")
    .delete()
    .eq("trip_id", tripId)
    .gt("day_number", newNumDays);
  if (mealsDeleteError) throw mealsDeleteError;

  // Compute new first-city segment (only that segment gets replan work)
  const newFirstRange = computeDayCityByIndex({
    trip,
    tripPreferences: planningTripPreferences,
    selectedOutboundFlight: newOutboundFlightForPlanning,
    numDays: newNumDays,
  });

  const newFirstDayNumbers = newFirstRange.firstCityDayNumbers;
  if (Array.isArray(newFirstDayNumbers) && newFirstDayNumbers.length > 0) {
    const firstDayItinerary = await supabase
      .from("itinerary")
      .select("itinerary_id, day_number")
      .eq("trip_id", tripId)
      .in("day_number", newFirstDayNumbers);
    if (firstDayItinerary.error) throw firstDayItinerary.error;

    const itineraryRows = firstDayItinerary.data || [];
    const itineraryIds = itineraryRows.map((r) => r.itinerary_id);

    if (itineraryIds.length > 0) {
      // Load current activities linked to the affected segment
      const { data: links, error: linksErr } = await supabase
        .from("itinerary_activity")
        .select(
          `
            itinerary_id,
            activity_id,
            order_index,
            activity:activity(*)
          `
        )
        .in("itinerary_id", itineraryIds);
      if (linksErr) throw linksErr;

      const activityByItineraryId = new Map();
      (itineraryRows || []).forEach((r) => activityByItineraryId.set(r.itinerary_id, { day_number: r.day_number, activities: [] }));
      (links || []).forEach((l) => {
        const bucket = activityByItineraryId.get(l.itinerary_id);
        if (bucket && l.activity) {
          bucket.activities.push(l.activity);
        }
      });

      const allActivities = [];
      for (const bucket of activityByItineraryId.values()) {
        allActivities.push(...bucket.activities);
      }

      // Importance heuristic to keep most important activities if we need to cut.
      const allowedCategories = Array.isArray(tripPreferences.activity_categories)
        ? tripPreferences.activity_categories.map((c) => String(c).toLowerCase())
        : [];
      const avoidedCategories = Array.isArray(tripPreferences.avoid_activity_categories)
        ? tripPreferences.avoid_activity_categories.map((c) => String(c).toLowerCase())
        : [];

      const scoreActivity = (activity) => {
        const cat = (activity?.category || "").toString().toLowerCase();
        if (avoidedCategories.includes(cat)) return -1000;
        if (allowedCategories.includes(cat)) return 1000;
        // If no category match, keep neutral.
        return 0;
      };

      const oldFirstCityDays = oldFirstRange.firstCityDayNumbers?.length || 0;
      const newFirstCityDays = newFirstRange.firstCityDayNumbers?.length || 0;
      const targetTotal = (() => {
        if (!oldFirstCityDays || oldFirstCityDays <= 0) return allActivities.length;
        if (!newFirstCityDays || newFirstCityDays <= 0) return 0;
        const scaled = Math.round(allActivities.length * (newFirstCityDays / oldFirstCityDays));
        return Math.max(0, Math.min(allActivities.length, scaled));
      })();

      let activitiesToAssign = allActivities;
      if (targetTotal > 0 && targetTotal < allActivities.length) {
        activitiesToAssign = allActivities
          .slice()
          .sort((a, b) => scoreActivity(b) - scoreActivity(a))
          .slice(0, targetTotal);
      }

      // Geocode for coords-based clustering (only best-effort if API key exists)
      const destination = trip.destination || null;
      for (const activity of activitiesToAssign) {
        const fallbackCity = activity?.city || activity?.location || destination || null;
        // Use the new first-city segment bucket day to improve geocoding.
        const dayIndexGuess =
          newFirstDayNumbers.indexOf(
            // If activity has been loaded from DB without an itinerary day, this will be best-effort.
            null
          ) || -1;
        const cityForGeo = fallbackCity || (dayIndexGuess >= 0 ? newFirstDayNumbers[dayIndexGuess] : destination);
        // eslint-disable-next-line no-await-in-loop
        await attachGeoToActivity(activity, { city: cityForGeo, destination });
      }

      // Clear existing links for this segment
      const { error: clearLinksErr } = await supabase
        .from("itinerary_activity")
        .delete()
        .in("itinerary_id", itineraryIds);
      if (clearLinksErr) throw clearLinksErr;

      const dayNumbersSorted = itineraryRows
        .slice()
        .sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))
        .map((r) => r.day_number);

      const clusters = clusterActivitiesByCoords(activitiesToAssign, Math.max(1, dayNumbersSorted.length));

      // Insert new links with updated order_index
      for (let i = 0; i < dayNumbersSorted.length; i += 1) {
        const dayNumber = dayNumbersSorted[i];
        const itineraryId = itineraryRows.find((r) => r.day_number === dayNumber)?.itinerary_id;
        if (!itineraryId) continue;
        const assigned = Array.isArray(clusters[i]) ? clusters[i] : [];

        if (assigned.length === 0) continue;

        const rows = assigned.map((a, idx) => ({
          itinerary_id: itineraryId,
          activity_id: a.activity_id,
          order_index: idx,
        }));

        const { error: insErr } = await supabase.from("itinerary_activity").insert(rows);
        if (insErr) throw insErr;
      }

      // Meal/restaurant reallocation for the same first-city segment days
      const { data: existingMeals, error: existingMealsErr } = await supabase
        .from("trip_meal")
        .select("day_number, slot")
        .eq("trip_id", tripId)
        .in("day_number", newFirstDayNumbers);
      if (existingMealsErr) throw existingMealsErr;

      const slotByDay = new Map();
      (existingMeals || []).forEach((m) => {
        if (!slotByDay.has(m.day_number)) slotByDay.set(m.day_number, new Set());
        slotByDay.get(m.day_number).add(m.slot);
      });

      // Delete meals for those day numbers
      const { error: clearMealsErr } = await supabase
        .from("trip_meal")
        .delete()
        .eq("trip_id", tripId)
        .in("day_number", newFirstDayNumbers);
      if (clearMealsErr) throw clearMealsErr;

      const uniqueCities = new Set();
      for (const dn of newFirstDayNumbers) {
        const cityLabel = newFirstRange.dayCityByIndex[dn - 1] || trip.destination || null;
        const canonical = canonicalizeCityValue(cityLabel);
        if (canonical) uniqueCities.add(canonical);
      }

      // Pools: liked restaurants first, then general
      const canonicalCities = Array.from(uniqueCities);
      let likedRestaurantIds = [];
      const { data: likedPrefs } = await supabase
        .from("trip_restaurant_preference")
        .select("restaurant_id")
        .eq("trip_id", tripId)
        .eq("preference", "liked");
      likedRestaurantIds = (likedPrefs || []).map((p) => p.restaurant_id).filter(Boolean);

      const likedRestaurants = likedRestaurantIds.length
        ? await supabase
            .from("restaurant")
            .select("restaurant_id, name, city, address, location, reservation_url, source_url, cost_estimate, image_url")
            .in("restaurant_id", likedRestaurantIds)
        : { data: [], error: null };
      if (likedRestaurants.error) throw likedRestaurants.error;

      const generalRestaurants = canonicalCities.length
        ? await supabase
            .from("restaurant")
            .select("restaurant_id, name, city, address, location, reservation_url, source_url, cost_estimate, image_url")
            .in("city", canonicalCities)
            .limit(200)
        : { data: [], error: null };
      if (generalRestaurants.error) throw generalRestaurants.error;

      // Fallback pool (any city) so meal slots are always filled.
      const fallbackRestaurants = await supabase
        .from("restaurant")
        .select("restaurant_id, name, city, address, location, reservation_url, source_url, cost_estimate, image_url")
        .limit(200);
      if (fallbackRestaurants.error) throw fallbackRestaurants.error;

      const likedPoolByCity = new Map();
      (likedRestaurants.data || []).forEach((r) => {
        const key = r.city ? String(r.city) : "";
        if (!key) return;
        if (!likedPoolByCity.has(key)) likedPoolByCity.set(key, []);
        likedPoolByCity.get(key).push(r);
      });

      const generalPoolByCity = new Map();
      (generalRestaurants.data || []).forEach((r) => {
        const key = r.city ? String(r.city) : "";
        if (!key) return;
        if (!generalPoolByCity.has(key)) generalPoolByCity.set(key, []);
        generalPoolByCity.get(key).push(r);
      });

      const usedRestaurantIds = new Set();

      const pickRestaurant = (cityKey) => {
        const likedPool = likedPoolByCity.get(cityKey) || [];
        const generalPool = generalPoolByCity.get(cityKey) || [];
        const fromPool = (pool) => {
          const found = pool.find((r) => !usedRestaurantIds.has(r.restaurant_id));
          return found || pool[0] || null;
        };
        const r = fromPool(likedPool) || fromPool(generalPool) || null;
        const fallback = fromPool(fallbackRestaurants.data || []);
        if (r?.restaurant_id) usedRestaurantIds.add(r.restaurant_id);
        return r || fallback;
      };

      const mealRowsToInsert = [];
      const daysSorted = newFirstDayNumbers.slice().sort((a, b) => a - b);
      for (const dayNumber of daysSorted) {
        const slots = Array.from(slotByDay.get(dayNumber) || []);
        slots.sort((a, b) => logisticsMealSlotOrder.indexOf(a) - logisticsMealSlotOrder.indexOf(b));

        const cityLabel = newFirstRange.dayCityByIndex[dayNumber - 1] || trip.destination || null;
        const canonicalCity = canonicalizeCityValue(cityLabel);
        const cityKey = canonicalCity || (trip.destination ? canonicalizeCityValue(trip.destination) : null);

        for (const slot of slots) {
          const restaurant = pickRestaurant(cityKey || "");
          if (!restaurant) continue;
          mealRowsToInsert.push({
            trip_id: tripId,
            day_number: dayNumber,
            slot,
            name: restaurant.name || "Restaurant",
            location: (restaurant.address || restaurant.location || "").trim() || null,
            link: restaurant.reservation_url || restaurant.source_url || null,
            cost: restaurant.cost_estimate != null ? parseFloat(restaurant.cost_estimate) : null,
            finalized: false,
            updated_at: nowIso,
            created_at: nowIso,
          });
        }
      }

      if (mealRowsToInsert.length > 0) {
        const { error: insMealsErr } = await supabase.from("trip_meal").insert(mealRowsToInsert);
        if (insMealsErr) throw insMealsErr;
      }
    }
  }

  return {
    logisticsApplied: true,
    movedFlightType: "outbound",
    delayHours,
    newStartDate: newStartDateKey,
    newNumDays,
    oldFirstCityDays: oldFirstRange.firstCityDayNumbers?.length || 0,
    newFirstCityDays: newFirstRange.firstCityDayNumbers?.length || 0,
  };
}

async function handleModifyLogisticsChat({ userId, tripId, message, conversationHistory }) {
  if (!tripId) {
    return { success: false, message: "No trip selected; cannot modify logistics." };
  }

  const trimmedMessage = (message || "").trim();
  const inferredFlightType = inferFlightTypeForModifyLogistics(trimmedMessage);
  const delayHoursFromUserText = extractDelayHoursForModifyLogistics(trimmedMessage);
  const confirm = isConfirmationMessage(trimmedMessage);

  const userMessages = (conversationHistory || []).filter((m) => m.role === "user").slice(-10);
  const assistantMessages = (conversationHistory || []).filter((m) => m.role === "assistant").slice(-10);
  const delayFromPriorDemo = extractDelayHoursFromFlightStatusDemoMarker(assistantMessages);

  const latestDelayHours = (() => {
    if (delayHoursFromUserText != null) return delayHoursFromUserText;
    for (let i = userMessages.length - 1; i >= 0; i -= 1) {
      const h = extractDelayHoursForModifyLogistics(userMessages[i].content);
      if (h != null) return h;
    }
    if (confirm && delayFromPriorDemo != null) return delayFromPriorDemo;
    return null;
  })();

  const latestFlightType = (() => {
    if (inferredFlightType) return inferredFlightType;
    for (let i = userMessages.length - 1; i >= 0; i -= 1) {
      const ft = inferFlightTypeForModifyLogistics(userMessages[i].content);
      if (ft) return ft;
    }
    if (confirm && delayFromPriorDemo != null) return "outbound";
    return null;
  })();

  const statusLookupRequest = parseOutboundFlightStatusLookupRequest(trimmedMessage);

  await saveMessage(userId, "user", trimmedMessage, tripId);

  // 1) Simulated “web search” for outbound flight status (demo: AA1234 only)
  if (!confirm && statusLookupRequest) {
    if (statusLookupRequest.full.toUpperCase() !== DEMO_FLIGHT_STATUS_LOOKUP_NUMBER) {
      const assistantMessage = `In this demo I can only simulate a status lookup for American Airlines ${DEMO_FLIGHT_STATUS_LOOKUP_NUMBER} (the sample outbound flight). Try asking something like: “Can you check the status of my outbound flight number ${DEMO_FLIGHT_STATUS_LOOKUP_NUMBER}?”`;
      await saveMessage(userId, "assistant", assistantMessage, tripId);
      return { success: true, message: assistantMessage, logisticsApplied: false };
    }

    const simulatedDelayHours = 24;
    const assistantMessage = `I searched public flight-status sources (demo lookup) for American Airlines ${DEMO_FLIGHT_STATUS_LOOKUP_NUMBER} on your outbound route.

I've found this information:

[[PINDROP_FLIGHT_STATUS_DEMO:${simulatedDelayHours}]]

Summary: the feed shows DEPARTING LATE. Your originally scheduled departure was Thu, Dec 11, 2026 at 4:45 PM from JFK; the current estimated departure is Fri, Dec 12, 2026 at 4:45 PM—about ${simulatedDelayHours} hours later. The Naples arrival moves forward by one calendar day as well.

I'll adjust your trip start date, outbound flight times, and first-stop plans to match once you approve. Reply “confirm” when you want me to apply these changes.`;

    await saveMessage(userId, "assistant", assistantMessage, tripId);
    return { success: true, message: assistantMessage, logisticsApplied: false };
  }

  if (!latestDelayHours) {
    const assistantMessage =
      "Ask me to check your outbound flight—for example: “Can you check the status of my outbound flight number AA1234?”—or paste a flight-status screen, or say how many hours late the flight is (e.g. “outbound delayed 24 hours”).";
    await saveMessage(userId, "assistant", assistantMessage, tripId);
    return { success: true, message: assistantMessage, logisticsApplied: false };
  }

  if (!latestFlightType) {
    const assistantMessage =
      "Which leg is affected—your flight to the destination (outbound), your return home, or an intercity flight between stops? Reply with one of those words.";
    await saveMessage(userId, "assistant", assistantMessage, tripId);
    return { success: true, message: assistantMessage, logisticsApplied: false };
  }

  if (!confirm) {
    const assistantMessage = `Here’s what I’ll update: your ${latestFlightType} flight is ${latestDelayHours} hour(s) later than planned. Your trip dates and first-stop schedule will adjust to match.\n\nReply “confirm” when you want me to apply this.`;
    await saveMessage(userId, "assistant", assistantMessage, tripId);
    return { success: true, message: assistantMessage, logisticsApplied: false };
  }

  if (latestFlightType !== "outbound") {
    const assistantMessage =
      "Right now I can only auto-adjust outbound delays (the flight that gets you to your first destination). For return or intercity changes, describe what you need and we can handle it another way—or say your outbound flight was delayed and I’ll update that.";
    await saveMessage(userId, "assistant", assistantMessage, tripId);
    return { success: true, message: assistantMessage, logisticsApplied: false };
  }

  const applyResult = await applyOutboundDelayAndReplanFirstCity({
    userId,
    tripId,
    delayHours: latestDelayHours,
  });

  const assistantMessage = `All set — your trip is updated for the ${latestDelayHours}-hour outbound delay.\n\n- Your trip now starts on ${applyResult.newStartDate} and runs ${applyResult.newNumDays} day(s) through your original end date.\n- Outbound flight times in your plan reflect the new schedule.\n- Travel-only days (before you land) no longer show activities or meals; activities and restaurants for your first stop were reorganized for the days you’re actually there.`;

  await saveMessage(userId, "assistant", assistantMessage, tripId);
  return { success: true, message: assistantMessage, logisticsApplied: true };
}

// Helper function to extract trip information from a message using LLM
async function extractTripInfo(message) {
  try {
    const extractionPrompt = `Extract trip information from the following user message. Respond ONLY with valid JSON in this exact format (use null for missing values):
{
  "destination": "destination name or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "num_travelers": number or null,
  "total_budget": number or null,
  "is_trip_request": true or false
}

Message: "${message}"

If the message is clearly about creating a new trip (ex., "I want to go to X", "plan a trip to Y", "I'd like to visit Z"), set is_trip_request to true. Otherwise false.`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a travel information extraction assistant. Extract trip details from user messages and return only valid JSON.'
        },
        {
          role: 'user',
          content: extractionPrompt
        }
      ],
      temperature: 0.3
    });

    const response = completion.choices[0]?.message?.content || '{}';

    // Try to parse JSON, handling cases where response might have extra text
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from response if wrapped in markdown or other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    }

    if (parsed && parsed.destination) {
      parsed.destination = normalizeDestinationName(parsed.destination);
    }
    return parsed;
  } catch (error) {
    console.error('Error extracting trip info:', error);
    // Fallback: try to extract destination manually
    const destinationMatch = message.match(/\bto\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/i);
    const normalized = destinationMatch ? normalizeDestinationName(destinationMatch[1]) : null;
    return {
      destination: normalized,
      start_date: null,
      end_date: null,
      num_travelers: null,
      total_budget: null,
      is_trip_request: destinationMatch !== null || /want.*go|plan.*trip|visit|travel/i.test(message)
    };
  }
}

// Helper function to create a trip plus an initial preference row
async function createTrip(userId, tripInfo, imageUrl = null) {
  try {
    const tripData = {
      user_id: userId,
      trip_status: 'draft',
      title: tripInfo.destination ? `Trip to ${tripInfo.destination}` : 'My Trip',
      ...(tripInfo.destination && { destination: tripInfo.destination }),
      ...(imageUrl && { image_url: imageUrl }),
    };

    const { data, error } = await supabase
      .from('trip')
      .insert([tripData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Seed trip_preference with any structured fields we managed to extract
    if (data?.trip_id && (tripInfo.start_date || tripInfo.end_date)) {
      const preferenceData = {
        trip_id: data.trip_id,
        start_date: tripInfo.start_date || null,
        end_date: tripInfo.end_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: prefError } = await supabase
        .from('trip_preference')
        .insert([preferenceData]);

      if (prefError) {
        console.error('Error seeding trip_preference from chat-created trip:', prefError);
      }
    }

    return data;
  } catch (error) {
    console.error('Error creating trip:', error);
    throw error;
  }
}

// Get conversation history endpoint
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.query.tripId ? parseInt(req.query.tripId) : null;
    const history = await loadConversationHistory(userId, tripId);

    res.status(200).json({
      success: true,
      messages: history
    });
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load conversation history',
      error: error.message
    });
  }
});

// Chat endpoint
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message, model, tripId, suppressTripCreation, chatMode } = req.body;

    console.log('📨 Chat endpoint called:', { userId, message: message?.substring(0, 50), model, tripId });

    if (!message) {
      console.error('❌ No message provided');
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    let parsedTripId = tripId ? parseInt(tripId) : null;
    let createdTrip = null;
    let tripCreationError = null;

    // If no tripId provided and we are not explicitly in "explore" mode,
    // create a new trip record for this chat "session" so that
    // chat-created trips always have a corresponding row in the trip table.
    if (!parsedTripId && !suppressTripCreation) {
      console.log('🔍 No tripId provided, extracting trip info from message to create a new trip...');
      const tripInfo = await extractTripInfo(message);
      console.log('📋 Extracted trip info for new trip:', tripInfo);

      // Generate image URL for destination using Google Custom Search when we have one
      let imageUrl = null;
      if (tripInfo.destination) {
        imageUrl = await fetchDestinationImage(tripInfo.destination);
      }

      // Always attempt to create a trip row for chat-initiated trips.
      // createTrip only sends fields it actually has, and lets the DB
      // decide which columns can be null or use defaults.
      try {
        console.log('🏗️ Creating trip (chat-initiated) with info:', tripInfo);
        createdTrip = await createTrip(userId, tripInfo, imageUrl);
        parsedTripId = createdTrip.trip_id;
        console.log(`✅ Created new trip ${parsedTripId} for user ${userId} from chat`);
      } catch (tripError) {
        console.error('❌ Error creating trip from chat:', tripError);
        // Capture error so the frontend can surface it during debugging
        tripCreationError = tripError.message || 'Unknown trip creation error';
        // Continue with chat even if trip creation fails
      }
    }

    // Load conversation history from database (filtered by tripId if provided),
    // unless we're in destination exploration mode (suppressTripCreation),
    // where each session should start fresh.
    let conversationHistory = [];
    if (!suppressTripCreation) {
      conversationHistory = await loadConversationHistory(userId, parsedTripId);
    }
    console.log(
      `📚 Loaded ${conversationHistory.length} messages from history for tripId: ${parsedTripId} (suppressTripCreation=${!!suppressTripCreation})`
    );

    // To avoid hitting TPM / context limits on the model, only send the
    // most recent slice of the conversation to the LLM.
    const MAX_CONTEXT_MESSAGES = 12;
    const trimmedHistory =
      conversationHistory.length > MAX_CONTEXT_MESSAGES
        ? conversationHistory.slice(-MAX_CONTEXT_MESSAGES)
        : conversationHistory;

    // Special mode: modify logistics from the Final Itinerary page.
    // This mode performs deterministic DB updates (create NEW flight rows, shift dates,
    // recluster activities/meals for the affected first city segment).
    if (chatMode === "modify_logistics") {
      const result = await handleModifyLogisticsChat({
        userId,
        tripId: parsedTripId,
        message,
        conversationHistory,
      });
      return res.status(200).json(result);
    }

    // Load user profile so the LLM can ground recommendations in their preferences
    let userProfileContext = 'No saved profile preferences.';
    try {
      const { data: userProfile } = await supabase
        .from('app_user')
        .select('home_location, budget_preference, travel_style, liked_tags')
        .eq('user_id', userId)
        .maybeSingle();

      if (userProfile) {
        const likedTags = Array.isArray(userProfile.liked_tags)
          ? userProfile.liked_tags.join(', ')
          : '';
        const budget =
          userProfile.budget_preference !== null && userProfile.budget_preference !== undefined
            ? `$${userProfile.budget_preference}`
            : 'not specified';
        const travelStyle = userProfile.travel_style || 'not specified';
        const home = userProfile.home_location || 'not specified';

        userProfileContext = `Home base: ${home}. Approximate budget preference: ${budget}. Travel style: ${travelStyle}. Saved interest tags: ${likedTags || 'none'}.`;
      }
    } catch (profileError) {
      console.error('Error loading user profile for chat context:', profileError);
    }

    // Optionally load trip context if we're chatting inside an existing trip
    let tripContext = 'No specific trip is currently selected.';
    let tripDestination = null;
    let tripPreferenceContext = 'No trip-specific preferences are saved for this trip.';
    if (parsedTripId) {
      try {
        const [{ data: tripData }, { data: tripPrefs }] = await Promise.all([
          supabase
            .from('trip')
            .select('title, destination')
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
          supabase
            .from('trip_preference')
            .select(
              'start_date, end_date, num_days, min_budget, max_budget, pace, accommodation_type, activity_categories, avoid_activity_categories, selected_cities, group_type, safety_notes, accessibility_notes, custom_requests'
            )
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
        ]);

        if (tripData) {
          tripDestination = tripData.destination || null;
          const title = tripData.title || 'Your trip';
          tripContext = `Current trip: ${title}. Destination: ${tripData.destination || 'not specified'}.`;
        }

        if (tripPrefs) {
          const lines = [];
          if (tripPrefs.start_date || tripPrefs.end_date) {
            lines.push(
              `Dates: ${tripPrefs.start_date || 'unspecified'} to ${tripPrefs.end_date || 'unspecified'}.`
            );
          }
          if (tripPrefs.num_days) {
            lines.push(`Approximate trip length: ${tripPrefs.num_days} days.`);
          }
          if (tripPrefs.min_budget || tripPrefs.max_budget) {
            lines.push(
              `Trip budget range: ${
                tripPrefs.min_budget ? `$${tripPrefs.min_budget}` : 'unspecified'
              } to ${tripPrefs.max_budget ? `$${tripPrefs.max_budget}` : 'unspecified'}.`
            );
          }
          if (tripPrefs.pace) {
            lines.push(`Preferred pace: ${tripPrefs.pace} (slow / balanced / packed).`);
          }
          if (tripPrefs.accommodation_type) {
            lines.push(`Preferred accommodation: ${tripPrefs.accommodation_type}.`);
          }
          if (Array.isArray(tripPrefs.selected_cities) && tripPrefs.selected_cities.length) {
            lines.push(`Selected cities: ${tripPrefs.selected_cities.join(', ')}.`);
          }
          if (Array.isArray(tripPrefs.activity_categories) && tripPrefs.activity_categories.length) {
            lines.push(
              `Wants more of: ${tripPrefs.activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (
            Array.isArray(tripPrefs.avoid_activity_categories) &&
            tripPrefs.avoid_activity_categories.length
          ) {
            lines.push(
              `Wants to avoid: ${tripPrefs.avoid_activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (tripPrefs.group_type) {
            lines.push(`Group type: ${tripPrefs.group_type}.`);
          }
          if (tripPrefs.safety_notes) {
            lines.push(`Safety notes: ${tripPrefs.safety_notes}.`);
          }
          if (tripPrefs.accessibility_notes) {
            lines.push(`Accessibility notes: ${tripPrefs.accessibility_notes}.`);
          }
          if (tripPrefs.custom_requests) {
            lines.push(`Custom requests: ${tripPrefs.custom_requests}.`);
          }

          if (lines.length) {
            tripPreferenceContext = lines.join(' ');
          }
        }
      } catch (tripLoadError) {
        console.error('Error loading trip context/preferences for chat:', tripLoadError);
      }
    }

    // Build system prompt differently depending on whether we're exploring destinations
    // or chatting inside a specific trip.
    let systemPrompt;
    if (parsedTripId) {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop.

The user is already planning a specific trip. ${tripContext}

Your job is to answer concrete questions and help refine THIS trip only (activities, logistics, tips, neighborhoods, safety, etc.).

- Do NOT suggest alternative destinations unless the user explicitly says they want to change where they are going.
- Do NOT use any "Destination Idea 1/2/3" style format or propose multiple destination ideas.
- Treat the destination above as fixed and answer the user's specific question as directly and practically as possible.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

Here are the specific preferences for this trip (from trip_preference):
${tripPreferenceContext}

When you recommend activities, explain briefly why they fit these preferences.`;
    } else {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

When the user is exploring where to go, suggest up to three concrete destination ideas at a time (never more than three). Present them in this exact structured format so the UI can parse them:

Destination Idea 1: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 2: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 3: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

When you recommend activities, also explain briefly why they fit these preferences.`;
    }

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array from conversation history + new message
    const messages = [
      // System prompt for travel assistant (varies based on trip context)
      {
        role: 'system',
        content: systemPrompt,
      },
      // Add conversation history from database
      ...trimmedHistory,
      // Add current message
      {
        role: 'user',
        content: message
      }
    ];

    console.log(`📝 Built messages array with ${messages.length} total messages (including system)`);

    // Save user message to database (with tripId if provided or created),
    // but skip persistence in exploration-only chats so that each new
    // destination search starts clean.
    if (!suppressTripCreation) {
      console.log(`💾 Saving user message with tripId: ${parsedTripId} for user ${userId}`);
      await saveMessage(userId, 'user', message, parsedTripId);
    } else {
      console.log('💾 Skipping user message persistence due to suppressTripCreation=true');
    }

    // Call OpenAI API
    console.log(`🤖 Calling OpenAI API with model: ${chatModel}`);
    let assistantMessage;
    try {
      const completion = await openaiClient.chat.completions.create({
        model: chatModel,
        messages: messages,
      });

      assistantMessage = completion.choices[0]?.message?.content || 'Sorry, I did not receive a response.';
      console.log(`✅ Received response from OpenAI (${assistantMessage.length} characters)`);
    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
      throw openaiError;
    }

    // Save assistant response to database (with tripId if provided or created),
    // again skipping in pure exploration mode.
    if (!suppressTripCreation) {
      console.log(`💾 Saving assistant message with tripId: ${parsedTripId} for user ${userId}`);
      await saveMessage(userId, 'assistant', assistantMessage, parsedTripId);
    } else {
      console.log('💾 Skipping assistant message persistence due to suppressTripCreation=true');
    }

    // Return the response with trip info if trip was created
    const response = {
      success: true,
      message: assistantMessage,
      model: chatModel,
      // Debug info to help understand why a tripId might be missing
      tripCreationError,
      hasIncomingTripId: !!tripId,
      parsedTripId: parsedTripId || null,
    };

    if (createdTrip) {
      response.tripId = createdTrip.trip_id;
      response.trip = createdTrip;
    } else if (parsedTripId) {
      response.tripId = parsedTripId;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('OpenAI chat error:', error);

    // Check if it's an authentication error
    if (error.status === 401 || error.message?.includes('API key')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid OpenAI API key. Please check your configuration.',
        error: error.message
      });
    }

    // Check if it's a model not found or decommissioned error
    if (error.status === 404 || error.status === 400 || error.code === 'model_decommissioned' || error.message?.includes('model')) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Model error. Please check the model configuration.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to get response from LLM',
      error: error.message
    });
  }
});

// Streaming chat endpoint (for real-time responses)
router.post('/chat/stream', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message, model, tripId } = req.body;

    const parsedTripId = tripId ? parseInt(tripId) : null;

    // Load conversation history from database (filtered by tripId if provided)
    const conversationHistory = await loadConversationHistory(userId, parsedTripId);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Load user profile so the LLM can ground recommendations in their preferences
    let userProfileContext = 'No saved profile preferences.';
    try {
      const { data: userProfile } = await supabase
        .from('app_user')
        .select('home_location, budget_preference, travel_style, liked_tags')
        .eq('user_id', userId)
        .maybeSingle();

      if (userProfile) {
        const likedTags = Array.isArray(userProfile.liked_tags)
          ? userProfile.liked_tags.join(', ')
          : '';
        const budget =
          userProfile.budget_preference !== null && userProfile.budget_preference !== undefined
            ? `$${userProfile.budget_preference}`
            : 'not specified';
        const travelStyle = userProfile.travel_style || 'not specified';
        const home = userProfile.home_location || 'not specified';

        userProfileContext = `Home base: ${home}. Approximate budget preference: ${budget}. Travel style: ${travelStyle}. Saved interest tags: ${likedTags || 'none'}.`;
      }
    } catch (profileError) {
      console.error('Error loading user profile for chat stream context:', profileError);
    }

    // Optionally load trip context if we're chatting inside an existing trip
    let tripContext = 'No specific trip is currently selected.';
    let tripPreferenceContext = 'No trip-specific preferences are saved for this trip.';
    if (parsedTripId) {
      try {
        const [{ data: tripData }, { data: tripPrefs }] = await Promise.all([
          supabase
            .from('trip')
            .select('title, destination')
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
          supabase
            .from('trip_preference')
            .select(
              'start_date, end_date, num_days, min_budget, max_budget, pace, accommodation_type, activity_categories, avoid_activity_categories, group_type, safety_notes, accessibility_notes, custom_requests'
            )
            .eq('trip_id', parsedTripId)
            .maybeSingle(),
        ]);

        if (tripData) {
          const title = tripData.title || 'Your trip';
          tripContext = `Current trip: ${title}. Destination: ${tripData.destination || 'not specified'}.`;
        }

        if (tripPrefs) {
          const lines = [];
          if (tripPrefs.start_date || tripPrefs.end_date) {
            lines.push(
              `Dates: ${tripPrefs.start_date || 'unspecified'} to ${tripPrefs.end_date || 'unspecified'}.`
            );
          }
          if (tripPrefs.num_days) {
            lines.push(`Approximate trip length: ${tripPrefs.num_days} days.`);
          }
          if (tripPrefs.min_budget || tripPrefs.max_budget) {
            lines.push(
              `Trip budget range: ${
                tripPrefs.min_budget ? `$${tripPrefs.min_budget}` : 'unspecified'
              } to ${tripPrefs.max_budget ? `$${tripPrefs.max_budget}` : 'unspecified'}.`
            );
          }
          if (tripPrefs.pace) {
            lines.push(`Preferred pace: ${tripPrefs.pace} (slow / balanced / packed).`);
          }
          if (tripPrefs.accommodation_type) {
            lines.push(`Preferred accommodation: ${tripPrefs.accommodation_type}.`);
          }
          if (Array.isArray(tripPrefs.activity_categories) && tripPrefs.activity_categories.length) {
            lines.push(
              `Wants more of: ${tripPrefs.activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (
            Array.isArray(tripPrefs.avoid_activity_categories) &&
            tripPrefs.avoid_activity_categories.length
          ) {
            lines.push(
              `Wants to avoid: ${tripPrefs.avoid_activity_categories
                .map((c) => c)
                .join(', ')}.`
            );
          }
          if (tripPrefs.group_type) {
            lines.push(`Group type: ${tripPrefs.group_type}.`);
          }
          if (tripPrefs.safety_notes) {
            lines.push(`Safety notes: ${tripPrefs.safety_notes}.`);
          }
          if (tripPrefs.accessibility_notes) {
            lines.push(`Accessibility notes: ${tripPrefs.accessibility_notes}.`);
          }
          if (tripPrefs.custom_requests) {
            lines.push(`Custom requests: ${tripPrefs.custom_requests}.`);
          }

          if (lines.length) {
            tripPreferenceContext = lines.join(' ');
          }
        }
      } catch (tripLoadError) {
        console.error('Error loading trip context/preferences for chat stream:', tripLoadError);
      }
    }

    // Build system prompt differently depending on whether we're exploring destinations
    // or chatting inside a specific trip.
    let systemPrompt;
    if (parsedTripId) {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop.

The user is already planning a specific trip. ${tripContext}

Your job is to answer concrete questions and help refine THIS trip only (activities, logistics, tips, neighborhoods, safety, etc.).

- Do NOT suggest alternative destinations unless the user explicitly says they want to change where they are going.
- Do NOT use any "Destination Idea 1/2/3" style format or propose multiple destination ideas.
- Treat the destination above as fixed and answer the user's specific question as directly and practically as possible.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

Here are the specific preferences for this trip (from trip_preference):
${tripPreferenceContext}

When you recommend activities, explain briefly why they fit these preferences.`;
    } else {
      systemPrompt = `You are a helpful travel planning assistant for PinDrop. Help users plan their trips, suggest destinations, activities, and itineraries. Be friendly, informative, and provide practical travel advice.

Here is the user's saved profile and preferences (from the app_user table):
${userProfileContext}

When the user is exploring where to go, suggest up to three concrete destination ideas at a time (never more than three). Present them in this exact structured format so the UI can parse them:

Destination Idea 1: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 2: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

Destination Idea 3: <short destination name>
<one or two short sentences explaining why this destination fits their preferences>

When you recommend activities, also explain briefly why they fit these preferences.`;
    }

    // To avoid hitting TPM / context limits on the model, only send the
    // most recent slice of the conversation to the LLM.
    const MAX_CONTEXT_MESSAGES = 12;
    const trimmedHistory =
      conversationHistory.length > MAX_CONTEXT_MESSAGES
        ? conversationHistory.slice(-MAX_CONTEXT_MESSAGES)
        : conversationHistory;

    // Use provided model or default
    const chatModel = model || DEFAULT_MODEL;

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...trimmedHistory,
      {
        role: 'user',
        content: message
      }
    ];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Save user message to database (with tripId if provided)
    await saveMessage(userId, 'user', message, parsedTripId);

    try {
      let fullResponse = '';

      // Stream the response from OpenAI
      const stream = await openaiClient.chat.completions.create({
        model: chatModel,
        messages: messages,
        stream: true,
      });

      // Send each chunk as it arrives
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({
            content: content,
            done: false
          })}\n\n`);
        }
      }

      // Save assistant response to database (with tripId if provided)
      if (fullResponse) {
        await saveMessage(userId, 'assistant', fullResponse, parsedTripId);
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({
        error: streamError.message,
        done: true
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('OpenAI stream chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to stream response from LLM',
        error: error.message
      });
    }
  }
});

// Silent airport code lookup - doesn't save to chat history
// Returns the 3 closest airports to the given location
router.post('/airport-code', authenticateToken, async (req, res) => {
  try {
    const { location, scope } = req.body;
    const userId = req.user.userId;

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    const isRegional = scope === 'regional';
    const prompt = isRegional
      ? `Given the location "${location}", provide up to 3 major airports in the surrounding metro area (nearby cities are OK), sorted by distance (closest first).
If there are fewer than 3 airports, return as many as you can find (minimum 1).`
      : `Given the location "${location}", provide up to 3 airports that are located in that exact city (not nearby cities), sorted by distance (closest first).
If there are fewer than 3 airports in that city, return only those in the city (do NOT include nearby cities).` +
        ` If you cannot find any airport in that city, return an empty airports array.`;
    const fullPrompt = `${prompt}
For each airport, provide the 3-letter IATA airport code in uppercase, the full airport name, and the approximate distance in miles.
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "airports": [
    {"code": "JFK", "name": "John F. Kennedy International Airport", "distance_miles": 15},
    {"code": "LGA", "name": "LaGuardia Airport", "distance_miles": 8},
    {"code": "EWR", "name": "Newark Liberty International Airport", "distance_miles": 18}
  ]
}
Only include valid 3-letter IATA codes.`;

    const completion = await openaiClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at finding airports near locations. Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0]?.message?.content || '';
    let airports = [];

    try {
      // Parse JSON response
      const parsed = JSON.parse(response);

    if (parsed.airports && Array.isArray(parsed.airports)) {
        // Extract valid airport codes (3-letter uppercase)
      airports = parsed.airports
          .filter(airport => airport && airport.code && /^[A-Z]{3}$/.test(airport.code))
          .slice(0, 3) // Ensure max 3 airports
          .map(airport => ({
            code: airport.code,
            name: airport.name || '',
            distance_miles: airport.distance_miles || null
          }));
      }
    } catch (parseError) {
      // Fallback: try to extract codes from text using regex
      console.warn('Failed to parse JSON response, attempting regex extraction:', parseError);
      const codeMatches = response.matchAll(/\b([A-Z]{3})\b/g);
      const uniqueCodes = [...new Set(Array.from(codeMatches).map(m => m[1]))]
        .filter(code => code !== 'UNKNOWN')
        .slice(0, 3);

      airports = uniqueCodes.map(code => ({
        code: code,
        name: '',
        distance_miles: null
      }));
    }

    // If we have a city token, filter to airports whose names include it
    const cityToken = typeof location === 'string' ? location.split(',')[0]?.trim() : '';
    if (!isRegional && cityToken) {
      const filtered = airports.filter(a =>
        typeof a.name === 'string' && a.name.toLowerCase().includes(cityToken.toLowerCase())
      );
      if (filtered.length > 0) {
        airports = filtered;
      }
    }

    // Ensure we have at least one airport
    if (airports.length === 0) {
      return res.status(200).json({
        success: false,
        airport_code: null,
        airport_codes: [],
        message: "Could not determine airport codes for this location"
      });
    }

    // Extract just the codes for backward compatibility and convenience
    const airportCodes = airports.map(a => a.code);
    const primaryAirportCode = airportCodes[0]; // Closest airport

    res.status(200).json({
      success: true,
      airport_code: primaryAirportCode, // Backward compatibility - returns closest airport
      airport_codes: airportCodes, // Array of all airport codes
      airports: airports, // Full details including names and distances
      message: `Found ${airports.length} airport(s) near ${location}`
    });
  } catch (error) {
    console.error('Error getting airport codes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get airport codes',
      error: error.message
    });
  }
});

// Export helpers so other routes (ex. trip itinerary generation, trip creation)
// can persist chat messages and reuse extraction logic in a consistent way.
export { saveMessage, loadConversationHistory, extractTripInfo, fetchDestinationImage };

export default router;

