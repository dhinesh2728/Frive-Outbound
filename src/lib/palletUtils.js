/**
 * Utility functions for Palletization module.
 * Stack = 8 crates (consistent with CountingDetail).
 */

/**
 * Generate an 18-digit numeric pallet ID.
 * Format: YYYYMMDDHHMMSS + 4 random digits = 18 chars, all numeric.
 */
function generateRawPalletId() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const datePart =
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds()); // 14 digits
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0"); // 4 digits
  return datePart + rand; // 18 digits total
}

/**
 * Generate a unique 18-digit numeric pallet ID.
 * Checks against existing pallet IDs from the current cook date
 * and the previous 2 weeks.
 *
 * @param {string[]} recentPalletIds - Array of existing pallet_id strings to check against.
 * @returns {string} A unique 18-digit numeric pallet ID.
 */
export function generatePalletId(recentPalletIds = []) {
  const existingSet = new Set(recentPalletIds);
  let id;
  let attempts = 0;
  do {
    id = generateRawPalletId();
    attempts++;
    if (attempts > 1000) {
      // Extremely unlikely — safety valve: append extra random digits
      id = generateRawPalletId() + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      break;
    }
  } while (existingSet.has(id));
  return id;
}

/**
 * Filter pallets to only those created within the last 2 weeks (14 days).
 * Used to scope the uniqueness check without scanning the full database.
 *
 * @param {Array} pallets - All fetched pallet records.
 * @returns {string[]} Array of pallet_id strings from the recent window.
 */
export function getRecentPalletIds(pallets) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  return pallets
    .filter(p => p.created_date && new Date(p.created_date) >= cutoff)
    .map(p => p.pallet_id)
    .filter(Boolean);
}

/**
 * Get stacks per pallet from settings (default 5).
 */
export function getStacksPerPallet(crateSettings) {
  return crateSettings?.stacks_per_pallet || 5;
}
