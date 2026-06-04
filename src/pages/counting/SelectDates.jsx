import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import {
  buildCookDateOptions,
  filterVisibleOptions,
  findActiveCookDateOption,
  mergeSettings,
  todayStr,
} from "@/lib/cookDateLogic";

export default function SelectDates() {
  const navigate = useNavigate();
  const today = todayStr();
  const now = new Date();

  const { data: predictions = [], isLoading: loadingPred } = useQuery({
    queryKey: ["predictions"],
    queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500),
  });

  const { data: overrides = [], isLoading: loadingOverride } = useQuery({
    queryKey: ["cook-date-override"],
    queryFn: () => base44.entities.CookDateOverride.filter({ is_active: true }, "-created_date", 1),
  });

  const { data: settingsList = [], isLoading: loadingSettings } = useQuery({
    queryKey: ["cook-date-settings"],
    queryFn: () => base44.entities.CookDateSettings.list("-created_date", 1),
  });

  const { data: combineRules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["combine-rules"],
    queryFn: () => base44.entities.CookDateCombineRule.filter({ is_active: true }, "-created_date", 100),
  });

  const isLoading = loadingPred || loadingOverride || loadingSettings || loadingRules;
  const settings = mergeSettings(settingsList[0] || null);
  const activeOverride = overrides[0] || null;

  const cookDates = [...new Set(predictions.map((p) => p.cook_date))].sort((a, b) => a.localeCompare(b));
  const allOptions = buildCookDateOptions(cookDates, combineRules);
  const visibleOptions = filterVisibleOptions(allOptions, settings, now);

  useEffect(() => {
    if (isLoading) return;
    if (visibleOptions.length === 0 && allOptions.length === 0) return;

    let cookDateParam;

    if (activeOverride) {
      // Manual override always wins
      cookDateParam = activeOverride.cook_date_param;
    } else {
      // Use cutoff-aware auto selection
      const pool = visibleOptions.length > 0 ? visibleOptions : allOptions;
      const active = findActiveCookDateOption(pool, settings, now);
      if (!active) return;
      cookDateParam = active.dates.join(",");
    }

    navigate(
      `/counting/jobs?cook_date=${encodeURIComponent(cookDateParam)}&present_date=${today}`,
      { replace: true }
    );
  }, [isLoading, allOptions.length, activeOverride?.cook_date_param]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (allOptions.length === 0) {
    return (
      <div className="max-w-lg mx-auto">
        <PageHeader title="Meal Counting" description="Select dates to start counting" />
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No cook dates available</p>
            <p className="text-sm text-muted-foreground mt-1">Ask admin to import meal predictions first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // While navigating
  return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );
}
