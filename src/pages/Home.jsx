import { Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { Upload, Settings, ClipboardList, BarChart3, ArrowRight, Layers, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const workingLinks = [
  { title: "Meal Counting", desc: "Count and register meal assembly stock", icon: ClipboardList, to: "/counting", color: "bg-emerald-500" },
  { title: "Palletization", desc: "Create and manage pallets for outbound", icon: Layers, to: "/palletization", color: "bg-violet-500" },
  { title: "Outbound", desc: "Manage pallet pickup and trailer loading", icon: Truck, to: "/outbound", color: "bg-blue-500" },
];

const adminLinks = [
  { title: "CSV Import", desc: "Upload meal predictions from CSV files", icon: Upload, to: "/admin/import", color: "bg-slate-500" },
  { title: "Crate Settings", desc: "Configure bowl crate values and pallet config", icon: Settings, to: "/admin/crate-settings", color: "bg-amber-500" },
  { title: "Outbound Admin", desc: "Manage trailers and outbound setup", icon: Truck, to: "/admin/outbound-admin", color: "bg-orange-500" },
  { title: "Reports", desc: "View jobs, pallets, outbound and export data", icon: BarChart3, to: "/admin/reports", color: "bg-rose-500" },
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
  const { admin } = useOutletContext() || {};

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Frive Meal Assembly Stock</h1>
        <p className="text-muted-foreground mt-2">Factory meal counting, palletization & outbound management</p>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Working Section</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {workingLinks.map(s => <SectionCard key={s.to} {...s} />)}
        </div>
      </div>

      {admin && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Admin Center</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {adminLinks.map(s => <SectionCard key={s.to} {...s} />)}
          </div>
        </div>
      )}
    </div>
  );
}
