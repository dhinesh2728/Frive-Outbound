import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, RotateCcw, Unlock, Link2, Scissors, Plus, X } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  buildCookDateOptions,
  filterVisibleOptions,
  mergeSettings,
  getDayName,
  getCutoffDeadline,
  isOptionExpired,
} from "@/lib/cookDateLogic";

export default function SetCookDate() {
  const { admin, hasPermission } = useOutletContext() || {};
  const queryClient = useQueryClient();
  const now = new Date();

  // Combine mode state
  const [combineMode, setCombineMode] = useState(false);
  const [selectedForCombine, setSelectedForCombine] = useState([]);
  const [confirmCombine, setConfirmCombine] = useState(null); // dates array
  const [confirmSplit, setConfirmSplit] = useState(null); // rule object

  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500),
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["cook-date-override"],
    queryFn: () => base44.entities.CookDateOverride.filter({ is_active: true }, "-created_date", 1),
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["cook-date-settings"],
    queryFn: () => base44.entities.CookDateSettings.list("-created_date", 1),
  });

  const { data: combineRules = [] } = useQuery({
    queryKey: ["combine-rules"],
    queryFn: () => base44.entities.CookDateCombineRule.filter({ is_active: true }, "-created_date", 100),
  });

  const settings = mergeSettings(settingsList[0] || null);
  const activeOverride = overrides[0] || null;

  const cookDates = useMemo(
    () => [...new Set(predictions.map((p) => p.cook_date))].sort((a, b) => a.localeCompare(b)),
    [predictions]
  );

  const allOptions = useMemo(() => buildCookDateOptions(cookDates, combineRules), [cookDates.join(","), combineRules]);
  const visibleOptions = useMemo(() => filterVisibleOptions(allOptions, settings, now), [allOptions, settings]);

  // Flat list of individual dates still available (not already in a manual combine rule)
  const combinedDatesSet = useMemo(() => {
    const s = new Set();
    combineRules.filter((r) => r.is_active).forEach((r) => r.dates.forEach((d) => s.add(d)));
    return s;
  }, [combineRules]);

  const availableForCombine = useMemo(
    () => cookDates.filter((d) => !combinedDatesSet.has(d)),
    [cookDates, combinedDatesSet]
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const setOverrideMutation = useMutation({
    mutationFn: async (cookDateParam) => {
      for (const o of overrides) await base44.entities.CookDateOverride.delete(o.id);
      await base44.entities.CookDateOverride.create({ cook_date_param: cookDateParam, is_active: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cook-date-override"] }),
  });

  const revertMutation = useMutation({
    mutationFn: async () => {
      for (const o of overrides) await base44.entities.CookDateOverride.delete(o.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cook-date-override"] }),
  });

  const combineMutation = useMutation({
    mutationFn: async (dates) => {
      // Store original target quantities per date for later restore on split
      const originalTargets = {};
      for (const d of dates) {
        const preds = predictions.filter((p) => p.cook_date === d);
        const total = preds.reduce((sum, p) => sum + (p.target_quantity || 0), 0);
        originalTargets[d] = total;
      }
      await base44.entities.CookDateCombineRule.create({
        dates,
        is_active: true,
        original_targets: originalTargets,
        label: dates.join(" & "),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combine-rules"] });
      queryClient.invalidateQueries({ queryKey: ["cook-date-override"] });
      setCombineMode(false);
      setSelectedForCombine([]);
      setConfirmCombine(null);
    },
  });

  const splitMutation = useMutation({
    mutationFn: async (rule) => {
      await base44.entities.CookDateCombineRule.delete(rule.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combine-rules"] });
      queryClient.invalidateQueries({ queryKey: ["cook-date-override"] });
      setConfirmSplit(null);
    },
  });

  if (!admin && !hasPermission?.('set_cook_date')) return <AccessDenied />;

  const handleSet = (param) => setOverrideMutation.mutate(param);

  const toggleSelectForCombine = (date) => {
    setSelectedForCombine((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const handleCombineConfirm = () => {
    if (selectedForCombine.length < 2) return;
    setConfirmCombine([...selectedForCombine].sort());
  };

  return (
    <div>
      <PageHeader
        title="Set Cook Date"
        description="Override the automatically selected cook date for all staff"
      />

      {/* Current status */}
      <Card className="mb-6">
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {activeOverride ? "Override active" : "Auto mode (no override)"}
              </p>
              {activeOverride ? (
                <p className="text-sm text-muted-foreground">
                  Locked to: <span className="font-semibold text-foreground">{activeOverride.cook_date_param}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Staff are automatically directed to the active cook date based on cutoff deadlines
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeOverride && (
              <Button
                variant="outline"
                onClick={() => revertMutation.mutate()}
                disabled={revertMutation.isPending}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {revertMutation.isPending ? "Reverting..." : "Revert to Auto"}
              </Button>
            )}
            <Button
              variant={combineMode ? "default" : "outline"}
              onClick={() => {
                setCombineMode((v) => !v);
                setSelectedForCombine([]);
              }}
            >
              <Link2 className="w-4 h-4 mr-2" />
              {combineMode ? "Cancel Combine" : "Combine Dates"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Combine mode banner */}
      {combineMode && (
        <Card className="mb-5 border-primary/40 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-primary mb-2">
              Combine Mode — select 2 or more individual dates to merge them into one cook cycle
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {availableForCombine.length === 0 && (
                <p className="text-sm text-muted-foreground">No individual dates available to combine.</p>
              )}
              {availableForCombine.map((d) => {
                const selected = selectedForCombine.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleSelectForCombine(d)}
                    className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {getDayName(d)} {d}
                    {selected && <X className="inline w-3 h-3 ml-1.5" />}
                  </button>
                );
              })}
            </div>
            {selectedForCombine.length >= 2 && (
              <Button size="sm" onClick={handleCombineConfirm} className="gap-2">
                <Plus className="w-4 h-4" />
                Combine {selectedForCombine.length} dates into one cycle
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active combine rules */}
      {combineRules.filter((r) => r.is_active).length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              Active Combine Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {combineRules.filter((r) => r.is_active).map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{rule.dates.join(" & ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {rule.dates.length} dates combined into one cycle
                      {rule.original_targets && (
                        <span className="ml-2">
                          (original targets: {rule.dates.map((d) => `${d}: ${rule.original_targets[d] ?? "?"}`).join(", ")})
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmSplit(rule)}
                    className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Split
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Cook Dates</CardTitle>
          <p className="text-sm text-muted-foreground">
            Showing cook dates within the last {settings.visibility_days_before_today} days. Select a date or combined group to lock all staff to it.
          </p>
        </CardHeader>
        <CardContent>
          {visibleOptions.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No recent cook dates available</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleOptions.map((opt) => {
                const param = opt.dates.join(",");
                const isActive = activeOverride?.cook_date_param === param;
                const expired = isOptionExpired(opt, settings, now);
                const cutoff = getCutoffDeadline(opt, settings);
                const isManualCombine = !!opt.manualRule;

                return (
                  <div key={param} className="space-y-2">
                    {/* Main option card */}
                    <button
                      onClick={() => handleSet(param)}
                      disabled={setOverrideMutation.isPending}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {opt.combined && (
                            <Link2 className={`w-3.5 h-3.5 ${isManualCombine ? "text-amber-500" : "text-primary"}`} />
                          )}
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {opt.combined
                              ? isManualCombine
                                ? `Combined (${opt.dates.length} dates)`
                                : "Sun + Mon"
                              : getDayName(opt.dates[0])}
                          </span>
                          {isManualCombine && (
                            <Badge variant="outline" className="text-xs py-0 px-1.5 text-amber-700 border-amber-300">
                              manual
                            </Badge>
                          )}
                          {expired && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">expired</span>
                          )}
                        </div>
                        {isActive && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                      <p className="font-medium text-foreground">
                        {opt.combined ? opt.dates.join(" & ") : opt.dates[0]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cutoff: {cutoff.toLocaleDateString()}{" "}
                        {cutoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>

                    {/* Split individual dates — shown for auto-combined (Sun+Mon) only */}
                    {opt.combined && !isManualCombine && (
                      <div className="grid grid-cols-2 gap-2">
                        {opt.dates.map((d) => {
                          const splitActive = activeOverride?.cook_date_param === d;
                          return (
                            <button
                              key={d}
                              onClick={() => handleSet(d)}
                              disabled={setOverrideMutation.isPending}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                splitActive
                                  ? "border-primary bg-primary/5"
                                  : "border-dashed border-border hover:border-primary/40 hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                <Unlock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{getDayName(d)}</span>
                                {splitActive && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
                              </div>
                              <p className="text-sm font-medium text-foreground">{d}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* For manual combine, show split option inline */}
                    {opt.combined && isManualCombine && (
                      <div className="flex gap-2 flex-wrap">
                        {opt.dates.map((d) => {
                          const splitActive = activeOverride?.cook_date_param === d;
                          return (
                            <button
                              key={d}
                              onClick={() => handleSet(d)}
                              disabled={setOverrideMutation.isPending}
                              className={`text-left p-2 rounded-lg border-2 transition-all flex-1 min-w-0 ${
                                splitActive
                                  ? "border-primary bg-primary/5"
                                  : "border-dashed border-border hover:border-primary/40 hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                <Unlock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{getDayName(d)}</span>
                                {splitActive && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
                              </div>
                              <p className="text-xs font-medium text-foreground truncate">{d}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Combine Dialog */}
      <AlertDialog open={!!confirmCombine} onOpenChange={(open) => !open && setConfirmCombine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Combine Cook Dates?</AlertDialogTitle>
            <AlertDialogDescription>
              This will combine <strong>{confirmCombine?.join(", ")}</strong> into a single cook cycle.
              Targets will be summed and all counting, reports, and filters will treat these as one cycle.
              You can split them again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmCombine(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => combineMutation.mutate(confirmCombine)}
              disabled={combineMutation.isPending}
            >
              {combineMutation.isPending ? "Combining..." : "Combine Dates"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Split Dialog */}
      <AlertDialog open={!!confirmSplit} onOpenChange={(open) => !open && setConfirmSplit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Split Combined Dates?</AlertDialogTitle>
            <AlertDialogDescription>
              This will split <strong>{confirmSplit?.dates?.join(", ")}</strong> back into individual cook dates.
              {confirmSplit?.original_targets
                ? " Each date will restore its original target volume."
                : " Targets will revert to each date's individual predictions."}
              {" "}All counting, reports, and filters will update immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmSplit(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => splitMutation.mutate(confirmSplit)}
              disabled={splitMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {splitMutation.isPending ? "Splitting..." : "Split Dates"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
