import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers } from "lucide-react";

export default function PalletizationConfig({ stacksPerPallet, onChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Palletization Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="stacks-per-pallet">Stacks per Pallet</Label>
          <p className="text-xs text-muted-foreground">
            Maximum number of stacks allowed on a single pallet. Default: 5.
          </p>
          <Input
            id="stacks-per-pallet"
            type="number"
            min="1"
            max="99"
            value={stacksPerPallet}
            onChange={(e) => onChange(e.target.value)}
            className="w-32"
            placeholder="5"
          />
        </div>
      </CardContent>
    </Card>
  );
}
