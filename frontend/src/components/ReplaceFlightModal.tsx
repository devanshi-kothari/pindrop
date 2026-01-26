import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface FlightLeg {
  departure_airport?: { id?: string; name?: string; time?: string };
  arrival_airport?: { id?: string; name?: string; time?: string };
  airline?: string;
}

interface FlightLayover {
  id?: string;
  name?: string;
  duration?: number;
  overnight?: boolean;
}

interface FlightAlternative {
  departure_id?: string;
  arrival_id?: string;
  price?: number;
  total_duration?: number;
  flights?: FlightLeg[];
  layovers?: FlightLayover[];
}

interface ReplaceFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFlight: FlightAlternative;
  flightType: "outbound" | "return";
  tripId: number;
  flightId: number;
  onConfirm: (selectedFlight: FlightAlternative) => Promise<void>;
}

const formatDuration = (minutes?: number) => {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

export const ReplaceFlightModal = ({
  isOpen,
  onClose,
  currentFlight,
  flightType,
  tripId,
  flightId,
  onConfirm,
}: ReplaceFlightModalProps) => {
  const [alternatives, setAlternatives] = useState<FlightAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch alternatives when modal opens
  const fetchAlternatives = async () => {
    if (alternatives.length > 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");

      const response = await fetch(
        getApiUrl(`api/trips/${tripId}/flights/${flightId}/alternatives?type=${flightType}`),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.success && Array.isArray(result.alternatives)) {
        setAlternatives(result.alternatives);
      } else {
        setError(result.message || "Failed to load alternatives");
      }
    } catch (err) {
      console.error("Error fetching alternatives:", err);
      setError("Failed to load alternatives. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedIndex === null) return;

    const selected = alternatives[selectedIndex];
    setIsConfirming(true);

    try {
      await onConfirm(selected);
      onClose();
      setAlternatives([]);
      setSelectedIndex(null);
    } catch (err) {
      console.error("Error confirming replacement:", err);
      setError("Failed to replace flight. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
        if (open && alternatives.length === 0) {
          fetchAlternatives();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Replace {flightType === "outbound" ? "Outbound" : "Return"} Flight</DialogTitle>
          <DialogDescription>Select an alternative flight for your trip.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Flight */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-slate-500 font-semibold mb-1">CURRENT FLIGHT</p>
            <p className="font-semibold text-slate-900">
              {currentFlight.departure_id} → {currentFlight.arrival_id}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-slate-600">
              {typeof currentFlight.price === "number" && (
                <div>💰 ${currentFlight.price.toLocaleString()}</div>
              )}
              {formatDuration(currentFlight.total_duration) && (
                <div>⏱️ {formatDuration(currentFlight.total_duration)}</div>
              )}
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-2 text-slate-600">Finding alternatives...</span>
            </div>
          )}

          {/* Alternatives */}
          {!isLoading && alternatives.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Select a replacement:
              </p>
              {alternatives.map((alt, idx) => (
                <Card
                  key={idx}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedIndex === idx
                      ? "border-green-500 bg-green-50 ring-2 ring-green-300"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {alt.departure_id} → {alt.arrival_id}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                        {typeof alt.price === "number" && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Price:</span> ${alt.price.toLocaleString()}
                          </div>
                        )}
                        {formatDuration(alt.total_duration) && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Duration:</span> {formatDuration(alt.total_duration)}
                          </div>
                        )}
                      </div>
                      {Array.isArray(alt.flights) && alt.flights.length > 0 && (
                        <div className="mt-2 text-xs">
                          <p className="font-semibold text-slate-600 mb-1">Segments:</p>
                          {alt.flights.map((flight, fIdx) => (
                            <div key={fIdx} className="text-slate-600">
                              {flight.departure_airport?.time} → {flight.arrival_airport?.time} • {flight.airline}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 mt-1">
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                          selectedIndex === idx
                            ? "border-green-500 bg-green-500"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {selectedIndex === idx && (
                          <span className="text-white font-bold text-sm">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && alternatives.length === 0 && !error && (
            <div className="text-center py-8 text-slate-600">
              <p>No alternatives found. Try searching again.</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isConfirming}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedIndex === null || isConfirming || isLoading}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Replacing...
                </>
              ) : (
                "Confirm Replacement"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReplaceFlightModal;
