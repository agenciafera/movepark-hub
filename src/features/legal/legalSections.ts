/**
 * Índice dos documentos legais a partir do próprio HTML.
 *
 * O texto de `/termos` e `/privacidade` vem do `legal_document`, versionado, porque
 * `terms_acceptance.document_version_id` aponta pra versão exata que o cliente leu.
 * Reescrever esse texto como dado tipado quebraria a prova do aceite, então o
 * índice é derivado: acha os `h2`, dá um `id` a cada um e devolve a lista.
 *
 * Assim o jurídico continua editando no Manager como sempre, e o índice aparece
 * sozinho.
 */

export type LegalSection = { id: string; title: string };

/** Slug de âncora: sem acento, sem símbolo, com sufixo quando repete. */
function slugify(texto: string, usados: Set<string>): string {
  const base =
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "secao";

  // Seção de documento legal quase sempre começa com número ("2. Cancelamento"),
  // e id iniciado por dígito é HTML válido mas seletor CSS inválido: qualquer
  // `querySelector("#2-...")` estoura. O prefixo evita isso sem escapar nada.
  const inicial = /^\d/.test(base) ? `secao-${base}` : base;

  let slug = inicial;
  let n = 2;
  while (usados.has(slug)) slug = `${inicial}-${n++}`;
  usados.add(slug);
  return slug;
}

/**
 * Recebe o HTML já sanitizado e devolve o mesmo HTML com `id` nos `h2`, mais a
 * lista de seções. Sem `DOMParser` (build SSG roda no Node) devolve o HTML intacto
 * e nenhuma seção: a página segue legível, só sem índice.
 */
export function withSectionIds(html: string): { html: string; sections: LegalSection[] } {
  if (!html || typeof DOMParser === "undefined") return { html, sections: [] };

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const usados = new Set<string>();
  const sections: LegalSection[] = [];

  doc.body.querySelectorAll("h2").forEach((h) => {
    const title = (h.textContent ?? "").trim();
    if (!title) return;
    const id = h.id || slugify(title, usados);
    h.id = id;
    // A âncora tem que parar abaixo da topbar sticky.
    h.classList.add("scroll-mt-24");
    sections.push({ id, title });
  });

  return { html: doc.body.innerHTML, sections };
}
