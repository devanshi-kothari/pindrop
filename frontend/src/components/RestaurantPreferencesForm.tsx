import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface RestaurantPreferences {
  cuisine_types: string[];
  dietary_restrictions: string[];
  meals_per_day: number;
  meal_types: string[];
  min_price_range: string | null;
  max_price_range: string | null;
  custom_requests: string;
}

interface RestaurantPreferencesFormProps {
  preferences: RestaurantPreferences | null;
  onPreferencesChange: (preferences: RestaurantPreferences) => void;
  onSave: (preferences: RestaurantPreferences) => Promise<void>;
}

const CUISINE_TYPES = [
  "Italian",
  "French",
  "Japanese",
  "Chinese",
  "Mexican",
  "Thai",
  "Indian",
  "Mediterranean",
  "American",
  "Spanish",
  "Greek",
  "Korean",
  "Vietnamese",
  "Middle Eastern",
  "Caribbean",
  "Brazilian",
  "Peruvian",
  "Ethiopian",
  "Moroccan",
  "Fusion",
  "Other",
];

const DIETARY_RESTRICTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Halal",
  "Kosher",
  "Dairy-free",
  "Nut-free",
  "Pescatarian",
  "Keto",
  "Paleo",
];

const MEAL_TYPES = ["Breakfast", "Brunch", "Lunch", "Dinner", "Cafe", "Dessert", "Late Night"];

const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"];

const RestaurantPreferencesForm = ({
  preferences,
  onPreferencesChange,
  onSave,
}: RestaurantPreferencesFormProps) => {
  const [localPreferences, setLocalPreferences] = useState<RestaurantPreferences>({
    cuisine_types: preferences?.cuisine_types || [],
    dietary_restrictions: preferences?.dietary_restrictions || [],
    meals_per_day: preferences?.meals_per_day || 2,
    meal_types: preferences?.meal_types || [],
    min_price_range: preferences?.min_price_range || null,
    max_price_range: preferences?.max_price_range || null,
    custom_requests: preferences?.custom_requests || "",
  });

  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences);
    }
  }, [preferences]);

  const toggleArrayItem = (key: "cuisine_types" | "dietary_restrictions" | "meal_types", value: string) => {
    setLocalPreferences((prev) => {
      const current = new Set(prev[key]);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      return { ...prev, [key]: Array.from(current) };
    });
  };

  const handleSave = async () => {
    onPreferencesChange(localPreferences);
    await onSave(localPreferences);
  };

  return (
    <div className="space-y-6">
      {/* Cuisine Types */}
      <div>
        <Label className="text-sm font-semibold text-slate-700 mb-2 block">
          Cuisine Types (select all that apply)
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CUISINE_TYPES.map((cuisine) => (
            <div key={cuisine} className="flex items-center space-x-2">
              <Checkbox
                id={`cuisine-${cuisine}`}
                checked={localPreferences.cuisine_types.includes(cuisine)}
                onCheckedChange={() => toggleArrayItem("cuisine_types", cuisine)}
              />
              <Label
                htmlFor={`cuisine-${cuisine}`}
                className="text-xs text-slate-600 cursor-pointer"
              >
                {cuisine}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Dietary Restrictions */}
      <div>
        <Label className="text-sm font-semibold text-slate-700 mb-2 block">
          Dietary Restrictions (select all that apply)
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DIETARY_RESTRICTIONS.map((restriction) => (
            <div key={restriction} className="flex items-center space-x-2">
              <Checkbox
                id={`dietary-${restriction}`}
                checked={localPreferences.dietary_restrictions.includes(restriction)}
                onCheckedChange={() => toggleArrayItem("dietary_restrictions", restriction)}
              />
              <Label
                htmlFor={`dietary-${restriction}`}
                className="text-xs text-slate-600 cursor-pointer"
              >
                {restriction}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Meals Per Day */}
      <div>
        <Label htmlFor="meals-per-day" className="text-sm font-semibold text-slate-700 mb-2 block">
          Number of meals per day you want to eat out
        </Label>
        <Select
          value={localPreferences.meals_per_day.toString()}
          onValueChange={(value) =>
            setLocalPreferences((prev) => ({ ...prev, meals_per_day: parseInt(value) }))
          }
        >
          <SelectTrigger id="meals-per-day" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 meal</SelectItem>
            <SelectItem value="2">2 meals</SelectItem>
            <SelectItem value="3">3 meals</SelectItem>
            <SelectItem value="4">4+ meals</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Meal Types */}
      <div>
        <Label className="text-sm font-semibold text-slate-700 mb-2 block">
          Types of meals you're interested in (select all that apply)
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MEAL_TYPES.map((mealType) => (
            <div key={mealType} className="flex items-center space-x-2">
              <Checkbox
                id={`meal-${mealType}`}
                checked={localPreferences.meal_types.includes(mealType)}
                onCheckedChange={() => toggleArrayItem("meal_types", mealType)}
              />
              <Label
                htmlFor={`meal-${mealType}`}
                className="text-xs text-slate-600 cursor-pointer"
              >
                {mealType}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="min-price" className="text-sm font-semibold text-slate-700 mb-2 block">
            Minimum Price Range
          </Label>
          <Select
            value={localPreferences.min_price_range || ""}
            onValueChange={(value) =>
              setLocalPreferences((prev) => ({
                ...prev,
                min_price_range: value || null,
              }))
            }
          >
            <SelectTrigger id="min-price" className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              {PRICE_RANGES.map((range) => (
                <SelectItem key={range} value={range}>
                  {range}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="max-price" className="text-sm font-semibold text-slate-700 mb-2 block">
            Maximum Price Range
          </Label>
          <Select
            value={localPreferences.max_price_range || ""}
            onValueChange={(value) =>
              setLocalPreferences((prev) => ({
                ...prev,
                max_price_range: value || null,
              }))
            }
          >
            <SelectTrigger id="max-price" className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              {PRICE_RANGES.map((range) => (
                <SelectItem key={range} value={range}>
                  {range}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Custom Requests */}
      <div>
        <Label htmlFor="custom-requests" className="text-sm font-semibold text-slate-700 mb-2 block">
          Additional preferences or requests
        </Label>
        <Textarea
          id="custom-requests"
          placeholder="E.g., 'Prefer outdoor seating', 'Looking for romantic spots', 'Must have good vegetarian options'..."
          value={localPreferences.custom_requests}
          onChange={(e) =>
            setLocalPreferences((prev) => ({ ...prev, custom_requests: e.target.value }))
          }
          className="min-h-[80px]"
        />
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} className="w-full bg-blue-500 hover:bg-blue-600 text-white">
        Save Preferences
      </Button>
    </div>
  );
};

export default RestaurantPreferencesForm;
