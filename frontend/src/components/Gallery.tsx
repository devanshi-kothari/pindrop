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

  // Show 3 images at a time, cycling through
  const getVisibleImages = () => {
    const visible = [];
    for (let i = 0; i < 3; i++) {
      const idx = (currentIndex + i) % images.length;
      visible.push({ index: idx, image: images[idx] });
    }
    return visible;
  };

  return (
    <section className="py-20 px-6 bg-background">
      <div className="container mx-auto max-w-7xl">
        <div className="relative">
          {/* Previous Button */}
          <button
            onClick={prevSlide}
            className="absolute left-0 md:-left-4 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-white border-2 border-border shadow-lg flex items-center justify-center hover:bg-muted transition-all duration-200 hover:scale-110"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-7 h-7 text-foreground" />
          </button>

          {/* Image Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 px-16 md:px-20">
            {getVisibleImages().map((item, idx) => (
              <div
                key={`${item.index}-${idx}`}
                className="relative group"
              >
                <div className="relative overflow-hidden rounded-xl border-2 border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                  <img
                    src={item.image}
                    alt={`Travel memory ${item.index + 1}`}
                    className="w-full aspect-[3/4] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>

          {/* Next Button */}
          <button
            onClick={nextSlide}
            className="absolute right-0 md:-right-4 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-white border-2 border-border shadow-lg flex items-center justify-center hover:bg-muted transition-all duration-200 hover:scale-110"
            aria-label="Next image"
          >
            <ChevronRight className="w-7 h-7 text-foreground" />
          </button>
        </div>

        {/* View Gallery Button */}
        <div className="flex justify-center mt-12">
          <Button
            className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-10 py-7 text-base font-semibold shadow-xl hover:shadow-2xl transition-all duration-200 gap-2"
          >
            View Gallery
            <ChevronDown className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Gallery;
