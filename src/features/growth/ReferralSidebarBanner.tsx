import * as React from "react";
import { toast } from "sonner";
import { Copy, Gift, Share2 } from "lucide-react";
import { useAuth } from "@/auth/context";
import { useReferrals } from "./api";
import { brlShort, whatsappShareUrl } from "./growth.logic";

/**
 * Banner de indicação no rodapé da sidebar da conta. Fica acima do "Sair" porque é
 * o último lugar onde o olho passa antes de fechar a área, e a indicação é a única
 * ação ali que gera valor pro cliente.
 *
 * Some quando não há código: sem código o botão não teria o que compartilhar, e um
 * card que promete crédito sem caminho pra ele é pior que card nenhum.
 */
export function ReferralSidebarBanner() {
  const { session } = useAuth();
  const { data } = useReferrals(!!session?.userId);
  const [copiado, setCopiado] = React.useState(false);

  if (!data?.code) return null;

  const valor = brlShort(data.reward_amount);

  function compartilhar() {
    if (!data) return;
    window.open(whatsappShareUrl(data.link, data.reward_amount), "_blank", "noopener");
  }

  async function copiar() {
    if (!data) return;
    try {
      await navigator.clipboard?.writeText(data.link);
      setCopiado(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não conseguimos copiar. Tente pelo botão de compartilhar.");
    }
  }

  return (
    <section className="relative overflow-hidden rounded-md bg-mp-primary px-[18px] pb-[18px] pt-5">
      {/* Círculos de fundo: sangram pelas bordas e dão volume ao card sem imagem. */}
      <span
        aria-hidden
        className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10"
      />
      <span
        aria-hidden
        className="absolute -bottom-14 right-2 h-24 w-24 rounded-full bg-mp-pale/15"
      />

      <span className="relative flex h-[38px] w-[38px] items-center justify-center rounded-md bg-white/20">
        <Gift className="h-[19px] w-[19px] text-white" aria-hidden />
      </span>

      <p className="relative mt-3.5 text-display-md leading-tight text-white">
        Dê {valor},
        <br />
        ganhe {valor}
      </p>
      <p className="relative mt-2 text-caption-sm leading-relaxed text-white/80">
        Cada amigo que estacionar vira crédito na sua conta.
      </p>

      <button
        type="button"
        onClick={compartilhar}
        className="relative mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-white text-caption-sm font-bold text-mp-navy transition-colors hover:bg-mp-pale"
      >
        <Share2 className="h-[15px] w-[15px]" aria-hidden />
        Compartilhar
      </button>

      <button
        type="button"
        onClick={copiar}
        className="relative mt-2 flex h-[30px] w-full items-center justify-center gap-[7px] rounded-sm text-caption-sm font-semibold tracking-[0.3px] text-white/85 transition-colors hover:bg-white/[0.12] hover:text-white"
      >
        <Copy className="h-[13px] w-[13px]" aria-hidden />
        {data.code} · {copiado ? "copiado" : "copiar"}
      </button>
    </section>
  );
}
