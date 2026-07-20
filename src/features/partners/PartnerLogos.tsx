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
};

export function PartnerLogos({ title = "Estacionamentos que já são Movepark", className }: Props) {
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
