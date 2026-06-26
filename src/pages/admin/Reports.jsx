import { useState, useMemo } from "react";
import { belongsToCook, filterByCook } from "@/lib/cookDateFilter";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, History, Filter, X, Layers, Truck, Package2, ClipboardList } from "lucide-react";
import TrailerLogsReport from "@/components/reports/TrailerLogsReport";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  buildCookDateOptions,
  filterVisibleOptions,
  findActiveCookDateOption,
  mergeSettings,
} from "@/lib/cookDateLogic";
import { getContainerType, getContainerTypeLabels } from "@/lib/menuItemMappings";

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatDateDMY(isoStr) {
  if (!isoStr) return "";
  const part = String(isoStr).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return isoStr;
  const [yyyy, mm, dd] = part.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function addDaysDMY(isoDateStr, days) {
  const part = String(isoDateStr || "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return "";
  const [y, m, d] = part.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-primary/60"><X className="w-3 h-3" /></button>
    </span>
  );
}

const PALLET_STATUS_LABELS = {
  created: "Created", ready_for_pickup: "Ready for Pickup",
  not_ready: "Not Ready", picked_up: "Picked Up", loaded_to_trailer: "Loaded to Trailer",
};

const TRAILER_STATUS_LABELS = {
  draft: "Draft", ready_to_load: "Ready to Load",
  loading_in_progress: "Loading In Progress", loaded_closed: "Loaded / Closed", disputed: "Disputed",
};

// ── Meal Counting Tab ──────────────────────────────────────────────────────────
const MC_EMPTY = { cookDate: "all", dateFrom: "", dateTo: "", mealName: "", status: "all", staffName: "" };

function MealCountingReport({ jobs, entries, predictions, crateSettings, visibleCookDates }) {
  const [filters, setFilters] = useState(MC_EMPTY);
  const [applied, setApplied] = useState(MC_EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const containerTypeLabels = getContainerTypeLabels(crateSettings?.container_type_definitions);
  const staffNames = useMemo(() => [...new Set(jobs.map(j => j.created_by).filter(Boolean))].sort(), [jobs]);
  const mealNames = useMemo(() => [...new Set(predictions.map(p => p.menu_item_code).filter(Boolean))].sort(), [predictions]);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  function applyJobFilters(list, f) {
    return list.filter(j => {
      if (!visibleCookDates.includes(j.cook_date)) return false;
      if (f.cookDate !== "all" && j.cook_date !== f.cookDate) return false;
      if (f.dateFrom && j.cook_date < f.dateFrom) return false;
      if (f.dateTo && j.cook_date > f.dateTo) return false;
      if (f.mealName && !j.menu_item_code?.toLowerCase().includes(f.mealName.toLowerCase())) return false;
      if (f.status !== "all" && j.status !== f.status) return false;
      if (f.staffName && !j.created_by?.toLowerCase().includes(f.staffName.toLowerCase())) return false;
      return true;
    });
  }

  function applyEntryFilters(list, f) {
    return list.filter(e => {
      if (!visibleCookDates.includes(e.cook_date)) return false;
      if (f.cookDate !== "all" && e.cook_date !== f.cookDate) return false;
      if (f.dateFrom && e.cook_date < f.dateFrom) return false;
      if (f.dateTo && e.cook_date > f.dateTo) return false;
      if (f.mealName && !e.menu_item_code?.toLowerCase().includes(f.mealName.toLowerCase())) return false;
      if (f.staffName && !e.created_by?.toLowerCase().includes(f.staffName.toLowerCase())) return false;
      return true;
    });
  }

  const filteredJobs = useMemo(() => applyJobFilters(jobs, applied), [jobs, applied]);
  const filteredEntries = useMemo(() => applyEntryFilters(entries, applied), [entries, applied]);
  const cookDatesForFilter = [...new Set(visibleCookDates)].sort((a, b) => b.localeCompare(a));
  const hasActive = Object.entries(applied).some(([k, v]) => v !== MC_EMPTY[k]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-foreground">Meal Counting Reports</h3>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(v => !v)} className="gap-2">
          <Filter className="w-4 h-4" />Filters {hasActive && <span className="ml-1 bg-primary-foreground text-primary text-xs rounded-full px-1.5">●</span>}
        </Button>
      </div>
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Cook Date</Label>
                <Select value={filters.cookDate} onValueChange={v => setFilter("cookDate", v)}>
                  <SelectTrigger><SelectValue placeholder="All cook dates" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cook dates</SelectItem>
                    {cookDatesForFilter.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Date From</Label><Input type="date" value={filters.dateFrom} onChange={e => setFilter("dateFrom", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date To</Label><Input type="date" value={filters.dateTo} onChange={e => setFilter("dateTo", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Meal</Label>
                <Select value={filters.mealName || "__all__"} onValueChange={v => setFilter("mealName", v === "__all__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All meals" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All meals</SelectItem>
                    {mealNames.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="over_target">Over Target</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Staff</Label>
                <Select value={filters.staffName || "__all__"} onValueChange={v => setFilter("staffName", v === "__all__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All staff</SelectItem>
                    {staffNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setFilters(MC_EMPTY); setApplied(MC_EMPTY); }} className="gap-2"><X className="w-4 h-4" />Clear</Button>
              <Button onClick={() => setApplied({ ...filters })}>Apply</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {hasActive && (
        <div className="flex flex-wrap gap-2 mb-4">
          {applied.cookDate !== "all" && <FilterChip label={`Cook: ${applied.cookDate}`} onRemove={() => { setFilters(f => ({...f, cookDate:"all"})); setApplied(f => ({...f, cookDate:"all"})); }} />}
          {applied.mealName && <FilterChip label={`Meal: ${applied.mealName}`} onRemove={() => { setFilters(f => ({...f, mealName:""})); setApplied(f => ({...f, mealName:""})); }} />}
          {applied.status !== "all" && <FilterChip label={`Status: ${applied.status}`} onRemove={() => { setFilters(f => ({...f, status:"all"})); setApplied(f => ({...f, status:"all"})); }} />}
        </div>
      )}
      <Tabs defaultValue="jobs">
        <TabsList className="mb-4">
          <TabsTrigger value="jobs"><FileText className="w-4 h-4 mr-1" />Jobs</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" />History</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Jobs ({filteredJobs.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(filteredJobs.map(j => ({ cook_date: j.cook_date, menu_item_code: j.menu_item_code, total_stacks: j.total_stacks, total_quantity: j.total_quantity, target_quantity: j.target_quantity, status: j.status, created_by: j.created_by })), "mc-jobs.csv")} disabled={!filteredJobs.length}>
                <Download className="w-4 h-4 mr-1" />Export CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {filteredJobs.length === 0 ? <p className="text-center text-muted-foreground py-8">No results</p> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Cook Date</TableHead><TableHead>Menu Item</TableHead><TableHead>Container</TableHead>
                    <TableHead className="text-right">Target</TableHead><TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Stacks</TableHead><TableHead>Status</TableHead><TableHead>Staff</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredJobs.map(j => (
                      <TableRow key={j.id}>
                        <TableCell>{j.cook_date}</TableCell>
                        <TableCell className="font-medium">{j.menu_item_code}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{containerTypeLabels[getContainerType(j.menu_item_code, crateSettings?.menu_item_mappings)] || ""}</TableCell>
                        <TableCell className="text-right">{j.target_quantity}</TableCell>
                        <TableCell className="text-right font-medium">{j.total_quantity}</TableCell>
                        <TableCell className="text-right">{j.total_stacks}</TableCell>
                        <TableCell><StatusBadge status={j.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{j.created_by}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">History ({filteredEntries.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(filteredEntries.map(e => ({ cook_date: e.cook_date, menu_item_code: e.menu_item_code, entry_type: e.entry_type, calculated_quantity: e.calculated_quantity, running_total: e.running_total, created_by: e.created_by, created_at: e.created_date })), "mc-history.csv")} disabled={!filteredEntries.length}>
                <Download className="w-4 h-4 mr-1" />Export CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {filteredEntries.length === 0 ? <p className="text-center text-muted-foreground py-8">No results</p> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Time</TableHead><TableHead>Cook Date</TableHead><TableHead>Menu Item</TableHead>
                    <TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Running Total</TableHead><TableHead>By</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredEntries.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{new Date(e.created_date).toLocaleString()}</TableCell>
                        <TableCell>{e.cook_date}</TableCell>
                        <TableCell className="font-medium">{e.menu_item_code}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize text-xs">{e.entry_type?.replace("_", " ")}</Badge></TableCell>
                        <TableCell className={`text-right font-medium ${e.entry_type === "manual_subtract" ? "text-red-600" : ""}`}>{e.entry_type === "manual_subtract" ? "-" : "+"}{Math.abs(e.calculated_quantity)}</TableCell>
                        <TableCell className="text-right">{e.running_total}</TableCell>
                        <TableCell className="text-xs">{e.created_by}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Palletization Tab ──────────────────────────────────────────────────────────
const PAL_EMPTY = { cookDate: "__active__", palletId: "", menuItem: "", dateFrom: "", dateTo: "", status: "all", createdBy: "", readyForPickup: "all" };

function PalletizationReport({ pallets, activeCookDates }) {
  const [filters, setFilters] = useState(PAL_EMPTY);
  const [applied, setApplied] = useState(PAL_EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const palletCookDates = useMemo(() => {
    const dates = new Set();
    for (const p of pallets) {
      for (const d of (p.cook_dates || [])) {
        if (d && d !== "UNASSIGNED") dates.add(d);
      }
    }
    return [...dates].sort((a, b) => b.localeCompare(a));
  }, [pallets]);

  // Call site 7 — cook-date filter via shared utility
  const filtered = useMemo(() => pallets.filter(p => {
    const f = applied;
    const effectiveDates = f.cookDate === "all" ? [] : f.cookDate === "__active__" ? activeCookDates : [f.cookDate];
    if (!belongsToCook(p, effectiveDates)) return false;
    if (f.palletId && !p.pallet_id?.toLowerCase().includes(f.palletId.toLowerCase())) return false;
    if (f.menuItem && !(p.items || []).some(i => i.menu_item_code?.toLowerCase().includes(f.menuItem.toLowerCase()))) return false;
    if (f.status !== "all" && p.status !== f.status) return false;
    if (f.readyForPickup === "yes" && p.status !== "ready_for_pickup") return false;
    if (f.readyForPickup === "no" && p.is_flagged !== true) return false;
    if (f.createdBy && !p.created_by?.toLowerCase().includes(f.createdBy.toLowerCase())) return false;
    if (f.dateFrom && p.created_date < f.dateFrom) return false;
    if (f.dateTo && p.created_date > f.dateTo + "T23:59:59") return false;
    return true;
  }), [pallets, applied, activeCookDates]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-foreground">Palletization Reports</h3>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(v => !v)} className="gap-2">
          <Filter className="w-4 h-4" />Filters
        </Button>
      </div>
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Cook Date</Label>
                <Select value={filters.cookDate} onValueChange={v => setFilter("cookDate", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__active__">Current Cook (Active)</SelectItem>
                    {palletCookDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    <SelectItem value="all">All dates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Pallet ID</Label><Input value={filters.palletId} onChange={e => setFilter("palletId", e.target.value)} placeholder="PLT-..." /></div>
              <div className="space-y-1.5"><Label>Menu Item</Label><Input value={filters.menuItem} onChange={e => setFilter("menuItem", e.target.value)} placeholder="e.g. meat 1" /></div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.entries(PALLET_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Ready for Pickup</Label>
                <Select value={filters.readyForPickup} onValueChange={v => setFilter("readyForPickup", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">Flagged (Not Ready)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Created By</Label><Input value={filters.createdBy} onChange={e => setFilter("createdBy", e.target.value)} placeholder="User name" /></div>
              <div className="space-y-1.5"><Label>Date From</Label><Input type="date" value={filters.dateFrom} onChange={e => setFilter("dateFrom", e.target.value)} /></div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setFilters(PAL_EMPTY); setApplied(PAL_EMPTY); }} className="gap-2"><X className="w-4 h-4" />Clear</Button>
              <Button onClick={() => setApplied({ ...filters })}>Apply</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Pallets ({filtered.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(filtered.map(p => ({ pallet_id: p.pallet_id, description: p.description, status: p.status, total_stacks: p.total_stacks, items: (p.items || []).map(i => `${i.menu_item_code}×${i.stack_count}stk(${i.quantity})`).join("; "), ready_for_pickup: p.status === "ready_for_pickup" ? "Yes" : "No", is_flagged: p.is_flagged ? "Yes" : "No", created_at: p.created_date, created_by: p.created_by })), "pallets.csv")} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1" />Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No results</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pallet ID</TableHead><TableHead>Items</TableHead><TableHead className="text-right">Stacks</TableHead>
                <TableHead>Status</TableHead><TableHead>Ready</TableHead><TableHead>Created</TableHead><TableHead>By</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.pallet_id}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.items || []).map((item, i) => (
                          <span key={i} className="text-xs bg-secondary px-1.5 py-0.5 rounded">{item.menu_item_code} ×{item.stack_count}stk</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{p.total_stacks}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs border-0 ${p.status === "ready_for_pickup" ? "bg-emerald-100 text-emerald-700" : p.status === "loaded_to_trailer" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                        {PALLET_STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.status === "ready_for_pickup" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Yes</Badge>
                      ) : p.is_flagged ? (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Flagged</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{new Date(p.created_date).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{p.created_by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Outbound Tab ───────────────────────────────────────────────────────────────
const OB_EMPTY = { trailerId: "", palletId: "", truckNumber: "", driverName: "", dateFrom: "", dateTo: "" };

function OutboundReport({ pallets, trailers, activeCookDates }) {
  const [filters, setFilters] = useState(OB_EMPTY);
  const [applied, setApplied] = useState(OB_EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const trailerMap = useMemo(() => Object.fromEntries(trailers.map(t => [t.id, t])), [trailers]);

  // Call site 8 — outbound pallets filtered to active cook cycle
  const outboundPallets = useMemo(
    () => filterByCook(pallets.filter(p => p.status === "loaded_to_trailer"), activeCookDates),
    [pallets, activeCookDates]
  );

  const filtered = useMemo(() => outboundPallets.filter(p => {
    const f = applied;
    const t = trailerMap[p.trailer_id];
    if (f.palletId && !p.pallet_id?.toLowerCase().includes(f.palletId.toLowerCase())) return false;
    if (f.trailerId && !t?.trailer_id_label?.toLowerCase().includes(f.trailerId.toLowerCase())) return false;
    if (f.truckNumber && !t?.truck_number?.toLowerCase().includes(f.truckNumber.toLowerCase())) return false;
    if (f.driverName && !t?.driver_name?.toLowerCase().includes(f.driverName.toLowerCase())) return false;
    if (f.dateFrom && p.loaded_to_trailer_at && p.loaded_to_trailer_at < f.dateFrom) return false;
    if (f.dateTo && p.loaded_to_trailer_at && p.loaded_to_trailer_at > f.dateTo + "T23:59:59") return false;
    return true;
  }), [outboundPallets, applied, trailerMap]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-foreground">Outbound Reports</h3>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(v => !v)} className="gap-2">
          <Filter className="w-4 h-4" />Filters
        </Button>
      </div>
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Trailer ID</Label><Input value={filters.trailerId} onChange={e => setFilter("trailerId", e.target.value)} placeholder="Trailer label..." /></div>
              <div className="space-y-1.5"><Label>Pallet ID</Label><Input value={filters.palletId} onChange={e => setFilter("palletId", e.target.value)} placeholder="PLT-..." /></div>
              <div className="space-y-1.5"><Label>Truck Number</Label><Input value={filters.truckNumber} onChange={e => setFilter("truckNumber", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Driver</Label><Input value={filters.driverName} onChange={e => setFilter("driverName", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Loaded From</Label><Input type="date" value={filters.dateFrom} onChange={e => setFilter("dateFrom", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Loaded To</Label><Input type="date" value={filters.dateTo} onChange={e => setFilter("dateTo", e.target.value)} /></div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setFilters(OB_EMPTY); setApplied(OB_EMPTY); }} className="gap-2"><X className="w-4 h-4" />Clear</Button>
              <Button onClick={() => setApplied({ ...filters })}>Apply</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Outbound Records ({filtered.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(filtered.map(p => {
            const t = trailerMap[p.trailer_id];
            return { pallet_id: p.pallet_id, trailer_id: t?.trailer_id_label || "", truck_number: t?.truck_number || "", driver: t?.driver_name || "", ready_at: p.ready_for_pickup_at || "", loaded_at: p.loaded_to_trailer_at || "", loaded_by: p.loaded_to_trailer_by || "", items: (p.items || []).map(i => `${i.menu_item_code}×${i.stack_count ?? i.quantity}`).join("; ") };
          }), "outbound.csv")} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1" />Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No results</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pallet ID</TableHead><TableHead>Trailer</TableHead><TableHead>Truck</TableHead><TableHead>Driver</TableHead>
                <TableHead>Ready At</TableHead><TableHead>Loaded At</TableHead><TableHead>Loaded By</TableHead><TableHead>Items</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const t = trailerMap[p.trailer_id];
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.pallet_id}</TableCell>
                      <TableCell>{t?.trailer_id_label || "—"}</TableCell>
                      <TableCell className="text-xs">{t?.truck_number || "—"}</TableCell>
                      <TableCell className="text-xs">{t?.driver_name || "—"}</TableCell>
                      <TableCell className="text-xs">{p.ready_for_pickup_at ? new Date(p.ready_for_pickup_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{p.loaded_to_trailer_at ? new Date(p.loaded_to_trailer_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{p.loaded_to_trailer_by || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(p.items || []).map((item, i) => (
                            <span key={i} className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                              {item.menu_item_code} {item.is_unit_based ? `×${item.quantity}u` : `×${item.stack_count}stk`}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── ASN Report Tab ─────────────────────────────────────────────────────────────

function ASNReport({ trailers, pallets, jobs }) {
  const [expandedId, setExpandedId] = useState(null);

  const closedTrailers = useMemo(
    () => [...trailers.filter(t => t.status === "loaded_closed")]
      .sort((a, b) => (b.closed_at || "").localeCompare(a.closed_at || "")),
    [trailers]
  );

  // Build LP map keyed by cook_date_code so different cooks with different LP codes never collide.
  const { data: lpJobMap = {} } = useQuery({
    queryKey: ["lp-mappings"],
    queryFn: async () => {
      const [jobsRes, predRes] = await Promise.all([
        supabase.from("meal_count_jobs").select("menu_item_code, cook_date, lp_item_id").not("lp_item_id", "is", null),
        supabase.from("imported_meal_predictions").select("menu_item_code, cook_date, lp_item_id").not("lp_item_id", "is", null),
      ]);
      const map = {};
      for (const row of (predRes.data || [])) {
        if (row.menu_item_code && row.lp_item_id) {
          const key = `${row.cook_date}_${(row.menu_item_code || "").toLowerCase().trim()}`;
          map[key] = row.lp_item_id;
        }
      }
      for (const row of (jobsRes.data || [])) {
        if (row.menu_item_code && row.lp_item_id) {
          const key = `${row.cook_date}_${(row.menu_item_code || "").toLowerCase().trim()}`;
          map[key] = row.lp_item_id;
        }
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const cookDateMap = useMemo(() => {
    const map = {};
    for (const j of jobs) {
      const k = (j.menu_item_code || "").toLowerCase().trim();
      if (!map[k] || j.cook_date > map[k]) map[k] = j.cook_date;
    }
    return map;
  }, [jobs]);

  const palletsByTrailer = useMemo(() => {
    const map = {};
    for (const p of pallets) {
      if (!map[p.trailer_id]) map[p.trailer_id] = [];
      map[p.trailer_id].push(p);
    }
    return map;
  }, [pallets]);

  function buildRows(trailerId) {
    return (palletsByTrailer[trailerId] || []).flatMap(pallet => {
      const items = pallet.items || [];
      if (!items.length) return [];
      const item = items[0];
      const code = (item.menu_item_code || "").toLowerCase().trim();
      const cookDate = (pallet.cook_dates || [])[0] || cookDateMap[code] || "";

      const sku = item.lp_item_id || lpJobMap[`${cookDate}_${code}`] || lpJobMap[code] || item.menu_item_code || "";

      const prodIso = (pallet.created_date || "").substring(0, 10);
      const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      return [{
        CONTRACT: "F063",
        SUPPLIER: "F063",
        SKU: sku,
        "QTY (UNITS)": totalQty,
        DELIVERYDATE: formatDateDMY(cookDate),
        REFERENCE: "FriveASN",
        PalletIdentifier: pallet.pallet_id,
        Expirydate: prodIso ? addDaysDMY(prodIso, 7) : "",
        BatchId: "",
        ProductionDate: formatDateDMY(prodIso),
      }];
    });
  }

  function handleGenerate(trailer) {
    const rows = buildRows(trailer.id);
    if (!rows.length) return;
    const firstPallet = (palletsByTrailer[trailer.id] || [])[0];
    const cookDateRaw =
      (firstPallet?.cook_dates || [])[0] ||
      cookDateMap[(firstPallet?.items || [])[0]?.menu_item_code?.toLowerCase() || ""] ||
      trailer.closed_at?.substring(0, 10) ||
      "unknown";
    const trailerId = (trailer.trailer_id_label || "").replace(/\s+/g, "_");
    exportCSV(rows, `ASN_Frive_${cookDateRaw}_${trailerId}.csv`);
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">ASN Report</h3>
        <p className="text-sm text-muted-foreground mt-1">Generate ASN CSV files for closed trailers</p>
      </div>
      {closedTrailers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No closed trailers. Close a trailer in Outbound Admin to generate an ASN.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {closedTrailers.map(trailer => {
            const trailerPallets = palletsByTrailer[trailer.id] || [];
            const isExpanded = expandedId === trailer.id;
            const rows = buildRows(trailer.id);
            const previewRows = rows.slice(0, 3);
            return (
              <Card key={trailer.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{trailer.trailer_id_label}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                        <span><Layers className="w-3 h-3 inline mr-0.5" />{trailerPallets.length} pallet{trailerPallets.length !== 1 ? "s" : ""}</span>
                        {trailer.closed_at && <span>Closed {new Date(trailer.closed_at).toLocaleDateString()}</span>}
                        {trailer.truck_number && <span>Truck: {trailer.truck_number}</span>}
                        {trailer.driver_name && <span>Driver: {trailer.driver_name}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {rows.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setExpandedId(isExpanded ? null : trailer.id)}>
                          <FileText className="w-4 h-4 mr-1" />{isExpanded ? "Hide" : "Preview"}
                        </Button>
                      )}
                      <Button size="sm" onClick={() => handleGenerate(trailer)} disabled={rows.length === 0}>
                        <Download className="w-4 h-4 mr-1" />Generate ASN
                      </Button>
                    </div>
                  </div>
                  {isExpanded && previewRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <p className="text-xs text-muted-foreground mb-2">
                        Preview — first {previewRows.length} of {rows.length} row{rows.length !== 1 ? "s" : ""}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Delivery Date</TableHead>
                            <TableHead>Pallet ID</TableHead>
                            <TableHead>Production Date</TableHead>
                            <TableHead>Expiry Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{row.SKU}</TableCell>
                              <TableCell className="text-right">{row["QTY (UNITS)"]}</TableCell>
                              <TableCell className="text-xs">{row.DELIVERYDATE}</TableCell>
                              <TableCell className="font-mono text-xs">{row.PalletIdentifier}</TableCell>
                              <TableCell className="text-xs">{row.ProductionDate}</TableCell>
                              <TableCell className="text-xs">{row.Expirydate}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Reports Page ──────────────────────────────────────────────────────────
export default function Reports() {
  const { admin, hasPermission } = useOutletContext() || {};

  const { data: predictions = [] } = useQuery({ queryKey: ["predictions"], queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500) });
  const { data: jobs = [] } = useQuery({ queryKey: ["all-jobs"], queryFn: () => base44.entities.MealCountJob.list("-created_date", 500) });
  const { data: entries = [] } = useQuery({ queryKey: ["all-entries"], queryFn: () => base44.entities.MealCountEntry.list("-created_date", 1000) });
  const { data: pallets = [] } = useQuery({ queryKey: ["pallets"], queryFn: () => base44.entities.Pallet.list("-created_date", 500) });
  const { data: trailers = [] } = useQuery({ queryKey: ["trailers"], queryFn: () => base44.entities.Trailer.list("-created_date", 200) });
  const { data: settingsList = [] } = useQuery({ queryKey: ["cook-date-settings"], queryFn: () => base44.entities.CookDateSettings.list("-created_date", 1) });
  const { data: combineRules = [] } = useQuery({ queryKey: ["combine-rules"], queryFn: () => base44.entities.CookDateCombineRule.filter({ is_active: true }, "-created_date", 100) });
  const { data: crateSettingsArr = [] } = useQuery({ queryKey: ["crate-settings"], queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1) });
  const { data: overrides = [] } = useQuery({ queryKey: ["cook-date-override"], queryFn: () => base44.entities.CookDateOverride.filter({ is_active: true }, "-created_date", 1) });

  const crateSettings = crateSettingsArr[0];
  const settings = mergeSettings(settingsList[0] || null);
  const allCookDates = [...new Set(predictions.map(p => p.cook_date))].sort((a, b) => a.localeCompare(b));
  const allOptions = buildCookDateOptions(allCookDates, combineRules);
  const visibleOptions = filterVisibleOptions(allOptions, settings, new Date());
  const visibleCookDates = visibleOptions.flatMap(o => o.dates);

  const activeCookDates = useMemo(() => {
    const activeOverride = overrides[0] || null;
    if (activeOverride) {
      return activeOverride.cook_date_param.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const pool = visibleOptions.length > 0 ? visibleOptions : allOptions;
    const active = findActiveCookDateOption(pool, settings, new Date());
    return active ? active.dates : [];
  }, [overrides, visibleOptions, allOptions, settings]);

  if (!admin && !hasPermission?.('reports')) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Reports" description="View and export data across all modules" />
      <Tabs defaultValue="meal-counting">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="meal-counting" className="gap-1.5"><FileText className="w-4 h-4" />Meal Counting</TabsTrigger>
          <TabsTrigger value="palletization" className="gap-1.5"><Package2 className="w-4 h-4" />Palletization</TabsTrigger>
          <TabsTrigger value="outbound" className="gap-1.5"><Truck className="w-4 h-4" />Outbound</TabsTrigger>
          <TabsTrigger value="trailer-logs" className="gap-1.5"><ClipboardList className="w-4 h-4" />Trailer Logs</TabsTrigger>
          <TabsTrigger value="asn-report" className="gap-1.5"><Download className="w-4 h-4" />ASN Report</TabsTrigger>
        </TabsList>
        <TabsContent value="meal-counting">
          <MealCountingReport jobs={jobs} entries={entries} predictions={predictions} crateSettings={crateSettings} visibleCookDates={visibleCookDates} />
        </TabsContent>
        <TabsContent value="palletization">
          <PalletizationReport pallets={pallets} activeCookDates={activeCookDates} />
        </TabsContent>
        <TabsContent value="outbound">
          <OutboundReport
            pallets={pallets}
            trailers={trailers}
            activeCookDates={activeCookDates}
          />
        </TabsContent>
        <TabsContent value="trailer-logs">
          <TrailerLogsReport trailers={trailers} pallets={pallets} />
        </TabsContent>
        <TabsContent value="asn-report">
          <ASNReport trailers={trailers} pallets={pallets} jobs={jobs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
