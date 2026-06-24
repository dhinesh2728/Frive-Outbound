import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import HowToGuide from "@/components/shared/HowToGuide";
import JobCard from "@/components/counting/JobCard";

const MEAL_COUNTING_STEPS = [
  "Select a job from the list below",
  "Click + Crate or + Stack to count meals as they are packed",
  "Use Manual Entry to add or subtract specific quantities",
  "Once all meals are counted, the job will show as Complete",
  "All jobs must be complete before moving to Palletisation",
];

export default function JobList() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const cookDateParam = params.get("cook_date") || "";
  const presentDate = params.get("present_date");
  const cookDates = cookDateParam.split(",").filter(Boolean); // may be 1 or 2 dates
  const isCombined = cookDates.length > 1;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: crateSettingsArr = [] } = useQuery({
    queryKey: ["crate-settings"],
    queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1),
  });
  const crateSettingsMappings = crateSettingsArr[0]?.menu_item_mappings || null;
  const containerTypeDefs = crateSettingsArr[0]?.container_type_definitions || null;

  // Fetch predictions for ALL cook dates in the selection
  const { data: predictions = [], isLoading: loadingPred } = useQuery({
    queryKey: ["predictions", cookDateParam],
    queryFn: async () => {
      const results = await Promise.all(
        cookDates.map((d) => base44.entities.ImportedMealPrediction.filter({ cook_date: d }, "-menu_item_code", 500))
      );
      return results.flat();
    },
    enabled: cookDates.length > 0,
  });

  // Fetch jobs for ALL cook dates
  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ["jobs", cookDateParam],
    queryFn: async () => {
      const results = await Promise.all(
        cookDates.map((d) => base44.entities.MealCountJob.filter({ cook_date: d }, "-created_date", 500))
      );
      return results.flat();
    },
    enabled: cookDates.length > 0,
  });

  // When combined, merge predictions by menu_item_code+recipe_id, summing target_quantity
  const mergedPredictions = useMemo(() => {
    if (!isCombined) return predictions;
    const map = {};
    predictions.forEach((p) => {
      const key = `${p.menu_item_code}_${p.recipe_id}`;
      if (map[key]) {
        map[key] = { ...map[key], target_quantity: map[key].target_quantity + p.target_quantity };
      } else {
        map[key] = { ...p };
      }
    });
    return Object.values(map);
  }, [predictions, isCombined]);

  const jobMap = useMemo(() => {
    const map = {};
    jobs.forEach((j) => { map[`${(j.menu_item_code || '').toLowerCase()}_${j.recipe_id}`] = j; });
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    return mergedPredictions.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || (p.menu_item_code || "").toLowerCase().includes(q) || (p.recipe_id || "").toLowerCase().includes(q);
      const job = jobMap[`${(p.menu_item_code || '').toLowerCase()}_${p.recipe_id}`];
      const status = job?.status || "not_started";
      const matchStatus = statusFilter === "all" || status === statusFilter ||
        (statusFilter === "complete" && status === "over_target");
      return matchSearch && matchStatus;
    });
  }, [mergedPredictions, search, statusFilter, jobMap]);

  const isLoading = loadingPred || loadingJobs;

  const handleJobClick = (pred) => {
    const job = jobMap[`${(pred.menu_item_code || '').toLowerCase()}_${pred.recipe_id}`];
    const jobParam = job ? `&job_id=${job.id}` : "";
    // Use the first cook date for the detail page (job is stored against primary date)
    const primaryCookDate = cookDates[0];
    navigate(
      `/counting/detail?cook_date=${encodeURIComponent(primaryCookDate)}&present_date=${presentDate}&menu_item_code=${encodeURIComponent(pred.menu_item_code)}&recipe_id=${encodeURIComponent(pred.recipe_id)}&target=${pred.target_quantity}${jobParam}`
    );
  };

  const headerTitle = isCombined
    ? `Jobs — ${cookDates[0]} & ${cookDates[1]}`
    : `Jobs — ${cookDateParam}`;

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title={headerTitle} description={`Counting date: ${presentDate}`}>
        <Button variant="outline" onClick={() => navigate("/counting")}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
      </PageHeader>

      <HowToGuide steps={MEAL_COUNTING_STEPS} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search menu item or recipe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-11">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="complete">Complete (incl. Over Target)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No jobs match your criteria</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <JobCard
              key={`${p.menu_item_code}_${p.recipe_id}`}
              prediction={p}
              job={jobMap[`${(p.menu_item_code || '').toLowerCase()}_${p.recipe_id}`]}
              onClick={() => handleJobClick(p)}
              crateSettingsMappings={crateSettingsMappings}
              containerTypeDefs={containerTypeDefs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
