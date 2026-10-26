import { describe, expect, it } from "vitest";
import { ALTURA, argsDoFfmpeg, conferirVideo, FPS, LARGURA, lerCena, quadrosDa } from "./render-reel.mjs";

/** ffprobe de um reel que a Meta aceita: o padrão da casa. */
const PROBE_OK = {
  format: { duration: "29.066667", bit_rate: "1273163" },
  streams: [
    { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1080, height: 1920, avg_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ],
};
const MB = 1024 * 1024;
const com = (video = {}, audio = {}, format = {}) => ({
  format: { ...PROBE_OK.format, ...format },
  streams: [{ ...PROBE_OK.streams[0], ...video }, { ...PROBE_OK.streams[1], ...audio }],
});

describe("render-reel", () => {
  it("o reel é 9:16 em 1080x1920, a 30 fps", () => {
    expect(LARGURA / ALTURA).toBeCloseTo(9 / 16, 5);
    expect(FPS).toBe(30);
  });

  it("lê cena:segundos, com ponto ou vírgula", () => {
    expect(lerCena("cena-01.html:3.5")).toEqual({ html: "cena-01.html", segundos: 3.5 });
    expect(lerCena("pasta/cena-02.html:4,2")).toEqual({ html: "pasta/cena-02.html", segundos: 4.2 });
    expect(lerCena("cena.htm:3")).toEqual({ html: "cena.htm", segundos: 3 });
  });

  it("recusa cena sem duração, curta demais ou longa demais", () => {
    expect(() => lerCena("cena-01.html")).toThrow(/<cena.html>:<segundos>/);
    expect(() => lerCena("cena-01.jpg:3")).toThrow(/<cena.html>:<segundos>/);
    expect(() => lerCena("cena-01.html:0.5")).toThrow(/pelo menos 1 segundo/);
    expect(() => lerCena("cena-01.html:25")).toThrow(/Divida/);
  });

  it("a soma dos quadros bate com a soma das durações", () => {
    expect(quadrosDa(3.2)).toBe(96);
    expect(quadrosDa(4.2)).toBe(126);
    const cenas = [3.2, 3.5, 3.5, 3.8, 4.2, 3.8, 3.5, 3.5];
    expect(cenas.reduce((s, c) => s + quadrosDa(c), 0)).toBe(Math.round(29.0 * FPS));
  });

  it("o ffmpeg sai no formato da Meta: H.264 4:2:0, AAC 48 kHz, moov no início e sem edit list", () => {
    const args = argsDoFfmpeg("/tmp/reel.mp4").join(" ");
    expect(args).toContain("-f image2pipe -framerate 30 -c:v mjpeg -i -");
    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(args).toContain("-c:v libx264");
    expect(args).toContain("-pix_fmt yuv420p");
    expect(args).toContain("-c:a aac");
    expect(args).toContain("-ar 48000");
    expect(args).toContain("-movflags +faststart");
    expect(args).toContain("-use_editlist 0");
    expect(args.endsWith("/tmp/reel.mp4")).toBe(true);
  });

  it("o padrão da casa passa sem bloqueio nem aviso", () => {
    expect(conferirVideo(PROBE_OK, 4.4 * MB)).toEqual({ bloqueios: [], avisos: [] });
  });

  it("bloqueia o que a Meta recusa", () => {
    const casos = [
      [com({ codec_name: "vp9" }), /H.264 ou HEVC/],
      [com({ pix_fmt: "yuv444p" }), /4:2:0/],
      [com({ width: 2160, height: 3840 }), /máximo é 1920/],
      [com({ avg_frame_rate: "15/1" }), /de 23 a 60/],
      [com({}, {}, { duration: "2.5" }), /mínimo 3 s/],
      [com({}, {}, { bit_rate: "30000000" }), /máximo é 25/],
      [com({}, { codec_name: "opus" }), /AAC/],
      [com({}, { sample_rate: "96000" }), /48 kHz/],
    ];
    for (const [probe, motivo] of casos) {
      const { bloqueios } = conferirVideo(probe, 4 * MB);
      expect(bloqueios.join(" ")).toMatch(motivo);
    }
    expect(conferirVideo(PROBE_OK, 301 * MB).bloqueios.join(" ")).toMatch(/300 MB/);
    expect(conferirVideo({ format: {}, streams: [] }, 0).bloqueios).toEqual(["O arquivo não tem faixa de vídeo."]);
  });

  it("avisa o que sai, mas fora do padrão da casa", () => {
    const { bloqueios, avisos } = conferirVideo(com({ width: 720, height: 1280 }, {}, { duration: "120" }), 4 * MB);
    expect(bloqueios).toEqual([]);
    expect(avisos.join(" ")).toMatch(/1080x1920/);
    expect(avisos.join(" ")).toMatch(/abaixo de 90 s/);
    const semAudio = { format: PROBE_OK.format, streams: [PROBE_OK.streams[0]] };
    expect(conferirVideo(semAudio, 4 * MB).avisos.join(" ")).toMatch(/faixa muda/);
  });
});
