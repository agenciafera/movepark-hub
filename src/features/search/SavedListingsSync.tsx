import { useSyncSavedListingsOnLogin } from "./useSavedListings";

/**
 * Monta o efeito que migra os favoritos pendentes (marcados por um visitante
 * anônimo) pra conta assim que a sessão aparece. Sem UI. Monte uma vez no root.
 */
export function SavedListingsSync() {
  useSyncSavedListingsOnLogin();
  return null;
}
