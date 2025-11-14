import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="w-full border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/" className="text-xl font-bold text-foreground">
              /PINDROP
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link to="/features" className="text-foreground hover:text-primary transition-colors">
                Features
              </Link>
              <Link to="/team" className="text-foreground hover:text-primary transition-colors">
                Our Team
              </Link>
              <Link to="/contact" className="text-foreground hover:text-primary transition-colors">
                Contact Us
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="text-foreground">
              Sign Up
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Log in
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
