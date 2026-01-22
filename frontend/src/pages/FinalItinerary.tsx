import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
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
                  <span className="text-green-700">Click activities to edit • Use + button to add new activities</span>
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

                  <div className="mt-4 grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
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

