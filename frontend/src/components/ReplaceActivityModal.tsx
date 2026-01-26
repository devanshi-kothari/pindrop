import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface ActivityAlternative {
  activity_id?: number;
  name: string;
  location?: string;
  category?: string;
  duration?: string;
  cost_estimate?: number;
  rating?: number;
  description?: string;
  source_url?: string;
  is_new?: boolean; // true for API-generated alternatives
}

interface ReplaceActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentActivity: ActivityAlternative;
  dayNumber: number;
  tripId: number;
  onConfirm: (selectedActivity: ActivityAlternative) => Promise<void>;
}

export const ReplaceActivityModal = ({
  isOpen,
  onClose,
  currentActivity,
  dayNumber,
  tripId,
  onConfirm,
}: ReplaceActivityModalProps) => {
  const [alternatives, setAlternatives] = useState<ActivityAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch alternatives when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchAlternatives = async () => {
      setIsLoading(true);
      setError(null);
      setAlternatives([]);
      setSelectedIndex(null);

      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Not authenticated");

        const url = getApiUrl(`api/trips/${tripId}/activities/${currentActivity.activity_id}/alternatives`);
        console.log("[ReplaceActivityModal] Fetching alternatives from:", url);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();
        console.log("[ReplaceActivityModal] API response:", result);

        if (response.ok && result.success && Array.isArray(result.alternatives)) {
          setAlternatives(result.alternatives);
        } else {
          setError(result.message || "Failed to load alternatives. No results returned.");
          console.error("Alternatives result:", result);
        }
      } catch (err) {
        console.error("Error fetching alternatives:", err);
        setError("Failed to load alternatives. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlternatives();
  }, [isOpen, tripId, currentActivity.activity_id]);

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
      setError("Failed to replace activity. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Replace Activity</DialogTitle>
          <DialogDescription>Select an alternative activity to replace the current one.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Activity */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-slate-500 font-semibold mb-1">CURRENT ACTIVITY</p>
            <p className="font-semibold text-slate-900">{currentActivity.name}</p>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-slate-600">
              {currentActivity.category && <div>Category: {currentActivity.category}</div>}
              {currentActivity.duration && <div>Duration: {currentActivity.duration}</div>}
              {currentActivity.cost_estimate && (
                <div>Cost: ${currentActivity.cost_estimate.toLocaleString()}</div>
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
                      {alt.description && (
                        <p className="text-xs text-slate-600 mt-1">{alt.description}</p>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                        {alt.category && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Category:</span> {alt.category}
                          </div>
                        )}
                        {alt.duration && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Duration:</span> {alt.duration}
                          </div>
                        )}
                        {alt.cost_estimate !== undefined && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Cost:</span> $
                            {alt.cost_estimate.toLocaleString()}
                          </div>
                        )}
                        {alt.rating && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-500">Rating:</span> {alt.rating.toFixed(1)} ⭐
                          </div>
                        )}
                      </div>
                      {alt.location && (
                        <p className="text-xs text-blue-600 mt-2">📍 {alt.location}</p>
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
              <p>No alternatives found. Try adjusting your preferences.</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isConfirming}
            >
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

export default ReplaceActivityModal;
