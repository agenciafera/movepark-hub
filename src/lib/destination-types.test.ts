import { describe, expect, it } from "vitest";
import { Plane, Bus, MapPin } from "lucide-react";
import {
  destinationTypeIcon,
  destinationTypeLabel,
  destinationTypeMeta,
} from "./destination-types";

describe("destination-types", () => {
  it("mapeia cada tipo do enum para ícone e label", () => {
    expect(Object.keys(destinationTypeMeta)).toEqual([
      "airport",
      "bus_terminal",
      "city_center",
      "district",
      "custom",
    ]);
    expect(destinationTypeMeta.airport.label).toBe("Aeroporto");
  });

  it("resolve ícone conhecido", () => {
    expect(destinationTypeIcon("airport")).toBe(Plane);
    expect(destinationTypeIcon("bus_terminal")).toBe(Bus);
  });

  it("cai no fallback MapPin para tipo desconhecido ou nulo", () => {
    expect(destinationTypeIcon("seaport")).toBe(MapPin);
    expect(destinationTypeIcon(null)).toBe(MapPin);
    expect(destinationTypeIcon(undefined)).toBe(MapPin);
  });

  it("label cai para o próprio code quando desconhecido", () => {
    expect(destinationTypeLabel("airport")).toBe("Aeroporto");
    expect(destinationTypeLabel("seaport")).toBe("seaport");
    expect(destinationTypeLabel(null)).toBe("Destino");
  });
});
