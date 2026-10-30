// Lógica pura da Edge `integration-test` ("Testar conexão"). Testável sem rede.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê e valida o corpo: { connection_id: uuid }. Devolve o id ou uma mensagem de erro. */
export function parseTestRequest(body: unknown): { connectionId: string } | { error: string } {
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).connection_id : null;
  if (typeof id !== "string" || !UUID.test(id)) return { error: "connection_id inválido" };
  return { connectionId: id.toLowerCase() };
}
