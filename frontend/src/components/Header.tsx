import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="w-full border-b-2 border-border/50 bg-white/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/" className="text-2xl font-bold text-blue-600 tracking-tight hover:opacity-80 transition-opacity">
              /PINDROP
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link to="/features" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                Features
              </Link>
              <Link to="/team" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                Our Team
              </Link>
              <Link to="/contact" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                Contact Us
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-foreground hover:bg-muted/50">
              Sign Up
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 shadow-sm">
              Log in
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
