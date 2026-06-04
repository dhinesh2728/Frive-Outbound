import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Check, X, Layers, AlertCircle } from "lucide-react";

const COLOR_OPTIONS = [
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-slate-100 text-slate-700",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800",
  "bg-cyan-100 text-cyan-800",
];

function toSlug(label) {
  return label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default function ContainerTypeManager({ containerTypes, mappings, onUpdate }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addColor, setAddColor] = useState(COLOR_OPTIONS[4]);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { idx, type }
  const [editError, setEditError] = useState("");
  const [addError, setAddError] = useState("");

  const usedTypes = new Set(Object.values(mappings || {}));

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditLabel(containerTypes[idx].label);
    setEditColor(containerTypes[idx].color);
    setEditError("");
  };

  const cancelEdit = () => { setEditingIdx(null); setEditError(""); };

  const saveEdit = () => {
    if (!editLabel.trim()) return;
    const trimmed = editLabel.trim();
    const duplicate = containerTypes.some((ct, i) => i !== editingIdx && ct.label.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setEditError(`"${trimmed}" already exists.`); return; }

    const updated = containerTypes.map((ct, i) =>
      i === editingIdx ? { ...ct, label: trimmed, color: editColor } : ct
    );
    onUpdate(updated, mappings);
    setEditingIdx(null);
    setEditError("");
  };

  const handleDelete = (idx) => {
    const ct = containerTypes[idx];
    if (usedTypes.has(ct.value)) {
      setDeleteConfirm({ idx, type: ct });
    } else {
      doDelete(idx);
    }
  };

  const doDelete = (idx) => {
    const ct = containerTypes[idx];
    const updated = containerTypes.filter((_, i) => i !== idx);
    // Remove any mappings that used this type
    const newMappings = { ...mappings };
    Object.keys(newMappings).forEach((k) => {
      if (newMappings[k] === ct.value) delete newMappings[k];
    });
    onUpdate(updated, newMappings);
    setDeleteConfirm(null);
  };

  const handleAdd = () => {
    if (!addLabel.trim()) return;
    const trimmed = addLabel.trim();
    const duplicate = containerTypes.some((ct) => ct.label.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setAddError(`"${trimmed}" already exists.`); return; }
    const slug = toSlug(trimmed);
    const valueSlug = containerTypes.some((ct) => ct.value === slug) ? `${slug}_${Date.now()}` : slug;
    const newType = { value: valueSlug, label: trimmed, color: addColor };
    onUpdate([...containerTypes, newType], mappings);
    setAddLabel("");
    setAddError("");
    setShowAdd(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-primary" />
            Container Types
          </CardTitle>
          <p className="text-xs text-muted-foreground">Add, rename, or delete container types. Cannot delete types still in use unless reassigned.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {containerTypes.map((ct, idx) => (
              <div key={ct.value} className="flex items-center gap-3 px-5 py-3">
                {editingIdx === idx ? (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={editLabel}
                        onChange={(e) => { setEditLabel(e.target.value); setEditError(""); }}
                        className="h-8 w-36 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        {COLOR_OPTIONS.map((c) => (
                          <button
                            key={c}
                            title={c}
                            onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-full border-2 ${c.split(" ")[0]} ${editColor === c ? "border-foreground" : "border-transparent"}`}
                          />
                        ))}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                    </div>
                    {editError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{editError}</p>}
                  </div>
                ) : (
                  <>
                    <Badge className={`${ct.color} border-0 font-medium text-xs`}>{ct.label}</Badge>
                    <span className="text-xs text-muted-foreground flex-1">
                      {usedTypes.has(ct.value)
                        ? `${Object.values(mappings || {}).filter(v => v === ct.value).length} item(s)`
                        : "unused"}
                    </span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(idx)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {showAdd ? (
            <div className="flex flex-col gap-1.5 px-5 py-3 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="New type name..."
                  value={addLabel}
                  onChange={(e) => { setAddLabel(e.target.value); setAddError(""); }}
                  className="h-8 w-40 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setAddError(""); } }}
                  autoFocus
                />
                <div className="flex gap-1.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAddColor(c)}
                      className={`w-5 h-5 rounded-full border-2 ${c.split(" ")[0]} ${addColor === c ? "border-foreground" : "border-transparent"}`}
                    />
                  ))}
                </div>
                <Button size="sm" className="h-8" onClick={handleAdd}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAdd(false); setAddError(""); }}>Cancel</Button>
              </div>
              {addError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{addError}</p>}
            </div>
          ) : (
            <div className="px-5 py-3 border-t">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" />Add Container Type
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteConfirm?.type?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This container type is assigned to{" "}
              <strong>{Object.values(mappings || {}).filter(v => v === deleteConfirm?.type?.value).length}</strong>{" "}
              menu item(s). Deleting it will <strong>remove those mappings</strong>. Those items will fall back to "Main Bowl" until remapped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => doDelete(deleteConfirm.idx)}>
              Delete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
