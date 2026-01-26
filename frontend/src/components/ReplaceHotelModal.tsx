import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface HotelAlternative {
  hotel_id?: string | number;
  name: string;
  location?: string;
  rate_per_night?: number;
  rate_per_night_formatted?: string;
  link?: string;
  overall_rating?: number;
  check_in_time?: string;
  check_out_time?: string;
}

interface ReplaceHotelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentHotel: HotelAlternative;
  tripId: number;
  hotelId: number;
  onConfirm: (selectedHotel: HotelAlternative) => Promise<void>;
}

export const ReplaceHotelModal = ({
  isOpen,
  onClose,
  currentHotel,
  tripId,
  hotelId,
  onConfirm,
}: ReplaceHotelModalProps) => {
  const [alternatives, setAlternatives] = useState<HotelAlternative[]>([]);
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
        getApiUrl(`api/trips/${tripId}/hotels/${hotelId}/alternatives`),
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
      setError("Failed to replace hotel. Please try again.");
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
          <DialogTitle>Replace Hotel</DialogTitle>
          <DialogDescription>Select an alternative hotel for your stay.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Hotel */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-slate-500 font-semibold mb-1">CURRENT HOTEL</p>
            <p className="font-semibold text-slate-900">{currentHotel.name}</p>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-slate-600">
              {currentHotel.location && <div>📍 {currentHotel.location}</div>}
              {currentHotel.rate_per_night_formatted && (
                <div>💰 {currentHotel.rate_per_night_formatted} per night</div>
              )}
              {currentHotel.overall_rating && (
                <div>⭐ {currentHotel.overall_rating.toFixed(1)}</div>
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
                      <p className="font-semibold text-slate-900">{alt.name}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                        {alt.location && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Location:</span> {alt.location}
                          </div>
                        )}
                        {alt.rate_per_night_formatted && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Rate:</span> {alt.rate_per_night_formatted}
                          </div>
                        )}
                        {alt.overall_rating && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Rating:</span> {alt.overall_rating.toFixed(1)} ⭐
                          </div>
                        )}
                        {alt.check_in_time && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Check-in:</span> {alt.check_in_time}
                          </div>
                        )}
                      </div>
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
              <p>No alternatives found. Try adjusting your search dates.</p>
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

export default ReplaceHotelModal;
