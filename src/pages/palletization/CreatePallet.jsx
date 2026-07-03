import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as JsBarcode from "jsbarcode";
import { getPrinterSettings, applyPrintStyle } from "@/lib/printerSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Layers, AlertTriangle, CheckCircle, Undo2, Redo2, Package, Printer } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { generatePalletId, getStacksPerPallet, getRecentPalletIds } from "@/lib/palletUtils";
import { getCrateValue, getContainerType } from "@/lib/menuItemMappings";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLpItemIdMap } from "@/lib/useLpItemIdMap";
import { useActiveCookDates } from "@/lib/useActiveCookDates";
import { belongsToCook } from "@/lib/cookDateFilter";

const CRATES_PER_STACK = 8;

/**
 * Breakdown helper — returns { stacks, crates, units, totalQty, crateValue, isUnitBased }
 */
function getBreakdown(menuItemCode, totalQty, crateSettings) {
  const containerType = getContainerType(menuItemCode, crateSettings?.menu_item_mappings || null);
  const isUnitBased = containerType === "units" || !getCrateValue(containerType, crateSettings);
  const crateValue = isUnitBased ? null : getCrateValue(containerType, crateSettings);

  if (isUnitBased || !crateValue) {
    return { stacks: 0, crates: 0, units: totalQty, totalQty, crateValue: null, isUnitBased: true, containerType };
  }

  const totalCrates = Math.floor(totalQty / crateValue);
  const stacks = Math.floor(totalCrates / CRATES_PER_STACK);
  const remainingCrates = totalCrates % CRATES_PER_STACK;
  const looseUnits = totalQty % crateValue;

  return { stacks, crates: remainingCrates, units: looseUnits, totalQty, crateValue, isUnitBased: false, containerType };
}

/**
 * Calc quantity from stack/crate/unit inputs
 */
function calcQtyFromInputs(stacks, crates, units, crateValue) {
  if (!crateValue) return Number(units) || 0;
  return (Number(stacks) || 0) * CRATES_PER_STACK * crateValue
    + (Number(crates) || 0) * crateValue
    + (Number(units) || 0);
}

/**
 * Calc stack count from stacks input (for pallet capacity tracking)
 */
function calcStackCount(stacks, crates, crateValue) {
  // partial crates count as part of a stack for capacity
  const totalCrates = (Number(stacks) || 0) * CRATES_PER_STACK + (Number(crates) || 0);
  return Math.ceil(totalCrates / CRATES_PER_STACK);
}

