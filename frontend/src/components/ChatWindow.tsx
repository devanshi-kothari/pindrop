import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Maximize2 } from "lucide-react";
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
import { ChevronDown } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import ActivitySwipeCard from "./ActivitySwipeCard";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWindowProps {
  className?: string;
  tripId?: number | null;
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
  group_type: string;
  safety_notes: string;
  accessibility_notes: string;
  custom_requests: string;
}

const ChatWindow = ({
  className = "",
  tripId = null,
  initialMessage = null,
  onTripCreated,
  planningMode = "known",
  hasDestinationLocked = false,
}: ChatWindowProps) => {
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
  const [departureLocation, setDepartureLocation] = useState("");
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [arrivalId, setArrivalId] = useState<string | null>(null);
  const [isFetchingDepartureCode, setIsFetchingDepartureCode] = useState(false);
  const [isFetchingArrivalCode, setIsFetchingArrivalCode] = useState(false);
  const [bestFlights, setBestFlights] = useState<any[]>([]);
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
  const [hasStartedHotels, setHasStartedHotels] = useState(false);
  const [hotels, setHotels] = useState<any[]>([]);
  const [isFetchingHotels, setIsFetchingHotels] = useState(false);
  const [selectedHotelIndex, setSelectedHotelIndex] = useState<number | null>(null);
  const [hasConfirmedHotels, setHasConfirmedHotels] = useState(false);
  const [propertyDetails, setPropertyDetails] = useState<Record<number, any>>({});
  const [isFetchingPropertyDetails, setIsFetchingPropertyDetails] = useState<Record<number, boolean>>({});
  const [expandedBookingOptions, setExpandedBookingOptions] = useState<Record<number, boolean>>({});
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

  useEffect(() => {
    setHasLockedDestination(planningMode === "known" || hasDestinationLocked);
  }, [planningMode, hasDestinationLocked]);

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
      group_type: "",
      safety_notes: "",
      accessibility_notes: "",
      custom_requests: "",
    };
  };

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = (overrideContent ?? inputMessage).trim();
      if (!content || isLoading) return;

      const userMessage: Message = {
        role: "user",
        content,
        timestamp: formatTime(),
      };

      setMessages((prev) => [...prev, userMessage]);
      if (!overrideContent) {
        setInputMessage("");
      }
      setIsLoading(true);

      const isTripRequest = /want.*go|plan.*trip|visit|travel|to\s+[A-Za-z]/i.test(
        content
      );
      if (
        planningMode === "known" &&
        !tripId &&
        (isTripRequest || content === initialMessage)
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
            message: content,
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
      });

      const result = await response.json();

      if (response.ok && result.success && Array.isArray(result.activities)) {
        setActivities(result.activities);

        const assistantMessage: Message = {
          role: "assistant",
          content:
            result.activities.length > 0
              ? "I pulled together a small set of activity ideas based on your preferences. Swipe through them below and tell me what you like."
              : "I wasn’t able to find good activity ideas just yet. You can adjust your preferences or try again.",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        console.error("Failed to generate activities:", result.message);
      }
    } catch (error) {
      console.error("Error generating activities:", error);
    } finally {
      setIsGeneratingActivities(false);
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

  // Extract arrival location from day 1 of the itinerary
  const getArrivalLocation = (): string | null => {
    if (itineraryDays.length === 0) return null;
    
    // Find day 1 (could be day_number === 1 or the first day in the array)
    const day1 = itineraryDays.find((day) => day.day_number === 1) || itineraryDays[0];
    
    if (!day1) return null;
    
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
    
    // Fallback: use trip destination if available
    return null;
  };

  // Fetch flights from SerpAPI
  const fetchFlights = async () => {
    console.log("fetchFlights called", { tripId, departureId, arrivalId, tripPreferences });
    
    if (!tripId || !departureId || !arrivalId) {
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

      const params = new URLSearchParams({
        departure_id: departureId,
        arrival_id: arrivalId,
        outbound_date: tripPreferences.start_date,
        return_date: tripPreferences.end_date,
      });

      console.log("Fetching flights with params:", {
        departure_id: departureId,
        arrival_id: arrivalId,
        outbound_date: tripPreferences.start_date,
        return_date: tripPreferences.end_date,
      });

      const response = await fetch(getApiUrl(`api/flights/search?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Flight API response status:", response.status);

      const result = await response.json();
      console.log("Flight API result:", result);

      if (response.ok && result.success) {
        let flightsToSet: any[] = [];
        if (Array.isArray(result.best_flights) && result.best_flights.length > 0) {
          flightsToSet = result.best_flights;
        } else if (Array.isArray(result.other_flights) && result.other_flights.length > 0) {
          flightsToSet = result.other_flights;
        }

        if (flightsToSet.length > 0) {
          console.log(`Setting ${flightsToSet.length} best flights:`, flightsToSet);
          setBestFlights(flightsToSet);

          // Save flights to database - save ALL flights returned from API
          try {
            console.log(`Saving ${flightsToSet.length} outbound flights to database...`);
            const saveResponse = await fetch(getApiUrl("api/flights/save-outbound"), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                trip_id: tripId,
                flights: flightsToSet, // Send all flights
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
              console.log(`Saved ${saveResult.saved_count || saveResult.flight_ids.length} outbound flights to database (out of ${saveResult.total_flights || flightsToSet.length} total):`, saveResult);
              // Map flight indices to flight_ids
              const flightIdMap: Record<number, number> = {};
              saveResult.flight_ids.forEach((flightId: number, idx: number) => {
                if (idx < flightsToSet.length) {
                  flightIdMap[idx] = flightId;
                }
              });
              setOutboundFlightIds(flightIdMap);
              
              if (saveResult.saved_count < flightsToSet.length) {
                console.warn(`Warning: Only ${saveResult.saved_count} out of ${flightsToSet.length} flights were saved successfully`);
              }
            } else {
              console.error("Failed to save outbound flights:", saveResult);
            }
          } catch (saveError) {
            console.error("Error saving outbound flights:", saveError);
            // Don't show error to user, just log it
          }
        } else {
          const errorMessage: Message = {
            role: "assistant",
            content: "No flight options found for your search. Please try different dates or airports.",
            timestamp: formatTime(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } else {
        console.error("Flight API error:", result);
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || "Failed to fetch flight options. Please try again.",
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
    if (!tripId || !departureId || !arrivalId || !tripPreferences?.start_date || !tripPreferences?.end_date) {
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

    try {
      setIsFetchingReturnFlights(true);
      const token = getAuthToken();
      if (!token) return;

      // For return flights, use the same departure_id and arrival_id as the original search
      // The departure_token tells SerpAPI which outbound flight was selected and returns matching return flights
      const params = new URLSearchParams({
        departure_id: departureId,
        arrival_id: arrivalId,
        outbound_date: tripPreferences.start_date,
        return_date: tripPreferences.end_date,
        departure_token: departureToken,
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

      if (response.ok && result.success) {
        let flightsToSet: any[] = [];
        if (Array.isArray(result.best_flights) && result.best_flights.length > 0) {
          flightsToSet = result.best_flights;
        } else if (Array.isArray(result.other_flights) && result.other_flights.length > 0) {
          flightsToSet = result.other_flights;
        }
        
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
          const errorMessage: Message = {
            role: "assistant",
            content: "No return flight options found. Please try selecting a different outbound flight.",
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
        setHotels(result.properties);
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

      // Use the serpapi_property_details_link from the hotel response
      const params = new URLSearchParams({
        serpapi_link: serpapiLink,
      });

      console.log("Fetching property details with serpapi_link:", serpapiLink);

      const response = await fetch(getApiUrl(`api/hotels/details?${params.toString()}`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Property details API result:", result);

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

  // Query LLM to get airport code for a location (silent - doesn't save to chat history)
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

      if (response.ok && result.success && result.airport_code) {
        return result.airport_code;
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
      } catch (error) {
        console.error("Error loading persisted data:", error);
        // Don't show error to user, just log it
      }
    };

    loadPersistedData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, isLoadingHistory, loadItineraryDays]);

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
      className={`flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 ${className}`}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <h2 className="text-lg font-semibold text-white">Trip Planner</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Structured trip preferences */}
      {tripId && (planningMode === "known" || hasLockedDestination) && (
        <div className="px-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/70 backdrop-blur text-slate-100">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Phase 1: Trip preferences for this itinerary
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-1">
                    These answers help tailor a day-by-day plan. They start from your profile
                    defaults, but you can tweak them for this specific trip.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-600 bg-slate-900/80 text-slate-100 hover:bg-slate-800 hover:text-white"
                    onClick={savePreferences}
                    disabled={isSavingPreferences || !tripPreferences}
                  >
                    {isSavingPreferences ? "Saving..." : "Save preferences"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                    onClick={generateActivities}
                    disabled={isGeneratingActivities}
                  >
                    {isGeneratingActivities ? "Finding activities..." : "Generate activities"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs sm:text-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-xs">Trip dates</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={tripPreferences?.start_date ?? ""}
                      onChange={(e) => handlePreferenceChange("start_date", e.target.value || null)}
                      className="h-8 bg-slate-950 border-slate-700 text-xs"
                    />
                    <Input
                      type="date"
                      value={tripPreferences?.end_date ?? ""}
                      onChange={(e) => handlePreferenceChange("end_date", e.target.value || null)}
                      className="h-8 bg-slate-950 border-slate-700 text-xs"
                    />
                  </div>
                  {dateError && (
                    <p className="mt-1 text-[11px] text-rose-400">{dateError}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-xs">Rough number of days</Label>
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
                    className="h-8 bg-slate-950 border-slate-700 text-xs"
                    placeholder={computedNumDays !== null ? "" : "ex. 4"}
                  />
                  {computedNumDays !== null && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Automatically calculated from your start and end dates.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-xs">Total trip budget (USD)</Label>
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
                      className="h-8 bg-slate-950 border-slate-700 text-xs"
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
                      className="h-8 bg-slate-950 border-slate-700 text-xs"
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">How full should each day feel?</Label>
                  <RadioGroup
                    value={tripPreferences?.pace ?? ""}
                    onValueChange={(value) =>
                      handlePreferenceChange("pace", value as TripPreferences["pace"])
                    }
                    className="grid grid-cols-1 gap-2"
                  >
                    <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs cursor-pointer hover:border-slate-500">
                      <RadioGroupItem value="slow" />
                      <span>Slow & relaxing</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs cursor-pointer hover:border-slate-500">
                      <RadioGroupItem value="balanced" />
                      <span>Balanced mix</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs cursor-pointer hover:border-slate-500">
                      <RadioGroupItem value="packed" />
                      <span>Packed with activities</span>
                    </label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">Who is this trip for?</Label>
                  <Select
                    value={tripPreferences?.group_type ?? ""}
                    onValueChange={(value) => handlePreferenceChange("group_type", value)}
                  >
                    <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs">
                      <SelectValue placeholder="Select group type" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-700 text-xs">
                      <SelectItem
                        value="solo"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Solo
                      </SelectItem>
                      <SelectItem
                        value="couple"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Couple
                      </SelectItem>
                      <SelectItem
                        value="family"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Family
                      </SelectItem>
                      <SelectItem
                        value="friends"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Friends
                      </SelectItem>
                      <SelectItem
                        value="girls_trip"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Girls' trip
                      </SelectItem>
                      <SelectItem
                        value="work"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Work / team trip
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Label className="text-slate-200 text-xs mt-2">Preferred stay</Label>
                  <Select
                    value={tripPreferences?.accommodation_type ?? ""}
                    onValueChange={(value) => handlePreferenceChange("accommodation_type", value)}
                  >
                    <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs">
                      <SelectValue placeholder="Hotel, Airbnb, hostel..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-700 text-xs">
                      <SelectItem
                        value="hotel"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Hotel
                      </SelectItem>
                      <SelectItem
                        value="airbnb"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Apartment / Airbnb
                      </SelectItem>
                      <SelectItem
                        value="hostel"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Hostel
                      </SelectItem>
                      <SelectItem
                        value="boutique"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        Boutique stay
                      </SelectItem>
                      <SelectItem
                        value="no_preference"
                        className="text-slate-100 data-[highlighted]:bg-yellow-400 data-[highlighted]:text-slate-950"
                      >
                        No strong preference
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">
                    Safety notes (optional)
                  </Label>
                  <Textarea
                    value={tripPreferences?.safety_notes ?? ""}
                    onChange={(e) => handlePreferenceChange("safety_notes", e.target.value)}
                    className="min-h-[60px] bg-slate-950 border-slate-700 text-xs resize-none"
                    placeholder="ex. Safe for a group of girls, well-lit areas, avoid very late nights..."
                  />
                  <Label className="text-slate-200 text-xs mt-2">
                    Accessibility notes (optional)
                  </Label>
                  <Textarea
                    value={tripPreferences?.accessibility_notes ?? ""}
                    onChange={(e) => handlePreferenceChange("accessibility_notes", e.target.value)}
                    className="min-h-[50px] bg-slate-950 border-slate-700 text-xs resize-none"
                    placeholder="ex. Limited walking, step-free access, stroller-friendly..."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">
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
                          className="h-3.5 w-3.5 border-slate-500 data-[state=checked]:bg-emerald-400 data-[state=checked]:border-emerald-400"
                        />
                        <span className="capitalize text-slate-200">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">
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
                          className="h-3.5 w-3.5 border-slate-500 data-[state=checked]:bg-rose-400 data-[state=checked]:border-rose-400"
                        />
                        <span className="capitalize text-slate-200">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200 text-xs">
                  Any other vibes, constraints, or must-dos for this trip?
                </Label>
                <Textarea
                  value={tripPreferences?.custom_requests ?? ""}
                  onChange={(e) => handlePreferenceChange("custom_requests", e.target.value)}
                  className="min-h-[60px] bg-slate-950 border-slate-700 text-xs resize-none"
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
          <Card className="border-slate-800 bg-slate-900/70 backdrop-blur text-slate-100">
            <CardContent className="py-3 space-y-2 text-xs sm:text-sm">
              <p className="text-slate-300">
                Once you&apos;ve chatted with me and decided on a destination, lock it in here to
                start the detailed planning form.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  value={lockDestination}
                  onChange={(e) => setLockDestination(e.target.value)}
                  placeholder="Where did you decide to go?"
                  className="h-8 bg-slate-950 border-slate-700 text-xs"
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
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {isLoadingHistory && (
            <div className="flex justify-start">
              <div className="bg-slate-900/90 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Loading conversation history...</p>
              </div>
            </div>
          )}

          {(() => {
            const firstAssistantIndex = messages.findIndex(
              (m) => m.role === "assistant"
            );
            return messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 shadow-sm ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 shadow-lg"
                    : "bg-slate-900/90 border border-slate-700 text-slate-100"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {(() => {
                    // Lightweight markdown-style bold (**word**) rendering
                    const renderWithBold = (text: string) => {
                      const parts = text.split("**");
                      return parts.map((part, idx) =>
                        idx % 2 === 1 ? (
                          <strong key={idx}>{part}</strong>
                        ) : (
                          <span key={idx}>{part}</span>
                        )
                      );
                    };

                    // For the *first* assistant message, when the LLM returns structured
                    // "Destination Idea {number}:" sections, show:
                    // - an intro paragraph
                    // - a single white "card" at a time with < / > navigation
                    // - a closing "What do you think?" prompt
                    if (
                      message.role === "assistant" &&
                      index === firstAssistantIndex
                    ) {
                      const parts = message.content.split(/(?=Destination Idea\s+\d+:)/i);
                      if (parts.length > 1) {
                        const intro = parts[0].trim();
                        let suggestionSections = parts
                          .slice(1)
                          .map((p) => p.trim())
                          .filter(Boolean)
                          .slice(0, 3);

                        // If the last suggestion block contains trailing global
                        // notes like "Tips and Recommendations" or "What do you
                        // girls think?", separate that tail out so it doesn't
                        // appear inside the destination card.
                        let globalTail: string | null = null;
                        if (suggestionSections.length > 0) {
                          const tailPatterns = [
                            /Tips and Recommendations/i,
                            /Itinerary Suggestions/i,
                            /Tips & Recommendations/i,
                            /What do you girls think\?/i,
                            /What do you think\?/i,
                            /Which of these destinations sparks your interest\?/i,
                            /Would you like me to recommend activities/i,
                          ];
                          const lastIdx = suggestionSections.length - 1;
                          const last = suggestionSections[lastIdx];
                          let cutIndex = -1;

                          for (const pat of tailPatterns) {
                            const match = last.match(pat);
                            if (match) {
                              cutIndex = last.toLowerCase().indexOf(match[0].toLowerCase());
                              break;
                            }
                          }

                          if (cutIndex >= 0) {
                            globalTail = last.slice(cutIndex).trim();
                            suggestionSections[lastIdx] = last.slice(0, cutIndex).trim();
                            if (!suggestionSections[lastIdx]) {
                              suggestionSections = suggestionSections.slice(0, lastIdx);
                            }
                          }
                        }

                        if (suggestionSections.length > 0) {
                          const maxIndex = suggestionSections.length - 1;
                          const activeIndex =
                            destinationCarouselIndices[index] !== undefined
                              ? Math.min(destinationCarouselIndices[index], maxIndex)
                              : 0;

                          const setActiveIndex = (next: number) => {
                            const clamped = Math.max(0, Math.min(maxIndex, next));
                            setDestinationCarouselIndices((prev) => ({
                              ...prev,
                              [index]: clamped,
                            }));
                          };

                          const current = suggestionSections[activeIndex];
                          const [headerLine, ...restLines] = current.split("\n");
                          const rawTitle = headerLine || "";
                          const titleText = rawTitle.replace(
                            /^Destination Idea\s+\d+:\s*/i,
                            ""
                          );
                          const bodyText = restLines.join("\n").trim();

                          return (
                            <div className="space-y-3">
                              {intro && (
                                <div className="text-xs text-slate-200">
                                  {renderWithBold(intro)}
                                </div>
                              )}

                              <div className="rounded-lg bg-white text-slate-900 p-3 shadow-sm space-y-2">
                                <div className="font-semibold">
                                  {renderWithBold(titleText || rawTitle)}
                                </div>
                                {bodyText && (
                                  <div className="text-xs whitespace-pre-wrap">
                                    {renderWithBold(bodyText)}
                                  </div>
                                )}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-xs rounded-full border border-slate-300 disabled:opacity-40"
                                    onClick={() => setActiveIndex(activeIndex - 1)}
                                    disabled={activeIndex === 0}
                                  >
                                    ‹
                                  </button>
                                  <span className="text-[11px] text-slate-600">
                                    Destination {activeIndex + 1} of {suggestionSections.length}
                                  </span>
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-xs rounded-full border border-slate-300 disabled:opacity-40"
                                    onClick={() => setActiveIndex(activeIndex + 1)}
                                    disabled={activeIndex === maxIndex}
                                  >
                                    ›
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                {globalTail ? (
                                  <p className="text-[11px] text-slate-400 whitespace-pre-wrap">
                                    {renderWithBold(globalTail)}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-200">
                                    What do you think? Tell me which ideas you like, or what you&apos;d
                                    like to change.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        }
                      }
                    }

                    // Fallback: render the whole message with bold support.
                    return renderWithBold(message.content);
                  })()}
                </div>
                <p className={`text-xs mt-2 ${
                  message.role === "user" ? "text-teal-100" : "text-muted-foreground"
                }`}>
                  {message.timestamp}
                </p>
                {message.role === "user" && (
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-teal-100">✓✓</span>
                  </div>
                )}
              </div>
            </div>
            ));
          })()}
          {isCreatingTrip && (
            <div className="flex justify-start">
              <div className="bg-slate-900/90 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Creating your trip...</p>
              </div>
            </div>
          )}
          {isLoading && !isCreatingTrip && (
            <div className="flex justify-start">
              <div className="bg-slate-900/90 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Thinking...</p>
              </div>
            </div>
          )}
          {tripId && activities.length > 0 && (
            <div className="flex justify-start">
              <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-4 py-6 shadow-sm">
                <p className="text-xs font-semibold text-slate-300 mb-1">
                  Phase 2: Explore activities
                </p>
                <p className="text-[11px] text-slate-300 mb-4">
                  Swipe right to like, left to pass, or use the buttons below. Swipe up for maybe.
                </p>
                
                {/* Swipe Card Stack */}
                <div className="relative h-[600px] w-full">
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
                          activity={activity}
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
                        <p className="text-sm font-semibold text-slate-300 mb-2">
                          All activities reviewed! 🎉
                        </p>
                        <p className="text-xs text-slate-400">
                          You've reacted to all {activities.length} activities.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress indicator */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    {activities.filter((a) => a.preference === "pending").length === 0
                      ? "All done!"
                      : `${activities.filter((a) => a.preference === "pending").length} remaining`}
                  </p>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                    disabled={!allActivitiesAnswered}
                    onClick={() => setHasConfirmedActivities(true)}
                  >
                    I&apos;m done with activities
                  </Button>
                </div>
              </div>
            </div>
          )}
          {itinerarySummary && (
            <div className="flex justify-start">
              <div className="bg-slate-900/90 border border-emerald-500/60 text-slate-100 rounded-lg px-4 py-3 shadow-sm max-w-[75%]">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {itinerarySummary}
                </p>
              </div>
            </div>
          )}
          {itineraryDays.length > 0 && (
            <div className="flex justify-start">
              <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-300">
                  Phase 3: Day-by-day trip sketch
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
                          className="h-7 px-2 text-xs border-slate-600 text-slate-100 bg-slate-900/80 hover:bg-slate-800 disabled:opacity-40"
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
                          className="h-7 px-2 text-xs border-slate-600 text-slate-100 bg-slate-900/80 hover:bg-slate-800 disabled:opacity-40"
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
                <div className="mt-3 flex items-center justify-end">
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                    onClick={() => setHasConfirmedTripSketch(true)}
                  >
                    I&apos;m happy with my trip sketch
                  </Button>
                </div>
              </div>
            </div>
          )}
          {hasConfirmedTripSketch && (
            <div className="flex justify-start">
              <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-300">
                  Phase 4 Part 1: Plan your flights
                </p>
                
                {/* Departure Location */}
                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">Departure location (your home town)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={departureLocation}
                      onChange={(e) => setDepartureLocation(e.target.value)}
                      placeholder="e.g., New York, NY or Austin, TX"
                      className="h-8 bg-slate-950 border-slate-700 text-xs text-slate-100"
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
                    <p className="text-[11px] text-emerald-400">
                      Departure airport code: <span className="font-semibold">{departureId}</span>
                    </p>
                  )}
                </div>

                {/* Arrival Location */}
                <div className="space-y-2">
                  <Label className="text-slate-200 text-xs">Arrival location (from day 1 of your trip)</Label>
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
                                className="h-8 bg-slate-950 border-slate-700 text-xs text-slate-400"
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
                              <p className="text-[11px] text-emerald-400">
                                Arrival airport code: <span className="font-semibold">{arrivalId}</span>
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-400">
                            Could not extract arrival location from day 1. Please ensure your trip sketch has location information.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Flight Dates Summary */}
                {tripPreferences?.start_date && tripPreferences?.end_date && (
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <p className="text-xs font-semibold text-slate-300">Flight dates</p>
                    <div className="text-[11px] text-slate-400 space-y-1">
                      <p>Outbound date: <span className="text-slate-200">{tripPreferences.start_date}</span></p>
                      <p>Return date: <span className="text-slate-200">{tripPreferences.end_date}</span></p>
                      <p>Trip type: <span className="text-slate-200">Round trip (type: 1)</span></p>
                    </div>
                  </div>
                )}

                {/* Search Flights Button */}
                {departureId && arrivalId && (
                  <div className="space-y-2 pt-2 border-t border-slate-700">
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
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400">Searching for flights...</p>
                  </div>
                )}

                {/* Flight Results - Step 1: Select Outbound */}
                {bestFlights.length > 0 && returnFlights.length === 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-700">
                    <p className="text-xs font-semibold text-slate-300">Step 1: Select your outbound flight</p>
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
                                : "border-slate-700 bg-slate-950/60 hover:border-slate-600"
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
                                const selectedFlight = bestFlights[index];
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
                                <p className="text-xs text-slate-200">
                                  <span className="font-semibold">{firstOutbound?.departure_airport?.name || firstOutbound?.departure_airport?.id}</span>
                                  {" → "}
                                  <span className="font-semibold">{lastOutbound?.arrival_airport?.name || lastOutbound?.arrival_airport?.id}</span>
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {firstOutbound?.departure_airport?.time} → {lastOutbound?.arrival_airport?.time}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {firstOutbound?.airline || "Multiple airlines"}
                                </p>
                                <p className="text-[11px] text-slate-400">
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
                                      <div key={layoverIdx} className="text-[11px] text-slate-400 pl-4">
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
                    
                    {/* Choose Return Flight Button - Show when return flights are NOT loaded or when user wants to refresh */}
                    {selectedOutboundIndex !== null && bestFlights[selectedOutboundIndex] && returnFlights.length === 0 && (
                      <div className="pt-2 flex justify-end">
                        {!bestFlights[selectedOutboundIndex]?.departure_token && (
                          <p className="text-[10px] text-red-400 mr-2">
                            Warning: This flight is missing departure token. Cannot fetch return flights.
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                          disabled={isFetchingReturnFlights || !bestFlights[selectedOutboundIndex]?.departure_token}
                          onClick={async () => {
                            const selectedFlight = bestFlights[selectedOutboundIndex];
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
                      </div>
                    )}
                  </div>
                )}

                {/* Loading Return Flights */}
                {selectedOutboundIndex !== null && isFetchingReturnFlights && (
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400">Loading return flight options...</p>
                  </div>
                )}

                {/* Step 2: Select Return Flight */}
                {selectedOutboundIndex !== null && returnFlights.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-700">
                    <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-300">Step 2: Select your return flight</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-3 text-[10px] border-slate-600 text-slate-300 bg-slate-800/50 hover:bg-slate-700 disabled:opacity-60"
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
                          className="h-6 px-3 text-[10px] border-slate-600 text-slate-300 bg-slate-800/50 hover:bg-slate-700"
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
                          <p className="text-xs text-slate-200">
                            {firstOutbound?.departure_airport?.name || firstOutbound?.departure_airport?.id} → {lastOutbound?.arrival_airport?.name || lastOutbound?.arrival_airport?.id}
                          </p>
                          <p className="text-[11px] text-slate-400">
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
                                : "border-slate-700 bg-slate-950/60 hover:border-slate-600"
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
                                <p className="text-xs text-slate-200">
                                  <span className="font-semibold">{firstReturn?.departure_airport?.name || firstReturn?.departure_airport?.id}</span>
                                  {" → "}
                                  <span className="font-semibold">{lastReturn?.arrival_airport?.name || lastReturn?.arrival_airport?.id}</span>
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {firstReturn?.departure_airport?.time} → {lastReturn?.arrival_airport?.time}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {firstReturn?.airline || "Multiple airlines"}
                                </p>
                                <p className="text-[11px] text-slate-400">
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
                                      <div key={layoverIdx} className="text-[11px] text-slate-400 pl-4">
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
                            <p className="text-slate-300 font-semibold mb-1">Outbound</p>
                            {(() => {
                              const outbound = bestFlights[selectedOutboundIndex];
                              const outboundFlights = outbound.flights || [];
                              const first = outboundFlights[0];
                              const last = outboundFlights[outboundFlights.length - 1];
                              return (
                                <>
                                  <p className="text-slate-200">{first?.departure_airport?.id} → {last?.arrival_airport?.id}</p>
                                  <p className="text-[11px] text-slate-400">${outbound.price?.toLocaleString()}</p>
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <p className="text-slate-300 font-semibold mb-1">Return</p>
                            {(() => {
                              const returnFlight = returnFlights[selectedReturnIndex];
                              const returnFlightLegs = returnFlight.flights || [];
                              const first = returnFlightLegs[0];
                              const last = returnFlightLegs[returnFlightLegs.length - 1];
                              return (
                                <>
                                  <p className="text-slate-200">{first?.departure_airport?.id} → {last?.arrival_airport?.id}</p>
                                  <p className="text-[11px] text-slate-400">${returnFlight.price?.toLocaleString()}</p>
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

                    {/* Done Button */}
                    {selectedOutboundIndex !== null && selectedReturnIndex !== null && (
                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-xs text-white disabled:opacity-60"
                          onClick={() => {
                            setHasConfirmedFlights(true);
                            setHasStartedHotels(true);
                          }}
                        >
                          I&apos;m done planning flights. Now let&apos;s move on to hotels
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {hasStartedHotels && (
            <div className="flex justify-start">
              <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-300">
                  Phase 4 Part 2: Book your hotels
                </p>

                {/* Hotel Location and Dates Info */}
                {(() => {
                  const hotelLocation = getArrivalLocation();
                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-400 space-y-1">
                        <p>Location: <span className="text-slate-200">{hotelLocation || "Extracting from trip..."}</span></p>
                        {tripPreferences?.start_date && tripPreferences?.end_date && (
                          <>
                            <p>Check-in: <span className="text-slate-200">{tripPreferences.start_date}</span></p>
                            <p>Check-out: <span className="text-slate-200">{tripPreferences.end_date}</span></p>
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
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400">Searching for hotels...</p>
                  </div>
                )}

                {/* Hotel Results */}
                {hotels.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-700">
                    <p className="text-xs font-semibold text-slate-300">Available hotels</p>
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
                                : "border-slate-700 bg-slate-950/60 hover:border-slate-600"
                            }`}
                            onClick={() => setSelectedHotelIndex(index)}
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
                                  <p className="text-sm font-semibold text-slate-200">{hotel.name}</p>
                                  {hotel.hotel_class && (
                                    <p className="text-[11px] text-slate-400">{hotel.hotel_class}</p>
                                  )}
                                </div>
                                
                                {hotel.description && (
                                  <p className="text-[11px] text-slate-400 line-clamp-2">{hotel.description}</p>
                                )}

                                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                  {rating && <span>{rating}</span>}
                                  {reviews && <span>{reviews}</span>}
                                </div>

                                {hotel.amenities && hotel.amenities.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {hotel.amenities.slice(0, 3).map((amenity: string, amenityIdx: number) => (
                                      <span key={amenityIdx} className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-300">
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
                                          <p className="text-[11px] text-slate-400">Loading booking options...</p>
                                        ) : propertyDetails[index] ? (
                                          (() => {
                                            const details = propertyDetails[index];
                                            // Extract booking options only from featured_prices array
                                            const bookingOptions = details.featured_prices && Array.isArray(details.featured_prices) 
                                              ? details.featured_prices 
                                              : [];
                                            
                                            if (bookingOptions.length === 0) {
                                              return (
                                                <p className="text-[11px] text-slate-400">No booking options available</p>
                                              );
                                            }

                                            return (
                                              <div className="space-y-2">
                                                {bookingOptions.map((option: any, optionIdx: number) => {
                                                  const source = option.source || 'Booking site';
                                                  const price = option.rate_per_night?.lowest || null;
                                                  const link = option.link || option.url || null;
                                                  
                                                  return (
                                                    <div key={optionIdx} className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                                                      <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-semibold text-slate-200 truncate">{source}</p>
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
                                          <p className="text-[11px] text-slate-400">Click to load booking options</p>
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-slate-700">
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
                          onClick={() => setHasConfirmedHotels(true)}
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
          {hasConfirmedHotels && (
            <div className="flex justify-start">
              <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-4 py-3 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-slate-300">
                  Phase 5: Final itinerary
                </p>
                <p className="text-[11px] text-slate-400">
                  Final itinerary UI will be implemented here.
                </p>
              </div>
            </div>
          )}
          {tripId &&
            hasConfirmedActivities &&
            allActivitiesAnswered &&
            hasAnyLikedActivity &&
            !hasShownTripSketchPrompt && (
              <div className="flex justify-start">
                <div className="bg-slate-900/90 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 shadow-sm max-w-[75%]">
                  <p className="text-sm">
                    Is there anything else you would like to chat about, or should I create the
                    trip sketch?
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-xs text-slate-100 bg-slate-900/70 hover:bg-slate-800"
                      onClick={() => setHasShownTripSketchPrompt(true)}
                    >
                      Keep chatting
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500 text-slate-950 text-xs font-semibold hover:from-emerald-300 hover:via-sky-400 hover:to-blue-400 disabled:opacity-60"
                      disabled={isGeneratingItinerary}
                      onClick={async () => {
                        setHasShownTripSketchPrompt(true);
                        await generateItinerary();
                      }}
                    >
                      {isGeneratingItinerary ? "Generating trip sketch..." : "Create trip sketch"}
                    </Button>
                  </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-blue-500 bg-blue-800/30">
        <div className="relative flex items-center gap-2">
          <div className="absolute left-3 z-10">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-pink-500" />
          </div>
          <Input
            type="text"
            placeholder="Type your message here..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="pl-12 pr-14 h-12 rounded-full border-2 bg-black text-white placeholder:text-gray-400 border-gray-700 focus:border-blue-400"
          />
          <Button
            type="button"
            onClick={() => sendMessage()}
            disabled={!inputMessage.trim() || isLoading}
            className="absolute right-2 h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-400 text-white p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            id="chat-send-button"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;

