/**
 * Qual `Authorization` a busca usa para falar com o banco.
 *
 * A Edge lê com a anon key, e a RLS de `location` decide o que aparece. Desde 16/09/2026 a
 * policy abre unidade em RASCUNHO para quem é testador (`public.is_tester()`), e isso só
 * funciona se a consulta correr como o usuário: o front já manda o JWT no header, mas a Edge
 * ignorava e usava a anon key para tudo. Repassar o header é o que faz a RLS enxergar quem
 * está perguntando. Sem header (crawler, curl, anon) fica a anon key, como sempre foi.
 */
export function callerAuthorization(req: Request, anonKey: string): string {
  const header = req.headers.get("Authorization")?.trim();
  if (header && /^Bearer\s+\S+$/i.test(header)) return header;
  return `Bearer ${anonKey}`;
}
