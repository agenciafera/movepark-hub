import { Navigate } from "react-router-dom";
import { MotorCrescimento } from "@/features/growth/MotorCrescimento";
import { clubeEIndicacaoLigados } from "@/lib/features";

/**
 * Rota pública de PRÉVIA do Motor de Crescimento — `/motor-preview`.
 * Existe só para visualizar a UI (dados mockados), sem exigir login.
 * O destino real da feature é uma aba do Clube dentro de `/account`. Enquanto o
 * Clube não for lançado, volta para a home.
 */
export default function MotorPreviewPage() {
  if (!clubeEIndicacaoLigados()) return <Navigate to="/" replace />;
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 desktop:px-8 desktop:py-12">
      <MotorCrescimento />
    </div>
  );
}
