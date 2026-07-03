import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sendAsnEmail } from "@/lib/sendAsnEmail";
import { useActiveCookDates } from "@/lib/useActiveCookDates";
import { filterByCook } from "@/lib/cookDateFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Truck, Pencil, X, Check, ChevronDown, ChevronUp, Download } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useCurrentUser } from "@/lib/useCurrentUser";

const CLOSED_STATUSES = ["loaded_closed", "disputed"];

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

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  ready_to_load: "bg-emerald-100 text-emerald-700",
  loading_in_progress: "bg-blue-100 text-blue-700",
  loaded_closed: "bg-violet-100 text-violet-700",
  disputed: "bg-red-100 text-red-700",
};
const STATUS_LABELS = {
  draft: "Draft",
  ready_to_load: "Ready to Load",
  loading_in_progress: "Loading In Progress",
  loaded_closed: "Loaded / Closed",
  disputed: "Disputed",
};

const EMPTY_FORM = {
  trailer_reference: "",
  trailer_id_label: "",
  truck_number: "",
  driver_name: "",
  driver_contact: "",
  notes: "",
  status: "draft",
};

export default function OutboundAdmin() {
  const { admin, hasPermission } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeForm, setCloseForm] = useState({ status: "loaded_closed", close_notes: "" });
  const [expandedId, setExpandedId] = useState(null);

  const { data: trailers = [], isLoading } = useQuery({
    queryKey: ["trailers"],
    queryFn: () => base44.entities.Trailer.list("-created_date", 200),
    refetchInterval: 30_000,
  });

  const { data: pallets = [] } = useQuery({
    queryKey: ["pallets"],
    queryFn: () => base44.entities.Pallet.list("-created_date", 500),
    refetchInterval: 30_000,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["all-jobs"],
    queryFn: () => base44.entities.MealCountJob.list("-created_date", 500),
  });

  const { data: emailRecipients = [] } = useQuery({
    queryKey: ["email-recipients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_recipients")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

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

  const activeCookDates = useActiveCookDates();

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

  // Call site 6 — trailers matching active cook cycle (filters on trailer.cook_date)
  const displayTrailers = useMemo(
    () => filterByCook(trailers, activeCookDates),
    [trailers, activeCookDates]
  );

  function buildAsnRowsForTrailer(trailerId) {
    return (palletsByTrailer[trailerId] || []).flatMap((pallet) => {
      const items = pallet.items || [];
      if (!items.length) return [];
      const item = items[0];
      const code = (item.menu_item_code || "").toLowerCase().trim();
      const cookDate = (pallet.cook_dates || [])[0] || cookDateMap[code] || "";

      const sku = item.lp_item_id || lpJobMap[`${cookDate}_${code}`] || lpJobMap[code] || item.menu_item_code || "";

      const prodIso = (pallet.created_date || "").substring(0, 10);
      const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      return [{
        CONTRACT: "F063", SUPPLIER: "F063", SKU: sku, "QTY (UNITS)": totalQty,
        DELIVERYDATE: formatDateDMY(cookDate), REFERENCE: "FriveASN",
        PalletIdentifier: pallet.pallet_id,
        Expirydate: prodIso ? addDaysDMY(prodIso, 7) : "",
        BatchId: "", ProductionDate: formatDateDMY(prodIso),
      }];
    });
  }

  function handleGenerateAsn(trailer) {
    const rows = buildAsnRowsForTrailer(trailer.id);
    if (!rows.length) {
      toast({ title: "No pallet data", description: "No pallets found for this trailer.", variant: "destructive" });
      return;
    }
    const firstPallet = (palletsByTrailer[trailer.id] || [])[0];
    const cookDateRaw =
      (firstPallet?.cook_dates || [])[0] ||
      cookDateMap[((firstPallet?.items || [])[0]?.menu_item_code || "").toLowerCase()] ||
      trailer.closed_at?.substring(0, 10) ||
      "unknown";
    const trailerId = (trailer.trailer_id_label || "").replace(/\s+/g, "_");
    exportCSV(rows, `ASN_Frive_${cookDateRaw}_${trailerId}.csv`);
  }

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Trailer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      setForm(EMPTY_FORM);
      setShowAdd(false);
      toast({ title: "Trailer created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Trailer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      setEditingId(null);
      toast({ title: "Trailer updated" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async ({ id, status, close_notes }) => {
      const trailerPallets = pallets.filter(p => p.trailer_id === id);
      await base44.entities.Trailer.update(id, {
        status,
        close_notes,
        closed_at: new Date().toISOString(),
        closed_by: user?.full_name || user?.email || "admin",
        final_pallet_count: trailerPallets.length,
      });
      // Return the trailer so onSuccess doesn't depend on closeTarget state —
      // the dialog's onOpenChange nulls closeTarget before onSuccess fires.
      return trailers.find(t => t.id === id) ?? { id };
    },
    onSuccess: (trailer) => {
      queryClient.invalidateQueries({ queryKey: ["trailers"] });

      const apiKeyPreview = import.meta.env.VITE_RESEND_API_KEY
        ? import.meta.env.VITE_RESEND_API_KEY.slice(0, 5) + "…"
        : "MISSING";
      console.log("[ASN] Trailer close triggered", {
        trailerId: trailer?.id,
        trailerLabel: trailer?.trailer_id_label,
        apiKeyPreview,
        recipientCount: emailRecipients.length,
        palletCount: pallets.filter((p) => p.trailer_id === trailer?.id).length,
      });

      if (emailRecipients.length > 0 && trailer?.id) {
        const trailerPallets = pallets.filter((p) => p.trailer_id === trailer.id);
        sendAsnEmail({
          trailer,
          pallets: trailerPallets,
          jobs,
          recipients: emailRecipients,
        })
          .then((count) => {
            console.log("[ASN] Email sent successfully, recipient count:", count);
            toast({ title: `ASN email sent to ${count} recipient${count !== 1 ? "s" : ""}` });
          })
          .catch((err) => {
            console.error("[ASN] sendAsnEmail threw:", err);
            toast({ title: "ASN email failed", description: err.message, variant: "destructive" });
          });
      } else {
        console.warn("[ASN] Email skipped — recipients:", emailRecipients.length, "trailerId:", trailer?.id);
      }

      setCloseTarget(null);
      toast({ title: "Trailer closed" });
    },
  });

  if (!admin && !hasPermission?.('outbound_admin')) return <AccessDenied />;

  const f = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));
  const ef = (key) => (val) => setEditForm(prev => ({ ...prev, [key]: val }));

  return (
    <div>
      <PageHeader title="Outbound Admin" description="Manage trailers and outbound configurations">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" />New Trailer
        </Button>
      </PageHeader>

      {/* Add Trailer Form */}
      {showAdd && (
        <Card className="mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Trailer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Trailer Reference">
                <Input value={form.trailer_reference} onChange={e => f("trailer_reference")(e.target.value)} placeholder="e.g. TRL-001" />
              </Field>
              <Field label="Trailer ID *">
                <Input value={form.trailer_id_label} onChange={e => f("trailer_id_label")(e.target.value)} placeholder="e.g. Trailer A" />
              </Field>
              <Field label="Truck Number">
                <Input value={form.truck_number} onChange={e => f("truck_number")(e.target.value)} placeholder="e.g. TRK-1234" />
              </Field>
              <Field label="Driver Name">
                <Input value={form.driver_name} onChange={e => f("driver_name")(e.target.value)} placeholder="Driver full name" />
              </Field>
              <Field label="Driver Contact">
                <Input value={form.driver_contact} onChange={e => f("driver_contact")(e.target.value)} placeholder="Phone number" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={f("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={e => f("notes")(e.target.value)} rows={2} placeholder="Any additional notes..." />
            </Field>
            {activeCookDates.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                No active cook date — set one in Admin › Set Cook Date before creating a trailer.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Cook date: <strong>{activeCookDates[0]}</strong></p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!activeCookDates.length) {
                    toast({ title: "No active cook date", description: "Set a cook date before creating a trailer.", variant: "destructive" });
                    return;
                  }
                  createMutation.mutate({ ...form, cook_date: activeCookDates[0] });
                }}
                disabled={!form.trailer_id_label || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Trailer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trailer List */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : trailers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No trailers yet. Create one to get started.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayTrailers.map(trailer => {
            const trailerPallets = pallets.filter(p => p.trailer_id === trailer.id);
            const isClosed = CLOSED_STATUSES.includes(trailer.status);
            const isEditing = editingId === trailer.id && !isClosed;
            const isExpanded = expandedId === trailer.id;
            return (
              <Card key={trailer.id}>
                <CardContent className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Field label="Trailer Reference">
                          <Input value={editForm.trailer_reference || ""} onChange={e => ef("trailer_reference")(e.target.value)} />
                        </Field>
                        <Field label="Trailer ID">
                          <Input value={editForm.trailer_id_label || ""} onChange={e => ef("trailer_id_label")(e.target.value)} />
                        </Field>
                        <Field label="Truck Number">
                          <Input value={editForm.truck_number || ""} onChange={e => ef("truck_number")(e.target.value)} />
                        </Field>
                        <Field label="Driver Name">
                          <Input value={editForm.driver_name || ""} onChange={e => ef("driver_name")(e.target.value)} />
                        </Field>
                        <Field label="Driver Contact">
                          <Input value={editForm.driver_contact || ""} onChange={e => ef("driver_contact")(e.target.value)} />
                        </Field>
                        <Field label="Status">
                          <Select value={editForm.status || "draft"} onValueChange={ef("status")}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS)
                                .filter(([v]) => !CLOSED_STATUSES.includes(v))
                                .map(([v, l]) => (
                                  <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <Field label="Notes">
                        <Textarea value={editForm.notes || ""} onChange={e => ef("notes")(e.target.value)} rows={2} />
                      </Field>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                        <Button size="sm" onClick={() => updateMutation.mutate({ id: trailer.id, data: editForm })}>
                          <Check className="w-4 h-4 mr-1" />Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-foreground">{trailer.trailer_id_label}</span>
                            {trailer.trailer_reference && <span className="text-xs text-muted-foreground">#{trailer.trailer_reference}</span>}
                            <Badge className={`${STATUS_COLORS[trailer.status] || ""} border-0 text-xs`}>
                              {STATUS_LABELS[trailer.status] || trailer.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {trailer.cook_date && <span className="font-medium text-foreground">Cook: {trailer.cook_date}</span>}
                            {trailer.truck_number && <span>Truck: {trailer.truck_number}</span>}
                            {trailer.driver_name && <span>Driver: {trailer.driver_name}</span>}
                            {trailer.driver_contact && <span>Contact: {trailer.driver_contact}</span>}
                            <span>Pallets: {trailerPallets.length}</span>
                            <span>Created: {new Date(trailer.created_date).toLocaleString()}</span>
                          </div>
                          {trailer.notes && <p className="text-xs text-muted-foreground mt-1">{trailer.notes}</p>}
                          {trailer.closed_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Closed: {new Date(trailer.closed_at).toLocaleString()} by {trailer.closed_by}
                              {trailer.close_notes && ` — ${trailer.close_notes}`}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!isClosed && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(trailer.id); setEditForm(trailer); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!isClosed && (trailer.status === "loading_in_progress" || trailer.status === "ready_to_load") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setCloseTarget(trailer); setCloseForm({ status: "loaded_closed", close_notes: "" }); }}>
                              Close
                            </Button>
                          )}
                          {trailer.status === "loaded_closed" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleGenerateAsn(trailer)}>
                              <Download className="w-3.5 h-3.5 mr-1" />ASN
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpandedId(isExpanded ? null : trailer.id)}>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </div>
                      {isExpanded && trailerPallets.length > 0 && (
                        <div className="mt-3 pt-3 border-t space-y-1.5">
                          <p className="text-xs font-medium text-foreground">Pallets loaded ({trailerPallets.length}):</p>
                          {trailerPallets.map(p => (
                            <div key={p.id} className="text-xs bg-secondary/50 rounded px-2 py-1 flex flex-wrap gap-2">
                              <span className="font-medium">{p.pallet_id}</span>
                              <span className="text-muted-foreground">{(p.items || []).map(i => `${i.menu_item_code} ×${i.stack_count}stk`).join(", ")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Close Trailer Dialog */}
      <AlertDialog open={!!closeTarget} onOpenChange={v => !v && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Trailer</AlertDialogTitle>
            <AlertDialogDescription>
              Close trailer <strong>{closeTarget?.trailer_id_label}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-4 space-y-3">
            <Field label="Close Status">
              <Select value={closeForm.status} onValueChange={v => setCloseForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loaded_closed">Loaded / Closed</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes / Dispute Reason">
              <Textarea
                value={closeForm.close_notes}
                onChange={e => setCloseForm(f => ({ ...f, close_notes: e.target.value }))}
                rows={2}
                placeholder="Optional notes..."
              />
            </Field>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMutation.mutate({ id: closeTarget.id, ...closeForm })}>
              Close Trailer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
