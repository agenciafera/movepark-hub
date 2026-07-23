import { cn } from "@/lib/utils";

/**
 * Faixa de logos dos parceiros. Fonte única pra `/seja-parceiro` e `/sobre`, que antes
 * listavam os mesmos nomes como texto, cada uma do seu jeito.
 *
 * Os arquivos são coloridos e escuros (o Virapark é `#05184F`), então esta faixa só
 * funciona sobre fundo claro. Em banda navy os logos somem.
 */
/**
 * A altura varia de propósito. Os arquivos vão de 1.84 (Abbapark, quase quadrado) a
 * 4.92 (Garage Inn, bem deitado) de proporção; com uma altura só, o Abbapark saía com
 * 52px de largura contra 130px do Garage Inn e parecia menor que os outros. Quanto
 * mais quadrado o logo, mais alto ele entra, pra todos pesarem igual no mural.
 */
const PARTNERS = [
  { name: "Virapark", file: "logo-virapark.svg", size: "h-7 desktop:h-8" },
  { name: "Garage Inn", file: "logo-garageinn.svg", size: "h-6 desktop:h-7" },
  { name: "Nation Park", file: "logo-nationpark.svg", size: "h-6 desktop:h-7" },
  { name: "Aerovalet", file: "logo-aerovalet.svg", size: "h-7 desktop:h-8" },
  { name: "Abbapark", file: "logo-abbapark.svg", size: "h-9 desktop:h-10" },
  { name: "Plenty Park", file: "logo-plenty-park.svg", size: "h-7 desktop:h-8" },
  { name: "Aeropark", file: "aeropark-logo.svg", size: "h-6 desktop:h-7" },
];

type Props = {
  /** Texto acima da faixa. Passe `null` pra esconder. */
  title?: string | null;
  className?: string;
  /**
   * Faixa rolando em loop (marquee) com fade nas laterais e logos em cinza.
   * Sem isso, o layout é o mural estático (usado em `/sobre`).
   */
  marquee?: boolean;
};

export function PartnerLogos({
  title = "Estacionamentos que já são Movepark",
  className,
  marquee = false,
}: Props) {
  if (marquee) {
    return <PartnerMarquee title={title} className={className} />;
  }

  return (
    <div className={cn("text-center", className)}>
      {title && <p className="text-caption uppercase tracking-widest text-muted">{title}</p>}
      <ul
        className={cn(
          "flex flex-wrap items-center justify-center gap-x-8 gap-y-6 desktop:gap-x-12",
          title && "mt-8",
        )}
      >
        {PARTNERS.map((p) => (
          <li key={p.name}>
            {/* Largura livre: travar a largura espremeria os logos mais deitados. */}
            <img
              src={`/images/parceiros/${p.file}`}
              alt={p.name}
              loading="lazy"
              decoding="async"
              className={cn("w-auto object-contain", p.size)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Marquee: os logos deslizam da direita pra esquerda em loop contínuo. O truque do
 * loop sem emenda é duplicar a lista em dois blocos idênticos e mover o trilho até
 * `-50%`: quando o primeiro bloco sai de cena, o segundo ocupa o mesmo lugar e a
 * animação reinicia sem salto. O `pr` no fim de cada bloco mantém o espaçamento
 * constante na costura.
 *
 * Fade nas laterais via `mask-image` (o Tailwind não traz utilitário de máscara).
 * Cinza via `grayscale` + opacidade: os SVGs são coloridos, então dessaturamos em
 * vez de recolorir. Com `prefers-reduced-motion` o trilho para (fica estático).
 */
function PartnerMarquee({ title, className }: { title?: string | null; className?: string }) {
  const fade =
    "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)";
  // Dobra a lista pra costurar o loop; o segundo bloco é decorativo (aria-hidden).
  const blocks = [0, 1];

  return (
    <div className={cn("text-center", className)}>
      <style>{`
        @keyframes mp-partner-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .mp-marquee-track { animation: mp-partner-marquee 34s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mp-marquee-track { animation: none; }
        }
      `}</style>

      {title && <p className="text-caption uppercase tracking-widest text-muted">{title}</p>}

      <div
        className={cn("relative overflow-hidden", title && "mt-8")}
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <div className="mp-marquee-track flex w-max">
          {blocks.map((b) => (
            <ul
              key={b}
              aria-hidden={b === 1}
              className="flex shrink-0 items-center gap-x-12 pr-12 desktop:gap-x-16 desktop:pr-16"
            >
              {PARTNERS.map((p) => (
                <li key={p.name}>
                  <img
                    src={`/images/parceiros/${p.file}`}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "w-auto object-contain opacity-60 grayscale transition",
                      p.size,
                    )}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
