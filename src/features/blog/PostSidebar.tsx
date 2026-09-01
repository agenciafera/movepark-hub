import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CoverImage } from "./CoverImage";
import { formatDate } from "@/lib/format";
import type { BlogPost, Destination } from "@/types/domain";
import { caminhoDestino } from "@/lib/urls";

type Props = {
  destination: Pick<Destination, "name" | "slug" | "public_slug" | "is_published"> | null;
  relacionados: BlogPost[];
};

/**
 * Coluna lateral do post: o CTA do destino e o que ler depois.
 *
 * Os dois viviam no rodapé, ou seja, depois de seis minutos de leitura, que é
 * onde o leitor já foi embora. Na lateral eles acompanham a leitura, e o CTA
 * fica grudado no topo enquanto o texto rola.
 *
 * A coluna só existe quando tem o que mostrar. Post sem destino e sem
 * relacionado (Navegantes, que ainda não é destino no Hub) deixaria 300px de
 * branco ao lado do texto, e aí a página fica pior que sem lateral nenhuma.
 */
export function PostSidebar({ destination, relacionados }: Props) {
  /*
    `self-start` antes do `sticky`: por padrão o item da grade estica até a
    altura da linha, e um elemento do tamanho da própria linha nunca tem por
    onde grudar. Encolhido ao conteúdo, ele volta a ter espaço para rolar.

    O teto de altura é o seguro para tela baixa: grudado, um bloco mais alto que
    a janela deixaria o último relacionado fora de alcance pelo artigo inteiro,
    já que o `sticky` só solta quando a linha da grade acaba. Em tela normal a
    lateral não chega perto do teto e nada muda.
  */
  return (
    <aside className="mt-12 flex flex-col gap-8 transition-[top] duration-300 ease-out motion-reduce:transition-none print:hidden desktop:sticky desktop:top-[calc(var(--topbar-offset,5rem)+1rem)] desktop:mt-0 desktop:max-h-[calc(100dvh-7rem)] desktop:self-start desktop:overflow-y-auto desktop:overscroll-contain">
      {relacionados.length > 0 && (
        <nav aria-label="Leia também">
          <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
            Leia também
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {relacionados.map((p) => (
              <li key={p.id}>
                <Link to={`/blog/${p.slug}/`} className="group flex gap-3">
                  {/*
                    `self-start` é o que segura a proporção da miniatura. O item
                    de flex estica até a altura da linha por padrão, e altura
                    definida vence `aspect-ratio`: a foto crescia junto com o
                    título, então título de três linhas dava miniatura de 120px e
                    título de duas dava 100px, na mesma coluna. Encostada no topo
                    ela volta aos 64px que a proporção 3:2 manda.
                  */}
                  {p.cover_image_url && (
                    <CoverImage
                      src={p.cover_image_url}
                      alt=""
                      widths={[200, 400]}
                      sizes="96px"
                      className="w-24 shrink-0 self-start rounded-sm"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-3 block text-body-sm font-semibold text-ink group-hover:underline">
                      {p.title}
                    </span>
                    <span className="mt-1 block text-caption-sm text-muted">
                      {formatDate(p.published_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/*
        O CTA por destino é o motivo de `destination_id` existir: sem ele o post
        preserva o ranking e não tem para onde mandar o leitor.
      */}
      {/*
        Só com a página do destino no ar. Portugal tem parceiro e não tem
        `/estacionamentos/aeroporto-lisboa`, porque o `destination` está despublicado: o
        botão existia e levava a lugar nenhum em todo post de Lisboa, Porto e Faro.
      */}
      {destination?.is_published && (
        <div className="rounded-md bg-mp-primary p-5">
          <h2 className="text-display-sm text-white">Vai viajar por {destination.name}?</h2>
          <p className="mt-2 text-body-sm leading-relaxed text-white/85">
            Compare os estacionamentos parceiros e garanta sua vaga antes de sair de casa.
          </p>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to={caminhoDestino(destination.public_slug ?? destination.slug)}>Ver estacionamentos</Link>
          </Button>
        </div>
      )}
    </aside>
  );
}
