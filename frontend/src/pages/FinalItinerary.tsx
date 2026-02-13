import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, Legend } from "recharts";
import { getApiUrl } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, X, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import ReplaceActivityModal from "@/components/ReplaceActivityModal";
import ReplaceHotelModal from "@/components/ReplaceHotelModal";
import ReplaceFlightModal from "@/components/ReplaceFlightModal";
import ReplaceRestaurantModal from "@/components/ReplaceRestaurantModal";

type FlightLeg = {
  departure_airport?: {
    id?: string;
    name?: string;
    time?: string;
  };
  arrival_airport?: {
    id?: string;
    name?: string;
    time?: string;
  };
  airline?: string;
};

type FlightLayover = {
  id?: string;
  name?: string;
  duration?: number;
  overnight?: boolean;
};

type FinalItineraryFlight = {
  flight_id?: number;
  departure_id?: string;
  arrival_id?: string;
  price?: number;
  total_duration?: number;
  flights?: FlightLeg[];
  layovers?: FlightLayover[];
  airline?: string;
  stops?: number;
  description?: string;
  finalized?: boolean;
};

type FinalItineraryHotel = {
  hotel_id?: number;
  name?: string;
  location?: string;
  rate_per_night?: number;
  rate_per_night_formatted?: string;
  link?: string;
  overall_rating?: number;
  check_in_time?: string;
  check_out_time?: string;
  finalized?: boolean;
};

type FinalItineraryDay = {
  day_number: number;
  date?: string | null;
  summary?: string | null;
  activities?: Array<{
    activity_id?: number;
    name?: string;
    location?: string;
    address?: string;
    category?: string;
    duration?: string;
    cost_estimate?: number;
    source_url?: string;
    source?: string;
    description?: string;
    finalized?: boolean;
  }>;
  outbound_flight?: FinalItineraryFlight;
  return_flight?: FinalItineraryFlight;
  hotel?: FinalItineraryHotel;
};

type MealSlot = "breakfast" | "lunch" | "dinner";

type MealInfo = {
  trip_meal_id?: number;
  name: string;
  location: string;
  link?: string;
  cost?: number;
  finalized?: boolean;
};

