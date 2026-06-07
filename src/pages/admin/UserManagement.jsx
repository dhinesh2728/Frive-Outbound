import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Users, UserPlus, KeyRound, Shield, CheckCircle2, XCircle,
  Clock, Copy, RefreshCw,
} from "lucide-react";

// Cryptographically random password
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => chars[b % chars.length])
    .join('');
}

function StatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
      <CheckCircle2 className="w-3.5 h-3.5" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <XCircle className="w-3.5 h-3.5" /> Inactive
    </span>
  );
}

export default function UserManagement() {
  const { admin } = useOutletContext() || {};
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [pwdUser, setPwdUser] = useState(null);   // user to change password for
  const [toggleUser, setToggleUser] = useState(null); // user to deactivate/reactivate

  // Create user form state
  const [newUsername, setNewUsername] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState(() => generatePassword());
  const [justCreated, setJustCreated] = useState(null); // show the generated password once

  // Change password state
  const [newPassword, setNewPassword] = useState(() => generatePassword());

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["app-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_app_users");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["permission-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_groups")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async ({ username, password, groupId }) => {
      const { data, error } = await supabase.rpc("create_app_user", {
        p_username: username,
        p_password: password,
        p_group_id: groupId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["app-users"] });
      setJustCreated({ username: data.username, password: generatedPassword });
      setCreateOpen(false);
      setNewUsername("");
      setNewGroupId("");
      setGeneratedPassword(generatePassword());
    },
    onError: (err) => {
      toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ userId, password }) => {
      const { data, error } = await supabase.rpc("update_app_user_password", {
        p_user_id: userId,
        p_new_password: password,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Password updated" });
      setPwdUser(null);
      setNewPassword(generatePassword());
    },
    onError: (err) => {
      toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
    },
  });

  const groupMutation = useMutation({
    mutationFn: async ({ userId, groupId }) => {
      const { data, error } = await supabase.rpc("update_app_user_group", {
        p_user_id: userId,
        p_group_id: groupId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-users"] });
      toast({ title: "Permission group updated" });
    },
    onError: (err) => {
      toast({ title: "Failed to update group", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ userId, active }) => {
      const { data, error } = await supabase.rpc("set_app_user_active", {
        p_user_id: userId,
        p_active: active,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["app-users"] });
      toast({ title: active ? "User reactivated" : "User deactivated" });
      setToggleUser(null);
    },
    onError: (err) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  const openCreate = () => {
    setCreateOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground">{users.length} user{users.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="w-4 h-4" />
          New User
        </Button>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        {loadingUsers ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Permission Group</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="bg-card hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.is_superadmin && (
                        <Shield className="w-3.5 h-3.5 text-purple-500 shrink-0" title="Superadmin" />
                      )}
                      <span className="font-medium text-foreground">{u.username}</span>
                      {u.username === currentUser?.username && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {u.is_superadmin ? (
                      <span className="text-muted-foreground text-xs">Full Access (superadmin)</span>
                    ) : (
                      <Select
                        value={u.permission_group_id || ""}
                        onValueChange={(gid) => groupMutation.mutate({ userId: u.id, groupId: gid })}
                        disabled={groupMutation.isPending}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder="No group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge isActive={u.is_active} />
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_login ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(u.last_login).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">Never</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Change password */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Change password"
                        onClick={() => { setNewPassword(generatePassword()); setPwdUser(u); }}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>

                      {/* Deactivate / Reactivate – not for superadmin */}
                      {!u.is_superadmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${u.is_active ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                          title={u.is_active ? "Deactivate" : "Reactivate"}
                          onClick={() => setToggleUser(u)}
                        >
                          {u.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create User Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                placeholder="e.g. warehouse1"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Lowercase, no spaces. e.g. john, ops_team</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-group">Permission Group</Label>
              <Select value={newGroupId} onValueChange={setNewGroupId}>
                <SelectTrigger id="new-group">
                  <SelectValue placeholder="Select a group…" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Generated Password</Label>
              <div className="flex gap-2">
                <Input value={generatedPassword} readOnly className="font-mono text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setGeneratedPassword(generatePassword())}
                  title="Regenerate"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(generatedPassword)}
                  title="Copy"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                Share this password with the user. It won't be shown again after creation.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  username: newUsername,
                  password: generatedPassword,
                  groupId: newGroupId,
                })
              }
              disabled={!newUsername.trim() || !newGroupId || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password Created Confirmation ───────────────────────────────────── */}
      <Dialog open={!!justCreated} onOpenChange={() => setJustCreated(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>User Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              User <span className="font-semibold text-foreground">{justCreated?.username}</span> has been created.
              Share these credentials:
            </p>
            <div className="bg-muted rounded-lg p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Username:</span>
                <span className="font-semibold">{justCreated?.username}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Password:</span>
                <span className="font-semibold">{justCreated?.password}</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => copyToClipboard(`Username: ${justCreated?.username}\nPassword: ${justCreated?.password}`)}
            >
              <Copy className="w-4 h-4" /> Copy credentials
            </Button>
            <p className="text-xs text-red-600">This password will not be shown again.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setJustCreated(null)} className="w-full">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!pwdUser} onOpenChange={(open) => !open && setPwdUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Setting new password for <span className="font-semibold text-foreground">{pwdUser?.username}</span>
            </p>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="flex gap-2">
                <Input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => setNewPassword(generatePassword())} title="Regenerate">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)} title="Copy">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdUser(null)}>Cancel</Button>
            <Button
              onClick={() => passwordMutation.mutate({ userId: pwdUser.id, password: newPassword })}
              disabled={!newPassword || passwordMutation.isPending}
            >
              {passwordMutation.isPending ? "Saving…" : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate / Reactivate Confirm ────────────────────────────────── */}
      <AlertDialog open={!!toggleUser} onOpenChange={(open) => !open && setToggleUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleUser?.is_active ? "Deactivate user?" : "Reactivate user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleUser?.is_active
                ? `${toggleUser?.username} will no longer be able to sign in.`
                : `${toggleUser?.username} will be able to sign in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                toggleMutation.mutate({ userId: toggleUser.id, active: !toggleUser.is_active })
              }
              disabled={toggleMutation.isPending}
              className={toggleUser?.is_active ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
            >
              {toggleMutation.isPending
                ? "Saving…"
                : toggleUser?.is_active
                ? "Deactivate"
                : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
