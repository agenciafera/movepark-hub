// Catálogo de provedores no código (docs/specs/integracoes.md § 5.1), no espírito do ADR-007:
// versionado e revisado em PR, nunca editável no banco. Provedor novo entra aqui e no CHECK de
// `integration_connection.provider`.

import { cloudpark } from "./cloudpark.ts";
import type { AccessProvider, ProviderKey } from "./types.ts";

const PROVIDERS: Record<ProviderKey, AccessProvider<unknown>> = {
  cloudpark: cloudpark as AccessProvider<unknown>,
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export function getProvider(key: string): AccessProvider<unknown> {
  const p = PROVIDERS[key as ProviderKey];
  if (!p) throw new Error(`Provedor de integração desconhecido: ${key}`);
  return p;
}
