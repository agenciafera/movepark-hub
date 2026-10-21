import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithProviders } from "@/test/utils";
import type { SocialPost } from "@/types/domain";

const { posts, settings, approve, updateSettings } = vi.hoisted(() => ({
  posts: { current: [] as unknown[] },
  settings: { current: {} as Record<string, string> },
  approve: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/features/social/api", () => ({
  useSocialPosts: () => ({ data: posts.current, isLoading: false }),
  useSocialPostEvents: () => ({ data: [], isLoading: false }),
  useApproveSocialPost: () => ({ mutateAsync: approve, isPending: false }),
  useRejectSocialPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRescheduleSocialPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSocialCaption: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => ({ data: settings.current, isLoading: false }),
  useUpdateAppSettings: () => ({ mutateAsync: updateSettings, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerSocial from "./social";

const FUTURO = new Date(Date.now() + 3 * 86_400_000).toISOString();
const LEGENDA =
  "Estacionar no aeroporto de Confins sai mais barato do que parece quando a viagem passa de uma semana inteira. " +
  "A conta muda pelo traslado.\n\n#confins #estacionamentoaeroporto #movepark";

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "p1",
    draft_key: "confins:1",
    status: "pending_review",
    kind: "image",
    caption: LEGENDA,
    slides: [
      {
        url: "https://exemplo.co/1.jpg",
        path: "social/confins/1.jpg",
        alt: "pátio em Confins",
        texto: null,
      },
    ],
    keyphrase: "estacionamento no aeroporto de Confins",
    cut_number: 1,
    blog_post_id: null,
    destination_id: null,
    cta_url: null,
    price_date: null,
    scheduled_at: FUTURO,
    validation: { blockers: [], warnings: [] },
    approved_by: null,
    approved_at: null,
    ig_container_id: null,
    ig_media_id: null,
    ig_permalink: null,
    published_at: null,
    attempts: 0,
    last_error: null,
    created_at: FUTURO,
    updated_at: FUTURO,
    deleted_at: null,
    ...over,
  };
}

describe("ManagerSocial", () => {
  beforeEach(() => {
    approve.mockReset();
    approve.mockResolvedValue(undefined);
    vi.mocked(toast.error).mockClear();
    updateSettings.mockReset();
    updateSettings.mockResolvedValue(undefined);
    settings.current = { social_dispatch_enabled: "false" };
    posts.current = [
      post(),
      post({
        id: "p2",
        draft_key: "confins:2",
        caption: "Vaga garantida em Confins.\n\n#confins #movepark #aeroporto",
        validation: {
          blockers: ['Promessa de transação na legenda: "vaga garantida" (ADR-009).'],
          warnings: [],
        },
      }),
      post({ id: "p3", draft_key: "confins:3", status: "approved" }),
      post({
        id: "p4",
        draft_key: "confins:4",
        status: "published",
        ig_media_id: "m1",
        ig_permalink: "https://www.instagram.com/p/x/",
      }),
    ];
  });

  it("separa os posts por aba, com a contagem", () => {
    renderWithProviders(<ManagerSocial />);
    expect(screen.getByRole("tab", { name: "Para aprovar (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agendados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Publicados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Falhas (0)" })).toBeInTheDocument();
  });

  it("aprova o post limpo", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    const aprovar = await screen.findByRole("button", { name: "Aprovar" });
    expect(aprovar).toBeEnabled();
    await userEvent.click(aprovar);
    await waitFor(() => expect(approve).toHaveBeenCalledWith({ p_id: "p1" }));
  });

  it("trava a aprovação enquanto houver bloqueio e mostra o motivo", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Vaga garantida em Confins/));
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeDisabled();
    expect(screen.getByText(/Bloqueio: Promessa de transação/)).toBeInTheDocument();
  });

  it("destaca os primeiros 125 caracteres da legenda, que aparecem antes do mais", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    expect((await screen.findByTestId("gancho")).textContent).toBe(LEGENDA.slice(0, 125));
  });

  it("liga a publicação automática só depois de confirmar", async () => {
    // O happy-dom não traz `window.confirm`, então o stub entra como global.
    const confirmar = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmar);
    try {
      renderWithProviders(<ManagerSocial />);
      expect(screen.getByText("Publicação automática desligada")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("switch", { name: "Publicação automática" }));
      expect(confirmar).toHaveBeenCalled();
      await waitFor(() =>
        expect(updateSettings).toHaveBeenCalledWith({ social_dispatch_enabled: "true" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("não liga a publicação automática se a pessoa desistir na confirmação", async () => {
    const confirmar = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmar);
    try {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByRole("switch", { name: "Publicação automática" }));
      expect(confirmar).toHaveBeenCalled();
      expect(updateSettings).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("mostra o motivo que o servidor deu quando a aprovação falha, mesmo que o erro não seja um Error", async () => {
    // A RPC devolve um PostgrestError (objeto simples com `message`), não uma instância de Error.
    approve.mockRejectedValue({ message: "Já existe post agendado ou publicado nesse dia." });
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    await userEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Já existe post agendado ou publicado nesse dia."),
    );
  });

  it("cai na mensagem genérica quando o erro não traz texto", async () => {
    approve.mockRejectedValue(undefined);
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    await userEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não deu certo. Tente de novo."));
  });
});
