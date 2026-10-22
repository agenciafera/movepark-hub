import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithProviders } from "@/test/utils";
import { deCampoDeData } from "@/features/social/social.logic";
import type { SocialPost } from "@/types/domain";

type Leitura<T> = { data: T | undefined; isLoading: boolean; isError: boolean };

const {
  postsHook,
  settingsHook,
  approve,
  reject,
  reschedule,
  corrigirLegenda,
  updateSettings,
  publishNow,
  publicando,
} = vi.hoisted(() => ({
  postsHook: { current: { data: [], isLoading: false, isError: false } as Leitura<unknown[]> },
  settingsHook: {
    current: { data: {}, isLoading: false, isError: false } as Leitura<Record<string, string>>,
  },
  approve: vi.fn(),
  reject: vi.fn(),
  reschedule: vi.fn(),
  corrigirLegenda: vi.fn(),
  updateSettings: vi.fn(),
  publishNow: vi.fn(),
  publicando: { current: false },
}));

vi.mock("@/features/social/api", () => ({
  useSocialPosts: () => postsHook.current,
  useSocialPostEvents: () => ({ data: [], isLoading: false }),
  useApproveSocialPost: () => ({ mutateAsync: approve, isPending: false }),
  useRejectSocialPost: () => ({ mutateAsync: reject, isPending: false }),
  useRescheduleSocialPost: () => ({ mutateAsync: reschedule, isPending: false }),
  useUpdateSocialCaption: () => ({ mutateAsync: corrigirLegenda, isPending: false }),
  usePublishSocialPostNow: () => ({ mutateAsync: publishNow, isPending: publicando.current }),
}));

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => settingsHook.current,
  useUpdateAppSettings: () => ({ mutateAsync: updateSettings, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ManagerSocial from "./social";
import { SocialPostDetail } from "@/features/social/SocialPostDetail";

const FUTURO = new Date(Date.now() + 3 * 86_400_000).toISOString();
/** O `updated_at` como o PostgREST devolve: microssegundos e +00:00. É a versão que a aprovação carrega. */
const VERSAO = "2026-10-21T20:11:03.123456+00:00";
const PASSADO = new Date(Date.now() - 2 * 86_400_000).toISOString();
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
    updated_at: VERSAO,
    deleted_at: null,
    ...over,
  };
}

