import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  buildCookDateOptions,
  filterVisibleOptions,
  findActiveCookDateOption,
  mergeSettings,
} from "@/lib/cookDateLogic";

/**
 * Returns the array of ISO date strings for the currently active cook cycle.
 * e.g. ["2026-06-10"] or ["2026-06-09", "2026-06-10"] for a combined cycle.
 * Returns [] while data is loading or if no predictions exist.
 * All queries share the same keys as the rest of the app, so they are cache hits.
 */
export function useActiveCookDates() {
  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500),
    staleTime: 5 * 60 * 1000,
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["cook-date-override"],
    queryFn: () => base44.entities.CookDateOverride.filter({ is_active: true }, "-created_date", 1),
    staleTime: 60 * 1000,
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["cook-date-settings"],
    queryFn: () => base44.entities.CookDateSettings.list("-created_date", 1),
    staleTime: 60 * 1000,
  });

  const { data: combineRules = [] } = useQuery({
    queryKey: ["combine-rules"],
    queryFn: () => base44.entities.CookDateCombineRule.filter({ is_active: true }, "-created_date", 100),
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const settings = mergeSettings(settingsList[0] || null);
    const activeOverride = overrides[0] || null;
    const now = new Date();

    if (activeOverride) {
      return activeOverride.cook_date_param.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const cookDates = [...new Set(predictions.map((p) => p.cook_date))].sort((a, b) =>
      a.localeCompare(b)
    );
    const allOptions = buildCookDateOptions(cookDates, combineRules);
    const visibleOptions = filterVisibleOptions(allOptions, settings, now);
    const pool = visibleOptions.length > 0 ? visibleOptions : allOptions;
    const active = findActiveCookDateOption(pool, settings, now);
    return active ? active.dates : [];
  }, [predictions, overrides, settingsList, combineRules]);
}
