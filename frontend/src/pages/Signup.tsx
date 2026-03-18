import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
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
  CardFooter,
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

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    home_location: z.string().optional(),
    budget_preference: z.string().optional().or(z.number().optional()),
    travel_style: z.string().optional(),
    liked_tags: z.array(z.string()).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

const Signup = () => {
  const navigate = useNavigate();
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
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      liked_tags: [],
    },
  });

  const travelStyle = watch("travel_style");

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    setValue("liked_tags", newTags);
  };

  const onSubmit = async (data: SignupFormValues) => {
    try {
      const payload: any = {
        name: data.name,
        email: data.email,
        password: data.password,
      };

      // Add optional fields if provided
      if (data.home_location) {
        payload.home_location = data.home_location;
      }
      if (data.budget_preference) {
        payload.budget_preference = parseFloat(data.budget_preference as string) || null;
      }
      if (data.travel_style) {
        payload.travel_style = data.travel_style;
      }
      if (data.liked_tags && data.liked_tags.length > 0) {
        payload.liked_tags = data.liked_tags;
      }

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

      const response = await fetch(getApiUrl("api/auth/signup"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        // Store token if provided
        if (result.token) {
          localStorage.setItem("token", result.token);
        }
        // Store user data if provided
        if (result.user) {
          localStorage.setItem("user", JSON.stringify(result.user));
        }
        navigate("/dashboard");
      } else {
        alert(result.message || "Signup failed. Please try again.");
      }
    } catch (error) {
      console.error("Signup error:", error);
      alert("An error occurred. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 flex items-center justify-center">
        <Card className="w-full max-w-2xl shadow-lg border-2">
          <CardHeader className="space-y-3 pb-6">
            <div className="flex flex-col space-y-2 text-center">
              <CardTitle className="text-3xl font-bold tracking-tight">Create an account</CardTitle>
              <CardDescription className="text-base">
                Enter your information and preferences to get started with PinDrop
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Basic Information */}
              <div className="space-y-4 pb-4 border-b">
                <h3 className="text-lg font-semibold">Basic Information</h3>

                <div className="space-y-2.5">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Full Name *
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    {...register("name")}
                    className={`h-11 ${errors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive font-medium">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    {...register("email")}
                    className={`h-11 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive font-medium">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password *
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    {...register("password")}
                    className={`h-11 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive font-medium">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm Password *
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    {...register("confirmPassword")}
                    className={`h-11 ${errors.confirmPassword ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive font-medium">{errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              {/* Travel Preferences */}
              <div className="space-y-4 pb-4 border-b">
                <h3 className="text-lg font-semibold">Travel Preferences</h3>
                <p className="text-sm text-muted-foreground">
                  Help us personalize your travel experience (all optional)
                </p>

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
                          id={`tag-${tag}`}
                          checked={selectedTags.includes(tag)}
                          onCheckedChange={() => handleTagToggle(tag)}
                        />
                        <Label
                          htmlFor={`tag-${tag}`}
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
                  These help us suggest better restaurants for your trips (all optional).
                </p>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-meals-per-day" className="text-sm font-medium">
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
                    <SelectTrigger id="signup-meals-per-day" className="h-11">
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
                              id={`signup-meal-${mealType}`}
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
                              htmlFor={`signup-meal-${mealType}`}
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
                            id={`signup-cuisine-${cuisine}`}
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
                            htmlFor={`signup-cuisine-${cuisine}`}
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
                            id={`signup-dietary-${restriction}`}
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
                            htmlFor={`signup-dietary-${restriction}`}
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
                  <Label htmlFor="signup-custom-requests" className="text-sm font-medium">
                    Additional restaurant preferences or requests
                  </Label>
                  <Textarea
                    id="signup-custom-requests"
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

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="pt-6">
            <div className="text-sm text-center text-muted-foreground w-full">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline transition-colors">
                Log in
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