type FinalItineraryData = {
  trip_id: number;
  trip_title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  num_days: number;
  total_budget: number | null;
  days: FinalItineraryDay[];
};

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_MAPS_API_KEY =
  (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY ||
  (import.meta as any).env.GOOGLE_MAPS_API_KEY ||
  "";

let googleMapsPromise: Promise<void> | null = null;

const loadGoogleMapsApi = () => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google && window.google.maps) return Promise.resolve();
  if (!GOOGLE_MAPS_API_KEY) return Promise.resolve();

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(script);
    });
  }

  return googleMapsPromise;
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return null;
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) return null;

  // Construct in local time to avoid timezone shifting of YYYY-MM-DD strings
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const formatDuration = (minutes?: number) => {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const formatMoney = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const FinalItinerary = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [itinerary, setItinerary] = useState<FinalItineraryData | null>(null);
  const [tripStatus, setTripStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState<Record<number, boolean>>({});
  const [addingActivity, setAddingActivity] = useState<Record<number, boolean>>({});
  const [deletingActivity, setDeletingActivity] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<
    Record<
      number,
      { name: string; description: string; source_url: string; location: string; cost_estimate: string }
    >
  >({});
  const [activeTab, setActiveTab] = useState<"overview" | "map" | "budget" | "calendar">("overview");
  const [selectedMapDayIndex, setSelectedMapDayIndex] = useState(0);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [travelInfoByDay, setTravelInfoByDay] = useState<
    Record<number, { segments: { fromLabel: string; toLabel: string; distanceText: string; durationText: string }[] }>
  >({});
  const [mealsByDay, setMealsByDay] = useState<Record<number, Partial<Record<MealSlot, MealInfo>>>>({});
  const [editingMeal, setEditingMeal] = useState<{ dayNumber: number; slot: MealSlot } | null>(null);
  const [mealForm, setMealForm] = useState<{ name: string; location: string; link: string; cost: string }>({
    name: "",
    location: "",
    link: "",
    cost: "",
  });
  const [dragActivity, setDragActivity] = useState<{ dayNumber: number; index: number } | null>(null);

  type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  };
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [hasLoadedChatHistory, setHasLoadedChatHistory] = useState(false);

  // Replace activity modal state
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [selectedActivityToReplace, setSelectedActivityToReplace] = useState<{
    activity: any;
    dayNumber: number;
  } | null>(null);

  // Replace hotel modal state
  const [replaceHotelModalOpen, setReplaceHotelModalOpen] = useState(false);
  const [selectedHotelToReplace, setSelectedHotelToReplace] = useState<{
    hotel: any;
    tripHotelId: number;
  } | null>(null);

  // Replace flight modal state
  const [replaceFlightModalOpen, setReplaceFlightModalOpen] = useState(false);
  const [selectedFlightToReplace, setSelectedFlightToReplace] = useState<{
    flight: any;
    tripFlightId: number;
    flightType: "outbound" | "return";
  } | null>(null);

  // Replace restaurant modal state
  const [replaceRestaurantModalOpen, setReplaceRestaurantModalOpen] = useState(false);
  const [selectedMealToReplace, setSelectedMealToReplace] = useState<{
    meal: MealInfo;
    dayNumber: number;
    slot: MealSlot;
  } | null>(null);

  useEffect(() => {
    const loadFinalItinerary = async () => {
      if (!tripId) return;
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }

        // Load both trip info and final itinerary
        const [tripResponse, itineraryResponse] = await Promise.all([
          fetch(getApiUrl(`api/trips/${tripId}`), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
          fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
        ]);

        // Load trip status
        const tripResult = await tripResponse.json();
        if (tripResponse.ok && tripResult.success && tripResult.trip?.trip_status) {
          setTripStatus(tripResult.trip.trip_status);
        }

        // Load itinerary
        const result = await itineraryResponse.json();
        if (itineraryResponse.ok && result.success && result.itinerary?.days?.length > 0) {
          setItinerary(result.itinerary);
        } else {
          setItinerary(null);
        }
      } catch (fetchError) {
        console.error("Error loading final itinerary:", fetchError);
        setError("Unable to load the final itinerary. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadFinalItinerary();
  }, [tripId, navigate]);

  const handleAddActivity = async (dayNumber: number) => {
    if (!tripId) return;

    const form = formData[dayNumber];
    if (!form || !form.name.trim()) {
      alert("Please provide an activity name (short description)");
      return;
    }
    const costNum = parseFloat(form.cost_estimate);
    if (Number.isNaN(costNum)) {
      alert("Please provide a cost estimate for this activity.");
      return;
    }

    setAddingActivity((prev) => ({ ...prev, [dayNumber]: true }));

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/itinerary/${dayNumber}/activities`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            source_url: form.source_url.trim() || undefined,
            location: form.location.trim() || undefined,
            cost_estimate: costNum,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload itinerary to show new activity
        const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const reloadResult = await reloadResponse.json();
        if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
          setItinerary(reloadResult.itinerary);
        }

        // Reset form
        setFormData((prev) => ({
          ...prev,
          [dayNumber]: { name: "", description: "", source_url: "", location: "", cost_estimate: "" },
        }));
        setShowAddForm((prev) => ({ ...prev, [dayNumber]: false }));
      } else {
        alert(result.message || "Failed to add activity");
      }
    } catch (fetchError) {
      console.error("Error adding activity:", fetchError);
      alert("Failed to add activity. Please try again.");
    } finally {
      setAddingActivity((prev) => ({ ...prev, [dayNumber]: false }));
    }
  };

  const handleDeleteActivity = async (dayNumber: number, activityId: number) => {
    if (!tripId) return;
    if (!confirm("Are you sure you want to remove this activity?")) return;

    const key = `${dayNumber}-${activityId}`;
    setDeletingActivity((prev) => ({ ...prev, [key]: true }));

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/itinerary/${dayNumber}/activities/${activityId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload itinerary to reflect deletion
        const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const reloadResult = await reloadResponse.json();
        if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
          setItinerary(reloadResult.itinerary);
        }
      } else {
        alert(result.message || "Failed to remove activity");
      }
    } catch (fetchError) {
      console.error("Error deleting activity:", fetchError);
      alert("Failed to remove activity. Please try again.");
    } finally {
      setDeletingActivity((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleUpdateActivityLocation = async () => {
    if (!tripId || !selectedActivityDetail?.activity?.activity_id) return;
    const address = activityLocationDraft.trim();
    setIsSavingActivityLocation(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const response = await fetch(
        getApiUrl(
          `api/trips/${tripId}/itinerary/${selectedActivityDetail.dayNumber}/activities/${selectedActivityDetail.activity.activity_id}`
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ address }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update activity location");
      }

      // Reload itinerary to reflect updated activity (and potential new activity_id)
      const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const reloadResult = await reloadResponse.json();
      if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
        setItinerary(reloadResult.itinerary);
      }

      if (result.activity) {
        setSelectedActivityDetail({
          dayNumber: selectedActivityDetail.dayNumber,
          activity: result.activity,
        });
        setActivityLocationDraft(
          result.activity.address || result.activity.location || activityLocationDraft
        );
      }
    } catch (error) {
      console.error("Error updating activity location:", error);
      alert("Failed to update activity location. Please try again.");
    } finally {
      setIsSavingActivityLocation(false);
    }
  };

  const handleUpdateActivityCost = async (dayNumber: number, activityId: number, amount: number) => {
    if (!tripId) return;
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/itinerary/${dayNumber}/activities/${activityId}`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cost_estimate: amount }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update activity cost");
      }

      const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const reloadResult = await reloadResponse.json();
      if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
        setItinerary(reloadResult.itinerary);
      }
    } catch (error) {
      console.error("Error updating activity cost:", error);
      alert("Failed to update activity cost. Please try again.");
    }
  };

  const handleToggleExpenseFinalized = async (params: {
    id: string;
    kind: BudgetCategory;
    source: "auto" | "extra";
    dayNumber: number;
    activityId?: number;
    mealSlot?: MealSlot;
    flightId?: number;
    hotelId?: number;
    nextValue: boolean;
    label: string;
    amount: number;
  }) => {
    const { kind, source, dayNumber, activityId, mealSlot, flightId, hotelId, nextValue } = params;

    if (kind === "meal" && mealSlot) {
      setMealsByDay((prev) => {
        const existing = prev[dayNumber]?.[mealSlot] || {
          name: params.label,
          location: "",
          cost: params.amount,
        };
        const next = {
          ...prev,
          [dayNumber]: {
            ...(prev[dayNumber] || {}),
            [mealSlot]: {
              ...existing,
              finalized: nextValue,
            },
          },
        };
        persistMeals(next);
        return next;
      });
      return;
    }

    if (kind === "activity" && activityId) {
      try {
        if (!tripId) return;
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }
        const response = await fetch(
          getApiUrl(`api/trips/${tripId}/itinerary/${dayNumber}/activities/${activityId}`),
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ finalized: nextValue }),
          }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to update activity finalized status");
        }
        setItinerary((prev) => {
          if (!prev) return prev;
          const days = prev.days.map((d) => {
            if (d.day_number !== dayNumber) return d;
            const acts = (d.activities || []).map((a) =>
              a.activity_id === activityId ? { ...a, finalized: nextValue } : a
            );
            return { ...d, activities: acts };
          });
          return { ...prev, days };
        });
      } catch (err) {
        console.error("Error toggling activity finalized:", err);
        alert("Failed to update activity finalized status.");
      }
      return;
    }

    if (kind === "transport" && flightId) {
      try {
        if (!tripId) return;
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }
        const response = await fetch(
          getApiUrl(`api/trips/${tripId}/flights/${flightId}/finalized`),
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ finalized: nextValue }),
          }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to update flight finalized status");
        }
        setItinerary((prev) => {
          if (!prev) return prev;
          const days = prev.days.map((d) => {
            const outbound =
              d.outbound_flight?.flight_id === flightId
                ? { ...d.outbound_flight, finalized: nextValue }
                : d.outbound_flight;
            const inbound =
              d.return_flight?.flight_id === flightId
                ? { ...d.return_flight, finalized: nextValue }
                : d.return_flight;
            return { ...d, outbound_flight: outbound, return_flight: inbound };
          });
          return { ...prev, days };
        });
      } catch (err) {
        console.error("Error toggling flight finalized:", err);
        alert("Failed to update flight finalized status.");
      }
      return;
    }

    if (kind === "hotel" && hotelId) {
      try {
        if (!tripId) return;
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }
        const response = await fetch(
          getApiUrl(`api/trips/${tripId}/hotels/${hotelId}/finalized`),
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ finalized: nextValue }),
          }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to update hotel finalized status");
        }
        setItinerary((prev) => {
          if (!prev) return prev;
          const days = prev.days.map((d) => {
            if (!d.hotel || d.hotel.hotel_id !== hotelId) return d;
            return { ...d, hotel: { ...d.hotel, finalized: nextValue } };
          });
          return { ...prev, days };
        });
      } catch (err) {
        console.error("Error toggling hotel finalized:", err);
        alert("Failed to update hotel finalized status.");
      }
      return;
    }

    if (source === "extra") {
      setExtraExpensesByDay((prev) => {
        const copy = { ...prev };
        copy[dayNumber] = (copy[dayNumber] || []).map((x) =>
          x.id === params.id ? { ...x, finalized: nextValue } : x
        );
        persistExpenses(copy);
        return copy;
      });
    }
  };

  const handleConfirmReplacement = async (selectedActivity: any) => {
    if (!tripId || !selectedActivityToReplace) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(
          `api/trips/${tripId}/activities/${selectedActivityToReplace.activity.activity_id}/confirm-replacement`
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedActivity: selectedActivity,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload itinerary to show replacement
        const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const reloadResult = await reloadResponse.json();
        if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
          setItinerary(reloadResult.itinerary);
        }
      } else {
        throw new Error(result.message || "Failed to replace activity");
      }
    } catch (error) {
      console.error("Error confirming replacement:", error);
      throw error;
    }
  };

  const handleConfirmHotelReplacement = async (selectedHotel: any) => {
    if (!tripId || !selectedHotelToReplace) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(
          `api/trips/${tripId}/hotels/${selectedHotelToReplace.tripHotelId}/confirm-replacement`
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedHotel: selectedHotel,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload itinerary to show replacement
        const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const reloadResult = await reloadResponse.json();
        if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
          setItinerary(reloadResult.itinerary);
        }
      } else {
        throw new Error(result.message || "Failed to replace hotel");
      }
    } catch (error) {
      console.error("Error confirming hotel replacement:", error);
      throw error;
    }
  };

  const handleConfirmFlightReplacement = async (selectedFlight: any) => {
    if (!tripId || !selectedFlightToReplace) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(
          `api/trips/${tripId}/flights/${selectedFlightToReplace.tripFlightId}/confirm-replacement`
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedFlight: selectedFlight,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload itinerary to show replacement
        const reloadResponse = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const reloadResult = await reloadResponse.json();
        if (reloadResponse.ok && reloadResult.success && reloadResult.itinerary?.days?.length > 0) {
          setItinerary(reloadResult.itinerary);
        }
      } else {
        throw new Error(result.message || "Failed to replace flight");
      }
    } catch (error) {
      console.error("Error confirming flight replacement:", error);
      throw error;
    }
  };

  const handleConfirmRestaurantReplacement = async (selectedRestaurant: any) => {
    if (!tripId || !selectedMealToReplace || !selectedMealToReplace.meal.trip_meal_id) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        getApiUrl(
          `api/trips/${tripId}/meals/${selectedMealToReplace.meal.trip_meal_id}/confirm-replacement`
        ),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedRestaurant: selectedRestaurant,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Reload meals to show replacement
        await loadPersistedMeals();
      } else {
        throw new Error(result.message || "Failed to replace restaurant");
      }
    } catch (error) {
      console.error("Error confirming restaurant replacement:", error);
      throw error;
    }
  };

  const toggleAddForm = (dayNumber: number) => {
    setShowAddForm((prev) => ({
      ...prev,
      [dayNumber]: !prev[dayNumber],
    }));
    if (!formData[dayNumber]) {
      setFormData((prev) => ({
        ...prev,
        [dayNumber]: { name: "", description: "", source_url: "", location: "", cost_estimate: "" },
      }));
    }
  };

  const getAuthToken = () => localStorage.getItem("token");

  const formatChatTime = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Lazy-load chat history for this trip when popup first opens
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!isChatOpen || hasLoadedChatHistory) return;
      const token = getAuthToken();
      if (!token) return;
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
        if (response.ok && result.success && Array.isArray(result.messages)) {
          const mapped: ChatMessage[] = result.messages.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            timestamp: formatChatTime(),
          }));
          setChatMessages(mapped);
        }
      } catch (err) {
        console.error("Error loading chat history on final itinerary:", err);
      } finally {
        setHasLoadedChatHistory(true);
      }
    };
    void loadChatHistory();
  }, [isChatOpen, hasLoadedChatHistory, tripId]);

  const sendChatMessage = async () => {
    const content = chatInput.trim();
    if (!content || isChatLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content,
      timestamp: formatChatTime(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const token = getAuthToken();
      if (!token) {
        console.error("Not authenticated for chat on final itinerary page.");
        return;
      }

      const response = await fetch(getApiUrl("api/chat/chat"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          tripId: tripId ? Number(tripId) : undefined,
        }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok && result && result.success) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "No response from assistant.",
          timestamp: formatChatTime(),
        };
        setChatMessages((prev) => [...prev, assistantMessage]);
      } else if (result) {
        const errorMessage: ChatMessage = {
          role: "assistant",
          content:
            result.message ||
            "Sorry, I ran into an error processing your question.",
          timestamp: formatChatTime(),
        };
        setChatMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err) {
      console.error("Chat error on final itinerary page:", err);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content:
          "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: formatChatTime(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  type BudgetCategory = "activity" | "meal" | "hotel" | "transport" | "other";

  type ExtraExpense = {
    id: string;
    label: string;
    amount: number;
    category: BudgetCategory;
    finalized?: boolean;
  };

  const [extraExpensesByDay, setExtraExpensesByDay] = useState<Record<number, ExtraExpense[]>>({});
  const [extraExpenseDrafts, setExtraExpenseDrafts] = useState<
    Record<number, { label: string; amount: string; category: BudgetCategory }>
  >({});
  const [hasLoadedMeals, setHasLoadedMeals] = useState(false);
  const [hasLoadedExpenses, setHasLoadedExpenses] = useState(false);
  const [budgetView, setBudgetView] = useState<"daily" | "summary">("daily");
  const [selectedActivityDetail, setSelectedActivityDetail] = useState<{
    dayNumber: number;
    activity: FinalItineraryDay["activities"][number];
  } | null>(null);
  const [activityLocationDraft, setActivityLocationDraft] = useState("");
  const [isSavingActivityLocation, setIsSavingActivityLocation] = useState(false);

  const loadPersistedMeals = async () => {
    if (!tripId) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch(getApiUrl(`api/trips/${tripId}/meals`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.meals)) {
        const next: Record<number, Partial<Record<MealSlot, MealInfo>>> = {};
        result.meals.forEach((m: any) => {
          if (!m.day_number || !m.slot) return;
          if (!next[m.day_number]) next[m.day_number] = {};
          next[m.day_number][m.slot as MealSlot] = {
            trip_meal_id: m.trip_meal_id,
            name: m.name || "",
            location: m.location || "",
            link: m.link || undefined,
            cost: typeof m.cost === "number" ? m.cost : undefined,
            finalized: typeof m.finalized === "boolean" ? m.finalized : false,
          };
        });
        setMealsByDay(next);
      }
    } catch (err) {
      console.error("Error loading persisted meals:", err);
    } finally {
      setHasLoadedMeals(true);
    }
  };

  const loadPersistedExpenses = async () => {
    if (!tripId) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch(getApiUrl(`api/trips/${tripId}/expenses`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.expenses)) {
        const next: Record<number, ExtraExpense[]> = {};
        result.expenses.forEach((e: any) => {
          const day = e.day_number;
          if (!day) return;
          if (!next[day]) next[day] = [];
          next[day].push({
            id: e.client_id || String(e.trip_expense_id),
            label: e.label,
            amount: parseMoneyNumber(e.amount),
            category: e.category as BudgetCategory,
            finalized: typeof e.finalized === "boolean" ? e.finalized : true,
          });
        });
        setExtraExpensesByDay(next);
      }
    } catch (err) {
      console.error("Error loading persisted expenses:", err);
    } finally {
      setHasLoadedExpenses(true);
    }
  };

  const persistMeals = async (nextMeals: Record<number, Partial<Record<MealSlot, MealInfo>>>) => {
    if (!tripId || !hasLoadedMeals) return;
    const token = getAuthToken();
    if (!token) return;
    const mealsPayload: Array<{
      day_number: number;
      slot: MealSlot;
      name?: string;
      location?: string;
      link?: string;
      cost?: number;
      finalized?: boolean;
    }> = [];
    Object.entries(nextMeals).forEach(([dayStr, dayMeals]) => {
      const dayNum = Number(dayStr);
      if (!dayMeals) return;
      (["breakfast", "lunch", "dinner"] as MealSlot[]).forEach((slot) => {
        const m = dayMeals[slot];
        if (!m) return;
        if (!m.name && !m.location && !m.link && (m.cost === undefined || m.cost === null)) return;
        mealsPayload.push({
          day_number: dayNum,
          slot,
          name: m.name || "",
          location: m.location || "",
          link: m.link,
          cost: typeof m.cost === "number" ? m.cost : undefined,
          finalized: typeof m.finalized === "boolean" ? m.finalized : false,
        });
      });
    });

    try {
      const response = await fetch(getApiUrl(`api/trips/${tripId}/meals`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meals: mealsPayload }),
      });
      const result = await response.json();
      // Update local state with the returned trip_meal_id values
      if (response.ok && result.success && Array.isArray(result.meals)) {
        setMealsByDay((prev) => {
          const updated = { ...prev };
          result.meals.forEach((m: any) => {
            if (!m.day_number || !m.slot) return;
            if (!updated[m.day_number]) updated[m.day_number] = {};
            const existing = updated[m.day_number][m.slot as MealSlot];
            if (existing) {
              updated[m.day_number] = {
                ...updated[m.day_number],
                [m.slot]: {
                  ...existing,
                  trip_meal_id: m.trip_meal_id,
                },
              };
            }
          });
          return updated;
        });
      }
    } catch (err) {
      console.error("Error persisting meals:", err);
    }
  };

  const persistExpenses = async (nextExpenses: Record<number, ExtraExpense[]>) => {
    if (!tripId || !hasLoadedExpenses) return;
    const token = getAuthToken();
    if (!token) return;
    const expensesPayload: Array<{
      day_number: number;
      client_id: string;
      label: string;
      amount: number;
      category: BudgetCategory;
      finalized?: boolean;
    }> = [];
    Object.entries(nextExpenses).forEach(([dayStr, items]) => {
      const dayNum = Number(dayStr);
      items.forEach((item) => {
        expensesPayload.push({
          day_number: dayNum,
          client_id: item.id,
          label: item.label,
          amount: item.amount,
          category: item.category,
          finalized: typeof item.finalized === "boolean" ? item.finalized : true,
        });
      });
    });

    try {
      await fetch(getApiUrl(`api/trips/${tripId}/expenses`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expenses: expensesPayload }),
      });
    } catch (err) {
      console.error("Error persisting expenses:", err);
    }
  };
  const [editingExtraId, setEditingExtraId] = useState<string | null>(null);
  const [editingExtraDraft, setEditingExtraDraft] = useState<{
    label: string;
    amount: string;
    category: BudgetCategory;
  } | null>(null);
  const [editingBudgetItemId, setEditingBudgetItemId] = useState<string | null>(null);
  const [editingBudgetAmount, setEditingBudgetAmount] = useState("");

  const parseMoneyNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // Simple per-day budget breakdown derived from itinerary + user-entered meals + manual extras
  const computeBudgetData = () => {
    if (!itinerary)
      return {
        daily: [],
        totals: { flights: 0, hotels: 0, activities: 0, meals: 0, extras: 0, total: 0 },
      };

    const daily = itinerary.days.map((day) => {
      const activityTotal = (day.activities || []).reduce(
        (sum, act) => sum + parseMoneyNumber(act.cost_estimate),
        0
      );
      const hotelTotal = parseMoneyNumber(day.hotel?.rate_per_night);
      const mealTotal = (() => {
        const meals = mealsByDay[day.day_number];
        if (!meals) return 0;
        return (["breakfast", "lunch", "dinner"] as MealSlot[]).reduce((sum, slot) => {
          const m = meals[slot];
          return sum + (m && typeof m.cost === "number" ? m.cost : 0);
        }, 0);
      })();
      const extrasTotal = (extraExpensesByDay[day.day_number] || []).reduce(
        (sum, e) => sum + parseMoneyNumber(e.amount),
        0
      );
      let flightTotal = 0;
      flightTotal += parseMoneyNumber(day.outbound_flight?.price);
      flightTotal += parseMoneyNumber(day.return_flight?.price);
      const total = activityTotal + hotelTotal + flightTotal + mealTotal + extrasTotal;
      return {
        day_number: day.day_number,
        date: day.date,
        activityTotal,
        hotelTotal,
        mealTotal,
        extrasTotal,
        flightTotal,
        total,
      };
    });

    const totals = daily.reduce(
      (acc, d) => {
        acc.activities += d.activityTotal;
        acc.hotels += d.hotelTotal;
        acc.meals += d.mealTotal;
        acc.extras += d.extrasTotal;
        acc.flights += d.flightTotal;
        acc.total += d.total;
        return acc;
      },
      { flights: 0, hotels: 0, activities: 0, meals: 0, extras: 0, total: 0 }
    );

    return { daily, totals };
  };

  useEffect(() => {
    if (!itinerary || activeTab !== "map") return;
    if (!GOOGLE_MAPS_API_KEY) return;

    let cancelled = false;

    const initMap = async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled) return;
        if (!window.google || !window.google.maps) return;

        // Wait for the map container to be mounted and visible
        if (!mapRef.current) {
          setTimeout(() => {
            if (!cancelled) {
              void initMap();
            }
          }, 50);
          return;
        }

        const day = itinerary.days[selectedMapDayIndex] || itinerary.days[0];
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: 0, lng: 0 },
          zoom: 12,
        });
        const geocoder = new window.google.maps.Geocoder();
        const distanceMatrix = new window.google.maps.DistanceMatrixService();
        const bounds = new window.google.maps.LatLngBounds();

        const locations: {
          label: string;
          address: string;
          description?: string | null;
          kind?: "activity" | "meal" | "hotel" | "fallback";
        }[] = [];

        (day.activities || []).forEach((a) => {
          const addr = a.address || a.location || itinerary.destination || null;
          if (addr) {
            locations.push({
              label: a.name || "Activity",
              address: addr,
              description: a.description || null,
              kind: "activity",
            });
          }
        });

        const meals = mealsByDay[day.day_number];
        if (meals) {
          (["breakfast", "lunch", "dinner"] as MealSlot[]).forEach((slot) => {
            const meal = meals[slot];
            if (meal?.location) {
              locations.push({
                label: meal.name || slot.charAt(0).toUpperCase() + slot.slice(1),
                address: meal.location,
                kind: "meal",
              });
            }
          });
        }

        if (day.hotel?.location) {
          locations.push({ label: day.hotel.name || "Hotel", address: day.hotel.location, kind: "hotel" });
        }

        // If no specific locations, fall back to itinerary destination
        if (locations.length === 0 && itinerary.destination) {
          locations.push({ label: itinerary.destination, address: itinerary.destination, kind: "fallback" });
        }

        const infoWindow = new window.google.maps.InfoWindow();

        const buildInfoContent = (loc: (typeof locations)[number]) => {
          const wrapper = document.createElement("div");
          const title = document.createElement("div");
          title.textContent = loc.label;
          title.style.fontWeight = "600";
          title.style.fontSize = "12px";
          wrapper.appendChild(title);

          if (loc.description) {
            const desc = document.createElement("div");
            desc.textContent = loc.description;
            desc.style.fontSize = "11px";
            desc.style.color = "#475569";
            desc.style.marginTop = "4px";
            wrapper.appendChild(desc);
          }

          const addr = document.createElement("div");
          addr.textContent = loc.address;
          addr.style.fontSize = "10px";
          addr.style.color = "#64748b";
          addr.style.marginTop = "4px";
          wrapper.appendChild(addr);

          return wrapper;
        };

        locations.forEach((loc) => {
          geocoder.geocode({ address: loc.address }, (results: any, status: any) => {
            if (status === "OK" && results && results[0]) {
              const position = results[0].geometry.location;
              const marker = new window.google.maps.Marker({
                map,
                position,
                title: loc.label,
              });
              marker.addListener("mouseover", () => {
                infoWindow.setContent(buildInfoContent(loc));
                infoWindow.open({ anchor: marker, map, shouldFocus: false });
              });
              marker.addListener("mouseout", () => {
                infoWindow.close();
              });
              bounds.extend(position);
              map.fitBounds(bounds);
            }
          });
        });

        // Also compute travel time/distance between consecutive locations using Distance Matrix
        if (locations.length > 1) {
          distanceMatrix.getDistanceMatrix(
            {
              origins: locations.map((l) => l.address),
              destinations: locations.map((l) => l.address),
              travelMode: window.google.maps.TravelMode.DRIVING,
              unitSystem: window.google.maps.UnitSystem.IMPERIAL,
            },
            (response: any, status: any) => {
              if (status !== "OK" || !response?.rows) return;
              const segments: { fromLabel: string; toLabel: string; distanceText: string; durationText: string }[] = [];
              for (let i = 0; i < locations.length - 1; i++) {
                const row = response.rows[i];
                const element = row?.elements?.[i + 1];
                if (element && element.status === "OK") {
                  segments.push({
                    fromLabel: locations[i].label,
                    toLabel: locations[i + 1].label,
                    distanceText: element.distance?.text || "",
                    durationText: element.duration?.text || "",
                  });
                }
              }
              if (segments.length > 0) {
                setTravelInfoByDay((prev) => ({
                  ...prev,
                  [day.day_number]: { segments },
                }));
              }
            }
          );
        }
      } catch (e) {
        console.error("Error initializing Google Maps:", e);
      }
    };

    const timeoutId = window.setTimeout(() => {
      void initMap();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [itinerary, activeTab, selectedMapDayIndex, mealsByDay]);

  useEffect(() => {
    if (!tripId) return;
    void loadPersistedMeals();
    void loadPersistedExpenses();
  }, [tripId]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 flex flex-col">
          <div className="border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => {
                  // For planned/archived trips, go to dashboard with planned tab
                  if (tripStatus === "planned" || tripStatus === "archived") {
                    navigate("/dashboard?tab=planned");
                  } else {
                    // For draft trips, go back to trip planning
                    navigate(tripId ? `/trip/${tripId}` : "/dashboard");
                  }
                }}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                {tripStatus === "planned" || tripStatus === "archived" ? "Back to Dashboard" : "Back to Trip"}
              </Button>
              <div>
                <h1 className="text-xl font-semibold">Final Itinerary</h1>
                {itinerary?.destination && (
                  <p className="text-sm text-muted-foreground">{itinerary.destination}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading final itinerary...</p>
              </div>
            ) : error ? (
              <div className="text-center text-sm text-red-500">{error}</div>
            ) : !itinerary ? (
              <div className="max-w-xl mx-auto bg-muted/40 border rounded-lg p-6 text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  There isn&apos;t a saved final itinerary for this trip yet.
                </p>
                <Button onClick={() => navigate(tripId ? `/trip/${tripId}` : "/dashboard")}>
                  Go back to trip planning
                </Button>
              </div>
            ) : (
              <div className="w-full">
                <div className="flex items-center justify-between gap-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900 mb-4">
                  <span className="font-semibold">Editable layout</span>
                  <span className="text-green-700">
                    Click activities to edit • Use + button to add new activities
                  </span>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{itinerary.trip_title}</h2>
                      <p className="text-sm text-slate-500">
                        {itinerary.destination || "Trip"} • {itinerary.num_days} days
                      </p>
                    </div>
                    {itinerary.total_budget && (
                      <p className="text-xs text-blue-600">
                        Budget: ${itinerary.total_budget.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 mb-4">
                      <TabsTrigger value="overview" className="text-xs">
                        Editable Overview
                      </TabsTrigger>
                      <TabsTrigger value="map" className="text-xs">
                        Map
                      </TabsTrigger>
                      <TabsTrigger value="budget" className="text-xs">
                        Budget
                      </TabsTrigger>
                      <TabsTrigger value="calendar" className="hidden sm:inline-flex text-xs">
                        Calendar
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-0">
                      <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
                        {itinerary.days.map((day) => {
                          const dateLabel = formatDate(day.date) || `Day ${day.day_number}`;
                          return (
                            <div
                              key={day.day_number}
                              className="flex flex-col rounded-lg border border-dashed border-blue-200 bg-blue-50/60 p-4"
                            >
                          <div className="flex items-start justify-between gap-2 border-b border-blue-100 pb-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-blue-500">
                                Day {day.day_number}
                              </p>
                              <p className="text-sm font-semibold text-slate-900">{dateLabel}</p>
                            </div>
                            <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-600">
                              Editable
                            </span>
                          </div>

                          {day.summary && (
                            <p className="mt-2 text-xs text-slate-600">{day.summary}</p>
                          )}

                          {day.outbound_flight && (
                            <div className="mt-3 flex gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button className="flex-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600 text-left hover:border-blue-300 hover:bg-blue-50/80 transition-colors">
                                    <span className="text-blue-600 font-semibold">✈️ Outbound</span>{" "}
                                    {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader>
                                    <DialogTitle>Outbound flight details</DialogTitle>
                                    <DialogDescription>
                                      Saved at booking time for this trip.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-2 text-sm text-slate-700">
                                    <p>
                                      <span className="font-semibold">Route:</span>{" "}
                                      {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                                    </p>
                                    {typeof day.outbound_flight.price === "number" && (
                                      <p>
                                        <span className="font-semibold">Price:</span>{" "}
                                        ${day.outbound_flight.price.toLocaleString()}
                                      </p>
                                    )}
                                    {formatDuration(day.outbound_flight.total_duration) && (
                                      <p>
                                        <span className="font-semibold">Total duration:</span>{" "}
                                        {formatDuration(day.outbound_flight.total_duration)}
                                      </p>
                                    )}
                                    {/* Show airline and stops for LLM-generated flights */}
                                    {day.outbound_flight.airline && (
                                      <p>
                                        <span className="font-semibold">Airline:</span>{" "}
                                        {day.outbound_flight.airline}
                                      </p>
                                    )}
                                    {day.outbound_flight.stops !== undefined && day.outbound_flight.stops !== null && (
                                      <p>
                                        <span className="font-semibold">Stops:</span>{" "}
                                        {day.outbound_flight.stops === 0 ? "Nonstop" : `${day.outbound_flight.stops} stop${day.outbound_flight.stops > 1 ? "s" : ""}`}
                                      </p>
                                    )}
                                    {day.outbound_flight.description && (
                                      <p className="text-slate-600 italic">
                                        {day.outbound_flight.description}
                                      </p>
                                    )}
                                    {Array.isArray(day.outbound_flight.flights) && day.outbound_flight.flights.length > 0 && (
                                      <div className="mt-2">
                                        <p className="font-semibold text-xs text-slate-600 mb-1">
                                          Flight segments
                                        </p>
                                        <ul className="space-y-1.5 text-xs">
                                          {day.outbound_flight.flights.map((leg, idx) => (
                                            <li key={idx} className="rounded border border-blue-100 bg-blue-50/60 px-2 py-1">
                                              <div className="font-medium">
                                                {leg.departure_airport?.id} → {leg.arrival_airport?.id}
                                              </div>
                                              <div className="text-slate-600">
                                                {leg.departure_airport?.time} → {leg.arrival_airport?.time}
                                              </div>
                                              {leg.airline && (
                                                <div className="text-slate-500">
                                                {leg.airline}
                                              </div>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {Array.isArray(day.outbound_flight.layovers) && day.outbound_flight.layovers.length > 0 && (
                                    <div className="mt-2">
                                      <p className="font-semibold text-xs text-slate-600 mb-1">
                                        Layovers
                                      </p>
                                      <ul className="space-y-1 text-xs text-slate-600">
                                        {day.outbound_flight.layovers.map((layover, idx) => (
                                          <li key={idx}>
                                            {layover.name || layover.id}{" "}
                                            {formatDuration(layover.duration) && `• ${formatDuration(layover.duration)}`}
                                            {layover.overnight && " • overnight"}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedFlightToReplace({
                                  flight: day.outbound_flight,
                                  tripFlightId: day.outbound_flight.flight_id,
                                  flightType: "outbound",
                                });
                                setReplaceFlightModalOpen(true);
                              }}
                              className="h-10 px-3 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                              title="Replace this flight"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                          )}

                          {day.hotel && (
                            <div className="mt-2 flex gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button className="flex-1 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-slate-700 text-left hover:border-yellow-300 hover:bg-yellow-50/80 transition-colors">
                                    <span className="text-yellow-700 font-semibold">🏨 Hotel</span>{" "}
                                    {day.hotel.name}
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader>
                                    <DialogTitle>Hotel details</DialogTitle>
                                    <DialogDescription>
                                      Saved at booking time for this trip.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-2 text-sm text-slate-700">
                                    <p className="font-semibold text-base">{day.hotel.name}</p>
                                    {day.hotel.location && (
                                      <p>
                                        <span className="font-semibold">Location:</span>{" "}
                                        {day.hotel.location}
                                      </p>
                                    )}
                                    {typeof day.hotel.overall_rating === "number" && (
                                      <p>
                                        <span className="font-semibold">Rating:</span>{" "}
                                        {day.hotel.overall_rating.toFixed(1)} ⭐
                                      </p>
                                    )}
                                    {typeof day.hotel.rate_per_night === "number" && (
                                      <p>
                                        <span className="font-semibold">Rate per night:</span>{" "}
                                        ${day.hotel.rate_per_night.toLocaleString()}
                                      </p>
                                    )}
                                    {day.hotel.check_in_time && (
                                      <p>
                                        <span className="font-semibold">Check-in:</span>{" "}
                                        {day.hotel.check_in_time}
                                      </p>
                                    )}
                                    {day.hotel.check_out_time && (
                                      <p>
                                        <span className="font-semibold">Check-out:</span>{" "}
                                        {day.hotel.check_out_time}
                                      </p>
                                    )}
                                    {day.hotel.link && (
                                      <div className="pt-2">
                                        <a
                                          href={day.hotel.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:text-blue-700 underline"
                                        >
                                          View booking / property page →
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedHotelToReplace({
                                    hotel: day.hotel,
                                    tripHotelId: day.hotel.hotel_id,
                                  });
                                  setReplaceHotelModalOpen(true);
                                }}
                                className="h-10 px-3 text-yellow-600 hover:text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                                title="Replace this hotel"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-600">Activities</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAddForm(day.day_number)}
                                className="h-6 px-2 text-[10px]"
                              >
                                {showAddForm[day.day_number] ? (
                                  <>
                                    <X className="h-3 w-3 mr-1" />
                                    Cancel
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Add Activity Form */}
                            {showAddForm[day.day_number] && (
                              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                    Activity Name <span className="text-red-500">*</span>
                                  </label>
                                  <Input
                                    value={formData[day.day_number]?.name || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || {
                                            name: "",
                                            description: "",
                                            source_url: "",
                                            location: "",
                                            cost_estimate: "",
                                          }),
                                          name: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="e.g., Visit the Eiffel Tower"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                    Location (optional)
                                  </label>
                                  <Input
                                    value={formData[day.day_number]?.location || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || {
                                            name: "",
                                            description: "",
                                            source_url: "",
                                            location: "",
                                            cost_estimate: "",
                                          }),
                                          location: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder={itinerary?.destination || "e.g., Paris, France"}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                    Description (optional)
                                  </label>
                                  <Textarea
                                    value={formData[day.day_number]?.description || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || {
                                            name: "",
                                            description: "",
                                            source_url: "",
                                            location: "",
                                            cost_estimate: "",
                                          }),
                                          description: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Additional details..."
                                    className="min-h-[50px] text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                    Cost estimate <span className="text-red-500">*</span>
                                  </label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={formData[day.day_number]?.cost_estimate || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || {
                                            name: "",
                                            description: "",
                                            source_url: "",
                                            location: "",
                                            cost_estimate: "",
                                          }),
                                          cost_estimate: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="$"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                    Link (optional)
                                  </label>
                                  <Input
                                    type="url"
                                    value={formData[day.day_number]?.source_url || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || {
                                            name: "",
                                            description: "",
                                            source_url: "",
                                            location: "",
                                            cost_estimate: "",
                                          }),
                                          source_url: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="https://..."
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <Button
                                  onClick={() => handleAddActivity(day.day_number)}
                                  disabled={addingActivity[day.day_number]}
                                  className="w-full h-7 text-xs"
                                  size="sm"
                                >
                                  {addingActivity[day.day_number] ? "Adding..." : "Add Activity"}
                                </Button>
                              </div>
                            )}

                            {day.activities && day.activities.length > 0 && (
                              <div className="space-y-2">
                                {day.activities.map((activity, index) => {
                                  const activityKey = `${day.day_number}-${activity.activity_id || index}`;
                                  return (
                                    <div
                                      key={activityKey}
                                      onClick={() => {
                                        setSelectedActivityDetail({ dayNumber: day.day_number, activity });
                                        setActivityLocationDraft(activity.address || activity.location || "");
                                      }}
                                      className="group rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700 hover:border-blue-300 transition-colors cursor-pointer"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <p className="font-semibold text-slate-900">{activity.name}</p>
                                          {activity.description && (
                                            <p className="mt-1 text-[11px] text-slate-600">{activity.description}</p>
                                          )}
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                            {activity.location && <span>📍 {activity.location}</span>}
                                            {activity.duration && <span>⏱️ {activity.duration}</span>}
                                            {activity.cost_estimate && (
                                              <span className="text-emerald-500">
                                                ${activity.cost_estimate}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {activity.source_url && (
                                            <a
                                              href={activity.source_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[11px] text-blue-600 hover:text-blue-700 underline whitespace-nowrap"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              Learn more →
                                            </a>
                                          )}
                                          {activity.activity_id && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedActivityToReplace({
                                                  activity,
                                                  dayNumber: day.day_number,
                                                });
                                                setReplaceModalOpen(true);
                                              }}
                                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                              title="Replace this activity"
                                            >
                                              <RotateCcw className="h-3 w-3" />
                                            </Button>
                                          )}
                                          {activity.activity_id && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteActivity(day.day_number, activity.activity_id!);
                                              }}
                                              disabled={deletingActivity[activityKey]}
                                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
                                              title="Delete this activity"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Meals / Restaurants Section */}
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-600">Meals</p>
                            {(["breakfast", "lunch", "dinner"] as MealSlot[]).map((slot) => {
                              const dayMeals = mealsByDay[day.day_number] || {};
                              const meal = dayMeals[slot];
                              const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
                              
                              if (!meal || !meal.name) {
                                return (
                                  <div
                                    key={slot}
                                    onClick={() => {
                                      setEditingMeal({ dayNumber: day.day_number, slot });
                                      setMealForm({
                                        name: "",
                                        location: itinerary.destination || "",
                                        link: "",
                                        cost: "30",
                                      });
                                    }}
                                    className="rounded-md border border-dashed border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-slate-500 cursor-pointer hover:border-amber-300 hover:bg-amber-50/60 transition-colors"
                                  >
                                    <span className="text-amber-600 font-semibold">🍽️ {slotLabel}</span>{" "}
                                    <span className="italic">Click to add restaurant</span>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={slot}
                                  onClick={() => {
                                    setEditingMeal({ dayNumber: day.day_number, slot });
                                    setMealForm({
                                      name: meal.name || "",
                                      location: meal.location || itinerary.destination || "",
                                      link: meal.link || "",
                                      cost: typeof meal.cost === "number" ? String(meal.cost) : "30",
                                    });
                                  }}
                                  className="group rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700 cursor-pointer hover:border-amber-300 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <p className="font-semibold text-slate-900">
                                        <span className="text-amber-600">🍽️ {slotLabel}:</span> {meal.name}
                                      </p>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                        {meal.location && <span>📍 {meal.location}</span>}
                                        {meal.cost && (
                                          <span className="text-emerald-500">
                                            ${meal.cost.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {meal.link && (
                                        <a
                                          href={meal.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-blue-600 hover:text-blue-700 underline whitespace-nowrap"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          View →
                                        </a>
                                      )}
                                      {meal.trip_meal_id && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedMealToReplace({
                                              meal,
                                              dayNumber: day.day_number,
                                              slot,
                                            });
                                            setReplaceRestaurantModalOpen(true);
                                          }}
                                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                                          title="Replace this restaurant"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {day.return_flight && (
                            <div className="mt-3 flex gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button className="flex-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600 text-left hover:border-blue-300 hover:bg-blue-50/80 transition-colors">
                                    <span className="text-blue-600 font-semibold">✈️ Return</span>{" "}
                                    {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader>
                                    <DialogTitle>Return flight details</DialogTitle>
                                    <DialogDescription>
                                      Saved at booking time for this trip.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-2 text-sm text-slate-700">
                                    <p>
                                      <span className="font-semibold">Route:</span>{" "}
                                      {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                                    </p>
                                    {typeof day.return_flight.price === "number" && (
                                      <p>
                                        <span className="font-semibold">Price:</span>{" "}
                                        ${day.return_flight.price.toLocaleString()}
                                      </p>
                                    )}
                                    {formatDuration(day.return_flight.total_duration) && (
                                      <p>
                                        <span className="font-semibold">Total duration:</span>{" "}
                                        {formatDuration(day.return_flight.total_duration)}
                                      </p>
                                    )}
                                    {/* Show airline and stops for LLM-generated flights */}
                                    {day.return_flight.airline && (
                                      <p>
                                        <span className="font-semibold">Airline:</span>{" "}
                                        {day.return_flight.airline}
                                      </p>
                                    )}
                                    {day.return_flight.stops !== undefined && day.return_flight.stops !== null && (
                                      <p>
                                        <span className="font-semibold">Stops:</span>{" "}
                                        {day.return_flight.stops === 0 ? "Nonstop" : `${day.return_flight.stops} stop${day.return_flight.stops > 1 ? "s" : ""}`}
                                      </p>
                                    )}
                                    {day.return_flight.description && (
                                      <p className="text-slate-600 italic">
                                        {day.return_flight.description}
                                      </p>
                                    )}
                                    {Array.isArray(day.return_flight.flights) && day.return_flight.flights.length > 0 && (
                                      <div className="mt-2">
                                        <p className="font-semibold text-xs text-slate-600 mb-1">
                                          Flight segments
                                        </p>
                                        <ul className="space-y-1.5 text-xs">
                                          {day.return_flight.flights.map((leg, idx) => (
                                            <li key={idx} className="rounded border border-blue-100 bg-blue-50/60 px-2 py-1">
                                              <div className="font-medium">
                                                {leg.departure_airport?.id} → {leg.arrival_airport?.id}
                                              </div>
                                              <div className="text-slate-600">
                                                {leg.departure_airport?.time} → {leg.arrival_airport?.time}
                                              </div>
                                              {leg.airline && (
                                                <div className="text-slate-500">
                                                  {leg.airline}
                                                </div>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {Array.isArray(day.return_flight.layovers) && day.return_flight.layovers.length > 0 && (
                                      <div className="mt-2">
                                        <p className="font-semibold text-xs text-slate-600 mb-1">
                                          Layovers
                                        </p>
                                        <ul className="space-y-1 text-xs text-slate-600">
                                          {day.return_flight.layovers.map((layover, idx) => (
                                            <li key={idx}>
                                              {layover.name || layover.id}{" "}
                                              {formatDuration(layover.duration) && `• ${formatDuration(layover.duration)}`}
                                              {layover.overnight && " • overnight"}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedFlightToReplace({
                                    flight: day.return_flight,
                                    tripFlightId: day.return_flight.flight_id,
                                    flightType: "return",
                                  });
                                  setReplaceFlightModalOpen(true);
                                }}
                                className="h-10 px-3 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                                title="Replace this flight"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                        </div>
                      );
                        })}
                      </div>
                    </TabsContent>

                    <TabsContent value="map" className="mt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-600">
                            Day map: activities, hotel, and nearby points
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Day:</span>
                            <select
                              className="h-7 rounded border border-blue-200 bg-white px-2 text-xs text-slate-700"
                              value={selectedMapDayIndex}
                              onChange={(e) => setSelectedMapDayIndex(Number(e.target.value))}
                            >
                              {itinerary.days.map((d, idx) => (
                                <option key={d.day_number} value={idx}>
                                  Day {d.day_number}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700">
                          {(() => {
                            const day = itinerary.days[selectedMapDayIndex] || itinerary.days[0];
                            const activities = day.activities || [];
                            if (activities.length === 0) {
                              return <p className="text-slate-500">No activities added for this day yet.</p>;
                            }
                            return (
                              <div className="space-y-2">
                                <p className="font-semibold text-slate-800">Activities shown on the map</p>
                                <ul className="space-y-1">
                                  {activities.map((act, idx) => (
                                    <li key={`${act.activity_id || idx}`} className="text-[11px]">
                                      <span className="font-semibold text-slate-800">
                                        {idx + 1}. {act.name || "Activity"}
                                      </span>
                                      {act.description && (
                                        <span className="block text-slate-600">{act.description}</span>
                                      )}
                                      {(act.address || act.location) && (
                                        <span className="block text-slate-500">
                                          📍 {act.address || act.location}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                        </div>
                        {!GOOGLE_MAPS_API_KEY && (
                          <p className="text-[11px] text-rose-500">
                            Google Maps API key is not configured. Please set GOOGLE_MAPS_API_KEY/VITE_GOOGLE_MAPS_API_KEY to
                            see the map.
                          </p>
                        )}
                        <div
                          ref={mapRef}
                          className="mt-2 h-[360px] w-full rounded-md border border-blue-100 bg-blue-50/40"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="budget" className="mt-0">
                      {(() => {
                        const { daily, totals } = computeBudgetData();
                        const remaining =
                          typeof itinerary.total_budget === "number"
                            ? itinerary.total_budget - totals.total
                            : null;

                        const baseChartData = [
                          { name: "Transportation", key: "flights", value: totals.flights },
                          { name: "Hotels", key: "hotels", value: totals.hotels },
                          { name: "Activities", key: "activities", value: totals.activities },
                          { name: "Meals", key: "meals", value: totals.meals },
                          { name: "Other", key: "extras", value: totals.extras },
                        ].filter((d) => d.value > 0);

                        const chartData =
                          remaining !== null && remaining > 0
                            ? [
                                ...baseChartData,
                                { name: "Unused budget", key: "unused", value: remaining },
                              ]
                            : baseChartData;

                        return (
                          <div className="space-y-5">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-slate-800">Budget</p>
                              <div className="inline-flex rounded border border-blue-200 bg-white overflow-hidden text-[11px]">
                                <button
                                  type="button"
                                  className={`px-2 py-1 ${
                                    budgetView === "daily"
                                      ? "bg-blue-500 text-white"
                                      : "bg-white text-slate-700"
                                  }`}
                                  onClick={() => setBudgetView("daily")}
                                >
                                  Day-by-day
                                </button>
                                <button
                                  type="button"
                                  className={`px-2 py-1 border-l border-blue-200 ${
                                    budgetView === "summary"
                                      ? "bg-blue-500 text-white"
                                      : "bg-white text-slate-700"
                                  }`}
                                  onClick={() => setBudgetView("summary")}
                                >
                                  Summary
                                </button>
                              </div>
                            </div>
                            {/* (1) Summary table with expandable per-day breakdown */}
                            <div
                              className="rounded-md border border-blue-100 bg-white/90 overflow-hidden"
                              style={{ display: budgetView === "daily" ? "none" : undefined }}
                            >
                              <details open className="group">
                                <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none bg-blue-50/80">
                                  <span className="text-xs font-semibold text-slate-800">
                                    Trip cost summary
                                  </span>
                                  <span className="flex items-center gap-4 text-[11px] text-slate-600">
                                    <span>
                                      Transportation:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {totals.flights
                                          ? `$${formatMoney(totals.flights)}`
                                          : "—"}
                                      </span>
                                    </span>
                                    <span>
                                      Hotels:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {totals.hotels
                                          ? `$${formatMoney(totals.hotels)}`
                                          : "—"}
                                      </span>
                                    </span>
                                    <span>
                                      Activities:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {totals.activities
                                          ? `$${formatMoney(totals.activities)}`
                                          : "—"}
                                      </span>
                                    </span>
                                    <span>
                                      Meals:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {totals.meals
                                          ? `$${formatMoney(totals.meals)}`
                                          : "—"}
                                      </span>
                                    </span>
                                    <span>
                                      Other:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {totals.extras
                                          ? `$${formatMoney(totals.extras)}`
                                          : "—"}
                                      </span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                      <span className="group-open:hidden">Show per day ▾</span>
                                      <span className="hidden group-open:inline">Hide per day ▴</span>
                                    </span>
                                  </span>
                                </summary>
                                <div className="overflow-x-auto border-t border-blue-100">
                                  <table className="min-w-full border-collapse text-xs">
                                    <thead className="bg-blue-50">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-700">
                                          Day
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Transportation
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Hotel
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Activities
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Meals
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Other
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-700">
                                          Total
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {daily.map((d) => (
                                        <tr key={d.day_number} className="border-t border-blue-50">
                                          <td className="px-3 py-2 text-slate-700">
                                            Day {d.day_number}
                                          </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.flightTotal
                                          ? `$${formatMoney(d.flightTotal)}`
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.hotelTotal
                                          ? `$${formatMoney(d.hotelTotal)}`
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.activityTotal
                                          ? `$${formatMoney(d.activityTotal)}`
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.mealTotal
                                          ? `$${formatMoney(d.mealTotal)}`
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.extrasTotal
                                          ? `$${formatMoney(d.extrasTotal)}`
                                          : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                                        {d.total
                                          ? `$${formatMoney(d.total)}`
                                          : "—"}
                                      </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            </div>

                            {/* Pie chart + overall budget summary */}
                            <div
                              className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start"
                              style={{ display: budgetView === "daily" ? "none" : undefined }}
                            >
                              {chartData.length > 0 && (
                                <ChartContainer
                                  config={{
                                    // Match category colors:
                                    // activities = blue, meals = orange, hotels = green,
                                    // transportation = yellow, other = purple
                                    flights: { label: "Transportation", color: "#facc15" }, // yellow-400
                                    hotels: { label: "Hotels", color: "#22c55e" }, // green (emerald-500)
                                    activities: { label: "Activities", color: "#0ea5e9" }, // blue (sky-500)
                                    meals: { label: "Meals", color: "#f97316" }, // orange-500
                                    extras: { label: "Other", color: "#a855f7" }, // purple-500
                                    unused: { label: "Unused budget", color: "#94a3b8" }, // slate-400
                                  }}
                                  className="h-[260px]"
                                >
                                  <PieChart>
                                    <Pie
                                      data={chartData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      outerRadius={80}
                                      label={(entry) =>
                                        `${entry.name}: $${formatMoney(
                                          typeof entry.value === "number" ? entry.value : 0
                                        )}`
                                      }
                                    >
                                      {chartData.map((entry) => (
                                        <Cell
                                          key={entry.key}
                                          fill={
                                            entry.key === "flights"
                                              ? "var(--color-flights)"
                                              : entry.key === "hotels"
                                              ? "var(--color-hotels)"
                                              : entry.key === "activities"
                                              ? "var(--color-activities)"
                                              : entry.key === "meals"
                                              ? "var(--color-meals)"
                                              : entry.key === "extras"
                                              ? "var(--color-extras)"
                                              : "var(--color-unused)"
                                          }
                                        />
                                      ))}
                                    </Pie>
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Legend />
                                  </PieChart>
                                </ChartContainer>
                              )}

                              <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700 space-y-2">
                                <p className="font-semibold text-slate-800">Trip budget summary</p>
                                <p>
                                  <span className="font-semibold">Total planned spend:</span>{" "}
                                  {totals.total ? `$${formatMoney(totals.total)}` : "—"}
                                </p>
                                {typeof itinerary.total_budget === "number" && (
                                  <p>
                                    <span className="font-semibold">Overall budget:</span>{" "}
                                    ${formatMoney(itinerary.total_budget)}
                                  </p>
                                )}
                                {remaining !== null && (
                                  <p
                                    className={
                                      remaining >= 0 ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"
                                    }
                                  >
                                    {remaining >= 0
                                      ? `Remaining budget: $${formatMoney(remaining)}`
                                      : `Over budget by $${formatMoney(Math.abs(remaining))}`}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* (2) Day-to-day expenses in a card view (cost calendar) */}
                            <div
                              className="mt-2"
                              style={{ display: budgetView === "summary" ? "none" : undefined }}
                            >
                              <p className="text-xs font-semibold text-slate-800 mb-2">
                                Day-by-day expenses
                              </p>
                              <div className="grid gap-3 lg:grid-cols-2">
                                {itinerary.days.map((day) => {
                                  const d = daily.find((row) => row.day_number === day.day_number);
                                  const extras = extraExpensesByDay[day.day_number] || [];
                                  const draft =
                                    extraExpenseDrafts[day.day_number] || {
                                      label: "",
                                      amount: "",
                                      category: "other" as BudgetCategory,
                                    };

                                  type BudgetItem = {
                                    id: string;
                                    label: string;
                                    amount: number;
                                    kind: BudgetCategory;
                                    source: "auto" | "extra";
                                    dayNumber: number;
                                    activityId?: number;
                                    mealSlot?: MealSlot;
                                    flightId?: number;
                                    hotelId?: number;
                                    finalized?: boolean;
                                  };

                                  const items: BudgetItem[] = [];

                                  // Flights / transport (use outbound / return flights directly if present)
                                  if (day.outbound_flight?.price) {
                                    items.push({
                                      id: `outbound-${day.day_number}`,
                                      label: "Outbound flight",
                                      amount: day.outbound_flight.price,
                                      kind: "transport",
                                      source: "auto",
                                      dayNumber: day.day_number,
                                      finalized: day.outbound_flight.finalized ?? true,
                                      flightId: day.outbound_flight.flight_id,
                                    });
                                  }
                                  if (day.return_flight?.price) {
                                    items.push({
                                      id: `return-${day.day_number}`,
                                      label: "Return flight",
                                      amount: day.return_flight.price,
                                      kind: "transport",
                                      source: "auto",
                                      dayNumber: day.day_number,
                                      finalized: day.return_flight.finalized ?? true,
                                      flightId: day.return_flight.flight_id,
                                    });
                                  }

                                  // Hotel (per-night cost)
                                  if (typeof day.hotel?.rate_per_night === "number") {
                                    items.push({
                                      id: `hotel-${day.day_number}`,
                                      label: day.hotel.name || "Hotel",
                                      amount: day.hotel.rate_per_night,
                                      kind: "hotel",
                                      source: "auto",
                                      dayNumber: day.day_number,
                                      finalized: day.hotel.finalized ?? true,
                                      hotelId: day.hotel.hotel_id,
                                    });
                                  }

                                  // Activities
                                  (day.activities || []).forEach((act, idx) => {
                                    items.push({
                                      id: `activity-${day.day_number}-${act.activity_id ?? idx}`,
                                      label: act.name || "Activity",
                                      amount: parseMoneyNumber(act.cost_estimate),
                                      kind: "activity",
                                      source: "auto",
                                      dayNumber: day.day_number,
                                      activityId: act.activity_id,
                                      finalized: act.finalized ?? false,
                                    });
                                  });

                                  // Meals from calendar
                                  const dayMeals = mealsByDay[day.day_number] || {};
                                  (["breakfast", "lunch", "dinner"] as MealSlot[]).forEach((slot) => {
                                    const meal = dayMeals[slot];
                                    if (meal) {
                                      const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
                                      items.push({
                                        id: `meal-${day.day_number}-${slot}`,
                                        label: meal.name || slotLabel,
                                        amount: typeof meal.cost === "number" ? meal.cost : 0,
                                        kind: "meal",
                                        source: "auto",
                                        dayNumber: day.day_number,
                                        mealSlot: slot,
                                        finalized: meal.finalized ?? false,
                                      });
                                    }
                                  });

                                  // Manual extras
                                  extras.forEach((e) => {
                                    items.push({
                                      id: e.id,
                                      label: e.label,
                                      amount: e.amount,
                                      kind: e.category,
                                      source: "extra",
                                        dayNumber: day.day_number,
                                        finalized: e.finalized ?? true,
                                    });
                                  });

                                  const kindClasses: Record<BudgetCategory, string> = {
                                    activity:
                                      "border-l-4 border-sky-400 bg-sky-50/60 text-sky-900",
                                    meal:
                                      "border-l-4 border-orange-400 bg-orange-50/60 text-orange-900",
                                    hotel:
                                      "border-l-4 border-emerald-400 bg-emerald-50/60 text-emerald-900",
                                    transport:
                                      "border-l-4 border-yellow-400 bg-yellow-50/60 text-yellow-900",
                                    other:
                                      "border-l-4 border-purple-400 bg-purple-50/60 text-purple-900",
                                  };

                                  const kindLabel: Record<BudgetCategory, string> = {
                                    activity: "Activity",
                                    meal: "Meal",
                                    hotel: "Hotel",
                                    transport: "Transportation",
                                    other: "Other",
                                  };
                                  return (
                                    <div
                                      key={day.day_number}
                                      className="rounded-lg border border-blue-100 bg-white/90 p-3 space-y-2 text-xs"
                                    >
                                      <div className="flex items-center justify-between border-b border-blue-100 pb-1.5">
                                        <div>
                                          <p className="text-[11px] uppercase tracking-wide text-blue-500">
                                            Day {day.day_number}
                                          </p>
                                          <p className="text-xs font-semibold text-slate-900">
                                            {formatDate(day.date) || `Day ${day.day_number}`}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[11px] text-slate-500">Total</p>
                                          <p className="text-sm font-semibold text-slate-900">
                                            {d?.total ? `$${formatMoney(d.total)}` : "—"}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-2 space-y-1.5">
                                        {items.length === 0 && (
                                          <p className="text-[11px] text-slate-400">
                                            No expenses recorded for this day yet.
                                          </p>
                                        )}
                                        {items.map((item) => {
                                          const isAutoEditable =
                                            item.source === "auto" && (item.kind === "activity" || item.kind === "meal");
                                          const showFinalToggle =
                                            item.kind === "activity" || item.kind === "meal" || item.source === "extra";
                                          const isEditingAuto = isAutoEditable && editingBudgetItemId === item.id;
                                          const finalizedValue =
                                            typeof item.finalized === "boolean"
                                              ? item.finalized
                                              : item.kind === "activity" || item.kind === "meal"
                                              ? false
                                              : true;
                                          const isEditing =
                                            item.source === "extra" && editingExtraId === item.id && editingExtraDraft;

                                          if (isEditingAuto) {
                                            return (
                                              <div
                                                key={item.id}
                                                className={`flex items-center justify-between rounded px-2 py-1 ${kindClasses[item.kind]}`}
                                              >
                                                <div className="flex flex-col">
                                                  <span className="text-[11px] font-semibold">{item.label}</span>
                                                  <span className="text-[10px] opacity-80">
                                                    {kindLabel[item.kind]}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    className="h-6 w-20 text-[11px]"
                                                    value={editingBudgetAmount}
                                                    onChange={(ev) => setEditingBudgetAmount(ev.target.value)}
                                                  />
                                                  {showFinalToggle && (
                                                    <div className="flex items-center gap-1">
                                                      <span className="text-[10px] text-slate-500">Final</span>
                                                      <Switch
                                                        checked={finalizedValue}
                                                        onCheckedChange={(checked) =>
                                                          handleToggleExpenseFinalized({
                                                            id: item.id,
                                                            kind: item.kind,
                                                            source: item.source,
                                                            dayNumber: item.dayNumber,
                                                            activityId: item.activityId,
                                                            mealSlot: item.mealSlot,
                                                            flightId: item.flightId,
                                                            hotelId: item.hotelId,
                                                            nextValue: checked,
                                                            label: item.label,
                                                            amount: item.amount,
                                                          })
                                                        }
                                                      />
                                                    </div>
                                                  )}
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-6 px-2 text-[11px]"
                                                    onClick={() => {
                                                      const amountNum = parseFloat(editingBudgetAmount);
                                                      if (Number.isNaN(amountNum)) return;
                                                      const fixedAmount = Math.max(
                                                        0,
                                                        parseFloat(amountNum.toFixed(2))
                                                      );
                                                      if (item.kind === "meal" && item.mealSlot) {
                                                        setMealsByDay((prev) => {
                                                          const next = {
                                                            ...prev,
                                                            [item.dayNumber]: {
                                                              ...(prev[item.dayNumber] || {}),
                                                              [item.mealSlot]: {
                                                                ...(prev[item.dayNumber]?.[item.mealSlot] || {
                                                                  name: item.label,
                                                                  location: "",
                                                                }),
                                                                cost: fixedAmount,
                                                              },
                                                            },
                                                          };
                                                          persistMeals(next);
                                                          return next;
                                                        });
                                                      }
                                                      if (item.kind === "activity" && item.activityId) {
                                                        handleUpdateActivityCost(
                                                          item.dayNumber,
                                                          item.activityId,
                                                          fixedAmount
                                                        );
                                                      }
                                                      setEditingBudgetItemId(null);
                                                      setEditingBudgetAmount("");
                                                    }}
                                                  >
                                                    Save
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[11px]"
                                                    onClick={() => {
                                                      setEditingBudgetItemId(null);
                                                      setEditingBudgetAmount("");
                                                    }}
                                                  >
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            );
                                          }

                                          if (isEditing && editingExtraDraft) {
                                            return (
                                              <div
                                                key={item.id}
                                                className={`flex flex-col gap-1 rounded px-2 py-1 ${kindClasses[editingExtraDraft.category]}`}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex-1 flex flex-col gap-1">
                                                    <Input
                                                      className="h-7 text-[11px]"
                                                      value={editingExtraDraft.label}
                                                      onChange={(ev) =>
                                                        setEditingExtraDraft((prev) =>
                                                          prev
                                                            ? { ...prev, label: ev.target.value }
                                                            : prev
                                                        )
                                                      }
                                                    />
                                                    <div className="flex gap-2">
                                                      <Input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        className="h-7 w-24 text-[11px]"
                                                        value={editingExtraDraft.amount}
                                                        onChange={(ev) =>
                                                          setEditingExtraDraft((prev) =>
                                                            prev
                                                              ? { ...prev, amount: ev.target.value }
                                                              : prev
                                                          )
                                                        }
                                                      />
                                                      <select
                                                        className="h-7 text-[11px] border border-blue-200 rounded px-1 bg-white text-slate-700 flex-1"
                                                        value={editingExtraDraft.category}
                                                        onChange={(ev) =>
                                                          setEditingExtraDraft((prev) =>
                                                            prev
                                                              ? {
                                                                  ...prev,
                                                                  category: ev.target.value as BudgetCategory,
                                                                }
                                                              : prev
                                                          )
                                                        }
                                                      >
                                                        <option value="activity">Activity</option>
                                                        <option value="meal">Meal</option>
                                                        <option value="hotel">Hotel</option>
                                                        <option value="transport">Transportation</option>
                                                        <option value="other">Other</option>
                                                      </select>
                                                    </div>
                                                  </div>
                                                  <div className="flex flex-col gap-1 ml-2">
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      className="h-6 px-2 text-[11px]"
                                                      onClick={() => {
                                                        if (!editingExtraDraft) return;
                                                        const amountNum = parseFloat(editingExtraDraft.amount);
                                                        if (
                                                          !editingExtraDraft.label.trim() ||
                                                          Number.isNaN(amountNum)
                                                        ) {
                                                          return;
                                                        }
                                                        setExtraExpensesByDay((prev) => {
                                                          const copy = { ...prev };
                                                          copy[day.day_number] = (copy[day.day_number] || []).map(
                                                            (x) =>
                                                              x.id === item.id
                                                                ? {
                                                                    ...x,
                                                                    label: editingExtraDraft.label.trim(),
                                                                    amount: Math.max(
                                                                      0,
                                                                      parseFloat(amountNum.toFixed(2))
                                                                    ),
                                                                    category: editingExtraDraft.category,
                                                                  }
                                                                : x
                                                          );
                                                          persistExpenses(copy);
                                                          return copy;
                                                        });
                                                        setEditingExtraId(null);
                                                        setEditingExtraDraft(null);
                                                      }}
                                                    >
                                                      Save
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-6 px-2 text-[11px]"
                                                      onClick={() => {
                                                        setEditingExtraId(null);
                                                        setEditingExtraDraft(null);
                                                      }}
                                                    >
                                                      Cancel
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          }

                                          return (
                                            <div
                                              key={item.id}
                                              className={`flex items-center justify-between rounded px-2 py-1 ${kindClasses[item.kind]}`}
                                            >
                                              <div className="flex flex-col">
                                                <span className="text-[11px] font-semibold">
                                                  {item.label}
                                                </span>
                                                <span className="text-[10px] opacity-80">
                                                  {kindLabel[item.kind]}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-semibold">
                                                  ${item.amount.toFixed(2)}
                                                </span>
                                                {showFinalToggle && (
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-500">Final</span>
                                                    <Switch
                                                      checked={finalizedValue}
                                                      onCheckedChange={(checked) =>
                                                        handleToggleExpenseFinalized({
                                                          id: item.id,
                                                          kind: item.kind,
                                                          source: item.source,
                                                          dayNumber: item.dayNumber,
                                                          activityId: item.activityId,
                                                          mealSlot: item.mealSlot,
                                                          flightId: item.flightId,
                                                          hotelId: item.hotelId,
                                                          nextValue: checked,
                                                          label: item.label,
                                                          amount: item.amount,
                                                        })
                                                      }
                                                    />
                                                  </div>
                                                )}
                                                {item.source === "extra" && (
                                                  <>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-5 w-5 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                      onClick={() => {
                                                        setEditingExtraId(item.id);
                                                        setEditingExtraDraft({
                                                          label: item.label,
                                                          amount: item.amount.toFixed(2),
                                                          category: item.kind,
                                                        });
                                                      }}
                                                    >
                                                      ✎
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-5 w-5 text-slate-500 hover:text-rose-500 hover:bg-rose-50"
                                                      onClick={() => {
                                                        setExtraExpensesByDay((prev) => {
                                                          const copy = { ...prev };
                                                          copy[day.day_number] = (copy[day.day_number] || []).filter(
                                                            (x) => x.id !== item.id
                                                          );
                                                          persistExpenses(copy);
                                                          return copy;
                                                        });
                                                      }}
                                                    >
                                                      ×
                                                    </Button>
                                                  </>
                                                )}
                                                {isAutoEditable && (
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                    onClick={() => {
                                                      setEditingBudgetItemId(item.id);
                                                      setEditingBudgetAmount(item.amount.toFixed(2));
                                                    }}
                                                  >
                                                    ✎
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <div className="mt-1 flex flex-col gap-1.5">
                                          <div className="flex items-center gap-2 flex-nowrap">
                                            <Input
                                              placeholder="Label"
                                              className="h-7 text-[11px] flex-1 min-w-[140px]"
                                              value={draft.label}
                                              onChange={(ev) =>
                                                setExtraExpenseDrafts((prev) => ({
                                                  ...prev,
                                                  [day.day_number]: {
                                                    ...(prev[day.day_number] || {
                                                      label: "",
                                                      amount: "",
                                                      category: "other" as BudgetCategory,
                                                    }),
                                                    label: ev.target.value,
                                                  },
                                                }))
                                              }
                                            />
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder="$"
                                              className="h-7 w-20 text-[11px]"
                                              value={draft.amount}
                                              onChange={(ev) =>
                                                setExtraExpenseDrafts((prev) => ({
                                                  ...prev,
                                                  [day.day_number]: {
                                                    ...(prev[day.day_number] || {
                                                      label: "",
                                                      amount: "",
                                                      category: "other" as BudgetCategory,
                                                    }),
                                                    amount: ev.target.value,
                                                  },
                                                }))
                                              }
                                            />
                                            <select
                                              className="h-7 text-[11px] border border-blue-200 rounded px-1 bg-white text-slate-700 w-32"
                                              value={draft.category}
                                              onChange={(ev) =>
                                                setExtraExpenseDrafts((prev) => ({
                                                  ...prev,
                                                  [day.day_number]: {
                                                    ...(prev[day.day_number] || {
                                                      label: "",
                                                      amount: "",
                                                      category: "other" as BudgetCategory,
                                                    }),
                                                    category: ev.target.value as BudgetCategory,
                                                  },
                                                }))
                                              }
                                            >
                                              <option value="activity">Activity</option>
                                              <option value="meal">Meal</option>
                                              <option value="hotel">Hotel</option>
                                              <option value="transport">Transportation</option>
                                              <option value="other">Other</option>
                                            </select>
                                          </div>
                                          <div className="flex justify-end">
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="h-7 px-2 text-[11px]"
                                              onClick={() => {
                                                const amountNum = parseFloat(draft.amount);
                                                if (!draft.label.trim() || Number.isNaN(amountNum)) {
                                                  return;
                                                }
                                                setExtraExpensesByDay((prev) => {
                                                  const next = {
                                                    ...prev,
                                                    [day.day_number]: [
                                                      ...(prev[day.day_number] || []),
                                                      {
                                                        id: `${day.day_number}-${Date.now()}-${Math.random()
                                                          .toString(36)
                                                          .slice(2, 6)}`,
                                                        label: draft.label.trim(),
                                                        amount: Math.max(
                                                          0,
                                                          parseFloat(amountNum.toFixed(2))
                                                        ),
                                                        category: draft.category,
                                                        finalized: true,
                                                      },
                                                    ],
                                                  };
                                                  persistExpenses(next);
                                                  return next;
                                                });
                                                setExtraExpenseDrafts((prev) => ({
                                                  ...prev,
                                                  [day.day_number]: {
                                                    label: "",
                                                    amount: "",
                                                    category: draft.category,
                                                  },
                                                }));
                                              }}
                                            >
                                              Add
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>

                    <TabsContent value="calendar" className="mt-0">
                      <div className="mb-3 p-2 bg-slate-50 rounded-md border border-slate-200">
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold">Read-only view</span> — This calendar shows your itinerary in chronological order. 
                          To make changes, use the <span className="font-semibold">Editable Overview</span> tab.
                        </p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                        {itinerary.days.map((day) => (
                          <div
                            key={day.day_number}
                            className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Day {day.day_number}
                                </p>
                                <p className="text-xs font-semibold text-slate-900">
                                  {formatDate(day.date) || `Day ${day.day_number}`}
                                </p>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                                View Only
                              </span>
                            </div>
                            <div className="space-y-1.5 mt-1">
                              {(() => {
                                const activities = day.activities || [];
                                const morningActs = activities.slice(0, 1);
                                const afternoonActs = activities.slice(1, 2);
                                const eveningActs = activities.slice(2, 3);
                                const anytimeActs = activities.slice(3);

                                const dayMeals = mealsByDay[day.day_number] || {};
                                const travelSegments = travelInfoByDay[day.day_number]?.segments || [];

                                type Row =
                                  | { kind: "meal"; slot: MealSlot; label: string; location?: string }
                                  | { kind: "activity"; slotLabel: string; label: string; location?: string };

                                const rows: Row[] = [];

                                const pushMeal = (slot: MealSlot) => {
                                  const meal = dayMeals[slot];
                                  const label = slot.charAt(0).toUpperCase() + slot.slice(1);
                                  rows.push({
                                    kind: "meal",
                                    slot,
                                    label: meal?.name || label,
                                    location: meal?.location,
                                  });
                                };

                                const pushActs = (acts: typeof activities, slotLabel: string) => {
                                  acts.forEach((act) => {
                                    rows.push({
                                      kind: "activity",
                                      slotLabel,
                                      label: act?.name || "Activity",
                                      location: act?.location,
                                    });
                                  });
                                };

                                // Build chronological rows: breakfast → morning → lunch → afternoon → dinner → evening → anytime
                                pushMeal("breakfast");
                                pushActs(morningActs, "Morning");
                                pushMeal("lunch");
                                pushActs(afternoonActs, "Afternoon");
                                pushMeal("dinner");
                                pushActs(eveningActs, "Evening");
                                pushActs(anytimeActs, "Anytime");

                                const renderRow = (row: Row, idx: number) => {
                                  if (row.kind === "meal") {
                                    const slot = row.slot;
                                    const label = slot.charAt(0).toUpperCase() + slot.slice(1);
                                    const meal = dayMeals[slot];
                                    return (
                                      <div
                                        key={`row-${idx}`}
                                        className="flex w-full items-start gap-2 rounded-md border border-dashed border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[11px]"
                                      >
                                        <span className="mt-[1px] inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                          {label}
                                        </span>
                                        <div className="flex-1">
                                          {meal && meal.name ? (
                                            <>
                                              <p className="font-semibold text-slate-900">
                                                {meal.name}
                                              </p>
                                              {meal.location && (
                                                <p className="text-[10px] text-slate-500">📍 {meal.location}</p>
                                              )}
                                            </>
                                          ) : (
                                            <p className="text-[10px] text-slate-400 italic">
                                              No {label.toLowerCase()} set
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`row-${idx}`}
                                      className="flex items-start gap-2 rounded-md border border-blue-100 bg-white px-2 py-1.5 text-[11px]"
                                    >
                                      <span className="mt-[1px] inline-flex rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                        {row.slotLabel}
                                      </span>
                                      <div className="flex-1">
                                        <p className="font-semibold text-slate-900">
                                          {row.label || "Activity"}
                                        </p>
                                        {row.location && (
                                          <p className="text-[10px] text-slate-500">📍 {row.location}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                };

                                const renderTransit = (fromLabel: string, toLabel: string, idx: number) => {
                                  const seg = travelSegments.find(
                                    (s) => s.fromLabel === fromLabel && s.toLabel === toLabel
                                  );
                                  if (!seg) return null;
                                  return (
                                    <div
                                      key={`transit-${idx}`}
                                      className="flex items-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
                                    >
                                      <span className="inline-flex rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700">
                                        Transit
                                      </span>
                                      <span>
                                        {seg.fromLabel} → {seg.toLabel}: {seg.durationText} ({seg.distanceText})
                                      </span>
                                    </div>
                                  );
                                };

                                const elements: JSX.Element[] = [];
                                rows.forEach((row, idx) => {
                                  elements.push(renderRow(row, idx));
                                  if (idx < rows.length - 1) {
                                    const next = rows[idx + 1];
                                    const transit = renderTransit(row.label, next.label, idx);
                                    if (transit) elements.push(transit);
                                  }
                                });

                                return elements;
                              })()}
                            </div>

                            {/* Show flight info in calendar view */}
                            {day.outbound_flight && (
                              <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-slate-600">
                                <span className="text-blue-600 font-semibold">✈️ Outbound</span>{" "}
                                {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                                {day.outbound_flight.price && (
                                  <span className="ml-2 text-emerald-600">${day.outbound_flight.price}</span>
                                )}
                              </div>
                            )}
                            {day.return_flight && (
                              <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-slate-600">
                                <span className="text-blue-600 font-semibold">✈️ Return</span>{" "}
                                {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                                {day.return_flight.price && (
                                  <span className="ml-2 text-emerald-600">${day.return_flight.price}</span>
                                )}
                              </div>
                            )}
                            {day.hotel && (
                              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-[11px] text-slate-600">
                                <span className="text-yellow-700 font-semibold">🏨 Hotel</span>{" "}
                                {day.hotel.name}
                                {day.hotel.rate_per_night && (
                                  <span className="ml-2 text-emerald-600">${day.hotel.rate_per_night}/night</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Meal edit dialog - used by Overview tab for editing/adding meals */}
                    <Dialog
                      open={!!editingMeal}
                      onOpenChange={(open) => {
                        if (!open) setEditingMeal(null);
                      }}
                    >
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>
                            {editingMeal
                              ? `Edit ${
                                  editingMeal.slot.charAt(0).toUpperCase() + editingMeal.slot.slice(1)
                                } spot for Day ${editingMeal.dayNumber}`
                              : "Edit meal"}
                          </DialogTitle>
                          <DialogDescription>
                            Add a restaurant name, location, and optional link. This will appear in your calendar and
                            on the map.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 mt-2">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                              Restaurant name
                            </label>
                            <Input
                              value={mealForm.name}
                              onChange={(e) => setMealForm((prev) => ({ ...prev, name: e.target.value }))}
                              placeholder="e.g., Joe's Diner"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                              Location (street address or place)
                            </label>
                            <Input
                              value={mealForm.location}
                              onChange={(e) => setMealForm((prev) => ({ ...prev, location: e.target.value }))}
                              placeholder={itinerary.destination || "e.g., 123 Main St, City"}
                              className="h-8 text-xs"
                            />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                Link (optional)
                              </label>
                              <Input
                                type="url"
                                value={mealForm.link}
                                onChange={(e) => setMealForm((prev) => ({ ...prev, link: e.target.value }))}
                                placeholder="https://..."
                                className="h-8 text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                                Estimated price (optional)
                              </label>
                              <Input
                                type="number"
                                min="0"
                                value={mealForm.cost}
                                onChange={(e) => setMealForm((prev) => ({ ...prev, cost: e.target.value }))}
                                placeholder="e.g., 25"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <div className="mt-4 flex justify-between items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-3 text-xs"
                              onClick={() => {
                                if (!editingMeal) return;
                                setMealsByDay((prev) => {
                                  const copy = { ...prev };
                                  const dayMeals = { ...(copy[editingMeal.dayNumber] || {}) };
                                  delete dayMeals[editingMeal.slot];
                                  copy[editingMeal.dayNumber] = dayMeals;
                                  persistMeals(copy);
                                  return copy;
                                });
                                setEditingMeal(null);
                              }}
                            >
                              Clear
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs"
                              onClick={() => {
                                if (!editingMeal) return;
                                if (!mealForm.location.trim() && !mealForm.name.trim()) {
                                  // Nothing meaningful to save
                                  setEditingMeal(null);
                                  return;
                                }
                                const parsedCost = parseFloat(mealForm.cost);
                                setMealsByDay((prev) => {
                                  const existingFinalized =
                                    prev[editingMeal.dayNumber]?.[editingMeal.slot]?.finalized ?? false;
                                  const next = {
                                    ...prev,
                                    [editingMeal.dayNumber]: {
                                      ...(prev[editingMeal.dayNumber] || {}),
                                      [editingMeal.slot]: {
                                        name: mealForm.name.trim() || "",
                                        location: mealForm.location.trim(),
                                        link: mealForm.link.trim() || undefined,
                                        cost: !Number.isNaN(parsedCost) && parsedCost >= 0 ? parsedCost : undefined,
                                        finalized: existingFinalized,
                                      },
                                    },
                                  };
                                  persistMeals(next);
                                  return next;
                                });
                                setEditingMeal(null);
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Activity detail dialog */}
                      <Dialog
                        open={!!selectedActivityDetail}
                        onOpenChange={(open) => {
                          if (!open) setSelectedActivityDetail(null);
                        }}
                      >
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>
                              {selectedActivityDetail?.activity?.name || "Activity details"}
                            </DialogTitle>
                            <DialogDescription>
                              Day {selectedActivityDetail?.dayNumber}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2 text-sm text-slate-700">
                            {selectedActivityDetail?.activity?.description && (
                              <p className="text-slate-600">
                                {selectedActivityDetail.activity.description}
                              </p>
                            )}
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-slate-700 block">
                                Location / address
                              </label>
                              <Input
                                value={activityLocationDraft}
                                onChange={(e) => setActivityLocationDraft(e.target.value)}
                                placeholder="Enter a precise address"
                                className="h-8 text-xs"
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-[11px]"
                                  onClick={handleUpdateActivityLocation}
                                  disabled={isSavingActivityLocation}
                                >
                                  {isSavingActivityLocation ? "Saving..." : "Save location"}
                                </Button>
                              </div>
                            </div>
                            {(selectedActivityDetail?.activity?.address ||
                              selectedActivityDetail?.activity?.location) && (
                              <p>
                                <span className="font-semibold">Address: </span>
                                {selectedActivityDetail.activity.address ||
                                  selectedActivityDetail.activity.location}
                              </p>
                            )}
                            {selectedActivityDetail?.activity?.duration && (
                              <p>
                                <span className="font-semibold">Duration: </span>
                                {selectedActivityDetail.activity.duration}
                              </p>
                            )}
                            {typeof selectedActivityDetail?.activity?.cost_estimate === "number" && (
                              <p>
                                <span className="font-semibold">Estimated cost: </span>$
                                {formatMoney(selectedActivityDetail.activity.cost_estimate)}
                              </p>
                            )}
                            {selectedActivityDetail?.activity?.source_url && (
                              <a
                                className="text-blue-600 hover:text-blue-700 underline text-sm"
                                href={selectedActivityDetail.activity.source_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View source
                              </a>
                            )}
                            {selectedActivityDetail?.activity?.activity_id && (
                              <div className="pt-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    const dayNumber = selectedActivityDetail.dayNumber;
                                    const activityId = selectedActivityDetail.activity.activity_id;
                                    const key = `${dayNumber}-${activityId}`;
                                    if (deletingActivity[key]) return;
                                    handleDeleteActivity(dayNumber, activityId);
                                    setSelectedActivityDetail(null);
                                  }}
                                  disabled={
                                    deletingActivity[
                                      `${selectedActivityDetail.dayNumber}-${selectedActivityDetail.activity.activity_id}`
                                    ]
                                  }
                                  className="h-8 text-xs"
                                >
                                  Delete activity
                                </Button>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                  </Tabs>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Chat popup on Final Itinerary page */}
      {isChatOpen && (
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
                  {chatMessages.map((message, index) => (
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
                </div>
              </ScrollArea>
              <div className="mt-3 flex gap-2">
                <Input
                  type="text"
                  placeholder="Ask about this trip..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void sendChatMessage();
                    }
                  }}
                  disabled={isChatLoading}
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  onClick={() => void sendChatMessage()}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="h-9 px-3 text-xs bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Floating chat launcher */}
      <div className="fixed bottom-6 right-6 z-30">
        <Button
          size="sm"
          className="rounded-full shadow-lg bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-xs px-4 py-2"
          onClick={() => setIsChatOpen(true)}
        >
          Chat with Pindrop
        </Button>
      </div>

      {/* Replace Activity Modal */}
      {selectedActivityToReplace && (
        <ReplaceActivityModal
          isOpen={replaceModalOpen}
          onClose={() => {
            setReplaceModalOpen(false);
            setSelectedActivityToReplace(null);
          }}
          currentActivity={selectedActivityToReplace.activity}
          dayNumber={selectedActivityToReplace.dayNumber}
          tripId={parseInt(tripId || "0")}
          onConfirm={handleConfirmReplacement}
        />
      )}

      {/* Replace Hotel Modal */}
      {selectedHotelToReplace && (
        <ReplaceHotelModal
          isOpen={replaceHotelModalOpen}
          onClose={() => {
            setReplaceHotelModalOpen(false);
            setSelectedHotelToReplace(null);
          }}
          currentHotel={selectedHotelToReplace.hotel}
          tripId={parseInt(tripId || "0")}
          hotelId={selectedHotelToReplace.tripHotelId}
          onConfirm={handleConfirmHotelReplacement}
        />
      )}

      {/* Replace Flight Modal */}
      {selectedFlightToReplace && (
        <ReplaceFlightModal
          isOpen={replaceFlightModalOpen}
          onClose={() => {
            setReplaceFlightModalOpen(false);
            setSelectedFlightToReplace(null);
          }}
          currentFlight={selectedFlightToReplace.flight}
          flightType={selectedFlightToReplace.flightType}
          tripId={parseInt(tripId || "0")}
          flightId={selectedFlightToReplace.tripFlightId}
          onConfirm={handleConfirmFlightReplacement}
        />
      )}

      {/* Replace Restaurant Modal */}
      {selectedMealToReplace && (
        <ReplaceRestaurantModal
          isOpen={replaceRestaurantModalOpen}
          onClose={() => {
            setReplaceRestaurantModalOpen(false);
            setSelectedMealToReplace(null);
          }}
          currentMeal={{
            trip_meal_id: selectedMealToReplace.meal.trip_meal_id!,
            day_number: selectedMealToReplace.dayNumber,
            slot: selectedMealToReplace.slot,
            name: selectedMealToReplace.meal.name,
            location: selectedMealToReplace.meal.location,
            link: selectedMealToReplace.meal.link,
            cost: selectedMealToReplace.meal.cost,
            finalized: selectedMealToReplace.meal.finalized,
          }}
          tripId={parseInt(tripId || "0")}
          onConfirm={handleConfirmRestaurantReplacement}
        />
      )}
    </div>
  );
};

export default FinalItinerary;

