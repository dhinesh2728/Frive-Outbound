import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import {
  Upload, Settings, BarChart3, ClipboardList, Menu, X, Package,
  LogOut, CalendarCog, SlidersHorizontal, Layers, Truck, Users, ShieldCheck, Mail,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

// Maps permission key → nav item definition
const ADMIN_NAV = [
  { permKey: "csv_import",      to: "/admin/import",            label: "CSV Import",        icon: Upload },
  { permKey: "crate_settings",  to: "/admin/crate-settings",    label: "Crate Settings",    icon: Settings },
  { permKey: "set_cook_date",   to: "/admin/set-cook-date",     label: "Set Cook Date",     icon: CalendarCog },
  { permKey: "cook_date_rules", to: "/admin/cook-date-settings", label: "Cook Date Rules",  icon: SlidersHorizontal },
  { permKey: "outbound_admin",  to: "/admin/outbound-admin",    label: "Outbound Admin",    icon: Truck },
  { permKey: "reports",         to: "/admin/reports",           label: "Reports",           icon: BarChart3 },
];

const WORKING_NAV = [
  { permKey: "meal_counting",  to: "/counting",      label: "Meal Counting",  icon: ClipboardList },
  { permKey: "palletization",  to: "/palletization", label: "Palletization",  icon: Layers },
  { permKey: "outbound",       to: "/outbound",      label: "Outbound",       icon: Truck },
];

// Redirect order for non-superadmin users hitting "/"
const FIRST_PAGE_ORDER = [
  { permKey: "meal_counting",   to: "/counting" },
  { permKey: "palletization",   to: "/palletization" },
  { permKey: "outbound",        to: "/outbound" },
  { permKey: "csv_import",      to: "/admin/import" },
  { permKey: "crate_settings",  to: "/admin/crate-settings" },
  { permKey: "set_cook_date",   to: "/admin/set-cook-date" },
  { permKey: "cook_date_rules", to: "/admin/cook-date-settings" },
  { permKey: "outbound_admin",  to: "/admin/outbound-admin" },
  { permKey: "reports",         to: "/admin/reports" },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, hasPermission, logout } = useAuth();

  const isSuperAdmin = user?.is_superadmin === true;

  // Non-superadmin users at "/" get redirected to their first accessible page
  if (!isSuperAdmin && location.pathname === "/") {
    const first = FIRST_PAGE_ORDER.find(({ permKey }) => hasPermission(permKey));
    return <Navigate to={first ? first.to : "/not-authorised"} replace />;
  }

  const visibleAdminNav  = ADMIN_NAV.filter(({ permKey }) => hasPermission(permKey));
  const visibleWorkingNav = WORKING_NAV.filter(({ permKey }) => hasPermission(permKey));

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

  const hasAnyAdmin  = isSuperAdmin || visibleAdminNav.length > 0;
  const hasAnyWorking = visibleWorkingNav.length > 0;

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
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-sidebar z-50 flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
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

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {/* Admin Center */}
          {hasAnyAdmin && (
            <>
              <p className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                Admin Center
              </p>
              {visibleAdminNav.map((link) => (
                <NavLink key={link.to} {...link} />
              ))}
              {/* Superadmin-only management links */}
              {isSuperAdmin && (
                <>
                  <NavLink to="/admin/users"         label="User Management"    icon={Users} />
                  <NavLink to="/admin/permissions"   label="Manage Permissions" icon={ShieldCheck} />
                  <NavLink to="/admin/email-settings" label="Email Settings"    icon={Mail} />
                </>
              )}
              {hasAnyWorking && <div className="my-3 border-t border-sidebar-border" />}
            </>
          )}

          {/* Working Section */}
          {hasAnyWorking && (
            <>
              <p className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                Working Section
              </p>
              {visibleWorkingNav.map((link) => (
                <NavLink key={link.to} {...link} />
              ))}
            </>
          )}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-sidebar-foreground/70 truncate font-medium">
              {user?.username}
            </p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">
              {isSuperAdmin ? "Superadmin" : user?.group_name || "No group"}
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet context={{ user, admin: isSuperAdmin, hasPermission }} />
        </div>
      </main>
    </div>
  );
}
