import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import logo from "../../images/pindrop_transparent_icon.png";

const Header = () => {
  const navigate = useNavigate();

  const handleSignUp = () => {
    navigate("/signup");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <header className="bg-white border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              to="/"
              className="flex items-center gap-0 hover:opacity-85 transition-opacity"
            >
              <img
                src={logo}
                alt="Pindrop logo"
                className="h-9 w-9 md:h-10 md:w-10 object-contain"
              />
              <span className="text-xl font-bold text-foreground tracking-tight">
                PINDROP
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link to="/features" className="text-foreground hover:text-accent transition-colors">
                Features
              </Link>
              <Link to="/team" className="text-foreground hover:text-accent transition-colors">
                Our Team
              </Link>
              <Link to="/contact" className="text-foreground hover:text-accent transition-colors">
                Contact Us
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Button 
              variant="ghost" 
              className="text-foreground hover:bg-muted/50 h-10 !outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-100" 
              onClick={handleSignUp}
            >
              Sign Up
            </Button>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 shadow-sm h-10 !outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:shadow-sm active:scale-100" 
              onClick={handleLogin}
            >
              Log in
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
