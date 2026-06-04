import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

export default function OutboundPalletCard({ pallet, onLoad, actionDisabled, readOnly, trailers }) {
  const trailer = trailers?.find(t => t.id === pallet.trailer_id);

  return (
    <div className="flex items-start justify-between gap-3 p-3 bg-secondary/40 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-sm text-foreground">{pallet.pallet_id}</span>
          {pallet.description && (
            <span className="text-xs text-muted-foreground">· {pallet.description}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          {(pallet.items || []).map((item, i) => (
            <span key={i} className="text-xs bg-background border rounded px-1.5 py-0.5">
              {item.menu_item_code}{item.is_unit_based ? ` ×${item.quantity}u` : ` ×${item.stack_count}stk`}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(pallet.total_stacks || 0) > 0 && (
            <span><Layers className="w-3 h-3 inline mr-0.5" />{pallet.total_stacks} stacks</span>
          )}
          {pallet.ready_for_pickup_at && (
            <span>Ready: {new Date(pallet.ready_for_pickup_at).toLocaleString()}</span>
          )}
          {pallet.loaded_to_trailer_at && (
            <span>Loaded: {new Date(pallet.loaded_to_trailer_at).toLocaleString()} by {pallet.loaded_to_trailer_by}</span>
          )}
          {trailer && (
            <span>Trailer: {trailer.trailer_id_label}</span>
          )}
        </div>
      </div>
      {!readOnly && onLoad && (
        <Button
          size="sm"
          onClick={onLoad}
          disabled={actionDisabled}
          className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
        >
          Load to Trailer
        </Button>
      )}
      {readOnly && (
        <Badge className="bg-violet-100 text-violet-700 border-0 text-xs shrink-0">Loaded</Badge>
      )}
    </div>
  );
}
