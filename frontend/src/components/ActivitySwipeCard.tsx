import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Heart, X, MapPin, DollarSign, Clock, ExternalLink } from "lucide-react";

interface Activity {
  trip_activity_preference_id: number;
  activity_id: number;
  name: string;
  location: string | null;
  category: string | null;
  duration: string | null;
  cost_estimate: number | null;
  rating: number | null;
  tags: string[] | null;
  source: string | null;
  source_url: string | null;
  image_url: string | null;
  description: string | null;
  price_range: string | null;
  preference: "pending" | "liked" | "disliked" | "maybe";
}

interface ActivitySwipeCardProps {
  activity: Activity;
  onSwipe: (direction: "left" | "right" | "up") => void;
  onLike: () => void;
  onPass: () => void;
  onMaybe: () => void;
  isUpdating: boolean;
  index: number;
  total: number;
}

const ActivitySwipeCard = ({
  activity,
  onSwipe,
  onLike,
  onPass,
  onMaybe,
  isUpdating,
  index,
  total,
}: ActivitySwipeCardProps) => {
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const SWIPE_THRESHOLD = 100;
  const ROTATION_FACTOR = 0.1;

  useEffect(() => {
    if (!isDragging && (Math.abs(dragOffset.x) > SWIPE_THRESHOLD || Math.abs(dragOffset.y) > SWIPE_THRESHOLD)) {
      if (Math.abs(dragOffset.x) > Math.abs(dragOffset.y)) {
        onSwipe(dragOffset.x > 0 ? "right" : "left");
      } else if (dragOffset.y < -SWIPE_THRESHOLD) {
        onSwipe("up");
      }
      setDragOffset({ x: 0, y: 0 });
    } else if (!isDragging) {
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isDragging, dragOffset, onSwipe]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragStart) return;
    const touch = e.touches[0];
    const offsetX = touch.clientX - dragStart.x;
    const offsetY = touch.clientY - dragStart.y;
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStart({ x: e.clientX, y: e.clientY });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart || !isDragging) return;
    const offsetX = e.clientX - dragStart.x;
    const offsetY = e.clientY - dragStart.y;
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const rotation = dragOffset.x * ROTATION_FACTOR;
  const opacity = index === 0 ? 1 : 0.3 - index * 0.1;
  const scale = index === 0 ? 1 : 0.95 - index * 0.05;
  const zIndex = total - index;

  const getPriceDisplay = () => {
    if (activity.price_range) return activity.price_range;
    if (activity.cost_estimate !== null) {
      if (activity.cost_estimate === 0) return "Free";
      if (activity.cost_estimate < 20) return "Budget-friendly";
      if (activity.cost_estimate < 50) return "Moderate";
      if (activity.cost_estimate < 100) return "Expensive";
      return "Luxury";
    }
    return null;
  };

  return (
    <div
      ref={cardRef}
      className="absolute w-full max-w-md"
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotation}deg) scale(${scale})`,
        opacity: Math.max(0.3, opacity),
        zIndex,
        transition: isDragging ? "none" : "transform 0.3s ease-out, opacity 0.3s ease-out",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <Card className="overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-xl">
        {/* Image */}
        <div className="relative h-64 w-full overflow-hidden bg-slate-800">
          {activity.image_url ? (
            <img
              src={activity.image_url}
              alt={activity.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
              <MapPin className="h-16 w-16 text-slate-500" />
            </div>
          )}
          {/* Swipe indicators */}
          {Math.abs(dragOffset.x) > 50 && (
            <div
              className={`absolute inset-0 flex items-center justify-center text-6xl font-bold ${
                dragOffset.x > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}
            >
              {dragOffset.x > 0 ? "✓" : "✗"}
            </div>
          )}
          {/* Category badge */}
          {activity.category && (
            <div className="absolute top-3 left-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {activity.category}
            </div>
          )}
        </div>

        <CardContent className="space-y-3 p-4">
          {/* Title and Location */}
          <div>
            <h3 className="text-xl font-bold text-white">{activity.name}</h3>
            {activity.location && (
              <div className="mt-1 flex items-center gap-1 text-sm text-slate-400">
                <MapPin className="h-3 w-3" />
                <span>{activity.location}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {activity.description && (
            <p className="line-clamp-2 text-sm text-slate-300">{activity.description}</p>
          )}

          {/* Details */}
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            {activity.duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{activity.duration}</span>
              </div>
            )}
            {getPriceDisplay() && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                <span>{getPriceDisplay()}</span>
              </div>
            )}
            {activity.rating && (
              <div className="flex items-center gap-1">
                <span>⭐ {activity.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {activity.tags && activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activity.tags.slice(0, 3).map((tag, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              className={`h-12 w-12 rounded-full border-2 ${
                activity.preference === "disliked"
                  ? "border-red-400 bg-red-500/20 text-red-400"
                  : "border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              }`}
              disabled={isUpdating}
              onClick={onPass}
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-12 w-12 rounded-full border-2 ${
                activity.preference === "maybe"
                  ? "border-yellow-400 bg-yellow-500/20 text-yellow-400"
                  : "border-yellow-500 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
              }`}
              disabled={isUpdating}
              onClick={onMaybe}
            >
              ?
            </Button>
            <Button
              size="sm"
              className={`h-12 w-12 rounded-full ${
                activity.preference === "liked"
                  ? "border-2 border-green-400 bg-green-500/20 text-green-400"
                  : "bg-green-500 text-white hover:bg-green-600"
              }`}
              disabled={isUpdating}
              onClick={onLike}
            >
              <Heart className="h-5 w-5" />
            </Button>
          </div>

          {/* External Link */}
          {activity.source_url && (
            <a
              href={activity.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Learn more</span>
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivitySwipeCard;

