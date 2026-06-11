import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { filterByCook, isUnassigned } from "@/lib/cookDateFilter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCookDates } from "@/lib/useActiveCookDates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package2, CheckCircle, Play, AlertCircle } from "lucide-react";
import HowToGuide from "@/components/shared/HowToGuide";

const OUTBOUND_STEPS = [
  { title: "Check the fridge", body: "Before loading anything, go to the fridge and physically check which pallets are ready. Each pallet has a printed label with an 18-digit pallet ID on it." },
  { title: "Match the pallet ID", body: "Find the pallet in the app by matching the 18-digit ID on the physical label to the pallet shown in the Ready to Load list. Always verify the ID matches before pressing anything." },
  { title: "Move the pallet to the trailer", body: "Physically move the pallet from the fridge to the trailer first." },
  { title: "Press Load to Trailer", body: "Only after the pallet is physically inside the trailer, press Load to Trailer in the app. Never press this button before the pallet is actually in the trailer." },
  { title: "Repeat for all pallets", body: "Continue steps 1–4 for every pallet going into this trailer." },
  { title: "Verify all pallets are in", body: "Before closing, double check every pallet that should be in the trailer is physically there and marked as loaded in the app." },
  { title: "Close the trailer", body: "Once all pallets are in and doors are closed, press Close Trailer in Outbound Admin. This will automatically send the ASN report by email to the registered recipients." },
];

const OUTBOUND_WARNINGS = [
  "Closing the trailer is permanent and cannot be undone",
  "Only press Close Trailer when all pallets are physically inside and the trailer is ready to leave",
  "If a pallet ID does not match, do not load it — contact your supervisor",
];
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useCurrentUser } from "@/lib/useCurrentUser";
import OutboundPalletCard from "@/components/outbound/OutboundPalletCard";

