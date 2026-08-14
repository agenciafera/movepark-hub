import { Link } from "react-router-dom";
import { MapPin } from "@phosphor-icons/react";
import type { ProspectCard as ProspectCardData } from "@/types/domain";
import { formatDistance } from "@/lib/format";

type Props = {
  item: ProspectCardData;
  /** Slug do destino, que compõe a URL da página do lote. */
  destinationSlug: string;
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
 * O ÚNICO link do card é para a página do próprio lote no Hub (E0.17-e), e ele precisa
 * existir: sem link interno a página nasce órfã, e é justamente ela que carrega o JSON-LD,
 * a prova de demanda e o caminho de reivindicação.
 *
 * O selo "Sem reserva online" é TEXTO no HTML, não tooltip nem `title`: o crawler precisa
 * ler, e é ele que diz ao leitor por que este card é diferente do de cima.
 *
 * O card inteiro é clicável, igual ao vendável da seção de cima: quem chega aqui não
 * distingue as duas seções pelo alvo do clique, e acertar só o título é um alvo pequeno
 * no polegar. A área vem de um `::after` esticado sobre o card, e não de um `<Link>`
 * envolvendo tudo, porque assim o texto do link continua sendo só o nome do lote. Link
 * engolindo endereço, distância e o selo vira texto âncora poluído, que é o oposto do que
 * esta página existe para fazer.
 */
export function ProspectCard({ item, destinationSlug }: Props) {
  return (
    <li
      data-testid="prospect-card"
      className="relative flex flex-col gap-2 rounded-2xl border border-hairline bg-canvas p-5 transition hover:border-mp-primary focus-within:border-mp-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-balance text-title-md text-ink">
          <Link
            to={`/estacionamentos/${destinationSlug}/${item.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {item.name}
          </Link>
        </h3>
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
