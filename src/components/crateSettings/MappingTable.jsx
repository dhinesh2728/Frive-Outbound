import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Check, X, Search, AlertCircle } from "lucide-react";

export default function MappingTable({ mappings, containerTypes, onUpdate }) {
  const [editingCode, setEditingCode] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editType, setEditType] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState(containerTypes[0]?.value || "main_bowl");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editError, setEditError] = useState("");
  const [addError, setAddError] = useState("");

  const entries = Object.entries(mappings || {})
    .map(([code, type]) => ({ code, type }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const filtered = search
    ? entries.filter((e) => e.code.includes(search.toLowerCase()))
    : entries;

  const getColor = (typeValue) => {
    const found = containerTypes.find((ct) => ct.value === typeValue);
    return found?.color || "bg-slate-100 text-slate-700";
  };

  const getLabel = (typeValue) => {
    const found = containerTypes.find((ct) => ct.value === typeValue);
    return found?.label || typeValue;
  };

  const startEdit = (code, type) => {
    setEditingCode(code);
    setEditCode(code);
    setEditType(type);
    setEditError("");
  };

  const cancelEdit = () => { setEditingCode(null); setEditError(""); };

  const saveEdit = (originalCode) => {
    const trimmedCode = editCode.trim().toLowerCase();
    if (!trimmedCode) return;
    if (trimmedCode !== originalCode && mappings[trimmedCode] !== undefined) {
      setEditError(`"${trimmedCode}" already exists.`);
      return;
    }
    const next = { ...mappings };
    if (trimmedCode !== originalCode) delete next[originalCode];
    next[trimmedCode] = editType;
    onUpdate(next);
    setEditingCode(null);
    setEditError("");
  };

  const handleDelete = (code) => setDeleteConfirm(code);

  const doDelete = (code) => {
    const next = { ...mappings };
    delete next[code];
    onUpdate(next);
    setDeleteConfirm(null);
  };

  const handleAdd = () => {
    const trimmed = newCode.trim().toLowerCase();
    if (!trimmed) return;
    if (mappings[trimmed] !== undefined) { setAddError(`"${trimmed}" already exists.`); return; }
    onUpdate({ ...mappings, [trimmed]: newType });
    setNewCode("");
    setAddError("");
    setShowAdd(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Menu Item → Container Type</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search codes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 w-44 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Edit codes, reassign container types, or add/remove entries. {entries.length} items total.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {filtered.map(({ code, type }) => (
              <div key={code} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
                {editingCode === code ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={editCode}
                        onChange={(e) => { setEditCode(e.target.value); setEditError(""); }}
                        className="h-7 w-44 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(code); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                      />
                      <Select value={editType} onValueChange={setEditType}>
                        <SelectTrigger className="h-7 w-36 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {containerTypes.map((ct) => (
                            <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => saveEdit(code)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {editError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{editError}</p>}
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground flex-1 capitalize">{code}</span>
                    <Badge className={`${getColor(type)} border-0 text-xs font-medium`}>{getLabel(type)}</Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(code, type)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(code)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">No matching items</p>
            )}
          </div>

          {showAdd ? (
            <div className="flex flex-col gap-1.5 px-5 py-3 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="menu item code (lowercase)"
                  value={newCode}
                  onChange={(e) => { setNewCode(e.target.value); setAddError(""); }}
                  className="h-8 w-52 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setAddError(""); } }}
                  autoFocus
                />
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {containerTypes.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" onClick={handleAdd}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAdd(false); setAddError(""); }}>Cancel</Button>
              </div>
              {addError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{addError}</p>}
            </div>
          ) : (
            <div className="px-5 py-3 border-t">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" />Add Menu Item
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteConfirm}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the mapping for <strong>{deleteConfirm}</strong>. It will fall back to "Main Bowl" type if encountered during counting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => doDelete(deleteConfirm)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
