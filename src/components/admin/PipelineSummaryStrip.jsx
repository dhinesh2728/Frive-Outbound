import { Card, CardContent } from "@/components/ui/card";
import { STATUS_CONFIG } from "@/utils/deriveMealStatus";

const STATUS_ORDER = [
  "not_started",
  "in_progress",
  "over_target",
  "palletted",
  "loaded_to_trailer",
  "completed",
];

const BORDER_HEX = {
  not_started:       "#9ca3af",
  in_progress:       "#fbbf24",
  over_target:       "#ef4444",
  palletted:         "#3b82f6",
  loaded_to_trailer: "#22c55e",
  completed:         "#1f2937",
};

export default function PipelineSummaryStrip({ strip }) {
  return (
    <div className="flex flex-wrap gap-3">
      {STATUS_ORDER.map(status => {
        const config = STATUS_CONFIG[status];
        const { jobCount = 0, mealCount = 0 } = strip[status] || {};
        return (
          <Card
            key={status}
            className="flex-1 min-w-[140px]"
            style={{ borderBottom: `4px solid ${BORDER_HEX[status]}` }}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{config.label}</p>
              <p className={`text-2xl font-bold ${config.text}`}>{jobCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mealCount.toLocaleString()} meals
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
