/**
 * Paginação, busca e filtro da listagem do blog.
 *
 * Lógica pura, fora do componente, porque é ela que decide quais URLs existem:
 * `getStaticPaths` pré-renderiza uma página por fatia, e um erro de contagem aqui
 * some com posts do site sem quebrar nada visível.
 */

/** Posts por página. O WordPress usava 10; 12 fecha a grade de 3 colunas. */
export const PAGE_SIZE = 12;

export type ListablePost = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string;
  category: { slug: string; name: string } | null;
  author: { slug: string; name: string } | null;
  destination: { slug: string; name: string } | null;
  tags: { slug: string; name: string }[];
};

export function totalPages(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/** Fatia da página. Página fora do intervalo devolve vazio, e a rota trata como 404. */
export function pageSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  if (page < 1) return [];
  return items.slice((page - 1) * pageSize, page * pageSize);
}

/**
 * URL de uma página da listagem.
 *
 * A página 1 é `/blog/`, não `/blog/page/1/`: duas URLs com o mesmo conteúdo é
 * conteúdo duplicado, e a raiz é a que o Google já conhece.
 */
export function pageHref(page: number, base = "/blog"): string {
  return page <= 1 ? `${base}/` : `${base}/page/${page}/`;
}

/**
 * Janela de páginas para a barra de paginação: primeira, última e as vizinhas da
 * atual. `null` é a lacuna, renderizada como reticências.
 */
export function pageWindow(current: number, total: number, raio = 1): (number | null)[] {
  if (total <= 1) return [1];

  const paginas = new Set<number>([1, total]);
  for (let p = current - raio; p <= current + raio; p++) {
    if (p >= 1 && p <= total) paginas.add(p);
  }

  const ordenadas = [...paginas].sort((a, b) => a - b);
  const saida: (number | null)[] = [];
  let anterior = 0;
  for (const p of ordenadas) {
    if (anterior && p - anterior > 1) saida.push(null);
    saida.push(p);
    anterior = p;
  }
  return saida;
}

/** Tira acento e caixa, para "traslado" achar "Traslado" e "aeroporto" achar "Aeroporto". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca por título, resumo, categoria, aeroporto e tag.
 *
 * Todos os termos precisam casar (E, não OU): com 93 posts sobre o mesmo assunto,
 * "preço guarulhos" com OU devolveria quase o acervo inteiro.
 */
export function searchPosts<T extends ListablePost>(posts: T[], query: string): T[] {
  const termos = normalize(query).split(/\s+/).filter(Boolean);
  if (!termos.length) return posts;

  return posts.filter((post) => {
    const alvo = normalize(
      [
        post.title,
        post.excerpt ?? "",
        post.category?.name ?? "",
        post.destination?.name ?? "",
        ...post.tags.map((t) => t.name),
      ].join(" "),
    );
    return termos.every((termo) => alvo.includes(termo));
  });
}

export type BlogKind = "index" | "categoria" | "tag" | "autor" | "aeroporto";

export type BlogPath = { kind: BlogKind; slug: string | null; page: number; base: string };

const EIXOS = new Set(["categoria", "tag", "autor", "aeroporto"]);

/**
 * Lê eixo, slug e página direto da URL.
 *
 * Existe porque o dado do loader não chega em toda navegação: o `vite-react-ssg`
 * indexa os dados assados no build por caminho SEM barra final (`/blog/tag/x`),
 * e os links do blog levam a barra, que é a canônica herdada do WordPress. Ao
 * clicar de dentro do site a chave não casa e a página vinha vazia. Com o caminho
 * lido aqui, a listagem se reconstrói do cliente e não depende mais do build.
 */
export function parseBlogPath(pathname: string): BlogPath {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  // seg[0] é sempre "blog"
  const resto = seg.slice(1);

  let page = 1;
  const iPage = resto.indexOf("page");
  if (iPage >= 0) {
    page = Math.max(1, Number(resto[iPage + 1]) || 1);
    resto.splice(iPage, 2);
  }

  if (resto.length >= 2 && EIXOS.has(resto[0])) {
    const kind = resto[0] as BlogKind;
    return { kind, slug: resto[1], page, base: `/blog/${kind}/${resto[1]}` };
  }

  return { kind: "index", slug: null, page, base: "/blog" };
}

export type BlogFilter = {
  categoria?: string;
  tag?: string;
  autor?: string;
  aeroporto?: string;
};

/** Filtra por um eixo de taxonomia. Os eixos se acumulam quando vierem juntos. */
export function filterPosts<T extends ListablePost>(posts: T[], filtro: BlogFilter): T[] {
  return posts.filter((post) => {
    if (filtro.categoria && post.category?.slug !== filtro.categoria) return false;
    if (filtro.autor && post.author?.slug !== filtro.autor) return false;
    if (filtro.aeroporto && post.destination?.slug !== filtro.aeroporto) return false;
    if (filtro.tag && !post.tags.some((t) => t.slug === filtro.tag)) return false;
    return true;
  });
}
