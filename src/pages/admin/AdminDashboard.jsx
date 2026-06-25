import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/api/supabaseClient";
import { useActiveCookDates } from "@/lib/useActiveCookDates";
import { deriveMealStatus } from "@/utils/deriveMealStatus";
import PageHeader from "@/components/shared/PageHeader";
import PipelineSummaryStrip from "@/components/admin/PipelineSummaryStrip";
import MealBreakdownTable from "@/components/admin/MealBreakdownTable";
import AIDataAnalyst from "@/components/admin/AIDataAnalyst";

export default function AdminDashboard() {
  const { user, admin: isSuperAdmin, hasPermission } = useOutletContext() || {};

  const activeCookDates = useActiveCookDates();
  const [selectedCookDate, setSelectedCookDate] = useState(null);
  const [analystOpen, setAnalystOpen] = useState(false);

  useEffect(() => {
    if (activeCookDates.length > 0 && !selectedCookDate) {
      setSelectedCookDate(activeCookDates);
    }
  }, [activeCookDates]);

  const cookDatesArray = Array.isArray(selectedCookDate) ? selectedCookDate : selectedCookDate ? [selectedCookDate] : [];

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["admin-dashboard-jobs", selectedCookDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_count_jobs")
        .select("*")
        .in("cook_date", cookDatesArray);
      return data || [];
    },
    enabled: cookDatesArray.length > 0,
    refetchInterval: 30_000,
  });

  const { data: predictions = [], isLoading: predictionsLoading } = useQuery({
    queryKey: ["admin-dashboard-predictions", selectedCookDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("imported_meal_predictions")
        .select("*")
        .in("cook_date", cookDatesArray);
      return data || [];
    },
    enabled: cookDatesArray.length > 0,
    refetchInterval: 30_000,
  });

  const { data: pallets = [], isLoading: palletsLoading } = useQuery({
    queryKey: ["admin-dashboard-pallets", selectedCookDate],
    queryFn: async () => {
      const { data } = await supabase.from("pallets").select("*");
      return (data || []).filter(
        p => Array.isArray(p.cook_dates) && p.cook_dates.some(cd => cookDatesArray.includes(cd))
      );
    },
    enabled: cookDatesArray.length > 0,
    refetchInterval: 30_000,
  });

  const { data: trailers = [], isLoading: trailersLoading } = useQuery({
    queryKey: ["admin-dashboard-trailers", selectedCookDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("trailers")
        .select("*")
        .in("cook_date", cookDatesArray);
      return data || [];
    },
    enabled: cookDatesArray.length > 0,
    refetchInterval: 30_000,
  });

  const isLoading = jobsLoading || predictionsLoading || palletsLoading || trailersLoading;

  const derivedMeals = useMemo(() => {
    if (!jobs.length) return [];
    return jobs.map(job => {
      const prediction = predictions.find(p => p.menu_item_code === job.menu_item_code.toLowerCase()) || null;
      const mealPallets = pallets.filter(
        p => Array.isArray(p.items) && p.items.some(i => i.job_id === job.id)
      );
      const status = deriveMealStatus(job, prediction, mealPallets, trailers);
      const pallet_count = mealPallets.length;
      const loaded_count = mealPallets.filter(p => p.status === "loaded_to_trailer").length;
      const meals_on_pallets = mealPallets.reduce(
        (sum, p) => sum + (p.total_stacks * (p.stacks_capacity || 5)),
        0
      );
      return { ...job, prediction, pallets: mealPallets, status, pallet_count, loaded_count, meals_on_pallets };
    });
  }, [jobs, predictions, pallets, trailers]);

  const strip = useMemo(() => {
    const buckets = {
      not_started:       { jobCount: 0, mealCount: 0 },
      in_progress:       { jobCount: 0, mealCount: 0 },
      over_target:       { jobCount: 0, mealCount: 0 },
      palletted:         { jobCount: 0, mealCount: 0 },
      loaded_to_trailer: { jobCount: 0, mealCount: 0 },
      completed:         { jobCount: 0, mealCount: 0 },
    };
    derivedMeals.forEach(m => {
      if (buckets[m.status]) {
        buckets[m.status].jobCount += 1;
        buckets[m.status].mealCount += m.total_quantity;
      }
    });
    return buckets;
  }, [derivedMeals]);

  const rawForAI = useMemo(() => ({
    cookDate: selectedCookDate,
    meals: derivedMeals.map(m => ({
      name: m.menu_item_code,
      lpCode: m.lp_item_id || null,
      target: m.prediction?.target_quantity || null,
      counted: m.total_quantity,
      status: m.status,
      palletCount: m.pallet_count,
      trailerLabel:
        trailers.find(t => t.id === m.pallets[0]?.trailer_id)?.trailer_id_label || null,
    })),
    trailers: trailers.map(t => ({
      label: t.trailer_id_label,
      status: t.status,
      palletCount: pallets.filter(p => p.trailer_id === t.id).length,
    })),
    summary: {
      totalJobs: jobs.length,
      totalCounted: derivedMeals.reduce((s, m) => s + m.total_quantity, 0),
      totalTarget: derivedMeals.reduce(
        (s, m) => s + (m.prediction?.target_quantity || 0),
        0
      ),
      totalPallets: pallets.length,
      loadedOrCompleted: derivedMeals.filter(
        m => m.status === "loaded_to_trailer" || m.status === "completed"
      ).length,
    },
  }), [derivedMeals, trailers, pallets, jobs, selectedCookDate]);

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="Cook day operational overview — real-time"
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Cook Date</label>
          <select
            value={Array.isArray(selectedCookDate) ? selectedCookDate.join(",") : ""}
            onChange={e => setSelectedCookDate(e.target.value ? e.target.value.split(",") : [])}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            {activeCookDates.length > 0 && (
              <option value={activeCookDates.join(",")}>{activeCookDates.join(" & ")}</option>
            )}
          </select>
        </div>
        <Button
          onClick={() => setAnalystOpen(true)}
          variant="outline"
          className="gap-2"
        >
          <BrainCircuit className="h-4 w-4" />
          AI Analyst
        </Button>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm py-8 text-center">
          Loading cook data...
        </div>
      )}

      {!isLoading && !selectedCookDate && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a cook date to view the dashboard.
          </CardContent>
        </Card>
      )}

      {!isLoading && selectedCookDate && jobs.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No cook data found for {selectedCookDate}.
          </CardContent>
        </Card>
      )}

      {!isLoading && jobs.length > 0 && (
        <div className="space-y-6">
          <PipelineSummaryStrip strip={strip} />
          <MealBreakdownTable meals={derivedMeals} trailers={trailers} />
        </div>
      )}

      <AIDataAnalyst
        open={analystOpen}
        onClose={() => setAnalystOpen(false)}
        cookDate={selectedCookDate}
        rawForAI={rawForAI}
      />
    </div>
  );
}
