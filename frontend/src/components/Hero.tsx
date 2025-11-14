import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

const Hero = () => {
  return (
    <section className="py-24 md:py-32 px-6 text-center bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto max-w-5xl">
        <p className="text-muted-foreground mb-6 text-lg md:text-xl font-normal">
          Plan travel start to finish with your friends.
        </p>
        <h1 className="text-6xl md:text-8xl font-bold text-gray-900 mb-12 leading-[1.1] tracking-tight">
          PinDrop: Start Traveling
        </h1>
        <div className="mb-8 flex justify-center">
          <Button 
            className="bg-yellow-400 text-gray-900 hover:bg-yellow-500 rounded-xl px-12 py-8 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-200 gap-3 h-auto"
          >
            <Play className="w-7 h-7 fill-gray-900 stroke-gray-900" />
            Watch Demo
          </Button>
        </div>
        <p className="text-muted-foreground text-base md:text-lg">
          Completely free!
        </p>
      </div>
    </section>
  );
};

export default Hero;
