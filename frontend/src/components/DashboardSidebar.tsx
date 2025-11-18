import { Home, PenSquare, Image, FileText, MessageSquare, Palette, Plug, Users, Settings, Wrench } from "lucide-react";
import { NavLink } from "./NavLink";
import { Badge } from "./ui/badge";

const DashboardSidebar = () => {
  const navItems = [
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: PenSquare, label: "Posts", path: "/dashboard/posts" },
    { icon: Image, label: "Media", path: "/dashboard/media" },
    { icon: FileText, label: "Pages", path: "/dashboard/pages" },
    { icon: MessageSquare, label: "Comments", path: "/dashboard/comments", badge: "1" },
    { icon: Palette, label: "Appearance", path: "/dashboard/appearance" },
    { icon: Plug, label: "Plugins", path: "/dashboard/plugins" },
    { icon: Users, label: "Users", path: "/dashboard/users" },
    { icon: Settings, label: "Settings", path: "/dashboard/settings" },
    { icon: Wrench, label: "Tools", path: "/dashboard/tools" },
  ];

  return (
    <aside className="w-64 min-h-screen bg-muted border-r border-border flex-shrink-0">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-background transition-colors"
            activeClassName="bg-background text-accent font-medium"
          >
            <item.icon className="w-5 h-5" />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge variant="secondary" className="ml-auto">
                {item.badge}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default DashboardSidebar;
