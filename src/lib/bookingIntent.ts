// Intenção de reserva — persiste as escolhas feitas no card (datas, tarifa, passageiros, PCD,
// add-ons, cupom) ANTES de mandar o usuário pro login, pra retomar exatamente de onde parou e
// avançar pro pagamento depois de autenticar. Espelha o padrão do coupon.ts/utm.ts: sessionStorage,
// que sobrevive ao round-trip de login (OTP e OAuth do Google, mesma aba).
//
// Por que sessionStorage e não a URL: as escolhas (tarifa, passageiros, add-ons) não estão na query
// e o DateRangePicker não escreve as datas na URL — guardar tudo num objeto é mais simples e não
// polui o link. A intenção é amarrada ao `listingId`: só retoma no mesmo lote onde foi criada.

export type BookingIntent = {
  /** location_parking_type.id — a intenção só é retomada neste lote. */
  listingId: string;
  /** Rota da listing pra onde voltar (referência; o redirect usa o `next` do login). */
  returnTo: string;
  /** check-in em ISO. */
  from: string;
  /** check-out em ISO. */
  to: string;
  passengers: number;
  hasPcd: boolean;
  /** Tarifa da UI: "basic" | "flex" | "superflex". */
  fare: string;
  addOnIds: string[];
  /** Código do cupom aplicado, ou null. */
  coupon: string | null;
};

const STORAGE_KEY = "mp_booking_intent";

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // SSR / storage bloqueado
  }
}

/** Guarda a intenção pra sobreviver ao ciclo de login. No-op sem storage. */
export function storeBookingIntent(intent: BookingIntent): void {
  try {
    safeSession()?.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // quota/serialização — ignora, a reserva ainda funciona sem retomada
  }
}

/**
 * Lê a intenção guardada, validando o formato. Retorna null se não houver, se o JSON estiver
 * corrompido ou se faltar campo essencial (nunca lança).
 */
export function getBookingIntent(): BookingIntent | null {
  const raw = safeSession()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BookingIntent>;
    if (
      !v ||
      typeof v.listingId !== "string" ||
      typeof v.from !== "string" ||
      typeof v.to !== "string" ||
      typeof v.fare !== "string"
    ) {
      return null;
    }
    return {
      listingId: v.listingId,
      returnTo: typeof v.returnTo === "string" ? v.returnTo : "",
      from: v.from,
      to: v.to,
      passengers: typeof v.passengers === "number" ? v.passengers : 1,
      hasPcd: v.hasPcd === true,
      fare: v.fare,
      addOnIds: Array.isArray(v.addOnIds) ? v.addOnIds.filter((x) => typeof x === "string") : [],
      coupon: typeof v.coupon === "string" ? v.coupon : null,
    };
  } catch {
    return null;
  }
}

/** Limpa a intenção guardada (após consumir/hidratar, ou ao cancelar). */
export function clearBookingIntent(): void {
  safeSession()?.removeItem(STORAGE_KEY);
}

/**
 * Deve auto-submeter a reserva na volta do login? Lógica pura pra ser testável e evitar corrida
 * entre restaurar sessão e restaurar intenção. Só quando: há intenção pendente, a sessão já
 * carregou (não está `authLoading`) e é de um cliente, o lote está reservável (disponibilidade e
 * preço revalidados) e o cupom já resolveu (pra não submeter sem o desconto).
 */
export function isAutoSubmitReady(s: {
  pending: boolean;
  hasSession: boolean;
  role: string | null;
  authLoading: boolean;
  canReserve: boolean;
  couponReady: boolean;
}): boolean {
  return (
    s.pending &&
    s.hasSession &&
    !s.authLoading &&
    s.role === "customer" &&
    s.canReserve &&
    s.couponReady
  );
}
