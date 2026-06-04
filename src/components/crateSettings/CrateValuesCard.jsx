import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";

/**
 * Shows crate value inputs for the built-in 3 types + any custom types.
 */
export default function CrateValuesCard({ containerTypes, crateValues, onChange }) {
  // crateValues: { main_bowl: "12", small_bowl: "18", snack_bowl: "24", [custom]: "..." }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="w-4 h-4 text-primary" />
          Meals Per Crate
        </CardTitle>
        <p className="text-xs text-muted-foreground">Set how many meals fit in one crate for each container type.</p>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {containerTypes
            .filter((ct) => ct.value !== "units") // units = no crate counting
            .map((ct) => (
              <div key={ct.value} className="space-y-1.5">
                <Label htmlFor={`crate-${ct.value}`}>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mr-1.5 ${ct.color}`}>
                    {ct.label}
                  </span>
                  meals / crate
                </Label>
                <Input
                  id={`crate-${ct.value}`}
                  type="number"
                  min="1"
                  placeholder="e.g. 12"
                  value={crateValues[ct.value] ?? ""}
                  onChange={(e) => onChange(ct.value, e.target.value)}
                  className="h-11 text-lg"
                />
              </div>
            ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Container types set to "Units" are excluded — they don't use crate counting.
        </p>
      </CardContent>
    </Card>
  );
}
