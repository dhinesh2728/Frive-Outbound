import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";

export function useLpItemIdMap() {
  const { data } = useQuery({
    queryKey: ["lp-item-id-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imported_meal_predictions")
        .select("menu_item_code, lp_item_id")
        .not("lp_item_id", "is", null);
      if (error) throw error;
      const map = {};
      for (const row of (data || [])) {
        if (row.lp_item_id) map[(row.menu_item_code || "").toLowerCase()] = row.lp_item_id;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data || {};
}

// Returns lp_item_id if mapped, otherwise falls back to the raw menu_item_code.
export function displayItemCode(code, lpMap) {
  return (lpMap && code && lpMap[(code || "").toLowerCase()]) || code || "";
}
