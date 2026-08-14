import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { contasDoConsumidorLigadas } from "@/lib/features";
import { ParkingCard } from "@/features/search/ParkingCard";
import { ConsumerTopbar } from "@/components/shared/ConsumerTopbar";
import { ConsumerMobileMenu } from "@/components/shared/ConsumerMobileMenu";
import { CheckoutShell } from "@/components/shared/CheckoutShell";
import { AccountSidebar } from "@/components/shared/AccountSidebar";

/**
 * O `setup.ts` liga a chave para toda a suíte, porque os testes existentes
 * cobrem o comportamento da funcionalidade. Aqui ela desce, que é o estado com
 * que o site foi ao ar em 20/08/2026.
 */
function desligarContas() {
  vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "");
}

const cardBase = {
  href: "/p/mercy/unidade/covered",
  coverImage: null,
  coverAlt: "",
  title: "Mercy · Unidade",
  parkingTypeName: "Vaga Coberta",
  price: { total: 90, unit: "diária" },
  favorite: { isSaved: false, onToggle: vi.fn() },
};

/** O coração e o "Entrar" moram atrás de nomes acessíveis estáveis. */
const coracao = () =>
  screen.queryByRole("button", { name: /salvar nos favoritos|remover dos salvos/i });
const entrar = () => screen.queryByRole("link", { name: /^entrar$/i });
const favoritos = () => screen.queryByText(/^favoritos$/i);

describe("contasDoConsumidorLigadas", () => {
  afterEach(() => {
    vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "on");
  });

  it("só o valor exato `on` liga", () => {
    vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "on");
    expect(contasDoConsumidorLigadas()).toBe(true);
  });

  /** Var ausente no build tem que cair no lado seguro, que é escondido. */
  it("qualquer outro valor, ou a ausência, mantém desligado", () => {
    for (const valor of ["", "true", "1", "ON", "yes", "off"]) {
      vi.stubEnv("VITE_CONSUMER_ACCOUNTS", valor);
      expect(contasDoConsumidorLigadas()).toBe(false);
    }
  });
});

describe("chave desligada — nenhum controle de conta renderiza", () => {
  beforeEach(() => {
    desligarContas();
    // A topbar monta o menu "Destinos", que consulta o Supabase.
    server.use(
      http.get("*/rest/v1/destination", () => HttpResponse.json([])),
      http.get("*/rest/v1/destination_point", () => HttpResponse.json([])),
    );
  });

  afterEach(() => {
    vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "on");
  });

  /**
   * O `ParkingCard` é o gargalo do coração: busca, home e página de destino
   * passam por ele. Barrado aqui, some nas três de uma vez.
   */
  it("o coração some do card mesmo com a prop favorite preenchida", () => {
    renderWithProviders(<ParkingCard {...cardBase} />);
    expect(coracao()).toBeNull();
  });

  it("o card continua inteiro sem o coração", () => {
    renderWithProviders(<ParkingCard {...cardBase} />);
    expect(screen.getByText("Mercy · Unidade")).toBeInTheDocument();
    expect(screen.getByText("Vaga Coberta")).toBeInTheDocument();
  });

  it("o Entrar some da topbar para quem não entrou", () => {
    renderWithProviders(<ConsumerTopbar />);
    expect(entrar()).toBeNull();
  });

  it("os atalhos de conta somem do dropdown do cliente logado", async () => {
    renderWithProviders(<ConsumerTopbar />, {
      auth: mockAuth({ session: mockSession("customer"), effectiveRole: "customer" }),
    });
    await userEvent.click(screen.getByRole("button", { name: /menu da conta/i }));

    expect(screen.queryByText(/^conta$/i)).toBeNull();
    expect(screen.queryByText(/minhas reservas/i)).toBeNull();
    expect(favoritos()).toBeNull();
    expect(screen.queryByText(/indique e ganhe/i)).toBeNull();
    // Sair continua: quem entrou precisa conseguir sair.
    expect(screen.getByText(/^sair$/i)).toBeInTheDocument();
  });

  /**
   * A equipe entra no Hub pela mesma topbar. Esconder o atalho do Manager junto
   * com o favoritar deixaria o admin sem porta depois do login.
   */
  it("o atalho do Manager sobrevive, porque é navegação da equipe", async () => {
    renderWithProviders(<ConsumerTopbar />, {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
    });
    await userEvent.click(screen.getByRole("button", { name: /menu da conta/i }));
    expect(screen.getByText(/ir pro manager/i)).toBeInTheDocument();
  });

  it("o Entrar e os atalhos de conta somem do menu mobile", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: /abrir menu/i }));

    expect(entrar()).toBeNull();
    expect(favoritos()).toBeNull();
    // Os links do site continuam: é a única navegação do celular.
    expect(screen.getByText(/como funciona/i)).toBeInTheDocument();
  });

  it("o Entrar some do checkout", () => {
    renderWithProviders(<CheckoutShell />);
    expect(entrar()).toBeNull();
  });

  it("Favoritos some da sidebar da conta", () => {
    renderWithProviders(<AccountSidebar />, {
      auth: mockAuth({ session: mockSession("customer"), effectiveRole: "customer" }),
    });
    expect(favoritos()).toBeNull();
    expect(screen.getByText(/minhas reservas/i)).toBeInTheDocument();
  });
});

describe("chave ligada — o comportamento atual volta sem tocar em componente", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CONSUMER_ACCOUNTS", "on");
    server.use(
      http.get("*/rest/v1/destination", () => HttpResponse.json([])),
      http.get("*/rest/v1/destination_point", () => HttpResponse.json([])),
    );
  });

  it("o coração volta ao card", () => {
    renderWithProviders(<ParkingCard {...cardBase} />);
    expect(coracao()).toBeInTheDocument();
  });

  it("o Entrar volta à topbar", () => {
    renderWithProviders(<ConsumerTopbar />);
    expect(entrar()).toBeInTheDocument();
  });

  it("Favoritos volta à sidebar da conta", () => {
    renderWithProviders(<AccountSidebar />, {
      auth: mockAuth({ session: mockSession("customer"), effectiveRole: "customer" }),
    });
    expect(favoritos()).toBeInTheDocument();
  });
});
