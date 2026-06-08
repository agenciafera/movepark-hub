import type { RequestHandler } from "msw";

/**
 * Handlers MSW compartilhados. Vazio por enquanto — preenchido na leva de testes
 * de componente (ex: submit-partner-lead 201/400/409, mock-payment, get-faq).
 * Testes individuais podem usar `server.use(...)` para handlers específicos.
 */
export const handlers: RequestHandler[] = [];
