import * as React from "react";
import {
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  ChatCircle,
  DotsThree,
  Heart,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  AVATAR,
  comentariosFicticios,
  FONTE_DO_INSTAGRAM,
  formatarDataPrevia,
  numerosFicticios,
  partirLegendaFeed,
  type PostDaPrevia,
  proximoIndice,
  tokenizarLegenda,
  USUARIO,
} from "./previa.logic";

/** Hashtag e menção no azul da legenda do Instagram. */
function Legenda({ texto }: { texto: string }) {
  return (
    <>
      {tokenizarLegenda(texto).map((t, i) =>
        t.tipo === "texto" ? (
          <React.Fragment key={i}>{t.valor}</React.Fragment>
        ) : (
          <span key={i} className="text-[#00376b]">
            {t.valor}
          </span>
        ),
      )}
    </>
  );
}

/**
 * O post como aparece no feed do Instagram: cabeçalho, imagem 4:5 com carrossel, ações, curtidas,
 * legenda com o "mais", comentários e data. Só visual: curtidas e comentários são fictícios e
 * nada é enviado nem gravado. Spec: docs/specs/instagram-fila-de-publicacao.md
 */
export function PreviaFeed({ post }: { post: PostDaPrevia }) {
  const [indice, setIndice] = React.useState(0);
  const [expandida, setExpandida] = React.useState(false);

  const total = post.slides.length;
  const atual = Math.min(indice, Math.max(total - 1, 0));
  const slide = post.slides[atual];
  const { curtidas, comentarios } = numerosFicticios(post.id);
  const respostas = comentariosFicticios(post.id);
  const { visivel, temMais } = partirLegendaFeed(post.caption);

  return (
    <div className="space-y-3">
      <div
        data-testid="previa-feed"
        style={{ fontFamily: FONTE_DO_INSTAGRAM }}
        className="mx-auto w-[375px] max-w-full overflow-hidden rounded-xl border border-hairline bg-white text-sm text-black"
      >
        <header className="flex items-center gap-3 px-3 py-2.5">
          <img
            data-testid="previa-avatar"
            src={AVATAR}
            alt=""
            className="size-8 rounded-full object-cover"
          />
          <span className="font-semibold">{USUARIO}</span>
          <DotsThree aria-hidden="true" size={24} weight="bold" className="ml-auto" />
        </header>

        <div className="relative aspect-[4/5] bg-[#efefef]">
          {slide && (
            <img src={slide.url} alt={slide.alt ?? ""} className="size-full object-cover" />
          )}
          {total > 1 && (
            <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
              {`${atual + 1}/${total}`}
            </span>
          )}
          {atual > 0 && (
            <button
              type="button"
              aria-label="Slide anterior"
              onClick={() => setIndice(proximoIndice(atual, total, -1))}
              className="absolute left-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black hover:bg-white"
            >
              <CaretLeft aria-hidden="true" size={16} weight="bold" />
            </button>
          )}
          {atual < total - 1 && (
            <button
              type="button"
              aria-label="Próximo slide"
              onClick={() => setIndice(proximoIndice(atual, total, 1))}
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black hover:bg-white"
            >
              <CaretRight aria-hidden="true" size={16} weight="bold" />
            </button>
          )}
        </div>

        {total > 1 && (
          <div aria-hidden="true" className="flex justify-center gap-1 pt-3">
            {post.slides.map((s, i) => (
              <span
                key={s.path}
                data-testid="previa-ponto"
                data-atual={i === atual}
                className={cn("size-1.5 rounded-full", i === atual ? "bg-[#0095f6]" : "bg-[#c7c7c7]")}
              />
            ))}
          </div>
        )}

        <div aria-hidden="true" className="flex items-center gap-4 px-3 pt-2.5">
          <Heart size={24} />
          <ChatCircle size={24} />
          <PaperPlaneTilt size={24} />
          <BookmarkSimple size={24} className="ml-auto" />
        </div>

        <p className="px-3 pt-2">
          Curtido por <strong className="font-semibold">camila.viaja</strong> e outras{" "}
          <strong className="font-semibold">{curtidas}</strong> pessoas
        </p>

        <p data-testid="previa-legenda" className="whitespace-pre-line px-3 pt-1 leading-[18px]">
          <span className="font-semibold">{USUARIO}</span>{" "}
          <Legenda texto={expandida ? post.caption : visivel} />
          {temMais && !expandida && (
            <>
              {" "}
              <button type="button" onClick={() => setExpandida(true)} className="text-[#737373]">
                … mais
              </button>
            </>
          )}
        </p>

        <p className="px-3 pt-1 text-[#737373]">Ver todos os {comentarios} comentários</p>
        <div data-testid="previa-comentarios" className="space-y-0.5 px-3 pt-1">
          {respostas.map((c) => (
            <p key={c.usuario}>
              <span className="font-semibold">{c.usuario}</span> {c.texto}
            </p>
          ))}
        </div>

        <p className="px-3 pb-3 pt-1.5 text-xs text-[#737373]">
          {formatarDataPrevia(post.scheduled_at)}
        </p>
      </div>

      <p className="text-center text-xs text-muted">Simulação: curtidas e comentários fictícios.</p>
    </div>
  );
}
