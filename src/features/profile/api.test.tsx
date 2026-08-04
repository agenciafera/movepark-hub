import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useSignOutEverywhere, useUpdateProfile } from "./api";

/**
 * Contrato de rede do perfil do cliente.
 *
 * O ponto sensível é o ADR-006: `profiles` NÃO guarda e-mail nem telefone, porque
 * identidade verificada mora no `auth.users`. Este formulário edita nome e
 * preferências, e nada mais.
 */

describe("useUpdateProfile", () => {
  it("aplica o patch no perfil certo, sem mandar o id no corpo", async () => {
    // O id é filtro, não campo. Mandá-lo no corpo abriria a porta para um update que
    // troca a chave primária da linha.
    const patch = tabela("profiles", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateProfile());
    await result.current.mutateAsync({ id: "u9", full_name: "QA Windup" });

    expect(patch.chamadas[0].url).toContain("id=eq.u9");
    expect(patch.ultimoBody).toEqual({ full_name: "QA Windup" });
    expect(patch.ultimoBody).not.toHaveProperty("id");
  });

  it("não manda role: papel não se edita pelo perfil", async () => {
    // Se `role` viajasse junto, o formulário de "minha conta" seria uma escada de
    // privilégio. Quem muda papel é a tela do Manager, por outra mutation.
    const patch = tabela("profiles", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateProfile());
    await result.current.mutateAsync({ id: "u9", full_name: "QA" });

    expect(patch.ultimoBody).not.toHaveProperty("role");
  });

  it("propaga a recusa do servidor", async () => {
    falha("tabela", "profiles", 403, "sem permissão");

    const { result } = renderMutation(() => useUpdateProfile());
    await expect(
      result.current.mutateAsync({ id: "u9", full_name: "QA" }),
    ).rejects.toThrow();
  });
});

describe("useSignOutEverywhere", () => {
  it("encerra a sessão em escopo global, não só neste aparelho", async () => {
    // É o botão de "perdi o celular". Escopo local derrubaria só a aba atual e
    // deixaria a sessão do aparelho perdido viva.
    const espiao = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);

    const { result } = renderMutation(() => useSignOutEverywhere());
    await result.current.mutateAsync();

    expect(espiao).toHaveBeenCalledWith({ scope: "global" });
  });

  it("falha do servidor sobe, em vez de a tela dizer que derrubou tudo", async () => {
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
      error: { message: "falha" },
    } as never);

    const { result } = renderMutation(() => useSignOutEverywhere());
    await expect(result.current.mutateAsync()).rejects.toBeTruthy();
  });
});
