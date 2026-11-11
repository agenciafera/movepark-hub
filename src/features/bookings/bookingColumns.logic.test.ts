import { describe, expect, it } from "vitest";
import {
  BOOKING_COLUMNS,
  columnHeader,
  defaultColumnSettings,
  isDefaultSettings,
  moveColumn,
  resolveColumnSettings,
  toPref,
  toggleColumn,
  visibleColumnIds,
} from "./bookingColumns.logic";

describe("colunas da lista de reservas", () => {
  it("sem escolha salva: as colunas padrão, com voucher e sem placa/telefone/e-mail", () => {
    const ids = visibleColumnIds(resolveColumnSettings(undefined));
    expect(ids).toEqual([
      "code",
      "created",
      "customer",
      "parking",
      "stay",
      "payment",
      "value",
      "status",
      "voucher",
    ]);
  });

  it("respeita a ordem e a visibilidade salvas", () => {
    const s = resolveColumnSettings({
      version: 1,
      columns: [
        { id: "status", visible: true },
        { id: "code", visible: true },
        { id: "plate", visible: true },
        { id: "created", visible: false },
      ],
    });
    expect(visibleColumnIds(s).slice(0, 3)).toEqual(["status", "code", "plate"]);
    expect(visibleColumnIds(s)).not.toContain("created");
  });

  it("coluna que não existe mais some; coluna nova entra no fim com o padrão dela", () => {
    const s = resolveColumnSettings({
      columns: [
        { id: "sumiu", visible: true },
        { id: "status", visible: true },
      ],
    });
    expect(s.map((c) => c.id)).toEqual([
      "status",
      ...BOOKING_COLUMNS.map((c) => c.id).filter((id) => id !== "status"),
    ]);
    expect(s.find((c) => c.id === "plate")!.visible).toBe(false);
  });

  it("preferência estragada vira o padrão, sem quebrar a tela", () => {
    expect(resolveColumnSettings("lixo")).toEqual(defaultColumnSettings());
    expect(resolveColumnSettings({ columns: "x" })).toEqual(defaultColumnSettings());
    expect(resolveColumnSettings({ columns: [null, 3, { id: 9 }] })).toEqual(
      defaultColumnSettings(),
    );
  });

  it("a coluna Reserva não some, nem salva como escondida", () => {
    const s = resolveColumnSettings({ columns: [{ id: "code", visible: false }] });
    expect(visibleColumnIds(s)).toContain("code");
    expect(toggleColumn(s, "code")).toBe(s);
  });

  it("subir e descer trocam vizinhas e param nas pontas", () => {
    const d = defaultColumnSettings();
    expect(
      moveColumn(d, "created", -1)
        .slice(0, 2)
        .map((c) => c.id),
    ).toEqual(["created", "code"]);
    expect(moveColumn(d, "code", -1)).toBe(d);
    expect(moveColumn(d, "email", 1)).toBe(d);
  });

  it("sabe quando a escolha é o padrão, e grava no formato versionado", () => {
    const d = defaultColumnSettings();
    expect(isDefaultSettings(d)).toBe(true);
    expect(isDefaultSettings(toggleColumn(d, "plate"))).toBe(false);
    expect(toPref(d)).toEqual({ version: 1, columns: d });
  });

  it("o cabeçalho segue a tela: Unidade e Diárias no Operator", () => {
    expect(columnHeader("parking", { showCompany: false, valueMode: "parking" })).toBe("Unidade");
    expect(columnHeader("value", { showCompany: false, valueMode: "parking" })).toBe("Diárias");
    expect(columnHeader("parking", { showCompany: true, valueMode: "total" })).toBe(
      "Estacionamento",
    );
  });
});
