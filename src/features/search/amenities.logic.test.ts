import { describe, expect, it } from "vitest";
import {
  amenitiesExcludingTypeDescriptors,
  TYPE_DESCRIPTOR_AMENITY_CODES,
} from "./amenities.logic";

/**
 * C-04 do roteiro do consumidor: num contexto por tipo de vaga, a amenidade não pode contradizer o
 * tipo. "Coberto" numa vaga "Descoberta" é contradição na mesma caixa. https://app.clickup.com/t/86ajmwawc
 */
describe("amenitiesExcludingTypeDescriptors", () => {
  it("remove os descritores de tipo (covered, motorcycle, valet, self_park)", () => {
    const input = ["covered", "shuttle_free", "valet", "cameras_24h", "self_park", "motorcycle"];
    expect(amenitiesExcludingTypeDescriptors(input)).toEqual(["shuttle_free", "cameras_24h"]);
  });

  it("mantém as amenidades de verdade da unidade intactas", () => {
    const reais = ["shuttle_free", "cameras_24h", "on_site_24h", "gated_access", "restroom", "flight_insurance"];
    expect(amenitiesExcludingTypeDescriptors(reais)).toEqual(reais);
  });

  it("preserva a ordem de entrada", () => {
    expect(amenitiesExcludingTypeDescriptors(["cameras_24h", "covered", "restroom"])).toEqual([
      "cameras_24h",
      "restroom",
    ]);
  });

  it("os quatro descritores são os que colidem com parking_type", () => {
    // Trava o contrato: se um código novo virar tipo de vaga, ele entra aqui de propósito.
    expect([...TYPE_DESCRIPTOR_AMENITY_CODES]).toEqual(["covered", "motorcycle", "valet", "self_park"]);
  });
});
