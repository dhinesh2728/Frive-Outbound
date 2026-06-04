import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Trash2 } from "lucide-react";
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

const typeLabels = {
  crate: "Crate",
  stack: "Stack",
  manual_add: "Manual +",
  manual_subtract: "Manual −",
};

const typeColors = {
  crate: "bg-blue-50 text-blue-700 border-blue-200",
  stack: "bg-violet-50 text-violet-700 border-violet-200",
  manual_add: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual_subtract: "bg-red-50 text-red-700 border-red-200",
};

export default function CountingHistory({ entries, onDeleteEntry }) {
  const [confirmEntry, setConfirmEntry] = useState(null);

  if (!entries?.length) return null;

  const handleConfirmDelete = () => {
    if (confirmEntry) {
      onDeleteEntry(confirmEntry);
      setConfirmEntry(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Counting History ({entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...entries].reverse().map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`${typeColors[e.entry_type]} text-xs`}>
                    {typeLabels[e.entry_type]}
                  </Badge>
                  <span className={`font-semibold ${e.entry_type === "manual_subtract" ? "text-red-600" : "text-foreground"}`}>
                    {e.entry_type === "manual_subtract" ? "−" : "+"}{Math.abs(e.calculated_quantity)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground text-xs">
                  {e.notes && <span className="max-w-24 truncate">{e.notes}</span>}
                  <span>Total: {e.running_total}</span>
                  <span>{new Date(e.created_date).toLocaleTimeString()}</span>
                  {onDeleteEntry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmEntry(e)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmEntry} onOpenChange={(open) => !open && setConfirmEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Count Log?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this count log? This action cannot be undone and the meal count total will be updated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
