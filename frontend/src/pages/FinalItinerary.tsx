import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

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
  }>;
  outbound_flight?: {
    departure_id?: string;
    arrival_id?: string;
    price?: number;
    total_duration?: number;
    flights?: unknown;
    layovers?: unknown;
  };
  return_flight?: {
    departure_id?: string;
    arrival_id?: string;
    price?: number;
    total_duration?: number;
    flights?: unknown;
    layovers?: unknown;
  };
  hotel?: {
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

const FinalItinerary = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [itinerary, setItinerary] = useState<FinalItineraryData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              <div className="max-w-4xl mx-auto bg-slate-900/90 border border-slate-800 text-slate-100 rounded-lg px-6 py-6 shadow-lg space-y-6">
                <div className="border-b border-slate-700 pb-4">
                  <h2 className="text-lg font-bold text-white mb-1">{itinerary.trip_title}</h2>
                  <p className="text-sm text-slate-400">
                    {itinerary.destination || "Trip"} • {itinerary.num_days} days
                  </p>
                  {itinerary.total_budget && (
                    <p className="text-xs text-emerald-400 mt-1">
                      Budget: ${itinerary.total_budget.toLocaleString()}
                    </p>
                  )}
                </div>

                {itinerary.days.map((day) => {
                  const dateLabel = formatDate(day.date) || `Day ${day.day_number}`;
                  return (
                    <div
                      key={day.day_number}
                      className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">
                            Day {day.day_number}
                          </h3>
                          <p className="text-xs text-slate-400">{dateLabel}</p>
                        </div>
                      </div>

                      {day.summary && (
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{day.summary}</p>
                      )}

                      {day.outbound_flight && (
                        <div className="bg-blue-900/30 rounded-md p-3 border border-blue-800/50">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-blue-400 text-sm font-semibold">✈️ Outbound Flight</span>
                            {day.outbound_flight.price && (
                              <span className="text-xs text-slate-300">
                                ${day.outbound_flight.price.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300">
                            {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                            {day.outbound_flight.total_duration && (
                              <span className="text-slate-400 ml-2">
                                • {Math.floor(day.outbound_flight.total_duration / 60)}h{" "}
                                {day.outbound_flight.total_duration % 60}m
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {day.hotel && (
                        <div className="bg-purple-900/30 rounded-md p-3 border border-purple-800/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-purple-400 text-sm font-semibold">🏨 Hotel</span>
                              {day.hotel.overall_rating && (
                                <span className="text-xs text-yellow-400">⭐ {day.hotel.overall_rating}</span>
                              )}
                            </div>
                            {day.hotel.rate_per_night && (
                              <span className="text-xs text-slate-300">
                                ${day.hotel.rate_per_night.toLocaleString()}/night
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-white font-medium">{day.hotel.name}</p>
                            {day.hotel.link && (
                              <a
                                href={day.hotel.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300 underline"
                              >
                                View →
                              </a>
                            )}
                          </div>
                          {day.hotel.location && (
                            <p className="text-xs text-slate-400 mt-1">📍 {day.hotel.location}</p>
                          )}
                        </div>
                      )}

                      {day.activities && day.activities.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-slate-300 mb-2">Activities</p>
                          {day.activities.map((activity, index) => (
                            <div
                              key={`${day.day_number}-${index}`}
                              className="bg-slate-700/30 rounded-md p-3 border border-slate-600/50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-medium text-white">{activity.name}</p>
                                    {activity.source === "user_selected" && (
                                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                                        Your Pick
                                      </span>
                                    )}
                                  </div>
                                  {activity.location && (
                                    <p className="text-xs text-slate-400 mb-1">📍 {activity.location}</p>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-slate-400">
                                    {activity.category && <span className="capitalize">{activity.category}</span>}
                                    {activity.duration && <span>⏱️ {activity.duration}</span>}
                                    {activity.cost_estimate && (
                                      <span className="text-emerald-400">
                                        ${activity.cost_estimate}
                                      </span>
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

                      {day.return_flight && (
                        <div className="bg-blue-900/30 rounded-md p-3 border border-blue-800/50">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-blue-400 text-sm font-semibold">✈️ Return Flight</span>
                            {day.return_flight.price && (
                              <span className="text-xs text-slate-300">
                                ${day.return_flight.price.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300">
                            {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                            {day.return_flight.total_duration && (
                              <span className="text-slate-400 ml-2">
                                • {Math.floor(day.return_flight.total_duration / 60)}h{" "}
                                {day.return_flight.total_duration % 60}m
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default FinalItinerary;

