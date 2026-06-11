/**
 * Cook-date filtering — single source of truth.
 *
 * Rule: Every record belongs to exactly one cook date (or a fixed set of cook
 * dates for pallets). Filter ONLY on the dedicated cook-date field. Never use
 * created_date as a proxy — it is a write timestamp, not a cook-cycle marker.
 *
 * Supported record shapes:
 *   cook_date  (string)  — meal_count_jobs, trailers
 *   cook_dates (array)   — pallets
 *
 * "UNASSIGNED" is a sentinel value meaning the pallet has not yet been matched
 * to a cook cycle. It never satisfies a date match.
 *
 * New modules MUST import from this file instead of writing inline filter
 * logic. If a new field pattern is needed, extend this file — never duplicate
 * the logic elsewhere.
 */

/**
 * Returns true when the record belongs to at least one of the active cook dates.
 * Returns true unconditionally when activeCookDates is empty (no filter active).
 *
 * @param {object} record          - Any record with cook_date or cook_dates
 * @param {string[]} activeCookDates - ISO date strings for the current cook cycle
 * @returns {boolean}
 */
export function belongsToCook(record, activeCookDates) {
  if (!activeCookDates.length) return true;
  const set = new Set(activeCookDates);

  // Pallet shape: cook_dates array
  if (Array.isArray(record.cook_dates)) {
    const cd = record.cook_dates;
    return cd.length > 0 && cd.some(d => d !== "UNASSIGNED" && set.has(d));
  }

  // Job / Trailer shape: single cook_date string
  return set.has(record.cook_date);
}

/**
 * Filters an array of records to those belonging to the active cook cycle.
 * Returns the original array unchanged when activeCookDates is empty.
 *
 * @param {object[]} records
 * @param {string[]} activeCookDates
 * @returns {object[]}
 */
export function filterByCook(records, activeCookDates) {
  if (!activeCookDates.length) return records;
  return records.filter(r => belongsToCook(r, activeCookDates));
}

/**
 * Returns true when a pallet has no cook date assigned yet.
 * Used to surface the "Unassigned Cook Date" section in admin views.
 *
 * @param {object} record - A pallet record
 * @returns {boolean}
 */
export function isUnassigned(record) {
  if (!Array.isArray(record.cook_dates)) return false;
  const cd = record.cook_dates;
  return cd.length === 0 || cd.every(d => d === "UNASSIGNED");
}
