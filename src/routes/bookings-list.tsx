import { CustomerBookingsPanel } from "@/features/bookings/CustomerBookingsPanel";

/**
 * `/bookings` — "Minhas reservas" no shell do consumer (topbar + bottom nav).
 * É o destino pós-checkout e a aba de reservas do site. O mesmo conteúdo também
 * mora em `/account/reservas` (shell da conta, com sidebar) via CustomerBookingsPanel.
 */
export default function BookingsListPage() {
  return (
    // Fundo de painel (como as áreas logadas): os cards de reserva brancos sobem em
    // vez de sumir no branco do shell do consumer. `min-h`: cobre a altura útil pra
    // não deixar um vão branco embaixo quando há poucas reservas.
    <div className="min-h-[calc(100vh-4rem)] bg-panel">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <CustomerBookingsPanel detailBase="/bookings" />
      </div>
    </div>
  );
}
