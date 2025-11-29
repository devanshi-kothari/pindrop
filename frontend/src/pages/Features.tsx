import Header from "@/components/Header";
import DashboardHeader from "@/components/DashboardHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  MessageSquare,
  Plane,
  Hotel,
  MapPin,
  Calendar,
  DollarSign,
  Heart,
  Zap,
  Globe,
  Users,
  BookOpen,
} from "lucide-react";

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: "AI-Powered Planning",
    description:
      "Get personalized travel recommendations powered by advanced AI. Our intelligent assistant understands your preferences and suggests destinations, activities, and itineraries tailored just for you.",
  },
  {
    icon: MessageSquare,
    title: "Interactive Chat Assistant",
    description:
      "Plan your trip through natural conversation. Ask questions, explore destinations, and get instant answers from our friendly travel assistant that learns your travel style.",
  },
  {
    icon: Plane,
    title: "Flight Search & Booking",
    description:
      "Search and compare flights from multiple airlines. Find the best deals on departing and return flights with real-time pricing and availability.",
  },
  {
    icon: Hotel,
    title: "Hotel Discovery",
    description:
      "Discover the perfect accommodation for your trip. Browse hotels with detailed information, ratings, and booking options from trusted partners.",
  },
  {
    icon: MapPin,
    title: "Smart Itinerary Builder",
    description:
      "Create detailed day-by-day itineraries with activities, locations, and timing. Our AI helps you build realistic schedules that match your pace and interests.",
  },
  {
    icon: Calendar,
    title: "Flexible Trip Planning",
    description:
      "Plan trips for any date range, from weekend getaways to extended adventures. Save drafts, update plans, and manage multiple trips all in one place.",
  },
  {
    icon: DollarSign,
    title: "Budget-Aware Recommendations",
    description:
      "Get suggestions that fit your budget. Our system considers your spending preferences and recommends activities and accommodations within your price range.",
  },
  {
    icon: Heart,
    title: "Personalized Preferences",
    description:
      "Save your travel style, interests, and preferences. Every recommendation is tailored to match what you love, from adventure sports to cultural experiences.",
  },
  {
    icon: Zap,
    title: "Quick Destination Exploration",
    description:
      "Not sure where to go? Explore destination ideas based on your interests. Get up to three curated suggestions that match your travel style and preferences.",
  },
  {
    icon: Globe,
    title: "Worldwide Coverage",
    description:
      "Plan trips to destinations around the globe. Our comprehensive database covers cities, countries, and regions worldwide with detailed information and recommendations.",
  },
  {
    icon: Users,
    title: "Group Travel Support",
    description:
      "Plan trips for solo travelers, couples, families, or groups. Our system adapts recommendations based on the number of travelers and their preferences.",
  },
  {
    icon: BookOpen,
    title: "Trip History & Management",
    description:
      "Keep track of all your trips in one place. Organize drafts, planned trips, and past adventures. Access your travel history anytime, anywhere.",
  },
];

const Features = () => {
  // Check if user is logged in
  const isLoggedIn = !!localStorage.getItem("token");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {isLoggedIn ? <DashboardHeader /> : <Header />}
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Features
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover everything PinDrop has to offer. From AI-powered planning to seamless booking, we've got everything you need to plan your perfect trip.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card
                  key={index}
                  className="shadow-lg border-2 hover:shadow-xl transition-shadow duration-300"
                >
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col space-y-4">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-2">
                        <IconComponent className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold tracking-tight">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-4">
              Ready to start planning your next adventure?
            </p>
            {isLoggedIn ? (
              <a
                href="/dashboard"
                className="text-primary hover:underline font-medium"
              >
                Go to Dashboard →
              </a>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <a
                  href="/signup"
                  className="text-primary hover:underline font-medium"
                >
                  Sign up to get started →
                </a>
                <span className="text-muted-foreground">or</span>
                <a
                  href="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Log in →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;

