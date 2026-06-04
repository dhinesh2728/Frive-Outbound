import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { Upload, Settings, BarChart3, ClipboardList, Menu, X, Package, LogOut, CalendarCog, SlidersHorizontal, Layers, Truck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUser, isAdmin } from "@/lib/useCurrentUser";
import { base44 } from "@/api/base44Client";

const adminLinks = [
  { to: "/admin/import", label: "CSV Import", icon: Upload },
  { to: "/admin/crate-settings", label: "Crate Settings", icon: Settings },
  { to: "/admin/set-cook-date", label: "Set Cook Date", icon: CalendarCog },
  { to: "/admin/cook-date-settings", label: "Cook Date Rules", icon: SlidersHorizontal },
  { to: "/admin/outbound-admin", label: "Outbound Admin", icon: Truck },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
];

const staffLinks = [
  { to: "/counting", label: "Meal Counting", icon: ClipboardList },
  { to: "/palletization", label: "Palletization", icon: Layers },
  { to: "/outbound", label: "Outbound", icon: Truck },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { data: user, isLoading } = useCurrentUser();
  const admin = isAdmin(user);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Staff users: redirect root "/" to counting
  if (!admin && location.pathname === "/") {
    return <Navigate to="/counting" replace />;
  }

  const NavLink = ({ to, label, icon: Icon }) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar h-14 flex items-center px-4 gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <Package className="w-5 h-5 text-sidebar-primary" />
        <span className="font-bold text-sidebar-foreground">Frive Meal Stock</span>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-sidebar z-50 flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground text-sm">Frive Meal Assembly</h1>
              <p className="text-xs text-sidebar-foreground/50">Stock Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {admin && (
            <>
              <p className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                Admin Center
              </p>
              {adminLinks.map((link) => (
                <NavLink key={link.to} {...link} />
              ))}
              <div className="my-3 border-t border-sidebar-border" />
            </>
          )}
          <p className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Working Section
          </p>
          {staffLinks.map((link) => (
            <NavLink key={link.to} {...link} />
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
            <p className="text-xs font-semibold text-sidebar-foreground/80 capitalize">{user?.role || "user"}</p>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet context={{ user, admin }} />
        </div>
      </main>
    </div>
  );
}
