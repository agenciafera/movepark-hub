import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/utils";
import ContatoPage from "./contato";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-contact-message`;

/** Preenche o formulário com uma mensagem plausível e envia. */
async function preencherEEnviar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText("Nome"), "Ana Souza");
  await usuario.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
  await usuario.type(
    screen.getByLabelText("Mensagem"),
    "Preciso mudar a data da minha reserva em Guarulhos.",
  );
  await usuario.click(screen.getByRole("button", { name: "Enviar mensagem" }));
}

describe("ContatoPage — envio do formulário", () => {
  /**
   * O caso que originou a atividade: a página montava um `mailto:` e mandava o
   * visitante para fora do site, para um cliente de e-mail que no celular
   * costuma ser um aplicativo que ele nem usa.
   */
  it("envia pela Edge, sem jogar o visitante para fora do site", async () => {
    const usuario = userEvent.setup();
    let recebido: Record<string, unknown> | null = null;
    server.use(
      http.post(URL, async ({ request }) => {
        recebido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    await waitFor(() => expect(recebido).not.toBeNull());
    expect(recebido!.name).toBe("Ana Souza");
    expect(recebido!.email).toBe("ana@exemplo.com");
    expect(recebido!.message).toBe("Preciso mudar a data da minha reserva em Guarulhos.");
  });

  it("mostra a confirmação só depois que o servidor aceita", async () => {
    const usuario = userEvent.setup();
    server.use(http.post(URL, () => HttpResponse.json({ ok: true, id: "m1" }, { status: 201 })));

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    await waitFor(() => expect(screen.getByText("Mensagem enviada!")).toBeInTheDocument());
  });

  /**
   * O comportamento antigo dizia "Mensagem enviada!" sem ter enviado nada. Quem
   * desistia no cliente de e-mail saía achando que a mensagem tinha chegado.
   */
  it("falha do servidor mostra o erro e não finge sucesso", async () => {
    const usuario = userEvent.setup();
    server.use(
      http.post(URL, () => HttpResponse.json({ error: "E-mail inválido." }, { status: 400 })),
    );

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E-mail inválido."));
    expect(screen.queryByText("Mensagem enviada!")).not.toBeInTheDocument();
  });

  /** O que a pessoa escreveu não pode sumir junto com o erro. */
  it("mantém o texto digitado quando o envio falha", async () => {
    const usuario = userEvent.setup();
    server.use(http.post(URL, () => HttpResponse.json({ error: "falhou" }, { status: 500 })));

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("Mensagem")).toHaveValue(
      "Preciso mudar a data da minha reserva em Guarulhos.",
    );
  });

  /** Sem mensagem de rede, a tela ficaria muda enquanto o pedido está no ar. */
  it("o botão avisa que está enviando e trava o reenvio", async () => {
    const usuario = userEvent.setup();
    server.use(
      http.post(URL, async () => {
        await new Promise((r) => setTimeout(r, 80));
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    const botao = await screen.findByRole("button", { name: "Enviando…" });
    expect(botao).toBeDisabled();
  });

  /**
   * O campo-armadilha precisa chegar ao servidor, senão a defesa mora só no
   * HTML e não vale nada. Ele fica fora do caminho de quem navega por teclado.
   */
  it("manda o campo-armadilha e o mantém fora do alcance do teclado", async () => {
    const usuario = userEvent.setup();
    let recebido: Record<string, unknown> | null = null;
    server.use(
      http.post(URL, async ({ request }) => {
        recebido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    const { container } = renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    const armadilha = container.querySelector<HTMLInputElement>("#hp_field");
    expect(armadilha).toBeTruthy();
    expect(armadilha!.tabIndex).toBe(-1);
    expect(armadilha!.closest("[aria-hidden]")).toBeTruthy();

    await preencherEEnviar(usuario);
    await waitFor(() => expect(recebido).not.toBeNull());
    expect(recebido).toHaveProperty("hp_field");
  });

  /** A procedência ajuda a triagem a saber de onde a pessoa escreveu. */
  it("envia a página de origem junto", async () => {
    const usuario = userEvent.setup();
    let recebido: Record<string, unknown> | null = null;
    server.use(
      http.post(URL, async ({ request }) => {
        recebido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, id: "m1" }, { status: 201 });
      }),
    );

    renderWithProviders(
      <HelmetProvider>
        <ContatoPage />
      </HelmetProvider>,
    );
    await preencherEEnviar(usuario);

    await waitFor(() => expect(recebido).not.toBeNull());
    expect(typeof recebido!.page_url).toBe("string");
  });
});
