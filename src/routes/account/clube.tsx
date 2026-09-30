import { Navigate } from "react-router-dom";
import { MotorCrescimento } from "@/features/growth/MotorCrescimento";
import { clubeEIndicacaoLigados } from "@/lib/features";

/**
 * `/account/clube`: Movepark Clube, carteira e Indique e Ganhe do cliente.
 * Enquanto o Clube não for lançado, a URL direta volta para a conta.
 */
export default function AccountClubePage() {
  if (!clubeEIndicacaoLigados()) return <Navigate to="/account" replace />;
  return <MotorCrescimento />;
}
