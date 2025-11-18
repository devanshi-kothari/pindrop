import { useState } from "react";
import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import TravelCard from "@/components/TravelCard";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

// Dummy travel data
const travelDestinations = [
  {
    id: 1,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 2,
    location: "Las Vegas",
    imageUrl: "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57a?w=800&q=80",
    date: "Oct 8th",
    activities: ["Bellagio Fountains", "Red Rock Canyon hiking"],
  },
  {
    id: 3,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 4,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 5,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 6,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 7,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
  {
    id: 8,
    location: "Costa Rica",
    imageUrl: "https://images.unsplash.com/photo-1524338198850-8a2ff63aaceb?w=800&q=80",
    date: "Sept. 29:",
    activities: ["Ziplining in Arenal", "Hiking in Monteverde Cloud Forest"],
  },
];

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Search Bar */}
            <div className="relative max-w-3xl mx-auto">
              <Input
                type="text"
                placeholder="Where do you want to go..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-14 py-6 rounded-full border-2 text-base"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-pink-500" />
              </div>
              <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-cyan text-white p-2.5 rounded-full hover:bg-cyan/90 transition-colors">
                <Send className="w-5 h-5" />
              </button>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Things to look forward to...
            </h1>

            {/* Travel Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {travelDestinations.map((destination) => (
                <TravelCard key={destination.id} {...destination} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
