import { Navigate } from "react-router-dom";
import { IndiqueGanhe } from "@/features/growth/IndiqueGanhe";
import { clubeEIndicacaoLigados } from "@/lib/features";

/**
 * `/account/indicar`: página dedicada do Indique e Ganhe. Enquanto a indicação
 * não for lançada, a URL direta volta para a conta.
 */
export default function AccountIndicarPage() {
  if (!clubeEIndicacaoLigados()) return <Navigate to="/account" replace />;
  return <IndiqueGanhe />;
}
