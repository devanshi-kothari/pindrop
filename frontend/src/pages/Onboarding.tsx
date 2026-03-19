import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Header from "@/components/Header";
import { getApiUrl } from "@/lib/api";

const travelStyles = [
  { value: "adventure", label: "Adventure" },
  { value: "relaxation", label: "Relaxation" },
  { value: "cultural", label: "Cultural" },
  { value: "luxury", label: "Luxury" },
  { value: "budget", label: "Budget" },
  { value: "family", label: "Family" },
  { value: "solo", label: "Solo" },
  { value: "romantic", label: "Romantic" },
];

const availableTags = [
  "beaches",
  "mountains",
  "hiking",
  "photography",
  "nightlife",
  "food",
  "history",
  "art",
  "nature",
  "adventure",
  "relaxation",
  "shopping",
  "architecture",
  "wildlife",
];

const onboardingSchema = z.object({
  home_location: z.string().optional(),
  budget_preference: z.union([z.string(), z.number()]).optional(),
  travel_style: z.string().optional(),
  liked_tags: z.array(z.string()).optional(),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const Onboarding = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/login");
    }
  }, [navigate]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [restaurantPreferences, setRestaurantPreferences] = useState({
    mealsPerDay: 2,
    mealTypes: [] as string[],
    cuisineTypes: [] as string[],
    dietaryRestrictions: [] as string[],
    minPriceRange: null as string | null,
    maxPriceRange: null as string | null,
    customRequests: "",
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { liked_tags: [] },
  });

  const travelStyle = watch("travel_style");

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    setValue("liked_tags", newTags);
  };

  const onSubmit = async (data: OnboardingFormValues) => {
    try {
      const payload: Record<string, unknown> = {};
      if (data.home_location) payload.home_location = data.home_location;
      if (data.budget_preference) {
        payload.budget_preference = parseFloat(String(data.budget_preference)) || null;
      }
      if (data.travel_style) payload.travel_style = data.travel_style;
      if (data.liked_tags && data.liked_tags.length > 0) payload.liked_tags = data.liked_tags;

      const hasRestaurantPrefs =
        restaurantPreferences.cuisineTypes.length > 0 ||
        restaurantPreferences.dietaryRestrictions.length > 0 ||
        restaurantPreferences.mealTypes.length > 0 ||
        restaurantPreferences.minPriceRange ||
        restaurantPreferences.maxPriceRange ||
        restaurantPreferences.customRequests.trim().length > 0;

      if (hasRestaurantPrefs) {
        payload.restaurant_meals_per_day = restaurantPreferences.mealsPerDay;
        payload.restaurant_meal_types = restaurantPreferences.mealTypes;
        payload.restaurant_cuisine_types = restaurantPreferences.cuisineTypes;
        payload.restaurant_dietary_restrictions = restaurantPreferences.dietaryRestrictions;
        payload.restaurant_min_price_range = restaurantPreferences.minPriceRange;
        payload.restaurant_max_price_range = restaurantPreferences.maxPriceRange;
        payload.restaurant_custom_requests =
          restaurantPreferences.customRequests.trim().length > 0
            ? restaurantPreferences.customRequests.trim()
            : null;
      }

      const token = localStorage.getItem("token");
      const response = await fetch(getApiUrl("api/auth/me"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.user) {
        localStorage.setItem("user", JSON.stringify(result.user));
      }
      navigate("/dashboard");
    } catch (error) {
      console.error("Onboarding error:", error);
      alert("Failed to save preferences. Please try again.");
    }
  };

  const handleSkip = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 flex items-center justify-center">
        <Card className="w-full max-w-2xl shadow-lg border-2">
          <CardHeader className="space-y-3 pb-6">
            <div className="flex flex-col space-y-2 text-center">
              <CardTitle className="text-3xl font-bold tracking-tight">
                Complete your profile
              </CardTitle>
              <CardDescription className="text-base">
                Help us personalize your travel experience. All fields are optional.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Travel Preferences */}
              <div className="space-y-4 pb-4 border-b">
                <h3 className="text-lg font-semibold">Travel Preferences</h3>

                <div className="space-y-2.5">
                  <Label htmlFor="home_location" className="text-sm font-medium">
                    Home Location
                  </Label>
                  <Input
                    id="home_location"
                    type="text"
                    placeholder="New York, NY"
                    {...register("home_location")}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="budget_preference" className="text-sm font-medium">
                    Budget Preference (USD)
                  </Label>
                  <Input
                    id="budget_preference"
                    type="number"
                    placeholder="5000"
                    min="0"
                    step="100"
                    {...register("budget_preference")}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your typical travel budget per trip
                  </p>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="travel_style" className="text-sm font-medium">
                    Travel Style
                  </Label>
                  <Select
                    value={travelStyle}
                    onValueChange={(value) => setValue("travel_style", value)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select your travel style" />
                    </SelectTrigger>
                    <SelectContent>
                      {travelStyles.map((style) => (
                        <SelectItem key={style.value} value={style.value}>
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2.5">
                  <Label className="text-sm font-medium">
                    Interests (Select all that apply)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {availableTags.map((tag) => (
                      <div key={tag} className="flex items-center space-x-2">
                        <Checkbox
                          id={`onboarding-tag-${tag}`}
                          checked={selectedTags.includes(tag)}
                          onCheckedChange={() => handleTagToggle(tag)}
                        />
                        <Label
                          htmlFor={`onboarding-tag-${tag}`}
                          className="text-sm font-normal cursor-pointer capitalize"
                        >
                          {tag}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Food & Restaurant Preferences */}
              <div className="space-y-4 pb-4 border-b">
                <h3 className="text-lg font-semibold">Food &amp; Restaurant Preferences</h3>
                <p className="text-sm text-muted-foreground">
                  These help us suggest better restaurants for your trips.
                </p>

                <div className="space-y-2.5">
                  <Label htmlFor="onboarding-meals-per-day" className="text-sm font-medium">
                    Number of meals per day you usually eat out
                  </Label>
                  <Select
                    value={restaurantPreferences.mealsPerDay.toString()}
                    onValueChange={(value) =>
                      setRestaurantPreferences((prev) => ({
                        ...prev,
                        mealsPerDay: parseInt(value, 10),
                      }))
                    }
                  >
                    <SelectTrigger id="onboarding-meals-per-day" className="h-11">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 meal</SelectItem>
                      <SelectItem value="2">2 meals</SelectItem>
                      <SelectItem value="3">3 meals</SelectItem>
                      <SelectItem value="4">4+ meals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2.5">
                  <Label className="text-sm font-medium">
                    Types of meals you enjoy (select all that apply)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {["Breakfast", "Brunch", "Lunch", "Dinner", "Cafe", "Dessert", "Late Night"].map(
                      (mealType) => {
                        const checked = restaurantPreferences.mealTypes.includes(mealType);
                        return (
                          <div key={mealType} className="flex items-center space-x-2">
                            <Checkbox
                              id={`onboarding-meal-${mealType}`}
                              checked={checked}
                              onCheckedChange={() =>
                                setRestaurantPreferences((prev) => {
                                  const set = new Set(prev.mealTypes);
                                  if (set.has(mealType)) set.delete(mealType);
                                  else set.add(mealType);
                                  return { ...prev, mealTypes: Array.from(set) };
                                })
                              }
                            />
                            <Label
                              htmlFor={`onboarding-meal-${mealType}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {mealType}
                            </Label>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label className="text-sm font-medium">
                    Favorite cuisines (select all that apply)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {[
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
                      "Fusion",
                      "Other",
                    ].map((cuisine) => {
                      const checked = restaurantPreferences.cuisineTypes.includes(cuisine);
                      return (
                        <div key={cuisine} className="flex items-center space-x-2">
                          <Checkbox
                            id={`onboarding-cuisine-${cuisine}`}
                            checked={checked}
                            onCheckedChange={() =>
                              setRestaurantPreferences((prev) => {
                                const set = new Set(prev.cuisineTypes);
                                if (set.has(cuisine)) set.delete(cuisine);
                                else set.add(cuisine);
                                return { ...prev, cuisineTypes: Array.from(set) };
                              })
                            }
                          />
                          <Label
                            htmlFor={`onboarding-cuisine-${cuisine}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {cuisine}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label className="text-sm font-medium">
                    Dietary restrictions (select all that apply)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {[
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
                    ].map((restriction) => {
                      const checked = restaurantPreferences.dietaryRestrictions.includes(restriction);
                      return (
                        <div key={restriction} className="flex items-center space-x-2">
                          <Checkbox
                            id={`onboarding-dietary-${restriction}`}
                            checked={checked}
                            onCheckedChange={() =>
                              setRestaurantPreferences((prev) => {
                                const set = new Set(prev.dietaryRestrictions);
                                if (set.has(restriction)) set.delete(restriction);
                                else set.add(restriction);
                                return { ...prev, dietaryRestrictions: Array.from(set) };
                              })
                            }
                          />
                          <Label
                            htmlFor={`onboarding-dietary-${restriction}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {restriction}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium">Minimum price range</Label>
                    <Select
                      value={restaurantPreferences.minPriceRange || "any"}
                      onValueChange={(value) =>
                        setRestaurantPreferences((prev) => ({
                          ...prev,
                          minPriceRange: value === "any" ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="$$">$$</SelectItem>
                        <SelectItem value="$$$">$$$</SelectItem>
                        <SelectItem value="$$$$">$$$$</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium">Maximum price range</Label>
                    <Select
                      value={restaurantPreferences.maxPriceRange || "any"}
                      onValueChange={(value) =>
                        setRestaurantPreferences((prev) => ({
                          ...prev,
                          maxPriceRange: value === "any" ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="$$">$$</SelectItem>
                        <SelectItem value="$$$">$$$</SelectItem>
                        <SelectItem value="$$$$">$$$$</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="onboarding-custom-requests" className="text-sm font-medium">
                    Additional restaurant preferences or requests
                  </Label>
                  <Textarea
                    id="onboarding-custom-requests"
                    placeholder="E.g., prefer outdoor seating, love wine bars, need strong vegetarian options..."
                    value={restaurantPreferences.customRequests}
                    onChange={(e) =>
                      setRestaurantPreferences((prev) => ({
                        ...prev,
                        customRequests: e.target.value,
                      }))
                    }
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  className="flex-1 h-11 text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save preferences"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  onClick={handleSkip}
                  disabled={isSubmitting}
                >
                  Skip for now
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
