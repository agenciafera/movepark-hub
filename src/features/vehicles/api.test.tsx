import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle } from "./api";

/** Contrato de rede do CRUD de veículos do cliente. */

describe("useCreateVehicle", () => {
  it("insere o veículo com o payload recebido", async () => {
    const insert = tabela("vehicle", "post", { json: [{ id: "v1", license_plate: "ABC1D23" }] });

    const { result } = renderMutation(() => useCreateVehicle());
    await result.current.mutateAsync({ profile_id: "u1", license_plate: "ABC1D23", model: "Onix" });

    expect(insert.ultimoBody).toMatchObject({ license_plate: "ABC1D23", model: "Onix" });
  });

  it("desmarca os outros ANTES de inserir, quando entra como padrão", async () => {
    // A ordem é o que importa: inserir primeiro e desmarcar depois apagaria o
    // is_default do recém-criado e o cliente ficaria sem veículo padrão.
    const desmarca = tabela("vehicle", "patch", { json: [] });
    const insert = tabela("vehicle", "post", { json: [{ id: "v1" }] });

    const { result } = renderMutation(() => useCreateVehicle());
    await result.current.mutateAsync({ profile_id: "u1", license_plate: "ABC1D23", is_default: true });

    expect(desmarca.ultimoBody).toEqual({ is_default: false });
    expect(desmarca.chamadas[0].url).toContain("profile_id=eq.u1");
    expect(insert.chamadas).toHaveLength(1);
  });

  it("não mexe nos outros quando não é padrão", async () => {
    const desmarca = tabela("vehicle", "patch", { json: [] });
    tabela("vehicle", "post", { json: [{ id: "v1" }] });

    const { result } = renderMutation(() => useCreateVehicle());
    await result.current.mutateAsync({ profile_id: "u1", license_plate: "ABC1D23" });

    expect(desmarca.chamadas).toHaveLength(0);
  });

  it("propaga o erro do insert", async () => {
    falha("tabela", "vehicle", 409, "placa já cadastrada");

    const { result } = renderMutation(() => useCreateVehicle());
    await expect(
      result.current.mutateAsync({ profile_id: "u1", license_plate: "ABC1D23" }),
    ).rejects.toThrow();
  });
});

describe("useUpdateVehicle", () => {
  it("aplica o patch no veículo certo", async () => {
    const patch = tabela("vehicle", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateVehicle());
    await result.current.mutateAsync({ id: "v9", profileId: "u1", patch: { model: "HB20" } });

    const ultima = patch.chamadas[patch.chamadas.length - 1];
    expect(ultima.url).toContain("id=eq.v9");
    expect(ultima.body).toMatchObject({ model: "HB20" });
  });
});

describe("useDeleteVehicle", () => {
  it("faz soft delete: marca deleted_at, não apaga a linha", async () => {
    // Soft delete é regra do projeto (o booking referencia o veículo).
    const patch = tabela("vehicle", "patch", { json: [] });
    const hard = tabela("vehicle", "delete", { json: [] });

    const { result } = renderMutation(() => useDeleteVehicle());
    await result.current.mutateAsync("v9");

    expect((patch.ultimoBody as { deleted_at: string }).deleted_at).toBeTruthy();
    expect(patch.chamadas[0].url).toContain("id=eq.v9");
    expect(hard.chamadas).toHaveLength(0);
  });
});
