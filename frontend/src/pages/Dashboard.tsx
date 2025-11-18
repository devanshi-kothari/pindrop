import DashboardHeader from "@/components/DashboardHeader";
import DashboardSidebar from "@/components/DashboardSidebar";
import TravelCard from "@/components/TravelCard";
import ChatWindow from "@/components/ChatWindow";

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
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 p-8 relative">
          <div className="max-w-7xl mx-auto space-y-8">
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

            {/* Click to view more suggestions (could trigger chat) */}
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">Click to view more</p>
              <p className="text-muted-foreground">Click to view more</p>
            </div>
          </div>

          {/* Chat Window - Fixed position in bottom right */}
          <div className="fixed bottom-6 right-6 w-[500px] h-[600px] bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg shadow-2xl border-2 border-blue-400 overflow-hidden flex flex-col z-50">
            <ChatWindow className="flex-1" />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
