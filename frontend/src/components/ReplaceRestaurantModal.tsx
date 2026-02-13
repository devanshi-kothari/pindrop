import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, MapPin, DollarSign, Utensils, ExternalLink } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface RestaurantAlternative {
  restaurant_id?: number;
  name: string;
  location?: string;
  address?: string;
  cuisine_type?: string;
  price_range?: string;
  cost_estimate?: number;
  rating?: number;
  description?: string;
  meal_types?: string[];
  dietary_options?: string[];
  link?: string;
  reservation_url?: string;
  source_url?: string;
  is_new?: boolean;
}

interface CurrentMeal {
  trip_meal_id: number;
  day_number: number;
  slot: string;
  name?: string;
  location?: string;
  link?: string;
  cost?: number;
  finalized?: boolean;
}

interface ReplaceRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMeal: CurrentMeal;
  tripId: number;
  onConfirm: (selectedRestaurant: RestaurantAlternative) => Promise<void>;
}

export const ReplaceRestaurantModal = ({
  isOpen,
  onClose,
  currentMeal,
  tripId,
  onConfirm,
}: ReplaceRestaurantModalProps) => {
  const [alternatives, setAlternatives] = useState<RestaurantAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format slot name for display
  const formatSlot = (slot: string) => {
    return slot.charAt(0).toUpperCase() + slot.slice(1);
  };

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

        const url = getApiUrl(`api/trips/${tripId}/meals/${currentMeal.trip_meal_id}/alternatives`);
        console.log("[ReplaceRestaurantModal] Fetching alternatives from:", url);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();
        console.log("[ReplaceRestaurantModal] API response:", result);

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
  }, [isOpen, tripId, currentMeal.trip_meal_id]);

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
      setError("Failed to replace restaurant. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const getPriceRangeLabel = (priceRange?: string) => {
    if (!priceRange) return null;
    const count = (priceRange.match(/\$/g) || []).length;
    if (count === 1) return "Budget-friendly";
    if (count === 2) return "Moderate";
    if (count === 3) return "Upscale";
    if (count >= 4) return "Fine Dining";
    return priceRange;
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
          <DialogTitle>Replace {formatSlot(currentMeal.slot)} Restaurant</DialogTitle>
          <DialogDescription>
            Select an alternative restaurant for Day {currentMeal.day_number} {formatSlot(currentMeal.slot)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Restaurant */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-slate-500 font-semibold mb-1">CURRENT RESTAURANT</p>
            <p className="font-semibold text-slate-900">{currentMeal.name || "Not set"}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
              {currentMeal.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {currentMeal.location}
                </div>
              )}
              {currentMeal.cost && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  ${currentMeal.cost.toLocaleString()}
                </div>
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
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{alt.name}</p>
                        {alt.is_new && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                            AI Suggested
                          </span>
                        )}
                      </div>
                      {alt.description && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{alt.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs">
                        {alt.cuisine_type && (
                          <div className="flex items-center gap-1 text-slate-600">
                            <Utensils className="h-3 w-3" />
                            {alt.cuisine_type}
                          </div>
                        )}
                        {alt.price_range && (
                          <div className="text-slate-600">
                            <span className="font-semibold">{alt.price_range}</span>
                            <span className="text-slate-400 ml-1">({getPriceRangeLabel(alt.price_range)})</span>
                          </div>
                        )}
                        {alt.cost_estimate !== undefined && (
                          <div className="flex items-center gap-1 text-slate-600">
                            <DollarSign className="h-3 w-3" />
                            ~${alt.cost_estimate.toLocaleString()}/person
                          </div>
                        )}
                        {alt.rating && (
                          <div className="text-slate-600">
                            {alt.rating.toFixed(1)} ⭐
                          </div>
                        )}
                      </div>
                      {(alt.location || alt.address) && (
                        <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {alt.address || alt.location}
                        </p>
                      )}
                      {alt.dietary_options && alt.dietary_options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {alt.dietary_options.map((option, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded"
                            >
                              {option}
                            </span>
                          ))}
                        </div>
                      )}
                      {(alt.link || alt.reservation_url || alt.source_url) && (
                        <a
                          href={alt.link || alt.reservation_url || alt.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Restaurant
                        </a>
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
              <p>No alternatives found. Try adjusting your restaurant preferences.</p>
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
              className="bg-amber-500 hover:bg-amber-600"
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

export default ReplaceRestaurantModal;
