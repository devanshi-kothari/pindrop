import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
        navigate("/");
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
