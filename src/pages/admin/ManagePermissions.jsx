import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { PERMISSION_SECTIONS, DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { ShieldCheck, Plus, Pencil, Trash2, Users } from "lucide-react";

const WORKING_SECTIONS = PERMISSION_SECTIONS.filter((s) => s.group === "working");
const ADMIN_SECTIONS   = PERMISSION_SECTIONS.filter((s) => s.group === "admin");

function PermissionEditor({ perms, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Working Section
        </p>
        <div className="space-y-3">
          {WORKING_SECTIONS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`perm-${key}`} className="text-sm font-normal cursor-pointer">
                {label}
              </Label>
              <Switch
                id={`perm-${key}`}
                checked={!!perms[key]}
                onCheckedChange={(val) => onChange({ ...perms, [key]: val })}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Admin Center
        </p>
        <div className="space-y-3">
          {ADMIN_SECTIONS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`perm-${key}`} className="text-sm font-normal cursor-pointer">
                {label}
              </Label>
              <Switch
                id={`perm-${key}`}
                checked={!!perms[key]}
                onCheckedChange={(val) => onChange({ ...perms, [key]: val })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ManagePermissions() {
  const { admin } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editGroup, setEditGroup] = useState(null);  // null = create mode, object = edit mode
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState(null);

  const [groupName, setGroupName] = useState("");
  const [groupPerms, setGroupPerms] = useState({ ...DEFAULT_PERMISSIONS });

  if (!admin) return null;

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["permission-groups-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["app-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_app_users");
      if (error) throw error;
      return data || [];
    },
  });

  // Count users per group
  const usersPerGroup = users.reduce((acc, u) => {
    if (u.permission_group_id) {
      acc[u.permission_group_id] = (acc[u.permission_group_id] || 0) + 1;
    }
    return acc;
  }, {});

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async ({ name, perms }) => {
      const { data, error } = await supabase.rpc("create_permission_group", {
        p_name: name,
        p_permissions: perms,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-groups-full"] });
      queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
      toast({ title: "Permission group created" });
      setDialogOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to create group", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, perms }) => {
      const { data, error } = await supabase.rpc("update_permission_group", {
        p_id: id,
        p_name: name,
        p_permissions: perms,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-groups-full"] });
      queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
      toast({ title: "Permission group updated" });
      setDialogOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to update group", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc("delete_permission_group", { p_id: id });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-groups-full"] });
      queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
      toast({ title: "Group deleted" });
      setDeleteGroup(null);
    },
    onError: (err) => {
      toast({ title: "Cannot delete group", description: err.message, variant: "destructive" });
      setDeleteGroup(null);
    },
  });

  const openCreate = () => {
    setEditGroup(null);
    setGroupName("");
    setGroupPerms({ ...DEFAULT_PERMISSIONS });
    setDialogOpen(true);
  };

  const openEdit = (group) => {
    setEditGroup(group);
    setGroupName(group.name);
    setGroupPerms({ ...DEFAULT_PERMISSIONS, ...group.permissions });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!groupName.trim()) return;
    if (editGroup) {
      updateMutation.mutate({ id: editGroup.id, name: groupName, perms: groupPerms });
    } else {
      createMutation.mutate({ name: groupName, perms: groupPerms });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const enabledCount = (perms) =>
    Object.values(perms).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Permission Groups</h1>
            <p className="text-sm text-muted-foreground">{groups.length} group{groups.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          New Group
        </Button>
      </div>

      {/* Groups grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">No permission groups yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a group to start assigning permissions.</p>
          <Button onClick={openCreate} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" /> Create First Group
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const perms = { ...DEFAULT_PERMISSIONS, ...group.permissions };
            const count = enabledCount(perms);
            const userCount = usersPerGroup[group.id] || 0;

            return (
              <div
                key={group.id}
                className="rounded-xl border border-border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{group.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {count} of {PERMISSION_SECTIONS.length} permissions enabled
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(group)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteGroup(group)}
                      disabled={userCount > 0}
                      title={userCount > 0 ? `${userCount} user(s) assigned` : "Delete group"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Mini permission chips */}
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_SECTIONS.map(({ key, label }) => (
                    <span
                      key={key}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        perms[key]
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border pt-3">
                  <Users className="w-3.5 h-3.5" />
                  <span>{userCount} user{userCount !== 1 ? "s" : ""} assigned</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editGroup ? "Edit Permission Group" : "New Permission Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g. Warehouse Team"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground mb-4">Section Access</p>
              <PermissionEditor perms={groupPerms} onChange={setGroupPerms} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!groupName.trim() || isSaving}>
              {isSaving ? "Saving…" : editGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteGroup?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This group will be permanently deleted. Users assigned to it will lose their permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deleteGroup.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
