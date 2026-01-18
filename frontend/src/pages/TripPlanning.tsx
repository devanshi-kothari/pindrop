import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import ChatWindow from "@/components/ChatWindow";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { ArrowLeft, Save, Bookmark, Map } from "lucide-react";

interface Trip {
  trip_id: number;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  trip_status: string;
}

const TripPlanning = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasBootstrappedNewTrip, setHasBootstrappedNewTrip] = useState(false);
  const initialMessage = searchParams.get("message");
  const rawModeParam = searchParams.get("mode");
  const urlPlanningMode: "known" | "explore" | null =
    rawModeParam === "explore" ? "explore" : rawModeParam === "known" ? "known" : null;
  const [planningMode, setPlanningMode] = useState<"known" | "explore">(urlPlanningMode || "known");

  // Check if we're on the /trip/new route (tripId is undefined when route matches /trip/new exactly)
  const isNewTrip = location.pathname === "/trip/new" || tripId === "new";

  useEffect(() => {
    // Existing trip: load from API
    if (tripId && tripId !== "new") {
      loadTrip(parseInt(tripId));
      return;
    }

    // New trip flow (ex. from dashboard chat prompt)
    // We create a draft trip up front so that:
    // - the structured preferences form can load immediately
    // - the LLM won't auto-respond to the initial message before the form is filled
    const bootstrapNewTrip = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }

        const body: Record<string, unknown> = {};

        const trimmedInitial = initialMessage?.trim();

        if (planningMode === "explore" && trimmedInitial) {
          // For destination exploration, let the backend's LLM summarize this
          // message into a concise trip title (e.g., "Spring Break Girls Trip").
          body.raw_title_message = trimmedInitial;
        } else if (trimmedInitial) {
          // Known-destination mode: let the backend infer destination and title
          // from the raw message (e.g., "Trip to Brazil" with destination "Brazil").
          body.raw_message = trimmedInitial;
        }

        const response = await fetch(getApiUrl("api/trips"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const result = await response.json();

        if (response.ok && result.success && result.trip) {
          setTrip(result.trip);
        } else {
          console.error("Failed to create draft trip from initial message:", result.message);
          // Fall back to showing the chat without a bound trip
        }
      } catch (error) {
        console.error("Error creating draft trip:", error);
      } finally {
        setLoading(false);
      }
    };

    // Only bootstrap once when we're explicitly in the /trip/new flow.
    // React StrictMode can run effects twice in dev, so guard with state.
    if (isNewTrip && !hasBootstrappedNewTrip) {
      setHasBootstrappedNewTrip(true);
      bootstrapNewTrip();
    } else if (!isNewTrip) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, isNewTrip, initialMessage, hasBootstrappedNewTrip, planningMode]);

  const loadTrip = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(getApiUrl(`api/trips/${id}`), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const loadedTrip = result.trip;
        setTrip(loadedTrip);

        // If no explicit planning mode was provided in the URL, infer it from
        // the trip: drafts with no destination are treated as "explore"
        // (help-me-choose), everything else is "known".
        if (!urlPlanningMode) {
          if (loadedTrip?.trip_status === "draft" && !loadedTrip?.destination) {
            setPlanningMode("explore");
          } else {
            setPlanningMode("known");
          }
        }
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Error loading trip:", error);
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const updateTripStatus = async (newStatus: string) => {
    if (!trip) return;

    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch(getApiUrl(`api/trips/${trip.trip_id}`), {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trip_status: newStatus,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTrip(result.trip);
        if (newStatus === "planned") {
          // Navigate back to dashboard after saving
          setTimeout(() => {
            navigate("/dashboard");
          }, 1000);
        }
      }
    } catch (error) {
      console.error("Error updating trip status:", error);
    } finally {
      setSaving(false);
    }
  };

  const numericTripId =
    tripId && tripId !== "new" ? parseInt(tripId) : null;
  const currentTripId = trip ? trip.trip_id : numericTripId;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 flex flex-col">
          {/* Header with back button and action buttons */}
          <div className="border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              {trip && (
                <div>
                  <h1 className="text-xl font-semibold">{trip.title}</h1>
                  <p className="text-sm text-muted-foreground">{trip.destination}</p>
                </div>
              )}
            </div>

            {trip && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/trip/${trip.trip_id}/final-itinerary`)}
                  className="flex items-center gap-2"
                >
                  <Map className="h-4 w-4" />
                  View Final Itinerary
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateTripStatus("draft")}
                  disabled={saving || trip.trip_status === "draft"}
                  className="flex items-center gap-2"
                >
                  <Bookmark className="h-4 w-4" />
                  Draft for Later
                </Button>
                <Button
                  onClick={() => updateTripStatus("planned")}
                  disabled={saving || trip.trip_status === "planned"}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600"
                >
                  <Save className="h-4 w-4" />
                  Save Itinerary
                </Button>
              </div>
            )}
          </div>

          {/* Chat Window - Full Page */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading trip...</p>
              </div>
            ) : (
              <div className="flex-1 p-4">
                <ChatWindow
                  tripId={currentTripId}
                  className="h-full"
                  initialMessage={isNewTrip ? initialMessage : null}
                  planningMode={planningMode}
                  hasDestinationLocked={!!trip?.destination}
                  onTripCreated={(newTripId) => {
                    // Update URL to the new trip ID
                    window.history.replaceState({}, "", `/trip/${newTripId}`);
                    // Load the trip data (or refresh it if it already exists)
                    loadTrip(newTripId);
                  }}
                />
                {isNewTrip && (
                  <div style={{ display: 'none' }}>
                    Debug: tripId={tripId}, initialMessage={initialMessage}, currentTripId={currentTripId?.toString() || 'null'}, isNewTrip={isNewTrip.toString()}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default TripPlanning;

