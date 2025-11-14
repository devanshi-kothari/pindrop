import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

const Gallery = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const images = [
    "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&auto=format&fit=crop",
  ];

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <section className="py-12 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="relative">
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-16">
            {images.map((image, index) => {
              const position = (index - currentIndex + images.length) % images.length;
              return (
                <div
                  key={index}
                  className={`transition-all duration-300 ${
                    position === 0 || position === 1 || position === 2
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 hidden"
                  }`}
                >
                  <img
                    src={image}
                    alt={`Travel memory ${index + 1}`}
                    className="w-full aspect-[3/4] object-cover rounded-lg"
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6 text-foreground" />
          </button>
        </div>

        <div className="flex justify-center mt-8">
          <Button
            variant="outline"
            className="bg-foreground text-background hover:bg-foreground/90 hover:text-background rounded-full px-6"
          >
            View Gallery
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Gallery;
