import { Card, CardContent } from "./ui/card";

interface TravelCardProps {
  location: string;
  imageUrl: string;
  date: string;
  activities: string[];
}

const TravelCard = ({ location, imageUrl, date, activities }: TravelCardProps) => {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-video overflow-hidden">
        <img 
          src={imageUrl} 
          alt={location}
          className="w-full h-full object-cover"
        />
      </div>
      <CardContent className="p-4 space-y-2">
        <p className="text-sm text-muted-foreground">{location}</p>
        <div className="space-y-1">
          <p className="font-semibold">{date}</p>
          <ul className="list-disc list-inside text-sm space-y-0.5">
            {activities.map((activity, index) => (
              <li key={index}>{activity}</li>
            ))}
          </ul>
        </div>
        <button className="text-sm text-muted-foreground hover:text-accent transition-colors">
          Click to view more
        </button>
      </CardContent>
    </Card>
  );
};

export default TravelCard;
