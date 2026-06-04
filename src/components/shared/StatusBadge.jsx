import { Badge } from "@/components/ui/badge";
import { Circle, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

const statusConfig = {
  not_started: {
    label: "Not Started",
    icon: Circle,
    className: "bg-muted text-muted-foreground border-border",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  over_target: {
    label: "Over Target",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.not_started;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-1.5 font-medium`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </Badge>
  );
}
