import { Card, CardContent } from "./ui/card";
import { useNavigate } from "react-router-dom";

interface TripCardProps {
  tripId: number;
  title: string;
  destination: string;
  imageUrl?: string;
  startDate: string;
  endDate: string;
  status: string;
}

const TripCard = ({ tripId, title, destination, imageUrl, startDate, endDate, status }: TripCardProps) => {
  const navigate = useNavigate();

  // Format dates for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Default image if none provided
  const defaultImage = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

  const handleClick = () => {
    navigate(`/trip/${tripId}`);
  };

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={handleClick}
    >
      <div className="aspect-video overflow-hidden">
        <img
          src={imageUrl || defaultImage}
          alt={destination}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultImage;
          }}
        />
      </div>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{destination}</p>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {formatDate(startDate)} - {formatDate(endDate)}
          </p>
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
            status === 'planned' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {status === 'draft' ? 'Saved for Later' :
             status === 'planned' ? 'Ongoing/Upcoming' :
             'Archived'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default TripCard;

