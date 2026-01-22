import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, Legend } from "recharts";
import { getApiUrl } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";

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
  departure_id?: string;
  arrival_id?: string;
  price?: number;
  total_duration?: number;
  flights?: FlightLeg[];
  layovers?: FlightLayover[];
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
};

type FinalItineraryDay = {
  day_number: number;
  date?: string | null;
  summary?: string | null;
  activities?: Array<{
    activity_id?: number;
    name?: string;
    location?: string;
    category?: string;
    duration?: string;
    cost_estimate?: number;
    source_url?: string;
    source?: string;
    description?: string;
  }>;
  outbound_flight?: FinalItineraryFlight;
  return_flight?: FinalItineraryFlight;
  hotel?: FinalItineraryHotel;
};

type MealSlot = "breakfast" | "lunch" | "dinner";

type MealInfo = {
  name: string;
  location: string;
  link?: string;
  cost?: number;
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
  const parsed = new Date(dateString);
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

const FinalItinerary = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [itinerary, setItinerary] = useState<FinalItineraryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState<Record<number, boolean>>({});
  const [addingActivity, setAddingActivity] = useState<Record<number, boolean>>({});
  const [deletingActivity, setDeletingActivity] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<number, { name: string; description: string; source_url: string; location: string }>>({});
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

        const response = await fetch(getApiUrl(`api/trips/${tripId}/final-itinerary`), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();
        if (response.ok && result.success && result.itinerary?.days?.length > 0) {
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
          [dayNumber]: { name: "", description: "", source_url: "", location: "" },
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

  const toggleAddForm = (dayNumber: number) => {
    setShowAddForm((prev) => ({
      ...prev,
      [dayNumber]: !prev[dayNumber],
    }));
    if (!formData[dayNumber]) {
      setFormData((prev) => ({
        ...prev,
        [dayNumber]: { name: "", description: "", source_url: "", location: "" },
      }));
    }
  };

  // Simple per-day budget breakdown derived from itinerary + user-entered meals
  const computeBudgetData = () => {
    if (!itinerary)
      return { daily: [], totals: { flights: 0, hotels: 0, activities: 0, meals: 0, total: 0 } };

    const daily = itinerary.days.map((day) => {
      const activityTotal = (day.activities || []).reduce(
        (sum, act) => sum + (typeof act.cost_estimate === "number" ? act.cost_estimate : 0),
        0
      );
      const hotelTotal = typeof day.hotel?.rate_per_night === "number" ? day.hotel.rate_per_night : 0;
      const mealTotal = (() => {
        const meals = mealsByDay[day.day_number];
        if (!meals) return 0;
        return (["breakfast", "lunch", "dinner"] as MealSlot[]).reduce((sum, slot) => {
          const m = meals[slot];
          return sum + (m && typeof m.cost === "number" ? m.cost : 0);
        }, 0);
      })();
      let flightTotal = 0;
      if (typeof day.outbound_flight?.price === "number") {
        flightTotal += day.outbound_flight.price;
      }
      if (typeof day.return_flight?.price === "number") {
        flightTotal += day.return_flight.price;
      }
      const total = activityTotal + hotelTotal + flightTotal + mealTotal;
      return {
        day_number: day.day_number,
        date: day.date,
        activityTotal,
        hotelTotal,
        mealTotal,
        flightTotal,
        total,
      };
    });

    const totals = daily.reduce(
      (acc, d) => {
        acc.activities += d.activityTotal;
        acc.hotels += d.hotelTotal;
        acc.meals += d.mealTotal;
        acc.flights += d.flightTotal;
        acc.total += d.total;
        return acc;
      },
      { flights: 0, hotels: 0, activities: 0, meals: 0, total: 0 }
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

        const locations: { label: string; address: string }[] = [];

        (day.activities || [])
          .filter((a) => a.location)
          .forEach((a) => {
            locations.push({ label: a.name || "Activity", address: a.location! });
          });

        const meals = mealsByDay[day.day_number];
        if (meals) {
          (["breakfast", "lunch", "dinner"] as MealSlot[]).forEach((slot) => {
            const meal = meals[slot];
            if (meal?.location) {
              locations.push({
                label: meal.name || slot.charAt(0).toUpperCase() + slot.slice(1),
                address: meal.location,
              });
            }
          });
        }

        if (day.hotel?.location) {
          locations.push({ label: day.hotel.name || "Hotel", address: day.hotel.location });
        }

        // If no specific locations, fall back to itinerary destination
        if (locations.length === 0 && itinerary.destination) {
          locations.push({ label: itinerary.destination, address: itinerary.destination });
        }

        locations.forEach((loc) => {
          geocoder.geocode({ address: loc.address }, (results: any, status: any) => {
            if (status === "OK" && results && results[0]) {
              const position = results[0].geometry.location;
              new window.google.maps.Marker({
                map,
                position,
                title: loc.label,
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
                onClick={() => navigate(tripId ? `/trip/${tripId}` : "/dashboard")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Trip
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
                        Overview
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
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600 text-left w-full hover:border-blue-300 hover:bg-blue-50/80 transition-colors">
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
                          )}

                          {day.hotel && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-slate-700 text-left w-full hover:border-yellow-300 hover:bg-yellow-50/80 transition-colors">
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
                                          ...(prev[day.day_number] || { name: "", description: "", source_url: "", location: "" }),
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
                                          ...(prev[day.day_number] || { name: "", description: "", source_url: "", location: "" }),
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
                                    Longer Description (optional)
                                  </label>
                                  <Textarea
                                    value={formData[day.day_number]?.description || ""}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [day.day_number]: {
                                          ...(prev[day.day_number] || { name: "", description: "", source_url: "", location: "" }),
                                          description: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Additional details about this activity..."
                                    className="min-h-[60px] text-xs"
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
                                          ...(prev[day.day_number] || { name: "", description: "", source_url: "", location: "" }),
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
                                      className="group rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700 hover:border-blue-300 transition-colors"
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
                                              onClick={() => handleDeleteActivity(day.day_number, activity.activity_id!)}
                                              disabled={deletingActivity[activityKey]}
                                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
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

                          {day.return_flight && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600 text-left w-full hover:border-blue-300 hover:bg-blue-50/80 transition-colors">
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
                          { name: "Flights", key: "flights", value: totals.flights },
                          { name: "Hotels", key: "hotels", value: totals.hotels },
                          { name: "Activities", key: "activities", value: totals.activities },
                          { name: "Meals", key: "meals", value: totals.meals },
                        ].filter((d) => d.value > 0);

                        const chartData =
                          remaining !== null && remaining > 0
                            ? [
                                ...baseChartData,
                                { name: "Unused budget", key: "unused", value: remaining },
                              ]
                            : baseChartData;

                        return (
                          <div className="space-y-4">
                            <div className="overflow-x-auto rounded-md border border-blue-100">
                              <table className="min-w-full border-collapse text-xs">
                                <thead className="bg-blue-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Day</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Flights</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Hotel</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Activities</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Meals</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {daily.map((d) => (
                                    <tr key={d.day_number} className="border-t border-blue-50">
                                      <td className="px-3 py-2 text-slate-700">Day {d.day_number}</td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.flightTotal ? `$${d.flightTotal.toLocaleString()}` : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.hotelTotal ? `$${d.hotelTotal.toLocaleString()}` : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.activityTotal ? `$${d.activityTotal.toLocaleString()}` : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600">
                                        {d.mealTotal ? `$${d.mealTotal.toLocaleString()}` : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                                        {d.total ? `$${d.total.toLocaleString()}` : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
                              {chartData.length > 0 && (
                                <ChartContainer
                                  config={{
                                    flights: { label: "Flights", color: "#0ea5e9" }, // sky-500
                                    hotels: { label: "Hotels", color: "#f97316" },  // orange-500
                                    activities: { label: "Activities", color: "#22c55e" }, // emerald-500
                                    meals: { label: "Meals", color: "#6366f1" }, // indigo-500
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
                                      label
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
                                  {totals.total ? `$${totals.total.toLocaleString()}` : "—"}
                                </p>
                                {typeof itinerary.total_budget === "number" && (
                                  <p>
                                    <span className="font-semibold">Overall budget:</span>{" "}
                                    ${itinerary.total_budget.toLocaleString()}
                                  </p>
                                )}
                                {remaining !== null && (
                                  <p
                                    className={
                                      remaining >= 0 ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"
                                    }
                                  >
                                    {remaining >= 0
                                      ? `Remaining budget: $${remaining.toLocaleString()}`
                                      : `Over budget by $${Math.abs(remaining).toLocaleString()}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>

                    <TabsContent value="calendar" className="mt-0">
                      <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                        {itinerary.days.map((day) => (
                          <div
                            key={day.day_number}
                            className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-2"
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
                            </div>
                            <div className="space-y-1.5 mt-1">
                              {(() => {
                                const activities = day.activities || [];
                                const morningActs = activities.slice(0, 1).map((act, i) => ({
                                  act,
                                  index: i,
                                }));
                                const afternoonActs = activities.slice(1, 2).map((act, i) => ({
                                  act,
                                  index: 1 + i,
                                }));
                                const eveningActs = activities.slice(2, 3).map((act, i) => ({
                                  act,
                                  index: 2 + i,
                                }));
                                const anytimeActs = activities.slice(3).map((act, i) => ({
                                  act,
                                  index: 3 + i,
                                }));

                                const dayMeals = mealsByDay[day.day_number] || {};
                                const travelSegments = travelInfoByDay[day.day_number]?.segments || [];

                                type Row =
                                  | { kind: "meal"; slot: MealSlot; label: string; location?: string }
                                  | {
                                      kind: "activity";
                                      slotLabel: string;
                                      label: string;
                                      location?: string;
                                      activityIndex: number;
                                    };

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

                                const pushActs = (
                                  acts: { act: FinalItineraryDay["activities"][number]; index: number }[],
                                  slotLabel: string
                                ) => {
                                  acts.forEach(({ act, index }) => {
                                    rows.push({
                                      kind: "activity",
                                      slotLabel,
                                      label: act?.name || "Activity",
                                      location: act?.location,
                                      activityIndex: index,
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
                                      <button
                                        key={`row-${idx}`}
                                        type="button"
                                        className="flex w-full items-start gap-2 rounded-md border border-dashed border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[11px] text-left hover:border-amber-300 hover:bg-amber-50"
                                        onClick={() => {
                                          setEditingMeal({ dayNumber: day.day_number, slot });
                                          setMealForm({
                                            name: meal?.name || "",
                                            location: meal?.location || (itinerary.destination || ""),
                                            link: meal?.link || "",
                                            cost: typeof meal?.cost === "number" ? String(meal.cost) : "",
                                          });
                                        }}
                                      >
                                        <span className="mt-[1px] inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                          {label}
                                        </span>
                                        <div className="flex-1">
                                          {meal ? (
                                            <>
                                              <p className="font-semibold text-slate-900">
                                                {meal.name || `${label} spot`}
                                              </p>
                                              {meal.location && (
                                                <p className="text-[10px] text-slate-500">📍 {meal.location}</p>
                                              )}
                                            </>
                                          ) : (
                                            <p className="text-[10px] text-slate-500">
                                              Add a {label.toLowerCase()} restaurant (name & location)
                                            </p>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`row-${idx}`}
                                      draggable
                                      onDragStart={() =>
                                        setDragActivity(
                                          row.activityIndex != null
                                            ? { dayNumber: day.day_number, index: row.activityIndex }
                                            : null
                                        )
                                      }
                                      onDragOver={(e) => {
                                        if (dragActivity && dragActivity.dayNumber === day.day_number) {
                                          e.preventDefault();
                                        }
                                      }}
                                      onDrop={() => {
                                        if (
                                          !dragActivity ||
                                          dragActivity.dayNumber !== day.day_number ||
                                          row.activityIndex == null ||
                                          dragActivity.index === row.activityIndex
                                        ) {
                                          return;
                                        }
                                        setItinerary((prev) => {
                                          if (!prev) return prev;
                                          const days = prev.days.map((d) => {
                                            if (d.day_number !== day.day_number) return d;
                                            const acts = d.activities ? [...d.activities] : [];
                                            if (
                                              dragActivity.index < 0 ||
                                              dragActivity.index >= acts.length ||
                                              row.activityIndex == null ||
                                              row.activityIndex < 0 ||
                                              row.activityIndex >= acts.length
                                            ) {
                                              return d;
                                            }
                                            const [moved] = acts.splice(dragActivity.index, 1);
                                            acts.splice(row.activityIndex, 0, moved);
                                            return { ...d, activities: acts };
                                          });
                                          return { ...prev, days };
                                        });
                                        setDragActivity(null);
                                      }}
                                      className="flex items-start gap-2 rounded-md border border-blue-100 bg-white px-2 py-1.5 text-[11px] cursor-move"
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
                                    elements.push(renderTransit(row.label, next.label, idx) as any);
                                  }
                                });

                                return elements;
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Meal edit dialog (shared across days) */}
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
                                setMealsByDay((prev) => ({
                                  ...prev,
                                  [editingMeal.dayNumber]: {
                                    ...(prev[editingMeal.dayNumber] || {}),
                                    [editingMeal.slot]: {
                                      name: mealForm.name.trim() || "",
                                      location: mealForm.location.trim(),
                                      link: mealForm.link.trim() || undefined,
                                      cost: !Number.isNaN(parsedCost) && parsedCost >= 0 ? parsedCost : undefined,
                                    },
                                  },
                                }));
                                setEditingMeal(null);
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default FinalItinerary;

