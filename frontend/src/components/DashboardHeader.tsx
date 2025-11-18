import { Link } from "react-router-dom";
import { Button } from "./ui/button";

const DashboardHeader = () => {
  const handleLogout = () => {
    // Dummy logout - clear any stored tokens
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <header className="bg-white border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="text-xl font-bold text-foreground">
              /PINDROP
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
          <Button 
            onClick={handleLogout}
            className="bg-navy hover:bg-navy/90 text-white"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
