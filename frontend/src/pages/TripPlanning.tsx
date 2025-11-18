import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ChatWindow from "@/components/ChatWindow";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import { ArrowLeft, Save, Bookmark } from "lucide-react";

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
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const initialMessage = searchParams.get("message");

  useEffect(() => {
    if (tripId && tripId !== "new") {
      loadTrip(parseInt(tripId));
    } else {
      setLoading(false);
    }
  }, [tripId]);

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
        setTrip(result.trip);
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

  const handleCreateTrip = async () => {
    if (!initialMessage) return;

    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      // Extract destination and dates from message (simple parsing)
      // In a real implementation, the LLM would extract this
      const destination = initialMessage.split("to")[1]?.trim() || "Unknown";

      // Create trip with default dates
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + 7);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 5);

      // Fetch image for destination
      let imageUrl = null;
      try {
        const imageResponse = await fetch(getApiUrl(`api/images/destination?destination=${encodeURIComponent(destination)}`));
        const imageResult = await imageResponse.json();
        if (imageResult.success) {
          imageUrl = imageResult.imageUrl;
        }
      } catch (e) {
        console.error("Error fetching image:", e);
      }

      const tripData = {
        title: `Trip to ${destination}`,
        destination,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        trip_status: "draft",
        image_url: imageUrl,
      };

      const response = await fetch(getApiUrl("api/trips"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tripData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTrip(result.trip);
        // Replace URL without the message parameter
        window.history.replaceState({}, "", `/trip/${result.trip.trip_id}`);
      }
    } catch (error) {
      console.error("Error creating trip:", error);
    } finally {
      setSaving(false);
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

  // Auto-create trip if it's a new trip with an initial message
  useEffect(() => {
    if (tripId === "new" && initialMessage && !trip && !loading && !saving) {
      handleCreateTrip();
    }
  }, [tripId, initialMessage, trip, loading, saving]);

  const currentTripId = trip ? trip.trip_id : (tripId && tripId !== "new" ? parseInt(tripId) : null);

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
                  initialMessage={tripId === "new" ? initialMessage : null}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default TripPlanning;

