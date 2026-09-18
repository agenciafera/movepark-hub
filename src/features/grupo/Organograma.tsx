import { MARCAS, ESTAGIO_ROTULO } from "./marcas";
import { MarcaLogo } from "./MarcaLogo";

/**
 * A estrutura da casa em um desenho.
 *
 * O que ele pode e o que ele NÃO pode dizer (docs/specs/grupo-movepark.md §3): a caixa
 * de cima é a **marca** Movepark, não uma holding, e os quatro ramos são **produtos**,
 * não subsidiárias. A linha de baixo é o que impede a leitura errada, porque nomeia quem
 * fatura cada um hoje, e a Go2Park ainda fatura pela Agência Fera.
 *
 * Os conectores só aparecem do tablet para cima. Em 375px, quatro ramos com linha viram
 * um emaranhado de 2px: lá o desenho vira lista, que é o que cabe num polegar.
 */
export function Organograma() {
  return (
    <div className="flex flex-col items-center">
      {/* A casa */}
      <div className="flex flex-col items-center gap-2 rounded-md border border-hairline bg-canvas px-6 py-4 shadow-sm">
        <img
          src="/brand/logo-movepark.svg"
          alt="Movepark"
          className="h-7 w-auto"
          loading="lazy"
          decoding="async"
        />
        <span className="text-caption text-muted">a casa</span>
      </div>

      {/* Tronco. Some junto com a barra e os ramos: sozinho ele desce e termina no vão
          entre os dois primeiros cartões, virando um risco solto no meio da tela. */}
      <div className="h-6 w-px tablet:h-8 tablet:bg-hairline" aria-hidden />

      <div className="relative w-full">
        {/* Barra horizontal e ramos: só onde cabem. */}
        <div
          className="absolute left-[12.5%] right-[12.5%] top-0 hidden border-t border-hairline tablet:block"
          aria-hidden
        />
        <ul className="grid grid-cols-2 gap-4 tablet:grid-cols-4 tablet:gap-5">
          {MARCAS.map((m) => (
            <li key={m.id} className="relative flex flex-col tablet:pt-8">
              {/* Ramo vertical até o cartão. */}
              <span
                className="absolute left-1/2 top-0 hidden h-8 w-px bg-hairline tablet:block"
                aria-hidden
              />
              <div
                className="flex h-full flex-col items-center gap-3 rounded-md border border-hairline bg-canvas px-4 py-5 text-center"
                style={{ borderTopColor: m.cor, borderTopWidth: 3 }}
              >
                <MarcaLogo id={m.id} />
                <span
                  className="rounded-full px-2.5 py-0.5 text-caption font-bold"
                  style={{
                    color: m.estagio === "no-ar" ? "#0F7A3D" : "#6A6A6A",
                    backgroundColor: m.estagio === "no-ar" ? "#E6F6EC" : "#F0F0F1",
                  }}
                >
                  {ESTAGIO_ROTULO[m.estagio]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
