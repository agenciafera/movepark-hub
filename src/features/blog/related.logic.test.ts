import { describe, expect, it } from "vitest";
import {
  RELACIONADOS_POR_POST,
  escolherRelacionados,
  ordemDoDestino,
  type RelatedPost,
} from "./related.logic";

function post(slug: string, published_at: string): RelatedPost {
  return { id: slug, slug, title: slug, published_at, cover_image_url: null };
}

/** `n` posts com datas distintas, do mais antigo (p0) ao mais novo. */
function acervo(n: number): RelatedPost[] {
  return Array.from({ length: n }, (_, i) =>
    post(`p${i}`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
  );
}

const slugs = (posts: RelatedPost[]) => posts.map((p) => p.slug);

/** Quantos posts do acervo linkam para cada slug, aplicando a escolha a todos. */
function entrantes(posts: RelatedPost[]): Map<string, number> {
  const conta = new Map(posts.map((p) => [p.slug, 0]));
  for (const p of posts) {
    for (const r of escolherRelacionados(posts, p.slug)) {
      conta.set(r.slug, conta.get(r.slug)! + 1);
    }
  }
  return conta;
}

describe("escolherRelacionados", () => {
  it("nunca devolve o próprio post", () => {
    for (const p of acervo(8)) {
      expect(slugs(escolherRelacionados(acervo(8), p.slug))).not.toContain(p.slug);
    }
  });

  it("no meio do acervo, pega os vizinhos imediatos e desempata pelo mais novo", () => {
    // Ordem do acervo: p9 (mais novo) ... p0. O p5 tem p6 e p4 na distância 1, e p7 e p3
    // na distância 2; o terceiro lugar fica com o mais novo dos dois.
    expect(slugs(escolherRelacionados(acervo(10), "p5"))).toEqual(["p7", "p6", "p4"]);
  });

  it("na ponta, completa com quem vem logo depois", () => {
    expect(slugs(escolherRelacionados(acervo(10), "p9"))).toEqual(["p8", "p7", "p6"]);
    expect(slugs(escolherRelacionados(acervo(10), "p0"))).toEqual(["p3", "p2", "p1"]);
  });

  it("sai na ordem do acervo, mais novo primeiro, que é a ordem das datas na tela", () => {
    const escolhidos = escolherRelacionados(acervo(10), "p5");
    const datas = escolhidos.map((p) => Date.parse(p.published_at));
    expect(datas).toEqual([...datas].sort((a, b) => b - a));
  });

  it("com acervo pequeno, devolve o que existe", () => {
    expect(slugs(escolherRelacionados(acervo(2), "p0"))).toEqual(["p1"]);
    expect(escolherRelacionados(acervo(1), "p0")).toEqual([]);
  });

  it("post fora da lista cai nos mais recentes do destino", () => {
    expect(slugs(escolherRelacionados(acervo(5), "outro"))).toEqual(["p4", "p3", "p2"]);
  });

  /**
   * A razão da regra. "Os 3 mais recentes" fazia os mesmos três receberem todos os
   * links, e a cauda (em Viracopos, 19 de 22 posts) não recebia de ninguém.
   */
  it("em todo acervo de 2 a 30 posts, todo post é relacionado de pelo menos um outro", () => {
    for (let n = 2; n <= 30; n++) {
      const sem = [...entrantes(acervo(n))].filter(([, k]) => k === 0).map(([s]) => s);
      expect(sem, `acervo de ${n}`).toEqual([]);
    }
  });

  it("a regra antiga deixava a cauda órfã, e é isso que o teste acima impede", () => {
    const posts = acervo(22);
    const maisRecentes = (slug: string) =>
      ordemDoDestino(posts)
        .filter((p) => p.slug !== slug)
        .slice(0, RELACIONADOS_POR_POST);
    const linkados = new Set(posts.flatMap((p) => slugs(maisRecentes(p.slug))));
    expect(posts.length - linkados.size).toBe(18);
  });

  it("vale também quando várias datas se repetem", () => {
    // A migração do WordPress carimbou lotes no mesmo dia: Viracopos tem 22 posts em 16 datas.
    const posts = ["a", "b", "c", "d", "e", "f", "g"].map((s, i) =>
      post(s, i < 4 ? "2025-06-01T00:00:00+00:00" : `2025-07-0${i}T00:00:00+00:00`),
    );
    expect([...entrantes(posts).values()].every((k) => k > 0)).toBe(true);
  });
});

describe("ordemDoDestino", () => {
  it("mais novo primeiro, e o slug desempata a mesma data", () => {
    const posts = [
      post("b", "2025-06-01T00:00:00+00:00"),
      post("z", "2025-08-01T00:00:00+00:00"),
      post("a", "2025-06-01T00:00:00+00:00"),
    ];
    expect(slugs(ordemDoDestino(posts))).toEqual(["z", "a", "b"]);
  });

  it("não depende da ordem em que o banco devolve", () => {
    const posts = acervo(6);
    const invertido = [...posts].reverse();
    expect(slugs(escolherRelacionados(invertido, "p2"))).toEqual(
      slugs(escolherRelacionados(posts, "p2")),
    );
  });
});
