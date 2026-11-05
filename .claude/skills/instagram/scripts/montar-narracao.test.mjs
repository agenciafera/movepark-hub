import { describe, expect, it } from "vitest";
import {
  argsDoFfmpeg,
  argsDoRender,
  decimoAcima,
  deixasDaLegenda,
  duracaoDaCena,
  linhaDoTempo,
  partirEmDeixas,
  quebrarLinhas,
  srt,
  tempoSrt,
} from "./montar-narracao.mjs";

describe("montar-narracao", () => {
  it("a cena dura a fala mais a folga, fechada no décimo, nunca menos que o mínimo", () => {
    expect(decimoAcima(12.8)).toBe(12.8);
    expect(decimoAcima(12.81)).toBe(12.9);
    expect(duracaoDaCena(12.8)).toBe(13.8);
    expect(duracaoDaCena(1.2)).toBe(3);
    expect(duracaoDaCena(7.21, { folga: 0.5, minimo: 2 })).toBe(7.8);
    expect(() => duracaoDaCena(-1)).toThrow(/inválida/);
  });

  it("a linha do tempo encadeia as cenas sem buraco e sem sobreposição", () => {
    const linha = linhaDoTempo([
      { html: "a.html", audio: 2 },
      { html: "b.html", audio: 4.25 },
      { html: "c.html", audio: 1 },
    ]);
    expect(linha.map((c) => c.inicio)).toEqual([0, 3, 8.3]);
    expect(linha.map((c) => c.duracao)).toEqual([3, 5.3, 3]);
    expect(argsDoRender(linha)).toBe("a.html:3 b.html:5.3 c.html:3");
  });

  it("parte a legenda em deixas que cabem em duas linhas, sem atravessar o ponto", () => {
    const texto =
      "Sete diárias: R$ 420 no oficial, no balcão, ou a partir de R$ 189 reservando com 72 horas de antecedência. R$ 200 na BePark.";
    const deixas = partirEmDeixas(texto);
    expect(deixas.length).toBeGreaterThan(1);
    for (const d of deixas) expect(d.length).toBeLessThanOrEqual(84);
    expect(deixas.at(-1)).toBe("R$ 200 na BePark.");
    expect(deixas.join(" ")).toBe(texto);
    expect(partirEmDeixas("   ")).toEqual([]);
  });

  it("quebra a deixa longa em duas linhas perto do meio", () => {
    expect(quebrarLinhas("curta")).toBe("curta");
    const duas = quebrarLinhas("A van sai a cada 20 minutos, 24 horas por dia, e o trajeto leva uns 10 minutos");
    const linhas = duas.split("\n");
    expect(linhas).toHaveLength(2);
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(42);
  });

  it("reparte o tempo da fala entre as deixas pelo tamanho do texto, dentro da cena", () => {
    const linha = linhaDoTempo([{ html: "a.html", audio: 10 }], { folga: 1 });
    const deixas = deixasDaLegenda(linha, ["Primeira frase de teste. Segunda frase, um pouco maior que a primeira."]);
    expect(deixas).toHaveLength(2);
    expect(deixas[0].inicio).toBe(0);
    expect(deixas[1].fim).toBeCloseTo(10, 6);
    expect(deixas[1].fim - deixas[1].inicio).toBeGreaterThan(deixas[0].fim - deixas[0].inicio);
  });

  it("escreve o SRT no formato do YouTube", () => {
    expect(tempoSrt(0)).toBe("00:00:00,000");
    expect(tempoSrt(83.456)).toBe("00:01:23,456");
    const texto = srt([{ inicio: 0, fim: 1.5, texto: "Olá" }, { inicio: 1.5, fim: 3, texto: "a\nb" }]);
    expect(texto).toBe("1\n00:00:00,000 --> 00:00:01,500\nOlá\n\n2\n00:00:01,500 --> 00:00:03,000\na\nb\n");
  });

  it("o ffmpeg atrasa cada clipe para o início da cena e fecha a trilha no fim do vídeo", () => {
    const linha = linhaDoTempo([{ html: "a.html", audio: 2 }, { html: "b.html", audio: 2 }]);
    const args = argsDoFfmpeg(["a.mp3", "b.mp3"], linha, "trilha.wav");
    const filtro = args[args.indexOf("-filter_complex") + 1];
    expect(filtro).toContain("adelay=0|0[a0]");
    expect(filtro).toContain("adelay=3000|3000[a1]");
    expect(filtro).toContain("amix=inputs=2:normalize=0");
    expect(filtro).toContain("apad=whole_dur=6");
    expect(args.slice(-1)).toEqual(["trilha.wav"]);
    expect(args).toContain("pcm_s16le");
    expect(args[args.indexOf("-t") + 1]).toBe("6");
  });

  it("com ritmo, cada clipe passa pelo atempo antes de entrar na linha do tempo", () => {
    const linha = linhaDoTempo([{ html: "a.html", audio: 2 }]);
    const filtro = argsDoFfmpeg(["a.mp3"], linha, "t.wav", 1.1)[argsDoFfmpeg(["a.mp3"], linha, "t.wav", 1.1).indexOf("-filter_complex") + 1];
    expect(filtro).toContain("[0:a]atempo=1.1,aresample=48000");
    expect(argsDoFfmpeg(["a.mp3"], linha, "t.wav").join(" ")).not.toContain("atempo");
  });
});
