import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

const Hero = () => {
  return (
    <section className="py-16 px-6 text-center">
      <div className="container mx-auto max-w-4xl">
        <p className="text-muted-foreground mb-4">
          Plan travel start to finish with your friends.
        </p>
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-8">
          PinDrop: Start Traveling
        </h1>
        <Button 
          className="bg-accent text-accent-foreground hover:bg-accent/90 border-2 border-foreground/20 rounded-lg px-8 py-6 text-base font-medium mb-4"
        >
          <Play className="w-5 h-5 fill-current" />
          Watch Demo
        </Button>
        <p className="text-muted-foreground text-sm">
          Completely free!
        </p>
      </div>
    </section>
  );
};

export default Hero;
