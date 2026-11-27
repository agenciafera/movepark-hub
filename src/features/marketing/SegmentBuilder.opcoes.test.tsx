import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentBuilder } from "./SegmentBuilder";
import { comOpcoes, fieldDef } from "./segmentBuilder.logic";

const AEROPORTOS = {
  destinations: [{ value: "guarulhos", label: "Guarulhos" }],
  last_destination: [{ value: "guarulhos", label: "Guarulhos" }],
};

describe("opções que vêm do banco", () => {
  it("comOpcoes troca as opções do campo e deixa os outros como estão", () => {
    expect(comOpcoes(fieldDef("last_destination"), AEROPORTOS)?.options).toEqual(AEROPORTOS.last_destination);
    expect(comOpcoes(fieldDef("bookings_count"), AEROPORTOS)?.options).toBeUndefined();
  });

  it("aeroporto da última viagem com 'está entre' mostra os aeroportos", () => {
    const onChange = vi.fn();
    render(
      <SegmentBuilder
        value={{ match: "all", rules: [{ field: "last_destination", op: "in", value: [] }] }}
        onChange={onChange}
        opcoes={AEROPORTOS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guarulhos" }));
    expect(onChange.mock.calls[0][0].rules[0].value).toEqual(["guarulhos"]);
  });

  it("aeroportos onde já estacionou vira escolha, não texto livre", () => {
    const onChange = vi.fn();
    render(
      <SegmentBuilder
        value={{ match: "all", rules: [{ field: "destinations", op: "contains", value: "" }] }}
        onChange={onChange}
        opcoes={AEROPORTOS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guarulhos" }));
    expect(onChange.mock.calls[0][0].rules[0].value).toBe("guarulhos");
  });
});
