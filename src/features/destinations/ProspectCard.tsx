import { MapPin } from "@phosphor-icons/react";
import type { ProspectCard as ProspectCardData } from "@/types/domain";
import { formatDistance } from "@/lib/format";

type Props = {
  item: ProspectCardData;
};

/**
 * Card do lote MAPEADO na página de destino (E0.17-d).
 *
 * Deliberadamente menor e mais pobre que o `ResultCard` do lado vendável, e cada ausência
 * aqui é uma decisão, não um "ainda não fizemos":
 *
 * - **Sem foto.** Foto do pátio dele numa página que não vende é o que transforma
 *   "exposição grátis" em "tira meu nome do ar". Além disso, conteúdo do Google Places não
 *   pode ser cacheado nem re-hospedado, e a foto do site do lote é obra protegida
 *   (Lei 9.610/98) de quem a Movepark vai ligar para prospectar.
 * - **Sem preço, sem selo de vantagem, sem nota.** ADR-009: promessa de transação só
 *   renderiza com capacidade declarada, e este lote não tem nenhuma.
 * - **Sem link para o site ou o motor de reserva dele.** No dia em que ele abre o
 *   Analytics e vê referral da Movepark, está recebendo de graça o que íamos cobrar.
 * - **Sem `<a>` de reserva, sem seletor de data, sem widget de WhatsApp.** Prometer
 *   reserva onde não existe reserva é CDC art. 30/31, e é pogo-stick puro na SERP.
 *
 * O selo "Sem reserva online" é TEXTO no HTML, não tooltip nem `title`: o crawler precisa
 * ler, e é ele que diz ao leitor por que este card é diferente do de cima.
 */
export function ProspectCard({ item }: Props) {
  return (
    <li
      data-testid="prospect-card"
      className="flex flex-col gap-2 rounded-2xl border border-hairline bg-canvas p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-balance text-title-md text-ink">{item.name}</h3>
        <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-badge text-muted">
          Sem reserva online
        </span>
      </div>

      {item.address && <p className="text-pretty text-body-sm text-muted">{item.address}</p>}

      {/* Mesmo formato do card vendável (`formatDistance` + pino), senão o card mapeado
          parece vir de outro sistema na mesma página. A referência só aparece escrita
          quando o destino tem terminal cadastrado e ele tem nome próprio ("do Terminal
          2"); sem isso a distância vai sozinha, como no card de cima, porque montar a
          frase com o nome do destino erra a preposição ("do Guarulhos"). */}
      {item.distance_km != null && (
        <p className="flex items-center gap-1.5 text-body-sm text-muted">
          <MapPin aria-hidden className="h-4 w-4 shrink-0" />
          {formatDistance(item.distance_km)}
          {item.reference_name ? ` do ${item.reference_name}` : ""}
        </p>
      )}
    </li>
  );
}