export default function CreatePallet() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const palletIdRef = useRef(null);
  const palletsLoaded = useRef(false);
  const barcodePreviewRef = useRef(null);
  const barcodePrintRef = useRef(null);

  const { data: existingPallets = [], isFetched: palletsFetched } = useQuery({
    queryKey: ["pallets"],
    queryFn: () => base44.entities.Pallet.list("-created_date", 500),
  });

  // Generate pallet ID exactly once, after the existing pallets list has loaded,
  // so the uniqueness check runs against actual recent data.
  if (!palletsLoaded.current && palletsFetched) {
    palletsLoaded.current = true;
    palletIdRef.current = generatePalletId(getRecentPalletIds(existingPallets));
  }
  const palletId = palletIdRef.current || "";
  const [description, setDescription] = useState("");
  // items: [{menu_item_code, stack_count, quantity, is_manual, is_unit_based}]
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // New item form
  const [newCode, setNewCode] = useState("");
  const [newStacks, setNewStacks] = useState("");
  const [newCrates, setNewCrates] = useState("");
  const [newUnits, setNewUnits] = useState("");
  const [isManualCode, setIsManualCode] = useState(false);
  const [addError, setAddError] = useState("");

  // Dialogs
  const [showPartialWarning, setShowPartialWarning] = useState(false);
  const [showPickupDialog, setShowPickupDialog] = useState(false);
  const [savedPalletData, setSavedPalletData] = useState(null);

  // Print-flow state
  const [hasPrinted, setHasPrinted] = useState(false);
  const [printTime, setPrintTime] = useState(null);

  const activeCookDates = useActiveCookDates();

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs-active", ...activeCookDates],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_count_jobs")
        .select("*")
        .in("cook_date", activeCookDates)
        .order("created_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: activeCookDates.length > 0,
  });

  const { data: crateSettingsArr = [] } = useQuery({
    queryKey: ["crate-settings"],
    queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1),
  });
  const crateSettings = crateSettingsArr[0];
  const stacksPerPallet = getStacksPerPallet(crateSettings);

  // Call site 9 — jobs deduplicated by menu_item_code, belonging to active cook cycle.
  const activeJobs = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      if ((j.total_quantity || 0) <= 0) continue;
      if (!belongsToCook(j, activeCookDates)) continue;
      const k = (j.menu_item_code || "").toLowerCase();
      if (!map.has(k)) {
        map.set(k, { ...j });
      } else {
        map.get(k).total_quantity = (map.get(k).total_quantity || 0) + (j.total_quantity || 0);
      }
    }
    return Array.from(map.values());
  }, [jobs, activeCookDates]);

  // Quantity already assigned per job (from existing pallets, NOT current pallet).
  // Keyed on item.job_id — immune to cross-cook contamination from prior cooks.
  const assignedQtyByJobId = useMemo(() => {
    const map = {};
    for (const p of existingPallets) {
      for (const item of (p.items || [])) {
        if (!item.job_id) continue;
        map[item.job_id] = (map[item.job_id] || 0) + (item.quantity || 0);
      }
    }
    return map;
  }, [existingPallets]);

  const currentPalletQtyByJobId = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!item.job_id) continue;
      map[item.job_id] = (map[item.job_id] || 0) + (item.quantity || 0);
    }
    return map;
  }, [items]);

  const totalStacksOnPallet = items.reduce((s, i) => s + (i.stack_count || 0), 0);
  const remainingCapacity = stacksPerPallet - totalStacksOnPallet;

  /**
   * Get available quantity for a menu item code
   * = total counted - already in existing pallets
   * (currentPallet items are excluded from assignedQtyByJobId so they don't reduce availability)
   */
  function getAvailableQty(code) {
    const job = activeJobs.find((j) => j.menu_item_code?.toLowerCase() === (code || "").toLowerCase());
    if (!job) return 0;
    const total = job.total_quantity || 0;
    const assigned = (assignedQtyByJobId[job.id] || 0) + (currentPalletQtyByJobId[job.id] || 0);
    return Math.max(0, total - assigned);
  }

  function getJobForCode(code) {
    const k = (code || "").toLowerCase();
    return activeJobs.find((j) => j.menu_item_code?.toLowerCase() === k);
  }

  function pushHistory(newItems) {
    const next = history.slice(0, historyIdx + 1);
    next.push(newItems);
    setHistory(next);
    setHistoryIdx(next.length - 1);
    setItems(newItems);
  }

  function undo() {
    if (historyIdx <= 0) return;
    setHistoryIdx(historyIdx - 1);
    setItems(history[historyIdx - 1]);
  }

  function redo() {
    if (historyIdx >= history.length - 1) return;
    setHistoryIdx(historyIdx + 1);
    setItems(history[historyIdx + 1]);
  }

  // Breakdown for the selected code
  const selectedBreakdown = useMemo(() => {
    if (!newCode) return null;
    const availQty = getAvailableQty(newCode);
    return getBreakdown(newCode, availQty, crateSettings);
  }, [newCode, assignedQtyByJobId, crateSettings, activeJobs]);

  function handleAddItem() {
    setAddError("");
    const code = newCode.trim();
    if (!code) { setAddError("Please select or enter a menu item code."); return; }
    if (items.length >= 1) {
      setAddError("Only one menu item allowed per pallet. Remove the existing item first to change it.");
      return;
    }

    const availQty = getAvailableQty(code);
    const breakdown = getBreakdown(code, availQty, crateSettings);

    if (breakdown.isUnitBased) {
      // Unit-based item
      const qty = Number(newUnits) || 0;
      if (qty <= 0) { setAddError("Enter a valid unit quantity."); return; }
      if (qty > availQty) { setAddError(`Only ${availQty} units available for ${code}.`); return; }

      const newItems = [...items, {
        menu_item_code: code,
        stack_count: 0,
        quantity: qty,
        is_unit_based: true,
        is_manual: isManualCode,
        job_id: getJobForCode(code)?.id || null,
        lp_item_id: getJobForCode(code)?.lp_item_id || null,
      }];
      pushHistory(newItems);
    } else {
      // Stack/crate/unit based
      const stacks = Number(newStacks) || 0;
      const crates = Number(newCrates) || 0;
      const units = Number(newUnits) || 0;
      if (stacks === 0 && crates === 0 && units === 0) {
        setAddError("Enter at least one stack, crate, or unit.");
        return;
      }

      const qty = calcQtyFromInputs(stacks, crates, units, breakdown.crateValue);
      if (qty <= 0) { setAddError("Calculated quantity is 0. Check your inputs."); return; }
      if (qty > availQty) { setAddError(`Only ${availQty} units available for ${code} (you entered ${qty}).`); return; }

      const stackCount = calcStackCount(stacks, crates, breakdown.crateValue);
      if (stackCount > remainingCapacity) {
        setAddError(`Only ${remainingCapacity} stack slot(s) remain on this pallet.`);
        return;
      }

      const newItems = [...items, {
        menu_item_code: code,
        stack_count: stackCount,
        quantity: qty,
        stacks_entered: stacks,
        crates_entered: crates,
        units_entered: units,
        is_unit_based: false,
        is_manual: isManualCode,
        job_id: getJobForCode(code)?.id || null,
        lp_item_id: getJobForCode(code)?.lp_item_id || null,
      }];
      pushHistory(newItems);
    }

    setNewCode("");
    setNewStacks("");
    setNewCrates("");
    setNewUnits("");
    setIsManualCode(false);
  }

  function handleRemoveItem(idx) {
    pushHistory(items.filter((_, i) => i !== idx));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const totalStacks = items.reduce((s, i) => s + (i.stack_count || 0), 0);
      const data = {
        pallet_id: palletId,
        description,
        items,
        total_stacks: totalStacks,
        stacks_capacity: stacksPerPallet,
        status: "created",
        is_flagged: false,
        cook_dates: [...new Set(items.map(i => {
          const job = activeJobs.find(j => j.id === i.job_id);
          return job?.cook_date || activeCookDates[0] || null;
        }).filter(Boolean))],
      };
      return base44.entities.Pallet.create(data);
    },
    onSuccess: (pallet) => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setSavedPalletData(pallet);
      setShowPickupDialog(true);
    },
  });

  const handlePalletLoaded = () => {
    if (items.length === 0) {
      toast({ title: "No items", description: "Add at least one item to the pallet.", variant: "destructive" });
      return;
    }

    const wouldHaveCookDates = items.some(i => {
      const job = activeJobs.find(j => j.menu_item_code?.toLowerCase() === i.menu_item_code?.toLowerCase());
      return !!job?.cook_date;
    });
    if (!wouldHaveCookDates) {
      toast({
        title: "No active cook date for this item",
        description: "Cannot create pallet — no meal count job with a cook date was found for this item. Ensure a CSV has been imported for the active cook date.",
        variant: "destructive",
      });
      return;
    }

    if (totalStacksOnPallet < stacksPerPallet) {
      setShowPartialWarning(true);
    } else {
      saveMutation.mutate();
    }
  };

  // Reset print state when the label dialog opens
  useEffect(() => {
    if (!showPickupDialog) return;
    setHasPrinted(false);
    setPrintTime(new Date());

    // Diagnostic — log pallet item data and LP map so we can verify lp_item_id availability
    console.log("[Label] savedPalletData.items:", JSON.stringify(savedPalletData?.items, null, 2));
    const firstCode = (savedPalletData?.items || [])[0]?.menu_item_code;
    console.log("[Label] menu_item_code (first item):", firstCode);
    console.log("[Label] lpMap contents:", JSON.stringify(lpMap, null, 2));
    console.log("[Label] lpMap lookup key (lowercase):", firstCode?.toLowerCase());
    console.log("[Label] lpMap[key]:", lpMap[firstCode?.toLowerCase() || ""] ?? "(not found)");
  }, [showPickupDialog]);

  // Render barcodes after the dialog animation completes.
  // Uses setTimeout(150) so Radix's fade-in animation finishes before JsBarcode
  // measures the SVG element — rAF alone fires too early.
  useEffect(() => {
    if (!showPickupDialog || !savedPalletData) return;
    // CJS module imported as namespace: the function lives on .default
    const encode = JsBarcode.default;
    const timer = setTimeout(() => {
      console.log("[Barcode] preview ref:", barcodePreviewRef.current);
      console.log("[Barcode] print ref:", barcodePrintRef.current);
      console.log("[Barcode] pallet_id to encode:", savedPalletData.pallet_id);
      console.log("[Barcode] encode fn type:", typeof encode);
      const opts = { format: "CODE128", width: 2, height: 60, displayValue: false, margin: 4, background: "#ffffff", lineColor: "#000000" };
      try {
        if (barcodePreviewRef.current) {
          encode(barcodePreviewRef.current, savedPalletData.pallet_id, opts);
          console.log("[Barcode] preview rendered OK");
        }
        if (barcodePrintRef.current) {
          encode(barcodePrintRef.current, savedPalletData.pallet_id, opts);
          console.log("[Barcode] print rendered OK");
        }
      } catch (e) {
        console.error("[Barcode] JsBarcode render error:", e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [showPickupDialog, savedPalletData]);

  const lpMap = useLpItemIdMap();

  const labelDescription = savedPalletData
    ? (savedPalletData.description?.trim() || (savedPalletData.items || []).map((i) => i.menu_item_code).join(", "))
    : "";
  const labelQty = savedPalletData
    ? (savedPalletData.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0)
    : 0;
  const cookDate = (savedPalletData?.cook_dates || [])[0] || "";
  const code = ((savedPalletData?.items || [])[0]?.menu_item_code || "").toLowerCase();
  const labelLpId = savedPalletData
    ? (lpMap[`${cookDate}_${code}`] || lpMap[code] || null)
    : null;

  const handlePrint = () => {
    applyPrintStyle(getPrinterSettings());
    window.print();
    setHasPrinted(true);
  };

  const handlePickupChoice = async (readyForPickup) => {
    if (!savedPalletData) return;
    const status = readyForPickup ? "ready_for_pickup" : "not_ready";
    await base44.entities.Pallet.update(savedPalletData.id, {
      status,
      is_flagged: !readyForPickup,
      ready_for_pickup_at: readyForPickup ? new Date().toISOString() : undefined,
      ready_for_pickup_by: readyForPickup ? (user?.username || user?.full_name || 'unknown') : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["pallets"] });
    setShowPickupDialog(false);
    toast({
      title: "Pallet saved!",
      description: `Pallet ${palletId} marked as ${readyForPickup ? "Ready for Pickup" : "Not Ready"}.`,
    });
    navigate("/palletization");
  };

  return (
    <div>
      <PageHeader title={`Create Pallet: ${palletId}`} description="Add meal items and mark as loaded">
        <Button variant="outline" onClick={() => navigate("/palletization")}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
      </PageHeader>

      {/* Capacity bar */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Pallet Capacity</span>
            <span className={`text-sm font-bold ${totalStacksOnPallet >= stacksPerPallet ? "text-emerald-600" : "text-amber-600"}`}>
              {totalStacksOnPallet} / {stacksPerPallet} stacks
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalStacksOnPallet >= stacksPerPallet ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min((totalStacksOnPallet / stacksPerPallet) * 100, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="mb-5">
        <CardContent className="p-4 space-y-2">
          <Label>Pallet Description (optional)</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Morning batch - meat items" />
        </CardContent>
      </Card>

      {/* Items on pallet */}
      {items.length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Items on Pallet ({items.length})</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={undo} disabled={historyIdx <= 0} title="Undo">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={redo} disabled={historyIdx >= history.length - 1} title="Redo">
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg flex-wrap">
                <span className="font-semibold text-sm min-w-24">{item.menu_item_code}</span>
                {item.is_unit_based ? (
                  <span className="text-sm text-muted-foreground">
                    <Package className="w-3 h-3 inline mr-0.5" />{item.quantity} units
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    <Layers className="w-3 h-3 inline mr-0.5" />{item.stack_count} stk · {item.quantity} meals
                    {item.stacks_entered !== undefined && (
                      <span className="text-xs ml-1 text-muted-foreground/70">
                        ({item.stacks_entered}s+{item.crates_entered}c+{item.units_entered}u)
                      </span>
                    )}
                  </span>
                )}
                {item.is_manual && <Badge variant="outline" className="text-xs">Manual</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive ml-auto" onClick={() => handleRemoveItem(idx)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add item form */}
      {items.length >= 1 ? (
        <Card className="mb-5">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              This pallet contains{" "}
              <strong className="text-foreground">{items[0].menu_item_code}</strong>.{" "}
              Remove it to change the item.
            </p>
          </CardContent>
        </Card>
      ) : (remainingCapacity > 0 || selectedBreakdown?.isUnitBased) ? (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" />Add Item to Pallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code selector */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label>Menu Item Code</Label>
                <button onClick={() => { setIsManualCode(!isManualCode); setNewCode(""); }} className="text-xs text-primary underline">
                  {isManualCode ? "Use dropdown" : "Enter manually"}
                </button>
              </div>
              {isManualCode ? (
                <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. meat 1" />
              ) : (
                <Select value={newCode} onValueChange={v => { setNewCode(v); setNewStacks(""); setNewCrates(""); setNewUnits(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select menu item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeJobs.map((j) => {
                      const avail = getAvailableQty(j.menu_item_code);
                      return (
                        <SelectItem key={j.id} value={j.menu_item_code} disabled={avail <= 0}>
                          {j.menu_item_code} — {avail} available
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Availability breakdown */}
            {newCode && selectedBreakdown && (
              <div className="rounded-lg bg-muted/60 p-3 space-y-1 text-sm">
                <p className="font-medium text-foreground mb-2">Available for {newCode}:</p>
                {selectedBreakdown.isUnitBased ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="w-3.5 h-3.5" />
                    <span><strong className="text-foreground">{selectedBreakdown.totalQty}</strong> units available</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-lg font-bold text-foreground">{selectedBreakdown.stacks}</p>
                      <p className="text-xs text-muted-foreground">Full Stacks</p>
                    </div>
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-lg font-bold text-foreground">{selectedBreakdown.crates}</p>
                      <p className="text-xs text-muted-foreground">Full Crates</p>
                    </div>
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-lg font-bold text-foreground">{selectedBreakdown.units}</p>
                      <p className="text-xs text-muted-foreground">Loose Units</p>
                    </div>
                    <div className="text-center p-2 bg-primary/10 rounded-md">
                      <p className="text-lg font-bold text-primary">{selectedBreakdown.totalQty}</p>
                      <p className="text-xs text-muted-foreground">Total Units</p>
                    </div>
                  </div>
                )}
                {!selectedBreakdown.isUnitBased && selectedBreakdown.crateValue && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Config: 1 stack = {CRATES_PER_STACK} crates · 1 crate = {selectedBreakdown.crateValue} meals
                  </p>
                )}
              </div>
            )}

            {/* Quantity inputs */}
            {newCode && selectedBreakdown && (
              <div className="space-y-3">
                {selectedBreakdown.isUnitBased ? (
                  <div className="space-y-1.5">
                    <Label>Units to Load</Label>
                    <Input
                      type="number"
                      min="1"
                      max={selectedBreakdown.totalQty}
                      value={newUnits}
                      onChange={e => setNewUnits(e.target.value)}
                      placeholder={`Max: ${selectedBreakdown.totalQty}`}
                      className="w-40"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Stacks</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newStacks}
                        onChange={e => setNewStacks(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Crates</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newCrates}
                        onChange={e => setNewCrates(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Loose Units</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newUnits}
                        onChange={e => setNewUnits(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}

                {/* Live calculated preview */}
                {!selectedBreakdown.isUnitBased && selectedBreakdown.crateValue && (newStacks || newCrates || newUnits) && (
                  <div className="text-sm text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
                    Calculated: <strong className="text-foreground">
                      {calcQtyFromInputs(newStacks, newCrates, newUnits, selectedBreakdown.crateValue)} meals
                    </strong>
                    {" "}({calcStackCount(newStacks, newCrates, selectedBreakdown.crateValue)} stack slot{calcStackCount(newStacks, newCrates, selectedBreakdown.crateValue) !== 1 ? "s" : ""} used)
                  </div>
                )}
              </div>
            )}

            {addError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{addError}
              </p>
            )}

            <Button
              onClick={handleAddItem}
              disabled={!newCode}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />Add to Pallet
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {remainingCapacity <= 0 && items.length > 0 && !items.every(i => i.is_unit_based) && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium mb-4 p-3 bg-emerald-50 rounded-lg">
          <CheckCircle className="w-4 h-4" />
          Pallet is full ({stacksPerPallet}/{stacksPerPallet} stacks)
        </div>
      )}

      {activeCookDates.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 font-medium mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          No active cook date set — go to Admin &rsaquo; Set Cook Date before creating pallets.
        </div>
      )}

      <Button
        onClick={handlePalletLoaded}
        disabled={items.length === 0 || saveMutation.isPending}
        size="lg"
        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
      >
        <CheckCircle className="w-5 h-5" />
        {saveMutation.isPending ? "Saving..." : "Pallet Loaded"}
      </Button>

      {/* Partial warning */}
      <AlertDialog open={showPartialWarning} onOpenChange={setShowPartialWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Pallet Not Full
            </AlertDialogTitle>
            <AlertDialogDescription>
              This pallet has {totalStacksOnPallet}/{stacksPerPallet} stacks and has not reached full capacity. Do you still want to mark it as loaded?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowPartialWarning(false); saveMutation.mutate(); }}>
              Yes, Mark as Loaded
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Label print + pickup dialog */}
      <AlertDialog open={showPickupDialog}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Pallet Saved — Print Label</AlertDialogTitle>
          </AlertDialogHeader>

          {/* Label preview */}
          <div className="rounded-lg border bg-white p-3">
            <div className="flex justify-center">
              <div className="border rounded-md p-3 text-center" style={{ width: "175px" }}>
                {/* 1. Description */}
                <p style={{ fontSize: "20px", fontWeight: "bold", lineHeight: "1.2", marginBottom: "4px" }}>
                  {labelDescription}
                </p>
                {/* 2. LP Item ID */}
                {labelLpId && (
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "3px" }}>
                    {labelLpId}
                  </p>
                )}
                {/* 3. Qty + date */}
                <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
                  {labelQty} meals
                </p>
                {printTime && (
                  <p style={{ fontSize: "12px", color: "#555", marginBottom: "6px" }}>
                    {printTime.toLocaleString()}
                  </p>
                )}
                {/* 3. Barcode + pallet ID */}
                <svg ref={barcodePreviewRef} style={{ width: "100%", display: "block" }} />
                <p style={{ fontSize: "11px", fontFamily: "monospace", marginTop: "3px", wordBreak: "break-all", letterSpacing: "1px" }}>
                  {savedPalletData?.pallet_id}
                </p>
              </div>
            </div>
          </div>

          {/* Print action area */}
          {!hasPrinted ? (
            <Button
              type="button"
              size="lg"
              className="w-full gap-2 text-base font-semibold"
              onClick={handlePrint}
            >
              <Printer className="w-5 h-5" /> 🖨️ Print Label
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> ✅ Label Printed
              </span>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" /> Print Again
              </Button>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={!hasPrinted}
              onClick={() => handlePickupChoice(false)}
            >
              No — Not Ready
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!hasPrinted}
              onClick={() => handlePickupChoice(true)}
            >
              Yes — Ready for Pickup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden label — .print-label CSS in index.css makes this visible during window.print() */}
      {savedPalletData && (
        <div className="print-label" style={{ display: "none" }}>
          <div style={{
            width: "99mm",
            height: "99mm",
            padding: "5mm",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            background: "white",
          }}>
            {/* 1. Meal description */}
            <p style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center", lineHeight: "1.2", marginBottom: "3mm" }}>
              {labelDescription}
            </p>
            {/* 2. LP Item ID */}
            {labelLpId && (
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#444", textAlign: "center", marginBottom: "2mm" }}>
                {labelLpId}
              </p>
            )}
            {/* 3. Quantity + date */}
            <p style={{ fontSize: "14px", fontWeight: 600, textAlign: "center", marginBottom: "1mm" }}>
              {labelQty} meals
            </p>
            {printTime && (
              <p style={{ fontSize: "12px", color: "#555", textAlign: "center", marginBottom: "3mm" }}>
                {printTime.toLocaleString()}
              </p>
            )}
            {/* 3. Barcode + pallet ID */}
            <svg ref={barcodePrintRef} style={{ width: "82mm", display: "block" }} />
            <p style={{ fontSize: "11px", fontFamily: "monospace", textAlign: "center", marginTop: "2mm", letterSpacing: "1.5px", wordBreak: "break-all" }}>
              {savedPalletData.pallet_id}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
