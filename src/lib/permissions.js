// Canonical list of all permission toggles.
// key  → used in DB jsonb column and hasPermission()
// label → displayed in the UI
// group → which sidebar section it belongs to

export const PERMISSION_SECTIONS = [
  { key: 'meal_counting',   label: 'Meal Counting',   group: 'working' },
  { key: 'palletization',   label: 'Palletization',   group: 'working' },
  { key: 'outbound',        label: 'Outbound',        group: 'working' },
  { key: 'csv_import',      label: 'CSV Import',      group: 'admin'   },
  { key: 'crate_settings',  label: 'Crate Settings',  group: 'admin'   },
  { key: 'set_cook_date',   label: 'Set Cook Date',   group: 'admin'   },
  { key: 'cook_date_rules', label: 'Cook Date Rules', group: 'admin'   },
  { key: 'outbound_admin',  label: 'Outbound Admin',  group: 'admin'   },
  { key: 'reports',         label: 'Reports',         group: 'admin'   },
];

// Default state for a new permission group (everything off)
export const DEFAULT_PERMISSIONS = Object.fromEntries(
  PERMISSION_SECTIONS.map(({ key }) => [key, false])
);

// Returns true if the user has a specific permission
// Superadmin always has all permissions.
export function hasPermission(user, permKey) {
  if (!user) return false;
  if (user.is_superadmin) return true;
  return user.permissions?.[permKey] === true;
}
