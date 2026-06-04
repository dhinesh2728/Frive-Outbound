import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, RotateCcw, BookmarkCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";
import {
  DEFAULT_MENU_ITEM_MAPPINGS,
  DEFAULT_CONTAINER_TYPES,
} from "@/lib/menuItemMappings";
import ContainerTypeManager from "@/components/crateSettings/ContainerTypeManager";
import MappingTable from "@/components/crateSettings/MappingTable";
import CrateValuesCard from "@/components/crateSettings/CrateValuesCard";
import PalletizationConfig from "@/components/crateSettings/PalletizationConfig";

// Build initial crateValues map from a settings record
function buildCrateValues(settings, containerTypes) {
  const vals = {};
  containerTypes.forEach((ct) => {
    if (ct.value === "units") return;
    if (ct.value === "main_bowl") vals[ct.value] = String(settings?.main_bowl_crate_value ?? "");
    else if (ct.value === "small_bowl") vals[ct.value] = String(settings?.small_bowl_crate_value ?? "");
    else if (ct.value === "snack_bowl") vals[ct.value] = String(settings?.snack_bowl_crate_value ?? "");
    else vals[ct.value] = String(settings?.extra_crate_values?.[ct.value] ?? "");
  });
  return vals;
}

export default function CrateSettings() {
  const { admin } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local working state
  const [containerTypes, setContainerTypes] = useState(DEFAULT_CONTAINER_TYPES);
  const [mappings, setMappings] = useState(DEFAULT_MENU_ITEM_MAPPINGS);
  const [crateValues, setCrateValues] = useState({});
  const [stacksPerPallet, setStacksPerPallet] = useState("5");
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [saveDefaultConfirm, setSaveDefaultConfirm] = useState(false);

  const { data: settingsArr = [], isLoading } = useQuery({
    queryKey: ["crate-settings"],
    queryFn: () => base44.entities.CrateSettings.list("-updated_date", 1),
  });
  const settings = settingsArr[0];

  // Hydrate from DB on load
  useEffect(() => {
    if (settings) {
      const dbTypes = settings.container_type_definitions?.length
        ? settings.container_type_definitions
        : DEFAULT_CONTAINER_TYPES;
      const dbMappings = settings.menu_item_mappings && Object.keys(settings.menu_item_mappings).length
        ? settings.menu_item_mappings
        : DEFAULT_MENU_ITEM_MAPPINGS;
      setContainerTypes(dbTypes);
      setMappings(dbMappings);
      setCrateValues(buildCrateValues(settings, dbTypes));
      setStacksPerPallet(String(settings.stacks_per_pallet ?? 5));
    } else {
      // No DB record yet — use factory defaults
      setContainerTypes(DEFAULT_CONTAINER_TYPES);
      setMappings(DEFAULT_MENU_ITEM_MAPPINGS);
      setCrateValues(buildCrateValues(null, DEFAULT_CONTAINER_TYPES));
      setStacksPerPallet("5");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings) return base44.entities.CrateSettings.update(settings.id, data);
      return base44.entities.CrateSettings.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crate-settings"] });
      toast({ title: "Saved", description: "Crate settings updated successfully." });
    },
  });

  if (!admin) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Build save payload from current local state
  const buildPayload = (snapshot = null) => {
    const main = Number(crateValues["main_bowl"]) || null;
    const small = Number(crateValues["small_bowl"]) || null;
    const snack = Number(crateValues["snack_bowl"]) || null;
    const extra = {};
    containerTypes.forEach((ct) => {
      if (!["main_bowl", "small_bowl", "snack_bowl", "units"].includes(ct.value)) {
        const v = Number(crateValues[ct.value]);
        if (v > 0) extra[ct.value] = v;
      }
    });
    return {
      main_bowl_crate_value: main,
      small_bowl_crate_value: small,
      snack_bowl_crate_value: snack,
      extra_crate_values: Object.keys(extra).length ? extra : null,
      menu_item_mappings: mappings,
      container_type_definitions: containerTypes,
      stacks_per_pallet: Number(stacksPerPallet) || 5,
      ...(snapshot ? { saved_default_snapshot: snapshot } : {}),
    };
  };

  const handleSave = () => {
    const main = Number(crateValues["main_bowl"]);
    const small = Number(crateValues["small_bowl"]);
    if (!main || main <= 0 || !small || small <= 0) {
      toast({ title: "Validation Error", description: "Main Bowl and Small Bowl must have a valid crate value.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(buildPayload(settings?.saved_default_snapshot || null));
  };

  const handleSaveAsDefault = () => {
    setSaveDefaultConfirm(false);
    const snapshot = {
      menu_item_mappings: mappings,
      container_type_definitions: containerTypes,
      main_bowl_crate_value: Number(crateValues["main_bowl"]) || null,
      small_bowl_crate_value: Number(crateValues["small_bowl"]) || null,
      snack_bowl_crate_value: Number(crateValues["snack_bowl"]) || null,
      extra_crate_values: {},
    };
    containerTypes.forEach((ct) => {
      if (!["main_bowl", "small_bowl", "snack_bowl", "units"].includes(ct.value)) {
        const v = Number(crateValues[ct.value]);
        if (v > 0) snapshot.extra_crate_values[ct.value] = v;
      }
    });
    saveMutation.mutate({ ...buildPayload(snapshot), saved_default_snapshot: snapshot });
    toast({ title: "Saved as Default", description: "Current settings are now the admin default." });
  };

  const handleRevert = () => {
    setRevertConfirm(false);
    const snapshot = settings?.saved_default_snapshot;
    if (snapshot) {
      // Revert to admin-saved default
      const types = snapshot.container_type_definitions?.length ? snapshot.container_type_definitions : DEFAULT_CONTAINER_TYPES;
      setContainerTypes(types);
      setMappings(snapshot.menu_item_mappings || DEFAULT_MENU_ITEM_MAPPINGS);
      setCrateValues(buildCrateValues(snapshot, types));
      saveMutation.mutate(buildPayload(snapshot));
      toast({ title: "Reverted", description: "Settings restored to the saved admin default." });
    } else {
      // Revert to factory defaults
      setContainerTypes(DEFAULT_CONTAINER_TYPES);
      setMappings(DEFAULT_MENU_ITEM_MAPPINGS);
      setCrateValues(buildCrateValues(null, DEFAULT_CONTAINER_TYPES));
      saveMutation.mutate({
        main_bowl_crate_value: null,
        small_bowl_crate_value: null,
        snack_bowl_crate_value: null,
        extra_crate_values: null,
        menu_item_mappings: DEFAULT_MENU_ITEM_MAPPINGS,
        container_type_definitions: DEFAULT_CONTAINER_TYPES,
        saved_default_snapshot: null,
      });
      toast({ title: "Reverted", description: "Settings restored to factory defaults." });
    }
  };

  const handleContainerTypesUpdate = (newTypes, newMappings) => {
    setContainerTypes(newTypes);
    if (newMappings !== undefined) setMappings(newMappings);
    // Sync crateValues — add slots for new types, remove for deleted
    setCrateValues((prev) => {
      const next = {};
      newTypes.forEach((ct) => {
        if (ct.value === "units") return;
        next[ct.value] = prev[ct.value] ?? "";
      });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crate Settings"
        description="Manage container types, crate values, and menu item mappings"
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setRevertConfirm(true)}
            disabled={saveMutation.isPending}
          >
            <RotateCcw className="w-4 h-4" />
            Revert to Default
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSaveDefaultConfirm(true)}
            disabled={saveMutation.isPending}
          >
            <BookmarkCheck className="w-4 h-4" />
            Save as Default
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </PageHeader>

      {settings && (
        <p className="text-xs text-muted-foreground -mt-4">
          Last saved: {new Date(settings.updated_date).toLocaleString()}
          {settings.saved_default_snapshot ? " · Admin default snapshot exists" : " · No admin default saved yet — Revert will use factory defaults"}
        </p>
      )}

      {/* Crate Values */}
      <CrateValuesCard
        containerTypes={containerTypes}
        crateValues={crateValues}
        onChange={(typeValue, val) => setCrateValues((prev) => ({ ...prev, [typeValue]: val }))}
      />

      {/* Palletization Config */}
      <PalletizationConfig
        stacksPerPallet={stacksPerPallet}
        onChange={setStacksPerPallet}
      />

      {/* Two-column layout for types + mapping */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <ContainerTypeManager
          containerTypes={containerTypes}
          mappings={mappings}
          onUpdate={handleContainerTypesUpdate}
        />
        <MappingTable
          mappings={mappings}
          containerTypes={containerTypes}
          onUpdate={setMappings}
        />
      </div>

      {/* Revert Confirm */}
      <AlertDialog open={revertConfirm} onOpenChange={setRevertConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              {settings?.saved_default_snapshot
                ? "This will restore the settings to the last admin-saved default. All current unsaved changes will be lost."
                : "No admin default has been saved. This will restore the original factory defaults for all container types and mappings."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevert}>Revert</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as Default Confirm */}
      <AlertDialog open={saveDefaultConfirm} onOpenChange={setSaveDefaultConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as Default?</AlertDialogTitle>
            <AlertDialogDescription>
              The current settings (container types, crate values, and all mappings) will be saved as the new admin default. Future "Revert to Default" will restore this snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAsDefault}>Save as Default</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
