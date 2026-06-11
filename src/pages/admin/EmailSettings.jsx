import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Mail } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useOutletContext } from "react-router-dom";
import AccessDenied from "@/components/shared/AccessDenied";

export default function EmailSettings() {
  const { admin } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const { data: recipients = [], isLoading } = useQuery({
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

  const addMutation = useMutation({
    mutationFn: async ({ name: n, email: e }) => {
      const { error } = await supabase
        .from("email_recipients")
        .insert({ name: n, email: e });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-recipients"] });
      setName("");
      setEmail("");
      toast({ title: "Recipient added" });
    },
    onError: (err) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("email_recipients")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-recipients"] });
      toast({ title: "Recipient removed" });
    },
    onError: (err) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  if (!admin) return <AccessDenied />;

  const canAdd = name.trim() && email.trim() && email.includes("@");

  return (
    <div>
      <PageHeader
        title="Email Settings"
        description="Manage ASN report email recipients. An ASN CSV is automatically sent to these addresses when a trailer is closed."
      />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Recipient
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="space-y-1.5 flex-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Logistics Team"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. logistics@example.com"
              />
            </div>
            <div className="space-y-1.5 sm:pt-6">
              <Button
                onClick={() => addMutation.mutate({ name: name.trim(), email: email.trim() })}
                disabled={!canAdd || addMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                {addMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Recipients ({recipients.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recipients configured. Add one above to start sending ASN emails automatically.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => removeMutation.mutate(r.id)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
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
