import { MapPin, CreditCard, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Fonte única do "como funciona". A home e a /sobre mostravam a mesma explicação com
 * textos diferentes (4 passos contra 3, "Simples e rápido" contra "Como funciona"), e
 * o texto ia divergindo a cada edição. Agora as duas leem daqui; o layout de cada uma
 * segue sendo o seu (a home usa o ícone, a /sobre numera).
 *
 * Cada passo quebra uma objeção: preço fechado, onde o comprovante chega, e o que
 * acontece na volta.
 */
export const HOW_IT_WORKS = {
  eyebrow: "Como funciona",
  headline: "Três passos e o carro está guardado.",
  lead: "Do destino ao voucher em menos de 2 minutos.",
  steps: [
    {
      Icon: MapPin as LucideIcon,
      title: "Busque pelo destino",
      text: "Diga pra onde vai e quando. A gente mostra os estacionamentos parceiros com preço fechado e o tipo de vaga: coberto, descoberto ou valet.",
    },
    {
      Icon: CreditCard as LucideIcon,
      title: "Reserve e pague online",
      text: "PIX ou cartão. O voucher com QR Code chega na hora, no seu e-mail e na sua conta.",
    },
    {
      Icon: Ticket as LucideIcon,
      title: "Chegue e deixe o carro",
      text: "Mostre o QR Code na portaria. Na volta, é só pegar o carro.",
    },
  ],
} as const;
