import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Truck, Pencil, X, Check, ChevronDown, ChevronUp } from "lucide-react";
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
  const { admin } = useOutletContext() || {};
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
  });

  const { data: pallets = [] } = useQuery({
    queryKey: ["pallets"],
    queryFn: () => base44.entities.Pallet.list("-created_date", 500),
  });

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
        pallet_ids: trailerPallets.map(p => p.id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      setCloseTarget(null);
      toast({ title: "Trailer closed" });
    },
  });

  if (!admin) return <AccessDenied />;

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
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
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
          {trailers.map(trailer => {
            const trailerPallets = pallets.filter(p => p.trailer_id === trailer.id);
            const isEditing = editingId === trailer.id;
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
                              {Object.entries(STATUS_LABELS).map(([v, l]) => (
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
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(trailer.id); setEditForm(trailer); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {(trailer.status === "loading_in_progress" || trailer.status === "ready_to_load") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setCloseTarget(trailer); setCloseForm({ status: "loaded_closed", close_notes: "" }); }}>
                              Close
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
