import { toWhatsappDigits } from "@/features/guarantee/whatsapp";

/**
 * Cartão de contato da van (vCard 3.0).
 *
 * O cliente abre a página dias antes de viajar, e precisa da van no dia em que pousa. Salvar o
 * contato agora é o que atravessa essa distância: no aeroporto ele procura "Van" na agenda em vez
 * de procurar a reserva, o e-mail ou esta página. A alternativa (só um link de WhatsApp) serve
 * para quem já está no estacionamento, e por isso os dois convivem no bloco.
 *
 * vCard 3.0 e não 4.0 porque é o que o iOS e o Android importam sem reclamar.
 */
export type VanContact = {
  /** Nome da empresa parceira ("Virapark"). */
  companyName: string;
  /** Unidade, para diferenciar duas do mesmo parceiro ("Aeroporto de Viracopos"). */
  locationName: string;
  /** WhatsApp da van, em qualquer formato. */
  phone: string;
};

/**
 * Nome que vai aparecer na agenda. Abre com "Van" de propósito: no aeroporto a pessoa lembra do
 * que precisa (a van), não do nome do estacionamento que reservou semanas atrás.
 */
export function vanContactName({ companyName, locationName }: Omit<VanContact, "phone">): string {
  const nome = `Van ${companyName}`;
  return locationName && locationName !== companyName ? `${nome} · ${locationName}` : nome;
}

/**
 * Escapa o que o vCard trata como sintaxe. Sem isso, um parceiro chamado "Park, Inc." quebraria
 * a linha em duas e o contato chegaria truncado na agenda.
 */
function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Conteúdo do arquivo `.vcf`. CRLF porque a RFC 6350 pede, e o Android é literal quanto a isso. */
export function buildVanVCard(contact: VanContact): string {
  const digits = toWhatsappDigits(contact.phone);
  const nome = vanContactName(contact);
  const linhas = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${escapeVCard(nome)};;;`,
    `FN:${escapeVCard(nome)}`,
    `ORG:${escapeVCard(contact.companyName)}`,
    `TEL;TYPE=CELL:+${digits}`,
    "NOTE:Chame a van do estacionamento por este WhatsApp. Você acompanha ela no mapa em tempo real.",
    "END:VCARD",
  ];
  return `${linhas.join("\r\n")}\r\n`;
}

/** Nome do arquivo baixado. Sem acento nem espaço, que é o que sobrevive a qualquer sistema. */
export function vanVCardFilename(contact: Omit<VanContact, "phone">): string {
  const base = vanContactName(contact)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "van"}.vcf`;
}
