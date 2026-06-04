/**
 * Central cook date logic — all cutoff/visibility/active-date calculations live here.
 * Used by SelectDates, SetCookDate, Reports, and any future screen.
 */

// Default settings (used if no record in DB yet)
export const DEFAULT_SETTINGS = {
  cutoff_hour: 21,
  cutoff_minute: 0,
  single_date_cutoff_days_before: 1,
  combined_use_first_date: true,
  visibility_days_before_today: 14,
};

export function mergeSettings(dbSettings) {
  return { ...DEFAULT_SETTINGS, ...(dbSettings || {}) };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function getDayName(dateStr) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[getDayOfWeek(dateStr)];
}

/** Parse "YYYY-MM-DD" into a local midnight Date */
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Returns "YYYY-MM-DD" for the current local date */
export function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Build options ────────────────────────────────────────────────────────────

/**
 * Group sorted ascending date strings into single / combined options.
 * If manualCombineRules (array of CookDateCombineRule records) is provided,
 * those override the auto Sun+Mon logic.
 */
export function buildCookDateOptions(sortedAscDates, manualCombineRules = []) {
  const activeRules = (manualCombineRules || []).filter((r) => r.is_active);

  // Build a map: date -> rule (so we can quickly find which rule a date belongs to)
  const dateToRule = {};
  for (const rule of activeRules) {
    for (const d of rule.dates) {
      dateToRule[d] = rule;
    }
  }

  const options = [];
  const consumed = new Set();

  for (let i = 0; i < sortedAscDates.length; i++) {
    const current = sortedAscDates[i];
    if (consumed.has(current)) continue;

    const rule = dateToRule[current];
    if (rule) {
      // All dates in this rule that exist in our sorted list
      const ruleDates = rule.dates
        .filter((d) => sortedAscDates.includes(d))
        .sort((a, b) => a.localeCompare(b));
      ruleDates.forEach((d) => consumed.add(d));
      options.push({
        dates: ruleDates,
        combined: ruleDates.length > 1,
        manualRule: rule,
      });
      continue;
    }

    // Auto Sun+Mon logic (only if not covered by a manual rule)
    const dow = getDayOfWeek(current);
    if (dow === 0 && i + 1 < sortedAscDates.length) {
      const next = sortedAscDates[i + 1];
      if (!consumed.has(next) && !dateToRule[next]) {
        const diffDays = (parseLocalDate(next) - parseLocalDate(current)) / (1000 * 60 * 60 * 24);
        if (getDayOfWeek(next) === 1 && diffDays === 1) {
          options.push({ dates: [current, next], combined: true, manualRule: null });
          consumed.add(current);
          consumed.add(next);
          continue;
        }
      }
    }

    options.push({ dates: [current], combined: false, manualRule: null });
    consumed.add(current);
  }

  return options;
}

// ─── Cutoff deadline ─────────────────────────────────────────────────────────

/**
 * Returns the cutoff Date object for a given cook option.
 *
 * Combined (Sun+Mon): cutoff = first date (Sunday if combined_use_first_date=true)
 *                              at cutoff_hour:cutoff_minute
 * Single: cutoff = cook date minus single_date_cutoff_days_before days
 *                  at cutoff_hour:cutoff_minute
 */
export function getCutoffDeadline(option, settings) {
  const s = mergeSettings(settings);
  let refDate;
  if (option.combined) {
    // Use first or last date of combined pair
    refDate = s.combined_use_first_date ? option.dates[0] : option.dates[option.dates.length - 1];
  } else {
    const cookDateMs = parseLocalDate(option.dates[0]).getTime();
    const offsetMs = s.single_date_cutoff_days_before * 24 * 60 * 60 * 1000;
    const cutoffDay = new Date(cookDateMs - offsetMs);
    const y = cutoffDay.getFullYear();
    const m = String(cutoffDay.getMonth() + 1).padStart(2, "0");
    const d = String(cutoffDay.getDate()).padStart(2, "0");
    refDate = `${y}-${m}-${d}`;
  }
  const [y, m, d] = refDate.split("-").map(Number);
  return new Date(y, m - 1, d, s.cutoff_hour, s.cutoff_minute, 0);
}

/**
 * Returns true if the cutoff deadline for this option has NOT yet passed.
 * i.e. this option is still "live".
 */
export function isOptionLive(option, settings, now = new Date()) {
  return now < getCutoffDeadline(option, settings);
}

/**
 * Returns true if the cutoff deadline has already passed.
 */
export function isOptionExpired(option, settings, now = new Date()) {
  return now >= getCutoffDeadline(option, settings);
}

// ─── Visibility filter ───────────────────────────────────────────────────────

/**
 * Filter a list of cook-date options to only those within the visibility window:
 * - Not older than visibility_days_before_today days ago (based on cutoff deadline)
 * - No upper limit (future dates always shown)
 */
export function filterVisibleOptions(options, settings, now = new Date()) {
  const s = mergeSettings(settings);
  const windowMs = s.visibility_days_before_today * 24 * 60 * 60 * 1000;
  const oldestAllowed = new Date(now.getTime() - windowMs);

  return options.filter((opt) => {
    const cutoff = getCutoffDeadline(opt, settings);
    // Show if cutoff is after oldestAllowed (i.e. not too far in the past)
    return cutoff >= oldestAllowed;
  });
}

// ─── Active cook date selection ───────────────────────────────────────────────

/**
 * Automatically determine the active cook date option:
 * 1. Find the first option whose cutoff deadline has NOT yet passed (live)
 * 2. If all are expired, fall back to the most recent (last) option
 */
export function findActiveCookDateOption(options, settings, now = new Date()) {
  if (options.length === 0) return null;

  // First live option (sorted ascending, so earliest future first)
  const liveIdx = options.findIndex((opt) => isOptionLive(opt, settings, now));
  if (liveIdx !== -1) return options[liveIdx];

  // All expired → return the last (most recent)
  return options[options.length - 1];
}
