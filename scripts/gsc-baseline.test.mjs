import { describe, expect, it } from "vitest";

import { conflitoDeJanela } from "./gsc-baseline.logic.mjs";

describe("conflitoDeJanela", () => {
  const curta = { inicio: "2026-08-31", fim: "2026-09-14" };
  const cheia = { inicio: "2025-05-15", fim: "2026-09-14" };

  it("acusa quando a pasta guarda outra janela que termina no mesmo dia", () => {
    const c = conflitoDeJanela(curta, cheia.inicio, cheia.fim);
    expect(c).toEqual({ de: "2026-08-31 a 2026-09-14", para: "2025-05-15 a 2026-09-14" });
  });

  it("libera a re-rodada da mesma janela, que é como um baseline se atualiza", () => {
    expect(conflitoDeJanela(curta, curta.inicio, curta.fim)).toBeNull();
  });

  it("libera pasta nova, sem coleta anterior", () => {
    expect(conflitoDeJanela(null, curta.inicio, curta.fim)).toBeNull();
  });

  it("libera meta ilegível ou sem as datas, para não travar por arquivo corrompido", () => {
    expect(conflitoDeJanela({}, curta.inicio, curta.fim)).toBeNull();
    expect(conflitoDeJanela({ inicio: "2026-08-31" }, curta.inicio, curta.fim)).toBeNull();
  });

  it("acusa também quando só o início muda", () => {
    expect(conflitoDeJanela(curta, "2026-09-01", curta.fim)).toMatchObject({
      para: "2026-09-01 a 2026-09-14",
    });
  });
});
