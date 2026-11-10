import { describe, expect, it } from "vitest";
import { argsDoRemux, errosDoReel, hashDoVideo, videoDoProbe } from "./reel-envio.mjs";

describe("reel-envio", () => {
  it("o remux copia imagem e som, põe o moov no início e tira a edit list", () => {
    const args = argsDoRemux("/tmp/entrada.mp4", "/tmp/saida.mp4").join(" ");
    expect(args).toContain("-i /tmp/entrada.mp4");
    expect(args).toContain("-map 0 -c copy");
    expect(args).toContain("-movflags +faststart");
    expect(args).toContain("-use_editlist 0");
    expect(args.endsWith("/tmp/saida.mp4")).toBe(true);
  });

  it("o hash é o mesmo para os mesmos bytes e tem 16 caracteres hex", () => {
    const a = hashDoVideo(Buffer.from("vídeo"));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashDoVideo(Buffer.from("vídeo"))).toBe(a);
    expect(hashDoVideo(Buffer.from("outro"))).not.toBe(a);
  });

  it("lê do ffprobe o que a Edge confere", () => {
    const probe = {
      format: { duration: "47.532958" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30000/1001" },
        { codec_type: "audio", codec_name: "aac" },
      ],
    };
    expect(videoDoProbe(probe, { arquivo: "a.mp4", hash: "0123456789abcdef", bytes: 10 })).toEqual({
      arquivo: "a.mp4",
      hash: "0123456789abcdef",
      bytes: 10,
      duracao_s: 47.533,
      largura: 1080,
      altura: 1920,
      fps: 29.97,
      codec: "h264",
      audio: "aac",
    });
    const mudo = videoDoProbe({ format: { duration: "5" }, streams: [probe.streams[0]] }, { arquivo: "a.mp4", hash: "x", bytes: 1 });
    expect(mudo.audio).toBeNull();
  });

  it("cobra vídeo e capa em kebab-case e só o feed", () => {
    expect(errosDoReel({ video: "reel-confins.mp4", capa: "reel-confins-capa.jpg" })).toEqual([]);
    expect(errosDoReel({ video: "reel-confins.mp4", capa: "reel-confins-capa.jpg", onde: ["feed"] })).toEqual([]);
    expect(errosDoReel({ video: "Reel Confins.mov", capa: "capa.png" })).toHaveLength(2);
    expect(errosDoReel({ video: "a.mp4", capa: "b.jpg", onde: ["feed", "story"] }).join()).toContain("só no feed");
    expect(errosDoReel({}).join()).toContain("Reel sem `video`");
  });
});
