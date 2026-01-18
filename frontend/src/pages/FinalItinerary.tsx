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
              <div className="w-full">
                <div className="flex items-center justify-between gap-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 mb-4">
                  <span className="font-semibold">Editable layout</span>
                  <span className="text-yellow-700">Editing controls coming soon</span>
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
                            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600">
                              <span className="text-blue-600 font-semibold">✈️ Outbound</span>{" "}
                              {day.outbound_flight.departure_id} → {day.outbound_flight.arrival_id}
                            </div>
                          )}

                          {day.hotel && (
                            <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-slate-700">
                              <span className="text-yellow-700 font-semibold">🏨 Hotel</span>{" "}
                              {day.hotel.name}
                            </div>
                          )}

                          {day.activities && day.activities.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-slate-600">Activities</p>
                              <div className="space-y-2">
                                {day.activities.slice(0, 3).map((activity, index) => (
                                  <div
                                    key={`${day.day_number}-${index}`}
                                    className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <p className="font-semibold text-slate-900">{activity.name}</p>
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
                                      {activity.source_url && (
                                        <a
                                          href={activity.source_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-blue-600 hover:text-blue-700 underline whitespace-nowrap"
                                        >
                                          Learn more →
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {day.activities.length > 3 && (
                                  <p className="text-[11px] text-slate-500">
                                    +{day.activities.length - 3} more activities
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {day.return_flight && (
                            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600">
                              <span className="text-blue-600 font-semibold">✈️ Return</span>{" "}
                              {day.return_flight.departure_id} → {day.return_flight.arrival_id}
                            </div>
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

