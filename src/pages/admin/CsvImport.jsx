import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileUp, AlertCircle, CheckCircle2, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";

function cleanVal(v) {
  return v.trim().replace(/^"|"$/g, "").trim();
}

function parseDate(raw) {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return new Date(`${yyyy}-${mm}-${dd}`);
  }
  return new Date(raw);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "CSV file is empty or has no data rows." };

  const headers = lines[0].split(",").map(cleanVal).map((h) => h.toLowerCase());
  const required = ["date", "menu_item_id", "menu_item_code", "final_cut_off_count"];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) {
    return { error: `Missing required columns: ${missing.join(", ")}` };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(cleanVal);
    if (vals.every((v) => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => (row[h] = vals[idx] || ""));

    const ds = parseDate(row.date);
    if (isNaN(ds.getTime())) { errors.push(`Row ${i + 1}: invalid date "${row.date}"`); continue; }
    const qty = Number(row.final_cut_off_count);
    if (isNaN(qty)) { errors.push(`Row ${i + 1}: final_cut_off_count is not a number`); continue; }
    if (!row.menu_item_id) { errors.push(`Row ${i + 1}: menu_item_id is empty`); continue; }
    if (!row.menu_item_code) { errors.push(`Row ${i + 1}: menu_item_code is empty`); continue; }

    rows.push({
      cook_date: ds.toISOString().split("T")[0],
      menu_item_id: String(row.menu_item_id),
      menu_item_code: String(row.menu_item_code).toLowerCase().trim(),
      target_quantity: qty,
      lp_item_id: `LP-${row.menu_item_id}-STD`,
    });
  }
  return { rows, errors };
}

export default function CsvImport() {
  const { admin, hasPermission } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [expandedDates, setExpandedDates] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ["predictions"],
    queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500),
  });

  const importMutation = useMutation({
    mutationFn: async (rows) => {
      let created = 0;
      let updated = 0;
      let jobsUpdated = 0;

      for (const row of rows) {
        // ── 1. Upsert imported_meal_predictions ───────────────────────────────
        const { error: upsertErr } = await supabase
          .from("imported_meal_predictions")
          .upsert(
            { ...row, source_file_name: fileName },
            { onConflict: "cook_date,menu_item_code" }
          );
        if (upsertErr) throw upsertErr;
        created++;

        // ── 2. Sync lp_item_id + menu_item_id into meal_count_jobs ───────────
        // Find all jobs matching this cook_date + menu_item_code
        const { data: matchingJobs, error: jobFindErr } = await supabase
          .from("meal_count_jobs")
          .select("id")
          .eq("cook_date", row.cook_date)
          .ilike("menu_item_code", row.menu_item_code);

        if (jobFindErr) {
          console.warn(
            `[Import] Could not query meal_count_jobs for ${row.menu_item_code} / ${row.cook_date}:`,
            jobFindErr.message
          );
        } else if (matchingJobs?.length > 0) {
          const { error: jobUpdateErr } = await supabase
            .from("meal_count_jobs")
            .update({
              menu_item_id: row.menu_item_id,
            })
            .in("id", matchingJobs.map((j) => j.id));
          if (jobUpdateErr) {
            console.warn(
              `[Import] Failed to update meal_count_jobs for ${row.menu_item_code}:`,
              jobUpdateErr.message
            );
          } else {
            jobsUpdated += matchingJobs.length;
          }
        }
      }

      return { created, updated, jobsUpdated };
    },
    onSuccess: ({ created, updated, jobsUpdated }) => {
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      queryClient.invalidateQueries({ queryKey: ["lp-item-id-map"] });
      queryClient.invalidateQueries({ queryKey: ["all-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["lp-mappings"] });
      setPreview(null);
      setParseErrors([]);
      toast({
        title: "Import complete",
        description: `${created} created, ${updated} updated${jobsUpdated > 0 ? `, ${jobsUpdated} job LP IDs synced` : ""}.`,
      });
    },
    onError: (err) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteDateMutation = useMutation({
    mutationFn: async (cookDate) => {
      const toDelete = predictions.filter((p) => p.cook_date === cookDate);
      for (const p of toDelete) {
        await base44.entities.ImportedMealPrediction.delete(p.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Cook date data removed." });
    },
  });

  if (!admin && !hasPermission?.("csv_import")) return <AccessDenied />;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please upload a CSV file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseCSV(ev.target.result);
      if (result.error) {
        toast({ title: "CSV Error", description: result.error, variant: "destructive" });
        return;
      }
      setParseErrors(result.errors);
      setPreview(result.rows);
    };
    reader.readAsText(file);
  };

  // Group existing predictions by cook_date
  const grouped = predictions.reduce((acc, p) => {
    if (!acc[p.cook_date]) acc[p.cook_date] = [];
    acc[p.cook_date].push(p);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const toggleDate = (d) => setExpandedDates((prev) => ({ ...prev, [d]: !prev[d] }));

  // Group preview by cook_date for display
  const previewGrouped = preview?.reduce((acc, r) => {
    if (!acc[r.cook_date]) acc[r.cook_date] = [];
    acc[r.cook_date].push(r);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="CSV Import" description="Upload meal prediction data from CSV files" />

      {/* Upload */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
            <FileUp className="w-10 h-10 text-muted-foreground mb-3" />
            <span className="font-medium text-foreground">Click to upload CSV</span>
            <span className="text-sm text-muted-foreground mt-1">Required columns: date, menu_item_id, menu_item_code, final_cut_off_count</span>
            <Input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </CardContent>
      </Card>

      {/* Parse Errors */}
      {parseErrors.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-amber-700 font-medium">
              <AlertCircle className="w-4 h-4" /> {parseErrors.length} row(s) skipped
            </div>
            <div className="text-sm text-amber-600 space-y-0.5 max-h-32 overflow-y-auto">
              {parseErrors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Preview — {preview.length} records from {fileName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previewGrouped && Object.keys(previewGrouped).sort().map((date) => (
              <div key={date} className="mb-4">
                <h3 className="font-semibold text-sm mb-2 text-primary">{date}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Menu Item Code</TableHead>
                      <TableHead>LP Item ID</TableHead>
                      <TableHead className="text-right">Target Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewGrouped[date].map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.menu_item_code}</TableCell>
                        <TableCell className="font-mono text-xs text-primary">{item.lp_item_id}</TableCell>
                        <TableCell className="text-right">{item.target_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            <div className="flex gap-3 mt-4">
              <Button onClick={() => importMutation.mutate(preview)} disabled={importMutation.isPending}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {importMutation.isPending ? "Importing..." : "Confirm Import"}
              </Button>
              <Button variant="outline" onClick={() => { setPreview(null); setParseErrors([]); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Imported Cook Dates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : sortedDates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No imported data yet</div>
          ) : (
            <div className="space-y-2">
              {sortedDates.map((date) => (
                <div key={date} className="border rounded-lg">
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedDates[date] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-medium">{date}</span>
                      <Badge variant="secondary">{grouped[date].length} items</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(date); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </button>
                  {expandedDates[date] && (
                    <div className="px-3 pb-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Menu Item Code</TableHead>
                            <TableHead>LP Item ID</TableHead>
                            <TableHead className="text-right">Target Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grouped[date].map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.menu_item_code}</TableCell>
                              <TableCell className="font-mono text-xs text-primary">{p.lp_item_id || "—"}</TableCell>
                              <TableCell className="text-right">{p.target_quantity}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cook Date Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all imported predictions for {deleteTarget}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDateMutation.mutate(deleteTarget)}
            >
              {deleteDateMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
