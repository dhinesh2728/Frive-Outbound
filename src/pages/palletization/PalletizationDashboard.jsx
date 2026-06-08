import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as JsBarcode from "jsbarcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Layers, Package2, CheckCircle, AlertCircle, Trash2, X, CheckCircle2, Settings2, ChevronDown, Save, Printer } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import { getStacksPerPallet } from "@/lib/palletUtils";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useToast } from "@/components/ui/use-toast";
import { getPrinterSettings, savePrinterSettings, applyPrintStyle } from "@/lib/printerSettings";

const STATUS_COLORS = {
  created: "bg-slate-100 text-slate-700",
  ready_for_pickup: "bg-emerald-100 text-emerald-700",
  not_ready: "bg-amber-100 text-amber-700",
  picked_up: "bg-blue-100 text-blue-700",
  loaded_to_trailer: "bg-violet-100 text-violet-700",
};
const STATUS_LABELS = {
  created: "Created",
  ready_for_pickup: "Ready for Pickup",
  not_ready: "Not Ready",
  picked_up: "Picked Up",
  loaded_to_trailer: "Loaded to Trailer",
};

// Filter definitions — each card maps to a filter predicate
const CARD_FILTERS = {
  all: null,
  pallets_created: (p) => true,
  pallets_loaded: (p) => p.status === "loaded_to_trailer",
  pallets_pending: (p) => p.status !== "loaded_to_trailer",
  stacks_available: (p) => true, // show all for stacks context
  stacks_assigned: (p) => (p.total_stacks || 0) > 0,
  stacks_remaining: (p) => p.status !== "loaded_to_trailer",
};

