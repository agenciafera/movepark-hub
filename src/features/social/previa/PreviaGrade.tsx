import { Copy } from "@phosphor-icons/react";
import {
  AVATAR,
  CELULAS_DA_GRADE,
  FONTE_DO_INSTAGRAM,
  type PostDaGrade,
  type PostDaPrevia,
  postsDaGrade,
  USUARIO,
} from "./previa.logic";

type Celula = { chave: string; url: string | null; alt: string; carrossel: boolean };

/**
 * A grade do perfil: 3 colunas, células 3:4 com recorte central (o formato da grade desde 2025).
 * A primeira célula é a capa deste post; depois vêm até 5 outros da fila e, no que faltar,
 * quadrados cinza. Serve para conferir se o título da capa sobrevive ao recorte. Só visual.
 * Spec: docs/specs/instagram-fila-de-publicacao.md
 */
export function PreviaGrade({
  post,
  fila = [],
}: {
  post: Pick<PostDaPrevia, "id" | "slides">;
  fila?: PostDaGrade[];
}) {
  const outros = postsDaGrade(post.id, fila);
  const capa = post.slides[0];

  const celulas: Celula[] = Array.from({ length: CELULAS_DA_GRADE }, (_, i) => {
    if (i === 0) {
      return {
        chave: "este",
        url: capa?.url ?? null,
        alt: capa?.alt ?? "Capa deste post",
        carrossel: post.slides.length > 1,
      };
    }
    const outro = outros[i - 1];
    if (!outro) return { chave: `vazia-${i}`, url: null, alt: "", carrossel: false };
    return {
      chave: outro.id,
      url: outro.slides[0]?.url ?? null,
      alt: outro.slides[0]?.alt ?? "",
      carrossel: outro.slides.length > 1,
    };
  });

  return (
    <div className="space-y-3">
      <div
        style={{ fontFamily: FONTE_DO_INSTAGRAM }}
        className="mx-auto w-[375px] max-w-full overflow-hidden rounded-xl border border-hairline bg-white text-black"
      >
        <header className="flex items-center gap-4 px-4 py-4">
          <img
            data-testid="previa-avatar"
            src={AVATAR}
            alt=""
            className="size-16 rounded-full object-cover"
          />
          <span className="text-base font-semibold">{USUARIO}</span>
        </header>

        <div data-testid="grade" className="grid grid-cols-3 gap-0.5">
          {celulas.map((c) => (
            <div
              key={c.chave}
              data-testid="celula-grade"
              className="relative aspect-[3/4] overflow-hidden bg-[#efefef]"
            >
              {c.url && <img src={c.url} alt={c.alt} className="size-full object-cover" />}
              {c.carrossel && (
                <span
                  role="img"
                  aria-label="Carrossel"
                  className="absolute right-1.5 top-1.5 text-white drop-shadow"
                >
                  <Copy aria-hidden="true" size={18} weight="fill" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="mx-auto max-w-[375px] text-pretty text-center text-xs text-muted">
        A grade recorta a capa em 3:4. Confira se o título da capa continua inteiro.
      </p>
    </div>
  );
}
