import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import TripCard from "@/components/TripCard";
import ChatPrompt from "@/components/ChatPrompt";
import { getApiUrl } from "@/lib/api";

interface TripPreferenceSummary {
  start_date: string | null;
  end_date: string | null;
}

interface Trip {
  trip_id: number;
  title: string;
  destination: string;
  trip_status: string;
  image_url?: string;
  trip_preference?: TripPreferenceSummary | null;
}

const Dashboard = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftTrips, setDraftTrips] = useState<Trip[]>([]);
  const [plannedTrips, setPlannedTrips] = useState<Trip[]>([]);
  const [archivedTrips, setArchivedTrips] = useState<Trip[]>([]);
  const [activeTab, setActiveTab] = useState<"planned" | "draft" | "archived">("planned");

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch(getApiUrl("api/trips"), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const allTrips = result.trips || [];
        setTrips(allTrips);

        // Categorize trips
        setDraftTrips(allTrips.filter((trip: Trip) => trip.trip_status === 'draft'));
        setPlannedTrips(allTrips.filter((trip: Trip) => trip.trip_status === 'planned'));
        setArchivedTrips(allTrips.filter((trip: Trip) => trip.trip_status === 'archived'));
      }
    } catch (error) {
      console.error("Error loading trips:", error);
    } finally {
      setLoading(false);
    }
  };

  const TripSection = ({ title, trips, status }: { title: string; trips: Trip[]; status: string }) => {
    if (trips.length === 0) {
      return (
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-4">{title}</h2>
          <p className="text-muted-foreground">No trips in this category yet.</p>
        </div>
      );
    }

    return (
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {trips.map((trip) => (
            <TripCard
              key={trip.trip_id}
              tripId={trip.trip_id}
              title={trip.title}
              destination={trip.destination}
              imageUrl={trip.image_url}
              startDate={trip.trip_preference?.start_date ?? ""}
              endDate={trip.trip_preference?.end_date ?? ""}
              status={trip.trip_status}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Chat Prompt */}
            <ChatPrompt />

            {/* Tab controls for trip sections */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="inline-flex rounded-full bg-muted p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className={`rounded-full px-6 py-2 text-sm font-medium ${
                    activeTab === "draft"
                      ? "bg-blue-500 text-white"
                      : "bg-transparent text-blue-700 hover:bg-blue-100"
                  }`}
                  onClick={() => setActiveTab("draft")}
                >
                  Drafts
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={`rounded-full px-6 py-2 text-sm font-medium ${
                    activeTab === "planned"
                      ? "bg-blue-500 text-white"
                      : "bg-transparent text-blue-700 hover:bg-blue-100"
                  }`}
                  onClick={() => setActiveTab("planned")}
                >
                  Ongoing/Upcoming
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={`rounded-full px-6 py-2 text-sm font-medium ${
                    activeTab === "archived"
                      ? "bg-blue-500 text-white"
                      : "bg-transparent text-blue-700 hover:bg-blue-100"
                  }`}
                  onClick={() => setActiveTab("archived")}
                >
                  Past Trips
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading your trips...</p>
              </div>
            ) : activeTab === "planned" ? (
              <TripSection
                title="Ongoing/Upcoming Trips"
                trips={plannedTrips}
                status="planned"
              />
            ) : activeTab === "draft" ? (
              <TripSection
                title="Saved for Later"
                trips={draftTrips}
                status="draft"
              />
            ) : (
              <TripSection
                title="Archived Trips"
                trips={archivedTrips}
                status="archived"
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
