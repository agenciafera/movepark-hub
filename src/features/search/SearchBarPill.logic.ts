// Lógica pura de montagem da URL de busca a partir do SearchBarPill — testável sem DOM/router.

export type Vehicle = "car" | "motorcycle";

type BuildArgs = {
  /** Params atuais a preservar (operadora, comodidades, ordenação, categoria, distância…).
   *  null/undefined = busca nova "do zero" (home). */
  base?: URLSearchParams | null;
  dest: string | null;
  /** Terminal/ponto selecionado (E2.1.2) — ancora a proximidade nos resultados. */
  point?: string | null;
  from: Date | null;
  to: Date | null;
  vehicle: Vehicle;
};

/**
 * Monta os params da busca sobrescrevendo só o ESCOPO (dest/point/from/to/vehicle) e mantendo os
 * demais filtros vindos de `base` (quando informado). Sempre zera a paginação (`offset`) — busca nova.
 */
export function buildSearchParams({ base, dest, point, from, to, vehicle }: BuildArgs): URLSearchParams {
  const next = new URLSearchParams(base ?? undefined);

  if (dest) next.set("dest", dest);
  else next.delete("dest");

  if (point) next.set("point", point);
  else next.delete("point");

  if (from) next.set("from", from.toISOString());
  else next.delete("from");

  if (to) next.set("to", to.toISOString());
  else next.delete("to");

  next.set("vehicle", vehicle);
  next.delete("offset");

  return next;
}
