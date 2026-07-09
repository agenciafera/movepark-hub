import { MotorCrescimento } from "@/features/growth/MotorCrescimento";

/**
 * Rota pública de PRÉVIA do Motor de Crescimento — `/motor-preview`.
 * Existe só para visualizar a UI (dados mockados), sem exigir login.
 * O destino real da feature é uma aba do Clube dentro de `/account`.
 */
export default function MotorPreviewPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 desktop:px-8 desktop:py-12">
      <MotorCrescimento />
    </div>
  );
}
