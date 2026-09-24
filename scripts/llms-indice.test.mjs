import { describe, expect, it } from "vitest";

import { agruparGuiasPorDestino, rebaixarHeadings } from "./llms-indice.mjs";

describe("rebaixarHeadings", () => {
  it("desce o corpo da FAQ dois níveis, para caber sob a pergunta em `###`", () => {
    const corpo = ["## Check-in no estacionamento", "", "Mostre o QR Code.", "", "### Chegando de madrugada"].join("\n");
    expect(rebaixarHeadings(corpo, 2)).toBe(
      ["#### Check-in no estacionamento", "", "Mostre o QR Code.", "", "##### Chegando de madrugada"].join("\n"),
    );
  });

  it("não passa de `######`, que é onde o Markdown para", () => {
    expect(rebaixarHeadings("##### Fundo do poço", 2)).toBe("###### Fundo do poço");
  });

  it("deixa em paz o `#` que é conteúdo, não heading", () => {
    const md = ["```bash", "# isto é comentário de shell", "```", "", "Custa R$ 30 # não é heading"].join("\n");
    expect(rebaixarHeadings(md, 2)).toBe(md);
  });

  it("aguenta corpo vazio sem quebrar o build", () => {
    expect(rebaixarHeadings(null, 2)).toBe("");
  });
});

describe("agruparGuiasPorDestino", () => {
  const destinos = [
    { id: "d-gru", short_name: "Guarulhos (GRU)", name: "Aeroporto de Guarulhos", code: "GRU" },
    { id: "d-vcp", short_name: "Viracopos (VCP)", name: "Aeroporto de Viracopos", code: "VCP" },
  ];

  it("agrupa na ordem dos destinos e não repete o código no título", () => {
    const posts = [
      { slug: "a", destination_id: "d-vcp" },
      { slug: "b", destination_id: "d-gru" },
      { slug: "c", destination_id: "d-vcp" },
    ];
    const grupos = agruparGuiasPorDestino(posts, destinos);
    expect(grupos.map((g) => g.titulo)).toEqual(["Guarulhos (GRU)", "Viracopos (VCP)"]);
    expect(grupos[1].posts.map((p) => p.slug)).toEqual(["a", "c"]);
  });

  it("recolhe o post de destino despublicado em vez de deixá-lo fora do índice", () => {
    // Lisboa tem `is_published = false`, então não chega na lista de destinos do build.
    const posts = [
      { slug: "gru-1", destination_id: "d-gru" },
      { slug: "lisboa-1", destination_id: "d-lis" },
      { slug: "sem-praca", destination_id: null },
    ];
    const grupos = agruparGuiasPorDestino(posts, destinos);
    expect(grupos.at(-1)).toEqual({
      titulo: "Outros aeroportos",
      posts: [{ slug: "lisboa-1", destination_id: "d-lis" }, { slug: "sem-praca", destination_id: null }],
    });
  });

  it("devolve todo post que recebeu, que é a promessa do arquivo", () => {
    const posts = Array.from({ length: 40 }, (_, i) => ({
      slug: `p${i}`,
      destination_id: i % 3 === 0 ? "d-gru" : i % 3 === 1 ? "d-vcp" : "d-fora",
    }));
    const grupos = agruparGuiasPorDestino(posts, destinos);
    expect(grupos.flatMap((g) => g.posts)).toHaveLength(posts.length);
  });

  it("não inventa grupo de sobra quando todo post tem praça publicada", () => {
    const grupos = agruparGuiasPorDestino([{ slug: "a", destination_id: "d-gru" }], destinos);
    expect(grupos.map((g) => g.titulo)).toEqual(["Guarulhos (GRU)"]);
  });
});
