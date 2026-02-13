import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Maximize2, ChevronUp, ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { getApiUrl } from "@/lib/api";
import ActivitySwipeCard from "./ActivitySwipeCard";
import RestaurantSwipeCard from "./RestaurantSwipeCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWindowProps {
  className?: string;
  tripId?: number | null;
  tripStatus?: string;
  initialMessage?: string | null;
  onTripCreated?: (tripId: number) => void;
  planningMode?: "known" | "explore";
  hasDestinationLocked?: boolean;
}

type ActivityCategory =
  | "outdoors"
  | "relaxing"
  | "cultural"
  | "music"
  | "arts"
  | "museums"
  | "food"
  | "nightlife"
  | "shopping"
  | "nature"
  | "adventure";

interface TripPreferences {
  num_days: number | null;
  start_date: string | null;
  end_date: string | null;
  min_budget: number | null;
  max_budget: number | null;
  pace: "slow" | "balanced" | "packed" | "";
  accommodation_type: string;
  activity_categories: ActivityCategory[];
  avoid_activity_categories: ActivityCategory[];
  selected_cities: string[];
  group_type: string;
  safety_notes: string;
  accessibility_notes: string;
  custom_requests: string;
}

const ChatWindow = ({
  className = "",
  tripId = null,
  tripStatus,
  initialMessage = null,
  onTripCreated,
  planningMode = "known",
  hasDestinationLocked = false,
}: ChatWindowProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false);
  const [tripPreferences, setTripPreferences] = useState<TripPreferences | null>(null);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [activities, setActivities] = useState<
    {
      trip_activity_preference_id: number;
      activity_id: number;
      name: string;
      location: string | null;
      city?: string | null;
      category: string | null;
      duration: string | null;
      cost_estimate: number | null;
      rating: number | null;
      tags: string[] | null;
      source: string | null;
      preference: "pending" | "liked" | "disliked" | "maybe";
      image_url?: string | null;
      description?: string | null;
      price_range?: string | null;
      source_url?: string | null;
    }[]
  >([]);
  const [isGeneratingActivities, setIsGeneratingActivities] = useState(false);
  const [isUpdatingActivityPreference, setIsUpdatingActivityPreference] = useState<
    Record<number, boolean>
  >({});
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);
  const [hasShownTripSketchPrompt, setHasShownTripSketchPrompt] = useState(false);
  const [hasConfirmedActivities, setHasConfirmedActivities] = useState(false);
  const [hasConfirmedTripSketch, setHasConfirmedTripSketch] = useState(false);
  const [tripDestination, setTripDestination] = useState<string | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [citySuggestionsMeta, setCitySuggestionsMeta] = useState<{
    destination_type: "country" | "city" | "region" | "unknown";
    normalized_destination: string | null;
    country: string | null;
    primary_city: string | null;
  } | null>(null);
  const [isLoadingCitySuggestions, setIsLoadingCitySuggestions] = useState(false);
  const [citySuggestionsError, setCitySuggestionsError] = useState<string | null>(null);
  const [departureLocation, setDepartureLocation] = useState("");
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [departureAirportCodes, setDepartureAirportCodes] = useState<string[]>([]); // All departure airport codes
  const [selectedDepartureAirportCodes, setSelectedDepartureAirportCodes] = useState<string[]>([]); // User-selected departure airport codes
  const [departureAirports, setDepartureAirports] = useState<Array<{code: string; name: string; distance_miles: number | null}>>([]); // Full airport details
  const [arrivalId, setArrivalId] = useState<string | null>(null);
  const [arrivalAirportCodes, setArrivalAirportCodes] = useState<string[]>([]); // All arrival airport codes
  const [selectedArrivalAirportCodes, setSelectedArrivalAirportCodes] = useState<string[]>([]); // User-selected arrival airport codes
  const [arrivalAirports, setArrivalAirports] = useState<Array<{code: string; name: string; distance_miles: number | null}>>([]); // Full arrival airport details
  const [isFetchingDepartureCode, setIsFetchingDepartureCode] = useState(false);
  const [isFetchingArrivalCode, setIsFetchingArrivalCode] = useState(false);
  const [bestFlights, setBestFlights] = useState<any[]>([]);
  const [flightsByAirport, setFlightsByAirport] = useState<Record<string, any[]>>({}); // Flights grouped by departure airport code
  const [outboundFlightIds, setOutboundFlightIds] = useState<Record<number, number>>({}); // Map index to flight_id
  const [isFetchingFlights, setIsFetchingFlights] = useState(false);
  const [selectedOutboundIndex, setSelectedOutboundIndex] = useState<number | null>(null);
  const [returnFlights, setReturnFlights] = useState<any[]>([]);
  const [returnFlightIds, setReturnFlightIds] = useState<Record<number, number>>({}); // Map index to flight_id
  const [returnFlightsCache, setReturnFlightsCache] = useState<Record<string, any[]>>({}); // Cache return flights by departure_token
  const [isFetchingReturnFlights, setIsFetchingReturnFlights] = useState(false);
  const [selectedReturnIndex, setSelectedReturnIndex] = useState<number | null>(null);
  const [expandedLayovers, setExpandedLayovers] = useState<Record<number, boolean>>({});
  const [hasConfirmedFlights, setHasConfirmedFlights] = useState(false);
  const [hasConfirmedMultiCityPlanning, setHasConfirmedMultiCityPlanning] = useState(false);
  const [manualCityDaysAllocation, setManualCityDaysAllocation] = useState<Record<string, number>>({}); // Manual days allocation per city
  const [interCityTransportStep, setInterCityTransportStep] = useState<"allocation" | "transportation">("allocation"); // Current step in multi-city tab
  const [currentInterCitySegment, setCurrentInterCitySegment] = useState<number>(0); // Which city-to-city segment we're booking (0 = city 1->2, 1 = city 2->3, etc.)
  const [interCityFlights, setInterCityFlights] = useState<Record<number, any[]>>({}); // Flights for each inter-city segment
  const [selectedInterCityFlights, setSelectedInterCityFlights] = useState<Record<number, number | null>>({}); // Selected flight index for each segment
  const [interCityTransportation, setInterCityTransportation] = useState<Record<number, "flight" | "driving">>({}); // Transportation type for each segment
  const [isFetchingInterCityFlights, setIsFetchingInterCityFlights] = useState<Record<number, boolean>>({});
  const [interCityDepartureCodes, setInterCityDepartureCodes] = useState<Record<number, string[]>>({});
  const [interCityArrivalCodes, setInterCityArrivalCodes] = useState<Record<number, string[]>>({});
  const [interCityDepartureId, setInterCityDepartureId] = useState<Record<number, string | null>>({});
  const [interCityArrivalId, setInterCityArrivalId] = useState<Record<number, string | null>>({});
  const [hasStartedRestaurants, setHasStartedRestaurants] = useState(false);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [isGeneratingRestaurants, setIsGeneratingRestaurants] = useState(false);
  const [isUpdatingRestaurantPreference, setIsUpdatingRestaurantPreference] = useState<
    Record<number, boolean>
  >({});
  const [restaurantFormData, setRestaurantFormData] = useState({
    mealsPerDay: 2,
    mealTypes: [] as string[],
    cuisineTypes: [] as string[],
    dietaryRestrictions: [] as string[],
    otherDietaryRestriction: "",
    minPriceRange: null as string | null,
    maxPriceRange: null as string | null,
  });
  const [isSavingRestaurantPreferences, setIsSavingRestaurantPreferences] = useState(false);
  const [hasConfirmedRestaurants, setHasConfirmedRestaurants] = useState(false);
  const [hasStartedHotels, setHasStartedHotels] = useState(false);
  const [hotels, setHotels] = useState<any[]>([]);
  const [isFetchingHotels, setIsFetchingHotels] = useState(false);
  const [selectedHotelIndex, setSelectedHotelIndex] = useState<number | null>(null);
  const [hasConfirmedHotels, setHasConfirmedHotels] = useState(false);
  const [currentHotelCityIndex, setCurrentHotelCityIndex] = useState<number>(0); // Which city's hotel we're booking
  const [hotelsByCity, setHotelsByCity] = useState<Record<number, any[]>>({}); // Hotels for each city
  const [selectedHotelIndexByCity, setSelectedHotelIndexByCity] = useState<Record<number, number | null>>({}); // Selected hotel index for each city
  const [hotelIdsByCity, setHotelIdsByCity] = useState<Record<number, Record<number, number>>>({}); // Hotel IDs for each city
  const [isFetchingHotelsByCity, setIsFetchingHotelsByCity] = useState<Record<number, boolean>>({});
  const [hotelIds, setHotelIds] = useState<Record<number, number>>({}); // Map index to hotel_id
  const [propertyDetails, setPropertyDetails] = useState<Record<number, any>>({});
  const [isFetchingPropertyDetails, setIsFetchingPropertyDetails] = useState<Record<number, boolean>>({});
  const [expandedBookingOptions, setExpandedBookingOptions] = useState<Record<number, boolean>>({});
  const [finalItinerary, setFinalItinerary] = useState<any | null>(null);
  const [isGeneratingFinalItinerary, setIsGeneratingFinalItinerary] = useState(false);
  const [destinationCarouselIndices, setDestinationCarouselIndices] = useState<Record<number, number>>(
    {}
  );
  const [itinerarySummary, setItinerarySummary] = useState<string | null>(null);
  const [itineraryDays, setItineraryDays] = useState<
    {
      day_number: number;
      date: string | null;
      summary: string | null;
      activities: {
        activity_id?: number;
        name?: string;
        location?: string | null;
        category?: string | null;
        duration?: string | null;
      }[];
    }[]
  >([]);
  const [itineraryCarouselIndex, setItineraryCarouselIndex] = useState(0);
  const [hasSentInitialExploreMessage, setHasSentInitialExploreMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lockDestination, setLockDestination] = useState("");
  const [orderedCities, setOrderedCities] = useState<string[]>([]); // Ordered list of cities for flight booking
  const [newCityInput, setNewCityInput] = useState(""); // Input for adding new city
  const [cityDaysAllocation, setCityDaysAllocation] = useState<Array<{
    city: string;
    days: number;
    startDate: string | null;
    endDate: string | null;
    activityCount: number; // Actual activity count
    displayActivityCount: number; // Display count (minimum 2 for cities with 0 activities)
  }>>([]); // Days allocated to each city segment
  const [isLockingDestination, setIsLockingDestination] = useState(false);
  const [hasLockedDestination, setHasLockedDestination] = useState(
    planningMode === "known" || hasDestinationLocked
  );
  const [hasStartedPlanning, setHasStartedPlanning] = useState(false); // Track if "Start planning" has been clicked
  const [activeTab, setActiveTab] = useState<"activities" | "restaurants" | "flights" | "hotels" | "summary" | "multi-city">(
    "activities"
  );
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    setHasLockedDestination(planningMode === "known" || hasDestinationLocked);
  }, [planningMode, hasDestinationLocked]);

  // Set default departure location from user's home_location in profile
  useEffect(() => {
    // Only set if departureLocation is empty and we haven't already set a departure ID
    if (!departureLocation && !departureId) {
      try {
        const raw = localStorage.getItem("user");
        if (raw) {
          const profile = JSON.parse(raw);
          if (profile?.home_location) {
            setDepartureLocation(profile.home_location);
          }
        }
      } catch (e) {
        console.error("Error reading user profile for home_location:", e);
      }
    }
  }, []); // Run once on mount

  const getAuthToken = () => localStorage.getItem("token");

  const formatTime = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Format price for display (handles numbers, strings with currency symbols, etc.)
  const formatPrice = (price: any): string => {
    if (!price) return '';
    if (typeof price === 'number') {
      return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    if (typeof price === 'string') {
      // Remove currency symbols and extract number
      const numStr = price.replace(/[^0-9.]/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num)) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }
      return price;
    }
    return String(price);
  };

  // Helper to interpret YYYY-MM-DD strings as local dates (not UTC) so
  // that displayed itinerary days match the dates the user actually chose.
  const parseLocalDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const [yearStr, monthStr, dayStr] = parts;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!year || !month || !day) return null;
    // Constructing via (year, monthIndex, day) uses the local timezone
    // and avoids the implicit UTC interpretation of bare YYYY-MM-DD.
    return new Date(year, month - 1, day);
  };

  const getStoredUserProfile = () => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const buildDefaultPreferencesFromProfile = (): TripPreferences => {
    const profile = getStoredUserProfile();

    const likedTags: string[] = Array.isArray(profile?.liked_tags) ? profile.liked_tags : [];
    const travelStyle: string | undefined = profile?.travel_style;
    const budgetPreference: number | null =
      typeof profile?.budget_preference === "number"
        ? profile.budget_preference
        : profile?.budget_preference
        ? parseFloat(profile.budget_preference)
        : null;

    const mapTagsToCategories = (tags: string[]): ActivityCategory[] => {
      const categories: ActivityCategory[] = [];
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));

      const mapping: { key: ActivityCategory; matches: string[] }[] = [
        { key: "outdoors", matches: ["outdoors", "hiking", "mountains", "nature", "wildlife"] },
        { key: "relaxing", matches: ["relaxation", "beaches", "spa"] },
        { key: "cultural", matches: ["history", "architecture", "cultural"] },
        { key: "music", matches: ["music", "nightlife"] },
        { key: "arts", matches: ["art", "museums"] },
        { key: "museums", matches: ["museums"] },
        { key: "food", matches: ["food"] },
        { key: "nightlife", matches: ["nightlife"] },
        { key: "shopping", matches: ["shopping"] },
        { key: "nature", matches: ["nature", "mountains", "wildlife"] },
        { key: "adventure", matches: ["adventure", "hiking"] },
      ];

      for (const entry of mapping) {
        if (entry.matches.some((m) => tagSet.has(m))) {
          categories.push(entry.key);
        }
      }

      return Array.from(new Set(categories));
    };

    const initialCategories = mapTagsToCategories(likedTags);

    let defaultPace: TripPreferences["pace"] = "";
    if (travelStyle === "relaxation") defaultPace = "slow";
    else if (travelStyle === "adventure") defaultPace = "packed";
    else if (travelStyle) defaultPace = "balanced";

    return {
      num_days: null,
      start_date: null,
      end_date: null,
      min_budget: null,
      max_budget: budgetPreference || null,
      pace: defaultPace,
      accommodation_type: "",
      activity_categories: initialCategories,
      avoid_activity_categories: [],
      selected_cities: [],
      group_type: "",
      safety_notes: "",
      accessibility_notes: "",
      custom_requests: "",
    };
  };

  const toggleSelectedCity = (city: string) => {
    const cleaned = city.trim();
    if (!cleaned) return;
    setTripPreferences((prev) => {
      const base = prev ?? buildDefaultPreferencesFromProfile();
      const current = Array.isArray(base.selected_cities) ? base.selected_cities : [];
      const exists = current.some((c) => c.toLowerCase() === cleaned.toLowerCase());
      const next = exists
        ? current.filter((c) => c.toLowerCase() !== cleaned.toLowerCase())
        : [...current, cleaned];
      return { ...base, selected_cities: next };
    });
  };

  const fetchCitySuggestions = async () => {
    if (!tripId || !tripDestination) return;
    const token = getAuthToken();
    if (!token) return;

    try {
      setIsLoadingCitySuggestions(true);
      setCitySuggestionsError(null);

      const response = await fetch(getApiUrl(`api/trips/${tripId}/city-suggestions`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Failed to load city suggestions");
      }

      const cities: string[] = Array.isArray(result.cities) ? result.cities : [];
      setCitySuggestions(cities);
      setCitySuggestionsMeta({
        destination_type: result.destination_type || "unknown",
        normalized_destination: result.normalized_destination ?? null,
        country: result.country ?? null,
        primary_city: result.primary_city ?? null,
      });

      // If destination was a city and the user hasn't picked anything yet, preselect the primary city.
      if (result.destination_type === "city") {
        const primary = (result.primary_city || cities[0] || "").trim();
        if (primary) {
          setTripPreferences((prev) => {
            const base = prev ?? buildDefaultPreferencesFromProfile();
            const current = Array.isArray(base.selected_cities) ? base.selected_cities : [];
            if (current.length > 0) return base;
            return { ...base, selected_cities: [primary] };
          });
        }
      }
    } catch (error: any) {
      console.error("Error fetching city suggestions:", error);
      setCitySuggestionsError(error?.message || "Failed to load city suggestions");
    } finally {
      setIsLoadingCitySuggestions(false);
    }
  };

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const raw = (overrideContent ?? inputMessage).trim();
      if (!raw || isLoading) return;

      // What the user sees in the bubble
      const userMessage: Message = {
        role: "user",
        content: raw,
        timestamp: formatTime(),
      };

      setMessages((prev) => [...prev, userMessage]);
      if (!overrideContent) {
        setInputMessage("");
      }
      setIsLoading(true);

      // What we actually send to the LLM (can include extra context)
      const contentForLLM =
        tripId && tripDestination
          ? `I'm already planning a trip to ${tripDestination}. Please answer this specific question about that trip (do NOT suggest new destinations):\n\n${raw}`
          : raw;

      const isTripRequest = /want.*go|plan.*trip|visit|travel|to\s+[A-Za-z]/i.test(
        raw
      );
      if (
        planningMode === "known" &&
        !tripId &&
        (isTripRequest || raw === initialMessage)
      ) {
        setIsCreatingTrip(true);
      }

      try {
        const token = getAuthToken();
        if (!token) {
          throw new Error("Not authenticated. Please log in.");
        }

        const apiUrl = getApiUrl("api/chat/chat");
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: contentForLLM,
            tripId,
          }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          const backendMessage =
            result && typeof result.message === "string"
              ? result.message
              : `The planning service returned an error (${response.status} ${response.statusText}).`;

          const errorMessage: Message = {
            role: "assistant",
            content: backendMessage,
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          return;
        }

        if (result && result.success) {
          if (result.tripId && !tripId && onTripCreated) {
            onTripCreated(result.tripId);
          }

          const assistantMessage: Message = {
            role: "assistant",
            content: result.message || "No response from assistant",
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else if (result) {
          const errorMessage: Message = {
            role: "assistant",
            content:
              result.message ||
              "Sorry, I encountered an error. Please try again.",
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage: Message = {
          role: "assistant",
          content:
            "Sorry, I'm having trouble connecting. Please try again later.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setIsCreatingTrip(false);
      }
    },
    [inputMessage, isLoading, tripId, initialMessage, onTripCreated, planningMode]
  );

  const loadItineraryDays = useCallback(
    async (id: number) => {
      try {
        const token = getAuthToken();
        if (!token) return;

        const response = await fetch(getApiUrl(`api/trips/${id}/itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success && Array.isArray(result.days)) {
          setItineraryDays(result.days);
          setItineraryCarouselIndex(0);
        }
      } catch (error) {
        console.error("Error loading itinerary days:", error);
      }
    },
    []
  );

  const loadFinalItinerary = useCallback(
    async (id: number) => {
      try {
        const token = getAuthToken();
        if (!token) return false;

        const response = await fetch(getApiUrl(`api/trips/${id}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success && result.itinerary?.days?.length > 0) {
          setFinalItinerary(result.itinerary);
          return true;
        }
      } catch (error) {
        console.error("Error loading final itinerary:", error);
      }

      return false;
    },
    []
  );

  // Load trip preferences once we know the tripId
  useEffect(() => {
    const loadPreferences = async () => {
      if (!tripId || hasLoadedPreferences) return;

      try {
        const token = getAuthToken();
        if (!token) return;

        const response = await fetch(getApiUrl(`api/trips/${tripId}/preferences`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success && result.preferences) {
          const loaded = result.preferences;
          setTripPreferences({
            ...loaded,
            selected_cities: Array.isArray(loaded?.selected_cities) ? loaded.selected_cities : [],
          });
        } else {
          // Seed with defaults from user profile if no preferences yet
          setTripPreferences(buildDefaultPreferencesFromProfile());
        }
      } catch (error) {
        console.error("Error loading trip preferences:", error);
        setTripPreferences(buildDefaultPreferencesFromProfile());
      } finally {
        setHasLoadedPreferences(true);
      }
    };

    loadPreferences();
    if (tripId) {
      loadItineraryDays(tripId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, hasLoadedPreferences, loadItineraryDays]);

  // Initialize ordered cities from tripPreferences or citySuggestions when they become available
  useEffect(() => {
    if (hasConfirmedTripSketch && activeTab === "flights" && orderedCities.length === 0) {
      // Initialize from selected_cities if available, otherwise from citySuggestions
      const citiesToUse = 
        tripPreferences?.selected_cities && tripPreferences.selected_cities.length > 0
          ? tripPreferences.selected_cities
          : citySuggestions.length > 0
          ? citySuggestions
          : tripDestination
          ? [tripDestination]
          : [];
      
      if (citiesToUse.length > 0) {
        setOrderedCities([...citiesToUse]);
      }
    }
  }, [hasConfirmedTripSketch, activeTab, tripPreferences?.selected_cities, citySuggestions, tripDestination, orderedCities.length]);


  const loadActivities = useCallback(
    async (id: number) => {
      try {
        const token = getAuthToken();
        if (!token) return;

        const response = await fetch(getApiUrl(`api/trips/${id}/activities`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success && Array.isArray(result.activities)) {
          setActivities(result.activities);
        }
      } catch (error) {
        console.error("Error loading activities:", error);
      }
    },
    []
  );

  // Load any existing activity suggestions when the trip is known
  useEffect(() => {
    if (!tripId) return;
    loadActivities(tripId);
  }, [tripId, loadActivities]);


  const loadRestaurants = useCallback(
    async (id: number) => {
      try {
        const token = getAuthToken();
        if (!token) return;

        const response = await fetch(getApiUrl(`api/trips/${id}/restaurants`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success && Array.isArray(result.restaurants)) {
          setRestaurants(result.restaurants);
        }
      } catch (error) {
        console.error("Error loading restaurants:", error);
      }
    },
    []
  );

  useEffect(() => {
    if (!tripId) return;
    loadRestaurants(tripId);
  }, [tripId, loadRestaurants]);

  const loadRestaurantPreferences = useCallback(async (id: number) => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const response = await fetch(getApiUrl(`api/trips/${id}/restaurant-preferences`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (response.ok && result.success && result.restaurant_preferences) {
        const p = result.restaurant_preferences;
        setRestaurantFormData((prev) => ({
          ...prev,
          mealsPerDay: p.meals_per_day ?? prev.mealsPerDay,
          mealTypes: Array.isArray(p.meal_types) ? p.meal_types : prev.mealTypes,
          cuisineTypes: Array.isArray(p.cuisine_types) ? p.cuisine_types : prev.cuisineTypes,
          dietaryRestrictions: Array.isArray(p.dietary_restrictions) ? p.dietary_restrictions : prev.dietaryRestrictions,
          minPriceRange: p.min_price_range ?? null,
          maxPriceRange: p.max_price_range ?? null,
        }));
      }
    } catch (e) {
      console.error("Error loading restaurant preferences:", e);
    }
  }, []);

  useEffect(() => {
    if (!tripId) return;
    loadRestaurantPreferences(tripId);
  }, [tripId, loadRestaurantPreferences]);

  const generateRestaurants = async () => {
    if (!tripId) return;

    try {
      setIsGeneratingRestaurants(true);

      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${tripId}/generate-restaurants`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testMode: useTestRestaurants,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success && Array.isArray(result.restaurants)) {
        setRestaurants(result.restaurants);
        setHasStartedRestaurants(true);

        const assistantMessage: Message = {
          role: "assistant",
          content:
            result.restaurants.length > 0
              ? `I found ${result.restaurants.length} restaurants based on your preferences. Swipe through them below and tell me what you like!`
              : "I wasn't able to find restaurants matching your preferences. Try adjusting your preferences and try again.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        console.error("Failed to generate restaurants:", result.message);
      }
    } catch (error) {
      console.error("Error generating restaurants:", error);
    } finally {
      setIsGeneratingRestaurants(false);
    }
  };

  const updateRestaurantPreference = async (
    restaurantId: number,
    preference: "liked" | "disliked" | "maybe",
    mealType?: string,
    dayNumber?: number
  ) => {
    if (!tripId) return;

    try {
      setIsUpdatingRestaurantPreference((prev) => ({ ...prev, [restaurantId]: true }));
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/restaurants/${restaurantId}/preference`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ preference, meal_type: mealType, day_number: dayNumber }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setRestaurants((prev) =>
          prev.map((r) =>
            r.restaurant_id === restaurantId
              ? {
                  ...r,
                  preference,
                  meal_type: mealType || r.meal_type,
                  day_number: dayNumber || r.day_number,
                }
              : r
          )
        );
      } else {
        console.error("Failed to update restaurant preference:", result.message);
      }
    } catch (error) {
      console.error("Error updating restaurant preference:", error);
    } finally {
      setIsUpdatingRestaurantPreference((prev) => ({ ...prev, [restaurantId]: false }));
    }
  };

  const handlePreferenceChange = <K extends keyof TripPreferences>(
    key: K,
    value: TripPreferences[K]
  ) => {
    setTripPreferences((prev) =>
      prev ? { ...prev, [key]: value } : { ...buildDefaultPreferencesFromProfile(), [key]: value }
    );
  };

  const toggleCategory = (key: "activity_categories" | "avoid_activity_categories", category: ActivityCategory) => {
    setTripPreferences((prev) => {
      const base = prev ?? buildDefaultPreferencesFromProfile();
      const current = new Set(base[key]);
      if (current.has(category)) {
        current.delete(category);
      } else {
        current.add(category);
      }
      return { ...base, [key]: Array.from(current) as ActivityCategory[] };
    });
  };

  const savePreferences = async () => {
    if (!tripId || !tripPreferences) return;

    try {
      setIsSavingPreferences(true);
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${tripId}/preferences`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tripPreferences),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTripPreferences(result.preferences);
      } else {
        console.error("Failed to save preferences:", result.message);
      }
    } catch (error) {
      console.error("Error saving trip preferences:", error);
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const generateItinerary = async () => {
    if (!tripId) return;

    try {
      setIsGeneratingItinerary(true);
      // Show an in-progress status while the itinerary is being generated.
      setItinerarySummary("Generating trip sketch...");

      // Save preferences first if we have any unsaved changes
      if (tripPreferences) {
        await savePreferences();
      }

      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${tripId}/generate-itinerary`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      const summaryText =
          (response.ok && result.success && result.message) ||
        "I've saved your preferences and attempted to generate an itinerary.";

      // Show the itinerary summary as a separate info block at the very
      // bottom of the chat area (after activities), instead of as a
      // regular assistant chat bubble in the main stream.
      setItinerarySummary(summaryText);
      await loadItineraryDays(tripId);
    } catch (error) {
      console.error("Error generating itinerary:", error);
      const errorMessage: Message = {
        role: "assistant",
        content:
          "I ran into an issue while generating your itinerary. Please try again in a moment.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGeneratingItinerary(false);
    }
  };

  const [useTestActivities, setUseTestActivities] = useState(true); // Default to true for Greece test activities
  const [useTestRestaurants, setUseTestRestaurants] = useState(false);

  const generateActivities = async () => {
    if (!tripId) return;

    try {
      setIsGeneratingActivities(true);

      // Save preferences first so activities can reflect latest constraints
      if (tripPreferences) {
        await savePreferences();
      }

      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${tripId}/generate-activities`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testMode: useTestActivities,
          selected_cities: tripPreferences?.selected_cities ?? [],
        }),
      });

      const result = await response.json();

      if (response.ok && result.success && Array.isArray(result.activities)) {
        setActivities(result.activities);

        if (result.activities.length > 0) {
          const assistantMessage: Message = {
            role: "assistant",
            content:
              "I pulled together a small set of activity ideas based on your preferences. Swipe through them below and tell me what you like.",
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          window.alert(
            "I wasn't able to find good activity ideas just yet. You can adjust your preferences or try again."
          );
        }
      } else {
        console.error("Failed to generate activities:", result.message);
      }
    } catch (error) {
      console.error("Error generating activities:", error);
    } finally {
      setIsGeneratingActivities(false);
    }
  };

  const generateFinalItinerary = async () => {
    if (!tripId) return;

    try {
      setIsGeneratingFinalItinerary(true);
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${tripId}/generate-final-itinerary`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok && result.success && result.itinerary) {
        setFinalItinerary(result.itinerary);
      } else {
        console.error("Failed to generate final itinerary:", result.message);
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || "Failed to generate final itinerary. Please try again.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error generating final itinerary:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "I encountered an error while generating your final itinerary. Please try again.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGeneratingFinalItinerary(false);
    }
  };

  const updateActivityPreference = async (
    activityId: number,
    preference: "liked" | "disliked" | "maybe"
  ) => {
    if (!tripId) return;

    try {
      setIsUpdatingActivityPreference((prev) => ({ ...prev, [activityId]: true }));
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/activities/${activityId}/preference`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ preference }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setActivities((prev) =>
          prev.map((a) =>
            a.activity_id === activityId
              ? {
                  ...a,
                  preference,
                }
              : a
          )
        );
      } else {
        console.error("Failed to update activity preference:", result.message);
      }
    } catch (error) {
      console.error("Error updating activity preference:", error);
    } finally {
      setIsUpdatingActivityPreference((prev) => ({ ...prev, [activityId]: false }));
    }
  };

  // Extract arrival location from day 1 of the itinerary, or from trip destination/activities
  const getArrivalLocation = (): string | null => {
    // First, try to get from itinerary days (if they exist)
    if (itineraryDays.length > 0) {
    // Find day 1 (could be day_number === 1 or the first day in the array)
    const day1 = itineraryDays.find((day) => day.day_number === 1) || itineraryDays[0];

      if (day1) {
    // Try to get location from activities
    if (Array.isArray(day1.activities) && day1.activities.length > 0) {
      const firstActivity = day1.activities[0];
      if (firstActivity.location) {
        return firstActivity.location;
      }
    }

    // Try to extract location from summary
    if (day1.summary) {
      // Look for common location patterns in the summary
      const locationMatch = day1.summary.match(/(?:in|at|to|from)\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z][a-zA-Z\s]+)?)/);
      if (locationMatch) {
        return locationMatch[1].trim();
          }
        }
      }
    }

    // Fallback: try to get from activities (if we have any)
    if (activities.length > 0) {
      const firstActivity = activities.find(a => a.location) || activities[0];
      if (firstActivity?.location) {
        return firstActivity.location;
      }
    }

    // Last resort: use trip destination
    return tripDestination;
  };

  // Calculate day allocation for each city based on activity counts and flight dates
  // This function handles duplicate cities by splitting activities across instances
  // Uses actual flight arrival/departure dates to account for travel time
  const calculateCityDaysAllocation = useCallback(async () => {
    // Only calculate when both flights are selected (not just confirmed)
    if (selectedOutboundIndex === null || selectedReturnIndex === null || orderedCities.length === 0 || !tripId) {
      setCityDaysAllocation([]);
      return;
    }

    if (!tripPreferences?.start_date || !tripPreferences?.end_date) {
      setCityDaysAllocation([]);
      return;
    }

    // Get selected flight dates - fetch from database to get complete flight data
    let actualStartDate: Date | null = null;
    let actualEndDate: Date | null = null;

    try {
      const token = getAuthToken();
      if (!token) {
        setCityDaysAllocation([]);
        return;
      }

      // Fetch selected flights from database
      const flightsResponse = await fetch(getApiUrl(`api/flights/trip/${tripId}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const flightsResult = await flightsResponse.json();
      
      if (flightsResponse.ok && flightsResult.success) {
        // Get selected outbound flight
        const selectedOutboundFlightId = flightsResult.outbound_flight_ids?.[flightsResult.selected_outbound_index];
        const selectedReturnFlightId = flightsResult.return_flight_ids?.[flightsResult.selected_return_index];
        
        if (selectedOutboundFlightId && flightsResult.outbound_flights) {
          const selectedOutbound = flightsResult.outbound_flights[flightsResult.selected_outbound_index];
          const flightLegs = selectedOutbound?.flights || [];
          
          if (flightLegs.length > 0) {
            const lastLeg = flightLegs[flightLegs.length - 1];
            // Try different possible structures for arrival time/date
            const arrivalTime = lastLeg.arrival_airport?.time || 
                               lastLeg.arrival_airport?.date ||
                               lastLeg.arrival?.time || 
                               lastLeg.arrival?.date ||
                               lastLeg.arrival_time ||
                               lastLeg.arrival_date ||
                               null;
            
            if (arrivalTime) {
              console.log(`[CityDaysAllocation] Found arrival time: ${arrivalTime}`);
              // Parse arrival time/date - could be ISO string, timestamp, or date string
              const parsedDate = new Date(arrivalTime);
              
              // Check if date is valid
              if (!isNaN(parsedDate.getTime())) {
                // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
                const year = parsedDate.getFullYear();
                const month = parsedDate.getMonth();
                const day = parsedDate.getDate();
                actualStartDate = new Date(year, month, day);
                
                console.log(`[CityDaysAllocation] Parsed arrival date: ${actualStartDate.toISOString().split('T')[0]}`);
                
                // If arrival is late in the day (after 6 PM), activities start the next day
                const arrivalHour = parsedDate.getHours();
                if (arrivalHour >= 18) {
                  actualStartDate.setDate(actualStartDate.getDate() + 1);
                  console.log(`[CityDaysAllocation] Arrival after 6 PM, starting activities next day: ${actualStartDate.toISOString().split('T')[0]}`);
                }
              } else {
                // If parsing failed, try to extract date from string format like "2024-03-05 14:30"
                const dateMatch = String(arrivalTime).match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                  actualStartDate = new Date(dateMatch[1]);
                  console.log(`[CityDaysAllocation] Extracted date from string: ${actualStartDate.toISOString().split('T')[0]}`);
                }
              }
            } else {
              console.log(`[CityDaysAllocation] No arrival time found in flight leg:`, lastLeg);
            }
          }
          
          // If we still don't have a date, check total duration to estimate
          if (!actualStartDate) {
            const outboundDate = new Date(tripPreferences.start_date);
            const totalDurationHours = (selectedOutbound?.total_duration || 0) / 60;
            // If flight duration suggests it crosses midnight or is very long, add a day
            if (totalDurationHours > 12 || (totalDurationHours > 6 && outboundDate.getHours() >= 18)) {
              outboundDate.setDate(outboundDate.getDate() + 1);
            }
            actualStartDate = outboundDate;
          }
        }

        // Get selected return flight
        if (selectedReturnFlightId && flightsResult.return_flights) {
          const selectedReturn = flightsResult.return_flights[flightsResult.selected_return_index];
          const flightLegs = selectedReturn?.flights || [];
          
          if (flightLegs.length > 0) {
            const firstLeg = flightLegs[0];
            // Try different possible structures for departure time
            const departureTime = firstLeg.departure_airport?.time || 
                                firstLeg.departure_airport?.date ||
                                firstLeg.departure?.time || 
                                firstLeg.departure?.date ||
                                firstLeg.departure_time ||
                                firstLeg.departure_date ||
                                null;
            
            if (departureTime) {
              const parsedDate = new Date(departureTime);
              if (!isNaN(parsedDate.getTime())) {
                const year = parsedDate.getFullYear();
                const month = parsedDate.getMonth();
                const day = parsedDate.getDate();
                actualEndDate = new Date(year, month, day);
              } else {
                const dateMatch = String(departureTime).match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                  actualEndDate = new Date(dateMatch[1]);
                }
              }
            }
          }
          
          if (!actualEndDate) {
            actualEndDate = new Date(tripPreferences.end_date);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching flight data for date calculation:", error);
    }

    // Final fallback to trip dates if still not available
    if (!actualStartDate && tripPreferences?.start_date) {
      const outboundDate = new Date(tripPreferences.start_date);
      outboundDate.setDate(outboundDate.getDate() + 1); // Add 1 day for travel
      actualStartDate = outboundDate;
    }
    if (!actualEndDate && tripPreferences?.end_date) {
      actualEndDate = new Date(tripPreferences.end_date);
    }

    if (!actualStartDate || !actualEndDate) {
      setCityDaysAllocation([]);
      return;
    }

    console.log(`[CityDaysAllocation] Using dates - Start: ${actualStartDate.toISOString().split('T')[0]}, End: ${actualEndDate.toISOString().split('T')[0]}`);
    console.log(`[CityDaysAllocation] Trip dates were - Start: ${tripPreferences.start_date}, End: ${tripPreferences.end_date}`);

    // Calculate total available days (from arrival to departure)
    const totalDays = Math.ceil((actualEndDate.getTime() - actualStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (totalDays <= 0) {
      setCityDaysAllocation([]);
      return;
    }

    // Group activities by city name (case-insensitive, normalized)
    const normalizeCityName = (name: string | null | undefined): string => {
      if (!name) return '';
      return name.trim().toLowerCase();
    };

    const activitiesByCity = new Map<string, typeof activities>();
    
    // Group activities by their city field (or location as fallback)
    activities.forEach((activity) => {
      const cityName = activity.city || activity.location || '';
      if (cityName) {
        const normalized = normalizeCityName(cityName);
        if (!activitiesByCity.has(normalized)) {
          activitiesByCity.set(normalized, []);
        }
        activitiesByCity.get(normalized)!.push(activity);
      }
    });

    // For each city in orderedCities, find matching activities
    // If a city appears multiple times, split activities evenly across instances
    const cityInstances: Array<{ city: string; activities: typeof activities }> = [];
    const cityActivityCounts = new Map<string, number>();
    
    // Count total activities per city name
    orderedCities.forEach((city) => {
      const normalized = normalizeCityName(city);
      const count = activitiesByCity.get(normalized)?.length || 0;
      cityActivityCounts.set(city, (cityActivityCounts.get(city) || 0) + count);
    });

    // Distribute activities across duplicate city instances
    orderedCities.forEach((city) => {
      const normalized = normalizeCityName(city);
      const allCityActivities = activitiesByCity.get(normalized) || [];
      
      // Count how many times this city appears in orderedCities
      const cityOccurrences = orderedCities.filter(c => normalizeCityName(c) === normalized).length;
      
      // Split activities evenly across occurrences
      const activitiesPerInstance = Math.ceil(allCityActivities.length / cityOccurrences);
      const instanceIndex = orderedCities.slice(0, orderedCities.indexOf(city) + 1)
        .filter(c => normalizeCityName(c) === normalized).length - 1;
      
      const startIdx = instanceIndex * activitiesPerInstance;
      const endIdx = Math.min(startIdx + activitiesPerInstance, allCityActivities.length);
      const instanceActivities = allCityActivities.slice(startIdx, endIdx);
      
      cityInstances.push({
        city,
        activities: instanceActivities,
      });
    });

    // Calculate activity counts for each city instance
    const activityCounts = cityInstances.map(instance => instance.activities.length);
    const totalActivities = activityCounts.reduce((sum, count) => sum + count, 0);

    // Allocate days proportionally based on activity counts
    // If no activities, distribute days equally
    // Otherwise, minimum 1 day per city, distribute remaining days proportionally
    const baseDays = cityInstances.length; // At least 1 day per city
    const remainingDays = Math.max(0, totalDays - baseDays);
    
    const allocations = cityInstances.map((instance, index) => {
      let days = 1; // Base: at least 1 day
      
      if (totalActivities === 0) {
        // No activities: distribute days equally
        const daysPerCity = Math.floor(totalDays / cityInstances.length);
        const extraDays = totalDays % cityInstances.length;
        days = daysPerCity + (index < extraDays ? 1 : 0);
      } else if (remainingDays > 0) {
        // Allocate remaining days proportionally based on activity count
        const activityRatio = activityCounts[index] / totalActivities;
        days += Math.round(activityRatio * remainingDays);
      }
      
      // For cities with 0 activities, show at least 2 as a placeholder/estimate
      const displayActivityCount = activityCounts[index] === 0 ? 2 : activityCounts[index];
      
      return {
        city: instance.city,
        days,
        activityCount: activityCounts[index], // Actual count for calculation
        displayActivityCount, // Display count (minimum 2 for cities with 0 activities)
      };
    });

    // Adjust if total exceeds available days (rounding errors)
    const totalAllocated = allocations.reduce((sum, a) => sum + a.days, 0);
    if (totalAllocated > totalDays) {
      // Reduce from cities with most days
      const sorted = [...allocations].sort((a, b) => b.days - a.days);
      let excess = totalAllocated - totalDays;
      for (const alloc of sorted) {
        if (excess <= 0) break;
        const reduction = Math.min(excess, alloc.days - 1); // Keep at least 1 day
        alloc.days -= reduction;
        excess -= reduction;
      }
    } else if (totalAllocated < totalDays) {
      // Distribute remaining days to cities with most activities
      // Prioritize cities with activities over cities with 0 activities
      const remaining = totalDays - totalAllocated;
      const sorted = [...allocations].sort((a, b) => {
        // First sort by activity count (cities with activities first)
        if (b.activityCount !== a.activityCount) {
          return b.activityCount - a.activityCount;
        }
        // If same activity count, sort by current days (fewer days first)
        return a.days - b.days;
      });
      for (let i = 0; i < remaining; i++) {
        sorted[i % sorted.length].days += 1;
      }
    }

    // Calculate dates for each city segment starting from actual arrival date
    let currentDate = new Date(actualStartDate);
    const result = allocations.map((alloc) => {
      const cityStartDate = new Date(currentDate);
      const cityEndDate = new Date(currentDate);
      cityEndDate.setDate(cityEndDate.getDate() + alloc.days - 1);
      
      // Ensure we don't exceed the actual end date
      if (cityEndDate > actualEndDate) {
        cityEndDate.setTime(actualEndDate.getTime());
      }
      
      // Format dates as YYYY-MM-DD
      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
      };
      
      const startDateStr = formatDate(cityStartDate);
      const endDateStr = formatDate(cityEndDate);
      
      // Move to next city's start date
      currentDate.setDate(currentDate.getDate() + alloc.days);
      
      return {
        city: alloc.city,
        days: alloc.days,
        startDate: startDateStr,
        endDate: endDateStr,
        activityCount: alloc.activityCount, // Actual activity count
        displayActivityCount: alloc.displayActivityCount || alloc.activityCount, // Display count (min 2 for 0-activity cities)
      };
    });

    setCityDaysAllocation(result);
  }, [orderedCities, activities, selectedOutboundIndex, selectedReturnIndex, tripId, tripPreferences?.start_date, tripPreferences?.end_date]);

  // Call the async calculation function when dependencies change
  useEffect(() => {
    if (selectedOutboundIndex !== null && selectedReturnIndex !== null && orderedCities.length > 0 && tripId) {
      calculateCityDaysAllocation();
    } else {
      setCityDaysAllocation([]);
    }
  }, [calculateCityDaysAllocation, selectedOutboundIndex, selectedReturnIndex, orderedCities.length, tripId]);

  // Fetch flights from SerpAPI for all departure airports
  const fetchFlights = async () => {
    console.log("fetchFlights called", { tripId, departureId, departureAirportCodes, arrivalId, tripPreferences });

    // Use selected departure airport codes if available, otherwise fall back to all, then single departureId
    const airportsToSearch =
      selectedDepartureAirportCodes.length > 0
        ? selectedDepartureAirportCodes
        : departureAirportCodes.length > 0
        ? departureAirportCodes
        : departureId
        ? [departureId]
        : [];

    if (!tripId || airportsToSearch.length === 0 || (!arrivalId && arrivalAirportCodes.length === 0)) {
      const errorMessage: Message = {
        role: "assistant",
        content: "Please set both departure and arrival airport codes before searching for flights.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    if (!tripPreferences?.start_date || !tripPreferences?.end_date) {
      const errorMessage: Message = {
        role: "assistant",
        content: "Please set your trip dates in Phase 1 before searching for flights.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    try {
      setIsFetchingFlights(true);
      const token = getAuthToken();
      if (!token) return;

      // Fetch flights for each departure airport in parallel
      const targetArrivalCodes =
        selectedArrivalAirportCodes.length > 0
          ? selectedArrivalAirportCodes
          : arrivalAirportCodes.length > 0
          ? arrivalAirportCodes
          : arrivalId
          ? [arrivalId]
          : [];

      const flightPromises = airportsToSearch.flatMap((departureAirportCode) =>
        targetArrivalCodes.map(async (arrivalCode) => {
        const params = new URLSearchParams({
          departure_id: departureAirportCode,
            arrival_id: arrivalCode,
          outbound_date: tripPreferences.start_date,
          return_date: tripPreferences.end_date,
        });

          console.log(`Fetching flights for route ${departureAirportCode} → ${arrivalCode} with params:`, {
          departure_id: departureAirportCode,
            arrival_id: arrivalCode,
          outbound_date: tripPreferences.start_date,
          return_date: tripPreferences.end_date,
        });

        try {
          const response = await fetch(getApiUrl(`api/flights/search?${params.toString()}`), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          const result = await response.json();
            console.log(`Flight API response for route ${departureAirportCode} → ${arrivalCode}:`, result);

          if (response.ok && result.success) {
              let flightsForRoute: any[] = [];
            if (Array.isArray(result.best_flights) && result.best_flights.length > 0) {
                flightsForRoute = result.best_flights;
            } else if (Array.isArray(result.other_flights) && result.other_flights.length > 0) {
                flightsForRoute = result.other_flights;
            }

              // Add departure & arrival airport codes to each flight for grouping
            return {
                departureCode: departureAirportCode,
                arrivalCode,
                flights: flightsForRoute.map((flight) => ({
                ...flight,
                  departure_airport_code: departureAirportCode,
                  arrival_airport_code: arrivalCode,
                })),
            };
          } else {
              console.error(`Flight API error for route ${departureAirportCode} → ${arrivalCode}:`, result);
            return {
                departureCode: departureAirportCode,
                arrivalCode,
                flights: [],
            };
          }
        } catch (error) {
            console.error(`Error fetching flights for route ${departureAirportCode} → ${arrivalCode}:`, error);
          return {
              departureCode: departureAirportCode,
              arrivalCode,
              flights: [],
          };
        }
        })
      );

      const results = await Promise.all(flightPromises);

      // Group flights by departure airport code (keep existing UI grouping)
      const flightsByAirportMap: Record<string, any[]> = {};
      const allFlights: any[] = [];

      results.forEach(({ departureCode, flights }) => {
        if (flights.length > 0) {
          if (!flightsByAirportMap[departureCode]) {
            flightsByAirportMap[departureCode] = [];
          }
          flightsByAirportMap[departureCode].push(...flights);
          allFlights.push(...flights);
        }
      });

      setFlightsByAirport(flightsByAirportMap);
      setBestFlights(allFlights); // Keep for backward compatibility

      // Save flights to database for all airports
      const allFlightsToSave = allFlights;
      if (allFlightsToSave.length > 0) {
        try {
          console.log(`Saving ${allFlightsToSave.length} outbound flights to database...`);
          const saveResponse = await fetch(getApiUrl("api/flights/save-outbound"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              trip_id: tripId,
              flights: allFlightsToSave,
              search_params: {
                departure_id: departureId || airportsToSearch[0], // Use primary departure for search params
                arrival_id: arrivalId,
                outbound_date: tripPreferences.start_date,
                return_date: tripPreferences.end_date,
                currency: "USD",
              },
            }),
          });

          const saveResult = await saveResponse.json();
          if (saveResult.success && saveResult.flight_ids) {
            console.log(`Saved ${saveResult.saved_count || saveResult.flight_ids.length} outbound flights to database:`, saveResult);
            // Map flight indices to flight_ids (using global index across all airports)
            const flightIdMap: Record<number, number> = {};
            saveResult.flight_ids.forEach((flightId: number, idx: number) => {
              if (idx < allFlightsToSave.length) {
                flightIdMap[idx] = flightId;
              }
            });
            setOutboundFlightIds(flightIdMap);

            if (saveResult.saved_count < allFlightsToSave.length) {
              console.warn(`Warning: Only ${saveResult.saved_count} out of ${allFlightsToSave.length} flights were saved successfully`);
            }
          } else {
            console.error("Failed to save outbound flights:", saveResult);
          }
        } catch (saveError) {
          console.error("Error saving outbound flights:", saveError);
        }
      }

      // Check if any flights were found
      if (allFlightsToSave.length === 0) {
        const errorMessage: Message = {
          role: "assistant",
          content: "No flight options found for your search across all departure airports. Please try different dates or airports.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error fetching flights:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "I encountered an error while fetching flights. Please check the console for details.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsFetchingFlights(false);
    }
  };

  // Fetch return flights using departure_token from selected outbound flight
  const fetchReturnFlights = async (departureToken: string) => {
    if (!tripId || !arrivalId || !tripPreferences?.start_date || !tripPreferences?.end_date) {
      console.error("Missing required data for fetching return flights:", {
        tripId,
        departureId,
        arrivalId,
        start_date: tripPreferences?.start_date,
        end_date: tripPreferences?.end_date
      });
      const errorMessage: Message = {
        role: "assistant",
        content: "Missing required information to fetch return flights. Please ensure your trip dates and airport codes are set.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Check if we already have return flights cached for this departure_token
    if (returnFlightsCache[departureToken]) {
      console.log("Using cached return flights for departure_token:", departureToken);
      setReturnFlights(returnFlightsCache[departureToken]);
      return;
    }

    // Find the actual selected flight to get its departure airport code
    // The selected flight might be from a different airport than the primary departureId
    let actualDepartureId = departureId;
    if (selectedOutboundIndex !== null && bestFlights[selectedOutboundIndex]) {
      const selectedFlight = bestFlights[selectedOutboundIndex];
      // Get departure airport code from the selected flight
      if (selectedFlight.departure_airport_code) {
        actualDepartureId = selectedFlight.departure_airport_code;
      } else if (selectedFlight.flights?.[0]?.departure_airport?.id) {
        actualDepartureId = selectedFlight.flights[0].departure_airport.id;
      }
      // If we have grouped flights, search for the exact flight object to get its airport code
      if (Object.keys(flightsByAirport).length > 0 && selectedFlight?.departure_token) {
        for (const [airportCode, flightsForAirport] of Object.entries(flightsByAirport)) {
          const found = flightsForAirport.find(f => f?.departure_token === selectedFlight?.departure_token);
          if (found) {
            actualDepartureId = airportCode;
            break;
          }
        }
      }
    }

    if (!actualDepartureId) {
      const errorMessage: Message = {
        role: "assistant",
        content: "Could not determine departure airport for return flight search. Please try selecting the outbound flight again.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    try {
      setIsFetchingReturnFlights(true);
      const token = getAuthToken();
      if (!token) return;

      // For return flights, use the actual departure_id from the selected outbound flight
      // The departure_token tells SerpAPI which outbound flight was selected and returns matching return flights
      const params = new URLSearchParams({
        departure_id: actualDepartureId,
        arrival_id: arrivalId,
        outbound_date: tripPreferences.start_date,
        return_date: tripPreferences.end_date,
        departure_token: departureToken,
      });

      console.log("Fetching return flights with params:", {
        departure_id: actualDepartureId,
        arrival_id: arrivalId,
        departure_token: departureToken
      });

      console.log("Fetching return flights with token:", departureToken);

      const response = await fetch(getApiUrl(`api/flights/return?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Return flights API result:", result);
      console.log("Return flights API result keys:", Object.keys(result));
      console.log("best_flights:", result.best_flights);
      console.log("other_flights:", result.other_flights);
      console.log("Response status:", response.status);

      if (response.ok && result.success) {
        let flightsToSet: any[] = [];
        if (Array.isArray(result.best_flights) && result.best_flights.length > 0) {
          flightsToSet = result.best_flights;
        } else if (Array.isArray(result.other_flights) && result.other_flights.length > 0) {
          flightsToSet = result.other_flights;
        }

        console.log(`Found ${flightsToSet.length} return flights to display`);

        if (flightsToSet.length > 0) {
          // Cache the return flights by departure_token
          setReturnFlightsCache(prev => ({
            ...prev,
            [departureToken]: flightsToSet
          }));
          setReturnFlights(flightsToSet);

          // Save return flights to database
          if (selectedOutboundIndex !== null && bestFlights[selectedOutboundIndex]) {
            try {
              const selectedOutbound = bestFlights[selectedOutboundIndex];
              const saveResponse = await fetch(getApiUrl("api/flights/save-return"), {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  trip_id: tripId,
                  departing_flight_id: outboundFlightIds[selectedOutboundIndex] || null,
                  departure_token: selectedOutbound.departure_token || null,
                  flights: flightsToSet,
                  search_params: {
                    departure_id: departureId,
                    arrival_id: arrivalId,
                    outbound_date: tripPreferences.start_date,
                    return_date: tripPreferences.end_date,
                    currency: "USD",
                  },
                }),
              });

              const saveResult = await saveResponse.json();
              if (saveResult.success && saveResult.flight_ids) {
                console.log("Saved return flights to database:", saveResult);
                // Map return flight indices to flight_ids
                const returnFlightIdMap: Record<number, number> = {};
                saveResult.flight_ids.forEach((flightId: number, idx: number) => {
                  if (idx < flightsToSet.length) {
                    returnFlightIdMap[idx] = flightId;
                  }
                });
                setReturnFlightIds(returnFlightIdMap);
              } else {
                console.error("Failed to save return flights:", saveResult);
              }
            } catch (saveError) {
              console.error("Error saving return flights:", saveError);
              // Don't show error to user, just log it
            }
          }
        } else {
          console.warn("No return flights found in API response:", {
            has_best_flights: !!result.best_flights,
            best_flights_length: result.best_flights?.length || 0,
            has_other_flights: !!result.other_flights,
            other_flights_length: result.other_flights?.length || 0,
            raw_result: result
          });
          const errorMessage: Message = {
            role: "assistant",
            content: `No return flight options found for this outbound flight. SerpAPI returned ${result.best_flights?.length || 0} best flights and ${result.other_flights?.length || 0} other flights. Please try selecting a different outbound flight.`,
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } else {
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || "Failed to fetch return flight options. Please try again.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error fetching return flights:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "I encountered an error while fetching return flights. Please try again.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsFetchingReturnFlights(false);
    }
  };

  // Fetch hotels for a specific city
  const fetchHotelsForCity = async (cityIndex: number, cityName: string, checkInDate: Date, checkOutDate: Date) => {
    if (!tripId) return;

    try {
      setIsFetchingHotelsByCity(prev => ({ ...prev, [cityIndex]: true }));
      const token = getAuthToken();
      if (!token) return;

      const params = new URLSearchParams({
        location: cityName,
        check_in_date: checkInDate.toISOString().split('T')[0],
        check_out_date: checkOutDate.toISOString().split('T')[0],
      });

      console.log(`Fetching hotels for city ${cityIndex} (${cityName}) with params:`, {
        location: cityName,
        check_in_date: checkInDate.toISOString().split('T')[0],
        check_out_date: checkOutDate.toISOString().split('T')[0],
      });

      const response = await fetch(getApiUrl(`api/hotels/search?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log(`Hotels API result for city ${cityIndex}:`, result);

      if (response.ok && result.success && Array.isArray(result.properties)) {
        const hotelsToSet = result.properties;
        setHotelsByCity(prev => ({ ...prev, [cityIndex]: hotelsToSet }));

        // Save hotels to database
        try {
          const saveResponse = await fetch(getApiUrl("api/hotels/save"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              trip_id: tripId,
              properties: hotelsToSet,
              search_params: {
                location: cityName,
                check_in_date: checkInDate.toISOString().split('T')[0],
                check_out_date: checkOutDate.toISOString().split('T')[0],
                currency: "USD",
              },
            }),
          });

          const saveResult = await saveResponse.json();
          if (saveResult.success && saveResult.hotel_ids) {
            const hotelIdMap: Record<number, number> = {};
            saveResult.hotel_ids.forEach((hotelId: number, idx: number) => {
              if (idx < hotelsToSet.length) {
                hotelIdMap[idx] = hotelId;
              }
            });
            setHotelIdsByCity(prev => ({ ...prev, [cityIndex]: hotelIdMap }));
          }
        } catch (saveError) {
          console.error("Error saving hotels:", saveError);
        }
      } else {
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || `Failed to fetch hotel options for ${cityName}. Please try again.`,
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error fetching hotels:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `I encountered an error while fetching hotels for ${cityName}. Please try again.`,
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsFetchingHotelsByCity(prev => ({ ...prev, [cityIndex]: false }));
    }
  };

  // Fetch hotels from SerpAPI (legacy function, kept for backward compatibility)
  const fetchHotels = async () => {
    if (!tripId || !tripPreferences?.end_date) {
      return;
    }

    // Get hotel location from day 1 of itinerary
    const hotelLocation = getArrivalLocation();
    if (!hotelLocation) {
      const errorMessage: Message = {
        role: "assistant",
        content: "Could not determine hotel location from your trip sketch. Please ensure your trip has location information.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Use flight arrival date as check-in date (same as multi-city planning)
    const checkInDate = getFlightArrivalDate() || (tripPreferences?.start_date ? new Date(tripPreferences.start_date) : null);
    if (!checkInDate) {
      const errorMessage: Message = {
        role: "assistant",
        content: "Could not determine check-in date. Please ensure your flight is selected.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    const checkInDateStr = checkInDate.toISOString().split('T')[0];

    try {
      setIsFetchingHotels(true);
      const token = getAuthToken();
      if (!token) return;

      const params = new URLSearchParams({
        location: hotelLocation,
        check_in_date: checkInDateStr,
        check_out_date: tripPreferences.end_date,
      });

      console.log("Fetching hotels with params:", {
        location: hotelLocation,
        check_in_date: checkInDateStr,
        check_out_date: tripPreferences.end_date,
      });

      const response = await fetch(getApiUrl(`api/hotels/search?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Hotels API result:", result);

      if (response.ok && result.success && Array.isArray(result.properties)) {
        const hotelsToSet = result.properties;
        setHotels(hotelsToSet);

        // Save hotels to database - save ALL hotels returned from API
        try {
          console.log(`Saving ${hotelsToSet.length} hotels to database...`);
          const saveResponse = await fetch(getApiUrl("api/hotels/save"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              trip_id: tripId,
              properties: hotelsToSet, // Send all hotels
              search_params: {
                location: hotelLocation,
                check_in_date: tripPreferences.start_date,
                check_out_date: tripPreferences.end_date,
                currency: "USD",
              },
            }),
          });

          const saveResult = await saveResponse.json();
          if (saveResult.success && saveResult.hotel_ids) {
            console.log(`Saved ${saveResult.saved_count || saveResult.hotel_ids.length} hotels to database (out of ${saveResult.total_hotels || hotelsToSet.length} total):`, saveResult);
            // Map hotel indices to hotel_ids
            const hotelIdMap: Record<number, number> = {};
            saveResult.hotel_ids.forEach((hotelId: number, idx: number) => {
              if (idx < hotelsToSet.length) {
                hotelIdMap[idx] = hotelId;
              }
            });
            setHotelIds(hotelIdMap);

            if (saveResult.saved_count < hotelsToSet.length) {
              console.warn(`Warning: Only ${saveResult.saved_count} out of ${hotelsToSet.length} hotels were saved successfully`);
            }
          } else {
            console.error("Failed to save hotels:", saveResult);
          }
        } catch (saveError) {
          console.error("Error saving hotels:", saveError);
          // Don't show error to user, just log it
        }
      } else {
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || "Failed to fetch hotel options. Please try again.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error fetching hotels:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "I encountered an error while fetching hotels. Please try again.",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsFetchingHotels(false);
    }
  };

  // Fetch property details for booking options
  const fetchPropertyDetails = async (serpapiLink: string, hotelIndex: number) => {
    if (!serpapiLink) {
      console.error("No serpapi_property_details_link provided");
      return;
    }

    try {
      setIsFetchingPropertyDetails({ ...isFetchingPropertyDetails, [hotelIndex]: true });
      const token = getAuthToken();
      if (!token) return;

      // Get hotel_id from the mapping if available
      const hotelId = hotelIds[hotelIndex];

      // Use the serpapi_property_details_link from the hotel response
      const params = new URLSearchParams({
        serpapi_link: serpapiLink,
      });

      // Add hotel_id if available so backend can check cache
      if (hotelId) {
        params.append('hotel_id', hotelId.toString());
      }

      console.log("Fetching property details with serpapi_link:", serpapiLink, hotelId ? `(hotel_id: ${hotelId})` : "(no hotel_id)");

      const response = await fetch(getApiUrl(`api/hotels/details?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Property details API result:", result, result.cached ? "(from cache)" : "(from API)");

      if (response.ok && result.success && result.property) {
        setPropertyDetails({ ...propertyDetails, [hotelIndex]: result.property });
      } else {
        console.error("Property details API error:", result);
      }
    } catch (error) {
      console.error("Error fetching property details:", error);
    } finally {
      setIsFetchingPropertyDetails({ ...isFetchingPropertyDetails, [hotelIndex]: false });
    }
  };

  // Query LLM to get airport codes for a location (silent - doesn't save to chat history)
  // Returns the primary airport code (closest) for backward compatibility
  const getAirportCode = async (location: string, isDeparture: boolean): Promise<string | null> => {
    try {
      const token = getAuthToken();
      if (!token) return null;

      const response = await fetch(getApiUrl("api/chat/airport-code"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location: location,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Store all airport codes and details
        if (result.airport_codes && Array.isArray(result.airport_codes)) {
          if (isDeparture) {
          setDepartureAirportCodes(result.airport_codes);
            setSelectedDepartureAirportCodes(result.airport_codes); // default: all selected
          } else {
            setArrivalAirportCodes(result.airport_codes);
            setSelectedArrivalAirportCodes(result.airport_codes); // default: all selected
          }
        }

          // Store full airport details if available
          if (result.airports && Array.isArray(result.airports)) {
          if (isDeparture) {
            setDepartureAirports(result.airports);
          } else {
            setArrivalAirports(result.airports);
          }
        } else if (result.airport_codes && Array.isArray(result.airport_codes)) {
          const fallbackAirports = result.airport_codes.map((code: string) => ({
              code,
            name: "",
            distance_miles: null,
          }));
          if (isDeparture) {
            setDepartureAirports(fallbackAirports);
          } else {
            setArrivalAirports(fallbackAirports);
          }
        }

        // Return the primary (closest) airport code for backward compatibility
        return result.airport_code || null;
      }

      return null;
    } catch (error) {
      console.error(`Error fetching ${isDeparture ? "departure" : "arrival"} airport code:`, error);
      return null;
    }
  };

  // Load conversation history. In explore mode we still persist per-trip chat,
  // but we don't inject the form-focused welcome prompt.
  useEffect(() => {
    const loadHistory = async () => {
      const token = getAuthToken();
      if (!token) {
        if (planningMode === "explore") {
          setMessages([]);
        } else {
        setMessages([
          {
            role: "assistant",
            content:
                "Hi! I'm your travel planning assistant. Fill out the above questions so we can start planning your trip!",
            timestamp: formatTime(),
          },
        ]);
      }
        setIsLoadingHistory(false);
        return;
      }

      try {
        const url = tripId
          ? getApiUrl(`api/chat/history?tripId=${tripId}`)
          : getApiUrl("api/chat/history");

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const historyMessages: Message[] = result.messages.map(
            (msg: { role: string; content: string; created_at?: string }) => ({
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : formatTime(),
            })
          );

          if (historyMessages.length === 0) {
            if (planningMode === "explore") {
              // Start with a blank canvas; the first user message + LLM reply
              // will kick off the destination exploration.
              setMessages([]);
            } else {
            setMessages([
              {
                role: "assistant",
                content:
                    "Hi! I'm your travel planning assistant. Fill out the above questions so we can start planning your trip!",
                timestamp: formatTime(),
              },
            ]);
            }
          } else {
            setMessages(historyMessages);
          }
        } else {
          if (planningMode === "explore") {
            setMessages([]);
        } else {
          setMessages([
            {
              role: "assistant",
              content:
                  "Hi! I'm your travel planning assistant. Fill out the above questions so we can start planning your trip!",
              timestamp: formatTime(),
            },
          ]);
          }
        }
      } catch (error) {
        console.error("Error loading conversation history:", error);
        if (planningMode === "explore") {
          setMessages([]);
        } else {
        setMessages([
          {
            role: "assistant",
            content:
                "Hi! I'm your travel planning assistant. Fill out the above questions so we can start planning your trip!",
            timestamp: formatTime(),
          },
        ]);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, planningMode]);

  // Load persisted data (itinerary, flights, hotels) when component mounts or tripId changes
  useEffect(() => {
    const loadPersistedData = async () => {
      if (!tripId || isLoadingHistory) return;

      const token = getAuthToken();
      if (!token) return;

      try {
        setFinalItinerary(null);
        // Load trip to get destination
        const tripResponse = await fetch(getApiUrl(`api/trips/${tripId}`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const tripResult = await tripResponse.json();
        if (tripResponse.ok && tripResult.success && tripResult.trip?.destination) {
          setTripDestination(tripResult.trip.destination);
        }

        // Load itinerary to restore trip sketch state
        await loadItineraryDays(tripId);

        // Check if itinerary exists - if so, user has confirmed trip sketch
        const itineraryResponse = await fetch(getApiUrl(`api/trips/${tripId}/itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const itineraryResult = await itineraryResponse.json();
        if (itineraryResponse.ok && itineraryResult.success && Array.isArray(itineraryResult.days) && itineraryResult.days.length > 0) {
          setHasConfirmedTripSketch(true);
          // Generate summary from days if needed
          if (itineraryResult.days.length > 0) {
            const summary = `Your ${itineraryResult.days.length}-day trip itinerary has been generated.`;
            setItinerarySummary(summary);
          }
        }

        // Load flights
        const flightsResponse = await fetch(getApiUrl(`api/flights/trip/${tripId}`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const flightsResult = await flightsResponse.json();
        if (flightsResponse.ok && flightsResult.success) {
          // Restore airport codes if available
          if (flightsResult.departure_id) {
            console.log("Restoring departure airport code:", flightsResult.departure_id);
            setDepartureId(flightsResult.departure_id);
          }
          if (flightsResult.arrival_id) {
            console.log("Restoring arrival airport code:", flightsResult.arrival_id);
            setArrivalId(flightsResult.arrival_id);
          }

          // Restore outbound flights
          if (flightsResult.outbound_flights && flightsResult.outbound_flights.length > 0) {
            console.log("Restoring outbound flights from database:", flightsResult.outbound_flights);
            // Log departure_token for each flight to debug
            flightsResult.outbound_flights.forEach((flight: any, idx: number) => {
              console.log(`Flight ${idx} departure_token:`, flight?.departure_token, "Type:", typeof flight?.departure_token);
            });

            // Group flights by departure airport code
            const flightsByAirportMap: Record<string, any[]> = {};
            flightsResult.outbound_flights.forEach((flight: any) => {
              // Try to get departure airport code from flight data
              const departureCode = flight.departure_airport_code ||
                                   flight.flights?.[0]?.departure_airport?.id ||
                                   flightsResult.departure_id ||
                                   'UNKNOWN';
              if (!flightsByAirportMap[departureCode]) {
                flightsByAirportMap[departureCode] = [];
              }
              flightsByAirportMap[departureCode].push(flight);
            });

            setFlightsByAirport(flightsByAirportMap);
            setBestFlights(flightsResult.outbound_flights);
            setOutboundFlightIds(flightsResult.outbound_flight_ids || {});

            // Restore selected outbound flight
            if (flightsResult.selected_outbound_index !== null && flightsResult.selected_outbound_index !== undefined) {
              setSelectedOutboundIndex(flightsResult.selected_outbound_index);
              const selectedOutbound = flightsResult.outbound_flights[flightsResult.selected_outbound_index];
              console.log("Restored selected outbound flight:", selectedOutbound);
              console.log("Departure token in restored flight:", selectedOutbound?.departure_token);
              console.log("Button should be enabled:", !!selectedOutbound?.departure_token && returnFlights.length === 0);
            }

            // If there's a selected outbound flight, load its return flights ONLY if a return flight was actually selected
            // Otherwise, clear return flights so the "Choose return flight" button is visible
            if (flightsResult.selected_outbound_index !== null && flightsResult.selected_outbound_index !== undefined) {
              const selectedOutbound = flightsResult.outbound_flights[flightsResult.selected_outbound_index];
              if (selectedOutbound?.departure_token) {
                // Only restore return flights if a return flight was actually selected
                // This ensures the "Choose return flight" button is visible if user wants to select/change return flights
                if (flightsResult.selected_return_index !== null && flightsResult.selected_return_index !== undefined) {
                  const returnFlightsForDeparture = flightsResult.return_flights || [];
                  if (returnFlightsForDeparture.length > 0) {
                    console.log("Restoring return flights from database:", returnFlightsForDeparture.length, "flights");
                    setReturnFlights(returnFlightsForDeparture);
                    setReturnFlightIds(flightsResult.return_flight_ids || {});
                    setSelectedReturnIndex(flightsResult.selected_return_index);
                  } else {
                    // Return flight was selected but data not found - clear state
                    console.log("Return flight was selected but data not found in database");
                    setReturnFlights([]);
                    setSelectedReturnIndex(null);
                  }
                } else {
                  // No return flight selected - clear return flights so button is visible
                  console.log("No return flight selected - clearing return flights to show button");
                  setReturnFlights([]);
                  setSelectedReturnIndex(null);
                }
              } else {
                console.warn("Selected outbound flight does not have departure_token:", selectedOutbound);
                // Clear return flights if departure_token is missing
                setReturnFlights([]);
                setSelectedReturnIndex(null);
              }
            } else {
              // No outbound flight selected - clear return flights
              setReturnFlights([]);
              setSelectedReturnIndex(null);
            }

            // If flights exist, user has confirmed trip sketch and started flights phase
            setHasConfirmedTripSketch(true);
            if (flightsResult.selected_outbound_index !== null || flightsResult.selected_return_index !== null) {
              setHasConfirmedFlights(true);
              setHasStartedHotels(true);
            } else if (flightsResult.outbound_flights.length > 0) {
              // Flights were fetched but not selected yet
              setHasConfirmedTripSketch(true);
            }
          }
        }

        // Load hotels
        const hotelsResponse = await fetch(getApiUrl(`api/hotels/trip/${tripId}`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const hotelsResult = await hotelsResponse.json();
        if (hotelsResponse.ok && hotelsResult.success) {
          // Restore hotels
          if (hotelsResult.hotels && hotelsResult.hotels.length > 0) {
            console.log("Restoring hotels from database:", hotelsResult.hotels);
            setHotels(hotelsResult.hotels);
            setHotelIds(hotelsResult.hotel_ids || {});

            // Restore selected hotel
            if (hotelsResult.selected_hotel_index !== null && hotelsResult.selected_hotel_index !== undefined) {
              setSelectedHotelIndex(hotelsResult.selected_hotel_index);
            }

            // If hotels exist, user has started hotels phase
            setHasStartedHotels(true);

            // If hotel is selected, user has confirmed hotels
            // For multi-city trips, check has_selected_hotels or selected_hotel_indices
            const hasSelectedHotels = hotelsResult.has_selected_hotels || 
              hotelsResult.selected_hotel_index !== null ||
              (hotelsResult.selected_hotel_indices && hotelsResult.selected_hotel_indices.length > 0);
            
            if (hasSelectedHotels) {
              setHasConfirmedHotels(true);
              const hasFinalItinerary = await loadFinalItinerary(tripId);
              if (!hasFinalItinerary) {
                // Automatically generate final itinerary when hotels are confirmed
                generateFinalItinerary();
              }
            }
          }
        }
      } catch (error) {
        console.error("Error loading persisted data:", error);
        // Don't show error to user, just log it
      }
    };

    loadPersistedData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, isLoadingHistory, loadFinalItinerary, loadItineraryDays]);

  // In "help me choose" mode, automatically send the initial message from
  // the dashboard as the first user message, and show the LLM's response,
  // so the user lands in an active conversation about destinations.
  useEffect(() => {
    if (
      planningMode === "explore" &&
      initialMessage &&
      !hasSentInitialExploreMessage &&
      !isLoadingHistory
    ) {
      setHasSentInitialExploreMessage(true);
      sendMessage(initialMessage);
    }
    // We intentionally omit sendMessage from deps to avoid resending when
    // its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningMode, tripId, initialMessage, hasSentInitialExploreMessage, isLoadingHistory]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Helper function to extract arrival date from selected outbound flight
  const getFlightArrivalDate = (): Date | null => {
    if (selectedOutboundIndex === null || !bestFlights[selectedOutboundIndex]) {
      return null;
    }

    const selectedFlight = bestFlights[selectedOutboundIndex];
    const flightLegs = selectedFlight?.flights || [];
    
    if (flightLegs.length === 0) {
      return null;
    }

    const lastLeg = flightLegs[flightLegs.length - 1];
    // Try different possible structures for arrival time/date
    const arrivalTime = lastLeg.arrival_airport?.time || 
                       lastLeg.arrival_airport?.date ||
                       lastLeg.arrival?.time || 
                       lastLeg.arrival?.date ||
                       lastLeg.arrival_time ||
                       lastLeg.arrival_date ||
                       null;

    if (!arrivalTime) {
      return null;
    }

    // Parse arrival time/date
    const parsedDate = new Date(arrivalTime);
    
    if (isNaN(parsedDate.getTime())) {
      // Try to extract date from string format like "2024-03-05 14:30"
      const dateMatch = String(arrivalTime).match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        return new Date(dateMatch[1]);
      }
      return null;
    }

    // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth();
    const day = parsedDate.getDate();
    return new Date(year, month, day);
  };

  // Derived helpers for dates / num_days validation and UX
  const { dateError, computedNumDays } = (() => {
    let localError: string | null = null;
    let localNumDays: number | null = null;

    // First, try to get start date from flight arrival
    const flightArrivalDate = getFlightArrivalDate();
    const startDate = flightArrivalDate 
      ? flightArrivalDate 
      : (tripPreferences?.start_date ? new Date(tripPreferences.start_date) : null);

    if (startDate && tripPreferences?.end_date) {
      const end = new Date(tripPreferences.end_date);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(end.getTime())) {
        localError = "Please enter valid dates.";
      } else if (end < startDate) {
        localError = "End date must be on or after the flight arrival date.";
      } else {
        const diffMs = end.getTime() - startDate.getTime();
        localNumDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      }
    } else if (tripPreferences?.num_days) {
      // Fallback to num_days if dates aren't available
      localNumDays = tripPreferences.num_days;
    }

    return { dateError: localError, computedNumDays: localNumDays };
  })();

  // Initialize manualCityDaysAllocation when entering multi-city planning tab
  // Re-initialize when flight is selected (so it uses flight arrival date for calculation)
  useEffect(() => {
    if (activeTab === "multi-city" && orderedCities.length > 1) {
      const totalDays = computedNumDays || tripPreferences?.num_days || 0;
      if (totalDays > 0) {
        // Initialize if empty, or reset if flight was just selected (to recalculate with flight arrival date)
        const currentTotal = Object.values(manualCityDaysAllocation).reduce((sum, days) => sum + days, 0);
        const shouldInitialize = Object.keys(manualCityDaysAllocation).length === 0 || 
                                 (currentTotal === 0 && selectedOutboundIndex !== null);
        
        if (shouldInitialize) {
          const daysPerCity = Math.floor(totalDays / orderedCities.length);
          const remainder = totalDays % orderedCities.length;
          const initial: Record<string, number> = {};
          orderedCities.forEach((city, index) => {
            initial[city] = daysPerCity + (index < remainder ? 1 : 0);
          });
          setManualCityDaysAllocation(initial);
        }
      }
    }
  }, [activeTab, orderedCities, computedNumDays, tripPreferences?.num_days, selectedOutboundIndex, manualCityDaysAllocation]);

  const allActivitiesAnswered =
    activities.length > 0 && activities.every((a) => a.preference !== "pending");
  const hasAnyLikedActivity = activities.some((a) => a.preference === "liked");

  return (
    <div
      className={`flex flex-col h-full bg-gradient-to-b from-yellow-50 via-background to-yellow-50 ${className}`}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-blue-100 bg-white/90 backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Trip Planner</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-700 hover:bg-blue-100 hover:text-slate-900"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Explore Mode: Full-page conversation for destination discovery */}
      {planningMode === "explore" && !hasLockedDestination && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="max-w-2xl mx-auto space-y-4">
              {isLoadingHistory && (
                <div className="flex justify-center py-8">
                  <p className="text-sm text-muted-foreground">Loading conversation...</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-md rounded-lg px-4 py-3 shadow-sm ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 shadow-lg"
                        : "bg-white border border-blue-200 text-slate-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words leading-relaxed text-sm">
                      {message.content}
                    </div>
                    <p
                      className={`text-xs mt-2 ${
                        message.role === "user"
                          ? "text-teal-100"
                          : "text-muted-foreground"
                      }`}
                    >
                      {message.timestamp}
                    </p>
                  </div>
                </div>
              ))}
              {isCreatingTrip && (
                <div className="flex justify-start">
                  <div className="bg-white border border-blue-200 text-slate-900 rounded-lg px-4 py-3 shadow-sm text-sm">
                    <p>Creating your trip...</p>
                  </div>
                </div>
              )}
              {isLoading && !isCreatingTrip && (
                <div className="flex justify-start">
                  <div className="bg-white border border-blue-200 text-slate-900 rounded-lg px-4 py-3 shadow-sm text-sm">
                    <p>Thinking...</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area for explore mode */}
          <div className="border-t border-blue-200 bg-white/95 px-4 py-4">
            <div className="max-w-2xl mx-auto flex gap-3">
              <Input
                type="text"
                placeholder="What kind of trip are you thinking about? Tell me about your destination, vibe, dates, or anything else..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1 h-12 text-sm"
              />
              <Button
                type="button"
                onClick={() => sendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                className="h-12 px-6 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                id="chat-send-button"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Structured trip preferences - only for draft trips */}
      {tripId && tripStatus === "draft" && (planningMode === "known" || hasLockedDestination) && (
        <div className="px-4 pt-4">
          <Card className="border-blue-100 bg-white/90 backdrop-blur text-slate-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Phase 1: Trip preferences for this itinerary
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                These answers help tailor a day-by-day plan. They start from your profile
                defaults, but you can tweak them for this specific trip.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-xs sm:text-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-xs">Trip dates</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={tripPreferences?.start_date ?? ""}
                      onChange={(e) => handlePreferenceChange("start_date", e.target.value || null)}
                      className="h-8 bg-white border-blue-200 text-xs"
                    />
                    <Input
                      type="date"
                      value={tripPreferences?.end_date ?? ""}
                      onChange={(e) => handlePreferenceChange("end_date", e.target.value || null)}
                      className="h-8 bg-white border-blue-200 text-xs"
                    />
                  </div>
                  {dateError && (
                    <p className="mt-1 text-[11px] text-rose-400">{dateError}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-xs">Rough number of days</Label>
                  <Input
                    type="number"
                    min={1}
                    max={21}
                    value={
                      computedNumDays !== null
                        ? computedNumDays
                        : tripPreferences?.num_days ?? ""
                    }
                    onChange={(e) =>
                      handlePreferenceChange(
                        "num_days",
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    disabled={computedNumDays !== null}
                    className="h-8 bg-white border-blue-200 text-xs"
                    placeholder={computedNumDays !== null ? "" : "ex. 4"}
                  />
                  {computedNumDays !== null && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Automatically calculated from your start and end dates.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-xs">Total trip budget (USD)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={tripPreferences?.min_budget ?? ""}
                      onChange={(e) =>
                        handlePreferenceChange(
                          "min_budget",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-8 bg-white border-blue-200 text-xs"
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={tripPreferences?.max_budget ?? ""}
                      onChange={(e) =>
                        handlePreferenceChange(
                          "max_budget",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      className="h-8 bg-white border-blue-200 text-xs"
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">How full should each day feel?</Label>
                  <RadioGroup
                    value={tripPreferences?.pace ?? ""}
                    onValueChange={(value) =>
                      handlePreferenceChange("pace", value as TripPreferences["pace"])
                    }
                    className="grid grid-cols-1 gap-2"
                  >
                    <label className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs cursor-pointer hover:border-blue-200">
                      <RadioGroupItem value="slow" />
                      <span>Slow & relaxing</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs cursor-pointer hover:border-blue-200">
                      <RadioGroupItem value="balanced" />
                      <span>Balanced mix</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs cursor-pointer hover:border-blue-200">
                      <RadioGroupItem value="packed" />
                      <span>Packed with activities</span>
                    </label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">Who is this trip for?</Label>
                  <Select
                    value={tripPreferences?.group_type ?? ""}
                    onValueChange={(value) => handlePreferenceChange("group_type", value)}
                  >
                    <SelectTrigger className="h-8 bg-white border-blue-200 text-xs">
                      <SelectValue placeholder="Select group type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-blue-200 text-xs">
                      <SelectItem
                        value="solo"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Solo
                      </SelectItem>
                      <SelectItem
                        value="couple"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Couple
                      </SelectItem>
                      <SelectItem
                        value="family"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Family
                      </SelectItem>
                      <SelectItem
                        value="friends"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Friends
                      </SelectItem>
                      <SelectItem
                        value="girls_trip"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Girls' trip
                      </SelectItem>
                      <SelectItem
                        value="work"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Work / team trip
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Label className="text-slate-800 text-xs mt-2">Preferred stay</Label>
                  <Select
                    value={tripPreferences?.accommodation_type ?? ""}
                    onValueChange={(value) => handlePreferenceChange("accommodation_type", value)}
                  >
                    <SelectTrigger className="h-8 bg-white border-blue-200 text-xs">
                      <SelectValue placeholder="Hotel, Airbnb, hostel..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-blue-200 text-xs">
                      <SelectItem
                        value="hotel"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Hotel
                      </SelectItem>
                      <SelectItem
                        value="airbnb"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Apartment / Airbnb
                      </SelectItem>
                      <SelectItem
                        value="hostel"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Hostel
                      </SelectItem>
                      <SelectItem
                        value="boutique"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Boutique stay
                      </SelectItem>
                      <SelectItem
                        value="no_preference"
                        className="text-slate-900 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        No strong preference
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">
                    Safety notes (optional)
                  </Label>
                  <Textarea
                    value={tripPreferences?.safety_notes ?? ""}
                    onChange={(e) => handlePreferenceChange("safety_notes", e.target.value)}
                    className="min-h-[60px] bg-white border-blue-200 text-xs resize-none"
                    placeholder="ex. Safe for a group of girls, well-lit areas, avoid very late nights..."
                  />
                  <Label className="text-slate-800 text-xs mt-2">
                    Accessibility notes (optional)
                  </Label>
                  <Textarea
                    value={tripPreferences?.accessibility_notes ?? ""}
                    onChange={(e) => handlePreferenceChange("accessibility_notes", e.target.value)}
                    className="min-h-[50px] bg-white border-blue-200 text-xs resize-none"
                    placeholder="ex. Limited walking, step-free access, stroller-friendly..."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">
                    What do you want more of on this trip?
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {[
                      "outdoors",
                      "relaxing",
                      "cultural",
                      "music",
                      "arts",
                      "museums",
                      "food",
                      "nightlife",
                      "shopping",
                      "nature",
                      "adventure",
                    ].map((cat) => (
                      <label key={cat} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={tripPreferences?.activity_categories?.includes(
                            cat as ActivityCategory
                          )}
                          onCheckedChange={() =>
                            toggleCategory("activity_categories", cat as ActivityCategory)
                          }
                          className="h-3.5 w-3.5 border-blue-200 data-[state=checked]:bg-emerald-400 data-[state=checked]:border-emerald-400"
                        />
                        <span className="capitalize text-slate-800">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">
                    Anything you'd like to avoid?
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {[
                      "outdoors",
                      "relaxing",
                      "cultural",
                      "music",
                      "arts",
                      "museums",
                      "food",
                      "nightlife",
                      "shopping",
                      "nature",
                      "adventure",
                    ].map((cat) => (
                      <label key={cat} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={tripPreferences?.avoid_activity_categories?.includes(
                            cat as ActivityCategory
                          )}
                          onCheckedChange={() =>
                            toggleCategory("avoid_activity_categories", cat as ActivityCategory)
                          }
                          className="h-3.5 w-3.5 border-blue-200 data-[state=checked]:bg-rose-400 data-[state=checked]:border-rose-400"
                        />
                        <span className="capitalize text-slate-800">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-800 text-xs">
                  Any other vibes, constraints, or must-dos for this trip?
                </Label>
                <Textarea
                  value={tripPreferences?.custom_requests ?? ""}
                  onChange={(e) => handlePreferenceChange("custom_requests", e.target.value)}
                  className="min-h-[60px] bg-white border-blue-200 text-xs resize-none"
                  placeholder="ex. Rooftop bars with a view, no super early mornings, vegetarian-friendly spots, kid-friendly afternoons..."
                />
              </div>

              <div className="pt-2 border-t border-blue-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-slate-800 text-xs">Pick cities (optional)</Label>
                    <p className="text-[11px] text-slate-500 mt-1">
                      If your destination is a country/region, choose one or more cities to focus the plan on.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-200 bg-white text-slate-900 hover:bg-blue-50"
                    onClick={fetchCitySuggestions}
                    disabled={isLoadingCitySuggestions || !tripDestination}
                    type="button"
                  >
                    {isLoadingCitySuggestions ? "Loading..." : "Pick cities"}
                  </Button>
                </div>

                {citySuggestionsError && (
                  <p className="mt-2 text-[11px] text-rose-500">{citySuggestionsError}</p>
                )}

                {citySuggestionsMeta?.destination_type && tripDestination && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Destination: <span className="text-slate-700">{tripDestination}</span>{" "}
                    {citySuggestionsMeta.destination_type !== "unknown" && (
                      <span className="text-slate-400">({citySuggestionsMeta.destination_type})</span>
                    )}
                  </p>
                )}

                {citySuggestions.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {citySuggestions.map((city) => (
                      <label
                        key={city}
                        className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs cursor-pointer hover:border-blue-300"
                      >
                        <Checkbox
                          checked={!!tripPreferences?.selected_cities?.some(
                            (c) => c.toLowerCase() === city.toLowerCase()
                          )}
                          onCheckedChange={() => toggleSelectedCity(city)}
                          className="h-3.5 w-3.5 border-blue-200 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                        />
                        <span className="text-slate-800">{city}</span>
                      </label>
                    ))}
                  </div>
                )}

                {tripPreferences?.selected_cities?.length ? (
                  <p className="mt-2 text-[11px] text-slate-600">
                    Selected: <span className="text-slate-800">{tripPreferences.selected_cities.join(", ")}</span>
                  </p>
                ) : null}
              </div>

              {/* Action buttons at the bottom */}
              <div className="pt-4 border-t border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-slate-600" title="Uses Greece activities (Athens, Mykonos, Santorini) instead of Google Search API">
                    Use test activities (Greece)
                  </Label>
                  <Switch
                    checked={useTestActivities}
                    onCheckedChange={(val) => setUseTestActivities(val)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-200 bg-white text-slate-900 hover:bg-blue-50"
                    onClick={savePreferences}
                    disabled={isSavingPreferences || !tripPreferences}
                  >
                    {isSavingPreferences ? "Saving..." : "Save preferences"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-yellow-400 text-slate-900 font-semibold hover:bg-yellow-300 disabled:opacity-60"
                    onClick={async () => {
                      if (!tripId) return;

                      try {
                        setIsSavingPreferences(true);

                        // Save preferences first so they're available for later steps
                        if (tripPreferences) {
                          await savePreferences();
                        }

                        // Set hasStartedPlanning to show tabs
                        setHasStartedPlanning(true);
                        // Set hasConfirmedTripSketch to allow flights section to show
                        setHasConfirmedTripSketch(true);
                        // Navigate to flights tab - activities will be generated when moving from hotels to activities
                        setActiveTab("flights");
                      } catch (error) {
                        console.error("Error starting planning:", error);
                      } finally {
                        setIsSavingPreferences(false);
                      }
                    }}
                    disabled={isSavingPreferences || !tripPreferences}
                  >
                    {isSavingPreferences ? "Saving..." : "Start planning"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Destination lock-in UI for "help me choose" mode before a destination is chosen */}
      {planningMode === "explore" && !hasLockedDestination && (
        <div className="px-4 pt-3">
          <Card className="border-blue-100 bg-white/90 backdrop-blur text-slate-900">
            <CardContent className="py-3 space-y-2 text-xs sm:text-sm">
              <p className="text-slate-600">
                Once you&apos;ve chatted with me and decided on a destination, lock it in here to
                start the detailed planning form.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  value={lockDestination}
                  onChange={(e) => setLockDestination(e.target.value)}
                  placeholder="Where did you decide to go?"
                  className="h-8 bg-white border-blue-200 text-xs"
                  disabled={isLockingDestination}
                />
                <Button
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
                  disabled={!lockDestination.trim() || isLockingDestination}
                  onClick={async () => {
                    const destination = lockDestination.trim();
                    if (!destination) return;
                    try {
                      setIsLockingDestination(true);
                      const token = getAuthToken();
                      if (!token) {
                        console.error("Not authenticated. Please log in.");
                        return;
                      }

                      const payload = {
                        destination,
                        raw_message: destination,
                      };

                      let response: Response;
                      if (tripId) {
                        // Update the existing exploration trip with the chosen destination.
                        response = await fetch(getApiUrl(`api/trips/${tripId}`), {
                          method: "PUT",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify(payload),
                        });
                      } else {
                        // Fallback: create a new trip if for some reason we don't have one yet.
                        response = await fetch(getApiUrl("api/trips"), {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify(payload),
                        });
                      }

                      const result = await response.json();
                      if (response.ok && result.success) {
                        setLockDestination("");
                        setHasLockedDestination(true);

                        const effectiveTripId =
                          tripId ?? (result.trip && result.trip.trip_id ? result.trip.trip_id : null);

                        if (effectiveTripId && onTripCreated) {
                          onTripCreated(effectiveTripId);
                        }
                      } else {
                        console.error(
                          "Failed to lock destination on trip:",
                          result && result.message
                        );
                      }
                    } catch (error) {
                      console.error("Error locking in destination:", error);
                    } finally {
                      setIsLockingDestination(false);
                    }
                  }}
                >
                  {isLockingDestination ? "Locking in..." : "Lock in & open form"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Main planning scroll area (tabs + phases) */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {tripId && hasStartedPlanning && (
            <div className="mt-6 mb-3 flex items-center justify-center">
              <Tabs value={activeTab} onValueChange={(v) => {
                // Prevent navigation to tabs that aren't unlocked yet
                const isMultiCity = orderedCities.length > 1;
                if (v === "multi-city" && !hasConfirmedFlights) return;
                if (v === "hotels" && !hasConfirmedFlights) return;
                if (v === "hotels" && isMultiCity && !hasConfirmedMultiCityPlanning) return;
                if (v === "activities" && !hasConfirmedHotels) return;
                if (v === "restaurants" && !hasConfirmedActivities) return;
                if (v === "summary" && !hasConfirmedRestaurants) return;
                setActiveTab(v as any);
              }} className="w-full max-w-xl">
                <TabsList className={`grid w-full ${orderedCities.length > 1 ? 'grid-cols-6' : 'grid-cols-5'}`}>
                  <TabsTrigger value="flights" className="text-xs">Flights</TabsTrigger>
                  {orderedCities.length > 1 && (
                    <TabsTrigger value="multi-city" className="text-xs" disabled={!hasConfirmedFlights}>Multi-City</TabsTrigger>
                  )}
                  <TabsTrigger value="hotels" className="text-xs" disabled={!hasConfirmedFlights || (orderedCities.length > 1 && !hasConfirmedMultiCityPlanning)}>Hotels</TabsTrigger>
                  <TabsTrigger value="activities" className="text-xs" disabled={!hasConfirmedHotels}>Activities</TabsTrigger>
                  <TabsTrigger value="restaurants" className="text-xs" disabled={!hasConfirmedActivities}>Restaurants</TabsTrigger>
                  <TabsTrigger value="summary" className="text-xs" disabled={!hasConfirmedRestaurants}>Summary</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          {tripId && hasStartedPlanning && hasConfirmedHotels && activeTab === "activities" && activities.length === 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Phase {orderedCities.length > 1 ? '5' : '4'}: Explore activities
                </p>
                <p className="text-[11px] text-slate-600 mb-4">
                  Generating activities based on your preferences...
                </p>
                {isGeneratingActivities && (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <p className="text-xs text-slate-500">
                      {useTestActivities ? "Loading test activities..." : "Finding activities..."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {tripId && hasStartedPlanning && hasConfirmedHotels && activities.length > 0 && activeTab === "activities" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Phase {orderedCities.length > 1 ? '5' : '4'}: Explore activities
                </p>
                <p className="text-[11px] text-slate-600 mb-4">
                  Swipe right to like, left to pass, or use the buttons below. Swipe up for maybe.
                </p>

                {/* Swipe Card Stack */}
                <div className="relative h-[600px] w-full flex items-center justify-center">
                  {activities
                    .filter((a) => a.preference === "pending")
                    .slice(0, 3)
                    .map((activity, idx) => {
                      const actualIndex = activities
                        .filter((a) => a.preference === "pending")
                        .indexOf(activity);
                      return (
                        <ActivitySwipeCard
                          key={activity.activity_id}
                          activity={activity as any}
                          index={idx}
                          total={Math.min(3, activities.filter((a) => a.preference === "pending").length)}
                          onSwipe={(direction) => {
                            if (direction === "left") {
                              updateActivityPreference(activity.activity_id, "disliked");
                            } else if (direction === "right") {
                              updateActivityPreference(activity.activity_id, "liked");
                            } else if (direction === "up") {
                              updateActivityPreference(activity.activity_id, "maybe");
                            }
                            // Auto-advance to next card after a short delay
                            setTimeout(() => {
                              setCurrentActivityIndex((prev) => prev + 1);
                            }, 300);
                          }}
                          onLike={() => {
                            updateActivityPreference(activity.activity_id, "liked");
                            setTimeout(() => {
                              setCurrentActivityIndex((prev) => prev + 1);
                            }, 300);
                          }}
                          onPass={() => {
                            updateActivityPreference(activity.activity_id, "disliked");
                            setTimeout(() => {
                              setCurrentActivityIndex((prev) => prev + 1);
                            }, 300);
                          }}
                          onMaybe={() => {
                            updateActivityPreference(activity.activity_id, "maybe");
                            setTimeout(() => {
                              setCurrentActivityIndex((prev) => prev + 1);
                            }, 300);
                          }}
                          isUpdating={isUpdatingActivityPreference[activity.activity_id]}
                        />
                      );
                    })}

                  {/* Empty state when all activities are reviewed */}
                  {activities.filter((a) => a.preference === "pending").length === 0 && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-600 mb-2">
                          All activities reviewed! 🎉
                        </p>
                        <p className="text-xs text-slate-500">
                          You've reacted to all {activities.length} activities.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress indicator */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    {activities.filter((a) => a.preference === "pending").length === 0
                      ? "All done!"
                      : `${activities.filter((a) => a.preference === "pending").length} remaining`}
                  </p>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                    disabled={!allActivitiesAnswered}
                    onClick={() => {
                      setHasConfirmedActivities(true);
                      setActiveTab("restaurants");
                    }}
                  >
                    Done with activities
                  </Button>
                </div>

                {/* Reviewed activities summary */}
                {activities.filter((a) => a.preference !== "pending").length > 0 && (
                  <div className="mt-4 border-t border-blue-100 pt-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      Your reviewed activities
                    </p>
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {activities
                        .filter((a) => a.preference !== "pending")
                        .map((a) => (
                          <div
                            key={a.activity_id}
                            className="flex items-center justify-between rounded-md border border-blue-100 bg-blue-50/60 px-3 py-1.5 text-[11px]"
                          >
                            <div className="truncate">
                              <span className="font-semibold text-slate-900 truncate">
                                {a.name}
                              </span>
                              {a.location && (
                                <span className="text-slate-500 ml-1 truncate">
                                  • {a.location}
                                </span>
                              )}
                            </div>
                            <span
                              className={
                                a.preference === "liked"
                                  ? "text-emerald-500 font-semibold ml-2 flex-shrink-0"
                                  : a.preference === "maybe"
                                  ? "text-amber-500 font-semibold ml-2 flex-shrink-0"
                                  : "text-slate-400 font-semibold ml-2 flex-shrink-0"
                              }
                            >
                              {a.preference === "liked"
                                ? "Liked"
                                : a.preference === "maybe"
                                ? "Maybe"
                                : "Passed"}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {hasStartedPlanning && hasConfirmedActivities && activeTab === "restaurants" && restaurants.length === 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <div className="space-y-6">
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    Restaurant Preferences
                  </p>
                  
                  {/* Number of meals per day */}
                  <div>
                    <Label htmlFor="meals-per-day" className="text-sm font-semibold text-slate-700 mb-2 block">
                      Number of meals per day
                    </Label>
                    <Select
                      value={restaurantFormData.mealsPerDay.toString()}
                      onValueChange={(value) =>
                        setRestaurantFormData((prev) => ({ ...prev, mealsPerDay: parseInt(value) }))
                      }
                    >
                      <SelectTrigger id="meals-per-day" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 meal</SelectItem>
                        <SelectItem value="2">2 meals</SelectItem>
                        <SelectItem value="3">3 meals</SelectItem>
                        <SelectItem value="4">4+ meals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Types of meals */}
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                      Types of meals (select all that apply)
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {["Breakfast", "Brunch", "Lunch", "Dinner", "Cafe", "Dessert", "Late Night"].map((mealType) => (
                        <div key={mealType} className="flex items-center space-x-2">
                          <Checkbox
                            id={`meal-${mealType}`}
                            checked={restaurantFormData.mealTypes.includes(mealType)}
                            onCheckedChange={(checked) => {
                              setRestaurantFormData((prev) => {
                                if (checked) {
                                  return { ...prev, mealTypes: [...prev.mealTypes, mealType] };
                                } else {
                                  return { ...prev, mealTypes: prev.mealTypes.filter((m) => m !== mealType) };
                                }
                              });
                            }}
                          />
                          <Label
                            htmlFor={`meal-${mealType}`}
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            {mealType}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cuisine types */}
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                      Types of cuisines (select all that apply)
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {["Italian", "French", "Japanese", "Chinese", "Mexican", "Thai", "Indian", "Mediterranean", "American", "Spanish", "Greek", "Korean", "Vietnamese", "Middle Eastern", "Caribbean", "Brazilian", "Fusion", "Other"].map((cuisine) => (
                        <div key={cuisine} className="flex items-center space-x-2">
                          <Checkbox
                            id={`cuisine-${cuisine}`}
                            checked={restaurantFormData.cuisineTypes.includes(cuisine)}
                            onCheckedChange={(checked) => {
                              setRestaurantFormData((prev) => {
                                if (checked) {
                                  return { ...prev, cuisineTypes: [...prev.cuisineTypes, cuisine] };
                                } else {
                                  return { ...prev, cuisineTypes: prev.cuisineTypes.filter((c) => c !== cuisine) };
                                }
                              });
                            }}
                          />
                          <Label
                            htmlFor={`cuisine-${cuisine}`}
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            {cuisine}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dietary restrictions */}
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                      Dietary restrictions (select all that apply)
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {["Vegetarian", "Vegan", "Gluten-free", "Halal", "Kosher", "Dairy-free", "Nut-free", "Pescatarian", "Keto", "Paleo"].map((restriction) => (
                        <div key={restriction} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dietary-${restriction}`}
                            checked={restaurantFormData.dietaryRestrictions.includes(restriction)}
                            onCheckedChange={(checked) => {
                              setRestaurantFormData((prev) => {
                                if (checked) {
                                  return { ...prev, dietaryRestrictions: [...prev.dietaryRestrictions, restriction] };
                                } else {
                                  return { ...prev, dietaryRestrictions: prev.dietaryRestrictions.filter((r) => r !== restriction) };
                                }
                              });
                            }}
                          />
                          <Label
                            htmlFor={`dietary-${restriction}`}
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            {restriction}
                          </Label>
                        </div>
                      ))}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="dietary-Other"
                          checked={restaurantFormData.dietaryRestrictions.includes("Other")}
                          onCheckedChange={(checked) => {
                            setRestaurantFormData((prev) => {
                              if (checked) {
                                return { ...prev, dietaryRestrictions: [...prev.dietaryRestrictions, "Other"] };
                              } else {
                                return { ...prev, dietaryRestrictions: prev.dietaryRestrictions.filter((r) => r !== "Other"), otherDietaryRestriction: "" };
                              }
                            });
                          }}
                        />
                        <Label
                          htmlFor="dietary-Other"
                          className="text-xs text-slate-600 cursor-pointer"
                        >
                          Other:
                        </Label>
                      </div>
                    </div>
                    {restaurantFormData.dietaryRestrictions.includes("Other") && (
                      <div className="mt-3">
                        <Input
                          type="text"
                          placeholder="Please specify your dietary restriction"
                          value={restaurantFormData.otherDietaryRestriction}
                          onChange={(e) =>
                            setRestaurantFormData((prev) => ({ ...prev, otherDietaryRestriction: e.target.value }))
                          }
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>

                  {/* Budget / Price range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                        Min price range
                      </Label>
                      <Select
                        value={restaurantFormData.minPriceRange ?? "any"}
                        onValueChange={(v) =>
                          setRestaurantFormData((prev) => ({
                            ...prev,
                            minPriceRange: v === "any" ? null : v,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="$">$ Budget</SelectItem>
                          <SelectItem value="$$">$$ Moderate</SelectItem>
                          <SelectItem value="$$$">$$$ Upscale</SelectItem>
                          <SelectItem value="$$$$">$$$$ Fine dining</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                        Max price range
                      </Label>
                      <Select
                        value={restaurantFormData.maxPriceRange ?? "any"}
                        onValueChange={(v) =>
                          setRestaurantFormData((prev) => ({
                            ...prev,
                            maxPriceRange: v === "any" ? null : v,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="$">$ Budget</SelectItem>
                          <SelectItem value="$$">$$ Moderate</SelectItem>
                          <SelectItem value="$$$">$$$ Upscale</SelectItem>
                          <SelectItem value="$$$$">$$$$ Fine dining</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Test Mode Toggle */}
                  <div className="flex items-center gap-2 pt-2">
                    <Label className="text-[11px] text-slate-600">
                      Use test restaurants (avoids Google API quota)
                    </Label>
                    <Switch
                      checked={useTestRestaurants}
                      onCheckedChange={(val) => setUseTestRestaurants(val)}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <Button
                      onClick={async () => {
                        if (!tripId) {
                          console.error("No tripId available");
                          return;
                        }

                        setIsSavingRestaurantPreferences(true);
                        try {
                          const token = getAuthToken();
                          if (!token) {
                            console.error("No authentication token");
                            return;
                          }

                          // Prepare dietary restrictions - include "Other" text if specified
                          let dietaryRestrictions = [...restaurantFormData.dietaryRestrictions];
                          if (restaurantFormData.dietaryRestrictions.includes("Other") && restaurantFormData.otherDietaryRestriction.trim()) {
                            // Replace "Other" with the actual text
                            const otherIndex = dietaryRestrictions.indexOf("Other");
                            dietaryRestrictions[otherIndex] = restaurantFormData.otherDietaryRestriction.trim();
                          } else if (restaurantFormData.dietaryRestrictions.includes("Other")) {
                            // Remove "Other" if no text provided
                            dietaryRestrictions = dietaryRestrictions.filter(r => r !== "Other");
                          }

                          // Save preferences
                          const saveResponse = await fetch(getApiUrl(`api/trips/${tripId}/restaurant-preferences`), {
                            method: "PUT",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              cuisine_types: restaurantFormData.cuisineTypes,
                              dietary_restrictions: dietaryRestrictions,
                              meals_per_day: restaurantFormData.mealsPerDay,
                              meal_types: restaurantFormData.mealTypes,
                              min_price_range: restaurantFormData.minPriceRange ?? null,
                              max_price_range: restaurantFormData.maxPriceRange ?? null,
                            }),
                          });

                          const saveResult = await saveResponse.json();

                          if (!saveResponse.ok || !saveResult.success) {
                            console.error("Failed to save restaurant preferences:", saveResult.message);
                            return;
                          }

                          // Generate restaurants based on preferences
                          const generateResponse = await fetch(getApiUrl(`api/trips/${tripId}/generate-restaurants`), {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              testMode: useTestRestaurants,
                            }),
                          });

                          const generateResult = await generateResponse.json();

                          console.log("Generate restaurants response:", generateResult);

                          if (generateResponse.ok && generateResult.success) {
                            const restaurantsArray = Array.isArray(generateResult.restaurants) 
                              ? generateResult.restaurants 
                              : [];
                            
                            console.log("Setting restaurants:", restaurantsArray.length, restaurantsArray);
                            
                            setRestaurants(restaurantsArray);
                            setHasStartedRestaurants(true);

                            if (restaurantsArray.length > 0) {
                              // Switch to restaurants tab to show the cards
                              setActiveTab("restaurants");
                              
                              const assistantMessage: Message = {
                                role: "assistant",
                                content: `I found ${restaurantsArray.length} restaurants based on your preferences. Swipe through them below!`,
                                timestamp: formatTime(),
                              };
                              setMessages((prev) => [...prev, assistantMessage]);
                            } else {
                              const assistantMessage: Message = {
                                role: "assistant",
                                content: "I couldn't find restaurants matching your preferences. Try adjusting your preferences and try again.",
                                timestamp: formatTime(),
                              };
                              setMessages((prev) => [...prev, assistantMessage]);
                            }
                          } else {
                            console.error("Failed to generate restaurants:", generateResult);
                            const errorMessage: Message = {
                              role: "assistant",
                              content: `Failed to generate restaurants: ${generateResult.message || "Unknown error"}`,
                              timestamp: formatTime(),
                            };
                            setMessages((prev) => [...prev, errorMessage]);
                          }
                        } catch (error) {
                          console.error("Error saving restaurant preferences:", error);
                        } finally {
                          setIsSavingRestaurantPreferences(false);
                        }
                      }}
                      disabled={isSavingRestaurantPreferences}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      {isSavingRestaurantPreferences
                        ? useTestRestaurants
                          ? "Saving and Loading test restaurants..."
                          : "Saving and Finding Restaurants..."
                        : "Save Preferences & Find Restaurants"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {hasStartedPlanning && hasConfirmedActivities && activeTab === "restaurants" && restaurants.length > 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Phase {orderedCities.length > 1 ? '6' : '5'}: Explore restaurants
                </p>
                <p className="text-[11px] text-slate-600 mb-4">
                  Swipe right to like, left to pass, or use the buttons below. Swipe up for maybe.
                </p>

                {/* Swipe Card Stack */}
                <div className="relative h-[600px] w-full flex items-center justify-center">
                  {restaurants
                    .filter((r) => r.preference === "pending")
                    .slice(0, 3)
                    .map((restaurant, idx) => {
                      return (
                        <RestaurantSwipeCard
                          key={restaurant.restaurant_id}
                          restaurant={restaurant as any}
                          index={idx}
                          total={Math.min(3, restaurants.filter((r) => r.preference === "pending").length)}
                          onSwipe={(direction) => {
                            if (direction === "left") {
                              updateRestaurantPreference(restaurant.restaurant_id, "disliked");
                            } else if (direction === "right") {
                              updateRestaurantPreference(restaurant.restaurant_id, "liked");
                            } else if (direction === "up") {
                              updateRestaurantPreference(restaurant.restaurant_id, "maybe");
                            }
                          }}
                          onLike={() => {
                            updateRestaurantPreference(restaurant.restaurant_id, "liked");
                          }}
                          onPass={() => {
                            updateRestaurantPreference(restaurant.restaurant_id, "disliked");
                          }}
                          onMaybe={() => {
                            updateRestaurantPreference(restaurant.restaurant_id, "maybe");
                          }}
                          isUpdating={isUpdatingRestaurantPreference[restaurant.restaurant_id]}
                        />
                      );
                    })}

                  {/* Empty state when all restaurants are reviewed */}
                  {restaurants.filter((r) => r.preference === "pending").length === 0 && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-600 mb-2">
                          All restaurants reviewed! 🎉
                        </p>
                        <p className="text-xs text-slate-500">
                          You've reacted to all {restaurants.length} restaurants.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress indicator */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    {restaurants.filter((r) => r.preference === "pending").length === 0
                      ? "All done!"
                      : `${restaurants.filter((r) => r.preference === "pending").length} remaining`}
                  </p>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                    disabled={restaurants.filter((r) => r.preference === "pending").length > 0}
                    onClick={() => {
                      setHasConfirmedRestaurants(true);
                      // Navigate to summary or final itinerary
                      setActiveTab("summary");
                    }}
                  >
                    Done with restaurants
                  </Button>
                </div>

                {/* Reviewed restaurants summary */}
                {restaurants.filter((r) => r.preference !== "pending").length > 0 && (
                  <div className="mt-4 border-t border-blue-100 pt-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      Your reviewed restaurants
                    </p>
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {restaurants
                        .filter((r) => r.preference !== "pending")
                        .map((r) => (
                          <div
                            key={r.restaurant_id}
                            className="flex items-center justify-between rounded-md border border-blue-100 bg-blue-50/60 px-3 py-1.5 text-[11px]"
                          >
                            <div className="truncate">
                              <span className="font-semibold text-slate-900 truncate">
                                {r.name}
                              </span>
                              {r.location && (
                                <span className="text-slate-500 ml-1 truncate">
                                  • {r.location}
                                </span>
                              )}
                              {r.cuisine_type && (
                                <span className="text-slate-500 ml-1 truncate">
                                  • {r.cuisine_type}
                                </span>
                              )}
                            </div>
                            <span
                              className={
                                r.preference === "liked"
                                  ? "text-emerald-500 font-semibold ml-2 flex-shrink-0"
                                  : r.preference === "maybe"
                                  ? "text-amber-500 font-semibold ml-2 flex-shrink-0"
                                  : "text-slate-400 font-semibold ml-2 flex-shrink-0"
                              }
                            >
                              {r.preference === "liked"
                                ? "Liked"
                                : r.preference === "maybe"
                                ? "Maybe"
                                : "Passed"}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {hasStartedPlanning && itinerarySummary && activeTab === "summary" && (
            <div className="flex justify-start">
              <div className="bg-white border border-emerald-500/60 text-slate-900 rounded-lg px-4 py-3 shadow-sm max-w-[75%]">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {itinerarySummary}
                </p>
              </div>
            </div>
          )}
          {hasStartedPlanning && itineraryDays.length > 0 && activeTab === "summary" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Phase {orderedCities.length > 1 ? '7' : '6'}: Day-by-day trip sketch
                </p>
                {(() => {
                  const maxIndex = itineraryDays.length - 1;
                  const currentIndex = Math.min(itineraryCarouselIndex, maxIndex);
                  const day = itineraryDays[currentIndex];
                  const dateLabel = day.date
                    ? (() => {
                        const localDate = parseLocalDate(day.date);
                        return localDate
                          ? localDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : null;
                      })()
                    : null;

                  return (
                    <>
                      <div className="rounded-lg bg-white text-slate-900 p-3 shadow-sm space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              Day {day.day_number}
                              {dateLabel ? ` • ${dateLabel}` : ""}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Sketch {currentIndex + 1} of {itineraryDays.length}
                          </span>
                        </div>
                        {day.summary && (
                          <p className="text-xs whitespace-pre-wrap">{day.summary}</p>
                        )}
                        {Array.isArray(day.activities) && day.activities.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Planned activities
                            </p>
                            <ul className="space-y-1">
                              {day.activities.map((act, idx) => (
                                <li key={idx} className="text-xs text-slate-800">
                                  <span className="font-medium">
                                    {act.name || "Activity"}
                                  </span>
                                  {act.location && ` • ${act.location}`}
                                  {act.duration && ` • ${act.duration}`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-blue-200 text-slate-900 bg-white hover:bg-blue-50 disabled:opacity-40"
                          disabled={currentIndex === 0}
                          onClick={() =>
                            setItineraryCarouselIndex((prev) =>
                              Math.max(0, Math.min(maxIndex, prev - 1))
                            )
                          }
                        >
                          ‹ Previous
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-blue-200 text-slate-900 bg-white hover:bg-blue-50 disabled:opacity-40"
                          disabled={currentIndex === maxIndex}
                          onClick={() =>
                            setItineraryCarouselIndex((prev) =>
                              Math.max(0, Math.min(maxIndex, prev + 1))
                            )
                          }
                        >
                          Next ›
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {hasStartedPlanning && hasConfirmedTripSketch && activeTab === "flights" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Phase 2: Plan your flights
                </p>
                <p className="text-[11px] text-slate-500 mb-2">
                  Let&apos;s book round trip flights. For multi-city trips, you&apos;ll book flights between cities next.
                </p>

                {/* City Ordering UI */}
                <div className="space-y-2 pb-3 border-b border-blue-200">
                  <Label className="text-slate-800 text-xs">Order your cities</Label>
                  <p className="text-[11px] text-slate-500">
                    Arrange the cities you want to visit in order. You can visit the same city multiple times.
                  </p>
                  
                  {orderedCities.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {orderedCities.map((city, index) => (
                        <div
                          key={`${city}-${index}`}
                          className="flex items-center gap-2 p-2 rounded border border-blue-200 bg-white hover:border-blue-300"
                        >
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-blue-100 disabled:opacity-30"
                              disabled={index === 0}
                              onClick={() => {
                                const newCities = [...orderedCities];
                                [newCities[index - 1], newCities[index]] = [newCities[index], newCities[index - 1]];
                                setOrderedCities(newCities);
                              }}
                            >
                              <ChevronUp className="h-3 w-3 text-slate-600" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-blue-100 disabled:opacity-30"
                              disabled={index === orderedCities.length - 1}
                              onClick={() => {
                                const newCities = [...orderedCities];
                                [newCities[index], newCities[index + 1]] = [newCities[index + 1], newCities[index]];
                                setOrderedCities(newCities);
                              }}
                            >
                              <ChevronDown className="h-3 w-3 text-slate-600" />
                            </Button>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-700 w-5 text-center">
                              {index + 1}
                            </span>
                            <span className="text-xs text-slate-900 flex-1">{city}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-rose-100 text-rose-500"
                            onClick={() => {
                              setOrderedCities(orderedCities.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <Input
                      type="text"
                      value={newCityInput}
                      onChange={(e) => setNewCityInput(e.target.value)}
                      placeholder="Add a city..."
                      className="h-8 bg-white border-blue-200 text-xs text-slate-900 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newCityInput.trim()) {
                          setOrderedCities([...orderedCities, newCityInput.trim()]);
                          setNewCityInput("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                      disabled={!newCityInput.trim()}
                      onClick={() => {
                        if (newCityInput.trim()) {
                          setOrderedCities([...orderedCities, newCityInput.trim()]);
                          setNewCityInput("");
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>

                  {orderedCities.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic mt-1">
                      No cities added yet. Add cities to plan your multi-city trip.
                    </p>
                  )}

                  {citySuggestions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[11px] text-slate-600 font-semibold mb-1.5">Quick add from suggestions:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {citySuggestions.map((city) => (
                          <Button
                            key={city}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px] border-blue-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300"
                            onClick={() => {
                              if (!orderedCities.includes(city)) {
                                setOrderedCities([...orderedCities, city]);
                              }
                            }}
                          >
                            <Plus className="h-2.5 w-2.5 mr-1" />
                            {city}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Departure Location */}
                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">Departure location (your home town)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={departureLocation}
                      onChange={(e) => setDepartureLocation(e.target.value)}
                      placeholder="e.g., New York, NY or Austin, TX"
                      className="h-8 bg-white border-blue-200 text-xs text-slate-900"
                      disabled={isFetchingDepartureCode || !!departureId}
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                      disabled={!departureLocation.trim() || isFetchingDepartureCode || !!departureId}
                      onClick={async () => {
                        setIsFetchingDepartureCode(true);
                        const code = await getAirportCode(departureLocation.trim(), true);
                        if (code) {
                          setDepartureId(code);
                        } else {
                          // Show error message
                          const errorMessage: Message = {
                            role: "assistant",
                            content: "I couldn't find an airport code for that location. Please try a more specific location (e.g., 'New York, NY' or 'Austin, TX').",
                            timestamp: formatTime(),
                          };
                          setMessages((prev) => [...prev, errorMessage]);
                        }
                        setIsFetchingDepartureCode(false);
                      }}
                    >
                      {isFetchingDepartureCode ? "Finding..." : departureId ? departureId : "Find airport code"}
                    </Button>
                  </div>
                  {departureId && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-emerald-400">
                        Primary departure airport: <span className="font-semibold">{departureId}</span>
                      </p>
                      {departureAirportCodes.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-blue-200">
                          <p className="text-[11px] text-slate-600 font-semibold">
                            Select departure airports ({departureAirportCodes.length} found):
                          </p>
                          <div className="mt-1 grid grid-cols-2 gap-1 pl-1">
                            {(departureAirports.length > 0 ? departureAirports : departureAirportCodes.map((code: string) => ({
                              code,
                              name: "",
                              distance_miles: null,
                            }))).map((airport, idx) => {
                              const code = airport.code;
                              const isSelected = selectedDepartureAirportCodes.includes(code);
                              return (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDepartureAirportCodes((prev) =>
                                      prev.includes(code)
                                        ? prev.filter((c) => c !== code)
                                        : [...prev, code]
                                    );
                                  }}
                                  className={`flex items-center justify-between rounded border px-2 py-1 text-[10px] ${
                                    isSelected
                                      ? "border-emerald-400 bg-emerald-50 text-slate-900"
                                      : "border-blue-200 bg-white text-slate-600"
                                  }`}
                                >
                                  <span className="font-semibold">{code}</span>
                                  {airport.name && (
                                    <span className="ml-1 truncate max-w-[80px] text-[9px] text-slate-500">
                                      {airport.name}
                                  </span>
                            )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-slate-500 italic pt-1">
                            Flights will be searched from{" "}
                            {selectedDepartureAirportCodes.length > 0
                              ? selectedDepartureAirportCodes.length
                              : departureAirportCodes.length}{" "}
                            selected departure airport(s).
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Arrival Location */}
                <div className="space-y-2">
                  <Label className="text-slate-800 text-xs">Arrival location</Label>
                  {(() => {
                    const arrivalLocation = getArrivalLocation();
                    return (
                      <>
                        {arrivalLocation ? (
                          <>
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                value={arrivalLocation}
                                disabled
                                className="h-8 bg-white border-blue-200 text-xs text-slate-500"
                              />
                              <Button
                                size="sm"
                                className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                                disabled={isFetchingArrivalCode || !!arrivalId}
                                onClick={async () => {
                                  setIsFetchingArrivalCode(true);
                                  const code = await getAirportCode(arrivalLocation, false);
                                  if (code) {
                                    setArrivalId(code);
                                  } else {
                                    // Show error message
                                    const errorMessage: Message = {
                                      role: "assistant",
                                      content: "I couldn't find an airport code for that location. Please check your trip sketch.",
                                      timestamp: formatTime(),
                                    };
                                    setMessages((prev) => [...prev, errorMessage]);
                                  }
                                  setIsFetchingArrivalCode(false);
                                }}
                              >
                                {isFetchingArrivalCode ? "Finding..." : arrivalId ? arrivalId : "Find airport code"}
                              </Button>
                            </div>
                            {arrivalId && (
                              <div className="space-y-1">
                              <p className="text-[11px] text-emerald-400">
                                  Primary arrival airport: <span className="font-semibold">{arrivalId}</span>
                                </p>
                                {arrivalAirportCodes.length > 0 && (
                                  <div className="space-y-1 pt-1 border-t border-blue-200">
                                    <p className="text-[11px] text-slate-600 font-semibold">
                                      Select arrival airports ({arrivalAirportCodes.length} found):
                                    </p>
                                    <div className="mt-1 grid grid-cols-2 gap-1 pl-1">
                                      {(arrivalAirports.length > 0 ? arrivalAirports : arrivalAirportCodes.map((code: string) => ({
                                        code,
                                        name: "",
                                        distance_miles: null,
                                      }))).map((airport, idx) => {
                                        const code = airport.code;
                                        const isSelected = selectedArrivalAirportCodes.includes(code);
                                        return (
                                          <button
                                            key={code}
                                            type="button"
                                            onClick={() => {
                                              setSelectedArrivalAirportCodes((prev) =>
                                                prev.includes(code)
                                                  ? prev.filter((c) => c !== code)
                                                  : [...prev, code]
                                              );
                                            }}
                                            className={`flex items-center justify-between rounded border px-2 py-1 text-[10px] ${
                                              isSelected
                                                ? "border-emerald-400 bg-emerald-50 text-slate-900"
                                                : "border-blue-200 bg-white text-slate-600"
                                            }`}
                                          >
                                            <span className="font-semibold">{code}</span>
                                            {airport.name && (
                                              <span className="ml-1 truncate max-w-[80px] text-[9px] text-slate-500">
                                                {airport.name}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <p className="text-[10px] text-slate-500 italic pt-1">
                                      Flights will be searched to{" "}
                                      {selectedArrivalAirportCodes.length > 0
                                        ? selectedArrivalAirportCodes.length
                                        : arrivalAirportCodes.length}{" "}
                                      selected arrival airport(s).
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Please set your trip destination or add activities with locations to automatically detect the arrival location.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Flight Dates Summary */}
                {tripPreferences?.start_date && tripPreferences?.end_date && (
                  <div className="space-y-2 pt-2 border-t border-blue-200">
                    <p className="text-xs font-semibold text-slate-600">Flight dates</p>
                    <div className="text-[11px] text-slate-500 space-y-1">
                      <p>Outbound date: <span className="text-slate-800">{tripPreferences.start_date}</span></p>
                      <p>Return date: <span className="text-slate-800">{tripPreferences.end_date}</span></p>
                      <p>Trip type: <span className="text-slate-800">Round trip (type: 1)</span></p>
                    </div>
                  </div>
                )}

                {/* Search Flights Button */}
                {departureId && arrivalId && (
                  <div className="space-y-2 pt-2 border-t border-blue-200">
                    {!tripPreferences?.start_date || !tripPreferences?.end_date ? (
                      <p className="text-[11px] text-rose-400">
                        Please set your trip dates in Phase 1 to search for flights.
                      </p>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full h-8 bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                        disabled={isFetchingFlights}
                        onClick={fetchFlights}
                      >
                        {isFetchingFlights ? "Searching for flights..." : "Search for flights"}
                      </Button>
                    )}
                  </div>
                )}

                {/* Loading Indicator */}
                {isFetchingFlights && (
                  <div className="space-y-2 pt-2 border-t border-blue-200">
                    <p className="text-xs text-slate-500">Searching for flights...</p>
                  </div>
                )}

                {/* Flight Results - Step 1: Select Outbound */}
                {bestFlights.length > 0 && returnFlights.length === 0 && (
                  <div className="space-y-4 pt-2 border-t border-blue-200">
                    <p className="text-xs font-semibold text-slate-600">Step 1: Select your outbound flight</p>

                    {/* Group flights by departure airport */}
                    {Object.keys(flightsByAirport).length > 0 ? (
                      // Display flights grouped by departure airport
                      Object.entries(flightsByAirport).map(([airportCode, flightsForAirport]) => (
                        <div key={airportCode} className="space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b border-blue-200">
                            <p className="text-xs font-semibold text-slate-800">
                              Departures from {airportCode}
                            </p>
                            <span className="text-[10px] text-slate-500">
                              ({flightsForAirport.length} option{flightsForAirport.length !== 1 ? "s" : ""})
                            </span>
                          </div>
                          <div className="space-y-3 pl-2">
                            {flightsForAirport.map((flightOption, localIndex) => {
                              // Find global index in bestFlights array using departure_token as unique identifier
                              // If departure_token is available, use it for exact matching
                              let globalIndex = -1;
                              if (flightOption.departure_token) {
                                globalIndex = bestFlights.findIndex(
                                  f => f?.departure_token === flightOption.departure_token
                                );
                              }
                              // Fallback to object reference or other matching
                              if (globalIndex < 0) {
                                globalIndex = bestFlights.findIndex(
                                  f => f === flightOption ||
                                  (f.departure_airport_code === airportCode &&
                                   f.price === flightOption.price &&
                                   f.total_duration === flightOption.total_duration &&
                                   JSON.stringify(f.flights) === JSON.stringify(flightOption.flights))
                                );
                              }
                              const index = globalIndex >= 0 ? globalIndex : localIndex;
                        const outboundFlights = flightOption.flights || [];
                        const outboundLayovers = flightOption.layovers || [];
                        const firstOutbound = outboundFlights[0];
                        const lastOutbound = outboundFlights[outboundFlights.length - 1];
                        const isSelected = selectedOutboundIndex === index;
                        const isLayoversExpanded = expandedLayovers[index] || false;

                        const formatDuration = (minutes: number) => {
                          const hours = Math.floor(minutes / 60);
                          const mins = minutes % 60;
                          return `${hours}h ${mins}m`;
                        };

                        return (
                          <div
                            key={index}
                            className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-blue-200 bg-white/60 hover:border-blue-200"
                            }`}
                            onClick={async () => {
                              // If selecting a different outbound flight, clear return flight selection
                              if (selectedOutboundIndex !== index && selectedOutboundIndex !== null) {
                                setSelectedReturnIndex(null);
                                setReturnFlights([]);
                              }

                              setSelectedOutboundIndex(index);
                              // Update selection in database
                              // Wait a bit for flight_id to be available if save is still in progress
                              const token = getAuthToken();
                              if (!token || !tripId) return;

                              let flightId = outboundFlightIds[index];

                              // If flight_id not available yet, wait a moment and check again
                              if (!flightId) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                flightId = outboundFlightIds[index];
                              }

                              // Try to save selection - if flight_id is available
                              if (flightId) {
                                try {
                                  const response = await fetch(getApiUrl("api/flights/select"), {
                                    method: "PUT",
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      trip_id: tripId,
                                      flight_id: flightId,
                                      is_selected: true,
                                    }),
                                  });

                                  const result = await response.json();
                                  if (result.success) {
                                    console.log("Successfully updated outbound flight selection");
                                    // Backend will automatically unselect return flights, but clear UI state
                                    if (selectedReturnIndex !== null) {
                                      setSelectedReturnIndex(null);
                                    }
                                  }
                                } catch (error) {
                                  console.error("Error updating flight selection:", error);
                                }
                              } else {
                                // If still no flight_id, try using departure_token to find it
                                // Use the actual flightOption from the grouped display to ensure we have the right flight
                                const selectedFlight = flightOption;
                                if (selectedFlight?.departure_token) {
                                  // The backend can look up by departure_token if needed
                                  // For now, we'll retry after a delay
                                  setTimeout(async () => {
                                    const retryFlightId = outboundFlightIds[index];
                                    if (retryFlightId) {
                                      try {
                                        const response = await fetch(getApiUrl("api/flights/select"), {
                                          method: "PUT",
                                          headers: {
                                            Authorization: `Bearer ${token}`,
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            trip_id: tripId,
                                            flight_id: retryFlightId,
                                            is_selected: true,
                                          }),
                                        });

                                        const result = await response.json();
                                        if (result.success && selectedReturnIndex !== null) {
                                          setSelectedReturnIndex(null);
                                        }
                                      } catch (error) {
                                        console.error("Error updating flight selection (retry):", error);
                                      }
                                    }
                                  }, 1000);
                                }
                              }
                            }}
                          >
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-xs text-slate-800">
                                  <span className="font-semibold">{firstOutbound?.departure_airport?.name || firstOutbound?.departure_airport?.id}</span>
                                  {" → "}
                                  <span className="font-semibold">{lastOutbound?.arrival_airport?.name || lastOutbound?.arrival_airport?.id}</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstOutbound?.departure_airport?.time} → {lastOutbound?.arrival_airport?.time}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstOutbound?.airline || "Multiple airlines"}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Duration: {formatDuration(flightOption.total_duration || 0)}
                                </p>
                                <p className="text-xs font-semibold text-emerald-400">
                                  Outbound price: ${flightOption.price?.toLocaleString() || "N/A"}
                                </p>
                              </div>
                              {outboundLayovers.length > 0 && (
                                <Collapsible open={isLayoversExpanded} onOpenChange={(open) => setExpandedLayovers({ ...expandedLayovers, [index]: open })}>
                                  <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
                                    <ChevronDown className={`h-3 w-3 transition-transform ${isLayoversExpanded ? "rotate-180" : ""}`} />
                                    {outboundLayovers.length} layover{outboundLayovers.length > 1 ? "s" : ""}
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 space-y-1">
                                    {outboundLayovers.map((layover: any, layoverIdx: number) => (
                                      <div key={layoverIdx} className="text-[11px] text-slate-500 pl-4">
                                        {layover.name} ({layover.id}) - {formatDuration(layover.duration)}
                                        {layover.overnight && " (overnight)"}
                                      </div>
                                    ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          </div>
                        );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      // Fallback: display as flat list if grouping not available
                      <div className="space-y-3">
                        {bestFlights.map((flightOption, index) => {
                        const outboundFlights = flightOption.flights || [];
                        const outboundLayovers = flightOption.layovers || [];
                        const firstOutbound = outboundFlights[0];
                        const lastOutbound = outboundFlights[outboundFlights.length - 1];
                        const isSelected = selectedOutboundIndex === index;
                        const isLayoversExpanded = expandedLayovers[index] || false;

                        const formatDuration = (minutes: number) => {
                          const hours = Math.floor(minutes / 60);
                          const mins = minutes % 60;
                          return `${hours}h ${mins}m`;
                        };

                        return (
                          <div
                            key={index}
                            className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-blue-200 bg-white/60 hover:border-blue-200"
                            }`}
                            onClick={async () => {
                              // If selecting a different outbound flight, clear return flight selection
                              if (selectedOutboundIndex !== index && selectedOutboundIndex !== null) {
                                setSelectedReturnIndex(null);
                                setReturnFlights([]);
                              }

                              setSelectedOutboundIndex(index);
                              // Update selection in database
                              // Wait a bit for flight_id to be available if save is still in progress
                              const token = getAuthToken();
                              if (!token || !tripId) return;

                              let flightId = outboundFlightIds[index];

                              // If flight_id not available yet, wait a moment and check again
                              if (!flightId) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                flightId = outboundFlightIds[index];
                              }

                              // Try to save selection - if flight_id is available
                              if (flightId) {
                                try {
                                  const response = await fetch(getApiUrl("api/flights/select"), {
                                    method: "PUT",
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      trip_id: tripId,
                                      flight_id: flightId,
                                      is_selected: true,
                                    }),
                                  });

                                  const result = await response.json();
                                  if (result.success) {
                                    console.log("Successfully updated outbound flight selection");
                                    // Backend will automatically unselect return flights, but clear UI state
                                    if (selectedReturnIndex !== null) {
                                      setSelectedReturnIndex(null);
                                    }
                                  }
                                } catch (error) {
                                  console.error("Error updating flight selection:", error);
                                }
                              }
                            }}
                          >
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-xs text-slate-800">
                                  <span className="font-semibold">{firstOutbound?.departure_airport?.name || firstOutbound?.departure_airport?.id}</span>
                                  {" → "}
                                  <span className="font-semibold">{lastOutbound?.arrival_airport?.name || lastOutbound?.arrival_airport?.id}</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstOutbound?.departure_airport?.time} → {lastOutbound?.arrival_airport?.time}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstOutbound?.airline || "Multiple airlines"}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Duration: {formatDuration(flightOption.total_duration || 0)}
                                </p>
                                <p className="text-xs font-semibold text-emerald-400">
                                  Outbound price: ${flightOption.price?.toLocaleString() || "N/A"}
                                </p>
                              </div>
                              {outboundLayovers.length > 0 && (
                                <Collapsible open={isLayoversExpanded} onOpenChange={(open) => setExpandedLayovers({ ...expandedLayovers, [index]: open })}>
                                  <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
                                    <ChevronDown className={`h-3 w-3 transition-transform ${isLayoversExpanded ? "rotate-180" : ""}`} />
                                    {outboundLayovers.length} layover{outboundLayovers.length > 1 ? "s" : ""}
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 space-y-1">
                                    {outboundLayovers.map((layover: any, layoverIdx: number) => (
                                      <div key={layoverIdx} className="text-[11px] text-slate-500 pl-4">
                                        {layover.name} ({layover.id}) - {formatDuration(layover.duration)}
                                        {layover.overnight && " (overnight)"}
                                      </div>
                                    ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    )}

                    {/* Choose Return Flight Button - Show when return flights are NOT loaded or when user wants to refresh */}
                    {selectedOutboundIndex !== null && bestFlights[selectedOutboundIndex] && returnFlights.length === 0 && (
                      <div className="pt-2 flex justify-end">
                        {(() => {
                          // Find the actual selected flight object - might be from grouped display
                          let selectedFlight = bestFlights[selectedOutboundIndex];
                          // If we have grouped flights, try to find the flight by departure_token to ensure we have the right one
                          if (Object.keys(flightsByAirport).length > 0 && selectedFlight?.departure_token) {
                            // Search through grouped flights to find the exact flight object
                            for (const flightsForAirport of Object.values(flightsByAirport)) {
                              const found = flightsForAirport.find(f => f?.departure_token === selectedFlight?.departure_token);
                              if (found) {
                                selectedFlight = found;
                                break;
                              }
                            }
                          }
                          return (
                            <>
                              {!selectedFlight?.departure_token && (
                                <p className="text-[10px] text-red-400 mr-2">
                                  Warning: This flight is missing departure token. Cannot fetch return flights.
                                </p>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                                disabled={isFetchingReturnFlights || !selectedFlight?.departure_token}
                                onClick={async () => {
                                  // Use the selectedFlight from closure above
                            console.log("Choose return flight clicked. Selected flight:", selectedFlight);
                            console.log("Selected outbound index:", selectedOutboundIndex);
                            console.log("Best flights array length:", bestFlights.length);
                            console.log("Departure token:", selectedFlight?.departure_token);
                            console.log("Departure token type:", typeof selectedFlight?.departure_token);
                            console.log("Departure token truthy:", !!selectedFlight?.departure_token);
                            console.log("Current returnFlights.length:", returnFlights.length);
                            console.log("isFetchingReturnFlights:", isFetchingReturnFlights);

                            // Check if departure_token exists - handle both null and undefined
                            const departureToken = selectedFlight?.departure_token;
                            if (!departureToken || departureToken === null || departureToken === undefined || departureToken === '') {
                              console.error("Missing departure_token in selected flight:", selectedFlight);
                              const errorMessage: Message = {
                                role: "assistant",
                                content: "This flight option doesn't have a departure token. Please select a different option or try refreshing the page.",
                                timestamp: formatTime(),
                              };
                              setMessages((prev) => [...prev, errorMessage]);
                              return;
                            }

                            // Clear any existing return flights and cache to ensure fresh API call
                            setReturnFlights([]);
                            setSelectedReturnIndex(null);
                            setReturnFlightsCache(prev => {
                              const newCache = { ...prev };
                              delete newCache[departureToken];
                              return newCache;
                            });

                            // Fetch return flights using the validated departure_token
                            console.log("Calling fetchReturnFlights with token:", departureToken);
                            await fetchReturnFlights(departureToken);
                                  }}
                                >
                                  {isFetchingReturnFlights ? "Loading return flights..." : "Choose return flight"}
                                </Button>
                              </>
                            );
                          })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Loading Return Flights */}
                {selectedOutboundIndex !== null && isFetchingReturnFlights && (
                  <div className="space-y-2 pt-2 border-t border-blue-200">
                    <p className="text-xs text-slate-500">Loading return flight options...</p>
                  </div>
                )}

                {/* Step 2: Select Return Flight */}
                {selectedOutboundIndex !== null && returnFlights.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-blue-200">
                    <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Step 2: Select your return flight</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-3 text-[10px] border-blue-200 text-slate-600 bg-blue-50 hover:bg-blue-50 disabled:opacity-60"
                          disabled={isFetchingReturnFlights || !bestFlights[selectedOutboundIndex]?.departure_token}
                          onClick={async () => {
                            const selectedFlight = bestFlights[selectedOutboundIndex];
                            if (selectedFlight?.departure_token) {
                              // Clear cache for this departure_token to force a new API call
                              setReturnFlightsCache(prev => {
                                const newCache = { ...prev };
                                delete newCache[selectedFlight.departure_token];
                                return newCache;
                              });
                              await fetchReturnFlights(selectedFlight.departure_token);
                            }
                          }}
                        >
                          {isFetchingReturnFlights ? "Refreshing..." : "Refresh return flights"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-3 text-[10px] border-blue-200 text-slate-600 bg-blue-50 hover:bg-blue-50"
                          onClick={() => {
                            setReturnFlights([]);
                            setSelectedReturnIndex(null);
                          }}
                        >
                          ← Back to outbound flights
                        </Button>
                      </div>
                    </div>

                    {/* Show Selected Outbound */}
                    {bestFlights[selectedOutboundIndex] && (() => {
                      const selectedOutbound = bestFlights[selectedOutboundIndex];
                      const outboundFlights = selectedOutbound.flights || [];
                      const firstOutbound = outboundFlights[0];
                      const lastOutbound = outboundFlights[outboundFlights.length - 1];
                      const formatDuration = (minutes: number) => {
                        const hours = Math.floor(minutes / 60);
                        const mins = minutes % 60;
                        return `${hours}h ${mins}m`;
                      };

                      return (
                        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <p className="text-[11px] font-semibold text-blue-400 mb-2">Selected Outbound:</p>
                          <p className="text-xs text-slate-800">
                            {firstOutbound?.departure_airport?.name || firstOutbound?.departure_airport?.id} → {lastOutbound?.arrival_airport?.name || lastOutbound?.arrival_airport?.id}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {firstOutbound?.departure_airport?.time} → {lastOutbound?.arrival_airport?.time}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Return Flight Options */}
                    <div className="space-y-3">
                      {returnFlights.map((flightOption, index) => {
                        const returnFlightLegs = flightOption.flights || [];
                        const returnLayovers = flightOption.layovers || [];
                        const firstReturn = returnFlightLegs[0];
                        const lastReturn = returnFlightLegs[returnFlightLegs.length - 1];
                        const isSelected = selectedReturnIndex === index;
                        const isLayoversExpanded = expandedLayovers[`return-${index}`] || false;

                        const formatDuration = (minutes: number) => {
                          const hours = Math.floor(minutes / 60);
                          const mins = minutes % 60;
                          return `${hours}h ${mins}m`;
                        };

                        return (
                          <div
                            key={index}
                            className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-blue-200 bg-white/60 hover:border-blue-200"
                            }`}
                            onClick={async () => {
                              setSelectedReturnIndex(index);
                              // Update selection in database
                              const token = getAuthToken();
                              if (!token || !tripId) return;

                              let flightId = returnFlightIds[index];

                              // If flight_id not available yet, wait a moment and check again
                              if (!flightId) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                flightId = returnFlightIds[index];
                              }

                              // Try to save selection - if flight_id is available
                              if (flightId) {
                                try {
                                  await fetch(getApiUrl("api/flights/select"), {
                                    method: "PUT",
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      trip_id: tripId,
                                      flight_id: flightId,
                                      is_selected: true,
                                    }),
                                  });
                                } catch (error) {
                                  console.error("Error updating return flight selection:", error);
                                }
                              } else {
                                // Retry after a delay if flight_id becomes available
                                setTimeout(async () => {
                                  const retryFlightId = returnFlightIds[index];
                                  if (retryFlightId) {
                                    try {
                                      await fetch(getApiUrl("api/flights/select"), {
                                        method: "PUT",
                                        headers: {
                                          Authorization: `Bearer ${token}`,
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          trip_id: tripId,
                                          flight_id: retryFlightId,
                                          is_selected: true,
                                        }),
                                      });
                                    } catch (error) {
                                      console.error("Error updating return flight selection (retry):", error);
                                    }
                                  }
                                }, 1000);
                              }
                            }}
                          >
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-xs text-slate-800">
                                  <span className="font-semibold">{firstReturn?.departure_airport?.name || firstReturn?.departure_airport?.id}</span>
                                  {" → "}
                                  <span className="font-semibold">{lastReturn?.arrival_airport?.name || lastReturn?.arrival_airport?.id}</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstReturn?.departure_airport?.time} → {lastReturn?.arrival_airport?.time}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {firstReturn?.airline || "Multiple airlines"}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Duration: {formatDuration(flightOption.total_duration || 0)}
                                </p>
                                <p className="text-xs font-semibold text-emerald-400">
                                  Return price: ${flightOption.price?.toLocaleString() || "N/A"}
                                </p>
                              </div>
                              {returnLayovers.length > 0 && (
                                <Collapsible open={isLayoversExpanded} onOpenChange={(open) => setExpandedLayovers({ ...expandedLayovers, [`return-${index}`]: open })}>
                                  <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
                                    <ChevronDown className={`h-3 w-3 transition-transform ${isLayoversExpanded ? "rotate-180" : ""}`} />
                                    {returnLayovers.length} layover{returnLayovers.length > 1 ? "s" : ""}
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 space-y-1">
                                    {returnLayovers.map((layover: any, layoverIdx: number) => (
                                      <div key={layoverIdx} className="text-[11px] text-slate-500 pl-4">
                                        {layover.name} ({layover.id}) - {formatDuration(layover.duration)}
                                        {layover.overnight && " (overnight)"}
                                      </div>
                                    ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Complete Round Trip Summary */}
                    {selectedOutboundIndex !== null && selectedReturnIndex !== null && (
                      <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                        <p className="text-xs font-semibold text-emerald-400 mb-2">Complete Round Trip:</p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-slate-600 font-semibold mb-1">Outbound</p>
                            {(() => {
                              const outbound = bestFlights[selectedOutboundIndex];
                              const outboundFlights = outbound.flights || [];
                              const first = outboundFlights[0];
                              const last = outboundFlights[outboundFlights.length - 1];
                              return (
                                <>
                                  <p className="text-slate-800">{first?.departure_airport?.id} → {last?.arrival_airport?.id}</p>
                                  <p className="text-[11px] text-slate-500">${outbound.price?.toLocaleString()}</p>
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <p className="text-slate-600 font-semibold mb-1">Return</p>
                            {(() => {
                              const returnFlight = returnFlights[selectedReturnIndex];
                              const returnFlightLegs = returnFlight.flights || [];
                              const first = returnFlightLegs[0];
                              const last = returnFlightLegs[returnFlightLegs.length - 1];
                              return (
                                <>
                                  <p className="text-slate-800">{first?.departure_airport?.id} → {last?.arrival_airport?.id}</p>
                                  <p className="text-[11px] text-slate-500">${returnFlight.price?.toLocaleString()}</p>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-emerald-500/30">
                          <p className="text-sm font-semibold text-emerald-400">
                            Total: ${(
                              (bestFlights[selectedOutboundIndex]?.price || 0) +
                              (returnFlights[selectedReturnIndex]?.price || 0)
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Continue Button */}
                    {selectedOutboundIndex !== null && selectedReturnIndex !== null && (
                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                          onClick={() => {
                            setHasConfirmedFlights(true);
                            // If multi-city trip, go to multi-city planning; otherwise go to hotels
                            if (orderedCities.length > 1) {
                              setActiveTab("multi-city");
                            } else {
                              setHasStartedHotels(true);
                              setActiveTab("hotels");
                            }
                          }}
                        >
                          {orderedCities.length > 1 ? "Continue to Multi-City Planning" : "Continue to Hotels"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Multi-City Planning Tab */}
          {hasStartedPlanning && hasConfirmedFlights && orderedCities.length > 1 && activeTab === "multi-city" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm space-y-4">
                <p className="text-xs font-semibold text-slate-600">
                  Phase 3: Allocate days to cities
                </p>
                <p className="text-[11px] text-slate-500">
                  Distribute your {computedNumDays || tripPreferences?.num_days || 0} trip days across the cities you&apos;re visiting.
                  {getFlightArrivalDate() && (
                    <span className="block mt-1 text-[10px] text-slate-400">
                      Trip starts on {getFlightArrivalDate()?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} (flight arrival date)
                    </span>
                  )}
                </p>

                <div className="space-y-4">
                  {orderedCities.map((city, index) => {
                    const currentDays = manualCityDaysAllocation[city] || 0;
                    const totalAllocated = Object.values(manualCityDaysAllocation).reduce((sum, days) => sum + days, 0);
                    const remainingDays = (computedNumDays || tripPreferences?.num_days || 0) - totalAllocated + currentDays;

                    return (
                      <div key={`${city}-${index}`} className="p-4 border border-blue-200 rounded-lg bg-white">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{city}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">City {index + 1} of {orderedCities.length}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 border-blue-200 hover:bg-blue-50 disabled:opacity-30"
                              disabled={currentDays <= 0}
                              onClick={() => {
                                setManualCityDaysAllocation(prev => ({
                                  ...prev,
                                  [city]: Math.max(0, (prev[city] || 0) - 1)
                                }));
                              }}
                            >
                              -
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              max={remainingDays}
                              value={currentDays}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                const maxDays = remainingDays;
                                const newValue = Math.min(Math.max(0, value), maxDays);
                                setManualCityDaysAllocation(prev => ({
                                  ...prev,
                                  [city]: newValue
                                }));
                              }}
                              className="h-8 w-20 text-center bg-white border-blue-200 text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 border-blue-200 hover:bg-blue-50 disabled:opacity-30"
                              disabled={remainingDays <= 0}
                              onClick={() => {
                                setManualCityDaysAllocation(prev => ({
                                  ...prev,
                                  [city]: (prev[city] || 0) + 1
                                }));
                              }}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {currentDays} {currentDays === 1 ? 'day' : 'days'} allocated
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-700">
                      Total days allocated: {Object.values(manualCityDaysAllocation).reduce((sum, days) => sum + days, 0)} / {computedNumDays || tripPreferences?.num_days || 0}
                    </p>
                    {Object.values(manualCityDaysAllocation).reduce((sum, days) => sum + days, 0) !== (computedNumDays || tripPreferences?.num_days || 0) && (
                      <p className="text-[10px] text-rose-400">
                        Please allocate all {computedNumDays || tripPreferences?.num_days || 0} days
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                    disabled={Object.values(manualCityDaysAllocation).reduce((sum, days) => sum + days, 0) !== (computedNumDays || tripPreferences?.num_days || 0)}
                    onClick={() => {
                      setInterCityTransportStep("transportation");
                      setCurrentInterCitySegment(0);
                    }}
                  >
                    Book transportation between cities
                  </Button>
                </div>
              </div>
            </div>
          )}
          {/* Inter-City Transportation Booking Section */}
          {hasStartedPlanning && hasConfirmedFlights && orderedCities.length > 1 && activeTab === "multi-city" && interCityTransportStep === "transportation" && (() => {
            // Calculate segments: city 1->2, 2->3, etc., and potentially last city -> original destination
            const segments: Array<{ from: string; to: string; isReturn: boolean }> = [];
            for (let i = 0; i < orderedCities.length - 1; i++) {
              segments.push({ from: orderedCities[i], to: orderedCities[i + 1], isReturn: false });
            }
            
            // Check if last city matches return flight destination
            const returnFlightDestination = getArrivalLocation(); // This gets the original destination from round trip
            const lastCity = orderedCities[orderedCities.length - 1];
            if (returnFlightDestination && lastCity.toLowerCase() !== returnFlightDestination.toLowerCase()) {
              segments.push({ from: lastCity, to: returnFlightDestination, isReturn: true });
            }
            
            const currentSegment = segments[currentInterCitySegment];
            const totalSegments = segments.length;
            const isLastSegment = currentInterCitySegment === totalSegments - 1;
            const segmentKey = `${currentSegment.from}-${currentSegment.to}`;
            
            return (
              <div className="flex justify-center">
                <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">
                      Book transportation: {currentSegment.from} → {currentSegment.to}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Segment {currentInterCitySegment + 1} of {totalSegments}
                    </p>
                  </div>
                  
                  {/* Transportation Type Selection */}
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-xs">Transportation type</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={interCityTransportation[currentInterCitySegment] === "flight" ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${interCityTransportation[currentInterCitySegment] === "flight" ? "bg-blue-500 text-white" : "border-blue-200"}`}
                        onClick={() => {
                          setInterCityTransportation(prev => ({ ...prev, [currentInterCitySegment]: "flight" }));
                        }}
                      >
                        Flight
                      </Button>
                      <Button
                        type="button"
                        variant={interCityTransportation[currentInterCitySegment] === "driving" ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${interCityTransportation[currentInterCitySegment] === "driving" ? "bg-blue-500 text-white" : "border-blue-200"}`}
                        onClick={() => {
                          setInterCityTransportation(prev => ({ ...prev, [currentInterCitySegment]: "driving" }));
                          setSelectedInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: null }));
                        }}
                      >
                        Driving
                      </Button>
                    </div>
                  </div>

                  {/* Driving Option Display */}
                  {interCityTransportation[currentInterCitySegment] === "driving" && (
                    <div className="p-4 border border-blue-200 rounded-lg bg-blue-50/30">
                      <p className="text-xs text-slate-700">
                        You&apos;ll drive from <span className="font-semibold">{currentSegment.from}</span> to <span className="font-semibold">{currentSegment.to}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        No flights available or you selected driving as your transportation method.
                      </p>
                    </div>
                  )}

                  {/* Flight Booking UI (similar to main flights tab) */}
                  {interCityTransportation[currentInterCitySegment] === "flight" && (
                    <div className="space-y-4 pt-2 border-t border-blue-200">
                      {/* Departure Location */}
                      <div className="space-y-2">
                        <Label className="text-slate-800 text-xs">Departure location: {currentSegment.from}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={currentSegment.from}
                            disabled
                            className="h-8 bg-slate-50 border-blue-200 text-xs text-slate-500"
                          />
                          <Button
                            size="sm"
                            className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                            disabled={isFetchingInterCityFlights[currentInterCitySegment] || !!interCityDepartureId[currentInterCitySegment]}
                            onClick={async () => {
                              setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: true }));
                              try {
                                const token = getAuthToken();
                                if (!token) return;

                                const response = await fetch(getApiUrl("api/chat/airport-code"), {
                                  method: "POST",
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    location: currentSegment.from,
                                  }),
                                });

                                const result = await response.json();

                                if (response.ok && result.success && result.airport_codes && Array.isArray(result.airport_codes) && result.airport_codes.length > 0) {
                                  const code = result.airport_codes[0];
                                  setInterCityDepartureId(prev => ({ ...prev, [currentInterCitySegment]: code }));
                                  setInterCityDepartureCodes(prev => ({ ...prev, [currentInterCitySegment]: result.airport_codes }));
                                }
                              } catch (error) {
                                console.error("Error fetching airport code:", error);
                              } finally {
                                setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: false }));
                              }
                            }}
                          >
                            {isFetchingInterCityFlights[currentInterCitySegment] ? "Finding..." : interCityDepartureId[currentInterCitySegment] || "Find airport code"}
                          </Button>
                        </div>
                      </div>

                      {/* Arrival Location */}
                      <div className="space-y-2">
                        <Label className="text-slate-800 text-xs">Arrival location: {currentSegment.to}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={currentSegment.to}
                            disabled
                            className="h-8 bg-slate-50 border-blue-200 text-xs text-slate-500"
                          />
                          <Button
                            size="sm"
                            className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                            disabled={isFetchingInterCityFlights[currentInterCitySegment] || !!interCityArrivalId[currentInterCitySegment]}
                            onClick={async () => {
                              setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: true }));
                              try {
                                const token = getAuthToken();
                                if (!token) return;

                                const response = await fetch(getApiUrl("api/chat/airport-code"), {
                                  method: "POST",
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    location: currentSegment.to,
                                  }),
                                });

                                const result = await response.json();

                                if (response.ok && result.success && result.airport_codes && Array.isArray(result.airport_codes) && result.airport_codes.length > 0) {
                                  const code = result.airport_codes[0];
                                  setInterCityArrivalId(prev => ({ ...prev, [currentInterCitySegment]: code }));
                                  setInterCityArrivalCodes(prev => ({ ...prev, [currentInterCitySegment]: result.airport_codes }));
                                }
                              } catch (error) {
                                console.error("Error fetching airport code:", error);
                              } finally {
                                setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: false }));
                              }
                            }}
                          >
                            {isFetchingInterCityFlights[currentInterCitySegment] ? "Finding..." : interCityArrivalId[currentInterCitySegment] || "Find airport code"}
                          </Button>
                        </div>
                      </div>

                      {/* Search Flights Button */}
                      {interCityDepartureId[currentInterCitySegment] && interCityArrivalId[currentInterCitySegment] && (
                        <Button
                          size="sm"
                          className="w-full h-8 bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                          disabled={isFetchingInterCityFlights[currentInterCitySegment]}
                          onClick={async () => {
                            if (!tripId) return;
                            setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: true }));
                            
                            try {
                              const token = getAuthToken();
                              if (!token) return;

                              // Calculate departure date based on days allocated to previous cities
                              let departureDate = getFlightArrivalDate();
                              if (departureDate) {
                                // Add days from previous cities (including the current departure city)
                                for (let i = 0; i <= currentInterCitySegment; i++) {
                                  const days = manualCityDaysAllocation[orderedCities[i]] || 0;
                                  departureDate = new Date(departureDate.getTime() + days * 24 * 60 * 60 * 1000);
                                }
                              } else if (tripPreferences?.start_date) {
                                // Fallback to trip start date if flight arrival date not available
                                departureDate = new Date(tripPreferences.start_date);
                                // Add days from previous cities (including the current departure city)
                                for (let i = 0; i <= currentInterCitySegment; i++) {
                                  const days = manualCityDaysAllocation[orderedCities[i]] || 0;
                                  departureDate = new Date(departureDate.getTime() + days * 24 * 60 * 60 * 1000);
                                }
                              }

                              // For the return flight (last city to original destination), ensure arrival is within end_date
                              if (currentSegment.isReturn && tripPreferences?.end_date) {
                                const endDate = new Date(tripPreferences.end_date);
                                // Set end date to end of day for comparison
                                endDate.setHours(23, 59, 59, 999);
                                
                                // Calculate the start date of the last city (when user arrives there)
                                const lastCityStartDate = getFlightArrivalDate();
                                if (lastCityStartDate) {
                                  for (let i = 0; i < orderedCities.length - 1; i++) {
                                    const days = manualCityDaysAllocation[orderedCities[i]] || 0;
                                    lastCityStartDate.setTime(lastCityStartDate.getTime() + days * 24 * 60 * 60 * 1000);
                                  }
                                }
                                
                                // Estimate maximum flight duration (use 15 hours as conservative max for long-haul flights)
                                // This accounts for time zones and long international flights
                                const maxFlightHours = 15;
                                const maxFlightMs = maxFlightHours * 60 * 60 * 1000;
                                
                                // Calculate the latest departure date that would still arrive on or before end_date
                                const latestDepartureDate = new Date(endDate.getTime() - maxFlightMs);
                                
                                // If our calculated departure date is after the latest allowed, adjust it
                                if (departureDate > latestDepartureDate) {
                                  departureDate = new Date(latestDepartureDate);
                                  
                                  // Ensure we don't depart before arriving at the last city
                                  if (lastCityStartDate && departureDate < lastCityStartDate) {
                                    // If we can't fit the flight, use the last city arrival date
                                    // This means the user might have less time in the last city
                                    departureDate = new Date(lastCityStartDate);
                                  }
                                }
                                
                                // Ensure departure date is not before the last city start date
                                if (lastCityStartDate && departureDate < lastCityStartDate) {
                                  departureDate = new Date(lastCityStartDate);
                                }
                              }

                              const params = new URLSearchParams({
                                departure_id: interCityDepartureId[currentInterCitySegment]!,
                                arrival_id: interCityArrivalId[currentInterCitySegment]!,
                                outbound_date: departureDate ? departureDate.toISOString().split('T')[0] : tripPreferences?.start_date || '',
                                currency: 'USD',
                                type: '0', // One-way flight for inter-city
                              });

                              const response = await fetch(getApiUrl(`api/flights/search?${params.toString()}`), {
                                method: "GET",
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                  "Content-Type": "application/json",
                                },
                              });

                              const result = await response.json();

                              if (response.ok && result.success) {
                                let flights: any[] = [];
                                if (Array.isArray(result.best_flights) && result.best_flights.length > 0) {
                                  flights = result.best_flights;
                                } else if (Array.isArray(result.other_flights) && result.other_flights.length > 0) {
                                  flights = result.other_flights;
                                }
                                
                                if (flights.length > 0) {
                                  setInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: flights }));
                                } else {
                                  // No flights found, default to driving
                                  setInterCityTransportation(prev => ({ ...prev, [currentInterCitySegment]: "driving" }));
                                  const errorMessage: Message = {
                                    role: "assistant",
                                    content: `No flights found between ${currentSegment.from} and ${currentSegment.to}. Defaulting to driving.`,
                                    timestamp: formatTime(),
                                  };
                                  setMessages((prev) => [...prev, errorMessage]);
                                }
                              } else {
                                // No flights found, default to driving
                                setInterCityTransportation(prev => ({ ...prev, [currentInterCitySegment]: "driving" }));
                              }
                            } catch (error) {
                              console.error("Error fetching inter-city flights:", error);
                              // Default to driving on error
                              setInterCityTransportation(prev => ({ ...prev, [currentInterCitySegment]: "driving" }));
                            } finally {
                              setIsFetchingInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: false }));
                            }
                          }}
                        >
                          {isFetchingInterCityFlights[currentInterCitySegment] ? "Searching for flights..." : "Search for flights"}
                        </Button>
                      )}

                      {/* Flight Results */}
                      {interCityFlights[currentInterCitySegment] && interCityFlights[currentInterCitySegment].length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-blue-200">
                          <p className="text-xs font-semibold text-slate-600">Select a flight</p>
                          {interCityFlights[currentInterCitySegment].map((flightOption: any, index: number) => {
                            const flightLegs = flightOption.flights || [];
                            const firstLeg = flightLegs[0];
                            const lastLeg = flightLegs[flightLegs.length - 1];
                            const isSelected = selectedInterCityFlights[currentInterCitySegment] === index;
                            const formatDuration = (minutes: number) => {
                              const hours = Math.floor(minutes / 60);
                              const mins = minutes % 60;
                              return `${hours}h ${mins}m`;
                            };

                            return (
                              <div
                                key={index}
                                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-500/10"
                                    : "border-blue-200 bg-white/60 hover:border-blue-200"
                                }`}
                                onClick={() => {
                                  setSelectedInterCityFlights(prev => ({ ...prev, [currentInterCitySegment]: index }));
                                }}
                              >
                                <div className="space-y-1">
                                  <p className="text-xs text-slate-800">
                                    <span className="font-semibold">{firstLeg?.departure_airport?.name || firstLeg?.departure_airport?.id}</span>
                                    {" → "}
                                    <span className="font-semibold">{lastLeg?.arrival_airport?.name || lastLeg?.arrival_airport?.id}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {firstLeg?.departure_airport?.time} → {lastLeg?.arrival_airport?.time}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Duration: {formatDuration(flightOption.total_duration || 0)}
                                  </p>
                                  <p className="text-xs font-semibold text-emerald-400">
                                    ${flightOption.price?.toLocaleString() || "N/A"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="pt-3 border-t border-blue-200 flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 border-blue-200 text-slate-900 hover:bg-blue-50 disabled:opacity-40"
                      disabled={currentInterCitySegment === 0}
                      onClick={() => {
                        setCurrentInterCitySegment(prev => prev - 1);
                      }}
                    >
                      ← Previous
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                      disabled={
                        interCityTransportation[currentInterCitySegment] === "flight" && 
                        selectedInterCityFlights[currentInterCitySegment] === null &&
                        interCityFlights[currentInterCitySegment] &&
                        interCityFlights[currentInterCitySegment].length > 0
                      }
                      onClick={() => {
                        if (isLastSegment) {
                          // All segments done, continue to hotels
                          setHasConfirmedMultiCityPlanning(true);
                          setHasStartedHotels(true);
                          setActiveTab("hotels");
                        } else {
                          // Move to next segment
                          setCurrentInterCitySegment(prev => prev + 1);
                        }
                      }}
                    >
                      {isLastSegment ? "Continue to Hotels" : "Next Segment →"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
          {hasStartedPlanning && hasConfirmedFlights && hasStartedHotels && activeTab === "hotels" && (() => {
            // Calculate hotel booking segments: one for each city, plus return destination if needed
            const hotelSegments: Array<{ city: string; cityIndex: number; isReturn: boolean }> = [];
            
            // Add segments for each city
            orderedCities.forEach((city, index) => {
              hotelSegments.push({ city, cityIndex: index, isReturn: false });
            });
            
            // Check if we need a hotel for the return destination
            const returnFlightDestination = getArrivalLocation();
            const lastCity = orderedCities[orderedCities.length - 1];
            if (returnFlightDestination && lastCity.toLowerCase() !== returnFlightDestination.toLowerCase()) {
              hotelSegments.push({ city: returnFlightDestination, cityIndex: -1, isReturn: true });
            }
            
            const currentSegment = hotelSegments[currentHotelCityIndex];
            const totalSegments = hotelSegments.length;
            const isLastSegment = currentHotelCityIndex === totalSegments - 1;
            
            // Calculate check-in and check-out dates for current city
            const calculateCityDates = () => {
              let checkInDate = getFlightArrivalDate();
              if (!checkInDate && tripPreferences?.start_date) {
                checkInDate = new Date(tripPreferences.start_date);
              }
              if (!checkInDate) return { checkIn: null, checkOut: null };
              
              // For return destination, use end_date as check-out
              if (currentSegment.isReturn) {
                const endDate = tripPreferences?.end_date ? new Date(tripPreferences.end_date) : null;
                if (endDate) {
                  // Check-in is the day before end_date (or same day if it's just one night)
                  const checkIn = new Date(endDate);
                  checkIn.setDate(checkIn.getDate() - 1);
                  return { checkIn, checkOut: endDate };
                }
                return { checkIn: null, checkOut: null };
              }
              
              // For regular cities, calculate based on days allocated
              let cityCheckIn = new Date(checkInDate);
              
              // Add days from previous cities
              for (let i = 0; i < currentSegment.cityIndex; i++) {
                const days = manualCityDaysAllocation[orderedCities[i]] || 0;
                cityCheckIn = new Date(cityCheckIn.getTime() + days * 24 * 60 * 60 * 1000);
              }
              
              // Calculate check-out (check-in + days in this city)
              const daysInCity = manualCityDaysAllocation[currentSegment.city] || 0;
              const cityCheckOut = new Date(cityCheckIn);
              cityCheckOut.setDate(cityCheckOut.getDate() + daysInCity);
              
              return { checkIn: cityCheckIn, checkOut: cityCheckOut };
            };
            
            const { checkIn, checkOut } = calculateCityDates();
            const currentCityHotels = hotelsByCity[currentHotelCityIndex] || [];
            const currentCitySelectedIndex = selectedHotelIndexByCity[currentHotelCityIndex] ?? null;
            const currentCityHotelIds = hotelIdsByCity[currentHotelCityIndex] || {};
            
            return (
              <div className="flex justify-center">
                <div className="w-full max-w-4xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">
                      Phase {orderedCities.length > 1 ? '4' : '3'}: Book your hotels
                    </p>
                    <p className="text-[10px] text-slate-500">
                      City {currentHotelCityIndex + 1} of {totalSegments}
                    </p>
                  </div>

                  {/* Hotel Location and Dates Info */}
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-500 space-y-1">
                      <p>Location: <span className="text-slate-800">{currentSegment.city}</span></p>
                      {checkIn && checkOut && (
                        <>
                          <p>Check-in: <span className="text-slate-800">{checkIn.toISOString().split('T')[0]}</span></p>
                          <p>Check-out: <span className="text-slate-800">{checkOut.toISOString().split('T')[0]}</span></p>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                      disabled={isFetchingHotelsByCity[currentHotelCityIndex] || !checkIn || !checkOut}
                      onClick={() => {
                        if (checkIn && checkOut) {
                          fetchHotelsForCity(currentHotelCityIndex, currentSegment.city, checkIn, checkOut);
                        }
                      }}
                    >
                      {isFetchingHotelsByCity[currentHotelCityIndex] ? "Searching for hotels..." : "Search for hotels"}
                    </Button>
                  </div>

                  {/* Loading Indicator */}
                  {isFetchingHotelsByCity[currentHotelCityIndex] && (
                    <div className="space-y-2 pt-2 border-t border-blue-200">
                      <p className="text-xs text-slate-500">Searching for hotels...</p>
                    </div>
                  )}

                  {/* Hotel Results */}
                  <>
                    {currentCityHotels.length > 0 && (
                      <div className="space-y-3 pt-2 border-t border-blue-200">
                        <p className="text-xs font-semibold text-slate-600">Available hotels</p>
                        <div className="space-y-3">
                          {currentCityHotels.map((hotel, index) => {
                            const isSelected = currentCitySelectedIndex === index;
                            const hotelImage = hotel.images && hotel.images.length > 0
                              ? hotel.images[0].original_image || hotel.images[0].thumbnail
                              : null;

                        // Extract rate per night - prioritize rate_per_night over total_rate
                        // Use extracted_lowest (Float) first, then fall back to lowest (String with currency)
                        const ratePerNight =
                          (hotel.rate_per_night?.extracted_lowest !== undefined && hotel.rate_per_night?.extracted_lowest !== null)
                            ? hotel.rate_per_night.extracted_lowest
                            : hotel.rate_per_night?.lowest || null;

                        const rating = hotel.overall_rating ? `${hotel.overall_rating.toFixed(1)} ⭐` : null;
                        const reviews = hotel.reviews ? `${hotel.reviews.toLocaleString()} reviews` : null;

                        return (
                          <div
                            key={index}
                            className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-blue-200 bg-white/60 hover:border-blue-200"
                            }`}
                            onClick={async () => {
                              setSelectedHotelIndexByCity(prev => ({ ...prev, [currentHotelCityIndex]: index }));

                              // Update selection in database
                              const token = getAuthToken();
                              if (!token || !tripId) return;

                              let hotelId = currentCityHotelIds[index];

                              // If hotel_id not available yet, wait a moment and check again
                              if (!hotelId) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                hotelId = currentCityHotelIds[index];
                              }

                              // Try to save selection - if hotel_id is available
                              if (hotelId) {
                                try {
                                  const response = await fetch(getApiUrl("api/hotels/select"), {
                                    method: "PUT",
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      trip_id: tripId,
                                      hotel_id: hotelId,
                                      is_selected: true,
                                    }),
                                  });

                                  const result = await response.json();
                                  if (result.success) {
                                    console.log("Successfully updated hotel selection");
                                  }
                                } catch (error) {
                                  console.error("Error updating hotel selection:", error);
                                }
                              } else {
                                // Retry after a delay if hotel_id becomes available
                                setTimeout(async () => {
                                  const retryHotelId = currentCityHotelIds[index];
                                  if (retryHotelId) {
                                    try {
                                      await fetch(getApiUrl("api/hotels/select"), {
                                        method: "PUT",
                                        headers: {
                                          Authorization: `Bearer ${token}`,
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          trip_id: tripId,
                                          hotel_id: retryHotelId,
                                          is_selected: true,
                                        }),
                                      });
                                    } catch (error) {
                                      console.error("Error updating hotel selection (retry):", error);
                                    }
                                  }
                                }, 1000);
                              }
                            }}
                          >
                            <div className="flex gap-3">
                              {/* Hotel Image */}
                              {hotelImage && (
                                <div className="flex-shrink-0">
                                  <img
                                    src={hotelImage}
                                    alt={hotel.name}
                                    className="w-24 h-24 object-cover rounded-md"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}

                              {/* Hotel Info */}
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{hotel.name}</p>
                                  {hotel.hotel_class && (
                                    <p className="text-[11px] text-slate-500">{hotel.hotel_class}</p>
                                  )}
                                </div>

                                {hotel.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-2">{hotel.description}</p>
                                )}

                                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                  {rating && <span>{rating}</span>}
                                  {reviews && <span>{reviews}</span>}
                                </div>

                                {hotel.amenities && hotel.amenities.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {hotel.amenities.slice(0, 3).map((amenity: string, amenityIdx: number) => (
                                      <span key={amenityIdx} className="text-[10px] px-2 py-0.5 bg-blue-50 rounded text-slate-600">
                                        {amenity}
                                      </span>
                                    ))}
                                    {hotel.amenities.length > 3 && (
                                      <span className="text-[10px] text-slate-500">+{hotel.amenities.length - 3} more</span>
                                    )}
                                  </div>
                                )}

                                {/* Booking Options Dropdown */}
                                {hotel.serpapi_property_details_link && (
                                  <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                                    <Collapsible
                                      open={expandedBookingOptions[index] || false}
                                      onOpenChange={(open) => {
                                        setExpandedBookingOptions({ ...expandedBookingOptions, [index]: open });
                                        if (open && hotel.serpapi_property_details_link && !propertyDetails[index] && !isFetchingPropertyDetails[index]) {
                                          fetchPropertyDetails(hotel.serpapi_property_details_link, index);
                                        }
                                      }}
                                    >
                                      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 w-full">
                                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedBookingOptions[index] ? "rotate-180" : ""}`} />
                                        Booking options
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-2 space-y-2">
                                        {isFetchingPropertyDetails[index] ? (
                                          <p className="text-[11px] text-slate-500">Loading booking options...</p>
                                        ) : propertyDetails[index] ? (
                                          (() => {
                                            const details = propertyDetails[index];
                                            // Extract booking options only from featured_prices array
                                            const bookingOptions = details.featured_prices && Array.isArray(details.featured_prices)
                                              ? details.featured_prices
                                              : [];

                                            if (bookingOptions.length === 0) {
                                              return (
                                                <p className="text-[11px] text-slate-500">No booking options available</p>
                                              );
                                            }

                                            return (
                                              <div className="space-y-2">
                                                {bookingOptions.map((option: any, optionIdx: number) => {
                                                  const source = option.source || 'Booking site';
                                                  const price = option.rate_per_night?.lowest || null;
                                                  const link = option.link || option.url || null;

                                                  return (
                                                    <div key={optionIdx} className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200">
                                                      <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-semibold text-slate-800 truncate">{source}</p>
                                                        {price && (
                                                          <p className="text-[10px] text-emerald-400">{price} / night</p>
                                                        )}
                                                      </div>
                                                      {link && (
                                                        <Button
                                                          size="sm"
                                                          className="h-6 px-3 text-[10px] bg-blue-500 hover:bg-blue-600 text-white flex-shrink-0 ml-2"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(link, '_blank', 'noopener,noreferrer');
                                                          }}
                                                        >
                                                          Book
                                                        </Button>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            );
                                          })()
                                        ) : (
                                          <p className="text-[11px] text-slate-500">Click to load booking options</p>
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                                  <div className="flex flex-col">
                                    {ratePerNight ? (
                                      <p className="text-sm font-semibold text-emerald-400">
                                        ${formatPrice(ratePerNight)} / night
                                      </p>
                                    ) : (
                                      <p className="text-sm font-semibold text-slate-500">Price not available</p>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <span className="text-xs text-blue-400">✓ Selected</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="pt-3 border-t border-blue-200 flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 border-blue-200 text-slate-900 hover:bg-blue-50 disabled:opacity-40"
                      disabled={currentHotelCityIndex === 0}
                      onClick={() => {
                        setCurrentHotelCityIndex(prev => prev - 1);
                      }}
                    >
                      ← Previous
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                      disabled={currentCitySelectedIndex === null}
                      onClick={async () => {
                        if (isLastSegment) {
                          // All hotels booked, continue to activities
                          setHasConfirmedHotels(true);
                          
                          // Generate activities when moving from hotels to activities
                          if (!tripId) return;

                          try {
                            setIsGeneratingActivities(true);

                            // Save preferences first so activities can reflect latest constraints
                            if (tripPreferences) {
                              await savePreferences();
                            }

                            const token = getAuthToken();
                            if (!token) return;

                            const response = await fetch(getApiUrl(`api/trips/${tripId}/generate-activities`), {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                testMode: useTestActivities,
                                selected_cities: tripPreferences?.selected_cities ?? [],
                              }),
                            });

                            const result = await response.json();

                            if (response.ok && result.success && Array.isArray(result.activities)) {
                              setActivities(result.activities);

                              if (result.activities.length > 0) {
                                const assistantMessage: Message = {
                                  role: "assistant",
                                  content:
                                    "I pulled together a small set of activity ideas based on your preferences. Swipe through them below and tell me what you like.",
                                  timestamp: formatTime(),
                                };
                                setMessages((prev) => [...prev, assistantMessage]);
                              } else {
                                window.alert(
                                  "I wasn't able to find good activity ideas just yet. You can adjust your preferences or try again."
                                );
                              }
                            } else {
                              console.error("Failed to generate activities:", result.message);
                            }
                          } catch (error) {
                            console.error("Error generating activities:", error);
                          } finally {
                            setIsGeneratingActivities(false);
                          }
                          
                          // Navigate to activities tab
                          setActiveTab("activities");
                        } else {
                          // Move to next city
                          setCurrentHotelCityIndex(prev => prev + 1);
                        }
                        }}
                      >
                        {isGeneratingActivities
                          ? useTestActivities
                            ? "Loading test activities..."
                            : "Finding activities..."
                          : isLastSegment
                            ? "Continue to Activities"
                            : "Next City →"}
                      </Button>
                    </div>
                  </>
                </div>
              </div>
            );
          })()}
          {hasStartedPlanning && hasConfirmedHotels && activeTab === "summary" && (
            <div className="flex justify-center">
              <div className="w-full max-w-4xl bg-white border border-blue-100 text-slate-900 rounded-lg px-6 py-5 shadow-lg space-y-4">
                {isGeneratingFinalItinerary ? (
                  <div className="flex items-center gap-3 py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400"></div>
                    <p className="text-sm text-slate-600">Generating your final itinerary...</p>
                  </div>
                ) : finalItinerary ? (
                  <div className="space-y-6">
                    <div className="border-b border-blue-200 pb-4">
                      <h3 className="text-lg font-bold text-slate-900 mb-1">{finalItinerary.trip_title}</h3>
                      <p className="text-sm text-slate-500">{finalItinerary.destination} • {finalItinerary.num_days} days</p>
                      {finalItinerary.total_budget && (
                        <p className="text-xs text-emerald-400 mt-1">Budget: ${finalItinerary.total_budget.toLocaleString()}</p>
                      )}
                    </div>

                    {finalItinerary.days.map((day: any, dayIndex: number) => {
                      const localDate = day.date ? parseLocalDate(day.date) : null;
                      const date = localDate
                        ? localDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })
                        : `Day ${day.day_number}`;
                      return (
                        <div key={day.day_number} className="bg-blue-50 rounded-lg p-5 border border-blue-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-blue-200 pb-3">
                            <div>
                              <h4 className="text-base font-semibold text-slate-900">Day {day.day_number}</h4>
                              <p className="text-xs text-slate-500">{date}</p>
                            </div>
                          </div>

                          {/* Outbound Flight */}
                          {day.outbound_flight && (
                            <div className="bg-blue-50 rounded-md p-3 border border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-blue-600 text-sm font-semibold">✈️ Outbound Flight</span>
                                {day.outbound_flight.price && (
                                  <span className="text-xs text-slate-600">${day.outbound_flight.price.toLocaleString()}</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600">
                                {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                                {day.outbound_flight.total_duration && (
                                  <span className="text-slate-500 ml-2">• {Math.floor(day.outbound_flight.total_duration / 60)}h {day.outbound_flight.total_duration % 60}m</span>
                                )}
                </p>
              </div>
                          )}

                          {/* Hotel */}
                          {day.hotel && (
                            <div className="bg-yellow-50 rounded-md p-3 border border-yellow-200">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-yellow-700 text-sm font-semibold">🏨 Hotel</span>
                                  {day.hotel.overall_rating && (
                                    <span className="text-xs text-yellow-500">⭐ {day.hotel.overall_rating}</span>
                                  )}
            </div>
                                {day.hotel.rate_per_night && (
                                  <span className="text-xs text-slate-600">${day.hotel.rate_per_night.toLocaleString()}/night</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-900 font-medium">{day.hotel.name}</p>
                                {day.hotel.link && (
                                  <a
                                    href={day.hotel.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                                  >
                                    View →
                                  </a>
                                )}
                              </div>
                              {day.hotel.location && (
                                <p className="text-xs text-slate-500 mt-1">📍 {day.hotel.location}</p>
                              )}
                            </div>
                          )}

                          {/* Activities */}
                          {day.activities && day.activities.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-600 mb-2">Activities</p>
                              {day.activities.map((activity: any, actIndex: number) => (
                                <div
                                  key={actIndex}
                                  className="bg-blue-50/70 rounded-md p-3 border border-blue-200/50 hover:border-emerald-500/50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                      <p className="text-sm font-medium text-slate-900">{activity.name}</p>
                                        {activity.source === 'user_selected' && (
                                          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Your Pick</span>
                                        )}
                                      </div>
                                      {activity.location && (
                                        <p className="text-xs text-slate-500 mb-1">📍 {activity.location}</p>
                                      )}
                                      <div className="flex items-center gap-3 text-xs text-slate-500">
                                        {activity.category && (
                                          <span className="capitalize">{activity.category}</span>
                                        )}
                                        {activity.duration && (
                                          <span>⏱️ {activity.duration}</span>
                                        )}
                                        {activity.cost_estimate && (
                                          <span className="text-emerald-400">${activity.cost_estimate}</span>
                                        )}
                                      </div>
                                    </div>
                                    {activity.source_url && (
                                      <a
                                        href={activity.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-400 hover:text-blue-300 underline whitespace-nowrap"
                                      >
                                        Learn More →
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Return Flight */}
                          {day.return_flight && (
                            <div className="bg-blue-50 rounded-md p-3 border border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-blue-600 text-sm font-semibold">✈️ Return Flight</span>
                                {day.return_flight.price && (
                                  <span className="text-xs text-slate-600">${day.return_flight.price.toLocaleString()}</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600">
                                {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                                {day.return_flight.total_duration && (
                                  <span className="text-slate-500 ml-2">• {Math.floor(day.return_flight.total_duration / 60)}h {day.return_flight.total_duration % 60}m</span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {tripId && (
                      <div className="mt-6 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 border-blue-200 bg-white text-xs text-slate-900 hover:bg-blue-50"
                          onClick={() => navigate(`/trip/${tripId}/final-itinerary`)}
                        >
                          View / edit full itinerary
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-slate-500 mb-4">Ready to generate your final itinerary!</p>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400"
                      onClick={generateFinalItinerary}
                      disabled={isGeneratingFinalItinerary}
                    >
                      {isGeneratingFinalItinerary ? "Generating..." : "Generate Final Itinerary"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Trip sketch prompt removed - automatically proceed to flights after activities */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Chat popup - only shown in known mode */}
      {isChatOpen && planningMode === "known" && (
        <div className="fixed bottom-20 right-4 z-40 w-full max-w-md">
          <Card className="shadow-xl border border-blue-200 bg-white/95 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between py-2">
              <CardTitle className="text-sm">Chat with Pindrop</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-slate-800"
                onClick={() => setIsChatOpen(false)}
              >
                <span className="text-lg leading-none">×</span>
              </Button>
            </CardHeader>
            <CardContent className="pt-1">
              <ScrollArea className="h-64 pr-2">
                <div className="space-y-3">
                  {isLoadingHistory && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-blue-200 text-slate-900 rounded-lg px-3 py-2 shadow-sm">
                        <p className="text-xs">Loading conversation history...</p>
          </div>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm text-xs ${
                          message.role === "user"
                            ? "bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 shadow-lg"
                            : "bg-white border border-blue-200 text-slate-900"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {message.content}
                        </div>
                        <p
                          className={`text-[10px] mt-1 ${
                            message.role === "user"
                              ? "text-teal-100"
                              : "text-muted-foreground"
                          }`}
                        >
                          {message.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isCreatingTrip && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-blue-200 text-slate-900 rounded-lg px-3 py-2 shadow-sm text-xs">
                        <p>Creating your trip...</p>
                      </div>
                    </div>
                  )}
                  {isLoading && !isCreatingTrip && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-blue-200 text-slate-900 rounded-lg px-3 py-2 shadow-sm text-xs">
                        <p>Thinking...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              <div className="mt-3 flex gap-2">
          <Input
            type="text"
                  placeholder="Ask a quick question about this trip..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
                  className="h-9 text-xs"
          />
          <Button
            type="button"
            onClick={() => sendMessage()}
            disabled={!inputMessage.trim() || isLoading}
                  className="h-9 px-3 text-xs bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            id="chat-send-button"
          >
                  Send
          </Button>
        </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Floating chat launcher - hidden in explore mode */}
      {planningMode !== "explore" && (
        <div className="fixed bottom-6 right-6 z-30">
          <Button
            size="sm"
            className="rounded-full shadow-lg bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-xs px-4 py-2"
            onClick={() => setIsChatOpen(true)}
          >
            Chat with Pindrop
          </Button>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;

