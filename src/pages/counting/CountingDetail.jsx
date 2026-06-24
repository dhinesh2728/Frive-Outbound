import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Layers, Plus, Minus, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import CountingHistory from "@/components/counting/CountingHistory";
import { getContainerType, getCrateValue, getContainerTypeLabels } from "@/lib/menuItemMappings";
import { useLpItemIdMap } from "@/lib/useLpItemIdMap";

function computeStatus(total, target) {
  if (total === 0) return "not_started";
  if (total < target) return "in_progress";
  if (total === target) return "complete";
  return "over_target";
}

const FALLBACK_COLORS = {
  main_bowl: "bg-blue-100 text-blue-800",
  small_bowl: "bg-violet-100 text-violet-800",
  snack_bowl: "bg-orange-100 text-orange-800",
  units: "bg-slate-100 text-slate-700",
};

export default function CountingDetail() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const cookDate = params.get("cook_date");
  const presentDate = params.get("present_date");
  const menuItemCode = params.get("menu_item_code");
  const recipeId = params.get("recipe_id");
  const targetQty = Number(params.get("target"));
  const jobIdParam = params.get("job_id");

  const lpMap = useLpItemIdMap();
  const lpItemId = lpMap[menuItemCode] || null;

  const [manualQty, setManualQty] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [showOverWarning, setShowOverWarning] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(null);

  const { data: settingsArr = [] } = useQuery({
    queryKey: ["crate-settings"],
    queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1),
  });
  const crateSettings = settingsArr[0];

  // Derive container type automatically from mapping
  const containerType = getContainerType(menuItemCode, crateSettings?.menu_item_mappings || null);
  const containerTypeDefs = crateSettings?.container_type_definitions || null;
  const containerTypeLabels = getContainerTypeLabels(containerTypeDefs);
  const containerColor = containerTypeDefs?.find(d => d.value === containerType)?.color || FALLBACK_COLORS[containerType] || "bg-slate-100 text-slate-700";

  const isUnits = containerType === "units";
  const crateValue = getCrateValue(containerType, crateSettings);
  const stackValue = crateValue ? crateValue * 8 : 0;

  const { data: jobData, refetch: refetchJob } = useQuery({
    queryKey: ["job", jobIdParam, cookDate, menuItemCode, recipeId],
    queryFn: async () => {
      const existing = await base44.entities.MealCountJob.filter(
        { cook_date: cookDate, menu_item_code: menuItemCode, recipe_id: recipeId },
        "-created_date",
        1
      );
      return existing[0] || null;
    },
  });

  const { data: entries = [], refetch: refetchEntries } = useQuery({
    queryKey: ["entries", jobData?.id],
    queryFn: () =>
      jobData?.id
        ? base44.entities.MealCountEntry.filter({ job_id: jobData.id }, "created_date", 500)
        : [],
    enabled: !!jobData?.id,
  });

  const totalQty = jobData?.total_quantity || 0;
  const remaining = targetQty - totalQty;
  const status = computeStatus(totalQty, targetQty);

  const deleteEntryMutation = useMutation({
    mutationFn: async (entry) => {
      const remaining = entries.filter((e) => e.id !== entry.id);
      const newTotal = remaining.reduce((sum, e) => sum + e.calculated_quantity, 0);
      const newStatus = computeStatus(newTotal, targetQty);
      const diff = newTotal - targetQty;
      await base44.entities.MealCountEntry.delete(entry.id);
      if (jobData?.id) {
        await base44.entities.MealCountJob.update(jobData.id, {
          total_quantity: newTotal,
          difference_from_target: diff,
          status: newStatus,
        });
      }
    },
    onSuccess: () => {
      refetchJob();
      refetchEntries();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: async ({ entryType, quantity, crateCount, stackCount, manualQuantity, notes }) => {
      const newTotal = entries.reduce((sum, e) => sum + e.calculated_quantity, 0) + quantity;
      const newStatus = computeStatus(newTotal, targetQty);
      const diff = newTotal - targetQty;

      const entryData = {
        job_id: jobData?.id || "pending",
        cook_date: cookDate,
        present_date: presentDate,
        menu_item_code: menuItemCode,
        recipe_id: recipeId,
        bowl_type: containerType,
        crate_value_used: crateValue,
        entry_type: entryType,
        crate_count: crateCount || 0,
        stack_count: stackCount || 0,
        manual_quantity: manualQuantity || 0,
        calculated_quantity: quantity,
        running_total: newTotal,
        notes: notes || "",
      };

      let jobId = jobData?.id;

      if (!jobId) {
        // Try to create the job; on unique conflict (23505) another session won the race —
        // fetch the existing job and fall through to the normal update path.
        let racedJob = null;
        try {
          const newJob = await base44.entities.MealCountJob.create({
            cook_date: cookDate,
            present_date: presentDate,
            menu_item_code: menuItemCode,
            recipe_id: recipeId,
            lp_item_id: lpItemId,
            target_quantity: targetQty,
            selected_bowl_type: containerType,
            crate_value_used: crateValue,
            total_crates: crateCount || 0,
            total_stacks: stackCount || 0,
            manual_additions: entryType === "manual_add" ? manualQuantity : 0,
            manual_subtractions: entryType === "manual_subtract" ? manualQuantity : 0,
            total_quantity: newTotal,
            difference_from_target: diff,
            status: newStatus,
            notes: "",
          });
          jobId = newJob.id;
          entryData.job_id = jobId;
          // Fresh job has correct totals from the create — no further update needed.
        } catch (createErr) {
          if (createErr?.code !== "23505") throw createErr;
          // Unique violation: job already exists from a concurrent session. Reuse it.
          const existing = await base44.entities.MealCountJob.filter(
            { cook_date: cookDate, menu_item_code: menuItemCode },
            "-created_date",
            1
          );
          if (!existing[0]) throw createErr;
          racedJob = existing[0];
          jobId = racedJob.id;
          entryData.job_id = jobId;
        }

        if (racedJob) {
          // Update the existing job exactly like the normal "else" path below,
          // but rebased against the raced job's current totals.
          const racedTotal = (racedJob.total_quantity || 0) + quantity;
          entryData.running_total = racedTotal;
          const racedUpdate = {
            selected_bowl_type: containerType,
            crate_value_used: crateValue,
            total_crates: (racedJob.total_crates || 0) + (crateCount || 0),
            total_stacks: (racedJob.total_stacks || 0) + (stackCount || 0),
            total_quantity: racedTotal,
            difference_from_target: racedTotal - targetQty,
            status: computeStatus(racedTotal, targetQty),
          };
          if (entryType === "manual_add") racedUpdate.manual_additions = (racedJob.manual_additions || 0) + manualQuantity;
          if (entryType === "manual_subtract") racedUpdate.manual_subtractions = (racedJob.manual_subtractions || 0) + manualQuantity;
          await base44.entities.MealCountJob.update(jobId, racedUpdate);
        }
      } else {
        const updateData = {
          selected_bowl_type: containerType,
          crate_value_used: crateValue,
          total_crates: (jobData.total_crates || 0) + (crateCount || 0),
          total_stacks: (jobData.total_stacks || 0) + (stackCount || 0),
          total_quantity: newTotal,
          difference_from_target: diff,
          status: newStatus,
        };
        if (entryType === "manual_add") updateData.manual_additions = entries.filter(e => e.entry_type === "manual_add").reduce((sum, e) => sum + (e.manual_quantity || 0), 0) + manualQuantity;
        if (entryType === "manual_subtract") updateData.manual_subtractions = entries.filter(e => e.entry_type === "manual_subtract").reduce((sum, e) => sum + (e.manual_quantity || 0), 0) + manualQuantity;
        await base44.entities.MealCountJob.update(jobId, updateData);
      }

      await base44.entities.MealCountEntry.create(entryData);
    },
    onSuccess: () => {
      refetchJob();
      refetchEntries();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setManualQty("");
      setManualNote("");
      setPendingEntry(null);
    },
  });

  const handleAddEntry = useCallback(
    (entryType, crateCount, stackCount, manualQuantity, notes) => {
      let quantity = 0;
      if (entryType === "crate") quantity = crateValue;
      else if (entryType === "stack") quantity = stackValue;
      else if (entryType === "manual_add") quantity = manualQuantity;
      else if (entryType === "manual_subtract") quantity = -manualQuantity;

      const newTotal = totalQty + quantity;
      if (newTotal > targetQty && entryType !== "manual_subtract") {
        setPendingEntry({ entryType, quantity, crateCount, stackCount, manualQuantity, notes });
        setShowOverWarning(true);
        return;
      }
      if (newTotal < 0) {
        toast({ title: "Cannot go below zero", description: "This subtraction would result in a negative total.", variant: "destructive" });
        return;
      }
      addEntryMutation.mutate({ entryType, quantity, crateCount, stackCount, manualQuantity, notes });
    },
    [crateValue, stackValue, totalQty, targetQty, addEntryMutation, toast]
  );

  const confirmOverTarget = () => {
    setShowOverWarning(false);
    if (pendingEntry) addEntryMutation.mutate(pendingEntry);
  };

  if (!crateSettings) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Crate Settings Not Configured</h2>
        <p className="text-muted-foreground mb-4">Please ask an admin to set crate values before counting.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />Go Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={menuItemCode} description={lpItemId || undefined}>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
      </PageHeader>

      {/* Info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <InfoCard label="Cook Date" value={cookDate} />
        <InfoCard label="Count Date" value={presentDate} />
        <InfoCard
          label="Container"
          value={
            <Badge className={`${containerColor} border-0 text-xs font-semibold`}>
              {containerTypeLabels[containerType] || containerType}
            </Badge>
          }
        />
        <InfoCard label="Per Crate" value={isUnits ? "N/A" : crateValue} />
      </div>

      {/* Target / Counted */}
      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <StatusBadge status={status} />
            {!isUnits && (
              <span className="text-sm text-muted-foreground">
                Stack = 8 crates = {stackValue} meals
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Target</p>
              <p className="text-3xl font-extrabold text-foreground">{targetQty}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Counted</p>
              <p className={`text-3xl font-extrabold ${status === "over_target" ? "text-red-600" : status === "complete" ? "text-emerald-600" : "text-foreground"}`}>
                {totalQty}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className={`text-3xl font-extrabold ${remaining < 0 ? "text-red-600" : remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {remaining}
              </p>
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden mt-4">
            <div
              className={`h-full rounded-full transition-all ${
                status === "over_target" ? "bg-red-500" : status === "complete" ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${Math.min((totalQty / targetQty) * 100, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Counting Buttons — hidden for Units */}
      {!isUnits && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <Button
            className="h-24 text-xl font-bold bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => handleAddEntry("crate", 1, 0, 0, "")}
            disabled={addEntryMutation.isPending}
          >
            <Package className="w-7 h-7 mr-3" />
            <div className="text-left">
              <div>+ Crate</div>
              <div className="text-sm font-normal opacity-80">+{crateValue} meals</div>
            </div>
          </Button>
          <Button
            className="h-24 text-xl font-bold bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => handleAddEntry("stack", 0, 1, 0, "")}
            disabled={addEntryMutation.isPending}
          >
            <Layers className="w-7 h-7 mr-3" />
            <div className="text-left">
              <div>+ Stack</div>
              <div className="text-sm font-normal opacity-80">+{stackValue} meals</div>
            </div>
          </Button>
        </div>
      )}

      {/* Manual Entry */}
      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Manual Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="number"
            min="1"
            placeholder="Quantity"
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
            className="h-12 text-lg"
          />
          <Textarea
            placeholder="Note / reason (optional)"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              disabled={!manualQty || Number(manualQty) <= 0 || addEntryMutation.isPending}
              onClick={() => handleAddEntry("manual_add", 0, 0, Number(manualQty), manualNote)}
            >
              <Plus className="w-4 h-4 mr-2" />Add {manualQty || 0}
            </Button>
            <Button
              variant="outline"
              className="h-12 border-red-300 text-red-700 hover:bg-red-50"
              disabled={!manualQty || Number(manualQty) <= 0 || addEntryMutation.isPending}
              onClick={() => handleAddEntry("manual_subtract", 0, 0, Number(manualQty), manualNote)}
            >
              <Minus className="w-4 h-4 mr-2" />Subtract {manualQty || 0}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <CountingHistory entries={entries} onDeleteEntry={(entry) => deleteEntryMutation.mutate(entry)} />

      {/* Over Target Warning */}
      <AlertDialog open={showOverWarning} onOpenChange={setShowOverWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Over Target Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This entry will push the total above the target of {targetQty}. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOverTarget} disabled={addEntryMutation.isPending}>Continue Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="font-semibold text-foreground mt-0.5 flex justify-center items-center">{value}</div>
      </CardContent>
    </Card>
  );
}
