// Os dois eventos de e-commerce que nascem da própria reserva: `begin_checkout` quando o
// checkout abre com a reserva pendente, e `purchase` quando ela confirma. Os outros saem das
// telas (busca, ficha e passo de pagamento). Ver docs/specs/analytics-ecommerce.md.

import * as React from "react";
import { useAuth } from "@/auth/context";
import { trackEcommerce } from "@/lib/analytics";
import {
  bookingEcommerce,
  isFreshPurchase,
  isNewCustomer,
  markPurchaseTracked,
  purchaseEcommerce,
  userDataFromBooking,
  wasPurchaseTracked,
} from "@/lib/analytics-ecommerce";
import { useAllMyBookings } from "@/features/bookings/customerApi";
import { isCheckoutBlocked } from "@/features/checkout/checkout.logic";
import type { BookingForCheckout } from "@/features/checkout/api";

/** `begin_checkout` sai uma vez por reserva, e só enquanto ela ainda pode ser paga. */
export function shouldTrackBeginCheckout(
  booking: Pick<BookingForCheckout, "code" | "status" | "expires_at"> | null | undefined,
  alreadyTracked: string | null,
): boolean {
  if (!booking || booking.status !== "pending") return false;
  if (alreadyTracked === booking.code) return false;
  return !isCheckoutBlocked(booking.expires_at, booking.status);
}

/**
 * `purchase` sai quando a reserva confirma, uma vez por navegador, e só perto do pagamento.
 * `historyReady` segura até o histórico responder, porque `new_customer` depende dele; se a
 * consulta falhar, o evento sai sem o campo em vez de nunca sair.
 */
export function shouldTrackPurchase(
  booking: Pick<BookingForCheckout, "code" | "status" | "created_at" | "payment"> | null | undefined,
  historyReady: boolean,
  now: Date = new Date(),
): boolean {
  if (!booking || !historyReady) return false;
  if (!isFreshPurchase(booking, now)) return false;
  return !wasPurchaseTracked(booking.code);
}

export function useCheckoutTracking(booking: BookingForCheckout | null | undefined): void {
  const { session } = useAuth();
  const userId = session?.userId;
  const begun = React.useRef<string | null>(null);
  const purchased = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!shouldTrackBeginCheckout(booking, begun.current)) return;
    begun.current = booking!.code;
    trackEcommerce("begin_checkout", bookingEcommerce(booking!), { user_id: userId });
  }, [booking, userId]);

  // O histórico só é consultado depois da confirmação: antes disso ele não serve para nada aqui.
  const confirmed = booking?.status === "confirmed";
  const history = useAllMyBookings(confirmed ? booking.profile_id : undefined);
  const historyReady = confirmed && !history.isPending;

  React.useEffect(() => {
    if (!booking || purchased.current === booking.code) return;
    if (!shouldTrackPurchase(booking, historyReady)) return;
    purchased.current = booking.code;
    markPurchaseTracked(booking.code);
    trackEcommerce("purchase", purchaseEcommerce(booking), {
      user_id: userId,
      new_customer: history.data ? isNewCustomer(history.data, booking.code) : undefined,
      user_data: userDataFromBooking(booking),
    });
  }, [booking, historyReady, history.data, userId]);
}
