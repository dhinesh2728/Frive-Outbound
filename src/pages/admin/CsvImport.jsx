import { useState } from "react";
import { base44 } from "@/api/base44Client";
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

// Accept both "final_prediction" and "finalprediction" (covers FinalPrediction)
function getPredictionValue(row) {
  return row["final_prediction"] ?? row["finalprediction"] ?? null;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "CSV file is empty or has no data rows." };
  
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const required = ["ds", "recipe_id", "menu_item_code"];
  const missing = required.filter((r) => !headers.includes(r));
  // Also require final_prediction OR finalprediction
  const hasPredCol = headers.includes("final_prediction") || headers.includes("finalprediction");
  if (missing.length || !hasPredCol) {
    const allMissing = [...missing, ...(!hasPredCol ? ["final_prediction"] : [])];
    return { error: `Missing required columns: ${allMissing.join(", ")}` };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    if (vals.every((v) => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => (row[h] = vals[idx] || ""));

    // Support both DD/MM/YYYY and YYYY-MM-DD formats
    let ds;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(row.ds)) {
      const [dd, mm, yyyy] = row.ds.split("/");
      ds = new Date(`${yyyy}-${mm}-${dd}`);
    } else {
      ds = new Date(row.ds);
    }
    if (isNaN(ds.getTime())) { errors.push(`Row ${i + 1}: invalid date "${row.ds}"`); continue; }
    const rawPred = getPredictionValue(row);
    const pred = Number(rawPred);
    if (rawPred === null || isNaN(pred)) { errors.push(`Row ${i + 1}: prediction value is not a number`); continue; }
    if (!row.recipe_id) { errors.push(`Row ${i + 1}: recipe_id is empty`); continue; }
    if (!row.menu_item_code) { errors.push(`Row ${i + 1}: menu_item_code is empty`); continue; }

    rows.push({
      cook_date: ds.toISOString().split("T")[0],
      recipe_id: String(row.recipe_id),
      menu_item_code: String(row.menu_item_code),
      target_quantity: pred,
    });
  }
  return { rows, errors };
}

export default function CsvImport() {
  const { admin } = useOutletContext() || {};
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [expandedDates, setExpandedDates] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ["predictions"],
    queryFn: () => base44.entities.ImportedMealPrediction.list("-cook_date", 500),
  });

  const importMutation = useMutation({
    mutationFn: async ({ rows, overwrite }) => {
      if (overwrite && duplicates.length) {
        for (const dup of duplicates) {
          await base44.entities.ImportedMealPrediction.delete(dup.id);
        }
      }
      const data = rows.map((r) => ({ ...r, source_file_name: fileName }));
      await base44.entities.ImportedMealPrediction.bulkCreate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      setPreview(null);
      setParseErrors([]);
      setDuplicates([]);
      toast({ title: "Imported", description: "Meal predictions imported successfully." });
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

  if (!admin) return <AccessDenied />;

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

      // Check duplicates
      const dupes = [];
      for (const row of result.rows) {
        const existing = predictions.find(
          (p) => p.cook_date === row.cook_date && p.menu_item_code === row.menu_item_code && p.recipe_id === row.recipe_id
        );
        if (existing) dupes.push(existing);
      }
      setDuplicates(dupes);
      if (dupes.length > 0) setShowOverwrite(true);
    };
    reader.readAsText(file);
  };

  const handleImport = (overwrite = false) => {
    setShowOverwrite(false);
    importMutation.mutate({ rows: preview, overwrite });
  };

  // Group existing predictions by cook_date
  const grouped = predictions.reduce((acc, p) => {
    if (!acc[p.cook_date]) acc[p.cook_date] = [];
    acc[p.cook_date].push(p);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const toggleDate = (d) => setExpandedDates((prev) => ({ ...prev, [d]: !prev[d] }));

  // Group preview by cook_date > menu_item_code
  const previewGrouped = preview?.reduce((acc, r) => {
    if (!acc[r.cook_date]) acc[r.cook_date] = {};
    if (!acc[r.cook_date][r.menu_item_code]) acc[r.cook_date][r.menu_item_code] = [];
    acc[r.cook_date][r.menu_item_code].push(r);
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
            <span className="text-sm text-muted-foreground mt-1">Required: ds, recipe_id, menu_item_code, final_prediction</span>
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
                {Object.entries(previewGrouped[date]).map(([mic, items]) => (
                  <div key={mic} className="ml-4 mb-2">
                    <p className="text-sm font-medium text-foreground">{mic}</p>
                    {items.map((item, i) => (
                      <div key={i} className="ml-4 text-sm text-muted-foreground">
                        Recipe: {item.recipe_id} — Target: {item.target_quantity}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex gap-3 mt-4">
              <Button onClick={() => handleImport(false)} disabled={importMutation.isPending}>
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
                            <TableHead>Recipe ID</TableHead>
                            <TableHead className="text-right">Target Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grouped[date].map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.menu_item_code}</TableCell>
                              <TableCell>{p.recipe_id}</TableCell>
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

      {/* Overwrite Dialog */}
      <AlertDialog open={showOverwrite} onOpenChange={setShowOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Records Found</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicates.length} record(s) already exist for the same cook date, menu item code, and recipe ID.
              Would you like to overwrite them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowOverwrite(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => handleImport(false)}>
              Keep Both
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleImport(true)}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