describe("ManagerSocial", () => {
  beforeEach(() => {
    approve.mockReset();
    approve.mockResolvedValue(undefined);
    reject.mockReset();
    reject.mockResolvedValue(undefined);
    reschedule.mockReset();
    reschedule.mockResolvedValue(undefined);
    corrigirLegenda.mockReset();
    corrigirLegenda.mockResolvedValue({ blockers: [], warnings: [] });
    publishNow.mockReset();
    publishNow.mockResolvedValue({
      acao: "publicado",
      permalink: "https://www.instagram.com/p/x/",
    });
    publicando.current = false;
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.info).mockClear();
    updateSettings.mockReset();
    updateSettings.mockResolvedValue(undefined);
    settingsHook.current = {
      data: { social_dispatch_enabled: "false" },
      isLoading: false,
      isError: false,
    };
    postsHook.current = {
      isLoading: false,
      isError: false,
      data: [
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
        post({
          id: "p5",
          draft_key: "confins:5",
          status: "failed",
          caption: "A Meta recusou este post de Confins.\n\n#confins #movepark #aeroporto",
          scheduled_at: PASSADO,
          last_error: "Erro da Meta",
        }),
        post({
          id: "p6",
          draft_key: "confins:6",
          status: "overdue",
          caption: "Este post de Confins ficou para trás.\n\n#confins #movepark #aeroporto",
          scheduled_at: PASSADO,
        }),
      ],
    };
  });

  it("separa os posts por aba, com a contagem", () => {
    renderWithProviders(<ManagerSocial />);
    expect(screen.getByRole("tab", { name: "Para aprovar (3)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agendados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Publicados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Falhas (1)" })).toBeInTheDocument();
  });

  it("aprova o post limpo", async () => {
    renderWithProviders(<ManagerSocial />);
    await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
    const aprovar = await screen.findByRole("button", { name: "Aprovar" });
    expect(aprovar).toBeEnabled();
    await userEvent.click(aprovar);
    // Aprova a versão que a pessoa abriu: o updated_at do post aparece na chamada.
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({ p_id: "p1", p_expected_updated_at: VERSAO }),
    );
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

  describe("reagendar e tentar de novo", () => {
    const campo = () => screen.getByLabelText("Data e hora (São Paulo)") as HTMLInputElement;

    it("post com falha abre com uma data no futuro, e Tentar de novo reagenda para ela", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByRole("tab", { name: "Falhas (1)" }));
      await userEvent.click(screen.getByText(/^A Meta recusou este post de Confins/));

      const valor = campo().value;
      expect(Date.parse(deCampoDeData(valor))).toBeGreaterThan(Date.now());
      const botao = await screen.findByRole("button", { name: "Tentar de novo" });
      expect(botao).toBeEnabled();
      expect(screen.queryByText("Escolha uma data no futuro.")).not.toBeInTheDocument();

      await userEvent.click(botao);
      await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
      const { p_id, p_at } = reschedule.mock.calls[0][0];
      expect(p_id).toBe("p5");
      expect(p_at).toBe(deCampoDeData(valor));
      expect(Date.parse(p_at)).toBeGreaterThan(Date.now());
    });

    it("post atrasado também abre com uma data no futuro e o botão liberado", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Este post de Confins ficou para trás/));
      const botao = await screen.findByRole("button", { name: "Reagendar" });
      expect(Date.parse(deCampoDeData(campo().value))).toBeGreaterThan(Date.now());
      expect(botao).toBeEnabled();
    });

    it("trava o botão e explica quando a data digitada já passou", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByRole("tab", { name: "Falhas (1)" }));
      await userEvent.click(screen.getByText(/^A Meta recusou este post de Confins/));
      const botao = await screen.findByRole("button", { name: "Tentar de novo" });

      fireEvent.change(campo(), { target: { value: "2020-01-01T10:00" } });
      expect(botao).toBeDisabled();
      expect(screen.getByText("Escolha uma data no futuro.")).toBeInTheDocument();

      fireEvent.change(campo(), { target: { value: "" } });
      expect(botao).toBeDisabled();

      const amanha = new Date(Date.now() + 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 16);
      fireEvent.change(campo(), { target: { value: amanha } });
      expect(botao).toBeEnabled();
      expect(screen.queryByText("Escolha uma data no futuro.")).not.toBeInTheDocument();
      expect(reschedule).not.toHaveBeenCalled();
    });
  });

  describe("recusar", () => {
    it("só libera com um motivo e manda o motivo sem os espaços das pontas", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      const recusar = await screen.findByRole("button", { name: "Recusar" });
      expect(recusar).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Motivo da recusa"), "   ");
      expect(recusar).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Motivo da recusa"), "Arte fora do padrão  ");
      expect(recusar).toBeEnabled();
      await userEvent.click(recusar);
      await waitFor(() =>
        expect(reject).toHaveBeenCalledWith({ p_id: "p1", p_reason: "Arte fora do padrão" }),
      );
    });
  });

  describe("origem do post", () => {
    it("mostra o número do corte quando existe", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      expect(
        await screen.findByText(/Origem: confins:1 · Corte 1 · Frase-chave:/),
      ).toBeInTheDocument();
    });

    it("não inventa corte quando o post não tem número", async () => {
      postsHook.current = { ...postsHook.current, data: [post({ cut_number: null })] };
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      const origem = await screen.findByText(/Origem: confins:1/);
      expect(origem.textContent).not.toMatch(/Corte/);
    });
  });

  describe("estado da publicação automática", () => {
    it("enquanto carrega, não diz que está desligada e não deixa mexer", () => {
      settingsHook.current = { data: undefined, isLoading: true, isError: false };
      renderWithProviders(<ManagerSocial />);
      expect(screen.getByText("Carregando o estado da publicação automática")).toBeInTheDocument();
      expect(screen.queryByText(/desligada/)).not.toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Publicação automática" })).toBeDisabled();
    });

    it("se não conseguiu ler, avisa e mantém a chave travada", () => {
      settingsHook.current = { data: undefined, isLoading: false, isError: true };
      renderWithProviders(<ManagerSocial />);
      expect(
        screen.getByText("Não foi possível ler o estado da publicação automática"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/desligada/)).not.toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Publicação automática" })).toBeDisabled();
    });
  });

  describe("fila que não carregou", () => {
    it("mostra o erro em vez de uma fila vazia", () => {
      postsHook.current = { data: undefined, isLoading: false, isError: true };
      renderWithProviders(<ManagerSocial />);
      expect(
        screen.getByText("Não deu para carregar a fila. Recarregue a página."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.queryByText("Nada por aqui")).not.toBeInTheDocument();
    });
  });

  describe("corrigir legenda", () => {
    it("salva mandando a versão do post que está aberto", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      await userEvent.click(await screen.findByRole("button", { name: "Corrigir legenda" }));
      await userEvent.type(screen.getByLabelText("Legenda do post"), " Mais um trecho.");
      await userEvent.click(screen.getByRole("button", { name: "Salvar legenda" }));
      await waitFor(() =>
        expect(corrigirLegenda).toHaveBeenCalledWith({
          id: "p1",
          caption: `${LEGENDA} Mais um trecho.`,
          expected_updated_at: VERSAO,
        }),
      );
    });

    it("o editor abre com a legenda de agora, e não com a do primeiro render do diálogo", async () => {
      let trocar: (p: SocialPost) => void = () => {};
      function Harness() {
        const [atual, setAtual] = React.useState<SocialPost>(post());
        trocar = setAtual;
        return <SocialPostDetail post={atual} onClose={() => {}} />;
      }
      renderWithProviders(<Harness />);

      // Outra pessoa corrigiu a legenda enquanto o post estava aberto; a fila recarregou.
      act(() =>
        trocar(
          post({
            caption: "Legenda corrigida por outra pessoa.",
            updated_at: "2026-10-21T21:00:00.000001+00:00",
          }),
        ),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Corrigir legenda" }));
      expect(screen.getByLabelText("Legenda do post")).toHaveValue(
        "Legenda corrigida por outra pessoa.",
      );

      // E quem corrige em cima dela manda a versão nova.
      await userEvent.click(screen.getByRole("button", { name: "Salvar legenda" }));
      await waitFor(() =>
        expect(corrigirLegenda).toHaveBeenCalledWith({
          id: "p1",
          caption: "Legenda corrigida por outra pessoa.",
          expected_updated_at: "2026-10-21T21:00:00.000001+00:00",
        }),
      );
    });

    it("cancelar descarta o que foi digitado, e abrir de novo volta à legenda do post", async () => {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      await userEvent.click(await screen.findByRole("button", { name: "Corrigir legenda" }));
      await userEvent.type(screen.getByLabelText("Legenda do post"), " rascunho abandonado");
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await userEvent.click(screen.getByRole("button", { name: "Corrigir legenda" }));
      expect(screen.getByLabelText("Legenda do post")).toHaveValue(LEGENDA);
    });
  });

  describe("prévia no Instagram", () => {
    async function abrirPrimeiro() {
      renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Estacionar no aeroporto de Confins/));
      await screen.findByRole("tab", { name: "Feed" });
    }

    it("abre nos slides, com as quatro abas, e a prévia só aparece ao trocar de aba", async () => {
      await abrirPrimeiro();
      for (const nome of ["Slides", "Feed", "Stories", "Grade do perfil"]) {
        expect(screen.getByRole("tab", { name: nome })).toBeInTheDocument();
      }
      expect(screen.getByRole("tab", { name: "Slides" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("region", { name: "Slides" })).toBeInTheDocument();
      expect(screen.queryByTestId("previa-feed")).not.toBeInTheDocument();
    });

    it("a aba Feed mostra o post como no feed do Instagram", async () => {
      await abrirPrimeiro();
      await userEvent.click(screen.getByRole("tab", { name: "Feed" }));
      expect(await screen.findByTestId("previa-feed")).toBeInTheDocument();
      expect(screen.getByText(/Curtido por/)).toBeInTheDocument();
      expect(screen.getByText("Simulação: curtidas e comentários fictícios.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Slides" })).not.toBeInTheDocument();
    });

    it("a aba Stories mostra a tela de story, sem publicar nada", async () => {
      await abrirPrimeiro();
      await userEvent.click(screen.getByRole("tab", { name: "Stories" }));
      expect(await screen.findByTestId("story-tela")).toBeInTheDocument();
      expect(
        screen.getByText("Simulação: stories não são publicados pela fila."),
      ).toBeInTheDocument();
      expect(approve).not.toHaveBeenCalled();
    });

    it("a aba Grade do perfil usa a fila da página: só entram os agendados e publicados", async () => {
      await abrirPrimeiro();
      await userEvent.click(screen.getByRole("tab", { name: "Grade do perfil" }));
      const celulas = await screen.findAllByTestId("celula-grade");
      expect(celulas).toHaveLength(6);
      // Este post (p1) + p3 (agendado) + p4 (publicado). p2 (em revisão), p5 (falha) e p6
      // (atrasado) ficam de fora.
      expect(celulas.filter((c) => c.querySelector("img"))).toHaveLength(3);
    });

    it("trocar de aba não mexe no que está sendo editado nem na decisão", async () => {
      await abrirPrimeiro();
      await userEvent.click(screen.getByRole("button", { name: "Corrigir legenda" }));
      await userEvent.type(screen.getByLabelText("Legenda do post"), " extra");
      await userEvent.click(screen.getByRole("tab", { name: "Feed" }));
      await userEvent.click(screen.getByRole("tab", { name: "Slides" }));
      expect(screen.getByLabelText("Legenda do post")).toHaveValue(`${LEGENDA} extra`);
      expect(screen.getByRole("button", { name: "Aprovar" })).toBeEnabled();
    });
  });

  describe("troca de post no diálogo", () => {
    it("o post B não herda a legenda em edição nem o motivo digitado no post A", async () => {
      let trocar: (p: SocialPost) => void = () => {};
      function Harness() {
        const [atual, setAtual] = React.useState<SocialPost>(post());
        trocar = setAtual;
        return <SocialPostDetail post={atual} onClose={() => {}} />;
      }
      renderWithProviders(<Harness />);

      await userEvent.click(await screen.findByRole("button", { name: "Corrigir legenda" }));
      await userEvent.type(screen.getByLabelText("Legenda do post"), " texto novo");
      await userEvent.type(screen.getByLabelText("Motivo da recusa"), "motivo do A");
      expect(screen.getByLabelText("Legenda do post")).toBeInTheDocument();

      // O mesmo post chegando de novo da consulta (outro objeto, mesmo id) não apaga o que se digita.
      act(() => trocar(post({ updated_at: new Date().toISOString() })));
      expect(screen.getByLabelText("Legenda do post")).toHaveValue(`${LEGENDA} texto novo`);
      expect(screen.getByLabelText("Motivo da recusa")).toHaveValue("motivo do A");

      act(() =>
        trocar(
          post({ id: "p9", draft_key: "confins:9", caption: "Legenda do post B em Confins." }),
        ),
      );

      expect(screen.queryByLabelText("Legenda do post")).not.toBeInTheDocument();
      expect(screen.getByText(/Legenda do post B em Confins\./)).toBeInTheDocument();
      expect(screen.getByLabelText("Motivo da recusa")).toHaveValue("");
    });
  });

  describe("publicar agora", () => {
    const PERGUNTA =
      "Publicar agora no Instagram? O post vai ao ar em seguida na conta @moveparkestacionamento.";
    const AVISO = " Já saiu um post hoje, e os dois vão disputar alcance.";

    async function abrir(texto: RegExp, aba?: string) {
      renderWithProviders(<ManagerSocial />);
      if (aba) await userEvent.click(screen.getByRole("tab", { name: aba }));
      await userEvent.click(screen.getByText(texto));
      await screen.findByRole("tab", { name: "Feed" });
    }

    const botao = () => screen.queryByRole("button", { name: "Publicar agora" });

    it("aparece para aguardando aprovação, agendado, atrasado e com falha", async () => {
      const casos: Array<[RegExp, string | undefined]> = [
        [/^Estacionar no aeroporto de Confins/, undefined],
        [/^Este post de Confins ficou para trás/, undefined],
        [/^A Meta recusou este post de Confins/, "Falhas (1)"],
      ];
      for (const [texto, aba] of casos) {
        const { unmount } = renderWithProviders(<ManagerSocial />);
        if (aba) await userEvent.click(screen.getByRole("tab", { name: aba }));
        await userEvent.click(screen.getByText(texto));
        expect(
          await screen.findByRole("button", { name: "Publicar agora" }),
          String(texto),
        ).toBeEnabled();
        unmount();
      }
      // O agendado (p3) tem a mesma legenda do p1: abre pelo diálogo direto.
      renderWithProviders(
        <SocialPostDetail post={post({ id: "p3", status: "approved" })} onClose={() => {}} />,
      );
      expect(await screen.findByRole("button", { name: "Publicar agora" })).toBeEnabled();
    });

    it("não aparece com bloqueio da conferência nem em post publicado", async () => {
      const { unmount } = renderWithProviders(<ManagerSocial />);
      await userEvent.click(screen.getByText(/^Vaga garantida em Confins/));
      expect(await screen.findByRole("button", { name: "Aprovar" })).toBeDisabled();
      expect(botao()).not.toBeInTheDocument();
      unmount();

      renderWithProviders(
        <SocialPostDetail
          post={post({ id: "p4", status: "published", ig_media_id: "m1" })}
          onClose={() => {}}
        />,
      );
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(botao()).not.toBeInTheDocument();
    });

    it("desistir na confirmação não chama nada", async () => {
      const confirmar = vi.fn(() => false);
      vi.stubGlobal("confirm", confirmar);
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        expect(confirmar).toHaveBeenCalledWith(PERGUNTA);
        expect(publishNow).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("confirmar publica a versão aberta e avisa que saiu", async () => {
      const confirmar = vi.fn(() => true);
      vi.stubGlobal("confirm", confirmar);
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        await waitFor(() =>
          expect(publishNow).toHaveBeenCalledWith({ p_id: "p1", p_expected_updated_at: VERSAO }),
        );
        await waitFor(() =>
          expect(toast.success).toHaveBeenCalledWith("Post publicado no Instagram."),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("conferido como já publicado também conta como publicado", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      publishNow.mockResolvedValue({ acao: "reconciliado", permalink: null });
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        await waitFor(() =>
          expect(toast.success).toHaveBeenCalledWith("Post publicado no Instagram."),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("quando outra rodada pegou o post, avisa em vez de dizer que publicou", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      publishNow.mockResolvedValue({ acao: "outra_rodada", permalink: null });
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        await waitFor(() =>
          expect(toast.info).toHaveBeenCalledWith("Outra rodada já está publicando este post."),
        );
        expect(toast.success).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("falha da publicação vira toast com o texto do servidor", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      publishNow.mockRejectedValue(new Error("Falhou ao enviar a imagem à Meta."));
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("Falhou ao enviar a imagem à Meta."),
        );
        expect(toast.success).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("a confirmação avisa quando outro post da fila já saiu hoje", async () => {
      const confirmar = vi.fn(() => false);
      vi.stubGlobal("confirm", confirmar);
      postsHook.current = {
        ...postsHook.current,
        data: [
          post(),
          post({
            id: "p4",
            draft_key: "confins:4",
            status: "published",
            caption: "Publicado hoje em Confins.\n\n#confins #movepark #aeroporto",
            ig_media_id: "m1",
            published_at: new Date().toISOString(),
          }),
        ],
      };
      try {
        await abrir(/^Estacionar no aeroporto de Confins/);
        await userEvent.click(botao()!);
        expect(confirmar).toHaveBeenCalledWith(PERGUNTA + AVISO);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("enquanto publica, o botão fica travado e diz Publicando…", async () => {
      publicando.current = true;
      await abrir(/^Estacionar no aeroporto de Confins/);
      const travado = screen.getByRole("button", { name: "Publicando…" });
      expect(travado).toBeDisabled();
      expect(botao()).not.toBeInTheDocument();
    });
  });
});