export default function PalletizationDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [readyTarget, setReadyTarget] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const { data: user } = useCurrentUser();

  // Printer settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(() => getPrinterSettings());
  const testBarcodeRef = useRef(null);
  const [testPrintReady, setTestPrintReady] = useState(false);

  // When testPrintReady, render the barcode then fire window.print()
  useEffect(() => {
    if (!testPrintReady) return;
    try {
      if (testBarcodeRef.current) {
        JsBarcode.default(testBarcodeRef.current, "000000000000000001", {
          format: "CODE128", displayValue: false, margin: 4,
          background: "#ffffff", lineColor: "#000000", width: 2, height: 60,
        });
      }
    } catch (e) {}
    window.print();
    setTestPrintReady(false);
  }, [testPrintReady]);

  const handleTestPrint = () => {
    applyPrintStyle(localSettings);
    setTestPrintReady(true);
  };

  const { data: jobs = [] } = useQuery({
    queryKey: ["all-jobs"],
    queryFn: () => base44.entities.MealCountJob.list("-created_date", 500),
  });

  const { data: pallets = [], isLoading } = useQuery({
    queryKey: ["pallets"],
    queryFn: () => base44.entities.Pallet.list("-created_date", 500),
  });

  const { data: crateSettingsArr = [] } = useQuery({
    queryKey: ["crate-settings"],
    queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1),
  });
  const crateSettings = crateSettingsArr[0];
  const stacksPerPallet = getStacksPerPallet(crateSettings);

  const totalCountedStacks = useMemo(() => jobs.reduce((sum, j) => sum + (j.total_stacks || 0), 0), [jobs]);
  const totalAssignedStacks = useMemo(() => pallets.reduce((sum, p) => sum + (p.total_stacks || 0), 0), [pallets]);
  const totalStacksRemaining = Math.max(0, totalCountedStacks - totalAssignedStacks);

  const palletTarget = stacksPerPallet > 0 ? Math.ceil(totalCountedStacks / stacksPerPallet) : 0;
  const palletsCreated = pallets.length;
  const palletsLoaded = pallets.filter(p => p.status === "loaded_to_trailer").length;
  const palletsPending = palletsCreated - palletsLoaded;

  // Apply active filter to pallet list
  const filteredPallets = useMemo(() => {
    const fn = CARD_FILTERS[activeFilter];
    if (!fn) return pallets;
    return pallets.filter(fn);
  }, [pallets, activeFilter]);

  const filterLabel = {
    all: null,
    pallets_created: "All Pallets",
    pallets_loaded: "Pallets Loaded to Trailer",
    pallets_pending: "Pallets Pending (Not Loaded)",
    stacks_available: "All Pallets (Stacks View)",
    stacks_assigned: "Pallets with Assigned Stacks",
    stacks_remaining: "Pallets Not Yet Loaded",
  }[activeFilter];

  const deleteMutation = useMutation({
    mutationFn: async (pallet) => {
      await base44.entities.Pallet.delete(pallet.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setDeleteTarget(null);
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: async (pallet) => {
      await base44.entities.Pallet.update(pallet.id, {
        status: "ready_for_pickup",
        is_flagged: false,
        ready_for_pickup_at: new Date().toISOString(),
        ready_for_pickup_by: user?.full_name || user?.email || "unknown",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setReadyTarget(null);
    },
  });

  function handleCardClick(filterKey) {
    setActiveFilter(prev => prev === filterKey ? "all" : filterKey);
  }

  return (
    <div>
      <PageHeader title="Palletization" description="Create and manage pallets for outbound shipping">
        <Link to="/palletization/create">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Pallet
          </Button>
        </Link>
      </PageHeader>

      {/* Printer Settings */}
      <div className="mb-5">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Printer Settings
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`} />
        </button>

        {settingsOpen && (
          <Card className="mt-2">
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="printer-name">Printer Name</Label>
                  <Input
                    id="printer-name"
                    value={localSettings.printerName}
                    onChange={(e) => setLocalSettings((s) => ({ ...s, printerName: e.target.value }))}
                    placeholder="e.g. TSC DA220"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="label-width">Label Width</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="label-width"
                      type="number"
                      min="10"
                      max="300"
                      value={localSettings.labelWidth}
                      onChange={(e) => setLocalSettings((s) => ({ ...s, labelWidth: e.target.value }))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">mm</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="label-height">Label Height</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="label-height"
                      type="number"
                      min="10"
                      max="300"
                      value={localSettings.labelHeight}
                      onChange={(e) => setLocalSettings((s) => ({ ...s, labelHeight: e.target.value }))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">mm</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTestPrint}>
                  <Printer className="w-3.5 h-3.5" /> Test Print
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { savePrinterSettings(localSettings); toast({ title: "Printer settings saved" }); }}
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <StatCard label="Pallet Target" value={palletTarget} icon={Package2} color="text-slate-600" />
        <StatCard
          label="Pallets Created" value={palletsCreated} icon={Package2} color="text-blue-600"
          filterKey="pallets_created" activeFilter={activeFilter} onClick={handleCardClick}
        />
        <StatCard
          label="Pallets Loaded" value={palletsLoaded} icon={CheckCircle} color="text-emerald-600"
          filterKey="pallets_loaded" activeFilter={activeFilter} onClick={handleCardClick}
        />
        <StatCard
          label="Pallets Pending" value={palletsPending} icon={AlertCircle} color="text-amber-600"
          filterKey="pallets_pending" activeFilter={activeFilter} onClick={handleCardClick}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Total Stacks Available" value={totalCountedStacks} icon={Layers} color="text-violet-600"
          filterKey="stacks_available" activeFilter={activeFilter} onClick={handleCardClick}
        />
        <StatCard
          label="Stacks Assigned" value={totalAssignedStacks} icon={Layers} color="text-blue-500"
          filterKey="stacks_assigned" activeFilter={activeFilter} onClick={handleCardClick}
        />
        <StatCard
          label="Stacks Remaining" value={totalStacksRemaining} icon={Layers} color="text-emerald-500"
          filterKey="stacks_remaining" activeFilter={activeFilter} onClick={handleCardClick}
        />
      </div>

      {/* Pallet Logs */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package2 className="w-5 h-5 text-primary" />
            {filterLabel ? `Pallet Logs — ${filterLabel}` : `Pallet Logs (${palletsCreated})`}
            {activeFilter !== "all" && (
              <span className="text-sm font-normal text-muted-foreground">({filteredPallets.length})</span>
            )}
          </h2>
          {activeFilter !== "all" && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActiveFilter("all")}>
              <X className="w-3.5 h-3.5" />Clear Filter
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredPallets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {pallets.length === 0 ? 'No pallets created yet. Click "Create Pallet" to get started.' : "No pallets match this filter."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPallets.map((pallet) => (
              <PalletLogCard
                key={pallet.id}
                pallet={pallet}
                stacksPerPallet={stacksPerPallet}
                onDelete={() => setDeleteTarget(pallet)}
                onMarkReady={() => setReadyTarget(pallet)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pallet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete pallet <strong>{deleteTarget?.pallet_id}</strong> and release its stacks back into available stock. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Ready Dialog */}
      <AlertDialog open={!!readyTarget} onOpenChange={(v) => !v && setReadyTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Mark as Ready for Pickup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pallet <strong>{readyTarget?.pallet_id}</strong> will be marked as "Ready for Pickup" and made available in the Outbound module. The Not Ready flag will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => markReadyMutation.mutate(readyTarget)}
            >
              Yes, Mark Ready
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden test print label — only visible during window.print() */}
      {testPrintReady && (
        <div className="print-label" style={{ display: "none" }}>
          <div style={{
            width: `${localSettings.labelWidth}mm`,
            height: `${localSettings.labelHeight}mm`,
            padding: "5mm",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "white",
            fontFamily: "monospace",
          }}>
            <svg ref={testBarcodeRef} style={{ width: "100%", maxWidth: "82mm" }} />
            <p style={{ fontSize: "9px", marginTop: "2mm", letterSpacing: "1.5px", textAlign: "center" }}>
              000000000000000001
            </p>
            <p style={{ fontSize: "11px", fontWeight: "bold", marginTop: "3mm", textAlign: "center" }}>
              TEST LABEL — {localSettings.labelWidth}×{localSettings.labelHeight}mm
            </p>
            <p style={{ fontSize: "10px", marginTop: "2mm", textAlign: "center", color: "#555" }}>
              Printer: {localSettings.printerName}
            </p>
            <p style={{ fontSize: "8px", marginTop: "2mm", textAlign: "center", color: "#888" }}>
              {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, filterKey, activeFilter, onClick }) {
  const isClickable = !!filterKey && !!onClick;
  const isActive = isClickable && activeFilter === filterKey;

  return (
    <Card
      className={`transition-all ${isClickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""} ${isActive ? "ring-2 ring-primary shadow-md" : ""}`}
      onClick={isClickable ? () => onClick(filterKey) : undefined}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-8 h-8 ${color} shrink-0`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        {isActive && <X className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />}
      </CardContent>
    </Card>
  );
}

function PalletLogCard({ pallet, stacksPerPallet, onDelete, onMarkReady }) {
  const isFull = (pallet.total_stacks || 0) >= stacksPerPallet;
  const canMarkReady = pallet.status === "not_ready" || (pallet.is_flagged && pallet.status !== "ready_for_pickup" && pallet.status !== "picked_up" && pallet.status !== "loaded_to_trailer");

  return (
    <Card className={pallet.is_flagged ? "border-amber-300" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-foreground">{pallet.pallet_id}</span>
              <Badge className={`${STATUS_COLORS[pallet.status] || "bg-slate-100 text-slate-700"} border-0 text-xs`}>
                {STATUS_LABELS[pallet.status] || pallet.status}
              </Badge>
              {pallet.is_flagged && (
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                  <AlertCircle className="w-3 h-3" />Not Ready
                </Badge>
              )}
              {!isFull && pallet.status !== "loaded_to_trailer" && (
                <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">Partial</Badge>
              )}
            </div>
            {pallet.description && (
              <p className="text-sm text-muted-foreground mb-1">{pallet.description}</p>
            )}
            <div className="flex flex-wrap gap-1 mb-2">
              {(pallet.items || []).map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded-md">
                  <span className="font-medium">{item.menu_item_code}</span>
                  <span className="text-muted-foreground">
                    {item.is_unit_based
                      ? `×${item.quantity} units`
                      : `×${item.stack_count}stk (${item.quantity})`}
                  </span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span><Layers className="w-3 h-3 inline mr-0.5" />{pallet.total_stacks}/{pallet.stacks_capacity || stacksPerPallet} stacks</span>
              <span>Created: {new Date(pallet.created_date).toLocaleString()}</span>
              {pallet.ready_for_pickup_at && <span>Ready: {new Date(pallet.ready_for_pickup_at).toLocaleString()}</span>}
              {pallet.picked_up_at && <span>Picked up: {new Date(pallet.picked_up_at).toLocaleString()}</span>}
              {pallet.loaded_to_trailer_at && <span>Loaded: {new Date(pallet.loaded_to_trailer_at).toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {canMarkReady && (
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs h-8"
                onClick={onMarkReady}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Mark Ready
              </Button>
            )}
            {pallet.status !== "picked_up" && pallet.status !== "loaded_to_trailer" && (
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive h-8 w-8"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
