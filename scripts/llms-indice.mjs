/**
 * Lógica pura dos índices que os agentes leem (`llms.txt` e `llms-full.txt`).
 *
 * Mora aqui, fora do `generate-geo-artifacts.mjs`, porque o gerador abre conexão com o
 * banco no topo do arquivo: importá-lo num teste dispararia o build inteiro. As duas
 * funções abaixo não sabem de rede nem de disco, então o teste prende o contrato sem
 * depender do retrato do dia.
 */

/**
 * Rebaixa os headings de um Markdown que vai ser embutido dentro de outro documento.
 *
 * O `body_md` da FAQ é escrito para a página da pergunta, onde o `# ` é o título e o corpo
 * abre em `## `. Ao colar esse mesmo corpo no `llms-full.txt`, onde a pergunta já é `### `,
 * o `## ` do corpo virava irmão de "## FAQ: perguntas gerais": quem fatia o arquivo por
 * nível de heading lia a resposta como seção de topo do site.
 *
 * Cerca de código é preservada, porque `#` dentro de bloco cercado é conteúdo, não heading.
 */
export function rebaixarHeadings(md, niveis) {
  let dentroDeCerca = false;
  return String(md ?? "")
    .split("\n")
    .map((linha) => {
      if (/^\s*(```|~~~)/.test(linha)) {
        dentroDeCerca = !dentroDeCerca;
        return linha;
      }
      if (dentroDeCerca) return linha;
      const m = /^(#{1,6})(\s)/.exec(linha);
      if (!m) return linha;
      // Markdown para em `######`: passar disso devolveria texto com `#` literal na tela.
      const novo = "#".repeat(Math.min(6, m[1].length + niveis));
      return novo + linha.slice(m[1].length);
    })
    .join("\n");
}

/**
 * Agrupa os guias do blog pela praça que cada um responde, na ordem em que os destinos
 * aparecem no site.
 *
 * O grupo final recolhe o que sobrou. Post de destino despublicado (os de Lisboa hoje,
 * com `is_published = false`) continua com página no ar e URL própria: agrupar só pelo
 * que o build conhece o deixaria fora do índice, em silêncio. Por isso a função devolve
 * sempre todos os posts recebidos, e o chamador confere a soma.
 */
export function agruparGuiasPorDestino(posts, destinations, { rotuloSolto = "Outros aeroportos" } = {}) {
  const porDestino = new Map();
  for (const p of posts) {
    const chave = p.destination_id ?? "sem-destino";
    if (!porDestino.has(chave)) porDestino.set(chave, []);
    porDestino.get(chave).push(p);
  }

  const grupos = [];
  const agrupados = new Set();
  for (const d of destinations) {
    const doDestino = porDestino.get(d.id) ?? [];
    if (doDestino.length === 0) continue;
    for (const p of doDestino) agrupados.add(p);
    // `short_name` já vem com o código entre parênteses ("Viracopos (VCP)"): tira antes de
    // recolocar, senão o título sai "Viracopos (VCP) (VCP)".
    const nome = String(d.short_name ?? d.name ?? "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const titulo = /^[A-Z]{3}$/.test(d.code ?? "") ? `${nome} (${d.code})` : nome;
    grupos.push({ titulo, posts: doDestino });
  }

  const soltos = posts.filter((p) => !agrupados.has(p));
  if (soltos.length > 0) grupos.push({ titulo: rotuloSolto, posts: soltos });
  return grupos;
}
