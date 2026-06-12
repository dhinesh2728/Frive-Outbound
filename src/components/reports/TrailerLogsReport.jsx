import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Filter, X, ChevronDown, ChevronUp } from "lucide-react";

const TRAILER_STATUS_LABELS = {
  draft: "Draft",
  ready_to_load: "Ready to Load",
  loading_in_progress: "Loading In Progress",
  loaded_closed: "Loaded / Closed",
  disputed: "Disputed",
};

const TRAILER_STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  ready_to_load: "bg-emerald-100 text-emerald-700",
  loading_in_progress: "bg-blue-100 text-blue-700",
  loaded_closed: "bg-violet-100 text-violet-700",
  disputed: "bg-red-100 text-red-700",
};

const TL_EMPTY = {
  trailerId: "", truckNumber: "", driverName: "", status: "all",
  palletId: "", menuItem: "", dateFrom: "", dateTo: "",
};

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-primary/60"><X className="w-3 h-3" /></button>
    </span>
  );
}

export default function TrailerLogsReport({ trailers, pallets }) {
  const [filters, setFilters] = useState(TL_EMPTY);
  const [applied, setApplied] = useState(TL_EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  // Enrich trailers with computed fields, using pallets.trailer_id as sole source of truth
  const enriched = useMemo(() => trailers.map(t => {
    const loadedPallets = pallets.filter(p => p.trailer_id === t.id);
    const allItems = loadedPallets.flatMap(p => p.items || []);
    const menuItemCodes = [...new Set(allItems.map(i => i.menu_item_code).filter(Boolean))];
    const mealBreakdown = {};
    for (const item of allItems) {
      const k = item.menu_item_code || "unknown";
      mealBreakdown[k] = (mealBreakdown[k] || 0) + (item.quantity || 0);
    }
    const totalMeals = Object.values(mealBreakdown).reduce((s, v) => s + v, 0);
    return { ...t, loadedPallets, menuItemCodes, mealBreakdown, totalMeals };
  }), [trailers, pallets]);

  const filtered = useMemo(() => enriched.filter(t => {
    const f = applied;
    if (f.trailerId && !t.trailer_id_label?.toLowerCase().includes(f.trailerId.toLowerCase())) return false;
    if (f.truckNumber && !t.truck_number?.toLowerCase().includes(f.truckNumber.toLowerCase())) return false;
    if (f.driverName && !t.driver_name?.toLowerCase().includes(f.driverName.toLowerCase())) return false;
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.palletId) {
      const hasMatch = t.loadedPallets.some(p => p.pallet_id?.toLowerCase().includes(f.palletId.toLowerCase()));
      if (!hasMatch) return false;
    }
    if (f.menuItem) {
      const hasMatch = t.menuItemCodes.some(c => c.toLowerCase().includes(f.menuItem.toLowerCase()));
      if (!hasMatch) return false;
    }
    if (f.dateFrom && t.created_date < f.dateFrom) return false;
    if (f.dateTo && t.created_date > f.dateTo + "T23:59:59") return false;
    return true;
  }), [enriched, applied, palletMap]);

  const hasActive = Object.entries(applied).some(([k, v]) => v !== TL_EMPTY[k]);

  function buildExportRows() {
    return filtered.flatMap(t => {
      if (t.loadedPallets.length === 0) {
        return [{
          trailer_id: t.trailer_id_label, truck_number: t.truck_number || "",
          driver_name: t.driver_name || "", driver_contact: t.driver_contact || "",
          status: TRAILER_STATUS_LABELS[t.status] || t.status,
          total_pallets: t.loadedPallets.length, pallet_id: "",
          menu_item_codes: t.menuItemCodes.join("; "),
          total_meals: t.totalMeals, meal_breakdown: JSON.stringify(t.mealBreakdown),
          close_notes: t.close_notes || "", closed_by: t.closed_by || "",
          closed_at: t.closed_at || "", notes: t.notes || "",
        }];
      }
      return t.loadedPallets.map(p => ({
        trailer_id: t.trailer_id_label, truck_number: t.truck_number || "",
        driver_name: t.driver_name || "", driver_contact: t.driver_contact || "",
        status: TRAILER_STATUS_LABELS[t.status] || t.status,
        total_pallets: t.loadedPallets.length, pallet_id: p.pallet_id,
        menu_item_codes: (p.items || []).map(i => i.menu_item_code).join("; "),
        pallet_quantity: (p.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
        total_meals: t.totalMeals, meal_breakdown: JSON.stringify(t.mealBreakdown),
        close_notes: t.close_notes || "", closed_by: t.closed_by || "",
        closed_at: t.closed_at || "", notes: t.notes || "",
      }));
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-foreground">Trailer Logs</h3>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(v => !v)} className="gap-2">
          <Filter className="w-4 h-4" />Filters {hasActive && <span className="ml-1 bg-primary-foreground text-primary text-xs rounded-full px-1.5">●</span>}
        </Button>
      </div>

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Trailer ID</Label><Input value={filters.trailerId} onChange={e => setFilter("trailerId", e.target.value)} placeholder="Trailer label..." /></div>
              <div className="space-y-1.5"><Label>Truck Number</Label><Input value={filters.truckNumber} onChange={e => setFilter("truckNumber", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Driver Name</Label><Input value={filters.driverName} onChange={e => setFilter("driverName", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.entries(TRAILER_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Pallet ID</Label><Input value={filters.palletId} onChange={e => setFilter("palletId", e.target.value)} placeholder="PLT-..." /></div>
              <div className="space-y-1.5"><Label>Menu Item Code</Label><Input value={filters.menuItem} onChange={e => setFilter("menuItem", e.target.value)} placeholder="e.g. meat 1" /></div>
              <div className="space-y-1.5"><Label>Date From</Label><Input type="date" value={filters.dateFrom} onChange={e => setFilter("dateFrom", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date To</Label><Input type="date" value={filters.dateTo} onChange={e => setFilter("dateTo", e.target.value)} /></div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setFilters(TL_EMPTY); setApplied(TL_EMPTY); }} className="gap-2"><X className="w-4 h-4" />Clear</Button>
              <Button onClick={() => setApplied({ ...filters })}>Apply</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hasActive && (
        <div className="flex flex-wrap gap-2 mb-4">
          {applied.trailerId && <FilterChip label={`Trailer: ${applied.trailerId}`} onRemove={() => { setFilters(f => ({ ...f, trailerId: "" })); setApplied(f => ({ ...f, trailerId: "" })); }} />}
          {applied.status !== "all" && <FilterChip label={`Status: ${TRAILER_STATUS_LABELS[applied.status]}`} onRemove={() => { setFilters(f => ({ ...f, status: "all" })); setApplied(f => ({ ...f, status: "all" })); }} />}
          {applied.menuItem && <FilterChip label={`Meal: ${applied.menuItem}`} onRemove={() => { setFilters(f => ({ ...f, menuItem: "" })); setApplied(f => ({ ...f, menuItem: "" })); }} />}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Trailers ({filtered.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(buildExportRows(), "trailer-logs.csv")} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1" />Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No results</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(t => (
                <TrailerRow
                  key={t.id}
                  trailer={t}
                  expanded={expandedId === t.id}
                  onToggle={() => setExpandedId(prev => prev === t.id ? null : t.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TrailerRow({ trailer: t, expanded, onToggle }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-foreground">{t.trailer_id_label}</span>
            <Badge className={`${TRAILER_STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"} border-0 text-xs`}>
              {TRAILER_STATUS_LABELS[t.status] || t.status}
            </Badge>
            {t.loadedPallets.length > 0 && (
              <span className="text-xs text-muted-foreground">{t.loadedPallets.length} pallet{t.loadedPallets.length !== 1 ? "s" : ""} loaded</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {t.truck_number && <span>Truck: {t.truck_number}</span>}
            {t.driver_name && <span>Driver: {t.driver_name}</span>}
            {t.driver_contact && <span>Contact: {t.driver_contact}</span>}
            {t.closed_at && <span>Closed: {new Date(t.closed_at).toLocaleString()}</span>}
            {t.closed_by && <span>By: {t.closed_by}</span>}
          </div>
          {t.totalMeals > 0 && (
            <div className="mt-1 text-xs">
              <span className="text-muted-foreground">Total meals: </span>
              <span className="font-semibold text-foreground">{t.totalMeals.toLocaleString()}</span>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {/* Meal breakdown */}
          {Object.keys(t.mealBreakdown).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Meal Breakdown</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(t.mealBreakdown).map(([meal, qty]) => (
                  <span key={meal} className="text-xs bg-background border rounded-md px-2 py-1">
                    <span className="font-medium">{meal}</span>: {qty.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Loaded pallets */}
          {t.loadedPallets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Loaded Pallets ({t.loadedPallets.length})</p>
              <div className="space-y-2">
                {t.loadedPallets.map(p => (
                  <div key={p.id} className="p-3 bg-background rounded-md border text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{p.pallet_id}</span>
                      {p.loaded_to_trailer_at && (
                        <span className="text-muted-foreground">Loaded: {new Date(p.loaded_to_trailer_at).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(p.items || []).map((item, i) => (
                        <span key={i} className="bg-secondary px-1.5 py-0.5 rounded">
                          {item.menu_item_code} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {(t.close_notes || t.notes) && (
            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
              {t.close_notes && <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-1">{t.close_notes}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
