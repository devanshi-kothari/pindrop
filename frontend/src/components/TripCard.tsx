import { Card, CardContent } from "./ui/card";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { useState } from "react";

interface TripCardProps {
  tripId: number;
  title: string;
  destination: string;
  imageUrl?: string;
  startDate: string;
  endDate: string;
  status: string;
}

const TripCard = ({ tripId, title, destination, imageUrl, startDate, endDate, status }: TripCardProps) => {
  const navigate = useNavigate();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Format DATE-only strings from the DB without timezone shifting.
  // We manually construct a local Date from YYYY-MM-DD to avoid the
  // off-by-one issues that come from new Date("YYYY-MM-DD") + timezones.
  const formatDate = (dateString: string) => {
    if (!dateString) {
      return "MM/DD/YYYY";
    }

    const parts = dateString.split("-");
    if (parts.length !== 3) {
      return "MM/DD/YYYY";
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (!year || !month || !day) {
      return "MM/DD/YYYY";
    }

    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1970) {
      return "MM/DD/YYYY";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Default image if none provided
  const defaultImage = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

  const isChoosingDestination =
    status === "draft" && (!destination || destination.trim().length === 0);

  return (
    <Card className="relative overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-video overflow-hidden">
        <img
          src={imageUrl || defaultImage}
          alt={destination}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultImage;
          }}
        />
      </div>
      <CardContent className="p-4 space-y-2">
        <div
          className="cursor-pointer"
          onClick={() => navigate(`/trip/${tripId}`)}
        >
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{destination}</p>
        </div>
        {isChoosingDestination && (
          <p className="text-xs font-medium text-blue-600">Choosing destination…</p>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {formatDate(startDate)} - {formatDate(endDate)}
          </p>
          <span
            className={`inline-block px-2 py-1 text-xs rounded-full ${
              status === "draft"
                ? "bg-yellow-100 text-yellow-800"
                : status === "planned"
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {status === "draft"
              ? "Saved for Later"
              : status === "planned"
              ? "Ongoing/Upcoming"
              : "Archived"}
          </span>
        </div>
      </CardContent>
      {status === "draft" && (
        <>
          <button
            type="button"
            className="absolute bottom-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-300 hover:bg-rose-50 shadow-sm transition-colors"
            title="Delete trip"
            onClick={(e) => {
              e.stopPropagation();
              setIsConfirmingDelete((prev) => !prev);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {isConfirmingDelete && (
            <div
              className="absolute bottom-14 right-3 rounded-md border border-rose-200 bg-white/95 px-3 py-2 shadow-md text-[11px] text-slate-700 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px]">
                Delete this trip? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={() => setIsConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-rose-500 text-white hover:bg-rose-600"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem("token");
                      if (!token) {
                        console.error("No auth token found; cannot delete trip.");
                        return;
                      }

                      const response = await fetch(getApiUrl(`api/trips/${tripId}`), {
                        method: "DELETE",
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                      });

                      const result = await response.json().catch(() => null);
                      if (!response.ok || !result?.success) {
                        console.error("Failed to delete trip:", result);
                        window.alert(
                          result?.message || "Sorry, something went wrong deleting this trip."
                        );
                      } else {
                        window.location.reload();
                      }
                    } catch (err) {
                      console.error("Error deleting trip:", err);
                      window.alert("Sorry, something went wrong deleting this trip.");
                    }
                  }}
                >
                  Confirm delete
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default TripCard;

