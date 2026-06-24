import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { STATUS_CONFIG } from "@/utils/deriveMealStatus";

const STATUS_PRIORITY = {
  not_started: 0,
  in_progress: 1,
  over_target: 2,
  palletted: 3,
  loaded_to_trailer: 4,
  completed: 5,
};

const COLUMNS = [
  { key: "menu_item_code", label: "Meal" },
  { key: "lp_item_id",     label: "LP Code" },
  { key: "target",         label: "Target" },
  { key: "counted",        label: "Counted" },
  { key: "progress",       label: "Progress" },
  { key: "status",         label: "Status" },
  { key: "pallet_count",   label: "Pallets" },
  { key: "loaded_count",   label: "Loaded" },
];

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-40 ml-1 inline" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 inline" />
    : <ChevronDown className="w-3 h-3 ml-1 inline" />;
}

function ProgressBar({ counted, target }) {
  if (!target) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round((counted / target) * 100);
  const barColor =
    pct > 110 ? "bg-red-500" :
    pct >= 100 ? "bg-green-500" :
    "bg-amber-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <span className="text-xs text-muted-foreground">{status}</span>;
  return (
    <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
  );
}

function PalletExpandRow({ pallets, trailers }) {
  if (!pallets.length) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-3 text-xs text-muted-foreground bg-muted/30">
          No pallets for this meal.
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={8} className="px-4 py-2 bg-muted/30">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-1 pr-3 font-medium">Pallet ID</th>
              <th className="text-left py-1 pr-3 font-medium">Stacks</th>
              <th className="text-left py-1 pr-3 font-medium">Capacity</th>
              <th className="text-left py-1 pr-3 font-medium">Total meals</th>
              <th className="text-left py-1 pr-3 font-medium">Status</th>
              <th className="text-left py-1 font-medium">Trailer</th>
            </tr>
          </thead>
          <tbody>
            {pallets.map(p => {
              const totalMeals = (p.total_stacks || 0) * (p.stacks_capacity || 5);
              const trailer = trailers.find(t => t.id === p.trailer_id);
              const config = STATUS_CONFIG[p.status];
              return (
                <tr key={p.id} className="border-t border-border/40">
                  <td className="py-1 pr-3 font-mono">{p.pallet_id}</td>
                  <td className="py-1 pr-3">{p.total_stacks ?? "—"}</td>
                  <td className="py-1 pr-3">{p.stacks_capacity ?? "—"}</td>
                  <td className="py-1 pr-3">{totalMeals.toLocaleString()}</td>
                  <td className="py-1 pr-3">
                    {config
                      ? <span className={`font-medium ${config.text}`}>{config.label}</span>
                      : <span className="text-muted-foreground">{p.status}</span>
                    }
                  </td>
                  <td className="py-1">{trailer?.trailer_id_label || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export default function MealBreakdownTable({ meals, trailers }) {
  const [sortKey, setSortKey] = useState("status");
  const [sortDir, setSortDir] = useState("asc");
  const [expandedId, setExpandedId] = useState(null);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...meals].sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
        case "menu_item_code":
          aVal = (a.menu_item_code || "").toLowerCase();
          bVal = (b.menu_item_code || "").toLowerCase();
          break;
        case "lp_item_id":
          aVal = (a.lp_item_id || "").toLowerCase();
          bVal = (b.lp_item_id || "").toLowerCase();
          break;
        case "target":
          aVal = a.prediction?.target_quantity ?? 0;
          bVal = b.prediction?.target_quantity ?? 0;
          break;
        case "counted":
          aVal = a.total_quantity ?? 0;
          bVal = b.total_quantity ?? 0;
          break;
        case "status":
          aVal = STATUS_PRIORITY[a.status] ?? 99;
          bVal = STATUS_PRIORITY[b.status] ?? 99;
          break;
        case "pallet_count":
          aVal = a.pallet_count ?? 0;
          bVal = b.pallet_count ?? 0;
          break;
        case "loaded_count":
          aVal = a.loaded_count ?? 0;
          bVal = b.loaded_count ?? 0;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [meals, sortKey, sortDir]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{meals.length} meals</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map(col => (
                <TableHead
                  key={col.key}
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(meal => {
              const isExpanded = expandedId === meal.id;
              const target = meal.prediction?.target_quantity;
              return [
                <TableRow
                  key={meal.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(isExpanded ? null : meal.id)}
                >
                  <TableCell className="font-medium">{meal.menu_item_code}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {meal.lp_item_id || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {target != null ? target.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {(meal.total_quantity ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <ProgressBar counted={meal.total_quantity ?? 0} target={target} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={meal.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{meal.pallet_count}</TableCell>
                  <TableCell>
                    {meal.loaded_count > 0
                      ? <span className="text-green-600 font-medium">✓</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>
                </TableRow>,
                isExpanded && (
                  <PalletExpandRow
                    key={`${meal.id}-expand`}
                    pallets={meal.pallets || []}
                    trailers={trailers}
                  />
                ),
              ];
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