export default function OutboundDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { admin } = useOutletContext() || {};

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedTrailerId, setSelectedTrailerId] = useState("");
  const [activeTrailerId, setActiveTrailerId] = useState(null);

  const { data: pallets = [] } = useQuery({
    queryKey: ["pallets"],
    queryFn: () => base44.entities.Pallet.list("-created_date", 500),
  });

  const { data: trailers = [] } = useQuery({
    queryKey: ["trailers"],
    queryFn: () => base44.entities.Trailer.list("-created_date", 200),
  });

  const activeCookDates = useActiveCookDates();

  // Call site 3 — trailers matching active cook cycle (filters on trailer.cook_date)
  const displayTrailers = useMemo(
    () => filterByCook(trailers, activeCookDates),
    [trailers, activeCookDates]
  );

  // Call site 4 — pallets matching active cook cycle
  const displayPallets = useMemo(
    () => filterByCook(pallets, activeCookDates),
    [pallets, activeCookDates]
  );

  // Call site 5 — pallets with no valid cook date (superadmin section)
  const unassignedPallets = useMemo(() => {
    if (!activeCookDates.length) return [];
    return pallets.filter(isUnassigned);
  }, [pallets, activeCookDates]);

  const readyTrailers = displayTrailers.filter(t => t.status === "ready_to_load");
  const activeTrailers = displayTrailers.filter(t => t.status === "loading_in_progress");
  const completedTrailers = displayTrailers.filter(t => t.status === "loaded_closed");

  const readyPallets = displayPallets.filter(p => p.status === "ready_for_pickup");
  const loadedPallets = displayPallets.filter(p => p.status === "loaded_to_trailer");

  const currentTrailer = trailers.find(t => t.id === activeTrailerId) || activeTrailers[0] || null;

  const startOutboundMutation = useMutation({
    mutationFn: async (trailerId) => {
      await base44.entities.Trailer.update(trailerId, { status: "loading_in_progress" });
      return trailers.find(t => t.id === trailerId);
    },
    onSuccess: (trailer) => {
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
      setActiveTrailerId(trailer?.id || null);
      setShowStartDialog(false);
      toast({ title: "Outbound started", description: `Trailer ${trailer?.trailer_id_label} is now loading.` });
    },
  });

  const loadToTrailerMutation = useMutation({
    mutationFn: async ({ pallet, trailerId }) => {
      await base44.entities.Pallet.update(pallet.id, {
        status: "loaded_to_trailer",
        loaded_to_trailer_at: new Date().toISOString(),
        loaded_to_trailer_by: user?.full_name || user?.email || "unknown",
        trailer_id: trailerId,
      });
      const trailer = trailers.find(t => t.id === trailerId);
      const existing = trailer?.pallet_ids || [];
      if (!existing.includes(pallet.id)) {
        await base44.entities.Trailer.update(trailerId, {
          pallet_ids: [...existing, pallet.id],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      queryClient.invalidateQueries({ queryKey: ["trailers"] });
    },
  });

  return (
    <div>
      <PageHeader title="Outbound" description="Load pallets to trailers">
        <Button onClick={() => setShowStartDialog(true)} className="gap-2">
          <Play className="w-4 h-4" />Start Outbound
        </Button>
      </PageHeader>

      <HowToGuide title="How to load pallets to a trailer — read before you start" steps={OUTBOUND_STEPS} warnings={OUTBOUND_WARNINGS} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Ready for Loading" value={readyPallets.length} icon={Package2} color="text-emerald-600" />
        <StatCard label="Loaded to Trailer" value={loadedPallets.length} icon={Truck} color="text-violet-600" />
        <StatCard label="Active Trailers" value={activeTrailers.length} icon={Truck} color="text-amber-600" />
        <StatCard label="Completed Trailers" value={completedTrailers.length} icon={CheckCircle} color="text-emerald-600" />
      </div>

      {/* Active Trailer Workflow */}
      {currentTrailer && (
        <Card className="mb-6 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              Active: Trailer {currentTrailer.trailer_id_label}
              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs ml-2">Loading In Progress</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Truck: {currentTrailer.truck_number || "—"} · Driver: {currentTrailer.driver_name || "—"}
            </p>

            {readyPallets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground mb-2">Pallets Ready to Load:</p>
                {readyPallets.map(p => (
                  <OutboundPalletCard
                    key={p.id}
                    pallet={p}
                    onLoad={() => loadToTrailerMutation.mutate({ pallet: p, trailerId: currentTrailer.id })}
                    actionDisabled={loadToTrailerMutation.isPending}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pallets ready for loading.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* No active trailer but there are ready pallets */}
      {!currentTrailer && readyPallets.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex items-center gap-3 text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {readyPallets.length} pallet{readyPallets.length !== 1 ? "s are" : " is"} ready for loading. Click "Start Outbound" to select an active trailer.
          </CardContent>
        </Card>
      )}

      {/* Loaded to Trailer Log */}
      {loadedPallets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              Loaded to Trailer ({loadedPallets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadedPallets.map(p => (
              <OutboundPalletCard key={p.id} pallet={p} readOnly trailers={trailers} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unassigned cook date — superadmin only */}
      {admin && unassignedPallets.length > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              Unassigned Cook Date ({unassignedPallets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassignedPallets.map(p => (
              <OutboundPalletCard key={p.id} pallet={p} readOnly trailers={trailers} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Start Outbound Dialog */}
      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Outbound</AlertDialogTitle>
            <AlertDialogDescription>
              Select a trailer to begin loading. Only trailers marked "Ready to Load" are shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-4">
            {readyTrailers.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                No trailers marked as "Ready to Load". Ask an admin to prepare a trailer.
              </div>
            ) : (
              <Select value={selectedTrailerId} onValueChange={setSelectedTrailerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trailer..." />
                </SelectTrigger>
                <SelectContent>
                  {readyTrailers.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.trailer_id_label}{t.truck_number ? ` · Truck: ${t.truck_number}` : ""}{t.driver_name ? ` · Driver: ${t.driver_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedTrailerId || startOutboundMutation.isPending}
              onClick={() => startOutboundMutation.mutate(selectedTrailerId)}
            >
              Start Loading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-8 h-8 ${color} shrink-0`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
