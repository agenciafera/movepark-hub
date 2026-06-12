import { MOVEPARK_SUPPORT, guaranteeClaimMessage } from "./copy";

/**
 * Normaliza um telefone para dígitos com código de país. Números locais BR
 * (10 ou 11 dígitos com DDD) ganham o prefixo `55`; números já com código de
 * país (12+ dígitos) passam direto. Retorna null se não houver dígitos.
 */
export function toWhatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

/** Monta um link wa.me a partir de um telefone (qualquer formato) + mensagem. null se sem telefone. */
export function whatsappHref(phone: string | null | undefined, message: string): string | null {
  const digits = toWhatsappDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export type GuaranteeChannel = {
  href: string;
  label: string;
  channel: "unit" | "support";
};

/**
 * Resolve o canal de acionamento da garantia: WhatsApp da unidade quando houver
 * telefone; senão WhatsApp central da Movepark (se configurado) ou e-mail de suporte.
 */
export function guaranteeChannel(args: {
  unitPhone?: string | null;
  code: string;
  unitName?: string | null;
}): GuaranteeChannel {
  const message = guaranteeClaimMessage({ code: args.code, unitName: args.unitName });

  const unit = whatsappHref(args.unitPhone, message);
  if (unit) return { href: unit, label: "Acionar garantia pela unidade", channel: "unit" };

  const central = whatsappHref(MOVEPARK_SUPPORT.whatsapp, message);
  if (central) return { href: central, label: "Acionar garantia com a Movepark", channel: "support" };

  const subject = encodeURIComponent("Acionar garantia de vaga");
  return {
    href: `mailto:${MOVEPARK_SUPPORT.email}?subject=${subject}&body=${encodeURIComponent(message)}`,
    label: "Acionar garantia com a Movepark",
    channel: "support",
  };
}
