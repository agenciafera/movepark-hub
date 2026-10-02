import { describe, expect, it } from "vitest";

import { fraseTraslado } from "./traslado.mjs";

describe("fraseTraslado", () => {
  it("publica o tempo de trajeto como trajeto, não como frequência (regressão BePark)", () => {
    // Conteúdo 41: o llms.txt dizia que a van da BePark sai "a cada 10 min". O 10 é o tempo
    // até o terminal, e a ficha não declara frequência.
    const frase = fraseTraslado({ has_shuttle: true, shuttle_minutes: 10, shuttle_frequency_minutes: null });
    expect(frase).toBe(", traslado de 10 min até o terminal");
    expect(frase).not.toMatch(/a cada/);
  });

  it("diz a frequência só quando a ficha declara uma", () => {
    expect(
      fraseTraslado({ has_shuttle: true, shuttle_minutes: 3, shuttle_frequency_minutes: 15 }),
    ).toBe(", traslado de 3 min até o terminal, com van a cada 15 min");
  });

  it("frequência sem trajeto não inventa o trajeto", () => {
    expect(
      fraseTraslado({ has_shuttle: true, shuttle_minutes: null, shuttle_frequency_minutes: 15 }),
    ).toBe(", traslado com van a cada 15 min");
  });

  it("traslado sem número nenhum só afirma que existe", () => {
    expect(fraseTraslado({ has_shuttle: true, shuttle_minutes: null })).toBe(", com traslado");
    expect(fraseTraslado({ has_shuttle: true, shuttle_minutes: 0, shuttle_frequency_minutes: 0 })).toBe(
      ", com traslado",
    );
  });

  it("sem traslado não diz nada, mesmo com minutos preenchidos", () => {
    expect(fraseTraslado({ has_shuttle: false, shuttle_minutes: 10, shuttle_frequency_minutes: 20 })).toBe("");
    expect(fraseTraslado(null)).toBe("");
  });
});
