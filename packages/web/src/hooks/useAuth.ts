import {
  useAuthStore,
  type AuthProject,
  type AuthState,
  type AuthUser,
  type UseAuthResult,
} from '../stores/useAuthStore.ts';

export type { AuthUser, AuthProject, AuthState, UseAuthResult };

export function useAuth(): UseAuthResult {
  return useAuthStore();
}
