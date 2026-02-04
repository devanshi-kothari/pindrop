import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Maximize2, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
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
  });
  const [isSavingRestaurantPreferences, setIsSavingRestaurantPreferences] = useState(false);
  const [hasConfirmedRestaurants, setHasConfirmedRestaurants] = useState(false);
  const [hasStartedHotels, setHasStartedHotels] = useState(false);
  const [hotels, setHotels] = useState<any[]>([]);
  const [isFetchingHotels, setIsFetchingHotels] = useState(false);
  const [selectedHotelIndex, setSelectedHotelIndex] = useState<number | null>(null);
  const [hasConfirmedHotels, setHasConfirmedHotels] = useState(false);
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
  const [isLockingDestination, setIsLockingDestination] = useState(false);
  const [hasLockedDestination, setHasLockedDestination] = useState(
    planningMode === "known" || hasDestinationLocked
  );
  const [activeTab, setActiveTab] = useState<"activities" | "restaurants" | "flights" | "hotels" | "summary">(
    "activities"
  );
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [orderedCities, setOrderedCities] = useState<string[]>([]); // Ordered list of cities to visit (allows duplicates)
  const [hasConfirmedCityOrder, setHasConfirmedCityOrder] = useState(false); // Whether user has confirmed the city order
  const [newCityInput, setNewCityInput] = useState(""); // Input for adding new cities

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
          setTripPreferences(result.preferences);
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

  // Initialize ordered cities when preferences are loaded or when switching to flights tab
  useEffect(() => {
    if (activeTab === "flights" && hasLoadedPreferences && orderedCities.length === 0 && !hasConfirmedCityOrder) {
      // Extract cities from tripPreferences.selected_cities or from activities
      const citiesFromPreferences = tripPreferences?.selected_cities || [];
      const citiesFromActivities = Array.from(
        new Set(
          activities
            .map((a) => a.city || a.location)
            .filter((c): c is string => !!c && typeof c === "string")
        )
      );
      
      // Use selected_cities if available, otherwise use cities from activities, otherwise use trip destination
      const initialCities = citiesFromPreferences.length > 0
        ? citiesFromPreferences
        : citiesFromActivities.length > 0
        ? citiesFromActivities
        : tripDestination
        ? [tripDestination]
        : [];
      
      if (initialCities.length > 0) {
        setOrderedCities(initialCities);
      }
    }
  }, [activeTab, hasLoadedPreferences, tripPreferences, activities, tripDestination, orderedCities.length, hasConfirmedCityOrder]);

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

  const [useTestActivities, setUseTestActivities] = useState(false);
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

  // Helper function to parse time string and extract hour (24-hour format)
  const parseTimeToHour = (timeStr: string | null | undefined): number | null => {
    if (!timeStr) return null;
    
    // Try to parse formats like "7:00 PM", "19:00", "7PM", etc.
    const time = timeStr.trim().toUpperCase();
    
    // Handle 12-hour format with AM/PM
    const amPmMatch = time.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/);
    if (amPmMatch) {
      let hour = parseInt(amPmMatch[1], 10);
      const amPm = amPmMatch[3];
      if (amPm === "PM" && hour !== 12) hour += 12;
      if (amPm === "AM" && hour === 12) hour = 0;
      return hour;
    }
    
    // Handle 24-hour format
    const hourMatch = time.match(/(\d{1,2}):?(\d{2})?/);
    if (hourMatch) {
      return parseInt(hourMatch[1], 10);
    }
    
    return null;
  };

  // Calculate days allocation per city based on activity counts and flight timings
  const calculateCityDaysAllocation = (): Array<{ city: string; days: number; startDate: string | null; endDate: string | null }> => {
    if (orderedCities.length === 0) return [];

    // Get flight timing information
    let arrivalTime: string | null = null;
    let departureTime: string | null = null;
    
    if (selectedOutboundIndex !== null && bestFlights[selectedOutboundIndex]) {
      const outboundFlight = bestFlights[selectedOutboundIndex];
      const outboundFlights = outboundFlight.flights || [];
      const lastOutbound = outboundFlights[outboundFlights.length - 1];
      arrivalTime = lastOutbound?.arrival_airport?.time || null;
    }
    
    if (selectedReturnIndex !== null && returnFlights[selectedReturnIndex]) {
      const returnFlight = returnFlights[selectedReturnIndex];
      const returnFlightLegs = returnFlight.flights || [];
      const firstReturn = returnFlightLegs[0];
      departureTime = firstReturn?.departure_airport?.time || null;
    }
    
    // Check if we need to skip activities on first/last day
    const arrivalHour = parseTimeToHour(arrivalTime);
    const departureHour = parseTimeToHour(departureTime);
    const skipActivitiesOnArrivalDay = arrivalHour !== null && arrivalHour >= 19; // 7pm or later
    const skipActivitiesOnDepartureDay = departureHour !== null && departureHour <= 12; // 12pm or earlier

    // First, group all activities by city name (case-insensitive)
    const activitiesByCity = new Map<string, Array<typeof activities[0]>>();
    
    activities.forEach((activity) => {
      const activityCity = (activity.city || activity.location || "").trim();
      if (!activityCity) return;
      
      const normalizedCity = activityCity.toLowerCase();
      if (!activitiesByCity.has(normalizedCity)) {
        activitiesByCity.set(normalizedCity, []);
      }
      activitiesByCity.get(normalizedCity)!.push(activity);
    });

    // Count activities per city occurrence (splitting across duplicates)
    const cityActivityCounts = new Map<number, number>(); // Map by index in orderedCities
    
    // For each city in the ordered list, find which activities belong to it
    // If a city appears multiple times, split activities evenly across occurrences
    orderedCities.forEach((city, index) => {
      const normalizedCity = city.trim().toLowerCase();
      const cityActivities = activitiesByCity.get(normalizedCity) || [];
      
      // Count how many times this city appears in orderedCities
      const cityOccurrences = orderedCities.filter(
        (c) => c.trim().toLowerCase() === normalizedCity
      );
      const occurrenceIndex = orderedCities
        .slice(0, index + 1)
        .filter((c) => c.trim().toLowerCase() === normalizedCity).length - 1;
      
      // Split activities evenly across all occurrences of this city
      const totalOccurrences = cityOccurrences.length;
      const activitiesPerOccurrence = Math.ceil(cityActivities.length / totalOccurrences);
      const startIndex = occurrenceIndex * activitiesPerOccurrence;
      const endIndex = Math.min(startIndex + activitiesPerOccurrence, cityActivities.length);
      
      // Count activities assigned to this specific occurrence
      const assignedActivities = cityActivities.slice(startIndex, endIndex);
      cityActivityCounts.set(index, assignedActivities.length);
    });

    // Get total number of days from trip preferences
    let totalDays = tripPreferences?.num_days || null;
    
    // If num_days is not set, calculate from start_date and end_date
    if (!totalDays && tripPreferences?.start_date && tripPreferences?.end_date) {
      const start = new Date(tripPreferences.start_date);
      const end = new Date(tripPreferences.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    }

    // If we still don't have total days, use a default (e.g., 7 days)
    if (!totalDays) {
      totalDays = 7;
    }

    // Calculate total activity count
    const totalActivities = Array.from(cityActivityCounts.values()).reduce((sum, count) => sum + count, 0);

    // Allocate days proportionally based on activity counts
    // If a city has no activities, give it at least 1 day
    const allocations: Array<{ city: string; days: number; startDate: string | null; endDate: string | null }> = [];
    const minDaysPerCity = 1;
    const minDaysTotal = orderedCities.length * minDaysPerCity;
    
    // Calculate days per city
    let cityDays: number[] = [];
    
    if (minDaysTotal > totalDays) {
      // Not enough days - distribute evenly
      const daysPerCity = Math.floor(totalDays / orderedCities.length);
      const extraDays = totalDays % orderedCities.length;
      
      cityDays = orderedCities.map((_, index) => 
        daysPerCity + (index < extraDays ? 1 : 0)
      );
    } else {
      // We have enough days - allocate proportionally
      const remainingDaysAfterMin = totalDays - minDaysTotal;
      
      // Start with minimum days for each city
      cityDays = orderedCities.map(() => minDaysPerCity);
      
      // Allocate remaining days proportionally based on activity counts
      if (remainingDaysAfterMin > 0 && totalActivities > 0) {
        // Calculate proportional allocation using index-based counts
        const proportionalAllocations = orderedCities.map((city, index) => {
          const activityCount = cityActivityCounts.get(index) || 0;
          const proportion = activityCount / totalActivities;
          return Math.round(proportion * remainingDaysAfterMin);
        });

        // Adjust to ensure we don't exceed remaining days
        const totalProportional = proportionalAllocations.reduce((sum, days) => sum + days, 0);
        const adjustment = remainingDaysAfterMin - totalProportional;
        
        // Distribute adjustment (add/subtract days to closest values)
        if (adjustment !== 0) {
          const sorted = proportionalAllocations
            .map((days, index) => ({ days, index }))
            .sort((a, b) => (adjustment > 0 ? b.days - a.days : a.days - b.days));
          
          for (let i = 0; i < Math.abs(adjustment) && i < sorted.length; i++) {
            proportionalAllocations[sorted[i].index] += adjustment > 0 ? 1 : -1;
          }
        }

        // Apply proportional allocations
        cityDays = cityDays.map((days, index) => days + proportionalAllocations[index]);
      } else if (remainingDaysAfterMin > 0) {
        // No activities - distribute remaining days evenly
        const daysPerCity = Math.floor(remainingDaysAfterMin / orderedCities.length);
        const extraDays = remainingDaysAfterMin % orderedCities.length;
        
        cityDays = cityDays.map((days, index) => 
          days + daysPerCity + (index < extraDays ? 1 : 0)
        );
      }
    }

    // Calculate dates for each city, accounting for flight timings
    let currentDate = tripPreferences?.start_date ? new Date(tripPreferences.start_date) : null;
    
    orderedCities.forEach((city, index) => {
      let days = cityDays[index];
      let effectiveDays = days; // Days with activities
      
      // Adjust for flight timings
      const isFirstCity = index === 0;
      const isLastCity = index === orderedCities.length - 1;
      
      // If arrival is 7pm or later, first day of first city has no activities
      if (isFirstCity && skipActivitiesOnArrivalDay) {
        effectiveDays = Math.max(1, days - 1); // At least 1 day, but reduce effective days
      }
      
      // If departure is 12pm or earlier, last day of last city has no activities
      if (isLastCity && skipActivitiesOnDepartureDay) {
        effectiveDays = Math.max(1, days - 1); // At least 1 day, but reduce effective days
      }
      
      const startDate = currentDate ? new Date(currentDate) : null;
      const endDate = startDate ? new Date(startDate.getTime() + (days - 1) * 24 * 60 * 60 * 1000) : null;
      
      allocations.push({
        city,
        days: effectiveDays, // Store effective days (with activities)
        startDate: startDate?.toISOString().split('T')[0] || null,
        endDate: endDate?.toISOString().split('T')[0] || null
      });
      
      if (currentDate) {
        currentDate = new Date(currentDate.getTime() + days * 24 * 60 * 60 * 1000);
      }
    });

    return allocations;
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

  // Fetch hotels from SerpAPI
  const fetchHotels = async () => {
    if (!tripId || !tripPreferences?.start_date || !tripPreferences?.end_date) {
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

    try {
      setIsFetchingHotels(true);
      const token = getAuthToken();
      if (!token) return;

      const params = new URLSearchParams({
        location: hotelLocation,
        check_in_date: tripPreferences.start_date,
        check_out_date: tripPreferences.end_date,
      });

      console.log("Fetching hotels with params:", {
        location: hotelLocation,
        check_in_date: tripPreferences.start_date,
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
            if (hotelsResult.selected_hotel_index !== null) {
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

  // Derived helpers for dates / num_days validation and UX
  const { dateError, computedNumDays } = (() => {
    let localError: string | null = null;
    let localNumDays: number | null = null;

    if (tripPreferences?.start_date && tripPreferences?.end_date) {
      const start = new Date(tripPreferences.start_date);
      const end = new Date(tripPreferences.end_date);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        localError = "Please enter valid dates.";
      } else if (end < start) {
        localError = "End date must be on or after the start date.";
      } else {
        const diffMs = end.getTime() - start.getTime();
        localNumDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    return { dateError: localError, computedNumDays: localNumDays };
  })();

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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Phase 1: Trip preferences for this itinerary
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    These answers help tailor a day-by-day plan. They start from your profile
                    defaults, but you can tweak them for this specific trip.
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-slate-600">
                      Use test activities
                    </Label>
                    <Switch
                      checked={useTestActivities}
                      onCheckedChange={(val) => setUseTestActivities(val)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
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
                      onClick={generateActivities}
                      disabled={isGeneratingActivities}
                    >
                      {isGeneratingActivities
                        ? useTestActivities
                          ? "Loading test activities..."
                          : "Finding activities..."
                        : "Generate activities"}
                    </Button>
                  </div>
                </div>
              </div>
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
          {tripId && (
            <div className="mt-6 mb-3 flex items-center justify-center">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full max-w-xl">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="activities" className="text-xs">Activities</TabsTrigger>
                  <TabsTrigger value="restaurants" className="text-xs">Restaurants</TabsTrigger>
                  <TabsTrigger value="flights" className="text-xs">Flights</TabsTrigger>
                  <TabsTrigger value="hotels" className="text-xs">Hotels</TabsTrigger>
                  <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          {tripId && activities.length > 0 && activeTab === "activities" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Phase 2: Explore activities
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
                      // Skip trip sketch and go straight to flights
                      setHasConfirmedTripSketch(true);
                      setHasShownTripSketchPrompt(true);
                      setActiveTab("flights");
                    }}
                  >
                    I&apos;m done with activities
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
          {activeTab === "restaurants" && restaurants.length === 0 && (
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
          {activeTab === "restaurants" && restaurants.length > 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Phase 2: Explore restaurants
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
          {itinerarySummary && activeTab === "summary" && (
            <div className="flex justify-start">
              <div className="bg-white border border-emerald-500/60 text-slate-900 rounded-lg px-4 py-3 shadow-sm max-w-[75%]">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {itinerarySummary}
                </p>
              </div>
            </div>
          )}
          {itineraryDays.length > 0 && activeTab === "summary" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Phase 5: Day-by-day trip sketch
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
          {hasConfirmedTripSketch && activeTab === "flights" && (
            <div className="flex justify-center">
              <div className="w-full max-w-3xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Phase 3: Plan your flights
                </p>

                {/* City Ordering UI - shown before flight booking */}
                {!hasConfirmedCityOrder && (
                  <div className="space-y-3 border-b border-blue-200 pb-4">
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-xs font-semibold">
                        Order your cities
                      </Label>
                      <p className="text-[10px] text-slate-600">
                        Arrange the cities you want to visit in order. You can visit the same city multiple times.
                      </p>
                      
                      {/* List of ordered cities */}
                      {orderedCities.length > 0 && (
                        <div className="space-y-2 mt-3">
                          {orderedCities.map((city, index) => (
                            <div
                              key={`${city}-${index}`}
                              className="flex items-center gap-2 p-2 border border-blue-200 rounded bg-white"
                            >
                              <span className="text-[10px] text-slate-500 font-semibold w-6 text-center">
                                {index + 1}
                              </span>
                              <span className="flex-1 text-xs text-slate-900 font-medium">
                                {city}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 hover:bg-blue-100"
                                  disabled={index === 0}
                                  onClick={() => {
                                    if (index > 0) {
                                      const newCities = [...orderedCities];
                                      [newCities[index - 1], newCities[index]] = [newCities[index], newCities[index - 1]];
                                      setOrderedCities(newCities);
                                    }
                                  }}
                                >
                                  <ChevronUp className="h-3 w-3 text-slate-600" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 hover:bg-blue-100"
                                  disabled={index === orderedCities.length - 1}
                                  onClick={() => {
                                    if (index < orderedCities.length - 1) {
                                      const newCities = [...orderedCities];
                                      [newCities[index], newCities[index + 1]] = [newCities[index + 1], newCities[index]];
                                      setOrderedCities(newCities);
                                    }
                                  }}
                                >
                                  <ChevronDown className="h-3 w-3 text-slate-600" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 hover:bg-red-100"
                                  onClick={() => {
                                    setOrderedCities(orderedCities.filter((_, i) => i !== index));
                                  }}
                                >
                                  <X className="h-3 w-3 text-slate-600" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add city input */}
                      <div className="flex gap-2 mt-3">
                        <Input
                          type="text"
                          value={newCityInput}
                          onChange={(e) => setNewCityInput(e.target.value)}
                          placeholder="Add a city (e.g., Paris, Tokyo)"
                          className="h-8 bg-white border-blue-200 text-xs text-slate-900"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newCityInput.trim()) {
                              setOrderedCities([...orderedCities, newCityInput.trim()]);
                              setNewCityInput("");
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white"
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

                      {/* Confirm button */}
                      {orderedCities.length > 0 && (
                        <Button
                          size="sm"
                          className="w-full h-8 bg-emerald-500 hover:bg-emerald-600 text-xs text-white mt-3"
                          onClick={() => {
                            setHasConfirmedCityOrder(true);
                          }}
                        >
                          Confirm City Order ({orderedCities.length} {orderedCities.length === 1 ? "city" : "cities"})
                        </Button>
                      )}

                      {orderedCities.length === 0 && (
                        <p className="text-[10px] text-slate-500 italic mt-2">
                          Add at least one city to continue.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Flight booking UI - only shown after city order is confirmed */}
                {hasConfirmedCityOrder && (
                  <>
                {/* City Order Summary */}
                {orderedCities.length > 0 && (
                  <div className="space-y-2 pb-3 border-b border-blue-200">
                    <Label className="text-slate-800 text-xs font-semibold">Your city order</Label>
                    <div className="flex flex-wrap gap-2">
                      {orderedCities.map((city, index) => (
                        <div
                          key={`${city}-${index}`}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs"
                        >
                          <span className="text-slate-500 font-semibold">{index + 1}.</span>
                          <span className="text-slate-900">{city}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                      Flights will be searched to the first city: <span className="font-semibold text-slate-700">{orderedCities[0]}</span>
                    </p>
                  </div>
                )}

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
                    // Use first city from ordered cities if available, otherwise fall back to getArrivalLocation
                    const arrivalLocation = orderedCities.length > 0 ? orderedCities[0] : getArrivalLocation();
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
                  </div>
                )}

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

                    {/* Days and Dates Allocation - shown after both flights are selected */}
                    {selectedOutboundIndex !== null && selectedReturnIndex !== null && (() => {
                      const cityAllocations = calculateCityDaysAllocation();
                      return cityAllocations.length > 0 ? (
                        <div className="space-y-3 pt-4 border-t border-blue-200">
                          <div className="space-y-2">
                            <Label className="text-slate-800 text-xs font-semibold">
                              Days allocation per city
                            </Label>
                            <p className="text-[10px] text-slate-600">
                              Days are allocated based on the number of activities in each city, adjusted for flight timings.
                            </p>
                            
                            <div className="space-y-2 mt-3">
                              {cityAllocations.map((allocation, index) => {
                                // Count activities for this specific city occurrence (handling duplicates)
                                const normalizedCity = allocation.city.trim().toLowerCase();
                                
                                // Find all activities for this city
                                const allCityActivities = activities.filter((activity) => {
                                  const activityCity = (activity.city || activity.location || "").trim();
                                  return activityCity.toLowerCase() === normalizedCity;
                                });
                                
                                // Count how many times this city appears in orderedCities
                                const cityOccurrences = orderedCities.filter(
                                  (c) => c.trim().toLowerCase() === normalizedCity
                                );
                                const occurrenceIndex = orderedCities
                                  .slice(0, index + 1)
                                  .filter((c) => c.trim().toLowerCase() === normalizedCity).length - 1;
                                
                                // Split activities evenly across all occurrences
                                const totalOccurrences = cityOccurrences.length;
                                const activitiesPerOccurrence = Math.ceil(allCityActivities.length / totalOccurrences);
                                const startIndex = occurrenceIndex * activitiesPerOccurrence;
                                const endIndex = Math.min(startIndex + activitiesPerOccurrence, allCityActivities.length);
                                
                                // Count activities assigned to this specific occurrence
                                const activityCount = endIndex - startIndex;
                                
                                return (
                                  <div
                                    key={`${allocation.city}-${index}`}
                                    className="flex items-center justify-between p-2 border border-blue-200 rounded bg-white"
                                  >
                                    <div className="flex items-center gap-3 flex-1">
                                      <span className="text-[10px] text-slate-500 font-semibold w-6 text-center">
                                        {index + 1}
                                      </span>
                                      <div className="flex-1">
                                        <span className="text-xs text-slate-900 font-medium">
                                          {allocation.city}
                                        </span>
                                        {activityCount > 0 && (
                                          <span className="text-[10px] text-slate-500 ml-2">
                                            ({activityCount} {activityCount === 1 ? 'activity' : 'activities'})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <div className="text-xs font-semibold text-slate-900">
                                          {allocation.days} {allocation.days === 1 ? 'day' : 'days'}
                                        </div>
                                        {allocation.startDate && allocation.endDate && (
                                          <div className="text-[10px] text-slate-500">
                                            {allocation.startDate === allocation.endDate ? (
                                              allocation.startDate
                                            ) : (
                                              `${allocation.startDate} - ${allocation.endDate}`
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {tripPreferences?.start_date && tripPreferences?.end_date && (
                              <p className="text-[10px] text-slate-500 italic mt-2">
                                Total trip: {tripPreferences.start_date} to {tripPreferences.end_date}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Done Button */}
                    {selectedOutboundIndex !== null && selectedReturnIndex !== null && (
                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                          onClick={() => {
                            setHasConfirmedFlights(true);
                            setHasStartedHotels(true);
                            setActiveTab("hotels");
                          }}
                        >
                          I&apos;m done planning flights. Now let&apos;s move on to hotels
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {hasStartedHotels && activeTab === "hotels" && (
            <div className="flex justify-center">
              <div className="w-full max-w-4xl bg-white border border-blue-100 text-slate-900 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  Phase 4: Book your hotels
                </p>

                {/* Hotel Location and Dates Info */}
                {(() => {
                  const hotelLocation = getArrivalLocation();
                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500 space-y-1">
                        <p>Location: <span className="text-slate-800">{hotelLocation || "Extracting from trip..."}</span></p>
                        {tripPreferences?.start_date && tripPreferences?.end_date && (
                          <>
                            <p>Check-in: <span className="text-slate-800">{tripPreferences.start_date}</span></p>
                            <p>Check-out: <span className="text-slate-800">{tripPreferences.end_date}</span></p>
                          </>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                        disabled={isFetchingHotels || !hotelLocation}
                        onClick={fetchHotels}
                      >
                        {isFetchingHotels ? "Searching for hotels..." : "Search for hotels"}
                      </Button>
                    </div>
                  );
                })()}

                {/* Loading Indicator */}
                {isFetchingHotels && (
                  <div className="space-y-2 pt-2 border-t border-blue-200">
                    <p className="text-xs text-slate-500">Searching for hotels...</p>
                  </div>
                )}

                {/* Hotel Results */}
                {hotels.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-blue-200">
                    <p className="text-xs font-semibold text-slate-600">Available hotels</p>
                    <div className="space-y-3">
                      {hotels.map((hotel, index) => {
                        const isSelected = selectedHotelIndex === index;
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
                              setSelectedHotelIndex(index);

                              // Update selection in database
                              const token = getAuthToken();
                              if (!token || !tripId) return;

                              let hotelId = hotelIds[index];

                              // If hotel_id not available yet, wait a moment and check again
                              if (!hotelId) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                hotelId = hotelIds[index];
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
                                  const retryHotelId = hotelIds[index];
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

                    {/* Done Button */}
                    {selectedHotelIndex !== null && (
                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                          onClick={() => {
                            setHasConfirmedHotels(true);
                            // Automatically generate final itinerary when hotels are confirmed
                            generateFinalItinerary();
                            setActiveTab("summary");
                          }}
                        >
                          I&apos;m done planning hotels
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {hasConfirmedHotels && activeTab === "summary" && (
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

