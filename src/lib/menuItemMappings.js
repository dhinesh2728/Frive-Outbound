/**
 * FACTORY DEFAULT menu item code → container type mapping.
 * Keys are lowercase. This is used ONLY for "Revert to Default".
 * The live mapping is always read from CrateSettings.menu_item_mappings in the DB.
 */
export const DEFAULT_MENU_ITEM_MAPPINGS = {
  // Breakfast
  "breakfast 1": "small_bowl",
  "breakfast 2": "small_bowl",
  "breakfast 3": "small_bowl",
  "breakfast 4": "small_bowl",
  "breakfast 6": "small_bowl",

  // Fish
  "fish 1": "main_bowl",
  "fish 2": "main_bowl",
  "fish 3": "main_bowl",
  "fish 4": "main_bowl",
  "fish 5": "main_bowl",
  "fish 6": "main_bowl",
  "fish 7": "main_bowl",

  // Meat
  "meat 1": "main_bowl",
  "meat 2": "main_bowl",
  "meat 3": "main_bowl",
  "meat 4": "main_bowl",
  "meat 5": "main_bowl",
  "meat 6": "main_bowl",
  "meat 7": "main_bowl",
  "meat 8": "main_bowl",
  "meat 9": "main_bowl",
  "meat 10": "main_bowl",
  "meat 11": "main_bowl",
  "meat 12": "main_bowl",
  "meat 13": "main_bowl",
  "meat 14": "main_bowl",
  "meat 15": "main_bowl",
  "meat 16": "main_bowl",

  // Smoothie
  "smoothie 1": "units",
  "smoothie 2": "units",
  "smoothie 3": "units",

  // Snack
  "snack 1": "main_bowl",
  "snack 2": "small_bowl",
  "snack 3": "main_bowl",
  "snack 4": "units",
  "snack 5": "units",
  "snack 10": "small_bowl",
  "snack 11": "small_bowl",
  "snack 13": "small_bowl",
  "snack 14": "small_bowl",
  "snack 15": "small_bowl",
  "snack 17": "small_bowl",

  // Vegan
  "vegan 1": "main_bowl",
  "vegan 2": "main_bowl",
  "vegan 4": "main_bowl",
  "vegan 5": "main_bowl",
  "vegan 6": "main_bowl",

  // Vegan Breakfast / Snack
  "vegan breakfast 2": "small_bowl",
  "vegan snack 1": "small_bowl",
};

/**
 * Factory default container type definitions.
 * { value: string, label: string, color: string }
 */
export const DEFAULT_CONTAINER_TYPES = [
  { value: "main_bowl",  label: "Main Bowl",  color: "bg-blue-100 text-blue-800" },
  { value: "small_bowl", label: "Small Bowl", color: "bg-violet-100 text-violet-800" },
  { value: "snack_bowl", label: "Snack Bowl", color: "bg-orange-100 text-orange-800" },
  { value: "units",      label: "Units",      color: "bg-slate-100 text-slate-700" },
];

// Kept for backward compat — derived from factory defaults
export const CONTAINER_TYPES = DEFAULT_CONTAINER_TYPES;

export const CONTAINER_TYPE_LABELS = Object.fromEntries(
  DEFAULT_CONTAINER_TYPES.map((ct) => [ct.value, ct.label])
);

/**
 * Build the effective container type label map from saved container_type_definitions
 * (stored in CrateSettings). Falls back to factory defaults.
 */
export function getContainerTypeLabels(savedDefs) {
  if (!savedDefs || !Array.isArray(savedDefs) || savedDefs.length === 0) {
    return CONTAINER_TYPE_LABELS;
  }
  return Object.fromEntries(savedDefs.map((d) => [d.value, d.label]));
}

/**
 * Resolve the container type for a given menu item code.
 * Uses the full saved DB mapping (menu_item_mappings). Falls back to factory defaults.
 * @param {string} menuItemCode
 * @param {object|null} savedMappings - from CrateSettings.menu_item_mappings (full map)
 * @returns {string} container type key
 */
export function getContainerType(menuItemCode, savedMappings) {
  const key = (menuItemCode || "").toLowerCase().trim();
  if (savedMappings && Object.keys(savedMappings).length > 0) {
    return savedMappings[key] || "main_bowl";
  }
  // Fall back to factory defaults if DB has no mappings yet
  return DEFAULT_MENU_ITEM_MAPPINGS[key] || "main_bowl";
}

/**
 * Get the crate value for a container type from CrateSettings record.
 * Returns null for "units" (no crate counting).
 */
export function getCrateValue(containerType, crateSettings) {
  if (!crateSettings) return null;
  if (containerType === "main_bowl") return crateSettings.main_bowl_crate_value;
  if (containerType === "small_bowl") return crateSettings.small_bowl_crate_value;
  if (containerType === "snack_bowl") return crateSettings.snack_bowl_crate_value;
  // Custom container types stored in extra_crate_values map
  if (crateSettings.extra_crate_values && containerType in crateSettings.extra_crate_values) {
    return crateSettings.extra_crate_values[containerType];
  }
  return null; // units or unknown — no crate value
}

/**
 * Returns sorted array of { code, type } from the active mapping.
 */
export function getAllMappingEntries(savedMappings) {
  const map = (savedMappings && Object.keys(savedMappings).length > 0)
    ? savedMappings
    : DEFAULT_MENU_ITEM_MAPPINGS;
  return Object.entries(map)
    .map(([code, type]) => ({ code, type }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
