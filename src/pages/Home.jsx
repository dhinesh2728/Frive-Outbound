import { useState } from "react";
import { Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import {
  Upload, Settings, BarChart3, ClipboardList, ArrowRight, Layers, Truck,
  CalendarCog, SlidersHorizontal, Users, ShieldCheck, Database,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

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

function useBackfillPalletCookDates() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data: allPallets, error: pErr } = await supabase
        .from("pallets")
        .select("id, created_date, items, cook_dates");
      if (pErr) throw pErr;

      const needsBackfill = (allPallets || []).filter((p) => {
        const cd = p.cook_dates;
        return !cd || (Array.isArray(cd) && cd.length === 0);
      });

      if (!needsBackfill.length) return { backfilled: 0, unassigned: 0 };

      const { data: allJobs, error: jErr } = await supabase
        .from("meal_count_jobs")
        .select("menu_item_code, cook_date");
      if (jErr) throw jErr;

      let backfilled = 0;
      let unassigned = 0;

      for (const pallet of needsBackfill) {
        const code = ((pallet.items || [])[0]?.menu_item_code || "").toLowerCase().trim();
        const palletDay = (pallet.created_date || "").substring(0, 10);

        if (!code || !palletDay) {
          await supabase.from("pallets").update({ cook_dates: ["UNASSIGNED"] }).eq("id", pallet.id);
          unassigned++;
          continue;
        }

        const dayMs = new Date(palletDay + "T12:00:00Z").getTime();
        const minDate = new Date(dayMs - 86400000).toISOString().substring(0, 10);
        const maxDate = new Date(dayMs + 86400000).toISOString().substring(0, 10);

        const matches = (allJobs || []).filter((j) => {
          const jCode = (j.menu_item_code || "").toLowerCase().trim();
          return jCode === code && j.cook_date >= minDate && j.cook_date <= maxDate;
        });

        const distinctDates = [...new Set(matches.map((j) => j.cook_date))];

        if (distinctDates.length === 1) {
          await supabase.from("pallets").update({ cook_dates: [distinctDates[0]] }).eq("id", pallet.id);
          backfilled++;
        } else {
          await supabase.from("pallets").update({ cook_dates: ["UNASSIGNED"] }).eq("id", pallet.id);
          unassigned++;
        }
      }

      return { backfilled, unassigned };
    },
    onSuccess: ({ backfilled, unassigned }) => {
      toast({
        title: "Backfill complete",
        description: `${backfilled} backfilled, ${unassigned} unassigned.`,
      });
    },
    onError: (err) => {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });
}

function useBackfillPalletJobIds() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data: allPallets, error: pErr } = await supabase
        .from("pallets").select("id, items, cook_dates");
      if (pErr) throw pErr;

      const { data: allJobs, error: jErr } = await supabase
        .from("meal_count_jobs").select("id, menu_item_code, cook_date");
      if (jErr) throw jErr;

      let linked = 0, ambiguous = 0, noMatch = 0;

      for (const pallet of (allPallets || [])) {
        const cookDates = (pallet.cook_dates || []).filter(d => d !== "UNASSIGNED");
        let dirty = false;
        const newItems = (pallet.items || []).map(item => {
          if (item.job_id) return item;
          const code = (item.menu_item_code || "").toLowerCase().trim();
          if (!code || !cookDates.length) { noMatch++; return item; }
          const matches = (allJobs || []).filter(j =>
            (j.menu_item_code || "").toLowerCase().trim() === code &&
            cookDates.includes(j.cook_date)
          );
          if (matches.length === 1) { linked++; dirty = true; return { ...item, job_id: matches[0].id }; }
          if (matches.length > 1) { ambiguous++; return item; }
          noMatch++;
          return item;
        });
        if (dirty) await supabase.from("pallets").update({ items: newItems }).eq("id", pallet.id);
      }
      return { linked, ambiguous, noMatch };
    },
    onSuccess: ({ linked, ambiguous, noMatch }) => {
      toast({
        title: "Job ID backfill complete",
        description: `${linked} linked, ${ambiguous} ambiguous (multiple jobs), ${noMatch} unresolvable.`,
      });
    },
    onError: (err) => {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });
}

export default function Home() {
  const { admin, hasPermission } = useOutletContext() || {};
  const backfillMutation = useBackfillPalletCookDates();
  const backfillJobIdMutation = useBackfillPalletJobIds();

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

      {admin && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Superadmin Tools
          </h2>
          <Card>
            <CardContent className="p-5 flex items-start gap-4">
              <div className="bg-red-500 w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">Backfill Pallet Cook Dates</h3>
                <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                  Find all pallets with no cook date set and derive it from meal count jobs within ±1 day of the pallet's creation date. Ambiguous or unmatched pallets are marked UNASSIGNED.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                >
                  <Database className="w-4 h-4 mr-2" />
                  {backfillMutation.isPending ? "Running backfill…" : "Run Backfill"}
                </Button>
                {backfillMutation.isSuccess && (
                  <p className="text-sm text-emerald-600 font-medium mt-2">
                    Done: {backfillMutation.data.backfilled} backfilled, {backfillMutation.data.unassigned} unassigned.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="bg-red-500 w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">Backfill Pallet Item Job IDs</h3>
                <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                  Walk all pallet items without a job_id and resolve them by menu_item_code + cook_date
                  against meal_count_jobs. Exactly one match → writes job_id. Ambiguous or no match → left null.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => backfillJobIdMutation.mutate()}
                  disabled={backfillJobIdMutation.isPending}
                >
                  <Database className="w-4 h-4 mr-2" />
                  {backfillJobIdMutation.isPending ? "Running backfill…" : "Run Backfill"}
                </Button>
                {backfillJobIdMutation.isSuccess && (
                  <p className="text-sm text-emerald-600 font-medium mt-2">
                    Done: {backfillJobIdMutation.data.linked} linked,{" "}
                    {backfillJobIdMutation.data.ambiguous} ambiguous,{" "}
                    {backfillJobIdMutation.data.noMatch} unresolvable.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
