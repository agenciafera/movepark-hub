import { useParams } from "react-router-dom";
import { WlBookingDetailView } from "@/features/wl-bookings/WlBookingDetailView";

/** Operator › Reservas › reserva do site white-label: o mesmo layout da reserva do Hub (09/10/2026). */
export default function OperatorWlBookingDetail() {
  const { id } = useParams<{ id: string }>();
  return <WlBookingDetailView id={id} audience="operator" />;
}
