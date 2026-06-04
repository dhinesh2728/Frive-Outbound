import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { getContainerType, getContainerTypeLabels } from "@/lib/menuItemMappings";

const FALLBACK_COLORS = {
  main_bowl: "bg-blue-100 text-blue-800",
  small_bowl: "bg-violet-100 text-violet-800",
  snack_bowl: "bg-orange-100 text-orange-800",
  units: "bg-slate-100 text-slate-700",
};

export default function JobCard({ prediction, job, onClick, crateSettingsMappings, containerTypeDefs }) {
  const target = prediction.target_quantity;
  const counted = job?.total_quantity || 0;
  const status = job?.status || "not_started";
  const pct = target > 0 ? Math.min((counted / target) * 100, 100) : 0;

  const containerType = getContainerType(prediction.menu_item_code, crateSettingsMappings);
  const containerTypeLabels = getContainerTypeLabels(containerTypeDefs);

  const progressColor =
    status === "complete" ? "bg-emerald-500" :
    status === "over_target" ? "bg-red-500" :
    status === "in_progress" ? "bg-amber-500" : "bg-muted";

  return (
    <Card
      className="hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-lg truncate">{prediction.menu_item_code}</h3>
            <p className="text-sm text-muted-foreground">Recipe: {prediction.recipe_id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={status} />
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        <div className="mb-2">
          <Badge className={`${containerTypeDefs?.find(d => d.value === containerType)?.color || FALLBACK_COLORS[containerType] || "bg-slate-100 text-slate-700"} border-0 text-xs font-medium`}>
            {containerTypeLabels[containerType] || containerType}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Counted</span>
          <span className="font-semibold text-foreground">{counted} / {target}</span>
        </div>

        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
