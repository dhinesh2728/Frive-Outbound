import { useAuth } from '@/lib/AuthContext';

export function useCurrentUser() {
  const { user, isLoadingAuth } = useAuth();
  return { data: user, isLoading: isLoadingAuth, error: null };
}

// Kept for backwards-compat — "admin" now means superadmin
export function isAdmin(user) {
  return user?.is_superadmin === true;
}
