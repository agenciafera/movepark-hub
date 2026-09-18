import { cn } from "@/lib/utils";

/**
 * Wordmarks provisórios do Go2Med e do Coopark.
 *
 * Os dois produtos ainda não têm marca fechada, e uma vitrine com dois logos reais ao
 * lado de dois nomes soltos fica visivelmente torta. Estes wordmarks seguram o lugar
 * até a identidade definitiva chegar, e são declaradamente derivados do GO2PARK: lá o
 * "O" é um anel com miolo cheio e o dígito sai em cor de acento. É esse tratamento que
 * eles repetem, e só ele.
 *
 * **Duas tentativas foram descartadas antes desta, e vale dizer por quê.** Reproduzir o
 * glifo inteiro do "G" (arco aberto com a seta cruzando) virou borrão a 24px de altura.
 * Trocar por um anel com a seta saindo para fora ficou nítido e virou outra coisa: o
 * símbolo de Marte, ♂, num produto de transporte de hospital. Marca derivada precisa
 * herdar o gesto, não inventar um símbolo novo sem quem revise.
 *
 * São SVG inline, e não arquivo em `public/brand/`, porque dependem da fonte da página:
 * um `.svg` servido por `<img>` não enxerga a Inter e cairia no fallback do sistema,
 * quebrando o parentesco. O `textLength` trava a largura de cada pedaço para o anel
 * continuar no lugar do "O" mesmo se a fonte demorar a carregar. Quando o logo
 * definitivo chegar, ele vira arquivo como os outros e este componente sai.
 */

type Props = {
  className?: string;
  /** Cor do nome. O anel interno e o dígito usam `accent`. */
  color?: string;
  accent?: string;
  /** Nome acessível. Vem do dado da marca, não da constante do componente. */
  label?: string;
};

const FONTE = "Inter var, Inter, system-ui, sans-serif";

/** O "O" do GO2PARK: anel grosso com o miolo cheio na cor de acento. */
function Anel({ cx, accent, miolo = true }: { cx: number; accent: string; miolo?: boolean }) {
  return (
    <>
      <circle cx={cx} cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="6" />
      {miolo && <circle cx={cx} cy="20" r="5.5" fill={accent} />}
    </>
  );
}

export function Go2MedWordmark({
  className,
  color = "#1B5FFF",
  accent = "#11B5A8",
  label = "Go2Med",
}: Props) {
  return (
    <svg
      viewBox="0 0 156 40"
      className={cn("h-7 w-auto", className)}
      role="img"
      aria-label={label}
      style={{ color }}
    >
      <text
        x="0"
        y="31"
        fontFamily={FONTE}
        fontSize="32"
        fontWeight="800"
        letterSpacing="-1"
        textLength={24}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        G
      </text>
      <Anel cx={40} accent={accent} />
      <text
        x="57"
        y="31"
        fontFamily={FONTE}
        fontSize="32"
        fontWeight="800"
        letterSpacing="-1"
        textLength={97}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        <tspan fill={accent}>2</tspan>
        MED
      </text>
    </svg>
  );
}

/**
 * O Coopark não é da família Go2: o nome não carrega o "go", e o produto é o oposto do
 * traslado (é a vaga que fica, não a van que anda). O que ele herda é só o tratamento do
 * "O", e os dois anéis encaixados carregam a ideia do nome, que é gente junta negociando
 * em bloco.
 */
export function CooparkWordmark({
  className,
  color = "#29263F",
  accent = "#5D5FEF",
  label = "Coopark",
}: Props) {
  return (
    <svg
      viewBox="0 0 178 40"
      className={cn("h-7 w-auto", className)}
      role="img"
      aria-label={label}
      style={{ color }}
    >
      <text
        x="0"
        y="31"
        fontFamily={FONTE}
        fontSize="32"
        fontWeight="800"
        letterSpacing="-1"
        textLength={23}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        C
      </text>
      <Anel cx={38} accent={accent} miolo={false} />
      <Anel cx={63} accent={accent} />
      <text
        x="80"
        y="31"
        fontFamily={FONTE}
        fontSize="32"
        fontWeight="800"
        letterSpacing="-1"
        textLength={94}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        PARK
      </text>
    </svg>
  );
}
