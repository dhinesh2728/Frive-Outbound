import { Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import {
  Upload, Settings, BarChart3, ClipboardList, ArrowRight, Layers, Truck,
  CalendarCog, SlidersHorizontal, Users, ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ALL_CARDS = [
  // Working
  { permKey: "meal_counting",   title: "Meal Counting",   desc: "Count and register meal assembly stock",          icon: ClipboardList, to: "/counting",              color: "bg-emerald-500", group: "working" },
  { permKey: "palletization",   title: "Palletization",   desc: "Create and manage pallets for outbound",          icon: Layers,        to: "/palletization",          color: "bg-violet-500", group: "working" },
  { permKey: "outbound",        title: "Outbound",        desc: "Manage pallet pickup and trailer loading",        icon: Truck,         to: "/outbound",               color: "bg-blue-500",   group: "working" },
  // Admin
  { permKey: "csv_import",      title: "CSV Import",      desc: "Upload meal predictions from CSV files",          icon: Upload,        to: "/admin/import",           color: "bg-slate-500",  group: "admin" },
  { permKey: "crate_settings",  title: "Crate Settings",  desc: "Configure bowl crate values and pallet config",   icon: Settings,      to: "/admin/crate-settings",   color: "bg-amber-500",  group: "admin" },
  { permKey: "set_cook_date",   title: "Set Cook Date",   desc: "Set the active cook date for production",         icon: CalendarCog,   to: "/admin/set-cook-date",    color: "bg-teal-500",   group: "admin" },
  { permKey: "cook_date_rules", title: "Cook Date Rules", desc: "Configure cook date combination rules",           icon: SlidersHorizontal, to: "/admin/cook-date-settings", color: "bg-cyan-500", group: "admin" },
  { permKey: "outbound_admin",  title: "Outbound Admin",  desc: "Manage trailers and outbound setup",              icon: Truck,         to: "/admin/outbound-admin",   color: "bg-orange-500", group: "admin" },
  { permKey: "reports",         title: "Reports",         desc: "View jobs, pallets, outbound and export data",    icon: BarChart3,     to: "/admin/reports",          color: "bg-rose-500",   group: "admin" },
  // Superadmin-only
  { superadminOnly: true,       title: "User Management", desc: "Create users and manage access",                  icon: Users,         to: "/admin/users",            color: "bg-indigo-500", group: "admin" },
  { superadminOnly: true,       title: "Manage Permissions", desc: "Create and edit permission groups",            icon: ShieldCheck,   to: "/admin/permissions",      color: "bg-purple-500", group: "admin" },
];

function SectionCard({ to, title, desc, icon: Icon, color }) {
  return (
    <Link to={to}>
      <Card className="hover:shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer h-full">
        <CardContent className="p-5 flex items-start gap-4">
          <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Home() {
  const { admin, hasPermission } = useOutletContext() || {};

  const workingCards = ALL_CARDS.filter(
    (c) => c.group === "working" && (c.superadminOnly ? admin : hasPermission?.(c.permKey))
  );
  const adminCards = ALL_CARDS.filter(
    (c) => c.group === "admin" && (c.superadminOnly ? admin : hasPermission?.(c.permKey))
  );

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Frive Meal Assembly Stock</h1>
        <p className="text-muted-foreground mt-2">Factory meal counting, palletization & outbound management</p>
      </div>

      {workingCards.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Working Section
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {workingCards.map((s) => <SectionCard key={s.to} {...s} />)}
          </div>
        </div>
      )}

      {adminCards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Admin Center
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {adminCards.map((s) => <SectionCard key={s.to} {...s} />)}
          </div>
        </div>
      )}

      {workingCards.length === 0 && adminCards.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No sections available</p>
          <p className="text-sm mt-1">Contact your administrator to request access.</p>
        </div>
      )}
    </div>
  );
}
